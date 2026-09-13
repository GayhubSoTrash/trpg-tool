'use strict';

/**
 * Attack resolution math — pure functions, no DB and no socket access.
 *
 * The same formula used to exist in three places (main attack loop, follow-up
 * reaction, 回返 reroll) with different rules: the copies silently dropped
 * critical hits, blocking and damage modifiers, so a buff affecting those would
 * apply to a normal attack but not to a follow-up. Everything now goes through
 * resolveSegment so they cannot drift again.
 *
 * Terminology:
 *  - profile: per-attack invariants (hit threshold, crit chance, block rate)
 *  - packet:  one damage component, e.g. 【1.0物理】with `hits` segments
 *  - segment: a single roll within a packet
 */

const MAGIC = '魔法';
const PHYSICAL = '物理';

/** Base critical bonus in percent, before crit_damage_bonus and reaction flags. */
const BASE_CRIT_DAMAGE_RATE = 50;

/** Blocking can never remove more than this share of the damage. */
const MAX_BLOCK_RATE = 75;

/** Dodge is ignored entirely while the defender has one of these. */
const DODGE_DISABLING_STATUSES = Object.freeze(['frozen', 'charging']);

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function isMagic(damageType) {
    return damageType === MAGIC;
}

/** Uniform 1..100 roll. Injectable so callers can make results deterministic. */
function rollD100() {
    return Math.floor(Math.random() * 100) + 1;
}

/**
 * Attack stat after percentage and flat buffs.
 * Flat attack bonuses only apply to magic — matching the original main loop.
 */
function effectiveAttack({ attacker, mods, damageType }) {
    const magic = isMagic(damageType);
    const raw = Number(magic ? attacker.matk : attacker.patk);
    const mult = magic ? mods.matkMult : mods.patkMult;
    const flat = magic ? mods.matkFlat : 0;
    return Math.floor(raw * mult + flat);
}

/**
 * Defence stat after buffs, skill defence-ignore and reaction overrides.
 */
function effectiveDefense({
    defender,
    mods,
    damageType,
    defenseIgnoreRate = 0,
    ignoreDefense = false
}) {
    if (ignoreDefense) return 0;

    const magic = isMagic(damageType);
    const raw = Number(magic ? defender.resist : defender.defense);
    const mult = magic ? mods.resistMult : mods.defenseMult;
    const keptShare = 1 - clamp(defenseIgnoreRate, 0, 100) / 100;
    return Math.floor(raw * mult * keptShare);
}

function effectiveDodge({ defender, mods, defenderStatusKeys }) {
    const keys = defenderStatusKeys instanceof Set
        ? defenderStatusKeys
        : new Set(defenderStatusKeys || []);

    if (DODGE_DISABLING_STATUSES.some(key => keys.has(key))) return 0;

    return Math.floor(Number(defender.dodge) * mods.dodgeMult + mods.dodgeFlat);
}

function effectiveBlockRate({ defender, mods, flags = {} }) {
    return clamp(
        Number(defender.block_rate || 0) +
        mods.blockFlat +
        Number(flags.blockRateBonus || 0),
        0,
        MAX_BLOCK_RATE
    );
}

function criticalMultiplier({ attacker, flags = {} }) {
    const rate =
        BASE_CRIT_DAMAGE_RATE +
        Math.max(0, Number(attacker.crit_damage_bonus || 0)) +
        Number(flags.critDamageBonus || 0);
    return 1 + rate / 100;
}

/**
 * Combined damage scaling: the attacker's own bonus, the defender's
 * damage-taken modifier and any reaction adjustment, added rather than
 * multiplied so a +25% and a -25% cancel out.
 */
function damageModifier({ attackerMods, defenderMods, flags = {} }) {
    return Math.max(
        0,
        1 +
        (attackerMods.damageMult - 1) +
        (defenderMods.damageTakenMult - 1) +
        Number(flags.damageDealtPct || 0)
    );
}

/**
 * Pre-compute everything that is fixed for one attacker/defender pair, so each
 * segment only needs a roll.
 *
 * @param {object} args
 * @param {object} args.attacker  character row
 * @param {object} args.defender  character row
 * @param {object} args.attackerMods buffModifiers(attacker buffs)
 * @param {object} args.defenderMods buffModifiers(defender buffs)
 * @param {Set<string>|string[]} [args.defenderStatusKeys] defender buff keys
 * @param {object} [args.flags] reaction flags
 * @param {number} [args.hitModifier] skill 【命中±N】
 * @param {number} [args.defenseIgnoreRate] skill 無視 N% 防禦
 * @param {boolean} [args.cannotEvade] skill 【無法迴避】
 * @param {boolean} [args.unblockable] skill 【無法格擋】
 */
