// Package middleware holds cross-cutting HTTP middleware. It may import
// internal/platform/* but never internal/feature/*.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/platform/firebaseauth"
)

type contextKey string

const identityContextKey contextKey = "identity"

// Auth extracts and verifies a "Bearer <token>" Authorization header,
// stashing the resulting Identity in the request context on success.
//
// A missing or invalid token does not itself reject the request — GraphQL
// serves both public and authenticated fields behind one endpoint, so
// "who is this" and "are they allowed to see this field" are deliberately
// kept separate. Resolvers that require a signed-in caller check
// IdentityFromContext themselves and return an error if it's absent.
func Auth(verifier *firebaseauth.Verifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !ok || token == "" {
				next.ServeHTTP(w, r)
				return
			}

			identity, err := verifier.Verify(r.Context(), token)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), identityContextKey, identity)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// IdentityFromContext returns the verified caller, if the request carried a
// valid Bearer token.
func IdentityFromContext(ctx context.Context) (firebaseauth.Identity, bool) {
	identity, ok := ctx.Value(identityContextKey).(firebaseauth.Identity)
	return identity, ok
}
