'use strict';

/**
 * Read declarative params off an authored skill.pipeline.
 * Prefer module params over top-level skill fields when both exist.
 */

function pipelineModuleParams(skill, moduleName) {
    const pipe = Array.isArray(skill?.pipeline) ? skill.pipeline : [];
    const entry = pipe.find(step => step && step.module === moduleName);
    return (entry && entry.params) || {};
}

function recipientsSpec(skill) {
    if (skill?.recipients) return skill.recipients;
    const fromBuff = pipelineModuleParams(skill, 'buff_segment').recipients;
    if (fromBuff) return fromBuff;
    const fromActivate = pipelineModuleParams(skill, 'activate_skill');
    const onUse = Array.isArray(fromActivate.onUse) ? fromActivate.onUse : [];
    for (const op of onUse) {
        if (op?.op === 'apply_status' && op.recipients) return op.recipients;
        if (op?.recipients) return op.recipients;
    }
    return null;
}

function attackSegmentParams(skill) {
    return pipelineModuleParams(skill, 'attack_segment');
}

function moveSegmentParams(skill) {
    return pipelineModuleParams(skill, 'move_segment');
}

function onHitPerPacket(skill) {
    const list = attackSegmentParams(skill).onHitPerPacket;
    return Array.isArray(list) ? list : null;
}

function afterAttackSelf(skill) {
    const keys = attackSegmentParams(skill).afterAttackSelf;
    return Array.isArray(keys) ? keys : null;
}

function allyHealSpec(skill) {
    return attackSegmentParams(skill).allyHeal || null;
}

function resourceGainOnBuff(skill) {
    if (skill?.resourceGain) return skill.resourceGain;
    return pipelineModuleParams(skill, 'buff_segment').resourceGain || null;
}

function buffValueFromTarget(skill) {
    return Boolean(
        skill?.buffValueFromTarget ||
        pipelineModuleParams(skill, 'buff_segment').valueFromTarget ||
        pipelineModuleParams(skill, 'activate_skill').valueFromTarget
    );
}

function applySelfStatus(skill) {
    return Boolean(
        skill?.applySelfStatus ||
        pipelineModuleParams(skill, 'buff_segment').applySelf
    );
}

function healMode(skill) {
    if (skill?.healMode) return skill.healMode;
    return pipelineModuleParams(skill, 'heal_segment').mode || null;
}

function healCleanse(skill) {
    if (skill?.healCleanse) return true;
    return Boolean(pipelineModuleParams(skill, 'heal_segment').cleanse);
}

function utilityMode(skill) {
    return skill?.utilityMode ||
        pipelineModuleParams(skill, 'buff_segment').utilityMode ||
        null;
}

function isWaitSkill(skill) {
    if (!skill) return false;
    if (skill.key === 'wait' || skill.key === 'initial:待機') return true;
    const pipe = Array.isArray(skill.pipeline) ? skill.pipeline : [];
    return pipe.some(step => step?.module === 'wait');
}

function isRescueSkill(skill) {
    return Boolean(
        skill?.key === 'rescue' ||
        skill?.key === 'initial:救援'
    );
}

module.exports = {
    pipelineModuleParams,
    recipientsSpec,
    attackSegmentParams,
    moveSegmentParams,
    onHitPerPacket,
    afterAttackSelf,
    allyHealSpec,
    resourceGainOnBuff,
    buffValueFromTarget,
    applySelfStatus,
    healMode,
    healCleanse,
    utilityMode,
    isWaitSkill,
    isRescueSkill
};
