package test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func postCharacter(t *testing.T, actor uuid.UUID, name string) string {
	t.Helper()
	status, made := call(t, actor, http.MethodPost, "/api/character", `{"character":{"info":{"name":"`+name+`"}},"metadata":{"name":"`+name+`","level":1}}`, nil, handler.PostCharacter)
	if status != http.StatusCreated {
		t.Fatalf("PostCharacter: %d %+v", status, made.Error)
	}
	return id(t, made)
}

func postCampaignCharacter(t *testing.T, actor uuid.UUID, campaignID, characterID string) {
	t.Helper()
	if status, answer := call(t, actor, http.MethodPost, "/", "", map[string]string{"id": campaignID, "character_id": characterID}, handler.PostCampaignCharacter); status != http.StatusOK {
		t.Fatalf("PostCampaignCharacter: %d %+v", status, answer.Error)
	}
}

func TestOnlyTheDungeonMasterClosesACampaign(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteCampaign); status != http.StatusForbidden {
		t.Fatalf("a player closed the campaign: %d", status)
	}
	if status, answer := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteCampaign); status != http.StatusOK {
		t.Fatalf("the dungeon master could not close their campaign: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetCampaign); status == http.StatusOK {
		t.Fatalf("a closed campaign is still read")
	}
	_, mine := call(t, dungeonMaster, http.MethodGet, "/api/campaign", "", nil, handler.GetCampaigns)
	if listed(t, mine, campaignID) {
		t.Fatalf("a closed campaign is still listed")
	}
}

