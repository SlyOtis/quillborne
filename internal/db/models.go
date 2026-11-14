package db

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

const (
	OBJECT_TYPE_PROFILE       = "public.profile"
	OBJECT_TYPE_CAMPAIGN      = "public.campaign"
	OBJECT_TYPE_CAMPAIGN_MAP  = "public.campaign_map"
	OBJECT_TYPE_ENCOUNTER     = "public.encounter"
	OBJECT_TYPE_CHAT_ENTRY    = "public.chat_entry"
	OBJECT_TYPE_SONG          = "public.song"
	OBJECT_TYPE_CHARACTER     = "public.character"
	OBJECT_TYPE_RESOURCE      = "public.resource"
	OBJECT_TYPE_ASSET         = "public.asset"
	OBJECT_TYPE_OBJECT_ASSET  = "public.object_asset"
	OBJECT_TYPE_TAG           = "public.tag"
	OBJECT_TYPE_TAG_OBJECT    = "public.tag_object"
	OBJECT_TYPE_CATALOG_ENTRY = "public.catalog_entry"
	OBJECT_TYPE_VEHICLE       = "public.vehicle"
	OBJECT_TYPE_MONSTER       = "public.monster"
)

const (
	MIME_TYPE_FOLDER   = "inode/directory"
	MIME_TYPE_DOCUMENT = "application/vnd.mar.document+json"
)

