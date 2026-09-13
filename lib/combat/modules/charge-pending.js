'use strict';

const { appendResultMessage } = require('../context');

async function run(client, ctx) {
    const { frame, params = {}, host, skill } = ctx;
    if (typeof host.resolveRescue !== 'function') {
        throw new Error('host.resolveRescue is required for charge_pending');
    }
    const result = await host.resolveRescue(client, {
        frame,
        effect: { kind: 'charge_pending', ...(params || {}) },
        skill,
        context: frame.context
    });
    if (result?.content) {
        appendResultMessage(frame.context, result.content);
    }
    return result || { ok: true };
}

module.exports = { run };
