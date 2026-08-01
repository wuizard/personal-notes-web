// Package note owns the notes collection: the delta-sync pull, and the
// batched push with client_id idempotency and base_rev conflict resolution
// (docs/04). Only premium accounts reach it — free users never touch a
// server at all (docs/01 §1.0), which the resolver enforces before calling in.
package note

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/crypto"
)

// PremiumItemCap is the paid tier's combined note+checklist ceiling
// (docs/10 §10.7 as amended by §10.14). It mirrors the client's
// PREMIUM_ITEM_CAP; the server enforces it too because a client constant is
// a UI affordance, not a limit.
const PremiumItemCap = 100

// MaxBatch bounds one push. Batches are capped at 100 mutations (docs/04 §4.4).
const MaxBatch = 100

// Paging bounds for a pull.
const (
	DefaultPageLimit = 200
	MaxPageLimit     = 500
)

// revLogDepth is how many revisions of field-change history each note keeps.
// The log is what makes disjoint-field merge possible (docs/04 §4.5 rule 1):
// to merge, the server must know which fields *it* changed since the client's
// base_rev. Beyond this depth the history is gone and a stale push degrades
// to an honest conflict rather than a guess. Twenty revisions is far more
// than a device that syncs at all regularly will fall behind.
const revLogDepth = 20

// Logical field names. These are the client's own LocalNote field names, so
// `_dirty_fields` can be sent across unchanged.
const (
	FieldTitle       = "title"
	FieldBody        = "body"
	FieldBodyText    = "body_text"
	FieldChecklist   = "checklist"
	FieldKind        = "kind"
	FieldColor       = "color"
	FieldPinned      = "pinned"
	FieldArchived    = "archived"
	FieldLabels      = "labels"
	FieldReminder    = "reminder"
	FieldCompletedAt = "completed_at"
)

// contentFields are the ones that live inside the sealed payload. Everything
// else is stored in the clear because it drives indexes and queries and
// reveals nothing about what the note says.
var contentFields = map[string]bool{
	FieldTitle:     true,
	FieldBody:      true,
	FieldBodyText:  true,
	FieldChecklist: true,
}

var allFields = []string{
	FieldTitle, FieldBody, FieldBodyText, FieldChecklist,
	FieldKind, FieldColor, FieldPinned, FieldArchived,
	FieldLabels, FieldReminder, FieldCompletedAt,
}

// ChecklistItem mirrors the client's ChecklistItem. The server models it —
// rather than treating the whole checklist as opaque — for exactly one
// reason: item-level union merge (docs/04 §4.5). Two people ticking off
// different groceries must never produce a conflicted copy.
type ChecklistItem struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Checked bool   `json:"checked"`
	Order   int    `json:"order"`
	Note    string `json:"note,omitempty"`
}

// Content is the part of a note that is sealed at rest. Body stays raw so a
// round trip never reformats the client's ProseMirror JSON.
type Content struct {
	Title     string          `json:"title"`
	Body      json.RawMessage `json:"body,omitempty"`
	BodyText  string          `json:"body_text"`
	Checklist []ChecklistItem `json:"checklist,omitempty"`
}

// RevEntry records which fields a single server-side revision changed.
type RevEntry struct {
	Rev    int      `bson:"rev"`
	Fields []string `bson:"fields"`
}

// Note is the stored document (docs/02 §2.2), with content sealed.
type Note struct {
	ID       bson.ObjectID `bson:"_id,omitempty"`
	UserID   bson.ObjectID `bson:"user_id"`
	ClientID string        `bson:"client_id"`

	// Payload is nonce||ciphertext over the JSON of Content. Nil on a purged
	// tombstone, where the content is gone for good on purpose.
	Payload           []byte `bson:"payload,omitempty"`
	PayloadKeyVersion int    `bson:"payload_key_version,omitempty"`

	Kind     string   `bson:"kind,omitempty"`
	Color    string   `bson:"color,omitempty"`
	Pinned   bool     `bson:"pinned"`
	Archived bool     `bson:"archived"`
	Labels   []string `bson:"labels,omitempty"`
	// Reminder is the client's own serialized reminder JSON, stored opaquely.
	// Server-side scheduling (P2.6) will need to parse it; nothing here does.
	Reminder    string     `bson:"reminder,omitempty"`
	CompletedAt *time.Time `bson:"completed_at,omitempty"`

	Rev    int        `bson:"rev"`
	RevLog []RevEntry `bson:"rev_log,omitempty"`

	CreatedAt time.Time  `bson:"created_at"`
	UpdatedAt time.Time  `bson:"updated_at"`
	DeletedAt *time.Time `bson:"deleted_at"`
}

