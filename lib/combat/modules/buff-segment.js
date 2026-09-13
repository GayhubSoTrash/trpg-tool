'use strict';

const { appendResultMessage, recordAppliedEffects } = require('../context');

/**
 * buff_segment — applies buff/debuff via host skill body
 * (preserves row / all-allies recipient rules).
 */
async function run(client, ctx) {
    const { frame, params = {}, host, skill } = ctx;
    if (typeof host.resolveApplyStatus !== 'function') {
        throw new Error('host.resolveApplyStatus is required for buff_segment');
    }

    const result = await host.resolveApplyStatus(client, {
        frame,
        effect: {
            kind: 'apply_status',
            // empty grants → host falls back to full BUFF/DEBUFF skill body
            statusKeys: params.statusKeys || null,
            mods: params.mods || null,
            useSkillBody: true
        },
        skill,
        context: frame.context,
        onlyOnHit: false
    });

    if (result?.content) {
        appendResultMessage(frame.context, result.content);
    }

    const stamped = recordAppliedEffects(frame.context, result?.applied);
    return {
        ok: true,
        ...(result || {}),
        emitEffectApplied: stamped,
        affectedIds: stamped ? frame.context.affectedIds : undefined,
        appliedEffects: stamped ? frame.context.appliedEffects : undefined
    };
}

module.exports = { run };
