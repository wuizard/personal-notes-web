package note

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	driver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var (
	// ErrNotFound means no note exists for that (user, client_id).
	ErrNotFound = errors.New("note: not found")

	// ErrDuplicate is the unique (user_id, client_id) index rejecting a
	// second create. Service turns it into an update rather than an error:
	// that index is exactly what makes a retried create idempotent instead
	// of duplicating the note (docs/04 §4.4).
	ErrDuplicate = errors.New("note: duplicate client_id")
)

// Repository is the persistence boundary Service depends on. Mongo queries
// only — no business logic.
type Repository interface {
	FindByClientID(ctx context.Context, userID bson.ObjectID, clientID string) (*Note, error)
	// ListSince returns notes ordered by (updated_at, _id) strictly after
	// the cursor, tombstones included. It returns at most limit rows.
	ListSince(ctx context.Context, userID bson.ObjectID, after Cursor, limit int) ([]Note, error)
	// CountActive counts what the tier cap counts: live, non-archived notes.
	// Archiving is decluttering, not deletion, and must stay a legitimate
	// way to make room (docs/00 §0.6) — so it matches the client's
	// countActiveNotes exactly.
	CountActive(ctx context.Context, userID bson.ObjectID) (int, error)
	Insert(ctx context.Context, n *Note) error
	Replace(ctx context.Context, n *Note) error
}

// Cursor is the sync position: the compound key from the sync index.
//
// Never a bare timestamp — notes written in the same millisecond would be
// silently skipped. The _id tiebreak is what makes the ordering total
// (docs/04 §4.3).
type Cursor struct {
	UpdatedAt time.Time
	ID        bson.ObjectID
}

// IsZero reports the empty cursor, which means "full bootstrap".
func (c Cursor) IsZero() bool { return c.UpdatedAt.IsZero() && c.ID.IsZero() }

type wireCursor struct {
	UpdatedAtMillis int64  `json:"u"`
	ID              string `json:"i"`
}

// Encode renders the cursor as the opaque base64 string the client stores in
// meta and hands back on the next pull. Opaque on purpose: the shape is free
// to change without a client release.
func (c Cursor) Encode() string {
	if c.IsZero() {
		return ""
	}
	raw, err := json.Marshal(wireCursor{
		UpdatedAtMillis: c.UpdatedAt.UnixMilli(),
		ID:              c.ID.Hex(),
	})
	if err != nil {
		// wireCursor is two scalars; Marshal cannot fail on it.
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

// DecodeCursor parses what Encode produced. An empty string is the zero
// cursor — a fresh device pulling everything, paged.
func DecodeCursor(s string) (Cursor, error) {
	if s == "" {
		return Cursor{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, fmt.Errorf("note: malformed cursor: %w", err)
	}
	var w wireCursor
	if err := json.Unmarshal(raw, &w); err != nil {
		return Cursor{}, fmt.Errorf("note: malformed cursor: %w", err)
	}
	id, err := bson.ObjectIDFromHex(w.ID)
	if err != nil {
		return Cursor{}, fmt.Errorf("note: malformed cursor id: %w", err)
	}
	return Cursor{UpdatedAt: time.UnixMilli(w.UpdatedAtMillis).UTC(), ID: id}, nil
}

type MongoRepository struct {
	collection *driver.Collection
}

func NewMongoRepository(db *driver.Database) *MongoRepository {
	return &MongoRepository{collection: db.Collection("notes")}
}

func (r *MongoRepository) FindByClientID(ctx context.Context, userID bson.ObjectID, clientID string) (*Note, error) {
	var n Note
	err := r.collection.FindOne(ctx, bson.D{
		{Key: "user_id", Value: userID},
		{Key: "client_id", Value: clientID},
	}).Decode(&n)
	if errors.Is(err, driver.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &n, nil
}

func (r *MongoRepository) ListSince(ctx context.Context, userID bson.ObjectID, after Cursor, limit int) ([]Note, error) {
	filter := bson.D{{Key: "user_id", Value: userID}}
	if !after.IsZero() {
		filter = append(filter, bson.E{Key: "$or", Value: bson.A{
			bson.D{{Key: "updated_at", Value: bson.D{{Key: "$gt", Value: after.UpdatedAt}}}},
			bson.D{
				{Key: "updated_at", Value: after.UpdatedAt},
				{Key: "_id", Value: bson.D{{Key: "$gt", Value: after.ID}}},
			},
		}})
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "updated_at", Value: 1}, {Key: "_id", Value: 1}}).
		SetLimit(int64(limit))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var notes []Note
	if err := cursor.All(ctx, &notes); err != nil {
		return nil, err
	}
	return notes, nil
}

func (r *MongoRepository) CountActive(ctx context.Context, userID bson.ObjectID) (int, error) {
	count, err := r.collection.CountDocuments(ctx, bson.D{
		{Key: "user_id", Value: userID},
		{Key: "deleted_at", Value: nil},
		{Key: "archived", Value: false},
	})
	return int(count), err
}

func (r *MongoRepository) Insert(ctx context.Context, n *Note) error {
	res, err := r.collection.InsertOne(ctx, n)
	if driver.IsDuplicateKeyError(err) {
		return ErrDuplicate
	}
	if err != nil {
		return err
	}
	n.ID = res.InsertedID.(bson.ObjectID)
	return nil
}

func (r *MongoRepository) Replace(ctx context.Context, n *Note) error {
	_, err := r.collection.ReplaceOne(ctx, bson.D{{Key: "_id", Value: n.ID}}, n)
	return err
}