function createAttackProfile({
    attacker,
    defender,
    attackerMods,
    defenderMods,
    defenderStatusKeys = [],
    flags = {},
    hitModifier = 0,
    defenseIgnoreRate = 0,
    cannotEvade = false,
    unblockable = false
}) {
    const hitRate = Math.floor(
        Number(attacker.hit_rate) +
        attackerMods.hitFlat +
        Number(hitModifier || 0) +
        Number(flags.hitFlatBonus || 0)
    );

    const dodge = effectiveDodge({
        defender,
        mods: defenderMods,
        defenderStatusKeys
    });

    const critChance = Math.floor(
        Number(attacker.crit) +
        attackerMods.critFlat +
        Number(flags.critFlat || 0)
    );

    return {
        attacker,
        defender,
        attackerMods,
        defenderMods,
        flags,
        defenseIgnoreRate: clamp(defenseIgnoreRate, 0, 100),
        hitRate,
        dodge,
        // 【無法迴避】skips the dodge subtraction entirely.
        hitThreshold: cannotEvade ? hitRate : hitRate - dodge,
        critChance,
        critMultiplier: criticalMultiplier({ attacker, flags }),
        blockRate: effectiveBlockRate({ defender, mods: defenderMods, flags }),
        damageModifier: damageModifier({
            attackerMods,
            defenderMods,
            flags
        }),
        cannotEvade: Boolean(cannotEvade),
        unblockable:
            Boolean(unblockable) ||
            flags.unblockable === true ||
            Boolean(attackerMods.unblockable),
        ignoreDefense:
            Number(flags.ignoreDefenseTargetId || 0) === Number(defender.id)
    };
}

/** Whether this segment gets blocked. Magic can never be blocked. */
function segmentBlocked(profile, { hit, physical }) {
    if (!hit || !physical) return false;
    if (profile.unblockable) return false;
    if (profile.defenderMods.blockDisabled) return false;
    return Boolean(profile.defenderMods.autoGuard || profile.defenderMods.guardReady);
}

/**
 * Resolve one attack segment.
 *
 * @param {object} profile from createAttackProfile
 * @param {object} packet  { multiplier, damageType }
 * @param {object} [options]
 * @param {number} [options.roll] 1..100; generated when omitted
 * @param {string} [options.forcedMissReason] 黑暗 / 幻影 — forces a miss
 * @param {boolean} [options.guaranteedHit] 佯攻 — forces a hit with 0 damage
 * @returns {{roll:number,hitThreshold:number,hit:boolean,critical:boolean,
 *   blocked:boolean,blockRate:number,damage:number,damageType:string,
 *   forcedMissReason:string}}
 */
function resolveSegment(profile, packet, {
    roll = rollD100(),
    forcedMissReason = '',
    guaranteedHit = false
} = {}) {
    const damageType = packet.damageType || PHYSICAL;
    const physical = damageType === PHYSICAL;

    let hit = guaranteedHit || roll <= profile.hitThreshold;
    if (forcedMissReason) hit = false;

    const blocked = segmentBlocked(profile, { hit, physical });

    // Blocked attacks cannot crit; 佯攻's free segment never crits either.
    const critical =
        hit &&
        !blocked &&
        !guaranteedHit &&
        profile.flags.cannotCrit !== true &&
        roll <= profile.critChance;

    let damage = 0;
    if (hit && !guaranteedHit) {
        damage = segmentDamage(profile, packet, { blocked, critical });
    }

    return {
        roll,
        hitThreshold: profile.hitThreshold,
        hit,
        critical,
        blocked,
        blockRate: blocked ? profile.blockRate : 0,
        damage,
        damageType,
        forcedMissReason
    };
}

/** Damage for a segment already known to hit. Always at least 1. */
function segmentDamage(profile, packet, { blocked = false, critical = false } = {}) {
    const attack = effectiveAttack({
        attacker: profile.attacker,
        mods: profile.attackerMods,
        damageType: packet.damageType
    });

    const defense = effectiveDefense({
        defender: profile.defender,
        mods: profile.defenderMods,
        damageType: packet.damageType,
        defenseIgnoreRate: profile.defenseIgnoreRate,
        ignoreDefense: profile.ignoreDefense
    });

    const base = Math.floor(attack * Number(packet.multiplier || 0));
    const blockFactor = blocked ? 1 - profile.blockRate / 100 : 1;

    return Math.max(
        1,
        Math.floor(
            base *
            blockFactor *
            profile.damageModifier *
            (critical ? profile.critMultiplier : 1) -
            defense
        )
    );
}

/**
 * 賦能 bonus: each physical melee segment that hits also lands 0.5 magic.
 * Uses the plain damage modifier (no reaction adjustment) like the original.
 */
function empowerBonusDamage(profile, { critical = false } = {}) {
    const ratio = Number(profile.attackerMods.empowerMagic || 0);
    if (ratio <= 0) return 0;

    const magicAttack = Math.floor(
        Number(profile.attacker.matk) * profile.attackerMods.matkMult +
        profile.attackerMods.matkFlat
    );
    const magicResist = Math.floor(
        Number(profile.defender.resist) * profile.defenderMods.resistMult
    );
    const modifier = Math.max(
        0,
        1 +
        (profile.attackerMods.damageMult - 1) +
        (profile.defenderMods.damageTakenMult - 1)
    );

    return Math.max(
        1,
        Math.floor(
            magicAttack *
            ratio *
            modifier *
            (critical ? profile.critMultiplier : 1) -
            magicResist
        )
    );
}

module.exports = {
    MAGIC,
    PHYSICAL,
    BASE_CRIT_DAMAGE_RATE,
    MAX_BLOCK_RATE,
    DODGE_DISABLING_STATUSES,
    rollD100,
    effectiveAttack,
    effectiveDefense,
    effectiveDodge,
    effectiveBlockRate,
    criticalMultiplier,
    damageModifier,
    createAttackProfile,
    segmentBlocked,
    segmentDamage,
    resolveSegment,
    empowerBonusDamage
};
