'use strict';

/**
 * heal_segment — shared heal step for active and reaction pipelines.
 */
async function run(client, ctx) {
    const { frame, params = {}, host, skill } = ctx;
    const context = frame.context;

    if (params.requireDispelled && !context.flags?.dispelled) {
        return { ok: true, skipped: true, reason: 'dispel_required' };
    }

    if (typeof host.resolveHeal === 'function') {
        return host.resolveHeal(client, {
            frame,
            effect: { kind: 'heal', ...(params || {}) },
            skill,
            context
        });
    }
    return { ok: true, stub: true };
}

module.exports = { run };
