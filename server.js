const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./db');
const { ensureSchema } = require('./schema');
const SKILL_DATA = require('./skill-data');
const combat = require('./lib/combat');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

const {
    STATUS_CATALOG,
    LEGACY_STATUS_EXPAND,
    expandStatusKeys,
    expandStatusGrants,
    statusesForSkill,
    listManualStatuses,
    isAbnormalStatus,
    isDebuffStatus,
    getStatusDefinition,
    normalizeGrant,
    mod
} = require('./lib/combat/status-catalog');

/** Runtime buff lookup ??atomic statuses + parametric / legacy mods. */
function lookupBuff(key, valueNum = null) {
    if (!key) return null;
    if (STATUS_CATALOG[key]) return STATUS_CATALOG[key];
    const resolved = getStatusDefinition(key, valueNum);
    if (resolved) return resolved;
    const expand = LEGACY_STATUS_EXPAND[key];
    if (Array.isArray(expand) && expand.length) {
        const parts = expand
            .map(item => {
                if (typeof item === 'string') return STATUS_CATALOG[item] || getStatusDefinition(item);
                if (item && item.type === 'mod') {
                    return getStatusDefinition(
                        combat.modKey(item.stat, item.mode),
                        item.value
                    );
                }
                return null;
            })
            .filter(Boolean);
        if (!parts.length) return null;
        return {
            key,
            name: parts.map(item => item.name).join('、'),
            effect: parts.map(item => item.effect || item.name).join('、'),
            icon: parts[0].icon,
            kind: parts[0].kind,
            subtype: parts[0].subtype || null,
            stackable: false,
            manual: false,
            legacyExpand: expand,
            modifiers: {}
        };
    }
    return null;
}

const BUFF_CATALOG = new Proxy(
    { ...STATUS_CATALOG },
    {
        get(target, prop) {
            if (typeof prop !== 'string') return target[prop];
            if (prop in target) return target[prop];
            return lookupBuff(prop);
        },
        has(target, prop) {
            return prop in target || Boolean(lookupBuff(prop));
        }
    }
);

const SKILL_CATALOG = {
    basic_attack: {
        key: 'basic_attack', name: '基礎攻擊', source: '初始戰技', category: 'initial', level: 1,
        timing: '主動', cost: '1AP', weapon: '所有', effect: '【1.0物理】指定一名敵方進行近戰攻擊',
        actionCode: 'ATTACK', targetCode: 'ENEMY', manual: true, needsRoll: true, skillKind: 'active'
    },
    rescue: {
        key: 'rescue', name: '救援', source: '初始戰技', category: 'initial', level: 1,
        timing: '主動', cost: '1AP', weapon: '所有', effect: '【蓄力1】指定一名被擊倒的友方，使其恢復到1點HP',
        actionCode: 'HEAL', targetCode: 'ALLY_DOWN', manual: true, needsRoll: false, skillKind: 'active', charge: true
    },
    basic_guard: {
        key: 'basic_guard', name: '基礎格擋', source: '初始戰技', category: 'initial', level: 1,
        timing: '自身被攻擊指定時', cost: '1SP', weapon: '所有', effect: '對本次攻擊進行格擋',
        actionCode: 'GUARD', targetCode: 'SELF', manual: true, needsRoll: false, skillKind: 'auxiliary',
        utilityMode: 'basic_guard', statusGrants: ['guard_ready']
    },
    basic_move: {
        key: 'basic_move', name: '基礎移動', source: '初始戰技', category: 'initial', level: 1,
        timing: '主動/自身進行主要行動前', cost: '1AP/1SP', weapon: '所有', effect: '移動至任意一個未被佔據的格子',
        actionCode: 'MOVE', targetCode: 'SELF', manual: true, needsRoll: false, skillKind: 'active'
    },
    wait: {
        key: 'wait', name: '待機', source: '基本動作', category: 'basic', level: 1,
        timing: '主動', cost: '無', weapon: '所有', effect: '放棄本次主要動作並待機',
        actionCode: 'UTILITY', targetCode: 'SELF', manual: true, needsRoll: false, skillKind: 'active',
        pipeline: [{ module: 'wait', params: {} }, { module: 'finalize', params: {} }]
    }
};

combat.enrichSkillCatalog(SKILL_DATA);
Object.values(SKILL_CATALOG).forEach(skill => combat.enrichSkill(skill));

const ALL_EQUIPPABLE_SKILLS = new Map();
for (const profession of SKILL_DATA.professions) {
    for (const skill of SKILL_DATA.professionSkills[profession] || []) {
        ALL_EQUIPPABLE_SKILLS.set(skill.key, skill);
    }
}
for (const skill of SKILL_DATA.common) {
    ALL_EQUIPPABLE_SKILLS.set(skill.key, skill);
}
combat.enrichSkillMap(ALL_EQUIPPABLE_SKILLS);

function safeProfession(value) {
    return SKILL_DATA.professions.includes(value) ? value : '';
}

function skillAllowedForProfession(skill, profession) {
    if (!skill) return false;
    return skill.category === 'common' ||
        (skill.category === 'profession' && skill.source === profession);
}


fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function safeKind(value) {
    return value === 'enemy' ? 'enemy' : 'player';
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeBuffEntries(source) {
    if (!source) return [];

    if (source instanceof Set) {
        return [...source].map(key => ({
            key,
            stackCount: 1,
            valueNum: null
        }));
    }

    if (Array.isArray(source)) {
        return source.map(item => {
            if (typeof item === 'string') {
                return { key: item, stackCount: 1, valueNum: null };
            }

            return {
                key: item.key || item.buff_key,
                stackCount: Math.max(1, Number(item.stackCount ?? item.stack_count ?? 1)),
                valueNum:
                    item.valueNum === null || item.valueNum === undefined
                        ? (
                            item.value_num === null || item.value_num === undefined
                                ? null
                                : Number(item.value_num)
                        )
                        : Number(item.valueNum)
            };
        });
    }

    return [];
}

function buffModifiers(source) {
    const pct = {
        patk: 0,
        matk: 0,
        defense: 0,
        resist: 0,
        damage: 0,
        damageTaken: 0,
        dodge: 0,
        maxHp: 0
    };

    const mods = {
        patkMult: 1,
        matkMult: 1,
        defenseMult: 1,
        resistMult: 1,
        damageMult: 1,
        damageTakenMult: 1,
        dodgeMult: 1,
        maxHpMult: 1,

        patkFlat: 0,
        matkFlat: 0,
        defenseFlat: 0,
        resistFlat: 0,
        hitFlat: 0,
        dodgeFlat: 0,
        critFlat: 0,
        critDamageFlat: 0,
        speedFlat: 0,
        blockFlat: 0,
        maxHpFlat: 0,

        autoGuard: false,
        guardReady: false,
        blockDisabled: false,
        unblockable: false,
        initiativeFirst: false,
        empowerMagic: 0,
        applyBleedOnHit: false,
        applyBlockSealOnHit: false,
        lifeSacrifice: false,
        lifeSacrificePatk: 0,
        consumeOnAttackKeys: [],
        consumeOnDamageKeys: []
    };

    for (const entry of normalizeBuffEntries(source)) {
        const key = entry.key;
        // Parametric / legacy numeric mods
        if (combat.accumulateModFromEntry(entry, mods, pct)) {
            const snap = entry.sourceSnapshot || entry.source_snapshot || {};
            if (snap.consumeOnDamage) {
                mods.consumeOnDamageKeys.push(entry.key || entry.buff_key);
            }
            continue;
        }

        const expandedKeys = expandStatusKeys(key);
        const keys = expandedKeys.length ? expandedKeys : [key];
        const count = Math.max(1, Number(entry.stackCount || 1));

        for (const statusKey of keys) {
            if (combat.isModKey(statusKey) || combat.isLegacyStatKey(statusKey)) {
                combat.accumulateModFromEntry(
                    { ...entry, key: statusKey },
                    mods,
                    pct
                );
                continue;
            }

            const buff = lookupBuff(statusKey, entry.valueNum);
            if (!buff) continue;
            const m = buff.modifiers || {};

            if (m.patkPct) pct.patk += Number(m.patkPct) * count;
            if (m.matkPct) pct.matk += Number(m.matkPct) * count;
            if (m.defensePct) pct.defense += Number(m.defensePct) * count;
            if (m.resistPct) pct.resist += Number(m.resistPct) * count;
            if (m.damagePct) pct.damage += Number(m.damagePct) * count;
            if (m.damageTakenPct) pct.damageTaken += Number(m.damageTakenPct) * count;
            if (m.dodgePct) pct.dodge += Number(m.dodgePct) * count;
            if (m.maxHpPct) pct.maxHp += Number(m.maxHpPct) * count;

            if (m.patkMult) pct.patk += (Number(m.patkMult) - 1) * count;
            if (m.matkMult) pct.matk += (Number(m.matkMult) - 1) * count;
            if (m.defenseMult) pct.defense += (Number(m.defenseMult) - 1) * count;
            if (m.resistMult) pct.resist += (Number(m.resistMult) - 1) * count;
            if (m.damageMult) pct.damage += (Number(m.damageMult) - 1) * count;
            if (m.damageTakenMult) pct.damageTaken += (Number(m.damageTakenMult) - 1) * count;
            if (m.dodgeMult) pct.dodge += (Number(m.dodgeMult) - 1) * count;

            mods.patkFlat += Number(m.patkFlat || 0) * count;
            mods.matkFlat += Number(m.matkFlat || 0) * count;
            mods.defenseFlat += Number(m.defenseFlat || 0) * count;
            mods.resistFlat += Number(m.resistFlat || 0) * count;
            mods.hitFlat += Number(m.hitFlat || 0) * count;
            mods.dodgeFlat += Number(m.dodgeFlat || 0) * count;
            mods.critFlat += Number(m.critFlat || 0) * count;
            mods.critDamageFlat += Number(m.critDamageFlat || 0) * count;
            mods.speedFlat += Number(m.speedFlat || 0) * count;
            mods.blockFlat += Number(m.blockFlat || 0) * count;

            if (statusKey === 'life_sacrifice') {
                mods.lifeSacrifice = true;
                mods.lifeSacrificePatk += Number(entry.valueNum || 0);
            }
            mods.maxHpFlat += Number(m.maxHpFlat || 0) * count;

            if (m.useValueAsMatkFlat && entry.valueNum !== null) {
                mods.matkFlat += Number(entry.valueNum);
            }

            if (m.autoGuard) mods.autoGuard = true;
            if (m.guardReady) mods.guardReady = true;
            if (m.blockDisabled) mods.blockDisabled = true;
            if (m.unblockable) mods.unblockable = true;
            if (m.initiativeFirst) mods.initiativeFirst = true;
            if (m.empowerMagic) {
                mods.empowerMagic = Math.max(
                    mods.empowerMagic,
                    Number(m.empowerMagic)
                );
            }
            if (m.applyBleedOnHit) mods.applyBleedOnHit = true;
            if (m.applyBlockSealOnHit) mods.applyBlockSealOnHit = true;

            if (m.consumeOnAttack) mods.consumeOnAttackKeys.push(statusKey);
            if (m.consumeOnDamage) mods.consumeOnDamageKeys.push(statusKey);
        }
    }

    mods.patkMult = Math.max(0, 1 + pct.patk);
    mods.matkMult = Math.max(0, 1 + pct.matk);
    mods.defenseMult = Math.max(0, 1 + pct.defense);
    mods.resistMult = Math.max(0, 1 + pct.resist);
    mods.damageMult = Math.max(0, 1 + pct.damage);
    mods.damageTakenMult = Math.max(0, 1 + pct.damageTaken);
    mods.dodgeMult = Math.max(0, 1 + pct.dodge);
    mods.maxHpMult = Math.max(0, 1 + pct.maxHp);
    mods.pct = pct;

    if (mods.lifeSacrifice) {
        mods.defenseMult = 0;
        mods.patkFlat += mods.lifeSacrificePatk;
    }

    return mods;
}

function effectiveStatValue(base, mult, flat = 0) {
    return Math.floor(Number(base) * Number(mult) + Number(flat || 0));
}

function effectiveStatsFromBuffs(row, buffs) {
    const mods = buffModifiers(buffs);
    const base = {
        patk: Number(row.patk),
        matk: Number(row.matk),
        defense: Number(row.defense),
        resist: Number(row.resist),
        hitRate: Number(row.hit_rate),
        dodge: Number(row.dodge),
        crit: Number(row.crit),
        critDamageBonus: Number(row.crit_damage_bonus || 0),
        speed: Number(row.speed),
        blockRate: Number(row.block_rate || 0),
        maxHp: Number(row.max_hp)
    };

    const patk = effectiveStatValue(base.patk, mods.patkMult, mods.patkFlat);
    const matk = effectiveStatValue(base.matk, mods.matkMult, mods.matkFlat);
    const defense = effectiveStatValue(base.defense, mods.defenseMult, mods.defenseFlat);
    const resist = effectiveStatValue(base.resist, mods.resistMult, mods.resistFlat);
    const hitRate = Math.floor(base.hitRate + mods.hitFlat);
    const dodge = effectiveStatValue(base.dodge, mods.dodgeMult, mods.dodgeFlat);
    const crit = Math.floor(base.crit + mods.critFlat);
    const critDamageBonus = base.critDamageBonus + mods.critDamageFlat;
    const speed = Math.floor(base.speed + mods.speedFlat);
    const blockRate = clamp(base.blockRate + mods.blockFlat, 0, 75);
    const maxHp = effectiveStatValue(base.maxHp, mods.maxHpMult, mods.maxHpFlat);

    return {
        patk,
        matk,
        defense,
        resist,
        hitRate,
        dodge,
        crit,
        critDamageBonus,
        speed,
        blockRate,
        maxHp,
        patkDelta: patk - base.patk,
        matkDelta: matk - base.matk,
        defenseDelta: defense - base.defense,
        resistDelta: resist - base.resist,
        hitRateDelta: hitRate - base.hitRate,
        dodgeDelta: dodge - base.dodge,
        critDelta: crit - base.crit,
        critDamageBonusDelta: critDamageBonus - base.critDamageBonus,
        speedDelta: speed - base.speed,
        blockRateDelta: blockRate - base.blockRate,
        maxHpDelta: maxHp - base.maxHp,
        damageMult: mods.damageMult,
        damageTakenMult: mods.damageTakenMult,
        canAutoGuard: mods.autoGuard,
        guardReady: mods.guardReady,
        blockDisabled: mods.blockDisabled,
        initiativeFirst: mods.initiativeFirst
    };
}

async function applyBuffToCharacters(client, characterIds, buffKey, {
    sourceSkillKey = null,
    sourceCharacterId = null,
    expiresRound = null,
    valueNum = null,
    sourceSnapshot = null
} = {}) {
    const uniqueIds = [...new Set((characterIds || []).map(Number).filter(Boolean))];
    if (!uniqueIds.length) return 0;

    const grants = [...expandStatusGrants(buffKey)];
    if (!grants.length && typeof buffKey === 'string') {
        // Direct mod key with explicit value_num
        if (combat.isModKey(buffKey) && valueNum != null) {
            const parsed = combat.parseModKey(buffKey);
            const result = await combat.applyStatMod(client, uniqueIds, {
                ...parsed,
                value: valueNum,
                sourceSkillKey,
                sourceCharacterId,
                expiresRound
            });
            return result.applied;
        }
        if (lookupBuff(buffKey, valueNum)) {
            grants.push(buffKey);
        }
    }
    if (!grants.length) return 0;

    let applied = 0;
    for (const grant of grants) {
        const modSpec = combat.grantToModSpec(grant);
        if (modSpec) {
            const grantSnap = (grant && typeof grant === 'object' && grant.consumeOnDamage)
                ? { ...(sourceSnapshot || {}), consumeOnDamage: true }
                : sourceSnapshot;
            const result = await combat.applyStatMod(client, uniqueIds, {
                ...modSpec,
                sourceSkillKey,
                sourceCharacterId,
                expiresRound,
                sourceSnapshot: grantSnap
            });
            applied += result.applied;
            continue;
        }

        if (typeof grant === 'string' && combat.isLegacyStatKey(grant)) {
            const legacy = combat.legacyStatKeyToMod(grant);
            const result = await combat.applyStatMod(client, uniqueIds, {
                ...legacy,
                sourceSkillKey,
                sourceCharacterId,
                expiresRound
            });
            applied += result.applied;
            continue;
        }

        if (typeof grant === 'string' && combat.isModKey(grant)) {
            if (valueNum == null) continue;
            const parsed = combat.parseModKey(grant);
            const result = await combat.applyStatMod(client, uniqueIds, {
                ...parsed,
                value: valueNum,
                sourceSkillKey,
                sourceCharacterId,
                expiresRound
            });
            applied += result.applied;
            continue;
        }

        const statusKey = typeof grant === 'string' ? grant : null;
        if (!statusKey) continue;
        const definition = lookupBuff(statusKey, valueNum);
        if (!definition || definition.parametric) continue;

        let snapshot = sourceSnapshot;
        let rowValue = valueNum;
        if (!snapshot && sourceCharacterId && combat.isTickStatus(statusKey)) {
            const magic = await sourceEffectiveMagic(client, sourceCharacterId);
            const equipped = await getEquippedSkillKeys(client, sourceCharacterId);
            const src = await client.query(
                'SELECT crit, crit_damage_bonus FROM characters WHERE id = $1',
                [sourceCharacterId]
            );
            snapshot = {
                tickBase: combat.tickBaseAmount(magic, statusKey),
                crit: Number(src.rows[0]?.crit || 0),
                critDamageBonus: Number(src.rows[0]?.crit_damage_bonus || 0),
                hasNeedle: combat.hasNeedleCrit(equipped)
            };
            if (rowValue == null && combat.statusTick(statusKey).kind === 'hp_loss') {
                rowValue = snapshot.tickBase;
            }
        }

        await client.query(`
            INSERT INTO character_buffs (
                character_id, buff_key, source_skill_key,
                source_character_id, expires_round,
                stack_count, value_num, source_snapshot
            )
            SELECT
                unnest($1::int[]),
                $2, $3, $4, $5,
                1, $6, $8::jsonb
            ON CONFLICT (character_id, buff_key)
            DO UPDATE SET
                source_skill_key = EXCLUDED.source_skill_key,
                source_character_id = EXCLUDED.source_character_id,
                expires_round = EXCLUDED.expires_round,
                stack_count = CASE
                    WHEN $7::boolean THEN character_buffs.stack_count + 1
                    ELSE 1
                END,
                value_num = EXCLUDED.value_num,
                source_snapshot = EXCLUDED.source_snapshot,
                created_at = NOW()
        `, [
            uniqueIds,
            statusKey,
            sourceSkillKey,
            sourceCharacterId,
            expiresRound,
            rowValue,
            definition.stackable === true,
            JSON.stringify(snapshot || {})
        ]);
        applied += uniqueIds.length;
    }

    return applied;
}

async function applyStatusBundle(client, characterIds, statusKeys, options = {}) {
    let total = 0;
    for (const key of statusKeys || []) {
        total += await applyBuffToCharacters(client, characterIds, key, options);
    }
    return total;
}

async function removeBuffKeys(client, characterId, buffKeys) {
    const keys = [...new Set((buffKeys || []).filter(Boolean))];
    if (!keys.length) return;

    await client.query(`
        DELETE FROM character_buffs
        WHERE character_id = $1
          AND buff_key = ANY($2::text[])
    `, [characterId, keys]);
}

async function sameRowCharacterIds(client, anchorCharacterId, {
    kind = null,
    includeAnchor = true
} = {}) {
    const anchor = await client.query(`
        SELECT c.group_id, c.row_index
        FROM cells c
        WHERE c.occupied_by = $1
        LIMIT 1
    `, [anchorCharacterId]);

    if (!anchor.rows.length) return includeAnchor ? [anchorCharacterId] : [];

    const params = [
        anchor.rows[0].group_id,
        anchor.rows[0].row_index
    ];

    let kindClause = '';
    if (kind) {
        params.push(kind);
        kindClause = `AND ch.kind = $${params.length}`;
    }

    const result = await client.query(`
        SELECT ch.id
        FROM cells c
        JOIN characters ch ON ch.id = c.occupied_by
        WHERE c.group_id = $1
          AND c.row_index = $2
          ${kindClause}
        ORDER BY c.col_index, ch.id
    `, params);

    const ids = result.rows.map(row => Number(row.id));
    return includeAnchor
        ? ids
        : ids.filter(id => id !== Number(anchorCharacterId));
}


async function getCharacterPosition(client, characterId) {
    const result = await client.query(`
        SELECT
            c.id AS cell_id,
            c.group_id,
            c.row_index,
            c.col_index,
            g.rows,
            g.cols,
            g.world_x,
            g.world_y,
            g.cell_size
        FROM cells c
        JOIN grid_groups g ON g.id = c.group_id
        WHERE c.occupied_by = $1
        LIMIT 1
    `, [characterId]);

    if (!result.rows.length) return null;

    const row = result.rows[0];
    return {
        cellId: Number(row.cell_id),
        groupId: Number(row.group_id),
        row: Number(row.row_index),
        col: Number(row.col_index),
        rows: Number(row.rows),
        cols: Number(row.cols),
        worldX: Number(row.world_x),
        worldY: Number(row.world_y),
        cellSize: Number(row.cell_size),
        centerX: Number(row.world_x) + (Number(row.col_index) + 0.5) * Number(row.cell_size),
        centerY: Number(row.world_y) + (Number(row.row_index) + 0.5) * Number(row.cell_size)
    };
}

/**
 * Position helpers live in lib/combat/world-geometry.js
 * (shared by 魂靈風息 / 絆腳).
 */

async function swapCharacterPositions(client, firstCharacterId, secondCharacterId) {
    if (Number(firstCharacterId) === Number(secondCharacterId)) {
        throw new Error('error');
    }

    const result = await client.query(`
        SELECT id, occupied_by
        FROM cells
        WHERE occupied_by = ANY($1::int[])
        ORDER BY id
        FOR UPDATE
    `, [[Number(firstCharacterId), Number(secondCharacterId)]]);

    const firstCell = result.rows.find(
        row => Number(row.occupied_by) === Number(firstCharacterId)
    );
    const secondCell = result.rows.find(
        row => Number(row.occupied_by) === Number(secondCharacterId)
    );

    if (!firstCell || !secondCell) {
        throw new Error('error');
    }

    await client.query(
        'UPDATE cells SET occupied_by = NULL WHERE id = ANY($1::int[])',
        [[Number(firstCell.id), Number(secondCell.id)]]
    );

    await client.query(
        `UPDATE cells
         SET occupied_by = CASE
             WHEN id = $1 THEN $2
             WHEN id = $3 THEN $4
         END
         WHERE id IN ($1, $3)`,
        [
            Number(firstCell.id), Number(secondCharacterId),
            Number(secondCell.id), Number(firstCharacterId)
        ]
    );

    return {
        firstCellId: Number(firstCell.id),
        secondCellId: Number(secondCell.id)
    };
}

async function resolveAttackTargetIds(client, actor, target, skill, requestedDirection = null) {
    const shape = skill.targetShape || '';
    const enemyKind = target.kind || (actor.kind === 'enemy' ? 'player' : 'enemy');

    if (shape === 'ALL_ENEMIES' || skill.targetCode === 'ALL_ENEMIES') {
        const result = await client.query(
            'SELECT id FROM characters WHERE kind <> $1 AND hp > 0 ORDER BY id',
            [actor.kind || 'player']
        );
        return result.rows.map(row => Number(row.id));
    }

    const targetPos = await getCharacterPosition(client, target.id);
    const actorPos = await getCharacterPosition(client, actor.id);

    if (!targetPos) return [Number(target.id)];

    if (shape === 'ROW' || skill.targetCode === 'ENEMY_ROW') {
        const result = await client.query(`
            SELECT ch.id
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.row_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY c.col_index, ch.id
        `, [targetPos.groupId, targetPos.row, enemyKind]);
        return result.rows.map(row => Number(row.id));
    }

    if (shape === 'ROW_ADJACENT_2') {
        const result = await client.query(`
            SELECT ch.id, c.col_index
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.row_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY ABS(c.col_index - $4), c.col_index, ch.id
        `, [targetPos.groupId, targetPos.row, enemyKind, targetPos.col]);

        const rows = result.rows;
        const anchorIndex = rows.findIndex(row => Number(row.id) === Number(target.id));
        if (anchorIndex < 0) return [Number(target.id)];

        const anchorCol = Number(rows[anchorIndex].col_index);
        const adjacent = rows
            .filter(row => Number(row.id) !== Number(target.id))
            .filter(row => Math.abs(Number(row.col_index) - anchorCol) === 1)
            .sort((a, b) =>
                Math.abs(Number(a.col_index) - anchorCol) -
                Math.abs(Number(b.col_index) - anchorCol)
            )[0];

        return adjacent
            ? [Number(target.id), Number(adjacent.id)]
            : [Number(target.id)];
    }

    if (shape === 'COLUMN_ADJACENT_2') {
        const result = await client.query(`
            SELECT ch.id, c.row_index
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.col_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY ABS(c.row_index - $4), c.row_index, ch.id
        `, [targetPos.groupId, targetPos.col, enemyKind, targetPos.row]);

        const rows = result.rows;
        const adjacent = rows
            .filter(row => Number(row.id) !== Number(target.id))
            .filter(row => Math.abs(Number(row.row_index) - targetPos.row) === 1)[0];

        return adjacent
            ? [Number(target.id), Number(adjacent.id)]
            : [Number(target.id)];
    }

    if (shape === 'FORWARD_COLUMN') {
        const column = actorPos ? actorPos.col : targetPos.col;
        const result = await client.query(`
            SELECT ch.id
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.col_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY c.row_index, ch.id
        `, [targetPos.groupId, column, enemyKind]);

        const ids = result.rows.map(row => Number(row.id));
        return ids.length ? ids : [Number(target.id)];
    }

// 魂之風息：直線指定 / 前/後/左右；共用座標正交射線判定（可跨 grid_group）
    if (shape === 'ORTHOGONAL_LINE' && actorPos) {
        const direction = String(requestedDirection || '').toUpperCase();
        if (!['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(direction)) {
            return [Number(actor.id)];
        }

        const result = await client.query(`
            SELECT
                ch.id,
                g.world_x,
                g.world_y,
                g.cell_size,
                c.row_index,
                c.col_index
            FROM cells c
            JOIN grid_groups g ON g.id = c.group_id
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE ch.hp > 0 OR ch.id = $1
            ORDER BY ch.id
        `, [actor.id]);

        const ids = [Number(actor.id)];

        for (const row of result.rows) {
            const characterId = Number(row.id);
            if (characterId === Number(actor.id)) continue;

            const cellSize = Number(row.cell_size);
            const otherPos = {
                cellSize,
                centerX: Number(row.world_x) + (Number(row.col_index) + 0.5) * cellSize,
                centerY: Number(row.world_y) + (Number(row.row_index) + 0.5) * cellSize
            };

            if (combat.isOnOrthogonalRay(actorPos, otherPos, direction)) {
                ids.push(characterId);
            }
        }

        return [...new Set(ids)];
    }

    return [Number(target.id)];
}

function isMainActionSkill(skill) {
    return combat.isWaitSkill(skill) || String(skill.timing || '').includes('主動');
}

function isAuxiliarySkill(skill) {
    return !isMainActionSkill(skill) && /SP/i.test(String(skill.cost || ''));
}

function statusExpiresRound(buffKey, currentRound) {
    const def = lookupBuff(buffKey) || { duration: { type: 'round_end' } };
    return combat.statusExpiresRound(def, currentRound);
}

async function getCharacterBuffEntries(client, characterId) {
    const result = await client.query(`
        SELECT
            character_id,
            buff_key,
            source_character_id,
            source_skill_key,
            stack_count,
            value_num,
            expires_round,
            source_snapshot
        FROM character_buffs
        WHERE character_id = $1
        ORDER BY id
    `, [characterId]);
    return result.rows;
}

async function sourceEffectiveMagic(client, sourceCharacterId) {
    if (!sourceCharacterId) return 0;

    const characterResult = await client.query(
        'SELECT * FROM characters WHERE id = $1',
        [sourceCharacterId]
    );
    if (!characterResult.rows.length) return 0;

    const entries = await getCharacterBuffEntries(client, sourceCharacterId);
    const mods = buffModifiers(entries);
    const source = characterResult.rows[0];

    return Math.max(
        0,
        Math.floor(Number(source.matk) * mods.matkMult + mods.matkFlat)
    );
}

async function getEquippedSkillKeys(client, characterId) {
    const result = await client.query(
        'SELECT skill_key FROM character_skills WHERE character_id = $1',
        [characterId]
    );
    return new Set(result.rows.map(row => row.skill_key));
}

async function applyDirectHpLoss(client, characterId, amount, {
    allowNegative = null
} = {}) {
    const loss = Math.max(0, Math.floor(Number(amount) || 0));
    if (!loss) return { oldHp: null, newHp: null, loss: 0, duelPrevented: 0 };

    const characterResult = await client.query(
        'SELECT id, hp FROM characters WHERE id = $1 FOR UPDATE',
        [characterId]
    );
    if (!characterResult.rows.length) return { oldHp: null, newHp: null, loss: 0, duelPrevented: 0 };

    const oldHp = Number(characterResult.rows[0].hp);
    const buffs = await getCharacterBuffEntries(client, characterId);
    const hasDuel = buffs.some(row => row.buff_key === 'duel');
    const equipped = await getEquippedSkillKeys(client, characterId);
    const hasGritPassive = allowNegative === true
        ? true
        : allowNegative === false
            ? false
            : combat.hasGrit(equipped);
    const floorHp = combat.hpFloorAfterDamage({
        hasDuel,
        hasGritPassive
    });
    const newHp = floorHp === Number.NEGATIVE_INFINITY
        ? oldHp - loss
        : Math.max(floorHp, oldHp - loss);
    const actualLoss = Math.max(0, oldHp - newHp);

    await client.query(
        'UPDATE characters SET hp = $1 WHERE id = $2',
        [newHp, characterId]
    );

    return {
        oldHp,
        newHp,
        loss: actualLoss,
        duelPrevented: Math.max(0, loss - actualLoss),
        gritActive: hasGritPassive && newHp <= 0
    };
}

async function getAdjacentEmptyCells(client, characterId) {
    const pos = await getCharacterPosition(client, characterId);
    if (!pos) return [];

    const result = await client.query(`
        SELECT id, row_index, col_index
        FROM cells
        WHERE group_id = $1
          AND occupied_by IS NULL
          AND (
            (row_index = $2 AND ABS(col_index - $3) = 1) OR
            (col_index = $3 AND ABS(row_index - $2) = 1)
          )
        ORDER BY row_index, col_index
    `, [pos.groupId, pos.row, pos.col]);

    return result.rows.map(row => ({
        cellId: Number(row.id),
        row: Number(row.row_index),
        col: Number(row.col_index)
    }));
}

async function enrichReactionOptionsWithPicks(client, options, {
    sourceTargetId = null,
    sourceActorId = null,
    attackSkill = null
} = {}) {
    const enriched = [];

    for (const option of options || []) {
        // 絆腳等：攻擊者須在目標正上方（同座標上方，可跨 group）
        const reactionDef = combat.getReactionDef(
            combat.getSkillBehavior?.(option.skillKey) || { key: option.skillKey }
        );
        const positionFilter =
            option.meta?.positionFilter ||
            reactionDef?.positionFilter ||
            reactionDef?.match?.positionFilter ||
            null;
        if (positionFilter === 'attacker_directly_above') {
            const reactorPos = await getCharacterPosition(client, option.actorId);
            const attackerId = Number(
                option.meta?.originalActorId || sourceActorId || 0
            );
            const attackerPos = attackerId
                ? await getCharacterPosition(client, attackerId)
                : null;
            if (!combat.isWorldDirectlyAbove(attackerPos, reactorPos)) continue;
        }

        const needsPick = combat.resolvePickKind?.(option, reactionDef) ||
            option.needsPick ||
            option.meta?.needsPick ||
            reactionDef?.pick?.kind ||
            null;
        const next = {
            ...option,
            pick: needsPick ? { kind: needsPick } : option.pick || null,
            needsPick,
            meta: {
                ...(option.meta || {}),
                needsPick,
                ...(positionFilter ? { positionFilter } : {})
            }
        };

        if (needsPick) {
            await combat.applyPickCatalog(needsPick, {
                client,
                option,
                next,
                sourceTargetId,
                sourceActorId,
                attackSkill,
                helpers: {
                    getAdjacentEmptyCells,
                    resolveAttackTargetIds,
                    ALL_EQUIPPABLE_SKILLS,
                    BUFF_CATALOG
                }
            });
        }

        enriched.push(next);
    }

    return enriched;
}

async function resolveFollowUpAttack(client, {
    actor,
    targetId,
    multiplier = 0.5,
    damageType = '物理',
    ranged = false,
    skill = null
}) {
    const targetResult = await client.query(
        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
        [targetId]
    );
    const target = targetResult.rows[0];
    if (!target || Number(target.hp) <= 0) {
        throw new Error('追擊／後續攻擊目標無效');
    }

    const actorBuffs = await getCharacterBuffEntries(client, actor.id);
    const targetBuffs = await getCharacterBuffEntries(client, target.id);
    const actorMods = buffModifiers(actorBuffs);
    const targetMods = buffModifiers(targetBuffs);

    const profile = combat.createAttackProfile({
        attacker: actor,
        defender: target,
        attackerMods: actorMods,
        defenderMods: targetMods,
        defenderStatusKeys: targetBuffs.map(row => row.buff_key)
    });

    const outcome = combat.resolveSegment(profile, { multiplier, damageType });

    let loss = 0;
    let newHp = Number(target.hp);
    if (outcome.hit) {
        const applied = await applyDirectHpLoss(client, target.id, outcome.damage);
        loss = applied.loss;
        newHp = applied.newHp;
    }

    const rangeLabel = ranged ? '遠程' : '近戰';
    const hitLabel = outcome.critical ? '暴擊' : '命中';
    const blockLabel = outcome.blocked ? `被格擋${outcome.blockRate}%` : '';

    return {
        reactionText:
            `${actor.name} 發動「${skill?.name || '後續攻擊'}」→ ${target.name}` +
            `（${rangeLabel}【${multiplier}${damageType}】）` +
            (outcome.hit
                ? `：${hitLabel}${blockLabel}，造成 ${loss} 傷害（HP${newHp}）`
                : `：未命中（骰 ${outcome.roll}）`),
        charactersChanged: loss > 0,
        hit: outcome.hit,
        loss
    };
}


async function applyReturnReroll(client, {
    actor,
    window,
    missedSegments = []
}) {
    const targetId = Number(
        window.sourceTargetId ||
        window.context?.targetId ||
        window.resumePayload?.targetId ||
        0
    );
    if (!targetId) {
        return {
            reactionText: `${actor.name} 發動「回返」，但找不到攻擊目標。`,
            charactersChanged: false
        };
    }

    const targetResult = await client.query(
        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
        [targetId]
    );
    const target = targetResult.rows[0];
    if (!target) {
        return {
            reactionText: `${actor.name} 發動「回返」，但目標已不存在。`,
            charactersChanged: false
        };
    }

    const actorBuffs = await getCharacterBuffEntries(client, actor.id);
    const targetBuffs = await getCharacterBuffEntries(client, target.id);
    const actorMods = buffModifiers(actorBuffs);
    const targetMods = buffModifiers(targetBuffs);

    const profile = combat.createAttackProfile({
        attacker: actor,
        defender: target,
        attackerMods: actorMods,
        defenderMods: targetMods,
        defenderStatusKeys: targetBuffs.map(row => row.buff_key)
    });

    const segments = missedSegments.length
        ? missedSegments
        : [{ segment: 1, damageType: '物理', multiplier: 1 }];

    const lines = [];
    let charactersChanged = false;
    let totalLoss = 0;

    for (const seg of segments) {
        const packet = {
            damageType: seg.damageType || '物理',
            multiplier: Number(seg.multiplier || seg.packetMultiplier || 1)
        };
        const outcome = combat.resolveSegment(profile, packet);
        const label = `第${seg.segment || '?'}段回返`;

        if (!outcome.hit) {
            lines.push(`${label}：骰 ${outcome.roll} 仍未命中`);
            continue;
        }

        const applied = await applyDirectHpLoss(client, target.id, outcome.damage);
        totalLoss += applied.loss;
        charactersChanged = charactersChanged || applied.loss > 0;

        const hitLabel = outcome.critical ? '暴擊' : '命中';
        const blockLabel = outcome.blocked ? `被格擋${outcome.blockRate}%` : '';
        lines.push(
            `${label}：骰 ${outcome.roll} ${hitLabel}${blockLabel}，造成 ${applied.loss} 傷害`
        );
    }

    return {
        reactionText:
            `${actor.name} 發動「回返」→ ${target.name}\n` +
            (lines.join('\n') || '沒有可重擲的未命中段'),
        charactersChanged,
        flags: { returnRerollApplied: true, returnRerollLoss: totalLoss }
    };
}


async function applyDebuffBundle(client, characterIds, buffKeys, {
    sourceSkillKey = null,
    sourceCharacterId = null,
    currentRound = 1
} = {}) {
    const ids = [...new Set((characterIds || []).map(Number).filter(Boolean))];
    const grants = [...new Set(
        (buffKeys || []).flatMap(key => expandStatusGrants(key))
    )];

    const result = {
        applied: [],
        protected: [],
        resisted: []
    };

    for (const characterId of ids) {
        if (!grants.length) continue;

        const hasDebuff = grants.some(grant => {
            if (typeof grant === 'object' && grant.type === 'mod') {
                return Number(grant.value) < 0;
            }
            if (typeof grant === 'string') {
                const def = lookupBuff(grant);
                return def?.kind === 'debuff';
            }
            return false;
        });

        if (hasDebuff) {
            const sanctuary = await client.query(`
                SELECT id
                FROM character_buffs
                WHERE character_id = $1
                  AND buff_key = 'sanctuary'
                LIMIT 1
            `, [characterId]);

            if (sanctuary.rows.length) {
                await removeBuffKeys(client, characterId, ['sanctuary']);
                result.protected.push(characterId);
                continue;
            }
        }

        for (const grant of grants) {
            if (typeof grant === 'object' && grant.type === 'mod') {
                await applyBuffToCharacters(
                    client,
                    [characterId],
                    grant,
                    {
                        sourceSkillKey,
                        sourceCharacterId,
                        expiresRound: currentRound
                    }
                );
                result.applied.push({
                    characterId,
                    key: combat.modKey(grant.stat, grant.mode),
                    value: grant.value
                });
                continue;
            }

            const key = typeof grant === 'string' ? grant : null;
            if (!key) continue;
            const definition = lookupBuff(key);
            if (!definition) continue;

            if (definition.resistance) {
                const prior = await client.query(`
                    SELECT 1
                    FROM status_resistances
                    WHERE character_id = $1
                      AND status_key = $2
                `, [characterId, key]);

                if (prior.rows.length) {
                    result.resisted.push({ characterId, key });
                    continue;
                }
            }

            await applyBuffToCharacters(
                client,
                [characterId],
                key,
                {
                    sourceSkillKey,
                    sourceCharacterId,
                    expiresRound: statusExpiresRound(key, currentRound)
                }
            );

            if (definition.resistance) {
                await client.query(`
                    INSERT INTO status_resistances (character_id, status_key)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                `, [characterId, key]);
            }

            result.applied.push({ characterId, key });
        }
    }

    return result;
}

/** On-hit status grants from skill registry / catalog (mods + atomics). */
function onHitStatusGrants(skill) {
    if (!skill || skill.actionCode !== 'ATTACK') return [];
    // Per-packet sequences are applied separately via attack_segment.onHitPerPacket.
    if (combat.onHitPerPacket(skill)) return [];
    // Self-buff-after-attack skills skip target on-hit grants.
    if (combat.afterAttackSelf(skill)?.length) return [];
    return statusesForSkill(skill).filter(grant => {
        if (typeof grant === 'object' && grant.type === 'mod') {
            return Number(grant.value) < 0;
        }
        if (typeof grant === 'string') {
            return isDebuffStatus(grant) || isAbnormalStatus(grant);
        }
        return false;
    });
}

async function enforceActionRestrictions(client, actor, skill, selectedTarget, requestedDirection = null) {
    // 擊倒（含根性負 HP）：無法發動任何主動／輔助戰技
    if (Number(actor.hp) <= 0) {
        throw new Error(`${actor.name} 已擊倒，無法發動戰技`);
    }

    const entries = await getCharacterBuffEntries(client, actor.id);
    const keys = new Set(entries.map(row => row.buff_key));

    if (keys.has('frozen') && isAuxiliarySkill(skill)) {
        throw new Error(`${actor.name} 處於【冰凍】，目前無法發動輔助戰技`);
    }

    if (keys.has('aux_seal') && isAuxiliarySkill(skill)) {
        throw new Error(`${actor.name} 處於【凍結】，無法發動輔助戰技`);
    }

    if (keys.has('charging')) {
        if (isAuxiliarySkill(skill)) {
            throw new Error(`${actor.name} 正在蓄力，無法發動輔助戰技`);
        }
    }

    if (!isMainActionSkill(skill)) return { consumeTaunt: false };

    const taunt = entries.find(row => row.buff_key === 'taunt');
    if (!taunt?.source_character_id) return { consumeTaunt: false };

    const sourceResult = await client.query(
        'SELECT * FROM characters WHERE id = $1',
        [taunt.source_character_id]
    );
    const source = sourceResult.rows[0];

    if (!source || Number(source.hp) <= 0 || (source.kind || 'player') === (actor.kind || 'player')) {
        await removeBuffKeys(client, actor.id, ['taunt']);
        return { consumeTaunt: false };
    }

    if (skill.actionCode !== 'ATTACK') {
        throw new Error(
            `${actor.name} 受到【嘲諷】：下一次主要行動必須盡可能攻擊 ${source.name}`
        );
    }

    const targetIds = await resolveAttackTargetIds(client, actor, selectedTarget, skill, requestedDirection);
    if (!targetIds.includes(Number(source.id))) {
        throw new Error(
            `${actor.name} 受到【嘲諷】：本次攻擊必須包含 ${source.name}`
        );
    }

    return { consumeTaunt: true };
}

async function triggerActionStatuses(client, actor, skill, currentRound) {
    const entries = await getCharacterBuffEntries(client, actor.id);
    const lines = [];
    let changed = false;

    const tickAmount = async (entry) => {
        const magic = await sourceEffectiveMagic(client, entry.source_character_id);
        return combat.tickAmountFromEntry(entry, { sourceMagic: magic });
    };

    const triggerLoss = async (entry, tick) => {
        const result = await applyDirectHpLoss(
            client,
            actor.id,
            await tickAmount(entry)
        );
        if (result.loss > 0) {
            lines.push(`${tick.label}：${actor.name} 損失 ${result.loss} HP`);
            changed = true;
        }
    };

    const triggerHeal = async (entry, tick) => {
        const heal = await tickAmount(entry);
        const currentResult = await client.query(
            'SELECT hp, max_hp FROM characters WHERE id = $1 FOR UPDATE',
            [actor.id]
        );
        if (!currentResult.rows.length) return;

        const oldHp = Number(currentResult.rows[0].hp);
        const maxHp = Number(currentResult.rows[0].max_hp);
        const newHp = Math.min(maxHp, oldHp + heal);
        const actualHeal = Math.max(0, newHp - oldHp);

        if (actualHeal > 0) {
            await client.query(
                'UPDATE characters SET hp = $1 WHERE id = $2',
                [newHp, actor.id]
            );
            lines.push(`${tick.label}：${actor.name} 恢復 ${actualHeal} HP`);
            changed = true;
        }
    };

    // Which ticks this action triggers, by the shape of the skill rather than by
    // the ActionContext flags the timing bus uses.
    const triggeredKeys = [
        isMainActionSkill(skill) ? 'poison' : null,
        isAuxiliarySkill(skill) ? 'burning' : null,
        String(skill.timing || '').includes('主動') ? 'regeneration' : null
    ].filter(Boolean);

    for (const statusKey of triggeredKeys) {
        const tick = combat.statusTick(statusKey);
        const entry = entries.find(row => row.buff_key === statusKey);
        if (!entry) continue;

        if (tick.kind === 'heal') {
    // DoTs need a source to scale from; fall back to a 1 HP tick.
            if (entry.source_character_id) await triggerHeal(entry, tick);
        } else {
            await triggerLoss(entry, tick);
        }
    }

    return { lines, changed };
}

async function resolveTurnStartStatuses(client, actorId, clock) {
    const characterResult = await client.query(
        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
        [actorId]
    );
    if (!characterResult.rows.length) {
        return { skipTurn: false, events: [], messages: [], charactersChanged: false };
    }

    const actor = characterResult.rows[0];
    const entries = await getCharacterBuffEntries(client, actorId);
    const keys = new Set(entries.map(row => row.buff_key));
    const events = [];
    const messages = [];
    let changed = false;
    let skipTurn = false;

    const equipped = await getEquippedSkillKeys(client, actorId);
    if (combat.hasGrit(equipped) && Number(actor.hp) <= 0) {
        await client.query(
            'UPDATE characters SET hp = $1 WHERE id = $2',
            [0, actorId]
        );
        changed = true;
        skipTurn = true;
        const content =
            `【扎根】：${actor.name} 於回合開始時 HP 為 0，陷入擊倒。`;
        events.push(await insertBattleEvent(client, {
            eventType: 'status_trigger',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId,
            content
        }));
        messages.push(await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'status',
            characterId: actorId,
            characterName: actor.name,
            characterKind: actor.kind || 'player',
            content,
            payload: { statusKey: 'grit_ko' }
        }));
        return { skipTurn, events, messages, charactersChanged: changed };
    }

    if (Number(actor.hp) <= 0) {
        skipTurn = true;
    }

    if (keys.has('frozen')) {
        await removeBuffKeys(client, actorId, ['frozen']);
        changed = true;
        events.push(await insertBattleEvent(client, {
            eventType: 'status_end',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId,
            content: `${actor.name} 的【冰凍】在回合開始時解除。`
        }));
    }

    if (keys.has('feign_death') && Number(actor.hp) <= 0) {
        await client.query(
            'UPDATE characters SET hp = LEAST(max_hp, 1) WHERE id = $1',
            [actorId]
        );
        await removeBuffKeys(client, actorId, ['feign_death']);
        changed = true;

        const content = `【假死】發動：${actor.name} 於回合開始時恢復到 1 HP。`;
        events.push(await insertBattleEvent(client, {
            eventType: 'status_trigger',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId,
            content
        }));
        messages.push(await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'status',
            characterId: actorId,
            characterName: actor.name,
            characterKind: actor.kind || 'player',
            content,
            payload: { statusKey: 'feign_death' }
        }));
    }

    if (keys.has('stun')) {
        await removeBuffKeys(client, actorId, ['stun']);
        changed = true;
        skipTurn = true;

        const content = `【暈厥】發動：${actor.name} 的本回合被跳過。`;
        events.push(await insertBattleEvent(client, {
            eventType: 'status_trigger',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId,
            content
        }));
        messages.push(await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'status',
            characterId: actorId,
            characterName: actor.name,
            characterKind: actor.kind || 'player',
            content,
            payload: { statusKey: 'stun', skipTurn: true }
        }));
    }

    return { skipTurn, events, messages, charactersChanged: changed };
}


