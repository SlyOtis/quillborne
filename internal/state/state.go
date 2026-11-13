package state

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nimling/nimbody/endpoint"
	"github.com/nimling/nimbody/mcp"
	nstate "github.com/nimling/nimbody/state"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

const (
	Service      = "quillborne"
	ProviderType = "qubo"

	envAuthorizationServer = "SAUTH_ENDPOINT"
	envDebugUser           = "SAUTH_DEBUG_USER_ID"
	actorHeader            = "State-Actor-ID"
	instructions           = "The qubo tools operate Quillborne: the table's profiles, campaigns with their maps, encounters, songs and chat, characters, vehicles, monsters, lore pages, files, tags and the catalog. Reach for them to read or change what Quillborne manages. Every tool runs as the signed in player and reaches only what their claims bind; a tool that changes data needs the user's confirmation first."
)

type StateKey struct {
	Group         string    `bun:"group,pk" json:"group"`
	Key           string    `bun:"key,pk" json:"key"`
	ObjectID      uuid.UUID `bun:"object_id,notnull,type:uuid" json:"object_id"`
	bun.BaseModel `bun:"table:state_key" json:"-"`
}

var keyTables = map[string]string{
	GroupProfile:      "profile",
	GroupTag:          "tag",
	GroupCatalogEntry: "catalog_entry",
	GroupCampaign:     "campaign",
	GroupCharacter:    "character",
	GroupVehicle:      "vehicle",
	GroupMonster:      "monster",
	GroupCampaignMap:  "campaign_map",
	GroupEncounter:    "encounter",
	GroupSong:         "song",
	GroupChatEntry:    "chat_entry",
	GroupResource:     "resource",
	GroupAsset:        "asset",
	GroupObjectAsset:  "object_asset",
	GroupTagObject:    "tag_object",
}

var objectGroups = map[string]string{
	db.OBJECT_TYPE_PROFILE:       GroupProfile,
	db.OBJECT_TYPE_CAMPAIGN:      GroupCampaign,
	db.OBJECT_TYPE_CAMPAIGN_MAP:  GroupCampaignMap,
	db.OBJECT_TYPE_ENCOUNTER:     GroupEncounter,
	db.OBJECT_TYPE_CHAT_ENTRY:    GroupChatEntry,
	db.OBJECT_TYPE_SONG:          GroupSong,
	db.OBJECT_TYPE_CHARACTER:     GroupCharacter,
	db.OBJECT_TYPE_RESOURCE:      GroupResource,
	db.OBJECT_TYPE_ASSET:         GroupAsset,
	db.OBJECT_TYPE_OBJECT_ASSET:  GroupObjectAsset,
	db.OBJECT_TYPE_TAG:           GroupTag,
	db.OBJECT_TYPE_TAG_OBJECT:    GroupTagObject,
	db.OBJECT_TYPE_CATALOG_ENTRY: GroupCatalogEntry,
	db.OBJECT_TYPE_VEHICLE:       GroupVehicle,
	db.OBJECT_TYPE_MONSTER:       GroupMonster,
}

type resolver struct{}

