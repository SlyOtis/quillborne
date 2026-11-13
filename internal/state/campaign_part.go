package state

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

const (
	GroupCampaignMap = "campaign_map"
	GroupEncounter   = "encounter"
	GroupSong        = "song"
	GroupChatEntry   = "chat_entry"
)

var markerGroups = map[string]string{
	"place":     GroupResource,
	"item":      GroupResource,
	"session":   GroupResource,
	"character": GroupCharacter,
}

type CampaignMapData struct {
	CampaignID  string          `json:"campaign_id"`
	OwnerID     string          `json:"owner_id"`
	Title       string          `json:"title"`
	ImageURL    string          `json:"image_url,omitempty"`
	Layers      json.RawMessage `json:"layers,omitempty"`
	Markers     json.RawMessage `json:"markers,omitempty"`
	IsVisible   bool            `json:"is_visible"`
	MinZoom     float64         `json:"min_zoom"`
	MaxZoom     float64         `json:"max_zoom"`
	Plan        json.RawMessage `json:"plan,omitempty"`
	ParentMapID *string         `json:"parent_map_id,omitempty"`
}

type EncounterData struct {
	CampaignID     string          `json:"campaign_id"`
	OwnerID        string          `json:"owner_id"`
	Title          string          `json:"title"`
	Combatants     json.RawMessage `json:"combatants,omitempty"`
	Round          int             `json:"round"`
	Turn           int             `json:"turn"`
	IsActive       bool            `json:"is_active"`
	ShareUsers     []string        `json:"share_users"`
	ShareCampaigns []string        `json:"share_campaigns"`
}

type SongData struct {
	CampaignID     string   `json:"campaign_id"`
	OwnerID        string   `json:"owner_id"`
	Title          string   `json:"title"`
	Address        string   `json:"address"`
	Duration       float64  `json:"duration"`
	ShareUsers     []string `json:"share_users"`
	ShareCampaigns []string `json:"share_campaigns"`
}

type ChatEntryData struct {
	CampaignID string          `json:"campaign_id"`
	AuthorID   string          `json:"author_id"`
	AuthorName string          `json:"author_name"`
	Kind       string          `json:"kind"`
	Body       string          `json:"body"`
	Query      string          `json:"query,omitempty"`
	IsHidden   bool            `json:"is_hidden"`
	CardKind   string          `json:"card_kind,omitempty"`
	RollKind   string          `json:"roll_kind,omitempty"`
	Formula    string          `json:"formula,omitempty"`
	Dice       json.RawMessage `json:"dice,omitempty"`
	Roll       float64         `json:"roll"`
	Total      float64         `json:"total"`
}

func getShare(ctx context.Context, users, campaigns []string) (map[string]any, error) {
	if users == nil {
		users = []string{}
	}
	resolved := make([]string, 0, len(campaigns))
	for _, campaign := range campaigns {
		id, err := resolver{}.GetID(ctx, GroupCampaign, campaign)
		if err != nil {
			return nil, err
		}
		if id == "" {
			id = campaign
		}
		resolved = append(resolved, id)
	}
	return map[string]any{"share_users": users, "share_campaigns": resolved}, nil
}

func importPart(ctx *nstate.Context, group string, owner *uuid.UUID, campaignID string, record, key string, part string, body map[string]any) (string, error) {
	actor, err := getActor(ctx, owner)
	if err != nil {
		return "", err
	}
	if _, err := uuid.Parse(campaignID); err != nil {
		return "", echo.NewHTTPError(http.StatusBadRequest, "campaign_id invalid")
	}
	target, method := "/api/campaign/"+campaignID+"/"+part, http.MethodPost
	if record != "" {
		target, method = target+"/"+record, http.MethodPut
	}
	data, err := call(ctx, actor, method, target, body)
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	return id.String(), putKey(ctx.Request().Context(), group, key, id)
}

func deletePart[R any](ctx *nstate.Context, id string, part string, campaign func(*R) uuid.UUID) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	rowID, err := getRecordID(id)
	if err != nil {
		return err
	}
	var row R
	if err := db.Instance().NewSelect().Model(&row).Where("id = ?", rowID).Scan(ctx.Request().Context()); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "Not found")
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/campaign/"+campaign(&row).String()+"/"+part+"/"+id, nil)
	return err
}

