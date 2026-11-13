package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/SlyOtis/quillborne/internal/storage"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nimling/nimbody"
	"github.com/nimling/nimbody/query"
	"github.com/nimling/nimbody/respond"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

const formBytes = 1 << 20

const assetBannerProperties = "(SELECT b.properties FROM asset b WHERE b.id = asset.banner_id AND b.sa_deleted_at IS NULL) AS banner_properties"

var tagObjectTypes = regexp.MustCompile(`^public\.[a-z][a-z0-9_]*$`)

type BodyAsset struct {
	Name        *string         `json:"name"`
	Description *string         `json:"description"`
	MimeType    *string         `json:"mime_type"`
	Index       *int            `json:"index"`
	Type        *string         `json:"type"`
	Icon        *string         `json:"icon"`
	ParentID    *uuid.UUID      `json:"parent_id"`
	CampaignID  *uuid.UUID      `json:"campaign_id"`
	BannerID    *uuid.UUID      `json:"banner_id"`
	Properties  json.RawMessage `json:"properties"`
	Document    json.RawMessage `json:"document"`
}

type BodyAssetMove struct {
	IDs      []uuid.UUID `json:"ids"`
	TargetID *uuid.UUID  `json:"target_id"`
}

type BodyObjectAsset struct {
	ObjectType *string         `json:"object_type"`
	ObjectID   *uuid.UUID      `json:"object_id"`
	Properties json.RawMessage `json:"properties"`
}

type BodyTag struct {
	Name *string `json:"name"`
}

type BodyTagObject struct {
	ObjectType *string    `json:"object_type"`
	ObjectID   *uuid.UUID `json:"object_id"`
}

func GetAssets(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	params, err := query.ValidateQueryParams(ctx, true, "mime_type", "q", "type", "exclude_types", "exclude_object_types", "reserved", "tag", "tag_id", "parent_id", "offset")
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	assets := make([]*db.Asset, 0)
	q := db.Instance().NewSelect().
		Model(&assets).
		Relation("Tags", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Where("tag_object.object_type = ?", db.OBJECT_TYPE_ASSET).Where("tag_object.sa_deleted_at IS NULL")
		}).
		ColumnExpr("asset.*").
		ColumnExpr(assetBannerProperties)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ, nil, nil, 0)
	if value := params.Get("mime_type"); value != "" {
		q = q.Where("asset.mime_type LIKE ?", strings.ReplaceAll(value, "*", "%"))
	}
	if value := params.Get("q"); value != "" {
		q = q.Where("asset.name ILIKE ?", "%"+value+"%")
	}
	if value := params.Get("type"); value != "" {
		q = q.Where("asset.type = ?", value)
	}
	if params.Has("parent_id") {
		parentID, err := uuid.Parse(params.Get("parent_id"))
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid parent_id, expected UUID")
		}
		q = q.Where("asset.sa_parent_id = ?", parentID)
	}
	if excluded := params.GetSlice("exclude_types"); len(excluded) > 0 {
		q = q.Where("(asset.type IS NULL OR asset.type NOT IN (?))", bun.In(excluded))
	}
	if params.Has("reserved") {
		reserved, err := strconv.ParseBool(params.Get("reserved"))
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Reserved must be true or false")
		}
		q = q.Where("asset.reserved = ?", reserved)
	}
	if excluded := params.GetSlice("exclude_object_types"); len(excluded) > 0 {
		q = q.Where("NOT EXISTS (SELECT 1 FROM object_asset oa WHERE oa.asset_id = asset.id AND oa.object_type IN (?) AND oa.sa_deleted_at IS NULL)", bun.In(excluded))
	}
	if value := params.Get("tag"); value != "" {
		q = q.Where("EXISTS (SELECT 1 FROM tag_object tao JOIN tag t ON t.id = tao.tag_id AND t.sa_deleted_at IS NULL WHERE tao.object_type = ? AND tao.object_id = asset.id AND tao.sa_deleted_at IS NULL AND lower(t.name) = lower(?))", db.OBJECT_TYPE_ASSET, value)
	}
	if params.Has("tag_id") {
		tagID, err := uuid.Parse(params.Get("tag_id"))
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid tag_id, expected UUID")
		}
		q = q.Where("EXISTS (SELECT 1 FROM tag_object tao WHERE tao.object_type = ? AND tao.object_id = asset.id AND tao.sa_deleted_at IS NULL AND tao.tag_id = ?)", db.OBJECT_TYPE_ASSET, tagID)
	}
	if column, order := ctx.QueryParam("column"), ctx.QueryParam("order"); column != "" || order != "" {
		direction := "DESC"
		if strings.EqualFold(order, "asc") {
			direction = "ASC"
		}
		sorted := "asset.sa_updated_at"
		switch column {
		case "name":
			sorted = "asset.name"
		case "created_at":
			sorted = "asset.sa_created_at"
		}
		q = q.OrderExpr(sorted + " " + direction + ", asset.id")
	}
	if limit, _ := strconv.Atoi(ctx.QueryParam("limit")); limit > 0 {
		q = q.Limit(limit)
	}
	if offset, _ := strconv.Atoi(ctx.QueryParam("offset")); offset > 0 {
		q = q.Offset(offset)
	}
	if err := q.Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetAssets: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, assets, len(assets))
}

func GetAsset(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ); err != nil || ac == nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	var asset db.Asset
	if err := db.Instance().NewSelect().Model(&asset).ColumnExpr("asset.*").ColumnExpr(assetBannerProperties).Where("asset.id = ?", id).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, asset, 1)
}

