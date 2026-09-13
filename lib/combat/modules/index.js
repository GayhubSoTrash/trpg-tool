'use strict';

/**
 * Pipeline segment catalog (modules).
 *
 * Author skills in skill-data.js as:
 *   pipeline: [ { module, params }, ... ]
 *
 * Segments:
 *   resolve_targets  — pick / stamp targetIds; optional ON_TARGET_DECLARED
 *   activate_skill   — spend cost + onUse ops
 *   attack_segment   — host attack hits; params.packets / onHit / onHitPerPacket /
 *                      afterAttackSelf / allyHeal
 *   heal_segment     — host heal; params.mode revive|life_transfer|normal, cleanse
 *   buff_segment     — host buff/debuff; params.recipients / resourceGain
 *   move_segment     — host move/swap; params.swap / grantBoth
 *   charge_pending   — begin charge for delayed skills
 *   wait             — wait / skip main action
 *   finalize         — AFTER_SKILL bookkeeping
 *
 * Reusable ops live in ./ops.js (apply_status, gain_resource, set_flag, …).
 * Never branch on skill.key / skill.name — add a generic param or op instead.
 */

const resolveTargets = require('./resolve-targets');
const activateSkill = require('./activate-skill');
const attackSegment = require('./attack-segment');
const healSegment = require('./heal-segment');
const buffSegment = require('./buff-segment');
const moveSegment = require('./move-segment');
const chargePending = require('./charge-pending');
const wait = require('./wait');
const finalize = require('./finalize');

const MODULE_TABLE = Object.freeze({
    resolve_targets: resolveTargets,
    activate_skill: activateSkill,
    attack_segment: attackSegment,
    heal_segment: healSegment,
    buff_segment: buffSegment,
    move_segment: moveSegment,
    charge_pending: chargePending,
    wait,
    finalize
});

async function runModule(name, client, ctx) {
    const mod = MODULE_TABLE[name];
    if (!mod || typeof mod.run !== 'function') {
        throw new Error(`未知 pipeline 模塊：${name}`);
    }
    return mod.run(client, ctx);
}

function listModules() {
    return Object.keys(MODULE_TABLE);
}

module.exports = {
    MODULE_TABLE,
    runModule,
    listModules
};