// View is a note with its payload opened — the shape resolvers hand back.
type View struct {
	ClientID    string
	Content     Content
	Kind        string
	Color       string
	Pinned      bool
	Archived    bool
	Labels      []string
	Reminder    string
	CompletedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   *time.Time
	// Purged distinguishes "delete forever" from a restorable trash
	// tombstone. Both are tombstones; only one still has content to restore.
	Purged bool
	Rev    int
}

// Mutation is one entry in a push batch. The client sends the whole note it
// holds plus ChangedFields — what it altered since BaseRev — which is what
// lets the server merge instead of clobbering.
type Mutation struct {
	Seq           int
	ClientID      string
	BaseRev       int
	ChangedFields []string

	// Deleted moves the note to trash: a tombstone that keeps its payload,
	// so restoring it on another device still recovers the content.
	Deleted bool
	// Purged is "delete forever": still a tombstone, so other devices learn
	// of the deletion, but the payload is dropped.
	Purged bool

	// Content is the serialized JSON of Content — the field a future E2E
	// client writes ciphertext into instead.
	Content     string
	Kind        string
	Color       string
	Pinned      bool
	Archived    bool
	Labels      []string
	Reminder    string
	CompletedAt *time.Time
	CreatedAt   time.Time
}

type Status string

const (
	StatusApplied  Status = "APPLIED"
	StatusConflict Status = "CONFLICT"
	StatusRejected Status = "REJECTED"
)

// Result reports one mutation's outcome. On CONFLICT, Note is the server's
// canonical version — the client keeps its own as a conflicted copy rather
// than discarding it (docs/04 §4.5 rule 3).
type Result struct {
	Seq    int
	Status Status
	Reason string
	Note   *View
}

// Page is one pull's worth of changes.
type Page struct {
	Notes      []View
	Cursor     string
	HasMore    bool
	ServerTime time.Time
}

type Service struct {
	repo   Repository
	sealer *crypto.Sealer
	now    func() time.Time
}

func NewService(repo Repository, sealer *crypto.Sealer) *Service {
	return &Service{repo: repo, sealer: sealer, now: func() time.Time { return time.Now().UTC() }}
}

// List returns changes strictly after cursor, tombstones included, ordered by
// the total (updated_at, _id) key. The client loops until HasMore is false
// and then stores Cursor (docs/04 §4.3).
func (s *Service) List(ctx context.Context, userID bson.ObjectID, cursor string, limit int) (Page, error) {
	after, err := DecodeCursor(cursor)
	if err != nil {
		return Page{}, err
	}
	if limit <= 0 {
		limit = DefaultPageLimit
	}
	if limit > MaxPageLimit {
		limit = MaxPageLimit
	}

	// One extra row answers "is there more" without a second count query.
	rows, err := s.repo.ListSince(ctx, userID, after, limit+1)
	if err != nil {
		return Page{}, err
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}

	page := Page{Cursor: cursor, HasMore: hasMore, ServerTime: s.now()}
	for i := range rows {
		view, err := s.view(userID, &rows[i])
		if err != nil {
			return Page{}, err
		}
		page.Notes = append(page.Notes, view)
	}
	if n := len(rows); n > 0 {
		page.Cursor = Cursor{UpdatedAt: rows[n-1].UpdatedAt, ID: rows[n-1].ID}.Encode()
	}
	return page, nil
}

