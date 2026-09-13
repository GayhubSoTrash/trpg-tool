'use strict';

/**
 * Reaction runtime — runs skill.pipeline modules (same as active casts).
 * Host adapters wrap DB/damage helpers; no effectId switch.
 */

const { normalizeTimingCode, TIMING } = require('./timings');
const { applyApSpGain } = require('./resources');
const { mod } = require('./status-catalog');
const { compilePipeline, skillHasPipeline } = require('./compile-pipeline');
const { runModule } = require('./modules');
const { createActionContext, appendResultMessage, primaryTargetId } = require('./context');
const {
    ensureReactionPipeline,
    skillPipelineHasWork,
    activateOnUse
} = require('./reaction-pipelines');
const { attachSharedHostOps } = require('./host-ops');

function materializeFlagPlaceholders(flags, actorId) {
    const out = { ...flags };
    for (const [key, value] of Object.entries(out)) {
        if (value === '__actor__') out[key] = Number(actorId);
    }
    return out;
}

function buildReactionHost(client, deps, reactionState) {
    const option = () => reactionState.option || {};
    const reactor = () => reactionState.reactor;
    const skill = () => reactionState.skill;
    const clock = () => reactionState.clock || { round: 1 };

    return {
        spendSkillCost: async () => {
            reactionState.costSkipped = true;
            return { type: null, amount: 0 };
        },

        resolveApplyStatus: async (c, args) => {
            const effect = args.effect || {};
            const context = args.context || {};
            const sk = args.skill || skill();
            let grants = [
                ...(Array.isArray(effect.statusKeys) ? effect.statusKeys : []),
                ...(Array.isArray(effect.mods)
                    ? effect.mods.map(item => (
                        item && item.type === 'mod'
                            ? item
                            : { type: 'mod', ...item }
                    ))
                    : [])
            ];

            // buff_segment sets useSkillBody + empty keys → load skill.statusGrants
            if (!grants.length && effect.useSkillBody) {
                const { statusesForSkill } = require('./status-catalog');
                grants = statusesForSkill(sk) || [];
            }

            if (!grants.length) {
                return { ok: true, applied: [] };
            }

            const { applySelfStatus } = require('./skill-params');
            const explicitOn = effect.on != null ? String(effect.on).toLowerCase() : null;
            // useSkillBody defaults to the declared target (ALLY buffs), not the reactor
            const on = explicitOn || (effect.useSkillBody ? 'target' : 'actor');

            let ids = [];
            if (on === 'actor' || on === 'self' || on === 'reactor') {
                ids = [Number(context.actorId)].filter(Boolean);
            } else if (on === 'original_target') {
                ids = [Number(reactionState.originalTargetId)].filter(Boolean);
            } else if (on === 'attacker' || on === 'source_actor') {
                ids = [Number(reactionState.window?.sourceActorId)].filter(Boolean);
            } else if (on === 'recipients') {
                const fromMeta = option().meta?.recipientIds;
                if (Array.isArray(fromMeta) && fromMeta.length) {
                    ids = fromMeta.map(Number).filter(Boolean);
                } else if (typeof deps.resolveRecipients === 'function') {
                    const tid = Number(
                        primaryTargetId(context) || context.targetId || 0
                    );
                    ids = await deps.resolveRecipients(c, {
                        actor: reactor(),
                        target: tid ? { id: tid } : null,
                        skill: sk,
                        context
                    });
                } else {
                    ids = [Number(context.actorId)].filter(Boolean);
                }
            } else if (on === 'target' || on === 'targets') {
                if (effect.useSkillBody && applySelfStatus(sk)) {
                    ids = [Number(context.actorId)].filter(Boolean);
                } else if (
                    effect.useSkillBody &&
                    typeof deps.resolveRecipients === 'function' &&
                    (sk.targetCode === 'ALL_ALLIES' ||
                        sk.targetCode === 'ALLY_ROW' ||
                        sk.targetCode === 'ALL_ENEMIES' ||
                        sk.targetCode === 'ENEMY_ROW')
                ) {
                    const tid = Number(
                        primaryTargetId(context) || context.targetId || 0
                    );
                    ids = await deps.resolveRecipients(c, {
                        actor: reactor(),
                        target: tid ? { id: tid } : null,
                        skill: sk,
                        context
                    });
                } else if (on === 'targets') {
                    ids = (context.targetIds || []).map(Number).filter(Boolean);
                } else {
                    ids = [
                        Number(primaryTargetId(context) || context.targetId || 0)
                    ].filter(Boolean);
                }
            } else {
                ids = [Number(primaryTargetId(context) || context.targetId || 0)]
                    .filter(Boolean);
            }

            if (!ids.length) return { ok: true, applied: [] };

            const round = clock().round || 1;
            const hasNegativeMod = grants.some(g =>
                typeof g === 'object' &&
                (g.type === 'mod' || g.stat) &&
                Number(g.value) < 0
            );
            const treatAsDebuff = hasNegativeMod ||
                grants.some(g => typeof g === 'string' && g === 'berserk') ||
                grants.some(g =>
                    typeof g === 'object' &&
                    String(g.stat || '') === 'damageTaken' &&
                    Number(g.value) > 0
                );

            if (treatAsDebuff && typeof deps.applyDebuffBundle === 'function') {
                const bundle = grants.map(g => {
                    if (typeof g === 'string') return g;
                    if (g.type === 'mod' || g.stat) {
                        return mod(g.stat, g.mode || 'pct', g.value);
                    }
                    return g;
                });
                await deps.applyDebuffBundle(c, ids, bundle, {
                    sourceSkillKey: sk.key,
                    sourceCharacterId: Number(context.actorId),
                    currentRound: round
                });
            } else if (typeof deps.applyBuffToCharacters === 'function') {
                for (const grant of grants) {
                    await deps.applyBuffToCharacters(c, ids, grant, {
                        sourceSkillKey: sk.key,
                        sourceCharacterId: Number(context.actorId),
                        expiresRound: round
                    });
                }
            }

            reactionState.charactersChanged = true;
            return {
                ok: true,
                applied: ids.flatMap(characterId =>
                    grants.map(grant => ({
                        characterId,
                        key: typeof grant === 'object' && grant.type === 'mod'
                            ? `mod:${grant.stat}:${grant.mode || 'pct'}`
                            : grant
                    }))
                )
            };
        },

        resolveAttackHits: async (c, args) => {
            if (typeof deps.resolveFollowUpAttack !== 'function') {
                throw new Error('resolveFollowUpAttack missing for reaction attack_segment');
            }
            const context = args.context || {};
            const packets = args.effect?.packets || context.meta?.pipelinePackets || [];
            const packet = packets[0] || { multiplier: 1, damageType: '物理' };
            const attack = args.effect?.attack || {};
            const targetId = Number(
                option().meta?.followUpTargetId ||
                option().targetId ||
                option().meta?.pickedTargetId ||
                primaryTargetId(context) ||
                0
            );
            if (!targetId) throw new Error('攻擊反應缺少目標');

            const result = await deps.resolveFollowUpAttack({
                actor: reactor(),
                targetId,
                multiplier: Number(packet.multiplier) || 1,
                damageType: packet.damageType || '物理',
                ranged: Boolean(attack.ranged),
                skill: args.skill || skill()
            });
            if (result.charactersChanged) reactionState.charactersChanged = true;
            return {
                ok: true,
                content: result.reactionText,
                reactionText: result.reactionText,
                attackResult: result
            };
        },

        resolveHeal: async (c, args) => {
            const context = args.context || {};
            const params = args.effect || {};
            const targetId = Number(
                params.on === 'actor'
                    ? context.actorId
                    : (
                        option().meta?.damagedTargetId ||
                        option().targetId ||
                        primaryTargetId(context) ||
                        0
                    )
            );
            if (!targetId) throw new Error('治療反應缺少目標');

            let healAmount = 0;
            const mode = String(params.mode || 'magic_ratio');
            const ratio = Number(params.ratio || 0.75);

            const row = await c.query(
                'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
                [targetId]
            );
            const target = row.rows[0];
            if (!target) throw new Error('治療目標不存在');

            if (mode === 'magic_ratio') {
                if (typeof deps.sourceEffectiveMagic !== 'function') {
                    throw new Error('sourceEffectiveMagic missing');
                }
                const magic = await deps.sourceEffectiveMagic(c, reactor().id);
                healAmount = Math.max(1, Math.floor(magic * ratio));
            } else if (mode === 'patk_segments') {
                const hitSegments = Number(
                    option().meta?.hitSegments ||
                    reactionState.window?.context?.hitSegments ||
                    reactionState.flags.hitSegments ||
                    1
                );
                const patk = Math.floor(Number(reactor().patk || 0));
                healAmount = Math.max(1, Math.floor(patk * ratio * hitSegments));
            } else if (mode === 'max_hp_ratio') {
                healAmount = Math.max(
                    1,
                    Math.floor(Number(target.max_hp) * ratio)
                );
            } else if (mode === 'skill_body' && typeof deps.resolveReactionHeal === 'function') {
                const result = await deps.resolveReactionHeal({
                    client: c,
                    reactor: reactor(),
                    skill: args.skill || skill(),
                    option: option(),
                    targetId
                });
                if (result.charactersChanged) reactionState.charactersChanged = true;
                return {
                    ok: true,
                    content: result.reactionText || result.content,
                    heals: result.heals || []
                };
            } else {
                healAmount = Math.max(1, Math.floor(Number(params.amount) || 1));
            }

            const oldHp = Number(target.hp);
            const newHp = Math.min(Number(target.max_hp), oldHp + healAmount);
            const actual = Math.max(0, newHp - oldHp);
            if (actual > 0) {
                await c.query('UPDATE characters SET hp = $1 WHERE id = $2', [newHp, targetId]);
                reactionState.charactersChanged = true;
            }

            const heals = [{
                targetId,
                targetName: target.name,
                heal: actual,
                oldHp,
                newHp
            }];

            if (
                params.appendPrognosis &&
                typeof deps.appendPrognosisOptionIfAvailable === 'function'
            ) {
                reactionState.nextOptions = await deps.appendPrognosisOptionIfAvailable(
                    c,
                    reactionState.nextOptions,
                    reactor().id,
                    heals
                );
            }

            const content =
                `${reactor().name} 發動「${(args.skill || skill()).name}」→ ${target.name}：` +
                `HP ${oldHp} → ${newHp}` +
                (actual ? `（+${actual}）` : '（未產生有效恢復）');

            return { ok: true, content, reactionText: content, heals };
        },

        resolveMove: async (c, args) => {
            const cellId = Number(
                option().meta?.pickedCellId ||
                option().pickedCellId ||
                reactionState.flags.pickedCellId ||
                0
            );
            const optional = Boolean(args.effect?.optional);
            if (!cellId) {
                if (optional) {
                    return { ok: true, content: '無鄰近空格，跳過移動', skipped: true };
                }
                throw new Error('請選擇移動的格子');
            }
            const actorId = Number(reactor().id);
            await c.query(
                'UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1',
                [actorId]
            );
            const moved = await c.query(
                `UPDATE cells SET occupied_by = $1
                 WHERE id = $2 AND occupied_by IS NULL
                 RETURNING id`,
                [actorId, cellId]
            );
            if (!moved.rows.length) {
                if (optional) {
                    return { ok: true, content: '該格子無法移動，跳過', skipped: true };
                }
                throw new Error('該格子無法移動');
            }
            reactionState.battlefieldChanged = true;
            return { ok: true, content: '移動完成' };
        },

        resolveStatLink: async (c, args) => {
            const context = args.context || {};
            const linkTargetId = Number(
                primaryTargetId(context) ||
                option().targetId ||
                option().meta?.autoTargetId ||
                reactionState.window?.context?.actorId ||
                0
            );
            if (!linkTargetId) throw new Error('熠光連結缺少目標');

            if (typeof deps.resolveStatLink === 'function') {
                const linked = await deps.resolveStatLink(c, {
                    actorId: Number(reactor().id),
                    targetId: linkTargetId,
                    skill: args.skill || skill(),
                    round: clock().round
                });
                reactionState.charactersChanged = true;
                return linked;
            }

            const actorRow = await c.query(
                'SELECT * FROM characters WHERE id = $1',
                [reactor().id]
            );
            const actor = actorRow.rows[0];
            const actorBuffs = await deps.getCharacterBuffEntries(c, reactor().id);
            const mods = deps.buffModifiers(actorBuffs);
            const effectiveMatk = Math.floor(
                Number(actor.matk) * mods.matkMult + mods.matkFlat
            );
            const transferred = Math.floor(effectiveMatk * 0.5);
            await deps.applyDebuffBundle(c, [reactor().id], ['light_link_loss'], {
                sourceSkillKey: skill().key,
                sourceCharacterId: reactor().id,
                currentRound: clock().round
            });
            await deps.applyBuffToCharacters(c, [linkTargetId], 'light_link_gain', {
                sourceSkillKey: skill().key,
                sourceCharacterId: reactor().id,
                expiresRound: clock().round,
                valueNum: transferred
            });
            reactionState.charactersChanged = true;
            return {
                ok: true,
                content:
                    `魔攻 -50%，轉移 ${transferred} 點魔法攻擊給連結友方`
            };
        },

        reactionGainApSp: async (characterId, amounts) => {
            const result = await applyApSpGain(client, characterId, {
                ...amounts,
                manual: false,
                getCharacterBuffEntries: deps.getCharacterBuffEntries,
                removeBuffKeys: deps.removeBuffKeys
            });
            reactionState.charactersChanged = true;
            return result;
        },

        reactionSwapPositions: async (a, b) => {
            if (typeof deps.swapCharacterPositions === 'function') {
                await deps.swapCharacterPositions(client, a, b);
                reactionState.battlefieldChanged = true;
            }
        },

        reactionUltimateGuard: async (c) => {
            const opt = option();
            const totalSpend = Math.max(
                1,
                Number(opt.meta?.spSpend || opt.spSpend || reactionState.flags.spSpend || 1)
            );
            const alreadySpent = Math.max(0, Number(opt.meta?.baseCostSpent || 1));
            const extra = Math.max(0, totalSpend - alreadySpent);
            if (extra > 0) {
                const spRow = await c.query(
                    'SELECT sp FROM characters WHERE id = $1 FOR UPDATE',
                    [reactor().id]
                );
                const currentSp = Number(spRow.rows[0]?.sp || 0);
                if (currentSp < extra) throw new Error('SP 不足，無法發動極致防禦');
                await c.query(
                    'UPDATE characters SET sp = sp - $1 WHERE id = $2',
                    [extra, reactor().id]
                );
            }
            reactionState.flags.blockRateBonus =
                Number(reactionState.flags.blockRateBonus || 0) + totalSpend * 10;
            if (typeof deps.applyBuffToCharacters === 'function') {
                await deps.applyBuffToCharacters(c, [reactor().id], 'guard_ready', {
                    sourceSkillKey: skill().key,
                    sourceCharacterId: reactor().id
                });
            }
            reactionState.charactersChanged = true;
            return {
                ok: true,
                content: `消耗 ${totalSpend} SP，格擋率 +${totalSpend * 10}%，並進行格擋`
            };
        },

        reactionCounterDamage: async (c, { effectId }) => {
            if (typeof deps.resolveCounterDamage !== 'function') {
                throw new Error('反擊結算尚未注入');
            }
            const result = await deps.resolveCounterDamage({
                client: c,
                reactor: reactor(),
                skill: skill(),
                option: option(),
                effectId,
                getCharacterBuffEntries: deps.getCharacterBuffEntries,
                buffModifiers: deps.buffModifiers
            });
            if (result.charactersChanged) reactionState.charactersChanged = true;
            return {
                ok: true,
                content: result.reactionText,
                reactionText: result.reactionText
            };
        },

        reactionReturnReroll: async () => {
            const window = reactionState.window || {};
            const segments = window.context?.targets?.[0]?.segments ||
                window.context?.segmentResults ||
                option().meta?.missedSegments ||
                [];
            const missed = (Array.isArray(segments) ? segments : [])
                .filter(seg => seg && seg.hit === false);
            if (typeof deps.applyReturnReroll === 'function') {
                const result = await deps.applyReturnReroll({
                    actor: reactor(),
                    window,
                    option: option(),
                    missedSegments: missed
                });
                if (result.flags) Object.assign(reactionState.flags, result.flags);
                if (result.charactersChanged) reactionState.charactersChanged = true;
                return {
                    ok: true,
                    content: result.reactionText,
                    reactionText: result.reactionText
                };
            }
            reactionState.flags.returnReroll = true;
            return { ok: true, content: '未命中段將重新擲骰' };
        },

        reactionPrognosisShield: async (c) => {
            const heals = Array.isArray(option().meta?.heals) ? option().meta.heals : [];
            const lines = [];
            for (const heal of heals) {
                const shieldGain = Math.floor(Number(heal.heal || 0) * 0.5);
                if (shieldGain <= 0) continue;
                const totalShield = await deps.addShieldValue(
                    c,
                    heal.targetId,
                    shieldGain,
                    skill().key,
                    reactor().id
                );
                lines.push(
                    `${heal.targetName || `#${heal.targetId}`} +${shieldGain} 護盾（目前 ${totalShield}）`
                );
            }
            if (lines.length) reactionState.charactersChanged = true;
            return {
                ok: true,
                content: lines.length ? lines.join('；') : '本次沒有可轉換的實際治療量'
            };
        },

        reactionDispelOne: async (c, { kind }) => {
            const targetId = Number(
                option().targetId ||
                (option().meta?.candidateIds || [])[0] ||
                0
            );
            if (!targetId) throw new Error('請選擇解除目標');
            const rows = await c.query(
                'SELECT buff_key FROM character_buffs WHERE character_id = $1',
                [targetId]
            );
            const catalog = deps.BUFF_CATALOG || {};
            const want = kind === 'buff' ? 'buff' : 'debuff';
            const key = rows.rows
                .map(row => row.buff_key)
                .find(k => catalog[k]?.kind === want);
            if (!key) {
                return {
                    ok: true,
                    content: `目標身上沒有可解除的${want === 'buff' ? '增益' : '減益'}`
                };
            }
            await c.query(
                'DELETE FROM character_buffs WHERE character_id = $1 AND buff_key = $2',
                [targetId, key]
            );
            reactionState.charactersChanged = true;
            return {
                ok: true,
                content: `解除了【${catalog[key]?.name || key}】`
            };
        },

        reactionAptitudeChoice: async (c) => {
            const choice = String(option().meta?.choiceKey || option().choiceKey || '');
            const map = {
                hit: mod('hit', 'flat', 10),
                dodge: mod('dodge', 'flat', 10),
                speed: mod('speed', 'flat', 5)
            };
            const grant = map[choice] || map.hit;
            await deps.applyBuffToCharacters(c, [reactor().id], grant, {
                sourceSkillKey: skill().key,
                sourceCharacterId: reactor().id,
                expiresRound: clock().round
            });
            reactionState.charactersChanged = true;
            const { formatModLabel } = require('./stat-mods');
            return {
                ok: true,
                content: `本輪獲得【${formatModLabel(grant.stat, grant.mode, grant.value)}】`
            };
        },

        reactionCritErosionChoice: async (c) => {
            const statusKey = String(
                option().meta?.choiceKey || option().choiceKey || 'burning'
            );
            await deps.applyBuffToCharacters(c, [reactor().id], 'crit_erosion_choice', {
                sourceSkillKey: skill().key,
                sourceCharacterId: reactor().id,
                sourceSnapshot: { statusKey }
            });
            reactionState.charactersChanged = true;
            return { ok: true, content: `選定異常：【${statusKey}】` };
        },

        reactionLegacyCopy: async (c) => {
            const allyId = Number(option().targetId || option().meta?.allyId || 0);
            const buffKey = String(option().meta?.choiceKey || option().choiceKey || '');
            if (!allyId || !buffKey) throw new Error('請選擇傳承的友方與增益');
            await deps.applyBuffToCharacters(c, [allyId], buffKey, {
                sourceSkillKey: skill().key,
                sourceCharacterId: reactor().id,
                expiresRound: clock().round
            });
            reactionState.charactersChanged = true;
            return { ok: true, content: `將【${buffKey}】賦予友方` };
        },

        reactionReviveOne: async (c) => {
            const targetId = Number(
                option().targetId || option().meta?.pickedTargetId || 0
            );
            if (!targetId) throw new Error('請選擇復甦目標');
            const row = await c.query(
                'SELECT name, hp, max_hp FROM characters WHERE id = $1 FOR UPDATE',
                [targetId]
            );
            const target = row.rows[0];
            if (!target) throw new Error('復甦目標不存在');
            if (Number(target.hp) > 0) {
                return { ok: true, content: `${target.name} 仍存活，無法復甦` };
            }
            await c.query(
                'UPDATE characters SET hp = 1 WHERE id = $1',
                [targetId]
            );
            reactionState.charactersChanged = true;
            return {
                ok: true,
                content: `${target.name} 恢復到 1 點 HP`,
                reactionText:
                    `${reactor().name} 發動「${skill().name}」→ ${target.name}：恢復到 1 點 HP。`
            };
        },

        applyBuffToCharacters: deps.applyBuffToCharacters,
        applyDebuffBundle: deps.applyDebuffBundle
    };
}

