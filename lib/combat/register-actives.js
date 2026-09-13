'use strict';

/**
 * Batch-register skills into skill-registry from skill-data.
 * Pipelines and reactions are both authored on the skill object —
 * this module only copies them into the runtime registry.
 */

const SKILL_DATA = require('../../skill-data');
const {
    defineSkill,
    getSkillBehavior,
    rebuildReactionDefs
} = require('./skill-registry');
const { statusesForSkill } = require('./status-catalog');
const { TIMING } = require('./timings');
const { skillHasPipeline } = require('./compile-pipeline');

function allSkills() {
    return [
        ...(SKILL_DATA.initial || []),
        ...(SKILL_DATA.common || []),
        ...Object.values(SKILL_DATA.professionSkills || {}).flat()
    ].map(skill => {
        if (!skillHasPipeline(skill)) {
            throw new Error(`戰技缺少 pipeline：${skill?.key || '(unknown)'}`);
        }
        return skill;
    });
}

function reactionFromSkill(skill) {
    if (!skill?.reaction) return null;
    return { ...skill.reaction };
}

function registerActives() {
    for (const skill of allSkills()) {
        if (!skill?.key) continue;

        const patch = {
            skillKind: skill.skillKind,
            pipeline: skill.pipeline
        };

        const reaction = reactionFromSkill(skill);
        if (reaction) patch.reaction = reaction;

        if (skill.actionCode === 'PASSIVE' || skill.manual === false) {
            patch.passive = true;
        }

        if (String(skill.effect || '').includes('【蓄力') || skill.charge === true) {
            patch.charge = true;
        }

        if (!Array.isArray(skill.pipeline) || !skill.pipeline.length) {
            throw new Error(`戰技缺少 pipeline：${skill.key}`);
        }

        defineSkill(skill.key, patch);
    }

    rebuildReactionDefs();
}

registerActives();

const HOST_ALIASES = {
    basic_attack: 'initial:基礎攻擊',
    rescue: 'initial:救援',
    basic_guard: 'initial:基礎格擋',
    basic_move: 'initial:基礎移動',
    wait: null
};

function registerHostAliases() {
    for (const [alias, canonical] of Object.entries(HOST_ALIASES)) {
        if (getSkillBehavior(alias)) continue;
        if (canonical && getSkillBehavior(canonical)) {
            const base = getSkillBehavior(canonical);
            defineSkill(alias, {
                pipeline: base.pipeline,
                skillKind: base.skillKind,
                reaction: base.reaction,
                aliasOf: canonical
            });
        } else if (alias === 'wait') {
            defineSkill(alias, {
                skillKind: 'active',
                pipeline: [
                    { module: 'wait', params: {} },
                    { module: 'finalize', params: {} }
                ]
            });
        }
    }
    rebuildReactionDefs();
}

registerHostAliases();

module.exports = {
    registerActives,
    registerHostAliases,
    allSkills,
    statusesForSkill,
    TIMING
};
