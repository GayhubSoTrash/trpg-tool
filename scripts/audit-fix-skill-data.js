'use strict';

/**
 * P0/P1 skill-data fixes: empty pipelines, 指定→resolve_targets, text gaps,
 * strip redundant fields. Aux uses the same modules as actives.
 */
const fs = require('fs');
const path = require('path');
const { attackDescriptor } = require('../lib/combat/effects');
const { pipelineForEffectId } = require('../lib/combat/reaction-pipelines');
const { REACTION_DEFS } = require('../lib/combat/skill-registry');

const dataPath = path.join(__dirname, '..', 'skill-data.js');
const data = require(dataPath);

function rt(targetCode, tags = {}, emitDeclare = true) {
    return {
        module: 'resolve_targets',
        params: { targetCode, emitDeclare, tags }
    };
}

function activate(spendCost, onUse = []) {
    return {
        module: 'activate_skill',
        params: { spendCost: Boolean(spendCost), onUse }
    };
}

function attackSeg(packets, attack = null, onHit = []) {
    return {
        module: 'attack_segment',
        params: { packets, attack, onHit }
    };
}

function finalize() {
    return { module: 'finalize', params: {} };
}

function attackTagsFromSkill(skill) {
    const d = attackDescriptor(skill);
    return {
        attack: true,
        melee: Boolean(d.melee),
        ranged: Boolean(d.ranged),
        physical: Boolean(d.physical),
        magic: Boolean(d.magical)
    };
}

const HAND = {
    '堅守者:掙脫': [
        activate(true, [{ op: 'dispel_all', on: 'actor', kind: 'debuff' }]),
        finalize()
    ],
    '通用戰技:解咒': [
        rt('ALLY', {}, false),
        activate(true, [{ op: 'dispel_one', kind: 'debuff' }]),
        { module: 'heal_segment', params: { mode: 'magic_ratio', ratio: 0.5, requireDispelled: true } },
        finalize()
    ],
    '堅守者:保護': [
        rt('ALLY', {}, true),
        activate(true, []),
        { module: 'charge_pending', params: { logicCode: 'PROTECT' } },
        finalize()
    ],
    '堅守者:爭取時間': [
        rt('ENEMY', {}, true),
        activate(true, [{ op: 'delay_turn' }]),
        finalize()
    ],
    '霧行者:連斬': [
        activate(true, [
            { op: 'gain_resource', ap: 1 },
            { op: 'grant_extra_turn', on: 'actor' }
        ]),
        finalize()
    ],
    '霧行者:潛伏': [
        activate(true, [
            { op: 'next_attack_mods', charge: 1, cannotIntercept: true }
        ]),
        finalize()
    ],
    '織光者:再起': [
        activate(true, [
            { op: 'gain_resource', on: 'target', ap: 1 },
            { op: 'grant_extra_turn', on: 'target' }
        ]),
        finalize()
    ],
    '織光者:促進/妨礙': [
        rt('ANY', {}, true),
        activate(true, [{ op: 'swap_initiative' }]),
        finalize()
    ],
    '通用戰技:高速蓄力': [
        activate(true, []),
        { module: 'charge_pending', params: { logicCode: 'CHARGE_CAST' } },
        finalize()
    ],
    '闢路者:死鬥': [
        rt('ENEMY', {}, true),
        activate(true, [
            { op: 'mark_duel_target' },
            { op: 'apply_status', on: 'actor', statusKeys: ['duel'] }
        ]),
        finalize()
    ],
    '霧行者:借力蹬脫': [
        activate(true, []),
        { module: 'move_segment', params: {} },
        activate(false, [{ op: 'gain_resource', sp: 1 }]),
        finalize()
    ],
    '霧行者:移轉': [
        rt('ALLY_OR_ENEMY', {
            attack: true, melee: false, ranged: true, physical: true, magic: false
        }, true),
        activate(true, []),
        {
            module: 'attack_segment',
            params: {
                packets: [{ multiplier: 1.0, hits: 1, damageType: '物理' }],
                attack: { ranged: true, physical: true, melee: false },
                enemiesOnly: true,
                onHit: []
            }
        },
        { module: 'move_segment', params: { on: 'target', when: 'ally_or_hit' } },
        finalize()
    ]
};

function ensureDesignate(skill) {
    // Only effect text「指定」opens designate; timing words like「被攻擊指定時」do not.
    if (!/指定/.test(skill.effect || '')) return false;
    if ((skill.pipeline || []).some(p => p.module === 'resolve_targets')) return false;

    const tags = skill.actionCode === 'ATTACK' ||
        (skill.pipeline || []).some(p => p.module === 'attack_segment')
        ? attackTagsFromSkill(skill)
        : {};
    const needsPick = skill.reaction?.needsPick;
    const targetCode = skill.targetCode && skill.targetCode !== 'SELF'
        ? skill.targetCode
        : (needsPick === 'enemy_target' || needsPick === 'enemy_row' ? 'ENEMY' :
            needsPick === 'ally_target' || needsPick === 'downed_ally' || needsPick === 'ally_other' ? 'ALLY' :
                'ENEMY');
    const emitDeclare = Boolean(tags.attack) ||
        skill.actionCode === 'HEAL' ||
        skill.actionCode === 'BUFF' ||
        skill.actionCode === 'DEBUFF';

    skill.pipeline = [
        rt(targetCode, tags, emitDeclare),
        ...(skill.pipeline || [])
    ];
    return true;
}