func getCampaignMapGroup() nstate.Group[CampaignMapData] {
	return nstate.Group[CampaignMapData]{
		Name: GroupCampaignMap,
		Schema: getSchema(map[string]any{
			"campaign_id":   getRef(GroupCampaign),
			"owner_id":      getOwner("The dungeon master who drew it."),
			"title":         getProperty("string", "The map title."),
			"image_url":     getProperty("string", "The stored address of the map picture."),
			"layers":        getJSON("The image layers drawn over the map."),
			"markers":       getJSON("The markers placed on the map, each pointing at a record by record_kind and record_id; the ids are those of the export and are mapped on import."),
			"is_visible":    getProperty("boolean", "Whether the players see the map."),
			"min_zoom":      getProperty("number", "The smallest zoom the map allows."),
			"max_zoom":      getProperty("number", "The largest zoom the map allows."),
			"plan":          getJSON("The drawn plan as a nimap document, shown in 3D."),
			"parent_map_id": getRef(GroupCampaignMap),
		}, "campaign_id", "owner_id", "title"),
		DependsOn: []string{GroupCampaign, GroupCharacter, GroupResource},
		Refs:      map[string]string{"campaign_id": GroupCampaign, "parent_map_id": GroupCampaignMap},
		Filters:   []string{"campaign_id"},
		Export:    exportCampaignMaps,
		Import:    importCampaignMap,
		Delete: func(ctx *nstate.Context, id string) error {
			return deletePart(ctx, id, "map", func(row *db.CampaignMap) uuid.UUID { return row.CampaignID })
		},
	}
}

func exportCampaignMaps(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[CampaignMapData], error) {
	rows := make([]db.CampaignMap, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_CAMPAIGN_MAP, "campaign_map", &rows, "campaign_map.sa_created_at ASC, campaign_map.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupCampaignMap, query, rows, func(row db.CampaignMap) uuid.UUID { return row.ID }, func(row db.CampaignMap) CampaignMapData {
		data := CampaignMapData{
			CampaignID: row.CampaignID.String(),
			OwnerID:    row.UserID.String(),
			Title:      row.Title,
			ImageURL:   row.ImageURL,
			Layers:     getRaw(row.Layers),
			Markers:    getRaw(row.Markers),
			IsVisible:  row.IsVisible,
			MinZoom:    row.MinZoom,
			MaxZoom:    row.MaxZoom,
			Plan:       getRaw(row.Plan),
		}
		if row.ParentID != row.ID && row.ParentID != uuid.Nil {
			data.ParentMapID = getText(&row.ParentID)
		}
		return data
	})
}

func importCampaignMap(ctx *nstate.Context, record nstate.Record[CampaignMapData]) (string, error) {
	owner, err := getOptionalID(&record.Data.OwnerID, "owner_id")
	if err != nil {
		return "", err
	}
	markers, err := putIDs(ctx.Request().Context(), record.Data.Markers, "record_id", func(entry map[string]any) string {
		kind, _ := entry["record_kind"].(string)
		return markerGroups[kind]
	})
	if err != nil {
		return "", err
	}
	body := map[string]any{
		"title":      record.Data.Title,
		"image_url":  record.Data.ImageURL,
		"is_visible": record.Data.IsVisible,
		"min_zoom":   record.Data.MinZoom,
		"max_zoom":   record.Data.MaxZoom,
	}
	if record.Data.Layers != nil {
		body["layers"] = record.Data.Layers
	}
	if markers != nil {
		body["markers"] = markers
	}
	if record.Data.Plan != nil {
		body["plan"] = record.Data.Plan
	}
	if record.Data.ParentMapID != nil {
		body["parent_map_id"] = *record.Data.ParentMapID
	}
	return importPart(ctx, GroupCampaignMap, owner, record.Data.CampaignID, record.ID, record.Key, "map", body)
}

