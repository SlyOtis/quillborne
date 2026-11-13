package test

import (
	"net/http"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func postResource(t *testing.T, actor uuid.UUID, body string) string {
	t.Helper()
	status, made := call(t, actor, http.MethodPost, "/api/resource", body, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, made.Error)
	}
	return id(t, made)
}

func TestAListOfPagesShowsWhatTheReaderMaySee(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/api/resource", "", nil, handler.GetResources); status != http.StatusBadRequest {
		t.Fatalf("a list without a kind answered %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/api/resource?kind=heroes", "", nil, handler.GetResources); status != http.StatusBadRequest {
		t.Fatalf("a list of an unknown kind answered %d", status)
	}
	resourceID := postResource(t, dungeonMaster, `{"kind":"items","title":"Lantern of Hollowmere"}`)
	params := map[string]string{"id": resourceID}
	_, mine := call(t, dungeonMaster, http.MethodGet, "/api/resource?kind=items", "", nil, handler.GetResources)
	if !listed(t, mine, resourceID) {
		t.Fatalf("the owner's list lacks their page")
	}
	_, theirs := call(t, player, http.MethodGet, "/api/resource?kind=items&user_id="+dungeonMaster.String(), "", nil, handler.GetResources)
	if listed(t, theirs, resourceID) {
		t.Fatalf("a private page is listed for another member")
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"share_users":["`+player.String()+`"]}`, params, handler.PutResource); status != http.StatusOK {
		t.Fatalf("PutResource share: %d", status)
	}
	_, shared := call(t, player, http.MethodGet, "/api/resource?kind=items&user_id="+dungeonMaster.String(), "", nil, handler.GetResources)
	if !listed(t, shared, resourceID) {
		t.Fatalf("a shared page is missing from the reader's list")
	}

	campaignID := postCampaign(t)
	tableID := postResource(t, dungeonMaster, `{"kind":"npcs","title":"Old Moss","campaign_id":"`+campaignID+`","share_campaigns":["`+campaignID+`"]}`)
	if status, _ := call(t, player, http.MethodGet, "/api/resource?kind=npcs&campaign_id="+campaignID, "", nil, handler.GetResources); status == http.StatusOK {
		t.Fatalf("a player away from the table listed its pages")
	}
	seatPlayer(t, campaignID)
	status, table := call(t, player, http.MethodGet, "/api/resource?kind=npcs&campaign_id="+campaignID, "", nil, handler.GetResources)
	if status != http.StatusOK || !listed(t, table, tableID) {
		t.Fatalf("a seated player misses a page shared with the table: %d", status)
	}
	if status, _ := call(t, player, http.MethodGet, "/api/resource?kind=npcs&campaign_id=not-an-id", "", nil, handler.GetResources); status != http.StatusBadRequest {
		t.Fatalf("a bad campaign_id answered %d", status)
	}
}

func TestOnlyTheOwnerBurnsAPage(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	resourceID := postResource(t, dungeonMaster, `{"kind":"entries","title":"Burnable","share_users":["`+player.String()+`"]}`)
	params := map[string]string{"id": resourceID}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetResource); status != http.StatusOK {
		t.Fatalf("the reader was refused the page: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteResource); status != http.StatusForbidden {
		t.Fatalf("a reader burned the page: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteResource); status != http.StatusOK {
		t.Fatalf("the owner could not burn their page: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetResource); status == http.StatusOK {
		t.Fatalf("a burned page is still read")
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", map[string]string{"id": uuid.NewString()}, handler.DeleteResource); status != http.StatusNotFound {
		t.Fatalf("an unknown page was burned: %d", status)
	}
}
