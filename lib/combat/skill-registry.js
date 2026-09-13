'use strict';

/**
 * Skill behavior registry — pipeline + reaction registration.
 *
 * Structural reaction defs are authored on each skill in skill-data.js.
 * register-actives.js calls defineSkill() for every skill; this module only
 * stores the resulting behaviors.
 *
 * Usage:
 *   const { defineSkill, getSkillBehavior } = require('./skill-registry');
 *   defineSkill('職業:戰技名', { reaction, pipeline });
 */

const { TIMING } = require('./timings');

/** @type {Map<string, object>} */
const SKILL_BEHAVIORS = new Map();

/** Mutable catalog rebuilt after batch registration (same object identity). */
const REACTION_DEFS = {};

function defineSkill(key, def = {}) {
    if (!key) throw new Error('defineSkill requires a skill key');
    const prev = SKILL_BEHAVIORS.get(key) || { key };
    const next = {
        ...prev,
        ...def,
        key,
        reaction: def.reaction != null
            ? { ...(prev.reaction || {}), ...def.reaction }
            : prev.reaction
    };
    SKILL_BEHAVIORS.set(key, next);
    return next;
}

function getSkillBehavior(key) {
    return SKILL_BEHAVIORS.get(key) || null;
}

function listSkillBehaviors() {
    return [...SKILL_BEHAVIORS.values()];
}

function buildReactionDefs() {
    const out = {};
    for (const behavior of SKILL_BEHAVIORS.values()) {
        if (!behavior.reaction) continue;
        out[behavior.key] = { ...behavior.reaction };
    }
    return out;
}

/** Rebuild REACTION_DEFS in place so existing destructured refs stay live. */
function rebuildReactionDefs() {
    const next = buildReactionDefs();
    for (const key of Object.keys(REACTION_DEFS)) {
        delete REACTION_DEFS[key];
    }
    Object.assign(REACTION_DEFS, next);
    return REACTION_DEFS;
}

function requireSkillRegistered(skillKey) {
    if (!SKILL_BEHAVIORS.has(skillKey)) {
        throw new Error(`未登記戰技：${skillKey}`);
    }
    return SKILL_BEHAVIORS.get(skillKey);
}

module.exports = {
    TIMING,
    defineSkill,
    getSkillBehavior,
    listSkillBehaviors,
    buildReactionDefs,
    rebuildReactionDefs,
    requireSkillRegistered,
    SKILL_BEHAVIORS,
    REACTION_DEFS
};
