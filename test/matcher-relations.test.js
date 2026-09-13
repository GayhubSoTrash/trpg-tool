'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { relationMatches } = require('../lib/combat/matcher');

const HERO = { id: 1, kind: 'player', name: '英雄' };
const ALLY = { id: 2, kind: 'player', name: '同伴' };
const FOE = { id: 3, kind: 'enemy', name: '敵人' };

/** context.meta.charactersById is the side lookup relations rely on. */
function contextWith(fields = {}) {
    return {
        meta: {
            charactersById: new Map([
                [HERO.id, HERO],
                [ALLY.id, ALLY],
                [FOE.id, FOE]
            ])
        },
        ...fields
    };
}

test('SELF_IS_TARGET matches every id in context.targetIds', () => {
    const ctx = contextWith({ targetIds: [ALLY.id, FOE.id] });

    assert.strictEqual(
        relationMatches('SELF_IS_TARGET', {
            reactor: ALLY,
            actor: HERO,
            target: FOE,
            context: ctx
        }),
        true,
        '友方在 targetIds 中應觸發自身被指定'
    );
    assert.strictEqual(
        relationMatches('SELF_IS_TARGET', {
            reactor: FOE,
            actor: HERO,
            target: ALLY,
            context: ctx
        }),
        true,
        '敵方在 targetIds 中應觸發自身被指定'
    );
    assert.strictEqual(
        relationMatches('SELF_IS_TARGET', {
            reactor: HERO,
            actor: HERO,
            target: FOE,
            context: ctx
        }),
        false,
        '未在 targetIds 中者不應觸發'
    );
});

test('SELF_DECLARED_ALLY fires only for the actor declaring an ally', () => {
    const match = (reactor, actor, target) => relationMatches('SELF_DECLARED_ALLY', {
        reactor,
        actor,
        target,
        context: contextWith()
    });

    assert.strictEqual(match(HERO, HERO, ALLY), true, '自身指定友方應觸發');
    assert.strictEqual(match(HERO, HERO, FOE), false, '指定敵方不應觸發');
    assert.strictEqual(match(ALLY, HERO, ALLY), false, '非行動者不應觸發');
    assert.strictEqual(match(HERO, HERO, null), false, '沒有目標不應觸發');
});

test('OTHER_TURN_ENDED fires for anyone except the character whose turn ended', () => {
    const match = reactor => relationMatches('OTHER_TURN_ENDED', {
        reactor,
        actor: null,
        context: contextWith({ actorId: ALLY.id })
    });

    assert.strictEqual(match(HERO), true);
    assert.strictEqual(match(FOE), true, '敵方也能在其他角色回合結束時發動');
    assert.strictEqual(match(ALLY), false, '自己的回合結束不算「其他角色」');
});

test('ALLY_TURN_ENDED requires the ended turn to belong to another ally', () => {
    const match = reactor => relationMatches('ALLY_TURN_ENDED', {
        reactor,
        actor: null,
        context: contextWith({ actorId: ALLY.id })
    });

    assert.strictEqual(match(HERO), true);
    assert.strictEqual(match(FOE), false, '敵方回合結束對玩家不算友方');
    assert.strictEqual(match(ALLY), false, '自身回合結束不算其他友方');
});

test('ALLY_TURN_ENDED does not match when side info is unavailable', () => {
    const matched = relationMatches('ALLY_TURN_ENDED', {
        reactor: HERO,
        actor: null,
        context: { actorId: ALLY.id, meta: {} }
    });

    assert.strictEqual(matched, false, '缺少陣營資訊時不得預設為符合');
});

test('SELF_WAS_HEALED fires only for heals received from someone else', () => {
    const match = (reactor, actorId) => relationMatches('SELF_WAS_HEALED', {
        reactor,
        actor: null,
        context: contextWith({
            actorId,
            results: { heals: [{ targetId: HERO.id, heal: 5 }] }
        })
    });

    assert.strictEqual(match(HERO, ALLY.id), true);
    assert.strictEqual(match(HERO, HERO.id), false, '自我治療不算受到他人恢復');
    assert.strictEqual(match(ALLY, HERO.id), false, '不是被治療的人');
});

test('SELF_WAS_HEALED ignores zero-value heals', () => {
    const matched = relationMatches('SELF_WAS_HEALED', {
        reactor: HERO,
        actor: null,
        context: contextWith({
            actorId: ALLY.id,
            results: { heals: [{ targetId: HERO.id, heal: 0 }] }
        })
    });

    assert.strictEqual(matched, false);
});

test('SELF_KO_ENEMY fires for the killer when the downed character is an enemy', () => {
    const match = (reactor, koSourceActorId, downedId) => relationMatches('SELF_KO_ENEMY', {
        reactor,
        actor: null,
        context: contextWith({
            koSourceActorId,
            results: { ko: [{ characterId: downedId }] }
        })
    });

    assert.strictEqual(match(HERO, HERO.id, FOE.id), true);
    assert.strictEqual(match(HERO, HERO.id, ALLY.id), false, '擊倒友方不觸發');
    assert.strictEqual(match(ALLY, HERO.id, FOE.id), false, '不是造成擊倒的人');
    assert.strictEqual(match(HERO, 0, FOE.id), false, '沒有擊倒來源不觸發');
});

test('an unimplemented relation returns false instead of throwing', () => {
    const matched = relationMatches('THIS_RELATION_DOES_NOT_EXIST', {
        reactor: HERO,
        actor: HERO,
        context: contextWith()
    });

    assert.strictEqual(matched, false);
});

test('攻擊指定 reactions require an attack declare, not heal/buff designate', () => {
    const {
        getReactionDef,
        collectReactionOptions,
        attackMatches
    } = require('../lib/combat/matcher');

    const guardSkill = {
        key: 'initial:基礎格擋',
        name: '基礎格擋',
        timing: '自身被攻擊指定時',
        cost: '1SP',
        reaction: {
            timingCode: 'ON_TARGET_DECLARED',
            match: { relation: 'SELF_IS_TARGET' },
            note: '對本次攻擊進行格擋'
        }
    };

    const def = getReactionDef(guardSkill);
    assert.strictEqual(def.match.attack.requiresAttack, true);

    assert.strictEqual(
        attackMatches(def.match.attack, null, { actionCode: 'HEAL' }),
        false,
        '治療指定不應通過'
    );
    assert.strictEqual(
        attackMatches(
            def.match.attack,
            { melee: true, physical: true },
            { actionCode: 'ATTACK' }
        ),
        true,
        '攻擊指定應通過'
    );

    const rows = [{ character: { ...FOE, sp: 5 }, skill: guardSkill }];
    const healOpts = collectReactionOptions({
        equippedRows: rows,
        timingCodes: ['ON_TARGET_DECLARED'],
        context: contextWith({
            actionCode: 'HEAL',
            actorId: HERO.id,
            targetId: FOE.id,
            targetIds: [FOE.id]
        }),
        actor: HERO,
        target: FOE
    });
    assert.strictEqual(healOpts.length, 0, '治療指定時基礎格擋不出現');

    const attackOpts = collectReactionOptions({
        equippedRows: rows,
        timingCodes: ['ON_TARGET_DECLARED'],
        context: contextWith({
            actionCode: 'ATTACK',
            actorId: HERO.id,
            targetId: FOE.id,
            targetIds: [FOE.id],
            attack: { melee: true, physical: true }
        }),
        actor: HERO,
        target: FOE
    });
    assert.strictEqual(attackOpts.length, 1, '攻擊指定時基礎格擋應出現');
});
