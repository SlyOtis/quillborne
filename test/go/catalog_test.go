package test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func TestACatalogEntryIsReadByEveryMemberAndWrittenByItsAuthor(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	slug := "test-" + uuid.NewString()[:8]
	params := map[string]string{"kind": "classes", "slug": slug}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"Tester"}`, map[string]string{"kind": "spells", "slug": slug}, handler.PutCatalogEntry); status != http.StatusBadRequest {
		t.Fatalf("an unknown catalog kind was written: %d", status)
	}
	status, made := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"Tester","description":"A class for tests","digest":"d1","hit_die":8}`, params, handler.PutCatalogEntry)
	if status != http.StatusCreated {
		t.Fatalf("PutCatalogEntry: %d %+v", status, made.Error)
	}
	status, read := call(t, player, http.MethodGet, "/", "", params, handler.GetCatalogEntry)
	if status != http.StatusOK || getField(t, read, "hit_die") != float64(8) {
		t.Fatalf("another member could not read the entry: %d %s", status, string(read.Data))
	}
	status, entries := call(t, player, http.MethodGet, "/api/catalog/classes", "", map[string]string{"kind": "classes"}, handler.GetCatalogEntries)
	if status != http.StatusOK || !listed(t, entries, slug) {
		t.Fatalf("the entry is missing from the catalog: %d", status)
	}
	_, byDigest := call(t, player, http.MethodGet, "/api/catalog/classes?digest=d1", "", map[string]string{"kind": "classes"}, handler.GetCatalogEntries)
	if !listed(t, byDigest, slug) {
		t.Fatalf("the entry is missing when filtered by its digest")
	}
	_, otherDigest := call(t, player, http.MethodGet, "/api/catalog/classes?digest=none", "", map[string]string{"kind": "classes"}, handler.GetCatalogEntries)
	if listed(t, otherDigest, slug) {
		t.Fatalf("the entry is listed under another digest")
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", map[string]string{"kind": "spells"}, handler.GetCatalogEntries); status != http.StatusBadRequest {
		t.Fatalf("an unknown catalog kind was listed: %d", status)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"name":"Taken"}`, params, handler.PutCatalogEntry); status != http.StatusForbidden {
		t.Fatalf("another member overwrote the entry: %d", status)
	}
	status, rewritten := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"Tester","digest":"d2","hit_die":10}`, params, handler.PutCatalogEntry)
	if status != http.StatusOK || getField(t, rewritten, "hit_die") != float64(10) {
		t.Fatalf("the author could not rewrite the entry: %d %s", status, string(rewritten.Data))
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", map[string]string{"kind": "classes", "slug": "no-such-" + slug}, handler.GetCatalogEntry); status != http.StatusNotFound {
		t.Fatalf("an unknown entry answered %d", status)
	}
}

func getField(t *testing.T, answer envelope, key string) any {
	t.Helper()
	record := map[string]any{}
	if err := json.Unmarshal(answer.Data, &record); err != nil {
		t.Fatalf("not a record: %s", string(answer.Data))
	}
	return record[key]
}
