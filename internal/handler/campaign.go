package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/SlyOtis/quillborne/internal/broker"
	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nimling/nimbody/respond"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

type BodyCampaign struct {
	Name        *string          `json:"name"`
	Description *string          `json:"description"`
	IsActive    *bool            `json:"is_active"`
	Settings    *json.RawMessage `json:"settings"`
}

type BodyPlayer struct {
	Email string `json:"email"`
}

const defaultCampaignSettings = `{"allow_character_editing":false,"share_character_sheets":true,"private_notes":true,"experience_mode":"individual"}`

func getCampaignView(ctx context.Context, campaigns []db.Campaign) error {
	if len(campaigns) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(campaigns))
	for _, campaign := range campaigns {
		ids = append(ids, campaign.ID)
	}
	type held struct {
		ID         uuid.UUID `bun:"id"`
		CampaignID uuid.UUID `bun:"campaign_id"`
	}
	rows := make([]held, 0)
	if err := db.Instance().NewSelect().Table("character").Column("id", "campaign_id").Where("campaign_id IN (?)", bun.In(ids)).Where("sa_deleted_at IS NULL").Scan(ctx, &rows); err != nil {
		return err
	}
	for i := range campaigns {
		campaigns[i].CharacterIDs = []uuid.UUID{}
		for _, row := range rows {
			if row.CampaignID == campaigns[i].ID {
				campaigns[i].CharacterIDs = append(campaigns[i].CharacterIDs, row.ID)
			}
		}
		players, err := getHolders(ctx, campaigns[i].PlayerClaimID)
		if err != nil {
			return err
		}
		campaigns[i].PlayerIDs = players
	}
	return nil
}

