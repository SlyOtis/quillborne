DO $$ BEGIN
    CREATE TYPE resource_kind AS ENUM ('entries', 'items', 'weapons', 'armor', 'locations', 'maps', 'sessions');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS resource (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind              resource_kind NOT NULL,
    user_id           UUID NOT NULL,
    campaign_id       UUID REFERENCES campaign(id),
    name              TEXT NOT NULL DEFAULT '',
    description       TEXT NOT NULL DEFAULT '',
    fields            JSONB NOT NULL DEFAULT '{}'::jsonb,
    share_users       UUID[] NOT NULL DEFAULT '{}',
    share_campaigns   UUID[] NOT NULL DEFAULT '{}',
    reader_claim_id   UUID,
    sa_owner_id       UUID NOT NULL,
    sa_parent_id      UUID NOT NULL,
    sa_root_id        UUID NOT NULL,
    sa_created_by     UUID,
    sa_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at     TIMESTAMPTZ
);

COMMENT ON TYPE resource_kind IS 'The seven kinds of lore a player or a campaign keeps';

CREATE INDEX IF NOT EXISTS idx_resource_campaign_kind ON resource (campaign_id, kind);
CREATE INDEX IF NOT EXISTS idx_resource_user_kind ON resource (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_resource_root ON resource (sa_root_id);

COMMENT ON TABLE resource IS 'A piece of lore kept by a player or a campaign, of one of the seven kinds, with its block document and pictures, nested under a parent resource';
COMMENT ON COLUMN resource.id IS 'The resource id';
COMMENT ON COLUMN resource.kind IS 'Which of the seven kinds the resource is';
COMMENT ON COLUMN resource.user_id IS 'The player who wrote it down';
COMMENT ON COLUMN resource.campaign_id IS 'The campaign that keeps the resource, empty for a player''s own';
COMMENT ON COLUMN resource.name IS 'The name shown at the head, what a list sorts by and what the shared search finds';
COMMENT ON COLUMN resource.description IS 'The lede under the name, searched with it';
COMMENT ON COLUMN resource.fields IS 'Everything else the page carries: lede, tags, facts, pictures, frame, block document, grouping and the fields of its own kind';
COMMENT ON COLUMN resource.share_users IS 'The players it is shared with by name';
COMMENT ON COLUMN resource.share_campaigns IS 'The campaigns whose tables read it';
COMMENT ON COLUMN resource.reader_claim_id IS 'The claim the players it is shared with by name hold';
COMMENT ON COLUMN resource.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN resource.sa_parent_id IS 'The resource this one is a sub page of, itself for a top resource';
COMMENT ON COLUMN resource.sa_root_id IS 'The top resource of the tree';
COMMENT ON COLUMN resource.sa_created_by IS 'The user_claim of the creator';
COMMENT ON COLUMN resource.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN resource.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN resource.sa_deleted_at IS 'When the row was soft deleted';

CREATE TABLE IF NOT EXISTS resource_update (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id  UUID NOT NULL REFERENCES resource(id),
    author_id    UUID NOT NULL,
    body         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_update_resource ON resource_update (resource_id, created_at);

COMMENT ON TABLE resource_update IS 'A merged Yjs update of a resource being edited live, read by everyone who reads the resource and folded into one past forty';
COMMENT ON COLUMN resource_update.id IS 'The update id';
COMMENT ON COLUMN resource_update.resource_id IS 'The resource the update edits';
COMMENT ON COLUMN resource_update.author_id IS 'The user id of the editor';
COMMENT ON COLUMN resource_update.body IS 'The Yjs update, base64';
COMMENT ON COLUMN resource_update.created_at IS 'When the update was written';

SELECT claimius.upsert_table_info('public.resource');
