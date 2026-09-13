'use strict';

/**
 * Target resolution for timing-driven skills/reactions.
 * - Effect text containing「指定」requires declare (ON_TARGET_DECLARED).
 * - Otherwise targets come from timing context.
 * - Singular「其／該友方」with multiple candidates → pick UI.
 */

function effectText(skillOrEffect) {
    if (!skillOrEffect) return '';
    if (typeof skillOrEffect === 'string') return skillOrEffect;
    return String(skillOrEffect.effect || '');
}

function requiresDesignate(skillOrEffect) {
    return effectText(skillOrEffect).includes('指定');
}

function isPluralTargetWording(skillOrEffect) {
    const text = effectText(skillOrEffect);
    return /全部|所有|每一|任意多名|多名/.test(text);
}

function isSingularContextTarget(skillOrEffect) {
    const text = effectText(skillOrEffect);
    if (isPluralTargetWording(text)) return false;
    return /該友方|該敵方|該角色|\b其\b|解除其|使其|令其|對其/.test(text);
}

function damagedIdsFromContext(context = {}) {
    const list = Array.isArray(context.results?.targets)
        ? context.results.targets
        : (Array.isArray(context.targets) ? context.targets : []);
    return [...new Set(
        list
            .filter(item =>
                Number(item?.hpLoss || 0) > 0 ||
                item?.hit === true ||
                Number(item?.hitCount || item?.hits || 0) > 0
            )
            .map(item => Number(item.targetId))
            .filter(Boolean)
    )];
}

/**
 * Infer candidate character ids from timing context for auto-target skills.
 */
function candidatesFromContext(skill, context = {}, extras = {}) {
    const text = effectText(skill);
    const affected = Array.isArray(context.affectedIds)
        ? context.affectedIds.map(Number).filter(Boolean)
        : [];
    const targetIds = Array.isArray(context.targetIds)
        ? context.targetIds.map(Number).filter(Boolean)
        : (context.targetId != null ? [Number(context.targetId)] : []);
    const triggerId = context.triggerCharacterId != null
        ? Number(context.triggerCharacterId)
        : null;
    const actorId = context.actorId != null ? Number(context.actorId) : null;
    const damaged = damagedIdsFromContext(context);
    const phase = String(context.phase || context.timingCode || '');

    // 「其他友方發動」/ BEFORE_SKILL 「該友方」→ the skill triggerer
    if (
        extras.preferTrigger ||
        /其他友方發動/.test(text) ||
        (phase === 'BEFORE_SKILL' && /該友方/.test(text) && !damaged.length)
    ) {
        if (triggerId) return [triggerId];
    }

    // AFTER_DAMAGE 「該友方／恢復其」→ damaged characters (not attack target)
    if (damaged.length && /該友方|該敵方|該角色|\b其\b|恢復/.test(text)) {
        return damaged;
    }

    // 「其」on effect-applied → affected characters
    if (/其|該友方|該敵方|該角色/.test(text) && affected.length) {
        return [...new Set(affected)];
    }

    if (affected.length) return [...new Set(affected)];
    if (damaged.length) return damaged;
    if (targetIds.length) return [...new Set(targetIds)];
    if (triggerId) return [triggerId];
    if (actorId) return [actorId];
    return [];
}

/**
 * Resolve targets for a skill/reaction against context.
 * @returns {{
 *   mode: 'declare'|'auto'|'pick'|'none',
 *   needsDeclare: boolean,
 *   candidateIds: number[],
 *   resolvedIds: number[],
 *   pickRequest: object|null
 * }}
 */
function resolveTargets(skill, context = {}, {
    pickedTargetId = null,
    charactersById = null
} = {}) {
    const needsDeclare = requiresDesignate(skill);

    if (needsDeclare) {
        const declared = Array.isArray(context.targetIds) && context.targetIds.length
            ? context.targetIds.map(Number)
            : (context.targetId != null ? [Number(context.targetId)] : []);
        return {
            mode: 'declare',
            needsDeclare: true,
            candidateIds: declared,
            resolvedIds: declared,
            pickRequest: null
        };
    }

    let candidateIds = candidatesFromContext(skill, context);

    if (charactersById instanceof Map) {
        candidateIds = candidateIds.filter(id => charactersById.has(id));
    }

    candidateIds = [...new Set(candidateIds.filter(Boolean))];

    if (!candidateIds.length) {
        return {
            mode: 'none',
            needsDeclare: false,
            candidateIds: [],
            resolvedIds: [],
            pickRequest: null
        };
    }

    const singular = isSingularContextTarget(skill);

    if (singular && candidateIds.length > 1) {
        if (pickedTargetId != null && candidateIds.includes(Number(pickedTargetId))) {
            return {
                mode: 'auto',
                needsDeclare: false,
                candidateIds,
                resolvedIds: [Number(pickedTargetId)],
                pickRequest: null
            };
        }

        return {
            mode: 'pick',
            needsDeclare: false,
            candidateIds,
            resolvedIds: [],
            pickRequest: {
                kind: 'timing_target_pick',
                skillKey: skill.key || null,
                skillName: skill.name || '',
                reason: 'singular_context_target',
                candidateIds,
                timingCode: context.phase || null,
                prompt: `選擇「${skill.name || '戰技'}」的適用目標`
            }
        };
    }

    if (singular) {
        return {
            mode: 'auto',
            needsDeclare: false,
            candidateIds,
            resolvedIds: candidateIds.slice(0, 1),
            pickRequest: null
        };
    }

    // Plural / unrestricted auto: all candidates
    return {
        mode: 'auto',
        needsDeclare: false,
        candidateIds,
        resolvedIds: candidateIds,
        pickRequest: null
    };
}

function shouldEmitTargetDeclared(skill) {
    return requiresDesignate(skill);
}

module.exports = {
    effectText,
    requiresDesignate,
    isPluralTargetWording,
    isSingularContextTarget,
    damagedIdsFromContext,
    candidatesFromContext,
    resolveTargets,
    shouldEmitTargetDeclared
};
