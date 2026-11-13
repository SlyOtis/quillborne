CREATE TABLE IF NOT EXISTS state_key (
    "group"        TEXT NOT NULL,
    key            TEXT NOT NULL,
    object_id      UUID NOT NULL,
    sa_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("group", key)
);

CREATE INDEX IF NOT EXISTS idx_state_key_object ON state_key (object_id);

COMMENT ON TABLE state_key IS 'The key a /api/state import named a row by, so the next import of the same key finds the row; written in the import transaction and not registered with claimius';
COMMENT ON COLUMN state_key."group" IS 'The state group, one per table';
COMMENT ON COLUMN state_key.key IS 'The key the import named the row by';
COMMENT ON COLUMN state_key.object_id IS 'The row the key names';
COMMENT ON COLUMN state_key.sa_created_at IS 'When the key was first written';
