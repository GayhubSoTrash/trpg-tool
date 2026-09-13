'use strict';

/**
 * Pick catalog — unique implementation table keyed by reaction.pick.kind.
 * Not keyed by skill key/name. Host (DB queries, buff catalog) is injected.
 *
 * Catalog entry signature:
 *   async (ctx) => void | Partial<option>
 * where ctx = {
 *   client, option, next, sourceTargetId, sourceActorId, attackSkill,
 *   helpers: { getAdjacentEmptyCells, resolveAttackTargetIds, ALL_EQUIPPABLE_SKILLS, BUFF_CATALOG }
 * }
 */

async function pickAdjacentEmpty(ctx) {
    const { client, option, next, sourceTargetId, helpers } = ctx;
    const allyId = Number(option.meta?.originalTargetId || sourceTargetId || 0);
    const cells = allyId ? await helpers.getAdjacentEmptyCells(client, allyId) : [];
    next.pickChoices = cells.map(cell => ({
        id: cell.cellId,
        label: `(${cell.row}, ${cell.col})`,
        meta: { pickedCellId: cell.cellId }
    }));
    next.skipPickIfEmpty = true;
    next.autoMetaIfEmpty = { pickedCellId: 0 };
}

async function pickAnyEmptyCell(ctx) {
    const { client, next } = ctx;
    const cells = await client.query(`
        SELECT id, row_index, col_index
        FROM cells
        WHERE occupied_by IS NULL
        ORDER BY row_index, col_index
    `);
    next.pickChoices = cells.rows.map(row => ({
        id: Number(row.id),
        label: `(${row.row_index}, ${row.col_index})`,
        meta: { pickedCellId: Number(row.id) }
    }));
}

async function pickEnemyTarget(ctx) {
    const { client, option, next } = ctx;
    const reactor = (await client.query(
        'SELECT kind FROM characters WHERE id = $1',
        [option.actorId]
    )).rows[0];
    const enemies = await client.query(`
        SELECT id, name, hp
        FROM characters
        WHERE kind <> $1
          AND hp > 0
        ORDER BY id
    `, [reactor?.kind || 'player']);
    next.pickChoices = enemies.rows.map(row => ({
        id: Number(row.id),
        label: row.name,
        meta: {
            pickedTargetId: Number(row.id),
            targetId: Number(row.id)
        }
    }));
}

async function pickAllyTarget(ctx) {
    const { client, option, next } = ctx;
    const reactor = (await client.query(
        'SELECT kind FROM characters WHERE id = $1',
        [option.actorId]
    )).rows[0];
    const allies = await client.query(`
        SELECT id, name, hp
        FROM characters
        WHERE kind = $1
          AND hp > 0
        ORDER BY id
    `, [reactor?.kind || 'player']);
    next.pickChoices = allies.rows.map(row => ({
        id: Number(row.id),
        label: row.name,
        meta: {
            pickedTargetId: Number(row.id),
            targetId: Number(row.id)
        }
    }));
}

async function pickAllyOther(ctx) {
    const { client, option, next } = ctx;
    const reactor = (await client.query(
        'SELECT kind FROM characters WHERE id = $1',
        [option.actorId]
    )).rows[0];
    const allies = await client.query(`
        SELECT id, name, hp
        FROM characters
        WHERE kind = $1
          AND hp > 0
          AND id <> $2
        ORDER BY id
    `, [reactor?.kind || 'player', option.actorId]);
    next.pickChoices = allies.rows.map(row => ({
        id: Number(row.id),
        label: row.name,
        meta: {
            pickedTargetId: Number(row.id),
            targetId: Number(row.id)
        }
    }));
}

async function pickDownedAlly(ctx) {
    const { client, option, next } = ctx;
    const reactor = (await client.query(
        'SELECT kind FROM characters WHERE id = $1',
        [option.actorId]
    )).rows[0];
    const allies = await client.query(`
        SELECT id, name, hp
        FROM characters
        WHERE kind = $1
          AND hp <= 0
        ORDER BY id
    `, [reactor?.kind || 'player']);
    next.pickChoices = allies.rows.map(row => ({
        id: Number(row.id),
        label: row.name,
        meta: {
            pickedTargetId: Number(row.id),
            targetId: Number(row.id)
        }
    }));
}

async function pickAnyCharacter(ctx) {
    const { client, next } = ctx;
    const rows = await client.query(`
        SELECT id, name, hp
        FROM characters
        WHERE hp > 0
        ORDER BY id
    `);
    next.pickChoices = rows.rows.map(row => ({
        id: Number(row.id),
        label: row.name,
        meta: {
            pickedTargetId: Number(row.id),
            targetId: Number(row.id)
        }
    }));
}

async function pickEnemyRow(ctx) {
    const { client, option, next } = ctx;
    const reactor = (await client.query(
        'SELECT kind FROM characters WHERE id = $1',
        [option.actorId]
    )).rows[0];
    const rows = await client.query(`
        SELECT DISTINCT c.group_id, c.row_index
        FROM characters ch
        JOIN cells c ON c.occupied_by = ch.id
        WHERE ch.kind <> $1
          AND ch.hp > 0
        ORDER BY c.group_id, c.row_index
    `, [reactor?.kind || 'player']);
    next.pickChoices = rows.rows.map(row => ({
        id: `${row.group_id}:${row.row_index}`,
        label: `第 ${Number(row.row_index) + 1} 排`,
        meta: {
            pickedGroupId: Number(row.group_id),
            pickedRowIndex: Number(row.row_index)
        }
    }));
}

