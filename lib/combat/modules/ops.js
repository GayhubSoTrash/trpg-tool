'use strict';

/**
 * Shared onUse / onHit ops for pipeline modules.
 * ops are plain JSON: { op, on?, mods?, ... }
 *
 * Catalog (add generic ops here — never skill-key branches):
 *   apply_mod / apply_status — status grants
 *   gain_resource            — AP/SP
 *   life_sacrifice / life_shield / light_link
 *   dispel_all / dispel_one
 *   set_flag / add_flag_number / counter_damage
 *   intercept_as_self / redirect_target / return_reroll
 *   grant_extra_turn / set_next_attack_mods / delay_target_turn
 *   swap_with_original_target / swap_initiative / mark_duel_target
 *   infinite_call
 *
 * Reaction-context ops read/write context.meta.reaction
 * (flags, resume, originalTargetId, window).
 */

const { recordAppliedEffects } = require('../context');

function getReaction(context) {
    return context?.meta?.reaction || null;
}

function resolveReactionOn(on, context, reaction) {
    const key = String(on || 'original_target').toLowerCase();
    if (key === 'actor' || key === 'self' || key === 'reactor') {
        return Number(context.actorId);
    }
    if (key === 'attacker' || key === 'source_actor') {
        return Number(reaction.window?.sourceActorId || 0);
    }
    if (key === 'target') {
        return Number(context.targetId || reaction.originalTargetId || 0);
    }
    // original_target (default)
    return Number(reaction.originalTargetId || context.targetId || 0);
}

function stampApplied(context, result) {
    if (!result) return false;
    if (Array.isArray(result.appliedEffects) && result.appliedEffects.length) {
        return recordAppliedEffects(context, result.appliedEffects);
    }
    if (Array.isArray(result.applied) && result.applied.length) {
        return recordAppliedEffects(context, result.applied);
    }
    return false;
}

