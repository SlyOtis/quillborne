package state

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
)

const (
	GroupAsset       = "asset"
	GroupObjectAsset = "object_asset"
)

type AssetData struct {
	Name        string          `json:"name"`
	Description *string         `json:"description,omitempty"`
	MimeType    string          `json:"mime_type"`
	Type        *string         `json:"type,omitempty"`
	Index       int             `json:"index"`
	Icon        *string         `json:"icon,omitempty"`
	ParentID    *string         `json:"parent_id,omitempty"`
	CampaignID  *string         `json:"campaign_id,omitempty"`
	BannerID    *string         `json:"banner_id,omitempty"`
	Properties  json.RawMessage `json:"properties,omitempty"`
	Document    json.RawMessage `json:"document,omitempty"`
	UploadedBy  string          `json:"uploaded_by"`
}

type ObjectAssetData struct {
	AssetID    string          `json:"asset_id"`
	ObjectType string          `json:"object_type"`
	ObjectID   string          `json:"object_id"`
	Properties json.RawMessage `json:"properties,omitempty"`
}

func getAssetGroup() nstate.Group[AssetData] {
	return nstate.Group[AssetData]{
		Name: GroupAsset,
		Schema: getSchema(map[string]any{
			"name":        getProperty("string", "The display name."),
			"description": getProperty("string", "What the asset holds."),
			"mime_type":   getProperty("string", "The media type; inode/directory for a folder, application/vnd.mar.document+json for a block document."),
			"type":        getProperty("string", "The classification: folder, document, image, audio."),
			"index":       getProperty("integer", "The display order among siblings."),
			"icon":        getProperty("string", "An emoji or an icon name."),
			"parent_id":   getRef(GroupAsset),
			"campaign_id": getRef(GroupCampaign),
			"banner_id":   getRef(GroupAsset),
			"properties":  getJSON("Free form customization owned by the reader."),
			"document":    getJSON("The block document of a document asset."),
			"uploaded_by": getOwner("The player who stored it."),
		}, "name", "mime_type", "uploaded_by"),
		DependsOn: []string{GroupCampaign},
		Refs:      map[string]string{"parent_id": GroupAsset, "campaign_id": GroupCampaign, "banner_id": GroupAsset},
		Filters:   []string{"campaign_id"},
		Export:    exportAssets,
		Import:    importAsset,
		Delete:    deleteAsset,
		Blobs: nstate.Blobs[AssetData]{
			Get: getAssetBlobs,
			Put: putAssetBlob,
		},
	}
}

type assetRoot struct {
	ID   uuid.UUID `bun:"id"`
	Slug string    `bun:"slug"`
}

func getAssetRoots(ctx *nstate.Context) (map[uuid.UUID]string, error) {
	roots := make([]assetRoot, 0)
	if err := db.Instance().NewRaw(`SELECT id, slug FROM asset WHERE slug IS NOT NULL AND sa_deleted_at IS NULL`).Scan(ctx.Request().Context(), &roots); err != nil {
		return nil, err
	}
	out := map[uuid.UUID]string{}
	for _, root := range roots {
		out[root.ID] = root.Slug
	}
	return out, nil
}

func exportAssets(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[AssetData], error) {
	caller, err := getCaller(ctx)
	if err != nil {
		return nil, err
	}
	roots, err := getAssetRoots(ctx)
	if err != nil {
		return nil, err
	}
	rows := make([]db.Asset, 0)
	q := db.Instance().NewSelect().Model(&rows).Where("asset.sa_deleted_at IS NULL").Where("asset.slug IS NULL")
	if campaignID, ok := query.Filter["campaign_id"]; ok {
		q = q.Where("asset.sa_root_id = (SELECT id FROM asset WHERE slug = ? AND sa_deleted_at IS NULL)", "campaign-"+campaignID)
	}
	q = sdb.ObjectWhere(q, caller, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("asset.sa_created_at ASC, asset.id ASC").Scan(ctx.Request().Context()); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupAsset, query, rows, func(row db.Asset) uuid.UUID { return row.ID }, func(row db.Asset) AssetData {
		data := AssetData{
			Name:        row.Name,
			Description: row.Description,
			MimeType:    row.MimeType,
			Type:        row.Type,
			Index:       row.Index,
			Icon:        row.Icon,
			BannerID:    getText(row.BannerID),
			Properties:  getRaw(row.Properties),
			Document:    getRaw(row.Document),
			UploadedBy:  row.UploadedBy.String(),
		}
		switch slug := roots[row.ParentID]; {
		case strings.HasPrefix(slug, "campaign-"):
			campaignID := strings.TrimPrefix(slug, "campaign-")
			data.CampaignID = &campaignID
		case slug != "":
		case row.ParentID != row.ID && row.ParentID != uuid.Nil:
			data.ParentID = getText(&row.ParentID)
		}
		return data
	})
}

func importAsset(ctx *nstate.Context, record nstate.Record[AssetData]) (string, error) {
	owner, err := getOptionalID(&record.Data.UploadedBy, "uploaded_by")
	if err != nil {
		return "", err
	}
	actor, err := getActor(ctx, owner)
	if err != nil {
		return "", err
	}
	body := map[string]any{
		"name":      record.Data.Name,
		"mime_type": record.Data.MimeType,
		"index":     record.Data.Index,
	}
	for key, value := range map[string]*string{"description": record.Data.Description, "type": record.Data.Type, "icon": record.Data.Icon, "banner_id": record.Data.BannerID} {
		if value != nil {
			body[key] = *value
		}
	}
	if record.Data.Properties != nil {
		body["properties"] = record.Data.Properties
	}
	if record.Data.Document != nil {
		body["document"] = record.Data.Document
	}
	target, method := "/api/asset", http.MethodPost
	if record.ID != "" {
		target, method = "/api/asset/"+record.ID, http.MethodPut
	} else {
		if record.Data.ParentID != nil {
			body["parent_id"] = *record.Data.ParentID
		}
		if record.Data.CampaignID != nil {
			body["campaign_id"] = *record.Data.CampaignID
		}
	}
	data, err := call(ctx, actor, method, target, body)
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	return id.String(), putKey(ctx.Request().Context(), GroupAsset, record.Key, id)
}

