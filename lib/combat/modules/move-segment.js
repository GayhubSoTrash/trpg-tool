'use strict';

const { appendResultMessage, primaryTargetId } = require('../context');

function targetLooksAlly(context) {
    const targetKind = context.meta?.targetKind || context.targetKind || null;
    const actorKind = context.actorKind || context.meta?.actorKind || null;
    if (targetKind && actorKind) return targetKind === actorKind;
    if (typeof context.flags?.targetIsAlly === 'boolean') return context.flags.targetIsAlly;
    return false;
}

function anyTargetHit(context) {
    const targets = context.results?.targets || [];
    return targets.some(
        item => item && (item.anyHit || item.hit || item.segments?.some(s => s.hit))
    );
}

async function run(client, ctx) {
    const { frame, params = {}, host, skill } = ctx;
    const context = frame.context;

    if (params.when === 'ally_or_hit') {
        const isAlly = targetLooksAlly(context);
        if (!isAlly && !anyTargetHit(context)) {
            return { ok: true, skipped: true, reason: 'ally_or_hit' };
        }
    } else if (params.alliesOnly && !targetLooksAlly(context)) {
        return { ok: true, skipped: true, reason: 'allies_only' };
    } else if (params.requireHit && !anyTargetHit(context)) {
        return { ok: true, skipped: true, reason: 'require_hit' };
    }

    if (typeof host.resolveMove !== 'function') {
        throw new Error('host.resolveMove is required for move_segment');
    }
    const result = await host.resolveMove(client, {
        frame,
        effect: {
            kind: 'swap_or_move',
            on: params.on || 'actor',
            moveCharacterId: params.on === 'target'
                ? Number(primaryTargetId(context) || context.targetId || 0)
                : null,
            ...(params || {})
        },
        skill,
        context
    });
    if (result?.content) {
        appendResultMessage(context, result.content);
    }
    return result || { ok: true };
}

module.exports = { run };
