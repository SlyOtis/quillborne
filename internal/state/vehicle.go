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

const GroupVehicle = "vehicle"

type VehicleData struct {
	OwnerID         string          `json:"owner_id"`
	CampaignID      *string         `json:"campaign_id,omitempty"`
	Name            string          `json:"name"`
	System          string          `json:"system"`
	Template        string          `json:"template"`
	TemplateVersion int             `json:"template_version"`
	Layout          string          `json:"layout"`
	Components      json.RawMessage `json:"components,omitempty"`
	States          json.RawMessage `json:"states,omitempty"`
	Stats           json.RawMessage `json:"stats,omitempty"`
	Rulings         json.RawMessage `json:"rulings,omitempty"`
	Overlay         json.RawMessage `json:"overlay,omitempty"`
	Crew            json.RawMessage `json:"crew,omitempty"`
}

func getVehicleGroup() nstate.Group[VehicleData] {
	return nstate.Group[VehicleData]{
		Name: GroupVehicle,
		Schema: getSchema(map[string]any{
			"owner_id":         getOwner("The player who built it."),
			"campaign_id":      getRef(GroupCampaign),
			"name":             getProperty("string", "The vehicle name."),
			"system":           getProperty("string", "The vehicle rule system id."),
			"template":         getProperty("string", "The template key it was built from."),
			"template_version": getProperty("integer", "The version of the template it was built from."),
			"layout":           getProperty("string", "The deck layout key."),
			"components":       getJSON("The installed components."),
			"states":           getJSON("The hit points and condition of each component by component id."),
			"stats":            getJSON("The vehicle level statistics."),
			"rulings":          getJSON("The option chosen for each rules ambiguity by its id."),
			"overlay":          getJSON("The homebrew catalogue entries this vehicle alone carries."),
			"crew":             getJSON("Every crew member with their character and role; the character ids are those of the export and are mapped on import."),
		}, "owner_id", "system", "layout"),
		DependsOn: []string{GroupCampaign, GroupCharacter},
		Refs:      map[string]string{"campaign_id": GroupCampaign},
		Filters:   []string{"campaign_id", "user_id"},
		Export:    exportVehicles,
		Import:    importVehicle,
		Delete:    deleteVehicle,
	}
}

func putIDs(ctx context.Context, raw json.RawMessage, field string, group func(entry map[string]any) string) (json.RawMessage, error) {
	if raw == nil {
		return nil, nil
	}
	entries := make([]map[string]any, 0)
	if err := json.Unmarshal(raw, &entries); err != nil {
		return raw, nil
	}
	for _, entry := range entries {
		exported, _ := entry[field].(string)
		if exported == "" {
			continue
		}
		name := group(entry)
		if name == "" {
			continue
		}
		id, err := resolver{}.GetID(ctx, name, exported)
		if err != nil {
			return nil, err
		}
		if id != "" {
			entry[field] = id
		}
	}
	return json.Marshal(entries)
}

func exportVehicles(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[VehicleData], error) {
	rows := make([]db.Vehicle, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_VEHICLE, "vehicle", &rows, "vehicle.sa_created_at ASC, vehicle.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupVehicle, query, rows, func(row db.Vehicle) uuid.UUID { return row.ID }, func(row db.Vehicle) VehicleData {
		return VehicleData{
			OwnerID:         row.UserID.String(),
			CampaignID:      getText(row.CampaignID),
			Name:            row.Name,
			System:          row.System,
			Template:        row.Template,
			TemplateVersion: row.TemplateVersion,
			Layout:          row.Layout,
			Components:      getRaw(row.Components),
			States:          getRaw(row.States),
			Stats:           getRaw(row.Stats),
			Rulings:         getRaw(row.Rulings),
			Overlay:         getRaw(row.Overlay),
			Crew:            getRaw(row.Crew),
		}
	})
}

func importVehicle(ctx *nstate.Context, record nstate.Record[VehicleData]) (string, error) {
	owner, err := getOptionalID(&record.Data.OwnerID, "owner_id")
	if err != nil {
		return "", err
	}
	actor, err := getActor(ctx, owner)
	if err != nil {
		return "", err
	}
	rctx := ctx.Request().Context()
	crew, err := putIDs(rctx, record.Data.Crew, "character_id", func(map[string]any) string { return GroupCharacter })
	if err != nil {
		return "", err
	}
	body := map[string]any{
		"name":             record.Data.Name,
		"system":           record.Data.System,
		"template":         record.Data.Template,
		"template_version": record.Data.TemplateVersion,
		"layout":           record.Data.Layout,
	}
	for name, raw := range map[string]json.RawMessage{"components": record.Data.Components, "states": record.Data.States, "stats": record.Data.Stats, "rulings": record.Data.Rulings, "overlay": record.Data.Overlay, "crew": crew} {
		if raw != nil {
			body[name] = raw
		}
	}
	if record.ID == "" {
		if record.Data.CampaignID != nil {
			body["campaign_id"] = *record.Data.CampaignID
		}
		data, err := call(ctx, actor, http.MethodPost, "/api/vehicle", body)
		if err != nil {
			return "", err
		}
		id, err := getID(data)
		if err != nil {
			return "", err
		}
		return id.String(), putKey(rctx, GroupVehicle, record.Key, id)
	}
	id, err := getRecordID(record.ID)
	if err != nil {
		return "", err
	}
	current := db.Vehicle{ID: id}
	if err := db.Instance().NewSelect().Model(&current).Column("revision").WherePK().Scan(rctx); err != nil {
		return "", echo.NewHTTPError(http.StatusNotFound, "Not found")
	}
	body["revision"] = current.Revision
	body["note"] = "Imported"
	if _, err := call(ctx, actor, http.MethodPut, "/api/vehicle/"+record.ID, body); err != nil {
		return "", err
	}
	return record.ID, putKey(rctx, GroupVehicle, record.Key, id)
}

func deleteVehicle(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/vehicle/"+id, nil)
	return err
}
