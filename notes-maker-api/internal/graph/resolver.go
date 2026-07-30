package graph

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require
// here.

import (
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/note"
	"github.com/wuizard/personal-notes-web/notes-maker-api/internal/feature/user"
)

// Resolver wires GraphQL fields to feature services; it holds no business
// logic of its own. Resolver methods are generated into schema.resolvers.go;
// the helpers they share are in root.go.
type Resolver struct {
	Users    *user.Service
	NoteSync *note.Service
}
