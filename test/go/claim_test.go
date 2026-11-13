package test

import (
	"net/http"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func postClaim(t *testing.T, actor uuid.UUID, name string) string {
	t.Helper()
	status, made := call(t, actor, http.MethodPost, "/api/claim", `{"name":"`+name+`","access":4}`, nil, handler.PostClaim)
	if status != http.StatusCreated {
		t.Fatalf("PostClaim: %d %+v", status, made.Error)
	}
	return id(t, made)
}

func TestAClaimIsReadByItsMakerAndNotByAStranger(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	claimID := postClaim(t, player, "Lore readers")
	params := map[string]string{"id": claimID}
	if status, answer := call(t, player, http.MethodGet, "/", "", params, handler.GetClaim); status != http.StatusOK {
		t.Fatalf("the maker could not read their claim: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, uuid.New(), http.MethodGet, "/", "", params, handler.GetClaim); status == http.StatusOK {
		t.Fatalf("a stranger read the claim")
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", map[string]string{"id": uuid.NewString()}, handler.GetClaim); status == http.StatusOK {
		t.Fatalf("an unknown claim was read")
	}
	if status, _ := call(t, player, http.MethodPost, "/api/claim", `{"name":"","access":4}`, nil, handler.PostClaim); status != http.StatusBadRequest {
		t.Fatalf("a nameless claim was made: %d", status)
	}
	if status, _ := call(t, player, http.MethodPost, "/api/claim", `{"name":"Denied","access":0}`, nil, handler.PostClaim); status != http.StatusBadRequest {
		t.Fatalf("a claim without a grant mask was made: %d", status)
	}
}

func TestTheClaimsOnARowAreReadByThoseWhoReadIt(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	params := map[string]string{"type": "campaign", "id": campaignID}
	status, claims := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetObjectClaims)
	if status != http.StatusOK || string(claims.Data) == "[]" || string(claims.Data) == "null" {
		t.Fatalf("the dungeon master does not read the claims on their campaign: %d %s", status, string(claims.Data))
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetObjectClaims); status == http.StatusOK {
		t.Fatalf("a player away from the table read the claims on the campaign")
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", map[string]string{"type": "spell", "id": campaignID}, handler.GetObjectClaims); status != http.StatusBadRequest {
		t.Fatalf("an unknown object type answered %d", status)
	}
	seatPlayer(t, campaignID)
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetObjectClaims); status != http.StatusOK {
		t.Fatalf("a seated player was refused the claims on the campaign: %d", status)
	}
}

func TestAGrantAndABindingAreRevokedByTheClaimsMakerAlone(t *testing.T) {
	requireStack(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	resourceID := postResource(t, player, `{"kind":"entries","title":"Pip's secret"}`)
	resourceParams := map[string]string{"id": resourceID}
	claimID := postClaim(t, player, "Secret readers")
	params := map[string]string{"id": claimID}
	if status, answer := call(t, player, http.MethodPost, "/", `{"object_type":"resource","object_id":"`+resourceID+`"}`, params, handler.PostClaimObject); status != http.StatusCreated {
		t.Fatalf("PostClaimObject: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", resourceParams, handler.GetResource); status == http.StatusOK {
		t.Fatalf("a member without the claim read the page")
	}
	if status, answer := call(t, player, http.MethodPost, "/", `{"user_id":"`+dungeonMaster.String()+`"}`, params, handler.PostClaimUser); status != http.StatusCreated {
		t.Fatalf("PostClaimUser: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", resourceParams, handler.GetResource); status != http.StatusOK {
		t.Fatalf("the claim's holder was refused the page: %d", status)
	}
	grant := map[string]string{"id": claimID, "user_id": dungeonMaster.String()}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", grant, handler.DeleteClaimUser); status == http.StatusOK {
		t.Fatalf("a holder revoked a claim they do not write")
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", grant, handler.DeleteClaimUser); status != http.StatusOK {
		t.Fatalf("the maker could not revoke the grant: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", resourceParams, handler.GetResource); status == http.StatusOK {
		t.Fatalf("a revoked holder still reads the page")
	}
	if status, _ := call(t, player, http.MethodPost, "/", `{"user_id":"`+dungeonMaster.String()+`"}`, params, handler.PostClaimUser); status != http.StatusCreated {
		t.Fatalf("PostClaimUser again: %d", status)
	}
	binding := map[string]string{"id": claimID, "object_id": resourceID}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/?object_type=resource", "", binding, handler.DeleteClaimObject); status == http.StatusOK {
		t.Fatalf("a holder unbound a claim they do not write")
	}
	if status, _ := call(t, player, http.MethodDelete, "/?object_type=spell", "", binding, handler.DeleteClaimObject); status != http.StatusBadRequest {
		t.Fatalf("an unknown object type was unbound: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/?object_type=resource", "", binding, handler.DeleteClaimObject); status != http.StatusOK {
		t.Fatalf("the maker could not unbind the claim: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", resourceParams, handler.GetResource); status == http.StatusOK {
		t.Fatalf("a holder still reads a page the claim no longer binds")
	}
}
