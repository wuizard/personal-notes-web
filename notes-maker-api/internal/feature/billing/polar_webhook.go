// Package billing turns verified Polar webhook deliveries into entitlement
// changes on a user's account. This is deliberately plain REST, not part of
// the GraphQL schema — webhooks are provider-initiated (docs/10 §10.15).
package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
)

// ErrInvalidSignature means the request's Standard Webhooks signature
// (https://www.standardwebhooks.com/, the scheme Polar uses) didn't verify
// against the configured secret. The request is rejected outright — no
// event is ever applied on an unverified payload.
var ErrInvalidSignature = errors.New("billing: invalid webhook signature")

// maxWebhookClockSkew bounds how old a signed timestamp may be, so a
// captured request can't be replayed indefinitely.
const maxWebhookClockSkew = 5 * time.Minute

// SubscriptionSetter is the slice of user.Service the webhook handler needs.
// Depending on the interface, not *user.Service, lets tests substitute a
// fake instead of hitting real Mongo.
type SubscriptionSetter interface {
	SetSubscription(ctx context.Context, email string, sub *user.Subscription) error
}

// WebhookHandler verifies and applies Polar subscription webhook events.
type WebhookHandler struct {
	Users  SubscriptionSetter
	Secret string
	Now    func() time.Time
}

func NewWebhookHandler(users SubscriptionSetter, secret string) *WebhookHandler {
	return &WebhookHandler{Users: users, Secret: secret, Now: time.Now}
}

func (h *WebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "cannot read body", http.StatusBadRequest)
		return
	}

	now := time.Now
	if h.Now != nil {
		now = h.Now
	}
	if err := verifySignature(h.Secret, r.Header, body, now()); err != nil {
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	var event polarEvent
	if err := json.Unmarshal(body, &event); err != nil {
		http.Error(w, "malformed payload", http.StatusBadRequest)
		return
	}

	if err := h.apply(r.Context(), event); err != nil {
		if errors.Is(err, user.ErrNotFound) {
			// A payment from an email with no matching Firebase account —
			// the documented linking gap (docs/10 §10.17). Ack so Polar
			// doesn't retry forever; there's nothing more we can do until a
			// claim flow exists.
			w.WriteHeader(http.StatusOK)
			return
		}
		http.Error(w, "failed to apply event", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// verifySignature checks the Standard Webhooks headers Polar sends:
// webhook-id, webhook-timestamp, and webhook-signature (space-separated
// "v1,<base64 hmac>" entries — Polar rotates keys, so more than one may be
// present). The secret is the dashboard-issued value, optionally prefixed
// "whsec_".
func verifySignature(secret string, header http.Header, body []byte, now time.Time) error {
	id := header.Get("webhook-id")
	timestampHeader := header.Get("webhook-timestamp")
	sigHeader := header.Get("webhook-signature")
	if id == "" || timestampHeader == "" || sigHeader == "" || secret == "" {
		return ErrInvalidSignature
	}

	ts, err := parseUnixSeconds(timestampHeader)
	if err != nil {
		return ErrInvalidSignature
	}
	if skew := now.Sub(ts); skew > maxWebhookClockSkew || skew < -maxWebhookClockSkew {
		return ErrInvalidSignature
	}

	keyBytes, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		return ErrInvalidSignature
	}

	mac := hmac.New(sha256.New, keyBytes)
	mac.Write([]byte(id + "." + timestampHeader + "."))
	mac.Write(body)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	for _, part := range strings.Fields(sigHeader) {
		version, sig, ok := strings.Cut(part, ",")
		if !ok || version != "v1" {
			continue
		}
		if hmac.Equal([]byte(sig), []byte(expected)) {
			return nil
		}
	}
	return ErrInvalidSignature
}

func parseUnixSeconds(s string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err == nil {
		return t, nil
	}
	var seconds int64
	if _, err := fmt.Sscanf(s, "%d", &seconds); err != nil {
		return time.Time{}, err
	}
	return time.Unix(seconds, 0), nil
}

// activeSubscriptionStatuses are the Polar subscription statuses that grant
// premium; anything else (canceled, past_due's terminal state, etc.) revokes
// it.
var activeSubscriptionStatuses = map[string]bool{
	"active":   true,
	"trialing": true,
}

// polarEvent is a deliberately conservative subset of Polar's webhook
// payload — only what's needed to grant/revoke entitlement. Verify field
// names against a real Polar payload before pointing this at production
// (docs/10 §10.17 flags this as unconfirmed).
type polarEvent struct {
	Type string `json:"type"`
	Data struct {
		ID               string `json:"id"`
		Status           string `json:"status"`
		CustomerID       string `json:"customer_id"`
		CurrentPeriodEnd string `json:"current_period_end"`
		Customer         struct {
			Email string `json:"email"`
		} `json:"customer"`
	} `json:"data"`
}

func (h *WebhookHandler) apply(ctx context.Context, event polarEvent) error {
	if !strings.HasPrefix(event.Type, "subscription.") {
		return nil // order/refund/etc — not this milestone's concern
	}

	email := event.Data.Customer.Email
	if email == "" {
		return fmt.Errorf("billing: webhook event %s missing customer email", event.Type)
	}

	status := "canceled"
	if activeSubscriptionStatuses[event.Data.Status] {
		status = "active"
	}

	var periodEnd time.Time
	if event.Data.CurrentPeriodEnd != "" {
		if t, err := time.Parse(time.RFC3339, event.Data.CurrentPeriodEnd); err == nil {
			periodEnd = t
		}
	}

	return h.Users.SetSubscription(ctx, email, &user.Subscription{
		Status:              status,
		PolarCustomerID:     event.Data.CustomerID,
		PolarSubscriptionID: event.Data.ID,
		CurrentPeriodEnd:    periodEnd,
	})
}