func GetAssetData(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return ctx.NoContent(http.StatusUnauthorized)
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return ctx.NoContent(http.StatusBadRequest)
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ); err != nil || ac == nil {
		return ctx.NoContent(http.StatusNotFound)
	}
	asset := db.Asset{ID: id}
	if err := db.Instance().NewSelect().Model(&asset).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ctx.NoContent(http.StatusNotFound)
		}
		ctx.Logger().Errorf("GetAssetData: %v", err)
		return ctx.NoContent(http.StatusInternalServerError)
	}
	if asset.Etag == nil || asset.SizeBytes == nil {
		return ctx.NoContent(http.StatusNotFound)
	}
	size := *asset.SizeBytes
	header := ctx.Response().Header()
	etag := `"` + *asset.Etag + `"`
	header.Set("ETag", etag)
	header.Set("Accept-Ranges", "bytes")
	header.Set("Cache-Control", "private, max-age=0, must-revalidate")
	if match := ctx.Request().Header.Get("If-None-Match"); match == etag || match == *asset.Etag {
		return ctx.NoContent(http.StatusNotModified)
	}
	start, end, ranged, ok := getRange(ctx.Request().Header.Get("Range"), size)
	if !ok {
		header.Set("Content-Range", "bytes */"+strconv.FormatInt(size, 10))
		return ctx.NoContent(http.StatusRequestedRangeNotSatisfiable)
	}
	status := http.StatusOK
	if ranged {
		status = http.StatusPartialContent
		header.Set("Content-Range", "bytes "+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10)+"/"+strconv.FormatInt(size, 10))
	}
	header.Set("Content-Length", strconv.FormatInt(end-start+1, 10))
	if ctx.Request().Method == http.MethodHead {
		header.Set("Content-Type", asset.MimeType)
		return ctx.NoContent(status)
	}
	if len(asset.Document) > 0 {
		return ctx.Stream(status, asset.MimeType, bytes.NewReader(asset.Document[start:end+1]))
	}
	if asset.BlobURL == nil {
		return ctx.NoContent(http.StatusNotFound)
	}
	reader, err := storage.Download(rctx, *asset.BlobURL, start, end-start+1)
	if err != nil {
		if storage.IsMissing(err) {
			return ctx.NoContent(http.StatusNotFound)
		}
		ctx.Logger().Errorf("GetAssetData: %v", err)
		return ctx.NoContent(http.StatusInternalServerError)
	}
	defer reader.Close()
	return ctx.Stream(status, asset.MimeType, reader)
}

