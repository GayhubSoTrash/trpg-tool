'use strict';

const { TIMING, normalizeTimingCode } = require('./timings');
const { attackDescriptor, targetResultPhysicalHit, skillCostAvailable } = require('./effects');
const { primaryTargetId } = require('./context');
const { REACTION_DEFS } = require('./skill-registry');
const { isOnOrthogonalRay } = require('./world-geometry');

/**
 * Reaction matching helpers.
 * Skill reaction catalogs are mirrored into skill-registry from skill-data
 * (see register-actives.js). Prefer skill.reaction when present.
 */
function reactionCostAvailable(character, skill) {
    return skillCostAvailable(character, skill);
}

function reactionOptionId(actorId, skillKey, targetId = 0) {
    return `${Number(actorId)}:${skillKey}:${Number(targetId || 0)}`;
}

function formatReactionNote(note, ctx = {}) {
    if (typeof note === 'function') {
        return note(ctx) || '';
    }
    if (typeof note !== 'string' || !note) return '';
    return note
        .replace(/\$\{targetName\}/g, ctx.targetName || '目標')
        .replace(/\$\{actorName\}/g, ctx.actorName || '友方');
}

function buildReactionOption(character, skill, def, {
    targetId = null,
    targetName = '',
    note = '',
    meta = {}
} = {}) {
    const pickKind = def.pick?.kind || meta.needsPick || null;
    return {
        id: reactionOptionId(character.id, skill.key, targetId),
        actorId: Number(character.id),
        actorName: character.name,
        actorKind: character.kind || 'player',
        skillKey: skill.key,
        skillName: skill.name,
        timing: skill.timing,
        timingCode: def.timingCode,
        cost: skill.cost,
        weapon: skill.weapon,
        effect: skill.effect,
        targetId: targetId === null ? null : Number(targetId),
        targetName,
        note,
        pick: pickKind ? { kind: pickKind } : null,
        needsPick: pickKind,
        meta
    };
}

function sameSide(a, b) {
    return (a?.kind || 'player') === (b?.kind || 'player');
}

function damagesFromContext(context) {
    return Array.isArray(context.results?.targets)
        ? context.results.targets
        : (Array.isArray(context.meta?.targets) ? context.meta.targets : []);
}

function healsFromContext(context) {
    return Array.isArray(context.results?.heals)
        ? context.results.heals
        : (Array.isArray(context.meta?.heals) ? context.meta.heals : []);
}

/**
 * Side info for a character id mentioned by the current context.
 * Returns null when the side is unknown — callers must not default to match,
 * otherwise e.g. 快速解咒 opens when an *enemy* just received a debuff.
 */
function characterSnapshot(context, characterId) {
    const id = Number(characterId);
    if (!id) return null;
    return context.meta?.charactersById?.get?.(id) ||
        (id === Number(context.targetId) ? context.meta?.targetRow : null) ||
        (id === Number(context.actorId) ? context.meta?.actorRow : null) ||
        null;
}

/** Same geometry as 魂靈風息 UP ray (cross-group world coords). */
function enemyMeleeDirectlyAbove({ reactor, actor, context, reactorId, actorId }) {
    if (!actor) return false;
    if (sameSide(reactor, actor) || reactorId === actorId) return false;
    const positions = context.meta?.positions || {};
    const reactorPos = positions[reactorId] || context.meta?.reactorPos;
    const actorPos = positions[actorId] || context.meta?.actorPos;
    if (
        reactorPos?.centerX != null &&
        actorPos?.centerX != null &&
        reactorPos?.centerY != null &&
        actorPos?.centerY != null
    ) {
        return isOnOrthogonalRay(reactorPos, actorPos, 'UP');
    }
    // Defer to enrich filter when world positions not embedded yet.
    return true;
}

/** 影踏術：相對位置由玩家自行判斷，系統只檢查敵方正在攻擊。 */
function enemyAttackingPlayerJudged({ reactor, actor, reactorId, actorId }) {
    if (!actor) return false;
    return !sameSide(reactor, actor) && reactorId !== actorId;
}

