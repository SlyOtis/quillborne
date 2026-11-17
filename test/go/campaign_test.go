package test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"testing"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
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

func TestARequestWhoseClientLeftIsNeverAnsweredAsARefusal(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	if status, answer := call(t, player, http.MethodGet, "/", "", params, handler.GetSongs); status != http.StatusOK {
		t.Fatalf("a seated player could not list the table's songs: %d %+v", status, answer.Error)
	}
	status, _ := call(t, player, http.MethodGet, "/", "", params, func(ctx echo.Context) error {
		left, cancel := context.WithCancel(ctx.Request().Context())
		cancel()
		ctx.SetRequest(ctx.Request().WithContext(left))
		return handler.GetSongs(ctx)
	})
	if status == http.StatusForbidden || status == http.StatusNotFound {
		t.Fatalf("a request whose client left was answered as a refusal: %d", status)
	}
}

func TestACreateWhoseClientLeftIsNeverAnsweredAsARefusal(t *testing.T) {
	requireStack(t)
	body := `{"system":"dnd5e","name":"Gloomstalker"}`
	if status, answer := call(t, dungeonMaster, http.MethodPost, "/api/monster", body, nil, handler.PostMonster); status != http.StatusCreated {
		t.Fatalf("PostMonster: %d %+v", status, answer.Error)
	}
	status, _ := call(t, dungeonMaster, http.MethodPost, "/api/monster", body, nil, func(ctx echo.Context) error {
		left, cancel := context.WithCancel(ctx.Request().Context())
		cancel()
		ctx.SetRequest(ctx.Request().WithContext(left))
		return handler.PostMonster(ctx)
	})
	if status == http.StatusForbidden || status == http.StatusNotFound {
		t.Fatalf("a create whose client left was answered as a refusal: %d", status)
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

func TestACampaignIsAnOrganizationThatOwnsItsRows(t *testing.T) {
	requireStack(t)
	ctx := context.Background()
	home := uuid.MustParse(os.Getenv("SERVER_OWNER_ID"))
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	campaign := db.Campaign{ID: uuid.MustParse(campaignID)}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(ctx); err != nil {
		t.Fatalf("campaign: %v", err)
	}
	organization, err := sdb.Instance().GetOrganization(ctx, campaign.ID)
	if err != nil {
		t.Fatalf("the campaign has no organization: %v", err)
	}
	var view struct {
		DmID      string   `json:"dm_id"`
		Name      string   `json:"name"`
		IsActive  bool     `json:"is_active"`
		PlayerIDs []string `json:"player_ids"`
		Settings  struct {
			ExperienceMode string `json:"experience_mode"`
		} `json:"settings"`
	}
	_, read := call(t, player, http.MethodGet, "/", "", params, handler.GetCampaign)
	if err := json.Unmarshal(read.Data, &view); err != nil {
		t.Fatalf("GetCampaign: %v", err)
	}
	if campaign.OwnerID != campaign.ID || organization.OwnerID != home || organization.Kind == nil || *organization.Kind != "campaign" || organization.Name != view.Name {
		t.Fatalf("the organization is not the campaign under the home organization: %+v", organization)
	}
	if view.DmID != dungeonMaster.String() || len(view.PlayerIDs) != 1 || view.PlayerIDs[0] != player.String() || !view.IsActive {
		t.Fatalf("the claims do not name the dungeon master and the players: %+v", view)
	}
	bindings, err := sdb.Instance().GetBindings(ctx, sdb.BindingFilters{ObjectType: sdb.OBJECT_TYPE_ORGANIZATION, ObjectIDs: []uuid.UUID{organization.ID}})
	if err != nil {
		t.Fatalf("bindings: %v", err)
	}
	owners, seats := 0, 0
	for _, binding := range bindings {
		if binding.DeletedAt != nil || binding.EffectiveAccess == nil || *binding.EffectiveAccess&sdb.ACCESS_MEMBER == 0 {
			continue
		}
		if *binding.EffectiveAccess&sdb.ACCESS_OWNER != 0 {
			owners++
		} else {
			seats++
		}
	}
	if owners != 1 || seats != 1 {
		t.Fatalf("the organization binds %d owner claims and %d member claims", owners, seats)
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"is_active":false,"settings":{"experience_mode":"milestone"}}`, params, handler.PutCampaign); status != http.StatusOK {
		t.Fatalf("PutCampaign settings: %d %+v", status, answer.Error)
	}
	_, read = call(t, player, http.MethodGet, "/", "", params, handler.GetCampaign)
	if err := json.Unmarshal(read.Data, &view); err != nil || view.IsActive || view.Settings.ExperienceMode != "milestone" {
		t.Fatalf("the campaign row did not keep its settings: %+v %v", view, err)
	}
	if _, err := sdb.Instance().MutationAccess(ctx, dungeonMaster, organization.ID, sdb.OBJECT_TYPE_ORGANIZATION, sdb.ACCESS_OWNER); err != nil {
		t.Fatalf("the dungeon master does not hold the organization: %v", err)
	}
	if _, err := sdb.Instance().MutationAccess(ctx, player, organization.ID, sdb.OBJECT_TYPE_ORGANIZATION, sdb.ACCESS_EXECUTE); err != nil {
		t.Fatalf("a seated player does not reach the organization: %v", err)
	}
	if _, err := sdb.Instance().MutationAccess(ctx, player, organization.ID, sdb.OBJECT_TYPE_ORGANIZATION, sdb.ACCESS_WRITE); err == nil {
		t.Fatalf("a seated player writes the organization")
	}

	status, made := call(t, dungeonMaster, http.MethodPost, "/", `{"title":"The vale"}`, params, handler.PostMap)
	if status != http.StatusCreated {
		t.Fatalf("PostMap: %d %+v", status, made.Error)
	}
	mapID := id(t, made)
	pageID := postResource(t, player, `{"kind":"entries","name":"Table note","body":"{}","owner_id":"`+campaignID+`"}`)
	ownID := postResource(t, player, `{"kind":"entries","name":"Own note","body":"{}"}`)
	sheetID := postCharacter(t, player, "Joiner")
	postCampaignCharacter(t, player, campaignID, sheetID)
	owner := func(table, rowID string) uuid.UUID {
		t.Helper()
		var ownerID uuid.UUID
		if err := db.Instance().NewRaw("SELECT sa_owner_id FROM ? WHERE id = ?", bun.Ident(table), rowID).Scan(ctx, &ownerID); err != nil {
			t.Fatalf("%s %s: %v", table, rowID, err)
		}
		return ownerID
	}
	for table, rowID := range map[string]string{"campaign": campaignID, "campaign_map": mapID, "resource": pageID, "character": sheetID} {
		if owner(table, rowID) != organization.ID {
			t.Fatalf("the %s row is not owned by the campaign's organization", table)
		}
	}
	var folderOwner uuid.UUID
	if err := db.Instance().NewRaw("SELECT sa_owner_id FROM asset WHERE slug = ?", "campaign-"+campaignID).Scan(ctx, &folderOwner); err != nil || folderOwner != organization.ID {
		t.Fatalf("the campaign folder is not owned by the campaign's organization: %v", err)
	}
	if owner("resource", ownID) != home {
		t.Fatalf("a player's own page left the home organization")
	}
	keptID := postResource(t, player, `{"kind":"items","name":"Kept blade","body":"{}","owner_id":"`+campaignID+`"}`)
	if owner("resource", keptID) != organization.ID {
		t.Fatalf("a kept item is not owned by the campaign's organization")
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", map[string]string{"id": keptID}, handler.GetResource); status == http.StatusOK {
		t.Fatalf("the owner claim opened an item its maker kept from the table")
	}
	if status, answer := call(t, player, http.MethodDelete, "/", "", map[string]string{"id": campaignID, "character_id": sheetID}, handler.DeleteCampaignCharacter); status != http.StatusOK {
		t.Fatalf("DeleteCampaignCharacter: %d %+v", status, answer.Error)
	}
	if owner("character", sheetID) != home {
		t.Fatalf("a sheet that left the table stayed in its organization")
	}

	if status, _ := call(t, player, http.MethodPut, "/", `{"name":"Renamed by a player"}`, params, handler.PutCampaign); status != http.StatusForbidden {
		t.Fatalf("a player renamed the campaign: %d", status)
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"Renamed table"}`, params, handler.PutCampaign); status != http.StatusOK {
		t.Fatalf("PutCampaign: %d %+v", status, answer.Error)
	}
	if organization, err = sdb.Instance().GetOrganization(ctx, campaign.ID); err != nil || organization.Name != "Renamed table" {
		t.Fatalf("the organization did not take the campaign's name: %v", err)
	}
	if status, answer := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteCampaign); status != http.StatusOK {
		t.Fatalf("DeleteCampaign: %d %+v", status, answer.Error)
	}
	if organization, err = sdb.Instance().GetOrganization(ctx, campaign.ID); err == nil && organization.DeletedAt == nil {
		t.Fatalf("a closed campaign left its organization live")
	}
}