func PostAsset(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	limit := getFileLimit()
	tooLarge := "The file is larger than " + strconv.FormatInt(limit>>20, 10) + " MB"
	if ctx.Request().ContentLength > limit+formBytes {
		return respond.Error(ctx, http.StatusRequestEntityTooLarge, tooLarge)
	}
	ctx.Request().Body = http.MaxBytesReader(ctx.Response(), ctx.Request().Body, limit+formBytes)
	formFile, formErr := ctx.FormFile("file")
	var overflow *http.MaxBytesError
	if errors.As(formErr, &overflow) {
		return respond.Error(ctx, http.StatusRequestEntityTooLarge, tooLarge)
	}
	hasFormFile := formErr == nil
	asset := db.Asset{ID: uuid.New(), UploadedBy: actorID}
	var campaignID *uuid.UUID
	var document []byte
	if !hasFormFile {
		var body BodyAsset
		if _, err := nimbody.Bind(ctx, &body); err != nil {
			if errors.As(err, &overflow) {
				return respond.Error(ctx, http.StatusRequestEntityTooLarge, tooLarge)
			}
			return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
		}
		if body.Name == nil || body.MimeType == nil {
			return respond.Error(ctx, http.StatusBadRequest, "name and mime_type required")
		}
		asset.Name = *body.Name
		asset.MimeType = *body.MimeType
		if body.Index != nil {
			asset.Index = *body.Index
		}
		asset.Description = body.Description
		asset.Type = body.Type
		asset.Icon = body.Icon
		asset.Properties = body.Properties
		asset.BannerID = body.BannerID
		if body.ParentID != nil {
			asset.ParentID = *body.ParentID
		}
		campaignID = body.CampaignID
		document = body.Document
	} else {
		if formFile.Size > limit {
			return respond.Error(ctx, http.StatusRequestEntityTooLarge, tooLarge)
		}
		params, err := ctx.FormParams()
		if err != nil || !params.Has("name") || !params.Has("mime_type") {
			return respond.Error(ctx, http.StatusBadRequest, "name and mime_type required")
		}
		asset.Name = params.Get("name")
		asset.MimeType = params.Get("mime_type")
		if params.Has("description") {
			description := params.Get("description")
			asset.Description = &description
		}
		if params.Has("index") {
			if asset.Index, err = strconv.Atoi(params.Get("index")); err != nil {
				return respond.Error(ctx, http.StatusBadRequest, "Invalid index, expected a number")
			}
		}
		if params.Has("type") && params.Get("type") != "" {
			assetType := params.Get("type")
			asset.Type = &assetType
		}
		if params.Has("parent_id") {
			if asset.ParentID, err = uuid.Parse(params.Get("parent_id")); err != nil {
				return respond.Error(ctx, http.StatusBadRequest, "Invalid parent_id, expected UUID")
			}
		}
		if params.Has("campaign_id") {
			parsed, err := uuid.Parse(params.Get("campaign_id"))
			if err != nil {
				return respond.Error(ctx, http.StatusBadRequest, "Invalid campaign_id, expected UUID")
			}
			campaignID = &parsed
		}
	}
	rctx := ctx.Request().Context()
	if asset.BannerID != nil {
		banner := db.Asset{ID: *asset.BannerID}
		if err := db.Instance().NewSelect().Model(&banner).Column("mime_type").WherePK().Scan(rctx); err != nil || !strings.HasPrefix(banner.MimeType, "image/") {
			return respond.Error(ctx, http.StatusBadRequest, "banner_id must be an image asset")
		}
	}
	if asset.ParentID != uuid.Nil {
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, asset.ParentID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_WRITE); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
	} else if campaignID != nil {
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, *campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		var folder db.Asset
		if err := db.Instance().NewSelect().Model(&folder).Column("id").Where("slug = ?", "campaign-"+campaignID.String()).Scan(rctx); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			ctx.Logger().Errorf("PostAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
		asset.ParentID = folder.ID
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	asset.OwnerID = w.OwnerID
	asset.CreatedBy = w.Access.UserClaimID
	if asset.ParentID == uuid.Nil {
		if asset.ParentID, err = putUserFolder(rctx, w); err != nil {
			ctx.Logger().Errorf("PostAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
	}
	isDocument := asset.MimeType == db.MIME_TYPE_DOCUMENT
	if isDocument {
		if hasFormFile {
			file, err := formFile.Open()
			if err != nil {
				return respond.Error(ctx, http.StatusBadRequest, "The file could not be read")
			}
			document, err = io.ReadAll(file)
			file.Close()
			if err != nil {
				return respond.Error(ctx, http.StatusBadRequest, "The file could not be read")
			}
		}
		if asset.Document, err = getAssetDocument(document); err != nil {
			return respond.Error(ctx, http.StatusBadRequest, err.Error())
		}
	}
	if asset.Path, err = getAssetPath(rctx, asset.ParentID, asset.Name, asset.MimeType); err != nil {
		ctx.Logger().Errorf("PostAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if hasFormFile && !isDocument {
		blobPath, err := getBlobPath(rctx, asset.ParentID, asset.ID)
		if err != nil {
			ctx.Logger().Errorf("PostAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
		file, err := formFile.Open()
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "The file could not be read")
		}
		defer file.Close()
		size, etag, err := postAssetBlob(rctx, file, blobPath, asset.MimeType)
		if err != nil {
			ctx.Logger().Errorf("PostAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
		asset.BlobURL = &blobPath
		asset.SizeBytes = &size
		asset.Etag = &etag
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&asset).ExcludeColumn("sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if isDocument {
			if err := putAssetDigest(tctx, tx, &asset); err != nil {
				return err
			}
		}
		if err := sdb.Write(tctx, tx, "PostAsset", "create", db.OBJECT_TYPE_ASSET, asset.ID, asset.OwnerID, w.Access.UserClaimID, asset.Name); err != nil {
			return err
		}
		return putAssetBindings(tctx, tx, w, asset.ID, asset.ParentID)
	}); err != nil {
		if asset.BlobURL != nil {
			if err := storage.Delete(rctx, *asset.BlobURL); err != nil {
				ctx.Logger().Errorf("PostAsset blob: %v", err)
			}
		}
		ctx.Logger().Errorf("PostAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, asset, 1)
}

func PostAssetUpload(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_ASSET, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	asset := db.Asset{ID: id}
	if err := db.Instance().NewSelect().Model(&asset).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PostAssetUpload: %v", err)
		return respond.ErrorInternal(ctx)
	}
	limit := getFileLimit()
	tooLarge := "The file is larger than " + strconv.FormatInt(limit>>20, 10) + " MB"
	if ctx.Request().ContentLength > limit+formBytes {
		return respond.Error(ctx, http.StatusRequestEntityTooLarge, tooLarge)
	}
	ctx.Request().Body = http.MaxBytesReader(ctx.Response(), ctx.Request().Body, limit+formBytes)
	formFile, err := ctx.FormFile("file")
	if err != nil {
		var overflow *http.MaxBytesError
		if errors.As(err, &overflow) {
			return respond.Error(ctx, http.StatusRequestEntityTooLarge, tooLarge)
		}
		return respond.Error(ctx, http.StatusBadRequest, "file required")
	}
	if formFile.Size > limit {
		return respond.Error(ctx, http.StatusRequestEntityTooLarge, tooLarge)
	}
	file, err := formFile.Open()
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "The file could not be read")
	}
	defer file.Close()
	if asset.MimeType == db.MIME_TYPE_DOCUMENT {
		raw, err := io.ReadAll(file)
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "The file could not be read")
		}
		document, err := getAssetDocument(raw)
		if err != nil || document == nil {
			return respond.Error(ctx, http.StatusBadRequest, "document must be a block document object")
		}
		asset.Document = document
		if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewUpdate().Model(&asset).Column("document").Set("yjs_state = NULL").Set("sa_updated_at = NOW()").WherePK().Returning("*").Exec(tctx); err != nil {
				return err
			}
			if err := putAssetDigest(tctx, tx, &asset); err != nil {
				return err
			}
			return sdb.Write(tctx, tx, "PostAssetUpload", "update", db.OBJECT_TYPE_ASSET, asset.ID, asset.OwnerID, ac.UserClaimID, asset.Name)
		}); err != nil {
			ctx.Logger().Errorf("PostAssetUpload: %v", err)
			return respond.ErrorInternal(ctx)
		}
		ctx.Response().Header().Set("ETag", `"`+*asset.Etag+`"`)
		return respond.JSON(ctx, http.StatusOK, asset, 1)
	}
	blobPath := ""
	if asset.BlobURL != nil {
		blobPath = *asset.BlobURL
	} else if blobPath, err = getBlobPath(rctx, asset.ParentID, asset.ID); err != nil {
		ctx.Logger().Errorf("PostAssetUpload: %v", err)
		return respond.ErrorInternal(ctx)
	}
	size, etag, err := postAssetBlob(rctx, file, blobPath, asset.MimeType)
	if err != nil {
		ctx.Logger().Errorf("PostAssetUpload: %v", err)
		return respond.ErrorInternal(ctx)
	}
	asset.BlobURL = &blobPath
	asset.SizeBytes = &size
	asset.Etag = &etag
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&asset).Column("blob_url", "size_bytes", "etag").Set("sa_updated_at = NOW()").WherePK().Returning("*").Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostAssetUpload", "update", db.OBJECT_TYPE_ASSET, asset.ID, asset.OwnerID, ac.UserClaimID, asset.Name)
	}); err != nil {
		ctx.Logger().Errorf("PostAssetUpload: %v", err)
		return respond.ErrorInternal(ctx)
	}
	ctx.Response().Header().Set("ETag", `"`+etag+`"`)
	return respond.JSON(ctx, http.StatusOK, asset, 1)
}