type Profile struct {
	bun.BaseModel `json:"-" bun:"table:profile"`

	ID          uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"-"`
	UserID      uuid.UUID       `bun:"user_id" json:"user_id"`
	Email       string          `bun:"email" json:"email"`
	DisplayName string          `bun:"display_name" json:"display_name"`
	PhotoURL    string          `bun:"photo_url" json:"photo_url"`
	Preferences json.RawMessage `bun:"preferences,type:jsonb" json:"preferences"`
	Friends     []uuid.UUID     `bun:"friends,array" json:"friends"`
	KeyClaimID  *uuid.UUID      `bun:"key_claim_id" json:"-"`
	OwnerID     uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy   *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt   time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt   time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt   bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Campaign struct {
	bun.BaseModel `json:"-" bun:"table:campaign"`

	ID            uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	UserID        uuid.UUID       `bun:"user_id" json:"dm_id"`
	Name          string          `bun:"name" json:"name"`
	Description   string          `bun:"description" json:"description"`
	IsActive      bool            `bun:"is_active" json:"is_active"`
	Settings      json.RawMessage `bun:"settings,type:jsonb" json:"settings"`
	DmClaimID     *uuid.UUID      `bun:"dm_claim_id" json:"-"`
	PlayerClaimID *uuid.UUID      `bun:"player_claim_id" json:"-"`
	PlayerIDs     []uuid.UUID     `bun:"-" json:"player_ids"`
	CharacterIDs  []uuid.UUID     `bun:"-" json:"character_ids"`
	OwnerID       uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy     *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt     time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt     time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt     bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type CampaignMap struct {
	bun.BaseModel `json:"-" bun:"table:campaign_map"`

	ID          uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	CampaignID  uuid.UUID       `bun:"campaign_id" json:"campaign_id"`
	UserID      uuid.UUID       `bun:"user_id" json:"owner_id"`
	Title       string          `bun:"title" json:"title"`
	ImageURL    string          `bun:"image_url" json:"image_url"`
	Layers      json.RawMessage `bun:"layers,type:jsonb" json:"layers"`
	Markers     json.RawMessage `bun:"markers,type:jsonb" json:"markers"`
	IsVisible   bool            `bun:"is_visible" json:"is_visible"`
	MinZoom     float64         `bun:"min_zoom" json:"min_zoom"`
	MaxZoom     float64         `bun:"max_zoom" json:"max_zoom"`
	Plan        json.RawMessage `bun:"plan,type:jsonb,nullzero" json:"plan"`
	ParentMapID *uuid.UUID      `bun:"-" json:"parent_map_id,omitempty"`
	OwnerID     uuid.UUID       `bun:"sa_owner_id" json:"-"`
	ParentID    uuid.UUID       `bun:"sa_parent_id" json:"-"`
	RootID      uuid.UUID       `bun:"sa_root_id" json:"-"`
	CreatedBy   *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt   time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt   time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt   bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Share struct {
	ShareUsers     []uuid.UUID `bun:"share_users,array" json:"share_users"`
	ShareCampaigns []uuid.UUID `bun:"share_campaigns,array" json:"share_campaigns"`
	ReaderClaimID  *uuid.UUID  `bun:"reader_claim_id" json:"-"`
}

type Encounter struct {
	bun.BaseModel `json:"-" bun:"table:encounter"`

	ID         uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	CampaignID uuid.UUID       `bun:"campaign_id" json:"campaign_id"`
	UserID     uuid.UUID       `bun:"user_id" json:"owner_id"`
	Title      string          `bun:"title" json:"title"`
	Combatants json.RawMessage `bun:"combatants,type:jsonb" json:"combatants"`
	Round      int             `bun:"round" json:"round"`
	Turn       int             `bun:"turn" json:"turn"`
	IsActive   bool            `bun:"is_active" json:"is_active"`
	Share      `tstype:",extends"`
	OwnerID    uuid.UUID    `bun:"sa_owner_id" json:"-"`
	CreatedBy  *uuid.UUID   `bun:"sa_created_by" json:"-"`
	CreatedAt  time.Time    `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt  time.Time    `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt  bun.NullTime `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Vehicle struct {
	bun.BaseModel `json:"-" bun:"table:vehicle"`

	ID              uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	UserID          uuid.UUID       `bun:"user_id" json:"owner_id"`
	CampaignID      *uuid.UUID      `bun:"campaign_id" json:"campaign_id"`
	Name            string          `bun:"name" json:"name"`
	System          string          `bun:"system" json:"system"`
	Template        string          `bun:"template" json:"template"`
	TemplateVersion int             `bun:"template_version" json:"template_version"`
	Layout          string          `bun:"layout" json:"layout"`
	Components      json.RawMessage `bun:"components,type:jsonb" json:"components"`
	States          json.RawMessage `bun:"states,type:jsonb" json:"states"`
	Stats           json.RawMessage `bun:"stats,type:jsonb" json:"stats"`
	Rulings         json.RawMessage `bun:"rulings,type:jsonb" json:"rulings"`
	Overlay         json.RawMessage `bun:"overlay,type:jsonb" json:"overlay"`
	Crew            json.RawMessage `bun:"crew,type:jsonb" json:"crew"`
	Revision        int             `bun:"revision" json:"revision"`
	History         json.RawMessage `bun:"history,type:jsonb" json:"history"`
	CrewClaimID     *uuid.UUID      `bun:"crew_claim_id" json:"-"`
	OwnerID         uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy       *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt       time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt       time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt       bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Monster struct {
	bun.BaseModel `json:"-" bun:"table:monster"`

	ID          uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID       `bun:"user_id" json:"owner_id"`
	IsPublic    bool            `bun:"is_public" json:"is_public"`
	System      string          `bun:"system" json:"system"`
	Name        string          `bun:"name" json:"name"`
	Size        string          `bun:"size" json:"size"`
	Type        string          `bun:"type" json:"type"`
	Alignment   string          `bun:"alignment" json:"alignment"`
	Challenge   float64         `bun:"challenge" json:"challenge"`
	Stats       json.RawMessage `bun:"stats,type:jsonb" json:"stats"`
	Description string          `bun:"description" json:"description"`
	Image       string          `bun:"image" json:"image"`
	OwnerID     uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy   *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt   time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt   time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt   bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type ChatEntry struct {
	bun.BaseModel `json:"-" bun:"table:chat_entry"`

	ID         uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	CampaignID uuid.UUID       `bun:"campaign_id" json:"campaign_id"`
	AuthorID   uuid.UUID       `bun:"author_id" json:"author_id"`
	AuthorName string          `bun:"author_name" json:"author_name"`
	Kind       string          `bun:"kind" json:"kind"`
	Body       string          `bun:"body" json:"body"`
	Query      string          `bun:"query" json:"query"`
	IsHidden   bool            `bun:"is_hidden" json:"is_hidden"`
	CardKind   string          `bun:"card_kind" json:"card_kind"`
	RollKind   string          `bun:"roll_kind" json:"roll_kind"`
	Formula    string          `bun:"formula" json:"formula"`
	Dice       json.RawMessage `bun:"dice,type:jsonb" json:"dice"`
	Roll       float64         `bun:"roll" json:"roll"`
	Total      float64         `bun:"total" json:"total"`
	OwnerID    uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy  *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt  time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt  time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt  bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Song struct {
	bun.BaseModel `json:"-" bun:"table:song"`

	ID         uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	CampaignID uuid.UUID `bun:"campaign_id" json:"campaign_id"`
	UserID     uuid.UUID `bun:"user_id" json:"owner_id"`
	Title      string    `bun:"title" json:"title"`
	Address    string    `bun:"address" json:"address"`
	Duration   float64   `bun:"duration" json:"duration"`
	Share      `tstype:",extends"`
	OwnerID    uuid.UUID    `bun:"sa_owner_id" json:"-"`
	CreatedBy  *uuid.UUID   `bun:"sa_created_by" json:"-"`
	CreatedAt  time.Time    `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt  time.Time    `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt  bun.NullTime `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Character struct {
	bun.BaseModel `json:"-" bun:"table:character"`

	ID           uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID       `bun:"user_id" json:"owner_id"`
	CampaignID   *uuid.UUID      `bun:"campaign_id" json:"campaign_id,omitempty"`
	Name         string          `bun:"name" json:"name"`
	Description  string          `bun:"description" json:"description"`
	Sheet        json.RawMessage `bun:"sheet,type:jsonb" json:"character"`
	Metadata     json.RawMessage `bun:"metadata,type:jsonb" json:"metadata"`
	Sources      json.RawMessage `bun:"sources,type:jsonb" json:"-"`
	IsPublic     bool            `bun:"is_public" json:"-"`
	LastPlayedAt *time.Time      `bun:"last_played_at" json:"-"`
	OwnerID      uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy    *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt    time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"-"`
	UpdatedAt    time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"-"`
	DeletedAt    bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Resource struct {
	bun.BaseModel `json:"-" bun:"table:resource"`

	ID          uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	Kind        string          `bun:"kind" json:"kind"`
	UserID      uuid.UUID       `bun:"user_id" json:"owner_id"`
	CampaignID  *uuid.UUID      `bun:"campaign_id" json:"campaign_id,omitempty"`
	Name        string          `bun:"name" json:"name"`
	Description string          `bun:"description" json:"description"`
	Fields      json.RawMessage `bun:"fields,type:jsonb" json:"-"`
	Share       `tstype:",extends"`
	OwnerID     uuid.UUID    `bun:"sa_owner_id" json:"-"`
	ParentID    uuid.UUID    `bun:"sa_parent_id" json:"-"`
	RootID      uuid.UUID    `bun:"sa_root_id" json:"-"`
	CreatedBy   *uuid.UUID   `bun:"sa_created_by" json:"-"`
	CreatedAt   time.Time    `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt   time.Time    `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt   bun.NullTime `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type ResourceUpdate struct {
	bun.BaseModel `json:"-" bun:"table:resource_update"`

	ID         uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	ResourceID uuid.UUID `bun:"resource_id" json:"resource_id"`
	AuthorID   uuid.UUID `bun:"author_id" json:"by"`
	Body       string    `bun:"body" json:"body"`
	CreatedAt  time.Time `bun:"created_at,nullzero,default:now()" json:"at"`
}

type Asset struct {
	bun.BaseModel `json:"-" bun:"table:asset"`

	ID               uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	ObjectID         *uuid.UUID      `bun:"object_id,nullzero" json:"object_id"`
	ObjectType       *string         `bun:"object_type,nullzero" json:"object_type"`
	Document         json.RawMessage `bun:"document,type:jsonb,nullzero" json:"document"`
	YjsState         []byte          `bun:"yjs_state,type:bytea,nullzero" json:"-"`
	Name             string          `bun:"name" json:"name"`
	Description      *string         `bun:"description,nullzero" json:"description"`
	MimeType         string          `bun:"mime_type,nullzero" json:"mime_type"`
	BlobURL          *string         `bun:"blob_url,nullzero" json:"blob_url"`
	Path             string          `bun:"path,nullzero" json:"path"`
	ParentID         uuid.UUID       `bun:"sa_parent_id,nullzero" json:"parent_id"`
	RootID           uuid.UUID       `bun:"sa_root_id,nullzero" json:"root_id"`
	Index            int             `bun:"index" json:"index"`
	SizeBytes        *int64          `bun:"size_bytes,nullzero" json:"size_bytes"`
	Etag             *string         `bun:"etag,nullzero" json:"etag"`
	Type             *string         `bun:"type,nullzero" json:"type"`
	UploadedBy       uuid.UUID       `bun:"uploaded_by" json:"uploaded_by"`
	Reserved         bool            `bun:"reserved" json:"reserved"`
	Slug             *string         `bun:"slug,nullzero" json:"slug"`
	BannerID         *uuid.UUID      `bun:"banner_id,nullzero" json:"banner_id"`
	Icon             *string         `bun:"icon,nullzero" json:"icon"`
	Properties       json.RawMessage `bun:"properties,type:jsonb,nullzero" json:"properties"`
	BannerProperties json.RawMessage `bun:"banner_properties,scanonly,nullzero" json:"banner_properties,omitempty"`
	Tags             []Tag           `bun:"m2m:tag_object,join:Asset=Tag" json:"tags,omitempty"`
	OwnerID          uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy        *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt        time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt        time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt        bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type ObjectAsset struct {
	bun.BaseModel `json:"-" bun:"table:object_asset"`

	ID         uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	ObjectType string          `bun:"object_type" json:"object_type"`
	ObjectID   uuid.UUID       `bun:"object_id" json:"object_id"`
	AssetID    uuid.UUID       `bun:"asset_id" json:"asset_id"`
	Asset      *Asset          `bun:"rel:belongs-to,join:asset_id=id" json:"asset,omitempty"`
	Properties json.RawMessage `bun:"properties,type:jsonb,nullzero" json:"properties"`
	OwnerID    uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy  *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt  time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt  time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt  bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type Tag struct {
	bun.BaseModel `json:"-" bun:"table:tag"`

	ID        uuid.UUID    `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	Name      string       `bun:"name" json:"name"`
	ObjectIDs []uuid.UUID  `bun:"object_ids,array,scanonly" json:"object_ids,omitempty"`
	OwnerID   uuid.UUID    `bun:"sa_owner_id" json:"-"`
	CreatedBy *uuid.UUID   `bun:"sa_created_by" json:"-"`
	CreatedAt time.Time    `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt time.Time    `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt bun.NullTime `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type TagObject struct {
	bun.BaseModel `json:"-" bun:"table:tag_object"`

	ID         uuid.UUID    `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	TagID      uuid.UUID    `bun:"tag_id" json:"tag_id"`
	Tag        *Tag         `bun:"rel:belongs-to,join:tag_id=id" json:"tag,omitempty"`
	ObjectType string       `bun:"object_type" json:"object_type"`
	ObjectID   uuid.UUID    `bun:"object_id" json:"object_id"`
	Asset      *Asset       `bun:"rel:belongs-to,join:object_id=id" json:"asset,omitempty"`
	OwnerID    uuid.UUID    `bun:"sa_owner_id" json:"-"`
	CreatedBy  *uuid.UUID   `bun:"sa_created_by" json:"-"`
	CreatedAt  time.Time    `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt  time.Time    `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt  bun.NullTime `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}

type CatalogEntry struct {
	bun.BaseModel `json:"-" bun:"table:catalog_entry"`

	ID          uuid.UUID       `bun:"id,pk,default:gen_random_uuid()" json:"-"`
	Kind        string          `bun:"kind" json:"kind"`
	UserID      uuid.UUID       `bun:"user_id" json:"owner_id"`
	Slug        string          `bun:"slug" json:"id"`
	Name        string          `bun:"name" json:"name"`
	Description string          `bun:"description" json:"description"`
	Entry       json.RawMessage `bun:"entry,type:jsonb" json:"-"`
	Digest      string          `bun:"digest" json:"digest"`
	OwnerID     uuid.UUID       `bun:"sa_owner_id" json:"-"`
	CreatedBy   *uuid.UUID      `bun:"sa_created_by" json:"-"`
	CreatedAt   time.Time       `bun:"sa_created_at,nullzero,default:now()" json:"created_at"`
	UpdatedAt   time.Time       `bun:"sa_updated_at,nullzero,default:now()" json:"updated_at"`
	DeletedAt   bun.NullTime    `bun:"sa_deleted_at,soft_delete,nullzero" json:"-"`
}