func getEncounterGroup() nstate.Group[EncounterData] {
	return nstate.Group[EncounterData]{
		Name: GroupEncounter,
		Schema: getSchema(map[string]any{
			"campaign_id":     getRef(GroupCampaign),
			"owner_id":        getOwner("The player who set it up."),
			"title":           getProperty("string", "The encounter title."),
			"combatants":      getJSON("Every combatant with its kind, initiative, hit points and conditions; character ids are those of the export and are mapped on import."),
			"round":           getProperty("integer", "The current round."),
			"turn":            getProperty("integer", "The index of the combatant whose turn it is."),
			"is_active":       getProperty("boolean", "Whether the encounter is running."),
			"share_users":     getList("The players it is shared with by name."),
			"share_campaigns": getList("The campaigns whose tables read it."),
		}, "campaign_id", "owner_id", "title"),
		DependsOn: []string{GroupCampaign, GroupCharacter},
		Refs:      map[string]string{"campaign_id": GroupCampaign},
		Filters:   []string{"campaign_id"},
		Export:    exportEncounters,
		Import:    importEncounter,
		Delete: func(ctx *nstate.Context, id string) error {
			return deletePart(ctx, id, "encounter", func(row *db.Encounter) uuid.UUID { return row.CampaignID })
		},
	}
}

func exportEncounters(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[EncounterData], error) {
	rows := make([]db.Encounter, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_ENCOUNTER, "encounter", &rows, "encounter.sa_created_at ASC, encounter.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupEncounter, query, rows, func(row db.Encounter) uuid.UUID { return row.ID }, func(row db.Encounter) EncounterData {
		return EncounterData{
			CampaignID:     row.CampaignID.String(),
			OwnerID:        row.UserID.String(),
			Title:          row.Title,
			Combatants:     getRaw(row.Combatants),
			Round:          row.Round,
			Turn:           row.Turn,
			IsActive:       row.IsActive,
			ShareUsers:     getStrings(row.ShareUsers),
			ShareCampaigns: getStrings(row.ShareCampaigns),
		}
	})
}

func importEncounter(ctx *nstate.Context, record nstate.Record[EncounterData]) (string, error) {
	owner, err := getOptionalID(&record.Data.OwnerID, "owner_id")
	if err != nil {
		return "", err
	}
	combatants, err := putIDs(ctx.Request().Context(), record.Data.Combatants, "character_id", func(map[string]any) string { return GroupCharacter })
	if err != nil {
		return "", err
	}
	body, err := getShare(ctx.Request().Context(), record.Data.ShareUsers, record.Data.ShareCampaigns)
	if err != nil {
		return "", err
	}
	body["title"] = record.Data.Title
	body["round"] = record.Data.Round
	body["turn"] = record.Data.Turn
	body["is_active"] = record.Data.IsActive
	if combatants != nil {
		body["combatants"] = combatants
	}
	return importPart(ctx, GroupEncounter, owner, record.Data.CampaignID, record.ID, record.Key, "encounter", body)
}

func getSongGroup() nstate.Group[SongData] {
	return nstate.Group[SongData]{
		Name: GroupSong,
		Schema: getSchema(map[string]any{
			"campaign_id":     getRef(GroupCampaign),
			"owner_id":        getOwner("The player who added it."),
			"title":           getProperty("string", "The song title."),
			"address":         getProperty("string", "The stored address of the audio file."),
			"duration":        getProperty("number", "The length in seconds."),
			"share_users":     getList("The players it is shared with by name."),
			"share_campaigns": getList("The campaigns whose tables hear it."),
		}, "campaign_id", "owner_id", "title"),
		DependsOn: []string{GroupCampaign},
		Refs:      map[string]string{"campaign_id": GroupCampaign},
		Filters:   []string{"campaign_id"},
		Export:    exportSongs,
		Import:    importSong,
		Delete: func(ctx *nstate.Context, id string) error {
			return deletePart(ctx, id, "song", func(row *db.Song) uuid.UUID { return row.CampaignID })
		},
	}
}

func exportSongs(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[SongData], error) {
	rows := make([]db.Song, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_SONG, "song", &rows, "song.sa_created_at ASC, song.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupSong, query, rows, func(row db.Song) uuid.UUID { return row.ID }, func(row db.Song) SongData {
		return SongData{
			CampaignID:     row.CampaignID.String(),
			OwnerID:        row.UserID.String(),
			Title:          row.Title,
			Address:        row.Address,
			Duration:       row.Duration,
			ShareUsers:     getStrings(row.ShareUsers),
			ShareCampaigns: getStrings(row.ShareCampaigns),
		}
	})
}

