'use strict';

/**
 * AP / SP gain helper.
 * Non-manual gains respect「無限可能的呼喚」debt:
 * next automatic AP/SP recovery is reduced by 1 (per pool gained), then debt clears.
 */

async function applyApSpGain(client, characterId, {
    ap = 0,
    sp = 0,
    manual = false,
    getCharacterBuffEntries,
    removeBuffKeys
} = {}) {
    let apGain = Math.max(0, Math.floor(Number(ap) || 0));
    let spGain = Math.max(0, Math.floor(Number(sp) || 0));
    if (!apGain && !spGain) {
        return { apGain: 0, spGain: 0, debtApplied: false };
    }

    let debtApplied = false;
    if (!manual && typeof getCharacterBuffEntries === 'function') {
        const entries = await getCharacterBuffEntries(client, characterId);
        const hasDebt = entries.some(row => row.buff_key === 'infinite_call_debt');
        if (hasDebt) {
            if (apGain > 0) apGain = Math.max(0, apGain - 1);
            if (spGain > 0) spGain = Math.max(0, spGain - 1);
            debtApplied = true;
            if (typeof removeBuffKeys === 'function') {
                await removeBuffKeys(client, characterId, ['infinite_call_debt']);
            }
        }
    }

    if (apGain || spGain) {
        await client.query(`
            UPDATE characters
            SET ap = CASE WHEN $2::int > 0 THEN LEAST(max_ap, ap + $2) ELSE ap END,
                sp = CASE WHEN $3::int > 0 THEN LEAST(max_sp, sp + $3) ELSE sp END
            WHERE id = $1
        `, [characterId, apGain, spGain]);
    }

    return { apGain, spGain, debtApplied };
}

module.exports = {
    applyApSpGain
};