/** 自身受到其他角色的恢復時（共享恢復 / 迴響）。 */
function selfReceivedHealFromOther({ context, reactorId }) {
    return healsFromContext(context).some(
        item =>
            Number(item.targetId) === reactorId &&
            Number(item.heal || 0) > 0 &&
            Number(context.actorId) !== reactorId
    );
}

function attackAllMissed(damages) {
    return damages.every(item =>
        item.hit === false ||
        (
            Number(item.hitCount || item.hits || 0) <= 0 &&
            Number(item.hpLoss || 0) <= 0
        )
    );
}

/**
 * Reaction trigger conditions keyed by the `relation` string authored in
 * skill-data.js / skill-registry.js.
 *
 * Kept as a lookup table rather than a switch so tests can assert that every
 * authored relation has an implementation — a missing entry used to make the
 * reaction silently unreachable.
 */
const RELATION_MATCHERS = Object.freeze({
    ALLY_OF_TARGET_OTHER: ({ reactor, target, reactorId, targetId }) =>
        Boolean(target) &&
        sameSide(reactor, target) &&
        reactorId !== targetId,

    ALLY_OF_TARGET: ({ reactor, target }) =>
        Boolean(target) && sameSide(reactor, target),

    SELF_IS_TARGET: ({ reactorId, targetId, context }) => {
        if (reactorId === targetId) return true;
        const ids = Array.isArray(context?.targetIds)
            ? context.targetIds.map(Number).filter(Boolean)
            : [];
        return ids.includes(reactorId);
    },

    SELF_IS_ACTOR: ({ reactorId, actorId }) => reactorId === actorId,

    SELF_ALWAYS: ({ reactor }) => Boolean(reactor),

    /** 隨風而行：自身指定友方為目標時，使該友方本輪速度+10。 */
    SELF_DECLARED_ALLY: ({ reactor, target, context, reactorId, actorId, targetId }) => {
        if (reactorId !== actorId) return false;
        if (!targetId) return false;
        const declared = target || characterSnapshot(context, targetId);
        if (!declared) return false;
        return sameSide(reactor, declared);
    },

    /**
     * 加速：其他角色回合結束時。At TURN_END the ending character is carried as
     * context.actorId (see pipeline.emitTurnChange).
     */
    OTHER_TURN_ENDED: ({ reactorId, actorId }) =>
        Boolean(actorId) && reactorId !== actorId,

    /** 再起：其他友方回合結束時。 */
    ALLY_TURN_ENDED: ({ reactor, context, reactorId, actorId }) => {
        if (!actorId || reactorId === actorId) return false;
        const ended = characterSnapshot(context, actorId);
        if (!ended) return false;
        return sameSide(reactor, ended);
    },

    /** 共享恢復：自身受到其他角色的恢復時。 */
    SELF_WAS_HEALED: selfReceivedHealFromOther,

    /** 連斬：自身擊倒敵人時。 */
    SELF_KO_ENEMY: ({ reactor, context, reactorId }) => {
        const koSourceId = Number(
            context.koSourceActorId ?? context.meta?.koSourceActorId ?? 0
        );
        if (!koSourceId || koSourceId !== reactorId) return false;

        const downed = Array.isArray(context.results?.ko) ? context.results.ko : [];
        if (!downed.length) return false;

        return downed.some(entry => {
            const victim = characterSnapshot(context, entry.characterId);
            if (!victim) return false;
            return !sameSide(reactor, victim);
        });
    },

    SELF_IS_ACTOR_HIT: ({ context, reactorId, actorId }) => {
        if (reactorId !== actorId) return false;
        return damagesFromContext(context).some(item =>
            Number(item.hitCount || item.hits || 0) > 0 ||
            item.hit === true ||
            Number(item.hpLoss || 0) > 0
        );
    },

    SELF_ATTACK_ALL_MISSED: ({ context, reactorId, actorId }) => {
        if (reactorId !== actorId) return false;
        const damages = damagesFromContext(context);
        if (!damages.length) return Boolean(context.meta?.allMissed);
        return attackAllMissed(damages);
    },

    ENEMY_MELEE_IN_FRONT: enemyMeleeDirectlyAbove,
    ENEMY_MELEE_DIRECTLY_ABOVE: enemyMeleeDirectlyAbove,

    ENEMY_OPPOSITE_ATTACKING: enemyAttackingPlayerJudged,
    ENEMY_ATTACKING_PLAYER_JUDGED: enemyAttackingPlayerJudged,

    SELF_ATTACK_SEGMENT_MISSED: ({ context, reactorId, actorId }) => {
        if (reactorId !== actorId) return false;
        const damages = damagesFromContext(context);
        const segments = context.meta?.segmentResults ||
            damages.flatMap(item => item.segments || []) ||
            [];
        if (segments.length) {
            return segments.some(seg => seg && seg.hit === false);
        }
        return damages.some(item =>
            item.hit === false ||
            (
                Number(item.hitCount || item.hits || 0) <= 0 &&
                Number(item.hpLoss || 0) <= 0
            )
        );
    },

    ALLY_OF_ACTOR_OTHER: ({ reactor, actor, reactorId, actorId }) =>
        Boolean(actor) &&
        sameSide(reactor, actor) &&
        reactorId !== actorId,

    DAMAGED_ALLY_ALIVE: ({ reactor, damage }) => {
        if (!damage || Number(damage.hpLoss || 0) <= 0) return false;
        const damaged = damage.targetSnapshot || {
            id: damage.targetId,
            kind: damage.targetKind,
            hp: damage.hpAfter
        };
        if (!sameSide(reactor, damaged)) return false;
        return Number(damaged.hp ?? damage.hpAfter ?? 1) > 0;
    },

    SELF_TOOK_PHYSICAL_HP_LOSS: ({ damage, reactorId }) => {
        if (!damage) return false;
        return Number(damage.targetId) === reactorId &&
            Number(damage.hpLoss || 0) > 0 &&
            targetResultPhysicalHit(damage);
    },

    ALLY_TOOK_HP_LOSS_OTHER: ({ reactor, damage, reactorId }) => {
        if (!damage || Number(damage.hpLoss || 0) <= 0) return false;
        if (Number(damage.targetId) === reactorId) return false;
        const snap = damage.targetSnapshot;
        if (snap?.kind) return sameSide(reactor, snap);
        return true;
    },

    SELF_WAS_ATTACK_TARGET: ({ context, reactorId }) => {
        if (context.actionCode !== 'ATTACK') return false;
        return damagesFromContext(context).some(
            item => Number(item.targetId) === reactorId
        );
    },

    SELF_WAS_ATTACK_TARGET_LOW_HP_LOSS: ({ context, reactorId }) => {
        if (context.actionCode !== 'ATTACK') return false;
        const selfDamage = damagesFromContext(context).find(
            item => Number(item.targetId) === reactorId
        );
        return Boolean(selfDamage) && Number(selfDamage.hpLoss || 0) < 1;
    },

    ALLY_SPENT_SP_AUX: ({ reactor, actor, context, reactorId, actorId }) => {
        const cost = context.cost;
        if (!cost || cost.type !== 'sp' || Number(cost.amount) <= 0) return false;
        if (reactorId === actorId) return false;
        // 輔助：非 ATTACK 主要攻擊類，或明確輔助 timing；沿用舊行為——其他友方消耗 SP
        return Boolean(actor) && sameSide(reactor, actor);
    },

    SELF_IS_HEALER: ({ context, reactorId, actorId }) => {
        const heals = healsFromContext(context);
        if (!heals.some(item => Number(item.heal || 0) > 0)) return false;
        return reactorId === actorId;
    },

    ALLY_RECEIVED_DEBUFF: ({ reactor, context, reactorId, actorId }) => {
        const applied = Array.isArray(context.appliedEffects)
            ? context.appliedEffects
            : [];
        const affected = Array.isArray(context.affectedIds)
            ? context.affectedIds.map(Number)
            : [];
        const debuffTargets = applied
            .filter(item =>
                item.kind === 'debuff' ||
                item.subtype === 'abnormal' ||
                (
                    item.kind === 'status' &&
                    item.subtype !== 'buff'
                )
            )
            .map(item => Number(item.characterId))
            .filter(Boolean);
        const ids = [...new Set(
            debuffTargets.length ? debuffTargets : affected
        )];
        if (!ids.length) return false;
        if (reactorId === actorId) return false;
        return ids.some(id => {
            const characterId = Number(id);
            if (characterId === reactorId) return true;
            const snap = characterSnapshot(context, characterId);
            if (!snap) return false;
            return sameSide(reactor, snap);
        });
    },

    ENEMY_RECEIVED_BUFF: ({ reactor, context }) => {
        const applied = Array.isArray(context.appliedEffects)
            ? context.appliedEffects
            : [];
        const ids = applied
            .filter(item => item.kind === 'buff')
            .map(item => Number(item.characterId))
            .filter(Boolean);
        const affected = ids.length
            ? ids
            : (context.affectedIds || []).map(Number);
        if (!affected.length) return false;
        return affected.some(id => {
            const snap = characterSnapshot(context, id);
            if (!snap) return false;
            return !sameSide(reactor, snap);
        });
    },

    SELF_DODGED: ({ context, reactorId }) => {
        const segments = context.results?.segments || [];
        return segments.some(
            seg =>
                Number(seg.targetId || primaryTargetId(context)) === reactorId &&
                seg.hit === false &&
                (seg.forcedMissReason === '迴避' || !seg.forcedMissReason)
        );
    },

    SELF_RECEIVED_HEAL_FROM_OTHER: selfReceivedHealFromOther
});

