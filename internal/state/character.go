package state

import (
	"encoding/json"
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

const GroupCharacter = "character"

type CharacterData struct {
	OwnerID    string          `json:"owner_id"`
	CampaignID *string         `json:"campaign_id,omitempty"`
	Character  json.RawMessage `json:"character"`
	Metadata   json.RawMessage `json:"metadata,omitempty"`
	IsPublic   bool            `json:"is_public"`
}

func getCharacterGroup() nstate.Group[CharacterData] {
	return nstate.Group[CharacterData]{
		Name: GroupCharacter,
		Schema: getSchema(map[string]any{
			"owner_id":    getOwner("The player the character belongs to."),
			"campaign_id": getRef(GroupCampaign),
			"character":   getJSON("The whole sheet as the rules engine reads it."),
			"metadata":    getJSON("Name, level, class, race, status, tags, version and the template flag shown in lists."),
			"is_public":   getProperty("boolean", "Whether anyone signed in may read the sheet."),
		}, "owner_id", "character"),
		DependsOn: []string{GroupCampaign},
		Refs:      map[string]string{"campaign_id": GroupCampaign},
		Filters:   []string{"campaign_id", "user_id"},
		Export:    exportCharacters,
		Import:    importCharacter,
		Delete:    deleteCharacter,
	}
}

func exportCharacters(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[CharacterData], error) {
	rows := make([]db.Character, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_CHARACTER, "character", &rows, "character.sa_created_at ASC, character.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupCharacter, query, rows, func(row db.Character) uuid.UUID { return row.ID }, func(row db.Character) CharacterData {
		return CharacterData{
			OwnerID:    row.UserID.String(),
			CampaignID: getText(row.CampaignID),
			Character:  getRaw(row.Sheet),
			Metadata:   getRaw(row.Metadata),
			IsPublic:   row.IsPublic,
		}
	})
}

func getMetadata(record CharacterData) (map[string]any, error) {
	metadata := map[string]any{}
	if record.Metadata != nil {
		if err := json.Unmarshal(record.Metadata, &metadata); err != nil {
			return nil, echo.NewHTTPError(http.StatusBadRequest, "metadata must be an object")
		}
	}
	metadata["is_public"] = record.IsPublic
	return metadata, nil
}

func importCharacter(ctx *nstate.Context, record nstate.Record[CharacterData]) (string, error) {
	owner, err := getOptionalID(&record.Data.OwnerID, "owner_id")
	if err != nil {
		return "", err
	}
	actor, err := getActor(ctx, owner)
	if err != nil {
		return "", err
	}
	if record.Data.Character == nil {
		return "", echo.NewHTTPError(http.StatusBadRequest, "character required")
	}
	metadata, err := getMetadata(record.Data)
	if err != nil {
		return "", err
	}
	campaignID, err := getOptionalID(record.Data.CampaignID, "campaign_id")
	if err != nil {
		return "", err
	}
	rctx := ctx.Request().Context()
	body := map[string]any{"character": record.Data.Character, "metadata": metadata}
	if record.ID == "" {
		if campaignID != nil {
			body["campaign_id"] = campaignID
		}
		data, err := call(ctx, actor, http.MethodPost, "/api/character", body)
		if err != nil {
			return "", err
		}
		id, err := getID(data)
		if err != nil {
			return "", err
		}
		return id.String(), putKey(rctx, GroupCharacter, record.Key, id)
	}
	id, err := getRecordID(record.ID)
	if err != nil {
		return "", err
	}
	if _, err := call(ctx, actor, http.MethodPut, "/api/character/"+record.ID, body); err != nil {
		return "", err
	}
	current := db.Character{ID: id}
	if err := db.Instance().NewSelect().Model(&current).Column("campaign_id").WherePK().Scan(rctx); err != nil {
		return "", err
	}
	switch {
	case campaignID != nil && (current.CampaignID == nil || *current.CampaignID != *campaignID):
		if _, err := call(ctx, actor, http.MethodPost, "/api/campaign/"+campaignID.String()+"/character/"+record.ID, nil); err != nil {
			return "", err
		}
	case campaignID == nil && current.CampaignID != nil:
		if _, err := call(ctx, actor, http.MethodDelete, "/api/campaign/"+current.CampaignID.String()+"/character/"+record.ID, nil); err != nil {
			return "", err
		}
	}
	return record.ID, putKey(rctx, GroupCharacter, record.Key, id)
}

func deleteCharacter(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/character/"+id, nil)
	return err
}
