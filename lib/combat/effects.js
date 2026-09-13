'use strict';

function parseCost(costText) {
    const text = String(costText || '');
    const ap = text.match(/(\d+)\s*AP/i);
    const sp = text.match(/(\d+)\s*SP/i) || text.match(/(\d+)\s*\+\s*SP/i);
    if (ap) return { type: 'ap', amount: Number(ap[1]) };
    if (sp) return { type: 'sp', amount: Number(sp[1]) };
    return { type: null, amount: 0 };
}

function skillCostAvailable(character, skill) {
    const cost = parseCost(skill?.cost);
    if (!cost.type || cost.amount <= 0) return true;
    return Number(character?.[cost.type] || 0) >= cost.amount;
}

function assertSkillCostAvailable(character, skill) {
    const cost = parseCost(skill?.cost);
    if (!cost.type || cost.amount <= 0) return cost;
    const current = Number(character?.[cost.type] || 0);
    if (current < cost.amount) {
        const name = character?.name || '角色';
        throw new Error(`${name} 的 ${cost.type.toUpperCase()} 不足（需要 ${cost.amount}，目前 ${current}）`);
    }
    return cost;
}

function parseDamagePackets(effect) {
    const packets = [];
    const text = String(effect || '');
    const patterns = [
        /【([0-9.]+)(?:x(\d+))?(物理|魔法)(?:x(\d+))?】/g,
        /【(物理|魔法)([0-9.]+)(?:x(\d+))?】/g
    ];

    let match;
    while ((match = patterns[0].exec(text))) {
        packets.push({
            multiplier: Number(match[1]),
            hits: Number(match[2] || match[4] || 1),
            damageType: match[3]
        });
    }
    while ((match = patterns[1].exec(text))) {
        packets.push({
            multiplier: Number(match[2]),
            hits: Number(match[3] || 1),
            damageType: match[1]
        });
    }
    return packets;
}

function attackDescriptor(skill) {
    const effect = String(skill?.effect || '');
    const packets = parseDamagePackets(effect);

    return {
        melee: effect.includes('近戰攻擊'),
        ranged: effect.includes('遠程攻擊'),
        physical: packets.some(packet => packet.damageType === '物理'),
        magical: packets.some(packet => packet.damageType === '魔法')
    };
}

function targetAllowed(skill, actor, target) {
    if (!actor || !target) return false;

    const sameSide = (actor.kind || 'player') === (target.kind || 'player');
    const code = skill.targetCode || 'SELF';
    const effect = String(skill.effect || '');
    const requiresOtherAlly = effect.includes('其他友方');

    if (skill.actionCode === 'ATTACK') {
        if (code === 'ANY_ORTHOGONAL') {
            return Number(actor.hp) > 0;
        }
        return !sameSide && Number(target.hp) > 0;
    }

    if (skill.actionCode === 'HEAL') {
        if (!sameSide) return false;
        if (code === 'ALLY_DOWN') {
            return actor.id !== target.id && Number(target.hp) <= 0;
        }
        if (code === 'SELF') return actor.id === target.id;
        if (requiresOtherAlly && actor.id === target.id) return false;
        return true;
    }

    if (skill.actionCode === 'DEBUFF') {
        return !sameSide && Number(target.hp) > 0;
    }

    if (code === 'ALLY_DOWN') {
        return sameSide && actor.id !== target.id && Number(target.hp) <= 0;
    }

    if (['ALLY', 'ALLY_ROW', 'ALL_ALLIES', 'ALLY_OR_SELF'].includes(code)) {
        if (!sameSide) return false;
        if (requiresOtherAlly && actor.id === target.id) return false;
        return true;
    }

    if (code === 'ALLY_OR_ENEMY') {
        if (Number(target.hp) <= 0) return false;
        if (requiresOtherAlly && sameSide && actor.id === target.id) return false;
        return true;
    }

    if (['ENEMY', 'ENEMY_ROW', 'ALL_ENEMIES'].includes(code)) {
        return !sameSide && Number(target.hp) > 0;
    }

    if (code === 'SELF') return actor.id === target.id;
    return true;
}

function targetResultPhysicalHit(targetResult) {
    return (targetResult?.packets || []).some(
        packet =>
            packet?.hit === true &&
            packet?.damageType === '物理'
    );
}

/**
 * Skill effect ids used by the resolver. Attack/heal bodies still live in
 * server orchestration for now; this catalog documents the contract.
 */
const SKILL_EFFECT_IDS = Object.freeze({
    BASIC_ATTACK: 'BASIC_ATTACK',
    GENERIC_ATTACK: 'GENERIC_ATTACK',
    RESCUE: 'RESCUE',
    WAIT: 'WAIT',
    GENERIC_HEAL: 'GENERIC_HEAL',
    BUFF_DECLARE: 'BUFF_DECLARE',
    DEBUFF_DECLARE: 'DEBUFF_DECLARE',
    UTILITY_DECLARE: 'UTILITY_DECLARE',
    MOVE_DECLARE: 'MOVE_DECLARE',
    BASIC_GUARD: 'BASIC_GUARD',
    BASIC_MOVE: 'BASIC_MOVE'
});

function skillEffectId(skill) {
    if (!skill) return null;
    if (skill.effectId) return skill.effectId;
    if (skill.logicCode && SKILL_EFFECT_IDS[skill.logicCode]) {
        return skill.logicCode;
    }
    return skill.logicCode || skill.actionCode || null;
}

module.exports = {
    parseCost,
    skillCostAvailable,
    assertSkillCostAvailable,
    parseDamagePackets,
    attackDescriptor,
    targetAllowed,
    targetResultPhysicalHit,
    SKILL_EFFECT_IDS,
    skillEffectId
};