func getLiveID(ctx context.Context, query string, args ...any) (string, error) {
	var id uuid.UUID
	err := db.Instance().NewRaw(query, args...).Scan(ctx, &id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

func (r resolver) GetID(ctx context.Context, group, key string) (string, error) {
	table, ok := keyTables[group]
	if !ok {
		return "", fmt.Errorf("state: unknown group %s", group)
	}
	id, err := getLiveID(ctx, `SELECT sk.object_id FROM state_key AS sk JOIN ? AS o ON o.id = sk.object_id AND o.sa_deleted_at IS NULL WHERE sk."group" = ? AND sk.key = ?`, bun.Ident(table), group, key)
	if err != nil || id != "" {
		return id, err
	}
	if group == GroupCatalogEntry {
		kind, slug, found := strings.Cut(key, "/")
		if found {
			return getLiveID(ctx, `SELECT id FROM catalog_entry WHERE kind::text = ? AND slug = ? AND sa_deleted_at IS NULL`, kind, slug)
		}
	}
	parsed, err := uuid.Parse(key)
	if err != nil {
		return "", nil
	}
	return getLiveID(ctx, `SELECT id FROM ? WHERE id = ? AND sa_deleted_at IS NULL`, bun.Ident(table), parsed)
}

func (r resolver) GetKey(ctx context.Context, group, id string) (string, error) {
	var key string
	err := db.Instance().NewSelect().
		Model((*StateKey)(nil)).
		Column("key").
		Where("\"group\" = ?", group).
		Where("object_id = ?", id).
		OrderExpr("sa_created_at ASC").
		Limit(1).
		Scan(ctx, &key)
	if err == nil {
		return key, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	if group == GroupCatalogEntry {
		var row struct {
			Kind string `bun:"kind"`
			Slug string `bun:"slug"`
		}
		if err := db.Instance().NewRaw(`SELECT kind::text AS kind, slug FROM catalog_entry WHERE id = ?`, id).Scan(ctx, &row); err == nil {
			return row.Kind + "/" + row.Slug, nil
		}
	}
	return id, nil
}

func putKey(ctx context.Context, group, key string, id uuid.UUID) error {
	if key == "" || key == id.String() {
		return nil
	}
	_, err := db.Instance().NewInsert().
		Model(&StateKey{Group: group, Key: key, ObjectID: id}).
		On("CONFLICT (\"group\", key) DO UPDATE").
		Set("object_id = EXCLUDED.object_id").
		Exec(ctx)
	return err
}

func getObjectID(ctx context.Context, objectType, exported string) (uuid.UUID, error) {
	group, ok := objectGroups[objectType]
	if !ok {
		return uuid.Nil, echo.NewHTTPError(http.StatusBadRequest, "object_type "+objectType+" is not a state group")
	}
	id, err := resolver{}.GetID(ctx, group, exported)
	if err != nil {
		return uuid.Nil, err
	}
	if id == "" {
		return uuid.Nil, echo.NewHTTPError(http.StatusUnprocessableEntity, objectType+" "+exported+" is not in this table")
	}
	return uuid.MustParse(id), nil
}

func getCaller(ctx *nstate.Context) (uuid.UUID, error) {
	userID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return uuid.Nil, echo.NewHTTPError(http.StatusUnauthorized, "missing user_id")
	}
	return userID, nil
}

func getActor(ctx *nstate.Context, owner *uuid.UUID) (uuid.UUID, error) {
	caller, err := getCaller(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	if owner == nil || *owner == uuid.Nil || *owner == caller {
		return caller, nil
	}
	debug, err := uuid.Parse(os.Getenv(envDebugUser))
	if err == nil && debug == caller {
		return *owner, nil
	}
	return caller, nil
}

var router *echo.Echo

func getRouter() *echo.Echo {
	if router != nil {
		return router
	}
	e := echo.New()
	e.Logger.SetOutput(io.Discard)
	handler.PutRoutes(e.Group("/api"), func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(ctx echo.Context) error {
			actorID, err := uuid.Parse(ctx.Request().Header.Get(actorHeader))
			if err != nil {
				return ctx.JSON(http.StatusUnauthorized, map[string]string{"error": "no actor"})
			}
			ctx.Set("user_id", actorID)
			return next(ctx)
		}
	})
	router = e
	return e
}

type envelope struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func call(ctx *nstate.Context, actor uuid.UUID, method, target string, body any) (json.RawMessage, error) {
	var reader io.Reader
	contentType := echo.MIMEApplicationJSON
	switch value := body.(type) {
	case nil:
	case *bytes.Buffer:
		reader = value
	case multipartBody:
		reader = value.body
		contentType = value.contentType
	default:
		raw, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequestWithContext(ctx.Request().Context(), method, target, reader)
	req.Header.Set(echo.HeaderContentType, contentType)
	req.Header.Set(actorHeader, actor.String())
	rec := httptest.NewRecorder()
	getRouter().ServeHTTP(rec, req)
	if rec.Code >= http.StatusMultipleChoices {
		var answer envelope
		message := strings.TrimSpace(rec.Body.String())
		if json.Unmarshal(rec.Body.Bytes(), &answer) == nil && answer.Error != nil && answer.Error.Message != "" {
			message = answer.Error.Message
		}
		return nil, echo.NewHTTPError(rec.Code, method+" "+target+": "+message)
	}
	if rec.Body.Len() == 0 {
		return nil, nil
	}
	var answer envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &answer); err != nil {
		return nil, err
	}
	return answer.Data, nil
}

type multipartBody struct {
	body        *bytes.Buffer
	contentType string
}

func getMultipart(fields map[string]string, name string, file []byte) (multipartBody, error) {
	buffer := &bytes.Buffer{}
	writer := multipart.NewWriter(buffer)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return multipartBody{}, err
		}
	}
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		return multipartBody{}, err
	}
	if _, err := part.Write(file); err != nil {
		return multipartBody{}, err
	}
	if err := writer.Close(); err != nil {
		return multipartBody{}, err
	}
	return multipartBody{body: buffer, contentType: writer.FormDataContentType()}, nil
}

