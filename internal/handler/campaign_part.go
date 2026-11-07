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

type BodyMap struct {
	Title       *string          `json:"title"`
	ImageURL    *string          `json:"image_url"`
	Layers      *json.RawMessage `json:"layers"`
	Markers     *json.RawMessage `json:"markers"`
	IsVisible   *bool            `json:"is_visible"`
	MinZoom     *float64         `json:"min_zoom"`
	MaxZoom     *float64         `json:"max_zoom"`
	Plan        *json.RawMessage `json:"plan"`
	ParentMapID *uuid.UUID       `json:"parent_map_id"`
}

type BodyShare struct {
	ShareUsers     *[]uuid.UUID `json:"share_users"`
	ShareCampaigns *[]uuid.UUID `json:"share_campaigns"`
	ShareParties   *[]uuid.UUID `json:"share_parties"`
}

type BodyEncounter struct {
	Title      *string          `json:"title"`
	Combatants *json.RawMessage `json:"combatants"`
	Round      *int             `json:"round"`
	Turn       *int             `json:"turn"`
	IsActive   *bool            `json:"is_active"`
	BodyShare
}

type BodySong struct {
	Title    *string  `json:"title"`
	Address  *string  `json:"address"`
	Duration *float64 `json:"duration"`
	BodyShare
}

type BodyChatEntry struct {
	AuthorName *string          `json:"author_name"`
	Kind       *string          `json:"kind"`
	Body       *string          `json:"body"`
	Query      *string          `json:"query"`
	IsHidden   *bool            `json:"is_hidden"`
	CardKind   *string          `json:"card_kind"`
	RollKind   *string          `json:"roll_kind"`
	Formula    *string          `json:"formula"`
	Dice       *json.RawMessage `json:"dice"`
	Roll       *float64         `json:"roll"`
	Total      *float64         `json:"total"`
}

func putShareBody(share *db.Share, body BodyShare) []string {
	columns := make([]string, 0, 3)
	if body.ShareUsers != nil {
		share.ShareUsers = *body.ShareUsers
		columns = append(columns, "share_users")
	}
	if body.ShareCampaigns != nil {
		share.ShareCampaigns = *body.ShareCampaigns
		columns = append(columns, "share_campaigns")
	}
	if body.ShareParties != nil {
		share.ShareParties = *body.ShareParties
		columns = append(columns, "share_parties")
	}
	if share.ShareUsers == nil {
		share.ShareUsers = []uuid.UUID{}
	}
	if share.ShareCampaigns == nil {
		share.ShareCampaigns = []uuid.UUID{}
	}
	if share.ShareParties == nil {
		share.ShareParties = []uuid.UUID{}
	}
	return columns
}

func GetMaps(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	maps := make([]db.CampaignMap, 0)
	q := db.Instance().NewSelect().Model(&maps).Where("campaign_id = ?", campaign.ID)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_CAMPAIGN_MAP, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("campaign_map.sa_created_at").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetMaps: %v", err)
		return respond.ErrorInternal(ctx)
	}
	for i := range maps {
		if maps[i].ParentID != maps[i].ID {
			parent := maps[i].ParentID
			maps[i].ParentMapID = &parent
		}
	}
	return respond.JSON(ctx, http.StatusOK, maps, len(maps))
}

