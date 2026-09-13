'use strict';

const { TIMING } = require('./timings');
const { createActionContext, appendResultMessage, primaryTargetId } = require('./context');
const {
    pushSkillFrame,
    advance: engineAdvance,
    resumePausedFrame,
    serializeStack,
    restoreStack,
    topFrame,
    isActiveSkill,
    isStackBusy
} = require('./engine');
const { emitTimingBus, emitEffectApplied, emitHealTiming } = require('./timing-bus');
const {
    compilePipeline,
    normalizeSkillKind,
    skillHasPipeline,
    applyPipelineToSkill
} = require('./compile-pipeline');
const { runModule } = require('./modules');

function skillIsMainAction(skill) {
    const kind = normalizeSkillKind(skill);
    if (kind === 'active') return true;
    if (kind === 'auxiliary' || kind === 'passive') return false;
    const code = skill?.actionCode;
    return ['ATTACK', 'HEAL', 'BUFF', 'DEBUFF', 'GUARD', 'MOVE'].includes(code) ||
        skill?.key === 'wait' ||
        (Array.isArray(skill?.pipeline) && skill.pipeline.some(s => s?.module === 'wait')) ||
        String(skill?.timing || '').includes('主動');
}

function skillIsAuxiliary(skill) {
    const kind = normalizeSkillKind(skill);
    if (kind === 'auxiliary') return true;
    if (kind === 'active' || kind === 'passive') return false;
    return String(skill?.cost || '').toUpperCase().includes('SP') &&
        !String(skill?.cost || '').toUpperCase().includes('AP');
}

function requirePipelineSkill(skill) {
    if (skillHasPipeline(skill)) return skill;
    return applyPipelineToSkill(skill);
}

function pushCompiledSkillFrame(stack, skill, contextPartial, sourceKind) {
    const ready = requirePipelineSkill(skill);
    const compiled = compilePipeline(ready);
    const steps = compiled.steps;
    const skillKind = compiled.skillKind;

    const context = createActionContext({
        ...contextPartial,
        actionKind: 'skill',
        skillKey: ready.key,
        skillName: ready.name,
        actionCode: ready.actionCode,
        logicCode: ready.logicCode,
        isMainAction: skillIsMainAction(ready),
        isActiveSkill: skillKind === 'active' || isActiveSkill(ready),
        isAuxiliary: skillIsAuxiliary(ready),
        meta: {
            ...(contextPartial.meta || {}),
            skill: ready,
            effects: [],
            skillKind,
            usePipeline: true,
            skillFlow: steps.map(step => step.timing || step.module)
        }
    });

    const frame = pushSkillFrame(stack, ready, context, sourceKind, steps);
    frame.steps = steps;
    frame.context = context;
    return frame;
}

/**
 * Advance stack with pipeline modules + timing bus.
 */