func getID(data json.RawMessage) (uuid.UUID, error) {
	var answer struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(data, &answer); err != nil || answer.ID == uuid.Nil {
		return uuid.Nil, errors.New("state: the handler answered without an id")
	}
	return answer.ID, nil
}

func getRecordID(record string) (uuid.UUID, error) {
	id, err := uuid.Parse(record)
	if err != nil {
		return uuid.Nil, echo.NewHTTPError(http.StatusBadRequest, "id invalid")
	}
	return id, nil
}

func getOptionalID(value *string, field string) (*uuid.UUID, error) {
	if value == nil || *value == "" {
		return nil, nil
	}
	parsed, err := uuid.Parse(*value)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusBadRequest, field+" invalid")
	}
	return &parsed, nil
}

func getText(id *uuid.UUID) *string {
	if id == nil || *id == uuid.Nil {
		return nil
	}
	text := id.String()
	return &text
}

func getRaw(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

func getRecords[R any, T any](ctx *nstate.Context, group string, query nstate.Query, rows []R, id func(R) uuid.UUID, data func(R) T) ([]nstate.Record[T], error) {
	rctx := ctx.Request().Context()
	var wanted map[string]bool
	if len(query.Keys) > 0 {
		wanted = map[string]bool{}
		for _, key := range query.Keys {
			found, err := resolver{}.GetID(rctx, group, key)
			if err != nil {
				return nil, err
			}
			if found != "" {
				wanted[found] = true
			}
		}
	}
	out := make([]nstate.Record[T], 0, len(rows))
	for _, row := range rows {
		rowID := id(row).String()
		if wanted != nil && !wanted[rowID] {
			continue
		}
		key, err := resolver{}.GetKey(rctx, group, rowID)
		if err != nil {
			return nil, err
		}
		out = append(out, nstate.Record[T]{ID: rowID, Key: key, Data: data(row)})
	}
	return out, nil
}

func getRows[R any](ctx *nstate.Context, query nstate.Query, objectType, table string, rows *[]R, order string) error {
	caller, err := getCaller(ctx)
	if err != nil {
		return err
	}
	q := db.Instance().NewSelect().Model(rows).Where("?.sa_deleted_at IS NULL", bun.Ident(table))
	if campaignID, ok := query.Filter["campaign_id"]; ok {
		parsed, err := uuid.Parse(campaignID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "campaign_id invalid")
		}
		q = q.Where("?.campaign_id = ?", bun.Ident(table), parsed)
	}
	if userID, ok := query.Filter["user_id"]; ok {
		parsed, err := uuid.Parse(userID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "user_id invalid")
		}
		q = q.Where("?.user_id = ?", bun.Ident(table), parsed)
	}
	q = sdb.ObjectWhere(q, caller, objectType, sdb.ACCESS_READ, nil, nil, 0)
	if err := q.OrderExpr(order).Scan(ctx.Request().Context()); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	return nil
}

