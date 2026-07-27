package graph

// THIS CODE WILL BE UPDATED WITH SCHEMA CHANGES. PREVIOUS IMPLEMENTATION FOR SCHEMA CHANGES WILL BE KEPT IN THE COMMENT SECTION. IMPLEMENTATION FOR UNCHANGED SCHEMA WILL BE KEPT.

import (
	"context"
	"errors"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph/generated"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph/model"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/middleware"
)

// Resolver wires GraphQL fields to feature services; it holds no business
// logic of its own.
type Resolver struct {
	Users *user.Service
}

// ErrUnauthenticated is returned by fields that require a verified Firebase
// Bearer token when the request didn't carry one.
var ErrUnauthenticated = errors.New("graph: no valid Authorization Bearer token")

// Me is the resolver for the me field.
func (r *queryResolver) Me(ctx context.Context) (*model.User, error) {
	identity, ok := middleware.IdentityFromContext(ctx)
	if !ok {
		return nil, ErrUnauthenticated
	}

	u, err := r.Users.GetOrCreateByFirebaseUID(ctx, identity.UID, identity.Email, "")
	if err != nil {
		return nil, err
	}

	plan := model.PlanFree
	if u.Plan() == user.PlanPremium {
		plan = model.PlanPremium
	}

	out := &model.User{
		ID:    u.ID.Hex(),
		Email: u.Email,
		Plan:  plan,
	}
	if u.DisplayName != "" {
		out.DisplayName = &u.DisplayName
	}
	return out, nil
}

// Query returns generated.QueryResolver implementation.
func (r *Resolver) Query() generated.QueryResolver { return &queryResolver{r} }

type queryResolver struct{ *Resolver }
