'use strict';

const {
    TIMING,
    normalizeTimingCode,
    timingLabel,
    isBlockingTiming,
    MOVE_TOKEN_FLOW
} = require('./timings');
const { createActionContext, serializeResume, primaryTargetId } = require('./context');
const { attackDescriptor } = require('./effects');
const { collectReactionOptions } = require('./matcher');

/**
 * Emit a timing point: collect matching reactions and optionally open a window.
 */
async function emitTiming(client, context, timingCode, {
    loadEquippedRows,
    createReactionWindow,
    actor = null,
    target = null,
    skill = null,
    forceBlocking = null,
    extraTimingCodes = [],
    resumeExtra = {}
} = {}) {
    const code = normalizeTimingCode(timingCode) || timingCode;
    context.phase = code;
    context.triggerCharacterId =
        context.triggerCharacterId ??
        Number(actor?.id || context.actorId || 0);

    if (skill) {
        context.skillKey = skill.key || context.skillKey;
        context.skillName = skill.name || context.skillName;
        context.actionCode = skill.actionCode || context.actionCode;
        context.logicCode = skill.logicCode || context.logicCode;
        context.attack = context.attack ||
            (skill.actionCode === 'ATTACK' ? attackDescriptor(skill) : null);
        context.meta = { ...(context.meta || {}), skill };
    }

    const equippedRows = await loadEquippedRows(client);
    const timingCodes = [code, ...extraTimingCodes];
    const options = collectReactionOptions({
        equippedRows,
        timingCodes,
        context,
        actor,
        target
    });

    if (!options.length) {
        return {
            pending: false,
            skipped: true,
            timingCode: code,
            options: [],
            window: null
        };
    }

    const blocking = forceBlocking != null
        ? forceBlocking
        : isBlockingTiming(code);

    const created = await createReactionWindow(client, {
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
            actorName: context.actorName || actor?.name,
            targetId: primaryTargetId(context),
            targetName: context.targetName || target?.name,
            skillName: context.skillName || skill?.name,
            actionCode: context.actionCode,
            attack: context.attack,
            cost: context.cost,
            targets: context.results?.targets || [],
            heals: context.results?.heals || []
        },
        options,
        resumePayload: blocking
            ? serializeResume(context, resumeExtra)
            : null
    });

    const windows = Array.isArray(created)
        ? created.filter(Boolean)
        : (created ? [created] : []);

    return {
        pending: windows.some(item => item.status === 'open' || item.status === 'ready'),
        skipped: false,
        timingCode: code,
        options,
        window: windows[0] || null,
        windows
    };
}

/**
 * Fire global timing hooks (may open non-blocking windows later).
 */
async function emitGlobalTimings(client, timingCodes, baseContext, deps) {
    const windows = [];
    for (const code of timingCodes) {
        const ctx = createActionContext({
            ...baseContext,
            actionKind: baseContext.actionKind || 'turn',
            phase: code
        });
        const result = await emitTiming(client, ctx, code, {
            ...deps,
            forceBlocking: false
        });
        if (Array.isArray(result.windows) && result.windows.length) {
            windows.push(...result.windows);
        } else if (result.window) {
            windows.push(result.window);
        }
    }
    return windows;
}

async function emitTurnChange(client, {
    endingCharacterId = null,
    startingCharacterId = null,
    round,
    turnPass
}, deps) {
    const windows = [];

    if (endingCharacterId) {
        const endWindows = await emitGlobalTimings(client, [TIMING.TURN_END], {
            actionKind: 'turn',
            triggerCharacterId: endingCharacterId,
            actorId: endingCharacterId,
            round,
            turnPass
        }, deps);
        windows.push(...endWindows);
    }

    if (startingCharacterId) {
        const startWindows = await emitGlobalTimings(client, [TIMING.TURN_START], {
            actionKind: 'turn',
            triggerCharacterId: startingCharacterId,
            actorId: startingCharacterId,
            round,
            turnPass
        }, deps);
        windows.push(...startWindows);
    }

    return windows;
}

async function emitMove(client, context, deps) {
    return emitGlobalTimings(client, MOVE_TOKEN_FLOW, {
        ...context,
        actionKind: 'move'
    }, deps);
}

module.exports = {
    emitTiming,
    emitGlobalTimings,
    emitTurnChange,
    emitMove
};
