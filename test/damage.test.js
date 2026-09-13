'use strict';

const test = require('node:test');
const assert = require('node:assert');

const damage = require('../lib/combat/damage');

/** buffModifiers() output with everything neutral. */
function neutralMods(overrides = {}) {
    return {
        patkMult: 1,
        matkMult: 1,
        defenseMult: 1,
        resistMult: 1,
        damageMult: 1,
        damageTakenMult: 1,
        dodgeMult: 1,
        patkFlat: 0,
        matkFlat: 0,
        hitFlat: 0,
        dodgeFlat: 0,
        critFlat: 0,
        blockFlat: 0,
        autoGuard: false,
        guardReady: false,
        blockDisabled: false,
        unblockable: false,
        empowerMagic: 0,
        ...overrides
    };
}

function attacker(overrides = {}) {
    return {
        id: 1,
        patk: 100,
        matk: 80,
        hit_rate: 90,
        crit: 10,
        crit_damage_bonus: 0,
        ...overrides
    };
}

function defender(overrides = {}) {
    return {
        id: 2,
        defense: 20,
        resist: 10,
        dodge: 10,
        block_rate: 40,
        ...overrides
    };
}

function profileFor(attackerOverrides = {}, defenderOverrides = {}, rest = {}) {
    return damage.createAttackProfile({
        attacker: attacker(attackerOverrides),
        defender: defender(defenderOverrides),
        attackerMods: neutralMods(rest.attackerMods),
        defenderMods: neutralMods(rest.defenderMods),
        defenderStatusKeys: rest.defenderStatusKeys || [],
        flags: rest.flags || {},
        hitModifier: rest.hitModifier || 0,
        defenseIgnoreRate: rest.defenseIgnoreRate || 0,
        cannotEvade: rest.cannotEvade || false,
        unblockable: rest.unblockable || false
    });
}

const PHYSICAL_PACKET = { multiplier: 1, damageType: '物理' };

test('hit threshold is hit rate minus dodge', () => {
    const profile = profileFor();
    assert.strictEqual(profile.hitRate, 90);
    assert.strictEqual(profile.dodge, 10);
    assert.strictEqual(profile.hitThreshold, 80);
});

test('【無法迴避】ignores dodge entirely', () => {
    const profile = profileFor({}, {}, { cannotEvade: true });
    assert.strictEqual(profile.hitThreshold, 90);
});

test('frozen and charging zero out dodge', () => {
    for (const status of ['frozen', 'charging']) {
        const profile = profileFor({}, {}, { defenderStatusKeys: [status] });
        assert.strictEqual(profile.dodge, 0, status);
        assert.strictEqual(profile.hitThreshold, 90, status);
    }
});

test('skill hit modifier and reaction hit bonus both apply', () => {
    const profile = profileFor({}, {}, {
        hitModifier: -20,
        flags: { hitFlatBonus: 5 }
    });
    assert.strictEqual(profile.hitRate, 75);
});

test('a roll above the threshold misses and deals no damage', () => {
    const profile = profileFor();
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 81 });

    assert.strictEqual(outcome.hit, false);
    assert.strictEqual(outcome.damage, 0);
    assert.strictEqual(outcome.critical, false);
});

test('a plain hit is attack times multiplier minus defence', () => {
    const profile = profileFor();
    // roll 50: hits (<= 80) but does not crit (> 10)
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 50 });

    assert.strictEqual(outcome.hit, true);
    assert.strictEqual(outcome.critical, false);
    assert.strictEqual(outcome.damage, 100 - 20);
});

test('damage is never lower than 1 even against huge defence', () => {
    const profile = profileFor({}, { defense: 9999 });
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 50 });

    assert.strictEqual(outcome.hit, true);
    assert.strictEqual(outcome.damage, 1);
});

test('a critical applies the 50% base bonus', () => {
    const profile = profileFor();
    // roll 5: within crit chance of 10
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 5 });

    assert.strictEqual(outcome.critical, true);
    assert.strictEqual(profile.critMultiplier, 1.5);
    assert.strictEqual(outcome.damage, Math.floor(100 * 1.5) - 20);
});

test('crit_damage_bonus and reaction crit bonus stack onto the multiplier', () => {
    const profile = profileFor({ crit_damage_bonus: 25 }, {}, {
        flags: { critDamageBonus: 25 }
    });
    assert.strictEqual(profile.critMultiplier, 2);
});

test('cannotCrit suppresses criticals', () => {
    const profile = profileFor({}, {}, { flags: { cannotCrit: true } });
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 5 });

    assert.strictEqual(outcome.hit, true);
    assert.strictEqual(outcome.critical, false);
});

test('blocking requires guard and reduces damage, and prevents crits', () => {
    const profile = profileFor({}, {}, {
        defenderMods: { guardReady: true }
    });
    assert.strictEqual(profile.blockRate, 40);

    // roll 5 would normally crit; a blocked segment cannot.
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 5 });
    assert.strictEqual(outcome.blocked, true);
    assert.strictEqual(outcome.critical, false);
    assert.strictEqual(outcome.blockRate, 40);
    assert.strictEqual(outcome.damage, Math.floor(100 * 0.6) - 20);
});

