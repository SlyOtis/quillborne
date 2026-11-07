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

var (
	errCrew        = errors.New("crew must be an array")
	errStaleDesign = errors.New("the design changed since you opened it")
)

var vehicleCustomisations = map[string]bool{"locked": true, "approved": true, "full": true}

type BodyVehicle struct {
	Name            *string          `json:"name"`
	CampaignID      *uuid.UUID       `json:"campaign_id"`
	System          *string          `json:"system"`
	Template        *string          `json:"template"`
	TemplateVersion *int             `json:"template_version"`
	Layout          *string          `json:"layout"`
	Components      *json.RawMessage `json:"components"`
	States          *json.RawMessage `json:"states"`
	Stats           *json.RawMessage `json:"stats"`
	Rulings         *json.RawMessage `json:"rulings"`
	Overlay         *json.RawMessage `json:"overlay"`
	Customisation   *string          `json:"customisation"`
	Crew            *json.RawMessage `json:"crew"`
	Requests        *json.RawMessage `json:"requests"`
	Revision        *int             `json:"revision"`
	Note            *string          `json:"note"`
}

type vehicleRevision struct {
	Revision   int             `json:"revision"`
	At         string          `json:"at"`
	UserID     uuid.UUID       `json:"user_id"`
	Note       string          `json:"note"`
	Components json.RawMessage `json:"components"`
}

func putVehicleBody(item *db.Vehicle, body BodyVehicle) []string {
	columns := make([]string, 0, 11)
	if body.Name != nil {
		item.Name = *body.Name
		columns = append(columns, "name")
	}
	if body.System != nil {
		item.System = *body.System
		columns = append(columns, "system")
	}
	if body.Template != nil {
		item.Template = *body.Template
		columns = append(columns, "template")
	}
	if body.TemplateVersion != nil {
		item.TemplateVersion = *body.TemplateVersion
		columns = append(columns, "template_version")
	}
	if body.Layout != nil {
		item.Layout = *body.Layout
		columns = append(columns, "layout")
	}
	if body.States != nil {
		item.States = *body.States
		columns = append(columns, "states")
	}
	if body.Stats != nil {
		item.Stats = *body.Stats
		columns = append(columns, "stats")
	}
	if body.Rulings != nil {
		item.Rulings = *body.Rulings
		columns = append(columns, "rulings")
	}
	if body.Overlay != nil {
		item.Overlay = *body.Overlay
		columns = append(columns, "overlay")
	}
	if body.Customisation != nil {
		item.Customisation = *body.Customisation
		columns = append(columns, "customisation")
	}
	if body.Requests != nil {
		item.Requests = *body.Requests
		columns = append(columns, "requests")
	}
	return columns
}

func getVehicleNote(note *string, fallback string) string {
	if note == nil || strings.TrimSpace(*note) == "" {
		return fallback
	}
	return *note
}

func getCrew(ctx context.Context, raw json.RawMessage) (json.RawMessage, []uuid.UUID, error) {
	entries := make([]map[string]any, 0)
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, nil, errCrew
	}
	ids := make([]uuid.UUID, 0, len(entries))
	for _, entry := range entries {
		text, _ := entry["character_id"].(string)
		if characterID, ok := getUUID(text); ok {
			ids = append(ids, characterID)
		}
	}
	players := map[uuid.UUID]uuid.UUID{}
	if len(ids) > 0 {
		characters := make([]db.Character, 0)
		if err := db.Instance().NewSelect().Model(&characters).Column("id", "user_id").Where("id IN (?)", bun.In(ids)).Scan(ctx); err != nil {
			return nil, nil, err
		}
		for _, character := range characters {
			players[character.ID] = character.UserID
		}
	}
	crew := make([]map[string]any, 0, len(entries))
	users := make([]uuid.UUID, 0, len(entries))
	for _, entry := range entries {
		text, _ := entry["character_id"].(string)
		characterID, _ := getUUID(text)
		user, found := players[characterID]
		if !found {
			continue
		}
		entry["user_id"] = user.String()
		crew = append(crew, entry)
		users = append(users, user)
	}
	stored, err := json.Marshal(crew)
	if err != nil {
		return nil, nil, err
	}
	return stored, getUnique(users), nil
}

func postVehicleEvents(ctx context.Context, item *db.Vehicle, op string) {
	broker.Post(ctx, broker.VehicleTopic(item.ID), broker.KindVehicle, item.ID.String(), op)
	if item.CampaignID != nil {
		broker.Post(ctx, broker.CampaignTopic(*item.CampaignID), broker.KindVehicle, item.ID.String(), op)
	}
}

