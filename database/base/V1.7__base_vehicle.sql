CREATE TABLE IF NOT EXISTS vehicle (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    campaign_id       UUID REFERENCES campaign(id),
    name              TEXT NOT NULL DEFAULT '',
    system            TEXT NOT NULL DEFAULT '',
    template          TEXT NOT NULL DEFAULT '',
    template_version  INTEGER NOT NULL DEFAULT 0,
    layout            TEXT NOT NULL DEFAULT '',
    components        JSONB NOT NULL DEFAULT '[]'::jsonb,
    states            JSONB NOT NULL DEFAULT '{}'::jsonb,
    stats             JSONB NOT NULL DEFAULT '{}'::jsonb,
    rulings           JSONB NOT NULL DEFAULT '{}'::jsonb,
    overlay           JSONB NOT NULL DEFAULT '{}'::jsonb,
    crew              JSONB NOT NULL DEFAULT '[]'::jsonb,
    revision          INTEGER NOT NULL DEFAULT 1,
    history           JSONB NOT NULL DEFAULT '[]'::jsonb,
    crew_claim_id     UUID,
    sa_owner_id       UUID NOT NULL,
    sa_created_by     UUID,
    sa_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sa_deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vehicle_campaign ON vehicle (campaign_id);

COMMENT ON TABLE vehicle IS 'A ship or other vehicle the table sails: its installed components, their condition, its crew and the history of its design';
COMMENT ON COLUMN vehicle.id IS 'The vehicle id';
COMMENT ON COLUMN vehicle.user_id IS 'The player who built it';
COMMENT ON COLUMN vehicle.campaign_id IS 'The campaign it sails in, when it sails in one';
COMMENT ON COLUMN vehicle.name IS 'The vehicle name';
COMMENT ON COLUMN vehicle.system IS 'The vehicle rule system id';
COMMENT ON COLUMN vehicle.template IS 'The template key it was built from';
COMMENT ON COLUMN vehicle.template_version IS 'The version of the template it was built from';
COMMENT ON COLUMN vehicle.layout IS 'The deck layout key';
COMMENT ON COLUMN vehicle.components IS 'The installed components';
COMMENT ON COLUMN vehicle.states IS 'The hit points and condition of each component by component id';
COMMENT ON COLUMN vehicle.stats IS 'The vehicle level statistics';
COMMENT ON COLUMN vehicle.rulings IS 'The option chosen for each rules ambiguity by its id';
COMMENT ON COLUMN vehicle.overlay IS 'The homebrew catalogue entries this vehicle alone carries';
COMMENT ON COLUMN vehicle.crew IS 'Every crew member with their character, player and role';
COMMENT ON COLUMN vehicle.revision IS 'The revision of the design, raised by every change to its components';
COMMENT ON COLUMN vehicle.history IS 'Every revision of the design with when, by whom, its note and its components';
COMMENT ON COLUMN vehicle.crew_claim_id IS 'The claim every player of the crew holds, read and write';
COMMENT ON COLUMN vehicle.sa_owner_id IS 'The owning organization';
COMMENT ON COLUMN vehicle.sa_created_by IS 'The user_claim of the builder';
COMMENT ON COLUMN vehicle.sa_created_at IS 'When the row was created';
COMMENT ON COLUMN vehicle.sa_updated_at IS 'When the row last changed';
COMMENT ON COLUMN vehicle.sa_deleted_at IS 'When the row was soft deleted';

SELECT claimius.upsert_table_info('public.vehicle');
