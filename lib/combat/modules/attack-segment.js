'use strict';

const { runOps } = require('./ops');
const { appendResultMessage } = require('../context');

/**
 * attack_segment — phase-1 wraps host.resolveAttackHits, then optional onHit ops.
 */
function targetLooksAlly(context) {
    const targetKind = context.meta?.targetKind || context.targetKind || null;
    const actorKind = context.actorKind || context.meta?.actorKind || null;
    if (targetKind && actorKind) return targetKind === actorKind;
    if (typeof context.flags?.targetIsAlly === 'boolean') return context.flags.targetIsAlly;
    return false;
}

async function run(client, ctx) {
    const { frame, step, params = {}, host, skill } = ctx;
    const context = frame.context;

    context.meta = context.meta || {};
    if (Array.isArray(params.packets) && params.packets.length) {
        context.meta.pipelinePackets = params.packets;
    }

    if (params.enemiesOnly && targetLooksAlly(context)) {
        context.flags = context.flags || {};
        context.flags.attackSkippedAlly = true;
        return { ok: true, skipped: true, reason: 'enemies_only' };
    }

    if (typeof host.resolveAttackHits !== 'function') {
        throw new Error('host.resolveAttackHits is required for attack_segment');
    }

    const attackResult = await host.resolveAttackHits(client, {
        frame,
        step,
        effect: {
            kind: 'attack_hits',
            packets: params.packets || [],
            attack: params.attack || context.attack || null
        },
        skill,
        context
    });

    context.flags = context.flags || {};
    context.flags.attackResolved = true;

    if (attackResult?.content) {
        appendResultMessage(context, attackResult.content);
    }

    const beforeCount = (context.appliedEffects || []).length;
    const onHit = params.onHit || [];
    if (onHit.length) {
        const targets = context.results?.targets || [];
        const anyHit = targets.some(
            item => item && (item.anyHit || item.hit || item.segments?.some(s => s.hit))
        );
        if (anyHit) {
            await runOps(client, onHit, {
                frame,
                host,
                skill,
                context
            });
        }
    }

    const stamped = (context.appliedEffects || []).length > beforeCount;
    return {
        ok: true,
        attackResult,
        emitEffectApplied: stamped,
        affectedIds: stamped ? context.affectedIds : undefined,
        appliedEffects: stamped ? context.appliedEffects : undefined
    };
}

module.exports = { run };