async function pickRedirectLegalTarget(ctx) {
    const {
        client, option, next, sourceTargetId, sourceActorId, attackSkill, helpers
    } = ctx;
    const attackerId = Number(
        option.meta?.originalActorId || sourceActorId || 0
    );
    const currentTargetId = Number(
        option.meta?.originalTargetId || sourceTargetId || 0
    );
    let candidates = [];
    if (attackerId) {
        const attacker = (await client.query(
            'SELECT * FROM characters WHERE id = $1',
            [attackerId]
        )).rows[0];
        const skill = attackSkill ||
            helpers.ALL_EQUIPPABLE_SKILLS.get(option.meta?.sourceSkillKey) ||
            { targetCode: 'ENEMY', actionCode: 'ATTACK', effect: '' };
        if (attacker) {
            const ids = await helpers.resolveAttackTargetIds(
                client,
                attacker,
                attacker,
                skill,
                null
            );
            candidates = ids.filter(id => Number(id) !== currentTargetId);
        }
    }
    const rows = candidates.length
        ? (await client.query(
            'SELECT id, name FROM characters WHERE id = ANY($1::int[])',
            [candidates]
        )).rows
        : [];
    next.pickChoices = rows.map(row => ({
        id: Number(row.id),
        label: row.name,
        meta: { redirectTargetId: Number(row.id), targetId: Number(row.id) }
    }));
}

async function pickSpAmount(ctx) {
    const { client, option, next } = ctx;
    const sp = Number(
        (await client.query(
            'SELECT sp FROM characters WHERE id = $1',
            [option.actorId]
        )).rows[0]?.sp || 0
    );
    next.pickChoices = Array.from(
        { length: Math.max(0, Math.floor(sp)) },
        (_, i) => ({
            id: i + 1,
            label: `消耗${i + 1} SP（格擋+${(i + 1) * 10}%）`,
            meta: { spSpend: i + 1, baseCostSpent: 1 }
        })
    );
}

async function pickAptitudeChoice(ctx) {
    ctx.next.pickChoices = [
        { id: 'hit', label: '命中 +10', meta: { choiceKey: 'hit' } },
        { id: 'dodge', label: '迴避 +10', meta: { choiceKey: 'dodge' } },
        { id: 'speed', label: '行動速度 +5', meta: { choiceKey: 'speed' } }
    ];
}

async function pickAbnormalChoice(ctx) {
    const catalog = ctx.helpers.BUFF_CATALOG || {};
    ctx.next.pickChoices = [
        'burning', 'poison', 'frozen', 'stun', 'bleeding', 'darkness'
    ].map(key => ({
        id: key,
        label: catalog[key]?.name || key,
        meta: { choiceKey: key }
    }));
}

async function pickLegacyBuff(ctx) {
    const { client, option, next, helpers } = ctx;
    const catalog = helpers.BUFF_CATALOG || {};
    const snap = await client.query(
        `SELECT once_flags FROM battle_state WHERE id = 1`
    );
    const flags = snap.rows[0]?.once_flags || {};
    const prior = flags.roundEndBuffs?.[String(option.actorId)] || [];
    next.pickChoices = prior.map(item => ({
        id: item.buffKey,
        label: catalog[item.buffKey]?.name || item.buffKey,
        meta: { choiceKey: item.buffKey }
    }));
    next.needsSecondaryPick = 'ally_other';
}

const PICK_CATALOG = Object.freeze({
    adjacent_empty: pickAdjacentEmpty,
    any_empty_cell: pickAnyEmptyCell,
    enemy_target: pickEnemyTarget,
    ally_target: pickAllyTarget,
    ally_other: pickAllyOther,
    downed_ally: pickDownedAlly,
    any_character: pickAnyCharacter,
    enemy_row: pickEnemyRow,
    redirect_legal_target: pickRedirectLegalTarget,
    sp_amount: pickSpAmount,
    aptitude_choice: pickAptitudeChoice,
    abnormal_choice: pickAbnormalChoice,
    legacy_buff: pickLegacyBuff
});

/**
 * Resolve pick.kind (or legacy needsPick) onto option.next fields.
 * @returns {string|null} resolved kind
 */
function resolvePickKind(option, reactionDef = null) {
    return (
        option?.pick?.kind ||
        option?.needsPick ||
        option?.meta?.needsPick ||
        reactionDef?.pick?.kind ||
        reactionDef?.needsPick ||
        null
    );
}

async function applyPickCatalog(kind, ctx) {
    if (!kind) return null;
    const handler = PICK_CATALOG[kind];
    if (!handler) {
        throw new Error(`未知的 pick.kind：${kind}`);
    }
    await handler(ctx);
    return kind;
}

module.exports = {
    PICK_CATALOG,
    resolvePickKind,
    applyPickCatalog
};
