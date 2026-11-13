CREATE TABLE IF NOT EXISTS character (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    campaign_id     UUID REFERENCES campaign(id),
    name            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    sheet           JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    sources         JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    last_played_at  TIMESTAMPTZ,
    sa_owner_id     UUID NOT NULL,
    sa_created_by   UUID,
    sa_created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_character_user ON character (user_id, sa_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_campaign ON character (campaign_id);

ALTER TABLE character ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE character ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
UPDATE character SET name = coalesce(metadata->>'name', sheet->'info'->>'name', ''), description = coalesce(sheet->'info'->>'description', '') WHERE name = '';

COMMENT ON TABLE character IS 'A player character: the sheet the rules engine resolves, its summary and the sources it was imported from';
COMMENT ON COLUMN character.id IS 'The character id';
COMMENT ON COLUMN character.user_id IS 'The player the character belongs to';
COMMENT ON COLUMN character.campaign_id IS 'The campaign the character plays in, when it plays in one';
COMMENT ON COLUMN character.name IS 'The character''s name, kept beside the sheet so the shared search finds it';
COMMENT ON COLUMN character.description IS 'The character''s description from the sheet, kept beside it so the shared search finds it';
COMMENT ON COLUMN character.sheet IS 'The whole character as the rules engine reads it';
COMMENT ON COLUMN character.metadata IS 'Name, level, class, race, status, tags, version and the template flag shown in lists';
COMMENT ON COLUMN character.sources IS 'The documents the character was imported from';
COMMENT ON COLUMN character.is_public IS 'Whether anyone signed in may read the sheet';
COMMENT ON COLUMN character.last_played_at IS 'When the sheet was last opened at the table';
COMMENT ON COLUMN character.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN character.sa_created_by IS 'The user_claim of the player who created it';
COMMENT ON COLUMN character.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN character.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN character.sa_deleted_at IS 'When the row was soft deleted';

SELECT claimius.upsert_table_info('public.character');
