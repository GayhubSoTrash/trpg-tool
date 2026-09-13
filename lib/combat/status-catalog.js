'use strict';

/**
 * Atomic status catalog.
 * kind: buff | debuff | special
 * subtype: abnormal (debuff only)
 *
 * Numeric stat ups/downs are parametric (see stat-mods.js):
 *   buff_key = mod:{stat}:{flat|pct}, value_num = signed int
 *
 * duration (reserved for custom statuses):
 *   { type: 'round_end' }   — clear before next round (default)
 *   { type: 'permanent' }   — never auto-expire
 *   { type: 'custom', ... } — reserved for future authoring
 *
 * manualValue / manualSource / manualLink — extra fields when adding from UI
 */

const {
    resolveModDefinition,
    isModKey,
    isLegacyStatKey,
    grantToModSpec
} = require('./stat-mods');

function mod(stat, mode, value, extra = {}) {
    return {
        type: 'mod',
        stat,
        mode,
        value: Math.trunc(Number(value) || 0),
        ...extra
    };
}

/** Default / reserved duration shapes. */
const DURATION_ROUND_END = Object.freeze({ type: 'round_end' });
const DURATION_PERMANENT = Object.freeze({ type: 'permanent' });

/**
 * Resolve expires_round from catalog duration + current battle round.
 * null = permanent (no auto-expire).
 */
function statusExpiresRound(definition, currentRound) {
    const duration = definition?.duration || DURATION_ROUND_END;
    const type = duration.type || 'round_end';
    if (type === 'permanent') return null;
    if (type === 'custom') {
        if (duration.expiresRound != null) return Number(duration.expiresRound);
        if (duration.rounds != null) {
            return Number(currentRound) + Math.max(0, Number(duration.rounds) - 1);
        }
        return Number(currentRound);
    }
    // round_end (default): expire when the next round begins
    return Number(currentRound);
}

