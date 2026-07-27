// Package firebaseauth wraps the Firebase Admin SDK to verify client-issued
// ID tokens. There is no custom password/JWT system here — Firebase Auth
// already owns login and token refresh on the client (docs/10 §10.17
// supersedes docs/01 §1.4, docs/02 §2.1/§2.4, docs/03 §3.2 on this point).
package firebaseauth

import (
	"context"
	"fmt"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

// Verifier checks Firebase ID tokens against the configured Firebase
// project. It never sees or handles passwords.
type Verifier struct {
	client *auth.Client
}

// New loads the service account key at credentialsFile (e.g.
// GOOGLE_APPLICATION_CREDENTIALS-style path from config.FirebaseCredentialsFile)
// and constructs a Verifier. The key's contents are never logged.
func New(ctx context.Context, credentialsFile string) (*Verifier, error) {
	app, err := firebase.NewApp(ctx, nil, option.WithCredentialsFile(credentialsFile))
	if err != nil {
		return nil, fmt.Errorf("firebaseauth: init app: %w", err)
	}
	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebaseauth: init auth client: %w", err)
	}
	return &Verifier{client: client}, nil
}

// Identity is the subset of a verified token this service cares about.
type Identity struct {
	UID   string
	Email string
}

// Verify checks the token's signature, expiry, and issuer against the
// Firebase project. A returned error means the token must be treated as
// unauthenticated — never partially trusted.
func (v *Verifier) Verify(ctx context.Context, idToken string) (Identity, error) {
	token, err := v.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return Identity{}, fmt.Errorf("firebaseauth: verify token: %w", err)
	}
	email, _ := token.Claims["email"].(string)
	return Identity{UID: token.UID, Email: email}, nil
}
