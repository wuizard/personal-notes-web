package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
)

const testSecret = "whsec_dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ=" // base64("test-secret-test-secret")

type fakeUsers struct {
	calls []struct {
		email string
		sub   *user.Subscription
	}
	err error
}

func (f *fakeUsers) SetSubscription(_ context.Context, email string, sub *user.Subscription) error {
	if f.err != nil {
		return f.err
	}
	f.calls = append(f.calls, struct {
		email string
		sub   *user.Subscription
	}{email, sub})
	return nil
}

func sign(t *testing.T, secret, id, timestamp string, body []byte) string {
	t.Helper()
	keyBytes, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		t.Fatalf("decode secret: %v", err)
	}
	mac := hmac.New(sha256.New, keyBytes)
	mac.Write([]byte(id + "." + timestamp + "."))
	mac.Write(body)
	return "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func newSignedRequest(t *testing.T, secret string, body []byte, at time.Time) *http.Request {
	t.Helper()
	id := "msg_test"
	timestamp := strconv.FormatInt(at.Unix(), 10)
	sig := sign(t, secret, id, timestamp, body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/polar", strings.NewReader(string(body)))
	req.Header.Set("webhook-id", id)
	req.Header.Set("webhook-timestamp", timestamp)
	req.Header.Set("webhook-signature", sig)
	return req
}

func TestWebhookHandler_ValidSignatureGrantsSubscription(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{
		"type": "subscription.active",
		"data": {
			"id": "sub_123",
			"status": "active",
			"customer_id": "cus_123",
			"customer": {"email": "a@example.com"}
		}
	}`)

	req := newSignedRequest(t, testSecret, body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(users.calls) != 1 {
		t.Fatalf("expected exactly one SetSubscription call, got %d", len(users.calls))
	}
	if users.calls[0].email != "a@example.com" || users.calls[0].sub.Status != "active" {
		t.Fatalf("unexpected call: %+v", users.calls[0])
	}
}

func TestWebhookHandler_InvalidSignatureRejected(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{"type": "subscription.active", "data": {"customer": {"email": "a@example.com"}}}`)

	req := newSignedRequest(t, "whsec_d29uZy1zZWNyZXQtd3Jvbmctc2VjcmV0", body, now)
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

	body := []byte(`{"type": "subscription.active", "data": {"customer": {"email": "a@example.com"}}}`)
	old := now.Add(-1 * time.Hour)
	req := newSignedRequest(t, testSecret, body, old)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for stale timestamp, got %d", rec.Code)
	}
}

func TestWebhookHandler_UnknownAccountIsAcked(t *testing.T) {
	users := &fakeUsers{err: user.ErrNotFound}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{"type": "subscription.active", "data": {"customer": {"email": "nobody@example.com"}}}`)
	req := newSignedRequest(t, testSecret, body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (acked, not retried) for unknown account, got %d", rec.Code)
	}
}

func TestWebhookHandler_IgnoresNonSubscriptionEvents(t *testing.T) {
	users := &fakeUsers{}
	h := NewWebhookHandler(users, testSecret)
	now := time.Now()
	h.Now = func() time.Time { return now }

	body := []byte(`{"type": "order.paid", "data": {"customer": {"email": "a@example.com"}}}`)
	req := newSignedRequest(t, testSecret, body, now)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if len(users.calls) != 0 {
		t.Fatalf("expected order.paid to be ignored, got %d calls", len(users.calls))
	}
}
