'use strict';

/**
 * Charge (蓄力) helpers.
 * Declare → progress starts at 1 (counts as charge main-action, no skill-activation timings).
 * Each later turn auto-increments until progress >= required, then fire on that turn.
 */

function parseChargeRequired(skillOrEffect) {
    const text = typeof skillOrEffect === 'string'
        ? skillOrEffect
        : String(skillOrEffect?.effect || '');
    const match = text.match(/【蓄力\s*(\d+)】/);
    return match ? Math.max(1, Number(match[1])) : 0;
}

function isChargeSkill(skill) {
    return parseChargeRequired(skill) > 0;
}

/**
 * Begin charging: insert pending_actions + charging status.
 * progress starts at 1 (declare already counted).
 */
async function beginCharge(client, {
    actorId,
    targetId,
    skill,
    round,
    turnPass,
    payload = {}
}) {
    const required = parseChargeRequired(skill);
    if (!required) return null;

    await client.query(`
        INSERT INTO pending_actions (
            actor_id, target_id, skill_key,
            created_round, created_turn_pass,
            charge_required, charge_progress, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, 1, $7::jsonb)
        ON CONFLICT (actor_id, skill_key)
        DO UPDATE SET
            target_id = EXCLUDED.target_id,
            created_round = EXCLUDED.created_round,
            created_turn_pass = EXCLUDED.created_turn_pass,
            charge_required = EXCLUDED.charge_required,
            charge_progress = 1,
            payload = EXCLUDED.payload
    `, [
        actorId,
        targetId || actorId,
        skill.key,
        round,
        turnPass,
        required,
        JSON.stringify({
            ...payload,
            skillName: skill.name,
            effect: skill.effect
        })
    ]);

    return { required, progress: 1 };
}

async function getActiveCharges(client, actorId) {
    const result = await client.query(`
        SELECT *
        FROM pending_actions
        WHERE actor_id = $1
        ORDER BY id
        FOR UPDATE
    `, [actorId]);
    return result.rows;
}

/**
 * On turn start while charging:
 * - if progress < required → increment (auto「蓄力」main action)
 * - if progress >= required → ready to fire
 */
async function tickChargesForActor(client, actorId) {
    const rows = await getActiveCharges(client, actorId);
    const ready = [];
    const progressed = [];

    for (const row of rows) {
        const required = Math.max(1, Number(row.charge_required || 1));
        let progress = Math.max(0, Number(row.charge_progress || 0));

        if (progress < required) {
            progress += 1;
            await client.query(
                'UPDATE pending_actions SET charge_progress = $1 WHERE id = $2',
                [progress, row.id]
            );
            progressed.push({ ...row, charge_progress: progress, charge_required: required });
        }

        if (progress >= required) {
            ready.push({ ...row, charge_progress: progress, charge_required: required });
        }
    }

    return { ready, progressed };
}

async function clearCharge(client, pendingId) {
    await client.query('DELETE FROM pending_actions WHERE id = $1', [pendingId]);
}

async function clearAllChargesForActor(client, actorId) {
    await client.query('DELETE FROM pending_actions WHERE actor_id = $1', [actorId]);
}

module.exports = {
    parseChargeRequired,
    isChargeSkill,
    beginCharge,
    getActiveCharges,
    tickChargesForActor,
    clearCharge,
    clearAllChargesForActor
};