func PostMap(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	var body BodyMap
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.CampaignMap{
		ID:         uuid.New(),
		CampaignID: campaign.ID,
		UserID:     actorID,
		Layers:     json.RawMessage(`[]`),
		Markers:    json.RawMessage(`[]`),
		MinZoom:    1,
		MaxZoom:    8,
		OwnerID:    w.OwnerID,
		CreatedBy:  w.Access.UserClaimID,
	}
	item.ParentID = item.ID
	item.RootID = item.ID
	if body.ParentMapID != nil {
		parent := db.CampaignMap{ID: *body.ParentMapID}
		if err := db.Instance().NewSelect().Model(&parent).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "parent_map_id is not a map of this campaign")
		}
		item.ParentID = parent.ID
		item.RootID = parent.RootID
	}
	if body.Title != nil {
		item.Title = *body.Title
	}
	if body.ImageURL != nil {
		item.ImageURL = *body.ImageURL
	}
	if body.IsVisible != nil {
		item.IsVisible = *body.IsVisible
	}
	if body.MinZoom != nil {
		item.MinZoom = *body.MinZoom
	}
	if body.MaxZoom != nil {
		item.MaxZoom = *body.MaxZoom
	}
	if body.Plan != nil {
		item.Plan = *body.Plan
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&item).ExcludeColumn("sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostMap", "create", db.OBJECT_TYPE_CAMPAIGN_MAP, item.ID, item.OwnerID, w.Access.UserClaimID, item.Title); err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_CAMPAIGN_MAP, item.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		want := map[uuid.UUID]sdb.ClaimAccess{}
		if campaign.DmClaimID != nil {
			want[*campaign.DmClaimID] = sdb.ACCESS_ALL
		}
		if campaign.PlayerClaimID != nil {
			want[*campaign.PlayerClaimID] = sdb.ACCESS_READ
		}
		return putBindings(tctx, tx, w, db.OBJECT_TYPE_CAMPAIGN_MAP, item.ID, want, nil)
	}); err != nil {
		ctx.Logger().Errorf("PostMap: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if item.ParentID != item.ID {
		parent := item.ParentID
		item.ParentMapID = &parent
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindMap, item.ID.String(), broker.OpCreate)
	return respond.JSON(ctx, http.StatusCreated, item, 1)
}