async function findUsableTurnActor(client, combatants, startIndex, round, turnPass) {
    if (!combatants.length) {
        return {
            actorId: null,
            index: -1,
            turnPass,
            statusEvents: [],
            statusMessages: [],
            charactersChanged: false
        };
    }

    let index = ((startIndex % combatants.length) + combatants.length) % combatants.length;
    let pass = turnPass;
    const statusEvents = [];
    const statusMessages = [];
    let charactersChanged = false;

    // 一整輪若全部被暈厥，暈厥會各自消耗；第二圈就能找到可行動者。
    const limit = Math.max(1, combatants.length * 2 + 1);

    for (let attempt = 0; attempt < limit; attempt++) {
        const actorId = combatants[index].id;
        const status = await resolveTurnStartStatuses(
            client,
            actorId,
            { round, turnPass: pass }
        );

        statusEvents.push(...status.events);
        statusMessages.push(...status.messages);
        charactersChanged ||= status.charactersChanged;

        if (!status.skipTurn) {
            return {
                actorId,
                index,
                turnPass: pass,
                statusEvents,
                statusMessages,
                charactersChanged
            };
        }

        index += 1;
        if (index >= combatants.length) {
            index = 0;
            pass += 1;
        }
    }

    return {
        actorId: combatants[index].id,
        index,
        turnPass: pass,
        statusEvents,
        statusMessages,
        charactersChanged
    };
}

async function autoRecipientIds(client, actor, target, skill) {
    const side = actor.kind || 'player';
    const code = skill.targetCode || 'SELF';
    const recipients = combat.recipientsSpec(skill);

    if (recipients?.mode === 'same_row') {
        let ids = await sameRowCharacterIds(client, actor.id, {
            kind: side,
            includeAnchor: true
        });
        if (!ids.length) ids = [Number(actor.id)];
        if (recipients.excludeSelf) {
            ids = ids.filter(id => id !== Number(actor.id));
        }
        return ids;
    }

    if (recipients?.mode === 'all_allies' || code === 'ALL_ALLIES') {
        const result = await client.query(
            'SELECT id FROM characters WHERE kind = $1 ORDER BY id',
            [side]
        );
        let ids = result.rows.map(row => Number(row.id));
        if (recipients?.excludeSelf) {
            ids = ids.filter(id => id !== Number(actor.id));
        }
        return ids;
    }

    if (recipients?.mode === 'self' || combat.applySelfStatus(skill)) {
        return [Number(actor.id)];
    }

    if (code === 'ALLY_ROW') {
        const anchorId = target?.id || actor.id;
        let ids = await sameRowCharacterIds(client, anchorId, {
            kind: side,
            includeAnchor: true
        });

        if (!ids.length) ids = [Number(anchorId)];
        if (recipients?.excludeSelf) {
            ids = ids.filter(id => id !== Number(actor.id));
        }

        return ids;
    }

    if (code === 'ALL_ENEMIES') {
        const result = await client.query(
            'SELECT id FROM characters WHERE kind <> $1 AND hp > 0 ORDER BY id',
            [side]
        );
        return result.rows.map(row => Number(row.id));
    }

    if (code === 'ENEMY_ROW') {
        const ids = await sameRowCharacterIds(client, target.id, {
            kind: target.kind || 'enemy',
            includeAnchor: true
        });
        return ids.length ? ids : [Number(target.id)];
    }

    if (code === 'SELF') return [Number(actor.id)];
    return [Number(target.id)];
}

function autoBuffForSkill(skill) {
    const keys = statusesForSkill(skill);
    return keys.length ? keys : null;
}

function skillBuffExpiresRound(skill, currentRound) {
    const text = String(skill?.effect || '');
    if (text.includes('整場戰鬥') || text.includes('永久')) return null;

    const grants = statusesForSkill(skill);
    for (const grant of grants) {
        if (typeof grant === 'string') {
            return statusExpiresRound(grant, currentRound);
        }
    }
    return combat.statusExpiresRound({ duration: { type: 'round_end' } }, currentRound);
}


function mapCharacter(row, buffs = [], equippedSkills = []) {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind || 'player',
        hp: Number(row.hp),
        maxHp: Number(row.max_hp),
        ap: Number(row.ap),
        maxAp: Number(row.max_ap),
        sp: Number(row.sp),
        maxSp: Number(row.max_sp),
        patk: row.patk,
        matk: row.matk,
        crit: row.crit,
        critDamageBonus: Number(row.crit_damage_bonus || 0),
        hitRate: row.hit_rate,
        dodge: row.dodge,
        speed: row.speed,
        defense: row.defense,
        resist: row.resist,
        blockRate: Number(row.block_rate || 0),
        image: row.image_path,
        profession: row.profession || '',
        skillSlots: Math.max(0, Number(row.skill_slots ?? 1)),
        reactionDefaultSkip: Boolean(row.reaction_default_skip),
        buffs,
        equippedSkills,
        effective: effectiveStatsFromBuffs(row, buffs)
    };
}

async function getBuffsByCharacterIds(characterIds) {
    const map = new Map();
    if (!characterIds.length) return map;

    const result = await pool.query(`
        SELECT
            character_id,
            buff_key,
            source_skill_key,
            source_character_id,
            expires_round,
            stack_count,
            value_num
        FROM character_buffs
        WHERE character_id = ANY($1::int[])
        ORDER BY id
    `, [characterIds]);

    const sourceIds = [
        ...new Set(
            result.rows
                .map(row => Number(row.source_character_id))
                .filter(Boolean)
        )
    ];
    const sourceNameById = new Map();
    if (sourceIds.length) {
        const sources = await pool.query(
            'SELECT id, name FROM characters WHERE id = ANY($1::int[])',
            [sourceIds]
        );
        for (const row of sources.rows) {
            sourceNameById.set(Number(row.id), row.name);
        }
    }

    for (const row of result.rows) {
        if (!map.has(row.character_id)) map.set(row.character_id, []);

        let sourceSkillName = null;
        if (row.source_skill_key) {
            const skill =
                SKILL_CATALOG[row.source_skill_key] ||
                ALL_EQUIPPABLE_SKILLS.get(row.source_skill_key);
            sourceSkillName = skill?.name || row.source_skill_key;
        }

        const sourceCharacterId = row.source_character_id === null
            ? null
            : Number(row.source_character_id);
        const sourceCharacterName = sourceCharacterId
            ? (sourceNameById.get(sourceCharacterId) || null)
            : null;

        const valueNum = row.value_num === null ? null : Number(row.value_num);
        const buff = lookupBuff(row.buff_key, valueNum);
        if (!buff) continue;

        map.get(row.character_id).push({
            ...buff,
            key: row.buff_key,
            dbKey: row.buff_key,
            sourceSkillKey: row.source_skill_key,
            sourceSkillName,
            sourceCharacterId,
            sourceCharacterName,
            expiresRound: row.expires_round === null ? null : Number(row.expires_round),
            stackCount: Math.max(1, Number(row.stack_count || 1)),
            valueNum
        });
    }

    return map;
}


async function getSkillsByCharacterIds(characterIds) {
    const map = new Map();
    if (!characterIds.length) return map;

    const result = await pool.query(`
        SELECT character_id, slot_index, skill_key
        FROM character_skills
        WHERE character_id = ANY($1::int[])
        ORDER BY character_id, slot_index
    `, [characterIds]);

    for (const row of result.rows) {
        const skill = ALL_EQUIPPABLE_SKILLS.get(row.skill_key);
        if (!skill) continue;

        if (!map.has(row.character_id)) map.set(row.character_id, []);
        map.get(row.character_id).push({
            slotIndex: row.slot_index,
            ...skill
        });
    }

    return map;
}

async function getCharacterById(characterId) {
    const result = await pool.query('SELECT * FROM characters WHERE id = $1', [characterId]);
    if (!result.rows.length) return null;
    const [buffsMap, skillsMap] = await Promise.all([
        getBuffsByCharacterIds([characterId]),
        getSkillsByCharacterIds([characterId])
    ]);
    return mapCharacter(
        result.rows[0],
        buffsMap.get(characterId) || [],
        skillsMap.get(characterId) || []
    );
}


