'use strict';

const test = require('node:test');
const assert = require('node:assert');

const catalog = require('../lib/combat/status-catalog');

test('barrier is not a manual status; damageTaken lives in parametric mods', () => {
    assert.strictEqual(catalog.STATUS_CATALOG.barrier, undefined);
    assert.ok(
        !catalog.listManualStatuses().some(item => item.key === 'barrier'),
        '手動清單不應再出現障壁'
    );
    assert.ok(catalog.STAT_KEYS
        ? true
        : require('../lib/combat/stat-mods').STAT_KEYS.includes('damageTaken'));
});

test('poison/burning texts describe action HP loss, not round-start damage', () => {
    assert.match(catalog.STATUS_CATALOG.poison.effect, /主動|主要/);
    assert.match(catalog.STATUS_CATALOG.poison.effect, /損失 HP/);
    assert.match(catalog.STATUS_CATALOG.burning.effect, /輔助/);
    assert.match(catalog.STATUS_CATALOG.burning.effect, /損失 HP/);
    assert.doesNotMatch(catalog.STATUS_CATALOG.poison.effect, /回合開始/);
    assert.doesNotMatch(catalog.STATUS_CATALOG.burning.effect, /回合開始/);
});

test('DoT and taunt/duel declare the manual input fields they need', () => {
    for (const key of ['poison', 'burning', 'bleeding']) {
        assert.strictEqual(catalog.STATUS_CATALOG[key].manualValue, true, key);
    }
    assert.strictEqual(catalog.STATUS_CATALOG.taunt.manualSource, true);
    assert.strictEqual(catalog.STATUS_CATALOG.duel.manualLink, true);
});

test('statusExpiresRound defaults to round end and supports permanent/custom', () => {
    assert.strictEqual(
        catalog.statusExpiresRound({ duration: { type: 'round_end' } }, 3),
        3
    );
    assert.strictEqual(
        catalog.statusExpiresRound({ duration: { type: 'permanent' } }, 3),
        null
    );
    assert.strictEqual(
        catalog.statusExpiresRound({ duration: { type: 'custom', rounds: 2 } }, 3),
        4
    );
    assert.strictEqual(
        catalog.statusExpiresRound(catalog.STATUS_CATALOG.poison, 5),
        5
    );
    assert.strictEqual(
        catalog.statusExpiresRound(catalog.STATUS_CATALOG.stun, 5),
        6
    );
});
