'use strict';

const { TIMING, normalizeTimingCode, timingLabel } = require('./timings');
const { createActionContext, primaryTargetId, setAffected } = require('./context');
const { isBlockingTiming } = require('./timings');
const { collectReactionOptions } = require('./matcher');
const { resolveTargets, requiresDesignate } = require('./target-resolve');
const { pushMonitorFrame, serializeStack } = require('./engine');
const { matchingStatusTicks } = require('./status-tick');

/**
 * Status monitors that fire as timing subscribers (not host special-cases).
 * Driven by the STATUS_TICKS table so adding a DoT/HoT needs no change here.
 */
function collectStatusMonitorOptions(context, buffEntriesByCharacter = new Map()) {
    const timing = normalizeTimingCode(context.phase) || context.phase;
    const actorId = Number(context.actorId || 0);

    return matchingStatusTicks(context, buffEntriesByCharacter, timing)
        .map(({ tick, entry }) => ({
            id: `status:${tick.key}:${actorId}`,
            sourceKind: 'status',
            effectId: tick.effectId,
            actorId,
            actorName: context.actorName,
            skillKey: `status:${tick.key}`,
            skillName: tick.label,
            timingCode: timing,
            auto: true,
            note: tick.note,
            meta: { buffEntry: entry }
        }));
}

/**
 * Emit a timing point: collect reactions + status monitors, open windows,
 * auto-run status effects, optionally cascade nested timings.
 */
