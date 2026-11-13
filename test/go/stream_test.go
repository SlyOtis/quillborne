package test

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/SlyOtis/quillborne/internal/broker"
	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

const wait = 3 * time.Second

func newBroker(t *testing.T) *broker.Broker {
	t.Helper()
	requireStack(t)
	b, err := broker.New(context.Background(), db.Instance().DB)
	if err != nil {
		t.Fatalf("broker: %v", err)
	}
	t.Cleanup(func() { _ = b.Close() })
	return b
}

func requireBroker(t *testing.T) {
	t.Helper()
	requireStack(t)
	if broker.Instance() != nil {
		return
	}
	if err := broker.Init(context.Background(), db.Instance().DB); err != nil {
		t.Fatalf("broker: %v", err)
	}
}

func receive(t *testing.T, events <-chan broker.Event) (broker.Event, bool) {
	t.Helper()
	select {
	case ev := <-events:
		return ev, true
	case <-time.After(wait):
		return broker.Event{}, false
	}
}

func TestAnEventReachesTheSameInstanceAtOnce(t *testing.T) {
	b := newBroker(t)
	topic := broker.CampaignTopic(uuid.New())
	events, release := b.Get(topic)
	defer release()

	b.Post(context.Background(), broker.Event{Topic: topic, Kind: broker.KindChat, ID: "one", Op: broker.OpCreate})

	ev, ok := receive(t, events)
	if !ok || ev.ID != "one" {
		t.Fatalf("the same instance did not get its own event")
	}
	select {
	case again := <-events:
		t.Fatalf("the instance read its own notify back: %+v", again)
	case <-time.After(time.Second):
	}
}

func TestAnEventReachesAnotherInstanceThroughNotify(t *testing.T) {
	sender, other := newBroker(t), newBroker(t)
	topic := broker.CampaignTopic(uuid.New())
	events, release := other.Get(topic)
	defer release()
	elsewhere, releaseElsewhere := other.Get(broker.CampaignTopic(uuid.New()))
	defer releaseElsewhere()

	sender.Post(context.Background(), broker.Event{Topic: topic, Kind: broker.KindMap, ID: "two", Op: broker.OpUpdate})

	ev, ok := receive(t, events)
	if !ok || ev.ID != "two" || ev.Kind != broker.KindMap {
		t.Fatalf("the other instance did not get the event")
	}
	select {
	case stray := <-elsewhere:
		t.Fatalf("an event reached another topic: %+v", stray)
	default:
	}
}

func openStream(t *testing.T, server *httptest.Server, actor uuid.UUID, path string) <-chan string {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+path, nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("X-Actor", actor.String())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("stream %s: %v", path, err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("stream %s answered %d", path, res.StatusCode)
	}
	lines := make(chan string, 64)
	go func() {
		defer res.Body.Close()
		scanner := bufio.NewScanner(res.Body)
		for scanner.Scan() {
			if line := scanner.Text(); strings.HasPrefix(line, "data: ") {
				lines <- strings.TrimPrefix(line, "data: ")
			}
		}
	}()
	return lines
}

func streamServer(t *testing.T) *httptest.Server {
	t.Helper()
	e := echo.New()
	actor := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Set("user_id", uuid.MustParse(c.Request().Header.Get("X-Actor")))
			return next(c)
		}
	}
	e.GET("/api/campaign/:id/stream", handler.GetCampaignStream, actor)
	e.GET("/api/vehicle/:id/stream", handler.GetVehicleStream, actor)
	e.GET("/api/profile/stream", handler.GetProfileStream, actor)
	e.GET("/api/resource/:id/stream", handler.GetResourceStream, actor)
	e.GET("/api/character/:id/stream", handler.GetCharacterStream, actor)
	server := httptest.NewServer(e)
	t.Cleanup(server.Close)
	return server
}

func next(lines <-chan string, within time.Duration) (string, bool) {
	select {
	case line := <-lines:
		return line, true
	case <-time.After(within):
		return "", false
	}
}

