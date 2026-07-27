// Package httpx holds small, transport-level HTTP middleware shared across
// entrypoints: panic recovery, request correlation IDs, and CORS.
package httpx

import (
	"log"
	"net/http"
	"strconv"
	"sync/atomic"
)

// Recover catches panics in downstream handlers so one bad request can't
// take the whole process down.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic recovered: %v", rec)
				http.Error(w, "internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

var requestCounter uint64

// RequestID stamps each request with an incrementing ID for log
// correlation, echoed back as X-Request-Id.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := atomic.AddUint64(&requestCounter, 1)
		w.Header().Set("X-Request-Id", strconv.FormatUint(id, 10))
		next.ServeHTTP(w, r)
	})
}

// CORS allows the configured frontend origins to call this API from the
// browser — it's served from a different origin (Cloudflare Workers) than
// the Next.js app (docs/01 §1.3: the API base is runtime config, never
// same-origin-coupled).
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if allowed[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
				w.Header().Set("Vary", "Origin")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
