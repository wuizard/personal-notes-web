package user

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// fakeRepository is an in-memory stand-in for MongoRepository — the
// project's own testing philosophy is to fake the repository boundary
// rather than mock against a real network.
type fakeRepository struct {
	byUID   map[string]*User
	byEmail map[string]*User
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{byUID: map[string]*User{}, byEmail: map[string]*User{}}
}

func (f *fakeRepository) FindByFirebaseUID(_ context.Context, firebaseUID string) (*User, error) {
	if u, ok := f.byUID[firebaseUID]; ok {
		return u, nil
	}
	return nil, ErrNotFound
}

func (f *fakeRepository) FindByEmail(_ context.Context, email string) (*User, error) {
	if u, ok := f.byEmail[email]; ok {
		return u, nil
	}
	return nil, ErrNotFound
}

func (f *fakeRepository) Insert(_ context.Context, u *User) error {
	u.ID = bson.NewObjectID()
	f.byUID[u.FirebaseUID] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeRepository) UpdateSubscription(_ context.Context, id bson.ObjectID, sub *Subscription) error {
	for _, u := range f.byUID {
		if u.ID == id {
			u.Subscription = sub
			return nil
		}
	}
	return ErrNotFound
}

func TestGetOrCreateByFirebaseUID_CreatesOnFirstSignIn(t *testing.T) {
	repo := newFakeRepository()
	svc := NewService(repo)
	ctx := context.Background()

	u, err := svc.GetOrCreateByFirebaseUID(ctx, "uid-1", "a@example.com", "Alice")
	if err != nil {
		t.Fatalf("GetOrCreateByFirebaseUID: %v", err)
	}
	if u.FirebaseUID != "uid-1" || u.Email != "a@example.com" {
		t.Fatalf("unexpected user: %+v", u)
	}
	if u.Plan() != PlanFree {
		t.Fatalf("new user should be free, got %v", u.Plan())
	}
}

func TestGetOrCreateByFirebaseUID_ReturnsExistingOnSecondSignIn(t *testing.T) {
	repo := newFakeRepository()
	svc := NewService(repo)
	ctx := context.Background()

	first, err := svc.GetOrCreateByFirebaseUID(ctx, "uid-1", "a@example.com", "Alice")
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	second, err := svc.GetOrCreateByFirebaseUID(ctx, "uid-1", "a@example.com", "Alice")
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("expected same account, got IDs %v and %v", first.ID, second.ID)
	}
	if len(repo.byUID) != 1 {
		t.Fatalf("expected exactly one stored account, got %d", len(repo.byUID))
	}
}

func TestSetSubscription_GrantsPremiumForActiveStatus(t *testing.T) {
	repo := newFakeRepository()
	svc := NewService(repo)
	ctx := context.Background()

	if _, err := svc.GetOrCreateByFirebaseUID(ctx, "uid-1", "a@example.com", "Alice"); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	err := svc.SetSubscription(ctx, "uid-1", &Subscription{
		Status:           "active",
		PaddleCustomerID: "ctm_123",
	})
	if err != nil {
		t.Fatalf("SetSubscription: %v", err)
	}

	u, err := svc.GetOrCreateByFirebaseUID(ctx, "uid-1", "a@example.com", "Alice")
	if err != nil {
		t.Fatalf("re-fetch: %v", err)
	}
	if u.Plan() != PlanPremium {
		t.Fatalf("expected premium after active subscription, got %v", u.Plan())
	}
}

func TestSetSubscription_UnknownFirebaseUIDReturnsNotFound(t *testing.T) {
	repo := newFakeRepository()
	svc := NewService(repo)

	err := svc.SetSubscription(context.Background(), "nobody-uid", &Subscription{Status: "active"})
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for a firebase UID with no account, got %v", err)
	}
}
