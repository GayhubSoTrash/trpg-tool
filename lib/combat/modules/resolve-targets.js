'use strict';

/**
 * resolve_targets — expand designated targets + attack tags for declare timing.
 * Multi-target skills (row / all / orthogonal line) stamp every resolved id into
 * context.targetIds so ON_TARGET_DECLARED treats each as「被指定」.
 */
async function run(client, ctx) {
    const { frame, params = {}, host, skill } = ctx;
    const context = frame.context;
    const tags = params.tags && typeof params.tags === 'object'
        ? { ...params.tags }
        : {};

    context.meta = context.meta || {};
    context.meta.targetCode = params.targetCode || context.meta.targetCode || null;
    context.meta.pipelineTags = tags;

    if (tags.attack) {
        context.attack = {
            ...(context.attack || {}),
            melee: Boolean(tags.melee),
            ranged: Boolean(tags.ranged),
            physical: Boolean(tags.physical),
            magic: Boolean(tags.magic)
        };
    }

    // Seed from startSkill / resume
    if (!Array.isArray(context.targetIds) || !context.targetIds.length) {
        const tid = Number(context.targetId || 0);
        context.targetIds = tid ? [tid] : [];
    }

    // Expand to every designated character (row / all / orthogonal / recipients).
    if (typeof host?.resolveDesignatedTargets === 'function') {
        const expanded = await host.resolveDesignatedTargets(client, {
            skill,
            context,
            frame,
            actor: context.meta?.actorRow || null,
            target: context.meta?.targetRow || null,
            direction: context.direction || null
        });
        if (Array.isArray(expanded) && expanded.length) {
            context.targetIds = [...new Set(expanded.map(Number).filter(Boolean))];
        }
    }

    if (context.targetIds.length) {
        context.targetId = Number(context.targetIds[0]);
    }

    context.flags = context.flags || {};
    context.flags.targetsResolved = true;

    return { ok: true, targetIds: context.targetIds };
}

module.exports = { run };
