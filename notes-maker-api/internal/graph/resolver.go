package graph

// THIS CODE WILL BE UPDATED WITH SCHEMA CHANGES. PREVIOUS IMPLEMENTATION FOR SCHEMA CHANGES WILL BE KEPT IN THE COMMENT SECTION. IMPLEMENTATION FOR UNCHANGED SCHEMA WILL BE KEPT.

import (
	"context"

	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/note"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph/generated"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/graph/model"
)

// PushNotes is the resolver for the pushNotes field.
func (r *mutationResolver) PushNotes(ctx context.Context, mutations []model.NoteMutationInput) ([]model.NoteResult, error) {
	u, err := r.premiumCaller(ctx)
	if err != nil {
		return nil, err
	}

	batch := make([]note.Mutation, 0, len(mutations))
	for _, m := range mutations {
		batch = append(batch, mutationFromModel(m))
	}

	results, err := r.NoteSync.Push(ctx, u.ID, batch)
	if err != nil {
		return nil, err
	}

	out := make([]model.NoteResult, 0, len(results))
	for _, res := range results {
		mapped, err := resultToModel(res)
		if err != nil {
			return nil, err
		}
		out = append(out, mapped)
	}
	return out, nil
}

// Me is the resolver for the me field.
func (r *queryResolver) Me(ctx context.Context) (*model.User, error) {
	u, err := r.caller(ctx)
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

// Notes is the resolver for the notes field.
func (r *queryResolver) Notes(ctx context.Context, cursor *string, limit *int) (*model.NotePage, error) {
	u, err := r.premiumCaller(ctx)
	if err != nil {
		return nil, err
	}

	page, err := r.NoteSync.List(ctx, u.ID, deref(cursor), deref(limit))
	if err != nil {
		return nil, err
	}

	out := &model.NotePage{
		Notes:      make([]model.Note, 0, len(page.Notes)),
		Cursor:     page.Cursor,
		HasMore:    page.HasMore,
		ServerTime: page.ServerTime,
	}
	for _, v := range page.Notes {
		n, err := noteToModel(v)
		if err != nil {
			return nil, err
		}
		out.Notes = append(out.Notes, n)
	}
	return out, nil
}

// Mutation returns generated.MutationResolver implementation.
func (r *Resolver) Mutation() generated.MutationResolver { return &mutationResolver{r} }

// Query returns generated.QueryResolver implementation.
func (r *Resolver) Query() generated.QueryResolver { return &queryResolver{r} }

type (
	mutationResolver struct{ *Resolver }
	queryResolver    struct{ *Resolver }
)