func PutAsset(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyAsset
	val, err := nimbody.Bind(ctx, &body)
	if err != nil || val.IsEmpty() {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_ASSET, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	asset := db.Asset{ID: id}
	if err := db.Instance().NewSelect().Model(&asset).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PutAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	columns := make([]string, 0)
	if val.HasKey("name") {
		if body.Name == nil || strings.TrimSpace(*body.Name) == "" {
			return respond.Error(ctx, http.StatusBadRequest, "name required")
		}
		asset.Name = *body.Name
		columns = append(columns, "name")
	}
	if val.HasKey("description") {
		asset.Description = body.Description
		columns = append(columns, "description")
	}
	if val.HasKey("mime_type") {
		asset.MimeType = ""
		if body.MimeType != nil {
			asset.MimeType = *body.MimeType
		}
		columns = append(columns, "mime_type")
	}
	if val.HasKey("index") {
		asset.Index = 0
		if body.Index != nil {
			asset.Index = *body.Index
		}
		columns = append(columns, "index")
	}
	if val.HasKey("type") {
		asset.Type = body.Type
		columns = append(columns, "type")
	}
	if val.HasKey("icon") {
		asset.Icon = body.Icon
		columns = append(columns, "icon")
	}
	if val.HasKey("banner_id") {
		if body.BannerID != nil {
			banner := db.Asset{ID: *body.BannerID}
			if err := db.Instance().NewSelect().Model(&banner).Column("mime_type").WherePK().Scan(rctx); err != nil || !strings.HasPrefix(banner.MimeType, "image/") {
				return respond.Error(ctx, http.StatusBadRequest, "banner_id must be an image asset")
			}
		}
		asset.BannerID = body.BannerID
		columns = append(columns, "banner_id")
	}
	if val.HasKey("properties") {
		asset.Properties = body.Properties
		columns = append(columns, "properties")
	}
	if val.HasKey("parent_id") {
		if body.ParentID == nil {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, *body.ParentID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_WRITE); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		target := db.Asset{ID: *body.ParentID}
		if err := db.Instance().NewSelect().Model(&target).WherePK().Scan(rctx); err != nil {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ancestors, err := getAncestors(rctx, target.ID)
		if err != nil {
			ctx.Logger().Errorf("PutAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
		if asset.ParentID == asset.ID || target.RootID != asset.RootID || slices.Contains(ancestors, asset.ID) {
			return respond.Error(ctx, http.StatusBadRequest, "An asset moves only within its own folder tree")
		}
		asset.ParentID = target.ID
		columns = append(columns, "sa_parent_id")
	}
	if val.HasKey("name") || val.HasKey("parent_id") {
		parentID := asset.ParentID
		if parentID == asset.ID {
			parentID = uuid.Nil
		}
		if asset.Path, err = getAssetPath(rctx, parentID, asset.Name, asset.MimeType); err != nil {
			ctx.Logger().Errorf("PutAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
		columns = append(columns, "path")
	}
	written := val.HasKey("document")
	if written {
		if asset.Document, err = getAssetDocument(body.Document); err != nil {
			return respond.Error(ctx, http.StatusBadRequest, err.Error())
		}
		asset.BlobURL = nil
		asset.YjsState = nil
		columns = append(columns, "document", "blob_url", "yjs_state")
	}
	if len(columns) == 0 {
		return respond.Error(ctx, http.StatusBadRequest, "Nothing to change")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&asset).Column(columns...).Set("sa_updated_at = NOW()").WherePK().Returning("*").Exec(tctx); err != nil {
			return err
		}
		if written {
			if err := putAssetDigest(tctx, tx, &asset); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "PutAsset", "update", db.OBJECT_TYPE_ASSET, asset.ID, asset.OwnerID, ac.UserClaimID, asset.Name)
	}); err != nil {
		ctx.Logger().Errorf("PutAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, asset, 1)
}

func DeleteAsset(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_ASSET, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	asset := db.Asset{ID: id}
	if err := db.Instance().NewSelect().Model(&asset).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("DeleteAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if asset.ParentID == asset.ID {
		return respond.Error(ctx, http.StatusBadRequest, "A root folder is not deleted")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&asset).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteAsset", "delete", db.OBJECT_TYPE_ASSET, asset.ID, asset.OwnerID, ac.UserClaimID, asset.Name)
	}); err != nil {
		ctx.Logger().Errorf("DeleteAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if asset.BlobURL != nil {
		if err := storage.Delete(rctx, *asset.BlobURL); err != nil {
			ctx.Logger().Errorf("DeleteAsset blob: %v", err)
		}
	}
	return respond.JSON(ctx, http.StatusOK, asset, 1)
}

func PostAssetMove(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyAssetMove
	if err := ctx.Bind(&body); err != nil || len(body.IDs) == 0 {
		return respond.Error(ctx, http.StatusBadRequest, "ids required")
	}
	if body.TargetID == nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, *body.TargetID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	target := db.Asset{ID: *body.TargetID}
	if err := db.Instance().NewSelect().Model(&target).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	ancestors, err := getAncestors(rctx, target.ID)
	if err != nil {
		ctx.Logger().Errorf("PostAssetMove: %v", err)
		return respond.ErrorInternal(ctx)
	}
	moved := make([]db.Asset, 0, len(body.IDs))
	for _, id := range body.IDs {
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_ASSET, sdb.ACCESS_WRITE); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		item := db.Asset{ID: id}
		if err := db.Instance().NewSelect().Model(&item).WherePK().Scan(rctx); err != nil {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		if item.ParentID == item.ID || item.RootID != target.RootID || slices.Contains(ancestors, item.ID) {
			return respond.Error(ctx, http.StatusBadRequest, "An asset moves only within its own folder tree")
		}
		item.ParentID = target.ID
		if item.Path, err = getAssetPath(rctx, target.ID, item.Name, item.MimeType); err != nil {
			ctx.Logger().Errorf("PostAssetMove: %v", err)
			return respond.ErrorInternal(ctx)
		}
		moved = append(moved, item)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		for i := range moved {
			if _, err := tx.NewUpdate().Model(&moved[i]).Column("sa_parent_id", "path").Set("sa_updated_at = NOW()").WherePK().Exec(tctx); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "PostAssetMove", "update", db.OBJECT_TYPE_ASSET, target.ID, target.OwnerID, ac.UserClaimID, target.Name)
	}); err != nil {
		ctx.Logger().Errorf("PostAssetMove: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, map[string]string{"status": "moved"}, 1)
}

func GetFiles(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	params, err := query.ValidateQueryParams(ctx, true, "parent_id")
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	rctx := ctx.Request().Context()
	var parentID uuid.UUID
	if params.Has("parent_id") {
		if parentID, err = uuid.Parse(params.Get("parent_id")); err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid parent_id, expected UUID")
		}
	} else {
		var folder db.Asset
		err := db.Instance().NewSelect().Model(&folder).Column("id").Where("slug = ?", "user-"+actorID.String()).Scan(rctx)
		if errors.Is(err, sql.ErrNoRows) {
			return respond.JSON(ctx, http.StatusOK, []db.Asset{}, 0)
		}
		if err != nil {
			ctx.Logger().Errorf("GetFiles: %v", err)
			return respond.ErrorInternal(ctx)
		}
		parentID = folder.ID
	}
	files := make([]*db.Asset, 0)
	q := db.Instance().NewSelect().
		Model(&files).
		Where("asset.sa_parent_id = ?", parentID).
		Where("asset.id <> ?", parentID).
		OrderExpr("CASE WHEN asset.mime_type = ? THEN 0 ELSE 1 END, asset.name ASC", db.MIME_TYPE_FOLDER)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.Scan(rctx); err != nil {
		ctx.Logger().Errorf("GetFiles: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, files, len(files))
}

func GetFile(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ); err != nil || ac == nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	file := db.Asset{ID: id}
	if err := db.Instance().NewSelect().Model(&file).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetFile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, file, 1)
}

func GetObjectAssets(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	params, err := query.ValidateQueryParams(ctx, true, "object_type", "object_id")
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	objectType := params.Get("object_type")
	objectID, err := uuid.Parse(params.Get("object_id"))
	if objectType == "" || err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "object_type and object_id required")
	}
	table, known := getObjectTable(objectType)
	if !known {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, objectID, table, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	items := make([]*db.ObjectAsset, 0)
	if err := db.Instance().NewSelect().
		Model(&items).
		Relation("Asset").
		Where("object_asset.object_type = ?", objectType).
		Where("object_asset.object_id = ?", objectID).
		Where("EXISTS (SELECT 1 FROM asset a WHERE a.id = object_asset.asset_id AND a.sa_deleted_at IS NULL)").
		Scan(rctx); err != nil {
		ctx.Logger().Errorf("GetObjectAssets: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, items, len(items))
}

func PostObjectAsset(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	assetID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyObjectAsset
	if err := ctx.Bind(&body); err != nil || body.ObjectType == nil || body.ObjectID == nil {
		return respond.Error(ctx, http.StatusBadRequest, "object_type and object_id required")
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, assetID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ); err != nil || ac == nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	table, known := getObjectTable(*body.ObjectType)
	if !known {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, *body.ObjectID, table, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.ObjectAsset{
		AssetID:    assetID,
		ObjectType: *body.ObjectType,
		ObjectID:   *body.ObjectID,
		Properties: body.Properties,
		OwnerID:    w.OwnerID,
		CreatedBy:  w.Access.UserClaimID,
	}
	page := map[uuid.UUID]sdb.ClaimAccess{}
	if table == db.OBJECT_TYPE_RESOURCE || table == db.OBJECT_TYPE_CAMPAIGN {
		if page, err = getPageShare(rctx, table, []uuid.UUID{item.ObjectID}); err != nil {
			ctx.Logger().Errorf("PostObjectAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&item).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if table == db.OBJECT_TYPE_RESOURCE || table == db.OBJECT_TYPE_CAMPAIGN {
			if err := putAssetShare(tctx, tx, w, assetID, table, item.ObjectID, page, nil); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "PostObjectAsset", "create", db.OBJECT_TYPE_OBJECT_ASSET, item.ID, item.OwnerID, w.Access.UserClaimID, "")
	}); err != nil {
		ctx.Logger().Errorf("PostObjectAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, item, 1)
}

func PutObjectAsset(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	assetID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyObjectAsset
	if err := ctx.Bind(&body); err != nil || body.ObjectType == nil || body.ObjectID == nil {
		return respond.Error(ctx, http.StatusBadRequest, "object_type and object_id required")
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, assetID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ); err != nil || ac == nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	table, known := getObjectTable(*body.ObjectType)
	if !known {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, *body.ObjectID, table, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.ObjectAsset{
		AssetID:    assetID,
		ObjectType: *body.ObjectType,
		ObjectID:   *body.ObjectID,
		Properties: body.Properties,
		OwnerID:    w.OwnerID,
		CreatedBy:  w.Access.UserClaimID,
	}
	page := map[uuid.UUID]sdb.ClaimAccess{}
	if table == db.OBJECT_TYPE_RESOURCE || table == db.OBJECT_TYPE_CAMPAIGN {
		if page, err = getPageShare(rctx, table, []uuid.UUID{item.ObjectID}); err != nil {
			ctx.Logger().Errorf("PutObjectAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
	}
	status := http.StatusOK
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		res, err := tx.NewUpdate().
			Model(&item).
			Set("properties = ?", item.Properties).
			Set("sa_updated_at = NOW()").
			Where("object_type = ?", item.ObjectType).
			Where("object_id = ?", item.ObjectID).
			Where("asset_id = ?", item.AssetID).
			Returning("*").
			Exec(tctx)
		if err != nil {
			return err
		}
		if rows, err := res.RowsAffected(); err != nil || rows == 0 {
			status = http.StatusCreated
			if _, err := tx.NewInsert().Model(&item).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
				return err
			}
		}
		if table == db.OBJECT_TYPE_RESOURCE || table == db.OBJECT_TYPE_CAMPAIGN {
			if err := putAssetShare(tctx, tx, w, assetID, table, item.ObjectID, page, nil); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "PutObjectAsset", "update", db.OBJECT_TYPE_OBJECT_ASSET, item.ID, item.OwnerID, w.Access.UserClaimID, "")
	}); err != nil {
		ctx.Logger().Errorf("PutObjectAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, status, item, 1)
}

func DeleteObjectAsset(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	assetID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	id, err := uuid.Parse(ctx.Param("object_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid object_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, assetID, db.OBJECT_TYPE_ASSET, sdb.ACCESS_READ); err != nil || ac == nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	item := db.ObjectAsset{ID: id}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Where("asset_id = ?", assetID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("DeleteObjectAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	table, known := getObjectTable(item.ObjectType)
	if !known {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, item.ObjectID, table, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	page := map[uuid.UUID]sdb.ClaimAccess{}
	if table == db.OBJECT_TYPE_RESOURCE || table == db.OBJECT_TYPE_CAMPAIGN {
		if page, err = getPageShare(rctx, table, []uuid.UUID{item.ObjectID}); err != nil {
			ctx.Logger().Errorf("DeleteObjectAsset: %v", err)
			return respond.ErrorInternal(ctx)
		}
	}
	gone := make([]uuid.UUID, 0, len(page))
	for claimID := range page {
		gone = append(gone, claimID)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&item).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		if table == db.OBJECT_TYPE_RESOURCE || table == db.OBJECT_TYPE_CAMPAIGN {
			if err := putAssetShare(tctx, tx, w, assetID, table, item.ObjectID, nil, gone); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "DeleteObjectAsset", "delete", db.OBJECT_TYPE_OBJECT_ASSET, item.ID, item.OwnerID, ac.UserClaimID, "")
	}); err != nil {
		ctx.Logger().Errorf("DeleteObjectAsset: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func GetTags(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	params, err := query.ValidateQueryParams(ctx, true, "object_type", "object_id", "q", "offset")
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	objectIDs, err := params.GetUUIDs("object_id")
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid object_id, expected UUID")
	}
	tags := make([]*db.Tag, 0)
	q := db.Instance().NewSelect().Model(&tags)
	if params.Get("object_type") != "" || len(objectIDs) > 0 {
		objectType, err := getTagObjectType(params.Get("object_type"))
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, err.Error())
		}
		q = q.ColumnExpr("tag.*").
			ColumnExpr("array_agg(DISTINCT tao.object_id) AS object_ids").
			Join("JOIN tag_object AS tao ON tao.tag_id = tag.id AND tao.sa_deleted_at IS NULL").
			Where("tao.object_type = ?", objectType).
			Group("tag.id")
		if len(objectIDs) > 0 {
			q = q.Where("tao.object_id IN (?)", bun.In(objectIDs))
		}
	}
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_TAG, sdb.ACCESS_READ, nil, nil, 0)
	if value := params.Get("q"); value != "" {
		q = q.Where("tag.name ILIKE ?", "%"+value+"%")
	}
	if limit, _ := strconv.Atoi(ctx.QueryParam("limit")); limit > 0 {
		q = q.Limit(limit)
	}
	if offset, _ := strconv.Atoi(ctx.QueryParam("offset")); offset > 0 {
		q = q.Offset(offset)
	}
	if err := q.Order("tag.name ASC").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetTags: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, tags, len(tags))
}

func GetTag(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_TAG, sdb.ACCESS_READ); err != nil || ac == nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	tag := db.Tag{ID: id}
	if err := db.Instance().NewSelect().Model(&tag).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetTag: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, tag, 1)
}

func PostTag(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyTag
	if err := ctx.Bind(&body); err != nil || body.Name == nil || strings.TrimSpace(*body.Name) == "" {
		return respond.Error(ctx, http.StatusBadRequest, "name required")
	}
	rctx := ctx.Request().Context()
	w, err := postWriter(rctx, actorID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	tag := db.Tag{Name: strings.TrimSpace(*body.Name), OwnerID: w.OwnerID, CreatedBy: w.Access.UserClaimID}
	if err := db.Instance().NewSelect().Model(&tag).Where("lower(tag.name) = lower(?)", tag.Name).Limit(1).Scan(rctx); err == nil {
		return respond.JSON(ctx, http.StatusCreated, tag, 1)
	} else if !errors.Is(err, sql.ErrNoRows) {
		ctx.Logger().Errorf("PostTag: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&tag).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostTag", "create", db.OBJECT_TYPE_TAG, tag.ID, tag.OwnerID, w.Access.UserClaimID, tag.Name); err != nil {
			return err
		}
		return postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_TAG, tag.ID, sdb.ACCESS_MEMBER|sdb.ACCESS_READ)
	}); err != nil {
		ctx.Logger().Errorf("PostTag: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, tag, 1)
}

func PutTag(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyTag
	if err := ctx.Bind(&body); err != nil || body.Name == nil || strings.TrimSpace(*body.Name) == "" {
		return respond.Error(ctx, http.StatusBadRequest, "name required")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_TAG, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	tag := db.Tag{ID: id, Name: strings.TrimSpace(*body.Name)}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&tag).Column("name").Set("sa_updated_at = NOW()").WherePK().Returning("*").Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutTag", "update", db.OBJECT_TYPE_TAG, tag.ID, tag.OwnerID, ac.UserClaimID, tag.Name)
	}); err != nil {
		ctx.Logger().Errorf("PutTag: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, tag, 1)
}

func DeleteTag(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_TAG, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	tag := db.Tag{ID: id}
	if err := db.Instance().NewSelect().Model(&tag).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("DeleteTag: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&tag).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteTag", "delete", db.OBJECT_TYPE_TAG, tag.ID, tag.OwnerID, ac.UserClaimID, tag.Name)
	}); err != nil {
		ctx.Logger().Errorf("DeleteTag: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, tag, 1)
}

func PostTagObject(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyTagObject
	if err := ctx.Bind(&body); err != nil || body.ObjectType == nil || body.ObjectID == nil {
		return respond.Error(ctx, http.StatusBadRequest, "object_type and object_id required")
	}
	objectType, err := getTagObjectType(*body.ObjectType)
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	rctx := ctx.Request().Context()
	if ac, err := sdb.Instance().MutationAccess(rctx, actorID, id, db.OBJECT_TYPE_TAG, sdb.ACCESS_READ); err != nil || ac == nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, *body.ObjectID, objectType, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	link := db.TagObject{TagID: id, ObjectType: objectType, ObjectID: *body.ObjectID, OwnerID: w.OwnerID, CreatedBy: w.Access.UserClaimID}
	if err := db.Instance().NewSelect().Model(&link).Where("tag_id = ?", id).Where("object_type = ?", objectType).Where("object_id = ?", *body.ObjectID).Limit(1).Scan(rctx); err == nil {
		return respond.JSON(ctx, http.StatusCreated, link, 1)
	} else if !errors.Is(err, sql.ErrNoRows) {
		ctx.Logger().Errorf("PostTagObject: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&link).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostTagObject", "create", db.OBJECT_TYPE_TAG_OBJECT, link.ID, link.OwnerID, w.Access.UserClaimID, "")
	}); err != nil {
		ctx.Logger().Errorf("PostTagObject: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, link, 1)
}

func DeleteTagObject(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	objectID, err := uuid.Parse(ctx.QueryParam("object_id"))
	if err != nil || ctx.QueryParam("object_type") == "" {
		return respond.Error(ctx, http.StatusBadRequest, "object_type and object_id required")
	}
	objectType, err := getTagObjectType(ctx.QueryParam("object_type"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, objectID, objectType, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	var link db.TagObject
	if err := db.Instance().NewSelect().Model(&link).Where("tag_id = ?", id).Where("object_type = ?", objectType).Where("object_id = ?", objectID).Limit(1).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("DeleteTagObject: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&link).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteTagObject", "delete", db.OBJECT_TYPE_TAG_OBJECT, link.ID, link.OwnerID, ac.UserClaimID, "")
	}); err != nil {
		ctx.Logger().Errorf("DeleteTagObject: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, link, 1)
}

func postFolder(ctx context.Context, tx bun.Tx, w *Writer, action, name, slug string) (*db.Asset, error) {
	folderType := "folder"
	folder := db.Asset{
		Name:       name,
		MimeType:   db.MIME_TYPE_FOLDER,
		Type:       &folderType,
		Path:       name,
		Slug:       &slug,
		UploadedBy: w.ActorID,
		OwnerID:    w.OwnerID,
		CreatedBy:  w.Access.UserClaimID,
	}
	if _, err := tx.NewInsert().Model(&folder).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(ctx); err != nil {
		return nil, err
	}
	return &folder, sdb.Write(ctx, tx, action, "create", db.OBJECT_TYPE_ASSET, folder.ID, folder.OwnerID, w.Access.UserClaimID, folder.Name)
}

func putUserFolder(ctx context.Context, w *Writer) (uuid.UUID, error) {
	slug := "user-" + w.ActorID.String()
	var folder db.Asset
	err := db.Instance().NewSelect().Model(&folder).Column("id").Where("slug = ?", slug).Scan(ctx)
	if err == nil || !errors.Is(err, sql.ErrNoRows) {
		return folder.ID, err
	}
	err = db.Instance().RunInTx(ctx, nil, func(tctx context.Context, tx bun.Tx) error {
		created, err := postFolder(tctx, tx, w, "PostAsset", "Personal", slug)
		if err != nil {
			return err
		}
		folder.ID = created.ID
		return postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_ASSET, created.ID, sdb.ACCESS_MEMBER)
	})
	if err != nil && strings.Contains(err.Error(), "idx_asset_slug") {
		return putUserFolder(ctx, w)
	}
	return folder.ID, err
}

func putAssetBindings(ctx context.Context, tx bun.Tx, w *Writer, assetID, parentID uuid.UUID) error {
	bindings, err := sdb.Instance().GetBindings(ctx, sdb.BindingFilters{ObjectType: db.OBJECT_TYPE_ASSET, ObjectIDs: []uuid.UUID{parentID}})
	if err != nil {
		return err
	}
	want := map[uuid.UUID]sdb.ClaimAccess{}
	for _, binding := range bindings {
		if binding.DeletedAt == nil && binding.Access != nil {
			want[binding.ClaimID] = *binding.Access
		}
	}
	return putBindings(ctx, tx, w, db.OBJECT_TYPE_ASSET, assetID, want, nil)
}

func putAssetDigest(ctx context.Context, tx bun.Tx, asset *db.Asset) error {
	asset.SizeBytes, asset.Etag = nil, nil
	if len(asset.Document) > 0 {
		size := int64(len(asset.Document))
		digest := sha256.Sum256(asset.Document)
		etag := base64.RawURLEncoding.EncodeToString(digest[:])
		asset.SizeBytes, asset.Etag = &size, &etag
	}
	_, err := tx.NewUpdate().Model(asset).Column("size_bytes", "etag").WherePK().Exec(ctx)
	return err
}

func postAssetBlob(ctx context.Context, reader io.Reader, blobPath, mimeType string) (int64, string, error) {
	digest := sha256.New()
	counted := &countReader{reader: io.TeeReader(reader, digest)}
	if err := storage.Upload(ctx, blobPath, counted, mimeType); err != nil {
		return 0, "", err
	}
	return counted.count, base64.RawURLEncoding.EncodeToString(digest.Sum(nil)), nil
}

func getAssetDocument(raw []byte) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil, nil
	}
	if trimmed[0] != '{' || !json.Valid(trimmed) {
		return nil, errors.New("document must be a block document object")
	}
	return json.RawMessage(trimmed), nil
}

func getAssetPath(ctx context.Context, parentID uuid.UUID, name, mimeType string) (string, error) {
	prefix, err := getBlobPrefix(ctx, parentID)
	if err != nil {
		return "", err
	}
	file := strings.TrimSpace(name)
	if file == "" {
		file = "untitled"
	}
	switch mimeType {
	case "text/markdown":
		if !strings.HasSuffix(strings.ToLower(file), ".md") {
			file += ".md"
		}
	case "application/vnd.mar.paint+json":
		if !strings.HasSuffix(strings.ToLower(file), ".paint") {
			file += ".paint"
		}
	}
	if prefix == "" {
		return file, nil
	}
	return prefix + "/" + file, nil
}

func getBlobPath(ctx context.Context, parentID, id uuid.UUID) (string, error) {
	prefix, err := getBlobPrefix(ctx, parentID)
	if err != nil {
		return "", err
	}
	if prefix == "" {
		return id.String(), nil
	}
	return prefix + "/" + id.String(), nil
}

func getBlobPrefix(ctx context.Context, parentID uuid.UUID) (string, error) {
	segments := make([]string, 0)
	current := parentID
	for current != uuid.Nil && len(segments) < 32 {
		folder := db.Asset{ID: current}
		if err := db.Instance().NewSelect().Model(&folder).Column("id", "name", "slug", "sa_parent_id").WherePK().Scan(ctx); err != nil {
			return "", err
		}
		name := folder.Name
		if folder.Slug != nil && *folder.Slug != "" {
			name = *folder.Slug
		}
		segments = append([]string{getBlobSegment(name)}, segments...)
		if folder.ParentID == folder.ID {
			break
		}
		current = folder.ParentID
	}
	return strings.Join(segments, "/"), nil
}

func getBlobSegment(name string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			return r
		case r >= 'A' && r <= 'Z':
			return r + 32
		case r == '-', r == '_':
			return r
		case r == ' ', r == '/':
			return '-'
		default:
			return -1
		}
	}, name)
	if cleaned == "" {
		return "folder"
	}
	return cleaned
}

func getAncestors(ctx context.Context, id uuid.UUID) ([]uuid.UUID, error) {
	ancestors := make([]uuid.UUID, 0)
	err := db.Instance().NewRaw("WITH RECURSIVE up AS (SELECT id, sa_parent_id FROM asset WHERE id = ? UNION SELECT a.id, a.sa_parent_id FROM asset a JOIN up ON a.id = up.sa_parent_id AND up.sa_parent_id <> up.id) SELECT id FROM up", id).Scan(ctx, &ancestors)
	return ancestors, err
}

func getObjectTable(objectType string) (string, bool) {
	if table, known := claimObjectTypes[objectType]; known {
		return table, true
	}
	return objectType, strings.HasPrefix(objectType, "public.")
}

func getTagObjectType(objectType string) (string, error) {
	resolved, err := sdb.ResolveObjectType(objectType)
	if err != nil || (!strings.HasPrefix(string(resolved), "claimius.") && !tagObjectTypes.MatchString(string(resolved))) {
		return "", errors.New("object_type is a claimius type the middleware resolves, such as user or claimius.claim, or public.<table>")
	}
	return string(resolved), nil
}

func getFileLimit() int64 {
	limit, err := strconv.ParseInt(os.Getenv("FILE_MAX_BYTES"), 10, 64)
	if err != nil || limit <= 0 {
		return 256 << 20
	}
	return limit
}

type countReader struct {
	reader io.Reader
	count  int64
}

func (c *countReader) Read(p []byte) (int, error) {
	n, err := c.reader.Read(p)
	c.count += int64(n)
	return n, err
}

func getRange(value string, size int64) (int64, int64, bool, bool) {
	if size <= 0 {
		return 0, -1, false, value == ""
	}
	if value == "" {
		return 0, size - 1, false, true
	}
	spec, found := strings.CutPrefix(value, "bytes=")
	if !found || strings.Contains(spec, ",") {
		return 0, 0, false, false
	}
	first, last, found := strings.Cut(spec, "-")
	if !found {
		return 0, 0, false, false
	}
	if first == "" {
		suffix, err := strconv.ParseInt(last, 10, 64)
		if err != nil || suffix <= 0 {
			return 0, 0, false, false
		}
		if suffix > size {
			suffix = size
		}
		return size - suffix, size - 1, true, true
	}
	start, err := strconv.ParseInt(first, 10, 64)
	if err != nil || start < 0 || start >= size {
		return 0, 0, false, false
	}
	end := size - 1
	if last != "" {
		end, err = strconv.ParseInt(last, 10, 64)
		if err != nil || end < start {
			return 0, 0, false, false
		}
		if end > size-1 {
			end = size - 1
		}
	}
	return start, end, true, true
}
