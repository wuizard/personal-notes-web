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

	// PaddleWebhookSecret verifies the Paddle-Signature header on incoming
	// Paddle webhook deliveries (docs/10 §10.20).
	PaddleWebhookSecret string

	// PaddleAPIKey is a Paddle API key, for calling the Paddle API directly
	// (as opposed to PaddleWebhookSecret, which only verifies inbound
	// webhook deliveries). Unused until a call site needs it — kept in
	// config now so it's never hardcoded later.
	PaddleAPIKey string

	// AllowedOrigins is the CORS allowlist for the Next.js frontend, which is
	// served from a different origin (Cloudflare Workers) than this API.
	AllowedOrigins []string

	// LogFilePath additionally appends structured logs to this file (see
	// internal/platform/logging) — meant for the VPS's
	// /var/log/notes-maker-api/app.log. Empty by default so local dev only
	// logs to stdout.
	LogFilePath string
	// NotesEncryptionKey seals note content at rest. Format:
	// comma-separated "<version>:<base64 of 32 bytes>" entries, or a bare
	// base64 key read as version 1. Rotating means adding a higher-numbered
	// key while keeping the old one so documents sealed under it still open.
	//
	// Losing every key in this variable means losing every synced note —
	// there is no recovery path, by construction. Back it up wherever the
	// other production secrets live.
	NotesEncryptionKey string
}

// Load reads configuration from the environment. It returns an error rather
// than panicking so cmd/api can log context before exiting.
func Load() (Config, error) {
	loadDotEnv(".env")

	cfg := Config{
		Port:                    getenvDefault("PORT", "8080"),
		MongoURI:                getenvDefault("MONGO_URI", "mongodb://localhost:27017/?replicaSet=rs0"),
		MongoDBName:             getenvDefault("MONGO_DB_NAME", "notes_maker"),
		FirebaseCredentialsFile: os.Getenv("FIREBASE_CREDENTIALS_FILE"),
		PaddleWebhookSecret:     os.Getenv("PADDLE_WEBHOOK_SECRET"),
		PaddleAPIKey:            os.Getenv("PADDLE_API_KEY"),
		AllowedOrigins:          splitCSV(getenvDefault("ALLOWED_ORIGINS", "http://localhost:3000")),
		LogFilePath:             os.Getenv("LOG_FILE_PATH"),
		NotesEncryptionKey:      os.Getenv("NOTES_ENCRYPTION_KEY"),
	}

	var missing []string
	if cfg.FirebaseCredentialsFile == "" {
		missing = append(missing, "FIREBASE_CREDENTIALS_FILE")
	}
	if cfg.NotesEncryptionKey == "" {
		missing = append(missing, "NOTES_ENCRYPTION_KEY")
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("config: missing required env vars: %v", missing)
	}

	return cfg, nil
}

// loadDotEnv fills gaps in the process environment from a local .env file
// (repo convention: gitignored, one KEY=value per line). It never overrides
// a variable that's already set, so real environment variables — CI,
// deployment secrets — always win; this only exists for local dev
// convenience. Missing file is not an error: production has no .env.
func loadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if _, set := os.LookupEnv(key); set {
			continue
		}
		_ = os.Setenv(key, strings.TrimSpace(value))
	}
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
