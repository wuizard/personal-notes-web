// Package mongo wraps the MongoDB connection and a minimal migration
// runner. It is a platform package: it must never import
// internal/feature/*.
package mongo

import (
	"context"
	"fmt"
	"time"

	driver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/config"
)

// Connect dials MongoDB and pings it before returning, so a bad connection
// string fails at boot rather than on the first request.
func Connect(ctx context.Context, cfg config.Config) (*driver.Client, *driver.Database, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	client, err := driver.Connect(options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		return nil, nil, fmt.Errorf("mongo: connect: %w", err)
	}
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		return nil, nil, fmt.Errorf("mongo: ping: %w", err)
	}

	return client, client.Database(cfg.MongoDBName), nil
}

// Migration is one idempotent, ordered setup step (typically an index
// creation) applied at boot.
type Migration struct {
	Name string
	Run  func(ctx context.Context, db *driver.Database) error
}

// RunMigrations applies each migration in order, stopping at the first
// failure so a partial schema state is never silently ignored.
func RunMigrations(ctx context.Context, db *driver.Database, migrations []Migration) error {
	for _, m := range migrations {
		if err := m.Run(ctx, db); err != nil {
			return fmt.Errorf("mongo: migration %q: %w", m.Name, err)
		}
	}
	return nil
}
