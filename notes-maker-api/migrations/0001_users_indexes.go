// Package migrations lists the ordered index-bootstrap steps applied at
// boot (docs/02 §2.7 pattern).
package migrations

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	driver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	platformmongo "github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/mongo"
)

// All is the full, ordered set of migrations run at process boot.
var All = []platformmongo.Migration{
	{Name: "0001_users_indexes", Run: usersIndexes},
	{Name: "0002_notes_indexes", Run: notesIndexes},
}

// usersIndexes gives each Firebase account exactly one users document.
// firebase_uid (not email) is the identity key — see docs/10 §10.17.
func usersIndexes(ctx context.Context, db *driver.Database) error {
	_, err := db.Collection("users").Indexes().CreateOne(ctx, driver.IndexModel{
		Keys:    bson.D{{Key: "firebase_uid", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	return err
}
