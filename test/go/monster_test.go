package test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func postMonster(t *testing.T, body string) string {
	t.Helper()
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/monster", body, nil, handler.PostMonster)
	if status != http.StatusCreated {
		t.Fatalf("PostMonster: %d %+v", status, made.Error)
	}
	return id(t, made)
}

func TestAHomebrewMonsterIsReadByItsCreatorAlone(t *testing.T) {
	requireStack(t)
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/monster", `{"name":"Nameless"}`, nil, handler.PostMonster); status != http.StatusBadRequest {
		t.Fatalf("a monster without a system answered %d, want 400", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/monster", `{"system":"dnd5e","stats":[1]}`, nil, handler.PostMonster); status != http.StatusBadRequest {
		t.Fatalf("a monster whose stats are no object answered %d, want 400", status)
	}
	monsterID := postMonster(t, `{"system":"dnd5e","name":"Gloomling","type":"aberration","challenge":0.25,"stats":{"ac":12}}`)
	params := map[string]string{"id": monsterID}

	status, answer := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetMonster)
	if status != http.StatusOK {
		t.Fatalf("the creator was refused their monster: %d %+v", status, answer.Error)
	}
	var view struct {
		UserID    string         `json:"user_id"`
		IsPublic  bool           `json:"is_public"`
		Challenge float64        `json:"challenge"`
		Stats     map[string]any `json:"stats"`
	}
	if err := json.Unmarshal(answer.Data, &view); err != nil || view.UserID != dungeonMaster.String() || view.IsPublic || view.Challenge != 0.25 || view.Stats["ac"] != float64(12) {
		t.Fatalf("a new monster answered %s", string(answer.Data))
	}
	if _, mine := call(t, dungeonMaster, http.MethodGet, "/api/monster", "", nil, handler.GetMonsters); !listed(t, mine, monsterID) {
		t.Fatalf("the creator's list lacks their homebrew")
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetMonster); status != http.StatusNotFound {
		t.Fatalf("another player read the homebrew: %d", status)
	}
	if _, theirs := call(t, player, http.MethodGet, "/api/monster", "", nil, handler.GetMonsters); listed(t, theirs, monsterID) {
		t.Fatalf("another player's list holds the homebrew")
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"name":"Mine now"}`, params, handler.PutMonster); status != http.StatusForbidden {
		t.Fatalf("another player changed the homebrew: %d", status)
	}
}

func TestAPublicMonsterIsReadByEveryPlayerAndWrittenByItsCreatorAlone(t *testing.T) {
	requireStack(t)
	monsterID := postMonster(t, `{"system":"dnd5e","name":"Ashen Wyrm","type":"dragon","challenge":17,"is_public":true}`)
	params := map[string]string{"id": monsterID}

	if status, answer := call(t, player, http.MethodGet, "/", "", params, handler.GetMonster); status != http.StatusOK {
		t.Fatalf("a player was refused a public monster: %d %+v", status, answer.Error)
	}
	if _, theirs := call(t, player, http.MethodGet, "/api/monster", "", nil, handler.GetMonsters); !listed(t, theirs, monsterID) {
		t.Fatalf("a player's list lacks the public monster")
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"name":"Tame Wyrm"}`, params, handler.PutMonster); status != http.StatusForbidden {
		t.Fatalf("a player changed another's public monster: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteMonster); status != http.StatusForbidden {
		t.Fatalf("a player deleted another's public monster: %d", status)
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"Ashen Wyrm, Elder","is_public":false}`, params, handler.PutMonster); status != http.StatusOK {
		t.Fatalf("the creator could not change their monster: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetMonster); status != http.StatusNotFound {
		t.Fatalf("a player still read the monster once it was made private: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteMonster); status != http.StatusOK {
		t.Fatalf("the creator could not delete their monster: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetMonster); status != http.StatusNotFound {
		t.Fatalf("a deleted monster was still read: %d", status)
	}
}

func TestABestiaryMonsterIsReadByTheTableAndChangedByTheDungeonMasterAlone(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	body := `{"system":"dnd5e","name":"Gloomling","owner_id":"` + campaignID + `"}`
	if status, _ := call(t, uuid.New(), http.MethodPost, "/api/monster", body, nil, handler.PostMonster); status == http.StatusCreated {
		t.Fatalf("a stranger added a monster to the table's bestiary")
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/monster", `{"system":"dnd5e","owner_id":"`+uuid.NewString()+`"}`, nil, handler.PostMonster); status != http.StatusNotFound {
		t.Fatalf("a monster for no campaign answered %d, want 404", status)
	}
	if status, _ := call(t, player, http.MethodPost, "/api/monster", body, nil, handler.PostMonster); status != http.StatusForbidden {
		t.Fatalf("a seated player added a monster to the bestiary: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/monster", `{"system":"dnd5e","is_public":true,"owner_id":"`+campaignID+`"}`, nil, handler.PostMonster); status != http.StatusBadRequest {
		t.Fatalf("a public campaign monster answered %d, want 400", status)
	}
	monsterID := postMonster(t, body)
	params := map[string]string{"id": monsterID}
	target := "/api/monster?owner_id=" + campaignID

	status, answer := call(t, player, http.MethodGet, "/", "", params, handler.GetMonster)
	if status != http.StatusOK {
		t.Fatalf("a seated player was refused the table's monster: %d %+v", status, answer.Error)
	}
	var view struct {
		Name    string `json:"name"`
		OwnerID string `json:"owner_id"`
	}
	if err := json.Unmarshal(answer.Data, &view); err != nil || view.OwnerID != campaignID {
		t.Fatalf("a bestiary monster answered %s", string(answer.Data))
	}
	if _, theirs := call(t, player, http.MethodGet, target, "", nil, handler.GetMonsters); !listed(t, theirs, monsterID) {
		t.Fatalf("the seated player's bestiary lacks the monster")
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"Gloomling, Elder"}`, params, handler.PutMonster); status != http.StatusOK {
		t.Fatalf("the dungeon master could not change the table's monster: %d %+v", status, answer.Error)
	}
	_, answer = call(t, player, http.MethodGet, "/", "", params, handler.GetMonster)
	if err := json.Unmarshal(answer.Data, &view); err != nil || view.Name != "Gloomling, Elder" {
		t.Fatalf("the seated player read %s after the change", string(answer.Data))
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"is_public":true}`, params, handler.PutMonster); status != http.StatusBadRequest {
		t.Fatalf("a campaign monster made public answered %d, want 400", status)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"name":"Mine now"}`, params, handler.PutMonster); status != http.StatusForbidden {
		t.Fatalf("a seated player changed the table's monster: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteMonster); status != http.StatusForbidden {
		t.Fatalf("a seated player deleted the table's monster: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteMonster); status != http.StatusOK {
		t.Fatalf("the dungeon master could not delete the table's monster: %d", status)
	}
	if _, theirs := call(t, player, http.MethodGet, target, "", nil, handler.GetMonsters); listed(t, theirs, monsterID) {
		t.Fatalf("a deleted monster is still in the bestiary")
	}
}

func TestAPlayerWhoIsNotSeatedIsRefusedACampaignsBestiary(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	body := `{"system":"dnd5e","name":"Ashen Wyrm","owner_id":"` + campaignID + `"}`
	monsterID := postMonster(t, body)
	params := map[string]string{"id": monsterID}

	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetMonster); status != http.StatusNotFound {
		t.Fatalf("a player away from the table read its monster: %d", status)
	}
	if _, theirs := call(t, player, http.MethodGet, "/api/monster?owner_id="+campaignID, "", nil, handler.GetMonsters); listed(t, theirs, monsterID) {
		t.Fatalf("a player away from the table listed its bestiary")
	}
	if _, theirs := call(t, player, http.MethodGet, "/api/monster", "", nil, handler.GetMonsters); listed(t, theirs, monsterID) {
		t.Fatalf("a player away from the table holds its monster in their list")
	}
	if status, _ := call(t, player, http.MethodPost, "/api/monster", body, nil, handler.PostMonster); status != http.StatusForbidden {
		t.Fatalf("a player away from the table added to its bestiary: %d", status)
	}
}

