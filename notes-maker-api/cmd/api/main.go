// Command api serves the public GraphQL schema (Query.me) and the Paddle
// webhook. See docs/10 §10.18 for scope; Notes CRUD/sync are a later
// milestone.
package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"

	gqlhandler "github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/billing"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph/generated"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/middleware"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/config"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/firebaseauth"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/httpx"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/logging"
	platformmongo "github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/mongo"
	"github.com/wuizard/personal-notes-web/notes-maker-api/migrations"
)

func main() {
	ctx := context.Background()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	logging.Setup(cfg.LogFilePath)

	_, db, err := platformmongo.Connect(ctx, cfg)
	if err != nil {
		slog.Error("mongo: connect failed", "error", err)
		os.Exit(1)
	}
	if err := platformmongo.RunMigrations(ctx, db, migrations.All); err != nil {
		slog.Error("mongo: migrations failed", "error", err)
		os.Exit(1)
	}

	verifier, err := firebaseauth.New(ctx, cfg.FirebaseCredentialsFile)
	if err != nil {
		slog.Error("firebaseauth: init failed", "error", err)
		os.Exit(1)
	}

	userService := user.NewService(user.NewMongoRepository(db))
	webhookHandler := billing.NewWebhookHandler(userService, cfg.PaddleWebhookSecret)

	resolver := &graph.Resolver{Users: userService}
	graphqlSrv := gqlhandler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{Resolvers: resolver}))

	mux := http.NewServeMux()
	mux.Handle("/graphql", middleware.Auth(verifier)(graphqlSrv))
	mux.Handle("/graphql/playground", playground.Handler("notes-maker-api", "/graphql"))
	mux.Handle("/webhooks/paddle", webhookHandler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := httpx.RequestID(httpx.Recover(httpx.CORS(cfg.AllowedOrigins)(mux)))

	slog.Info("notes-maker-api listening", "port", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, handler); err != nil {
		slog.Error("server: exited", "error", err)
		os.Exit(1)
	}
}
