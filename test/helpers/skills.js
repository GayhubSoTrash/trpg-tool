'use strict';

const SKILL_DATA = require('../../skill-data');

/** Every authored skill, flattened across initial / common / per-profession. */
function allSkills() {
    return [
        ...SKILL_DATA.initial,
        ...SKILL_DATA.common,
        ...Object.values(SKILL_DATA.professionSkills).flat()
    ];
}

/**
 * Minimal pg client stub: returns one locked character row for `FOR UPDATE`
 * selects and an empty result for everything else.
 */
function stubClient() {
    return {
        query: async (sql) => {
            if (/FOR UPDATE/i.test(sql)) {
                return { rows: [{ id: 42, ap: 1, sp: 2, max_ap: 5, max_sp: 5 }] };
            }
            return { rows: [], rowCount: 1 };
        }
    };
}

module.exports = { SKILL_DATA, allSkills, stubClient };