const warnedUnknownRelations = new Set();

function warnUnknownRelation(relation) {
    const key = String(relation);
    if (warnedUnknownRelations.has(key)) return;
    warnedUnknownRelations.add(key);
    console.warn(
        `[combat/matcher] 未實作的反應條件 relation="${key}"，` +
        '該反應永遠不會觸發。請在 RELATION_MATCHERS 補上對應實作。'
    );
}

function declaredTargetEntries(context, fallbackTarget) {
    const ids = Array.isArray(context?.targetIds)
        ? [...new Set(context.targetIds.map(Number).filter(Boolean))]
        : [];
    if (ids.length) {
        return ids.map(id => {
            const snap = characterSnapshot(context, id);
            return snap || { id, name: `目標#${id}` };
        });
    }
    const tid = Number(fallbackTarget?.id || context?.targetId || 0);
    if (!tid) return [];
    return [fallbackTarget || characterSnapshot(context, tid) || { id: tid }];
}

/**
 * Relations keyed off「被指定的目標」— fan out across every declared id.
 * SELF_IS_TARGET is intentionally omitted: it matches via targetIds membership
 * once per reactor (fan-out would duplicate options).
 */
const TARGET_FANOUT_RELATIONS = new Set([
    'ALLY_OF_TARGET',
    'ALLY_OF_TARGET_OTHER',
    'SELF_DECLARED_ALLY'
]);

