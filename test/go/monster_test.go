package test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
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
		OwnerID   string         `json:"owner_id"`
		IsPublic  bool           `json:"is_public"`
		Challenge float64        `json:"challenge"`
		Stats     map[string]any `json:"stats"`
	}
	if err := json.Unmarshal(answer.Data, &view); err != nil || view.OwnerID != dungeonMaster.String() || view.IsPublic || view.Challenge != 0.25 || view.Stats["ac"] != float64(12) {
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
