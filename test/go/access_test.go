package test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
)

var (
	dungeonMaster = uuid.MustParse("1d0c0000-0000-4000-8000-000000000001")
	player        = uuid.MustParse("1d0c0000-0000-4000-8000-000000000002")
	reachable     bool
)

type envelope struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func TestMain(m *testing.M) {
	if os.Getenv("PGHOST") != "" && os.Getenv("SAUTH_DEBUG_USER_ID") != "" {
		e := echo.New()
		if err := db.Init(e.Logger); err == nil {
			if _, err := sdb.Init(e.Logger); err == nil {
				reachable = db.Instance().Ping() == nil
			}
		}
	}
	os.Exit(m.Run())
}

func requireStack(t *testing.T) {
	t.Helper()
	if !reachable {
		t.Skip("no local debug database, run just dev-db first")
	}
}

func call(t *testing.T, actor uuid.UUID, method, target, body string, params map[string]string, run echo.HandlerFunc) (int, envelope) {
	t.Helper()
	e := echo.New()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	ctx := e.NewContext(req, rec)
	names := make([]string, 0, len(params))
	values := make([]string, 0, len(params))
	for name, value := range params {
		names = append(names, name)
		values = append(values, value)
	}
	ctx.SetParamNames(names...)
	ctx.SetParamValues(values...)
	ctx.Set("user_id", actor)
	if err := run(ctx); err != nil {
		t.Fatalf("%s %s: %v", method, target, err)
	}
	var answer envelope
	_ = json.Unmarshal(rec.Body.Bytes(), &answer)
	return rec.Code, answer
}

func id(t *testing.T, answer envelope) string {
	t.Helper()
	var one struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(answer.Data, &one); err != nil || one.ID == "" {
		t.Fatalf("no id in %s", string(answer.Data))
	}
	return one.ID
}

func ensureProfile(t *testing.T, actor uuid.UUID, email string) {
	t.Helper()
	status, _ := call(t, actor, http.MethodGet, "/api/profile", "", nil, handler.GetProfile)
	if status == http.StatusOK {
		return
	}
	status, answer := call(t, actor, http.MethodPost, "/api/profile", `{"email":"`+email+`","display_name":"`+email+`"}`, nil, handler.PostProfile)
	if status != http.StatusCreated {
		t.Fatalf("PostProfile: %d %s", status, string(answer.Data))
	}
}

func postCampaign(t *testing.T) string {
	t.Helper()
	status, answer := call(t, dungeonMaster, http.MethodPost, "/api/campaign", `{"name":"Test table `+uuid.NewString()[:8]+`"}`, nil, handler.PostCampaign)
	if status != http.StatusCreated {
		t.Fatalf("PostCampaign: %d %+v", status, answer.Error)
	}
	return id(t, answer)
}

func seatPlayer(t *testing.T, campaignID string) {
	t.Helper()
	ensureProfile(t, player, "pip@quillborne.local")
	status, answer := call(t, dungeonMaster, http.MethodPost, "/api/campaign/"+campaignID+"/player", `{"email":"pip@quillborne.local"}`, map[string]string{"id": campaignID}, handler.PostCampaignPlayer)
	if status != http.StatusCreated {
		t.Fatalf("PostCampaignPlayer: %d %+v", status, answer.Error)
	}
}

func listed(t *testing.T, answer envelope, wanted string) bool {
	t.Helper()
	rows := make([]map[string]any, 0)
	if err := json.Unmarshal(answer.Data, &rows); err != nil {
		t.Fatalf("not a list: %s", string(answer.Data))
	}
	for _, row := range rows {
		if row["id"] == wanted {
			return true
		}
	}
	return false
}