function relationMatches(relation, {
    reactor,
    actor,
    target,
    context,
    damage,
    heal
}) {
    const matcher = RELATION_MATCHERS[relation];
    if (!matcher) {
        warnUnknownRelation(relation);
        return false;
    }

    const reactorId = Number(reactor.id);
    const actorId = Number(actor?.id || context.actorId || 0);
    const targetId = Number(
        target?.id ||
        primaryTargetId(context) ||
        0
    );

    return Boolean(matcher({
        reactor,
        actor,
        target,
        context,
        damage,
        heal,
        reactorId,
        actorId,
        targetId
    }));
}

/**
 * True when the current action is designating targets as an attack
 * (「被攻擊指定」), not heal/buff/utility designate.
 */
function isAttackDeclare(context, descriptor = null) {
    if (context?.actionCode === 'ATTACK') return true;
    if (context?.meta?.pipelineTags?.attack) return true;
    const atk = descriptor || context?.attack;
    if (!atk || typeof atk !== 'object') return false;
    return Boolean(atk.melee || atk.ranged || atk.physical || atk.magical);
}

function attackMatches(filter, descriptor, context = null) {
    if (!filter) return true;

    const needsAttack = Boolean(
        filter.requiresAttack ||
        filter.any ||
        filter.melee ||
        filter.ranged ||
        filter.physical ||
        filter.magical
    );
    if (needsAttack && !isAttackDeclare(context, descriptor)) return false;

    if (!filter.melee && !filter.ranged && !filter.physical && !filter.magical) {
        return true;
    }
    if (!descriptor) return false;
    if (filter.melee && !descriptor.melee) return false;
    if (filter.ranged && !descriptor.ranged) return false;
    if (filter.physical && !descriptor.physical) return false;
    if (filter.magical && !descriptor.magical) return false;
    return true;
}