func importSong(ctx *nstate.Context, record nstate.Record[SongData]) (string, error) {
	owner, err := getOptionalID(&record.Data.OwnerID, "owner_id")
	if err != nil {
		return "", err
	}
	body, err := getShare(ctx.Request().Context(), record.Data.ShareUsers, record.Data.ShareCampaigns)
	if err != nil {
		return "", err
	}
	body["title"] = record.Data.Title
	body["address"] = record.Data.Address
	body["duration"] = record.Data.Duration
	return importPart(ctx, GroupSong, owner, record.Data.CampaignID, record.ID, record.Key, "song", body)
}

func getChatEntryGroup() nstate.Group[ChatEntryData] {
	return nstate.Group[ChatEntryData]{
		Name: GroupChatEntry,
		Schema: getSchema(map[string]any{
			"campaign_id": getRef(GroupCampaign),
			"author_id":   getOwner("The user id of the author."),
			"author_name": getProperty("string", "The name the author posted under."),
			"kind":        getProperty("string", "message or roll."),
			"body":        getProperty("string", "The message text."),
			"query":       getProperty("string", "The question asked of the assistant."),
			"is_hidden":   getProperty("boolean", "Whether only the dungeon master and the author read the entry."),
			"card_kind":   getProperty("string", "The card the entry is drawn as."),
			"roll_kind":   getProperty("string", "What the roll was for."),
			"formula":     getProperty("string", "The dice formula rolled."),
			"dice":        getJSON("Each die as it landed."),
			"roll":        getProperty("number", "The sum of the dice."),
			"total":       getProperty("number", "The roll with its modifiers."),
		}, "campaign_id", "author_id", "kind"),
		DependsOn: []string{GroupCampaign},
		Refs:      map[string]string{"campaign_id": GroupCampaign},
		Filters:   []string{"campaign_id"},
		Export:    exportChatEntries,
		Import:    importChatEntry,
		Delete: func(ctx *nstate.Context, id string) error {
			return deletePart(ctx, id, "chat", func(row *db.ChatEntry) uuid.UUID { return row.CampaignID })
		},
	}
}

func exportChatEntries(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[ChatEntryData], error) {
	rows := make([]db.ChatEntry, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_CHAT_ENTRY, "chat_entry", &rows, "chat_entry.sa_created_at ASC, chat_entry.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupChatEntry, query, rows, func(row db.ChatEntry) uuid.UUID { return row.ID }, func(row db.ChatEntry) ChatEntryData {
		return ChatEntryData{
			CampaignID: row.CampaignID.String(),
			AuthorID:   row.AuthorID.String(),
			AuthorName: row.AuthorName,
			Kind:       row.Kind,
			Body:       row.Body,
			Query:      row.Query,
			IsHidden:   row.IsHidden,
			CardKind:   row.CardKind,
			RollKind:   row.RollKind,
			Formula:    row.Formula,
			Dice:       getRaw(row.Dice),
			Roll:       row.Roll,
			Total:      row.Total,
		}
	})
}

func importChatEntry(ctx *nstate.Context, record nstate.Record[ChatEntryData]) (string, error) {
	author, err := getOptionalID(&record.Data.AuthorID, "author_id")
	if err != nil {
		return "", err
	}
	body := map[string]any{
		"author_name": record.Data.AuthorName,
		"kind":        record.Data.Kind,
		"body":        record.Data.Body,
		"query":       record.Data.Query,
		"is_hidden":   record.Data.IsHidden,
		"card_kind":   record.Data.CardKind,
		"roll_kind":   record.Data.RollKind,
		"formula":     record.Data.Formula,
		"roll":        record.Data.Roll,
		"total":       record.Data.Total,
	}
	if record.Data.Dice != nil {
		body["dice"] = record.Data.Dice
	}
	return importPart(ctx, GroupChatEntry, author, record.Data.CampaignID, record.ID, record.Key, "chat", body)
}
