'use strict';

const { TIMING, timingLabel, normalizeTimingCode } = require('./timings');
const { createActionContext, mergeFlags, primaryTargetId, serializeResume } = require('./context');
const { isBlockingTiming } = require('./timings');
const { collectReactionOptions } = require('./matcher');
const { attackDescriptor } = require('./effects');
const { compilePipeline, applyPipelineToSkill, skillHasPipeline } = require('./compile-pipeline');

let frameSeq = 1;

function createFrame({
    sourceKind = 'active_skill',
    source = null,
    steps = [],
    context = null,
    parentId = null
}) {
    return {
        id: frameSeq++,
        sourceKind,
        sourceKey: source?.key || source?.skillKey || null,
        sourceName: source?.name || source?.skillName || null,
        steps,
        index: 0,
        context: context || createActionContext(),
        parentId,
        status: 'running' // running | paused | done
    };
}

function serializeStack(stack) {
    return {
        frames: (stack || []).map(frame => ({
            id: frame.id,
            sourceKind: frame.sourceKind,
            sourceKey: frame.sourceKey,
            sourceName: frame.sourceName,
            steps: frame.steps,
            index: frame.index,
            context: frame.context,
            parentId: frame.parentId,
            status: frame.status,
            stepExecuted: Boolean(frame.stepExecuted)
        })),
        frameSeq
    };
}

function restoreStack(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.frames)) return [];
    if (snapshot.frameSeq) frameSeq = Math.max(frameSeq, Number(snapshot.frameSeq) || 1);
    return snapshot.frames.map(frame => ({ ...frame }));
}

function topFrame(stack) {
    return stack.length ? stack[stack.length - 1] : null;
}

function currentStep(frame) {
    if (!frame || frame.index >= frame.steps.length) return null;
    return frame.steps[frame.index];
}

function shouldRunStep(step, context) {
    if (!step?.when) return true;
    if (step.when === 'hitAndDamage') {
        const segments = context.results?.segments || [];
        const seg = segments.find(
            item =>
                Number(item.segment) === Number(step.segment) &&
                String(item.effectRef || '') === String(step.effectRef || '')
        ) || segments[step.segment];
        if (!seg) return false;
        return Boolean(seg.hit) && Number(seg.hpLoss || seg.damage || 0) > 0;
    }
    return true;
}

/**
 * Create a new skill frame from skill pipeline.
 */
function pushSkillFrame(stack, skill, contextPartial = {}, sourceKind = 'active_skill', stepsOverride = null) {
    const ready = skillHasPipeline(skill) ? skill : applyPipelineToSkill(skill);
    const steps = Array.isArray(stepsOverride) && stepsOverride.length
        ? stepsOverride
        : compilePipeline(ready).steps;
    const context = createActionContext({
        ...contextPartial,
        actionKind: 'skill',
        skillKey: ready.key,
        skillName: ready.name,
        actionCode: ready.actionCode,
        logicCode: ready.logicCode,
        attack: ready.actionCode === 'ATTACK' ? attackDescriptor(ready) : null,
        meta: {
            ...(contextPartial.meta || {}),
            skill: ready,
            effects: [],
            usePipeline: true,
            skillFlow: steps.map(step => step.timing || step.module)
        }
    });

    const parent = topFrame(stack);
    const frame = createFrame({
        sourceKind,
        source: ready,
        steps,
        context,
        parentId: parent ? parent.id : null
    });
    stack.push(frame);
    return frame;
}

function pushMonitorFrame(stack, timingCode, contextPartial) {
    const timing = normalizeTimingCode(timingCode) || timingCode;
    const parent = topFrame(stack);
    const frame = createFrame({
        sourceKind: 'monitor',
        source: { key: `monitor:${timing}`, name: timingLabel(timing) },
        steps: [{ timing, kind: 'timing' }],
        context: createActionContext({
            ...contextPartial,
            actionKind: 'monitor',
            phase: timing
        }),
        parentId: parent ? parent.id : null
    });
    stack.push(frame);
    return frame;
}

function popFrame(stack) {
    return stack.pop() || null;
}

/**
 * Advance the stack until pause (reaction window) or empty.
 *
 * deps:
 *  - loadEquippedRows(client)
 *  - createReactionWindow(client, payload)
 *  - onStep?(client, frame, step)
 *  - runMonitors?(client, stack, events)
 */