func TestTheTableReadsTheSheetsSeatedAtIt(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	characterID := postCharacter(t, dungeonMaster, "Brann")
	postCampaignCharacter(t, dungeonMaster, campaignID, characterID)

	if status, _ := call(t, uuid.New(), http.MethodGet, "/", "", params, handler.GetCampaignCharacters); status == http.StatusOK {
		t.Fatalf("a stranger listed the table's sheets")
	}
	status, seen := call(t, player, http.MethodGet, "/", "", params, handler.GetCampaignCharacters)
	if status != http.StatusOK || !listed(t, seen, characterID) {
		t.Fatalf("a seated player misses a sheet at the table: %d", status)
	}
	leave := map[string]string{"id": campaignID, "character_id": characterID}
	if status, _ := call(t, player, http.MethodDelete, "/", "", leave, handler.DeleteCampaignCharacter); status != http.StatusForbidden {
		t.Fatalf("a player removed another's sheet from the table: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", leave, handler.DeleteCampaignCharacter); status != http.StatusOK {
		t.Fatalf("the owner could not take their sheet from the table: %d", status)
	}
	_, after := call(t, player, http.MethodGet, "/", "", params, handler.GetCampaignCharacters)
	if listed(t, after, characterID) {
		t.Fatalf("a sheet that left the table is still listed")
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", map[string]string{"id": characterID}, handler.GetCharacter); status == http.StatusOK {
		t.Fatalf("a player still reads a sheet that left the table")
	}
}

func TestOnlyTheDungeonMasterTearsUpAMap(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	_, made := call(t, dungeonMaster, http.MethodPost, "/", `{"title":"The vale","is_visible":true}`, params, handler.PostMap)
	mapID := id(t, made)
	status, child := call(t, dungeonMaster, http.MethodPost, "/", `{"title":"The keep","parent_map_id":"`+mapID+`"}`, params, handler.PostMap)
	if status != http.StatusCreated {
		t.Fatalf("PostMap child: %d %+v", status, child.Error)
	}
	childID := id(t, child)
	mapParams := map[string]string{"id": campaignID, "map_id": mapID}
	if status, _ := call(t, player, http.MethodDelete, "/", "", mapParams, handler.DeleteMap); status != http.StatusForbidden {
		t.Fatalf("a player tore up a map: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", mapParams, handler.DeleteMap); status != http.StatusOK {
		t.Fatalf("the dungeon master could not tear up a map: %d", status)
	}
	_, left := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetMaps)
	if listed(t, left, mapID) || listed(t, left, childID) {
		t.Fatalf("a torn up map or its child is still listed")
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", mapParams, handler.DeleteMap); status == http.StatusOK {
		t.Fatalf("a torn up map was torn up again")
	}
}

func TestAnEncounterReachesTheTableOnlyWhenShared(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	if status, _ := call(t, uuid.New(), http.MethodPost, "/", `{"title":"Ambush"}`, params, handler.PostEncounter); status == http.StatusCreated {
		t.Fatalf("a stranger opened an encounter at the table")
	}
	status, made := call(t, dungeonMaster, http.MethodPost, "/", `{"title":"Ambush","round":2,"combatants":[{"id":"g1","name":"Goblin"}]}`, params, handler.PostEncounter)
	if status != http.StatusCreated {
		t.Fatalf("PostEncounter: %d %+v", status, made.Error)
	}
	encounterID := id(t, made)
	encounterParams := map[string]string{"id": campaignID, "encounter_id": encounterID}
	if status, _ := call(t, uuid.New(), http.MethodGet, "/", "", params, handler.GetEncounters); status == http.StatusOK {
		t.Fatalf("a stranger listed the table's encounters")
	}
	_, hidden := call(t, player, http.MethodGet, "/", "", params, handler.GetEncounters)
	if listed(t, hidden, encounterID) {
		t.Fatalf("a player read an encounter the dungeon master kept to themself")
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"share_campaigns":["`+campaignID+`"],"round":3}`, encounterParams, handler.PutEncounter); status != http.StatusOK {
		t.Fatalf("PutEncounter share: %d %+v", status, answer.Error)
	}
	_, shared := call(t, player, http.MethodGet, "/", "", params, handler.GetEncounters)
	if !listed(t, shared, encounterID) {
		t.Fatalf("a seated player misses an encounter shared with the table")
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"round":9}`, encounterParams, handler.PutEncounter); status != http.StatusForbidden {
		t.Fatalf("a player changed the dungeon master's encounter: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", encounterParams, handler.DeleteEncounter); status != http.StatusForbidden {
		t.Fatalf("a player struck the dungeon master's encounter: %d", status)
	}
	status, own := call(t, player, http.MethodPost, "/", `{"title":"Pip's skirmish"}`, params, handler.PostEncounter)
	if status != http.StatusCreated {
		t.Fatalf("a seated player could not open an encounter: %d %+v", status, own.Error)
	}
	ownParams := map[string]string{"id": campaignID, "encounter_id": id(t, own)}
	if status, _ := call(t, player, http.MethodPut, "/", `{"turn":2}`, ownParams, handler.PutEncounter); status != http.StatusOK {
		t.Fatalf("a player could not change their own encounter: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", encounterParams, handler.DeleteEncounter); status != http.StatusOK {
		t.Fatalf("the dungeon master could not strike their encounter: %d", status)
	}
	_, after := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetEncounters)
	if listed(t, after, encounterID) {
		t.Fatalf("a struck encounter is still listed")
	}
}

func TestASongReachesTheTableOnlyWhenShared(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	if status, _ := call(t, uuid.New(), http.MethodPost, "/", `{"title":"Dirge"}`, params, handler.PostSong); status == http.StatusCreated {
		t.Fatalf("a stranger added a song to the table")
	}
	status, made := call(t, dungeonMaster, http.MethodPost, "/", `{"title":"Dirge","address":"https://example.test/dirge.ogg","duration":120}`, params, handler.PostSong)
	if status != http.StatusCreated {
		t.Fatalf("PostSong: %d %+v", status, made.Error)
	}
	songID := id(t, made)
	songParams := map[string]string{"id": campaignID, "song_id": songID}
	if status, _ := call(t, uuid.New(), http.MethodGet, "/", "", params, handler.GetSongs); status == http.StatusOK {
		t.Fatalf("a stranger listed the table's songs")
	}
	_, hidden := call(t, player, http.MethodGet, "/", "", params, handler.GetSongs)
	if listed(t, hidden, songID) {
		t.Fatalf("a player read a song the dungeon master kept to themself")
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"share_campaigns":["`+campaignID+`"]}`, songParams, handler.PutSong); status != http.StatusOK {
		t.Fatalf("PutSong share: %d %+v", status, answer.Error)
	}
	_, shared := call(t, player, http.MethodGet, "/", "", params, handler.GetSongs)
	if !listed(t, shared, songID) {
		t.Fatalf("a seated player misses a song shared with the table")
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"title":"Mine"}`, songParams, handler.PutSong); status != http.StatusForbidden {
		t.Fatalf("a player changed the dungeon master's song: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", songParams, handler.DeleteSong); status != http.StatusForbidden {
		t.Fatalf("a player removed the dungeon master's song: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", songParams, handler.DeleteSong); status != http.StatusOK {
		t.Fatalf("the dungeon master could not remove their song: %d", status)
	}
	_, after := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetSongs)
	if listed(t, after, songID) {
		t.Fatalf("a removed song is still listed")
	}
}

func TestOnlyTheAuthorEditsAChatEntry(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	status, own := call(t, player, http.MethodPost, "/", `{"author_name":"Pip","kind":"message","body":"Hello"}`, params, handler.PostChatEntry)
	if status != http.StatusCreated {
		t.Fatalf("PostChatEntry: %d %+v", status, own.Error)
	}
	entryParams := map[string]string{"id": campaignID, "entry_id": id(t, own)}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"body":"Rewritten"}`, entryParams, handler.PutChatEntry); status != http.StatusForbidden {
		t.Fatalf("the dungeon master edited a player's entry: %d", status)
	}
	status, edited := call(t, player, http.MethodPut, "/", `{"body":"Hello again"}`, entryParams, handler.PutChatEntry)
	if status != http.StatusOK {
		t.Fatalf("the author could not edit their entry: %d %+v", status, edited.Error)
	}
	var entry struct {
		Body string `json:"body"`
	}
	if err := json.Unmarshal(edited.Data, &entry); err != nil || entry.Body != "Hello again" {
		t.Fatalf("the edit did not land: %s", string(edited.Data))
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"body":"Gone"}`, map[string]string{"id": campaignID, "entry_id": uuid.NewString()}, handler.PutChatEntry); status != http.StatusNotFound {
		t.Fatalf("an unknown entry was edited: %d", status)
	}
}
