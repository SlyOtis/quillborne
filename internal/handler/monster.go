package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nimling/nimbody/respond"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

var errStats = errors.New("stats must be an object")

type BodyMonster struct {
	Name        *string          `json:"name"`
	IsPublic    *bool            `json:"is_public"`
	System      *string          `json:"system"`
	Size        *string          `json:"size"`
	Type        *string          `json:"type"`
	Alignment   *string          `json:"alignment"`
	Challenge   *float64         `json:"challenge"`
	Stats       *json.RawMessage `json:"stats"`
	Description *string          `json:"description"`
	Image       *string          `json:"image"`
	OwnerID     *uuid.UUID       `json:"owner_id"`
}

func putMonsterBody(item *db.Monster, body BodyMonster) ([]string, error) {
	columns := make([]string, 0, 9)
	if body.Name != nil {
		item.Name = strings.TrimSpace(*body.Name)
		columns = append(columns, "name")
	}
	if body.System != nil {
		item.System = *body.System
		columns = append(columns, "system")
	}
	if body.Size != nil {
		item.Size = *body.Size
		columns = append(columns, "size")
	}
	if body.Type != nil {
		item.Type = *body.Type
		columns = append(columns, "type")
	}
	if body.Alignment != nil {
		item.Alignment = *body.Alignment
		columns = append(columns, "alignment")
	}
	if body.Challenge != nil {
		item.Challenge = *body.Challenge
		columns = append(columns, "challenge")
	}
	if body.Stats != nil {
		stats := map[string]any{}
		if err := json.Unmarshal(*body.Stats, &stats); err != nil {
			return nil, errStats
		}
		item.Stats = *body.Stats
		columns = append(columns, "stats")
	}
	if body.Description != nil {
		item.Description = *body.Description
		columns = append(columns, "description")
	}
	if body.Image != nil {
		item.Image = *body.Image
		columns = append(columns, "image")
	}
	return columns, nil
}

func GetMonsters(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	monsters := make([]db.Monster, 0)
	q := db.Instance().NewSelect().Model(&monsters)
	if raw := ctx.QueryParam("owner_id"); raw != "" {
		ownerID, ok := getUUID(raw)
		if !ok {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid owner_id, expected UUID")
		}
		q = q.Where("monster.sa_owner_id = ?", ownerID)
	}
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_MONSTER, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("monster.name ASC, monster.id ASC").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetMonsters: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, monsters, len(monsters))
}

func GetMonster(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	monsterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, monsterID, db.OBJECT_TYPE_MONSTER, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	item := db.Monster{ID: monsterID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func PostMonster(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyMonster
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	if body.System == nil || *body.System == "" {
		return respond.Error(ctx, http.StatusBadRequest, "A monster names its system")
	}
	if body.OwnerID != nil && body.IsPublic != nil && *body.IsPublic {
		return respond.Error(ctx, http.StatusBadRequest, "A campaign's monster is read by its table and is never public")
	}
	rctx := ctx.Request().Context()
	var campaign *db.Campaign
	var ownerID *uuid.UUID
	if body.OwnerID != nil {
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, *body.OwnerID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_WRITE); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			if errors.Is(err, sdb.ErrNoAccess) {
				return respond.Error(ctx, http.StatusForbidden, "Forbidden")
			}
			ctx.Logger().Errorf("PostMonster: %v", err)
			return respond.ErrorInternal(ctx)
		}
		campaign = &db.Campaign{ID: *body.OwnerID}
		if err := getCampaign(rctx, campaign); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
			ctx.Logger().Errorf("PostMonster: %v", err)
			return respond.ErrorInternal(ctx)
		}
		ownerID = &campaign.ID
	}
	w, err := postWriter(rctx, actorID, ownerID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		if errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("PostMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	item := db.Monster{
		UserID:    actorID,
		Stats:     json.RawMessage(`{}`),
		OwnerID:   w.OwnerID,
		CreatedBy: w.Access.UserClaimID,
	}
	if _, err := putMonsterBody(&item, body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	if item.Name == "" {
		item.Name = "Unnamed monster"
	}
	if body.IsPublic != nil {
		item.IsPublic = *body.IsPublic
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&item).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostMonster", "create", db.OBJECT_TYPE_MONSTER, item.ID, item.OwnerID, w.Access.UserClaimID, item.Name); err != nil {
			return err
		}
		if err := putPublicBinding(tctx, tx, w, db.OBJECT_TYPE_MONSTER, item.ID, item.IsPublic); err != nil {
			return err
		}
		if campaign == nil {
			return nil
		}
		memberships, err := getMemberships(tctx, []uuid.UUID{campaign.ID})
		if err != nil {
			return err
		}
		want := map[uuid.UUID]sdb.ClaimAccess{}
		if ownerClaim := memberships[campaign.ID].ownerClaim; ownerClaim != nil {
			want[*ownerClaim] = sdb.ACCESS_ALL
		}
		if memberClaim := memberships[campaign.ID].memberClaim; memberClaim != nil {
			want[*memberClaim] = sdb.ACCESS_READ
		}
		return putBindings(tctx, tx, w, db.OBJECT_TYPE_MONSTER, item.ID, want, nil)
	}); err != nil {
		ctx.Logger().Errorf("PostMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, item, 1)
}

func PutMonster(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	monsterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyMonster
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, monsterID, db.OBJECT_TYPE_MONSTER, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		if err == nil || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("PutMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	item := db.Monster{ID: monsterID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PutMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	changed, err := putMonsterBody(&item, body)
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	if item.Name == "" {
		item.Name = "Unnamed monster"
	}
	columns := append([]string{"sa_updated_at"}, changed...)
	public := body.IsPublic != nil && *body.IsPublic != item.IsPublic
	if home, err := uuid.Parse(os.Getenv("SERVER_OWNER_ID")); public && err == nil && item.OwnerID != home {
		return respond.Error(ctx, http.StatusBadRequest, "A campaign's monster is read by its table and is never public")
	}
	if public {
		item.IsPublic = *body.IsPublic
		columns = append(columns, "is_public")
	}
	item.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&item).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		if public {
			w, err := postWriter(tctx, actorID, &item.OwnerID)
			if err != nil {
				return err
			}
			if err := putPublicBinding(tctx, tx, w, db.OBJECT_TYPE_MONSTER, item.ID, item.IsPublic); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "PutMonster", "update", db.OBJECT_TYPE_MONSTER, item.ID, item.OwnerID, ac.UserClaimID, item.Name)
	}); err != nil {
		ctx.Logger().Errorf("PutMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func DeleteMonster(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	monsterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, monsterID, db.OBJECT_TYPE_MONSTER, sdb.ACCESS_OWNER)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		if err == nil || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("DeleteMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	item := db.Monster{ID: monsterID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("DeleteMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&item).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteMonster", "delete", db.OBJECT_TYPE_MONSTER, item.ID, item.OwnerID, ac.UserClaimID, item.Name)
	}); err != nil {
		ctx.Logger().Errorf("DeleteMonster: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusOK)
}