test('block rate is capped at 75%', () => {
    const profile = profileFor({}, { block_rate: 200 }, {
        defenderMods: { guardReady: true }
    });
    assert.strictEqual(profile.blockRate, damage.MAX_BLOCK_RATE);
    assert.strictEqual(profile.blockRate, 75);
});

test('magic damage is never blocked', () => {
    const profile = profileFor({}, {}, {
        defenderMods: { guardReady: true }
    });
    const outcome = damage.resolveSegment(
        profile,
        { multiplier: 1, damageType: '魔法' },
        { roll: 50 }
    );

    assert.strictEqual(outcome.blocked, false);
    // Magic uses matk vs resist, and matkFlat applies.
    assert.strictEqual(outcome.damage, 80 - 10);
});

test('【無法格擋】and blockDisabled both defeat guard', () => {
    const viaSkill = profileFor({}, {}, {
        defenderMods: { guardReady: true },
        unblockable: true
    });
    assert.strictEqual(
        damage.resolveSegment(viaSkill, PHYSICAL_PACKET, { roll: 50 }).blocked,
        false
    );

    const viaStatus = profileFor({}, {}, {
        defenderMods: { guardReady: true, blockDisabled: true }
    });
    assert.strictEqual(
        damage.resolveSegment(viaStatus, PHYSICAL_PACKET, { roll: 50 }).blocked,
        false
    );
});

test('damage modifiers are summed, so +25% and -25% cancel out', () => {
    const profile = profileFor({}, {}, {
        attackerMods: { damageMult: 1.25 },
        defenderMods: { damageTakenMult: 0.75 }
    });

    assert.strictEqual(profile.damageModifier, 1);
    assert.strictEqual(
        damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 50 }).damage,
        100 - 20
    );
});

test('defence ignore percentage reduces the subtracted defence', () => {
    const profile = profileFor({}, {}, { defenseIgnoreRate: 50 });
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 50 });

    assert.strictEqual(outcome.damage, 100 - 10);
});

test('ignoreDefenseTargetId removes defence entirely for that target', () => {
    const profile = profileFor({}, {}, {
        flags: { ignoreDefenseTargetId: 2 }
    });
    assert.strictEqual(profile.ignoreDefense, true);
    assert.strictEqual(
        damage.resolveSegment(profile, PHYSICAL_PACKET, { roll: 50 }).damage,
        100
    );
});

test('a forced miss reason overrides an otherwise successful roll', () => {
    const profile = profileFor();
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, {
        roll: 1,
        forcedMissReason: '黑暗'
    });

    assert.strictEqual(outcome.hit, false);
    assert.strictEqual(outcome.damage, 0);
    assert.strictEqual(outcome.forcedMissReason, '黑暗');
});

test('guaranteedHit lands without damage or crit (佯攻)', () => {
    const profile = profileFor();
    const outcome = damage.resolveSegment(profile, PHYSICAL_PACKET, {
        roll: 100,
        guaranteedHit: true
    });

    assert.strictEqual(outcome.hit, true);
    assert.strictEqual(outcome.damage, 0);
    assert.strictEqual(outcome.critical, false);
});

test('empower bonus scales magic attack and respects criticals', () => {
    const profile = profileFor({}, {}, {
        attackerMods: { empowerMagic: 0.5 }
    });

    assert.strictEqual(
        damage.empowerBonusDamage(profile, { critical: false }),
        Math.floor(80 * 0.5) - 10
    );
    assert.strictEqual(
        damage.empowerBonusDamage(profile, { critical: true }),
        Math.floor(80 * 0.5 * 1.5) - 10
    );
});

test('empower bonus is zero without the empower status', () => {
    assert.strictEqual(damage.empowerBonusDamage(profileFor()), 0);
});

// The follow-up and reroll paths used to compute damage themselves and silently
// omitted criticals and blocking. Sharing one profile means the same inputs must
// now produce the same outcome no matter which path resolves the segment.
test('every attack path agrees for identical inputs', () => {
    const build = () => profileFor({}, {}, {
        defenderMods: { guardReady: true }
    });

    const rolls = [1, 5, 10, 11, 50, 80, 81, 100];
    for (const roll of rolls) {
        const first = damage.resolveSegment(build(), PHYSICAL_PACKET, { roll });
        const second = damage.resolveSegment(build(), PHYSICAL_PACKET, { roll });

        assert.deepStrictEqual(first, second, `roll ${roll} 結果不一致`);
    }
});

test('follow-up style attacks now get criticals and blocking', () => {
    // 0.5x follow-up packet against a guarding defender.
    const profile = profileFor({}, {}, {
        defenderMods: { guardReady: true }
    });
    const packet = { multiplier: 0.5, damageType: '物理' };

    const crit = damage.resolveSegment(profile, packet, { roll: 5 });
    assert.strictEqual(crit.blocked, true, '追擊也會被格擋');

    const noGuard = profileFor();
    const critNoGuard = damage.resolveSegment(noGuard, packet, { roll: 5 });
    assert.strictEqual(critNoGuard.critical, true, '追擊也能暴擊');
    assert.strictEqual(
        critNoGuard.damage,
        Math.floor(Math.floor(100 * 0.5) * 1.5) - 20
    );
});