async function emitTimingBus(client, stack, frame, timingCode, deps = {}) {
    const code = normalizeTimingCode(timingCode) || timingCode;
    const context = frame.context;
    context.phase = code;

    const events = [];
    const openedWindows = [];

    const equippedRows = typeof deps.loadEquippedRows === 'function'
        ? await deps.loadEquippedRows(client)
        : [];

    const buffEntriesByCharacter = typeof deps.loadBuffEntriesMap === 'function'
        ? await deps.loadBuffEntriesMap(client, context)
        : new Map();

    const reactionOptions = collectReactionOptions({
        equippedRows,
        timingCodes: [code],
        context,
        actor: context.meta?.actorRow || {
            id: context.actorId,
            name: context.actorName,
            kind: context.actorKind
        },
        target: context.meta?.targetRow || {
            id: primaryTargetId(context),
            name: context.targetName
        }
    });

    const statusOptions = collectStatusMonitorOptions(context, buffEntriesByCharacter);
    const autoOptions = statusOptions.filter(item => item.auto);
    const playerOptions = reactionOptions;

    // Auto status monitors run immediately and may cascade.
    for (const option of autoOptions) {
        if (typeof deps.applyStatusMonitor !== 'function') continue;
        const applied = await deps.applyStatusMonitor(client, {
            option,
            frame,
            context,
            stack
        });
        if (applied?.events) events.push(...applied.events);
        if (applied?.cascadeTiming) {
            // Healer for ON_HEAL reactions is the status source when present;
            // the regenerated actor remains the heal target / affected id.
            const healSourceId = Number(
                option.meta?.buffEntry?.source_character_id || option.actorId
            );
            const child = pushMonitorFrame(stack, applied.cascadeTiming, {
                ...context,
                triggerCharacterId: option.actorId,
                actorId: healSourceId || option.actorId,
                actorName: option.actorName,
                affectedIds: applied.affectedIds || [option.actorId],
                results: {
                    ...(context.results || {}),
                    heals: applied.heals || [],
                    damages: applied.damages || []
                },
                // Monitor cascade is not itself an active-skill cast.
                isActiveSkill: false,
                isMainAction: false,
                isAuxiliary: false
            });
            events.push({
                type: 'cascade',
                timing: applied.cascadeTiming,
                frameId: child.id,
                from: option.effectId
            });
        }
    }

    if (playerOptions.length && typeof deps.createReactionWindow === 'function') {
        // Enrich options that need singular pick among affectedIds
        const enriched = [];
        for (const option of playerOptions) {
            const skill = deps.skillByKey?.(option.skillKey) || {
                key: option.skillKey,
                name: option.skillName,
                effect: option.effect
            };

            // Matcher already bound a concrete target (damages / follow-up /
            // affected candidates). Do not retarget via resolveTargets —
            // that falls back to attack target / trigger and breaks
            // wording like「該友方」「其」.
            const boundTargetId = Number(
                option.meta?.damagedTargetId ||
                option.meta?.followUpTargetId ||
                0
            );
            if (boundTargetId) {
                enriched.push({
                    ...option,
                    targetId: boundTargetId
                });
                continue;
            }
            if (Array.isArray(option.meta?.candidateIds) && option.meta.candidateIds.length) {
                enriched.push(option);
                continue;
            }

            if (!requiresDesignate(skill)) {
                const resolved = resolveTargets(skill, context, {
                    pickedTargetId: option.targetId
                });
                if (resolved.mode === 'pick') {
                    enriched.push({
                        ...option,
                        needsPick: true,
                        candidateIds: resolved.candidateIds,
                        note: option.note || resolved.pickRequest?.prompt
                    });
                    continue;
                }
                if (resolved.resolvedIds.length === 1) {
                    enriched.push({
                        ...option,
                        targetId: resolved.resolvedIds[0],
                        meta: {
                            ...(option.meta || {}),
                            autoTargetId: resolved.resolvedIds[0]
                        }
                    });
                    continue;
                }
            }
            enriched.push(option);
        }

        const blocking = deps.forceBlocking != null
            ? Boolean(deps.forceBlocking)
            : (isBlockingTiming(code) || playerOptions.length > 0);

        const created = await deps.createReactionWindow(client, {
            triggerType: code,
            blocking,
            sourceActorId: context.actorId,
            sourceTargetId: primaryTargetId(context),
            sourceSkillKey: context.skillKey,
            round: context.round,
            turnPass: context.turnPass,
            context: {
                timingCode: code,
                timingLabel: timingLabel(code),
                actorId: context.actorId,
                actorName: context.actorName,
                targetId: primaryTargetId(context),
                targetIds: context.targetIds || [],
                targetName: context.targetName,
                skillName: context.skillName,
                actionCode: context.actionCode,
                attack: context.attack,
                affectedIds: context.affectedIds || [],
                appliedEffects: context.appliedEffects || [],
                heals: context.results?.heals || [],
                targets: context.results?.targets || [],
                stackDepth: stack.length
            },
            options: enriched,
            resumePayload: blocking
                ? {
                    actorId: context.actorId,
                    skillKey: context.skillKey,
                    targetId: primaryTargetId(context),
                    targetIds: context.targetIds,
                    affectedIds: context.affectedIds,
                    flags: context.flags,
                    stack: serializeStack(stack),
                    frameId: frame.id,
                    stepIndex: frame.index
                }
                : null
        });

        const windows = Array.isArray(created)
            ? created.filter(Boolean)
            : (created ? [created] : []);

        if (windows.length) {
            openedWindows.push(...windows);
            events.push({
                type: 'reaction_window',
                timing: code,
                blocking,
                windows,
                window: windows[0]
            });
            const hasOpen = windows.some(item => item.status === 'open');
            const hasReady = windows.some(
                item => item.status === 'ready' && item.resumePayload
            );
            if (blocking && (hasOpen || hasReady)) {
                return {
                    pause: true,
                    timingCode: code,
                    events,
                    openedWindows
                };
            }
        }
    }

    return {
        pause: false,
        timingCode: code,
        events,
        openedWindows
    };
}

/**
 * After statuses are applied, emit a single ON_EFFECT_APPLIED timing.
 */
async function emitEffectApplied(client, stack, frame, {
    affectedIds,
    appliedEffects
}, deps = {}) {
    setAffected(frame.context, affectedIds, appliedEffects);
    frame.context.triggerCharacterId = frame.context.actorId;
    return emitTimingBus(client, stack, frame, TIMING.ON_EFFECT_APPLIED, deps);
}

/**
 * After heals, emit ON_HEAL once.
 */
async function emitHealTiming(client, stack, frame, heals, deps = {}) {
    frame.context.results.heals = heals || [];
    setAffected(
        frame.context,
        (heals || []).map(item => item.targetId),
        (heals || []).map(item => ({
            kind: 'heal',
            targetId: item.targetId,
            amount: item.heal
        }))
    );
    return emitTimingBus(client, stack, frame, TIMING.ON_HEAL, deps);
}

module.exports = {
    collectStatusMonitorOptions,
    emitTimingBus,
    emitEffectApplied,
    emitHealTiming
};
