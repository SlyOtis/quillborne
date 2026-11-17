package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nimling/nimbody/respond"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

var catalogKinds = map[string]bool{"classes": true, "races": true}

func getCatalogRecord(entry db.CatalogEntry) map[string]any {
	record := map[string]any{}
	_ = json.Unmarshal(entry.Entry, &record)
	record["id"] = entry.Slug
	record["name"] = entry.Name
	record["description"] = entry.Description
	record["digest"] = entry.Digest
	record["owner_id"] = entry.UserID
	return record
}

func GetCatalogEntries(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	kind := ctx.Param("kind")
	if !catalogKinds[kind] {
		return respond.Error(ctx, http.StatusBadRequest, "kind must be classes or races")
	}
	entries := make([]db.CatalogEntry, 0)
	q := db.Instance().NewSelect().Model(&entries).Where("kind = ?", kind)
	if digest := ctx.QueryParam("digest"); digest != "" {
		q = q.Where("digest = ?", digest)
	}
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_CATALOG_ENTRY, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("catalog_entry.name").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetCatalogEntries: %v", err)
		return respond.ErrorInternal(ctx)
	}
	records := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		records = append(records, getCatalogRecord(entry))
	}
	return respond.JSON(ctx, http.StatusOK, records, len(records))
}

func GetCatalogEntry(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	kind := ctx.Param("kind")
	if !catalogKinds[kind] {
		return respond.Error(ctx, http.StatusBadRequest, "kind must be classes or races")
	}
	rctx := ctx.Request().Context()
	var entry db.CatalogEntry
	if err := db.Instance().NewSelect().Model(&entry).Where("kind = ?", kind).Where("slug = ?", ctx.Param("slug")).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetCatalogEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, entry.ID, db.OBJECT_TYPE_CATALOG_ENTRY, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetCatalogEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, getCatalogRecord(entry), 1)
}

func PutCatalogEntry(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	kind := ctx.Param("kind")
	if !catalogKinds[kind] {
		return respond.Error(ctx, http.StatusBadRequest, "kind must be classes or races")
	}
	slug := ctx.Param("slug")
	body := map[string]any{}
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	name, _ := body["name"].(string)
	description, _ := body["description"].(string)
	digest, _ := body["digest"].(string)
	for _, key := range []string{"id", "name", "description", "digest", "owner_id", "created_at"} {
		delete(body, key)
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	var entry db.CatalogEntry
	err = db.Instance().NewSelect().Model(&entry).Where("kind = ?", kind).Where("slug = ?", slug).Scan(rctx)
	if err == nil {
		ac, accessErr := sdb.Instance().MutationAccess(rctx, actorID, entry.ID, db.OBJECT_TYPE_CATALOG_ENTRY, sdb.ACCESS_WRITE)
		if accessErr != nil || ac == nil {
			if accessErr == nil || errors.Is(accessErr, sdb.ErrNotFound) || errors.Is(accessErr, sdb.ErrNoAccess) {
				return respond.Error(ctx, http.StatusForbidden, "Forbidden")
			}
			ctx.Logger().Errorf("PutCatalogEntry: %v", accessErr)
			return respond.ErrorInternal(ctx)
		}
		entry.Name = name
		entry.Description = description
		entry.Digest = digest
		entry.Entry = encoded
		if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewUpdate().Model(&entry).Column("name", "description", "digest", "entry").Set("sa_updated_at = NOW()").WherePK().Exec(tctx); err != nil {
				return err
			}
			return sdb.Write(tctx, tx, "PutCatalogEntry", "update", db.OBJECT_TYPE_CATALOG_ENTRY, entry.ID, entry.OwnerID, ac.UserClaimID, entry.Name)
		}); err != nil {
			ctx.Logger().Errorf("PutCatalogEntry: %v", err)
			return respond.ErrorInternal(ctx)
		}
		return respond.JSON(ctx, http.StatusOK, getCatalogRecord(entry), 1)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		ctx.Logger().Errorf("PutCatalogEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	w, err := postWriter(rctx, actorID, nil)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		if errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("PutCatalogEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	entry = db.CatalogEntry{Kind: kind, UserID: actorID, Slug: slug, Name: name, Description: description, Digest: digest, Entry: encoded, OwnerID: w.OwnerID, CreatedBy: w.Access.UserClaimID}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&entry).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PutCatalogEntry", "create", db.OBJECT_TYPE_CATALOG_ENTRY, entry.ID, entry.OwnerID, w.Access.UserClaimID, entry.Name); err != nil {
			return err
		}
		return postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_CATALOG_ENTRY, entry.ID, sdb.ACCESS_MEMBER|sdb.ACCESS_READ)
	}); err != nil {
		ctx.Logger().Errorf("PutCatalogEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, getCatalogRecord(entry), 1)
}
