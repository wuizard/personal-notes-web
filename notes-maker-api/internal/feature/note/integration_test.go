package note_test

// Integration coverage for the parts a fake Repository cannot prove: the real
// Mongo queries, the unique index that makes a retried create idempotent, and
// the (updated_at, _id) cursor paging over a real Find.
//
// Skipped unless MONGO_TEST_URI is set, so `go test ./...` stays green with no
// database — the project's default remains fake-the-repository unit tests.
//
//	docker compose up -d mongo
//	MONGO_TEST_URI='mongodb://localhost:27017/?replicaSet=rs0' go test ./internal/feature/note/ -run Integration -v

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	driver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/note"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/crypto"
	platformmongo "github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/mongo"
	"github.com/wuizard/personal-notes-web/notes-maker-api/migrations"
)

func integrationDB(t *testing.T) *driver.Database {
	t.Helper()

	uri := os.Getenv("MONGO_TEST_URI")
	if uri == "" {
		t.Skip("set MONGO_TEST_URI to run the Mongo integration tests")
	}

	ctx := context.Background()
	client, err := driver.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })

	// A database per run keeps parallel runs and reruns from colliding.
	db := client.Database("notes_maker_itest_" + bson.NewObjectID().Hex())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })

	if err := platformmongo.RunMigrations(ctx, db, migrations.All); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	return db
}

func integrationService(t *testing.T, db *driver.Database) (*note.Service, bson.ObjectID) {
	t.Helper()

	key := make([]byte, crypto.KeySize)
	for i := range key {
		key[i] = byte(i)
	}
	sealer, err := crypto.NewSealer(map[int][]byte{1: key})
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}
	return note.NewService(note.NewMongoRepository(db), sealer), bson.NewObjectID()
}

func mutate(clientID, title string, baseRev int) note.Mutation {
	content, _ := json.Marshal(note.Content{Title: title, BodyText: title})
	return note.Mutation{
		Seq:      1,
		ClientID: clientID,
		BaseRev:  baseRev,
		ChangedFields: []string{
			note.FieldTitle, note.FieldBody, note.FieldBodyText, note.FieldChecklist,
			note.FieldKind, note.FieldColor, note.FieldPinned, note.FieldArchived,
			note.FieldLabels, note.FieldReminder, note.FieldCompletedAt,
		},
		Content:   string(content),
		Color:     "mint",
		CreatedAt: time.Now().UTC(),
	}
}

func TestIntegrationMigrationsBuildTheSyncIndexes(t *testing.T) {
	db := integrationDB(t)
	ctx := context.Background()

	cursor, err := db.Collection("notes").Indexes().List(ctx)
	if err != nil {
		t.Fatalf("list indexes: %v", err)
	}
	// bson.D rather than bson.M: index key order is significant, and a
	// map would silently accept the fields in the wrong order.
	var indexes []struct {
		Name   string `bson:"name"`
		Key    bson.D `bson:"key"`
		Unique bool   `bson:"unique"`
	}
	if err := cursor.All(ctx, &indexes); err != nil {
		t.Fatalf("decode indexes: %v", err)
	}

	fieldOrder := func(key bson.D) []string {
		out := make([]string, 0, len(key))
		for _, e := range key {
			out = append(out, e.Key)
		}
		return out
	}
	same := func(got, want []string) bool {
		if len(got) != len(want) {
			return false
		}
		for i := range got {
			if got[i] != want[i] {
				return false
			}
		}
		return true
	}

	var foundUnique, foundCursor bool
	for _, index := range indexes {
		fields := fieldOrder(index.Key)
		switch {
		case same(fields, []string{"user_id", "client_id"}):
			foundUnique = index.Unique
		case same(fields, []string{"user_id", "updated_at", "_id"}):
			foundCursor = true
		}
	}
	if !foundUnique {
		t.Errorf("missing the unique (user_id, client_id) index — retried creates would duplicate; got %+v", indexes)
	}
	if !foundCursor {
		t.Errorf("missing the (user_id, updated_at, _id) cursor index; got %+v", indexes)
	}
}

// The unique index, not application logic, is what stops a retried create
// leaving two notes behind.
func TestIntegrationRetriedCreateHitsTheUniqueIndex(t *testing.T) {
	db := integrationDB(t)
	svc, userID := integrationService(t, db)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		results, err := svc.Push(ctx, userID, []note.Mutation{mutate("note-1", "Groceries", 0)})
		if err != nil {
			t.Fatalf("push %d: %v", i, err)
		}
		if results[0].Status != note.StatusApplied {
			t.Fatalf("push %d: expected APPLIED, got %s (%s)", i, results[0].Status, results[0].Reason)
		}
	}

	count, err := db.Collection("notes").CountDocuments(ctx, bson.D{{Key: "user_id", Value: userID}})
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 document after 3 identical creates, got %d", count)
	}
}

