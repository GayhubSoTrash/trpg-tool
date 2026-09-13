'use strict';

/**
 * Reaction pipeline helpers.
 * Effects are authored entirely on skill.pipeline in skill-data.js —
 * there is no effectId template table.
 */

const { requiresDesignate } = require('./target-resolve');

function activateOnUse(onUse) {
    return [
        {
            module: 'activate_skill',
            params: { spendCost: false, onUse: onUse || [] }
        },
        { module: 'finalize', params: {} }
    ];
}

function stripResolveTargetsWithoutDesignate(skill, pipeline) {
    if (requiresDesignate(skill)) return pipeline;
    return (pipeline || []).filter(entry => entry?.module !== 'resolve_targets');
}

function skillPipelineHasWork(skill) {
    const pipe = Array.isArray(skill?.pipeline) ? skill.pipeline : [];
    for (const entry of pipe) {
        if (entry?.module === 'activate_skill') {
            const onUse = entry.params?.onUse;
            if (Array.isArray(onUse) && onUse.length) return true;
        }
        if (
            entry?.module === 'attack_segment' ||
            entry?.module === 'heal_segment' ||
            entry?.module === 'buff_segment' ||
            entry?.module === 'move_segment' ||
            entry?.module === 'charge_pending' ||
            entry?.module === 'resolve_targets' ||
            entry?.module === 'wait'
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Stamp skillKind and strip unnecessary resolve_targets.
 * Requires an authored pipeline with real work — no template fallback.
 */
function ensureReactionPipeline(skill) {
    if (!skill || typeof skill !== 'object') {
        throw new Error('反應戰技無效');
    }
    if (!Array.isArray(skill.pipeline) || !skill.pipeline.length) {
        throw new Error(`反應戰技缺少 pipeline：${skill.key || '(unknown)'}`);
    }
    const pipeline = stripResolveTargetsWithoutDesignate(skill, skill.pipeline);
    const next = {
        ...skill,
        skillKind: skill.skillKind || 'auxiliary',
        pipeline
    };
    if (!skillPipelineHasWork(next)) {
        throw new Error(`反應戰技 pipeline 沒有可執行步驟：${skill.key || '(unknown)'}`);
    }
    return next;
}

/** @deprecated identity helper kept for call sites that previously merged templates */
function mergeReactionPipeline(skill, pipeline) {
    return stripResolveTargetsWithoutDesignate(skill, pipeline);
}

module.exports = {
    ensureReactionPipeline,
    mergeReactionPipeline,
    skillPipelineHasWork,
    activateOnUse
};
