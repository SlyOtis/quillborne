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

type BodyCharacter struct {
	Character  *json.RawMessage `json:"character"`
	Metadata   map[string]any   `json:"metadata"`
	CampaignID *uuid.UUID       `json:"campaign_id"`
}

type BodySources struct {
	Sources []string `json:"sources"`
}

func putCharacterMetadata(character *db.Character) {
	metadata := map[string]any{}
	_ = json.Unmarshal(character.Metadata, &metadata)
	metadata["is_public"] = character.IsPublic
	metadata["created_at"] = character.CreatedAt
	metadata["updated_at"] = character.UpdatedAt
	if character.LastPlayedAt != nil {
		metadata["last_played_at"] = *character.LastPlayedAt
	}
	if _, ok := metadata["tags"]; !ok {
		metadata["tags"] = []string{}
	}
	character.Metadata, _ = json.Marshal(metadata)
	if len(character.Sheet) == 0 {
		character.Sheet = json.RawMessage(`{}`)
	}
}

func getStoredMetadata(metadata map[string]any) (json.RawMessage, *bool) {
	stored := map[string]any{}
	var public *bool
	for key, value := range metadata {
		switch key {
		case "created_at", "updated_at", "last_played_at":
			continue
		case "is_public":
			if flag, ok := value.(bool); ok {
				public = &flag
			}
			continue
		}
		stored[key] = value
	}
	encoded, _ := json.Marshal(stored)
	return encoded, public
}

func putCharacterName(character *db.Character) {
	var sheet struct {
		Info struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		} `json:"info"`
	}
	_ = json.Unmarshal(character.Sheet, &sheet)
	var metadata struct {
		Name string `json:"name"`
	}
	_ = json.Unmarshal(character.Metadata, &metadata)
	character.Name = metadata.Name
	if character.Name == "" {
		character.Name = sheet.Info.Name
	}
	character.Description = sheet.Info.Description
}

func putPublicBinding(ctx context.Context, tx bun.Tx, w *Writer, characterID uuid.UUID, public bool) error {
	access := sdb.ACCESS_MEMBER
	if public {
		access = sdb.ACCESS_MEMBER | sdb.ACCESS_READ
	}
	return putBindings(ctx, tx, w, db.OBJECT_TYPE_CHARACTER, characterID, map[uuid.UUID]sdb.ClaimAccess{*w.Access.ClaimID: access}, []uuid.UUID{*w.Access.ClaimID})
}

func GetCharacters(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	userID := actorID
	if raw := ctx.QueryParam("user_id"); raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid user_id, expected UUID")
		}
		userID = parsed
	}
	characters := make([]db.Character, 0)
	q := db.Instance().NewSelect().Model(&characters).Where("user_id = ?", userID)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("character.sa_updated_at DESC").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetCharacters: %v", err)
		return respond.ErrorInternal(ctx)
	}
	for i := range characters {
		putCharacterMetadata(&characters[i])
	}
	return respond.JSON(ctx, http.StatusOK, characters, len(characters))
}

func GetCharacter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	characterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	character := db.Character{ID: characterID}
	if err := db.Instance().NewSelect().Model(&character).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetCharacter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	putCharacterMetadata(&character)
	return respond.JSON(ctx, http.StatusOK, character, 1)
}

