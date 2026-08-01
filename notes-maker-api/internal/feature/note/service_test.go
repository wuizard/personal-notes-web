package note

import (
	"bytes"
	"context"
	"encoding/json"
	"sort"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/crypto"
)

// fakeRepository is an in-memory stand-in for MongoRepository — the project's
// own testing philosophy is to fake the repository boundary rather than mock
// against a real network.
type fakeRepository struct {
	notes []*Note
}

func (f *fakeRepository) FindByClientID(_ context.Context, userID bson.ObjectID, clientID string) (*Note, error) {
	for _, n := range f.notes {
		if n.UserID == userID && n.ClientID == clientID {
			return clone(n), nil
		}
	}
	return nil, ErrNotFound
}

func (f *fakeRepository) ListSince(_ context.Context, userID bson.ObjectID, after Cursor, limit int) ([]Note, error) {
	var matched []*Note
	for _, n := range f.notes {
		if n.UserID != userID {
			continue
		}
		if after.IsZero() ||
			n.UpdatedAt.After(after.UpdatedAt) ||
			(n.UpdatedAt.Equal(after.UpdatedAt) && bytes.Compare(n.ID[:], after.ID[:]) > 0) {
			matched = append(matched, n)
		}
	}
	sort.Slice(matched, func(i, j int) bool {
		if !matched[i].UpdatedAt.Equal(matched[j].UpdatedAt) {
			return matched[i].UpdatedAt.Before(matched[j].UpdatedAt)
		}
		return bytes.Compare(matched[i].ID[:], matched[j].ID[:]) < 0
	})

	out := make([]Note, 0, limit)
	for i, n := range matched {
		if i >= limit {
			break
		}
		out = append(out, *clone(n))
	}
	return out, nil
}

func (f *fakeRepository) CountActive(_ context.Context, userID bson.ObjectID) (int, error) {
	count := 0
	for _, n := range f.notes {
		if n.UserID == userID && n.DeletedAt == nil && !n.Archived {
			count++
		}
	}
	return count, nil
}

func (f *fakeRepository) Insert(_ context.Context, n *Note) error {
	for _, existing := range f.notes {
		if existing.UserID == n.UserID && existing.ClientID == n.ClientID {
			return ErrDuplicate
		}
	}
	n.ID = bson.NewObjectID()
	f.notes = append(f.notes, clone(n))
	return nil
}

func (f *fakeRepository) Replace(_ context.Context, n *Note) error {
	for i, existing := range f.notes {
		if existing.ID == n.ID {
			f.notes[i] = clone(n)
			return nil
		}
	}
	return ErrNotFound
}

func clone(n *Note) *Note {
	copied := *n
	copied.Payload = append([]byte(nil), n.Payload...)
	copied.Labels = append([]string(nil), n.Labels...)
	copied.RevLog = append([]RevEntry(nil), n.RevLog...)
	if n.DeletedAt != nil {
		at := *n.DeletedAt
		copied.DeletedAt = &at
	}
	return &copied
}

func newTestService(t *testing.T) (*Service, *fakeRepository, bson.ObjectID) {
	t.Helper()

	key := make([]byte, crypto.KeySize)
	for i := range key {
		key[i] = byte(i)
	}
	sealer, err := crypto.NewSealer(map[int][]byte{1: key})
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}

	repo := &fakeRepository{}
	svc := NewService(repo, sealer)

	// A deterministic, strictly increasing clock keeps the (updated_at, _id)
	// ordering — and therefore cursor paging — reproducible.
	tick := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	svc.now = func() time.Time {
		tick = tick.Add(time.Millisecond)
		return tick
	}

	return svc, repo, bson.NewObjectID()
}

func contentJSON(t *testing.T, c Content) string {
	t.Helper()
	raw, err := json.Marshal(c)
	if err != nil {
		t.Fatalf("marshal content: %v", err)
	}
	return string(raw)
}