async function advance(client, stack, deps = {}) {
    const events = [];
    const openedWindows = [];
    const completedMessages = [];

    while (stack.length) {
        const frame = topFrame(stack);
        if (!frame || frame.status === 'paused') break;

        if (frame.index >= frame.steps.length) {
            frame.status = 'done';
            const msgs = frame.context?.results?.messages;
            if (Array.isArray(msgs) && msgs.length) {
                completedMessages.push(...msgs.filter(Boolean));
            }
            popFrame(stack);
            continue;
        }

        const step = currentStep(frame);
        frame.context.phase = step.timing;

        if (!shouldRunStep(step, frame.context)) {
            frame.index += 1;
            frame.stepExecuted = false;
            continue;
        }

        // Run each step once. Nested monitor frames (e.g. 再生 → ON_HEAL)
        // yield via `continue` without advancing index; without this guard the
        // parent would re-emit the same timing forever and hang the attack.
        if (!frame.stepExecuted) {
            if (typeof deps.onStep === 'function') {
                await deps.onStep(client, frame, step);
            }
            frame.stepExecuted = true;
        }

        // Drain nested frames before honoring parent pause, so status
        // cascades (再生 → ON_HEAL) resolve even when the parent timing
        // also opened a reaction window.
        if (topFrame(stack) !== frame) {
            continue;
        }

        // onStep (timing-bus) may pause for reactions or target pick.
        if (frame.status === 'paused') {
            events.push({
                type: 'paused',
                timing: step.timing,
                pickRequest: frame.context.pickRequest || null
            });
            return {
                done: false,
                paused: true,
                stack,
                events,
                openedWindows,
                narrative: completedMessages.join('\n')
            };
        }

        if (deps.useBuiltinReactions !== false &&
            typeof deps.createReactionWindow === 'function' &&
            typeof deps.loadEquippedRows === 'function') {
            const equippedRows = await deps.loadEquippedRows(client);

            const options = collectReactionOptions({
                equippedRows,
                timingCodes: [step.timing],
                context: frame.context,
                actor: frame.context.meta?.actorRow || {
                    id: frame.context.actorId,
                    name: frame.context.actorName,
                    kind: frame.context.actorKind
                },
                target: frame.context.meta?.targetRow || {
                    id: primaryTargetId(frame.context),
                    name: frame.context.targetName
                }
            });

            const blocking = isBlockingTiming(step.timing) ||
                step.timing === TIMING.ON_TARGET_DECLARED;

            if (options.length) {
                const created = await deps.createReactionWindow(client, {
                    triggerType: step.timing,
                    blocking,
                    sourceActorId: frame.context.actorId,
                    sourceTargetId: primaryTargetId(frame.context),
                    sourceSkillKey: frame.context.skillKey,
                    round: frame.context.round,
                    turnPass: frame.context.turnPass,
                    context: {
                        timingCode: step.timing,
                        timingLabel: timingLabel(step.timing),
                        actorId: frame.context.actorId,
                        actorName: frame.context.actorName,
                        targetId: primaryTargetId(frame.context),
                        targetIds: frame.context.targetIds || [],
                        targetName: frame.context.targetName,
                        skillName: frame.context.skillName,
                        actionCode: frame.context.actionCode,
                        attack: frame.context.attack,
                        segment: step.segment,
                        effectRef: step.effectRef,
                        stackDepth: stack.length
                    },
                    options,
                    resumePayload: {
                        ...serializeResume(frame.context),
                        stack: serializeStack(stack),
                        frameId: frame.id,
                        stepIndex: frame.index
                    }
                });

                const windows = Array.isArray(created)
                    ? created.filter(Boolean)
                    : (created ? [created] : []);

                if (windows.length) {
                    openedWindows.push(...windows);
                    if (blocking) {
                        frame.status = 'paused';
                        events.push({
                            type: 'paused',
                            timing: step.timing,
                            windows,
                            window: windows[0]
                        });
                        return {
                            done: false,
                            paused: true,
                            stack,
                            events,
                            openedWindows,
                            narrative: completedMessages.join('\n')
                        };
                    }
                }
            }
        }

        frame.index += 1;
        frame.stepExecuted = false;
    }

    return {
        done: stack.length === 0,
        paused: false,
        stack,
        events,
        openedWindows,
        narrative: completedMessages.join('\n')
    };
}

/**
 * Resume a paused frame after reaction skip/ready, optionally merging flags.
 */
function resumePausedFrame(stack, {
    flags = null,
    targetId = null,
    advanceIndex = true
} = {}) {
    const frame = topFrame(stack);
    if (!frame) return null;

    if (flags) mergeFlags(frame.context, flags);
    if (targetId != null) {
        frame.context.targetId = Number(targetId);
        frame.context.targetIds = [Number(targetId)];
    }
    frame.status = 'running';
    if (advanceIndex) {
        frame.index += 1;
        frame.stepExecuted = false;
    } else {
        // Re-enter the same step after a pick without re-running completed work
        // that already set stepExecuted; callers that need a full re-emit should
        // clear stepExecuted explicitly.
        frame.stepExecuted = false;
    }
    return frame;
}

function isStackBusy(stack) {
    return Array.isArray(stack) && stack.length > 0;
}

function isActiveSkill(skill) {
    if (!skill) return false;
    if (skill.sourceKind === 'active_skill') return true;
    if (skill.contextReaction || skill.reaction) return false;
    if (skill.actionCode === 'PASSIVE' || skill.manual === false) return false;
    const timing = String(skill.timing || '');
    return timing.includes('主動') || timing === '' || Boolean(skill.manual);
}

module.exports = {
    createFrame,
    serializeStack,
    restoreStack,
    topFrame,
    currentStep,
    pushSkillFrame,
    pushMonitorFrame,
    popFrame,
    advance,
    resumePausedFrame,
    isStackBusy,
    isActiveSkill,
    shouldRunStep
};
