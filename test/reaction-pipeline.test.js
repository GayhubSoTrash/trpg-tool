'use strict';

const test = require('node:test');
const assert = require('node:assert');

const combat = require('../lib/combat');
const { allSkills, stubClient } = require('./helpers/skills');

const all = allSkills();

const NOOP_DEPS = {
    getCharacterBuffEntries: async () => [],
    removeBuffKeys: async () => {},
    applyBuffToCharacters: async () => {},
    applyDebuffBundle: async () => {}
};

test('legacy flow/effects fields are fully migrated away', () => {
    for (const skill of all) {
        assert.ok(!skill.flow, `${skill.key} 仍帶有舊的 flow 欄位`);
        assert.ok(!skill.effects, `${skill.key} 仍帶有舊的 effects 欄位`);
    }

    assert.strictEqual(typeof combat.executeReactionEffect, 'undefined');
    assert.strictEqual(typeof combat.compileSkillFlow, 'undefined');
    assert.strictEqual(typeof combat.inferEffects, 'undefined');
    assert.strictEqual(typeof combat.getSkillFlow, 'undefined');
    assert.ok(!JSON.stringify(all.map(skill => skill.pipeline)).includes('reaction_effect'));
});

test('every reaction skill resolves to a pipeline that does real work', () => {
    const reactionSkills = all.filter(skill => skill.reaction || skill.contextReaction);
    assert.ok(reactionSkills.length > 0);

    for (const skill of reactionSkills) {
        const ensured = combat.ensureReactionPipeline(skill);
        assert.ok(
            combat.skillPipelineHasWork(ensured),
            `${skill.key} 的反應 pipeline 沒有實際效果`
        );
    }
});

test('撥擋 negates one segment and grants AP', async () => {
    const parry = all.find(skill => skill.key === '闢路者:撥擋');
    assert.ok(parry, '找不到 闢路者:撥擋');
    assert.ok(combat.skillPipelineHasWork(parry));
    assert.deepStrictEqual(
        parry.pipeline.map(step => step.module),
        ['activate_skill', 'finalize']
    );

    const { steps } = combat.compilePipeline(parry);
    assert.ok(!steps.some(step => step.timing === combat.TIMING.BEFORE_MAIN_ACTION));
    assert.ok(steps.some(step => step.timing === combat.TIMING.BEFORE_SKILL));

    const applied = await combat.applyReactionEffect({
        effectId: parry.key,
        client: stubClient(),
        reactor: { id: 42, name: '測試者', kind: 'player' },
        skill: parry,
        option: { id: 'opt', targetId: 42 },
        window: {
            triggerType: 'ON_TARGET_DECLARED',
            blocking: true,
            context: { targetId: 42, targetName: '測試者' },
            sourceActorId: 7,
            resumePayload: { targetId: 42 }
        },
        clock: { round: 1, turnPass: 1 },
        resume: { targetId: 42 },
        flags: {},
        nextOptions: [],
        deps: NOOP_DEPS
    });

    assert.strictEqual(applied.flags.negateOneSegmentTargetId, 42);
    assert.match(applied.reactionText, /撥擋/);
    assert.match(applied.reactionText, /無效/);
    assert.match(applied.reactionText, /AP\+1/);
});

test('追擊 uses the context target and delegates to the host attack resolver', async () => {
    const follow = all.find(skill => skill.key === '闢路者:追擊');
    assert.ok(follow, '找不到 闢路者:追擊');

    // No「指定」in the effect text → no resolve_targets step.
    assert.deepStrictEqual(
        follow.pipeline.map(step => step.module),
        ['activate_skill', 'attack_segment', 'finalize']
    );

    const applied = await combat.applyReactionEffect({
        effectId: follow.key,
        client: stubClient(),
        reactor: { id: 1, name: '追擊者', kind: 'player', patk: 100, hit_rate: 80 },
        skill: follow,
        option: { id: 'opt', targetId: 99, targetName: '敵人' },
        window: {
            triggerType: 'AFTER_ATTACK',
            context: { targetId: 99 },
            sourceActorId: 2
        },
        clock: { round: 1, turnPass: 1 },
        resume: {},
        flags: {},
        nextOptions: [],
        deps: {
            ...NOOP_DEPS,
            resolveFollowUpAttack: async ({ targetId, multiplier, skill }) => ({
                reactionText: `追擊測試 → #${targetId} x${multiplier} (${skill.name})`,
                charactersChanged: true,
                hit: true,
                loss: 10
            })
        }
    });

    assert.match(applied.reactionText, /追擊/);
    assert.ok(applied.charactersChanged);
});

test('隨風而行 applies speed buff to the declared ally, not the reactor', async () => {
    const wind = all.find(skill => skill.key === '織光者:隨風而行');
    assert.ok(wind, '找不到 織光者:隨風而行');

    const appliedGrants = [];
    const applied = await combat.applyReactionEffect({
        effectId: wind.key,
        client: stubClient(),
        reactor: { id: 1, name: '織光者', kind: 'player', sp: 5 },
        skill: wind,
        option: { id: 'opt', targetId: 2, targetName: '友方' },
        window: {
            triggerType: 'ON_TARGET_DECLARED',
            context: { targetId: 2, targetName: '友方', actorId: 1 },
            sourceActorId: 1
        },
        clock: { round: 3, turnPass: 1 },
        resume: { targetId: 2 },
        flags: {},
        nextOptions: [],
        deps: {
            ...NOOP_DEPS,
            applyBuffToCharacters: async (_c, ids, grant, opts) => {
                appliedGrants.push({ ids: [...ids], grant, opts });
            }
        }
    });

    assert.ok(applied.charactersChanged, '應標記角色狀態已變');
    assert.strictEqual(appliedGrants.length, 1, '應套用一次 statusGrants');
    assert.deepStrictEqual(appliedGrants[0].ids, [2], '增益目標應為被指定友方');
    assert.strictEqual(appliedGrants[0].grant.type, 'mod');
    assert.strictEqual(appliedGrants[0].grant.stat, 'speed');
    assert.strictEqual(appliedGrants[0].grant.value, 10);
    assert.strictEqual(appliedGrants[0].opts.expiresRound, 3);
});
