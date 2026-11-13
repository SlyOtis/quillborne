package state

import (
	"encoding/json"
	"net/http"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	nstate "github.com/nimling/nimbody/state"
)

const GroupCatalogEntry = "catalog_entry"

type CatalogEntryData struct {
	Kind        string          `json:"kind"`
	Slug        string          `json:"slug"`
	OwnerID     string          `json:"owner_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Digest      string          `json:"digest"`
	Entry       json.RawMessage `json:"entry"`
}

func getCatalogEntryGroup() nstate.Group[CatalogEntryData] {
	return nstate.Group[CatalogEntryData]{
		Name: GroupCatalogEntry,
		Schema: getSchema(map[string]any{
			"kind":        getProperty("string", "classes or races."),
			"slug":        getProperty("string", "The address name of the entry."),
			"owner_id":    getOwner("The player whose upload the entry was read from."),
			"name":        getProperty("string", "The display name."),
			"description": getProperty("string", "What the entry is."),
			"digest":      getProperty("string", "The digest of the source the entry was read from."),
			"entry":       getJSON("The entry as the rules engine reads it."),
		}, "kind", "slug", "name"),
		Export: exportCatalogEntries,
		Import: importCatalogEntry,
		Delete: deleteCatalogEntry,
	}
}

func exportCatalogEntries(ctx *nstate.Context, query nstate.Query) ([]nstate.Record[CatalogEntryData], error) {
	rows := make([]db.CatalogEntry, 0)
	if err := getRows(ctx, query, db.OBJECT_TYPE_CATALOG_ENTRY, "catalog_entry", &rows, "catalog_entry.kind ASC, catalog_entry.slug ASC"); err != nil {
		return nil, err
	}
	return getRecords(ctx, GroupCatalogEntry, query, rows, func(row db.CatalogEntry) uuid.UUID { return row.ID }, func(row db.CatalogEntry) CatalogEntryData {
		return CatalogEntryData{
			Kind:        row.Kind,
			Slug:        row.Slug,
			OwnerID:     row.UserID.String(),
			Name:        row.Name,
			Description: row.Description,
			Digest:      row.Digest,
			Entry:       getRaw(row.Entry),
		}
	})
}

func importCatalogEntry(ctx *nstate.Context, record nstate.Record[CatalogEntryData]) (string, error) {
	owner, err := getOptionalID(&record.Data.OwnerID, "owner_id")
	if err != nil {
		return "", err
	}
	actor, err := getActor(ctx, owner)
	if err != nil {
		return "", err
	}
	if record.Data.Kind == "" || record.Data.Slug == "" {
		return "", echo.NewHTTPError(http.StatusBadRequest, "kind and slug required")
	}
	body := map[string]any{}
	if record.Data.Entry != nil {
		if err := json.Unmarshal(record.Data.Entry, &body); err != nil {
			return "", echo.NewHTTPError(http.StatusBadRequest, "entry must be an object")
		}
	}
	body["name"] = record.Data.Name
	body["description"] = record.Data.Description
	body["digest"] = record.Data.Digest
	if _, err := call(ctx, actor, http.MethodPut, "/api/catalog/"+record.Data.Kind+"/"+record.Data.Slug, body); err != nil {
		return "", err
	}
	rctx := ctx.Request().Context()
	var id uuid.UUID
	if err := db.Instance().NewSelect().Model((*db.CatalogEntry)(nil)).Column("id").Where("kind::text = ?", record.Data.Kind).Where("slug = ?", record.Data.Slug).Where("sa_deleted_at IS NULL").Scan(rctx, &id); err != nil {
		return "", err
	}
	return id.String(), putKey(rctx, GroupCatalogEntry, record.Key, id)
}

func deleteCatalogEntry(ctx *nstate.Context, id string) error {
	return echo.NewHTTPError(http.StatusMethodNotAllowed, "the catalog has no delete; an entry is replaced by its next reading")
}
