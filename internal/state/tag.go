package state

import (
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

const (
	GroupTag       = "tag"
	GroupTagObject = "tag_object"
)

type TagData struct {
	Name string `json:"name"`
}

type TagObjectData struct {
	TagID      string `json:"tag_id"`
	ObjectType string `json:"object_type"`
	ObjectID   string `json:"object_id"`
}

func getTagGroup() nstate.Group[TagData] {
	return nstate.Group[TagData]{
		Name: GroupTag,
		Schema: getSchema(map[string]any{
			"name": getProperty("string", "The display name, one tag per lowercase form."),
		}, "name"),
		Export: exportTags,
		Import: importTag,
		Delete: deleteTag,
	}
}

func exportTags(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[TagData], error) {
	rows := make([]db.Tag, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_TAG, "tag", &rows, "tag.name ASC, tag.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupTag, query, rows, func(row db.Tag) uuid.UUID { return row.ID }, func(row db.Tag) TagData {
		return TagData{Name: row.Name}
	})
}

func importTag(ctx *nstate.Context, record nstate.Record[TagData]) (string, error) {
	actor, err := getCaller(ctx)
	if err != nil {
		return "", err
	}
	body := map[string]any{"name": record.Data.Name}
	target, method := "/api/tag", http.MethodPost
	if record.ID != "" {
		target, method = "/api/tag/"+record.ID, http.MethodPut
	}
	data, err := call(ctx, actor, method, target, body)
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	return id.String(), putKey(ctx.Request().Context(), GroupTag, record.Key, id)
}

func deleteTag(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/tag/"+id, nil)
	return err
}

func getTagObjectGroup() nstate.Group[TagObjectData] {
	return nstate.Group[TagObjectData]{
		Name: GroupTagObject,
		Schema: getSchema(map[string]any{
			"tag_id":      getRef(GroupTag),
			"object_type": getProperty("string", "The table of the tagged row, public.<table>."),
			"object_id":   getOwner("The tagged row, by the id it had where the export was made."),
		}, "tag_id", "object_type", "object_id"),
		DependsOn: []string{GroupTag, GroupCampaign, GroupCharacter, GroupVehicle, GroupResource, GroupAsset},
		Refs:      map[string]string{"tag_id": GroupTag},
		Export:    exportTagObjects,
		Import:    importTagObject,
		Delete:    deleteTagObject,
	}
}

func exportTagObjects(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[TagObjectData], error) {
	rows := make([]db.TagObject, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_TAG_OBJECT, "tag_object", &rows, "tag_object.sa_created_at ASC, tag_object.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupTagObject, query, rows, func(row db.TagObject) uuid.UUID { return row.ID }, func(row db.TagObject) TagObjectData {
		return TagObjectData{TagID: row.TagID.String(), ObjectType: row.ObjectType, ObjectID: row.ObjectID.String()}
	})
}

func importTagObject(ctx *nstate.Context, record nstate.Record[TagObjectData]) (string, error) {
	actor, err := getCaller(ctx)
	if err != nil {
		return "", err
	}
	rctx := ctx.Request().Context()
	objectID, err := getObjectID(rctx, record.Data.ObjectType, record.Data.ObjectID)
	if err != nil {
		return "", err
	}
	if record.ID != "" {
		return record.ID, nil
	}
	data, err := call(ctx, actor, http.MethodPost, "/api/tag/"+record.Data.TagID+"/object", map[string]any{"object_type": record.Data.ObjectType, "object_id": objectID})
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	return id.String(), putKey(rctx, GroupTagObject, record.Key, id)
}

func deleteTagObject(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	rowID, err := getRecordID(id)
	if err != nil {
		return err
	}
	row := db.TagObject{ID: rowID}
	if err := db.Instance().NewSelect().Model(&row).WherePK().Scan(ctx.Request().Context()); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "Not found")
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/tag/"+row.TagID.String()+"/object?object_type="+row.ObjectType+"&object_id="+row.ObjectID.String(), nil)
	return err
}