func PutMap(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	mapID, err := uuid.Parse(ctx.Param("map_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid map_id, expected UUID")
	}
	var body BodyMap
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, mapID, db.OBJECT_TYPE_CAMPAIGN_MAP, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.CampaignMap{ID: mapID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	columns := []string{"sa_updated_at"}
	if body.Title != nil {
		item.Title = *body.Title
		columns = append(columns, "title")
	}
	if body.ImageURL != nil {
		item.ImageURL = *body.ImageURL
		columns = append(columns, "image_url")
	}
	if body.Layers != nil {
		item.Layers = *body.Layers
		columns = append(columns, "layers")
	}
	if body.Markers != nil {
		item.Markers = *body.Markers
		columns = append(columns, "markers")
	}
	if body.IsVisible != nil {
		item.IsVisible = *body.IsVisible
		columns = append(columns, "is_visible")
	}
	if body.MinZoom != nil {
		item.MinZoom = *body.MinZoom
		columns = append(columns, "min_zoom")
	}
	if body.MaxZoom != nil {
		item.MaxZoom = *body.MaxZoom
		columns = append(columns, "max_zoom")
	}
	if body.Plan != nil {
		item.Plan = *body.Plan
		columns = append(columns, "plan")
	}
	item.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&item).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutMap", "update", db.OBJECT_TYPE_CAMPAIGN_MAP, item.ID, item.OwnerID, ac.UserClaimID, item.Title)
	}); err != nil {
		ctx.Logger().Errorf("PutMap: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if item.ParentID != item.ID {
		parent := item.ParentID
		item.ParentMapID = &parent
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindMap, item.ID.String(), broker.OpUpdate)
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func DeleteMap(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	mapID, err := uuid.Parse(ctx.Param("map_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid map_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, mapID, db.OBJECT_TYPE_CAMPAIGN_MAP, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.CampaignMap{ID: mapID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Table("campaign_map").Set("sa_deleted_at = NOW()").Where("sa_root_id = ? AND (id = ? OR sa_parent_id = ?)", item.RootID, item.ID, item.ID).Where("sa_deleted_at IS NULL").Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteMap", "delete", db.OBJECT_TYPE_CAMPAIGN_MAP, item.ID, item.OwnerID, ac.UserClaimID, item.Title)
	}); err != nil {
		ctx.Logger().Errorf("DeleteMap: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindMap, item.ID.String(), broker.OpDelete)
	return respond.NoContent(ctx, http.StatusOK)
}

func GetEncounters(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	encounters := make([]db.Encounter, 0)
	q := db.Instance().NewSelect().Model(&encounters).Where("campaign_id = ?", campaign.ID)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_ENCOUNTER, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("encounter.sa_created_at DESC").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetEncounters: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, encounters, len(encounters))
}

func PostEncounter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	var body BodyEncounter
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Encounter{
		CampaignID: campaign.ID,
		UserID:     actorID,
		Title:      "Untitled encounter",
		Combatants: json.RawMessage(`[]`),
		Round:      1,
		OwnerID:    w.OwnerID,
		CreatedBy:  w.Access.UserClaimID,
	}
	if body.Title != nil {
		item.Title = *body.Title
	}
	if body.Combatants != nil {
		item.Combatants = *body.Combatants
	}
	if body.Round != nil {
		item.Round = *body.Round
	}
	if body.Turn != nil {
		item.Turn = *body.Turn
	}
	if body.IsActive != nil {
		item.IsActive = *body.IsActive
	}
	putShareBody(&item.Share, body.BodyShare)
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&item).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at", "reader_claim_id").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostEncounter", "create", db.OBJECT_TYPE_ENCOUNTER, item.ID, item.OwnerID, w.Access.UserClaimID, item.Title); err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_ENCOUNTER, item.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		fixed := map[uuid.UUID]sdb.ClaimAccess{}
		managed := []uuid.UUID{}
		if campaign.DmClaimID != nil {
			fixed[*campaign.DmClaimID] = sdb.ACCESS_ALL
			managed = append(managed, *campaign.DmClaimID)
		}
		return putShare(tctx, tx, w, db.OBJECT_TYPE_ENCOUNTER, item.ID, &item.Share, fixed, managed)
	}); err != nil {
		ctx.Logger().Errorf("PostEncounter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindEncounter, item.ID.String(), broker.OpCreate)
	return respond.JSON(ctx, http.StatusCreated, item, 1)
}

func PutEncounter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	encounterID, err := uuid.Parse(ctx.Param("encounter_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid encounter_id, expected UUID")
	}
	var body BodyEncounter
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, encounterID, db.OBJECT_TYPE_ENCOUNTER, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Encounter{ID: encounterID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	columns := []string{"sa_updated_at"}
	if body.Title != nil {
		item.Title = *body.Title
		columns = append(columns, "title")
	}
	if body.Combatants != nil {
		item.Combatants = *body.Combatants
		columns = append(columns, "combatants")
	}
	if body.Round != nil {
		item.Round = *body.Round
		columns = append(columns, "round")
	}
	if body.Turn != nil {
		item.Turn = *body.Turn
		columns = append(columns, "turn")
	}
	if body.IsActive != nil {
		item.IsActive = *body.IsActive
		columns = append(columns, "is_active")
	}
	shared := putShareBody(&item.Share, body.BodyShare)
	columns = append(columns, shared...)
	var w *Writer
	if len(shared) > 0 {
		if w, err = postWriter(rctx, actorID); err != nil {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
	}
	item.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if w != nil {
			fixed := map[uuid.UUID]sdb.ClaimAccess{}
			managed := []uuid.UUID{}
			if campaign.DmClaimID != nil {
				fixed[*campaign.DmClaimID] = sdb.ACCESS_ALL
				managed = append(managed, *campaign.DmClaimID)
			}
			if err := putShare(tctx, tx, w, db.OBJECT_TYPE_ENCOUNTER, item.ID, &item.Share, fixed, managed); err != nil {
				return err
			}
		}
		if _, err := tx.NewUpdate().Model(&item).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutEncounter", "update", db.OBJECT_TYPE_ENCOUNTER, item.ID, item.OwnerID, ac.UserClaimID, item.Title)
	}); err != nil {
		ctx.Logger().Errorf("PutEncounter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindEncounter, item.ID.String(), broker.OpUpdate)
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func DeleteEncounter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	encounterID, err := uuid.Parse(ctx.Param("encounter_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid encounter_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, encounterID, db.OBJECT_TYPE_ENCOUNTER, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Encounter{ID: encounterID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&item).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteEncounter", "delete", db.OBJECT_TYPE_ENCOUNTER, item.ID, item.OwnerID, ac.UserClaimID, item.Title)
	}); err != nil {
		ctx.Logger().Errorf("DeleteEncounter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindEncounter, item.ID.String(), broker.OpDelete)
	return respond.NoContent(ctx, http.StatusOK)
}

func GetSongs(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	songs := make([]db.Song, 0)
	q := db.Instance().NewSelect().Model(&songs).Where("campaign_id = ?", campaign.ID)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_SONG, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("song.title").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetSongs: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, songs, len(songs))
}

func PostSong(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	var body BodySong
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Song{CampaignID: campaign.ID, UserID: actorID, OwnerID: w.OwnerID, CreatedBy: w.Access.UserClaimID}
	if body.Title != nil {
		item.Title = *body.Title
	}
	if body.Address != nil {
		item.Address = *body.Address
	}
	if body.Duration != nil {
		item.Duration = *body.Duration
	}
	putShareBody(&item.Share, body.BodyShare)
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&item).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at", "reader_claim_id").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostSong", "create", db.OBJECT_TYPE_SONG, item.ID, item.OwnerID, w.Access.UserClaimID, item.Title); err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_SONG, item.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		return putShare(tctx, tx, w, db.OBJECT_TYPE_SONG, item.ID, &item.Share, nil, nil)
	}); err != nil {
		ctx.Logger().Errorf("PostSong: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindSong, item.ID.String(), broker.OpCreate)
	return respond.JSON(ctx, http.StatusCreated, item, 1)
}

func PutSong(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	songID, err := uuid.Parse(ctx.Param("song_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid song_id, expected UUID")
	}
	var body BodySong
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, songID, db.OBJECT_TYPE_SONG, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Song{ID: songID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	columns := []string{"sa_updated_at"}
	if body.Title != nil {
		item.Title = *body.Title
		columns = append(columns, "title")
	}
	if body.Address != nil {
		item.Address = *body.Address
		columns = append(columns, "address")
	}
	if body.Duration != nil {
		item.Duration = *body.Duration
		columns = append(columns, "duration")
	}
	shared := putShareBody(&item.Share, body.BodyShare)
	columns = append(columns, shared...)
	var w *Writer
	if len(shared) > 0 {
		if w, err = postWriter(rctx, actorID); err != nil {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
	}
	item.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if w != nil {
			if err := putShare(tctx, tx, w, db.OBJECT_TYPE_SONG, item.ID, &item.Share, nil, nil); err != nil {
				return err
			}
		}
		if _, err := tx.NewUpdate().Model(&item).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutSong", "update", db.OBJECT_TYPE_SONG, item.ID, item.OwnerID, ac.UserClaimID, item.Title)
	}); err != nil {
		ctx.Logger().Errorf("PutSong: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindSong, item.ID.String(), broker.OpUpdate)
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func DeleteSong(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	songID, err := uuid.Parse(ctx.Param("song_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid song_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, songID, db.OBJECT_TYPE_SONG, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Song{ID: songID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&item).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteSong", "delete", db.OBJECT_TYPE_SONG, item.ID, item.OwnerID, ac.UserClaimID, item.Title)
	}); err != nil {
		ctx.Logger().Errorf("DeleteSong: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindSong, item.ID.String(), broker.OpDelete)
	return respond.NoContent(ctx, http.StatusOK)
}

func GetChatEntries(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	entries := make([]db.ChatEntry, 0)
	q := db.Instance().NewSelect().Model(&entries).Where("campaign_id = ?", campaign.ID)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_CHAT_ENTRY, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("chat_entry.sa_created_at").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetChatEntries: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, entries, len(entries))
}

func PostChatEntry(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	var body BodyChatEntry
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	entry := db.ChatEntry{CampaignID: campaign.ID, AuthorID: actorID, Kind: "message", Dice: json.RawMessage(`[]`), OwnerID: w.OwnerID, CreatedBy: w.Access.UserClaimID}
	if body.AuthorName != nil {
		entry.AuthorName = *body.AuthorName
	}
	if body.Kind != nil {
		if *body.Kind != "message" && *body.Kind != "roll" {
			return respond.Error(ctx, http.StatusBadRequest, "kind must be message or roll")
		}
		entry.Kind = *body.Kind
	}
	if body.Body != nil {
		entry.Body = *body.Body
	}
	if body.Query != nil {
		entry.Query = *body.Query
	}
	if body.IsHidden != nil {
		entry.IsHidden = *body.IsHidden
	}
	if body.CardKind != nil {
		entry.CardKind = *body.CardKind
	}
	if body.RollKind != nil {
		entry.RollKind = *body.RollKind
	}
	if body.Formula != nil {
		entry.Formula = *body.Formula
	}
	if body.Dice != nil {
		entry.Dice = *body.Dice
	}
	if body.Roll != nil {
		entry.Roll = *body.Roll
	}
	if body.Total != nil {
		entry.Total = *body.Total
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&entry).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostChatEntry", "create", db.OBJECT_TYPE_CHAT_ENTRY, entry.ID, entry.OwnerID, w.Access.UserClaimID, entry.Kind); err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_CHAT_ENTRY, entry.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		want := map[uuid.UUID]sdb.ClaimAccess{}
		if campaign.DmClaimID != nil {
			want[*campaign.DmClaimID] = sdb.ACCESS_READ
		}
		if campaign.PlayerClaimID != nil && !entry.IsHidden {
			want[*campaign.PlayerClaimID] = sdb.ACCESS_READ
		}
		return putBindings(tctx, tx, w, db.OBJECT_TYPE_CHAT_ENTRY, entry.ID, want, nil)
	}); err != nil {
		ctx.Logger().Errorf("PostChatEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindChat, entry.ID.String(), broker.OpCreate)
	return respond.JSON(ctx, http.StatusCreated, entry, 1)
}

func PutChatEntry(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	entryID, err := uuid.Parse(ctx.Param("entry_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid entry_id, expected UUID")
	}
	var body BodyChatEntry
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	entry := db.ChatEntry{ID: entryID}
	if err := db.Instance().NewSelect().Model(&entry).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PutChatEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, entryID, db.OBJECT_TYPE_CHAT_ENTRY, sdb.ACCESS_WRITE)
	if err != nil || ac == nil || entry.AuthorID != actorID {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	columns := []string{"sa_updated_at"}
	if body.Body != nil {
		entry.Body = *body.Body
		columns = append(columns, "body")
	}
	if body.Query != nil {
		entry.Query = *body.Query
		columns = append(columns, "query")
	}
	if body.CardKind != nil {
		entry.CardKind = *body.CardKind
		columns = append(columns, "card_kind")
	}
	entry.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&entry).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutChatEntry", "update", db.OBJECT_TYPE_CHAT_ENTRY, entry.ID, entry.OwnerID, ac.UserClaimID, entry.Kind)
	}); err != nil {
		ctx.Logger().Errorf("PutChatEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindChat, entry.ID.String(), broker.OpUpdate)
	return respond.JSON(ctx, http.StatusOK, entry, 1)
}

func DeleteChatEntry(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaign := &db.Campaign{}
	if campaign.ID, ok = getUUID(ctx.Param("id")); !ok {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if _, err := sdb.Instance().MutationAccess(ctx.Request().Context(), actorID, campaign.ID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(ctx.Request().Context()); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	entryID, err := uuid.Parse(ctx.Param("entry_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid entry_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	entry := db.ChatEntry{ID: entryID}
	if err := db.Instance().NewSelect().Model(&entry).WherePK().Where("campaign_id = ?", campaign.ID).Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, entryID, db.OBJECT_TYPE_CHAT_ENTRY, sdb.ACCESS_WRITE)
	if err != nil || ac == nil || entry.AuthorID != actorID {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&entry).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteChatEntry", "delete", db.OBJECT_TYPE_CHAT_ENTRY, entry.ID, entry.OwnerID, ac.UserClaimID, entry.Kind)
	}); err != nil {
		ctx.Logger().Errorf("DeleteChatEntry: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.CampaignTopic(campaign.ID), broker.KindChat, entry.ID.String(), broker.OpDelete)
	return respond.NoContent(ctx, http.StatusOK)
}