func TestAPlayerReadsACampaignOnlyOnceSeated(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	params := map[string]string{"id": campaignID}

	if status, _ := call(t, player, http.MethodGet, "/api/campaign/"+campaignID, "", params, handler.GetCampaign); status == http.StatusOK {
		t.Fatalf("a player not at the table read the campaign")
	}
	seatPlayer(t, campaignID)
	if status, answer := call(t, player, http.MethodGet, "/api/campaign/"+campaignID, "", params, handler.GetCampaign); status != http.StatusOK {
		t.Fatalf("a seated player was refused the campaign: %d %+v", status, answer.Error)
	}
	_, answer := call(t, player, http.MethodGet, "/api/campaign", "", nil, handler.GetCampaigns)
	if !listed(t, answer, campaignID) {
		t.Fatalf("the seated player's campaign list lacks the campaign")
	}
	if status, _ := call(t, player, http.MethodPut, "/api/campaign/"+campaignID, `{"name":"Taken"}`, params, handler.PutCampaign); status != http.StatusForbidden {
		t.Fatalf("a player changed the campaign: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/api/campaign/"+campaignID+"/player/"+player.String(), "", map[string]string{"id": campaignID, "user_id": player.String()}, handler.DeleteCampaignPlayer); status != http.StatusOK {
		t.Fatalf("DeleteCampaignPlayer: %d", status)
	}
	if status, _ := call(t, player, http.MethodGet, "/api/campaign/"+campaignID, "", params, handler.GetCampaign); status == http.StatusOK {
		t.Fatalf("an unseated player still read the campaign")
	}
}

func TestAHiddenRollIsReadByTheDungeonMasterAlone(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}

	_, open := call(t, dungeonMaster, http.MethodPost, "/api/campaign/"+campaignID+"/chat", `{"author_name":"DM","kind":"message","body":"Open"}`, params, handler.PostChatEntry)
	_, hidden := call(t, dungeonMaster, http.MethodPost, "/api/campaign/"+campaignID+"/chat", `{"author_name":"DM","kind":"roll","is_hidden":true,"formula":"1d20","dice":[3],"roll":3,"total":3}`, params, handler.PostChatEntry)
	status, own := call(t, player, http.MethodPost, "/api/campaign/"+campaignID+"/chat", `{"author_name":"Pip","kind":"message","body":"Hello"}`, params, handler.PostChatEntry)
	if status != http.StatusCreated {
		t.Fatalf("a seated player could not post: %d %+v", status, own.Error)
	}

	_, seen := call(t, player, http.MethodGet, "/api/campaign/"+campaignID+"/chat", "", params, handler.GetChatEntries)
	if !listed(t, seen, id(t, open)) || !listed(t, seen, id(t, own)) {
		t.Fatalf("the player misses an open entry")
	}
	if listed(t, seen, id(t, hidden)) {
		t.Fatalf("the player read a hidden roll")
	}
	_, all := call(t, dungeonMaster, http.MethodGet, "/api/campaign/"+campaignID+"/chat", "", params, handler.GetChatEntries)
	if !listed(t, all, id(t, hidden)) || !listed(t, all, id(t, own)) {
		t.Fatalf("the dungeon master misses an entry")
	}
	ownID := id(t, own)
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", map[string]string{"id": campaignID, "entry_id": ownID}, handler.DeleteChatEntry); status != http.StatusForbidden {
		t.Fatalf("the dungeon master deleted a player's entry: %d", status)
	}
}

