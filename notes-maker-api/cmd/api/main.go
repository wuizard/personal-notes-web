// Command api serves the public GraphQL schema (Query.me) and the Polar
// webhook. See docs/10 §10.17 for scope; Notes CRUD/sync are a later
// milestone.
package main

import (
	"context"
	"log"
	"net/http"

	gqlhandler "github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/billing"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/note"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph/generated"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/middleware"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/config"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/crypto"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/firebaseauth"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/httpx"
	platformmongo "github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/mongo"
	"github.com/wuizard/personal-notes-web/notes-maker-api/migrations"
)

func main() {
	ctx := context.Background()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	_, db, err := platformmongo.Connect(ctx, cfg)
	if err != nil {
		log.Fatalf("mongo: %v", err)
	}
	if err := platformmongo.RunMigrations(ctx, db, migrations.All); err != nil {
		log.Fatalf("mongo migrations: %v", err)
	}

	verifier, err := firebaseauth.New(ctx, cfg.FirebaseCredentialsFile)
	if err != nil {
		log.Fatalf("firebaseauth: %v", err)
	}

	keys, err := crypto.ParseKeyring(cfg.NotesEncryptionKey)
	if err != nil {
		log.Fatalf("notes encryption key: %v", err)
	}
	sealer, err := crypto.NewSealer(keys)
	if err != nil {
		log.Fatalf("notes encryption key: %v", err)
	}

	userService := user.NewService(user.NewMongoRepository(db))
	noteService := note.NewService(note.NewMongoRepository(db), sealer)
	webhookHandler := billing.NewWebhookHandler(userService, cfg.PolarWebhookSecret)

	resolver := &graph.Resolver{Users: userService, NoteSync: noteService}
	graphqlSrv := gqlhandler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{Resolvers: resolver}))

	mux := http.NewServeMux()
	mux.Handle("/graphql", middleware.Auth(verifier)(graphqlSrv))
	mux.Handle("/graphql/playground", playground.Handler("notes-maker-api", "/graphql"))
	mux.Handle("/webhooks/polar", webhookHandler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := httpx.RequestID(httpx.Recover(httpx.CORS(cfg.AllowedOrigins)(mux)))

	log.Printf("notes-maker-api listening on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, handler); err != nil {
		log.Fatalf("server: %v", err)
	}
}
