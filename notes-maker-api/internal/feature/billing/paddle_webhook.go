// Package billing turns verified Paddle webhook deliveries into entitlement
// changes on a user's account. This is deliberately plain REST, not part of
// the GraphQL schema — webhooks are provider-initiated (docs/10 §10.15).
package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
)

// ErrInvalidSignature means the request's Paddle-Signature header didn't
// verify against the configured secret. The request is rejected outright —
// no event is ever applied on an unverified payload.
var ErrInvalidSignature = errors.New("billing: invalid webhook signature")

// maxWebhookClockSkew bounds how old a signed timestamp may be, so a
// captured request can't be replayed indefinitely. Paddle's own SDKs default
// to a 5-second tolerance, but that's tuned for their SDK talking to their
// own infrastructure — this is a hand-rolled verifier that also has to
// tolerate ordinary network/processing latency, so it stays deliberately
// more lenient.
const maxWebhookClockSkew = 5 * time.Minute

// SubscriptionSetter is the slice of user.Service the webhook handler needs.
// Depending on the interface, not *user.Service, lets tests substitute a
// fake instead of hitting real Mongo.
type SubscriptionSetter interface {
	SetSubscription(ctx context.Context, firebaseUID string, sub *user.Subscription) error
}

// WebhookHandler verifies and applies Paddle subscription webhook events.
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
		slog.WarnContext(r.Context(), "billing webhook rejected", "event", "billing.webhook.invalid_signature")
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	var event paddleEvent
	if err := json.Unmarshal(body, &event); err != nil {
		slog.WarnContext(r.Context(), "billing webhook rejected", "event", "billing.webhook.malformed", "error", err)
		http.Error(w, "malformed payload", http.StatusBadRequest)
		return
	}

	logFields := []any{
		"event", "billing.webhook",
		"type", event.EventType,
		"firebase_uid", event.Data.CustomData.FirebaseUID,
		"paddle_customer_id", event.Data.CustomerID,
		"paddle_subscription_id", event.Data.ID,
		"status", event.Data.Status,
	}

	if err := h.apply(r.Context(), event); err != nil {
		if errors.Is(err, user.ErrNotFound) {
			// The account was deleted between checkout and webhook delivery
			// — every payer necessarily has a Firebase account already
			// (they must be signed in to reach the Subscribe button), so
			// this is a genuine edge case, not the unmatched-payer-email gap
			// the old Polar integration had (docs/10 §10.17, closed by
			// §10.20). Ack so Paddle doesn't retry forever.
			slog.WarnContext(r.Context(), "billing webhook: account not found for firebase_uid", logFields...)
			w.WriteHeader(http.StatusOK)
			return
		}
		slog.ErrorContext(r.Context(), "billing webhook apply failed", append(logFields, "error", err)...)
		http.Error(w, "failed to apply event", http.StatusInternalServerError)
		return
	}

	slog.InfoContext(r.Context(), "billing webhook applied", logFields...)
	w.WriteHeader(http.StatusOK)
}

// verifySignature checks the Paddle-Signature header Paddle sends:
// "ts=<unix-seconds>;h1=<hex-hmac>". The signed content is "{ts}:{rawBody}"
// (colon-joined), HMAC-SHA256 keyed by the notification destination's secret
// (used as raw key bytes — unlike Polar's whsec_-prefixed base64 secret,
// Paddle's pdl_ntfset_-prefixed secret is not base64 encoded). Only one h1
// is ever present; Paddle has no documented key-rotation multi-entry format
// the way Polar's webhook-signature header did.
func verifySignature(secret string, header http.Header, body []byte, now time.Time) error {
	raw := header.Get("Paddle-Signature")
	if raw == "" || secret == "" {
		return ErrInvalidSignature
	}

	var tsStr, h1 string
	for _, part := range strings.Split(raw, ";") {
		k, v, ok := strings.Cut(part, "=")
		if !ok {
			continue
		}
		switch k {
		case "ts":
			tsStr = v
		case "h1":
			h1 = v
		}
	}
	if tsStr == "" || h1 == "" {
		return ErrInvalidSignature
	}

	seconds, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return ErrInvalidSignature
	}
	ts := time.Unix(seconds, 0)
	if skew := now.Sub(ts); skew > maxWebhookClockSkew || skew < -maxWebhookClockSkew {
		return ErrInvalidSignature
	}

	receivedSig, err := hex.DecodeString(h1)
	if err != nil {
		return ErrInvalidSignature
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(tsStr + ":"))
	mac.Write(body)

	if !hmac.Equal(receivedSig, mac.Sum(nil)) {
		return ErrInvalidSignature
	}
	return nil
}

// activeSubscriptionStatuses are the Paddle subscription statuses that grant
// premium; anything else (canceled, past_due, paused, etc.) revokes it.
var activeSubscriptionStatuses = map[string]bool{
	"active":   true,
	"trialing": true,
}

// paddleEvent is a deliberately conservative subset of Paddle's subscription
// webhook payload — only what's needed to grant/revoke entitlement. Verify
// field names against a real Paddle webhook delivery before pointing this at
// production (docs/10 §10.20 flags this as unconfirmed, same caution the
// Polar version of this file carried for its own field names).
type paddleEvent struct {
	EventType string `json:"event_type"`
	Data      struct {
		ID                   string `json:"id"`
		Status               string `json:"status"`
		CustomerID           string `json:"customer_id"`
		CurrentBillingPeriod struct {
			EndsAt string `json:"ends_at"`
		} `json:"current_billing_period"`
		CustomData struct {
			FirebaseUID string `json:"firebase_uid"`
		} `json:"custom_data"`
	} `json:"data"`
}

func (h *WebhookHandler) apply(ctx context.Context, event paddleEvent) error {
	if !strings.HasPrefix(event.EventType, "subscription.") {
		return nil // transaction/refund/etc — not this milestone's concern
	}

	firebaseUID := event.Data.CustomData.FirebaseUID
	if firebaseUID == "" {
		return fmt.Errorf("billing: webhook event %s missing custom_data.firebase_uid", event.EventType)
	}

	status := "canceled"
	if activeSubscriptionStatuses[event.Data.Status] {
		status = "active"
	}

	var periodEnd time.Time
	if raw := event.Data.CurrentBillingPeriod.EndsAt; raw != "" {
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			periodEnd = t
		}
	}

	return h.Users.SetSubscription(ctx, firebaseUID, &user.Subscription{
		Status:               status,
		PaddleCustomerID:     event.Data.CustomerID,
		PaddleSubscriptionID: event.Data.ID,
		CurrentPeriodEnd:     periodEnd,
	})
}