func TestACampaignsBestiaryListsOnlyItsOwnMonsters(t *testing.T) {
	requireStack(t)
	first := postCampaign(t)
	second := postCampaign(t)
	homebrewID := postMonster(t, `{"system":"dnd5e","name":"Hearth Imp"}`)
	firstID := postMonster(t, `{"system":"dnd5e","name":"Bog Hag","owner_id":"`+first+`"}`)
	secondID := postMonster(t, `{"system":"dnd5e","name":"Salt Wraith","owner_id":"`+second+`"}`)

	status, bestiary := call(t, dungeonMaster, http.MethodGet, "/api/monster?owner_id="+first, "", nil, handler.GetMonsters)
	if status != http.StatusOK {
		t.Fatalf("GetMonsters owner_id: %d %+v", status, bestiary.Error)
	}
	if !listed(t, bestiary, firstID) || listed(t, bestiary, homebrewID) || listed(t, bestiary, secondID) {
		t.Fatalf("a campaign's bestiary holds more or less than its own monsters")
	}
	if _, every := call(t, dungeonMaster, http.MethodGet, "/api/monster", "", nil, handler.GetMonsters); !listed(t, every, homebrewID) || !listed(t, every, firstID) {
		t.Fatalf("the list without owner_id lacks a monster its reader reaches")
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/api/monster?owner_id=not-a-uuid", "", nil, handler.GetMonsters); status != http.StatusBadRequest {
		t.Fatalf("a malformed owner_id answered %d, want 400", status)
	}
}

func TestAClosedCampaignClosesItsBestiary(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	monsterID := postMonster(t, `{"system":"dnd5e","name":"Cairn Troll","owner_id":"`+campaignID+`"}`)
	if status, answer := call(t, dungeonMaster, http.MethodDelete, "/", "", map[string]string{"id": campaignID}, handler.DeleteCampaign); status != http.StatusOK {
		t.Fatalf("DeleteCampaign: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", map[string]string{"id": monsterID}, handler.GetMonster); status != http.StatusNotFound {
		t.Fatalf("a closed campaign's monster was still read: %d", status)
	}
}
