package graph

// This file is hand-written and gqlgen never rewrites it. The Resolver struct
// and any helper the resolvers share live here; internal/graph/resolver.go is
// regenerated from the schema and holds only the resolver methods themselves.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/note"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph/model"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/middleware"
)

// Resolver wires GraphQL fields to feature services; it holds no business
// logic of its own.
type Resolver struct {
	Users    *user.Service
	NoteSync *note.Service
}

var (
	// ErrUnauthenticated is returned by fields that require a verified
	// Firebase Bearer token when the request didn't carry one.
	ErrUnauthenticated = errors.New("graph: no valid Authorization Bearer token")

	// ErrPremiumRequired guards the sync fields. Sync is the paid tier's
	// defining feature (docs/10 §10.7), and more fundamentally free users
	// never touch a server at all (docs/01 §1.0) — so this is the tier
	// boundary itself, not a soft upsell.
	ErrPremiumRequired = errors.New("graph: sync requires a premium subscription")
)

// caller resolves the verified Firebase identity to an account, creating one
// on first sign-in.
func (r *Resolver) caller(ctx context.Context) (*user.User, error) {
	identity, ok := middleware.IdentityFromContext(ctx)
	if !ok {
		return nil, ErrUnauthenticated
	}
	return r.Users.GetOrCreateByFirebaseUID(ctx, identity.UID, identity.Email, "")
}

// premiumCaller is `caller` plus the entitlement check every sync field runs.
// Plan comes from user.User.Plan() rather than being re-derived here — one
// definition of "is this account paid", used everywhere.
func (r *Resolver) premiumCaller(ctx context.Context) (*user.User, error) {
	u, err := r.caller(ctx)
	if err != nil {
		return nil, err
	}
	if u.Plan() != user.PlanPremium {
		return nil, ErrPremiumRequired
	}
	return u, nil
}

// noteToModel serializes a note back onto the wire. Content goes across as
// one JSON string for the same reason it is stored as one sealed blob: it is
// the seam an E2E client would put ciphertext into.
func noteToModel(v note.View) (model.Note, error) {
	content, err := json.Marshal(v.Content)
	if err != nil {
		return model.Note{}, fmt.Errorf("graph: marshal note content: %w", err)
	}

	out := model.Note{
		ClientID:    v.ClientID,
		Content:     string(content),
		Pinned:      v.Pinned,
		Archived:    v.Archived,
		Labels:      v.Labels,
		CompletedAt: v.CompletedAt,
		CreatedAt:   v.CreatedAt,
		UpdatedAt:   v.UpdatedAt,
		DeletedAt:   v.DeletedAt,
		Rev:         v.Rev,
	}
	if out.Labels == nil {
		// The schema declares [String!]! — a null here is a client-side
		// decode error, not an empty list.
		out.Labels = []string{}
	}
	if v.Kind != "" {
		out.Kind = &v.Kind
	}
	if v.Color != "" {
		out.Color = &v.Color
	}
	if v.Reminder != "" {
		out.Reminder = &v.Reminder
	}
	return out, nil
}

func mutationFromModel(in model.NoteMutationInput) note.Mutation {
	m := note.Mutation{
		Seq:           in.Seq,
		ClientID:      in.ClientID,
		BaseRev:       in.BaseRev,
		ChangedFields: in.ChangedFields,
		Deleted:       deref(in.Deleted),
		Purged:        deref(in.Purged),
		Content:       deref(in.Content),
		Kind:          deref(in.Kind),
		Color:         deref(in.Color),
		Pinned:        deref(in.Pinned),
		Archived:      deref(in.Archived),
		Labels:        in.Labels,
		Reminder:      deref(in.Reminder),
		CompletedAt:   in.CompletedAt,
	}
	if in.CreatedAt != nil {
		m.CreatedAt = *in.CreatedAt
	}
	return m
}

func resultToModel(res note.Result) (model.NoteResult, error) {
	out := model.NoteResult{
		Seq:    res.Seq,
		Status: model.MutationStatus(res.Status),
	}
	if res.Reason != "" {
		out.Reason = &res.Reason
	}
	if res.Note != nil {
		n, err := noteToModel(*res.Note)
		if err != nil {
			return model.NoteResult{}, err
		}
		out.Note = &n
	}
	return out, nil
}

func deref[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}
