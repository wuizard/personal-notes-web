package migrations

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	driver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// notesIndexes builds the two indexes the sync protocol depends on.
//
// The unique (user_id, client_id) pair is what makes a retried create
// idempotent instead of duplicating the note (docs/04 §4.4) — without it, a
// timed-out push that the client retries leaves two copies behind.
//
// The (user_id, updated_at, _id) index backs the pull cursor. The _id
// tiebreak is not optional: a cursor on updated_at alone silently skips notes
// written in the same millisecond (docs/04 §4.3).
func notesIndexes(ctx context.Context, db *driver.Database) error {
	_, err := db.Collection("notes").Indexes().CreateMany(ctx, []driver.IndexModel{
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "client_id", Value: 1},
			},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "updated_at", Value: 1},
				{Key: "_id", Value: 1},
			},
		},
	})
	return err
}