func PostCharacter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyCharacter
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	if body.Character == nil {
		return respond.Error(ctx, http.StatusBadRequest, "character required")
	}
	rctx := ctx.Request().Context()
	var campaign *db.Campaign
	if body.CampaignID != nil {
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, *body.CampaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		campaign = &db.Campaign{ID: *body.CampaignID}
		if err := db.Instance().NewSelect().Model(campaign).WherePK().Scan(rctx); err != nil {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	metadata, public := getStoredMetadata(body.Metadata)
	character := db.Character{
		UserID:     actorID,
		CampaignID: body.CampaignID,
		Sheet:      *body.Character,
		Metadata:   metadata,
		Sources:    json.RawMessage(`[]`),
		OwnerID:    w.OwnerID,
		CreatedBy:  w.Access.UserClaimID,
	}
	if public != nil {
		character.IsPublic = *public
	}
	putCharacterName(&character)
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&character).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostCharacter", "create", db.OBJECT_TYPE_CHARACTER, character.ID, character.OwnerID, w.Access.UserClaimID, "Created a character"); err != nil {
			return err
		}
		if err := putPublicBinding(tctx, tx, w, character.ID, character.IsPublic); err != nil {
			return err
		}
		if campaign == nil {
			return nil
		}
		want := map[uuid.UUID]sdb.ClaimAccess{}
		if campaign.DmClaimID != nil {
			want[*campaign.DmClaimID] = sdb.ACCESS_READ | sdb.ACCESS_WRITE
		}
		if campaign.PlayerClaimID != nil {
			want[*campaign.PlayerClaimID] = sdb.ACCESS_READ
		}
		return putBindings(tctx, tx, w, db.OBJECT_TYPE_CHARACTER, character.ID, want, nil)
	}); err != nil {
		ctx.Logger().Errorf("PostCharacter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	putCharacterMetadata(&character)
	return respond.JSON(ctx, http.StatusCreated, character, 1)
}

func PutCharacter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	characterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyCharacter
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	character := db.Character{ID: characterID}
	if err := db.Instance().NewSelect().Model(&character).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	columns := []string{"sa_updated_at"}
	if body.Character != nil {
		character.Sheet = *body.Character
		now := time.Now()
		character.LastPlayedAt = &now
		columns = append(columns, "sheet", "last_played_at")
	}
	var public *bool
	if body.Metadata != nil {
		merged := map[string]any{}
		_ = json.Unmarshal(character.Metadata, &merged)
		for key, value := range body.Metadata {
			merged[key] = value
		}
		var stored json.RawMessage
		stored, public = getStoredMetadata(merged)
		character.Metadata = stored
		columns = append(columns, "metadata")
		if public != nil && *public != character.IsPublic {
			if character.UserID != actorID {
				return respond.Error(ctx, http.StatusForbidden, "Only the owner shares a sheet")
			}
			character.IsPublic = *public
			columns = append(columns, "is_public")
		} else {
			public = nil
		}
	}
	putCharacterName(&character)
	columns = append(columns, "name", "description")
	character.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&character).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		if public != nil {
			w, err := postWriter(tctx, actorID)
			if err != nil {
				return err
			}
			if err := putPublicBinding(tctx, tx, w, character.ID, *public); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "PutCharacter", "update", db.OBJECT_TYPE_CHARACTER, character.ID, character.OwnerID, ac.UserClaimID, "Changed a character")
	}); err != nil {
		ctx.Logger().Errorf("PutCharacter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(rctx, broker.CharacterTopic(character.ID), broker.KindCharacter, character.ID.String(), broker.OpUpdate)
	if character.CampaignID != nil {
		broker.Post(rctx, broker.CampaignTopic(*character.CampaignID), broker.KindCharacter, character.ID.String(), broker.OpUpdate)
	}
	putCharacterMetadata(&character)
	return respond.JSON(ctx, http.StatusOK, character, 1)
}

func PutCharacterPlayed(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	characterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if _, err := db.Instance().NewUpdate().Table("character").Set("last_played_at = NOW()").Where("id = ?", characterID).Exec(rctx); err != nil {
		ctx.Logger().Errorf("PutCharacterPlayed: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusOK)
}

func DeleteCharacter(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	characterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_OWNER)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	character := db.Character{ID: characterID}
	if err := db.Instance().NewSelect().Model(&character).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&character).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteCharacter", "delete", db.OBJECT_TYPE_CHARACTER, character.ID, character.OwnerID, ac.UserClaimID, "Deleted a character")
	}); err != nil {
		ctx.Logger().Errorf("DeleteCharacter: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(rctx, broker.CharacterTopic(character.ID), broker.KindCharacter, character.ID.String(), broker.OpDelete)
	if character.CampaignID != nil {
		broker.Post(rctx, broker.CampaignTopic(*character.CampaignID), broker.KindCharacter, character.ID.String(), broker.OpDelete)
	}
	return respond.NoContent(ctx, http.StatusOK)
}

func GetCharacterSources(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	characterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_OWNER); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	character := db.Character{ID: characterID}
	if err := db.Instance().NewSelect().Model(&character).Column("sources").WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	sources := make([]string, 0)
	_ = json.Unmarshal(character.Sources, &sources)
	return respond.JSON(ctx, http.StatusOK, sources, len(sources))
}

func PutCharacterSources(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	characterID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodySources
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER, sdb.ACCESS_OWNER); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if body.Sources == nil {
		body.Sources = []string{}
	}
	encoded, _ := json.Marshal(body.Sources)
	if _, err := db.Instance().NewUpdate().Table("character").Set("sources = ?", string(encoded)).Set("sa_updated_at = NOW()").Where("id = ?", characterID).Exec(rctx); err != nil {
		ctx.Logger().Errorf("PutCharacterSources: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, body.Sources, len(body.Sources))
}
