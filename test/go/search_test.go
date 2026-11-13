package test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func getSearchNames(t *testing.T, answer envelope) []string {
	t.Helper()
	rows := make([]struct {
		Name       string  `json:"name"`
		ObjectType string  `json:"object_type"`
		Kind       *string `json:"kind"`
	}, 0)
	if err := json.Unmarshal(answer.Data, &rows); err != nil {
		t.Fatalf("not a search answer: %s", string(answer.Data))
	}
	names := make([]string, 0, len(rows))
	for _, row := range rows {
		names = append(names, row.Name)
	}
	return names
}

func TestTheSearchFindsWhatTheReaderMayRead(t *testing.T) {
	requireStack(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	word := "Mortlake" + strings.ToUpper(uuid.NewString()[:6])
	status, page := call(t, dungeonMaster, http.MethodPost, "/api/resource", `{"kind":"npcs","name":"`+word+` the Ferrier","description":"Rows the drowned to the far bank","campaign_id":"`+campaignID+`","share_campaigns":["`+campaignID+`"]}`, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, page.Error)
	}
	status, secret := call(t, dungeonMaster, http.MethodPost, "/api/resource", `{"kind":"entries","name":"`+word+` owes a debt"}`, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, secret.Error)
	}
	status, sheet := call(t, player, http.MethodPost, "/api/character", `{"character":{"info":{"name":"`+word+` Vane","description":"A ferrier's son"}},"metadata":{"name":"`+word+` Vane","level":1}}`, nil, handler.PostCharacter)
	if status != http.StatusCreated {
		t.Fatalf("PostCharacter: %d %+v", status, sheet.Error)
	}

	status, found := call(t, player, http.MethodGet, "/api/search?q="+word, "", nil, handler.GetSearch)
	if status != http.StatusOK {
		t.Fatalf("GetSearch: %d %+v", status, found.Error)
	}
	names := getSearchNames(t, found)
	seen := map[string]bool{}
	for _, name := range names {
		seen[name] = true
	}
	if !seen[word+" the Ferrier"] {
		t.Fatalf("a seated player misses the shared page: %v", names)
	}
	if !seen[word+" Vane"] {
		t.Fatalf("a player misses their own sheet: %v", names)
	}
	if seen[word+" owes a debt"] {
		t.Fatalf("a player read a page kept from them: %v", names)
	}

	status, typed := call(t, player, http.MethodGet, "/api/search?q="+word+"&object_types=character", "", nil, handler.GetSearch)
	if status != http.StatusOK {
		t.Fatalf("GetSearch by type: %d %+v", status, typed.Error)
	}
	if names := getSearchNames(t, typed); len(names) != 1 || names[0] != word+" Vane" {
		t.Fatalf("a type filter answered %v", names)
	}
	if status, _ := call(t, player, http.MethodGet, "/api/search?q="+word+"&object_types=profile", "", nil, handler.GetSearch); status != http.StatusBadRequest {
		t.Fatalf("an unknown object type answered %d", status)
	}
}