func TestOnlyTheDungeonMasterDrawsMaps(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}

	if status, _ := call(t, player, http.MethodPost, "/", `{"title":"Mine"}`, params, handler.PostMap); status != http.StatusForbidden {
		t.Fatalf("a player drew a map: %d", status)
	}
	status, made := call(t, dungeonMaster, http.MethodPost, "/", `{"title":"The vale"}`, params, handler.PostMap)
	if status != http.StatusCreated {
		t.Fatalf("PostMap: %d %+v", status, made.Error)
	}
	_, seen := call(t, player, http.MethodGet, "/", "", params, handler.GetMaps)
	if !listed(t, seen, id(t, made)) {
		t.Fatalf("a seated player misses the map")
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"title":"Renamed"}`, map[string]string{"id": campaignID, "map_id": id(t, made)}, handler.PutMap); status != http.StatusForbidden {
		t.Fatalf("a player changed a map: %d", status)
	}
	mapParams := map[string]string{"id": campaignID, "map_id": id(t, made)}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"plan":{"name":"The vale","levels":[]}}`, mapParams, handler.PutMap); status != http.StatusOK {
		t.Fatalf("the dungeon master could not draw a plan: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"plan":{"name":"Mine","levels":[]}}`, mapParams, handler.PutMap); status != http.StatusForbidden {
		t.Fatalf("a player changed a plan: %d", status)
	}
	_, drawn := call(t, player, http.MethodGet, "/", "", params, handler.GetMaps)
	rows := make([]map[string]any, 0)
	if err := json.Unmarshal(drawn.Data, &rows); err != nil {
		t.Fatalf("maps: %v", err)
	}
	for _, row := range rows {
		if row["id"] != id(t, made) {
			continue
		}
		if plan, _ := row["plan"].(map[string]any); plan["name"] != "The vale" {
			t.Fatalf("a seated player misses the plan: %v", row["plan"])
		}
		return
	}
	t.Fatalf("a seated player misses the map")
}

func TestASheetIsReadByTheTableOnlyOnceItJoins(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/character", `{"character":{"info":{"name":"Brann"}},"metadata":{"name":"Brann","level":1}}`, nil, handler.PostCharacter)
	if status != http.StatusCreated {
		t.Fatalf("PostCharacter: %d %+v", status, made.Error)
	}
	characterID := id(t, made)
	params := map[string]string{"id": characterID}

	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetCharacter); status == http.StatusOK {
		t.Fatalf("a player read a private sheet")
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/", "", map[string]string{"id": campaignID, "character_id": characterID}, handler.PostCampaignCharacter); status != http.StatusOK {
		t.Fatalf("PostCampaignCharacter: %d", status)
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetCharacter); status != http.StatusOK {
		t.Fatalf("a seated player was refused a sheet at the table: %d", status)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"character":{"info":{"name":"Stolen"}}}`, params, handler.PutCharacter); status != http.StatusForbidden {
		t.Fatalf("a player changed another's sheet: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteCharacter); status != http.StatusForbidden {
		t.Fatalf("a player deleted another's sheet: %d", status)
	}
}

func TestAPageIsReadByThoseItIsSharedWith(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/resource", `{"kind":"entries","title":"Secret lore","body":"{}"}`, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, made.Error)
	}
	resourceID := id(t, made)
	params := map[string]string{"id": resourceID}

	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetResource); status == http.StatusOK {
		t.Fatalf("a player read an unshared page")
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"share_users":["`+player.String()+`"]}`, params, handler.PutResource); status != http.StatusOK {
		t.Fatalf("PutResource share: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetResource); status != http.StatusOK {
		t.Fatalf("a player named in the share was refused: %d", status)
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"title":"Mine now"}`, params, handler.PutResource); status != http.StatusForbidden {
		t.Fatalf("a reader changed the page: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"share_users":[]}`, params, handler.PutResource); status != http.StatusOK {
		t.Fatalf("PutResource unshare: %d", status)
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetResource); status == http.StatusOK {
		t.Fatalf("a player read a page no longer shared")
	}
}