function mapChatMessage(row) {
    return {
        id: Number(row.id),
        channel: row.channel,
        messageType: row.message_type,
        characterId: row.character_id,
        characterName: row.character_name,
        characterKind: row.character_kind,
        content: row.content,
        payload: row.payload || {},
        createdAt: row.created_at
    };
}

function mapBattleEvent(row) {
    return {
        id: Number(row.id),
        eventType: row.event_type,
        round: Number(row.round_number),
        turnPass: Number(row.turn_pass),
        actorId: row.actor_id,
        targetId: row.target_id,
        content: row.content,
        payload: row.payload || {},
        createdAt: row.created_at
    };
}

function battleClockLabel(round, turnPass) {
    return `第${round}輪－第${turnPass}回合`;
}

async function getBattleClock(db = pool, lock = false) {
    const result = await db.query(`
        SELECT round_number, turn_pass, current_character_id
        FROM battle_state
        WHERE id = 1
        ${lock ? 'FOR UPDATE' : ''}
    `);

    const row = result.rows[0] || {
        round_number: 1,
        turn_pass: 1,
        current_character_id: null
    };

    return {
        round: Number(row.round_number),
        turnPass: Number(row.turn_pass),
        currentCharacterId: row.current_character_id
    };
}

async function insertBattleEvent(db, {
    eventType,
    round,
    turnPass,
    actorId = null,
    targetId = null,
    content,
    payload = {}
}) {
    const result = await db.query(`
        INSERT INTO battle_events (
            event_type, round_number, turn_pass,
            actor_id, target_id, content, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING *
    `, [
        eventType,
        round,
        turnPass,
        actorId,
        targetId,
        content,
        JSON.stringify(payload)
    ]);

    return mapBattleEvent(result.rows[0]);
}

async function ensureBattleLogSeed() {
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM battle_events');
    if (Number(count.rows[0]?.count || 0) > 0) return;

    const clock = await getBattleClock();
    await insertBattleEvent(pool, {
        eventType: 'battle_start',
        round: clock.round,
        turnPass: clock.turnPass,
        content: '戰鬥開始'
    });
    await insertBattleEvent(pool, {
        eventType: 'phase',
        round: clock.round,
        turnPass: clock.turnPass,
        content: battleClockLabel(clock.round, clock.turnPass)
    });
}

function buildCombatState(round, turnPass, currentId, combatants) {
    if (!combatants.length) {
        return {
            round,
            turnPass,
            currentCharacterId: null,
            current: null,
            next: null,
            entersNextTurnPass: false,
            combatants
        };
    }

    let index = combatants.findIndex(character => character.id === currentId);
    if (index < 0) index = 0;

    const current = combatants[index];
    const next = combatants[(index + 1) % combatants.length];

    return {
        round,
        turnPass,
        currentCharacterId: current.id,
        current,
        next,
        entersNextTurnPass: index === combatants.length - 1,
        combatants
    };
}

async function insertChatMessage(db, {
    channel,
    messageType = 'text',
    characterId = null,
    characterName,
    characterKind = 'player',
    content,
    payload = {}
}) {
    const result = await db.query(`
        INSERT INTO chat_messages (
            channel, message_type, character_id, character_name,
            character_kind, content, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING *
    `, [
        channel,
        messageType,
        characterId,
        characterName,
        characterKind,
        content,
        JSON.stringify(payload)
    ]);

    return mapChatMessage(result.rows[0]);
}

async function getCombatants(db = pool) {
    const result = await db.query(`
        SELECT id, name, kind, speed, hp, max_hp, ap, max_ap, sp, max_sp, image_path,
               patk, matk, crit, crit_damage_bonus, hit_rate, dodge, defense, resist, block_rate
        FROM characters
        ORDER BY id ASC
    `);

    const ids = result.rows.map(row => row.id);
    const buffsMap = new Map();

    if (ids.length) {
        const buffResult = await db.query(`
            SELECT character_id, buff_key, stack_count, value_num
            FROM character_buffs
            WHERE character_id = ANY($1::int[])
        `, [ids]);

        for (const row of buffResult.rows) {
            if (!buffsMap.has(row.character_id)) buffsMap.set(row.character_id, []);
            buffsMap.get(row.character_id).push({
                key: row.buff_key,
                stackCount: Number(row.stack_count || 1),
                valueNum: row.value_num === null ? null : Number(row.value_num)
            });
        }
    }

    return result.rows
        .map(row => {
            const mods = buffModifiers(buffsMap.get(row.id) || []);
            return {
                id: row.id,
                name: row.name,
                kind: row.kind || 'player',
                speed: Math.floor(Number(row.speed) + mods.speedFlat),
                baseSpeed: Number(row.speed),
                hp: Number(row.hp),
                maxHp: Number(row.max_hp),
                ap: Number(row.ap),
                maxAp: Number(row.max_ap),
                sp: Number(row.sp),
                maxSp: Number(row.max_sp),
                blockRate: clamp(Number(row.block_rate || 0) + mods.blockFlat, 0, 75),
                initiativeFirst: mods.initiativeFirst,
                image: row.image_path
            };
        })
        .sort((a, b) =>
            Number(Boolean(b.initiativeFirst)) - Number(Boolean(a.initiativeFirst)) ||
            Number(b.speed) - Number(a.speed) ||
            Number(a.id) - Number(b.id)
        );
}

async function getCombatState(db = pool, lock = false) {
    const clock = await getBattleClock(db, lock);
    const combatants = await getCombatants(db);

    let currentId = clock.currentCharacterId;
    if (combatants.length && !combatants.some(character => character.id === currentId)) {
        currentId = combatants[0].id;
        await db.query(`
            UPDATE battle_state
            SET current_character_id = $1, updated_at = NOW()
            WHERE id = 1
        `, [currentId]);
    }

    return buildCombatState(clock.round, clock.turnPass, currentId, combatants);
}

async function resolvePendingActionsForActor(client, actorId, clock = null) {
    if (!actorId) return { messages: [], events: [], charactersChanged: false };

    const eventClock = clock || await getBattleClock(client);
    const { ready, progressed } = await combat.tickChargesForActor(client, actorId);

    const messages = [];
    const events = [];
    let charactersChanged = false;

    for (const row of progressed) {
        if (ready.some(item => Number(item.id) === Number(row.id))) continue;
        const content =
            `⏳ ${row.payload?.skillName || '戰技'} 蓄力中` +
            `（${row.charge_progress}/${row.charge_required}）`;
        messages.push(await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'status',
            characterId: actorId,
            characterName: (await client.query(
                'SELECT name, kind FROM characters WHERE id = $1',
                [actorId]
            )).rows[0]?.name || '角色',
            characterKind: 'player',
            content,
            payload: { charging: true, pendingId: row.id }
        }));
    }

    for (const pending of ready) {
        if (pending.skill_key === 'rescue' || pending.skill_key === 'initial:救援') {
            const target = await client.query(
                'SELECT name, hp, max_hp FROM characters WHERE id = $1 FOR UPDATE',
                [pending.target_id]
            );
            const actor = await client.query(
                'SELECT name, kind FROM characters WHERE id = $1',
                [actorId]
            );
            const t = target.rows[0];
            const a = actor.rows[0];
            let content;
            if (t && Number(t.hp) <= 0) {
                await client.query(
                    'UPDATE characters SET hp = LEAST(max_hp, 1) WHERE id = $1',
                    [pending.target_id]
                );
                content =
                    `【救援】成功\n${a.name} 完成救援。\n${t.name} HP 0 → 1`;
                charactersChanged = true;
            } else {
                content =
                    `【救援】失敗目標\n${t?.name || '目標'} 已不再是被擊倒狀態。`;
            }
            messages.push(await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: actorId,
                characterName: a?.name || '角色',
                characterKind: a?.kind || 'player',
                content,
                payload: { skillKey: pending.skill_key, resolved: true }
            }));
            events.push(await insertBattleEvent(client, {
                eventType: 'rescue',
                round: eventClock.round,
                turnPass: eventClock.turnPass,
                actorId,
                targetId: pending.target_id,
                content,
                payload: { skillKey: pending.skill_key, resolved: true }
            }));
        } else {
            // Generic charge complete ??keep pending for autoCast on this turn
            const actor = await client.query(
                'SELECT name, kind FROM characters WHERE id = $1',
                [actorId]
            );
            const a = actor.rows[0];
            const skillName = pending.payload?.skillName || pending.skill_key;
            messages.push(await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: actorId,
                characterName: a?.name || '角色',
                characterKind: a?.kind || 'player',
                content: `⏳ 蓄力完成：自動發動「${skillName}」`,
                payload: {
                    skillKey: pending.skill_key,
                    autoCast: true,
                    targetId: pending.target_id,
                    pendingId: pending.id
                }
            }));
            events.push({
                autoCast: true,
                skillKey: pending.skill_key,
                targetId: pending.target_id,
                pendingId: pending.id,
                actorId
            });
            // Do not clear pending here ??use-skill autoCast clears after firing
            continue;
        }

        await combat.clearCharge(client, pending.id);
        await removeBuffKeys(client, actorId, ['charging']);
        charactersChanged = true;
    }

    // Keep charging status while any pending remains
    const remaining = await combat.getActiveCharges(client, actorId);
    if (remaining.length) {
        await applyBuffToCharacters(client, [actorId], 'charging', {
            expiresRound: null,
            valueNum: remaining[0].charge_progress
        });
        charactersChanged = true;
    }

    return {
        messages,
        events,
        charactersChanged,
        autoCastQueue: events.filter(item => item.autoCast)
    };
}

async function broadcastCombatState() {
    const state = await getCombatState();
    io.emit('combat:state', state);
    return state;
}

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
        callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        if (!file.mimetype?.startsWith('image/')) {
            return callback(new Error('不允許的檔案類型'));
        }
        callback(null, true);
    }
});


app.get('/api/skills/catalog', (req, res) => {
    const profession = safeProfession(String(req.query.profession || ''));
    res.json({
        professions: SKILL_DATA.professions,
        initial: SKILL_DATA.initial,
        profession,
        professionSkills: profession
            ? (SKILL_DATA.professionSkills[profession] || [])
            : [],
        common: SKILL_DATA.common
    });
});

app.put('/api/characters/:id/skills/:slotIndex', async (req, res) => {
    const characterId = number(req.params.id);
    const slotIndex = Math.floor(number(req.params.slotIndex, -1));
    const skillKey = req.body.skillKey === null
        ? null
        : String(req.body.skillKey || '');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const characterResult = await client.query(
            'SELECT id, profession, skill_slots FROM characters WHERE id = $1 FOR UPDATE',
            [characterId]
        );

        if (!characterResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        const character = characterResult.rows[0];
        const requestedProfession = req.body.profession === undefined
            ? (character.profession || '')
            : safeProfession(String(req.body.profession || ''));
        const professionChanged = requestedProfession !== (character.profession || '');
        const requestedSkillSlots = req.body.skillSlots === undefined
            ? Math.max(0, Number(character.skill_slots || 0))
            : clamp(Math.floor(number(req.body.skillSlots, character.skill_slots || 0)), 0, 30);
        const skillSlotsChanged = requestedSkillSlots !== Math.max(0, Number(character.skill_slots || 0));
        const skillSlots = requestedSkillSlots;

        if (slotIndex < 0 || slotIndex >= skillSlots) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '找不到這個反應戰技' });
        }

        if (professionChanged || skillSlotsChanged) {
            await client.query(
                'UPDATE characters SET profession = $1, skill_slots = $2 WHERE id = $3',
                [requestedProfession, skillSlots, characterId]
            );
            if (professionChanged) {
                await client.query('DELETE FROM character_skills WHERE character_id = $1', [characterId]);
            } else {
                await client.query('DELETE FROM character_skills WHERE character_id = $1 AND slot_index >= $2', [characterId, skillSlots]);
            }
        }

        if (!skillKey) {
            await client.query(
                'DELETE FROM character_skills WHERE character_id = $1 AND slot_index = $2',
                [characterId, slotIndex]
            );
        } else {
            const skill = ALL_EQUIPPABLE_SKILLS.get(skillKey);

            if (!skill || !skillAllowedForProfession(skill, requestedProfession)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'error' });
            }

            // 同一角色不重複攜帶相同戰技；若已在其他欄，改成移到新欄。
            await client.query(
                'DELETE FROM character_skills WHERE character_id = $1 AND skill_key = $2',
                [characterId, skillKey]
            );

            await client.query(`
                INSERT INTO character_skills (character_id, slot_index, skill_key)
                VALUES ($1, $2, $3)
                ON CONFLICT (character_id, slot_index)
                DO UPDATE SET skill_key = EXCLUDED.skill_key
            `, [characterId, slotIndex, skillKey]);
        }

        await client.query('COMMIT');
        res.json(await getCharacterById(characterId));
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '更新攜帶戰技失敗' });
    } finally {
        client.release();
    }
});

app.get('/api/buffs/catalog', (_req, res) => {
    const manuals = listManualStatuses()
        .map(buff => ({
            ...buff,
            categoryLabel:
                buff.kind === 'special'
                    ? '特殊狀態'
                    : buff.subtype === 'abnormal'
                        ? '異常狀態'
                        : buff.kind === 'debuff'
                            ? '減益'
                            : '增益'
        }));

    manuals.push({
        key: '__parametric_mod__',
        name: '數值修正',
        effect: '自訂能力值百分比或固定值修正',
        icon: 'stat_up',
        kind: 'buff',
        manual: true,
        parametricPicker: true,
        categoryLabel: '數值修正',
        stats: combat.STAT_KEYS.map(stat => ({
            key: stat,
            label: combat.STAT_LABELS[stat]
        })),
        modes: combat.STAT_MODES.slice()
    });

    res.json(
        manuals.sort((a, b) =>
            String(a.kind || 'buff').localeCompare(String(b.kind || 'buff')) ||
            String(a.subtype || '').localeCompare(String(b.subtype || '')) ||
            String(a.name).localeCompare(String(b.name), 'zh-Hant')
        )
    );
});

app.get('/api/characters', async (_req, res) => {
    try {
        const result = await pool.query('SELECT * FROM characters ORDER BY id');
        const ids = result.rows.map(row => row.id);
        const [buffsMap, skillsMap] = await Promise.all([
            getBuffsByCharacterIds(ids),
            getSkillsByCharacterIds(ids)
        ]);
        res.json(result.rows.map(row => mapCharacter(
            row,
            buffsMap.get(row.id) || [],
            skillsMap.get(row.id) || []
        )));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '查詢角色失敗' });
    }
});

app.post('/api/characters', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const values = [
            String(req.body.name || '').trim(),
            safeKind(req.body.kind),
            safeProfession(req.body.profession),
            clamp(Math.floor(number(req.body.skillSlots, 1)), 0, 30),
            number(req.body.hp),
            number(req.body.ap),
            number(req.body.sp),
            number(req.body.patk),
            number(req.body.matk),
            number(req.body.crit),
            number(req.body.critDamageBonus),
            number(req.body.hitRate),
            number(req.body.dodge),
            number(req.body.speed),
            number(req.body.defense),
            number(req.body.resist),
            clamp(number(req.body.blockRate), 0, 75),
            imagePath
        ];

        if (!values[0]) return res.status(400).json({ error: 'error' });

        const result = await pool.query(`
            INSERT INTO characters (
                name, kind, profession, skill_slots,
                hp, max_hp, ap, max_ap, sp, max_sp,
                patk, matk, crit, crit_damage_bonus, hit_rate, dodge, speed, defense, resist, block_rate, image_path
            )
            VALUES (
                $1, $2, $3, $4,
                $5, $5, $6, $6, $7, $7,
                $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
        `, values);

        res.json(mapCharacter(result.rows[0], []));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || '建立角色失敗' });
    }
});

// 角色卡一次儲存所有可編輯數值。
app.patch('/api/characters/:id', async (req, res) => {
    const characterId = number(req.params.id);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const currentResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [characterId]
        );

        if (!currentResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        const current = currentResult.rows[0];
        const maxHp = Math.max(0, number(req.body.maxHp, current.max_hp));
        const maxAp = Math.max(0, number(req.body.maxAp, current.max_ap));
        const maxSp = Math.max(0, number(req.body.maxSp, current.max_sp));
        const profession = safeProfession(
            req.body.profession === undefined ? current.profession : req.body.profession
        );
        const skillSlots = clamp(
            Math.floor(number(req.body.skillSlots, current.skill_slots ?? 1)),
            0,
            30
        );

        const professionChanged = profession !== (current.profession || '');

        const values = [
            clamp(number(req.body.hp, current.hp), 0, maxHp),
            maxHp,
            clamp(number(req.body.ap, current.ap), 0, maxAp),
            maxAp,
            clamp(number(req.body.sp, current.sp), 0, maxSp),
            maxSp,
            number(req.body.patk, current.patk),
            number(req.body.matk, current.matk),
            number(req.body.crit, current.crit),
            number(req.body.critDamageBonus, current.crit_damage_bonus),
            number(req.body.hitRate, current.hit_rate),
            number(req.body.dodge, current.dodge),
            number(req.body.speed, current.speed),
            number(req.body.defense, current.defense),
            number(req.body.resist, current.resist),
            clamp(number(req.body.blockRate, current.block_rate), 0, 75),
            profession,
            skillSlots,
            characterId
        ];

        const result = await client.query(`
            UPDATE characters SET
                hp = $1, max_hp = $2,
                ap = $3, max_ap = $4,
                sp = $5, max_sp = $6,
                patk = $7, matk = $8, crit = $9, crit_damage_bonus = $10, hit_rate = $11,
                dodge = $12, speed = $13, defense = $14, resist = $15,
                block_rate = $16,
                profession = $17, skill_slots = $18
            WHERE id = $19
            RETURNING *
        `, values);

        // 換職業時清空攜帶戰技，避免保留上一職業的限定戰技。
        if (professionChanged) {
            await client.query(
                'DELETE FROM character_skills WHERE character_id = $1',
                [characterId]
            );
        } else {
            // 戰技欄縮小時，直接移除超出欄位的戰技。
            await client.query(`
                DELETE FROM character_skills
                WHERE character_id = $1 AND slot_index >= $2
            `, [characterId, skillSlots]);
        }

        await client.query('COMMIT');

        const updated = await getCharacterById(characterId);
        res.json(updated);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '更新角色失敗' });
    } finally {
        client.release();
    }
});

app.delete('/api/characters/:id', async (req, res) => {
    const characterId = number(req.params.id);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 先清掉戰場與 Buff，讓舊資料庫就算 FK 設定不同也能穩定刪除。
        await client.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [characterId]);
        await client.query('DELETE FROM character_buffs WHERE character_id = $1', [characterId]);
        await client.query('DELETE FROM character_skills WHERE character_id = $1', [characterId]);

        const result = await client.query(
            'DELETE FROM characters WHERE id = $1 RETURNING image_path',
            [characterId]
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        await client.query('COMMIT');

        const imagePath = result.rows[0].image_path;
        if (imagePath?.startsWith('/uploads/')) {
            fs.unlink(path.join(UPLOAD_DIR, path.basename(imagePath)), () => {});
        }

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: '刪除角色失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/characters/:id/stat', async (req, res) => {
    const characterId = number(req.params.id);
    const delta = number(req.body.delta);
    const statType = req.body.statType;
    const columns = {
        hp: ['hp', 'max_hp'],
        ap: ['ap', 'max_ap'],
        sp: ['sp', 'max_sp']
    };

    if (!columns[statType]) return res.status(400).json({ error: 'error' });
    const [currentColumn, maxColumn] = columns[statType];

    try {
        const result = await pool.query(`
            UPDATE characters
            SET ${currentColumn} = LEAST(${maxColumn}, GREATEST(0, ${currentColumn} + $1))
            WHERE id = $2
            RETURNING *
        `, [delta, characterId]);

        if (!result.rows.length) return res.status(404).json({ error: 'error' });

        const [buffsMap, skillsMap] = await Promise.all([
            getBuffsByCharacterIds([characterId]),
            getSkillsByCharacterIds([characterId])
        ]);
        res.json(mapCharacter(
            result.rows[0],
            buffsMap.get(characterId) || [],
            skillsMap.get(characterId) || []
        ));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});

app.post('/api/characters/:id/buffs', async (req, res) => {
    const characterId = number(req.params.id);
    const buffKey = String(req.body.buffKey || '');
    const sourceCharacterId = number(req.body.sourceCharacterId, 0) || null;
    const valueNum = req.body.valueNum === undefined || req.body.valueNum === null
        ? null
        : Math.trunc(Number(req.body.valueNum));
    const modStat = req.body.stat ? String(req.body.stat) : null;
    const modMode = req.body.mode ? String(req.body.mode) : null;

    try {
        const exists = await pool.query('SELECT id FROM characters WHERE id = $1', [characterId]);
        if (!exists.rows.length) return res.status(404).json({ error: 'error' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const clock = await getBattleClock(client, false).catch(() => ({ round: 1 }));
            const currentRound = Number(clock?.round || 1);

            if (modStat && modMode) {
                if (!combat.STAT_KEYS.includes(modStat) || !combat.STAT_MODES.includes(modMode)) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'error' });
                }
                if (valueNum == null || !Number.isFinite(valueNum) || valueNum === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: '請輸入非零整數效果值' });
                }
                await combat.applyStatMod(client, [characterId], {
                    stat: modStat,
                    mode: modMode,
                    value: valueNum,
                    sourceCharacterId: sourceCharacterId || characterId,
                    expiresRound: combat.statusExpiresRound(
                        { duration: { type: 'round_end' } },
                        currentRound
                    )
                });
            } else if (combat.isModKey(buffKey)) {
                if (valueNum == null || !Number.isFinite(valueNum) || valueNum === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: '參數錯誤：需要整數 valueNum' });
                }
                const parsed = combat.parseModKey(buffKey);
                await combat.applyStatMod(client, [characterId], {
                    ...parsed,
                    value: valueNum,
                    sourceCharacterId: sourceCharacterId || characterId,
                    expiresRound: combat.statusExpiresRound(
                        { duration: { type: 'round_end' } },
                        currentRound
                    )
                });
            } else {
                const def = lookupBuff(buffKey);
                if (!def && !expandStatusGrants(buffKey).length) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: '未知狀態效果' });
                }
                if (def?.manualValue) {
                    if (valueNum == null || !Number.isFinite(valueNum) || valueNum <= 0) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ error: '請輸入正整數效果值（每次損失的 HP）' });
                    }
                }
                if (def?.manualSource) {
                    if (!sourceCharacterId) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ error: '請選擇施加者' });
                    }
                }
                if (def?.manualLink) {
                    if (valueNum == null || !Number.isFinite(valueNum) || valueNum <= 0) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ error: '請選擇指定對象' });
                    }
                }

                const expiresRound = statusExpiresRound(buffKey, currentRound);
                await applyBuffToCharacters(client, [characterId], buffKey, {
                    sourceCharacterId: sourceCharacterId || (
                        def?.manualSource ? null : characterId
                    ),
                    valueNum,
                    expiresRound,
                    sourceSnapshot: def?.manualValue
                        ? { tickBase: valueNum }
                        : null
                });
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        const character = await getCharacterById(characterId);
        res.json(character);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'error' });
    }
});

