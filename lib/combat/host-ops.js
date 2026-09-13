'use strict';

/**
 * Shared pipeline host helpers used by both active casts and reaction pipelines.
 */

const { applyApSpGain } = require('./resources');
const { primaryTargetId } = require('./context');

function resolveOnIds(on, context) {
    const key = String(on || 'actor').toLowerCase();
    if (key === 'actor' || key === 'self') {
        return [Number(context.actorId)].filter(Boolean);
    }
    if (key === 'target') {
        return [Number(primaryTargetId(context) || context.targetId || 0)].filter(Boolean);
    }
    if (key === 'targets') {
        return (context.targetIds || []).map(Number).filter(Boolean);
    }
    return [Number(context.actorId)].filter(Boolean);
}

function attachSharedHostOps(baseHost, { client, deps = {}, onState } = {}) {
    const mark = (patch = {}) => {
        if (typeof onState === 'function') onState(patch);
    };

    return {
        ...baseHost,

        dispelAllStatuses: async (c, { kind = 'debuff', on = 'actor', context, skill }) => {
            const ids = resolveOnIds(on, context);
            const catalog = deps.BUFF_CATALOG || {};
            const want = kind === 'buff' ? 'buff' : 'debuff';
            const removed = [];
            for (const characterId of ids) {
                const rows = await c.query(
                    'SELECT buff_key FROM character_buffs WHERE character_id = $1',
                    [characterId]
                );
                for (const row of rows.rows) {
                    if (catalog[row.buff_key]?.kind !== want) continue;
                    await c.query(
                        'DELETE FROM character_buffs WHERE character_id = $1 AND buff_key = $2',
                        [characterId, row.buff_key]
                    );
                    removed.push(catalog[row.buff_key]?.name || row.buff_key);
                }
            }
            if (removed.length) mark({ charactersChanged: true });
            return {
                ok: true,
                content: removed.length
                    ? `解除了【${removed.join('】【')}】`
                    : `沒有可解除的${want === 'buff' ? '增益' : '減益'}`
            };
        },

        dispelOneStatus: async (c, { kind = 'debuff', context, option }) => {
            const targetId = Number(
                primaryTargetId(context) ||
                option?.targetId ||
                (option?.meta?.candidateIds || [])[0] ||
                0
            );
            if (!targetId) throw new Error('請選擇解除目標');
            const catalog = deps.BUFF_CATALOG || {};
            const want = kind === 'buff' ? 'buff' : 'debuff';
            const { getStatusDefinition } = require('./status-catalog');
            const rows = await c.query(
                'SELECT buff_key, value_num FROM character_buffs WHERE character_id = $1',
                [targetId]
            );
            const key = rows.rows
                .map(row => ({
                    key: row.buff_key,
                    valueNum: row.value_num
                }))
                .find(item => {
                    const def = getStatusDefinition(item.key, item.valueNum) ||
                        catalog[item.key];
                    return def?.kind === want;
                })
                ?.key;
            if (!key) {
                return {
                    ok: true,
                    content: `目標身上沒有可解除的${want === 'buff' ? '增益' : '減益'}`,
                    dispelled: false
                };
            }
            await c.query(
                'DELETE FROM character_buffs WHERE character_id = $1 AND buff_key = $2',
                [targetId, key]
            );
            mark({ charactersChanged: true });
            const removed = getStatusDefinition(
                key,
                rows.rows.find(row => row.buff_key === key)?.value_num
            );
            return {
                ok: true,
                content: `解除了【${removed?.name || catalog[key]?.name || key}】`,
                dispelled: true
            };
        },

        grantExtraTurn: async (_c, { on = 'actor', ap = 0, context }) => {
            const ids = resolveOnIds(on, context);
            const characterId = ids[0];
            if (!characterId) throw new Error('grant_extra_turn 缺少目標');
            context.flags = context.flags || {};
            context.flags.extraTurnCharacterId = Number(characterId);
            if (ap > 0 && typeof baseHost.reactionGainApSp === 'function') {
                await baseHost.reactionGainApSp(characterId, { ap });
            } else if (ap > 0) {
                await applyApSpGain(client || _c, characterId, {
                    ap,
                    manual: false,
                    getCharacterBuffEntries: deps.getCharacterBuffEntries,
                    removeBuffKeys: deps.removeBuffKeys
                });
                mark({ charactersChanged: true });
            }
            return {
                ok: true,
                content: ap > 0 ? `AP+${ap}，立即再進行一個回合` : '立即再進行一個回合'
            };
        },

        setNextAttackMods: async (_c, { charge = 0, cannotIntercept = false, context }) => {
            context.flags = context.flags || {};
            if (charge) context.flags.nextAttackCharge = Number(charge);
            if (cannotIntercept) context.flags.nextAttackCannotIntercept = true;
            const bits = [];
            if (charge) bits.push(`蓄力${charge}`);
            if (cannotIntercept) bits.push('無法攔截');
            return {
                ok: true,
                content: bits.length ? `下一次攻擊附加【${bits.join('】【')}】` : '已標記'
            };
        },

        delayTargetTurn: async (_c, { context }) => {
            const targetId = Number(primaryTargetId(context) || 0);
            if (!targetId) throw new Error('請指定要延後的目標');
            context.flags = context.flags || {};
            context.flags.delayTurnCharacterId = targetId;
            return { ok: true, content: '目標本序回合將延後至自身之後' };
        },

        swapInitiative: async (_c, { context, option }) => {
            const targetId = Number(primaryTargetId(context) || option?.targetId || 0);
            const direction = String(
                option?.meta?.direction ||
                context.flags?.initiativeSwap ||
                'after'
            );
            if (!targetId) throw new Error('請指定要調換行動序的角色');
            context.flags = context.flags || {};
            context.flags.swapInitiative = { targetId, direction };
            return {
                ok: true,
                content: direction === 'before'
                    ? '與前一位角色調換行動序'
                    : '與後一位角色調換行動序'
            };
        }
    };
}

module.exports = {
    attachSharedHostOps,
    resolveOnIds
};