function getReactionDef(skill) {
    if (!skill) return null;
    const catalog = REACTION_DEFS[skill.key] || null;
    const authored = skill.reaction || catalog;
    if (!authored) return null;

    const timingCode = normalizeTimingCode(authored.timingCode || skill.timingCode) ||
        normalizeTimingCode(skill.timing) ||
        catalog?.timingCode ||
        null;
    if (!timingCode) return null;

    const match = { ...(authored.match || catalog?.match || {}) };
    // 「自身被攻擊指定時」等與一般指定共用 ON_TARGET_DECLARED；
    // timing 文案含「攻擊指定」時自動要求來源必須是攻擊。
    const timingText = String(skill.timing || authored.timing || '');
    if (timingText.includes('攻擊指定')) {
        match.attack = {
            requiresAttack: true,
            ...(match.attack && typeof match.attack === 'object' ? match.attack : {})
        };
    }

    return {
        timingCode,
        match,
        note: authored.note || catalog?.note || null,
        expand: authored.expand || catalog?.expand || null,
        pick: authored.pick || catalog?.pick || null,
        positionFilter: authored.positionFilter || catalog?.positionFilter || null
    };
}

function isReactionSkill(skill) {
    return Boolean(getReactionDef(skill));
}

/**
 * Collect reaction options for one or more timing codes.
 * @param {object} args
 * @param {Array<{character: object, skill: object}>} args.equippedRows
 * @param {string|string[]} args.timingCodes
 * @param {object} args.context ActionContext-like
 * @param {object} [args.actor]
 * @param {object} [args.target]
 */
