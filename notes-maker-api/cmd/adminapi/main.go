// Command adminapi is a placeholder for the admin GraphQL schema (docs/10
// §10.15's "separate schemas, separate JWT audiences" split). No admin
// frontend exists yet either (notes-maker-admin/, P2.8) — this just boots
// and returns 501 so the two-binary shape exists from day one without
// building unused surface area now.
package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("ADMIN_PORT")
	if port == "" {
		port = "8081"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "adminapi: not implemented yet", http.StatusNotImplemented)
	})

	log.Printf("notes-maker-adminapi (placeholder) listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("server: %v", err)
	}
}
