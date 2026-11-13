package state

import (
	"encoding/json"
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

const GroupCampaign = "campaign"

type CampaignData struct {
	DmID        string          `json:"dm_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	IsActive    bool            `json:"is_active"`
	Settings    json.RawMessage `json:"settings,omitempty"`
	PlayerIDs   []string        `json:"player_ids"`
}

type campaignView struct {
	ID          uuid.UUID       `json:"id"`
	DmID        uuid.UUID       `json:"dm_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	IsActive    bool            `json:"is_active"`
	Settings    json.RawMessage `json:"settings"`
	PlayerIDs   []uuid.UUID     `json:"player_ids"`
}

func getCampaignGroup() nstate.Group[CampaignData] {
	return nstate.Group[CampaignData]{
		Name: GroupCampaign,
		Schema: getSchema(map[string]any{
			"dm_id":       getOwner("The dungeon master, samna_user.user_id."),
			"name":        getProperty("string", "The campaign name."),
			"description": getProperty("string", "What the campaign is about."),
			"is_active":   getProperty("boolean", "Whether the campaign is being played."),
			"settings":    getJSON("Character editing, sheet sharing, private notes and the experience mode."),
			"player_ids":  getList("The user ids seated at the table, each granted the Players claim."),
		}, "dm_id", "name"),
		DependsOn: []string{GroupProfile},
		Filters:   []string{"user_id"},
		Export:    exportCampaigns,
		Import:    importCampaign,
		Delete:    deleteCampaign,
	}
}

func getCampaignViews(ctx *nstate.Context, actor uuid.UUID, target string) ([]campaignView, error) {
	data, err := call(ctx, actor, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	views := make([]campaignView, 0)
	if len(data) > 0 && data[0] == '{' {
		var one campaignView
		if err := json.Unmarshal(data, &one); err != nil {
			return nil, err
		}
		return []campaignView{one}, nil
	}
	if err := json.Unmarshal(data, &views); err != nil {
		return nil, err
	}
	return views, nil
}

func exportCampaigns(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[CampaignData], error) {
	caller, err := getCaller(ctx)
	if err != nil {
		return nil, err
	}
	views, err := getCampaignViews(ctx, caller, "/api/campaign")
	if err != nil {
		return nil, err
	}
	if userID, ok := query.Filter["user_id"]; ok {
		kept := make([]campaignView, 0, len(views))
		for _, view := range views {
			if view.DmID.String() == userID {
				kept = append(kept, view)
			}
		}
		views = kept
	}
	return getRecords(ctx, GroupCampaign, query, views, func(view campaignView) uuid.UUID { return view.ID }, func(view campaignView) CampaignData {
		return CampaignData{
			DmID:        view.DmID.String(),
			Name:        view.Name,
			Description: view.Description,
			IsActive:    view.IsActive,
			Settings:    getRaw(view.Settings),
			PlayerIDs:   getStrings(view.PlayerIDs),
		}
	})
}

func importCampaign(ctx *nstate.Context, record nstate.Record[CampaignData]) (string, error) {
	dm, err := uuid.Parse(record.Data.DmID)
	if err != nil {
		return "", echo.NewHTTPError(http.StatusBadRequest, "dm_id invalid")
	}
	actor, err := getActor(ctx, &dm)
	if err != nil {
		return "", err
	}
	body := map[string]any{
		"name":        record.Data.Name,
		"description": record.Data.Description,
		"is_active":   record.Data.IsActive,
	}
	if record.Data.Settings != nil {
		body["settings"] = record.Data.Settings
	}
	target, method := "/api/campaign", http.MethodPost
	if record.ID != "" {
		target, method = "/api/campaign/"+record.ID, http.MethodPut
	}
	data, err := call(ctx, actor, method, target, body)
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	rctx := ctx.Request().Context()
	if err := putKey(rctx, GroupCampaign, record.Key, id); err != nil {
		return "", err
	}
	views, err := getCampaignViews(ctx, actor, "/api/campaign/"+id.String())
	if err != nil || len(views) == 0 {
		return id.String(), err
	}
	seated := map[string]bool{}
	for _, player := range views[0].PlayerIDs {
		seated[player.String()] = true
	}
	wanted := map[string]bool{}
	for _, player := range record.Data.PlayerIDs {
		wanted[player] = true
		if seated[player] || player == record.Data.DmID {
			continue
		}
		var email string
		if err := db.Instance().NewSelect().Model((*db.Profile)(nil)).Column("email").Where("user_id = ?", player).Where("sa_deleted_at IS NULL").Scan(rctx, &email); err != nil {
			return "", echo.NewHTTPError(http.StatusUnprocessableEntity, "player "+player+" has no profile to seat by")
		}
		if _, err := call(ctx, actor, http.MethodPost, "/api/campaign/"+id.String()+"/player", map[string]any{"email": email}); err != nil {
			return "", err
		}
	}
	for player := range seated {
		if wanted[player] {
			continue
		}
		if _, err := call(ctx, actor, http.MethodDelete, "/api/campaign/"+id.String()+"/player/"+player, nil); err != nil {
			return "", err
		}
	}
	return id.String(), nil
}

func deleteCampaign(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/campaign/"+id, nil)
	return err
}