// Push applies a batch in order. It deliberately does not stop at the first
// conflict — later mutations often apply cleanly (docs/04 §4.4).
func (s *Service) Push(ctx context.Context, userID bson.ObjectID, mutations []Mutation) ([]Result, error) {
	if len(mutations) > MaxBatch {
		return nil, fmt.Errorf("note: batch of %d exceeds the %d-mutation cap", len(mutations), MaxBatch)
	}

	results := make([]Result, 0, len(mutations))
	for _, m := range mutations {
		result, err := s.applyOne(ctx, userID, m)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

func (s *Service) applyOne(ctx context.Context, userID bson.ObjectID, m Mutation) (Result, error) {
	if m.ClientID == "" {
		return rejected(m.Seq, "client_id is required"), nil
	}

	existing, err := s.repo.FindByClientID(ctx, userID, m.ClientID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return Result{}, err
	}

	if errors.Is(err, ErrNotFound) {
		result, createErr := s.create(ctx, userID, m)
		if !errors.Is(createErr, ErrDuplicate) {
			return result, createErr
		}
		// Lost a race with a concurrent create of the same client_id. The
		// unique index did its job; re-read and take the update path, which
		// is what makes a retried create idempotent rather than a duplicate.
		existing, err = s.repo.FindByClientID(ctx, userID, m.ClientID)
		if err != nil {
			return Result{}, err
		}
	}

	return s.update(ctx, userID, existing, m)
}

func (s *Service) create(ctx context.Context, userID bson.ObjectID, m Mutation) (Result, error) {
	now := s.now().Truncate(time.Millisecond)

	n := &Note{
		UserID:    userID,
		ClientID:  m.ClientID,
		Rev:       1,
		RevLog:    []RevEntry{{Rev: 1, Fields: allFields}},
		CreatedAt: m.CreatedAt.UTC().Truncate(time.Millisecond),
		UpdatedAt: now,
	}
	if n.CreatedAt.IsZero() {
		n.CreatedAt = now
	}

	// A delete for a note the server has never seen still stores a tombstone.
	// Dropping it instead would let the note reappear the moment another
	// device pushed its copy.
	if m.Deleted || m.Purged {
		n.DeletedAt = &now
		if !m.Purged {
			if err := s.sealInto(userID, n, Content{}); err != nil {
				return Result{}, err
			}
		}
		if err := s.repo.Insert(ctx, n); err != nil {
			return Result{}, err
		}
		return s.applied(userID, m.Seq, n)
	}

	content, err := parseContent(m.Content)
	if err != nil {
		return rejected(m.Seq, err.Error()), nil
	}

	if countsTowardCap(m.Archived, false) {
		if err := s.checkCap(ctx, userID); err != nil {
			return rejected(m.Seq, err.Error()), nil
		}
	}

	applyMeta(n, m, setOf(allFields))
	if err := s.sealInto(userID, n, content); err != nil {
		return Result{}, err
	}
	if err := s.repo.Insert(ctx, n); err != nil {
		return Result{}, err
	}
	return s.applied(userID, m.Seq, n)
}

func (s *Service) update(ctx context.Context, userID bson.ObjectID, existing *Note, m Mutation) (Result, error) {
	// Deletion is an explicit user action and applies regardless of base_rev.
	// The other device's unsynced edit is not lost: its row is still _dirty
	// locally, so it resurrects on that device's next sync — the friendlier
	// default (docs/04 §4.3).
	if m.Deleted || m.Purged {
		return s.applyDelete(ctx, userID, existing, m)
	}

	incoming, err := parseContent(m.Content)
	if err != nil {
		return rejected(m.Seq, err.Error()), nil
	}

	clientChanged := setOf(m.ChangedFields)
	apply := clientChanged
	unionChecklist := false

	// base_rev 0 means "this device has never seen a server copy of this
	// note" — a create, or a retry of one whose response was lost. docs/04
	// §4.4 makes that an upsert rather than a conflict, which is what stops a
	// retried create duplicating. A device that *has* seen the server's
	// version always carries a real base_rev, because the engine pulls before
	// it pushes.
	if m.BaseRev != 0 && m.BaseRev != existing.Rev {
		serverChanged, complete := existing.changedSince(m.BaseRev)
		if !complete {
			// History has aged out; we cannot prove the edits are disjoint,
			// and guessing here means silently dropping someone's writing.
			return s.conflict(userID, m.Seq, existing)
		}

		overlap := intersect(clientChanged, serverChanged)
		contentOverlap := filter(overlap, contentFields)
		switch {
		case len(contentOverlap) == 0:
			// Rule 1 (disjoint fields) and rule 2 (metadata loses to
			// content) both reduce to the same action: replay only what
			// this device changed on top of the server's version.
		case len(contentOverlap) == 1 && contentOverlap[FieldChecklist]:
			unionChecklist = true
		default:
			// Both sides edited the same content. The server wins and the
			// client keeps a conflicted copy (docs/04 §4.5 rule 3).
			return s.conflict(userID, m.Seq, existing)
		}
	}

	// Restoring from trash, or unarchiving, puts an item back under the cap.
	restoring := existing.DeletedAt != nil || (existing.Archived && apply[FieldArchived] && !m.Archived)
	if restoring && countsTowardCap(m.Archived, false) {
		if err := s.checkCap(ctx, userID); err != nil {
			return rejected(m.Seq, err.Error()), nil
		}
	}

	if err := s.applyContent(userID, existing, incoming, apply, unionChecklist); err != nil {
		return Result{}, err
	}
	applyMeta(existing, m, apply)
	existing.DeletedAt = nil

	s.bump(existing, keys(apply))
	if err := s.repo.Replace(ctx, existing); err != nil {
		return Result{}, err
	}
	return s.applied(userID, m.Seq, existing)
}

func (s *Service) applyDelete(ctx context.Context, userID bson.ObjectID, existing *Note, m Mutation) (Result, error) {
	now := s.now().Truncate(time.Millisecond)
	existing.DeletedAt = &now
	if m.Purged {
		existing.Payload = nil
		existing.PayloadKeyVersion = 0
	}
	s.bump(existing, []string{})
	if err := s.repo.Replace(ctx, existing); err != nil {
		return Result{}, err
	}
	return s.applied(userID, m.Seq, existing)
}

// applyContent re-seals the payload when a content field changed, and leaves
// it untouched (no decrypt, no re-encrypt) when only metadata moved.
func (s *Service) applyContent(userID bson.ObjectID, existing *Note, incoming Content, apply map[string]bool, unionChecklist bool) error {
	if !touchesContent(apply) {
		return nil
	}

	current, err := s.openContent(userID, existing)
	if err != nil {
		return err
	}

	if apply[FieldTitle] {
		current.Title = incoming.Title
	}
	if apply[FieldBody] {
		current.Body = incoming.Body
	}
	if apply[FieldBodyText] {
		current.BodyText = incoming.BodyText
	}
	if apply[FieldChecklist] {
		if unionChecklist {
			current.Checklist = unionChecklists(current.Checklist, incoming.Checklist)
		} else {
			current.Checklist = incoming.Checklist
		}
	}
	return s.sealInto(userID, existing, current)
}

// unionChecklists merges two versions of a checklist by item id (docs/04
// §4.5). Items on both sides take the pushing device's version — it is the
// edit the user most recently made — and items on either side alone are
// kept. An item deleted on one device therefore comes back if the other
// still has it: a duplicate line is a mild annoyance, a vanished one is not.
//
// Order values can collide after a union; the client sorts by order and falls
// back to position, so this settles deterministically without renumbering.
func unionChecklists(server, client []ChecklistItem) []ChecklistItem {
	position := make(map[string]int, len(server)+len(client))
	out := make([]ChecklistItem, 0, len(server)+len(client))

	for _, item := range server {
		position[item.ID] = len(out)
		out = append(out, item)
	}
	for _, item := range client {
		if i, ok := position[item.ID]; ok {
			out[i] = item
			continue
		}
		position[item.ID] = len(out)
		out = append(out, item)
	}
	return out
}

func applyMeta(n *Note, m Mutation, apply map[string]bool) {
	if apply[FieldKind] {
		n.Kind = m.Kind
	}
	if apply[FieldColor] {
		n.Color = m.Color
	}
	if apply[FieldPinned] {
		n.Pinned = m.Pinned
	}
	if apply[FieldArchived] {
		n.Archived = m.Archived
	}
	if apply[FieldLabels] {
		n.Labels = m.Labels
	}
	if apply[FieldReminder] {
		n.Reminder = m.Reminder
	}
	if apply[FieldCompletedAt] {
		n.CompletedAt = m.CompletedAt
	}
}

// bump advances the revision and records what changed, so a later push from
// a device sitting on an older base_rev can still be merged.
//
// updated_at is server time, never the client's: docs/04 §4.3 is explicit
// that a cursor built from a device clock skips notes.
func (s *Service) bump(n *Note, changed []string) {
	n.Rev++
	n.UpdatedAt = s.now().Truncate(time.Millisecond)
	n.RevLog = append(n.RevLog, RevEntry{Rev: n.Rev, Fields: changed})
	if len(n.RevLog) > revLogDepth {
		n.RevLog = n.RevLog[len(n.RevLog)-revLogDepth:]
	}
}

// changedSince reports which fields the server changed after baseRev, and
// whether the rev log still reaches back that far. An incomplete answer must
// never be treated as "nothing changed".
func (n *Note) changedSince(baseRev int) (fields map[string]bool, complete bool) {
	fields = map[string]bool{}
	if baseRev >= n.Rev {
		return fields, true
	}

	oldest := n.Rev + 1
	for _, entry := range n.RevLog {
		if entry.Rev < oldest {
			oldest = entry.Rev
		}
		if entry.Rev > baseRev {
			for _, f := range entry.Fields {
				fields[f] = true
			}
		}
	}
	return fields, oldest <= baseRev+1
}

func (s *Service) checkCap(ctx context.Context, userID bson.ObjectID) error {
	count, err := s.repo.CountActive(ctx, userID)
	if err != nil {
		return err
	}
	if count >= PremiumItemCap {
		return fmt.Errorf("note cap of %d reached", PremiumItemCap)
	}
	return nil
}

// payloadAAD binds a sealed payload to the note and account it belongs to, so
// a ciphertext cannot be moved between notes or between users.
func payloadAAD(userID bson.ObjectID, clientID string) []byte {
	return []byte(userID.Hex() + ":" + clientID)
}

func (s *Service) sealInto(userID bson.ObjectID, n *Note, content Content) error {
	if len(content.Body) == 0 {
		content.Body = nil
	}
	plaintext, err := json.Marshal(content)
	if err != nil {
		return fmt.Errorf("note: marshal content: %w", err)
	}
	sealed, version, err := s.sealer.Seal(plaintext, payloadAAD(userID, n.ClientID))
	if err != nil {
		return err
	}
	n.Payload, n.PayloadKeyVersion = sealed, version
	return nil
}

func (s *Service) openContent(userID bson.ObjectID, n *Note) (Content, error) {
	if len(n.Payload) == 0 {
		return Content{}, nil
	}
	plaintext, err := s.sealer.Open(n.Payload, payloadAAD(userID, n.ClientID), n.PayloadKeyVersion)
	if err != nil {
		return Content{}, fmt.Errorf("note %s: %w", n.ClientID, err)
	}
	var content Content
	if err := json.Unmarshal(plaintext, &content); err != nil {
		return Content{}, fmt.Errorf("note %s: unmarshal content: %w", n.ClientID, err)
	}
	return content, nil
}

func (s *Service) view(userID bson.ObjectID, n *Note) (View, error) {
	content, err := s.openContent(userID, n)
	if err != nil {
		return View{}, err
	}
	return View{
		ClientID:    n.ClientID,
		Content:     content,
		Kind:        n.Kind,
		Color:       n.Color,
		Pinned:      n.Pinned,
		Archived:    n.Archived,
		Labels:      n.Labels,
		Reminder:    n.Reminder,
		CompletedAt: n.CompletedAt,
		CreatedAt:   n.CreatedAt,
		UpdatedAt:   n.UpdatedAt,
		DeletedAt:   n.DeletedAt,
		Purged:      n.DeletedAt != nil && len(n.Payload) == 0,
		Rev:         n.Rev,
	}, nil
}

func (s *Service) applied(userID bson.ObjectID, seq int, n *Note) (Result, error) {
	view, err := s.view(userID, n)
	if err != nil {
		return Result{}, err
	}
	return Result{Seq: seq, Status: StatusApplied, Note: &view}, nil
}

func (s *Service) conflict(userID bson.ObjectID, seq int, n *Note) (Result, error) {
	view, err := s.view(userID, n)
	if err != nil {
		return Result{}, err
	}
	return Result{Seq: seq, Status: StatusConflict, Note: &view}, nil
}

// rejected marks a mutation the client must drop rather than retry
// (docs/04 §4.4).
func rejected(seq int, reason string) Result {
	return Result{Seq: seq, Status: StatusRejected, Reason: reason}
}

func parseContent(raw string) (Content, error) {
	if raw == "" {
		return Content{}, errors.New("content is required")
	}
	var content Content
	if err := json.Unmarshal([]byte(raw), &content); err != nil {
		return Content{}, fmt.Errorf("content is not valid JSON: %w", err)
	}
	return content, nil
}

func countsTowardCap(archived, deleted bool) bool { return !archived && !deleted }

func touchesContent(fields map[string]bool) bool {
	for f := range fields {
		if contentFields[f] {
			return true
		}
	}
	return false
}

func setOf(fields []string) map[string]bool {
	out := make(map[string]bool, len(fields))
	for _, f := range fields {
		out[f] = true
	}
	return out
}

func keys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	return out
}

func intersect(a, b map[string]bool) map[string]bool {
	out := map[string]bool{}
	for k := range a {
		if b[k] {
			out[k] = true
		}
	}
	return out
}

func filter(set map[string]bool, keep map[string]bool) map[string]bool {
	out := map[string]bool{}
	for k := range set {
		if keep[k] {
			out[k] = true
		}
	}
	return out
}
