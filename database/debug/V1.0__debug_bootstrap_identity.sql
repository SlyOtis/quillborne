SELECT set_config('quillborne.debug_user_id', :'debug_user_id', true);

DO $$
DECLARE
    debug_user_id uuid := current_setting('quillborne.debug_user_id')::uuid;
    player_id uuid := '1d0c0000-0000-4000-8000-000000000002'::uuid;
    org_id uuid := 'aba6e96e-8ee9-4410-958b-60bcc235de5e'::uuid;
    member_claim_id uuid;
BEGIN
    INSERT INTO claimius.organization (
        id, name, description, type, sa_owner_id, sa_root_id, sa_level, sa_created_by
    ) VALUES (
        org_id, 'Knights of the Cauldron',
        'Debug organization standing in for the one the prophet replicates',
        'customer', org_id, org_id, 0, debug_user_id
    ) ON CONFLICT (id) DO NOTHING;

    PERFORM claimius.upsert_app_user(
        p_user_id     => debug_user_id,
        p_first_name  => 'Testy',
        p_last_name   => 'McTestface',
        p_user_name   => 'testy',
        p_email       => 'testy@quillborne.local',
        p_phone       => NULL,
        p_external_id => NULL
    );

    PERFORM claimius.upsert_app_user(
        p_user_id     => player_id,
        p_first_name  => 'Pip',
        p_last_name   => 'Player',
        p_user_name   => 'pip',
        p_email       => 'pip@quillborne.local',
        p_phone       => NULL,
        p_external_id => NULL
    );

    SELECT c.id INTO member_claim_id
      FROM claimius.claim c
     WHERE c.name = 'Member'
       AND c.sa_owner_id = org_id
       AND c.sa_deleted_at IS NULL
     LIMIT 1;

    IF member_claim_id IS NULL THEN
        member_claim_id := (claimius.insert_claim(
            p_name          => 'Member',
            p_description   => 'Entry to the table: may sign in and create characters and campaigns',
            p_sa_access     => 40,
            p_sa_owner_id   => org_id,
            p_sa_root_id    => org_id,
            p_sa_created_by => debug_user_id,
            p_inherits      => FALSE
        ) -> 'claim' ->> 'id')::uuid;

        PERFORM claimius.insert_claim_object(
            p_claim_id      => member_claim_id,
            p_sa_owner_id   => org_id,
            p_sa_root_id    => org_id,
            p_sa_created_by => debug_user_id,
            p_object_id     => org_id,
            p_object_type   => 'claimius.organization',
            p_sa_access     => 40,
            p_inherits      => FALSE,
            p_reason        => 'Debug member bound to the debug organization'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM claimius.user_claim uc
         WHERE uc.claim_id = member_claim_id AND uc.user_id = debug_user_id AND uc.sa_deleted_at IS NULL
    ) THEN
        PERFORM claimius.insert_user_claim(
            p_claim_id      => member_claim_id,
            p_user_id       => debug_user_id,
            p_sa_owner_id   => org_id,
            p_sa_created_by => debug_user_id
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM claimius.user_claim uc
         WHERE uc.claim_id = member_claim_id AND uc.user_id = player_id AND uc.sa_deleted_at IS NULL
    ) THEN
        PERFORM claimius.insert_user_claim(
            p_claim_id      => member_claim_id,
            p_user_id       => player_id,
            p_sa_owner_id   => org_id,
            p_sa_created_by => debug_user_id
        );
    END IF;

    RAISE NOTICE 'Debug identity bootstrapped: Knights of the Cauldron, its Member claim, the debug user and a second player';
END $$;
