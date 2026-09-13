'use strict';

const { TIMING } = require('./timings');
const {
    mergeReactionPipeline
} = require('./reaction-pipelines');

/**
 * Compile skillKind + pipeline[] into engine steps.
 * Each module step carries timing for emitTimingBus + module name for runModule.
 */

function normalizeSkillKind(skill) {
    if (skill?.skillKind) return String(skill.skillKind);
    return inferSkillKind(skill);
}

function expandModule(entry) {
    const name = entry?.module;
    const params = entry?.params && typeof entry.params === 'object'
        ? entry.params
        : {};
    if (!name) return [];

    if (name === 'resolve_targets') {
        if (params.emitDeclare === false) {
            return [{
                timing: TIMING.DURING_SKILL,
                kind: 'module',
                module: name,
                params,
                silentTiming: true
            }];
        }
        return [{
            timing: TIMING.ON_TARGET_DECLARED,
            kind: 'module',
            module: name,
            params
        }];
    }

    if (name === 'activate_skill') {
        return [{
            timing: TIMING.DURING_SKILL,
            kind: 'module',
            module: name,
            params
        }];
    }

    if (name === 'attack_segment') {
        return [
            {
                timing: TIMING.DURING_ATTACK,
                kind: 'module',
                module: name,
                params
            },
            { timing: TIMING.AFTER_HIT_CHECK, kind: 'timing' },
            { timing: TIMING.ON_DAMAGE, kind: 'timing' },
            { timing: TIMING.AFTER_DAMAGE, kind: 'timing' },
            { timing: TIMING.AFTER_ATTACK, kind: 'timing' }
        ];
    }

    if (name === 'buff_segment') {
        return [{
            timing: TIMING.DURING_SKILL,
            kind: 'module',
            module: name,
            params,
            silentTiming: true
        }];
    }

    if (name === 'heal_segment') {
        return [{
            timing: TIMING.ON_HEAL,
            kind: 'module',
            module: name,
            params
        }];
    }

    if (name === 'move_segment') {
        return [{
            timing: TIMING.ON_MOVE,
            kind: 'module',
            module: name,
            params
        }];
    }

    if (name === 'charge_pending') {
        return [{
            timing: TIMING.DURING_SKILL,
            kind: 'module',
            module: name,
            params,
            silentTiming: true
        }];
    }

    if (name === 'wait') {
        return [{
            timing: TIMING.DURING_MAIN_ACTION,
            kind: 'module',
            module: name,
            params
        }];
    }

    if (name === 'finalize') {
        return [{
            timing: TIMING.AFTER_SKILL,
            kind: 'module',
            module: name,
            params
        }];
    }

    return [{
        timing: TIMING.DURING_SKILL,
        kind: 'module',
        module: name,
        params
    }];
}

/**
 * @returns {{ steps: object[], skillKind: string }}
 */
function compilePipeline(skill) {
    const skillKind = normalizeSkillKind(skill);
    const pipeline = Array.isArray(skill?.pipeline) ? skill.pipeline : [];
    const steps = [];

    if (skillKind === 'active') {
        steps.push(
            { timing: TIMING.BEFORE_MAIN_ACTION, kind: 'timing' },
            { timing: TIMING.DURING_MAIN_ACTION, kind: 'timing' },
            { timing: TIMING.BEFORE_SKILL, kind: 'timing' }
        );
    } else if (skillKind === 'auxiliary') {
        steps.push({ timing: TIMING.BEFORE_SKILL, kind: 'timing' });
    }

    for (const entry of pipeline) {
        steps.push(...expandModule(entry));
    }

    // Ensure AFTER_SKILL exists (finalize module includes it; if missing, add)
    const hasAfterSkill = steps.some(s => s.timing === TIMING.AFTER_SKILL);
    if (!hasAfterSkill) {
        steps.push({ timing: TIMING.AFTER_SKILL, kind: 'timing' });
    }

    if (skillKind === 'active') {
        if (!steps.some(s => s.timing === TIMING.AFTER_ACTIVE_SKILL)) {
            steps.push({ timing: TIMING.AFTER_ACTIVE_SKILL, kind: 'timing' });
        }
        if (!steps.some(s => s.timing === TIMING.AFTER_MAIN_ACTION)) {
            steps.push({ timing: TIMING.AFTER_MAIN_ACTION, kind: 'timing' });
        }
    }

    return { steps, skillKind };
}

function skillHasPipeline(skill) {
    return Array.isArray(skill?.pipeline) && skill.pipeline.length > 0;
}

function inferSkillKind(skill) {
    if (skill?.skillKind) return String(skill.skillKind);
    if (
        skill?.actionCode === 'PASSIVE' ||
        (skill?.manual === false && skill?.actionCode === 'PASSIVE')
    ) {
        return 'passive';
    }
    const cost = String(skill?.cost || '').toUpperCase();
    if (cost.includes('SP') && !cost.includes('AP')) return 'auxiliary';
    const pipe = Array.isArray(skill?.pipeline) ? skill.pipeline : [];
    if (pipe.some(step => step?.module === 'wait') || skill?.key === 'wait') {
        return 'active';
    }
    if (cost.includes('AP') || String(skill?.timing || '').includes('主動')) {
        return 'active';
    }
    return 'auxiliary';
}

function defaultOn(skill) {
    const code = skill?.targetCode || 'SELF';
    if (code === 'SELF') return 'actor';
    return 'target';
}

function grantsToOps(grants, on) {
    const mods = [];
    const statusKeys = [];
    for (const grant of grants || []) {
        if (grant && typeof grant === 'object' && (grant.type === 'mod' || (grant.stat && grant.mode))) {
            mods.push({
                stat: grant.stat,
                mode: grant.mode,
                value: Math.trunc(Number(grant.value) || 0)
            });
        } else if (typeof grant === 'string') {
            statusKeys.push(grant);
        }
    }
    const ops = [];
    if (mods.length) ops.push({ op: 'apply_mod', on, mods });
    if (statusKeys.length) ops.push({ op: 'apply_status', on, statusKeys });
    return ops;
}

/**
 * Build { skillKind, pipeline } for a skill.
 * Pipelines must be authored in skill-data — no logicCode inference.
 */
function buildPipeline(skill) {
    if (!Array.isArray(skill?.pipeline) || !skill.pipeline.length) {
        throw new Error(`戰技缺少 authored pipeline：${skill?.key || '(unknown)'}`);
    }
    return {
        skillKind: inferSkillKind(skill),
        pipeline: mergeReactionPipeline(skill, skill.pipeline)
    };
}

function applyPipelineToSkill(skill) {
    const built = buildPipeline(skill);
    return {
        ...skill,
        skillKind: built.skillKind,
        pipeline: built.pipeline
    };
}

module.exports = {
    compilePipeline,
    normalizeSkillKind,
    skillHasPipeline,
    expandModule,
    inferSkillKind,
    buildPipeline,
    applyPipelineToSkill,
    grantsToOps,
    defaultOn
};