func GetCampaigns(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	rctx := ctx.Request().Context()
	campaigns := make([]db.Campaign, 0)
	q := db.Instance().NewSelect().Model(&campaigns)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("campaign.sa_updated_at DESC").Scan(rctx); err != nil {
		ctx.Logger().Errorf("GetCampaigns: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if err := getCampaignView(rctx, campaigns); err != nil {
		ctx.Logger().Errorf("GetCampaigns: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, campaigns, len(campaigns))
}

func GetCampaign(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	campaign := db.Campaign{ID: campaignID}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	campaigns := []db.Campaign{campaign}
	if err := getCampaignView(rctx, campaigns); err != nil {
		ctx.Logger().Errorf("GetCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, campaigns[0], 1)
}

func PostCampaign(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyCampaign
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	if body.Name == nil || strings.TrimSpace(*body.Name) == "" {
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
	campaign := db.Campaign{
		UserID:    actorID,
		Name:      strings.TrimSpace(*body.Name),
		IsActive:  true,
		Settings:  json.RawMessage(defaultCampaignSettings),
		OwnerID:   w.OwnerID,
		CreatedBy: w.Access.UserClaimID,
	}
	if body.Description != nil {
		campaign.Description = *body.Description
	}
	if body.IsActive != nil {
		campaign.IsActive = *body.IsActive
	}
	if body.Settings != nil {
		campaign.Settings = *body.Settings
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&campaign).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostCampaign", "create", db.OBJECT_TYPE_CAMPAIGN, campaign.ID, campaign.OwnerID, w.Access.UserClaimID, campaign.Name); err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_CAMPAIGN, campaign.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		dmClaimID, err := postClaim(tctx, tx, w, "Dungeon master", "Runs the table of "+campaign.Name, sdb.ACCESS_ALL)
		if err != nil {
			return err
		}
		playerClaimID, err := postClaim(tctx, tx, w, "Players", "Plays at the table of "+campaign.Name, sdb.ACCESS_READ)
		if err != nil {
			return err
		}
		if err := putBindings(tctx, tx, w, db.OBJECT_TYPE_CAMPAIGN, campaign.ID, map[uuid.UUID]sdb.ClaimAccess{dmClaimID: sdb.ACCESS_ALL, playerClaimID: sdb.ACCESS_READ}, nil); err != nil {
			return err
		}
		if _, err := postGrant(tctx, tx, w, dmClaimID, actorID); err != nil {
			return err
		}
		folder, err := postFolder(tctx, tx, w, "PostCampaign", campaign.Name, "campaign-"+campaign.ID.String())
		if err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_ASSET, folder.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		if err := putBindings(tctx, tx, w, db.OBJECT_TYPE_ASSET, folder.ID, map[uuid.UUID]sdb.ClaimAccess{dmClaimID: sdb.ACCESS_ALL, playerClaimID: sdb.ACCESS_READ}, nil); err != nil {
			return err
		}
		campaign.DmClaimID = &dmClaimID
		campaign.PlayerClaimID = &playerClaimID
		_, err = tx.NewUpdate().Model(&campaign).Column("dm_claim_id", "player_claim_id").WherePK().Exec(tctx)
		return err
	}); err != nil {
		ctx.Logger().Errorf("PostCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	campaign.PlayerIDs = []uuid.UUID{}
	campaign.CharacterIDs = []uuid.UUID{}
	return respond.JSON(ctx, http.StatusCreated, campaign, 1)
}

func PutCampaign(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyCampaign
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	campaign := db.Campaign{ID: campaignID}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PutCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	columns := []string{"sa_updated_at"}
	if body.Name != nil {
		if strings.TrimSpace(*body.Name) == "" {
			return respond.Error(ctx, http.StatusBadRequest, "name cannot be empty")
		}
		campaign.Name = strings.TrimSpace(*body.Name)
		columns = append(columns, "name")
	}
	if body.Description != nil {
		campaign.Description = *body.Description
		columns = append(columns, "description")
	}
	if body.IsActive != nil {
		campaign.IsActive = *body.IsActive
		columns = append(columns, "is_active")
	}
	if body.Settings != nil {
		campaign.Settings = *body.Settings
		columns = append(columns, "settings")
	}
	campaign.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&campaign).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutCampaign", "update", db.OBJECT_TYPE_CAMPAIGN, campaign.ID, campaign.OwnerID, ac.UserClaimID, campaign.Name)
	}); err != nil {
		ctx.Logger().Errorf("PutCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	campaigns := []db.Campaign{campaign}
	if err := getCampaignView(rctx, campaigns); err != nil {
		ctx.Logger().Errorf("PutCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, campaigns[0], 1)
}

func DeleteCampaign(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_OWNER)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	campaign := db.Campaign{ID: campaignID}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("DeleteCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		held := make([]db.Character, 0)
		if err := tx.NewSelect().Model(&held).Where("campaign_id = ?", campaignID).Scan(tctx); err != nil {
			return err
		}
		for _, character := range held {
			if err := deleteCampaignCharacterTx(tctx, tx, w, &campaign, character.ID); err != nil {
				return err
			}
		}
		for _, table := range []string{"campaign_map", "encounter", "chat_entry", "song"} {
			if _, err := tx.NewUpdate().Table(table).Set("sa_deleted_at = NOW()").Where("campaign_id = ?", campaignID).Where("sa_deleted_at IS NULL").Exec(tctx); err != nil {
				return err
			}
		}
		if _, err := tx.NewUpdate().Table("resource").Set("sa_deleted_at = NOW()").Where("campaign_id = ?", campaignID).Where("sa_deleted_at IS NULL").Exec(tctx); err != nil {
			return err
		}
		if _, err := tx.NewUpdate().Table("file").Set("sa_deleted_at = NOW()").Where("campaign_id = ?", campaignID).Where("sa_deleted_at IS NULL").Exec(tctx); err != nil {
			return err
		}
		if _, err := tx.NewUpdate().Model(&campaign).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteCampaign", "delete", db.OBJECT_TYPE_CAMPAIGN, campaign.ID, campaign.OwnerID, ac.UserClaimID, campaign.Name)
	}); err != nil {
		ctx.Logger().Errorf("DeleteCampaign: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusOK)
}

func PostCampaignPlayer(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyPlayer
	if err := ctx.Bind(&body); err != nil || strings.TrimSpace(body.Email) == "" {
		return respond.Error(ctx, http.StatusBadRequest, "email required")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	campaign := db.Campaign{ID: campaignID}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(rctx); err != nil {
		ctx.Logger().Errorf("PostCampaignPlayer: %v", err)
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	var found db.Profile
	q := db.Instance().NewSelect().Model(&found).Where("lower(email) = ?", strings.TrimSpace(strings.ToLower(body.Email))).Limit(1)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Nobody signs in with that address.")
		}
		ctx.Logger().Errorf("PostCampaignPlayer: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if found.UserID == campaign.UserID {
		return respond.Error(ctx, http.StatusBadRequest, "That is the dungeon master.")
	}
	players, err := getHolders(rctx, campaign.PlayerClaimID)
	if err != nil {
		ctx.Logger().Errorf("PostCampaignPlayer: %v", err)
		return respond.ErrorInternal(ctx)
	}
	for _, player := range players {
		if player == found.UserID {
			return respond.Error(ctx, http.StatusConflict, "They are already at the table.")
		}
	}
	w, err := postWriter(rctx, actorID)
	if err != nil || campaign.PlayerClaimID == nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := postGrant(tctx, tx, w, *campaign.PlayerClaimID, found.UserID); err != nil {
			return err
		}
		if _, err := tx.NewUpdate().Model(&campaign).Set("sa_updated_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostCampaignPlayer", "update", db.OBJECT_TYPE_CAMPAIGN, campaign.ID, campaign.OwnerID, w.Access.UserClaimID, "Seated "+found.Email)
	}); err != nil {
		ctx.Logger().Errorf("PostCampaignPlayer: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusCreated, found, 1)
}

func DeleteCampaignPlayer(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	playerID, err := uuid.Parse(ctx.Param("user_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid user_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	campaign := db.Campaign{ID: campaignID}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil || campaign.PlayerClaimID == nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		held := make([]db.Character, 0)
		if err := tx.NewSelect().Model(&held).Where("campaign_id = ?", campaignID).Where("user_id = ?", playerID).Scan(tctx); err != nil {
			return err
		}
		for _, character := range held {
			if err := deleteCampaignCharacterTx(tctx, tx, w, &campaign, character.ID); err != nil {
				return err
			}
		}
		if err := deleteGrant(tctx, tx, w, *campaign.PlayerClaimID, playerID); err != nil {
			return err
		}
		if _, err := tx.NewUpdate().Model(&campaign).Set("sa_updated_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteCampaignPlayer", "update", db.OBJECT_TYPE_CAMPAIGN, campaign.ID, campaign.OwnerID, w.Access.UserClaimID, "Unseated a player")
	}); err != nil {
		ctx.Logger().Errorf("DeleteCampaignPlayer: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusOK)
}

func GetCampaignCharacters(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	characters := make([]db.Character, 0)
	q := db.Instance().NewSelect().Model(&characters).Where("campaign_id = ?", campaignID)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.Scan(rctx); err != nil {
		ctx.Logger().Errorf("GetCampaignCharacters: %v", err)
		return respond.ErrorInternal(ctx)
	}
	documents := make([]CharacterDocument, 0, len(characters))
	for _, character := range characters {
		documents = append(documents, getCharacterDocument(character))
	}
	return respond.JSON(ctx, http.StatusOK, documents, len(documents))
}

func PostCampaignCharacter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	characterID, err := uuid.Parse(ctx.Param("character_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid character_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	campaign := db.Campaign{ID: campaignID}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		character := db.Character{ID: characterID}
		if err := tx.NewSelect().Model(&character).WherePK().Scan(tctx); err != nil {
			return err
		}
		if character.CampaignID != nil && *character.CampaignID != campaignID {
			previous := db.Campaign{ID: *character.CampaignID}
			if err := tx.NewSelect().Model(&previous).WherePK().Scan(tctx); err == nil {
				if err := deleteCampaignCharacterTx(tctx, tx, w, &previous, characterID); err != nil {
					return err
				}
			}
		}
		if _, err := tx.NewUpdate().Model(&character).Set("campaign_id = ?", campaignID).Set("sa_updated_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		want := map[uuid.UUID]sdb.ClaimAccess{}
		managed := make([]uuid.UUID, 0, 2)
		if campaign.DmClaimID != nil {
			want[*campaign.DmClaimID] = sdb.ACCESS_READ | sdb.ACCESS_WRITE
			managed = append(managed, *campaign.DmClaimID)
		}
		if campaign.PlayerClaimID != nil {
			want[*campaign.PlayerClaimID] = sdb.ACCESS_READ
			managed = append(managed, *campaign.PlayerClaimID)
		}
		if err := putBindings(tctx, tx, w, db.OBJECT_TYPE_CHARACTER, characterID, want, managed); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostCampaignCharacter", "update", db.OBJECT_TYPE_CHARACTER, characterID, character.OwnerID, w.Access.UserClaimID, "Joined "+campaign.Name)
	}); err != nil {
		ctx.Logger().Errorf("PostCampaignCharacter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(rctx, broker.CampaignTopic(campaign.ID), broker.KindCharacter, characterID.String(), broker.OpUpdate)
	broker.Post(rctx, broker.CharacterTopic(characterID), broker.KindCharacter, characterID.String(), broker.OpUpdate)
	return respond.NoContent(ctx, http.StatusOK)
}

func DeleteCampaignCharacter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	characterID, err := uuid.Parse(ctx.Param("character_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid character_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	_, campaignErr := sdb.Instance().MutationAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_WRITE)
	character := db.Character{ID: characterID}
	if err := db.Instance().NewSelect().Model(&character).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if campaignErr != nil && character.UserID != actorID {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	campaign := db.Campaign{ID: campaignID}
	if err := db.Instance().NewSelect().Model(&campaign).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		return deleteCampaignCharacterTx(tctx, tx, w, &campaign, characterID)
	}); err != nil {
		ctx.Logger().Errorf("DeleteCampaignCharacter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(rctx, broker.CampaignTopic(campaign.ID), broker.KindCharacter, characterID.String(), broker.OpUpdate)
	broker.Post(rctx, broker.CharacterTopic(characterID), broker.KindCharacter, characterID.String(), broker.OpUpdate)
	return respond.NoContent(ctx, http.StatusOK)
}

func deleteCampaignCharacterTx(ctx context.Context, tx bun.Tx, w *Writer, campaign *db.Campaign, characterID uuid.UUID) error {
	managed := make([]uuid.UUID, 0, 2)
	for _, claimID := range []*uuid.UUID{campaign.DmClaimID, campaign.PlayerClaimID} {
		if claimID != nil {
			managed = append(managed, *claimID)
		}
	}
	if err := putBindings(ctx, tx, w, db.OBJECT_TYPE_CHARACTER, characterID, map[uuid.UUID]sdb.ClaimAccess{}, managed); err != nil {
		return err
	}
	_, err := tx.NewUpdate().Table("character").Set("campaign_id = NULL").Set("sa_updated_at = NOW()").Where("id = ?", characterID).Where("campaign_id = ?", campaign.ID).Exec(ctx)
	return err
}