func deleteAsset(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/asset/"+id, nil)
	return err
}

func getAssetBlobs(ctx *nstate.Context, record nstate.Record[AssetData]) ([]nstate.Blob, error) {
	if record.ID == "" || record.Data.MimeType == db.MIME_TYPE_FOLDER || record.Data.MimeType == db.MIME_TYPE_DOCUMENT {
		return nil, nil
	}
	caller, err := getCaller(ctx)
	if err != nil {
		return nil, err
	}
	id, err := getRecordID(record.ID)
	if err != nil {
		return nil, err
	}
	row := db.Asset{ID: id}
	if err := db.Instance().NewSelect().Model(&row).Column("blob_url", "etag", "size_bytes").WherePK().Scan(ctx.Request().Context()); err != nil {
		return nil, err
	}
	if row.BlobURL == nil || row.Etag == nil {
		return nil, nil
	}
	bytes, err := getBytes(ctx, caller, record.ID)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(bytes)
	return []nstate.Blob{{
		Name:   record.Data.Name,
		Group:  GroupAsset,
		Key:    record.Key,
		SHA256: hex.EncodeToString(sum[:]),
		MIME:   record.Data.MimeType,
		Size:   len(bytes),
		Data:   bytes,
	}}, nil
}

func putAssetBlob(ctx *nstate.Context, record nstate.Record[AssetData], blob nstate.Blob) error {
	owner, err := getOptionalID(&record.Data.UploadedBy, "uploaded_by")
	if err != nil {
		return err
	}
	actor, err := getActor(ctx, owner)
	if err != nil {
		return err
	}
	if record.ID == "" {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, "the asset "+record.Key+" is not in this table yet")
	}
	form, err := getMultipart(nil, blob.Name, blob.Data)
	if err != nil {
		return err
	}
	_, err = call(ctx, actor, http.MethodPost, "/api/asset/"+record.ID, form)
	return err
}

func getObjectAssetGroup() nstate.Group[ObjectAssetData] {
	return nstate.Group[ObjectAssetData]{
		Name: GroupObjectAsset,
		Schema: getSchema(map[string]any{
			"asset_id":    getRef(GroupAsset),
			"object_type": getProperty("string", "The table of the row the asset is attached to, public.<table>."),
			"object_id":   getOwner("The row the asset is attached to, by the id it had where the export was made."),
			"properties":  getJSON("Free form customization of this attachment, overriding the asset's key by key."),
		}, "asset_id", "object_type", "object_id"),
		DependsOn: []string{GroupAsset, GroupCampaign, GroupCharacter, GroupVehicle, GroupResource, GroupCampaignMap, GroupEncounter, GroupSong},
		Refs:      map[string]string{"asset_id": GroupAsset},
		Export:    exportObjectAssets,
		Import:    importObjectAsset,
		Delete:    deleteObjectAsset,
	}
}

func exportObjectAssets(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[ObjectAssetData], error) {
	rows := make([]db.ObjectAsset, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_OBJECT_ASSET, "object_asset", &rows, "object_asset.sa_created_at ASC, object_asset.id ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupObjectAsset, query, rows, func(row db.ObjectAsset) uuid.UUID { return row.ID }, func(row db.ObjectAsset) ObjectAssetData {
		return ObjectAssetData{
			AssetID:    row.AssetID.String(),
			ObjectType: row.ObjectType,
			ObjectID:   row.ObjectID.String(),
			Properties: getRaw(row.Properties),
		}
	})
}

func importObjectAsset(ctx *nstate.Context, record nstate.Record[ObjectAssetData]) (string, error) {
	actor, err := getCaller(ctx)
	if err != nil {
		return "", err
	}
	rctx := ctx.Request().Context()
	objectID, err := getObjectID(rctx, record.Data.ObjectType, record.Data.ObjectID)
	if err != nil {
		return "", err
	}
	body := map[string]any{"object_type": record.Data.ObjectType, "object_id": objectID}
	if record.Data.Properties != nil {
		body["properties"] = record.Data.Properties
	}
	method := http.MethodPost
	if record.ID != "" {
		method = http.MethodPut
	}
	data, err := call(ctx, actor, method, "/api/asset/"+record.Data.AssetID+"/object", body)
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	return id.String(), putKey(rctx, GroupObjectAsset, record.Key, id)
}

func deleteObjectAsset(ctx *nstate.Context, id string) error {
	actor, err := getCaller(ctx)
	if err != nil {
		return err
	}
	rowID, err := getRecordID(id)
	if err != nil {
		return err
	}
	row := db.ObjectAsset{ID: rowID}
	if err := db.Instance().NewSelect().Model(&row).WherePK().Scan(ctx.Request().Context()); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "Not found")
	}
	_, err = call(ctx, actor, http.MethodDelete, "/api/asset/"+row.AssetID.String()+"/object/"+row.ObjectID.String(), nil)
	return err
}
