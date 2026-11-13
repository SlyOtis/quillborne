package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/SlyOtis/quillborne/internal/broker"
	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nimling/nimbody/respond"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

var resourceKinds = map[string]bool{
	"entries": true, "items": true, "weapons": true,
	"armor": true, "locations": true, "maps": true, "sessions": true,
}

var resourceColumns = map[string]bool{
	"id": true, "kind": true, "owner_id": true, "campaign_id": true, "created_at": true, "updated_at": true,
	"share_users": true, "share_campaigns": true, "readers": true,
}

type BodyUpdate struct {
	Body string `json:"body"`
}

func getResourceRecord(resource db.Resource) map[string]any {
	record := map[string]any{}
	_ = json.Unmarshal(resource.Fields, &record)
	record["id"] = resource.ID
	record["kind"] = resource.Kind
	record["owner_id"] = resource.UserID
	record["title"] = resource.Title
	record["share_users"] = resource.ShareUsers
	record["share_campaigns"] = resource.ShareCampaigns
	record["created_at"] = resource.CreatedAt
	record["updated_at"] = resource.UpdatedAt
	if resource.CampaignID != nil {
		record["campaign_id"] = *resource.CampaignID
	}
	if resource.ParentID != resource.ID {
		record["parent_id"] = resource.ParentID
	} else {
		record["parent_id"] = ""
	}
	for _, key := range []string{"share_users", "share_campaigns"} {
		if record[key] == nil {
			record[key] = []uuid.UUID{}
		}
	}
	return record
}

func getShareList(value any) ([]uuid.UUID, bool) {
	raw, ok := value.([]any)
	if !ok {
		return nil, false
	}
	ids := make([]uuid.UUID, 0, len(raw))
	for _, item := range raw {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		id, err := uuid.Parse(text)
		if err != nil {
			return nil, false
		}
		ids = append(ids, id)
	}
	return ids, true
}

func putResourceRecord(resource *db.Resource, body map[string]any) (bool, error) {
	fields := map[string]any{}
	_ = json.Unmarshal(resource.Fields, &fields)
	shared := false
	for key, value := range body {
		switch key {
		case "share_users", "share_campaigns":
			if value == nil {
				value = []any{}
			}
			ids, ok := getShareList(value)
			if !ok {
				return false, errors.New(key + " must be a list of ids")
			}
			switch key {
			case "share_users":
				resource.ShareUsers = ids
			case "share_campaigns":
				resource.ShareCampaigns = ids
			}
			shared = true
			continue
		case "title":
			if text, ok := value.(string); ok {
				resource.Title = text
			}
		}
		if resourceColumns[key] || key == "parent_id" {
			continue
		}
		fields[key] = value
	}
	if resource.Title == "" {
		if name, ok := fields["name"].(string); ok {
			resource.Title = name
		}
	}
	encoded, err := json.Marshal(fields)
	if err != nil {
		return false, err
	}
	resource.Fields = encoded
	return shared, nil
}

func GetResources(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	kind := ctx.QueryParam("kind")
	if !resourceKinds[kind] {
		return respond.Error(ctx, http.StatusBadRequest, "kind must be one of the resource kinds")
	}
	rctx := ctx.Request().Context()
	resources := make([]db.Resource, 0)
	q := db.Instance().NewSelect().Model(&resources).Where("kind = ?", kind)
	if raw := ctx.QueryParam("campaign_id"); raw != "" {
		campaignID, err := uuid.Parse(raw)
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid campaign_id, expected UUID")
		}
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		q = q.Where("campaign_id = ?", campaignID)
	} else {
		userID := actorID
		if raw := ctx.QueryParam("user_id"); raw != "" {
			parsed, err := uuid.Parse(raw)
			if err != nil {
				return respond.Error(ctx, http.StatusBadRequest, "Invalid user_id, expected UUID")
			}
			userID = parsed
		}
		q = q.Where("campaign_id IS NULL").Where("user_id = ?", userID)
	}
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("resource.title").Scan(rctx); err != nil {
		ctx.Logger().Errorf("GetResources: %v", err)
		return respond.ErrorInternal(ctx)
	}
	records := make([]map[string]any, 0, len(resources))
	for _, resource := range resources {
		records = append(records, getResourceRecord(resource))
	}
	return respond.JSON(ctx, http.StatusOK, records, len(records))
}

func GetResource(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	resource := db.Resource{ID: resourceID}
	if err := db.Instance().NewSelect().Model(&resource).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetResource: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, getResourceRecord(resource), 1)
}

