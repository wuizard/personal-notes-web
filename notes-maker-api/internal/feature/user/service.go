// Package user owns the users collection: resolving a verified Firebase
// identity to an account, and deriving plan/entitlement from subscription
// state written by the Polar webhook.
package user

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Plan mirrors the GraphQL Plan enum (docs/10 §10.15/§10.17); the frontend
// lowercases these into its own PlanTier type.
type Plan string

const (
	PlanFree    Plan = "FREE"
	PlanPremium Plan = "PREMIUM"
)

const activeSubscriptionStatus = "active"

// Subscription is the Paddle-sourced entitlement state for one account. A nil
// Subscription (or a non-"active" Status) means free tier.
type Subscription struct {
	Status               string    `bson:"status"`
	PaddleCustomerID     string    `bson:"paddle_customer_id,omitempty"`
	PaddleSubscriptionID string    `bson:"paddle_subscription_id,omitempty"`
	CurrentPeriodEnd     time.Time `bson:"current_period_end,omitempty"`
}

// User is identified by firebase_uid, not email/password — Firebase Auth
// owns credentials entirely; this service never sees a password.
type User struct {
	ID           bson.ObjectID `bson:"_id,omitempty"`
	FirebaseUID  string        `bson:"firebase_uid"`
	Email        string        `bson:"email"`
	DisplayName  string        `bson:"display_name,omitempty"`
	Subscription *Subscription `bson:"subscription,omitempty"`
	CreatedAt    time.Time     `bson:"created_at"`
	UpdatedAt    time.Time     `bson:"updated_at"`
}

// Plan derives the account's current entitlement from subscription status.
func (u User) Plan() Plan {
	if u.Subscription != nil && u.Subscription.Status == activeSubscriptionStatus {
		return PlanPremium
	}
	return PlanFree
}

// Service is the feature's public API. It depends on the Repository
// interface, not the Mongo driver, so tests can substitute an in-memory fake.
type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// GetOrCreateByFirebaseUID resolves a verified Firebase identity to a users
// document, creating one on first sign-in.
func (s *Service) GetOrCreateByFirebaseUID(ctx context.Context, firebaseUID, email, displayName string) (*User, error) {
	existing, err := s.repo.FindByFirebaseUID(ctx, firebaseUID)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	now := time.Now().UTC()
	u := &User{
		FirebaseUID: firebaseUID,
		Email:       email,
		DisplayName: displayName,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.repo.Insert(ctx, u); err != nil {
		slog.ErrorContext(ctx, "user registration failed", "event", "user.register.error", "email", email, "error", err)
		return nil, err
	}
	slog.InfoContext(ctx, "new user registered", "event", "user.register", "user_id", u.ID.Hex(), "email", email)
	return u, nil
}

// SetSubscription applies Paddle-sourced entitlement state to the account a
// checkout's Firebase UID (passed as custom_data at checkout time, echoed
// back in the webhook) belongs to. Called from the webhook handler.
//
// Every paying user already has a Firebase account — they must be signed in
// to reach the Subscribe button — so, unlike the retired Polar integration's
// email-matching design (docs/10 §10.17), ErrNotFound here means the account
// was deleted between checkout and webhook delivery, not an unmatched payer
// (docs/10 §10.18).
func (s *Service) SetSubscription(ctx context.Context, firebaseUID string, sub *Subscription) error {
	u, err := s.repo.FindByFirebaseUID(ctx, firebaseUID)
	if err != nil {
		return err
	}
	return s.repo.UpdateSubscription(ctx, u.ID, sub)
}
