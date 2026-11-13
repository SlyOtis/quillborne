package test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/qubo"
	"github.com/SlyOtis/quillborne/internal/state"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

func TestTheEmbeddedStateDocumentIsTheDefinitions(t *testing.T) {
	document := state.GetDocument("")
	body, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	body = append(body, '\n')
	if bytes.Equal(body, qubo.StateDocument) {
		return
	}
	path := filepath.Join("..", "..", "internal", "qubo", "state.json")
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Fatalf("%s did not match the state definitions and is rewritten from them; rebuild and commit it", path)
}

func TestEveryStateGroupIsATableAndEveryRefIsAGroup(t *testing.T) {
	document := state.GetDocument("")
	names := map[string]bool{}
	for _, group := range document.Groups {
		names[group.Name] = true
	}
	if len(names) != 14 {
		t.Fatalf("state carries %d groups, not 14", len(names))
	}
	for _, group := range document.Groups {
		for field, target := range group.Refs {
			if !names[target] {
				t.Fatalf("%s.%s refers to %s, which is no group", group.Name, field, target)
			}
		}
		for _, dependency := range group.DependsOn {
			if !names[dependency] {
				t.Fatalf("%s depends on %s, which is no group", group.Name, dependency)
			}
		}
	}
}

type stateServer struct {
	t   *testing.T
	url string
}

func requireStateServer(t *testing.T, actor uuid.UUID) stateServer {
	t.Helper()
	requireStack(t)
	e := echo.New()
	access := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(ctx echo.Context) error {
			ctx.Set("user_id", actor)
			return next(ctx)
		}
	}
	if err := state.Register(e, access, "test", nil); err != nil {
		t.Fatalf("register: %v", err)
	}
	server := httptest.NewServer(e)
	t.Cleanup(server.Close)
	return stateServer{t: t, url: server.URL}
}

func (s stateServer) post(path, contentType string, body []byte) (int, []byte) {
	s.t.Helper()
	res, err := http.Post(s.url+path, contentType, bytes.NewReader(body))
	if err != nil {
		s.t.Fatalf("POST %s: %v", path, err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	return res.StatusCode, out
}

func (s stateServer) importLines(lines ...string) nstate.ImportResponse {
	s.t.Helper()
	body := strings.Join(append([]string{`{"format": "2", "service": "quillborne"}`}, lines...), "\n")
	status, out := s.post("/api/state/import", nstate.MIMENDJSON, []byte(body))
	if status != http.StatusOK {
		s.t.Fatalf("import answered %d: %s", status, out)
	}
	var wrapped struct {
		Data nstate.ImportResponse `json:"data"`
	}
	if err := json.Unmarshal(out, &wrapped); err != nil {
		s.t.Fatalf("import: %v: %s", err, out)
	}
	return wrapped.Data
}

func (s stateServer) export(targets ...string) []nstate.Line {
	s.t.Helper()
	body := map[string]any{}
	if len(targets) > 0 {
		list := make([]map[string]any, 0, len(targets))
		for _, target := range targets {
			list = append(list, map[string]any{"group": target})
		}
		body["targets"] = list
	}
	raw, _ := json.Marshal(body)
	status, out := s.post("/api/state/export", echo.MIMEApplicationJSON, raw)
	if status != http.StatusOK {
		s.t.Fatalf("export answered %d: %s", status, out)
	}
	file, err := nstate.Read(bytes.NewReader(out))
	if err != nil {
		s.t.Fatalf("export: %v", err)
	}
	return file.Records
}

func TestTheStateImportUpsertsByKeyAndTheExportAnswersIt(t *testing.T) {
	server := requireStateServer(t, dungeonMaster)
	key := "state-test-" + uuid.NewString()[:8]
	campaign := `{"group":"campaign","key":"` + key + `","data":{"dm_id":"` + dungeonMaster.String() + `","name":"State Test","description":"An import","is_active":true,"player_ids":["` + player.String() + `"]}}`
	character := `{"group":"character","key":"` + key + `-pc","data":{"owner_id":"` + player.String() + `","character":{"info":{"name":"Imported"}},"metadata":{"name":"Imported"},"is_public":false},"refs":{"campaign_id":"` + key + `"}}`
	first := server.importLines(campaign, character)
	if first.Counts[nstate.OutcomeCreated] != 2 {
		t.Fatalf("first import: %+v", first)
	}
	second := server.importLines(campaign, character)
	if second.Counts[nstate.OutcomeCreated] != 0 || second.Counts[nstate.OutcomeRefused] != 0 {
		t.Fatalf("second import created or refused: %+v", second)
	}
	var campaignID string
	for _, line := range server.export(state.GroupCampaign) {
		if line.Key == key {
			campaignID = line.ID
			if players, _ := line.Data["player_ids"].([]any); len(players) != 1 || players[0] != player.String() {
				t.Fatalf("the player is not seated: %v", line.Data["player_ids"])
			}
		}
	}
	if campaignID == "" {
		t.Fatalf("the campaign %s is not in the export", key)
	}
	for _, line := range server.export(state.GroupCharacter) {
		if line.Key != key+"-pc" {
			continue
		}
		if line.Refs["campaign_id"] != key {
			t.Fatalf("the character is not at the table: %v", line.Refs)
		}
		if line.Data["owner_id"] != player.String() {
			t.Fatalf("the character belongs to %v, not the player", line.Data["owner_id"])
		}
		return
	}
	t.Fatalf("the character %s-pc is not in the export", key)
}

func TestAPlayerExportsOnlyWhatTheirClaimsBind(t *testing.T) {
	asMaster := requireStateServer(t, dungeonMaster)
	key := "state-hidden-" + uuid.NewString()[:8]
	asMaster.importLines(`{"group":"campaign","key":"` + key + `","data":{"dm_id":"` + dungeonMaster.String() + `","name":"Hidden","description":"","is_active":true,"player_ids":[]}}`)
	asPlayer := requireStateServer(t, player)
	for _, line := range asPlayer.export(state.GroupCampaign) {
		if line.Key == key {
			t.Fatalf("a player who is not seated exports the campaign")
		}
	}
}
