'use strict';

function createActionContext(partial = {}) {
    return {
        actionKind: partial.actionKind || 'skill',
        phase: partial.phase || null,
        triggerCharacterId: partial.triggerCharacterId != null
            ? Number(partial.triggerCharacterId)
            : null,
        actorId: partial.actorId != null ? Number(partial.actorId) : null,
        actorName: partial.actorName || '',
        actorKind: partial.actorKind || 'player',
        targetIds: Array.isArray(partial.targetIds)
            ? partial.targetIds.map(Number)
            : (partial.targetId != null ? [Number(partial.targetId)] : []),
        targetId: partial.targetId != null ? Number(partial.targetId) : null,
        targetName: partial.targetName || '',
        skillKey: partial.skillKey || null,
        skillName: partial.skillName || '',
        actionCode: partial.actionCode || null,
        logicCode: partial.logicCode || null,
        direction: partial.direction || null,
        attack: partial.attack || null,
        cost: partial.cost || null,
        isMainAction: partial.isMainAction === true,
        isActiveSkill: partial.isActiveSkill === true,
        isAuxiliary: partial.isAuxiliary === true,
        affectedIds: Array.isArray(partial.affectedIds)
            ? partial.affectedIds.map(Number)
            : [],
        appliedEffects: Array.isArray(partial.appliedEffects)
            ? partial.appliedEffects.map(item => ({ ...item }))
            : [],
        pickRequest: partial.pickRequest || null,
        flags: { ...(partial.flags || {}) },
        results: {
            targets: [],
            heals: [],
            damages: [],
            effects: [],
            moves: [],
            segments: [],
            messages: [],
            ...(partial.results || {})
        },
        round: Number(partial.round || 1),
        turnPass: Number(partial.turnPass || 1),
        meta: { ...(partial.meta || {}) }
    };
}

function mergeFlags(context, nextFlags = {}) {
    context.flags = {
        ...(context.flags || {}),
        ...nextFlags
    };
    return context.flags;
}

function primaryTargetId(context) {
    if (context.targetId != null) return Number(context.targetId);
    if (context.targetIds?.length) return Number(context.targetIds[0]);
    if (context.affectedIds?.length) return Number(context.affectedIds[0]);
    return null;
}

function setAffected(context, ids, appliedEffects = null) {
    context.affectedIds = [...new Set((ids || []).map(Number).filter(Boolean))];
    if (appliedEffects) {
        context.appliedEffects = appliedEffects.map(item => ({ ...item }));
    }
    return context;
}

/**
 * Merge freshly applied statuses onto context for ON_EFFECT_APPLIED.
 * @returns {boolean} true when at least one effect was recorded
 */
function recordAppliedEffects(context, applied) {
    const list = (Array.isArray(applied) ? applied : [])
        .map(item => {
            if (!item) return null;
            const characterId = Number(
                item.characterId || item.character_id || 0
            );
            const key = item.key || item.buff_key || item.buffKey || null;
            if (!characterId || !key) return null;
            return {
                characterId,
                key,
                kind: item.kind || null,
                subtype: item.subtype || null,
                value: item.value
            };
        })
        .filter(Boolean);

    if (!list.length) return false;

    context.appliedEffects = [...(context.appliedEffects || []), ...list];
    context.affectedIds = [...new Set([
        ...(context.affectedIds || []).map(Number),
        ...list.map(item => item.characterId)
    ].filter(Boolean))];
    return true;
}

function appendResultMessage(context, text) {
    if (!text) return;
    context.results = context.results || {};
    context.results.messages = context.results.messages || [];
    context.results.messages.push(String(text));
}

function serializeResume(context, extra = {}) {
    return {
        actionKind: context.actionKind,
        actorId: context.actorId,
        skillKey: context.skillKey,
        targetId: primaryTargetId(context),
        targetIds: context.targetIds || [],
        affectedIds: context.affectedIds || [],
        direction: context.direction || null,
        flags: context.flags || {},
        isMainAction: context.isMainAction === true,
        isActiveSkill: context.isActiveSkill === true,
        pickRequest: context.pickRequest || null,
        flowIndex: context.meta?.flowIndex ?? 0,
        ...extra
    };
}

function contextFromResume(resume = {}, extras = {}) {
    return createActionContext({
        ...extras,
        actionKind: resume.actionKind || extras.actionKind || 'skill',
        actorId: resume.actorId,
        skillKey: resume.skillKey,
        targetId: resume.targetId,
        targetIds: resume.targetIds,
        affectedIds: resume.affectedIds,
        direction: resume.direction,
        flags: resume.flags || {},
        isMainAction: resume.isMainAction === true,
        isActiveSkill: resume.isActiveSkill === true,
        pickRequest: resume.pickRequest || null,
        meta: {
            ...(extras.meta || {}),
            flowIndex: resume.flowIndex ?? 0
        }
    });
}

module.exports = {
    createActionContext,
    mergeFlags,
    primaryTargetId,
    setAffected,
    recordAppliedEffects,
    appendResultMessage,
    serializeResume,
    contextFromResume
};
