'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Requiring the facade registers every active from skill-data.
require('../lib/combat');

const { RELATION_MATCHERS, REACTION_DEFS, formatReactionNote } = require('../lib/combat/matcher');
const { TIMING, TIMING_LABEL, normalizeTimingCode } = require('../lib/combat/timings');
const combat = require('../lib/combat');
const { allSkills } = require('./helpers/skills');

const all = allSkills();
const authoredReactions = all
    .filter(skill => skill.reaction)
    .map(skill => ({ key: skill.key, reaction: skill.reaction }));

/**
 * These are the invariants that keep authored data and engine code in sync.
 * A relation or timing that the engine does not implement makes the reaction
 * silently unreachable — no error, no log, just an option that never appears.
 */

test('every relation authored in skill-data has a matcher implementation', () => {
    const missing = authoredReactions
        .filter(({ reaction }) => {
            const relation = reaction.match?.relation;
            return relation && !(relation in RELATION_MATCHERS);
        })
        .map(({ key, reaction }) => `${key} -> ${reaction.match.relation}`);

    assert.deepStrictEqual(
        missing,
        [],
        `以下反應的 relation 沒有對應實作，永遠不會觸發：\n${missing.join('\n')}`
    );
});

test('every relation registered in skill-registry has a matcher implementation', () => {
    const missing = Object.entries(REACTION_DEFS)
        .filter(([, def]) => {
            const relation = def.match?.relation;
            return relation && !(relation in RELATION_MATCHERS);
        })
        .map(([key, def]) => `${key} -> ${def.match.relation}`);

    assert.deepStrictEqual(
        missing,
        [],
        `以下反應的 relation 沒有對應實作，永遠不會觸發：\n${missing.join('\n')}`
    );
});

test('every authored reaction timingCode normalizes to a known TIMING', () => {
    const bad = [];

    for (const { key, reaction } of authoredReactions) {
        if (!reaction.timingCode) continue;
        if (!normalizeTimingCode(reaction.timingCode)) {
            bad.push(`${key} -> ${reaction.timingCode}`);
        }
    }
    for (const [key, def] of Object.entries(REACTION_DEFS)) {
        if (!def.timingCode) continue;
        if (!normalizeTimingCode(def.timingCode)) {
            bad.push(`${key} -> ${def.timingCode}`);
        }
    }

    assert.deepStrictEqual(bad, [], `未知的 timingCode：\n${bad.join('\n')}`);
});

test('every skill timing string is either 被動 or maps to a TIMING', () => {
    const unmapped = all
        .filter(skill => {
            if (!skill.timing || skill.timing === '被動') return false;
            return !normalizeTimingCode(skill.timing);
        })
        .map(skill => `${skill.key} -> ${skill.timing}`);

    assert.deepStrictEqual(
        unmapped,
        [],
        `以下 timing 字串沒有登記在 LEGACY_TIMING_MAP：\n${unmapped.join('\n')}`
    );
});

test('skill-data and skill-registry agree wherever both define a reaction', () => {
    const conflicts = [];

    for (const { key, reaction } of authoredReactions) {
        const registered = REACTION_DEFS[key];
        if (!registered) {
            conflicts.push(`${key} 有 skill-data.reaction 但未登記進 registry`);
            continue;
        }

        const fingerprint = def => [
            def.timingCode,
            def.match?.relation,
            def.expand || '',
            def.pick?.kind || '',
            def.note || ''
        ].join('|');

        if (fingerprint(reaction) !== fingerprint(registered)) {
            conflicts.push(
                `${key}\n  skill-data: ${fingerprint(reaction)}\n  registry:   ${fingerprint(registered)}`
            );
        }
    }

    assert.deepStrictEqual(
        conflicts,
        [],
        `反應定義不一致（registry 應由 skill-data 註冊）：\n${conflicts.join('\n')}`
    );
});

test('registry has no orphan reaction that is missing from skill-data', () => {
    const authoredKeys = new Set(authoredReactions.map(item => item.key));
    const { listSkillBehaviors } = require('../lib/combat/skill-registry');
    const aliasKeys = new Set(
        listSkillBehaviors()
            .filter(behavior => behavior.aliasOf)
            .map(behavior => behavior.key)
    );

    const orphans = Object.keys(REACTION_DEFS).filter(
        key => !authoredKeys.has(key) && !aliasKeys.has(key)
    );

    assert.deepStrictEqual(
        orphans,
        [],
        `registry 出現 skill-data 沒有的反應（請改 skill-data，勿再寫死 registry）：\n${orphans.join('\n')}`
    );
});

