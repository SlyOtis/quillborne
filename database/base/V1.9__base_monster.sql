CREATE TABLE IF NOT EXISTS monster (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    is_public         BOOLEAN NOT NULL DEFAULT FALSE,
    system            TEXT NOT NULL DEFAULT '',
    name              TEXT NOT NULL DEFAULT '',
    size              TEXT NOT NULL DEFAULT '',
    type              TEXT NOT NULL DEFAULT '',
    alignment         TEXT NOT NULL DEFAULT '',
    challenge         NUMERIC NOT NULL DEFAULT 0,
    stats             JSONB NOT NULL DEFAULT '{}'::jsonb,
    description       TEXT NOT NULL DEFAULT '',
    image             TEXT NOT NULL DEFAULT '',
    sa_owner_id       UUID NOT NULL,
    sa_created_by     UUID,
    sa_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_monster_user ON monster (user_id);

COMMENT ON TABLE monster IS 'A creature to fight: its stat block, its lore and its portrait, shared with every player when public and the creator''s own homebrew when not';
COMMENT ON COLUMN monster.id IS 'The monster id';
COMMENT ON COLUMN monster.user_id IS 'The player who made it';
COMMENT ON COLUMN monster.is_public IS 'Whether every signed in player reads it';
COMMENT ON COLUMN monster.system IS 'The monster rule system id';
COMMENT ON COLUMN monster.name IS 'The monster name';
COMMENT ON COLUMN monster.size IS 'The size id from the monster system';
COMMENT ON COLUMN monster.type IS 'The creature type id from the monster system';
COMMENT ON COLUMN monster.alignment IS 'The alignment id from the monster system';
COMMENT ON COLUMN monster.challenge IS 'The challenge rating as a number, a quarter as 0.25';
COMMENT ON COLUMN monster.stats IS 'The rest of the stat block: sub-types, armor class, hit dice, speeds, abilities, proficiencies, senses, languages, defences, habitats, the legendary, mythic and lair flags, traits and actions';
COMMENT ON COLUMN monster.description IS 'The lore as a block document';
COMMENT ON COLUMN monster.image IS 'The portrait as an asset address';
COMMENT ON COLUMN monster.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN monster.sa_created_by IS 'The user_claim of the creator';
COMMENT ON COLUMN monster.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN monster.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN monster.sa_deleted_at IS 'When the row was soft deleted';

SELECT claimius.upsert_table_info('public.monster');
