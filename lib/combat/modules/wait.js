'use strict';

const { appendResultMessage } = require('../context');

async function run(_client, ctx) {
    const { frame, skill } = ctx;
    const context = frame.context;
    appendResultMessage(
        context,
        `${context.actorName} 選擇等待，結束本次主要行動。`
    );
    context.flags = context.flags || {};
    context.flags.waited = true;
    return { ok: true, skillKey: skill?.key };
}

module.exports = { run };