func getSchema(properties map[string]any, required ...string) map[string]any {
	schema := map[string]any{"type": "object", "properties": properties}
	if len(required) > 0 {
		list := make([]any, 0, len(required))
		for _, name := range required {
			list = append(list, name)
		}
		schema["required"] = list
	}
	return schema
}

func getProperty(kind, description string) map[string]any {
	return map[string]any{"type": kind, "description": description}
}

func getRef(group string) map[string]any {
	return map[string]any{"type": "string", "description": "The key of the " + group + " record."}
}

func getOwner(description string) map[string]any {
	return map[string]any{"type": "string", "format": "uuid", "description": description, nstate.FlagImmutable: true}
}

func getJSON(description string) map[string]any {
	return map[string]any{"description": description}
}

func getList(description string) map[string]any {
	return map[string]any{"type": "array", "items": map[string]any{"type": "string", "format": "uuid"}, "description": description}
}

func GetGroups() []nstate.Definition {
	return []nstate.Definition{
		getProfileGroup(),
		getTagGroup(),
		getCatalogEntryGroup(),
		getCampaignGroup(),
		getCharacterGroup(),
		getVehicleGroup(),
		getMonsterGroup(),
		getCampaignMapGroup(),
		getEncounterGroup(),
		getSongGroup(),
		getChatEntryGroup(),
		getResourceGroup(),
		getAssetGroup(),
		getObjectAssetGroup(),
		getTagObjectGroup(),
	}
}

func GetDocument(version string) nstate.Document {
	return nstate.GetDocument(Service, version, GetGroups()...)
}

func Register(e *echo.Echo, access echo.MiddlewareFunc, version string, operations []mcp.Operation) error {
	return endpoint.Mount(e, endpoint.Set{
		Service: Service,
		Version: version,
		Health: func(ctx context.Context) error {
			return db.Instance().PingContext(ctx)
		},
		APIMiddleware: []echo.MiddlewareFunc{access},
		MCPAccess:     []echo.MiddlewareFunc{access},
		State: &nstate.Context{
			Keys:      resolver{},
			PostAsset: postStateAsset,
			GetAsset:  getStateAsset,
		},
		Groups: GetGroups(),
		MCP: &mcp.Server{
			Name:                ProviderType,
			Version:             version,
			Instructions:        instructions,
			Operations:          operations,
			AuthorizationServer: os.Getenv(envAuthorizationServer),
		},
	})
}

func postStateAsset(ctx echo.Context, name string, body []byte) (string, error) {
	caller, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "missing user_id")
	}
	form, err := getMultipart(map[string]string{"name": name, "mime_type": nstate.MIMENDJSON, "type": "export"}, name, body)
	if err != nil {
		return "", err
	}
	data, err := call(&nstate.Context{Context: ctx}, caller, http.MethodPost, "/api/asset", form)
	if err != nil {
		return "", err
	}
	id, err := getID(data)
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

func getStateAsset(ctx echo.Context, assetID string) ([]byte, error) {
	caller, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "missing user_id")
	}
	return getBytes(ctx, caller, assetID)
}

func getBytes(ctx echo.Context, actor uuid.UUID, assetID string) ([]byte, error) {
	req := httptest.NewRequestWithContext(ctx.Request().Context(), http.MethodGet, "/api/asset/"+assetID+"/data", nil)
	req.Header.Set(actorHeader, actor.String())
	rec := httptest.NewRecorder()
	getRouter().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		return nil, echo.NewHTTPError(rec.Code, "GET /api/asset/"+assetID+"/data answered "+http.StatusText(rec.Code))
	}
	return rec.Body.Bytes(), nil
}
