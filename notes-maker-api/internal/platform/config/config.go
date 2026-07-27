// Package config loads process configuration from the environment and fails
// fast at boot if anything required is missing, rather than surfacing a nil
// pointer deep inside a request handler later.
package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	// Port the public GraphQL/HTTP server listens on.
	Port string

	// MongoURI and MongoDBName locate the single-node replica set used for
	// multi-document transactions (docs/01 §1.9).
	MongoURI    string
	MongoDBName string

	// FirebaseCredentialsFile is a path to the Firebase Admin SDK service
	// account JSON (e.g. the repo-root, gitignored
	// personal-task-c3e7e-firebase-adminsdk-*.json). Never read or logged
	// here — only the path is config; firebase-admin-go reads the file
	// itself.
	FirebaseCredentialsFile string

	// PolarWebhookSecret verifies the signature on incoming Polar webhook
	// deliveries (docs/10 §10.16/§10.17).
	PolarWebhookSecret string

	// AllowedOrigins is the CORS allowlist for the Next.js frontend, which is
	// served from a different origin (Cloudflare Workers) than this API.
	AllowedOrigins []string
}

// Load reads configuration from the environment. It returns an error rather
// than panicking so cmd/api can log context before exiting.
func Load() (Config, error) {
	cfg := Config{
		Port:                    getenvDefault("PORT", "8080"),
		MongoURI:                getenvDefault("MONGO_URI", "mongodb://localhost:27017/?replicaSet=rs0"),
		MongoDBName:             getenvDefault("MONGO_DB_NAME", "notes_maker"),
		FirebaseCredentialsFile: os.Getenv("FIREBASE_CREDENTIALS_FILE"),
		PolarWebhookSecret:      os.Getenv("POLAR_WEBHOOK_SECRET"),
		AllowedOrigins:          splitCSV(getenvDefault("ALLOWED_ORIGINS", "http://localhost:3000")),
	}

	var missing []string
	if cfg.FirebaseCredentialsFile == "" {
		missing = append(missing, "FIREBASE_CREDENTIALS_FILE")
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("config: missing required env vars: %v", missing)
	}

	return cfg, nil
}

func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func splitCSV(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
