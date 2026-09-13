'use strict';

/**
 * Parametric stat modifiers.
 * Storage: buff_key = mod:{stat}:{flat|pct}, value_num = signed integer.
 * pct uses integer percent (25 => +25% => 0.25 in formulas).
 */

const STAT_LABELS = Object.freeze({
    patk: '物理攻擊',
    matk: '魔法攻擊',
    defense: '防禦',
    resist: '魔抗',
    hit: '命中',
    dodge: '迴避',
    speed: '行動速度',
    crit: '暴擊率',
    critDamage: '額外暴擊傷害',
    block: '格擋率',
    damage: '造成傷害',
    damageTaken: '受到傷害',
    maxHp: '生命上限'
});

const STAT_MODES = Object.freeze(['flat', 'pct']);

const STAT_KEYS = Object.freeze(Object.keys(STAT_LABELS));

const MOD_KEY_RE = /^mod:([a-zA-Z]+):(flat|pct)$/;

/** Legacy hardcoded status key → parametric mod */
const LEGACY_STAT_KEY_MAP = Object.freeze({
    patk_up_25: { stat: 'patk', mode: 'pct', value: 25 },
    patk_up_50: { stat: 'patk', mode: 'pct', value: 50 },
    matk_up_25: { stat: 'matk', mode: 'pct', value: 25 },
    matk_up_50: { stat: 'matk', mode: 'pct', value: 50 },
    defense_up_25: { stat: 'defense', mode: 'pct', value: 25 },
    defense_up_50: { stat: 'defense', mode: 'pct', value: 50 },
    resist_up_25: { stat: 'resist', mode: 'pct', value: 25 },
    resist_up_50: { stat: 'resist', mode: 'pct', value: 50 },
    dodge_up_20pct: { stat: 'dodge', mode: 'pct', value: 20 },
    dodge_up_50pct: { stat: 'dodge', mode: 'pct', value: 50 },
    max_hp_up_25: { stat: 'maxHp', mode: 'pct', value: 25 },
    damage_up_25: { stat: 'damage', mode: 'pct', value: 25 },
    damage_taken_down_25: { stat: 'damageTaken', mode: 'pct', value: -25 },
    block_up_25: { stat: 'block', mode: 'flat', value: 25 },
    block_up_50: { stat: 'block', mode: 'flat', value: 50 },
    hit_up_10: { stat: 'hit', mode: 'flat', value: 10 },
    hit_up_20: { stat: 'hit', mode: 'flat', value: 20 },
    hit_up_25: { stat: 'hit', mode: 'flat', value: 25 },
    hit_up_30: { stat: 'hit', mode: 'flat', value: 30 },
    dodge_up_10: { stat: 'dodge', mode: 'flat', value: 10 },
    dodge_up_20: { stat: 'dodge', mode: 'flat', value: 20 },
    dodge_up_30: { stat: 'dodge', mode: 'flat', value: 30 },
    speed_up_5: { stat: 'speed', mode: 'flat', value: 5 },
    speed_up_10: { stat: 'speed', mode: 'flat', value: 10 },
    crit_up_50: { stat: 'crit', mode: 'flat', value: 50 },
    crit_damage_up_50: { stat: 'critDamage', mode: 'flat', value: 50 },
    patk_down_25: { stat: 'patk', mode: 'pct', value: -25 },
    matk_down_25: { stat: 'matk', mode: 'pct', value: -25 },
    matk_down_50: { stat: 'matk', mode: 'pct', value: -50 },
    defense_down_25: { stat: 'defense', mode: 'pct', value: -25 },
    dodge_down_50pct: { stat: 'dodge', mode: 'pct', value: -50 },
    damage_taken_up_25: { stat: 'damageTaken', mode: 'pct', value: 25 },
    dodge_down_20: { stat: 'dodge', mode: 'flat', value: -20 },
    dodge_down_50: { stat: 'dodge', mode: 'flat', value: -50 },
    speed_down_10: { stat: 'speed', mode: 'flat', value: -10 }
});

