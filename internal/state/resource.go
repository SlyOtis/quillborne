package state

import (
	"encoding/json"
	"net/http"
	"os"
	"slices"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

const GroupResource = "resource"

type ResourceData struct {
	Kind           string          `json:"kind"`
	UserID         string          `json:"user_id"`
	OwnerID        *string         `json:"owner_id,omitempty"`
	ParentID       *string         `json:"parent_id,omitempty"`
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	ShareUsers     []string        `json:"share_users"`
	ShareCampaigns []string        `json:"share_campaigns"`
	Fields         json.RawMessage `json:"fields,omitempty"`
}

func getResourceGroup() nstate.Group[ResourceData] {
	return nstate.Group[ResourceData]{
		Name: GroupResource,
		Schema: getSchema(map[string]any{
			"kind":            getProperty("string", "Which of the five kinds the page is: entries, items, locations, maps or sessions. A weapon or armor is an item."),
			"user_id":         getOwner("The player who wrote it down."),
			"owner_id":        getRef(GroupCampaign),
			"parent_id":       getRef(GroupResource),
			"name":            getProperty("string", "The name shown at the head."),
			"description":     getProperty("string", "The lede under the name."),
			"share_users":     getList("The players it is shared with by name."),
			"share_campaigns": getList("The campaigns whose tables read it."),
			"fields":          getJSON("Everything else the page carries: tags, facts, pictures, frame, block document and the fields of its own kind, an item's grants among them."),
		}, "kind", "user_id", "name"),
		DependsOn: []string{GroupCampaign},
		Refs:      map[string]string{"owner_id": GroupCampaign, "parent_id": GroupResource},
		Filters:   []string{"owner_id", "user_id"},
		Export:    exportResources,
		Import:    importResource,
		Delete:    deleteResource,
	}
}

func exportResources(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[ResourceData], error) {
	rows := make([]db.Resource, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_RESOURCE, "resource", &rows, "resource.sa_created_at ASC, resource.id ASC"); err != nil {
		return nil, err
	}
	rows = slices.DeleteFunc(rows, func(row db.Resource) bool { return row.ParentID == row.ID })
	return getRecords(ctx, GroupResource, query, rows, func(row db.Resource) uuid.UUID { return row.ID }, func(row db.Resource) ResourceData {
		data := ResourceData{
			Kind:           row.Kind,
			UserID:         row.UserID.String(),
			Name:           row.Name,
			Description:    row.Description,
			ShareUsers:     getStrings(row.ShareUsers),
			ShareCampaigns: getShareKeys(ctx.Request().Context(), row.ShareCampaigns),
			Fields:         getRaw(row.Fields),
		}
		if home, err := uuid.Parse(os.Getenv("SERVER_OWNER_ID")); err == nil && row.OwnerID != home {
			data.OwnerID = getText(&row.OwnerID)
		}
		if row.ParentID != row.RootID {
			data.ParentID = getText(&row.ParentID)
		}
		return data
	})
}

func importResource(ctx *nstate.Context, record nstate.Record[ResourceData]) (string, error) {
	owner, err := getOptionalID(&record.Data.UserID, "user_id")
	if err != nil {
		return "", err
	}
	actor, err := getActor(ctx, owner)
	if err != nil {
		return "", err
	}
	body := map[string]any{}
	if record.Data.Fields != nil {
		if err := json.Unmarshal(record.Data.Fields, &body); err != nil {
			return "", echo.NewHTTPError(http.StatusBadRequest, "fields must be an object")
		}
	}
	rctx := ctx.Request().Context()
	share, err := getShare(rctx, record.Data.ShareUsers, record.Data.ShareCampaigns)
	if err != nil {
		return "", err
	}
	for key, value := range share {
		body[key] = value
	}
	if mapID, ok := body["map_id"].(string); ok && mapID != "" {
		if id, err := (resolver{}).GetID(rctx, GroupCampaignMap, mapID); err == nil && id != "" {
			body["map_id"] = id
		}
	}
	body["kind"] = record.Data.Kind
	body["name"] = record.Data.Name
	body["description"] = record.Data.Description
	if record.Data.OwnerID != nil {
		body["owner_id"] = *record.Data.OwnerID
	}
	if record.Data.ParentID != nil {
		body["parent_id"] = *record.Data.ParentID
	}
	target, method := "/api/resource", http.MethodPost
	if record.ID != "" {
		target, method = "/api/resource/"+record.ID, http.MethodPut
	}
	data, err := call(ctx, actor, method, target, body)
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	return id.String(), putKey(ctx.Request().Context(), GroupResource, record.Key, id)
}

func deleteResource(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/resource/"+id, nil)
	return err
}