func PostResource(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	body := map[string]any{}
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	kind, _ := body["kind"].(string)
	if !resourceKinds[kind] {
		return respond.Error(ctx, http.StatusBadRequest, "kind must be one of the resource kinds")
	}
	rctx := ctx.Request().Context()
	resource := db.Resource{ID: uuid.New(), Kind: kind, UserID: actorID, Fields: json.RawMessage(`{}`)}
	if raw, ok := body["campaign_id"].(string); ok && raw != "" {
		campaignID, err := uuid.Parse(raw)
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid campaign_id, expected UUID")
		}
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		resource.CampaignID = &campaignID
	}
	resource.ParentID = resource.ID
	resource.RootID = resource.ID
	if raw, ok := body["parent_id"].(string); ok && raw != "" {
		parentID, err := uuid.Parse(raw)
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid parent_id, expected UUID")
		}
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, parentID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_READ); err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "parent_id is not a resource you read")
		}
		parent := db.Resource{ID: parentID}
		if err := db.Instance().NewSelect().Model(&parent).WherePK().Scan(rctx); err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "parent_id is not a resource you read")
		}
		resource.ParentID = parent.ID
		resource.RootID = parent.RootID
	}
	if _, err := putResourceRecord(&resource, body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	putShareBody(&resource.Share, BodyShare{})
	w, err := postWriter(rctx, actorID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	resource.OwnerID = w.OwnerID
	resource.CreatedBy = w.Access.UserClaimID
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&resource).ExcludeColumn("sa_created_at", "sa_updated_at", "sa_deleted_at", "reader_claim_id").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostResource", "create", db.OBJECT_TYPE_RESOURCE, resource.ID, resource.OwnerID, w.Access.UserClaimID, resource.Title); err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_RESOURCE, resource.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		return putShare(tctx, tx, w, db.OBJECT_TYPE_RESOURCE, resource.ID, &resource.Share, nil, nil)
	}); err != nil {
		ctx.Logger().Errorf("PostResource: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, getResourceRecord(resource), 1)
}

func PutResource(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	body := map[string]any{}
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	resource := db.Resource{ID: resourceID}
	if err := db.Instance().NewSelect().Model(&resource).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	shared, err := putResourceRecord(&resource, body)
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	putShareBody(&resource.Share, BodyShare{})
	var w *Writer
	if shared {
		if resource.UserID != actorID {
			return respond.Error(ctx, http.StatusForbidden, "Only the owner shares a page")
		}
		if w, err = postWriter(rctx, actorID); err != nil {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
	}
	resource.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if w != nil {
			if err := putShare(tctx, tx, w, db.OBJECT_TYPE_RESOURCE, resource.ID, &resource.Share, nil, nil); err != nil {
				return err
			}
		}
		if _, err := tx.NewUpdate().Model(&resource).Column("title", "fields", "share_users", "share_campaigns", "sa_updated_at").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutResource", "update", db.OBJECT_TYPE_RESOURCE, resource.ID, resource.OwnerID, ac.UserClaimID, resource.Title)
	}); err != nil {
		ctx.Logger().Errorf("PutResource: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, getResourceRecord(resource), 1)
}

func DeleteResource(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_OWNER)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	resource := db.Resource{ID: resourceID}
	if err := db.Instance().NewSelect().Model(&resource).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&resource).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		if _, err := tx.NewDelete().Model((*db.ResourceUpdate)(nil)).Where("resource_id = ?", resourceID).Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteResource", "delete", db.OBJECT_TYPE_RESOURCE, resource.ID, resource.OwnerID, ac.UserClaimID, resource.Title)
	}); err != nil {
		ctx.Logger().Errorf("DeleteResource: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusOK)
}

func GetResourceUpdates(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	updates := make([]db.ResourceUpdate, 0)
	q := db.Instance().NewSelect().Model(&updates).Where("resource_id = ?", resourceID).OrderExpr("created_at")
	if raw := ctx.QueryParam("after"); raw != "" {
		after, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid after, expected RFC3339")
		}
		q = q.Where("created_at > ?", after)
	}
	if err := q.Scan(rctx); err != nil {
		ctx.Logger().Errorf("GetResourceUpdates: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, updates, len(updates))
}

func PostResourceUpdate(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyUpdate
	if err := ctx.Bind(&body); err != nil || body.Body == "" {
		return respond.Error(ctx, http.StatusBadRequest, "body required")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	update := db.ResourceUpdate{ResourceID: resourceID, AuthorID: actorID, Body: body.Body}
	if _, err := db.Instance().NewInsert().Model(&update).ExcludeColumn("id", "created_at").Returning("*").Exec(rctx); err != nil {
		ctx.Logger().Errorf("PostResourceUpdate: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.ResourceTopic(resourceID), broker.KindUpdate, update.ID.String(), broker.OpCreate)
	return respond.JSON(ctx, http.StatusCreated, update, 1)
}

func PutResourceUpdates(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyUpdate
	if err := ctx.Bind(&body); err != nil || body.Body == "" {
		return respond.Error(ctx, http.StatusBadRequest, "body required")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	update := db.ResourceUpdate{ResourceID: resourceID, AuthorID: actorID, Body: body.Body}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewDelete().Model((*db.ResourceUpdate)(nil)).Where("resource_id = ?", resourceID).Exec(tctx); err != nil {
			return err
		}
		_, err := tx.NewInsert().Model(&update).ExcludeColumn("id", "created_at").Returning("*").Exec(tctx)
		return err
	}); err != nil {
		ctx.Logger().Errorf("PutResourceUpdates: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.ResourceTopic(resourceID), broker.KindUpdate, update.ID.String(), broker.OpUpdate)
	return respond.JSON(ctx, http.StatusOK, update, 1)
}

func DeleteResourceUpdates(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if _, err := db.Instance().NewDelete().Model((*db.ResourceUpdate)(nil)).Where("resource_id = ?", resourceID).Exec(rctx); err != nil {
		ctx.Logger().Errorf("DeleteResourceUpdates: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.ResourceTopic(resourceID), broker.KindUpdate, resourceID.String(), broker.OpDelete)
	return respond.NoContent(ctx, http.StatusOK)
}