func GetVehicles(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	vehicles := make([]db.Vehicle, 0)
	q := db.Instance().NewSelect().Model(&vehicles)
	if raw := ctx.QueryParam("campaign_id"); raw != "" {
		campaignID, ok := getUUID(raw)
		if !ok {
			return respond.Error(ctx, http.StatusBadRequest, "Invalid campaign_id, expected UUID")
		}
		q = q.Where("vehicle.campaign_id = ?", campaignID)
	}
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_VEHICLE, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr("vehicle.sa_updated_at DESC").Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetVehicles: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, vehicles, len(vehicles))
}

func GetVehicle(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	vehicleID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, vehicleID, db.OBJECT_TYPE_VEHICLE, sdb.ACCESS_READ); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	item := db.Vehicle{ID: vehicleID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetVehicle: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func PostVehicle(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyVehicle
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	if body.System == nil || *body.System == "" || body.Layout == nil || *body.Layout == "" {
		return respond.Error(ctx, http.StatusBadRequest, "A vehicle names its system and its layout")
	}
	if body.Customisation != nil && !vehicleCustomisations[*body.Customisation] {
		return respond.Error(ctx, http.StatusBadRequest, "customisation must be locked, approved or full")
	}
	rctx := ctx.Request().Context()
	var campaign *db.Campaign
	if body.CampaignID != nil {
		if _, err := sdb.Instance().MutationAccess(rctx, actorID, *body.CampaignID, db.OBJECT_TYPE_CAMPAIGN, sdb.ACCESS_READ); err != nil {
			if errors.Is(err, sdb.ErrNotFound) {
				return respond.Error(ctx, http.StatusNotFound, "Not found")
			}
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
	item := db.Vehicle{
		UserID:        actorID,
		CampaignID:    body.CampaignID,
		Name:          "Unnamed vessel",
		Components:    json.RawMessage(`[]`),
		States:        json.RawMessage(`{}`),
		Stats:         json.RawMessage(`{}`),
		Rulings:       json.RawMessage(`{}`),
		Overlay:       json.RawMessage(`{}`),
		Customisation: "locked",
		Crew:          json.RawMessage(`[]`),
		Revision:      1,
		Requests:      json.RawMessage(`[]`),
		OwnerID:       w.OwnerID,
		CreatedBy:     w.Access.UserClaimID,
	}
	putVehicleBody(&item, body)
	if body.Components != nil {
		item.Components = *body.Components
	}
	item.History, err = json.Marshal([]vehicleRevision{{
		Revision:   item.Revision,
		At:         time.Now().UTC().Format(time.RFC3339),
		UserID:     actorID,
		Note:       getVehicleNote(body.Note, "Built"),
		Components: item.Components,
	}})
	if err != nil {
		ctx.Logger().Errorf("PostVehicle: %v", err)
		return respond.ErrorInternal(ctx)
	}
	crewUsers := []uuid.UUID{}
	if body.Crew != nil {
		if item.Crew, crewUsers, err = getCrew(rctx, *body.Crew); err != nil {
			if errors.Is(err, errCrew) {
				return respond.Error(ctx, http.StatusBadRequest, errCrew.Error())
			}
			ctx.Logger().Errorf("PostVehicle: %v", err)
			return respond.ErrorInternal(ctx)
		}
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&item).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at", "crew_claim_id").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostVehicle", "create", db.OBJECT_TYPE_VEHICLE, item.ID, item.OwnerID, w.Access.UserClaimID, item.Name); err != nil {
			return err
		}
		if err := postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_VEHICLE, item.ID, sdb.ACCESS_MEMBER); err != nil {
			return err
		}
		crewClaimID, err := postClaim(tctx, tx, w, "Crew", "Sails "+item.Name, sdb.ACCESS_READ|sdb.ACCESS_WRITE)
		if err != nil {
			return err
		}
		item.CrewClaimID = &crewClaimID
		if _, err := tx.NewUpdate().Model(&item).Column("crew_claim_id").WherePK().Exec(tctx); err != nil {
			return err
		}
		want := map[uuid.UUID]sdb.ClaimAccess{crewClaimID: sdb.ACCESS_READ | sdb.ACCESS_WRITE}
		if campaign != nil {
			if campaign.DmClaimID != nil {
				want[*campaign.DmClaimID] = sdb.ACCESS_ALL
			}
			if campaign.PlayerClaimID != nil {
				want[*campaign.PlayerClaimID] = sdb.ACCESS_READ
			}
		}
		if err := putBindings(tctx, tx, w, db.OBJECT_TYPE_VEHICLE, item.ID, want, nil); err != nil {
			return err
		}
		return putGrants(tctx, tx, w, crewClaimID, crewUsers)
	}); err != nil {
		ctx.Logger().Errorf("PostVehicle: %v", err)
		return respond.ErrorInternal(ctx)
	}
	postVehicleEvents(rctx, &item, broker.OpCreate)
	return respond.JSON(ctx, http.StatusCreated, item, 1)
}

