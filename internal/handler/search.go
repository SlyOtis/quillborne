package handler

import (
	"database/sql"
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

var searchObjectTypes = map[string]string{
	"campaign":  db.OBJECT_TYPE_CAMPAIGN,
	"character": db.OBJECT_TYPE_CHARACTER,
	"resource":  db.OBJECT_TYPE_RESOURCE,
	"vehicle":   db.OBJECT_TYPE_VEHICLE,
	"asset":     db.OBJECT_TYPE_ASSET,
}

type BodySearch struct {
	Query       *string     `json:"q" query:"q"`
	ObjectTypes []string    `json:"object_types" query:"object_types"`
	IDs         []uuid.UUID `json:"ids" query:"ids"`
	ExcludeIDs  []uuid.UUID `json:"exclude_ids" query:"exclude_ids"`
	TagIDs      []uuid.UUID `json:"tag_ids" query:"tag_ids"`
	ParentID    *uuid.UUID  `json:"parent_id" query:"parent_id"`
	ParentType  *string     `json:"parent_type" query:"parent_type"`
	Limit       *int        `json:"limit" query:"limit"`
}

type ResponseSearch struct {
	ID          uuid.UUID  `json:"id" bun:"id"`
	ObjectType  string     `json:"object_type" bun:"object_type"`
	Name        *string    `json:"name" bun:"name"`
	Description *string    `json:"description" bun:"description"`
	Rank        float32    `json:"rank" bun:"rank"`
	TotalCount  int        `json:"-" bun:"total_count"`
	Kind        *string    `json:"kind,omitempty" bun:"-"`
	CampaignID  *uuid.UUID `json:"campaign_id,omitempty" bun:"-"`
}

func GetSearch(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return respond.Error(ctx, http.StatusUnauthorized, "Unauthorized")
	}
	var body BodySearch
	if err := ctx.Bind(&body); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, "Invalid search body")
	}
	types := make([]string, 0, len(body.ObjectTypes))
	for _, raw := range body.ObjectTypes {
		for _, one := range strings.Split(raw, ",") {
			objectType, known := searchObjectTypes[strings.TrimSpace(one)]
			if !known {
				return respond.Error(ctx, http.StatusBadRequest, "Unknown object type")
			}
			types = append(types, objectType)
		}
	}
	if body.ParentType != nil {
		objectType, known := searchObjectTypes[*body.ParentType]
		if !known {
			return respond.Error(ctx, http.StatusBadRequest, "Unknown parent_type")
		}
		body.ParentType = &objectType
	}
	if err := respond.InitPagination(ctx, body.Limit, nil); err != nil {
		return respond.Error(ctx, http.StatusBadRequest, err.Error())
	}
	pagination := respond.GetPagination(ctx)
	offset := (pagination.Page - 1) * pagination.Limit
	rctx := ctx.Request().Context()
	ids := body.IDs
	if len(body.TagIDs) > 0 {
		tagged := make([]uuid.UUID, 0)
		if err := db.Instance().NewSelect().Model((*db.TagObject)(nil)).Column("object_id").Where("tag_id IN (?)", bun.In(body.TagIDs)).Where("sa_deleted_at IS NULL").Scan(rctx, &tagged); err != nil {
			ctx.Logger().Errorf("GetSearch: %v", err)
			return respond.ErrorInternal(ctx)
		}
		if len(tagged) == 0 {
			return respond.JSON(ctx, http.StatusOK, []ResponseSearch{}, 0)
		}
		ids = tagged
	}
	query := ""
	if body.Query != nil {
		query = *body.Query
	}
	var typeList, idList, excludeList any
	if len(types) > 0 {
		typeList = pgArray(types)
	}
	if len(ids) > 0 {
		idList = uuidArray(ids)
	}
	if len(body.ExcludeIDs) > 0 {
		excludeList = uuidArray(body.ExcludeIDs)
	}
	rows := make([]ResponseSearch, 0)
	if err := db.Instance().NewRaw(
		`SELECT object_id AS id, object_type, name, description, rank, total_count
		   FROM claimius.search(?, ?, ?::text[], ?, ?::uuid[], ?::uuid[], NULL, ?, ?, ?, ?)`,
		actorID, query, typeList, sdb.ACCESS_READ, idList, excludeList, body.ParentID, body.ParentType, pagination.Limit, offset,
	).Scan(rctx, &rows); err != nil && !errors.Is(err, sql.ErrNoRows) {
		ctx.Logger().Errorf("GetSearch: %v", err)
		return respond.ErrorInternal(ctx)
	}
	total := 0
	if len(rows) > 0 {
		total = rows[0].TotalCount
	}
	resourceIDs := make([]uuid.UUID, 0)
	for _, row := range rows {
		if row.ObjectType == db.OBJECT_TYPE_RESOURCE {
			resourceIDs = append(resourceIDs, row.ID)
		}
	}
	if len(resourceIDs) > 0 {
		resources := make([]db.Resource, 0)
		if err := db.Instance().NewSelect().Model(&resources).Column("id", "kind", "campaign_id").Where("id IN (?)", bun.In(resourceIDs)).Scan(rctx); err != nil {
			ctx.Logger().Errorf("GetSearch: %v", err)
			return respond.ErrorInternal(ctx)
		}
		for i := range rows {
			for _, resource := range resources {
				if resource.ID == rows[i].ID {
					kind := resource.Kind
					rows[i].Kind = &kind
					rows[i].CampaignID = resource.CampaignID
				}
			}
		}
	}
	return respond.JSON(ctx, http.StatusOK, rows, total)
}

func pgArray(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, `"`+strings.ReplaceAll(value, `"`, `\"`)+`"`)
	}
	return "{" + strings.Join(quoted, ",") + "}"
}

func uuidArray(values []uuid.UUID) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, value.String())
	}
	return "{" + strings.Join(parts, ",") + "}"
}
