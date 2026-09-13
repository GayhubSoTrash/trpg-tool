'use strict';

/**
 * Damage-over-time / heal-over-time definitions — one place for the ratios and
 * labels that used to be hardcoded in three separate spots (the buff snapshot
 * taken at apply time, the per-action trigger, and the timing-bus monitor).
 *
 * Amounts derive from the *source* character's effective magic at the moment the
 * status was applied; the caller supplies that number so this module stays pure.
 */

const { TIMING } = require('./timings');

/**
 * @typedef {object} StatusTickDefinition
 * @property {string} key
 * @property {'heal'|'hp_loss'} kind
 * @property {number} ratio      share of the source's effective magic per tick
 * @property {string} label      shown in battle log, without brackets
 * @property {string} [effectId] timing-bus effect id, when it ticks on a timing
 * @property {string} [timing]   TIMING code that triggers the tick
 * @property {string} [contextFlag] ActionContext flag that must be true
 * @property {string} [note]     player-facing hint for the auto option
 */

/** @type {Record<string, StatusTickDefinition>} */
const STATUS_TICKS = Object.freeze({
    regeneration: {
        key: 'regeneration',
        kind: 'heal',
        ratio: 0.75,
        label: '再生',
        effectId: 'STATUS_REGENERATION',
        timing: TIMING.DURING_SKILL,
        contextFlag: 'isActiveSkill',
        note: '發動主動戰技時恢復 HP'
    },
    poison: {
        key: 'poison',
        kind: 'hp_loss',
        ratio: 0.5,
        label: '中毒',
        effectId: 'STATUS_POISON',
        timing: TIMING.DURING_MAIN_ACTION,
        contextFlag: 'isMainAction',
        note: '進行主動／主要行動時損失 HP'
    },
    burning: {
        key: 'burning',
        kind: 'hp_loss',
        ratio: 0.5,
        label: '燃燒',
        effectId: 'STATUS_BURNING',
        timing: TIMING.DURING_SKILL,
        contextFlag: 'isAuxiliary',
        note: '進行輔助行動時損失 HP'
    },
    // 流血 ticks per landed hit inside the attack loop rather than on a timing,
    // so it has no effectId — it still shares the ratio and label.
    bleeding: {
        key: 'bleeding',
        kind: 'hp_loss',
        ratio: 0.5,
        label: '流血'
    }
});

/** Status keys whose strength is snapshotted from the source when applied. */
const SNAPSHOT_STATUS_KEYS = Object.freeze(Object.keys(STATUS_TICKS));

/** Only these subscribe to timings; 流血 is resolved by the attack loop. */
const TIMING_TICK_KEYS = Object.freeze(
    SNAPSHOT_STATUS_KEYS.filter(key => STATUS_TICKS[key].effectId)
);

const TICKS_BY_EFFECT_ID = Object.freeze(
    Object.fromEntries(
        TIMING_TICK_KEYS.map(key => [STATUS_TICKS[key].effectId, STATUS_TICKS[key]])
    )
);

function statusTick(statusKey) {
    return STATUS_TICKS[statusKey] || null;
}

function statusTickByEffectId(effectId) {
    return TICKS_BY_EFFECT_ID[effectId] || null;
}

function isTickStatus(statusKey) {
    return Boolean(STATUS_TICKS[statusKey]);
}

/**
 * Base amount for one tick: a share of the source's effective magic, never 0.
 * @param {number} sourceMagic effective magic of the character who applied it
 * @param {string} statusKey
 */
function tickBaseAmount(sourceMagic, statusKey) {
    const tick = statusTick(statusKey);
    if (!tick) return 0;
    return Math.max(1, Math.floor(Number(sourceMagic || 0) * tick.ratio));
}

/**
 * Amount for one tick of an existing character_buffs row. Prefers the value
 * frozen when the status was applied, so later buffs on the source do not
 * retroactively change an active DoT.
 *
 * @param {object} entry character_buffs row
 * @param {object} [options]
 * @param {number} [options.sourceMagic] fallback when the row has no snapshot
 */
function tickAmountFromEntry(entry, { sourceMagic = 0 } = {}) {
    const statusKey = entry?.buff_key || entry?.key;
    const tick = statusTick(statusKey);
    if (!tick) return 0;

    const snapshot = entry?.source_snapshot || entry?.sourceSnapshot || {};
    const stored = Number(entry?.value_num ?? snapshot.tickBase ?? 0);
    if (stored > 0) return stored;

    return tickBaseAmount(sourceMagic, statusKey);
}

/**
 * Which tick statuses fire at the current timing, given the acting character's
 * buff rows. Replaces the previous hardcoded regeneration/poison/burning chain.
 *
 * @param {object} context ActionContext-like, with `phase` already normalized
 * @param {Map<number, object[]>} buffEntriesByCharacter
 * @param {string} normalizedTiming
 * @returns {{tick: StatusTickDefinition, entry: object}[]}
 */
function matchingStatusTicks(context, buffEntriesByCharacter, normalizedTiming) {
    const actorId = Number(context.actorId || 0);
    if (!actorId) return [];

    const entries = buffEntriesByCharacter.get(actorId) || [];
    if (!entries.length) return [];

    const matches = [];
    for (const key of TIMING_TICK_KEYS) {
        const tick = STATUS_TICKS[key];
        if (tick.timing !== normalizedTiming) continue;
        if (tick.contextFlag && context[tick.contextFlag] !== true) continue;

        const entry = entries.find(row => row.buff_key === key);
        if (entry) matches.push({ tick, entry });
    }

    return matches;
}

module.exports = {
    STATUS_TICKS,
    SNAPSHOT_STATUS_KEYS,
    TIMING_TICK_KEYS,
    statusTick,
    statusTickByEffectId,
    isTickStatus,
    tickBaseAmount,
    tickAmountFromEntry,
    matchingStatusTicks
};
