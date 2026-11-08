CREATE TABLE IF NOT EXISTS campaign (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    settings         JSONB NOT NULL DEFAULT '{}'::jsonb,
    dm_claim_id      UUID,
    player_claim_id  UUID,
    sa_owner_id      UUID NOT NULL,
    sa_created_by    UUID,
    sa_created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at    TIMESTAMPTZ
);

ALTER TABLE campaign DROP COLUMN IF EXISTS party_ids;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM claimius.table_info WHERE object_type = 'public.party') THEN
        PERFORM claimius.delete_table_info('public.party');
    END IF;
END $$;

DROP TABLE IF EXISTS party;

COMMENT ON TABLE campaign IS 'A table of play: the dungeon master who created it and the players granted its player claim';
COMMENT ON COLUMN campaign.id IS 'The campaign id';
COMMENT ON COLUMN campaign.user_id IS 'The dungeon master, samna_user.user_id';
COMMENT ON COLUMN campaign.name IS 'The campaign name';
COMMENT ON COLUMN campaign.description IS 'What the campaign is about';
COMMENT ON COLUMN campaign.is_active IS 'Whether the campaign is being played';
COMMENT ON COLUMN campaign.settings IS 'Character editing, sheet sharing, private notes and the experience mode';
COMMENT ON COLUMN campaign.dm_claim_id IS 'The claim the dungeon master holds on the campaign and everything in it';
COMMENT ON COLUMN campaign.player_claim_id IS 'The claim every player at the table holds, read on what the table shares';
COMMENT ON COLUMN campaign.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN campaign.sa_created_by IS 'The user_claim of the dungeon master who created it';
COMMENT ON COLUMN campaign.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN campaign.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN campaign.sa_deleted_at IS 'When the row was soft deleted';

CREATE TABLE IF NOT EXISTS campaign_map (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id    UUID NOT NULL REFERENCES campaign(id),
    user_id        UUID NOT NULL,
    title          TEXT NOT NULL DEFAULT '',
    image_url      TEXT NOT NULL DEFAULT '',
    layers         JSONB NOT NULL DEFAULT '[]'::jsonb,
    markers        JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_visible     BOOLEAN NOT NULL DEFAULT FALSE,
    min_zoom       DOUBLE PRECISION NOT NULL DEFAULT 1,
    max_zoom       DOUBLE PRECISION NOT NULL DEFAULT 8,
    sa_owner_id    UUID NOT NULL,
    sa_parent_id   UUID NOT NULL,
    sa_root_id     UUID NOT NULL,
    sa_created_by  UUID,
    sa_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaign_map_campaign ON campaign_map (campaign_id);

COMMENT ON TABLE campaign_map IS 'A map of a campaign with its layers and markers, nested under a parent map';
COMMENT ON COLUMN campaign_map.id IS 'The map id';
COMMENT ON COLUMN campaign_map.campaign_id IS 'The campaign the map belongs to';
COMMENT ON COLUMN campaign_map.user_id IS 'The dungeon master who drew it';
COMMENT ON COLUMN campaign_map.title IS 'The map title';
COMMENT ON COLUMN campaign_map.image_url IS 'The stored address of the map picture';
COMMENT ON COLUMN campaign_map.layers IS 'The image layers drawn over the map';
COMMENT ON COLUMN campaign_map.markers IS 'The markers placed on the map, each pointing at a resource';
COMMENT ON COLUMN campaign_map.is_visible IS 'Whether the players see the map';
COMMENT ON COLUMN campaign_map.min_zoom IS 'The smallest zoom the map allows';
COMMENT ON COLUMN campaign_map.max_zoom IS 'The largest zoom the map allows';
COMMENT ON COLUMN campaign_map.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN campaign_map.sa_parent_id IS 'The map this map sits inside, itself for a top map';
COMMENT ON COLUMN campaign_map.sa_root_id IS 'The top map of the tree';
COMMENT ON COLUMN campaign_map.sa_created_by IS 'The user_claim of the creator';
COMMENT ON COLUMN campaign_map.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN campaign_map.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN campaign_map.sa_deleted_at IS 'When the row was soft deleted';

CREATE TABLE IF NOT EXISTS encounter (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id       UUID NOT NULL REFERENCES campaign(id),
    user_id           UUID NOT NULL,
    title             TEXT NOT NULL DEFAULT '',
    combatants        JSONB NOT NULL DEFAULT '[]'::jsonb,
    round             INTEGER NOT NULL DEFAULT 1,
    turn              INTEGER NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT FALSE,
    share_users       UUID[] NOT NULL DEFAULT '{}',
    share_campaigns   UUID[] NOT NULL DEFAULT '{}',
    reader_claim_id   UUID,
    sa_owner_id       UUID NOT NULL,
    sa_created_by     UUID,
    sa_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at     TIMESTAMPTZ
);

ALTER TABLE encounter DROP COLUMN IF EXISTS share_parties;

CREATE INDEX IF NOT EXISTS idx_encounter_campaign ON encounter (campaign_id);

COMMENT ON TABLE encounter IS 'A fight in a campaign: the combatants in initiative order, the round and whose turn it is';
COMMENT ON COLUMN encounter.id IS 'The encounter id';
COMMENT ON COLUMN encounter.campaign_id IS 'The campaign the encounter is played in';
COMMENT ON COLUMN encounter.user_id IS 'The player who set it up';
COMMENT ON COLUMN encounter.title IS 'The encounter title';
COMMENT ON COLUMN encounter.combatants IS 'Every combatant with its kind, initiative, hit points and conditions';
COMMENT ON COLUMN encounter.round IS 'The current round';
COMMENT ON COLUMN encounter.turn IS 'The index of the combatant whose turn it is';
COMMENT ON COLUMN encounter.is_active IS 'Whether the encounter is running';
COMMENT ON COLUMN encounter.share_users IS 'The players it is shared with by name';
COMMENT ON COLUMN encounter.share_campaigns IS 'The campaigns whose tables read it';
COMMENT ON COLUMN encounter.reader_claim_id IS 'The claim the players it is shared with by name hold';
COMMENT ON COLUMN encounter.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN encounter.sa_created_by IS 'The user_claim of the creator';
COMMENT ON COLUMN encounter.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN encounter.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN encounter.sa_deleted_at IS 'When the row was soft deleted';

CREATE TABLE IF NOT EXISTS chat_entry (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id    UUID NOT NULL REFERENCES campaign(id),
    author_id      UUID NOT NULL,
    author_name    TEXT NOT NULL DEFAULT '',
    kind           TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'roll')),
    body           TEXT NOT NULL DEFAULT '',
    query          TEXT NOT NULL DEFAULT '',
    is_hidden      BOOLEAN NOT NULL DEFAULT FALSE,
    card_kind      TEXT NOT NULL DEFAULT '',
    roll_kind      TEXT NOT NULL DEFAULT '',
    formula        TEXT NOT NULL DEFAULT '',
    dice           JSONB NOT NULL DEFAULT '[]'::jsonb,
    roll           DOUBLE PRECISION NOT NULL DEFAULT 0,
    total          DOUBLE PRECISION NOT NULL DEFAULT 0,
    sa_owner_id    UUID NOT NULL,
    sa_created_by  UUID,
    sa_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_entry_campaign ON chat_entry (campaign_id, sa_created_at);