func pushOne(t *testing.T, svc *Service, userID bson.ObjectID, m Mutation) Result {
	t.Helper()
	results, err := svc.Push(context.Background(), userID, []Mutation{m})
	if err != nil {
		t.Fatalf("Push: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	return results[0]
}

func createNote(t *testing.T, svc *Service, userID bson.ObjectID, clientID, title string) Result {
	t.Helper()
	return pushOne(t, svc, userID, Mutation{
		Seq:           1,
		ClientID:      clientID,
		BaseRev:       0,
		ChangedFields: allFields,
		Content:       contentJSON(t, Content{Title: title, BodyText: title}),
		Color:         "mint",
	})
}

func TestCreateStoresNoteAtRevOne(t *testing.T) {
	svc, repo, userID := newTestService(t)

	result := createNote(t, svc, userID, "note-1", "Groceries")

	if result.Status != StatusApplied {
		t.Fatalf("expected APPLIED, got %s (%s)", result.Status, result.Reason)
	}
	if result.Note.Rev != 1 {
		t.Fatalf("expected rev 1, got %d", result.Note.Rev)
	}
	if result.Note.Content.Title != "Groceries" {
		t.Fatalf("unexpected title %q", result.Note.Content.Title)
	}
	if len(repo.notes) != 1 {
		t.Fatalf("expected 1 stored note, got %d", len(repo.notes))
	}
}

// The whole point of sealing: a database dump must not contain note text.
func TestStoredPayloadIsSealed(t *testing.T) {
	svc, repo, userID := newTestService(t)

	createNote(t, svc, userID, "note-1", "Groceries")

	stored := repo.notes[0]
	if len(stored.Payload) == 0 {
		t.Fatal("note was stored with no payload")
	}
	if bytes.Contains(stored.Payload, []byte("Groceries")) {
		t.Fatal("stored payload contains the plaintext title")
	}
	if stored.PayloadKeyVersion != 1 {
		t.Fatalf("expected key version 1, got %d", stored.PayloadKeyVersion)
	}
}

// A ciphertext must not be readable as another note — the aad binds it to
// (user, client_id).
func TestPayloadIsBoundToItsNote(t *testing.T) {
	svc, repo, userID := newTestService(t)
	createNote(t, svc, userID, "note-1", "Groceries")

	lifted := clone(repo.notes[0])
	lifted.ClientID = "note-2"

	if _, err := svc.openContent(userID, lifted); err == nil {
		t.Fatal("expected a payload moved to another client_id to fail to open")
	}
}

// docs/04 §4.4: a retried create is idempotent, not a duplicate.
func TestRetriedCreateIsIdempotent(t *testing.T) {
	svc, repo, userID := newTestService(t)

	first := createNote(t, svc, userID, "note-1", "Groceries")
	second := createNote(t, svc, userID, "note-1", "Groceries")

	if second.Status != StatusApplied {
		t.Fatalf("expected the retry to apply, got %s (%s)", second.Status, second.Reason)
	}
	if len(repo.notes) != 1 {
		t.Fatalf("expected the retry to reuse one document, got %d", len(repo.notes))
	}
	if second.Note.Rev <= first.Note.Rev {
		t.Fatalf("expected the retry to advance rev past %d, got %d", first.Note.Rev, second.Note.Rev)
	}
}

// docs/04 §4.5 rule 1 — the rule that silently resolves most real conflicts.
func TestDisjointFieldEditsMergeInsteadOfConflicting(t *testing.T) {
	svc, _, userID := newTestService(t)
	createNote(t, svc, userID, "note-1", "Groceries")

	// Device A recolours it.
	deviceA := pushOne(t, svc, userID, Mutation{
		Seq:           2,
		ClientID:      "note-1",
		BaseRev:       1,
		ChangedFields: []string{FieldColor},
		Content:       contentJSON(t, Content{Title: "Groceries", BodyText: "Groceries"}),
		Color:         "sky",
	})
	if deviceA.Status != StatusApplied {
		t.Fatalf("device A: expected APPLIED, got %s", deviceA.Status)
	}

	// Device B, still on rev 1, retitles it.
	deviceB := pushOne(t, svc, userID, Mutation{
		Seq:           3,
		ClientID:      "note-1",
		BaseRev:       1,
		ChangedFields: []string{FieldTitle, FieldBodyText},
		Content:       contentJSON(t, Content{Title: "Shopping", BodyText: "Shopping"}),
		Color:         "mint", // stale, and not in ChangedFields — must be ignored
	})

	if deviceB.Status != StatusApplied {
		t.Fatalf("device B: expected a merge, got %s (%s)", deviceB.Status, deviceB.Reason)
	}
	if deviceB.Note.Content.Title != "Shopping" {
		t.Fatalf("expected device B's title to survive, got %q", deviceB.Note.Content.Title)
	}
	if deviceB.Note.Color != "sky" {
		t.Fatalf("expected device A's colour to survive, got %q", deviceB.Note.Color)
	}
}

// docs/04 §4.5 rule 3 — the server wins and the client keeps a copy. Nothing
// is silently discarded server-side.
func TestOverlappingContentEditsConflict(t *testing.T) {
	svc, _, userID := newTestService(t)
	createNote(t, svc, userID, "note-1", "Groceries")

	pushOne(t, svc, userID, Mutation{
		Seq:           2,
		ClientID:      "note-1",
		BaseRev:       1,
		ChangedFields: []string{FieldTitle},
		Content:       contentJSON(t, Content{Title: "From device A"}),
	})

	deviceB := pushOne(t, svc, userID, Mutation{
		Seq:           3,
		ClientID:      "note-1",
		BaseRev:       1,
		ChangedFields: []string{FieldTitle},
		Content:       contentJSON(t, Content{Title: "From device B"}),
	})

	if deviceB.Status != StatusConflict {
		t.Fatalf("expected CONFLICT, got %s", deviceB.Status)
	}
	if deviceB.Note.Content.Title != "From device A" {
		t.Fatalf("conflict must return the server's version, got %q", deviceB.Note.Content.Title)
	}
}

// docs/04 §4.5: two people ticking off different groceries must never fork
// the note.
func TestChecklistEditsUnionInsteadOfConflicting(t *testing.T) {
	svc, _, userID := newTestService(t)

	base := Content{Title: "Groceries", Checklist: []ChecklistItem{
		{ID: "a", Text: "Milk", Order: 0},
		{ID: "b", Text: "Oats", Order: 1},
	}}
	pushOne(t, svc, userID, Mutation{
		Seq: 1, ClientID: "list-1", BaseRev: 0,
		ChangedFields: allFields,
		Content:       contentJSON(t, base),
		Kind:          "checklist",
	})

	// Device A ticks Milk.
	pushOne(t, svc, userID, Mutation{
		Seq: 2, ClientID: "list-1", BaseRev: 1,
		ChangedFields: []string{FieldChecklist},
		Content: contentJSON(t, Content{Title: "Groceries", Checklist: []ChecklistItem{
			{ID: "a", Text: "Milk", Checked: true, Order: 0},
			{ID: "b", Text: "Oats", Order: 1},
		}}),
	})

	// Device B, still on rev 1, ticks Oats and adds Flour.
	deviceB := pushOne(t, svc, userID, Mutation{
		Seq: 3, ClientID: "list-1", BaseRev: 1,
		ChangedFields: []string{FieldChecklist},
		Content: contentJSON(t, Content{Title: "Groceries", Checklist: []ChecklistItem{
			{ID: "b", Text: "Oats", Checked: true, Order: 1},
			{ID: "c", Text: "Flour", Order: 2},
		}}),
	})

	if deviceB.Status != StatusApplied {
		t.Fatalf("expected a union merge, got %s (%s)", deviceB.Status, deviceB.Reason)
	}

	got := map[string]bool{}
	for _, item := range deviceB.Note.Content.Checklist {
		got[item.ID] = item.Checked
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 items after the union, got %d: %+v", len(got), deviceB.Note.Content.Checklist)
	}
	if !got["a"] {
		t.Fatal("device A's tick on Milk was lost")
	}
	if !got["b"] {
		t.Fatal("device B's tick on Oats was lost")
	}
	if _, ok := got["c"]; !ok {
		t.Fatal("device B's new item was lost")
	}
}

// Beyond revLogDepth the server cannot prove the edits are disjoint. It must
// conflict rather than guess.
func TestStalePushBeyondRevLogDepthConflicts(t *testing.T) {
	svc, _, userID := newTestService(t)
	createNote(t, svc, userID, "note-1", "Groceries")

	for i := 0; i < revLogDepth+2; i++ {
		result := pushOne(t, svc, userID, Mutation{
			Seq: i + 2, ClientID: "note-1", BaseRev: i + 1,
			ChangedFields: []string{FieldColor},
			Content:       contentJSON(t, Content{Title: "Groceries"}),
			Color:         "sky",
		})
		if result.Status != StatusApplied {
			t.Fatalf("setup push %d: expected APPLIED, got %s", i, result.Status)
		}
	}

	stale := pushOne(t, svc, userID, Mutation{
		Seq: 99, ClientID: "note-1", BaseRev: 1,
		ChangedFields: []string{FieldTitle},
		Content:       contentJSON(t, Content{Title: "Very late"}),
	})
	if stale.Status != StatusConflict {
		t.Fatalf("expected CONFLICT once history aged out, got %s", stale.Status)
	}
}

func TestCapIsEnforcedServerSide(t *testing.T) {
	svc, _, userID := newTestService(t)

	for i := 0; i < PremiumItemCap; i++ {
		result := createNote(t, svc, userID, bson.NewObjectID().Hex(), "note")
		if result.Status != StatusApplied {
			t.Fatalf("note %d: expected APPLIED, got %s (%s)", i, result.Status, result.Reason)
		}
	}

	overflow := createNote(t, svc, userID, "one-too-many", "nope")
	if overflow.Status != StatusRejected {
		t.Fatalf("expected REJECTED past the cap, got %s", overflow.Status)
	}
	if overflow.Reason == "" {
		t.Fatal("a rejection must say why — the client surfaces it")
	}
}

// Archiving is decluttering, not deletion: it must stay a legitimate way to
// make room (docs/00 §0.6), matching the client's countActiveNotes.
func TestArchivedNotesDoNotCountTowardCap(t *testing.T) {
	svc, repo, userID := newTestService(t)

	for i := 0; i < PremiumItemCap; i++ {
		createNote(t, svc, userID, bson.NewObjectID().Hex(), "note")
	}
	repo.notes[0].Archived = true

	result := createNote(t, svc, userID, "room-made", "fits now")
	if result.Status != StatusApplied {
		t.Fatalf("expected archiving to make room, got %s (%s)", result.Status, result.Reason)
	}
}

func TestDeleteKeepsPayloadAndPurgeDropsIt(t *testing.T) {
	svc, repo, userID := newTestService(t)
	createNote(t, svc, userID, "note-1", "Groceries")
	createNote(t, svc, userID, "note-2", "Recipes")

	trashed := pushOne(t, svc, userID, Mutation{
		Seq: 2, ClientID: "note-1", BaseRev: 1, Deleted: true,
	})
	if trashed.Status != StatusApplied || trashed.Note.DeletedAt == nil {
		t.Fatalf("expected a tombstone, got %s", trashed.Status)
	}
	if trashed.Note.Content.Title != "Groceries" {
		t.Fatal("trashing must keep the content so another device can restore it")
	}

	purged := pushOne(t, svc, userID, Mutation{
		Seq: 3, ClientID: "note-2", BaseRev: 1, Purged: true,
	})
	if purged.Status != StatusApplied || purged.Note.DeletedAt == nil {
		t.Fatalf("expected a tombstone, got %s", purged.Status)
	}
	if purged.Note.Content.Title != "" {
		t.Fatal("delete-forever must drop the content")
	}

	for _, n := range repo.notes {
		if n.ClientID == "note-2" && len(n.Payload) != 0 {
			t.Fatal("purged note still holds a payload")
		}
	}
}

// docs/04 §4.4: the batch does not stop at the first conflict — later
// mutations often apply cleanly.
func TestBatchContinuesPastAConflict(t *testing.T) {
	svc, _, userID := newTestService(t)
	createNote(t, svc, userID, "note-1", "Groceries")
	pushOne(t, svc, userID, Mutation{
		Seq: 2, ClientID: "note-1", BaseRev: 1,
		ChangedFields: []string{FieldTitle},
		Content:       contentJSON(t, Content{Title: "Server wins"}),
	})

	results, err := svc.Push(context.Background(), userID, []Mutation{
		{
			Seq: 10, ClientID: "note-1", BaseRev: 1,
			ChangedFields: []string{FieldTitle},
			Content:       contentJSON(t, Content{Title: "Stale"}),
		},
		{
			Seq: 11, ClientID: "note-2", BaseRev: 0,
			ChangedFields: allFields,
			Content:       contentJSON(t, Content{Title: "Fresh"}),
		},
	})
	if err != nil {
		t.Fatalf("Push: %v", err)
	}

	if results[0].Status != StatusConflict || results[0].Seq != 10 {
		t.Fatalf("first result: expected seq 10 CONFLICT, got seq %d %s", results[0].Seq, results[0].Status)
	}
	if results[1].Status != StatusApplied || results[1].Seq != 11 {
		t.Fatalf("second result: expected seq 11 APPLIED, got seq %d %s", results[1].Seq, results[1].Status)
	}
}

func TestPushRejectsOversizedBatch(t *testing.T) {
	svc, _, userID := newTestService(t)

	mutations := make([]Mutation, MaxBatch+1)
	if _, err := svc.Push(context.Background(), userID, mutations); err == nil {
		t.Fatalf("expected a batch over %d to be rejected", MaxBatch)
	}
}

func TestInvalidContentIsRejectedNotStored(t *testing.T) {
	svc, repo, userID := newTestService(t)

	result := pushOne(t, svc, userID, Mutation{
		Seq: 1, ClientID: "note-1", BaseRev: 0,
		ChangedFields: allFields,
		Content:       "{not json",
	})

	if result.Status != StatusRejected {
		t.Fatalf("expected REJECTED, got %s", result.Status)
	}
	if len(repo.notes) != 0 {
		t.Fatal("a rejected mutation must not be stored")
	}
}

func TestPullPagesInCursorOrderAndReportsHasMore(t *testing.T) {
	svc, _, userID := newTestService(t)
	for i := 0; i < 5; i++ {
		createNote(t, svc, userID, bson.NewObjectID().Hex(), "note")
	}

	first, err := svc.List(context.Background(), userID, "", 2)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(first.Notes) != 2 || !first.HasMore {
		t.Fatalf("expected 2 notes and has_more, got %d has_more=%v", len(first.Notes), first.HasMore)
	}

	seen := map[string]bool{}
	page := first
	for {
		for _, n := range page.Notes {
			if seen[n.ClientID] {
				t.Fatalf("note %s came back twice — the cursor is skipping or repeating", n.ClientID)
			}
			seen[n.ClientID] = true
		}
		if !page.HasMore {
			break
		}
		page, err = svc.List(context.Background(), userID, page.Cursor, 2)
		if err != nil {
			t.Fatalf("List: %v", err)
		}
	}

	if len(seen) != 5 {
		t.Fatalf("expected to page through 5 notes, saw %d", len(seen))
	}
}

// Tombstones travel as ordinary documents so other devices learn of the
// deletion (docs/04 §4.3).
func TestPullIncludesTombstones(t *testing.T) {
	svc, _, userID := newTestService(t)
	createNote(t, svc, userID, "note-1", "Groceries")
	pushOne(t, svc, userID, Mutation{Seq: 2, ClientID: "note-1", BaseRev: 1, Deleted: true})

	page, err := svc.List(context.Background(), userID, "", 100)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(page.Notes) != 1 || page.Notes[0].DeletedAt == nil {
		t.Fatalf("expected one tombstone, got %+v", page.Notes)
	}
}

func TestPullIsScopedToOneAccount(t *testing.T) {
	svc, _, userID := newTestService(t)
	other := bson.NewObjectID()

	createNote(t, svc, userID, "mine", "Mine")
	createNote(t, svc, other, "theirs", "Theirs")

	page, err := svc.List(context.Background(), userID, "", 100)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(page.Notes) != 1 || page.Notes[0].ClientID != "mine" {
		t.Fatalf("account scoping leaked: %+v", page.Notes)
	}
}

func TestCursorRoundTrips(t *testing.T) {
	original := Cursor{UpdatedAt: time.UnixMilli(1753000000000).UTC(), ID: bson.NewObjectID()}

	decoded, err := DecodeCursor(original.Encode())
	if err != nil {
		t.Fatalf("DecodeCursor: %v", err)
	}
	if !decoded.UpdatedAt.Equal(original.UpdatedAt) || decoded.ID != original.ID {
		t.Fatalf("cursor did not round trip: %+v vs %+v", decoded, original)
	}

	empty, err := DecodeCursor("")
	if err != nil || !empty.IsZero() {
		t.Fatalf("an empty cursor must decode to the zero value, got %+v (%v)", empty, err)
	}
	if _, err := DecodeCursor("not-a-cursor"); err == nil {
		t.Fatal("expected a malformed cursor to be rejected")
	}
}
