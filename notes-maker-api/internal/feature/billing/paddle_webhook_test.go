package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
)

const testSecret = "pdl_ntfset_test_secret_test_secret"

type fakeUsers struct {
	calls []struct {
		firebaseUID string
		sub         *user.Subscription
	}
	err error
}

func (f *fakeUsers) SetSubscription(_ context.Context, firebaseUID string, sub *user.Subscription) error {
	if f.err != nil {
		return f.err
	}
	f.calls = append(f.calls, struct {
		firebaseUID string
		sub         *user.Subscription
	}{firebaseUID, sub})
	return nil
}

func sign(secret, ts string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + ":"))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func newSignedRequest(secret string, body []byte, at time.Time) *http.Request {
	ts := strconv.FormatInt(at.Unix(), 10)
	sig := sign(secret, ts, body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/paddle", strings.NewReader(string(body)))
	req.Header.Set("Paddle-Signature", fmt.Sprintf("ts=%s;h1=%s", ts, sig))
	return req
}

func TestWebhookHandler_ValidSignatureGrantsSubscription(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{
		"event_type": "subscription.activated",
		"data": {
			"id": "sub_123",
			"status": "active",
			"customer_id": "ctm_123",
			"custom_data": {"firebase_uid": "uid-1"}
		}
	}`)

	req := newSignedRequest(testSecret, body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(users.calls) != 1 {
		t.Fatalf("expected exactly one SetSubscription call, got %d", len(users.calls))
	}
	if users.calls[0].firebaseUID != "uid-1" || users.calls[0].sub.Status != "active" {
		t.Fatalf("unexpected call: %+v", users.calls[0])
	}
}

func TestWebhookHandler_InvalidSignatureRejected(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{"event_type": "subscription.activated", "data": {"custom_data": {"firebase_uid": "uid-1"}}}`)

	req := newSignedRequest("pdl_ntfset_wrong_secret_wrong_secret", body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if len(users.calls) != 0 {
		t.Fatalf("expected no SetSubscription call on invalid signature, got %d", len(users.calls))
	}
}

func TestWebhookHandler_StaleTimestampRejected(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{"event_type": "subscription.activated", "data": {"custom_data": {"firebase_uid": "uid-1"}}}`)
	old := now.Add(-1 * time.Hour)
	req := newSignedRequest(testSecret, body, old)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for stale timestamp, got %d", rec.Code)
	}
}

func TestWebhookHandler_AccountNotFoundIsAcked(t *testing.T) {
	users := &fakeUsers{err: user.ErrNotFound}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{"event_type": "subscription.activated", "data": {"custom_data": {"firebase_uid": "deleted-uid"}}}`)
	req := newSignedRequest(testSecret, body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (acked, not retried) for account deleted between checkout and webhook delivery, got %d", rec.Code)
	}
}

func TestWebhookHandler_MissingCustomDataRejected(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	// A subscription with no custom_data — e.g. created directly in the
	// Paddle dashboard, bypassing this app's checkout flow entirely — has no
	// firebase_uid to resolve an account from.
	body := []byte(`{"event_type": "subscription.activated", "data": {"id": "sub_999", "status": "active", "customer_id": "ctm_999"}}`)
	req := newSignedRequest(testSecret, body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for missing custom_data.firebase_uid, got %d", rec.Code)
	}
	if len(users.calls) != 0 {
		t.Fatalf("expected no SetSubscription call when custom_data.firebase_uid is missing, got %d", len(users.calls))
	}
}

func TestWebhookHandler_IgnoresNonSubscriptionEvents(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{"event_type": "transaction.paid", "data": {"custom_data": {"firebase_uid": "uid-1"}}}`)
	req := newSignedRequest(testSecret, body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if len(users.calls) != 0 {
		t.Fatalf("expected transaction.paid to be ignored, got %d calls", len(users.calls))
	}
}