app.delete('/api/characters/:id/buffs/:buffKey', async (req, res) => {
    const characterId = number(req.params.id);
    const buffKey = decodeURIComponent(String(req.params.buffKey || ''));

    try {
        const relatedLegacy = Object.entries(LEGACY_STATUS_EXPAND)
            .filter(([, keys]) =>
                Array.isArray(keys) &&
                keys.some(item => item === buffKey)
            )
            .map(([legacyKey]) => legacyKey);
        const keysToDelete = [...new Set([buffKey, ...relatedLegacy])];

        await pool.query(
            'DELETE FROM character_buffs WHERE character_id = $1 AND buff_key = ANY($2::text[])',
            [characterId, keysToDelete]
        );

        const character = await getCharacterById(characterId);
        if (!character) return res.status(404).json({ error: 'error' });
        res.json(character);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});



function parseCost(costText) {
    return combat.parseCost(costText);
}

function parseDamagePackets(effect) {
    return combat.parseDamagePackets(effect);
}

function targetAllowed(skill, actor, target) {
    return combat.targetAllowed(skill, actor, target);
}

async function spendSkillCost(client, actor, skill) {
    const cost = combat.assertSkillCostAvailable(actor, skill);
    if (!cost.type || cost.amount <= 0) return cost;

    await client.query(
        `UPDATE characters SET ${cost.type} = GREATEST(0, ${cost.type} - $1) WHERE id = $2`,
        [cost.amount, actor.id]
    );
    actor[cost.type] = Number(actor[cost.type]) - cost.amount;
    return cost;
}

async function actorHasSkill(client, actorId, skillKey) {
    if (SKILL_CATALOG[skillKey]) return true;
    const result = await client.query(
        'SELECT 1 FROM character_skills WHERE character_id = $1 AND skill_key = $2',
        [actorId, skillKey]
    );
    return result.rows.length > 0;
}

function isContextReactionSkill(skill) {
    return combat.isReactionSkill(skill);
}

function reactionCostAvailable(character, skill) {
    return combat.reactionCostAvailable(character, skill);
}

async function equippedSkillRows(client) {
    const result = await client.query(`
        SELECT
            c.*,
            cs.skill_key
        FROM character_skills cs
        JOIN characters c ON c.id = cs.character_id
        WHERE c.hp > 0
        ORDER BY c.id, cs.slot_index
    `);

    const rows = result.rows
        .map(row => ({
            character: row,
            skill: ALL_EQUIPPABLE_SKILLS.get(row.skill_key) ||
                SKILL_CATALOG[row.skill_key] ||
                null
        }))
        .filter(item => item.skill);

    // Initial skills (e.g. 基礎格擋) are always available but not stored in
    // character_skills — inject them for every living combatant so reactions
    // like ON_TARGET_DECLARED (基礎格擋) can match.
    const living = await client.query(`
        SELECT *
        FROM characters
        WHERE hp > 0
        ORDER BY id
    `);
    const initialSkills = Object.values(SKILL_CATALOG).filter(skill =>
        combat.isReactionSkill(skill)
    );
    for (const character of living.rows) {
        for (const skill of initialSkills) {
            rows.push({ character, skill });
        }
    }

    return rows;
}

function reactionOptionId(actorId, skillKey, targetId = 0) {
    return combat.reactionOptionId(actorId, skillKey, targetId);
}

function reactionOption(character, skill, opts = {}) {
    const def = combat.getReactionDef(skill) || {
        timingCode: combat.normalizeTimingCode(skill.timing),
        effectId: skill.effectId || skill.name
    };
    return combat.buildReactionOption(character, skill, def, opts);
}

function attackDescriptor(skill) {
    return combat.attackDescriptor(skill);
}

function targetResultPhysicalHit(targetResult) {
    return combat.targetResultPhysicalHit(targetResult);
}

function timingPipelineDeps() {
    return {
        loadEquippedRows: equippedSkillRows,
        createReactionWindow
    };
}

async function loadFlowStack(client) {
    const result = await client.query(`
        SELECT flow_stack
        FROM battle_state
        WHERE id = 1
        FOR UPDATE
    `);
    return combat.restoreStack(result.rows[0]?.flow_stack);
}

async function saveFlowStack(client, stack) {
    await client.query(`
        UPDATE battle_state
        SET flow_stack = $1::jsonb,
            updated_at = NOW()
        WHERE id = 1
    `, [JSON.stringify(combat.serializeStack(stack || []))]);
}

async function clearFlowStack(client) {
    await saveFlowStack(client, []);
}

async function hasOpenBlockingReaction(client) {
    const result = await client.query(`
        SELECT id
        FROM reaction_windows
        WHERE status IN ('open', 'ready', 'queued')
          AND blocking = TRUE
        ORDER BY id DESC
        LIMIT 1
    `);
    return result.rows.length > 0;
}

async function assertFreeTimingForActiveSkill(client, skill) {
    if (!combat.isActiveSkill(skill)) return;

    const stack = await loadFlowStack(client);
    if (combat.isStackBusy(stack)) {
        const error = new Error('此動作不是經由當前反應視窗發起');
        error.status = 409;
        throw error;
    }

    if (await hasOpenBlockingReaction(client)) {
    const error = new Error('此動作不是經由當前反應視窗發起');
        error.status = 409;
        throw error;
    }
}

async function collectPostActionReactionOptions(
    client,
    actor,
    skill,
    payload,
    cost
) {
    const rawTargets = Array.isArray(payload?.targets) ? payload.targets : [];
    const heals = Array.isArray(payload?.heals) ? payload.heals : [];

    const targets = [];
    for (const damage of rawTargets) {
        const enriched = { ...damage };
        if (!enriched.targetSnapshot || enriched.hpAfter == null) {
            const row = await client.query(
                'SELECT id, name, kind, hp FROM characters WHERE id = $1',
                [damage.targetId]
            );
            if (row.rows[0]) {
                enriched.targetSnapshot = {
                    id: row.rows[0].id,
                    name: row.rows[0].name,
                    kind: row.rows[0].kind,
                    hp: Number(row.rows[0].hp)
                };
                enriched.targetName = enriched.targetName || row.rows[0].name;
                enriched.targetKind = enriched.targetKind || row.rows[0].kind;
                enriched.hpAfter = Number(row.rows[0].hp);
            }
        }
        targets.push(enriched);
    }

    const context = combat.createActionContext({
        actionKind: 'skill',
        actorId: actor.id,
        actorName: actor.name,
        actorKind: actor.kind || 'player',
        targetId: payload?.targetId,
        skillKey: skill.key,
        skillName: skill.name,
        actionCode: skill.actionCode,
        logicCode: skill.logicCode,
        cost,
        results: {
            targets,
            heals
        },
        meta: {
            skill,
            targets,
            heals
        }
    });

    return combat.collectReactionOptions({
        equippedRows: await equippedSkillRows(client),
        timingCodes: combat.POST_SKILL_COLLECT_TIMINGS,
        context,
        actor,
        target: null
    });
}

function mapReactionWindow(row) {
    if (!row) return null;

    const options = Array.isArray(row.options) ? row.options : [];
    const context = row.context || {};
    const reactorId = row.reactor_id != null
        ? Number(row.reactor_id)
        : Number(options[0]?.actorId || 0) || null;

    return {
        id: Number(row.id),
        triggerType: row.trigger_type,
        blocking: Boolean(row.blocking),
        status: row.status,
        sourceActorId: row.source_actor_id,
        sourceTargetId: row.source_target_id,
        sourceSkillKey: row.source_skill_key,
        reactorId,
        reactorName: options[0]?.actorName || context.reactorName || null,
        reactorSpeed: context.reactorSpeed != null ? Number(context.reactorSpeed) : null,
        batchOrder: context.batchOrder != null ? Number(context.batchOrder) : null,
        batchId: row.batch_id || null,
        round: Number(row.round_number),
        turnPass: Number(row.turn_pass),
        context,
        options,
        resumePayload: row.resume_payload || null,
        resolution: row.resolution || {},
        createdAt: row.created_at
    };
}

function groupReactionOptionsByReactor(options = []) {
    const groups = new Map();
    for (const option of options) {
        const reactorId = Number(option?.actorId || 0);
        if (!reactorId) continue;
        if (!groups.has(reactorId)) groups.set(reactorId, []);
        groups.get(reactorId).push(option);
    }
    return groups;
}

async function loadReactorInfoMap(client, characterIds = []) {
    const ids = [...new Set(characterIds.map(Number).filter(Boolean))];
    const map = new Map();
    if (!ids.length) return map;

    const result = await client.query(`
        SELECT *
        FROM characters
        WHERE id = ANY($1::int[])
    `, [ids]);
    const buffsMap = await getBuffsByCharacterIds(ids);

    for (const row of result.rows) {
        const buffs = buffsMap.get(Number(row.id)) || [];
        const effective = effectiveStatsFromBuffs(row, buffs);
        map.set(Number(row.id), {
            name: row.name,
            kind: row.kind || 'player',
            speed: Number(effective.speed ?? row.speed ?? 0),
            defaultSkip: Boolean(row.reaction_default_skip)
        });
    }
    return map;
}

function sortReactorIdsBySpeed(reactorIds, infoMap) {
    return [...reactorIds].sort((a, b) => {
        const speedA = Number(infoMap.get(Number(a))?.speed || 0);
        const speedB = Number(infoMap.get(Number(b))?.speed || 0);
        if (speedB !== speedA) return speedB - speedA;
        return Number(a) - Number(b);
    });
}

async function insertReactionWindowRow(client, {
    triggerType,
    blocking = false,
    status = 'open',
    sourceActorId = null,
    sourceTargetId = null,
    sourceSkillKey = null,
    reactorId = null,
    batchId = null,
    round,
    turnPass,
    context = {},
    options = [],
    resumePayload = null,
    resolution = {}
}) {
    const result = await client.query(`
        INSERT INTO reaction_windows (
            trigger_type, blocking, status,
            source_actor_id, source_target_id, source_skill_key,
            reactor_id, batch_id,
            round_number, turn_pass,
            context, options, resume_payload, resolution
        )
        VALUES (
            $1, $2, $3,
            $4, $5, $6,
            $7, $8,
            $9, $10,
            $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb
        )
        RETURNING *
    `, [
        triggerType,
        blocking,
        status,
        sourceActorId,
        sourceTargetId,
        sourceSkillKey,
        reactorId,
        batchId,
        round,
        turnPass,
        JSON.stringify(context),
        JSON.stringify(options),
        resumePayload ? JSON.stringify(resumePayload) : null,
        JSON.stringify(resolution || {})
    ]);
    return mapReactionWindow(result.rows[0]);
}

/**
 * Create one reaction window per reactor, ordered by effective speed (high→low).
 * Only the fastest non-auto-skip reactor starts `open`; others are `queued` and
 * unlock after the previous reactor finishes.
 */
async function createReactionWindow(client, {
    triggerType,
    blocking = false,
    sourceActorId = null,
    sourceTargetId = null,
    sourceSkillKey = null,
    round,
    turnPass,
    context = {},
    options = [],
    resumePayload = null
}) {
    if (!options.length) return [];

    const enrichedOptions = await enrichReactionOptionsWithPicks(client, options, {
        sourceActorId,
        sourceTargetId,
        attackSkill: sourceSkillKey
            ? (ALL_EQUIPPABLE_SKILLS.get(sourceSkillKey) || SKILL_CATALOG[sourceSkillKey])
            : null
    });

    if (!enrichedOptions.length) return [];

    const groups = groupReactionOptionsByReactor(enrichedOptions);
    if (!groups.size) return [];

    const batchId = crypto.randomUUID();
    const infoMap = await loadReactorInfoMap(client, [...groups.keys()]);
    const orderedIds = sortReactorIdsBySpeed([...groups.keys()], infoMap);
    const windows = [];
    let leadAssigned = false;
    let openAssigned = false;

    for (let index = 0; index < orderedIds.length; index += 1) {
        const reactorId = Number(orderedIds[index]);
        const reactorOptions = groups.get(reactorId) || [];
        const info = infoMap.get(reactorId) || {};
        const autoSkip = Boolean(info.defaultSkip);
        const isLead = !leadAssigned;
        if (isLead) leadAssigned = true;

        let status = 'queued';
        if (autoSkip) {
            status = 'skipped';
        } else if (!openAssigned) {
            status = 'open';
            openAssigned = true;
        }

        const window = await insertReactionWindowRow(client, {
            triggerType,
            blocking,
            status,
            sourceActorId,
            sourceTargetId,
            sourceSkillKey,
            reactorId,
            batchId,
            round,
            turnPass,
            context: {
                ...context,
                reactorId,
                reactorName: info.name || reactorOptions[0]?.actorName || null,
                reactorSpeed: Number(info.speed || 0),
                batchId,
                batchOrder: index
            },
            options: autoSkip ? [] : reactorOptions,
            resumePayload: isLead ? resumePayload : null,
            resolution: autoSkip
                ? { skipped: true, auto: true, reason: 'reaction_default_skip' }
                : {}
        });
        windows.push(window);
    }

    // If the first slots were auto-skipped, promote the first queued to open.
    if (!windows.some(item => item.status === 'open')) {
        const next = await openNextQueuedReactionInBatch(client, batchId);
        if (next) {
            return windows.map(item =>
                Number(item.id) === Number(next.id) ? next : item
            );
        }
    }

    const openCount = windows.filter(item => item.status === 'open').length;
    const queuedCount = windows.filter(item => item.status === 'queued').length;
    if (blocking && resumePayload && openCount === 0 && queuedCount === 0) {
        const lead = windows.find(item => item.resumePayload) || windows[0];
        if (lead) {
            const result = await client.query(`
                UPDATE reaction_windows
                SET status = 'ready',
                    resolved_at = NOW()
                WHERE id = $1
                RETURNING *
            `, [lead.id]);
            const ready = mapReactionWindow(result.rows[0]);
            return windows.map(item =>
                Number(item.id) === Number(ready.id) ? ready : item
            );
        }
    }

    return windows;
}

async function listReactionBatch(client, batchId) {
    if (!batchId) return [];
    const result = await client.query(`
        SELECT *
        FROM reaction_windows
        WHERE batch_id = $1
        ORDER BY COALESCE((context->>'batchOrder')::int, id) ASC, id ASC
        FOR UPDATE
    `, [batchId]);
    return result.rows.map(mapReactionWindow);
}

/**
 * Unlock the next speed-ordered queued window in a batch.
 */
async function openNextQueuedReactionInBatch(client, batchId) {
    if (!batchId) return null;
    const windows = await listReactionBatch(client, batchId);
    if (windows.some(item => item.status === 'open')) return null;

    const next = windows.find(item => item.status === 'queued');
    if (!next) return null;

    const result = await client.query(`
        UPDATE reaction_windows
        SET status = 'open',
            resolved_at = NULL
        WHERE id = $1
          AND status = 'queued'
        RETURNING *
    `, [next.id]);

    return result.rows[0] ? mapReactionWindow(result.rows[0]) : null;
}

/**
 * After one reactor finishes, either open the next queued window (by speed)
 * or promote the batch lead to ready when everyone is done.
 */
async function progressReactionBatchAfterDecision(client, batchId, {
    blocking = false,
    resolution = null
} = {}) {
    const next = await openNextQueuedReactionInBatch(client, batchId);
    if (next) {
        const windows = await listReactionBatch(client, batchId);
        return {
            complete: false,
            nextWindow: next,
            resumeWindow: null,
            windows
        };
    }
    const finalized = await finalizeReactionBatchIfComplete(client, batchId, {
        blocking,
        resolution
    });
    return {
        ...finalized,
        nextWindow: null
    };
}

/**
 * When no open/queued windows remain in a batch, promote the lead blocking
 * window to ready so the original skill can resume.
 */
async function finalizeReactionBatchIfComplete(client, batchId, {
    blocking = false,
    resolution = null
} = {}) {
    const windows = await listReactionBatch(client, batchId);
    if (!windows.length) {
        return { complete: true, resumeWindow: null, windows: [] };
    }

    const stillWaiting = windows.filter(item =>
        item.status === 'open' || item.status === 'queued'
    );
    if (stillWaiting.length) {
        return { complete: false, resumeWindow: null, windows };
    }

    const lead = windows.find(item => item.resumePayload) || windows[0];
    const batchBlocking = blocking || windows.some(item => item.blocking);

    if (batchBlocking && lead) {
        const mergedResolution = {
            ...(lead.resolution || {}),
            ...(resolution || {})
        };
        const result = await client.query(`
            UPDATE reaction_windows
            SET status = 'ready',
                resolution = $2::jsonb,
                resolved_at = COALESCE(resolved_at, NOW())
            WHERE id = $1
            RETURNING *
        `, [lead.id, JSON.stringify(mergedResolution)]);

        const resumeWindow = mapReactionWindow(result.rows[0]);
        const refreshed = await listReactionBatch(client, batchId);
        return {
            complete: true,
            resumeWindow,
            windows: refreshed.map(item =>
                Number(item.id) === Number(resumeWindow.id) ? resumeWindow : item
            )
        };
    }

    return {
        complete: true,
        resumeWindow: null,
        windows: await listReactionBatch(client, batchId)
    };
}

async function listOpenReactionWindows(db = pool) {
    const result = await db.query(`
        SELECT *
        FROM reaction_windows
        WHERE status IN ('open', 'ready', 'queued')
        ORDER BY
            COALESCE((context->>'batchOrder')::int, 9999) ASC,
            id ASC
    `);
    return result.rows.map(mapReactionWindow);
}

async function getOpenReactionsState(actorId = null, db = pool) {
    const windows = await listOpenReactionWindows(db);
    const mineId = Number(actorId || 0);
    const openWindows = windows.filter(item => item.status === 'open');
    const queuedWindows = windows.filter(item => item.status === 'queued');
    const mine = mineId
        ? (openWindows.find(item => Number(item.reactorId) === mineId) || null)
        : (openWindows[0] || null);

    const peerWindows = [
        ...openWindows.filter(item => !mine || Number(item.id) !== Number(mine.id)),
        ...queuedWindows
    ];

    const peers = peerWindows.map(item => ({
        id: item.id,
        batchId: item.batchId,
        reactorId: item.reactorId,
        reactorName: item.reactorName || item.options?.[0]?.actorName || `角色#${item.reactorId}`,
        reactorSpeed: item.reactorSpeed,
        batchOrder: item.batchOrder,
        triggerType: item.triggerType,
        blocking: item.blocking,
        optionCount: (item.options || []).length,
        status: item.status
    }));

    const resume = windows.find(item =>
        item.status === 'ready' && item.blocking && item.resumePayload
    ) || null;

    return {
        windows,
        mine,
        peers,
        resume,
        batchId: mine?.batchId || peers[0]?.batchId || resume?.batchId || null
    };
}

/** @deprecated Prefer getOpenReactionsState; kept for single-window call sites. */
async function latestOpenReaction(db = pool) {
    const state = await getOpenReactionsState(null, db);
    return state.mine || state.resume || null;
}

function broadcastReactionWindows(windows = []) {
    const list = (Array.isArray(windows) ? windows : [windows]).filter(Boolean);
    if (!list.length) return;
    io.emit('combat:reaction-batch', {
        batchId: list[0].batchId || null,
        windows: list
    });
    for (const window of list) {
        io.emit('combat:reaction-opened', window);
    }
}

function clearStackChatMessages(stackOrSnapshot) {
    const frames = Array.isArray(stackOrSnapshot)
        ? stackOrSnapshot
        : stackOrSnapshot?.frames;
    if (!Array.isArray(frames)) return stackOrSnapshot;
    for (const frame of frames) {
        if (frame?.context?.results) {
            frame.context.results.messages = [];
        }
    }
    return stackOrSnapshot;
}

function clearResumePayloadChatMessages(resumePayload) {
    if (!resumePayload || typeof resumePayload !== 'object') return resumePayload;
    if (!resumePayload.stack) return resumePayload;
    return {
        ...resumePayload,
        stack: clearStackChatMessages({
            ...resumePayload.stack,
            frames: (resumePayload.stack.frames || []).map(frame => ({
                ...frame,
                context: frame.context
                    ? {
                        ...frame.context,
                        results: {
                            ...(frame.context.results || {}),
                            messages: []
                        }
                    }
                    : frame.context
            }))
        })
    };
}

function asReactionWindowList(result) {
    if (!result) return [];
    return Array.isArray(result) ? result.filter(Boolean) : [result];
}

/**
 * Parent-skill resume target must stay the attack/skill target unless the
 * reaction explicitly redirected it. Option.targetId is often the heal/dispel
 * subject and must not rewrite the resume payload.
 */
function buildReactionResolution(window, option, applied = {}) {
    const resumeTargetId = Number(
        window?.resumePayload?.targetId || 0
    );
    const explicitRedirect = Number(
        applied?.resume?.targetId ||
        option?.meta?.redirectTargetId ||
        applied?.flags?.redirectTargetId ||
        0
    );
    return {
        targetId: explicitRedirect || resumeTargetId || null,
        flags: { ...(applied?.flags || {}) }
    };
}

async function expireNonBlockingReactions(client) {
    const result = await client.query(`
        UPDATE reaction_windows
        SET status = 'expired',
            resolved_at = NOW()
        WHERE status = 'open'
          AND blocking = FALSE
        RETURNING id
    `);

    return result.rows.map(row => Number(row.id));
}

async function emitTimingHooks(client, timingCodes, baseContext = {}) {
    return combat.emitGlobalTimings(
        client,
        timingCodes,
        baseContext,
        timingPipelineDeps()
    );
}

async function addShieldValue(
    client,
    characterId,
    amount,
    sourceSkillKey,
    sourceCharacterId
) {
    const shield = Math.max(0, Math.floor(Number(amount || 0)));
    if (!shield) return 0;

    const current = await client.query(`
        SELECT value_num
        FROM character_buffs
        WHERE character_id = $1
          AND buff_key = 'life_shield'
        FOR UPDATE
    `, [characterId]);

    const currentValue = Number(current.rows[0]?.value_num || 0);
    const nextValue = currentValue + shield;

    await applyBuffToCharacters(
        client,
        [characterId],
        'life_shield',
        {
            sourceSkillKey,
            sourceCharacterId,
            valueNum: nextValue
        }
    );

    return nextValue;
}

async function appendPrognosisOptionIfAvailable(
    client,
    options,
    healerId,
    heals
) {
    if (!Array.isArray(heals) || !heals.some(item => Number(item.heal || 0) > 0)) {
        return options;
    }

    const result = await client.query(`
        SELECT c.*, cs.skill_key
        FROM character_skills cs
        JOIN characters c ON c.id = cs.character_id
        WHERE c.id = $1
          AND cs.skill_key = '織光者:預後'
        LIMIT 1
    `, [healerId]);

    if (!result.rows.length) return options;

    const character = result.rows[0];
    const skill = ALL_EQUIPPABLE_SKILLS.get(character.skill_key);
    if (!skill || !reactionCostAvailable(character, skill)) return options;

    const option = reactionOption(character, skill, {
        targetId: healerId,
        targetName: character.name,
        note: '',
        meta: {
            heals: heals.filter(item => Number(item.heal || 0) > 0)
        }
    });

    if (!options.some(item => item.id === option.id)) {
        return [...options, option];
    }

    return options;
}


// ---------- 聊天室 / 戰鬥紀錄 ----------

app.get('/api/chat/messages', async (req, res) => {
    const channel = req.query.channel === 'combat' ? 'combat' : 'team';
    const limit = clamp(number(req.query.limit, 100), 1, 200);

    try {
        const result = await pool.query(`
            SELECT *
            FROM (
                SELECT *
                FROM chat_messages
                WHERE channel = $1
                ORDER BY id DESC
                LIMIT $2
            ) messages
            ORDER BY id ASC
        `, [channel, limit]);

        res.json(result.rows.map(mapChatMessage));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '讀取聊天室失敗' });
    }
});


