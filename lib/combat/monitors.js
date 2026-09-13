'use strict';

const { TIMING } = require('./timings');
const { pushMonitorFrame } = require('./engine');

/**
 * After HP changes, push ON_KO monitor frames for newly downed characters.
 * @param {object} client
 * @param {object[]} stack
 * @param {object} info
 * @param {{ characterId: number, oldHp: number, newHp: number, name?: string }[]} info.hpChanges
 * @param {object} [info.baseContext]
 */
async function runMonitors(client, stack, info = {}) {
    const events = [];
    const changes = Array.isArray(info.hpChanges) ? info.hpChanges : [];

    for (const change of changes) {
        const oldHp = Number(change.oldHp);
        const newHp = Number(change.newHp);
        if (!(oldHp > 0 && newHp <= 0)) continue;

        pushMonitorFrame(stack, TIMING.ON_KO, {
            ...(info.baseContext || {}),
            // actorId below is overwritten with the downed character, so keep
            // whoever caused the KO — 連斬 (SELF_KO_ENEMY) needs the killer.
            koSourceActorId: Number(info.baseContext?.actorId || 0),
            triggerCharacterId: change.characterId,
            actorId: change.characterId,
            actorName: change.name || '',
            targetId: change.characterId,
            targetName: change.name || '',
            results: {
                ...(info.baseContext?.results || {}),
                ko: [{
                    characterId: change.characterId,
                    name: change.name || ''
                }]
            }
        });

        events.push({
            type: 'monitor',
            timing: TIMING.ON_KO,
            characterId: change.characterId
        });
    }

    return events;
}

function collectHpChange(list, characterId, oldHp, newHp, name = '') {
    if (!Array.isArray(list)) return;
    list.push({
        characterId: Number(characterId),
        oldHp: Number(oldHp),
        newHp: Number(newHp),
        name
    });
}

module.exports = {
    runMonitors,
    collectHpChange
};
