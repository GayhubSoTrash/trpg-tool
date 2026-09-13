'use strict';

/**
 * Legacy skill-key special-case table — emptied.
 * Skill behaviour is authored on skill-data pipelines / params only.
 * isSkill / isAnySkill remain as stubs that always return false / throw on
 * unknown names so stale call sites fail loudly.
 */

const SPECIAL_SKILL_KEYS = Object.freeze({});

const SKILL_KEY_ALIASES = Object.freeze({
    'initial:基礎攻擊': ['basic_attack'],
    'initial:救援': ['rescue'],
    'initial:基礎格擋': ['basic_guard'],
    'initial:基礎移動': ['basic_move']
});

function isSkill(skill, ruleName) {
    const key = SPECIAL_SKILL_KEYS[ruleName];
    if (!key) {
        throw new Error(`未知的戰技規則名稱：${ruleName}`);
    }
    if (!skill?.key) return false;
    if (skill.key === key) return true;
    return (SKILL_KEY_ALIASES[key] || []).includes(skill.key);
}

function isAnySkill(skill, ...ruleNames) {
    return ruleNames.some(ruleName => isSkill(skill, ruleName));
}

module.exports = {
    SPECIAL_SKILL_KEYS,
    SKILL_KEY_ALIASES,
    isSkill,
    isAnySkill
};