const STATUS_CATALOG = {
    life_sacrifice: {
        key: 'life_sacrifice',
        name: '不惜生命',
        effect: '失去所有防禦，獲得因此失去的防禦點物理攻擊',
        icon: 'sacrifice',
        kind: 'special',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    infinite_call_debt: {
        key: 'infinite_call_debt',
        name: '無限可能的呼喚・代償',
        effect: '下一次恢復的 AP/SP -1',
        icon: 'debt',
        kind: 'special',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: { apRegenFlat: -1, spRegenFlat: -1, consumeOnRegen: true }
    },
    crit_erosion_choice: {
        key: 'crit_erosion_choice',
        name: '會心侵蝕・選定',
        effect: '暴擊命中時施加選定的異常狀態',
        icon: 'erosion',
        kind: 'special',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    mirage: {
        key: 'mirage',
        name: '幻影',
        effect: '下一次被攻擊命中時，改為未命中',
        icon: 'mirage',
        kind: 'buff',
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    sanctuary: {
        key: 'sanctuary',
        name: '庇護',
        effect: '下一次收到的一組減益無效',
        icon: 'sanctuary',
        kind: 'buff',
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    regeneration: {
        key: 'regeneration',
        name: '再生',
        effect: '每次發動主動戰技時，恢復施加者有效魔法攻擊 × 0.75 的 HP',
        icon: 'regen',
        kind: 'buff',
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    marching_order: {
        key: 'marching_order',
        name: '疾行',
        effect: '可額外進行一次移動（基礎移動消耗 -1 SP）',
        icon: 'boot',
        kind: 'buff',
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    charging: {
        key: 'charging',
        name: '蓄力',
        effect: '蓄力期間無法迴避或使用輔助戰技；回合開始時自動蓄力或發動戰技',
        icon: 'charge',
        kind: 'special',
        manual: false,
        duration: DURATION_PERMANENT,
        modifiers: { cannotDodge: true, cannotAux: true }
    },
    auto_guard: {
        key: 'auto_guard',
        name: '自動格擋',
        effect: '受到物理攻擊時自動依格擋率格擋',
        icon: 'auto_guard',
        kind: 'buff',
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: { autoGuard: true }
    },
    guard_ready: {
        key: 'guard_ready',
        name: '格擋準備',
        effect: '本次／下一次物理攻擊進行格擋',
        icon: 'shield',
        kind: 'buff',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: { guardReady: true }
    },
    life_shield: {
        key: 'life_shield',
        name: '生命護盾',
        effect: '受到傷害時優先扣除護盾',
        icon: 'life_shield',
        kind: 'buff',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    war_horn: {
        key: 'war_horn',
        name: '無法格擋',
        effect: '本輪內攻擊無法被格擋',
        icon: 'war_horn',
        kind: 'buff',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: { unblockable: true }
    },
    empower: {
        key: 'empower',
        name: '賦能',
        effect: '下一次物理近戰攻擊每段附加【0.5魔法】',
        icon: 'empower',
        kind: 'buff',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: { empowerMagic: 0.5, consumeOnAttack: true }
    },
    sharpness: {
        key: 'sharpness',
        name: '鋒銳',
        effect: '下一次攻擊命中時施加流血',
        icon: 'sharpness',
        kind: 'buff',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: { applyBleedOnHit: true, consumeOnAttack: true }
    },
    break_formation: {
        key: 'break_formation',
        name: '破陣準備',
        effect: '下一次攻擊無法格擋，命中時施加格擋封印',
        icon: 'break',
        kind: 'buff',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: {
            unblockable: true,
            applyBlockSealOnHit: true,
            consumeOnAttack: true
        }
    },
    quick_cast: {
        key: 'quick_cast',
        name: '快速詠唱',
        effect: '本輪行動順序優先',
        icon: 'quick_cast',
        kind: 'buff',
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: { initiativeFirst: true }
    },
    taunt: {
        key: 'taunt',
        name: '嘲諷',
        effect: '下一次主要行動必須盡可能攻擊施加者',
        icon: 'taunt',
        kind: 'debuff',
        manual: true,
        manualSource: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    light_link_loss: {
        key: 'light_link_loss',
        name: '熠光連結・付出',
        effect: '魔法攻擊暫時降低',
        icon: 'link',
        kind: 'special',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: { useValueAsMatkFlat: true }
    },
    light_link_gain: {
        key: 'light_link_gain',
        name: '熠光連結・獲得',
        effect: '魔法攻擊暫時提高',
        icon: 'link',
        kind: 'special',
        manual: false,
        duration: DURATION_ROUND_END,
        modifiers: { useValueAsMatkFlat: true }
    },
    block_seal: {
        key: 'block_seal',
        name: '格擋封印',
        effect: '無法格擋',
        icon: 'seal',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: { blockDisabled: true }
    },
    aux_seal: {
        key: 'aux_seal',
        name: '輔助封印',
        effect: '無法發動輔助戰技',
        icon: 'seal',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    stun: {
        key: 'stun',
        name: '暈厥',
        effect: '跳過下一個自己的回合',
        icon: 'stun',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        duration: { type: 'custom', rounds: 2 },
        modifiers: {}
    },
    poison: {
        key: 'poison',
        name: '中毒',
        effect: '進行主動／主要行動時損失 HP（非受到傷害，直接移除 HP）',
        icon: 'poison',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        manualValue: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    darkness: {
        key: 'darkness',
        name: '黑暗',
        effect: '下一段攻擊必定無法命中',
        icon: 'darkness',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        duration: { type: 'custom', rounds: 2 },
        modifiers: {}
    },
    bleeding: {
        key: 'bleeding',
        name: '流血',
        effect: '被攻擊命中時額外損失 HP（非受到傷害，直接移除 HP）',
        icon: 'bleed',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        manualValue: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    burning: {
        key: 'burning',
        name: '燃燒',
        effect: '進行輔助行動時損失 HP（非受到傷害，直接移除 HP）',
        icon: 'burn',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        manualValue: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    frozen: {
        key: 'frozen',
        name: '冰凍',
        effect: '無法使用輔助戰技；受到 HP 傷害後解除',
        icon: 'frozen',
        kind: 'debuff',
        subtype: 'abnormal',
        resistance: true,
        manual: true,
        duration: { type: 'custom', rounds: 2 },
        modifiers: {}
    },
    duel: {
        key: 'duel',
        name: '死鬥',
        effect: 'HP 不會低於 1；結束時若指定敵仍存活則自己 HP 歸 0',
        icon: 'duel',
        kind: 'special',
        manual: true,
        manualLink: true,
        duration: DURATION_ROUND_END,
        modifiers: {}
    },
    berserk: {
        key: 'berserk',
        name: '狂暴',
        effect: '下一個會致死的傷害段改為 0',
        icon: 'berserk',
        kind: 'special',
        resistance: true,
        manual: true,
        duration: { type: 'custom', rounds: 2 },
        modifiers: {}
    },
    feign_death: {
        key: 'feign_death',
        name: '假死',
        effect: '若被擊倒，下一個回合開始時恢復到 1HP',
        icon: 'feign_death',
        kind: 'special',
        manual: true,
        duration: { type: 'custom', rounds: 2 },
        modifiers: {}
    }
};

const LEGACY_STATUS_EXPAND = {
    attack_order: [mod('patk', 'pct', 25), mod('matk', 'pct', 25)],
    war_cry: [mod('damage', 'pct', 25)],
    defense_stance: [mod('defense', 'pct', 25)],
    acceleration: [
        mod('hit', 'flat', 20),
        mod('dodge', 'flat', 20),
        mod('speed', 'flat', 10)
    ],
    attack_stance: [mod('patk', 'pct', 25)],
    war_horn: ['war_horn'],
    steadfast: [mod('defense', 'pct', 25), mod('block', 'flat', 25)],
    rage: [mod('damage', 'pct', 25), mod('hit', 'flat', 25)],
    defensive_stance: [mod('defense', 'pct', 25)],
    steel_curtain: [mod('block', 'flat', 50)],
    battleline_defense: [mod('defense', 'pct', 50)],
    defense_order: [mod('defense', 'pct', 50), mod('resist', 'pct', 50)],
    sniper_order: [mod('hit', 'flat', 30)],
    swift_order: [mod('speed', 'flat', 10)],
    wind_walk: [mod('speed', 'flat', 10)],
    attack_down_25: [mod('patk', 'pct', -25), mod('matk', 'pct', -25)],
    mirage: ['mirage'],
    sanctuary: ['sanctuary'],
    regeneration: ['regeneration'],
    marching_order: ['marching_order'],
    auto_guard: ['auto_guard'],
    guard_ready: ['guard_ready'],
    // 障壁已併入「受到傷害」能力值修正；舊資料列仍展開為一次 -25%
    barrier: [mod('damageTaken', 'pct', -25, { consumeOnDamage: true })],
    life_shield: ['life_shield'],
    sharpness: ['sharpness'],
    empower: ['empower'],
    break_formation: ['break_formation'],
    quick_cast: ['quick_cast'],
    taunt: ['taunt'],
    block_seal: ['block_seal'],
    stun: ['stun'],
    poison: ['poison'],
    aux_seal: ['aux_seal'],
    darkness: ['darkness'],
    bleeding: ['bleeding'],
    burning: ['burning'],
    frozen: ['frozen'],
    duel: ['duel'],
    berserk: ['berserk'],
    feign_death: ['feign_death'],
    light_link_loss: ['light_link_loss'],
    light_link_gain: ['light_link_gain']
};

function normalizeGrant(grant) {
    if (!grant) return [];
    if (typeof grant === 'object' && grant.type === 'mod') return [grant];
    if (typeof grant === 'object' && grant.stat && grant.mode) {
        return [{ type: 'mod', ...grant }];
    }
    if (typeof grant === 'string') {
        // Atomic / parametric keys resolve first to avoid legacy self-loops.
        if (STATUS_CATALOG[grant] || isModKey(grant) || isLegacyStatKey(grant)) {
            return [grant];
        }
        if (LEGACY_STATUS_EXPAND[grant]) {
            return LEGACY_STATUS_EXPAND[grant].flatMap(normalizeGrant);
        }
    }
    return [];
}

function expandStatusKeys(buffKey) {
    if (!buffKey) return [];
    if (isModKey(buffKey)) return [buffKey];
    if (STATUS_CATALOG[buffKey]) return [buffKey];
    if (isLegacyStatKey(buffKey)) return [buffKey];
    if (LEGACY_STATUS_EXPAND[buffKey]) {
        // Prefer atomic string keys only; parametric mods use expandStatusGrants.
        return LEGACY_STATUS_EXPAND[buffKey].flatMap(item => {
            if (typeof item === 'string') return expandStatusKeys(item);
            return [];
        });
    }
    return [];
}

function expandStatusGrants(buffKeyOrGrant) {
    if (typeof buffKeyOrGrant === 'object' && buffKeyOrGrant !== null) {
        return normalizeGrant(buffKeyOrGrant);
    }
    if (typeof buffKeyOrGrant === 'string') {
        if (LEGACY_STATUS_EXPAND[buffKeyOrGrant]) {
            return LEGACY_STATUS_EXPAND[buffKeyOrGrant].flatMap(normalizeGrant);
        }
        return normalizeGrant(buffKeyOrGrant);
    }
    return [];
}

function statusesForSkill(skill) {
    if (!skill) return [];
    // Authoritative source: skill-data.js `statusGrants` (keyed with the skill).
    const raw = Array.isArray(skill.statusGrants) ? skill.statusGrants : [];
    return raw.flatMap(normalizeGrant);
}

function getStatusDefinition(key, valueNum = null) {
    if (STATUS_CATALOG[key]) return STATUS_CATALOG[key];
    return resolveModDefinition(key, valueNum);
}

function isAbnormalStatus(key) {
    return getStatusDefinition(key)?.subtype === 'abnormal';
}

function isDebuffStatus(key, valueNum = null) {
    return getStatusDefinition(key, valueNum)?.kind === 'debuff';
}

function listManualStatuses() {
    return Object.values(STATUS_CATALOG).filter(
        item => item && item.manual !== false
    );
}

module.exports = {
    STATUS_CATALOG,
    LEGACY_STATUS_EXPAND,
    DURATION_ROUND_END,
    DURATION_PERMANENT,
    mod,
    statusExpiresRound,
    expandStatusKeys,
    expandStatusGrants,
    statusesForSkill,
    getStatusDefinition,
    isAbnormalStatus,
    isDebuffStatus,
    listManualStatuses,
    grantToModSpec,
    normalizeGrant
};