async function runOps(client, ops, {
    frame,
    host,
    skill,
    context
} = {}) {
    const list = Array.isArray(ops) ? ops : [];
    const results = [];

    for (const op of list) {
        if (!op || !op.op) continue;

        if (op.op === 'apply_mod' || op.op === 'apply_status') {
            if (typeof host.resolveApplyStatus !== 'function') {
                throw new Error('host.resolveApplyStatus is required for apply_mod');
            }
            const effect = {
                kind: op.op === 'apply_mod' ? 'apply_mod' : 'apply_status',
                on: op.on || 'target',
                mods: op.mods || null,
                statusKeys: op.statusKeys || null
            };
            const result = await host.resolveApplyStatus(client, {
                frame,
                effect,
                skill,
                context,
                onlyOnHit: false
            });
            stampApplied(context, result);
            results.push(result);
            continue;
        }

        if (op.op === 'life_sacrifice') {
            if (typeof host.resolveLifeSacrifice !== 'function') {
                throw new Error('host.resolveLifeSacrifice is required');
            }
            const result = await host.resolveLifeSacrifice(client, {
                frame,
                skill,
                context
            });
            stampApplied(context, result);
            results.push(result);
            continue;
        }

        if (op.op === 'life_shield') {
            if (typeof host.resolveLifeShield !== 'function') {
                throw new Error('host.resolveLifeShield is required');
            }
            results.push(await host.resolveLifeShield(client, {
                frame,
                skill,
                context
            }));
            continue;
        }

        if (op.op === 'light_link') {
            if (typeof host.resolveStatLink !== 'function') {
                throw new Error('host.resolveStatLink is required');
            }
            const result = await host.resolveStatLink(client, {
                frame,
                skill,
                context
            });
            stampApplied(context, result);
            results.push(result);
            continue;
        }

        if (op.op === 'infinite_call') {
            if (typeof host.resolveInfiniteCall === 'function') {
                results.push(await host.resolveInfiniteCall(client, {
                    frame,
                    skill,
                    context
                }));
                continue;
            }
            results.push({ ok: true, skipped: true });
            continue;
        }

        // —— Reaction / auxiliary ops (same module path as actives) ——

        if (op.op === 'negate_one_segment') {
            const reaction = getReaction(context);
            if (!reaction) {
                throw new Error('negate_one_segment requires reaction context');
            }
            const targetId = resolveReactionOn(op.on, context, reaction);
            if (!targetId) {
                throw new Error('negate_one_segment: missing target');
            }
            reaction.flags.negateOneSegmentTargetId = Number(targetId);
            results.push({
                ok: true,
                content: '本次攻擊其中一段傷害無效'
            });
            continue;
        }

        if (op.op === 'negate_all_damage') {
            const reaction = getReaction(context);
            if (!reaction) {
                throw new Error('negate_all_damage requires reaction context');
            }
            const targetId = resolveReactionOn(op.on, context, reaction);
            if (!targetId) {
                throw new Error('negate_all_damage: missing target');
            }
            reaction.flags.negateAllDamageTargetId = Number(targetId);
            results.push({
                ok: true,
                content: '本次攻擊傷害無效'
            });
            continue;
        }

        if (op.op === 'gain_resource') {
            const ap = Math.max(0, Math.trunc(Number(op.ap) || 0));
            const sp = Math.max(0, Math.trunc(Number(op.sp) || 0));
            if (!ap && !sp) {
                results.push({ ok: true, skipped: true });
                continue;
            }
            if (typeof host.reactionGainApSp !== 'function') {
                throw new Error('host.reactionGainApSp is required for gain_resource');
            }
            const reaction = getReaction(context);
            let characterId = Number(context.actorId);
            const on = String(op.on || 'actor').toLowerCase();
            if (on === 'target' || on === 'original_target') {
                characterId = resolveReactionOn(on === 'target' ? 'target' : 'original_target', context, reaction || { originalTargetId: context.targetId });
            }
            await host.reactionGainApSp(characterId, { ap, sp });
            const bits = [];
            if (ap) bits.push(`AP+${ap}`);
            if (sp) bits.push(`SP+${sp}`);
            results.push({ ok: true, content: bits.join('、') });
            continue;
        }

        if (op.op === 'set_flag') {
            const reaction = getReaction(context);
            if (!reaction) {
                throw new Error('set_flag requires reaction context');
            }
            const key = String(op.key || '');
            if (!key) throw new Error('set_flag requires key');
            reaction.flags[key] = op.value;
            results.push({ ok: true, flag: key });
            continue;
        }

        if (op.op === 'add_flag_number') {
            const reaction = getReaction(context);
            if (!reaction) {
                throw new Error('add_flag_number requires reaction context');
            }
            const key = String(op.key || '');
            if (!key) throw new Error('add_flag_number requires key');
            const delta = Number(op.value) || 0;
            reaction.flags[key] = Number(reaction.flags[key] || 0) + delta;
            results.push({ ok: true, flag: key, value: reaction.flags[key] });
            continue;
        }

        if (op.op === 'intercept_as_self') {
            const reaction = getReaction(context);
            if (!reaction) {
                throw new Error('intercept_as_self requires reaction context');
            }
            reaction.resume.targetId = Number(context.actorId);
            results.push({ ok: true, content: '代為承受本次攻擊' });
            continue;
        }

        if (op.op === 'swap_with_original_target') {
            const reaction = getReaction(context);
            if (!reaction) {
                throw new Error('swap_with_original_target requires reaction context');
            }
            if (typeof host.reactionSwapPositions !== 'function') {
                throw new Error('host.reactionSwapPositions is required');
            }
            const otherId = Number(reaction.originalTargetId);
            await host.reactionSwapPositions(Number(context.actorId), otherId);
            results.push({ ok: true, content: '與原目標交換位置' });
            continue;
        }

        if (op.op === 'cover_share') {
            const reaction = getReaction(context);
            if (!reaction) {
                throw new Error('cover_share requires reaction context');
            }
            reaction.flags.coverShare = {
                reactorId: Number(context.actorId),
                allyId: Number(reaction.originalTargetId)
            };
            results.push({ ok: true, content: '與友方各承受一半傷害' });
            continue;
        }

        if (op.op === 'redirect_target') {
            const reaction = getReaction(context);
            if (!reaction) throw new Error('redirect_target requires reaction context');
            const redirectId = Number(
                reaction.option?.targetId ||
                reaction.option?.meta?.redirectTargetId ||
                reaction.flags.redirectTargetId ||
                0
            );
            if (!redirectId) throw new Error('請選擇退避的新目標');
            reaction.resume.targetId = redirectId;
            results.push({ ok: true, content: '攻擊目標已改寫' });
            continue;
        }

        if (op.op === 'ultimate_guard') {
            if (typeof host.reactionUltimateGuard !== 'function') {
                throw new Error('host.reactionUltimateGuard is required');
            }
            results.push(await host.reactionUltimateGuard(client, { frame, skill, context }));
            continue;
        }

        if (op.op === 'counter_damage') {
            if (typeof host.reactionCounterDamage !== 'function') {
                throw new Error('host.reactionCounterDamage is required');
            }
            results.push(await host.reactionCounterDamage(client, {
                frame,
                skill,
                context,
                effectId: op.effectId
            }));
            continue;
        }

        if (op.op === 'return_reroll') {
            if (typeof host.reactionReturnReroll !== 'function') {
                throw new Error('host.reactionReturnReroll is required');
            }
            results.push(await host.reactionReturnReroll(client, { frame, skill, context }));
            continue;
        }

        if (op.op === 'prognosis_shield') {
            if (typeof host.reactionPrognosisShield !== 'function') {
                throw new Error('host.reactionPrognosisShield is required');
            }
            results.push(await host.reactionPrognosisShield(client, { frame, skill, context }));
            continue;
        }

        if (op.op === 'dispel_one') {
            const reaction = getReaction(context);
            let dispelResult;
            if (typeof host.dispelOneStatus === 'function') {
                dispelResult = await host.dispelOneStatus(client, {
                    kind: op.kind || 'debuff',
                    context,
                    option: reaction?.option
                });
            } else if (typeof host.reactionDispelOne === 'function') {
                dispelResult = await host.reactionDispelOne(client, {
                    frame,
                    skill,
                    context,
                    kind: op.kind || 'debuff'
                });
            } else {
                throw new Error('host.dispelOneStatus is required for dispel_one');
            }
            context.flags = context.flags || {};
            context.flags.dispelled = Boolean(dispelResult?.dispelled);
            results.push(dispelResult);
            continue;
        }

        if (op.op === 'aptitude_choice') {
            if (typeof host.reactionAptitudeChoice !== 'function') {
                throw new Error('host.reactionAptitudeChoice is required');
            }
            results.push(await host.reactionAptitudeChoice(client, { frame, skill, context }));
            continue;
        }

        if (op.op === 'crit_erosion_choice') {
            if (typeof host.reactionCritErosionChoice !== 'function') {
                throw new Error('host.reactionCritErosionChoice is required');
            }
            results.push(await host.reactionCritErosionChoice(client, { frame, skill, context }));
            continue;
        }

        if (op.op === 'legacy_copy') {
            if (typeof host.reactionLegacyCopy !== 'function') {
                throw new Error('host.reactionLegacyCopy is required');
            }
            results.push(await host.reactionLegacyCopy(client, { frame, skill, context }));
            continue;
        }

        if (op.op === 'revive_one') {
            if (typeof host.reactionReviveOne !== 'function') {
                throw new Error('host.reactionReviveOne is required');
            }
            results.push(await host.reactionReviveOne(client, { frame, skill, context }));
            continue;
        }

        if (op.op === 'dispel_all') {
            if (typeof host.dispelAllStatuses !== 'function') {
                throw new Error('host.dispelAllStatuses is required');
            }
            results.push(await host.dispelAllStatuses(client, {
                kind: op.kind || 'debuff',
                on: op.on || 'actor',
                context,
                skill
            }));
            continue;
        }

        if (op.op === 'grant_extra_turn') {
            if (typeof host.grantExtraTurn !== 'function') {
                throw new Error('host.grantExtraTurn is required');
            }
            results.push(await host.grantExtraTurn(client, {
                on: op.on || 'actor',
                ap: Math.max(0, Math.trunc(Number(op.ap) || 0)),
                context
            }));
            continue;
        }

        if (op.op === 'next_attack_mods') {
            if (typeof host.setNextAttackMods !== 'function') {
                throw new Error('host.setNextAttackMods is required');
            }
            results.push(await host.setNextAttackMods(client, {
                charge: Number(op.charge) || 0,
                cannotIntercept: Boolean(op.cannotIntercept),
                context
            }));
            continue;
        }

        if (op.op === 'delay_turn') {
            if (typeof host.delayTargetTurn !== 'function') {
                throw new Error('host.delayTargetTurn is required');
            }
            results.push(await host.delayTargetTurn(client, { context }));
            continue;
        }

        if (op.op === 'swap_initiative') {
            if (typeof host.swapInitiative !== 'function') {
                throw new Error('host.swapInitiative is required');
            }
            const reaction = getReaction(context);
            results.push(await host.swapInitiative(client, {
                context,
                option: reaction?.option
            }));
            continue;
        }

        if (op.op === 'mark_duel_target') {
            const tid = Number(context.targetId || context.targetIds?.[0] || 0);
            if (!tid) throw new Error('死鬥缺少指定敵方');
            context.flags = context.flags || {};
            context.flags.duelTargetId = tid;
            const reaction = getReaction(context);
            if (reaction) reaction.flags.duelTargetId = tid;
            results.push({ ok: true, content: '已標記死鬥目標' });
            continue;
        }

        if (typeof host.resolvePipelineOp === 'function') {
            results.push(await host.resolvePipelineOp(client, {
                op,
                frame,
                skill,
                context
            }));
            continue;
        }

        throw new Error(`未知 pipeline op：${op.op}`);
    }

    return results;
}

module.exports = {
    runOps,
    getReaction,
    resolveReactionOn
};
