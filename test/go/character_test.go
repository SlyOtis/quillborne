package test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func TestASheetIsListedForOthersOnlyOncePublic(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	characterID := postCharacter(t, dungeonMaster, "Brann")
	params := map[string]string{"id": characterID}
	_, mine := call(t, dungeonMaster, http.MethodGet, "/api/character", "", nil, handler.GetCharacters)
	if !listed(t, mine, characterID) {
		t.Fatalf("the owner's list lacks their sheet")
	}
	_, own := call(t, player, http.MethodGet, "/api/character", "", nil, handler.GetCharacters)
	if listed(t, own, characterID) {
		t.Fatalf("another's sheet is listed as one's own")
	}
	_, theirs := call(t, player, http.MethodGet, "/api/character?user_id="+dungeonMaster.String(), "", nil, handler.GetCharacters)
	if listed(t, theirs, characterID) {
		t.Fatalf("a private sheet is listed for another member")
	}
	if status, _ := call(t, player, http.MethodGet, "/api/character?user_id=not-an-id", "", nil, handler.GetCharacters); status != http.StatusBadRequest {
		t.Fatalf("a bad user_id answered %d", status)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"metadata":{"is_public":true}}`, params, handler.PutCharacter); status == http.StatusOK {
		t.Fatalf("another member made the sheet public")
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"metadata":{"is_public":true}}`, params, handler.PutCharacter); status != http.StatusOK {
		t.Fatalf("the owner could not make the sheet public: %d %+v", status, answer.Error)
	}
	_, public := call(t, player, http.MethodGet, "/api/character?user_id="+dungeonMaster.String(), "", nil, handler.GetCharacters)
	if !listed(t, public, characterID) {
		t.Fatalf("a public sheet is missing from another member's list")
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetCharacter); status != http.StatusOK {
		t.Fatalf("a public sheet was refused to another member: %d", status)
	}
}

func TestOnlyAWriterMarksASheetPlayed(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	characterID := postCharacter(t, dungeonMaster, "Brann")
	postCampaignCharacter(t, dungeonMaster, campaignID, characterID)
	params := map[string]string{"id": characterID}
	if status, _ := call(t, player, http.MethodPut, "/", "", params, handler.PutCharacterPlayed); status != http.StatusForbidden {
		t.Fatalf("a seated player marked another's sheet played: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", "", params, handler.PutCharacterPlayed); status != http.StatusOK {
		t.Fatalf("the owner could not mark their sheet played: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", "", map[string]string{"id": uuid.NewString()}, handler.PutCharacterPlayed); status != http.StatusNotFound {
		t.Fatalf("an unknown sheet was marked played: %d", status)
	}
}

func TestTheSourcesOfASheetAreTheOwnersAlone(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	characterID := postCharacter(t, dungeonMaster, "Brann")
	postCampaignCharacter(t, dungeonMaster, campaignID, characterID)
	params := map[string]string{"id": characterID}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetCharacterSources); status != http.StatusForbidden {
		t.Fatalf("a seated player read the sources of another's sheet: %d", status)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"sources":["stolen"]}`, params, handler.PutCharacterSources); status != http.StatusForbidden {
		t.Fatalf("a seated player changed the sources of another's sheet: %d", status)
	}
	status, put := call(t, dungeonMaster, http.MethodPut, "/", `{"sources":["phb","xge"]}`, params, handler.PutCharacterSources)
	if status != http.StatusOK {
		t.Fatalf("the owner could not set their sources: %d %+v", status, put.Error)
	}
	status, got := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetCharacterSources)
	if status != http.StatusOK || !strings.Contains(string(got.Data), `"xge"`) {
		t.Fatalf("the owner does not read their sources back: %d %s", status, string(got.Data))
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", map[string]string{"id": uuid.NewString()}, handler.GetCharacterSources); status != http.StatusNotFound {
		t.Fatalf("an unknown sheet answered sources: %d", status)
	}
}
