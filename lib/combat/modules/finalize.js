'use strict';

/**
 * finalize — bookkeeping only; shell timings carry AFTER_* emits.
 */
async function run(_client, ctx) {
    const context = ctx.frame.context;
    context.flags = context.flags || {};
    context.flags.pipelineFinalized = true;
    return { ok: true };
}

module.exports = { run };
