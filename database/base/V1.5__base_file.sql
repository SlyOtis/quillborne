CREATE TABLE IF NOT EXISTS asset (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    description    TEXT,
    mime_type      TEXT,
    blob_url       TEXT,
    path           TEXT,
    object_id      UUID,
    object_type    TEXT,
    document       JSONB,
    sa_parent_id   UUID NOT NULL,
    sa_root_id     UUID NOT NULL,
    "index"        INT DEFAULT 0,
    size_bytes     BIGINT,
    etag           TEXT,
    type           TEXT,
    uploaded_by    UUID NOT NULL,
    sa_owner_id    UUID NOT NULL,
    reserved       BOOLEAN NOT NULL DEFAULT FALSE,
    slug           TEXT,
    yjs_state      BYTEA,
    banner_id      UUID,
    icon           TEXT,
    properties     JSONB,
    sa_created_by  UUID NOT NULL,
    sa_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_slug ON asset (slug) WHERE slug IS NOT NULL AND sa_deleted_at IS NULL;

COMMENT ON TABLE asset IS 'A file, a block document or a folder, the bytes of a file kept in blob storage, folders and version chains through sa_parent_id and sa_root_id; who reaches an asset is decided by the claims bound to it';
COMMENT ON COLUMN asset.id IS 'The asset id';
COMMENT ON COLUMN asset.name IS 'The display name';
COMMENT ON COLUMN asset.description IS 'What the asset holds';
COMMENT ON COLUMN asset.mime_type IS 'The media type: image/png, audio/ogg, inode/directory for a folder, application/vnd.mar.document+json for a block document held in document';
COMMENT ON COLUMN asset.blob_url IS 'Where the original sits in blob storage, the folder chain and the asset id, empty for a folder or a document';
COMMENT ON COLUMN asset.path IS 'The folder chain and the file name, derived on create, rename and move';
COMMENT ON COLUMN asset.object_id IS 'The row the asset points at when it shows a database row in the file tree';
COMMENT ON COLUMN asset.object_type IS 'The table of the pointed row';
COMMENT ON COLUMN asset.document IS 'The block document, served by GET /api/asset/:id/data';
COMMENT ON COLUMN asset.sa_parent_id IS 'The folder or the earlier version the asset sits under, itself on a root';
COMMENT ON COLUMN asset.sa_root_id IS 'The root folder of the tree';
COMMENT ON COLUMN asset.index IS 'The display order among siblings';
COMMENT ON COLUMN asset.size_bytes IS 'The byte length of the original or the document, set whenever its bytes are stored';
COMMENT ON COLUMN asset.etag IS 'The SHA-256 of the original or the document, base64url, set whenever its bytes are stored, so it changes when the bytes change';
COMMENT ON COLUMN asset.type IS 'The classification: folder, document, image, audio';
COMMENT ON COLUMN asset.uploaded_by IS 'The player who stored it, samna_user.user_id';
COMMENT ON COLUMN asset.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN asset.reserved IS 'Locked for editing';
COMMENT ON COLUMN asset.slug IS 'The handle of a root folder: campaign-<campaign id> for a campaign, user-<user id> for a player';
COMMENT ON COLUMN asset.yjs_state IS 'The Yjs state of collaborative editing';
COMMENT ON COLUMN asset.banner_id IS 'The image asset shown as the banner of a document';
COMMENT ON COLUMN asset.icon IS 'An emoji or an icon name';
COMMENT ON COLUMN asset.properties IS 'Free form customization owned by the reader';
COMMENT ON COLUMN asset.sa_created_by IS 'The user_claim of the player who stored it';
COMMENT ON COLUMN asset.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN asset.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN asset.sa_deleted_at IS 'When the row was soft deleted';

CREATE TABLE IF NOT EXISTS object_asset (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type    TEXT NOT NULL,
    object_id      UUID NOT NULL,
    asset_id       UUID NOT NULL,
    properties     JSONB,
    sa_owner_id    UUID NOT NULL,
    sa_created_by  UUID NOT NULL,
    sa_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at  TIMESTAMPTZ
);

COMMENT ON TABLE object_asset IS 'The attachment of an asset to any row by object_type and object_id, so no table carries a file column of its own';
COMMENT ON COLUMN object_asset.id IS 'The attachment id';
COMMENT ON COLUMN object_asset.object_type IS 'The table or the attachment kind of the row';
COMMENT ON COLUMN object_asset.object_id IS 'The row the asset is attached to';
COMMENT ON COLUMN object_asset.asset_id IS 'The attached asset';
COMMENT ON COLUMN object_asset.properties IS 'Free form customization of this attachment, overriding asset.properties key by key';
COMMENT ON COLUMN object_asset.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN object_asset.sa_created_by IS 'The user_claim of the player who attached it';
COMMENT ON COLUMN object_asset.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN object_asset.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN object_asset.sa_deleted_at IS 'When the row was soft deleted';

CREATE TABLE IF NOT EXISTS tag (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    sa_owner_id    UUID NOT NULL,
    sa_created_by  UUID NOT NULL,
    sa_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_name ON tag (lower(name)) WHERE sa_deleted_at IS NULL;

COMMENT ON TABLE tag IS 'The one tagging mechanism, attached to any row through tag_object; a tag naming the same thing twice is one row reached from every row';
COMMENT ON COLUMN tag.id IS 'The tag id';
COMMENT ON COLUMN tag.name IS 'The display name, unique among live rows on its lowercase form';
COMMENT ON COLUMN tag.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN tag.sa_created_by IS 'The user_claim of the player who made it';
COMMENT ON COLUMN tag.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN tag.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN tag.sa_deleted_at IS 'When the row was soft deleted';

CREATE TABLE IF NOT EXISTS tag_object (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id         UUID NOT NULL REFERENCES tag (id),
    object_type    TEXT NOT NULL,
    object_id      UUID NOT NULL,
    sa_owner_id    UUID NOT NULL,
    sa_created_by  UUID NOT NULL,
    sa_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_object ON tag_object (tag_id, object_type, object_id) WHERE sa_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tag_object_target ON tag_object (object_type, object_id) WHERE sa_deleted_at IS NULL;

COMMENT ON TABLE tag_object IS 'The attachment of a tag to any row by object_type and object_id';
COMMENT ON COLUMN tag_object.id IS 'The attachment id';
COMMENT ON COLUMN tag_object.tag_id IS 'The attached tag';
COMMENT ON COLUMN tag_object.object_type IS 'The table of the tagged row';
COMMENT ON COLUMN tag_object.object_id IS 'The tagged row';
COMMENT ON COLUMN tag_object.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN tag_object.sa_created_by IS 'The user_claim of the player who tagged it';
COMMENT ON COLUMN tag_object.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN tag_object.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN tag_object.sa_deleted_at IS 'When the row was soft deleted';

CREATE OR REPLACE FUNCTION public.get_assets(
    p_object_type          TEXT,
    p_object_id            UUID,
    p_mime_type            TEXT    DEFAULT NULL,
    p_include_parent_types BOOLEAN DEFAULT FALSE,
    p_propagate            BOOLEAN DEFAULT TRUE,
    p_types                TEXT[]  DEFAULT NULL
)
RETURNS TABLE(asset_id UUID, object_asset_id UUID, mime_type TEXT, index INTEGER, level INTEGER, hop INTEGER, object_type TEXT, object_id UUID)
LANGUAGE sql
STABLE
AS $$
    SELECT a.id,
           oa.id,
           a.mime_type,
           a."index",
           0,
           0,
           oa.object_type,
           oa.object_id
    FROM object_asset oa
    JOIN asset a ON a.id = oa.asset_id AND a.sa_deleted_at IS NULL
    WHERE oa.object_type = p_object_type
      AND oa.object_id = p_object_id
      AND oa.sa_deleted_at IS NULL
      AND (p_mime_type IS NULL OR p_mime_type = '' OR a.mime_type LIKE replace(p_mime_type, '*', '%'))
      AND (p_types IS NULL OR a.type = ANY (p_types))
    ORDER BY a."index", a.sa_created_at DESC
$$;

COMMENT ON FUNCTION public.get_assets(TEXT, UUID, TEXT, BOOLEAN, BOOLEAN, TEXT[]) IS 'get_assets(p_object_type, p_object_id, p_mime_type, p_include_parent_types, p_propagate, p_types) resolves the assets attached to a row through object_asset, filtered by a mime pattern and asset types; flat resolution, level and hop are always zero. The claimius graph functions call it to decorate rows with images.';

SELECT claimius.upsert_table_info('public.asset', 'public.object_asset', 'public.tag', 'public.tag_object');