func TestTheChatStreamCarriesAHiddenRollToTheDungeonMasterAlone(t *testing.T) {
	requireBroker(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	params := map[string]string{"id": campaignID}
	server := streamServer(t)
	dm := openStream(t, server, dungeonMaster, "/api/campaign/"+campaignID+"/stream")
	pip := openStream(t, server, player, "/api/campaign/"+campaignID+"/stream")

	_, hidden := call(t, dungeonMaster, http.MethodPost, "/api/campaign/"+campaignID+"/chat", `{"author_name":"DM","kind":"roll","is_hidden":true,"formula":"1d20","dice":[3],"roll":3,"total":3}`, params, handler.PostChatEntry)
	hiddenID := id(t, hidden)
	if line, ok := next(dm, wait); !ok || !strings.Contains(line, hiddenID) {
		t.Fatalf("the dungeon master did not hear the hidden roll: %q", line)
	}
	if line, ok := next(pip, time.Second); ok {
		t.Fatalf("the player heard a hidden roll: %q", line)
	}

	_, open := call(t, player, http.MethodPost, "/api/campaign/"+campaignID+"/chat", `{"author_name":"Pip","kind":"message","body":"hello"}`, params, handler.PostChatEntry)
	openID := id(t, open)
	if line, ok := next(pip, wait); !ok || !strings.Contains(line, openID) || !strings.Contains(line, `"kind":"chat"`) {
		t.Fatalf("the player did not hear the open message: %q", line)
	}
	if line, ok := next(dm, wait); !ok || !strings.Contains(line, openID) {
		t.Fatalf("the dungeon master did not hear the open message: %q", line)
	}
}

func TestACampaignStreamIsRefusedAwayFromTheTable(t *testing.T) {
	requireBroker(t)
	campaignID := postCampaign(t)
	server := streamServer(t)
	req, _ := http.NewRequest(http.MethodGet, server.URL+"/api/campaign/"+campaignID+"/stream", nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("X-Actor", player.String())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK {
		t.Fatalf("a player away from the table opened the campaign stream")
	}
}

func getRefused(t *testing.T, server *httptest.Server, actor uuid.UUID, path string) bool {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, server.URL+path, nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("X-Actor", actor.String())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("stream %s: %v", path, err)
	}
	res.Body.Close()
	return res.StatusCode != http.StatusOK
}

func TestAProfileStreamCarriesItsOwnersChangesAlone(t *testing.T) {
	requireBroker(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	server := streamServer(t)
	mine := openStream(t, server, dungeonMaster, "/api/profile/stream")
	theirs := openStream(t, server, player, "/api/profile/stream")
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/api/profile", `{"display_name":"Testy streams"}`, nil, handler.PutProfile); status != http.StatusOK {
		t.Fatalf("PutProfile: %d %+v", status, answer.Error)
	}
	if line, ok := next(mine, wait); !ok || !strings.Contains(line, `"kind":"profile"`) || !strings.Contains(line, dungeonMaster.String()) {
		t.Fatalf("the owner did not hear their profile change: %q", line)
	}
	if line, ok := next(theirs, time.Second); ok {
		t.Fatalf("another player heard the profile change: %q", line)
	}
}

func TestAResourceStreamCarriesLiveEditsToItsReaders(t *testing.T) {
	requireBroker(t)
	ensureProfile(t, player, "pip@quillborne.local")
	resourceID := postResource(t, dungeonMaster, `{"kind":"entries","title":"Streamed draft"}`)
	params := map[string]string{"id": resourceID}
	server := streamServer(t)
	if !getRefused(t, server, player, "/api/resource/"+resourceID+"/stream") {
		t.Fatalf("a player opened the stream of a page not shared with them")
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"share_users":["`+player.String()+`"]}`, params, handler.PutResource); status != http.StatusOK {
		t.Fatalf("PutResource share: %d", status)
	}
	owner := openStream(t, server, dungeonMaster, "/api/resource/"+resourceID+"/stream")
	reader := openStream(t, server, player, "/api/resource/"+resourceID+"/stream")
	status, posted := call(t, dungeonMaster, http.MethodPost, "/", `{"body":"AQID"}`, params, handler.PostResourceUpdate)
	if status != http.StatusCreated {
		t.Fatalf("PostResourceUpdate: %d %+v", status, posted.Error)
	}
	updateID := id(t, posted)
	for name, lines := range map[string]<-chan string{"owner": owner, "reader": reader} {
		if line, ok := next(lines, wait); !ok || !strings.Contains(line, updateID) || !strings.Contains(line, `"kind":"update"`) {
			t.Fatalf("the %s did not hear the live edit: %q", name, line)
		}
	}
}

func TestACharacterStreamCarriesChangesToThoseWhoReadTheSheet(t *testing.T) {
	requireBroker(t)
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	characterID := postCharacter(t, dungeonMaster, "Streamed Brann")
	params := map[string]string{"id": characterID}
	server := streamServer(t)
	if !getRefused(t, server, player, "/api/character/"+characterID+"/stream") {
		t.Fatalf("a player opened the stream of a private sheet")
	}
	postCampaignCharacter(t, dungeonMaster, campaignID, characterID)
	owner := openStream(t, server, dungeonMaster, "/api/character/"+characterID+"/stream")
	table := openStream(t, server, player, "/api/character/"+characterID+"/stream")
	if status, answer := call(t, dungeonMaster, http.MethodPut, "/", `{"character":{"info":{"name":"Brann the Streamed"}}}`, params, handler.PutCharacter); status != http.StatusOK {
		t.Fatalf("PutCharacter: %d %+v", status, answer.Error)
	}
	for name, lines := range map[string]<-chan string{"owner": owner, "seated player": table} {
		if line, ok := next(lines, wait); !ok || !strings.Contains(line, characterID) || !strings.Contains(line, `"kind":"character"`) {
			t.Fatalf("the %s did not hear the sheet change: %q", name, line)
		}
	}
}
