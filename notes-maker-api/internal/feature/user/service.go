// Package user owns the users collection: resolving a verified Firebase
// identity to an account, and deriving plan/entitlement from subscription
// state written by the Polar webhook.
package user

import (
	"context"
	"errors"
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

// Subscription is the Polar-sourced entitlement state for one account. A nil
// Subscription (or a non-"active" Status) means free tier.
type Subscription struct {
	Status              string    `bson:"status"`
	PolarCustomerID     string    `bson:"polar_customer_id,omitempty"`
	PolarSubscriptionID string    `bson:"polar_subscription_id,omitempty"`
	CurrentPeriodEnd    time.Time `bson:"current_period_end,omitempty"`
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
		return nil, err
	}
	return u, nil
}

// SetSubscription applies Polar-sourced entitlement state to whichever
// account the payment's email resolves to. Called from the webhook handler.
//
// Limitation (docs/10 §10.17): this only works for a payer who already has a
// Firebase account under that email. A payment from an email with no
// matching account is reported via ErrNotFound and dropped — there is no
// invite/claim flow yet to link it retroactively.
func (s *Service) SetSubscription(ctx context.Context, email string, sub *Subscription) error {
	u, err := s.repo.FindByEmail(ctx, email)
	if err != nil {
		return err
	}
	return s.repo.UpdateSubscription(ctx, u.ID, sub)
}