// What a stolen database dump would actually contain.
func TestIntegrationStoredDocumentHasNoPlaintext(t *testing.T) {
	db := integrationDB(t)
	svc, userID := integrationService(t, db)
	ctx := context.Background()

	if _, err := svc.Push(ctx, userID, []note.Mutation{mutate("note-1", "Ana's passport number", 0)}); err != nil {
		t.Fatalf("push: %v", err)
	}

	var raw bson.M
	if err := db.Collection("notes").FindOne(ctx, bson.D{{Key: "client_id", Value: "note-1"}}).Decode(&raw); err != nil {
		t.Fatalf("find: %v", err)
	}

	encoded, err := bson.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if bytes.Contains(encoded, []byte("passport")) {
		t.Fatal("the stored document contains note plaintext")
	}
	for _, leaked := range []string{"title", "body_text", "checklist"} {
		if _, present := raw[leaked]; present {
			t.Errorf("content field %q leaked into the clear alongside the payload", leaked)
		}
	}
	if _, ok := raw["payload"]; !ok {
		t.Fatal("no payload stored")
	}
}

// Paging over a real Find, with the compound-key comparison Mongo actually
// evaluates rather than the fake's in-memory sort.
func TestIntegrationCursorPagesWithoutSkippingOrRepeating(t *testing.T) {
	db := integrationDB(t)
	svc, userID := integrationService(t, db)
	ctx := context.Background()

	const total = 25
	for i := 0; i < total; i++ {
		if _, err := svc.Push(ctx, userID, []note.Mutation{mutate(bson.NewObjectID().Hex(), "note", 0)}); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	seen := map[string]bool{}
	cursor := ""
	for pages := 0; ; pages++ {
		if pages > total {
			t.Fatal("cursor never reported hasMore=false — it is not advancing")
		}
		page, err := svc.List(ctx, userID, cursor, 4)
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		for _, n := range page.Notes {
			if seen[n.ClientID] {
				t.Fatalf("note %s returned twice", n.ClientID)
			}
			seen[n.ClientID] = true
		}
		if !page.HasMore {
			break
		}
		cursor = page.Cursor
	}

	if len(seen) != total {
		t.Fatalf("paged through %d of %d notes", len(seen), total)
	}
}

// Merge and conflict resolution, exercised through real reads and writes so
// the rev_log survives a BSON round trip.
func TestIntegrationMergeAndConflictSurviveAMongoRoundTrip(t *testing.T) {
	db := integrationDB(t)
	svc, userID := integrationService(t, db)
	ctx := context.Background()

	if _, err := svc.Push(ctx, userID, []note.Mutation{mutate("note-1", "Groceries", 0)}); err != nil {
		t.Fatalf("create: %v", err)
	}

	recolour := mutate("note-1", "Groceries", 1)
	recolour.ChangedFields = []string{note.FieldColor}
	recolour.Color = "sky"
	if _, err := svc.Push(ctx, userID, []note.Mutation{recolour}); err != nil {
		t.Fatalf("recolour: %v", err)
	}

	retitle := mutate("note-1", "Shopping", 1)
	retitle.ChangedFields = []string{note.FieldTitle}
	merged, err := svc.Push(ctx, userID, []note.Mutation{retitle})
	if err != nil {
		t.Fatalf("retitle: %v", err)
	}
	if merged[0].Status != note.StatusApplied {
		t.Fatalf("expected a disjoint merge, got %s", merged[0].Status)
	}
	if merged[0].Note.Content.Title != "Shopping" || merged[0].Note.Color != "sky" {
		t.Fatalf("merge lost an edit: title=%q colour=%q",
			merged[0].Note.Content.Title, merged[0].Note.Color)
	}

	stale := mutate("note-1", "Third device", 1)
	stale.ChangedFields = []string{note.FieldTitle}
	conflicted, err := svc.Push(ctx, userID, []note.Mutation{stale})
	if err != nil {
		t.Fatalf("stale push: %v", err)
	}
	if conflicted[0].Status != note.StatusConflict {
		t.Fatalf("expected CONFLICT on an overlapping content edit, got %s", conflicted[0].Status)
	}
	if conflicted[0].Note.Content.Title != "Shopping" {
		t.Fatalf("conflict must return the server's version, got %q", conflicted[0].Note.Content.Title)
	}
}

// CountActive drives the cap, so its query has to match the client's
// countActiveNotes: live and non-archived.
func TestIntegrationCapCountIgnoresArchivedAndTrashed(t *testing.T) {
	db := integrationDB(t)
	svc, userID := integrationService(t, db)
	ctx := context.Background()

	repo := note.NewMongoRepository(db)

	for _, id := range []string{"live", "archived", "trashed"} {
		if _, err := svc.Push(ctx, userID, []note.Mutation{mutate(id, id, 0)}); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}

	archive := mutate("archived", "archived", 1)
	archive.ChangedFields = []string{note.FieldArchived}
	archive.Archived = true
	if _, err := svc.Push(ctx, userID, []note.Mutation{archive}); err != nil {
		t.Fatalf("archive: %v", err)
	}
	if _, err := svc.Push(ctx, userID, []note.Mutation{{
		Seq: 1, ClientID: "trashed", BaseRev: 1, Deleted: true,
	}}); err != nil {
		t.Fatalf("trash: %v", err)
	}

	count, err := repo.CountActive(ctx, userID)
	if err != nil {
		t.Fatalf("CountActive: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected only the live note to count toward the cap, got %d", count)
	}
}
