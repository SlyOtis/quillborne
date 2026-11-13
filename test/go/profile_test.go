package test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
)

func getFriends(t *testing.T, actor uuid.UUID) []string {
	t.Helper()
	status, answer := call(t, actor, http.MethodGet, "/api/profile", "", nil, handler.GetProfile)
	if status != http.StatusOK {
		t.Fatalf("GetProfile: %d %+v", status, answer.Error)
	}
	var profile struct {
		Friends []string `json:"friends"`
	}
	if err := json.Unmarshal(answer.Data, &profile); err != nil {
		t.Fatalf("not a profile: %s", string(answer.Data))
	}
	return profile.Friends
}

func TestAPlayerChangesTheirOwnProfileAlone(t *testing.T) {
	requireStack(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	name := "Testy " + uuid.NewString()[:8]
	status, changed := call(t, dungeonMaster, http.MethodPut, "/api/profile", `{"display_name":"`+name+`"}`, nil, handler.PutProfile)
	if status != http.StatusOK {
		t.Fatalf("PutProfile: %d %+v", status, changed.Error)
	}
	if !strings.Contains(string(changed.Data), name) {
		t.Fatalf("the change did not land: %s", string(changed.Data))
	}
	if status, _ := call(t, uuid.New(), http.MethodPut, "/api/profile", `{"display_name":"Nobody"}`, nil, handler.PutProfile); status != http.StatusNotFound {
		t.Fatalf("a member without a profile changed one: %d", status)
	}
}

func TestEveryMemberFindsAProfileByAddressOrId(t *testing.T) {
	requireStack(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	if status, _ := call(t, player, http.MethodGet, "/api/profile/list", "", nil, handler.GetProfiles); status != http.StatusBadRequest {
		t.Fatalf("a list without an address or ids answered %d", status)
	}
	status, byAddress := call(t, player, http.MethodGet, "/api/profile/list?email=Testy@quillborne.local", "", nil, handler.GetProfiles)
	if status != http.StatusOK || !strings.Contains(string(byAddress.Data), dungeonMaster.String()) {
		t.Fatalf("the dungeon master was not found by address: %d %s", status, string(byAddress.Data))
	}
	status, byIDs := call(t, dungeonMaster, http.MethodGet, "/api/profile/list?ids="+player.String()+","+dungeonMaster.String(), "", nil, handler.GetProfiles)
	if status != http.StatusOK || !strings.Contains(string(byIDs.Data), player.String()) || !strings.Contains(string(byIDs.Data), dungeonMaster.String()) {
		t.Fatalf("the two profiles were not found by id: %d %s", status, string(byIDs.Data))
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/api/profile/list?ids=not-an-id", "", nil, handler.GetProfiles); status != http.StatusBadRequest {
		t.Fatalf("a bad id answered %d", status)
	}
	status, one := call(t, player, http.MethodGet, "/", "", map[string]string{"user_id": dungeonMaster.String()}, handler.GetProfileUser)
	if status != http.StatusOK || !strings.Contains(string(one.Data), "testy@quillborne.local") {
		t.Fatalf("a member could not read another's profile: %d %s", status, string(one.Data))
	}
	if status, _ := call(t, player, http.MethodGet, "/", "", map[string]string{"user_id": uuid.NewString()}, handler.GetProfileUser); status != http.StatusNotFound {
		t.Fatalf("an unknown user answered %d", status)
	}
}

func TestAFriendIsAddedByAddressAndRemovedById(t *testing.T) {
	requireStack(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/profile/friend", `{"email":"nobody@quillborne.local"}`, nil, handler.PostProfileFriend); status != http.StatusNotFound {
		t.Fatalf("an unknown address was befriended: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/profile/friend", `{"email":"testy@quillborne.local"}`, nil, handler.PostProfileFriend); status != http.StatusBadRequest {
		t.Fatalf("one's own address was befriended: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/profile/friend", `{}`, nil, handler.PostProfileFriend); status != http.StatusBadRequest {
		t.Fatalf("an empty address was befriended: %d", status)
	}
	status, found := call(t, dungeonMaster, http.MethodPost, "/api/profile/friend", `{"email":"PIP@quillborne.local"}`, nil, handler.PostProfileFriend)
	if status != http.StatusCreated || !strings.Contains(string(found.Data), player.String()) {
		t.Fatalf("PostProfileFriend: %d %s", status, string(found.Data))
	}
	held := false
	for _, friend := range getFriends(t, dungeonMaster) {
		held = held || friend == player.String()
	}
	if !held {
		t.Fatalf("the friend is not on the profile")
	}
	for _, friend := range getFriends(t, player) {
		if friend == dungeonMaster.String() {
			t.Fatalf("befriending wrote onto the friend's own profile")
		}
	}
	if status, _ := call(t, uuid.New(), http.MethodDelete, "/", "", map[string]string{"user_id": player.String()}, handler.DeleteProfileFriend); status != http.StatusNotFound {
		t.Fatalf("a member without a profile removed a friend: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/", "", map[string]string{"user_id": player.String()}, handler.DeleteProfileFriend); status != http.StatusOK {
		t.Fatalf("DeleteProfileFriend: %d", status)
	}
	for _, friend := range getFriends(t, dungeonMaster) {
		if friend == player.String() {
			t.Fatalf("the removed friend is still on the profile")
		}
	}
}