COMMENT ON TABLE chat_entry IS 'A message or a dice roll posted to a campaign''s table, a hidden roll read by the dungeon master and its author alone';
COMMENT ON COLUMN chat_entry.id IS 'The entry id';
COMMENT ON COLUMN chat_entry.campaign_id IS 'The campaign the entry is posted to';
COMMENT ON COLUMN chat_entry.author_id IS 'The user id of the author';
COMMENT ON COLUMN chat_entry.author_name IS 'The name the author posted under';
COMMENT ON COLUMN chat_entry.kind IS 'message or roll';
COMMENT ON COLUMN chat_entry.body IS 'The message text';
COMMENT ON COLUMN chat_entry.query IS 'The question asked of the assistant';
COMMENT ON COLUMN chat_entry.is_hidden IS 'Whether only the dungeon master and the author read the entry';
COMMENT ON COLUMN chat_entry.card_kind IS 'The card the entry is drawn as';
COMMENT ON COLUMN chat_entry.roll_kind IS 'What the roll was for';
COMMENT ON COLUMN chat_entry.formula IS 'The dice formula rolled';
COMMENT ON COLUMN chat_entry.dice IS 'Each die as it landed';
COMMENT ON COLUMN chat_entry.roll IS 'The sum of the dice';
COMMENT ON COLUMN chat_entry.total IS 'The roll with its modifiers';
COMMENT ON COLUMN chat_entry.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN chat_entry.sa_created_by IS 'The user_claim of the author';
COMMENT ON COLUMN chat_entry.sa_created_at IS 'When the entry was posted';
COMMENT ON COLUMN chat_entry.sa_updated_at IS 'When the entry last changed';
COMMENT ON COLUMN chat_entry.sa_deleted_at IS 'When the entry was soft deleted';

CREATE TABLE IF NOT EXISTS song (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id       UUID NOT NULL REFERENCES campaign(id),
    user_id           UUID NOT NULL,
    title             TEXT NOT NULL DEFAULT '',
    address           TEXT NOT NULL DEFAULT '',
    duration          DOUBLE PRECISION NOT NULL DEFAULT 0,
    share_users       UUID[] NOT NULL DEFAULT '{}',
    share_campaigns   UUID[] NOT NULL DEFAULT '{}',
    reader_claim_id   UUID,
    sa_owner_id       UUID NOT NULL,
    sa_created_by     UUID,
    sa_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at     TIMESTAMPTZ
);

ALTER TABLE song DROP COLUMN IF EXISTS share_parties;

CREATE INDEX IF NOT EXISTS idx_song_campaign ON song (campaign_id);

COMMENT ON TABLE song IS 'A track in a campaign''s music library';
COMMENT ON COLUMN song.id IS 'The song id';
COMMENT ON COLUMN song.campaign_id IS 'The campaign whose library holds the song';
COMMENT ON COLUMN song.user_id IS 'The player who added it';
COMMENT ON COLUMN song.title IS 'The song title';
COMMENT ON COLUMN song.address IS 'The stored address of the audio file';
COMMENT ON COLUMN song.duration IS 'The length in seconds';
COMMENT ON COLUMN song.share_users IS 'The players it is shared with by name';
COMMENT ON COLUMN song.share_campaigns IS 'The campaigns whose tables hear it';
COMMENT ON COLUMN song.reader_claim_id IS 'The claim the players it is shared with by name hold';
COMMENT ON COLUMN song.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN song.sa_created_by IS 'The user_claim of the creator';
COMMENT ON COLUMN song.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN song.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN song.sa_deleted_at IS 'When the row was soft deleted';







SELECT claimius.upsert_table_info('public.campaign');
SELECT claimius.upsert_table_info('public.campaign_map');
SELECT claimius.upsert_table_info('public.encounter');
SELECT claimius.upsert_table_info('public.chat_entry');
SELECT claimius.upsert_table_info('public.song');