test('reaction picker notes are string templates on skill.reaction.note', () => {
    const withNote = all.find(
        s => typeof s.reaction?.note === 'string' && s.reaction.note.includes('${targetName}')
    );
    assert.ok(withNote, '至少一個反應應有 ${targetName} 字串模板 note');
    const rendered = formatReactionNote(withNote.reaction.note, { targetName: '甲' });
    assert.match(rendered, /甲/);
});

test('every reaction skill must have an authored runnable pipeline (no templates)', () => {
    const unrunnable = [];

    for (const skill of all.filter(item => item.reaction || item.contextReaction)) {
        try {
            const ensured = combat.ensureReactionPipeline(skill);
            if (!combat.skillPipelineHasWork(ensured)) {
                unrunnable.push(`${skill.key} (empty pipeline)`);
            }
        } catch (err) {
            unrunnable.push(`${skill.key}: ${err.message}`);
        }
    }

    assert.deepStrictEqual(
        unrunnable,
        [],
        `以下反應缺少可執行的 authored pipeline：\n${unrunnable.join('\n')}`
    );
});

test('reaction definitions must not use effectId as effect driver', () => {
    const offenders = authoredReactions
        .filter(({ reaction }) => reaction.effectId)
        .map(({ key }) => key);
    assert.deepStrictEqual(offenders, [], `仍帶 reaction.effectId：\n${offenders.join('\n')}`);
});

test('reaction expand/pick replace multiTarget/needsPick', () => {
    const leftover = authoredReactions
        .filter(({ reaction }) =>
            reaction.multiTarget != null || reaction.needsPick != null
        )
        .map(({ key }) => key);
    assert.deepStrictEqual(leftover, [], `仍帶 multiTarget/needsPick：\n${leftover.join('\n')}`);

    const unknownPicks = authoredReactions
        .filter(({ reaction }) => reaction.pick?.kind)
        .filter(({ reaction }) => !(reaction.pick.kind in combat.PICK_CATALOG))
        .map(({ key, reaction }) => `${key} -> ${reaction.pick.kind}`);
    assert.deepStrictEqual(
        unknownPicks,
        [],
        `未知 pick.kind：\n${unknownPicks.join('\n')}`
    );
});

test('every TIMING code has a display label', () => {
    const unlabelled = Object.values(TIMING).filter(code => !TIMING_LABEL[code]);
    assert.deepStrictEqual(unlabelled, []);
});

test('every registered skill key exists in the skill catalog', () => {
    for (const skill of all) {
        assert.doesNotThrow(
            () => combat.requireSkillRegistered(skill.key),
            `${skill.key} 未登記到 skill-registry`
        );
    }
});

test('skill-rules special-case table is empty (pipeline is the only effect source)', () => {
    const { SPECIAL_SKILL_KEYS, isSkill } = require('../lib/combat/skill-rules');
    assert.deepStrictEqual(Object.keys(SPECIAL_SKILL_KEYS), []);
    assert.throws(() => isSkill({}, 'DUEL'), /未知的戰技規則名稱/);
});

test('status grants live on the skill object, not a Chinese-name map', () => {
    const { statusesForSkill } = require('../lib/combat/status-catalog');
    const withGrants = all.filter(
        skill => Array.isArray(skill.statusGrants) && skill.statusGrants.length
    );

    assert.ok(
        withGrants.length >= 40,
        `預期至少 40 個戰技帶 statusGrants，實際 ${withGrants.length}`
    );

    // Renaming must not drop grants — lookup is on the skill object itself.
    const sample = withGrants.find(skill => skill.key === '闢路者:戰吼') || withGrants[0];
    const renamed = { ...sample, name: '完全不同的名字' };
    assert.deepStrictEqual(
        statusesForSkill(renamed),
        statusesForSkill(sample)
    );

    // Catalog must not reintroduce a display-name grant table.
    const catalog = require('../lib/combat/status-catalog');
    assert.strictEqual(
        catalog.SKILL_STATUS_GRANTS,
        undefined,
        'SKILL_STATUS_GRANTS 應已移除，改由 skill-data.statusGrants 提供'
    );
});

test('skill-data must not author logicCode (pipeline is the effect source)', () => {
    const leftover = all.filter(skill => skill.logicCode != null).map(s => s.key);
    assert.deepStrictEqual(leftover, [], `仍帶 logicCode：\n${leftover.join('\n')}`);
});

test('server.js no longer matches combat behaviour on skill.name', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

    const nameEquals = src.match(/skill\.name\s*===\s*['"]/g) || [];
    const nameIncludes = src.match(/includes\(\s*skill\.name\s*\)/g) || [];

    assert.deepStrictEqual(
        nameEquals,
        [],
        `server.js 仍有 skill.name === 分支：${nameEquals.length}`
    );
    assert.deepStrictEqual(
        nameIncludes,
        [],
        `server.js 仍有 includes(skill.name) 分支：${nameIncludes.length}`
    );
});
