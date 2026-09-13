'use strict';

const { skillEffectId, attackDescriptor } = require('./effects');
const { createActionContext } = require('./context');
const { TIMING } = require('./timings');
const { compilePipeline, applyPipelineToSkill, skillHasPipeline } = require('./compile-pipeline');

/**
 * Build the shared action context used while resolving a skill.
 */
function beginSkillResolution({
    actor,
    target,
    skill,
    direction = null,
    round,
    turnPass,
    flags = {}
}) {
    const ready = skillHasPipeline(skill) ? skill : applyPipelineToSkill(skill);
    const { steps, skillKind } = compilePipeline(ready);
    const skillFlow = steps.map(step => step.timing || step.module);
    const context = createActionContext({
        actionKind: 'skill',
        actorId: actor.id,
        actorName: actor.name,
        actorKind: actor.kind || 'player',
        targetId: target?.id,
        targetName: target?.name,
        skillKey: ready.key,
        skillName: ready.name,
        actionCode: ready.actionCode,
        logicCode: ready.logicCode,
        direction,
        attack: ready.actionCode === 'ATTACK' ? attackDescriptor(ready) : null,
        flags,
        round,
        turnPass,
        meta: {
            skill: ready,
            skillKind,
            skillFlow,
            effectId: skillEffectId(ready)
        }
    });

    return {
        context,
        skillFlow,
        effectId: skillEffectId(ready)
    };
}

function annotateSkillPayload(payload, { skillFlow, effectId, phase = null }) {
    return {
        ...payload,
        skillFlow,
        effectId,
        phase: phase || payload.phase || null
    };
}

const RESOLUTION_PHASES = Object.freeze({
    DECLARE: TIMING.ON_TARGET_DECLARED,
    EXECUTE: TIMING.DURING_SKILL,
    ATTACK: TIMING.DURING_ATTACK,
    HIT_CHECK: TIMING.AFTER_HIT_CHECK,
    DAMAGE: TIMING.ON_DAMAGE,
    AFTER_DAMAGE: TIMING.AFTER_DAMAGE,
    HEAL: TIMING.ON_HEAL,
    EFFECT: TIMING.ON_EFFECT_APPLIED,
    MOVE: TIMING.ON_MOVE,
    AFTER: TIMING.AFTER_SKILL
});

module.exports = {
    beginSkillResolution,
    annotateSkillPayload,
    RESOLUTION_PHASES
};
