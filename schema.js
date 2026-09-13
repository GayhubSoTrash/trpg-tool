const pool = require('./db');

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS characters (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            hp NUMERIC(14,4) NOT NULL,
            max_hp NUMERIC(14,4) NOT NULL,
            ap NUMERIC(14,4) NOT NULL,
            max_ap NUMERIC(14,4) NOT NULL,
            sp NUMERIC(14,4) NOT NULL,
            max_sp NUMERIC(14,4) NOT NULL,
            patk INTEGER NOT NULL,
            matk INTEGER NOT NULL,
            crit INTEGER NOT NULL,
            crit_damage_bonus NUMERIC(7,2) NOT NULL DEFAULT 0,
            hit_rate INTEGER NOT NULL,
            dodge INTEGER NOT NULL,
            speed INTEGER NOT NULL,
            defense INTEGER NOT NULL,
            resist INTEGER NOT NULL,
            block_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
            image_path TEXT,
            kind TEXT NOT NULL DEFAULT 'player',
            profession TEXT NOT NULL DEFAULT '',
            skill_slots INTEGER NOT NULL DEFAULT 1 CHECK (skill_slots >= 0),
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS grid_groups (
            id SERIAL PRIMARY KEY,
            world_x INTEGER NOT NULL,
            world_y INTEGER NOT NULL,
            rows INTEGER NOT NULL CHECK (rows > 0),
            cols INTEGER NOT NULL CHECK (cols > 0),
            cell_size INTEGER NOT NULL DEFAULT 160 CHECK (cell_size > 0),
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS cells (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL REFERENCES grid_groups(id) ON DELETE CASCADE,
            row_index INTEGER NOT NULL,
            col_index INTEGER NOT NULL,
            occupied_by INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            UNIQUE (group_id, row_index, col_index)
        );

        CREATE TABLE IF NOT EXISTS character_buffs (
            id SERIAL PRIMARY KEY,
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            buff_key TEXT NOT NULL,
            source_skill_key TEXT,
            source_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            expires_round INTEGER,
            stack_count INTEGER NOT NULL DEFAULT 1,
            value_num NUMERIC(14,4),
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (character_id, buff_key)
        );

        CREATE TABLE IF NOT EXISTS character_skills (
            id BIGSERIAL PRIMARY KEY,
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
            skill_key TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (character_id, slot_index),
            UNIQUE (character_id, skill_key)
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id BIGSERIAL PRIMARY KEY,
            channel TEXT NOT NULL CHECK (channel IN ('team', 'combat')),
            message_type TEXT NOT NULL DEFAULT 'text',
            character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            character_name TEXT NOT NULL,
            character_kind TEXT NOT NULL DEFAULT 'player',
            content TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS battle_state (
            id SMALLINT PRIMARY KEY CHECK (id = 1),
            round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number > 0),
            turn_pass INTEGER NOT NULL DEFAULT 1 CHECK (turn_pass > 0),
            current_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS pending_actions (
            id BIGSERIAL PRIMARY KEY,
            actor_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            target_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            skill_key TEXT NOT NULL,
            created_round INTEGER NOT NULL,
            created_turn_pass INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (actor_id, skill_key)
        );


        CREATE TABLE IF NOT EXISTS status_resistances (
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            status_key TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (character_id, status_key)
        );


        CREATE TABLE IF NOT EXISTS reaction_windows (
            id BIGSERIAL PRIMARY KEY,
            trigger_type TEXT NOT NULL,
            blocking BOOLEAN NOT NULL DEFAULT FALSE,
            status TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'ready', 'resolving', 'resolved', 'skipped', 'expired', 'queued')),
            source_actor_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            source_target_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            source_skill_key TEXT,
            reactor_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            batch_id TEXT,
            round_number INTEGER NOT NULL,
            turn_pass INTEGER NOT NULL,
            context JSONB NOT NULL DEFAULT '{}'::jsonb,
            options JSONB NOT NULL DEFAULT '[]'::jsonb,
            resume_payload JSONB,
            resolution JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            resolved_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS battle_events (
            id BIGSERIAL PRIMARY KEY,
            event_type TEXT NOT NULL,
            round_number INTEGER NOT NULL,
            turn_pass INTEGER NOT NULL,
            actor_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            target_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            content TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        INSERT INTO battle_state (id, round_number, turn_pass)
        VALUES (1, 1, 1)
        ON CONFLICT (id) DO NOTHING;
    `);

    // 舊資料庫升級：只補欄位 / 索引，不刪既有角色、戰場與 Buff。
    await pool.query(`
        ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'player';

        ALTER TABLE pending_actions
        ADD COLUMN IF NOT EXISTS charge_required INTEGER NOT NULL DEFAULT 1;

        ALTER TABLE pending_actions
        ADD COLUMN IF NOT EXISTS charge_progress INTEGER NOT NULL DEFAULT 1;

        ALTER TABLE pending_actions
        ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

        ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS profession TEXT NOT NULL DEFAULT '';

        ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS skill_slots INTEGER NOT NULL DEFAULT 1;

        ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS block_rate NUMERIC(6,2) NOT NULL DEFAULT 0;

        ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS crit_damage_bonus NUMERIC(7,2) NOT NULL DEFAULT 0;

        UPDATE characters
        SET block_rate = LEAST(75, GREATEST(0, block_rate));

        ALTER TABLE characters ALTER COLUMN hp TYPE NUMERIC(14,4) USING hp::numeric;
        ALTER TABLE characters ALTER COLUMN max_hp TYPE NUMERIC(14,4) USING max_hp::numeric;
        ALTER TABLE characters ALTER COLUMN ap TYPE NUMERIC(14,4) USING ap::numeric;
        ALTER TABLE characters ALTER COLUMN max_ap TYPE NUMERIC(14,4) USING max_ap::numeric;
        ALTER TABLE characters ALTER COLUMN sp TYPE NUMERIC(14,4) USING sp::numeric;
        ALTER TABLE characters ALTER COLUMN max_sp TYPE NUMERIC(14,4) USING max_sp::numeric;

        UPDATE characters
        SET kind = 'player'
        WHERE kind IS NULL OR kind NOT IN ('player', 'enemy');

        CREATE INDEX IF NOT EXISTS idx_characters_kind ON characters(kind);
        CREATE INDEX IF NOT EXISTS idx_cells_group_id ON cells(group_id);
        CREATE INDEX IF NOT EXISTS idx_cells_occupied_by ON cells(occupied_by);
        ALTER TABLE character_buffs
        ADD COLUMN IF NOT EXISTS source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

        ALTER TABLE battle_state
        ADD COLUMN IF NOT EXISTS once_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

        ALTER TABLE character_buffs
        ADD COLUMN IF NOT EXISTS source_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL;

        ALTER TABLE character_buffs
        ADD COLUMN IF NOT EXISTS expires_round INTEGER;

        ALTER TABLE character_buffs
        ADD COLUMN IF NOT EXISTS stack_count INTEGER NOT NULL DEFAULT 1;

        ALTER TABLE character_buffs
        ADD COLUMN IF NOT EXISTS value_num NUMERIC(14,4);

        UPDATE character_buffs
        SET stack_count = 1
        WHERE stack_count IS NULL OR stack_count < 1;

        CREATE INDEX IF NOT EXISTS idx_character_buffs_character_id ON character_buffs(character_id);
        CREATE INDEX IF NOT EXISTS idx_character_buffs_expires_round ON character_buffs(expires_round);
        CREATE INDEX IF NOT EXISTS idx_character_skills_character_id ON character_skills(character_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON chat_messages(channel, id DESC);
        CREATE INDEX IF NOT EXISTS idx_pending_actions_actor_id ON pending_actions(actor_id);
        CREATE INDEX IF NOT EXISTS idx_battle_events_id ON battle_events(id DESC);
        CREATE INDEX IF NOT EXISTS idx_status_resistances_character ON status_resistances(character_id);
        CREATE INDEX IF NOT EXISTS idx_battle_events_round_turn ON battle_events(round_number, turn_pass, id);
        ALTER TABLE battle_state
        ADD COLUMN IF NOT EXISTS flow_stack JSONB NOT NULL DEFAULT '{"frames":[],"frameSeq":1}'::jsonb;

        CREATE INDEX IF NOT EXISTS idx_reaction_windows_status ON reaction_windows(status, id DESC);
        CREATE INDEX IF NOT EXISTS idx_reaction_windows_round_turn ON reaction_windows(round_number, turn_pass, id DESC);

        ALTER TABLE reaction_windows
        ADD COLUMN IF NOT EXISTS reactor_id INTEGER REFERENCES characters(id) ON DELETE SET NULL;

        ALTER TABLE reaction_windows
        ADD COLUMN IF NOT EXISTS batch_id TEXT;

        CREATE INDEX IF NOT EXISTS idx_reaction_windows_batch
            ON reaction_windows(batch_id, id);

        CREATE INDEX IF NOT EXISTS idx_reaction_windows_reactor
            ON reaction_windows(reactor_id, status);

        ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS reaction_default_skip BOOLEAN NOT NULL DEFAULT FALSE;

        ALTER TABLE reaction_windows
        DROP CONSTRAINT IF EXISTS reaction_windows_status_check;

        ALTER TABLE reaction_windows
        ADD CONSTRAINT reaction_windows_status_check
        CHECK (status IN (
            'open', 'ready', 'resolving', 'resolved',
            'skipped', 'expired', 'queued'
        ));
    `);
}

module.exports = { ensureSchema };