async function advanceTimingEngine(client, stack, deps = {}) {
    const host = deps.host || {};
    const allEvents = [];
    const allWindows = [];

    const result = await engineAdvance(client, stack, {
        ...deps,
        useBuiltinReactions: false,
        runMonitors: deps.runMonitors,
        onStep: async (c, frame, step) => {
            const skill = frame.context.meta?.skill;

            if (step.kind === 'module' && step.module) {
                const moduleResult = await runModule(step.module, c, {
                    frame,
                    step,
                    params: step.params || {},
                    host,
                    skill,
                    stack,
                    deps
                });
                if (moduleResult?.pause === 'pick') {
                    frame.status = 'paused';
                    frame.context.pickRequest = moduleResult.pickRequest;
                    allEvents.push({
                        type: 'pick_request',
                        pickRequest: moduleResult.pickRequest
                    });
                    return;
                }
                if (moduleResult?.content) {
                    appendResultMessage(frame.context, moduleResult.content);
                }
                if (moduleResult?.emitEffectApplied) {
                    const cascade = await emitEffectApplied(
                        c,
                        stack,
                        frame,
                        {
                            affectedIds: moduleResult.affectedIds || frame.context.affectedIds,
                            appliedEffects: moduleResult.appliedEffects || frame.context.appliedEffects
                        },
                        {
                            loadEquippedRows: deps.loadEquippedRows,
                            loadBuffEntriesMap: deps.loadBuffEntriesMap,
                            createReactionWindow: deps.createReactionWindow,
                            applyStatusMonitor: deps.applyStatusMonitor,
                            skillByKey: deps.skillByKey
                        }
                    );
                    allEvents.push(...(cascade.events || []));
                    allWindows.push(...(cascade.openedWindows || []));
                    if (cascade.pause) {
                        frame.status = 'paused';
                        return;
                    }
                }
                if (moduleResult?.heals?.length) {
                    const cascade = await emitHealTiming(
                        c,
                        stack,
                        frame,
                        moduleResult.heals,
                        {
                            loadEquippedRows: deps.loadEquippedRows,
                            loadBuffEntriesMap: deps.loadBuffEntriesMap,
                            createReactionWindow: deps.createReactionWindow,
                            applyStatusMonitor: deps.applyStatusMonitor,
                            skillByKey: deps.skillByKey
                        }
                    );
                    allEvents.push(...(cascade.events || []));
                    allWindows.push(...(cascade.openedWindows || []));
                    if (cascade.pause) {
                        frame.status = 'paused';
                        return;
                    }
                }
            }

            if (typeof deps.onStep === 'function') {
                await deps.onStep(c, frame, step);
            }

            if (step.silentTiming || !step.timing) {
                return;
            }

            const bus = await emitTimingBus(c, stack, frame, step.timing, {
                loadEquippedRows: deps.loadEquippedRows,
                loadBuffEntriesMap: deps.loadBuffEntriesMap,
                createReactionWindow: deps.createReactionWindow,
                applyStatusMonitor: deps.applyStatusMonitor,
                skillByKey: deps.skillByKey
                // forceBlocking omitted: any player reaction option blocks the pipeline
            });

            allEvents.push(...(bus.events || []));
            allWindows.push(...(bus.openedWindows || []));

            if (bus.pause) {
                frame.status = 'paused';
            }
        }
    });

    const top = topFrame(stack);
    const paused = Boolean(result.paused) || top?.status === 'paused';
    const liveMessages = top?.context?.results?.messages || [];
    const content = [
        result.narrative,
        liveMessages.join('\n'),
        (result.events || []).map(e => e.content).filter(Boolean).join('\n')
    ].filter(Boolean).join('\n') || '';

    return {
        done: !paused && stack.length === 0,
        paused,
        stack,
        events: [...(result.events || []), ...allEvents],
        openedWindows: [...(result.openedWindows || []), ...allWindows],
        pickRequest: top?.context?.pickRequest || null,
        content
    };
}

async function startSkill(client, {
    skill,
    actor,
    target,
    battleState,
    direction = null,
    flags = {},
    sourceKind = null
}, deps = {}) {
    const stack = [];
    const actorKind = actor.kind || 'player';
    const targetKind = (target || actor).kind || actorKind;
    pushCompiledSkillFrame(
        stack,
        skill,
        {
            actorId: actor.id,
            actorName: actor.name,
            actorKind,
            triggerCharacterId: actor.id,
            targetId: target?.id ?? actor.id,
            targetIds: target?.id ? [Number(target.id)] : [Number(actor.id)],
            targetName: target?.name || actor.name,
            direction,
            round: battleState.round,
            turnPass: battleState.turnPass,
            flags: {
                ...flags,
                targetIsAlly: targetKind === actorKind
            },
            meta: {
                actorRow: actor,
                targetRow: target || actor,
                skill,
                targetKind,
                actorKind
            }
        },
        sourceKind || (isActiveSkill(skill) ? 'active_skill' : 'reaction_skill')
    );

    return advanceTimingEngine(client, stack, deps);
}

async function resumeSkill(client, stackOrSnapshot, {
    flags = null,
    targetId = null,
    pickedTargetId = null,
    advanceIndex = true
} = {}, deps = {}) {
    const stack = Array.isArray(stackOrSnapshot)
        ? stackOrSnapshot
        : restoreStack(stackOrSnapshot);

    const frame = topFrame(stack);
    if (frame) {
        resumePausedFrame(stack, {
            flags: {
                ...(flags || {}),
                ...(pickedTargetId != null
                    ? { pickedTargetId: Number(pickedTargetId) }
                    : {})
            },
            targetId: targetId ?? pickedTargetId,
            advanceIndex
        });
        if (pickedTargetId != null) {
            frame.context.flags.pickedTargetId = Number(pickedTargetId);
            frame.context.pickRequest = null;
        }
    }

    return advanceTimingEngine(client, stack, deps);
}

module.exports = {
    pushCompiledSkillFrame,
    advanceTimingEngine,
    startSkill,
    resumeSkill,
    serializeStack,
    restoreStack,
    topFrame,
    isActiveSkill,
    isStackBusy,
    skillIsMainAction,
    skillIsAuxiliary,
    skillHasPipeline,
    compilePipeline,
    normalizeSkillKind,
    primaryTargetId,
    requirePipelineSkill
};
