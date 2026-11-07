package test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

type vehicleView struct {
	OwnerID       string           `json:"owner_id"`
	CampaignID    *string          `json:"campaign_id"`
	Revision      int              `json:"revision"`
	History       []map[string]any `json:"history"`
	Crew          []map[string]any `json:"crew"`
}

func postVehicle(t *testing.T, body string) string {
	t.Helper()
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/vehicle", body, nil, handler.PostVehicle)
	if status != http.StatusCreated {
		t.Fatalf("PostVehicle: %d %+v", status, made.Error)
	}
	return id(t, made)
}

func getVehicleView(t *testing.T, answer envelope) vehicleView {
	t.Helper()
	var view vehicleView
	if err := json.Unmarshal(answer.Data, &view); err != nil {
		t.Fatalf("not a vehicle: %s", string(answer.Data))
	}
	return view
}

func TestAVehicleIsReadByItsBuilderAlone(t *testing.T) {
	requireStack(t)
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/vehicle", `{"name":"Keelless"}`, nil, handler.PostVehicle); status != http.StatusBadRequest {
		t.Fatalf("a vehicle without a system or a layout answered %d, want 400", status)
	}
	vehicleID := postVehicle(t, `{"system":"voidsea","layout":"jaws-deck","name":"Gull","components":[{"id":"hull"}]}`)
	params := map[string]string{"id": vehicleID}

	status, answer := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetVehicle)
	if status != http.StatusOK {
		t.Fatalf("the builder was refused their vehicle: %d %+v", status, answer.Error)
	}
	view := getVehicleView(t, answer)
	if view.OwnerID != dungeonMaster.String() || view.CampaignID != nil || view.Revision != 1 || len(view.History) != 1 || view.History[0]["note"] != "Built" {
		t.Fatalf("a new vehicle answered %s", string(answer.Data))
	}
	_, mine := call(t, dungeonMaster, http.MethodGet, "/api/vehicle", "", nil, handler.GetVehicles)
	if !listed(t, mine, vehicleID) {
		t.Fatalf("the builder's list lacks the vehicle")
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetVehicle); status != http.StatusNotFound {
		t.Fatalf("a stranger read the vehicle: %d", status)
	}
	_, theirs := call(t, player, http.MethodGet, "/api/vehicle", "", nil, handler.GetVehicles)
	if listed(t, theirs, vehicleID) {
		t.Fatalf("a stranger's list holds the vehicle")
	}
	if status, _ := call(t, player, http.MethodPut, "/", `{"states":{"hull":{"hp":0}}}`, params, handler.PutVehicle); status != http.StatusForbidden {
		t.Fatalf("a stranger changed the vehicle: %d", status)
	}
}

