package test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func TestATagIsReadByEveryMemberAndChangedByItsMaker(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	name := "arc " + uuid.NewString()[:8]
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/tag", `{"name":"  "}`, nil, handler.PostTag); status != http.StatusBadRequest {
		t.Fatalf("a nameless tag was made: %d", status)
	}
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/tag", `{"name":"`+name+`"}`, nil, handler.PostTag)
	if status != http.StatusCreated {
		t.Fatalf("PostTag: %d %+v", status, made.Error)
	}
	tagID := id(t, made)
	params := map[string]string{"id": tagID}
	status, again := call(t, player, http.MethodPost, "/api/tag", `{"name":"`+strings.ToUpper(name)+`"}`, nil, handler.PostTag)
	if status != http.StatusCreated || id(t, again) != tagID {
		t.Fatalf("the same name made a second tag: %d %s", status, string(again.Data))
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetTag); status != http.StatusOK {
		t.Fatalf("another member could not read the tag: %d", status)
	}
	status, found := call(t, player, http.MethodGet, "/api/tag?q="+strings.ReplaceAll(name, " ", "%20"), "", nil, handler.GetTags)
	if status != http.StatusOK || !listed(t, found, tagID) {
		t.Fatalf("the tag is not found by name: %d", status)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"name":"taken"}`, params, handler.PutTag); status != http.StatusForbidden {
		t.Fatalf("another member renamed the tag: %d", status)
	}
	status, renamed := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"`+name+` two"}`, params, handler.PutTag)
	if status != http.StatusOK || !strings.Contains(string(renamed.Data), name+" two") {
		t.Fatalf("the maker could not rename the tag: %d %s", status, string(renamed.Data))
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteTag); status != http.StatusForbidden {
		t.Fatalf("another member removed the tag: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteTag); status != http.StatusOK {
		t.Fatalf("the maker could not remove the tag: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetTag); status != http.StatusNotFound {
		t.Fatalf("a removed tag is still read: %d", status)
	}
}

func TestARowIsTaggedByThoseWhoWriteIt(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	resourceID := postResource(t, dungeonMaster, `{"kind":"entries","title":"Tagged lore","share_users":["`+player.String()+`"]}`)
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/tag", `{"name":"tagged `+uuid.NewString()[:8]+`"}`, nil, handler.PostTag)
	if status != http.StatusCreated {
		t.Fatalf("PostTag: %d %+v", status, made.Error)
	}
	tagID := id(t, made)
	params := map[string]string{"id": tagID}
	body := `{"object_type":"public.resource","object_id":"` + resourceID + `"}`
	if status, _ := call(t, player, http.MethodPost, "/", body, params, handler.PostTagObject); status != http.StatusForbidden {
		t.Fatalf("a reader tagged a page they do not write: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/", `{"object_type":"resource","object_id":"`+resourceID+`"}`, params, handler.PostTagObject); status != http.StatusBadRequest {
		t.Fatalf("an unqualified object type was tagged: %d", status)
	}
	if status, answer := call(t, dungeonMaster, http.MethodPost, "/", body, params, handler.PostTagObject); status != http.StatusCreated {
		t.Fatalf("PostTagObject: %d %+v", status, answer.Error)
	}
	status, tagged := call(t, player, http.MethodGet, "/api/tag?object_type=public.resource&object_id="+resourceID, "", nil, handler.GetTags)
	if status != http.StatusOK || !listed(t, tagged, tagID) {
		t.Fatalf("the tag is not listed on the page: %d", status)
	}
	query := "/?object_type=public.resource&object_id=" + resourceID
	if status, _ := call(t, player, http.MethodDelete, query, "", params, handler.DeleteTagObject); status != http.StatusForbidden {
		t.Fatalf("a reader untagged a page they do not write: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteTagObject); status != http.StatusBadRequest {
		t.Fatalf("an untag without its object answered %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, query, "", params, handler.DeleteTagObject); status != http.StatusOK {
		t.Fatalf("the writer could not untag the page: %d", status)
	}
	_, untagged := call(t, player, http.MethodGet, "/api/tag?object_type=public.resource&object_id="+resourceID, "", nil, handler.GetTags)
	if listed(t, untagged, tagID) {
		t.Fatalf("an untagged page still carries the tag")
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, query, "", params, handler.DeleteTagObject); status != http.StatusNotFound {
		t.Fatalf("an untagged page was untagged again: %d", status)
	}
}

func TestAnAttachmentIsPlacedByThoseWhoWriteTheRow(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	status, stored := postStoredFile(t, dungeonMaster, map[string]string{"name": "banner.png", "mime_type": "image/png"}, "banner")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	resourceID := postResource(t, dungeonMaster, `{"kind":"entries","title":"Bannered lore","share_users":["`+player.String()+`"]}`)
	params := map[string]string{"id": stored.ID}
	body := `{"object_type":"resource","object_id":"` + resourceID + `","properties":{"role":"banner"}}`
	if status, _ := call(t, player, http.MethodPut, "/", body, params, handler.PutObjectAsset); status != http.StatusNotFound {
		t.Fatalf("a member who does not read the asset placed it: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"object_type":"resource"}`, params, handler.PutObjectAsset); status != http.StatusBadRequest {
		t.Fatalf("a placement without its row answered %d", status)
	}
	status, placed := call(t, dungeonMaster, http.MethodPut, "/", body, params, handler.PutObjectAsset)
	if status != http.StatusCreated || getRole(t, placed) != "banner" {
		t.Fatalf("PutObjectAsset: %d %s", status, string(placed.Data))
	}
	status, replaced := call(t, dungeonMaster, http.MethodPut, "/", `{"object_type":"resource","object_id":"`+resourceID+`","properties":{"role":"icon"}}`, params, handler.PutObjectAsset)
	if status != http.StatusOK || getRole(t, replaced) != "icon" {
		t.Fatalf("a second placement did not replace the first: %d %s", status, string(replaced.Data))
	}
	if rec := getData(t, player, http.MethodGet, stored.ID, nil); rec.Code != http.StatusOK {
		t.Fatalf("the page's reader was refused the attached image: %d", rec.Code)
	}
}

func getRole(t *testing.T, answer envelope) any {
	t.Helper()
	var placed struct {
		Properties map[string]any `json:"properties"`
	}
	if err := json.Unmarshal(answer.Data, &placed); err != nil {
		t.Fatalf("not an attachment: %s", string(answer.Data))
	}
	return placed.Properties["role"]
}
