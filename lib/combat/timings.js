'use strict';

/** @typedef {keyof typeof TIMING} TimingCode */

const TIMING = Object.freeze({
    BATTLE_START: 'BATTLE_START',
    ROUND_START: 'ROUND_START',
    ROUND_END: 'ROUND_END',
    TURN_START: 'TURN_START',
    TURN_END: 'TURN_END',
    BEFORE_MAIN_ACTION: 'BEFORE_MAIN_ACTION',
    DURING_MAIN_ACTION: 'DURING_MAIN_ACTION',
    AFTER_MAIN_ACTION: 'AFTER_MAIN_ACTION',
    AFTER_ACTIVE_SKILL: 'AFTER_ACTIVE_SKILL',
    BEFORE_SKILL: 'BEFORE_SKILL',
    DURING_SKILL: 'DURING_SKILL',
    AFTER_SKILL: 'AFTER_SKILL',
    ON_TARGET_DECLARED: 'ON_TARGET_DECLARED',
    DURING_ATTACK: 'DURING_ATTACK',
    AFTER_HIT_CHECK: 'AFTER_HIT_CHECK',
    AFTER_ATTACK: 'AFTER_ATTACK',
    ON_DAMAGE: 'ON_DAMAGE',
    AFTER_DAMAGE: 'AFTER_DAMAGE',
    ON_KO: 'ON_KO',
    ON_HEAL: 'ON_HEAL',
    ON_EFFECT_APPLIED: 'ON_EFFECT_APPLIED',
    ON_MOVE: 'ON_MOVE'
});

const TIMING_LABEL = Object.freeze({
    [TIMING.BATTLE_START]: '戰鬥開始時',
    [TIMING.ROUND_START]: '輪開始時',
    [TIMING.ROUND_END]: '輪結束時',
    [TIMING.TURN_START]: '回合開始時',
    [TIMING.TURN_END]: '回合結束時',
    [TIMING.BEFORE_MAIN_ACTION]: '進行主要行動前',
    [TIMING.DURING_MAIN_ACTION]: '進行主要行動時',
    [TIMING.AFTER_MAIN_ACTION]: '進行主要行動後',
    [TIMING.AFTER_ACTIVE_SKILL]: '發動主動戰技後',
    [TIMING.BEFORE_SKILL]: '發動戰技前',
    [TIMING.DURING_SKILL]: '發動戰技時',
    [TIMING.AFTER_SKILL]: '發動戰技後',
    [TIMING.ON_TARGET_DECLARED]: '指定目標時',
    [TIMING.DURING_ATTACK]: '進行攻擊時',
    [TIMING.AFTER_HIT_CHECK]: '攻擊命中檢定後',
    [TIMING.AFTER_ATTACK]: '進行攻擊後',
    [TIMING.ON_DAMAGE]: '角色受到傷害時',
    [TIMING.AFTER_DAMAGE]: '角色受到傷害後',
    [TIMING.ON_KO]: '角色被擊倒時',
    [TIMING.ON_HEAL]: '角色恢復時',
    [TIMING.ON_EFFECT_APPLIED]: '角色被施加效果時',
    [TIMING.ON_MOVE]: '角色移動時'
});