function stripResolveTargetsWithoutDesignate(skill) {
    if (/指定/.test(skill.effect || '')) return false;
    const before = skill.pipeline || [];
    if (!before.some(p => p.module === 'resolve_targets')) return false;
    skill.pipeline = before.filter(p => p.module !== 'resolve_targets');
    return true;
}

function fixNeedsRoll(skill) {
    if (!skill.reaction) return;
    const mods = (skill.pipeline || []).map(p => p.module);
    const isAttacky = mods.includes('attack_segment') ||
        JSON.stringify(skill.pipeline || []).includes('counter_damage');
    if (!isAttacky && skill.needsRoll) {
        skill.needsRoll = false;
    }
    if (!isAttacky && skill.actionCode === 'ATTACK') {
        skill.actionCode = 'UTILITY';
        if (skill.targetCode === 'ENEMY' && !/指定/.test(skill.effect || '')) {
            skill.targetCode = 'SELF';
        }
    }
}

function walk(list) {
    let n = 0;
    for (const skill of list || []) {
        delete skill.flow;
        delete skill.effects;
        delete skill.sourceKind;

        if (HAND[skill.key]) {
            skill.pipeline = JSON.parse(JSON.stringify(HAND[skill.key]));
            if (skill.key === '霧行者:移轉') {
                skill.targetCode = 'ALLY_OR_ENEMY';
            }
            n += 1;
        }

        // Prefer hand-authored / full pipelines; only fill empty from reaction template.
        const seed = REACTION_DEFS[skill.key];
        if (seed) {
            skill.reaction = {
                timingCode: seed.timingCode,
                effectId: seed.effectId,
                match: seed.match || null,
                multiTarget: seed.multiTarget || null,
                needsPick: seed.needsPick || null
            };
            skill.effectId = seed.effectId;
            skill.timingCode = seed.timingCode;
            skill.contextReaction = true;
            if (skill.skillKind !== 'passive') skill.skillKind = 'auxiliary';

            const hasWork = (skill.pipeline || []).some(p => {
                if (p.module === 'activate_skill' && p.params?.onUse?.length) return true;
                return ['attack_segment', 'heal_segment', 'buff_segment', 'move_segment', 'charge_pending', 'resolve_targets']
                    .includes(p.module);
            });
            if (!hasWork) {
                const pipe = pipelineForEffectId(seed.effectId);
                if (pipe) skill.pipeline = pipe;
            }
            n += 1;
        }

        if (ensureDesignate(skill)) n += 1;
        if (stripResolveTargetsWithoutDesignate(skill)) n += 1;

        // 魂靈風息: add heal after attack
        if (skill.key === '織光者:魂靈風息') {
            const hasHeal = (skill.pipeline || []).some(p => p.module === 'heal_segment');
            if (!hasHeal) {
                const fin = skill.pipeline.findIndex(p => p.module === 'finalize');
                const heal = {
                    module: 'heal_segment',
                    params: { mode: 'magic_ratio', ratio: 0.75, alliesInTargets: true }
                };
                if (fin >= 0) skill.pipeline.splice(fin, 0, heal);
                else skill.pipeline.push(heal);
                n += 1;
            }
        }

        fixNeedsRoll(skill);

        // P2: drop top-level duplicates once reaction carries them.
        if (skill.reaction?.effectId && skill.effectId === skill.reaction.effectId) {
            delete skill.effectId;
        }
        if (skill.reaction?.timingCode && skill.timingCode === skill.reaction.timingCode) {
            delete skill.timingCode;
        }
        if (skill.reaction && skill.contextReaction) {
            delete skill.contextReaction;
        }
    }
    return n;
}

let changed = 0;
changed += walk(data.initial);
changed += walk(data.common);
for (const arr of Object.values(data.professionSkills || {})) {
    changed += walk(arr);
}

fs.writeFileSync(dataPath, `module.exports = ${JSON.stringify(data, null, 2)};\n`);
console.log('patched skills ops', changed);

// quick report
const all = [...data.initial, ...data.common, ...Object.values(data.professionSkills).flat()];
const noop = all.filter(s => {
    const mods = (s.pipeline || []).map(p => p.module);
    const act = (s.pipeline || []).find(p => p.module === 'activate_skill');
    const empty = !act?.params?.onUse?.length;
    return empty && !mods.some(m =>
        ['attack_segment', 'heal_segment', 'buff_segment', 'move_segment', 'charge_pending'].includes(m)
    );
});
console.log('remaining noop', noop.map(s => s.key));
const qr = all.find(s => s.key === '霧行者:快速裝填');
console.log('快速裝填', qr.pipeline.map(p => p.module).join(' > '));