func TestACampaignVehicleIsReadAtItsTable(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	if status, _ := call(t, player, http.MethodPost, "/api/vehicle", `{"system":"voidsea","layout":"jaws-deck","name":"Stowaway","campaign_id":"`+campaignID+`"}`, nil, handler.PostVehicle); status != http.StatusForbidden {
		t.Fatalf("a player away from the table built a vehicle in it: %d", status)
	}
	vehicleID := postVehicle(t, `{"system":"voidsea","layout":"jaws-deck","name":"Cauldron","campaign_id":"`+campaignID+`"}`)
	params := map[string]string{"id": vehicleID}
	target := "/api/vehicle?campaign_id=" + campaignID

	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetVehicle); status != http.StatusNotFound {
		t.Fatalf("a player away from the table read its vehicle: %d", status)
	}
	seatPlayer(t, campaignID)
	if status, answer := call(t, player, http.MethodGet, "/", "", params, handler.GetVehicle); status != http.StatusOK {
		t.Fatalf("a seated player was refused the table's vehicle: %d %+v", status, answer.Error)
	}
	if _, answer := call(t, player, http.MethodGet, target, "", nil, handler.GetVehicles); !listed(t, answer, vehicleID) {
		t.Fatalf("the seated player's list of the table lacks the vehicle")
	}
	if status, answer := call(t, player, http.MethodPut, "/", `{"name":"Our Cauldron","states":{"hull":{"hp":1}}}`, params, handler.PutVehicle); status != http.StatusOK {
		t.Fatalf("a seated player could not change the table's vehicle: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteVehicle); status != http.StatusForbidden {
		t.Fatalf("a seated player scuttled the dungeon master's vehicle: %d", status)
	}
	status, built := call(t, player, http.MethodPost, "/api/vehicle", `{"system":"voidsea","layout":"jaws-deck","name":"Skiff","campaign_id":"`+campaignID+`"}`, nil, handler.PostVehicle)
	if status != http.StatusCreated {
		t.Fatalf("a seated player could not build a vehicle at the table: %d %+v", status, built.Error)
	}
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"name":"Renamed"}`, map[string]string{"id": id(t, built)}, handler.PutVehicle); status != http.StatusOK {
		t.Fatalf("the dungeon master could not change a player's vehicle at the table: %d %+v", status, answer.Error)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", map[string]string{"id": campaignID, "user_id": player.String()}, handler.DeleteCampaignPlayer); status != http.StatusOK {
		t.Fatalf("DeleteCampaignPlayer: %d", status)
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", params, handler.GetVehicle); status != http.StatusNotFound {
		t.Fatalf("an unseated player still read the table's vehicle: %d", status)
	}
}

func TestTheCrewChangesAnythingButCannotScuttle(t *testing.T) {
	requireStack(t)
	status, made := call(t, player, http.MethodPost, "/api/character", `{"character":{"info":{"name":"Wren"}},"metadata":{"name":"Wren","level":1}}`, nil, handler.PostCharacter)
	if status != http.StatusCreated {
		t.Fatalf("PostCharacter: %d %+v", status, made.Error)
	}
	characterID := id(t, made)
	vehicleID := postVehicle(t, `{"system":"voidsea","layout":"jaws-deck","name":"Heron","components":[{"id":"hull"}]}`)
	params := map[string]string{"id": vehicleID}

	crew := `{"crew":[{"character_id":"` + characterID + `","user_id":"` + dungeonMaster.String() + `","role":"pilot"},{"character_id":"` + uuid.NewString() + `","role":"ghost"}]}`
	status, answer := call(t, dungeonMaster, http.MethodPut, "/", crew, params, handler.PutVehicle)
	if status != http.StatusOK {
		t.Fatalf("PutVehicle crew: %d %+v", status, answer.Error)
	}
	view := getVehicleView(t, answer)
	if len(view.Crew) != 1 || view.Crew[0]["user_id"] != player.String() || view.Crew[0]["role"] != "pilot" {
		t.Fatalf("the crew was not taken from the characters: %s", string(answer.Data))
	}

	if status, answer := call(t, player, http.MethodGet, "/", "", params, handler.GetVehicle); status != http.StatusOK {
		t.Fatalf("the crew was refused the vehicle: %d %+v", status, answer.Error)
	}
	if status, answer := call(t, player, http.MethodPut, "/", `{"states":{"hull":{"hp":3}}}`, params, handler.PutVehicle); status != http.StatusOK {
		t.Fatalf("the crew could not mark damage: %d %+v", status, answer.Error)
	}
	if status, answer := call(t, player, http.MethodPut, "/", `{"name":"Mine","rulings":{"AMB-SHIP-WEIGHT":"stated"}}`, params, handler.PutVehicle); status != http.StatusOK {
		t.Fatalf("the crew could not rename the vehicle: %d %+v", status, answer.Error)
	}
	refit := `{"components":[{"id":"hull"},{"id":"sail"}],"revision":1,"note":"Sail"}`
	status, answer = call(t, player, http.MethodPut, "/", refit, params, handler.PutVehicle)
	if status != http.StatusOK {
		t.Fatalf("the crew could not refit the design: %d %+v", status, answer.Error)
	}
	view = getVehicleView(t, answer)
	if view.Revision != 2 || len(view.History) != 2 || view.History[1]["note"] != "Sail" || view.History[1]["user_id"] != player.String() {
		t.Fatalf("the refit was not recorded as a revision: %s", string(answer.Data))
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", strings.Replace(refit, "Sail", "Stale", 1), params, handler.PutVehicle); status != http.StatusConflict {
		t.Fatalf("a refit against a stale revision was taken: %d", status)
	}
	if status, _ := call(t, player, http.MethodDelete, "/", "", params, handler.DeleteVehicle); status != http.StatusForbidden {
		t.Fatalf("the crew scuttled the vehicle: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", params, handler.DeleteVehicle); status != http.StatusOK {
		t.Fatalf("the builder could not scuttle the vehicle: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/", "", params, handler.GetVehicle); status != http.StatusNotFound {
		t.Fatalf("a scuttled vehicle is still read: %d", status)
	}
}

func TestTheVehicleStreamsCarryChangesToThoseWhoReadIt(t *testing.T) {
	requireBroker(t)
	campaignID := postCampaign(t)
	vehicleID := postVehicle(t, `{"system":"voidsea","layout":"jaws-deck","name":"Lantern","campaign_id":"`+campaignID+`"}`)
	server := streamServer(t)

	req, _ := http.NewRequest(http.MethodGet, server.URL+"/api/vehicle/"+vehicleID+"/stream", nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("X-Actor", player.String())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	res.Body.Close()
	if res.StatusCode == http.StatusOK {
		t.Fatalf("a player away from the table opened the vehicle stream")
	}

	seatPlayer(t, campaignID)
	table := openStream(t, server, player, "/api/campaign/"+campaignID+"/stream")
	deck := openStream(t, server, player, "/api/vehicle/"+vehicleID+"/stream")
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"states":{"hull":{"hp":2}}}`, map[string]string{"id": vehicleID}, handler.PutVehicle); status != http.StatusOK {
		t.Fatalf("the dungeon master could not change the table's vehicle: %d %+v", status, answer.Error)
	}
	for name, lines := range map[string]<-chan string{"campaign": table, "vehicle": deck} {
		if line, ok := next(lines, wait); !ok || !strings.Contains(line, vehicleID) || !strings.Contains(line, `"kind":"vehicle"`) {
			t.Fatalf("the seated player's %s stream did not carry the change: %q", name, line)
		}
	}
}
