'use strict';

const test = require('node:test');
const assert = require('node:assert');

const combat = require('../lib/combat');
const { allSkills } = require('./helpers/skills');

const all = allSkills();

test('every skill carries a compilable pipeline and a skillKind', () => {
    assert.ok(all.length > 0);

    for (const skill of all) {
        assert.ok(
            Array.isArray(skill.pipeline) && skill.pipeline.length,
            `${skill.key} 缺少 pipeline`
        );
        assert.ok(skill.skillKind, `${skill.key} 缺少 skillKind`);

        const { steps } = combat.compilePipeline(skill);
        assert.ok(steps.length > 0, `${skill.key} 編譯後沒有任何步驟`);
    }
});

test('auxiliary skills get the skill shell but never the main-action shell', () => {
    for (const skill of all.filter(item => item.skillKind === 'auxiliary')) {
        const { steps } = combat.compilePipeline(skill);
        assert.ok(
            !steps.some(step => step.timing === combat.TIMING.BEFORE_MAIN_ACTION),
            `${skill.key} 不應有 BEFORE_MAIN_ACTION`
        );
        assert.ok(
            steps.some(step => step.timing === combat.TIMING.BEFORE_SKILL),
            `${skill.key} 缺少 BEFORE_SKILL`
        );
    }
});

test('active skills get the main-action shell (WAIT excepted)', () => {
    const actives = all.filter(
        item => item.skillKind === 'active' && item.logicCode !== 'WAIT'
    );
    assert.ok(actives.length > 0);

    for (const skill of actives) {
        const { steps } = combat.compilePipeline(skill);
        assert.ok(
            steps.some(step => step.timing === combat.TIMING.BEFORE_MAIN_ACTION),
            `${skill.key} 缺少 BEFORE_MAIN_ACTION`
        );
    }
});

test('戰吼 is an auxiliary reaction: activate + finalize only', () => {
    const roar = all.find(skill => skill.key === '闢路者:戰吼');
    assert.ok(roar, '找不到 闢路者:戰吼');
    assert.strictEqual(roar.skillKind, 'auxiliary');
    assert.deepStrictEqual(
        roar.pipeline.map(step => step.module),
        ['activate_skill', 'finalize']
    );
    assert.ok(!combat.compilePipeline(roar).steps.some(
        step => step.timing === combat.TIMING.BEFORE_MAIN_ACTION
    ));
});

test('進攻指令 keeps a buff or activate step', () => {
    const command = all.find(skill => skill.key === '織光者:進攻指令');
    assert.ok(command, '找不到 織光者:進攻指令');
    assert.ok(command.pipeline.some(
        step => step.module === 'buff_segment' || step.module === 'activate_skill'
    ));
});

test('螺旋劍 keeps its hand-authored two-step onUse (target then actor)', () => {
    const spiral = all.find(skill => skill.key === '闢路者:螺旋劍');
    assert.ok(spiral, '找不到 闢路者:螺旋劍');

    const onUse = spiral.pipeline
        .find(step => step.module === 'activate_skill')
        .params.onUse;

    assert.strictEqual(onUse.length, 2);
    assert.strictEqual(onUse[0].on, 'target');
    assert.strictEqual(onUse[1].on, 'actor');
});
