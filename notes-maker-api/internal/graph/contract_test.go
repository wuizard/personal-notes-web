package graph_test

// Validates the queries notes-maker-web actually sends against this schema.
//
// The Go module lives in this repository for exactly one reason: so a change
// to the API contract and the clients that consume it land in the same commit
// (docs/01 → Repository layout). Nothing enforced that. A field renamed here,
// or a typo in the client's query, compiles and type-checks on both sides and
// fails only at runtime against a real server — which, since sync is
// premium-only, means it fails first for a paying customer.
//
// Reading the client's source is deliberate. A copy of the queries kept here
// would drift, and a drifted copy of a contract test is worse than none.

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
)

const clientAPIPath = "../../../notes-maker-web/src/features/sync/api.ts"

// Matches `const NAME = ` followed by a backtick-delimited template literal.
var constTemplate = regexp.MustCompile("(?s)const\\s+(\\w+)\\s*=\\s*`([^`]*)`")

func loadSchema(t *testing.T) *ast.Schema {
	t.Helper()

	sdl, err := os.ReadFile("schema.graphql")
	if err != nil {
		t.Fatalf("read schema: %v", err)
	}
	schema, gqlErr := gqlparser.LoadSchema(&ast.Source{Name: "schema.graphql", Input: string(sdl)})
	if gqlErr != nil {
		t.Fatalf("load schema: %v", gqlErr)
	}
	return schema
}

// clientDocuments returns every GraphQL document the client defines, with
// fragment-style interpolations of other constants resolved.
func clientDocuments(t *testing.T) map[string]string {
	t.Helper()

	source, err := os.ReadFile(filepath.Clean(clientAPIPath))
	if err != nil {
		t.Fatalf("read %s: %v — if the client moved, update clientAPIPath rather than deleting this test", clientAPIPath, err)
	}

	literals := map[string]string{}
	for _, match := range constTemplate.FindAllStringSubmatch(string(source), -1) {
		literals[match[1]] = match[2]
	}
	if len(literals) == 0 {
		t.Fatalf("no template literals found in %s — the extraction below needs updating", clientAPIPath)
	}

	// Resolve ${OTHER} references. One pass is enough for the current shape
	// (documents embed a field list, and the field list embeds nothing).
	documents := map[string]string{}
	for name, body := range literals {
		resolved := body
		for other, value := range literals {
			resolved = strings.ReplaceAll(resolved, "${"+other+"}", value)
		}
		if strings.Contains(resolved, "${") {
			t.Fatalf("%s still has an unresolved interpolation after one pass: %s", name, resolved)
		}
		// Field-list fragments are not documents on their own.
		if strings.Contains(resolved, "query ") || strings.Contains(resolved, "mutation ") {
			documents[name] = resolved
		}
	}
	return documents
}

func TestClientQueriesValidateAgainstTheSchema(t *testing.T) {
	schema := loadSchema(t)
	documents := clientDocuments(t)

	if len(documents) < 2 {
		t.Fatalf("expected the client's pull and push documents, found %d: %v", len(documents), keysOf(documents))
	}

	for name, document := range documents {
		t.Run(name, func(t *testing.T) {
			if _, errs := gqlparser.LoadQuery(schema, document); len(errs) > 0 {
				t.Errorf("the client's %s document does not match this schema:\n%v\n\n%s", name, errs, document)
			}
		})
	}
}

// The client asks for every field it stores. A field added to the schema and
// forgotten on the client syncs as its zero value — silently, and only for
// the accounts that have it set.
func TestClientRequestsEveryNoteField(t *testing.T) {
	schema := loadSchema(t)
	documents := clientDocuments(t)

	noteType, ok := schema.Types["Note"]
	if !ok {
		t.Fatal("schema has no Note type")
	}

	combined := strings.Join(valuesOf(documents), "\n")
	for _, field := range noteType.Fields {
		if strings.HasPrefix(field.Name, "__") {
			continue
		}
		if !regexp.MustCompile(`\b` + regexp.QuoteMeta(field.Name) + `\b`).MatchString(combined) {
			t.Errorf("Note.%s is in the schema but the client never asks for it", field.Name)
		}
	}
}

func keysOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func valuesOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	return out
}