/** Legacy Chinese timing strings → primary TimingCode */
const LEGACY_TIMING_MAP = Object.freeze({
    主動: TIMING.DURING_SKILL,
    被動: null,
    自身成功迴避時: TIMING.AFTER_HIT_CHECK,
    自身攻擊被迴避時: TIMING.AFTER_HIT_CHECK,
    戰鬥開始時: TIMING.BATTLE_START,
    輪開始時: TIMING.ROUND_START,
    輪結束時: TIMING.ROUND_END,
    回合開始時: TIMING.TURN_START,
    回合結束時: TIMING.TURN_END,
    其他角色回合結束時: TIMING.TURN_END,
    其他友方回合結束時: TIMING.TURN_END,
    進行主要行動前: TIMING.BEFORE_MAIN_ACTION,
    自身進行主要行動前: TIMING.BEFORE_MAIN_ACTION,
    '主動/自身進行主要行動前': TIMING.BEFORE_MAIN_ACTION,
    進行主要行動時: TIMING.DURING_MAIN_ACTION,
    進行主要行動後: TIMING.AFTER_MAIN_ACTION,
    發動主動戰技後: TIMING.AFTER_ACTIVE_SKILL,
    自身發動主動戰技後: TIMING.AFTER_ACTIVE_SKILL,
    發動戰技前: TIMING.BEFORE_SKILL,
    自身發動主動戰技前: TIMING.BEFORE_SKILL,
    自身發動主要戰技前: TIMING.BEFORE_SKILL,
    其他友方發動主要戰技前: TIMING.BEFORE_SKILL,
    發動戰技時: TIMING.DURING_SKILL,
    發動戰技後: TIMING.AFTER_SKILL,
    其他友方發動輔助戰技後: TIMING.AFTER_SKILL,
    指定目標時: TIMING.ON_TARGET_DECLARED,
    自身被攻擊指定時: TIMING.ON_TARGET_DECLARED,
    自身被近戰攻擊指定時: TIMING.ON_TARGET_DECLARED,
    其他友方被攻擊指定時: TIMING.ON_TARGET_DECLARED,
    其他友方被攻擊指定後: TIMING.ON_TARGET_DECLARED,
    其他友方被遠程物理攻擊指定時: TIMING.ON_TARGET_DECLARED,
    友方被攻擊指定時: TIMING.ON_TARGET_DECLARED,
    自身指定友方時: TIMING.ON_TARGET_DECLARED,
    進行攻擊時: TIMING.DURING_ATTACK,
    自身進行攻擊時: TIMING.DURING_ATTACK,
    其他友方進行攻擊時: TIMING.DURING_ATTACK,
    友方進行攻擊時: TIMING.DURING_ATTACK,
    自身進行遠程攻擊時: TIMING.DURING_ATTACK,
    自身前方的敵方進行近戰攻擊時: TIMING.DURING_ATTACK,
    與自身處於相對位置的敵方進行攻擊時: TIMING.DURING_ATTACK,
    攻擊命中檢定後: TIMING.AFTER_HIT_CHECK,
    自身攻擊命中後: TIMING.AFTER_HIT_CHECK,
    進行攻擊後: TIMING.AFTER_ATTACK,
    自身進行攻擊後: TIMING.AFTER_ATTACK,
    其他友方進行攻擊後: TIMING.AFTER_ATTACK,
    自身的攻擊結束後: TIMING.AFTER_ATTACK,
    自身的攻擊沒有命中後: TIMING.AFTER_ATTACK,
    角色受到傷害時: TIMING.ON_DAMAGE,
    其他友方受到傷害時: TIMING.ON_DAMAGE,
    角色受到傷害後: TIMING.AFTER_DAMAGE,
    友方受到傷害後: TIMING.AFTER_DAMAGE,
    自身受到物理傷害後: TIMING.AFTER_DAMAGE,
    自身受到攻擊後: TIMING.AFTER_ATTACK,
    自身受到主動行動攻擊後: TIMING.AFTER_ATTACK,
    角色被擊倒時: TIMING.ON_KO,
    自身擊倒敵人時: TIMING.ON_KO,
    角色恢復時: TIMING.ON_HEAL,
    自身受到其他角色的恢復時: TIMING.ON_HEAL,
    自身造成恢復效果時: TIMING.ON_HEAL,
    角色被施加效果時: TIMING.ON_EFFECT_APPLIED,
    友方被施加減益時: TIMING.ON_EFFECT_APPLIED,
    敵方被施加增益時: TIMING.ON_EFFECT_APPLIED,
    角色移動時: TIMING.ON_MOVE
});

/** Old reaction_windows.trigger_type aliases */
const LEGACY_TRIGGER_ALIAS = Object.freeze({
    attack_declared: TIMING.ON_TARGET_DECLARED,
    post_action: TIMING.AFTER_SKILL
});

function normalizeTimingCode(value) {
    if (!value) return null;
    const raw = String(value);
    if (TIMING[raw]) return TIMING[raw];
    if (LEGACY_TRIGGER_ALIAS[raw]) return LEGACY_TRIGGER_ALIAS[raw];
    if (Object.prototype.hasOwnProperty.call(LEGACY_TIMING_MAP, raw)) {
        return LEGACY_TIMING_MAP[raw];
    }
    return null;
}

function timingLabel(code) {
    const normalized = normalizeTimingCode(code) || code;
    return TIMING_LABEL[normalized] || String(code || '反應時點');
}

function timingCodesFromSkill(skill) {
    if (!skill) return [];
    if (skill.timingCode) {
        const code = normalizeTimingCode(skill.timingCode);
        return code ? [code] : [];
    }
    if (Array.isArray(skill.timingCodes)) {
        return skill.timingCodes
            .map(normalizeTimingCode)
            .filter(Boolean);
    }
    const fromLegacy = normalizeTimingCode(skill.timing);
    return fromLegacy ? [fromLegacy] : [];
}

const TURN_FLOW = Object.freeze([
    TIMING.TURN_END,
    TIMING.TURN_START
]);

const ROUND_FLOW = Object.freeze([
    TIMING.ROUND_END,
    TIMING.ROUND_START
]);

const BATTLE_START_FLOW = Object.freeze([
    TIMING.BATTLE_START
]);

const MOVE_TOKEN_FLOW = Object.freeze([
    TIMING.ON_MOVE
]);

const BLOCKING_TIMINGS = new Set([
    TIMING.ON_TARGET_DECLARED,
    TIMING.ON_EFFECT_APPLIED
]);

const POST_SKILL_COLLECT_TIMINGS = Object.freeze([
    TIMING.AFTER_DAMAGE,
    TIMING.ON_DAMAGE,
    TIMING.AFTER_ATTACK,
    TIMING.AFTER_SKILL,
    TIMING.ON_HEAL,
    TIMING.AFTER_ACTIVE_SKILL
]);

function isBlockingTiming(timingCode) {
    return BLOCKING_TIMINGS.has(normalizeTimingCode(timingCode) || timingCode);
}

module.exports = {
    TIMING,
    TIMING_LABEL,
    LEGACY_TIMING_MAP,
    LEGACY_TRIGGER_ALIAS,
    normalizeTimingCode,
    timingLabel,
    timingCodesFromSkill,
    TURN_FLOW,
    ROUND_FLOW,
    BATTLE_START_FLOW,
    MOVE_TOKEN_FLOW,
    BLOCKING_TIMINGS,
    POST_SKILL_COLLECT_TIMINGS,
    isBlockingTiming
};
