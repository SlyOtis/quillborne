package state

import (
	"encoding/json"
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	nstate "github.com/nimling/nimbody/state"
)

const GroupMonster = "monster"

type MonsterData struct {
	OwnerID     string          `json:"owner_id"`
	IsPublic    bool            `json:"is_public"`
	System      string          `json:"system"`
	Name        string          `json:"name"`
	Size        string          `json:"size"`
	Type        string          `json:"type"`
	Alignment   string          `json:"alignment"`
	Challenge   float64         `json:"challenge"`
	Stats       json.RawMessage `json:"stats,omitempty"`
	Description string          `json:"description,omitempty"`
	Image       string          `json:"image,omitempty"`
}

func getMonsterGroup() nstate.Group[MonsterData] {
	return nstate.Group[MonsterData]{
		Name: GroupMonster,
		Schema: getSchema(map[string]any{
			"owner_id":    getOwner("The player who made it."),
			"is_public":   getProperty("boolean", "Whether every signed in player reads it; a private monster is its maker's homebrew."),
			"system":      getProperty("string", "The monster rule system id."),
			"name":        getProperty("string", "The monster name."),
			"size":        getProperty("string", "The size id from the monster system."),
			"type":        getProperty("string", "The creature type id from the monster system."),
			"alignment":   getProperty("string", "The alignment id from the monster system."),
			"challenge":   getProperty("number", "The challenge rating as a number, a quarter as 0.25."),
			"stats":       getJSON("The rest of the stat block: sub-types, armor class, hit dice, speeds, abilities, proficiencies, senses, languages, defences, habitats, the legendary, mythic and lair flags, traits and actions."),
			"description": getProperty("string", "The lore as a block document."),
			"image":       getProperty("string", "The portrait as an asset address."),
		}, "owner_id", "system", "name"),
		Filters: []string{"user_id"},
		Export:  exportMonsters,
		Import:  importMonster,
		Delete:  deleteMonster,
	}
}

func exportMonsters(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[MonsterData], error) {
	rows := make([]db.Monster, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_MONSTER, "monster", &rows, "monster.sa_created_at ASC, monster.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupMonster, query, rows, func(row db.Monster) uuid.UUID { return row.ID }, func(row db.Monster) MonsterData {
		return MonsterData{
			OwnerID:     row.UserID.String(),
			IsPublic:    row.IsPublic,
			System:      row.System,
			Name:        row.Name,
			Size:        row.Size,
			Type:        row.Type,
			Alignment:   row.Alignment,
			Challenge:   row.Challenge,
			Stats:       getRaw(row.Stats),
			Description: row.Description,
			Image:       row.Image,
		}
	})
}

func importMonster(ctx *nstate.Context, record nstate.Record[MonsterData]) (string, error) {
	owner, err := getOptionalID(&record.Data.OwnerID, "owner_id")
	if err != nil {
		return "", err
	}
	actor, err := getActor(ctx, owner)
	if err != nil {
		return "", err
	}
	body := map[string]any{
		"is_public":   record.Data.IsPublic,
		"system":      record.Data.System,
		"name":        record.Data.Name,
		"size":        record.Data.Size,
		"type":        record.Data.Type,
		"alignment":   record.Data.Alignment,
		"challenge":   record.Data.Challenge,
		"description": record.Data.Description,
		"image":       record.Data.Image,
	}
	if record.Data.Stats != nil {
		body["stats"] = record.Data.Stats
	}
	rctx := ctx.Request().Context()
	if record.ID == "" {
		data, err := call(ctx, actor, http.MethodPost, "/api/monster", body)
		if err != nil {
			return "", err
		}
		id, err := getID(data)
		if err != nil {
			return "", err
		}
		return id.String(), putKey(rctx, GroupMonster, record.Key, id)
	}
	id, err := getRecordID(record.ID)
	if err != nil {
		return "", err
	}
	if _, err := call(ctx, actor, http.MethodPut, "/api/monster/"+record.ID, body); err != nil {
		return "", err
	}
	return record.ID, putKey(rctx, GroupMonster, record.Key, id)
}

func deleteMonster(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/monster/"+id, nil)
	return err
}