func PutVehicle(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	vehicleID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyVehicle
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, vehicleID, db.OBJECT_TYPE_VEHICLE, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Vehicle{ID: vehicleID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, vehicleID, db.OBJECT_TYPE_VEHICLE, sdb.ACCESS_OWNER); err != nil {
		open := item.Customisation == "approved" || item.Customisation == "full"
		reserved := body.Name != nil || body.CampaignID != nil || body.System != nil || body.Template != nil ||
			body.TemplateVersion != nil || body.Layout != nil || body.Rulings != nil || body.Overlay != nil ||
			body.Customisation != nil || body.Crew != nil
		if reserved || (!open && (body.Components != nil || body.Stats != nil)) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
	}
	if body.Customisation != nil && !vehicleCustomisations[*body.Customisation] {
		return respond.Error(ctx, http.StatusBadRequest, "customisation must be locked, approved or full")
	}
	columns := append([]string{"sa_updated_at"}, putVehicleBody(&item, body)...)
	base := item.Revision
	if body.Components != nil {
		if body.Revision == nil || *body.Revision != base {
			return respond.Error(ctx, http.StatusConflict, "The design changed since you opened it")
		}
		history := make([]json.RawMessage, 0)
		if err := json.Unmarshal(item.History, &history); err != nil {
			ctx.Logger().Errorf("PutVehicle: %v", err)
			return respond.ErrorInternal(ctx)
		}
		item.Components = *body.Components
		item.Revision = base + 1
		entry, err := json.Marshal(vehicleRevision{
			Revision:   item.Revision,
			At:         time.Now().UTC().Format(time.RFC3339),
			UserID:     actorID,
			Note:       getVehicleNote(body.Note, "Design saved"),
			Components: item.Components,
		})
		if err != nil {
			ctx.Logger().Errorf("PutVehicle: %v", err)
			return respond.ErrorInternal(ctx)
		}
		if item.History, err = json.Marshal(append(history, entry)); err != nil {
			ctx.Logger().Errorf("PutVehicle: %v", err)
			return respond.ErrorInternal(ctx)
		}
		columns = append(columns, "components", "revision", "history")
	}
	var w *Writer
	var crewUsers []uuid.UUID
	if body.Crew != nil {
		if item.Crew, crewUsers, err = getCrew(rctx, *body.Crew); err != nil {
			if errors.Is(err, errCrew) {
				return respond.Error(ctx, http.StatusBadRequest, errCrew.Error())
			}
			ctx.Logger().Errorf("PutVehicle: %v", err)
			return respond.ErrorInternal(ctx)
		}
		w, err = postWriter(rctx, actorID)
		if err != nil || item.CrewClaimID == nil {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		columns = append(columns, "crew")
	}
	item.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		q := tx.NewUpdate().Model(&item).Column(columns...).WherePK()
		if body.Components != nil {
			q = q.Where("revision = ?", base)
		}
		res, err := q.Exec(tctx)
		if err != nil {
			return err
		}
		if changed, err := res.RowsAffected(); err != nil || changed == 0 {
			return errStaleDesign
		}
		if w != nil {
			if err := putGrants(tctx, tx, w, *item.CrewClaimID, crewUsers); err != nil {
				return err
			}
		}
		return sdb.Write(tctx, tx, "PutVehicle", "update", db.OBJECT_TYPE_VEHICLE, item.ID, item.OwnerID, ac.UserClaimID, item.Name)
	}); err != nil {
		if errors.Is(err, errStaleDesign) {
			return respond.Error(ctx, http.StatusConflict, "The design changed since you opened it")
		}
		ctx.Logger().Errorf("PutVehicle: %v", err)
		return respond.ErrorInternal(ctx)
	}
	postVehicleEvents(rctx, &item, broker.OpUpdate)
	return respond.JSON(ctx, http.StatusOK, item, 1)
}

func DeleteVehicle(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	vehicleID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, vehicleID, db.OBJECT_TYPE_VEHICLE, sdb.ACCESS_OWNER)
	if err != nil || ac == nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	item := db.Vehicle{ID: vehicleID}
	if err := db.Instance().NewSelect().Model(&item).WherePK().Scan(rctx); err != nil {
		return respond.Error(ctx, http.StatusNotFound, "Not found")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&item).Set("sa_deleted_at = NOW()").WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteVehicle", "delete", db.OBJECT_TYPE_VEHICLE, item.ID, item.OwnerID, ac.UserClaimID, item.Name)
	}); err != nil {
		ctx.Logger().Errorf("DeleteVehicle: %v", err)
		return respond.ErrorInternal(ctx)
	}
	postVehicleEvents(rctx, &item, broker.OpDelete)
	return respond.NoContent(ctx, http.StatusOK)
}

func getUnique(ids []uuid.UUID) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	unique := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id == uuid.Nil || seen[id] {
			continue
		}
		seen[id] = true
		unique = append(unique, id)
	}
	return unique
}
