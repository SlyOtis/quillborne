package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nimling/nimbody/respond"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

var claimObjectTypes = map[string]string{
	"campaign":  db.OBJECT_TYPE_CAMPAIGN,
	"character": db.OBJECT_TYPE_CHARACTER,
	"resource":  db.OBJECT_TYPE_RESOURCE,
	"encounter": db.OBJECT_TYPE_ENCOUNTER,
	"song":      db.OBJECT_TYPE_SONG,
	"map":       db.OBJECT_TYPE_CAMPAIGN_MAP,
	"asset":     db.OBJECT_TYPE_ASSET,
}

type BodyClaim struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Access      sdb.ClaimAccess `json:"access"`
}

type BodyClaimUser struct {
	UserID uuid.UUID `json:"user_id"`
}

type BodyClaimObject struct {
	ObjectID   uuid.UUID        `json:"object_id"`
	ObjectType string           `json:"object_type"`
	Access     *sdb.ClaimAccess `json:"access"`
}

func GetClaim(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	claimID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	claim, err := sdb.Instance().GetClaim(ctx.Request().Context(), actorID, claimID, sdb.ACCESS_READ)
	if err != nil || claim == nil {
		if errors.Is(err, sdb.ErrNotFound) || err == nil {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	return respond.JSON(ctx, http.StatusOK, claim, 1)
}

func GetObjectClaims(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	objectType, known := claimObjectTypes[ctx.Param("type")]
	if !known {
		return respond.Error(ctx, http.StatusBadRequest, "Unknown object type")
	}
	objectID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, objectID, objectType, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	claims, err := sdb.Instance().GetObjectClaims(rctx, actorID, objectID, objectType)
	if err != nil {
		ctx.Logger().Errorf("GetObjectClaims: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, claims, len(claims))
}

func PostClaim(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyClaim
	if err := ctx.Bind(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		return respond.Error(ctx, http.StatusBadRequest, "name required")
	}
	if body.Access == 0 || body.Access&sdb.ACCESS_DENY != 0 {
		return respond.Error(ctx, http.StatusBadRequest, "access must be a grant mask")
	}
	rctx := ctx.Request().Context()
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	var claimID uuid.UUID
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		var err error
		claimID, err = postClaim(tctx, tx, w, strings.TrimSpace(body.Name), body.Description, body.Access)
		if err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostClaim", "create", sdb.OBJECT_TYPE_CLAIM, claimID, w.OwnerID, w.Access.UserClaimID, body.Name)
	}); err != nil {
		ctx.Logger().Errorf("PostClaim: %v", err)
		return respond.ErrorInternal(ctx)
	}
	claim, err := sdb.Instance().GetClaim(rctx, actorID, claimID, sdb.ACCESS_READ)
	if err != nil || claim == nil {
		return respond.JSON(ctx, http.StatusCreated, map[string]any{"id": claimID}, 1)
	}
	return respond.JSON(ctx, http.StatusCreated, claim, 1)
}

func PostClaimUser(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	claimID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyClaimUser
	if err := ctx.Bind(&body); err != nil || body.UserID == uuid.Nil {
		return respond.Error(ctx, http.StatusBadRequest, "user_id required")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, claimID, sdb.OBJECT_TYPE_CLAIM, sdb.ACCESS_WRITE)
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
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := postGrant(tctx, tx, w, claimID, body.UserID); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostClaimUser", "create", sdb.OBJECT_TYPE_USER_CLAIM, claimID, w.OwnerID, w.Access.UserClaimID, "Granted claim to user")
	}); err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return respond.Error(ctx, http.StatusConflict, "The user holds the claim")
		}
		ctx.Logger().Errorf("PostClaimUser: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusCreated)
}

func DeleteClaimUser(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	claimID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	userID, err := uuid.Parse(ctx.Param("user_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid user_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, claimID, sdb.OBJECT_TYPE_CLAIM, sdb.ACCESS_WRITE)
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
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if err := deleteGrant(tctx, tx, w, claimID, userID); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteClaimUser", "delete", sdb.OBJECT_TYPE_USER_CLAIM, claimID, w.OwnerID, w.Access.UserClaimID, "Revoked claim from user")
	}); err != nil {
		ctx.Logger().Errorf("DeleteClaimUser: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusOK)
}

func PostClaimObject(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	claimID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	var body BodyClaimObject
	if err := ctx.Bind(&body); err != nil || body.ObjectID == uuid.Nil {
		return respond.Error(ctx, http.StatusBadRequest, "object_id required")
	}
	objectType, known := claimObjectTypes[body.ObjectType]
	if !known {
		return respond.Error(ctx, http.StatusBadRequest, "Unknown object_type")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, claimID, sdb.OBJECT_TYPE_CLAIM, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, body.ObjectID, objectType, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	access := sdb.ACCESS_READ
	if body.Access != nil {
		access = *body.Access
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if err := putBindings(tctx, tx, w, objectType, body.ObjectID, map[uuid.UUID]sdb.ClaimAccess{claimID: access}, []uuid.UUID{claimID}); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostClaimObject", "create", sdb.OBJECT_TYPE_CLAIM_OBJECT, body.ObjectID, w.OwnerID, w.Access.UserClaimID, "Bound claim to object")
	}); err != nil {
		ctx.Logger().Errorf("PostClaimObject: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusCreated)
}

func DeleteClaimObject(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	claimID, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid id, expected UUID")
	}
	objectID, err := uuid.Parse(ctx.Param("object_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid object_id, expected UUID")
	}
	objectType, known := claimObjectTypes[ctx.QueryParam("object_type")]
	if !known {
		return respond.Error(ctx, http.StatusBadRequest, "Unknown object_type")
	}
	rctx := ctx.Request().Context()
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, claimID, sdb.OBJECT_TYPE_CLAIM, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, objectID, objectType, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	w, err := postWriter(rctx, actorID)
	if err != nil {
		return respond.Error(ctx, http.StatusForbidden, "Forbidden")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if err := putBindings(tctx, tx, w, objectType, objectID, map[uuid.UUID]sdb.ClaimAccess{}, []uuid.UUID{claimID}); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteClaimObject", "delete", sdb.OBJECT_TYPE_CLAIM_OBJECT, objectID, w.OwnerID, w.Access.UserClaimID, "Unbound claim from object")
	}); err != nil {
		ctx.Logger().Errorf("DeleteClaimObject: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.NoContent(ctx, http.StatusOK)
}