function modKey(stat, mode) {
    if (!STAT_KEYS.includes(stat)) {
        throw new Error(`未知能力值：${stat}`);
    }
    if (!STAT_MODES.includes(mode)) {
        throw new Error(`未知修正模式：${mode}`);
    }
    return `mod:${stat}:${mode}`;
}

function parseModKey(key) {
    const match = String(key || '').match(MOD_KEY_RE);
    if (!match) return null;
    const stat = match[1];
    const mode = match[2];
    if (!STAT_KEYS.includes(stat)) return null;
    return { stat, mode };
}

function isModKey(key) {
    return Boolean(parseModKey(key));
}

function legacyStatKeyToMod(key) {
    return LEGACY_STAT_KEY_MAP[key] || null;
}

function isLegacyStatKey(key) {
    return Boolean(LEGACY_STAT_KEY_MAP[key]);
}

function formatModLabel(stat, mode, value) {
    const label = STAT_LABELS[stat] || stat;
    const n = Math.trunc(Number(value) || 0);
    const sign = n > 0 ? '+' : '';
    if (mode === 'pct') return `${label} ${sign}${n}%`;
    return `${label} ${sign}${n}`;
}

function resolveModDefinition(key, valueNum = null) {
    const parsed = parseModKey(key);
    if (parsed) {
        const value = valueNum === null || valueNum === undefined
            ? 0
            : Math.trunc(Number(valueNum) || 0);
        const name = formatModLabel(parsed.stat, parsed.mode, value);
        const kind = value < 0 ? 'debuff' : 'buff';
        return {
            key,
            name,
            effect: name,
            icon: kind === 'debuff' ? 'stat_down' : 'stat_up',
            kind,
            subtype: null,
            stackable: true,
            manual: true,
            parametric: true,
            modifiers: {},
            mod: { ...parsed, value }
        };
    }

    const legacy = legacyStatKeyToMod(key);
    if (legacy) {
        const name = formatModLabel(legacy.stat, legacy.mode, legacy.value);
        return {
            key,
            name,
            effect: name,
            icon: legacy.value < 0 ? 'stat_down' : 'stat_up',
            kind: legacy.value < 0 ? 'debuff' : 'buff',
            subtype: null,
            stackable: true,
            manual: true,
            parametric: true,
            legacy: true,
            modifiers: {},
            mod: { ...legacy }
        };
    }

    return null;
}

/**
 * Fold one buff entry into accumulator mods/pct objects (mutates).
 */
function accumulateModFromEntry(entry, mods, pct) {
    const key = entry.key || entry.buff_key;
    const count = Math.max(1, Number(entry.stackCount || entry.stack_count || 1));
    let mod = null;

    const parsed = parseModKey(key);
    if (parsed) {
        mod = {
            ...parsed,
            value: Math.trunc(Number(
                entry.valueNum ?? entry.value_num ?? 0
            ) || 0) * count
        };
    } else {
        const legacy = legacyStatKeyToMod(key);
        if (legacy) {
            mod = {
                ...legacy,
                value: Math.trunc(Number(legacy.value) || 0) * count
            };
        }
    }

    if (!mod || !mod.value) return false;

    const { stat, mode, value } = mod;
    if (mode === 'pct') {
        const frac = value / 100;
        if (stat === 'patk') pct.patk += frac;
        else if (stat === 'matk') pct.matk += frac;
        else if (stat === 'defense') pct.defense += frac;
        else if (stat === 'resist') pct.resist += frac;
        else if (stat === 'dodge') pct.dodge += frac;
        else if (stat === 'maxHp') pct.maxHp += frac;
        else if (stat === 'damage') pct.damage += frac;
        else if (stat === 'damageTaken') pct.damageTaken += frac;
        else if (stat === 'hit') mods.hitFlat += value; // pct-as-flat fallback unused
        else if (stat === 'crit') mods.critFlat += value;
        else if (stat === 'critDamage') mods.critDamageFlat += value;
        else if (stat === 'block') mods.blockFlat += value;
        else if (stat === 'speed') mods.speedFlat += value;
        return true;
    }

    // flat
    if (stat === 'patk') mods.patkFlat += value;
    else if (stat === 'matk') mods.matkFlat += value;
    else if (stat === 'defense') mods.defenseFlat += value;
    else if (stat === 'resist') mods.resistFlat += value;
    else if (stat === 'hit') mods.hitFlat += value;
    else if (stat === 'dodge') mods.dodgeFlat += value;
    else if (stat === 'speed') mods.speedFlat += value;
    else if (stat === 'crit') mods.critFlat += value;
    else if (stat === 'critDamage') mods.critDamageFlat += value;
    else if (stat === 'block') mods.blockFlat += value;
    else if (stat === 'maxHp') mods.maxHpFlat += value;
    else if (stat === 'damage') pct.damage += value / 100;
    else if (stat === 'damageTaken') pct.damageTaken += value / 100;

    return true;
}

