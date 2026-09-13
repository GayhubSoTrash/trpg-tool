'use strict';

const { TIMING, normalizeTimingCode, timingCodesFromSkill } = require('./timings');
const { REACTION_DEFS } = require('./matcher');
const { skillEffectId } = require('./effects');
const { getSkillBehavior } = require('./skill-registry');
const { skillHasPipeline } = require('./compile-pipeline');

/**
 * Attach timingCode / reaction / effectId / pipeline onto skill objects in-place.
 *
 * Reaction structure is authored on the skill (skill-data.js). The registry
 * only mirrors it after register-actives; prefer the skill's own reaction so
 * renaming / editing never depends on a second copy.
 */
function enrichSkill(skill) {
    if (!skill || typeof skill !== 'object') return skill;

    if (!skill.timingCode) {
        const codes = timingCodesFromSkill(skill);
        if (codes.length) skill.timingCode = codes[0];
    } else {
        skill.timingCode = normalizeTimingCode(skill.timingCode) || skill.timingCode;
    }

    if (!skill.effectId) {
        skill.effectId = skillEffectId(skill);
    }

    const behavior = getSkillBehavior(skill.key);
    // Single source: skill-data reaction wins over registry mirror.
    const reaction = skill.reaction || (behavior && behavior.reaction) || REACTION_DEFS[skill.key];
    if (reaction) {
        skill.timingCode = reaction.timingCode || skill.timingCode;
        skill.reaction = {
            timingCode: reaction.timingCode,
            match: reaction.match || null,
            expand: reaction.expand || null,
            pick: reaction.pick || skill.reaction?.pick || null,
            note: reaction.note || skill.reaction?.note || null,
            positionFilter: reaction.positionFilter || null
        };
        if (skill.manual !== false) {
            skill.contextReaction = true;
        }
    }

    if (behavior && Array.isArray(behavior.pipeline) && behavior.pipeline.length) {
        skill.pipeline = behavior.pipeline;
        skill.skillKind = behavior.skillKind || skill.skillKind || 'active';
    } else if (!skillHasPipeline(skill)) {
        throw new Error(`戰技缺少 pipeline：${skill.key || '(unknown)'}`);
    }

    delete skill.flow;
    if ('effects' in skill) delete skill.effects;
    if ('sourceKind' in skill) delete skill.sourceKind;

    return skill;
}

function enrichSkillCatalog(catalog) {
    if (!catalog) return catalog;

    if (Array.isArray(catalog.initial)) {
        catalog.initial.forEach(enrichSkill);
    }
    if (Array.isArray(catalog.common)) {
        catalog.common.forEach(enrichSkill);
    }
    if (catalog.professionSkills && typeof catalog.professionSkills === 'object') {
        for (const list of Object.values(catalog.professionSkills)) {
            if (Array.isArray(list)) list.forEach(enrichSkill);
        }
    }

    return catalog;
}

function enrichSkillMap(map) {
    if (!map) return map;
    for (const skill of map.values()) enrichSkill(skill);
    return map;
}

module.exports = {
    enrichSkill,
    enrichSkillCatalog,
    enrichSkillMap,
    TIMING
};
