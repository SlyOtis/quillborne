package state

import (
	"encoding/json"
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

const GroupProfile = "profile"

type ProfileData struct {
	UserID      string          `json:"user_id"`
	Email       string          `json:"email"`
	DisplayName string          `json:"display_name"`
	PhotoURL    string          `json:"photo_url,omitempty"`
	Preferences json.RawMessage `json:"preferences,omitempty"`
	Friends     []string        `json:"friends"`
}

func getProfileGroup() nstate.Group[ProfileData] {
	return nstate.Group[ProfileData]{
		Name: GroupProfile,
		Schema: getSchema(map[string]any{
			"user_id":      getOwner("The player the profile belongs to, samna_user.user_id."),
			"email":        getProperty("string", "The address the player signs in with."),
			"display_name": getProperty("string", "The name shown at the table."),
			"photo_url":    getProperty("string", "The stored address of the portrait."),
			"preferences":  getJSON("Theme, sound, animations, recent characters and shortcuts."),
			"friends":      getList("The user ids the player has added as friends."),
		}, "user_id", "email", "display_name"),
		Filters: []string{"user_id"},
		Export:  exportProfiles,
		Import:  importProfile,
		Delete:  deleteProfile,
	}
}

func getStrings(ids []uuid.UUID) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	return out
}

func exportProfiles(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[ProfileData], error) {
	rows := make([]db.Profile, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_PROFILE, "profile", &rows, "profile.sa_created_at ASC, profile.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupProfile, query, rows, func(row db.Profile) uuid.UUID { return row.ID }, func(row db.Profile) ProfileData {
		return ProfileData{
			UserID:      row.UserID.String(),
			Email:       row.Email,
			DisplayName: row.DisplayName,
			PhotoURL:    row.PhotoURL,
			Preferences: getRaw(row.Preferences),
			Friends:     getStrings(row.Friends),
		}
	})
}

func importProfile(ctx *nstate.Context, record nstate.Record[ProfileData]) (string, error) {
	userID, err := uuid.Parse(record.Data.UserID)
	if err != nil {
		return "", echo.NewHTTPError(http.StatusBadRequest, "user_id invalid")
	}
	actor, err := getActor(ctx, &userID)
	if err != nil {
		return "", err
	}
	if actor != userID {
		return "", echo.NewHTTPError(http.StatusForbidden, "a profile is imported by its own player")
	}
	body := map[string]any{
		"email":        record.Data.Email,
		"display_name": record.Data.DisplayName,
		"photo_url":    record.Data.PhotoURL,
	}
	if record.Data.Preferences != nil {
		body["preferences"] = record.Data.Preferences
	}
	rctx := ctx.Request().Context()
	method := http.MethodPost
	if record.ID == "" {
		exists, err := db.Instance().NewSelect().Model((*db.Profile)(nil)).Where("user_id = ?", userID).Where("sa_deleted_at IS NULL").Exists(rctx)
		if err != nil {
			return "", err
		}
		if exists {
			record.ID = userID.String()
		}
	}
	if record.ID != "" {
		method = http.MethodPut
		if record.Data.Friends != nil {
			body["friends"] = record.Data.Friends
		}
	}
	data, err := call(ctx, actor, method, "/api/profile", body)
	if err != nil {
		return "", err
	}
	var answer struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.Unmarshal(data, &answer); err != nil {
		return "", err
	}
	var id uuid.UUID
	if err := db.Instance().NewSelect().Model((*db.Profile)(nil)).Column("id").Where("user_id = ?", answer.UserID).Scan(rctx, &id); err != nil {
		return "", err
	}
	if method == http.MethodPost && record.Data.Friends != nil && len(record.Data.Friends) > 0 {
		if _, err := call(ctx, actor, http.MethodPut, "/api/profile", map[string]any{"friends": record.Data.Friends}); err != nil {
			return "", err
		}
	}
	return id.String(), putKey(rctx, GroupProfile, record.Key, id)
}

func deleteProfile(ctx *nstate.Context, id string) error {
	return echo.NewHTTPError(http.StatusMethodNotAllowed, "a profile is never deleted; the player's account is")
}
