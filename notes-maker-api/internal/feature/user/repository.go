package user

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	driver "go.mongodb.org/mongo-driver/v2/mongo"
)

// ErrNotFound is returned by Repository lookups that find nothing — Service
// treats it as "create a new account" or "drop this webhook event"
// depending on the call site.
var ErrNotFound = errors.New("user: not found")

// Repository is the persistence boundary Service depends on. Mongo queries
// only — no business logic.
type Repository interface {
	FindByFirebaseUID(ctx context.Context, firebaseUID string) (*User, error)
	FindByEmail(ctx context.Context, email string) (*User, error)
	Insert(ctx context.Context, u *User) error
	UpdateSubscription(ctx context.Context, id bson.ObjectID, sub *Subscription) error
}

type MongoRepository struct {
	collection *driver.Collection
}

func NewMongoRepository(db *driver.Database) *MongoRepository {
	return &MongoRepository{collection: db.Collection("users")}
}

func (r *MongoRepository) FindByFirebaseUID(ctx context.Context, firebaseUID string) (*User, error) {
	return r.findOne(ctx, bson.D{{Key: "firebase_uid", Value: firebaseUID}})
}

func (r *MongoRepository) FindByEmail(ctx context.Context, email string) (*User, error) {
	return r.findOne(ctx, bson.D{{Key: "email", Value: email}})
}

func (r *MongoRepository) findOne(ctx context.Context, filter bson.D) (*User, error) {
	var u User
	err := r.collection.FindOne(ctx, filter).Decode(&u)
	if errors.Is(err, driver.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *MongoRepository) Insert(ctx context.Context, u *User) error {
	res, err := r.collection.InsertOne(ctx, u)
	if err != nil {
		return err
	}
	u.ID = res.InsertedID.(bson.ObjectID)
	return nil
}

func (r *MongoRepository) UpdateSubscription(ctx context.Context, id bson.ObjectID, sub *Subscription) error {
	_, err := r.collection.UpdateByID(ctx, id, bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "subscription", Value: sub},
			{Key: "updated_at", Value: time.Now().UTC()},
		}},
	})
	return err
}
