'use strict';

const test = require('node:test');
const assert = require('node:assert');

const statusTick = require('../lib/combat/status-tick');
const { collectStatusMonitorOptions } = require('../lib/combat/timing-bus');
const { TIMING } = require('../lib/combat/timings');

test('tick ratios are 0.75 for 再生 and 0.5 for the hp-loss statuses', () => {
    assert.strictEqual(statusTick.statusTick('regeneration').ratio, 0.75);
    for (const key of ['poison', 'burning', 'bleeding']) {
        assert.strictEqual(statusTick.statusTick(key).ratio, 0.5, key);
    }
});

test('regeneration heals while poison, burning and bleeding remove HP', () => {
    assert.strictEqual(statusTick.statusTick('regeneration').kind, 'heal');
    for (const key of ['poison', 'burning', 'bleeding']) {
        assert.strictEqual(statusTick.statusTick(key).kind, 'hp_loss', key);
    }
});

test('isTickStatus only recognises the DoT/HoT statuses', () => {
    assert.strictEqual(statusTick.isTickStatus('poison'), true);
    assert.strictEqual(statusTick.isTickStatus('stun'), false);
    assert.strictEqual(statusTick.isTickStatus('guard_ready'), false);
});

test('tickBaseAmount is a share of magic and never below 1', () => {
    assert.strictEqual(statusTick.tickBaseAmount(100, 'poison'), 50);
    assert.strictEqual(statusTick.tickBaseAmount(100, 'regeneration'), 75);
    assert.strictEqual(statusTick.tickBaseAmount(0, 'poison'), 1);
    assert.strictEqual(statusTick.tickBaseAmount(1, 'poison'), 1);
});

test('tickBaseAmount is 0 for a status that does not tick', () => {
    assert.strictEqual(statusTick.tickBaseAmount(100, 'stun'), 0);
});

test('the snapshot taken at apply time wins over the current magic', () => {
    const amount = statusTick.tickAmountFromEntry(
        { buff_key: 'poison', source_snapshot: { tickBase: 37 } },
        { sourceMagic: 100 }
    );
    assert.strictEqual(amount, 37, '既有 DoT 不應因來源後來變強而改變');
});

test('value_num takes precedence over the snapshot', () => {
    const amount = statusTick.tickAmountFromEntry(
        { buff_key: 'poison', value_num: 12, source_snapshot: { tickBase: 37 } },
        { sourceMagic: 100 }
    );
    assert.strictEqual(amount, 12);
});

test('without a snapshot the amount falls back to current magic', () => {
    assert.strictEqual(
        statusTick.tickAmountFromEntry({ buff_key: 'burning' }, { sourceMagic: 100 }),
        50
    );
    assert.strictEqual(
        statusTick.tickAmountFromEntry({ buff_key: 'burning' }, { sourceMagic: 0 }),
        1
    );
});

test('only the timing-driven ticks expose an effectId', () => {
    assert.deepStrictEqual(
        [...statusTick.TIMING_TICK_KEYS].sort(),
        ['burning', 'poison', 'regeneration']
    );
    // 流血 resolves per landed hit inside the attack loop instead.
    assert.strictEqual(statusTick.statusTick('bleeding').effectId, undefined);
});

test('statusTickByEffectId maps back to the definition', () => {
    assert.strictEqual(
        statusTick.statusTickByEffectId('STATUS_POISON').key,
        'poison'
    );
    assert.strictEqual(statusTick.statusTickByEffectId('STATUS_NOPE'), null);
});

function buffMap(actorId, keys) {
    return new Map([[actorId, keys.map(key => ({ buff_key: key }))]]);
}

test('poison ticks on a main action, not on an auxiliary skill', () => {
    const entries = buffMap(7, ['poison']);

    const onMainAction = collectStatusMonitorOptions(
        { phase: TIMING.DURING_MAIN_ACTION, actorId: 7, isMainAction: true },
        entries
    );
    assert.strictEqual(onMainAction.length, 1);
    assert.strictEqual(onMainAction[0].effectId, 'STATUS_POISON');
    assert.strictEqual(onMainAction[0].auto, true);

    const onAuxiliary = collectStatusMonitorOptions(
        { phase: TIMING.DURING_SKILL, actorId: 7, isAuxiliary: true },
        entries
    );
    assert.deepStrictEqual(onAuxiliary, []);
});

test('burning ticks on an auxiliary skill and regeneration on an active one', () => {
    const entries = buffMap(7, ['burning', 'regeneration']);

    const auxiliary = collectStatusMonitorOptions(
        { phase: TIMING.DURING_SKILL, actorId: 7, isAuxiliary: true },
        entries
    );
    assert.deepStrictEqual(auxiliary.map(o => o.effectId), ['STATUS_BURNING']);

    const active = collectStatusMonitorOptions(
        { phase: TIMING.DURING_SKILL, actorId: 7, isActiveSkill: true },
        entries
    );
    assert.deepStrictEqual(active.map(o => o.effectId), ['STATUS_REGENERATION']);
});

test('no options without an actor or without matching statuses', () => {
    assert.deepStrictEqual(
        collectStatusMonitorOptions(
            { phase: TIMING.DURING_MAIN_ACTION, isMainAction: true },
            buffMap(7, ['poison'])
        ),
        []
    );
    assert.deepStrictEqual(
        collectStatusMonitorOptions(
            { phase: TIMING.DURING_MAIN_ACTION, actorId: 7, isMainAction: true },
            buffMap(7, ['stun'])
        ),
        []
    );
});

test('the option carries the buff row so the host can read its snapshot', () => {
    const entry = { buff_key: 'poison', source_snapshot: { tickBase: 9 } };
    const [option] = collectStatusMonitorOptions(
        { phase: TIMING.DURING_MAIN_ACTION, actorId: 7, isMainAction: true },
        new Map([[7, [entry]]])
    );

    assert.strictEqual(option.meta.buffEntry, entry);
    assert.strictEqual(option.skillName, '中毒');
    assert.strictEqual(option.id, 'status:poison:7');
});
