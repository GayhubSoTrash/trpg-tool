'use strict';

/**
 * Passive (根性) and KO helpers.
 * With 根性 equipped: HP may go below 0; still actionable? No — cannot act while HP<=0,
 * but can receive normal heals. KO only if still HP<=0 at own turn start.
 */

function characterHasSkillKey(equippedKeys, skillKeyOrName) {
    const set = equippedKeys instanceof Set
        ? equippedKeys
        : new Set(equippedKeys || []);
    if (set.has(skillKeyOrName)) return true;
    for (const key of set) {
        if (String(key).endsWith(`:${skillKeyOrName}`) || String(key) === skillKeyOrName) {
            return true;
        }
    }
    return false;
}

function hasGrit(equippedKeys) {
    return characterHasSkillKey(equippedKeys, '根性') ||
        characterHasSkillKey(equippedKeys, '通用戰技:根性');
}

function hasNeedleCrit(equippedKeys) {
    return characterHasSkillKey(equippedKeys, '見縫插針') ||
        characterHasSkillKey(equippedKeys, '通用戰技:見縫插針');
}

/**
 * Floor for HP after damage.
 * duel → 1; grit → no floor (allow negative); else → 0
 */
function hpFloorAfterDamage({ hasDuel = false, hasGritPassive = false } = {}) {
    if (hasDuel) return 1;
    if (hasGritPassive) return Number.NEGATIVE_INFINITY;
    return 0;
}

/**
 * Is character knocked out for targeting / rescue rules?
 * Grit with HP < 0 is NOT KO yet (pending turn-start check).
 * After turn-start resolve sets HP to 0, they are true KO.
 */
function isKnockedOut(character, { hasGritPassive = false } = {}) {
    const hp = Number(character?.hp);
    if (!Number.isFinite(hp)) return true;
    if (hasGritPassive && hp < 0) return false;
    return hp <= 0;
}

/**
 * Can receive normal (non-revive) heals?
 * KO (HP <= 0 without grit below-0 grace): no.
 * Grit with HP < 0: yes. Alive: yes.
 */
function canReceiveNormalHeal(character, { hasGritPassive = false } = {}) {
    const hp = Number(character?.hp);
    if (hasGritPassive && hp < 0) return true;
    return hp > 0;
}

/**
 * At turn start: if grit and still HP<=0 → become true KO (set flag / treat as down).
 * Returns { knockedOut: boolean, newHp }
 */
function resolveGritTurnStart(character, { hasGritPassive = false } = {}) {
    const hp = Number(character?.hp);
    if (!hasGritPassive) {
        return { knockedOut: hp <= 0, newHp: hp };
    }
    if (hp <= 0) {
        // Fall into true KO — keep HP at 0 for consistency with downed display
        return { knockedOut: true, newHp: Math.min(0, hp) };
    }
    return { knockedOut: false, newHp: hp };
}

function rollStatusCrit({ critRate = 0, critDamageBonus = 0 } = {}) {
    const roll = Math.floor(Math.random() * 100) + 1;
    const crit = roll <= Math.floor(Number(critRate) || 0);
    const multiplier = crit
        ? 1 + (50 + Math.max(0, Number(critDamageBonus) || 0)) / 100
        : 1;
    return { crit, roll, multiplier };
}

module.exports = {
    characterHasSkillKey,
    hasGrit,
    hasNeedleCrit,
    hpFloorAfterDamage,
    isKnockedOut,
    canReceiveNormalHeal,
    resolveGritTurnStart,
    rollStatusCrit
};