function collectReactionOptions({
    equippedRows,
    timingCodes,
    context,
    actor = null,
    target = null
}) {
    const codes = new Set(
        (Array.isArray(timingCodes) ? timingCodes : [timingCodes])
            .map(normalizeTimingCode)
            .filter(Boolean)
    );

    const descriptor = context.attack ||
        (
            context.actionCode === 'ATTACK' && context.meta?.skill
                ? attackDescriptor(context.meta.skill)
                : null
        ) ||
        null;

    // Side lookup for ally/enemy relations. The hook has always existed on
    // context.meta but nothing populated it; every living combatant shows up in
    // equippedRows (initial reaction skills are injected for all of them), so
    // derive it here rather than requiring each caller to pass it.
    if (!context.meta?.charactersById) {
        const charactersById = new Map();
        for (const { character } of equippedRows) {
            if (character?.id != null) {
                charactersById.set(Number(character.id), character);
            }
        }
        context.meta = { ...(context.meta || {}), charactersById };
    }

    const options = [];
    const damages = damagesFromContext(context);
    const heals = healsFromContext(context);

    for (const { character, skill } of equippedRows) {
        const def = getReactionDef(skill);
        if (!def || !codes.has(def.timingCode)) continue;
        if (!reactionCostAvailable(character, skill)) continue;

        const pushOption = (extra = {}) => {
            const note = formatReactionNote(def.note, {
                ...context,
                targetName: extra.targetName || context.targetName,
                actorName: context.actorName
            }) || (extra.note || '');

            options.push(buildReactionOption(character, skill, def, {
                targetId: extra.targetId ?? primaryTargetId(context),
                targetName: extra.targetName || context.targetName || '',
                note,
                meta: {
                    originalActorId: Number(actor?.id || context.actorId || 0),
                    originalTargetId: Number(target?.id || primaryTargetId(context) || 0),
                    descriptor,
                    needsPick: def.pick?.kind || null,
                    ...(def.positionFilter || def.match?.positionFilter
                        ? {
                            positionFilter:
                                def.positionFilter || def.match?.positionFilter
                        }
                        : {}),
                    ...(extra.meta || {})
                }
            }));
        };

        if (def.expand === 'damages') {
            for (const damage of damages) {
                if (!relationMatches(def.match.relation, {
                    reactor: character,
                    actor,
                    target: {
                        id: damage.targetId,
                        kind: damage.targetSnapshot?.kind || damage.targetKind,
                        name: damage.targetName || damage.targetSnapshot?.name
                    },
                    context,
                    damage
                })) continue;

                if (!attackMatches(def.match.attack, descriptor, context)) continue;

                pushOption({
                    targetId: damage.targetId,
                    targetName: damage.targetName ||
                        damage.targetSnapshot?.name ||
                        '目標',
                    note: `${damage.targetName || damage.targetSnapshot?.name || '目標'} 剛受到 ${damage.hpLoss} 點 HP 傷害`,
                    meta: {
                        damagedTargetId: Number(damage.targetId),
                        sourceActorId: Number(actor?.id || context.actorId || 0)
                    }
                });
            }
            continue;
        }

        if (def.expand === 'attack_targets') {
            if (!relationMatches(def.match.relation, {
                reactor: character,
                actor,
                target,
                context
            })) continue;
            if (!attackMatches(def.match.attack, descriptor, context)) continue;

            const attackTargets = [];
            const seen = new Set();
            for (const damage of damages) {
                const id = Number(damage.targetId || 0);
                if (!id || seen.has(id)) continue;
                seen.add(id);
                attackTargets.push({
                    id,
                    name: damage.targetName || damage.targetSnapshot?.name || `目標#${id}`
                });
            }
            if (!attackTargets.length) {
                const fallbackId = Number(primaryTargetId(context) || target?.id || 0);
                if (fallbackId) {
                    attackTargets.push({
                        id: fallbackId,
                        name: context.targetName || target?.name || `目標#${fallbackId}`
                    });
                }
            }
            if (!attackTargets.length) continue;

            for (const atkTarget of attackTargets) {
                pushOption({
                    targetId: atkTarget.id,
                    targetName: atkTarget.name,
                    note: formatReactionNote(def.note, { ...context, targetName: atkTarget.name }) ||
                        `追擊 ${atkTarget.name}`,
                    meta: {
                        followUpTargetId: atkTarget.id,
                        autoTarget: attackTargets.length === 1
                    }
                });
            }
            continue;
        }

        if (def.expand === 'affected') {
            if (def.match.mainAction && context.isMainAction !== true) {
                // still allow if actionCode looks main
                const mainCodes = ['ATTACK', 'HEAL', 'BUFF', 'DEBUFF', 'GUARD', 'MOVE'];
                if (!mainCodes.includes(context.actionCode)) continue;
            }
            if (!relationMatches(def.match.relation, {
                reactor: character,
                actor,
                target,
                context
            })) continue;

            const affected = (() => {
                if (def.match.relation === 'ALLY_RECEIVED_DEBUFF') {
                    const fromApplied = (context.appliedEffects || [])
                        .filter(item =>
                            item.kind === 'debuff' ||
                            item.subtype === 'abnormal' ||
                            item.kind === 'status'
                        )
                        .map(item => Number(item.characterId))
                        .filter(Boolean);
                    if (fromApplied.length) return [...new Set(fromApplied)];
                }
                if (def.match.relation === 'ENEMY_RECEIVED_BUFF') {
                    const fromApplied = (context.appliedEffects || [])
                        .filter(item => item.kind === 'buff')
                        .map(item => Number(item.characterId))
                        .filter(Boolean);
                    if (fromApplied.length) return [...new Set(fromApplied)];
                }
                return (context.affectedIds || []).map(Number).filter(Boolean);
            })();
            if (!affected.length) continue;

            pushOption({
                targetId: affected.length === 1 ? affected[0] : null,
                targetName: affected.length === 1 ? '其' : '選擇目標',
                note: formatReactionNote(def.note, context) || '解除其身上的其中一個減益',
                meta: {
                    candidateIds: affected,
                    needsPick: affected.length > 1,
                    appliedEffects: context.appliedEffects || []
                }
            });
            continue;
        }

        if (def.match.mainAction === true) {
            if (context.isMainAction !== true &&
                !['ATTACK', 'HEAL', 'BUFF', 'DEBUFF', 'GUARD', 'MOVE'].includes(context.actionCode)) {
                continue;
            }
        }

        if (def.match.relation === 'SELF_IS_HEALER') {
            if (!relationMatches(def.match.relation, {
                reactor: character,
                actor,
                target,
                context
            })) continue;

            pushOption({
                targetId: character.id,
                targetName: character.name,
                note: '剛造成恢復效果，可把 50% 實際治療量轉成護盾',
                meta: {
                    heals: heals.filter(item => Number(item.heal || 0) > 0)
                }
            });
            continue;
        }

        if (['SELF_TOOK_PHYSICAL_HP_LOSS', 'ALLY_TOOK_HP_LOSS_OTHER'].includes(def.match.relation)) {
            let matchedDamage = null;
            for (const damage of damages) {
                if (relationMatches(def.match.relation, {
                    reactor: character,
                    actor,
                    target,
                    context,
                    damage
                })) {
                    matchedDamage = damage;
                    break;
                }
            }
            if (!matchedDamage) continue;
            if (!attackMatches(def.match.attack, descriptor, context)) continue;

            pushOption({
                targetId: character.id,
                targetName: character.name,
                note: def.match.relation === 'SELF_TOOK_PHYSICAL_HP_LOSS'
                    ? '自身剛受到物理傷害，可疊加堅守'
                    : `${matchedDamage.targetName || '友方'} 剛受到傷害，可疊加震怒`
            });
            continue;
        }

        if (['SELF_WAS_ATTACK_TARGET', 'SELF_WAS_ATTACK_TARGET_LOW_HP_LOSS'].includes(def.match.relation)) {
            if (!relationMatches(def.match.relation, {
                reactor: character,
                actor,
                target,
                context
            })) continue;

            pushOption({
                targetId: Number(actor?.id || context.actorId),
                targetName: actor?.name || context.actorName || '攻擊者',
                note: def.match.relation === 'SELF_WAS_ATTACK_TARGET_LOW_HP_LOSS'
                    ? '自身受到攻擊且 HP 傷害低於 1，可反擊'
                    : '自身剛受到攻擊，可發動反擊'
            });
            continue;
        }

        if (def.match.relation === 'ALLY_SPENT_SP_AUX') {
            if (!relationMatches(def.match.relation, {
                reactor: character,
                actor,
                target,
                context
            })) continue;

            // 舊邏輯：其他友方發動輔助戰技後；排除純 ATTACK 也可保留——沿用「消耗 SP」即可
            pushOption({
                targetId: Number(actor?.id || context.actorId),
                targetName: actor?.name || context.actorName || '友方',
                note: `使 ${actor?.name || context.actorName || '友方'} SP+1`
            });
            continue;
        }

        const relation = def.match.relation;
        const candidateTargets = TARGET_FANOUT_RELATIONS.has(relation)
            ? declaredTargetEntries(context, target)
            : [target];

        let matchedAny = false;
        for (const candidateTarget of candidateTargets) {
            if (!candidateTarget) continue;
            if (!relationMatches(relation, {
                reactor: character,
                actor,
                target: candidateTarget,
                context
            })) continue;
            if (!attackMatches(def.match.attack, descriptor, context)) continue;

            matchedAny = true;
            pushOption({
                targetId: Number(candidateTarget.id),
                targetName: candidateTarget.name || context.targetName || '',
                meta: {
                    declaredTargetId: Number(candidateTarget.id)
                }
            });
        }
        if (matchedAny) continue;
    }

    const unique = new Map();
    for (const option of options) unique.set(option.id, option);
    return [...unique.values()];
}

module.exports = {
    REACTION_DEFS,
    RELATION_MATCHERS,
    relationMatches,
    getReactionDef,
    isReactionSkill,
    isAttackDeclare,
    attackMatches,
    reactionCostAvailable,
    reactionOptionId,
    buildReactionOption,
    formatReactionNote,
    collectReactionOptions
};