func TestALiveEditNeedsWriteOnItsPage(t *testing.T) {
	requireStack(t)
	ensureProfile(t, player, "pip@quillborne.local")
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/resource", `{"kind":"entries","title":"Shared draft"}`, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, made.Error)
	}
	resourceID := id(t, made)
	params := map[string]string{"id": resourceID}
	target := "/api/resource/" + resourceID + "/update"
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"share_users":["`+player.String()+`"]}`, params, handler.PutResource); status != http.StatusOK {
		t.Fatalf("PutResource share: %d %+v", status, answer.Error)
	}

	status, posted := call(t, dungeonMaster, http.MethodPost, target, `{"body":"AQID"}`, params, handler.PostResourceUpdate)
	if status != http.StatusCreated {
		t.Fatalf("the owner was refused a live edit: %d %+v", status, posted.Error)
	}
	if status, answer := call(t, player, http.MethodGet, target, "", params, handler.GetResourceUpdates); status != http.StatusOK || !listed(t, answer, id(t, posted)) {
		t.Fatalf("a reader was refused the page's updates: %d", status)
	}
	if status, _ := call(t, player, http.MethodPost, target, `{"body":"BAUG"}`, params, handler.PostResourceUpdate); status != http.StatusForbidden {
		t.Fatalf("a reader posted a live edit: %d", status)
	}
	if status, _ := call(t, player, http.MethodPut, target, `{"body":"BAUG"}`, params, handler.PutResourceUpdates); status != http.StatusForbidden {
		t.Fatalf("a reader replaced the live edits: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, target, "", params, handler.DeleteResourceUpdates); status != http.StatusForbidden {
		t.Fatalf("a reader cleared the live edits: %d", status)
	}

	if status, answer := call(t, dungeonMaster, http.MethodGet, target, "", params, handler.GetResourceUpdates); status != http.StatusOK || !listed(t, answer, id(t, posted)) {
		t.Fatalf("the owner was refused the page's updates: %d", status)
	}
	status, replaced := call(t, dungeonMaster, http.MethodPut, target, `{"body":"BwgJ"}`, params, handler.PutResourceUpdates)
	if status != http.StatusOK {
		t.Fatalf("the owner was refused replacing the live edits: %d %+v", status, replaced.Error)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, target, "", params, handler.DeleteResourceUpdates); status != http.StatusOK {
		t.Fatalf("the owner was refused clearing the live edits: %d", status)
	}
	if status, answer := call(t, player, http.MethodGet, target, "", params, handler.GetResourceUpdates); status != http.StatusOK || listed(t, answer, id(t, replaced)) {
		t.Fatalf("cleared live edits are still read: %d", status)
	}
}

func TestAPageSharedWithACampaignReachesItsTable(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/resource", `{"kind":"entries","title":"Old Moss","campaign_id":"`+campaignID+`"}`, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, made.Error)
	}
	resourceID := id(t, made)
	params := map[string]string{"id": resourceID}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetResource); status == http.StatusOK {
		t.Fatalf("a player read a page the dungeon master kept to themself")
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"share_campaigns":["`+campaignID+`"]}`, params, handler.PutResource); status != http.StatusOK {
		t.Fatalf("PutResource share campaign: %d", status)
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetResource); status != http.StatusOK {
		t.Fatalf("a seated player was refused a page shared with the table: %d", status)
	}
}

func TestIntegrationKeysAreReadByTheirOwnerAlone(t *testing.T) {
	requireStack(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"replicate_api_key":"r8_test"}`, nil, handler.PutProfileDetails); status != http.StatusOK {
		t.Fatalf("PutProfileDetails: %d %+v", status, answer.Error)
	}
	_, mine := call(t, dungeonMaster, http.MethodGet, "/", "", nil, handler.GetProfileDetails)
	held := map[string]bool{}
	if err := json.Unmarshal(mine.Data, &held); err != nil || !held["replicate_api_key"] {
		t.Fatalf("the owner does not see that their key is held: %s", string(mine.Data))
	}
	if strings.Contains(string(mine.Data), "r8_test") {
		t.Fatalf("the key value left the service")
	}
	_, theirs := call(t, player, http.MethodGet, "/", "", map[string]string{"user_id": dungeonMaster.String()}, handler.GetProfileUser)
	if strings.Contains(string(theirs.Data), "r8_test") {
		t.Fatalf("another player read the key")
	}
	_, own := call(t, player, http.MethodGet, "/", "", nil, handler.GetProfileDetails)
	if strings.Contains(string(own.Data), "replicate_api_key") {
		t.Fatalf("another player holds the owner's key: %s", string(own.Data))
	}
}