app.delete('/api/chat/messages', async (req, res) => {
    const channel = req.query.channel === 'team' ? 'team' : 'combat';

    try {
        await pool.query('DELETE FROM chat_messages WHERE channel = $1', [channel]);
        io.emit('chat:cleared', { channel });
        res.json({ success: true, channel });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});

app.post('/api/chat/messages', async (req, res) => {
    const characterId = number(req.body.characterId);
    const content = String(req.body.content || '').trim().slice(0, 2000);

    if (!content) return res.status(400).json({ error: 'error' });

    try {
        const character = await getCharacterById(characterId);
        if (!character) return res.status(404).json({ error: 'error' });

        const message = await insertChatMessage(pool, {
            channel: 'team',
            characterId: character.id,
            characterName: character.name,
            characterKind: character.kind,
            content
        });

        io.emit('chat:message', message);
        res.json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});

// ---------- 戰場紀錄 ----------

app.get('/api/combat/logs', async (req, res) => {
    const limit = clamp(number(req.query.limit, 250), 1, 500);

    try {
        const result = await pool.query(`
            SELECT *
            FROM (
                SELECT *
                FROM battle_events
                ORDER BY id DESC
                LIMIT $1
            ) events
            ORDER BY id ASC
        `, [limit]);

        res.json(result.rows.map(mapBattleEvent));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});


app.delete('/api/combat/logs', async (_req, res) => {
    try {
        await pool.query('DELETE FROM battle_events');
        io.emit('battle:logs-cleared');
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});

// ---------- 角色 API ----------

app.get('/api/combat/skills', async (req, res) => {
    const actorId = number(req.query.actorId);

    try {
        const base = Object.values(SKILL_CATALOG);
        if (!actorId) return res.json(base);

        const actor = await getCharacterById(actorId);
        if (!actor) return res.status(404).json({ error: 'error' });

        const equipped = (actor.equippedSkills || [])
            .filter(skill => !isContextReactionSkill(skill))
            .map(skill => ({
                ...skill,
                needsRoll: skill.actionCode === 'ATTACK'
            }));

        res.json([...base, ...equipped]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '讀取可用戰技失敗' });
    }
});

app.get('/api/combat/state', async (_req, res) => {
    try {
        res.json(await getCombatState());
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});


app.get('/api/combat/reactions/open', async (req, res) => {
    try {
        const actorId = number(req.query.actorId, 0) || null;
        res.json(await getOpenReactionsState(actorId));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'error' });
    }
});

app.patch('/api/characters/:id/reaction-default-skip', async (req, res) => {
    const characterId = number(req.params.id);
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE characters
            SET reaction_default_skip = $2
            WHERE id = $1
            RETURNING *
        `, [characterId, enabled]);

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        let skippedWindow = null;
        let batchResult = null;
        if (enabled) {
            const open = await client.query(`
                SELECT *
                FROM reaction_windows
                WHERE reactor_id = $1
                  AND status = 'open'
                ORDER BY id ASC
                FOR UPDATE
            `, [characterId]);

            for (const row of open.rows) {
                const window = mapReactionWindow(row);
                await client.query(`
                    UPDATE reaction_windows
                    SET status = 'skipped',
                        options = '[]'::jsonb,
                        resolution = $2::jsonb,
                        resolved_at = NOW()
                    WHERE id = $1
                `, [
                    window.id,
                    JSON.stringify({
                        skipped: true,
                        auto: true,
                        reason: 'reaction_default_skip'
                    })
                ]);
                if (window.batchId) {
                    batchResult = await progressReactionBatchAfterDecision(client, window.batchId, {
                        blocking: window.blocking
                    });
                }
                skippedWindow = window;
            }
        }

        await client.query('COMMIT');

        const mapped = mapCharacter(result.rows[0]);
        io.emit('characters:changed');
        if (batchResult?.resumeWindow) {
            io.emit('combat:reaction-updated', batchResult.resumeWindow);
        } else if (skippedWindow) {
            io.emit('combat:reaction-closed', { id: skippedWindow.id });
            if (batchResult?.nextWindow) {
                io.emit('combat:reaction-opened', batchResult.nextWindow);
            }
        }
        if (batchResult?.windows?.length) {
            broadcastReactionWindows(batchResult.windows);
        }

        res.json({
            success: true,
            character: mapped,
            resume: batchResult?.resumeWindow || null,
            nextWindow: batchResult?.nextWindow || null
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {}
        console.error(error);
        res.status(500).json({ error: error.message || '更新反應預設失敗' });
    } finally {
        client.release();
    }
});

app.post('/api/combat/reactions/:id/respond', async (req, res) => {
    const reactionId = number(req.params.id);
    const action = String(req.body.action || 'use');
    const optionId = String(req.body.optionId || '');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reactionResult = await client.query(`
            SELECT *
            FROM reaction_windows
            WHERE id = $1
              AND status = 'open'
            FOR UPDATE
        `, [reactionId]);

        if (!reactionResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'error' });
        }

        const row = reactionResult.rows[0];
        const window = mapReactionWindow(row);
        const clock = {
            round: Number(row.round_number),
            turnPass: Number(row.turn_pass)
        };

        if (action === 'skip') {
            await client.query(`
                UPDATE reaction_windows
                SET status = 'skipped',
                    options = '[]'::jsonb,
                    resolution = $2::jsonb,
                    resolved_at = NOW()
                WHERE id = $1
            `, [
                reactionId,
                JSON.stringify({
                    skipped: true,
                    targetId: window.resumePayload?.targetId
                })
            ]);

            const batchResult = window.batchId
                ? await progressReactionBatchAfterDecision(client, window.batchId, {
                    blocking: window.blocking
                })
                : {
                    complete: true,
                    resumeWindow: window.blocking
                        ? mapReactionWindow({
                            ...row,
                            status: 'ready',
                            options: [],
                            resolution: {
                                targetId: window.resumePayload?.targetId,
                                flags: {}
                            }
                        })
                        : null,
                    windows: [],
                    nextWindow: null
                };

            // Legacy single-window without batch: blocking skip ??ready.
            if (!window.batchId && window.blocking) {
                await client.query(`
                    UPDATE reaction_windows
                    SET status = 'ready',
                        resolution = $2::jsonb,
                        resolved_at = NOW()
                    WHERE id = $1
                `, [
                    reactionId,
                    JSON.stringify({
                        targetId: window.resumePayload?.targetId,
                        flags: {}
                    })
                ]);
                const updated = await client.query(
                    'SELECT * FROM reaction_windows WHERE id = $1',
                    [reactionId]
                );
                batchResult.resumeWindow = mapReactionWindow(updated.rows[0]);
                batchResult.windows = [batchResult.resumeWindow];
            }

            await client.query('COMMIT');

            const peers = await getOpenReactionsState(
                window.reactorId,
                pool
            );

            if (batchResult.resumeWindow) {
                io.emit('combat:reaction-updated', batchResult.resumeWindow);
            } else {
                io.emit('combat:reaction-closed', { id: reactionId });
                if (batchResult.nextWindow) {
                    io.emit('combat:reaction-opened', batchResult.nextWindow);
                }
                if (batchResult.windows?.length) {
                    broadcastReactionWindows(
                        batchResult.windows.filter(item =>
                            item.status === 'open' || item.status === 'queued'
                        )
                    );
                }
            }
            io.emit('combat:reaction-batch', {
                batchId: window.batchId,
                windows: peers.windows
            });

            return res.json({
                success: true,
                window: batchResult.resumeWindow ||
                    batchResult.nextWindow ||
                    mapReactionWindow({ ...row, status: 'skipped', options: [] }),
                resume: Boolean(batchResult.resumeWindow),
                peers: peers.peers,
                batchComplete: batchResult.complete
            });
        }

        const option = window.options.find(item => item.id === optionId);
        if (!option) {
            await client.query('ROLLBACK');
        return res.status(400).json({ error: '找不到這個反應戰技' });
        }

        // Merge client pick meta (SP / cell / redirect / choice).
        const clientMeta = req.body.meta && typeof req.body.meta === 'object'
            ? req.body.meta
            : {};
        if (req.body.targetId) {
            option.targetId = number(req.body.targetId);
        }
        option.meta = {
            ...(option.meta || {}),
            ...clientMeta
        };
        if (clientMeta.redirectTargetId) {
            option.targetId = Number(clientMeta.redirectTargetId);
        }
        if (clientMeta.pickedTargetId && !option.targetId) {
            option.targetId = Number(clientMeta.pickedTargetId);
        }

        const reactionSkill =
            ALL_EQUIPPABLE_SKILLS.get(option.skillKey) ||
            SKILL_CATALOG[option.skillKey] ||
            null;
        if (!reactionSkill) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'error' });
        }

        if (!(await actorHasSkill(client, option.actorId, option.skillKey))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '該角色目前沒有攜帶這個戰技' });
        }

        const reactorResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [option.actorId]
        );
        const reactor = reactorResult.rows[0];

        if (!reactor || Number(reactor.hp) <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `${reactor?.name || '這個角色'} 已擊倒，無法發動反應` });
        }

        const cost = await spendSkillCost(client, reactor, reactionSkill);

        let reactionText = '';

        let charactersChanged = cost.amount > 0;

        let battlefieldChanged = false;

        let nextOptions = window.options.filter(item => item.id !== option.id);



        const effectId =

            option.effectId ||

            option.meta?.effectId ||

            combat.getReactionDef(reactionSkill)?.effectId ||

            reactionSkill.key ||

            option.skillKey ||

            null;



        if (!reactionSkill?.key && !option.skillKey) {

            await client.query('ROLLBACK');

            return res.status(400).json({ error: 'error' });

        }



        const resume = { ...(window.resumePayload || {}) };

        const flags = { ...(window.resolution?.flags || {}) };

        const timingCode = combat.normalizeTimingCode(window.triggerType);



        try {

            const applied = await combat.applyReactionEffect({

                effectId: effectId || reactionSkill.key,

                client,

                reactor,

                skill: reactionSkill,

                option,

                window,

                clock,

                resume,

                flags,

                nextOptions,

                deps: {

                    applyBuffToCharacters,

                    applyDebuffBundle,

                    swapCharacterPositions,

                    addShieldValue,

                    sourceEffectiveMagic,

                    getCharacterBuffEntries,

                    buffModifiers,
                    BUFF_CATALOG,
                    appendPrognosisOptionIfAvailable,
                    removeBuffKeys,
                    resolveRecipients: async (c, { actor, skill, target, context }) => {
                        const tid = Number(
                            target?.id ||
                            context?.targetId ||
                            (Array.isArray(context?.targetIds) && context.targetIds[0]) ||
                            0
                        );
                        let targetRow = null;
                        if (tid) {
                            const row = await c.query(
                                'SELECT * FROM characters WHERE id = $1',
                                [tid]
                            );
                            targetRow = row.rows[0] || { id: tid };
                        }
                        return autoRecipientIds(
                            c,
                            actor,
                            targetRow || actor,
                            skill
                        );
                    },
                    resolveFollowUpAttack: async (args) =>
                        resolveFollowUpAttack(client, args),
                    applyReturnReroll: async (args) =>
                        applyReturnReroll(client, args),

                    resolveCounterDamage: async ({

                        client: c,

                        reactor: r,

                        option: opt,

                        effectId: eid

                    }) => {

                        const targetId = Number(opt.targetId);

                        const attackerResult = await c.query(

                            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',

                            [targetId]

                        );

                        const attacker = attackerResult.rows[0];

                        if (!attacker) throw new Error('反擊目標已不存在');



                        const reactorBuffs = await getCharacterBuffEntries(c, r.id);

                        const reactorMods = buffModifiers(reactorBuffs);



                        let damageAmount;

                        if (eid === 'WALL_COUNTER') {

                            damageAmount = Math.floor(

                                Number(r.defense) * reactorMods.defenseMult

                            );

                        } else {

                            const attackerBuffs = await getCharacterBuffEntries(

                                c,

                                attacker.id

                            );

                            const attackerMods = buffModifiers(attackerBuffs);

                            const attackValue = Math.floor(

                                Number(r.patk) * reactorMods.patkMult

                            );

                            const defenseValue = Math.floor(

                                Number(attacker.defense) * attackerMods.defenseMult

                            );

                            damageAmount = Math.max(

                                1,

                                Math.floor(attackValue * 0.5 - defenseValue)

                            );

                        }



                        const result = await applyDirectHpLoss(

                            c,

                            attacker.id,

                            damageAmount

                        );



                        return {

                            reactionText: eid === 'WALL_COUNTER'

                                ? `${r.name} 發動「城墻反擊」→ ${attacker.name}：依有效防禦使其損失 ${result.loss} HP。`

                                : `${r.name} 發動「城牆反擊」→ ${attacker.name}：造成 ${result.loss} HP。`,

                            charactersChanged: result.loss > 0

                        };

                    }

                }

            });



            reactionText = applied.reactionText;

            charactersChanged = charactersChanged || applied.charactersChanged;

            battlefieldChanged = applied.battlefieldChanged;

            nextOptions = applied.nextOptions;



            // Same timing may list options from multiple reactors (and chained
            // options like 基礎格擋). Keep THIS character's window open until their
            // list is empty; only finalize the batch when every reactor is done.
            let resumeWindow = null;
            let batchWindows = null;

            if (nextOptions.length > 0) {
                await client.query(`
                    UPDATE reaction_windows
                    SET options = $2::jsonb,
                        status = 'open',
                        resolution = $3::jsonb
                    WHERE id = $1
                `, [
                    reactionId,
                    JSON.stringify(nextOptions),
                    JSON.stringify(buildReactionResolution(window, option, applied))
                ]);
            } else {
                await client.query(`
                    UPDATE reaction_windows
                    SET options = '[]'::jsonb,
                        status = 'resolved',
                        resolution = $2::jsonb,
                        resolved_at = NOW()
                    WHERE id = $1
                `, [
                    reactionId,
                    JSON.stringify(buildReactionResolution(window, option, applied))
                ]);

                if (window.batchId) {
                    const batchResult = await progressReactionBatchAfterDecision(
                        client,
                        window.batchId,
                        {
                            blocking: window.blocking || applied.blockingReady,
                            resolution: buildReactionResolution(window, option, applied)
                        }
                    );
                    resumeWindow = batchResult.resumeWindow;
                    batchWindows = batchResult.windows;
                    window.__nextWindow = batchResult.nextWindow || null;
                } else if (
                    window.blocking ||
                    applied.blockingReady ||
                    timingCode === combat.TIMING.ON_TARGET_DECLARED
                ) {
                    const result = await client.query(`
                        UPDATE reaction_windows
                        SET status = 'ready',
                            resolved_at = NOW()
                        WHERE id = $1
                        RETURNING *
                    `, [reactionId]);
                    resumeWindow = mapReactionWindow(result.rows[0]);
                }
            }

            // Stash for response after commit
            window.__resumeWindow = resumeWindow;
            window.__batchWindows = batchWindows;
            window.__keptOpen = nextOptions.length > 0;

        } catch (effectError) {

            await client.query('ROLLBACK');

            return res.status(400).json({

                error: effectError.message || '反應效果失敗'

            });

        }



        // Reaction resolution is entirely skill.pipeline (no nested double-cast).
        const nestedWindows = [];

        const reactionMessage = await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'reaction',
            characterId: reactor.id,
            characterName: reactor.name,
            characterKind: reactor.kind || 'player',
            content: `??${reactionText}`,
            payload: {
                reactionWindowId: reactionId,
                skillKey: reactionSkill.key,
                sourceSkillKey: window.sourceSkillKey
            }
        });

        const reactionEvent = await insertBattleEvent(client, {
            eventType: 'reaction',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId: reactor.id,
            targetId: option.targetId,
            content: reactionText,
            payload: {
                reactionWindowId: reactionId,
                skillKey: reactionSkill.key,
                sourceSkillKey: window.sourceSkillKey
            }
        });

        await client.query('COMMIT');

        const updatedResult = await pool.query(
            'SELECT * FROM reaction_windows WHERE id = $1',
            [reactionId]
        );
        const updatedWindow = mapReactionWindow(updatedResult.rows[0]);
        const resumeWindow = window.__resumeWindow || null;
        const nextWindow = window.__nextWindow || null;
        const peersState = await getOpenReactionsState(window.reactorId, pool);

        io.emit('chat:message', reactionMessage);
        io.emit('battle:event', reactionEvent);

        if (charactersChanged) io.emit('characters:changed');

        if (battlefieldChanged) {
            io.emit('battlefield:changed', {
                reason: 'reaction-swap'
            });
        }

        if (resumeWindow) {
            io.emit('combat:reaction-updated', resumeWindow);
        } else if (updatedWindow.status === 'open') {
            io.emit('combat:reaction-updated', updatedWindow);
        } else {
            io.emit('combat:reaction-closed', {
                id: reactionId
            });
            if (nextWindow) {
                io.emit('combat:reaction-opened', nextWindow);
            }
        }

        io.emit('combat:reaction-batch', {
            batchId: window.batchId,
            windows: peersState.windows
        });

        for (const nestedWindow of nestedWindows) {
            const nestedList = asReactionWindowList(nestedWindow);
            broadcastReactionWindows(nestedList);
        }

        return res.json({
            success: true,
            message: reactionMessage,
            window: resumeWindow || nextWindow || updatedWindow,
            resume: Boolean(resumeWindow),
            peers: peersState.peers,
            nestedWindows
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {}

        console.error(error);
        return res.status(500).json({
            error: error.message || '反應戰技執行失敗'
        });
    } finally {
        client.release();
    }
});


function buildTimingEngineDeps(client, bag) {
    const state = {
        content: '',
        payload: bag.payload || {},
        charactersChanged: false,
        battlefieldChanged: false,
        initiativeChanged: false,
        costSpent: false,
        /** Broadcasts queued by action bodies, flushed by the route after COMMIT. */
        domainEvents: []
    };

    /**
     * Fold an action-body result into the shared state. Unlike Object.assign
     * this accumulates domainEvents, so a skill running several bodies does not
     * lose the broadcasts queued by the earlier ones.
     */
    const mergeBodyResult = (result) => {
        const { domainEvents, ...rest } = result || {};
        Object.assign(state, rest);
        if (Array.isArray(domainEvents) && domainEvents.length) {
            state.domainEvents.push(...domainEvents);
        }
        return result;
    };

    const skillByKey = (key) =>
        SKILL_CATALOG[key] || ALL_EQUIPPABLE_SKILLS.get(key) || null;

    const result = {
        state,
        skillByKey,
        loadEquippedRows: (c) => equippedSkillRows(c),
        loadBuffEntriesMap: async (c, context) => {
            const ids = [
                Number(context.actorId || 0),
                ...((context.affectedIds || []).map(Number)),
                ...((context.targetIds || []).map(Number))
            ].filter(Boolean);
            const map = new Map();
            for (const id of [...new Set(ids)]) {
                map.set(id, await getCharacterBuffEntries(c, id));
            }
            return map;
        },
        createReactionWindow: (c, payload) => createReactionWindow(c, payload),
        applyStatusMonitor: async (c, { option, context }) => {
            const tick = combat.statusTickByEffectId(option.effectId);
            if (!tick) return null;

            const actorId = Number(option.actorId);
            const entry = option.meta?.buffEntry;
            const sourceMagic = await sourceEffectiveMagic(
                c,
                entry?.source_character_id
            );
            const baseAmount = combat.tickAmountFromEntry(entry, { sourceMagic });

            if (tick.kind === 'heal') {
                const row = await c.query(
                    'SELECT hp, max_hp, name FROM characters WHERE id = $1 FOR UPDATE',
                    [actorId]
                );
                if (!row.rows.length) return null;

                const oldHp = Number(row.rows[0].hp);
                const newHp = Math.min(Number(row.rows[0].max_hp), oldHp + baseAmount);
                const actual = Math.max(0, newHp - oldHp);
                if (actual > 0) {
                    await c.query('UPDATE characters SET hp = $1 WHERE id = $2', [newHp, actorId]);
                    state.charactersChanged = true;
                }

                return {
                    heals: [{
                        targetId: actorId,
                        targetName: row.rows[0].name,
                        heal: actual,
                        oldHp,
                        newHp
                    }],
                    affectedIds: [actorId],
                    // Only open ON_HEAL when HP actually recovered.
                    cascadeTiming: actual > 0 ? combat.TIMING.ON_HEAL : null,
                    events: [{
                        type: 'status',
                        message: actual > 0
                            ? `${tick.label}：${row.rows[0].name} 恢復 ${actual} HP`
                            : `${tick.label}：${row.rows[0].name} HP 已滿`
                    }]
                };
            }

                // 見縫插針 lets the applier crit on their damage-over-time ticks.
            const snapshot = entry?.source_snapshot || entry?.sourceSnapshot || {};
            let amount = baseAmount;
            let critText = '';
            if (snapshot.hasNeedle) {
                const roll = combat.rollStatusCrit({
                    critRate: snapshot.crit,
                    critDamageBonus: snapshot.critDamageBonus
                });
                if (roll.crit) {
                    amount = Math.max(1, Math.floor(amount * roll.multiplier));
                    critText = '（見縫插針暴擊）';
                }
            }

            const result = await applyDirectHpLoss(c, actorId, amount);
            if (result.loss > 0) state.charactersChanged = true;

            return {
                damages: [{ targetId: actorId, hpLoss: result.loss }],
                affectedIds: [actorId],
                events: [{
                    type: 'status',
                    message: `${tick.label}：損失 ${result.loss} HP${critText}`
                }]
            };
        },
        host: {
            spendSkillCost: async (c, context, skill) => {
                if (state.costSpent || bag.costAlreadySpent) {
                    state.costSpent = true;
                    return bag.cost;
                }
                const actorRow = context.meta?.actorRow || bag.actor;
                const spent = await spendSkillCost(c, actorRow, skill);
                state.costSpent = true;
                state.cost = spent;
                context.cost = spent;
                context.flags.costSpent = true;
                bag.cost = spent;
                return spent;
            },
            /**
             * Expand UI anchor + direction into every designated character id
             * before ON_TARGET_DECLARED, so each is「被指定」.
             */
            resolveDesignatedTargets: async (c, args) => {
                const skill = args.skill || args.context?.meta?.skill || bag.skill;
                const actor = args.actor || bag.actor;
                const target = args.target || bag.target || actor;
                const direction = args.direction ||
                    args.context?.direction ||
                    bag.requestedDirection ||
                    null;
                const context = args.context || {};
                if (!skill || !actor) {
                    return (context.targetIds || []).map(Number).filter(Boolean);
                }

                const code = skill.targetCode || 'SELF';
                let ids;
                if (
                    skill.actionCode === 'ATTACK' ||
                    code === 'ANY_ORTHOGONAL' ||
                    code === 'ALL_ENEMIES' ||
                    code === 'ENEMY_ROW' ||
                    skill.targetShape
                ) {
                    ids = await resolveAttackTargetIds(
                        c,
                        actor,
                        target || actor,
                        skill,
                        direction
                    );
                } else if (
                    ['HEAL', 'BUFF', 'DEBUFF', 'GUARD', 'UTILITY'].includes(skill.actionCode) ||
                    ['ALL_ALLIES', 'ALLY_ROW', 'ALL_ENEMIES', 'ENEMY_ROW'].includes(code)
                ) {
                    ids = await autoRecipientIds(c, actor, target || actor, skill);
                } else {
                    const fallback = Number(target?.id || context.targetId || actor.id || 0);
                    ids = fallback ? [fallback] : [];
                }

                ids = [...new Set((ids || []).map(Number).filter(Boolean))];
                if (ids.length) {
                    const rows = await c.query(
                        'SELECT id, name, kind, hp FROM characters WHERE id = ANY($1::int[])',
                        [ids]
                    );
                    context.meta = context.meta || {};
                    context.meta.charactersById = context.meta.charactersById || new Map();
                    for (const row of rows.rows) {
                        context.meta.charactersById.set(Number(row.id), {
                            id: Number(row.id),
                            name: row.name,
                            kind: row.kind || 'player',
                            hp: Number(row.hp)
                        });
                    }
                }
                return ids;
            },
            resolveAttackHits: async (c, args) => {
                const context = args.context || {};
                const ctxTargetId = Number(
                    primaryTargetId(context) || context.targetId || 0
                );
                let attackBag = bag;
                if (
                    ctxTargetId &&
                    Number(ctxTargetId) !== Number(bag.targetId)
                ) {
                    const row = await c.query(
                        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
                        [ctxTargetId]
                    );
                    if (row.rows[0]) {
                        attackBag = {
                            ...bag,
                            target: row.rows[0],
                            targetId: Number(row.rows[0].id)
                        };
                    }
                }
                const result = await executeSkillActionBodies(c, {
                    ...attackBag,
                    skill: args.skill,
                    payload: state.payload,
                    onlyAction: 'ATTACK'
                });
                mergeBodyResult(result);
                args.context.results.targets = result.payload?.targets || [];
                args.context.results.heals = result.payload?.heals || [];
                return {
                    ok: true,
                    content: result.content,
                    payload: result.payload
                };
            },
            resolveHeal: async (c, args) => {
                const effect = args.effect || {};
                const context = args.context || {};
                if (effect.requireDispelled && !context.flags?.dispelled) {
                    return { ok: true, skipped: true, content: '' };
                }

                const skillForHeal = {
                    ...(args.skill || {}),
                    actionCode: 'HEAL'
                };

                let recipientOverride = null;
                if (effect.alliesInTargets) {
                    const candidateIds = (context.targetIds || [])
                        .map(Number)
                        .filter(Boolean);
                    if (candidateIds.length) {
                        const rows = await c.query(
                            'SELECT id, kind FROM characters WHERE id = ANY($1::int[])',
                            [candidateIds]
                        );
                        const actorKind = context.actorKind || bag.actor?.kind || 'player';
                        recipientOverride = rows.rows
                            .filter(row => (row.kind || 'player') === actorKind)
                            .map(row => Number(row.id));
                    } else {
                        recipientOverride = [];
                    }
                }

                const result = await executeSkillActionBodies(c, {
                    ...bag,
                    skill: skillForHeal,
                    payload: state.payload,
                    onlyAction: 'HEAL',
                    recipientOverride
                });
                mergeBodyResult(result);
                return {
                    ok: true,
                    heals: result.payload?.heals || [],
                    content: result.content
                };
            },
            resolveApplyStatus: async (c, args) => {
                const effect = args.effect || {};
                const context = args.context || {};
                const skill = args.skill;
                const grants = [
                    ...(Array.isArray(effect.statusKeys) ? effect.statusKeys : []),
                    ...(Array.isArray(effect.mods)
                        ? effect.mods.map(item => (
                            item && item.type === 'mod'
                                ? item
                                : { type: 'mod', ...item }
                        ))
                        : [])
                ];

                // Declarative apply on the timing bus: on = actor | target | targets
                // useSkillBody ??full BUFF/DEBUFF skill body (row / all-allies recipients)
                if (grants.length && !effect.useSkillBody) {
                    if (args.onlyOnHit) {
                        const hitTargets = (context.results?.targets || []).filter(
                            item => item && (item.anyHit || item.hit || item.segments?.some(s => s.hit))
                        );
                        if (!hitTargets.length) {
                            return { ok: true, applied: [] };
                        }
                    }

                    const on = String(effect.on || 'target').toLowerCase();
                    let recipientIds = [];
                    if (on === 'actor' || on === 'self') {
                        recipientIds = [Number(context.actorId)].filter(Boolean);
                    } else if (on === 'targets') {
                        recipientIds = (context.targetIds || [])
                            .map(Number)
                            .filter(Boolean);
                    } else {
        // target = 當前指定目標（可被反應改寫為 context.targetId）
                        const tid = Number(
                            primaryTargetId(context) ||
                            context.targetId ||
                            bag.targetId ||
                            0
                        );
                        recipientIds = tid ? [tid] : [];
                    }

                    if (!recipientIds.length) {
                        return { ok: true, applied: [] };
                    }

                    const round = bag.battleState?.round || context.round || 1;
                    const hasDebuff = grants.some(grant => {
                        if (typeof grant === 'object' && grant.type === 'mod') {
                            return Number(grant.value) < 0;
                        }
                        const def = lookupBuff(typeof grant === 'string' ? grant : null);
                        return def?.kind === 'debuff';
                    });

                    let application;
                    if (hasDebuff) {
                        application = await applyDebuffBundle(
                            c,
                            recipientIds,
                            grants,
                            {
                                sourceSkillKey: skill.key,
                                sourceCharacterId: Number(context.actorId),
                                currentRound: round
                            }
                        );
                    } else {
                        let applied = [];
                        for (const grant of grants) {
                            await applyBuffToCharacters(c, recipientIds, grant, {
                                sourceSkillKey: skill.key,
                                sourceCharacterId: Number(context.actorId),
                                expiresRound: round
                            });
                            applied = applied.concat(
                                recipientIds.map(characterId => ({
                                    characterId,
                                    key: typeof grant === 'object' && grant.type === 'mod'
                                        ? combat.modKey(grant.stat, grant.mode)
                                        : grant
                                }))
                            );
                        }
                        application = { applied, protected: [], resisted: [] };
                    }

                    state.charactersChanged = true;
                    return {
                        ok: true,
                        applied: (application.applied || []).map(item => {
                            const key = item.key || item.buff_key || item.buffKey;
                            const valueNum = item.value != null
                                ? item.value
                                : item.value_num;
                            const def = lookupBuff(key, valueNum);
                            return {
                                characterId: item.characterId || item.character_id,
                                key,
                                value: valueNum,
                                kind: def?.kind || (
                                    valueNum != null && Number(valueNum) < 0
                                        ? 'debuff'
                                        : def?.kind
                                ),
                                subtype: def?.subtype
                            };
                        }).filter(item => item.characterId && item.key),
                        application
                    };
                }

                // Legacy: whole-skill BUFF / DEBUFF body
                const result = await executeSkillActionBodies(c, {
                    ...bag,
                    skill: args.skill,
                    payload: state.payload,
                    onlyAction: args.skill.actionCode === 'DEBUFF' ? 'DEBUFF' : 'BUFF'
                });
                mergeBodyResult(result);
                const applied = result.payload?.application?.applied ||
                    result.payload?.appliedStatuses ||
                    [];
                return {
                    ok: true,
                    applied: applied.map(item => ({
                        characterId: item.characterId || item.character_id,
                        key: item.key || item.buff_key || item.buffKey,
                        kind: BUFF_CATALOG[item.key || item.buff_key]?.kind,
                        subtype: BUFF_CATALOG[item.key || item.buff_key]?.subtype
                    })).filter(item => item.characterId && item.key),
                    content: result.content
                };
            },
            resolveLifeSacrifice: async (c, args) => {
                const actorId = Number(args.context.actorId);
                const actorRow = args.context.meta?.actorRow || bag.actor;
                const entries = await getCharacterBuffEntries(c, actorId);
                const hpRatio = Number(actorRow.max_hp) > 0
                    ? Number(actorRow.hp) / Number(actorRow.max_hp)
                    : 1;
                if (hpRatio >= 0.25) {
                    const content =
                        `◆ ${actorRow.name} 使用「不惜生命」\n條件不滿足（HP 未低於 25%），沒有發動。`;
                    state.content = content;
                    state.payload = {
                        ...state.payload,
                        battleLogContent: `${actorRow.name} 使用「不惜生命」，條件未滿足。`
                    };
                    return { ok: true, applied: [], content };
                }
                const actorMods = buffModifiers(entries);
                const effectiveDefense = Math.floor(
                    Number(actorRow.defense) * actorMods.defenseMult + actorMods.defenseFlat
                );
                await applyBuffToCharacters(c, [actorId], 'life_sacrifice', {
                    sourceSkillKey: args.skill.key,
                    sourceCharacterId: actorId,
                    valueNum: Math.max(0, effectiveDefense)
                });
                state.charactersChanged = true;
                const content =
                        `◆ ${actorRow.name} 使用「不惜生命」\n` +
                    `失去 ${effectiveDefense} 點防禦，物理攻擊 +${effectiveDefense}`;
                state.content = content;
                state.payload = { ...state.payload, battleLogContent: content };
                return {
                    ok: true,
                    applied: [{
                        characterId: actorId,
                        key: 'life_sacrifice',
                        kind: 'special'
                    }],
                    content
                };
            },
            resolveStatLink: async (c, args) => {
                const result = await executeSkillActionBodies(c, {
                    ...bag,
                    skill: { ...args.skill, utilityMode: 'light_link', actionCode: 'BUFF' },
                    payload: state.payload,
                    onlyAction: 'BUFF'
                });
                mergeBodyResult(result);
                return {
                    ok: true,
                    affectedIds: [
                        Number(args.context.actorId),
                        Number(primaryTargetId(args.context) || 0)
                    ].filter(Boolean),
                    appliedEffects: [
                        { key: 'light_link_loss', kind: 'debuff', characterId: Number(args.context.actorId) },
                        { key: 'light_link_gain', kind: 'buff', characterId: Number(primaryTargetId(args.context) || 0) }
                    ],
                    content: result.content
                };
            },
            resolveLifeShield: async (c, args) => {
                const result = await executeSkillActionBodies(c, {
                    ...bag,
                    skill: args.skill,
                    payload: state.payload,
                    onlyAction: 'BUFF'
                });
                mergeBodyResult(result);
                return { ok: true, content: result.content };
            },
            resolveMove: async (c, args) => {
                const result = await executeSkillActionBodies(c, {
                    ...bag,
                    skill: args.skill,
                    payload: state.payload,
                    onlyAction: 'MOVE'
                });
                mergeBodyResult(result);
                return { ok: true, content: result.content };
            },
            resolveRescue: async (c, args) => {
                return { ok: true, content: `${args.context.actorName} 開始蓄力救援。` };
            }
        }
    };

    // Same shared ops for active casts and reaction pipelines.
    result.host = combat.attachSharedHostOps(result.host, {
        deps: {
            getCharacterBuffEntries,
            removeBuffKeys,
            BUFF_CATALOG
        },
        onState: (patch) => {
            if (patch.charactersChanged) state.charactersChanged = true;
            if (patch.battlefieldChanged) state.battlefieldChanged = true;
        }
    });
    return result;
}

function primaryTargetId(context) {
    return combat.primaryTargetId(context);
}

/**
 * Skill action bodies ??generic actionCode runners.
 * Timing-bus effects (apply_mod / life_sacrifice / ?? resolve via host primitives.
 */
async function executeSkillActionBodies(client, ctx) {
    const {
        skill, actor, target, actorId, targetId,
        battleState, reactionFlags = {},
        requestedDirection = null,
        actorBuffEntries = [], targetBuffEntries = [],
        onlyAction = null,
        recipientOverride = null
    } = ctx;

    combat.requireSkillRegistered(skill.key);

    let content = '';
    let payload = ctx.payload || {};
    let charactersChanged = false;
    let battlefieldChanged = false;
    let initiativeChanged = false;
    /** Socket broadcasts to perform *after* the transaction commits. */
    const domainEvents = [];

    const action = skill.actionCode;
    const runAttack = !onlyAction || onlyAction === 'ATTACK';
    const runHeal = !onlyAction || onlyAction === 'HEAL';
    const runBuff = !onlyAction || onlyAction === 'BUFF' || onlyAction === 'DEBUFF';
    const runMove = !onlyAction || onlyAction === 'MOVE';

    if (runAttack && skill.actionCode === 'ATTACK') {
        const packets = parseDamagePackets(
            String(skill.effect).split(/若|改為/)[0]
        );

        const attackTargetIds = await resolveAttackTargetIds(
            client,
            actor,
            target,
            skill,
            requestedDirection
        );

        const targetRows = await client.query(`
            SELECT *
            FROM characters
            WHERE id = ANY($1::int[])
            ORDER BY id
            FOR UPDATE
        `, [attackTargetIds]);

        const actorMods = buffModifiers(actorBuffEntries);
        const actorBuffKeys = new Set(
            actorBuffEntries.map(row => row.buff_key)
        );

        // Pre-attack mods may already be applied by registry onActive (戰吼 / 順風耳).
                const attackHitModifierMatch = String(skill.effect).match(
                        /【命中([+-]\d+)】/
                    );
                    const attackHitModifier = attackHitModifierMatch
                        ? Number(attackHitModifierMatch[1])
                        : 0;

                    const defenseIgnoreMatch = String(skill.effect).match(
                        /無視\s*(\d+)%\s*(?:防禦|防禦和魔抗)/
                    );
                    const defenseIgnoreRate = defenseIgnoreMatch
                        ? clamp(Number(defenseIgnoreMatch[1]), 0, 100)
                        : 0;

                    const skillUnblockable =
                        String(skill.effect).includes('【無法格擋】') ||
                        String(skill.effect).includes('無法被格擋') ||
                        reactionFlags.unblockable === true;

                    const skillCannotEvade =
                        String(skill.effect).includes('【無法迴避】') ||
                        reactionFlags.cannotEvade === true;

                    const criticalDamageRate =
                        50 +
                        Math.max(0, Number(actor.crit_damage_bonus || 0)) +
                        Number(reactionFlags.critDamageBonus || 0);
                    const criticalMultiplier =
                        1 + criticalDamageRate / 100;

                    const meleeAttack = String(skill.effect).includes('近戰攻擊');
                    const empowerActive =
                        meleeAttack &&
                        actorMods.empowerMagic > 0 &&
                        packets.some(packet => packet.damageType === '物理');

        let darknessAvailable = actorBuffKeys.has('darkness');
                    let darknessConsumed = false;
                    const targetSummaries = [];
                    const allTargetResults = [];
                    const allHealResults = [];
                    let grandTotalDamage = 0;
                    let grandHpLoss = 0;
                    let anyAttackHit = false;

                    for (const attackTarget of targetRows.rows) {
// 友方改治療：attack_segment.params.allyHeal
                        const allyHeal = combat.allyHealSpec(skill);
                        if (
                            allyHeal &&
                            (attackTarget.kind || 'player') === (actor.kind || 'player')
                        ) {
                            const oldHp = Number(attackTarget.hp);
                            const effectiveMagic = Math.floor(
                                Number(actor.matk) * actorMods.matkMult + actorMods.matkFlat
                            );
                            const ratio = Number(allyHeal.ratio || 0.75);
                            const heal = Math.max(1, Math.floor(effectiveMagic * ratio));
                            const newHp = Math.min(Number(attackTarget.max_hp), oldHp + heal);
                            const actualHeal = Math.max(0, newHp - oldHp);

                            if (actualHeal > 0) {
                                await client.query(
                                    'UPDATE characters SET hp = $1 WHERE id = $2',
                                    [newHp, attackTarget.id]
                                );
                                charactersChanged = true;
                            }

                            targetSummaries.push(
                                `✚ ${attackTarget.name} HP ${oldHp} → ${newHp}` +
                                (actualHeal ? `（+${actualHeal}）` : '')
                            );

                            allHealResults.push({
                                targetId: Number(attackTarget.id),
                                targetName: attackTarget.name,
                                heal: actualHeal,
                                oldHp,
                                newHp
                            });
                            continue;
                        }

                        const targetBuffEntriesNow = await getCharacterBuffEntries(
                            client,
                            attackTarget.id
                        );
                        const targetBuffKeysNow = new Set(
                            targetBuffEntriesNow.map(row => row.buff_key)
                        );
                        const targetMods = buffModifiers(targetBuffEntriesNow);

                        const effectiveHit = Math.floor(
                            Number(actor.hit_rate) +
                            actorMods.hitFlat +
                            attackHitModifier
                        );

                        const effectiveDodge = targetBuffKeysNow.has('frozen')
                            ? 0
                            : Math.floor(
                                Number(attackTarget.dodge) *
                                targetMods.dodgeMult +
                                targetMods.dodgeFlat
                            );

                        const effectiveCrit = Math.floor(
                            Number(actor.crit) +
                            actorMods.critFlat +
                            Number(reactionFlags.critFlat || 0)
                        );

                        const hitThreshold = skillCannotEvade
                            ? effectiveHit
                            : effectiveHit - effectiveDodge;

                        const effectiveBlockRate = clamp(
                            Number(attackTarget.block_rate || 0) + targetMods.blockFlat,
                            0,
                            75
                        );

                        const lines = [];
                        const segmentResults = [];
                        let rawTotalDamage = 0;
                        let segment = 0;
                        let anyHit = false;
                        let anyPhysicalAttack = false;
                        let anyBlock = false;
                        let mirageConsumed = false;
                        let bleedTriggerCount = 0;

                        const bleedingEntry = targetBuffEntriesNow.find(
                            row => row.buff_key === 'bleeding'
                        );
                        let bleedLossPerHit = 0;
                        if (bleedingEntry?.source_character_id) {
                            const bleedMagic = await sourceEffectiveMagic(
                                client,
                                bleedingEntry.source_character_id
                            );
                            bleedLossPerHit = Math.max(
                                1,
                                Math.floor(bleedMagic * 0.5)
                            );
                        }

                        for (const packet of packets) {
                            for (let i = 0; i < packet.hits; i++) {
                                segment += 1;

                                const roll = Math.floor(Math.random() * 100) + 1;
                                let hit = roll <= hitThreshold;
                                let forcedMissReason = '';

                                // 黑暗：下一段攻擊必定無法命中。
                                if (darknessAvailable) {
                                    hit = false;
                                    forcedMissReason = '黑暗';
                                    darknessAvailable = false;
                                    darknessConsumed = true;
                                }

                                // 幻影：下一次原本會命中的攻擊，直接迴避該段。
                                if (
                                    hit &&
                                    !mirageConsumed &&
                                    targetBuffKeysNow.has('mirage')
                                ) {
                                    hit = false;
                                    forcedMissReason = '幻影';
                                    mirageConsumed = true;
                                    await removeBuffKeys(
                                        client,
                                        attackTarget.id,
                                        ['mirage']
                                    );
                                    charactersChanged = true;
                                }

                                anyHit ||= hit;
                                anyAttackHit ||= hit;

                                const physical = packet.damageType === '物理';
                                anyPhysicalAttack ||= physical;

                                const canBlock =
                                    hit &&
                                    physical &&
                                    !skillUnblockable &&
                                    !actorMods.unblockable &&
                                    !targetMods.blockDisabled &&
                                    (targetMods.autoGuard || targetMods.guardReady);

                                const blocked = Boolean(canBlock);
                                anyBlock ||= blocked;

                                // 被格擋的攻擊不能暴擊；魔法傷害本身無法格擋。
                                const critical =
                                    hit &&
                                    !blocked &&
                                    reactionFlags.cannotCrit !== true &&
                                    roll <= effectiveCrit;

                                let damage = 0;
                                let bonusMagic = 0;

                                if (hit) {
                                    const rawStat =
                                        packet.damageType === '魔法'
                                            ? Number(actor.matk)
                                            : Number(actor.patk);

                                    const attackMult =
                                        packet.damageType === '魔法'
                                            ? actorMods.matkMult
                                            : actorMods.patkMult;

                                    const attackFlat =
                                        packet.damageType === '魔法'
                                            ? actorMods.matkFlat
                                            : 0;

                                    const rawDefense =
                                        packet.damageType === '魔法'
                                            ? Number(attackTarget.resist)
                                            : Number(attackTarget.defense);

                                    const defenseMult =
                                        packet.damageType === '魔法'
                                            ? targetMods.resistMult
                                            : targetMods.defenseMult;

                                    const effectiveAttack = Math.floor(
                                        rawStat * attackMult + attackFlat
                                    );

                                    const ignoreDefenseForReaction =
                                        Number(reactionFlags.ignoreDefenseTargetId || 0) ===
                                        Number(attackTarget.id);

                                    const effectiveDefense = ignoreDefenseForReaction
                                        ? 0
                                        : Math.floor(
                                            rawDefense *
                                            defenseMult *
                                            (1 - defenseIgnoreRate / 100)
                                        );

                                    const baseDamage = Math.floor(
                                        effectiveAttack * packet.multiplier
                                    );

                                    const blockFactor = blocked
                                        ? 1 - effectiveBlockRate / 100
                                        : 1;

                                    const allDamageModifier = Math.max(
                                        0,
                                        1 +
                                        (actorMods.damageMult - 1) +
                                        (targetMods.damageTakenMult - 1)
                                    );

                                    damage = Math.max(
                                        1,
                                        Math.floor(
                                            baseDamage *
                                            blockFactor *
                                            allDamageModifier *
                                            (critical ? criticalMultiplier : 1) -
                                            effectiveDefense
                                        )
                                    );

                                    rawTotalDamage += damage;

                                    if (bleedLossPerHit > 0) {
                                        bleedTriggerCount += 1;
                                    }

                                    // 賦能：下一次物理近戰攻擊每一個命中段附加 0.5 魔法。
                                    if (empowerActive && physical) {
                                        const magicAttack = Math.floor(
                                            Number(actor.matk) *
                                            actorMods.matkMult +
                                            actorMods.matkFlat
                                        );
                                        const magicResist = Math.floor(
                                            Number(attackTarget.resist) *
                                            targetMods.resistMult
                                        );

                                        const bonusDamageModifier = Math.max(
                                            0,
                                            1 +
                                            (actorMods.damageMult - 1) +
                                            (targetMods.damageTakenMult - 1)
                                        );

                                        bonusMagic = Math.max(
                                            1,
                                            Math.floor(
                                                magicAttack *
                                                actorMods.empowerMagic *
                                                bonusDamageModifier *
                                                (critical ? criticalMultiplier : 1) -
                                                magicResist
                                            )
                                        );

                                        rawTotalDamage += bonusMagic;
                                    }
                                }

                                const blockText = blocked
                                    ? `・格擋${effectiveBlockRate}%`
                                    : '';
                                const bonusText = bonusMagic
                                    ? `＋賦能魔法 ${bonusMagic}`
                                    : '';
                                const forcedMissText = forcedMissReason
                                    ? `（${forcedMissReason}）`
                                    : '';

                                lines.push(
                                    `第${segment}段 🎲 ${roll}/${hitThreshold} → ` +
                                    (
                                        hit
                                            ? (
                                                critical
                                                    ? `暴擊 ${damage}${bonusText}`
                                                    : `命中 ${damage}${blockText}${bonusText}`
                                            )
                                            : `未命中${forcedMissText}`
                                    )
                                );

                                segmentResults.push({
                                    segment,
                                    roll,
                                    hitThreshold,
                                    hit,
                                    forcedMissReason,
                                    blocked,
                                    blockRate: blocked ? effectiveBlockRate : 0,
                                    critical,
                                    damage,
                                    bonusMagic,
                                    damageType: packet.damageType
                                });
                            }
                        }

                        // 攻擊指定時的反應，直接作用在本次攻擊的傷害段。
                        const negateAllForThisTarget =
                            Number(reactionFlags.negateAllDamageTargetId || 0) ===
                            Number(attackTarget.id);

                        const negateOneForThisTarget =
                            Number(reactionFlags.negateOneSegmentTargetId || 0) ===
                            Number(attackTarget.id);

                        if (negateAllForThisTarget) {
                            for (const result of segmentResults) {
                                if (!result.hit) continue;
                                result.reactionPreventedDamage =
                                    Number(result.damage || 0) +
                                    Number(result.bonusMagic || 0);
                                result.damage = 0;
                                result.bonusMagic = 0;
                            }
                            lines.push('反應效果：本次攻擊傷害無效');
                        } else if (negateOneForThisTarget) {
                            const firstHit = segmentResults.find(item => item.hit);
                            if (firstHit) {
                                firstHit.reactionPreventedDamage =
                                    Number(firstHit.damage || 0) +
                                    Number(firstHit.bonusMagic || 0);
                                firstHit.damage = 0;
                                firstHit.bonusMagic = 0;
                                lines.push(`反應效果：第${firstHit.segment}段傷害無效`);
                            }
                        }

                        // 依「每一段傷害」順序結算護盾 / 狂暴 / 死鬥，
                        // 避免多段攻擊被錯誤視為一筆總傷害。
                        const shieldEntry = targetBuffEntriesNow.find(
                            row => row.buff_key === 'life_shield'
                        );
                        const shieldBefore =
                            shieldEntry?.value_num === null ||
                            shieldEntry?.value_num === undefined
                                ? 0
                                : Number(shieldEntry.value_num);

                        const oldHp = Number(attackTarget.hp);
                        let runningHp = oldHp;
                        let shieldAfter = shieldBefore;
                        let shieldAbsorbed = 0;
                        let hpDamage = 0;
                        let berserkTriggered = false;
                        let duelPrevented = false;
                        let berserkAvailable = targetBuffKeysNow.has('berserk');
                        const duelActive = targetBuffKeysNow.has('duel');

                        for (const result of segmentResults) {
                            if (!result.hit) continue;

                            let segmentDamage =
                                Number(result.damage || 0) +
                                Number(result.bonusMagic || 0);

                            if (segmentDamage <= 0) continue;

                            if (shieldAfter > 0) {
                                const absorbed = Math.min(
                                    shieldAfter,
                                    segmentDamage
                                );
                                shieldAfter -= absorbed;
                                segmentDamage -= absorbed;
                                shieldAbsorbed += absorbed;
                            }

                            if (segmentDamage <= 0) continue;

                            // 狂暴針對「下一次會致死的傷害段」：
                            // 該段傷害改為 0，之後的攻擊段仍正常結算。
                            if (
                                berserkAvailable &&
                                runningHp - segmentDamage <= 0
                            ) {
                                berserkAvailable = false;
                                berserkTriggered = true;
                                result.berserkPreventedDamage = segmentDamage;
                                segmentDamage = 0;
                            }

                            if (segmentDamage <= 0) continue;

                            const beforeSegmentHp = runningHp;
                            runningHp = Math.max(
                                duelActive ? 1 : 0,
                                runningHp - segmentDamage
                            );

                            const actualSegmentLoss = Math.max(
                                0,
                                beforeSegmentHp - runningHp
                            );
                            hpDamage += actualSegmentLoss;

                            if (
                                duelActive &&
                                beforeSegmentHp - segmentDamage < 1
                            ) {
                                duelPrevented = true;
                                result.duelPreventedDamage =
                                    Math.max(
                                        0,
                                        segmentDamage - actualSegmentLoss
                                    );
                            }
                        }

                        if (shieldBefore > 0) {
                            if (shieldAfter > 0) {
                                await client.query(`
                                    UPDATE character_buffs
                                    SET value_num = $1
                                    WHERE character_id = $2
                                      AND buff_key = 'life_shield'
                                `, [shieldAfter, attackTarget.id]);
                            } else {
                                await removeBuffKeys(
                                    client,
                                    attackTarget.id,
                                    ['life_shield']
                                );
                            }

                            if (shieldAfter !== shieldBefore) {
                                charactersChanged = true;
                            }
                        }

                        if (berserkTriggered) {
                            await removeBuffKeys(
                                client,
                                attackTarget.id,
                                ['berserk']
                            );
                            charactersChanged = true;
                        }

                        const newHp = runningHp;

                        if (newHp !== oldHp) {
                            await client.query(
                                'UPDATE characters SET hp = $1 WHERE id = $2',
                                [newHp, attackTarget.id]
                            );
                            charactersChanged = true;
                        }

                        // 流血屬於「額外損失 HP」，不走防禦 / 魔抗 / 護盾。
                        let bleedLoss = 0;
                        if (bleedTriggerCount > 0 && bleedLossPerHit > 0) {
                            const bleedResult = await applyDirectHpLoss(
                                client,
                                attackTarget.id,
                                bleedLossPerHit * bleedTriggerCount
                            );
                            bleedLoss = bleedResult.loss;
                            if (bleedLoss > 0) charactersChanged = true;
                        }

                        // 基礎格擋保留到下一次物理攻擊。
                        if (
                            anyPhysicalAttack &&
                            targetBuffKeysNow.has('guard_ready')
                        ) {
                            await removeBuffKeys(
                                client,
                                attackTarget.id,
                                ['guard_ready']
                            );
                            charactersChanged = true;
                        }

                        // 「下一次受傷」能力值修正（含舊障壁／受到傷害下降一次）
                        if (
                            hpDamage > 0 &&
                            targetMods.consumeOnDamageKeys.length
                        ) {
                            await removeBuffKeys(
                                client,
                                attackTarget.id,
                                targetMods.consumeOnDamageKeys
                            );
                            charactersChanged = true;
                        }

                        // 冰凍：受到真正 HP 傷害後解除；若護盾全擋住則不算受到傷害。
                        if (
                            hpDamage > 0 &&
                            targetBuffKeysNow.has('frozen')
                        ) {
                            await removeBuffKeys(
                                client,
                                attackTarget.id,
                                ['frozen']
                            );
                            charactersChanged = true;
                        }

                        // 命中時施加異常 / 數值減益；庇護會擋住整組減益。
                        // onHitPerPacket：依命中段序套用不同狀態（元素交響曲／封口等）。
                        const perPacket = combat.onHitPerPacket(skill);
                        if (perPacket && perPacket.length) {
                            for (const result of segmentResults) {
                                if (!result.hit) continue;
                                const idx = Math.max(0, Number(result.segment || 1) - 1);
                                const packetDebuffs = perPacket[idx] || [];
                                if (!packetDebuffs.length) continue;
                                const applied = await applyDebuffBundle(
                                    client,
                                    [attackTarget.id],
                                    packetDebuffs,
                                    {
                                        sourceSkillKey: skill.key,
                                        sourceCharacterId: actorId,
                                        currentRound: battleState.round
                                    }
                                );
                                if (applied.applied.length || applied.protected.length) {
                                    charactersChanged = true;
                                }
                                if (applied.applied.length) {
                                    const names = [...new Set(
                                        applied.applied.map(
                                            item => BUFF_CATALOG[item.key]?.name || item.key
                                        )
                                    )];
                                    lines.push(
                                        `第${result.segment}段命中效果：施加【${names.join('】、【')}】`
                                    );
                                }
                                if (applied.protected.length) {
                                    lines.push('【庇護】發動：本次命中附帶的減益無效');
                                }
                            }
                        }

                        const hitDebuffs = [
                            ...onHitStatusGrants(skill)
                        ];

                        if (
                            anyHit &&
                            (
                                actorMods.applyBlockSealOnHit ||
                                reactionFlags.applyBlockSealOnHit === true
                            )
                        ) {
                            hitDebuffs.push('block_seal');
                        }

                        if (
                            anyHit &&
                            reactionFlags.applyBleedOnHit === true
                        ) {
                            hitDebuffs.push('bleeding');
                        }

                        if (anyHit && hitDebuffs.length) {
                            const applied = await applyDebuffBundle(
                                client,
                                [attackTarget.id],
                                hitDebuffs,
                                {
                                    sourceSkillKey: skill.key,
                                    sourceCharacterId: actorId,
                                    currentRound: battleState.round
                                }
                            );

                            if (
                                applied.applied.length ||
                                applied.protected.length
                            ) {
                                charactersChanged = true;
                            }

                            if (
                                applied.applied.some(
                                    item => Boolean(
                                        BUFF_CATALOG[item.key]?.modifiers?.speedFlat
                                    )
                                )
                            ) {
                                initiativeChanged = true;
                            }

                            if (applied.applied.length) {
                                const names = [...new Set(
                                    applied.applied.map(
                                        item => BUFF_CATALOG[item.key]?.name || item.key
                                    )
                                )];
                                lines.push(`命中效果：施加【${names.join('】、【')}】`);
                            }

                            if (applied.protected.length) {
                                lines.push('【庇護】發動：本次命中附帶的減益無效');
                            }

                            if (applied.resisted.length) {
                                lines.push('【抗性】已有相同抗性狀態，本次不再生效');
                            }
                        }

                        // 鋒銳：命中後施加流血。
                        if (anyHit && actorMods.applyBleedOnHit) {
                            const applied = await applyDebuffBundle(
                                client,
                                [attackTarget.id],
                                ['bleeding'],
                                {
                                    sourceSkillKey: skill.key,
                                    sourceCharacterId: actorId,
                                    currentRound: battleState.round
                                }
                            );
                            if (applied.applied.length || applied.protected.length) {
                                charactersChanged = true;
                            }
                            if (applied.applied.length) {
                                lines.push('鋒銳：施加【流血】');
                            }
                            if (applied.protected.length) {
                                lines.push('【庇護】發動：流血無效');
                            }
                        }

                        const finalHpRow = await client.query(
                            'SELECT hp FROM characters WHERE id = $1',
                            [attackTarget.id]
                        );
                        const finalHp = Number(finalHpRow.rows[0]?.hp ?? newHp);

                        const effectLines = [];
                        if (shieldAbsorbed > 0) {
                            effectLines.push(
                                `護盾吸收 ${shieldAbsorbed}（${shieldBefore} → ${shieldAfter}）`
                            );
                        }
                        if (bleedLoss > 0) {
                            effectLines.push(`【流血】額外損失 ${bleedLoss} HP`);
                        }
                        if (berserkTriggered) {
                            effectLines.push('【狂暴】發動：本次致死傷害改為 0');
                        }
                        if (duelPrevented) {
                            effectLines.push('【死鬥】發動：HP 保留在 1');
                        }
                        if (anyBlock) {
                            effectLines.push(`格擋率 ${effectiveBlockRate}% 生效`);
                        }

                        grandTotalDamage += rawTotalDamage;
                        grandHpLoss += Math.max(0, oldHp - finalHp);

                        targetSummaries.push(
                            `⚔ ${attackTarget.name} HP ${oldHp} → ${finalHp}` +
                            (effectLines.length ? `\n${effectLines.join('；')}` : '') +
                            `\n${lines.join('\n')}`
                        );

                        allTargetResults.push({
                            targetId: Number(attackTarget.id),
                            targetName: attackTarget.name,
                            targetSnapshot: {
                                id: Number(attackTarget.id),
                                name: attackTarget.name,
                                kind: attackTarget.kind || 'player'
                            },
                            hitThreshold,
                            effectiveHit,
                            effectiveDodge,
                            effectiveCrit,
                            rawTotalDamage,
                            hpLoss: Math.max(0, oldHp - finalHp),
                            oldHp,
                            newHp: finalHp,
                            shieldAbsorbed,
                            bleedLoss,
                            berserkTriggered,
                            duelPrevented,
                            packets: segmentResults
                        });
                    }

                    if (darknessConsumed) {
                        await removeBuffKeys(
                            client,
                            actorId,
                            ['darkness']
                        );
                        charactersChanged = true;
                    }

                    // 下一次攻擊型 Buff 在整個戰技結束後消耗一次。
                    const attackConsumeKeys = [
                        ...actorMods.consumeOnAttackKeys
                    ];
                    if (empowerActive) attackConsumeKeys.push('empower');
                    if (actorBuffKeys.has('sharpness')) {
                        attackConsumeKeys.push('sharpness');
                    }

                    if (attackConsumeKeys.length) {
                        await removeBuffKeys(
                            client,
                            actorId,
                            attackConsumeKeys
                        );
                        charactersChanged = true;
                    }

                    // 攻擊後對自身施加狀態（防禦斬等）：attack_segment.afterAttackSelf
                    const selfAfter = combat.afterAttackSelf(skill);
                    if (selfAfter?.length) {
                        await applyStatusBundle(
                            client,
                            [actorId],
                            selfAfter,
                            {
                                sourceSkillKey: skill.key,
                                sourceCharacterId: actorId,
                                expiresRound: battleState.round
                            }
                        );
                        charactersChanged = true;
                    }

                    const targetLabel =
                        allTargetResults.length > 1
                            ? `${allTargetResults.length} 名敵方`
                            : allTargetResults[0]?.targetName || target.name;

                    content =
                        `⚔ ${actor.name} 使用「${skill.name}」→ ${targetLabel}\n` +
                        (
                            targetSummaries.length
                                ? targetSummaries.join('\n\n')
                                : '沒有可結算的攻擊目標'
                        );

                    payload = {
                        ...payload,
                        targetIds: attackTargetIds,
                        heals: allHealResults,
                        totalDamage: grandTotalDamage,
                        totalHpLoss: grandHpLoss,
                        targets: allTargetResults,
                        battleLogContent:
                            `${actor.name} 使用「${skill.name}」攻擊 ${targetLabel}。\n` +
                            (
                                targetSummaries.length
                                    ? targetSummaries.join('\n')
                                    : '沒有造成傷害。'
                            )
                    };

    } else if (runHeal && (skill.actionCode === 'HEAL' || onlyAction === 'HEAL')) {
        const recipientIds = Array.isArray(recipientOverride)
            ? recipientOverride.map(Number).filter(Boolean)
            : await autoRecipientIds(
                client,
                actor,
                target,
                skill
            );

        if (!recipientIds.length) {
            content = `✚ ${actor.name} 使用「${skill.name}」：沒有可恢復的目標`;
            payload = {
                ...payload,
                recipientIds: [],
                heals: [],
                totalHeal: 0,
                battleLogContent: content
            };
        } else {
        const recipientResult = await client.query(`
            SELECT *
            FROM characters
            WHERE id = ANY($1::int[])
            ORDER BY id
            FOR UPDATE
        `, [recipientIds]);

        const actorBuffResult = await client.query(`
            SELECT buff_key, stack_count, value_num
            FROM character_buffs
            WHERE character_id = $1
        `, [actorId]);

        const actorMods = buffModifiers(actorBuffResult.rows);
        const effectiveMagic = Math.floor(
            Number(actor.matk) *
            actorMods.matkMult +
            actorMods.matkFlat
        );

        const resultLines = [];
        const healResults = [];
        let totalHeal = 0;

        for (const recipient of recipientResult.rows) {
            const oldHp = Number(recipient.hp);
            let newHp = oldHp;
            let heal = 0;
            const recipientEquipped = await getEquippedSkillKeys(client, recipient.id);
            const recipientHasGrit = combat.hasGrit(recipientEquipped);
            const allowNormalHeal = combat.canReceiveNormalHeal(recipient, {
                hasGritPassive: recipientHasGrit
            });

            if (combat.healMode(skill) === 'revive') {
                if (oldHp <= 0) {
                    newHp = Math.min(Number(recipient.max_hp), 1);
                    heal = Math.max(0, newHp - oldHp);
                }
            } else if (!allowNormalHeal && combat.healMode(skill) !== 'life_transfer') {
                resultLines.push(
                    `${recipient.name} 處於擊倒，無法受到常規恢復`
                );
                healResults.push({
                    targetId: Number(recipient.id),
                    targetName: recipient.name,
                    heal: 0,
                    oldHp,
                    newHp,
                    blocked: true
                });
                continue;
            } else if (combat.healMode(skill) === 'life_transfer') {
                const transfer = Math.max(
                    0,
                    Math.floor(Number(actor.hp) * 0.5)
                );

                const actorHasDuel = actorBuffResult.rows.some(
                    row => row.buff_key === 'duel'
                );
                const actorNewHp = Math.max(
                    actorHasDuel ? 1 : 0,
                    Number(actor.hp) - transfer
                );

                newHp = Math.min(
                    Number(recipient.max_hp),
                    oldHp + transfer
                );

                heal = Math.max(0, newHp - oldHp);

                await client.query(
                    'UPDATE characters SET hp = $1 WHERE id = $2',
                    [actorNewHp, actorId]
                );
                actor.hp = actorNewHp;
                charactersChanged = true;
            } else {
                const magic = String(skill.effect).match(
                    /恢復[^【]*【([0-9.]+)(物理|魔法)】/
                );

                if (magic) {
                    const stat =
                        magic[2] === '物理'
                            ? Math.floor(
                                Number(actor.patk) *
                                actorMods.patkMult
                            )
                            : effectiveMagic;

                    heal = Math.max(
                        1,
                        Math.floor(stat * Number(magic[1]))
                    );
                } else if (percentHp) {
                    heal = Math.max(
                        1,
                        Math.floor(
                            Number(recipient.max_hp) *
                            Number(percentHp[1]) /
                            100
                        )
                    );
                }

                newHp = Math.min(
                    Number(recipient.max_hp),
                    oldHp + heal
                );
                heal = Math.max(0, newHp - oldHp);
            }

            if (newHp !== oldHp) {
                await client.query(
                    'UPDATE characters SET hp = $1 WHERE id = $2',
                    [newHp, recipient.id]
                );
                charactersChanged = true;
            }

            if (combat.healCleanse(skill)) {
                const debuffRows = await client.query(`
                    SELECT buff_key
                    FROM character_buffs
                    WHERE character_id = $1
                `, [recipient.id]);

                const debuffKeys = debuffRows.rows
                    .map(row => row.buff_key)
                    .filter(key => BUFF_CATALOG[key]?.kind === 'debuff');

                if (debuffKeys.length) {
                    await removeBuffKeys(
                        client,
                        recipient.id,
                        debuffKeys
                    );
                    charactersChanged = true;
                }
            }

            totalHeal += heal;
            healResults.push({
                targetId: Number(recipient.id),
                targetName: recipient.name,
                heal,
                oldHp,
                newHp
            });
            resultLines.push(
                `${recipient.name} HP ${oldHp} → ${newHp}` +
                (heal ? `（+${heal}）` : '')
            );
        }

            const recipientNames = recipientResult.rows.map(row => row.name);
            const recipientLabel =
                recipientNames.length > 3
                    ? `${recipientNames.length} 名角色`
                    : recipientNames.join('、') || target.name;

        content =
            `◆ ${actor.name} 使用「${skill.name}」→ ${recipientLabel}\n` +
            (
                resultLines.length
                    ? resultLines.join('\n')
                    : `目前沒有符合條件的恢復目標。\n${skill.effect}`
            );

        payload = {
            ...payload,
            recipientIds,
            heals: healResults,
            totalHeal,
            battleLogContent:
                `${actor.name} 使用「${skill.name}」→ ${recipientLabel} 進行恢復。` +
                (resultLines.length ? `\n${resultLines.join('\n')}` : '')
        };
        }
    } else if (
        skill.actionCode === 'BUFF' ||
        skill.actionCode === 'DEBUFF' ||
        skill.actionCode === 'GUARD' ||
        (skill.actionCode === 'UTILITY' && autoBuffForSkill(skill))
    ) {
        const statusKeys =
            combat.utilityMode(skill) === 'basic_guard'
                ? ['guard_ready']
                : (autoBuffForSkill(skill) || []);

        if (!statusKeys.length) {
            content =
                `◆ ${actor.name} 使用「${skill.name}」→ ${target.name}\n` +
                `${skill.effect}\n` +
                `效果已記錄；此效果目前尚未建立可計算的狀態定義。`;

            payload.battleLogContent =
                `${actor.name} 對 ${target.name} 使用「${skill.name}」。${skill.effect}`;
        } else if (combat.utilityMode(skill) === 'life_shield') {
            const hpCost = Math.max(
                1,
                Math.floor(Number(actor.max_hp) * 0.25)
            );
            const oldHp = Number(actor.hp);
            const actorHasDuel = actorBuffEntries.some(
                row => row.buff_key === 'duel'
            );
            const newHp = Math.max(
                actorHasDuel ? 1 : 0,
                oldHp - hpCost
            );
            const shieldValue = Math.max(0, oldHp - newHp);

            await client.query(
                'UPDATE characters SET hp = $1 WHERE id = $2',
                [newHp, actorId]
            );

            await applyBuffToCharacters(
                client,
                [actorId],
                'life_shield',
                {
                    sourceSkillKey: skill.key,
                    sourceCharacterId: actorId,
                    expiresRound: battleState.round,
                    valueNum: shieldValue
                }
            );

            charactersChanged = true;

            content =
                `⬆ ${actor.name} 使用「生命守護」\n` +
                `HP ${oldHp} → ${newHp}\n` +
                `獲得 ${shieldValue} 點護盾`;

            payload = {
                ...payload,
                shieldValue,
                oldHp,
                newHp,
                battleLogContent:
                    `${actor.name} 使用「生命守護」：消耗 ${hpCost} HP，獲得 ${shieldValue} 點護盾。`
            };
        } else if (combat.utilityMode(skill) === 'light_link') {
            const beforeLinkMods = buffModifiers(actorBuffEntries);
            const beforeLinkMagic = Math.floor(
                Number(actor.matk) * beforeLinkMods.matkMult +
                beforeLinkMods.matkFlat
            );
            const afterLinkMagic = Math.floor(
                Number(actor.matk) *
                Math.max(0, beforeLinkMods.matkMult - 0.5) +
                beforeLinkMods.matkFlat
            );
            const lostMagic = Math.max(
                0,
                beforeLinkMagic - afterLinkMagic
            );

            await applyBuffToCharacters(
                client,
                [actorId],
                'light_link_loss',
                {
                    sourceSkillKey: skill.key,
                    sourceCharacterId: actorId,
                    expiresRound: battleState.round
                }
            );

            await applyBuffToCharacters(
                client,
                [targetId],
                'light_link_gain',
                {
                    sourceSkillKey: skill.key,
                    sourceCharacterId: actorId,
                    expiresRound: battleState.round,
                    valueNum: lostMagic
                }
            );

            charactersChanged = true;

            content =
                `✨ ${actor.name} 使用「熠光連結」→ ${target.name}\n` +
                `${actor.name} 魔法攻擊 -50%\n` +
                `${target.name} 魔法攻擊 +${lostMagic}`;

            payload = {
                ...payload,
                lostMagic,
                battleLogContent:
                    `${actor.name} 使用「熠光連結」連結 ${target.name}：` +
                    `${actor.name} 魔法攻擊 -50%，${target.name} 魔法攻擊 +${lostMagic}。`
            };
        } else {
            let recipientIds;

            // 狀態記在自身（死鬥 value_num = 目標 id；狂暴／假死本身也是 SELF）
            if (combat.applySelfStatus(skill)) {
                recipientIds = [actorId];
            } else {
                recipientIds = await autoRecipientIds(
                    client,
                    actor,
                    target,
                    skill
                );
            }

            const expiresRound =
                statusKeys.some(key =>
                    typeof key === 'string' &&
                    ['stun', 'darkness', 'frozen', 'feign_death', 'berserk'].includes(key)
                )
                    ? battleState.round + 1
                    : skillBuffExpiresRound(skill, battleState.round);

            let application = {
                applied: [],
                protected: [],
                resisted: []
            };

            const valueNum = combat.buffValueFromTarget(skill)
                ? Number(targetId)
                : null;

            const hasDebuffOrSpecial = statusKeys.some(key => {
                if (typeof key === 'object' && key.type === 'mod') {
                    return Number(key.value) < 0;
                }
                const definition = lookupBuff(
                    typeof key === 'string' ? key : null
                );
                return definition && (
                    definition.kind === 'debuff' ||
                    definition.kind === 'special' ||
                    definition.resistance
                );
            });

            if (hasDebuffOrSpecial) {
                application = await applyDebuffBundle(
                    client,
                    recipientIds,
                    statusKeys,
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        currentRound: battleState.round
                    }
                );

                if (combat.buffValueFromTarget(skill) && application.applied.length) {
                    await client.query(`
                        UPDATE character_buffs
                        SET value_num = $1,
                            expires_round = $2
                        WHERE character_id = $3
                          AND buff_key = 'duel'
                    `, [valueNum, battleState.round, actorId]);
                }
            } else {
                await applyStatusBundle(
                    client,
                    recipientIds,
                    statusKeys,
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        expiresRound,
                        valueNum
                    }
                );

                application.applied = recipientIds.flatMap(
                    characterId => statusKeys.map(key => ({ characterId, key }))
                );
            }

            charactersChanged =
                charactersChanged ||
                application.applied.length > 0 ||
                application.protected.length > 0;

            // 資源增益由 skill / buff_segment.resourceGain 宣告（防守姿態 SP、進攻架勢 AP 等）
            const resourceGain = combat.resourceGainOnBuff(skill);
            if (resourceGain && (resourceGain.ap || resourceGain.sp)) {
                await combat.applyApSpGain(client, actorId, {
                    ap: Number(resourceGain.ap || 0),
                    sp: Number(resourceGain.sp || 0),
                    manual: false,
                    getCharacterBuffEntries,
                    removeBuffKeys
                });
                charactersChanged = true;
            }

            const recipientNamesResult = await client.query(`
                SELECT name
                FROM characters
                WHERE id = ANY($1::int[])
                ORDER BY id
            `, [recipientIds]);

            const recipientNames = recipientNamesResult.rows.map(
                row => row.name
            );
            const recipientLabel =
                recipientNames.length > 3
                    ? `${recipientNames.length} 名角色`
                    : recipientNames.join('、');

            const statusLines = [];

            if (application.protected.length) {
                statusLines.push('【庇護】發動：本次減益無效');
            }

            if (application.resisted.length) {
                statusLines.push('【抗性】同一狀態本場戰鬥已生效過，本次無效');
            }

            const grantLabel = (grant) => {
                if (typeof grant === 'object' && grant.type === 'mod') {
                    return combat.formatModLabel(grant.stat, grant.mode, grant.value);
                }
                if (typeof grant === 'string') {
                    return lookupBuff(grant)?.name || grant;
                }
                return null;
            };
            const grantEffect = (grant) => {
                if (typeof grant === 'object' && grant.type === 'mod') {
                    return grantLabel(grant);
                }
                if (typeof grant === 'string') {
                    const def = lookupBuff(grant);
                    return def?.effect || def?.name || grant;
                }
                return null;
            };
            const grantKind = (grant) => {
                if (typeof grant === 'object' && grant.type === 'mod') {
                    return Number(grant.value) < 0 ? 'debuff' : 'buff';
                }
                if (typeof grant === 'string') {
                    return lookupBuff(grant)?.kind || null;
                }
                return null;
            };

            const appliedNames = statusKeys
                .map(grantLabel)
                .filter(Boolean)
                .join('、');
            const appliedEffects = statusKeys
                .map(grantEffect)
                .filter(Boolean)
                .join('；');

            const appliedLabel = application.applied.length
                ? (appliedNames || '目標')
                : '';
            const primaryKind = statusKeys
                .map(grantKind)
                .find(Boolean) || 'buff';

            content =
                `${primaryKind === 'debuff' ? '⬇' : '⬆'} ` +
                `${actor.name} 使用「${skill.name}」→ ${recipientLabel}\n` +
                `${appliedLabel}` +
                (statusLines.length ? `\n${statusLines.join('\n')}` : '') +
                (
                    application.applied.length && expiresRound
                        ? `\n持續至第 ${expiresRound} 輪結束或效果提前觸發`
                        : ''
                );

            payload = {
                ...payload,
                statusKeys,
                recipientIds,
                application,
                battleLogContent:
                    `${actor.name} 使用「${skill.name}」→ ${recipientLabel}。` +
                    ` ${appliedLabel}。` +
                    (statusLines.length ? ` ${statusLines.join('；')}。` : '')
            };

            initiativeChanged =
                initiativeChanged ||
                statusKeys.some(key => {
                    if (typeof key === 'object' && key.type === 'mod') {
                        return key.stat === 'speed' && key.value;
                    }
                    const m = lookupBuff(key)?.modifiers || {};
                    return Boolean(m.speedFlat) || Boolean(m.initiativeFirst);
                });
        }
    } else if (runMove && skill.actionCode === 'MOVE') {
        const moveParams = combat.moveSegmentParams(skill);
        if (moveParams.swap) {
            const grantBoth = Array.isArray(moveParams.grantBoth)
                ? moveParams.grantBoth
                : [];

            if ((actor.kind || 'player') !== (target.kind || 'player')) {
                throw new Error('交換位置只能指定友方');
            }
            if (Number(actor.id) === Number(target.id)) {
                throw new Error('error');
            }

            const swap = await swapCharacterPositions(
                client,
                actor.id,
                target.id
            );

            if (grantBoth.length) {
                await applyStatusBundle(
                    client,
                    [actor.id, target.id],
                    grantBoth,
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actor.id,
                        expiresRound: battleState.round
                    }
                );
                charactersChanged = true;
            }

            content =
                `↔ ${actor.name} 使用「${skill.name}」與 ${target.name} 交換位置` +
                (
                    grantBoth.length
                        ? `\n雙方本輪迴避 +30`
                        : `\n位置已立即互換；代受效果需在被攻擊指定時使用`
                );

            payload = {
                ...payload,
                swapped: true,
                swap,
                battleLogContent:
                    `${actor.name} 使用「${skill.name}」→ ${target.name} 交換戰場位置。` +
                    (
                        grantBoth.length
                            ? ' 雙方本輪迴避 +30。'
                            : ' 快速移位的代受效果需在被攻擊指定時使用。'
                    )
            };

            // Emitting here would announce the swap before COMMIT; hand it back
            // so the route broadcasts it once the transaction succeeded.
            battlefieldChanged = true;
            domainEvents.push({
                event: 'battlefield:changed',
                data: {
                    reason: 'swap',
                    firstCharacterId: Number(actor.id),
                    secondCharacterId: Number(target.id)
                }
            });
        } else {
            content =
                `◆ ${actor.name} 使用「${skill.name}」\n${skill.effect}\n` +
                `此移動戰技已記錄；需要指定空格的效果可直接拖曳角色完成。`;
            payload.battleLogContent =
                `${actor.name} 使用「${skill.name}」。${skill.effect}`;
        }
    } else {
        content =
            `◆ ${actor.name} 使用「${skill.name}」→ ${target.name}\n` +
            `${skill.effect}\n` +
            `目前已完成目標限制與資源消耗，特殊效果仍以戰鬥紀錄為準。`;

        payload.battleLogContent =
            `${actor.name} 對 ${target.name} 使用「${skill.name}」。${skill.effect}`;
    }

    const flowSteps = combat.compilePipeline(skill).steps;
    payload.skillFlow = flowSteps.map(
        step => step.timing || step.module
    );

    return {
        content,
        payload,
        charactersChanged,
        battlefieldChanged,
        initiativeChanged,
        domainEvents
    };
}

app.post('/api/combat/use-skill', async (req, res) => {
    const actorId = number(req.body.actorId);
    let targetId = number(req.body.targetId, actorId);
    const requestedDirection = String(req.body.direction || '').toUpperCase();
    const skillKey = String(req.body.skillKey || '');
    const reactionResumeId = number(req.body.reactionResumeId, 0);
    let reactionFlags = {};
    const skill = SKILL_CATALOG[skillKey] || ALL_EQUIPPABLE_SKILLS.get(skillKey);

    if (!skill) return res.status(400).json({ error: '未知的戰技' });
    try {
        combat.requireSkillRegistered(skill.key);
    } catch (error) {
        return res.status(400).json({ error: error.message || '未登記戰技' });
    }
    if (skill.manual === false || skill.actionCode === 'PASSIVE') {
        // oncePerBattle / castablePassive skills (e.g. 無限可能的呼喚) stay castable.
        if (!skill.castablePassive && !skill.oncePerBattle) {
            return res.status(400).json({ error: 'error' });
        }
    }

    const isAutoCast = Boolean(req.body.autoCast);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (reactionResumeId) {
            const claimed = await client.query(`
                UPDATE reaction_windows
                SET status = 'resolving'
                WHERE id = $1
                  AND status = 'ready'
                  AND blocking = TRUE
                RETURNING *
            `, [reactionResumeId]);

            if (!claimed.rows.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: '反應時點已被其他玩家結算或已失效'
                });
            }

            const resumeWindow = mapReactionWindow(claimed.rows[0]);
            const resume = resumeWindow.resumePayload || {};
            const resolution = resumeWindow.resolution || {};

            if (
                Number(resume.actorId) !== actorId ||
                String(resume.skillKey) !== skillKey
            ) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: '反應時點與目前戰技不一致'
                });
            }

            targetId = Number(resolution.targetId || resume.targetId || targetId);
            reactionFlags = resolution.flags || {};

            if (resume.stack) {
                await saveFlowStack(
                    client,
                    combat.restoreStack(resume.stack)
                );
            }
        } else {
            const blockingReaction = await client.query(`
                SELECT id
                FROM reaction_windows
                WHERE status IN ('open', 'ready', 'queued')
                  AND blocking = TRUE
                ORDER BY id DESC
                LIMIT 1
            `);

            if (blockingReaction.rows.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: '請先處理目前的攻擊反應時點'
                });
            }

            const expiredIds = await expireNonBlockingReactions(client);
            if (expiredIds.length) {
                process.nextTick(() => {
                    for (const id of expiredIds) {
                        io.emit('combat:reaction-closed', { id });
                    }
                });
            }
        }

        if (!(await actorHasSkill(client, actorId, skillKey))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '這個角色目前沒有攜帶該戰技' });
        }

        const actorResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [actorId]
        );

        if (!actorResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        const actor = actorResult.rows[0];

        // 資源必須在指定目標／開反應窗之前就確認，避免騙出他人反應後才因 AP/SP 不足失敗。
        // 反應續結且已扣過費時略過。
        if (!reactionFlags.costSpent) {
            try {
                combat.assertSkillCostAvailable(actor, skill);
            } catch (costError) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: costError.message || '資源不足' });
            }
        }

        if (
            (skill.targetCode || 'SELF') === 'SELF' ||
            (skill.targetCode || '') === 'ALL_ALLIES'
        ) {
            targetId = actorId;
        }

        const targetResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [targetId]
        );

        if (!targetResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        const target = targetResult.rows[0];

        if (!targetAllowed(skill, actor, target)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error:
                    skill.actionCode === 'ATTACK'
                        ? '攻擊戰技只能指定仍存活的敵方'
                        : skill.actionCode === 'HEAL'
                            ? '恢復戰技只能指定符合條件的友方'
                            : '這個目標不符合戰技的指定條件'
            });
        }

        const battleState = await getBattleClock(client, true);

        // oncePerBattle：非主動／非輔助，無戰技時點，每場一次（無限可能的呼喚等）
        if (skill.oncePerBattle) {
            const stateRow = await client.query(
                'SELECT once_flags FROM battle_state WHERE id = 1 FOR UPDATE'
            );
            const onceFlags = stateRow.rows[0]?.once_flags || {};
            const used = onceFlags.infiniteCall || {};
            if (used[String(actorId)]) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `「${skill.name}」本場戰鬥已使用過`
                });
            }

            await client.query(
                'UPDATE characters SET ap = LEAST(max_ap, ap + 1), sp = LEAST(max_sp, sp + 1) WHERE id = $1',
                [actorId]
            );
            await applyBuffToCharacters(client, [actorId], 'infinite_call_debt', {
                sourceSkillKey: skill.key,
                sourceCharacterId: actorId
            });
            onceFlags.infiniteCall = { ...used, [String(actorId)]: true };
            await client.query(
                'UPDATE battle_state SET once_flags = $1::jsonb, updated_at = NOW() WHERE id = 1',
                [JSON.stringify(onceFlags)]
            );

            const content =
            `✦ ${actor.name} 使用「${skill.name}」\nAP+1、SP+1；下一次恢復的 AP/SP -1`;
            const message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content,
                payload: { skillKey, special: 'once_per_battle' }
            });
            await client.query('COMMIT');
            io.emit('chat:message', message);
            io.emit('characters:changed');
            return res.json({ success: true, message });
        }

        // 蓄力中不可另開主要／輔助行動（自動發動除外）
        if (!reactionResumeId && !isAutoCast) {
            const chargingEntries = await getCharacterBuffEntries(client, actorId);
            if (chargingEntries.some(row => row.buff_key === 'charging')) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `${actor.name} 正在蓄力，無法發動其他戰技`
                });
            }
        }

        // 通用蓄力宣言：只 +1 蓄力、掛 charging，不進戰技發動時點
        if (
            !reactionResumeId &&
            !isAutoCast &&
            combat.isChargeSkill(skill) &&
            !combat.isRescueSkill(skill)
        ) {
            await enforceActionRestrictions(
                client, actor, skill, target, requestedDirection
            );
            const cost = await spendSkillCost(client, actor, skill);
            const charge = await combat.beginCharge(client, {
                actorId,
                targetId,
                skill,
                round: battleState.round,
                turnPass: battleState.turnPass
            });
            await applyBuffToCharacters(client, [actorId], 'charging', {
                sourceSkillKey: skill.key,
                sourceCharacterId: actorId,
                valueNum: charge.progress
            });

            const content =
                `⏳ ${actor.name} 「${skill.name}」開始蓄力` +
                `${charge.progress}/${charge.required}）\n` +
                `消耗 ${cost.amount}${String(cost.type || '').toUpperCase()}` +
                `\n（不觸發發動戰技時點；達到蓄力後於自身回合自動發動）`;

            const message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content,
                payload: {
                    skillKey,
                    targetId,
                    charging: true,
                    charge
                }
            });

            await client.query('COMMIT');
            io.emit('chat:message', message);
            io.emit('characters:changed');
            return res.json({ success: true, message, charging: true });
        }

        if (isAutoCast) {
            const charges = await combat.getActiveCharges(client, actorId);
            const match = charges.find(row => String(row.skill_key) === String(skillKey));
            if (match) await combat.clearCharge(client, match.id);
            const remaining = await combat.getActiveCharges(client, actorId);
            if (!remaining.length) {
                await removeBuffKeys(client, actorId, ['charging']);
            }
        }

        if (!reactionResumeId && combat.isActiveSkill(skill)) {
            try {
                await assertFreeTimingForActiveSkill(client, skill);
            } catch (timingError) {
                await client.query('ROLLBACK');
                return res.status(timingError.status || 409).json({
                    error: timingError.message || '目前不是自由時點'
                });
            }
        }

        // Timing pauses (ON_TARGET_DECLARED etc.) are handled by combat.startSkill below.

        // 待機：不消耗主要行動；可在此處理嘲諷 / 中立影響。
        if (combat.isWaitSkill(skill)) {
            await enforceActionRestrictions(client, actor, skill, target, requestedDirection);
            const waitStatus = await triggerActionStatuses(
                client,
                actor,
                skill,
                battleState.round
            );

            const content =
                `◆ ${actor.name} 選擇待機。` +
                (
                    waitStatus.lines.length
                        ? `\n${waitStatus.lines.join('\n')}`
                        : ''
                );

            const message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'wait',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content,
                payload: { skillKey: 'wait', actionCode: 'WAIT' }
            });

            const battleEvent = await insertBattleEvent(client, {
                eventType: 'wait',
                round: battleState.round,
                turnPass: battleState.turnPass,
                actorId: actor.id,
                content:
                    `${actor.name} 選擇待機。` +
                    (
                        waitStatus.lines.length
                            ? ` ${waitStatus.lines.join('；')}`
                            : ''
                    ),
                payload: { skillKey: 'wait' }
            });

            await clearFlowStack(client);
            await client.query('COMMIT');
            io.emit('chat:message', message);
            io.emit('battle:event', battleEvent);
            if (waitStatus.changed) io.emit('characters:changed');

            return res.json({
                success: true,
                message,
                result: message.payload
            });
        }

        // 救援：【蓄力】
        if (combat.isRescueSkill(skill)) {
            const existing = await client.query(`
                SELECT id
                FROM pending_actions
                WHERE actor_id = $1
                  AND skill_key = 'rescue'
            `, [actorId]);

            if (existing.rows.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `${actor.name} 已經在蓄力「救援」`
                });
            }

            await enforceActionRestrictions(client, actor, skill, target, requestedDirection);

            const rescueStatus = await triggerActionStatuses(
                client,
                actor,
                skill,
                battleState.round
            );

            const cost = await spendSkillCost(client, actor, skill);

            await client.query(`
                INSERT INTO pending_actions (
                    actor_id,
                    target_id,
                    skill_key,
                    created_round,
                    created_turn_pass
                )
                VALUES ($1, $2, 'rescue', $3, $4)
            `, [
                actorId,
                targetId,
                battleState.round,
                battleState.turnPass
            ]);

            const content =
                `✚ ${actor.name} 使用「救援」→ ${target.name}\n` +
                `消耗 ${cost.amount}${String(cost.type || '').toUpperCase()}\n` +
                `⏳ 階段1：於 ${actor.name} 下一回合開始時結算。` +
                (
                    rescueStatus.lines.length
                        ? `\n${rescueStatus.lines.join('\n')}`
                        : ''
                );

            const message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content,
                payload: {
                    skillKey,
                    targetId,
                    charging: true
                }
            });

            const battleEvent = await insertBattleEvent(client, {
                eventType: 'skill',
                round: battleState.round,
                turnPass: battleState.turnPass,
                actorId: actor.id,
                targetId: target.id,
                content:
                    `${actor.name} 對 ${target.name} 使用「救援」：` +
                    `消耗 ${cost.amount}${String(cost.type || '').toUpperCase()}，開始蓄力`,
                payload: {
                    skillKey,
                    charging: true
                }
            });

            await clearFlowStack(client);
            await client.query('COMMIT');
            io.emit('chat:message', message);
            io.emit('battle:event', battleEvent);
            io.emit('characters:changed');

            return res.json({
                success: true,
                message,
                result: message.payload
            });
        }

        const actionRestriction = await enforceActionRestrictions(
            client,
            actor,
            skill,
            target,
            requestedDirection
        );

        // Cost is spent by the timing engine (spend_cost primitive), except resume
        // after a pause that already spent.
        let cost = { type: null, amount: 0 };
        if (reactionResumeId && reactionFlags.costSpent) {
            cost = {
                type: reactionFlags.costType || null,
                amount: Number(reactionFlags.costAmount || 0)
            };
        }

        if (actionRestriction.consumeTaunt) {
            await removeBuffKeys(client, actorId, ['taunt']);
        }

        let charactersChanged = false;
        let initiativeChanged = false;
        let content = '';
        const resolutionMeta = combat.beginSkillResolution({
            actor,
            target,
            skill,
            direction: requestedDirection || null,
            round: battleState.round,
            turnPass: battleState.turnPass,
            flags: reactionFlags
        });
        let payload = combat.annotateSkillPayload({
            skillKey,
            targetId,
            actionCode: skill.actionCode,
            targetCode: skill.targetCode,
            phase: combat.RESOLUTION_PHASES.EXECUTE
        }, resolutionMeta);

        // 需要結算時使用完整 Buff entry，避免只拿 Buff 定義而漏掉層數。
        const combatBuffRows = await client.query(`
            SELECT
                character_id,
                buff_key,
                stack_count,
                value_num
            FROM character_buffs
            WHERE character_id = ANY($1::int[])
        `, [[actorId, targetId]]);

        const actorBuffEntries = combatBuffRows.rows.filter(
            row => Number(row.character_id) === Number(actorId)
        );
        const targetBuffEntries = combatBuffRows.rows.filter(
            row => Number(row.character_id) === Number(targetId)
        );

        const actorBuffKeys = new Set(
            actorBuffEntries.map(row => row.buff_key)
        );
        const targetBuffKeys = new Set(
            targetBuffEntries.map(row => row.buff_key)
        );


        const timingDeps = buildTimingEngineDeps(client, {
            actor,
            target,
            skill,
            actorId,
            targetId,
            battleState,
            reactionFlags,
            requestedDirection,
            actorBuffEntries,
            targetBuffEntries,
            cost,
            payload,
            costAlreadySpent: Boolean(reactionFlags.costSpent)
        });

        let engineResult;
        if (reactionResumeId) {
            let stack = await loadFlowStack(client);
            engineResult = await combat.resumeSkill(client, stack, {
                flags: reactionFlags,
                targetId,
                pickedTargetId: number(req.body.pickedTargetId, 0) || null,
                advanceIndex: true
            }, timingDeps);
        } else {
            await clearFlowStack(client);
            engineResult = await combat.startSkill(client, {
                skill,
                actor,
                target,
                battleState,
                direction: requestedDirection,
                flags: { ...reactionFlags }
            }, timingDeps);
        }

        await saveFlowStack(client, engineResult.stack || []);
        if (timingDeps.state.cost) cost = timingDeps.state.cost;

        content = timingDeps.state.content || engineResult.content || '';
        let battlefieldChanged = false;
        payload = {
            ...payload,
            ...(timingDeps.state.payload || {}),
            pickRequest: engineResult.pickRequest || null,
            timingPaused: Boolean(engineResult.paused),
            skillFlow: (combat.topFrame(engineResult.stack || []) || {}).context?.meta?.skillFlow || []
        };
        charactersChanged = charactersChanged || timingDeps.state.charactersChanged;
        battlefieldChanged = battlefieldChanged || timingDeps.state.battlefieldChanged;
        initiativeChanged = initiativeChanged || timingDeps.state.initiativeChanged;

        if (engineResult.pickRequest) {
            const pickMessage = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'timing_pick',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content: engineResult.pickRequest.prompt || '請選擇適用目標',
                payload: {
                    pickRequest: engineResult.pickRequest,
                    skillKey: skill.key
                }
            });
            await client.query('COMMIT');
            io.emit('chat:message', pickMessage);
            io.emit('combat:timing-pick', engineResult.pickRequest);
            return res.json({
                success: true,
                pendingPick: true,
                pickRequest: engineResult.pickRequest,
                message: pickMessage
            });
        }

        if (engineResult.paused && engineResult.openedWindows?.length) {
            const reactionWindows = engineResult.openedWindows;
            const reactionWindow = reactionWindows[0];
            // Chat only announces the timing wait ??option names live in the UI panel.
            // Listing「誰的快速解咒」here made it look like the reaction already fired.
            const waitLine =
                `${combat.timingLabel(reactionWindow.triggerType)} ・等待反應`;

            // Post damage / skill progress from this step before the wait prompt.
            const progressContent = String(content || '').trim();
            let progressMessage = null;
            if (progressContent) {
                progressMessage = await insertChatMessage(client, {
                    channel: 'combat',
                    messageType: 'skill',
                    characterId: actor.id,
                    characterName: actor.name,
                    characterKind: actor.kind || 'player',
                    content: progressContent,
                    payload: {
                        ...payload,
                        reactionWindowId: reactionWindow.id,
                        reactionBatchId: reactionWindow.batchId,
                        partial: true
                    }
                });
            }

            const declareText = reactionResumeId || progressContent
                ? waitLine
                : `◆ ${actor.name} 使用「${skill.name}」→ ${target.name}\n${waitLine}`;

            const declarationMessage = await insertChatMessage(client, {
                channel: 'combat',
                messageType: progressContent ? 'reaction_prompt' : 'attack_declare',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content: declareText,
                payload: {
                    reactionWindowId: reactionWindow.id,
                    reactionBatchId: reactionWindow.batchId,
                    skillKey: skill.key,
                    targetId: target.id,
                    skillFlow: payload.skillFlow
                }
            });

            // Prevent the same attack text from being posted again on later resumes.
            clearStackChatMessages(engineResult.stack);
            await saveFlowStack(client, engineResult.stack || []);
            for (const window of reactionWindows) {
                if (!window?.id || !window.resumePayload) continue;
                const cleaned = clearResumePayloadChatMessages(window.resumePayload);
                window.resumePayload = cleaned;
                await client.query(`
                    UPDATE reaction_windows
                    SET resume_payload = $2::jsonb
                    WHERE id = $1
                `, [window.id, JSON.stringify(cleaned)]);
            }

            if (reactionResumeId) {
                await client.query(`
                    UPDATE reaction_windows
                    SET status = 'resolved',
                        resolved_at = NOW()
                    WHERE id = $1
                `, [reactionResumeId]);
            }

            await client.query('COMMIT');
            if (progressMessage) io.emit('chat:message', progressMessage);
            io.emit('chat:message', declarationMessage);
            if (charactersChanged) io.emit('characters:changed');
            if (reactionResumeId) {
                io.emit('combat:reaction-closed', { id: reactionResumeId });
            }
            broadcastReactionWindows(reactionWindows);

            const readyLead = reactionWindows.find(
                item => item.status === 'ready' && item.resumePayload
            );
            return res.json({
                success: true,
                reactionPending: !readyLead,
                reactionWindow: readyLead || reactionWindow,
                reactionWindows,
                resume: Boolean(readyLead),
                message: progressMessage || declarationMessage
            });
        }

        const flowFinish = { openedWindows: engineResult.openedWindows || [] };

        let postReactionWindows = (flowFinish.openedWindows || []).filter(
            window => !window.blocking && window.status === 'open'
        );

        if (!postReactionWindows.length && engineResult.paused) {
            postReactionWindows = (flowFinish.openedWindows || []).filter(
                window => window.blocking
            );
        }

        // Post-skill reactions are emitted by the timing bus during AFTER_SKILL;
        // keep a soft fallback only when the engine produced no windows.
        if (!postReactionWindows.length && !engineResult.paused) {
            const postReactionOptions =
                await collectPostActionReactionOptions(
                    client,
                    actor,
                    skill,
                    payload,
                    cost
                );

            if (postReactionOptions.length) {
                postReactionWindows = asReactionWindowList(
                    await createReactionWindow(client, {
                        triggerType: combat.TIMING.AFTER_SKILL,
                        blocking: false,
                        sourceActorId: actor.id,
                        sourceTargetId: target.id,
                        sourceSkillKey: skill.key,
                        round: battleState.round,
                        turnPass: battleState.turnPass,
                        context: {
                            timingCode: combat.TIMING.AFTER_SKILL,
                            timingLabel: combat.timingLabel(
                                combat.TIMING.AFTER_SKILL
                            ),
                            actorId: actor.id,
                            actorName: actor.name,
                            targetId: target.id,
                            targetName: target.name,
                            skillName: skill.name,
                            actionCode: skill.actionCode,
                            cost
                        },
                        options: postReactionOptions,
                        resumePayload: null
                    })
                );
            }
        }

        const postReactionWindow = postReactionWindows[0] || null;

        // Resume that only finishes leftover timings should not spam
        // another bare "◆ 使用戰技" if the cast/damage was already narrated.
        const genericFallback = `◆ ${actor.name} 使用「${skill.name}」`;
        if (!String(content || '').trim()) {
            content = reactionResumeId ? '' : genericFallback;
        }

        let message = null;
        let battleEvent = null;

        if (String(content || '').trim()) {
            message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content,
                payload
            });

            battleEvent = await insertBattleEvent(client, {
                eventType: 'skill',
                round: battleState.round,
                turnPass: battleState.turnPass,
                actorId: actor.id,
                targetId: target.id,
                content:
                    payload.battleLogContent ||
                    content,
                payload
            });
        }

        if (reactionResumeId) {
            await client.query(`
                UPDATE reaction_windows
                SET status = 'resolved',
                    resolved_at = NOW()
                WHERE id = $1
            `, [reactionResumeId]);
        }

        await client.query('COMMIT');

        if (message) io.emit('chat:message', message);
        if (battleEvent) io.emit('battle:event', battleEvent);

        if (reactionResumeId) {
            io.emit('combat:reaction-closed', {
                id: reactionResumeId
            });
        }

        const emitWindows = [
            ...postReactionWindows,
            ...(flowFinish.openedWindows || [])
        ];
        const seen = new Set();
        const uniqueWindows = [];
        for (const window of emitWindows) {
            if (!window || seen.has(window.id)) continue;
            seen.add(window.id);
            uniqueWindows.push(window);
        }
        if (uniqueWindows.length) {
            broadcastReactionWindows(uniqueWindows);
        }

        if (charactersChanged) {
            io.emit('characters:changed');
        }

        if (initiativeChanged) {
            broadcastCombatState().catch(error => console.error(error));
        }

        return res.json({
            success: true,
            message,
            result: payload,
            reactionWindow: postReactionWindow,
            reactionWindows: uniqueWindows
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {}

        console.error(error);
        return res.status(500).json({
            error: error.message || '使用戰技失敗'
        });
    } finally {
        client.release();
    }
});

app.post('/api/combat/reset', async (_req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const combatants = await getCombatants(client);
        const firstId = combatants[0]?.id || null;

        await client.query('DELETE FROM pending_actions');
        await client.query('DELETE FROM reaction_windows');
        await client.query('DELETE FROM status_resistances');
        await client.query(`DELETE FROM character_buffs WHERE source_skill_key IS NOT NULL`);
        await client.query('DELETE FROM battle_events');

        await client.query(`
            UPDATE battle_state
            SET round_number = 1,
                turn_pass = 1,
                current_character_id = $1,
                flow_stack = '{"frames":[],"frameSeq":1}'::jsonb,
                updated_at = NOW()
            WHERE id = 1
        `, [firstId]);

        const startEvent = await insertBattleEvent(client, {
            eventType: 'battle_start',
            round: 1,
            turnPass: 1,
            content: '戰鬥開始'
        });
        const phaseEvent = await insertBattleEvent(client, {
            eventType: 'phase',
            round: 1,
            turnPass: 1,
            content: '戰鬥開始'
        });

        const timingWindows = await emitTimingHooks(
            client,
            [combat.TIMING.BATTLE_START],
            {
                actionKind: 'battle',
                triggerCharacterId: firstId,
                actorId: firstId,
                round: 1,
                turnPass: 1
            }
        );

        await client.query('COMMIT');

        const state = buildCombatState(1, 1, firstId, combatants);
        io.emit('combat:state', state);
        io.emit('battle:reset', [startEvent, phaseEvent]);
        io.emit('characters:changed');
        broadcastReactionWindows(timingWindows);
        res.json(state);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: 'error' });
    } finally {
        client.release();
    }
});

app.post('/api/combat/next-turn', async (_req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const state = await getCombatState(client, true);
        const combatants = state.combatants;

        if (!combatants.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '目前沒有角色可進行戰鬥' });
        }

        let currentIndex = combatants.findIndex(
            character => character.id === state.currentCharacterId
        );
        if (currentIndex < 0) currentIndex = 0;

        let startIndex = currentIndex + 1;
        let nextTurnPass = state.turnPass;

        if (startIndex >= combatants.length) {
            startIndex = 0;
            nextTurnPass += 1;
        }

        const selected = await findUsableTurnActor(
            client,
            combatants,
            startIndex,
            state.round,
            nextTurnPass
        );

        const nextId = selected.actorId;
        nextTurnPass = selected.turnPass;

        await client.query(`
            UPDATE battle_state
            SET current_character_id = $1,
                turn_pass = $2,
                updated_at = NOW()
            WHERE id = 1
        `, [nextId, nextTurnPass]);

        const events = [];

        if (nextTurnPass !== state.turnPass) {
            events.push(await insertBattleEvent(client, {
                eventType: 'phase',
                round: state.round,
                turnPass: nextTurnPass,
                content: battleClockLabel(state.round, nextTurnPass)
            }));
        }

        events.push(...selected.statusEvents);

        const nextCharacter = combatants.find(
            character => character.id === nextId
        );

        events.push(await insertBattleEvent(client, {
            eventType: 'turn',
            round: state.round,
            turnPass: nextTurnPass,
            actorId: nextId,
            content: `輪到 ${nextCharacter?.name || '角色'} 行動。`
        }));

        const resolution = await resolvePendingActionsForActor(
            client,
            nextId,
            { round: state.round, turnPass: nextTurnPass }
        );

        const timingWindows = await combat.emitTurnChange(
            client,
            {
                endingCharacterId: state.currentCharacterId,
                startingCharacterId: nextId,
                round: state.round,
                turnPass: nextTurnPass
            },
            timingPipelineDeps()
        );

        await client.query('COMMIT');

        for (const message of selected.statusMessages) {
            io.emit('chat:message', message);
        }
        for (const message of resolution.messages) {
            io.emit('chat:message', message);
        }

        for (const event of [...events, ...(resolution.events || [])]) {
            io.emit('battle:event', event);
        }

        if (
            selected.charactersChanged ||
            resolution.charactersChanged
        ) {
            io.emit('characters:changed');
        }

        const refreshedCombatants = await getCombatants();
        const newState = buildCombatState(
            state.round,
            nextTurnPass,
            nextId,
            refreshedCombatants
        );

        io.emit('combat:state', newState);
        broadcastReactionWindows(timingWindows);
        if (resolution.autoCastQueue?.length) {
            io.emit('combat:auto-cast', {
                actorId: nextId,
                queue: resolution.autoCastQueue
            });
        }
        res.json({
            ...newState,
            autoCastQueue: resolution.autoCastQueue || []
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '更新戰場失敗' });
    } finally {
        client.release();
    }
});

app.post('/api/combat/next-round', async (_req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const clock = await getBattleClock(client, true);
        const nextRound = clock.round + 1;

        // 傳承：快照本輪結束前仍持有的增益（在過期刪除之前）
        const buffSnap = await client.query(`
            SELECT cb.character_id, cb.buff_key
            FROM character_buffs cb
            ORDER BY cb.character_id, cb.buff_key
        `);
        const roundEndBuffs = {};
        for (const row of buffSnap.rows) {
            const def = BUFF_CATALOG[row.buff_key];
            if (!def || def.kind !== 'buff') continue;
            const id = String(row.character_id);
            if (!roundEndBuffs[id]) roundEndBuffs[id] = [];
            roundEndBuffs[id].push({ buffKey: row.buff_key });
        }
        const onceRow = await client.query(
            'SELECT once_flags FROM battle_state WHERE id = 1 FOR UPDATE'
        );
        const onceFlags = onceRow.rows[0]?.once_flags || {};
        onceFlags.roundEndBuffs = roundEndBuffs;
        await client.query(
            'UPDATE battle_state SET once_flags = $1::jsonb WHERE id = 1',
            [JSON.stringify(onceFlags)]
        );

        const expiredPreview = await client.query(`
            SELECT
                cb.character_id,
                cb.buff_key,
                cb.value_num,
                c.name AS character_name
            FROM character_buffs cb
            JOIN characters c ON c.id = cb.character_id
            WHERE cb.expires_round IS NOT NULL
              AND cb.expires_round < $1
            ORDER BY cb.character_id, cb.buff_key
        `, [nextRound]);

        const expirationEvents = [];
        let expirationChangedCharacters = false;

        // 死鬥：狀態結束時，若指定敵人仍未被擊倒，自己 HP 降至 0。
        for (const expiredBuff of expiredPreview.rows) {
            if (
                expiredBuff.buff_key === 'duel' &&
                expiredBuff.value_num !== null
            ) {
                const duelTarget = await client.query(
                    'SELECT name, hp FROM characters WHERE id = $1',
                    [Number(expiredBuff.value_num)]
                );

                if (
                    duelTarget.rows.length &&
                    Number(duelTarget.rows[0].hp) > 0
                ) {
                    await client.query(
                        'UPDATE characters SET hp = 0 WHERE id = $1',
                        [expiredBuff.character_id]
                    );
                    expirationChangedCharacters = true;

                    expirationEvents.push(await insertBattleEvent(client, {
                        eventType: 'status_trigger',
                        round: nextRound,
                        turnPass: 1,
                        actorId: expiredBuff.character_id,
                        targetId: Number(expiredBuff.value_num),
                        content:
                            `【死鬥】結束：${duelTarget.rows[0].name} 尚未被擊倒，` +
                            `${expiredBuff.character_name} 的 HP 降至 0。`
                    }));
                }
            }
        }

        const expired = await client.query(`
            DELETE FROM character_buffs
            WHERE expires_round IS NOT NULL
              AND expires_round < $1
            RETURNING id
        `, [nextRound]);

        let combatants = await getCombatants(client);
        if (!combatants.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '目前沒有角色可進行戰鬥' });
        }

        const selected = await findUsableTurnActor(
            client,
            combatants,
            0,
            nextRound,
            1
        );

        const nextId = selected.actorId;
        const nextTurnPass = selected.turnPass;

        await client.query(`
            UPDATE battle_state
            SET round_number = $1,
                turn_pass = $2,
                current_character_id = $3,
                updated_at = NOW()
            WHERE id = 1
        `, [nextRound, nextTurnPass, nextId]);

        const phaseEvent = await insertBattleEvent(client, {
            eventType: 'phase',
            round: nextRound,
            turnPass: nextTurnPass,
            content: battleClockLabel(nextRound, nextTurnPass)
        });

        for (const expiredBuff of expiredPreview.rows) {
            const buff = BUFF_CATALOG[expiredBuff.buff_key];

            expirationEvents.push(await insertBattleEvent(client, {
                eventType: 'buff_expire',
                round: nextRound,
                turnPass: nextTurnPass,
                actorId: expiredBuff.character_id,
                content:
                            `${expiredBuff.character_name} 的「${buff?.name || expiredBuff.buff_key}」` +
                    `已在上一輪結束時解除。`,
                payload: {
                    buffKey: expiredBuff.buff_key
                }
            }));
        }

        const nextCharacter = combatants.find(
            character => character.id === nextId
        );

        const turnEvent = await insertBattleEvent(client, {
            eventType: 'turn',
            round: nextRound,
            turnPass: nextTurnPass,
            actorId: nextId,
            content: `輪到 ${nextCharacter?.name || '角色'} 行動。`
        });

        const resolution = await resolvePendingActionsForActor(
            client,
            nextId,
            { round: nextRound, turnPass: nextTurnPass }
        );

        const timingWindows = [
            ...(await emitTimingHooks(
                client,
                [combat.TIMING.ROUND_END],
                {
                    actionKind: 'round',
                    round: clock.round,
                    turnPass: clock.turnPass
                }
            )),
            ...(await emitTimingHooks(
                client,
                [combat.TIMING.ROUND_START],
                {
                    actionKind: 'round',
                    round: nextRound,
                    turnPass: nextTurnPass
                }
            ))
        ];

        // 新輪第一位角色也觸發回合開始時點。
        const turnStartWindows = await emitTimingHooks(
            client,
            [combat.TIMING.TURN_START],
            {
                actionKind: 'turn',
                triggerCharacterId: nextId,
                actorId: nextId,
                round: nextRound,
                turnPass: nextTurnPass
            }
        );

        await client.query('COMMIT');

        for (const message of selected.statusMessages) {
            io.emit('chat:message', message);
        }
        for (const message of resolution.messages) {
            io.emit('chat:message', message);
        }

        for (const event of [
            phaseEvent,
            ...expirationEvents,
            ...selected.statusEvents,
            turnEvent,
            ...(resolution.events || [])
        ]) {
            io.emit('battle:event', event);
        }

        if (
            resolution.charactersChanged ||
            selected.charactersChanged ||
            expirationChangedCharacters ||
            expired.rows.length
        ) {
            io.emit('characters:changed');
        }

        combatants = await getCombatants();
        const newState = buildCombatState(
            nextRound,
            nextTurnPass,
            nextId,
            combatants
        );

        io.emit('combat:state', newState);
        broadcastReactionWindows([
            ...timingWindows,
            ...turnStartWindows
        ]);
        res.json(newState);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '切換輪次失敗' });
    } finally {
        client.release();
    }
});


// 單次 JOIN 取回所有戰場與格子，避免每一塊戰場各查一次資料庫。
app.get('/api/grid-groups', async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                g.id AS group_id,
                g.world_x,
                g.world_y,
                g.rows,
                g.cols,
                g.cell_size,
                c.id AS cell_id,
                c.row_index,
                c.col_index,
                c.occupied_by,
                ch.name AS character_name,
                ch.kind AS character_kind,
                ch.image_path AS character_image
            FROM grid_groups g
            LEFT JOIN cells c ON c.group_id = g.id
            LEFT JOIN characters ch ON c.occupied_by = ch.id
            ORDER BY g.id, c.row_index, c.col_index
        `);

        const groups = new Map();

        for (const row of result.rows) {
            if (!groups.has(row.group_id)) {
                groups.set(row.group_id, {
                    id: row.group_id,
                    worldX: row.world_x,
                    worldY: row.world_y,
                    rows: row.rows,
                    cols: row.cols,
                    cellSize: row.cell_size,
                    cells: []
                });
            }

            if (row.cell_id !== null) {
                groups.get(row.group_id).cells.push({
                    id: row.cell_id,
                    row: row.row_index,
                    col: row.col_index,
                    occupiedBy: row.occupied_by,
                    characterName: row.character_name,
                    characterKind: row.character_kind || 'player',
                    characterImage: row.character_image
                });
            }
        }

        res.json([...groups.values()]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '查詢戰場失敗' });
    }
});