async function runReactionPipeline({
    client,
    reactor,
    skill,
    option,
    window,
    clock,
    resume,
    flags,
    nextOptions,
    deps
}) {
    if (!skillHasPipeline(skill)) {
        throw new Error(`反應戰技缺少 pipeline：${skill?.key}`);
    }

    const pickedTargetId = Number(
        option?.meta?.damagedTargetId ||
        option?.targetId ||
        option?.meta?.pickedTargetId ||
        option?.meta?.followUpTargetId ||
        option?.meta?.autoTargetId ||
        0
    );
    // Attack-window targetId is the attack victim, not the heal/reaction target.
    // Prefer the option-bound target; only fall back to window/resume when unset.
    const originalTargetId = Number(
        pickedTargetId ||
        resume?.targetId ||
        window.context?.targetId ||
        0
    );
    const actionTargetId = pickedTargetId || originalTargetId || Number(reactor.id);

    const reactionState = {
        flags: { ...flags },
        resume: { ...resume },
        window,
        option,
        clock,
        originalTargetId,
        charactersChanged: false,
        battlefieldChanged: false,
        costSkipped: false,
        reactor,
        skill,
        nextOptions: nextOptions || [],
        blockingReady: null
    };

    const host = attachSharedHostOps(
        buildReactionHost(client, deps || {}, reactionState),
        {
            client,
            deps: deps || {},
            onState: (patch) => {
                if (patch.charactersChanged) reactionState.charactersChanged = true;
                if (patch.battlefieldChanged) reactionState.battlefieldChanged = true;
            }
        }
    );

    const context = createActionContext({
        actorId: reactor.id,
        actorName: reactor.name,
        actorKind: reactor.kind || 'player',
        triggerCharacterId: reactor.id,
        targetId: actionTargetId,
        targetIds: [actionTargetId],
        targetName: option?.targetName || window.context?.targetName || reactor.name,
        skillKey: skill.key,
        skillName: skill.name,
        attack: skill.actionCode === 'ATTACK'
            ? require('./effects').attackDescriptor(skill)
            : null,
        round: clock?.round,
        turnPass: clock?.turnPass,
        isMainAction: false,
        isActiveSkill: false,
        isAuxiliary: true,
        flags: { costSpent: true, reactionMode: true },
        meta: {
            skill,
            skillKind: 'auxiliary',
            usePipeline: true,
            actorRow: reactor,
            reaction: reactionState,
            effects: []
        }
    });

    const frame = { context, status: 'running' };
    const { steps } = compilePipeline({ ...skill, skillKind: 'auxiliary' });

    const fragments = [];
    let fullReactionText = null;

    // Same modules as active casts — no aux-only skips.
    for (const step of steps) {
        if (step.kind !== 'module' || !step.module) continue;

        const params = { ...(step.params || {}), spendCost: false };
        // Target already chosen at respond time; stamp without re-opening declare window.
        if (step.module === 'resolve_targets') {
            params.emitDeclare = false;
        }

        const result = await runModule(step.module, client, {
            frame,
            step: { ...step, params },
            params,
            host,
            skill,
            deps
        });

        if (result?.content) {
            fragments.push(result.content);
            appendResultMessage(context, result.content);
        }
        if (result?.reactionText) {
            fullReactionText = result.reactionText;
        }
        for (const opResult of result?.opResults || []) {
            if (opResult?.reactionText) {
                fullReactionText = opResult.reactionText;
            } else if (opResult?.content) {
                fragments.push(opResult.content);
            }
        }
        if (result?.attackResult?.reactionText) {
            fullReactionText = result.attackResult.reactionText;
        }
    }

    reactionState.flags = materializeFlagPlaceholders(
        reactionState.flags,
        reactor.id
    );

    const detail = fragments.filter(Boolean).join('，');
    const reactionText = fullReactionText || (detail
        ? `${reactor.name} 發動「${skill.name}」：${detail}。`
        : `${reactor.name} 發動「${skill.name}」。`);

    const timing = normalizeTimingCode(window.triggerType) || window.triggerType;
    const defaultBlocking = Boolean(
        window.blocking ||
        timing === TIMING.ON_TARGET_DECLARED ||
        window.triggerType === 'attack_declared'
    );

    return {
        reactionText,
        charactersChanged: reactionState.charactersChanged,
        battlefieldChanged: reactionState.battlefieldChanged,
        flags: reactionState.flags,
        resume: reactionState.resume,
        nextOptions: reactionState.nextOptions || nextOptions,
        blockingReady: reactionState.blockingReady != null
            ? Boolean(reactionState.blockingReady)
            : defaultBlocking
    };
}

async function applyReactionEffect(args) {
    const skill = ensureReactionPipeline(args.skill);
    if (!skillPipelineHasWork(skill)) {
        throw new Error('反應戰技缺少 pipeline 效果：' + (skill?.key || '(unknown)'));
    }
    return runReactionPipeline({ ...args, skill });
}

module.exports = {
    applyReactionEffect,
    runReactionPipeline,
    ensureReactionPipeline,
    skillPipelineHasWork,
    activateOnUse
};