/**
 * Apply / accumulate a parametric mod on characters.
 * deps: { query } = client.query binder
 */
async function applyStatMod(client, characterIds, {
    stat,
    mode,
    value,
    sourceSkillKey = null,
    sourceCharacterId = null,
    expiresRound = null,
    sourceSnapshot = null
} = {}) {
    const ids = [...new Set((characterIds || []).map(Number).filter(Boolean))];
    const delta = Math.trunc(Number(value) || 0);
    if (!ids.length || !delta) return { key: null, applied: 0 };

    const key = modKey(stat, mode);
    let applied = 0;

    for (const characterId of ids) {
        const existing = await client.query(`
            SELECT value_num, source_snapshot
            FROM character_buffs
            WHERE character_id = $1 AND buff_key = $2
            FOR UPDATE
        `, [characterId, key]);

        const prev = existing.rows.length
            ? Math.trunc(Number(existing.rows[0].value_num) || 0)
            : 0;
        const next = prev + delta;

        if (next === 0) {
            await client.query(
                'DELETE FROM character_buffs WHERE character_id = $1 AND buff_key = $2',
                [characterId, key]
            );
        } else {
            const prevSnap = existing.rows[0]?.source_snapshot || {};
            const mergedSnap = sourceSnapshot && typeof sourceSnapshot === 'object'
                ? { ...prevSnap, ...sourceSnapshot }
                : prevSnap;
            await client.query(`
                INSERT INTO character_buffs (
                    character_id, buff_key, source_skill_key,
                    source_character_id, expires_round,
                    stack_count, value_num, source_snapshot
                )
                VALUES ($1, $2, $3, $4, $5, 1, $6, $7::jsonb)
                ON CONFLICT (character_id, buff_key)
                DO UPDATE SET
                    source_skill_key = EXCLUDED.source_skill_key,
                    source_character_id = EXCLUDED.source_character_id,
                    expires_round = EXCLUDED.expires_round,
                    stack_count = 1,
                    value_num = EXCLUDED.value_num,
                    source_snapshot = EXCLUDED.source_snapshot,
                    created_at = NOW()
            `, [
                characterId,
                key,
                sourceSkillKey,
                sourceCharacterId,
                expiresRound,
                next,
                JSON.stringify(mergedSnap || {})
            ]);
        }
        applied += 1;
    }

    return { key, applied, value: delta };
}

function grantToModSpec(grant) {
    if (!grant) return null;
    if (typeof grant === 'object' && grant.stat && grant.mode) {
        return {
            stat: grant.stat,
            mode: grant.mode,
            value: Math.trunc(Number(grant.value) || 0)
        };
    }
    if (typeof grant === 'string') {
        if (isModKey(grant)) {
            return null; // needs value_num separately
        }
        return legacyStatKeyToMod(grant);
    }
    return null;
}

module.exports = {
    STAT_LABELS,
    STAT_KEYS,
    STAT_MODES,
    LEGACY_STAT_KEY_MAP,
    modKey,
    parseModKey,
    isModKey,
    legacyStatKeyToMod,
    isLegacyStatKey,
    formatModLabel,
    resolveModDefinition,
    accumulateModFromEntry,
    applyStatMod,
    grantToModSpec
};
