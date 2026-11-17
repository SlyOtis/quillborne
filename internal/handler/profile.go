package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
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

var keyField = regexp.MustCompile(`^[a-z][a-z0-9_]*_api_key$`)

type BodyProfile struct {
	Email       *string          `json:"email"`
	DisplayName *string          `json:"display_name"`
	PhotoURL    *string          `json:"photo_url"`
	Preferences *json.RawMessage `json:"preferences"`
	Friends     *[]uuid.UUID     `json:"friends"`
}

type BodyFriend struct {
	Email string `json:"email"`
}

const defaultPreferences = `{"theme":"medieval","sound_enabled":true,"sound_volume":0.7,"animations_enabled":true,"recent_characters":[]}`

func GetProfile(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	rctx := ctx.Request().Context()
	var profile db.Profile
	if err := db.Instance().NewSelect().Model(&profile).Where("user_id = ?", actorID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, profile.ID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		if errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("GetProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, profile, 1)
}

func GetProfiles(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	profiles := make([]db.Profile, 0)
	q := db.Instance().NewSelect().Model(&profiles)
	if email := strings.TrimSpace(strings.ToLower(ctx.QueryParam("email"))); email != "" {
		q = q.Where("lower(email) = ?", email).Limit(1)
	}
	if raw := ctx.QueryParam("ids"); raw != "" {
		ids := make([]uuid.UUID, 0)
		for _, part := range strings.Split(raw, ",") {
			id, err := uuid.Parse(strings.TrimSpace(part))
			if err != nil {
				return respond.Error(ctx, http.StatusBadRequest, "Invalid ids, expected UUIDs")
			}
			ids = append(ids, id)
		}
		q = q.Where("user_id IN (?)", bun.In(ids))
	}
	if ctx.QueryParam("email") == "" && ctx.QueryParam("ids") == "" {
		return respond.Error(ctx, http.StatusBadRequest, "email or ids required")
	}
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.Scan(ctx.Request().Context()); err != nil {
		ctx.Logger().Errorf("GetProfiles: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, profiles, len(profiles))
}

func GetProfileUser(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	userID, err := uuid.Parse(ctx.Param("user_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid user_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	var profile db.Profile
	if err := db.Instance().NewSelect().Model(&profile).Where("user_id = ?", userID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetProfileUser: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, profile.ID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetProfileUser: %v", err)
		return respond.ErrorInternal(ctx)
	}
	return respond.JSON(ctx, http.StatusOK, profile, 1)
}

func PostProfile(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyProfile
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	w, err := postWriter(rctx, actorID, nil)
	if err != nil {
		if errors.Is(err, errNoOwner) {
			ctx.Logger().Error(err)
			return respond.ErrorInternal(ctx)
		}
		if errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("PostProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	exists, err := db.Instance().NewSelect().Model((*db.Profile)(nil)).Where("user_id = ?", actorID).Exists(rctx)
	if err != nil {
		ctx.Logger().Errorf("PostProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if exists {
		return respond.Error(ctx, http.StatusConflict, "The profile exists")
	}
	profile := db.Profile{
		UserID:      actorID,
		Preferences: json.RawMessage(defaultPreferences),
		Friends:     []uuid.UUID{},
		OwnerID:     w.OwnerID,
		CreatedBy:   w.Access.UserClaimID,
	}
	if body.Email != nil {
		profile.Email = strings.TrimSpace(strings.ToLower(*body.Email))
	}
	if body.DisplayName != nil {
		profile.DisplayName = *body.DisplayName
	}
	if body.PhotoURL != nil {
		profile.PhotoURL = *body.PhotoURL
	}
	if body.Preferences != nil {
		profile.Preferences = *body.Preferences
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(&profile).ExcludeColumn("id", "sa_created_at", "sa_updated_at", "sa_deleted_at").Returning("*").Exec(tctx); err != nil {
			return err
		}
		if err := sdb.Write(tctx, tx, "PostProfile", "create", db.OBJECT_TYPE_PROFILE, profile.ID, profile.OwnerID, w.Access.UserClaimID, profile.DisplayName); err != nil {
			return err
		}
		return postOwnerBinding(tctx, tx, w, db.OBJECT_TYPE_PROFILE, profile.ID, sdb.ACCESS_MEMBER|sdb.ACCESS_READ)
	}); err != nil {
		ctx.Logger().Errorf("PostProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.ProfileTopic(actorID), broker.KindProfile, actorID.String(), broker.OpCreate)
	return respond.JSON(ctx, http.StatusCreated, profile, 1)
}

func PutProfile(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyProfile
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	rctx := ctx.Request().Context()
	var profile db.Profile
	if err := db.Instance().NewSelect().Model(&profile).Where("user_id = ?", actorID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PutProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, profile.ID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if err == nil || errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("PutProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	columns := []string{"sa_updated_at"}
	if body.Email != nil {
		profile.Email = strings.TrimSpace(strings.ToLower(*body.Email))
		columns = append(columns, "email")
	}
	if body.DisplayName != nil {
		profile.DisplayName = *body.DisplayName
		columns = append(columns, "display_name")
	}
	if body.PhotoURL != nil {
		profile.PhotoURL = *body.PhotoURL
		columns = append(columns, "photo_url")
	}
	if body.Preferences != nil {
		profile.Preferences = *body.Preferences
		columns = append(columns, "preferences")
	}
	if body.Friends != nil {
		profile.Friends = *body.Friends
		columns = append(columns, "friends")
	}
	profile.UpdatedAt = time.Now()
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&profile).Column(columns...).WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PutProfile", "update", db.OBJECT_TYPE_PROFILE, profile.ID, profile.OwnerID, ac.UserClaimID, profile.DisplayName)
	}); err != nil {
		ctx.Logger().Errorf("PutProfile: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.ProfileTopic(actorID), broker.KindProfile, actorID.String(), broker.OpUpdate)
	return respond.JSON(ctx, http.StatusOK, profile, 1)
}

func PostProfileFriend(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodyFriend
	if err := ctx.Bind(&body); err != nil || strings.TrimSpace(body.Email) == "" {
		return respond.Error(ctx, http.StatusBadRequest, "email required")
	}
	rctx := ctx.Request().Context()
	var profile db.Profile
	if err := db.Instance().NewSelect().Model(&profile).Where("user_id = ?", actorID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PostProfileFriend: %v", err)
		return respond.ErrorInternal(ctx)
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, profile.ID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if err == nil || errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("PostProfileFriend: %v", err)
		return respond.ErrorInternal(ctx)
	}
	var found db.Profile
	q := db.Instance().NewSelect().Model(&found).Where("lower(email) = ?", strings.TrimSpace(strings.ToLower(body.Email))).Limit(1)
	q = sdb.ObjectWhere(q, actorID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Nobody signs in with that address.")
		}
		ctx.Logger().Errorf("PostProfileFriend: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if found.UserID == actorID {
		return respond.Error(ctx, http.StatusBadRequest, "That address is your own.")
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&profile).
			Set("friends = array_append(array_remove(friends, ?::uuid), ?::uuid)", found.UserID, found.UserID).
			Set("sa_updated_at = NOW()").
			WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "PostProfileFriend", "update", db.OBJECT_TYPE_PROFILE, profile.ID, profile.OwnerID, ac.UserClaimID, "Added a friend")
	}); err != nil {
		ctx.Logger().Errorf("PostProfileFriend: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.ProfileTopic(actorID), broker.KindProfile, actorID.String(), broker.OpUpdate)
	return respond.JSON(ctx, http.StatusCreated, found, 1)
}

func DeleteProfileFriend(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	friendID, err := uuid.Parse(ctx.Param("user_id"))
	if err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid user_id, expected UUID")
	}
	rctx := ctx.Request().Context()
	var profile db.Profile
	if err := db.Instance().NewSelect().Model(&profile).Where("user_id = ?", actorID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("DeleteProfileFriend: %v", err)
		return respond.ErrorInternal(ctx)
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, profile.ID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if err == nil || errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("DeleteProfileFriend: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(&profile).
			Set("friends = array_remove(friends, ?::uuid)", friendID).
			Set("sa_updated_at = NOW()").
			WherePK().Exec(tctx); err != nil {
			return err
		}
		return sdb.Write(tctx, tx, "DeleteProfileFriend", "update", db.OBJECT_TYPE_PROFILE, profile.ID, profile.OwnerID, ac.UserClaimID, "Removed a friend")
	}); err != nil {
		ctx.Logger().Errorf("DeleteProfileFriend: %v", err)
		return respond.ErrorInternal(ctx)
	}
	broker.Post(ctx.Request().Context(), broker.ProfileTopic(actorID), broker.KindProfile, actorID.String(), broker.OpDelete)
	return respond.NoContent(ctx, http.StatusOK)
}

func GetProfileDetails(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	rctx := ctx.Request().Context()
	var profile db.Profile
	if err := db.Instance().NewSelect().Model(&profile).Where("user_id = ?", actorID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("GetProfileDetails: %v", err)
		return respond.ErrorInternal(ctx)
	}
	if _, err := sdb.Instance().MutationAccess(rctx, actorID, profile.ID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_WRITE); err != nil {
		if errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("GetProfileDetails: %v", err)
		return respond.ErrorInternal(ctx)
	}
	secrets, err := sdb.Instance().GetSecrets(rctx, actorID, sdb.ACCESS_READ, nil, 0)
	if err != nil {
		ctx.Logger().Errorf("GetProfileDetails: %v", err)
		return respond.ErrorInternal(ctx)
	}
	held := map[string]bool{}
	suffix := ":" + actorID.String()
	for _, secret := range secrets {
		if field, found := strings.CutSuffix(secret.Key, suffix); found {
			held[field] = true
		}
	}
	return respond.JSON(ctx, http.StatusOK, held, len(held))
}

func PutProfileDetails(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var details map[string]string
	if err := ctx.Bind(&details); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid JSON body")
	}
	for field := range details {
		if !keyField.MatchString(field) {
			return respond.Error(ctx, http.StatusBadRequest, "A key field is lower case letters and underscores ending in _api_key")
		}
	}
	rctx := ctx.Request().Context()
	var profile db.Profile
	if err := db.Instance().NewSelect().Model(&profile).Where("user_id = ?", actorID).Scan(rctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return respond.Error(ctx, http.StatusNotFound, "Not found")
		}
		ctx.Logger().Errorf("PutProfileDetails: %v", err)
		return respond.ErrorInternal(ctx)
	}
	ac, err := sdb.Instance().MutationAccess(rctx, actorID, profile.ID, db.OBJECT_TYPE_PROFILE, sdb.ACCESS_WRITE)
	if err != nil || ac == nil {
		if err == nil || errors.Is(err, sdb.ErrNotFound) || errors.Is(err, sdb.ErrNoAccess) {
			return respond.Error(ctx, http.StatusForbidden, "Forbidden")
		}
		ctx.Logger().Errorf("PutProfileDetails: %v", err)
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
		ctx.Logger().Errorf("PutProfileDetails: %v", err)
		return respond.ErrorInternal(ctx)
	}
	secrets, err := sdb.Instance().GetSecrets(rctx, actorID, sdb.ACCESS_READ, nil, 0)
	if err != nil {
		ctx.Logger().Errorf("PutProfileDetails: %v", err)
		return respond.ErrorInternal(ctx)
	}
	stored := map[string]sdb.SamnaSecret{}
	for _, secret := range secrets {
		stored[secret.Key] = secret
	}
	held := map[string]bool{}
	if err := db.Instance().RunInTx(rctx, nil, func(tctx context.Context, tx bun.Tx) error {
		keyAccess := *w.Access
		if profile.KeyClaimID == nil {
			claimID, err := postClaim(tctx, tx, w, "Keys", "The integration keys one player holds alone", sdb.ACCESS_READ|sdb.ACCESS_WRITE)
			if err != nil {
				return err
			}
			grantID, err := postGrant(tctx, tx, w, claimID, actorID)
			if err != nil {
				return err
			}
			profile.KeyClaimID = &claimID
			keyAccess.ClaimID = &claimID
			keyAccess.UserClaimID = &grantID
			if _, err := tx.NewUpdate().Model(&profile).Column("key_claim_id").Set("sa_updated_at = NOW()").WherePK().Exec(tctx); err != nil {
				return err
			}
		} else {
			grants, err := sdb.Instance().GetGrants(tctx, sdb.GrantFilters{ClaimIDs: []uuid.UUID{*profile.KeyClaimID}, UserIDs: []uuid.UUID{actorID}, NoClients: true})
			if err != nil {
				return err
			}
			for _, grant := range grants {
				if grant.DeletedAt == nil {
					keyAccess.ClaimID = profile.KeyClaimID
					keyAccess.UserClaimID = &grant.ID
				}
			}
			if keyAccess.ClaimID == nil || *keyAccess.ClaimID != *profile.KeyClaimID {
				return sdb.ErrNoAccess
			}
		}
		for field, value := range details {
			key := field + ":" + actorID.String()
			secret, found := stored[key]
			value = strings.TrimSpace(value)
			switch {
			case value == "" && found:
				gone := sdb.SamnaSecret{ID: secret.ID}
				if err := sdb.Instance().NewDelete().Model(&gone).Access(&keyAccess).Conn(tx).Scan(tctx, &gone); err != nil {
					return err
				}
			case value == "":
			case found:
				changed := sdb.SamnaSecret{ID: secret.ID, Key: key, Value: value, OwnerID: w.OwnerID}
				if err := sdb.Instance().NewUpdate().Model(&changed).Access(&keyAccess).Conn(tx).Scan(tctx, &changed); err != nil {
					return err
				}
				held[field] = true
			default:
				created := sdb.SamnaSecret{Key: key, Value: value, OwnerID: w.OwnerID}
				if err := sdb.Instance().NewInsert().Model(&created).Access(&keyAccess).Conn(tx).Scan(tctx, &created); err != nil {
					return err
				}
				held[field] = true
			}
		}
		return sdb.Write(tctx, tx, "PutProfileDetails", "update", db.OBJECT_TYPE_PROFILE, profile.ID, profile.OwnerID, ac.UserClaimID, "Changed the integration keys")
	}); err != nil {
		ctx.Logger().Errorf("PutProfileDetails: %v", err)
		return respond.ErrorInternal(ctx)
	}
	for key := range stored {
		if field, found := strings.CutSuffix(key, ":"+actorID.String()); found {
			if _, changed := details[field]; !changed {
				held[field] = true
			}
		}
	}
	return respond.JSON(ctx, http.StatusOK, held, len(held))
}