app.post('/api/grid-groups', async (req, res) => {
    const worldX = Math.round(number(req.body.worldX));
    const worldY = Math.round(number(req.body.worldY));
    const rows = Math.floor(number(req.body.rows));
    const cols = Math.floor(number(req.body.cols));
    const cellSize = Math.floor(number(req.body.cellSize, 160));

    if (rows < 1 || cols < 1 || rows > 50 || cols > 50) {
        return res.status(400).json({ error: '高度寬度須介於 1～20' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const groupResult = await client.query(`
            INSERT INTO grid_groups (world_x, world_y, rows, cols, cell_size)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [worldX, worldY, rows, cols, cellSize]);

        const group = groupResult.rows[0];
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                params.push(group.id, row, col);
            }
        }

        await client.query(`
            INSERT INTO cells (group_id, row_index, col_index)
            VALUES ${values.join(', ')}
        `, params);

        await client.query('COMMIT');
        res.json({ success: true, id: group.id });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: '建立戰場失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/grid-groups/:id/move', async (req, res) => {
    try {
        const result = await pool.query(`
            UPDATE grid_groups SET world_x = $1, world_y = $2
            WHERE id = $3 RETURNING id
        `, [
            Math.round(number(req.body.worldX)),
            Math.round(number(req.body.worldY)),
            number(req.params.id)
        ]);

        if (!result.rows.length) return res.status(404).json({ error: 'error' });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '移動戰場失敗' });
    }
});

app.delete('/api/grid-groups/:id', async (req, res) => {
    const groupId = number(req.params.id);

    try {
        const occupied = await pool.query(
            'SELECT COUNT(*) FROM cells WHERE group_id = $1 AND occupied_by IS NOT NULL',
            [groupId]
        );

        if (number(occupied.rows[0].count) > 0) {
            return res.status(400).json({ error: '這片戰場上還有角色，無法刪除' });
        }

        const result = await pool.query('DELETE FROM grid_groups WHERE id = $1 RETURNING id', [groupId]);
        if (!result.rows.length) return res.status(404).json({ error: 'error' });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '刪除戰場失敗' });
    }
});


app.post('/api/combat/move-character', async (req, res) => {
    const characterId = number(req.body.characterId);
    const targetCellId = number(req.body.cellId);
    const actionActorId = number(req.body.actionActorId, characterId);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const characterResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [characterId]
        );
        if (!characterResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }
        const character = characterResult.rows[0];

        if (actionActorId !== characterId) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                    error: `無法移動「${character.name}」`
            });
        }

        const sourceResult = await client.query(`
            SELECT c.id, c.group_id, c.row_index, c.col_index
            FROM cells c
            WHERE c.occupied_by = $1
            FOR UPDATE
        `, [characterId]);
        if (!sourceResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'error' });
        }

        const source = sourceResult.rows[0];
        if (Number(source.id) === targetCellId) {
            await client.query('ROLLBACK');
            return res.json({ success: true, unchanged: true });
        }

        const targetResult = await client.query(`
            SELECT id, group_id, row_index, col_index, occupied_by
            FROM cells
            WHERE id = $1
            FOR UPDATE
        `, [targetCellId]);

        if (!targetResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        const target = targetResult.rows[0];
        if (target.occupied_by !== null && Number(target.occupied_by) !== characterId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '這個格子已經有其他角色' });
        }

        const hasteResult = await client.query(`
            SELECT id
            FROM character_buffs
            WHERE character_id = $1
              AND buff_key = 'marching_order'
            LIMIT 1
        `, [characterId]);

        const hasSwift = hasteResult.rows.length > 0;
        const moveSpCost = hasSwift ? 0 : 1;

        if (Number(character.sp) < moveSpCost) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                    error: `無法移動「${character.name}」`
            });
        }

        await client.query(
            'UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1',
            [characterId]
        );
        await client.query(
            'UPDATE cells SET occupied_by = $1 WHERE id = $2',
            [characterId, targetCellId]
        );

        if (moveSpCost > 0) {
            await client.query(
                'UPDATE characters SET sp = GREATEST(0, sp - $1) WHERE id = $2',
                [moveSpCost, characterId]
            );
        }

        if (hasSwift) {
            await removeBuffKeys(
                client,
                characterId,
                ['marching_order']
            );
        }

        const clock = await getBattleClock(client);
        const sourceLabel = `戰場（${source.group_id}:${Number(source.row_index)+1},${Number(source.col_index)+1}）`;
        const targetLabel = `戰場（${target.group_id}:${Number(target.row_index)+1},${Number(target.col_index)+1}）`;

        const content =
            `◆ ${character.name} 使用基礎移動\n` +
            `${sourceLabel} ??${targetLabel}\n` +
            (
                hasSwift
                    ? '【疾行】使本次戰鬥移動消耗變為 0 SP。'
                    : `消耗 ${moveSpCost} SP。`
            );

        const message = await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'move',
            characterId: character.id,
            characterName: character.name,
            characterKind: character.kind || 'player',
            content,
            payload: {
                actionCode: 'MOVE',
                sourceCellId: Number(source.id),
                targetCellId,
                spCost: moveSpCost,
                swiftConsumed: hasSwift
            }
        });

        const battleEvent = await insertBattleEvent(client, {
            eventType: 'move',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId: character.id,
            content:
                `${character.name} 從 ${sourceLabel} 移動到 ${targetLabel}，` +
                (
                    hasSwift
                    ? '【疾行】使本次戰鬥移動消耗變為 0 SP。'
                    : `消耗 ${moveSpCost} SP。`
                ),
            payload: {
                sourceCellId: Number(source.id),
                targetCellId,
                spCost: moveSpCost,
                swiftConsumed: hasSwift
            }
        });

        const timingWindows = await combat.emitMove(
            client,
            {
                triggerCharacterId: character.id,
                actorId: character.id,
                actorName: character.name,
                actorKind: character.kind || 'player',
                round: clock.round,
                turnPass: clock.turnPass,
                results: {
                    moves: [{
                        characterId: character.id,
                        sourceCellId: Number(source.id),
                        targetCellId,
                        spCost: moveSpCost
                    }]
                }
            },
            timingPipelineDeps()
        );

        await client.query('COMMIT');

        io.emit('chat:message', message);
        io.emit('battle:event', battleEvent);
        io.emit('characters:changed');
        io.emit('battlefield:changed', {
            reason: 'move',
            characterId: character.id,
            sourceCellId: Number(source.id),
            targetCellId
        });
        broadcastReactionWindows(timingWindows);

        res.json({
            success: true,
            message,
            battleEvent,
            sp: Math.max(0, Number(character.sp) - moveSpCost),
            swiftConsumed: hasSwift
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: error.message || '移動角色失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/cells/:cellId/occupy', async (req, res) => {
    const cellId = number(req.params.cellId);
    const characterId = number(req.body.characterId);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const cellCheck = await client.query(
            'SELECT occupied_by FROM cells WHERE id = $1 FOR UPDATE',
            [cellId]
        );

        if (!cellCheck.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'error' });
        }

        const occupiedBy = cellCheck.rows[0].occupied_by;
        if (occupiedBy !== null && occupiedBy !== characterId) {
            await client.query('ROLLBACK');
        return res.status(400).json({ error: '這個格子已經有其他角色' });
        }

        await client.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [characterId]);
        await client.query('UPDATE cells SET occupied_by = $1 WHERE id = $2', [characterId, cellId]);
        await client.query('COMMIT');

        io.emit('battlefield:changed', {
            reason: 'place',
            characterId,
            targetCellId: cellId
        });

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: '放置角色失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/characters/:id/vacate', async (req, res) => {
    try {
        const characterId = number(req.params.id);
        await pool.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [characterId]);
        io.emit('battlefield:changed', { reason: 'vacate', characterId });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '移除角色失敗' });
    }
});

app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: error.message || '伺服器發生錯誤' });
});

async function start() {
    try {
        await ensureSchema();
        await ensureBattleLogSeed();
        httpServer.listen(PORT, HOST, () => {
            console.log(`伺服器已啟動：http://${HOST}:${PORT}`);
            console.log('聊天室與 Socket.IO 已就緒');
        });
    } catch (error) {
        console.error('啟動失敗', error);
        process.exit(1);
    }
}

start();
