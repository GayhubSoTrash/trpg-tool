'use strict';

const { runOps } = require('./ops');
const { appendResultMessage } = require('../context');

/**
 * activate_skill — spend cost + on-use effects at DURING_SKILL.
 */
async function run(client, ctx) {
    const { frame, params = {}, host, skill } = ctx;
    const context = frame.context;

    if (params.spendCost !== false) {
        if (typeof host.spendSkillCost === 'function' && !context.flags?.costSpent) {
            await host.spendSkillCost(client, context, skill);
            context.flags = context.flags || {};
            context.flags.costSpent = true;
        }
    }

    const beforeCount = (context.appliedEffects || []).length;
    const opResults = await runOps(client, params.onUse || [], {
        frame,
        host,
        skill,
        context
    });

    for (const result of opResults) {
        if (result?.content) {
            appendResultMessage(context, result.content);
        }
    }

    context.flags = context.flags || {};
    context.flags.skillActivated = true;

    const stamped = (context.appliedEffects || []).length > beforeCount;
    return {
        ok: true,
        opResults,
        emitEffectApplied: stamped,
        affectedIds: stamped ? context.affectedIds : undefined,
        appliedEffects: stamped ? context.appliedEffects : undefined
    };
}

module.exports = { run };
