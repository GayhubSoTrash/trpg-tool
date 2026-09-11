const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const { ensureSchema } = require('./schema');
const SKILL_DATA = require('./skill-data');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

const BUFF_CATALOG = {
    // 正向增益
    attack_order: {
        key: 'attack_order',
        name: '進攻指令',
        effect: '本輪內物理攻擊、魔法攻擊 +25%',
        icon: 'command_attack',
        kind: 'buff',
        manual: true,
        modifiers: { patkMult: 1.25, matkMult: 1.25 }
    },
    war_cry: {
        key: 'war_cry',
        name: '戰吼',
        effect: '本輪內造成傷害 +25%',
        icon: 'warcry',
        kind: 'buff',
        manual: true,
        modifiers: { damageMult: 1.25 }
    },
    defense_stance: {
        key: 'defense_stance',
        name: '防禦姿態',
        effect: '本輪內防禦 +25%',
        icon: 'shield',
        kind: 'buff',
        manual: true,
        modifiers: { defenseMult: 1.25 }
    },
    acceleration: {
        key: 'acceleration',
        name: '加速',
        effect: '本輪內命中 +20、迴避 +20、行動速度 +10（可疊加）',
        icon: 'acceleration',
        kind: 'buff',
        stackable: true,
        manual: false,
        modifiers: { hitFlat: 20, dodgeFlat: 20, speedFlat: 10 }
    },
    attack_stance: {
        key: 'attack_stance',
        name: '進攻架勢',
        effect: '本輪內物理攻擊 +25%',
        icon: 'stance_attack',
        kind: 'buff',
        manual: false,
        modifiers: { patkMult: 1.25 }
    },
    war_horn: {
        key: 'war_horn',
        name: '戰爭號角',
        effect: '本輪內攻擊附加【無法格擋】',
        icon: 'war_horn',
        kind: 'buff',
        manual: false,
        modifiers: { unblockable: true }
    },
    steadfast: {
        key: 'steadfast',
        name: '堅守',
        effect: '本輪內防禦 +25%、格擋率 +25%（可疊加）',
        icon: 'steadfast',
        kind: 'buff',
        stackable: true,
        manual: false,
        modifiers: { defenseMult: 1.25, blockFlat: 25 }
    },
    rage: {
        key: 'rage',
        name: '震怒',
        effect: '本輪內造成傷害 +25%、命中 +25（可疊加）',
        icon: 'rage',
        kind: 'buff',
        stackable: true,
        manual: false,
        modifiers: { damageMult: 1.25, hitFlat: 25 }
    },
    defensive_stance: {
        key: 'defensive_stance',
        name: '防守姿態',
        effect: '本輪內防禦 +25%',
        icon: 'shield',
        kind: 'buff',
        manual: false,
        modifiers: { defenseMult: 1.25 }
    },
    steel_curtain: {
        key: 'steel_curtain',
        name: '鋼鐵帷幕',
        effect: '本輪內格擋率 +50%',
        icon: 'steel_curtain',
        kind: 'buff',
        manual: false,
        modifiers: { blockFlat: 50 }
    },
    battleline_defense: {
        key: 'battleline_defense',
        name: '戰線保衛',
        effect: '本輪內防禦 +50%',
        icon: 'line_defense',
        kind: 'buff',
        manual: false,
        modifiers: { defenseMult: 1.5 }
    },
    life_shield: {
        key: 'life_shield',
        name: '護盾',
        effect: '受到傷害時優先扣除護盾；護盾消耗完前不視為受到傷害',
        icon: 'life_shield',
        kind: 'buff',
        manual: false,
        modifiers: {}
    },
    sharpness: {
        key: 'sharpness',
        name: '鋒銳',
        effect: '下一次攻擊命中時施加【流血】',
        icon: 'sharpness',
        kind: 'buff',
        manual: false,
        modifiers: { applyBleedOnHit: true }
    },
    mirage: {
        key: 'mirage',
        name: '幻影',
        effect: '下一次被攻擊命中時，迴避一段攻擊',
        icon: 'mirage',
        kind: 'buff',
        manual: false,
        modifiers: {}
    },
    defense_order: {
        key: 'defense_order',
        name: '防護指令',
        effect: '本輪內防禦、魔抗 +50%',
        icon: 'command_defense',
        kind: 'buff',
        manual: false,
        modifiers: { defenseMult: 1.5, resistMult: 1.5 }
    },
    sniper_order: {
        key: 'sniper_order',
        name: '狙擊指令',
        effect: '本輪內命中 +30',
        icon: 'crosshair',
        kind: 'buff',
        manual: false,
        modifiers: { hitFlat: 30 }
    },
    swift_order: {
        key: 'swift_order',
        name: '飛速指令',
        effect: '本輪內行動速度 +10',
        icon: 'wing',
        kind: 'buff',
        manual: false,
        modifiers: { speedFlat: 10 }
    },
    regeneration: {
        key: 'regeneration',
        name: '再生',
        effect: '每次發動主動戰技時，恢復施加者【0.75魔法】點 HP',
        icon: 'regen',
        kind: 'buff',
        manual: false,
        modifiers: {}
    },
    marching_order: {
        key: 'marching_order',
        name: '疾行',
        effect: '下一次進行「基礎移動」時消耗 -1',
        icon: 'boot',
        kind: 'buff',
        manual: false,
        modifiers: {}
    },
    auto_guard: {
        key: 'auto_guard',
        name: '自動格擋',
        effect: '受到物理攻擊時自動依格擋率進行格擋；魔法傷害不能格擋',
        icon: 'auto_guard',
        kind: 'buff',
        manual: false,
        modifiers: { autoGuard: true }
    },
    sanctuary: {
        key: 'sanctuary',
        name: '庇護',
        effect: '下一次受到的減益無效',
        icon: 'sanctuary',
        kind: 'buff',
        manual: false,
        modifiers: {}
    },
    quick_cast: {
        key: 'quick_cast',
        name: '快速詠唱',
        effect: '本輪內僅限一次，行動順序視為第一',
        icon: 'quick_cast',
        kind: 'buff',
        manual: false,
        modifiers: { initiativeFirst: true }
    },
    light_link_source: {
        key: 'light_link_source',
        name: '熠光連結・供給',
        effect: '本輪內魔法攻擊 -50%',
        icon: 'link_source',
        kind: 'debuff',
        manual: false,
        modifiers: { matkMult: 0.5 }
    },
    light_link_target: {
        key: 'light_link_target',
        name: '熠光連結・受能',
        effect: '獲得施術者因熠光連結失去的魔法攻擊',
        icon: 'link_target',
        kind: 'buff',
        manual: false,
        modifiers: { useValueAsMatkFlat: true }
    },
    wind_walk: {
        key: 'wind_walk',
        name: '隨風而行',
        effect: '本輪內行動速度 +10',
        icon: 'wind',
        kind: 'buff',
        manual: false,
        modifiers: { speedFlat: 10 }
    },
    empower: {
        key: 'empower',
        name: '賦能',
        effect: '下一次物理近戰攻擊每段附帶【0.5魔法】傷害',
        icon: 'empower',
        kind: 'buff',
        manual: false,
        modifiers: { empowerMagic: 0.5 }
    },
    barrier: {
        key: 'barrier',
        name: '障壁',
        effect: '下一次受到的傷害 -25%',
        icon: 'barrier',
        kind: 'buff',
        manual: false,
        modifiers: { damageTakenMult: 0.75, consumeOnDamage: true }
    },
    guard_ready: {
        key: 'guard_ready',
        name: '基礎格擋',
        effect: '下一次受到物理攻擊時依格擋率減傷；被格擋的物理攻擊不會暴擊',
        icon: 'guard_ready',
        kind: 'buff',
        manual: false,
        modifiers: { guardReady: true }
    },
    break_formation: {
        key: 'break_formation',
        name: '破陣',
        effect: '下一次攻擊無法被格擋；命中時施加【格擋封印】',
        icon: 'break_formation',
        kind: 'buff',
        manual: false,
        modifiers: { unblockable: true, applyBlockSealOnHit: true, consumeOnAttack: true }
    },

    // 使用者補充的特殊 / 異常狀態
    stun: {
        key: 'stun',
        name: '暈厥',
        effect: '【抗性】下一個回合跳過',
        icon: 'stun',
        kind: 'debuff',
        resistance: true,
        manual: false,
        modifiers: {}
    },
    feign_death: {
        key: 'feign_death',
        name: '假死',
        effect: '被擊倒時，於下一回合開始時恢復到 1 HP',
        icon: 'feign_death',
        kind: 'special',
        manual: false,
        modifiers: {}
    },
    bleeding: {
        key: 'bleeding',
        name: '流血',
        effect: '每次被攻擊命中時，額外損失施加者【0.5魔法】點 HP',
        icon: 'bleeding',
        kind: 'debuff',
        manual: false,
        modifiers: {}
    },
    darkness: {
        key: 'darkness',
        name: '黑暗',
        effect: '【抗性】下一段攻擊無法命中',
        icon: 'darkness',
        kind: 'debuff',
        resistance: true,
        manual: false,
        modifiers: {}
    },
    poison: {
        key: 'poison',
        name: '中毒',
        effect: '每次進行主要行動時，損失施加者【0.5魔法】點 HP',
        icon: 'poison',
        kind: 'debuff',
        manual: false,
        modifiers: {}
    },
    block_seal: {
        key: 'block_seal',
        name: '格擋封印',
        effect: '無法進行格擋',
        icon: 'block_seal',
        kind: 'debuff',
        manual: false,
        modifiers: { blockDisabled: true }
    },
    burning: {
        key: 'burning',
        name: '燃燒',
        effect: '每次進行輔助行動時，損失施加者【0.5魔法】點 HP',
        icon: 'burning',
        kind: 'debuff',
        manual: false,
        modifiers: {}
    },
    frozen: {
        key: 'frozen',
        name: '冰凍',
        effect: '【抗性】無法迴避、無法發動輔助戰技，直到下一個回合或受到傷害',
        icon: 'frozen',
        kind: 'debuff',
        resistance: true,
        manual: false,
        modifiers: {}
    },
    taunt: {
        key: 'taunt',
        name: '嘲諷',
        effect: '下一次主要行動必須盡可能攻擊施加者',
        icon: 'taunt',
        kind: 'debuff',
        manual: false,
        modifiers: {}
    },
    berserk: {
        key: 'berserk',
        name: '狂暴',
        effect: '【抗性】受到的下一次致死傷害改為 0 點',
        icon: 'berserk',
        kind: 'special',
        resistance: true,
        manual: false,
        modifiers: {}
    },
    duel: {
        key: 'duel',
        name: '死鬥',
        effect: '【抗性】HP 不會低於 1 點',
        icon: 'duel',
        kind: 'special',
        resistance: true,
        manual: false,
        modifiers: {}
    },

    // 明確的數值增減益，也要顯示為 Buff / Debuff 圖標
    defense_down_25: {
        key: 'defense_down_25',
        name: '防禦降低',
        effect: '本輪內防禦 -25%',
        icon: 'defense_down',
        kind: 'debuff',
        manual: false,
        modifiers: { defenseMult: 0.75 }
    },
    dodge_down_20: {
        key: 'dodge_down_20',
        name: '迴避降低',
        effect: '本輪內迴避 -20',
        icon: 'dodge_down',
        kind: 'debuff',
        manual: false,
        modifiers: { dodgeFlat: -20 }
    },
    dodge_up_20: {
        key: 'dodge_up_20',
        name: '迴避提升',
        effect: '本輪內迴避 +20',
        icon: 'dodge_up',
        kind: 'buff',
        manual: false,
        modifiers: { dodgeFlat: 20 }
    },
    dodge_up_30: {
        key: 'dodge_up_30',
        name: '迴避提升',
        effect: '本輪內迴避 +30',
        icon: 'dodge_up',
        kind: 'buff',
        manual: false,
        modifiers: { dodgeFlat: 30 }
    },
    dodge_down_50: {
        key: 'dodge_down_50',
        name: '迴避降低',
        effect: '本輪內迴避 -50',
        icon: 'dodge_down',
        kind: 'debuff',
        manual: false,
        modifiers: { dodgeFlat: -50 }
    },
    dodge_down_50pct: {
        key: 'dodge_down_50pct',
        name: '迴避降低',
        effect: '本輪內迴避 -50%',
        icon: 'dodge_down',
        kind: 'debuff',
        manual: false,
        modifiers: { dodgeMult: 0.5 }
    },
    speed_down_10: {
        key: 'speed_down_10',
        name: '行動速度降低',
        effect: '本輪內行動速度 -10',
        icon: 'speed_down',
        kind: 'debuff',
        manual: false,
        modifiers: { speedFlat: -10 }
    },
    patk_down_25: {
        key: 'patk_down_25',
        name: '物理攻擊降低',
        effect: '本輪內物理攻擊 -25%',
        icon: 'attack_down',
        kind: 'debuff',
        manual: false,
        modifiers: { patkMult: 0.75 }
    },
    matk_down_25: {
        key: 'matk_down_25',
        name: '魔法攻擊降低',
        effect: '本輪內魔法攻擊 -25%',
        icon: 'attack_down',
        kind: 'debuff',
        manual: false,
        modifiers: { matkMult: 0.75 }
    },
    attack_down_25: {
        key: 'attack_down_25',
        name: '攻擊降低',
        effect: '本輪內物理攻擊、魔法攻擊 -25%',
        icon: 'attack_down',
        kind: 'debuff',
        manual: false,
        modifiers: { patkMult: 0.75, matkMult: 0.75 }
    },
    damage_taken_up_25: {
        key: 'damage_taken_up_25',
        name: '易傷',
        effect: '下一次受到的傷害 +25%',
        icon: 'vulnerable',
        kind: 'debuff',
        manual: false,
        modifiers: { damageTakenMult: 1.25, consumeOnDamage: true }
    }
};

const SKILL_CATALOG = {
    basic_attack: {
        key: 'basic_attack', name: '基礎攻擊', source: '初始戰技', category: 'initial', level: 1,
        timing: '主動', cost: '1AP', weapon: '所有', effect: '【1.0物理】指定一名敵方進行近戰攻擊',
        actionCode: 'ATTACK', targetCode: 'ENEMY', logicCode: 'BASIC_ATTACK', manual: true, needsRoll: true
    },
    rescue: {
        key: 'rescue', name: '救援', source: '初始戰技', category: 'initial', level: 1,
        timing: '主動', cost: '1AP', weapon: '所有', effect: '【蓄力1】指定一名被擊倒的友方，使其恢復到1點HP',
        actionCode: 'HEAL', targetCode: 'ALLY_DOWN', logicCode: 'RESCUE', manual: true, needsRoll: false
    },
    basic_guard: {
        key: 'basic_guard', name: '基礎格擋', source: '初始戰技', category: 'initial', level: 1,
        timing: '自身被攻擊指定時', cost: '1SP', weapon: '所有', effect: '對本次攻擊進行格擋',
        actionCode: 'GUARD', targetCode: 'SELF', logicCode: 'BASIC_GUARD', manual: true, needsRoll: false
    },
    basic_move: {
        key: 'basic_move', name: '基礎移動', source: '初始戰技', category: 'initial', level: 1,
        timing: '主動/自身進行主要行動前', cost: '1AP/1SP', weapon: '所有', effect: '移動至任意一個未被佔據的格子',
        actionCode: 'MOVE', targetCode: 'SELF', logicCode: 'MOVE_DECLARE', manual: true, needsRoll: false
    },
    wait: {
        key: 'wait', name: '待機', source: '基本動作', category: 'basic', level: 1,
        timing: '主動', cost: '無', weapon: '所有', effect: '放棄本次主要動作並待機',
        actionCode: 'UTILITY', targetCode: 'SELF', logicCode: 'WAIT', manual: true, needsRoll: false
    }
};

const ALL_EQUIPPABLE_SKILLS = new Map();
for (const profession of SKILL_DATA.professions) {
    for (const skill of SKILL_DATA.professionSkills[profession] || []) {
        ALL_EQUIPPABLE_SKILLS.set(skill.key, skill);
    }
}
for (const skill of SKILL_DATA.common) {
    ALL_EQUIPPABLE_SKILLS.set(skill.key, skill);
}

function safeProfession(value) {
    return SKILL_DATA.professions.includes(value) ? value : '';
}

function skillAllowedForProfession(skill, profession) {
    if (!skill) return false;
    return skill.category === 'common' ||
        (skill.category === 'profession' && skill.source === profession);
}


fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function safeKind(value) {
    return value === 'enemy' ? 'enemy' : 'player';
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeBuffEntries(source) {
    if (!source) return [];

    if (source instanceof Set) {
        return [...source].map(key => ({
            key,
            stackCount: 1,
            valueNum: null
        }));
    }

    if (Array.isArray(source)) {
        return source.map(item => {
            if (typeof item === 'string') {
                return { key: item, stackCount: 1, valueNum: null };
            }

            return {
                key: item.key || item.buff_key,
                stackCount: Math.max(1, Number(item.stackCount ?? item.stack_count ?? 1)),
                valueNum:
                    item.valueNum === null || item.valueNum === undefined
                        ? (
                            item.value_num === null || item.value_num === undefined
                                ? null
                                : Number(item.value_num)
                        )
                        : Number(item.valueNum)
            };
        });
    }

    return [];
}

function buffModifiers(source) {
    const pct = {
        patk: 0,
        matk: 0,
        defense: 0,
        resist: 0,
        damage: 0,
        damageTaken: 0,
        dodge: 0
    };

    const mods = {
        patkMult: 1,
        matkMult: 1,
        defenseMult: 1,
        resistMult: 1,
        damageMult: 1,
        damageTakenMult: 1,

        hitFlat: 0,
        dodgeFlat: 0,
        critFlat: 0,
        speedFlat: 0,
        blockFlat: 0,
        matkFlat: 0,

        autoGuard: false,
        guardReady: false,
        blockDisabled: false,
        unblockable: false,
        initiativeFirst: false,
        empowerMagic: 0,
        applyBleedOnHit: false,
        applyBlockSealOnHit: false,
        consumeOnAttackKeys: [],
        consumeOnDamageKeys: []
    };

    for (const entry of normalizeBuffEntries(source)) {
        const buff = BUFF_CATALOG[entry.key];
        if (!buff) continue;

        const count = Math.max(1, Number(entry.stackCount || 1));
        const m = buff.modifiers || {};

        // 同類百分比 Buff 以「+25% +25% = +50%」累加，
        // 對應規則中的「1 + 所有增減量」，避免可疊加 Buff 被複利放大。
        if (m.patkMult) pct.patk += (Number(m.patkMult) - 1) * count;
        if (m.matkMult) pct.matk += (Number(m.matkMult) - 1) * count;
        if (m.defenseMult) pct.defense += (Number(m.defenseMult) - 1) * count;
        if (m.resistMult) pct.resist += (Number(m.resistMult) - 1) * count;
        if (m.damageMult) pct.damage += (Number(m.damageMult) - 1) * count;
        if (m.damageTakenMult) pct.damageTaken += (Number(m.damageTakenMult) - 1) * count;
        if (m.dodgeMult) pct.dodge += (Number(m.dodgeMult) - 1) * count;

        mods.hitFlat += Number(m.hitFlat || 0) * count;
        mods.dodgeFlat += Number(m.dodgeFlat || 0) * count;
        mods.critFlat += Number(m.critFlat || 0) * count;
        mods.speedFlat += Number(m.speedFlat || 0) * count;
        mods.blockFlat += Number(m.blockFlat || 0) * count;

        if (m.useValueAsMatkFlat && entry.valueNum !== null) {
            mods.matkFlat += Number(entry.valueNum);
        }

        if (m.autoGuard) mods.autoGuard = true;
        if (m.guardReady) mods.guardReady = true;
        if (m.blockDisabled) mods.blockDisabled = true;
        if (m.unblockable) mods.unblockable = true;
        if (m.initiativeFirst) mods.initiativeFirst = true;
        if (m.empowerMagic) {
            mods.empowerMagic = Math.max(
                mods.empowerMagic,
                Number(m.empowerMagic)
            );
        }
        if (m.applyBleedOnHit) mods.applyBleedOnHit = true;
        if (m.applyBlockSealOnHit) mods.applyBlockSealOnHit = true;

        if (m.consumeOnAttack) mods.consumeOnAttackKeys.push(entry.key);
        if (m.consumeOnDamage) mods.consumeOnDamageKeys.push(entry.key);
    }

    mods.patkMult = Math.max(0, 1 + pct.patk);
    mods.matkMult = Math.max(0, 1 + pct.matk);
    mods.defenseMult = Math.max(0, 1 + pct.defense);
    mods.resistMult = Math.max(0, 1 + pct.resist);
    mods.damageMult = Math.max(0, 1 + pct.damage);
    mods.damageTakenMult = Math.max(0, 1 + pct.damageTaken);
    mods.dodgeMult = Math.max(0, 1 + pct.dodge);

    return mods;
}

function buffKeysFromMappedBuffs(buffs) {
    return new Set((buffs || []).map(buff => buff.key));
}

function effectiveStatsFromBuffs(row, buffs) {
    const mods = buffModifiers(buffs);
    return {
        patk: Math.floor(Number(row.patk) * mods.patkMult),
        matk: Math.floor(Number(row.matk) * mods.matkMult + mods.matkFlat),
        defense: Math.floor(Number(row.defense) * mods.defenseMult),
        resist: Math.floor(Number(row.resist) * mods.resistMult),
        hitRate: Math.floor(Number(row.hit_rate) + mods.hitFlat),
        dodge: Math.floor(Number(row.dodge) * mods.dodgeMult + mods.dodgeFlat),
        crit: Math.floor(Number(row.crit) + mods.critFlat),
        critDamageBonus: Number(row.crit_damage_bonus || 0),
        speed: Math.floor(Number(row.speed) + mods.speedFlat),
        blockRate: clamp(Number(row.block_rate || 0) + mods.blockFlat, 0, 75),
        damageMult: mods.damageMult,
        damageTakenMult: mods.damageTakenMult,
        canAutoGuard: mods.autoGuard,
        guardReady: mods.guardReady,
        blockDisabled: mods.blockDisabled,
        initiativeFirst: mods.initiativeFirst
    };
}

async function applyBuffToCharacters(client, characterIds, buffKey, {
    sourceSkillKey = null,
    sourceCharacterId = null,
    expiresRound = null,
    valueNum = null
} = {}) {
    const definition = BUFF_CATALOG[buffKey];
    if (!definition) return 0;

    const uniqueIds = [...new Set((characterIds || []).map(Number).filter(Boolean))];
    if (!uniqueIds.length) return 0;

    await client.query(`
        INSERT INTO character_buffs (
            character_id, buff_key, source_skill_key,
            source_character_id, expires_round,
            stack_count, value_num
        )
        SELECT
            unnest($1::int[]),
            $2, $3, $4, $5,
            1, $6
        ON CONFLICT (character_id, buff_key)
        DO UPDATE SET
            source_skill_key = EXCLUDED.source_skill_key,
            source_character_id = EXCLUDED.source_character_id,
            expires_round = EXCLUDED.expires_round,
            stack_count = CASE
                WHEN $7::boolean THEN character_buffs.stack_count + 1
                ELSE 1
            END,
            value_num = EXCLUDED.value_num,
            created_at = NOW()
    `, [
        uniqueIds,
        buffKey,
        sourceSkillKey,
        sourceCharacterId,
        expiresRound,
        valueNum,
        definition.stackable === true
    ]);

    return uniqueIds.length;
}

async function removeBuffKeys(client, characterId, buffKeys) {
    const keys = [...new Set((buffKeys || []).filter(Boolean))];
    if (!keys.length) return;

    await client.query(`
        DELETE FROM character_buffs
        WHERE character_id = $1
          AND buff_key = ANY($2::text[])
    `, [characterId, keys]);
}

async function sameRowCharacterIds(client, anchorCharacterId, {
    kind = null,
    includeAnchor = true
} = {}) {
    const anchor = await client.query(`
        SELECT c.group_id, c.row_index
        FROM cells c
        WHERE c.occupied_by = $1
        LIMIT 1
    `, [anchorCharacterId]);

    if (!anchor.rows.length) return includeAnchor ? [anchorCharacterId] : [];

    const params = [
        anchor.rows[0].group_id,
        anchor.rows[0].row_index
    ];

    let kindClause = '';
    if (kind) {
        params.push(kind);
        kindClause = `AND ch.kind = $${params.length}`;
    }

    const result = await client.query(`
        SELECT ch.id
        FROM cells c
        JOIN characters ch ON ch.id = c.occupied_by
        WHERE c.group_id = $1
          AND c.row_index = $2
          ${kindClause}
        ORDER BY c.col_index, ch.id
    `, params);

    const ids = result.rows.map(row => Number(row.id));
    return includeAnchor
        ? ids
        : ids.filter(id => id !== Number(anchorCharacterId));
}


async function getCharacterPosition(client, characterId) {
    const result = await client.query(`
        SELECT
            c.id AS cell_id,
            c.group_id,
            c.row_index,
            c.col_index,
            g.rows,
            g.cols,
            g.world_x,
            g.world_y,
            g.cell_size
        FROM cells c
        JOIN grid_groups g ON g.id = c.group_id
        WHERE c.occupied_by = $1
        LIMIT 1
    `, [characterId]);

    if (!result.rows.length) return null;

    const row = result.rows[0];
    return {
        cellId: Number(row.cell_id),
        groupId: Number(row.group_id),
        row: Number(row.row_index),
        col: Number(row.col_index),
        rows: Number(row.rows),
        cols: Number(row.cols),
        worldX: Number(row.world_x),
        worldY: Number(row.world_y),
        cellSize: Number(row.cell_size),
        centerX: Number(row.world_x) + (Number(row.col_index) + 0.5) * Number(row.cell_size),
        centerY: Number(row.world_y) + (Number(row.row_index) + 0.5) * Number(row.cell_size)
    };
}


async function swapCharacterPositions(client, firstCharacterId, secondCharacterId) {
    if (Number(firstCharacterId) === Number(secondCharacterId)) {
        throw new Error('必須選擇另一名角色才能交換位置');
    }

    const result = await client.query(`
        SELECT id, occupied_by
        FROM cells
        WHERE occupied_by = ANY($1::int[])
        ORDER BY id
        FOR UPDATE
    `, [[Number(firstCharacterId), Number(secondCharacterId)]]);

    const firstCell = result.rows.find(
        row => Number(row.occupied_by) === Number(firstCharacterId)
    );
    const secondCell = result.rows.find(
        row => Number(row.occupied_by) === Number(secondCharacterId)
    );

    if (!firstCell || !secondCell) {
        throw new Error('交換位置需要雙方都已經放置在戰場格內');
    }

    await client.query(
        'UPDATE cells SET occupied_by = NULL WHERE id = ANY($1::int[])',
        [[Number(firstCell.id), Number(secondCell.id)]]
    );

    await client.query(
        `UPDATE cells
         SET occupied_by = CASE
             WHEN id = $1 THEN $2
             WHEN id = $3 THEN $4
         END
         WHERE id IN ($1, $3)`,
        [
            Number(firstCell.id), Number(secondCharacterId),
            Number(secondCell.id), Number(firstCharacterId)
        ]
    );

    return {
        firstCellId: Number(firstCell.id),
        secondCellId: Number(secondCell.id)
    };
}

async function characterIdsAtCells(client, groupId, whereSql, params = []) {
    const result = await client.query(`
        SELECT ch.id
        FROM cells c
        JOIN characters ch ON ch.id = c.occupied_by
        WHERE c.group_id = $1
          ${whereSql}
        ORDER BY c.row_index, c.col_index, ch.id
    `, [groupId, ...params]);

    return result.rows.map(row => Number(row.id));
}

async function resolveAttackTargetIds(client, actor, target, skill, requestedDirection = null) {
    const shape = skill.targetShape || '';
    const enemyKind = target.kind || (actor.kind === 'enemy' ? 'player' : 'enemy');

    if (shape === 'ALL_ENEMIES' || skill.targetCode === 'ALL_ENEMIES') {
        const result = await client.query(
            'SELECT id FROM characters WHERE kind <> $1 AND hp > 0 ORDER BY id',
            [actor.kind || 'player']
        );
        return result.rows.map(row => Number(row.id));
    }

    const targetPos = await getCharacterPosition(client, target.id);
    const actorPos = await getCharacterPosition(client, actor.id);

    if (!targetPos) return [Number(target.id)];

    if (shape === 'ROW' || skill.targetCode === 'ENEMY_ROW') {
        const result = await client.query(`
            SELECT ch.id
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.row_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY c.col_index, ch.id
        `, [targetPos.groupId, targetPos.row, enemyKind]);
        return result.rows.map(row => Number(row.id));
    }

    if (shape === 'ROW_ADJACENT_2') {
        const result = await client.query(`
            SELECT ch.id, c.col_index
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.row_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY ABS(c.col_index - $4), c.col_index, ch.id
        `, [targetPos.groupId, targetPos.row, enemyKind, targetPos.col]);

        const rows = result.rows;
        const anchorIndex = rows.findIndex(row => Number(row.id) === Number(target.id));
        if (anchorIndex < 0) return [Number(target.id)];

        const anchorCol = Number(rows[anchorIndex].col_index);
        const adjacent = rows
            .filter(row => Number(row.id) !== Number(target.id))
            .filter(row => Math.abs(Number(row.col_index) - anchorCol) === 1)
            .sort((a, b) =>
                Math.abs(Number(a.col_index) - anchorCol) -
                Math.abs(Number(b.col_index) - anchorCol)
            )[0];

        return adjacent
            ? [Number(target.id), Number(adjacent.id)]
            : [Number(target.id)];
    }

    if (shape === 'COLUMN_ADJACENT_2') {
        const result = await client.query(`
            SELECT ch.id, c.row_index
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.col_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY ABS(c.row_index - $4), c.row_index, ch.id
        `, [targetPos.groupId, targetPos.col, enemyKind, targetPos.row]);

        const rows = result.rows;
        const adjacent = rows
            .filter(row => Number(row.id) !== Number(target.id))
            .filter(row => Math.abs(Number(row.row_index) - targetPos.row) === 1)[0];

        return adjacent
            ? [Number(target.id), Number(adjacent.id)]
            : [Number(target.id)];
    }

    if (shape === 'FORWARD_COLUMN') {
        const column = actorPos ? actorPos.col : targetPos.col;
        const result = await client.query(`
            SELECT ch.id
            FROM cells c
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE c.group_id = $1
              AND c.col_index = $2
              AND ch.kind = $3
              AND ch.hp > 0
            ORDER BY c.row_index, ch.id
        `, [targetPos.groupId, column, enemyKind]);

        const ids = result.rows.map(row => Number(row.id));
        return ids.length ? ids : [Number(target.id)];
    }

    // 魂靈風息：直接指定前 / 後 / 左 / 右。
    // 使用「世界座標」沿直線搜尋，所以角色位於不同 grid_group 也能被正確包含。
    if (shape === 'ORTHOGONAL_LINE' && actorPos) {
        const direction = String(requestedDirection || '').toUpperCase();
        if (!['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(direction)) {
            return [Number(actor.id)];
        }

        const result = await client.query(`
            SELECT
                ch.id,
                g.world_x,
                g.world_y,
                g.cell_size,
                c.row_index,
                c.col_index
            FROM cells c
            JOIN grid_groups g ON g.id = c.group_id
            JOIN characters ch ON ch.id = c.occupied_by
            WHERE ch.hp > 0 OR ch.id = $1
            ORDER BY ch.id
        `, [actor.id]);

        const ids = [Number(actor.id)];

        for (const row of result.rows) {
            const characterId = Number(row.id);
            if (characterId === Number(actor.id)) continue;

            const cellSize = Number(row.cell_size);
            const centerX =
                Number(row.world_x) +
                (Number(row.col_index) + 0.5) * cellSize;
            const centerY =
                Number(row.world_y) +
                (Number(row.row_index) + 0.5) * cellSize;

            const dx = centerX - actorPos.centerX;
            const dy = centerY - actorPos.centerY;

            // 戰場群可以稍微沒對齊；容許約三分之一格寬的偏差。
            const tolerance = Math.max(
                8,
                Math.min(actorPos.cellSize, cellSize) * 0.34
            );

            const vertical = Math.abs(dx) <= tolerance;
            const horizontal = Math.abs(dy) <= tolerance;

            const match =
                (direction === 'UP' && vertical && dy < -tolerance) ||
                (direction === 'DOWN' && vertical && dy > tolerance) ||
                (direction === 'LEFT' && horizontal && dx < -tolerance) ||
                (direction === 'RIGHT' && horizontal && dx > tolerance);

            if (match) ids.push(characterId);
        }

        return [...new Set(ids)];
    }

    return [Number(target.id)];
}

function isMainActionSkill(skill) {
    return skill.logicCode === 'WAIT' || String(skill.timing || '').includes('主動');
}

function isAuxiliarySkill(skill) {
    return !isMainActionSkill(skill) && /SP/i.test(String(skill.cost || ''));
}

function statusExpiresRound(buffKey, currentRound) {
    if (['stun', 'darkness', 'frozen', 'feign_death', 'berserk'].includes(buffKey)) {
        return currentRound + 1;
    }
    return currentRound;
}

async function getCharacterBuffEntries(client, characterId) {
    const result = await client.query(`
        SELECT
            character_id,
            buff_key,
            source_character_id,
            source_skill_key,
            stack_count,
            value_num,
            expires_round
        FROM character_buffs
        WHERE character_id = $1
        ORDER BY id
    `, [characterId]);
    return result.rows;
}

async function sourceEffectiveMagic(client, sourceCharacterId) {
    if (!sourceCharacterId) return 0;

    const characterResult = await client.query(
        'SELECT * FROM characters WHERE id = $1',
        [sourceCharacterId]
    );
    if (!characterResult.rows.length) return 0;

    const entries = await getCharacterBuffEntries(client, sourceCharacterId);
    const mods = buffModifiers(entries);
    const source = characterResult.rows[0];

    return Math.max(
        0,
        Math.floor(Number(source.matk) * mods.matkMult + mods.matkFlat)
    );
}

async function applyDirectHpLoss(client, characterId, amount) {
    const loss = Math.max(0, Math.floor(Number(amount) || 0));
    if (!loss) return { oldHp: null, newHp: null, loss: 0, duelPrevented: 0 };

    const characterResult = await client.query(
        'SELECT id, hp FROM characters WHERE id = $1 FOR UPDATE',
        [characterId]
    );
    if (!characterResult.rows.length) return { oldHp: null, newHp: null, loss: 0, duelPrevented: 0 };

    const oldHp = Number(characterResult.rows[0].hp);
    const buffs = await getCharacterBuffEntries(client, characterId);
    const hasDuel = buffs.some(row => row.buff_key === 'duel');
    const floorHp = hasDuel ? 1 : 0;
    const newHp = Math.max(floorHp, oldHp - loss);
    const actualLoss = Math.max(0, oldHp - newHp);

    await client.query(
        'UPDATE characters SET hp = $1 WHERE id = $2',
        [newHp, characterId]
    );

    return {
        oldHp,
        newHp,
        loss: actualLoss,
        duelPrevented: Math.max(0, loss - actualLoss)
    };
}

async function applyDebuffBundle(client, characterIds, buffKeys, {
    sourceSkillKey = null,
    sourceCharacterId = null,
    currentRound = 1
} = {}) {
    const ids = [...new Set((characterIds || []).map(Number).filter(Boolean))];
    const keys = [...new Set((buffKeys || []).filter(key => BUFF_CATALOG[key]))];

    const result = {
        applied: [],
        protected: [],
        resisted: []
    };

    for (const characterId of ids) {
        if (!keys.length) continue;

        const hasDebuff = keys.some(
            key => BUFF_CATALOG[key]?.kind === 'debuff'
        );

        if (hasDebuff) {
            const sanctuary = await client.query(`
                SELECT id
                FROM character_buffs
                WHERE character_id = $1
                  AND buff_key = 'sanctuary'
                LIMIT 1
            `, [characterId]);

            if (sanctuary.rows.length) {
                await removeBuffKeys(client, characterId, ['sanctuary']);
                result.protected.push(characterId);
                continue;
            }
        }

        for (const key of keys) {
            const definition = BUFF_CATALOG[key];

            if (definition.resistance) {
                const prior = await client.query(`
                    SELECT 1
                    FROM status_resistances
                    WHERE character_id = $1
                      AND status_key = $2
                `, [characterId, key]);

                if (prior.rows.length) {
                    result.resisted.push({ characterId, key });
                    continue;
                }
            }

            await applyBuffToCharacters(
                client,
                [characterId],
                key,
                {
                    sourceSkillKey,
                    sourceCharacterId,
                    expiresRound: statusExpiresRound(key, currentRound)
                }
            );

            if (definition.resistance) {
                await client.query(`
                    INSERT INTO status_resistances (character_id, status_key)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                `, [characterId, key]);
            }

            result.applied.push({ characterId, key });
        }
    }

    return result;
}

function onHitDebuffKeys(skill) {
    const byName = {
        '護盾猛擊': ['stun'],
        '猛擊': ['defense_down_25'],
        '輪擺': ['defense_down_25'],
        '戰線剋星': ['defense_down_25'],
        '淬毒': ['poison'],
        '暗影噬咬': ['darkness', 'speed_down_10'],
        '封口': ['block_seal'],
        '先制射擊': ['stun'],
        '火球術': ['burning'],
        '寒冰箭': ['frozen'],
        '雷霆劍': ['stun']
    };

    const keys = [...(byName[skill?.name] || [])];
    const effect = String(skill?.effect || '');

    if (/目標防禦\s*-\s*25%/.test(effect)) keys.push('defense_down_25');
    if (/目標物理攻擊\s*-\s*25%/.test(effect)) keys.push('patk_down_25');
    if (/目標魔法攻擊\s*-\s*25%/.test(effect)) keys.push('matk_down_25');
    if (/目標(?:物理和魔法攻擊|物理、魔法攻擊|攻擊力?|攻擊)\s*-\s*25%/.test(effect)) {
        keys.push('attack_down_25');
    }

    return [...new Set(keys)];
}

async function enforceActionRestrictions(client, actor, skill, selectedTarget, requestedDirection = null) {
    const entries = await getCharacterBuffEntries(client, actor.id);
    const keys = new Set(entries.map(row => row.buff_key));

    if (keys.has('frozen') && isAuxiliarySkill(skill)) {
        throw new Error(`${actor.name} 處於【冰凍】，目前無法發動輔助戰技`);
    }

    if (!isMainActionSkill(skill)) return { consumeTaunt: false };

    const taunt = entries.find(row => row.buff_key === 'taunt');
    if (!taunt?.source_character_id) return { consumeTaunt: false };

    const sourceResult = await client.query(
        'SELECT * FROM characters WHERE id = $1',
        [taunt.source_character_id]
    );
    const source = sourceResult.rows[0];

    if (!source || Number(source.hp) <= 0 || (source.kind || 'player') === (actor.kind || 'player')) {
        await removeBuffKeys(client, actor.id, ['taunt']);
        return { consumeTaunt: false };
    }

    if (skill.actionCode !== 'ATTACK') {
        throw new Error(
            `${actor.name} 受到【嘲諷】：下一次主要行動必須盡可能攻擊 ${source.name}`
        );
    }

    const targetIds = await resolveAttackTargetIds(client, actor, selectedTarget, skill, requestedDirection);
    if (!targetIds.includes(Number(source.id))) {
        throw new Error(
            `${actor.name} 受到【嘲諷】：本次攻擊必須包含 ${source.name}`
        );
    }

    return { consumeTaunt: true };
}

async function triggerActionStatuses(client, actor, skill, currentRound) {
    const entries = await getCharacterBuffEntries(client, actor.id);
    const lines = [];
    let changed = false;

    const triggerLoss = async (entry, label) => {
        const magic = await sourceEffectiveMagic(client, entry.source_character_id);
        const amount = Math.max(1, Math.floor(magic * 0.5));
        const result = await applyDirectHpLoss(client, actor.id, amount);
        if (result.loss > 0) {
            lines.push(`${label}：${actor.name} 額外損失 ${result.loss} HP`);
            changed = true;
        }
    };

    if (isMainActionSkill(skill)) {
        const poison = entries.find(row => row.buff_key === 'poison');
        if (poison) await triggerLoss(poison, '【中毒】');
    }

    if (isAuxiliarySkill(skill)) {
        const burning = entries.find(row => row.buff_key === 'burning');
        if (burning) await triggerLoss(burning, '【燃燒】');
    }

    if (String(skill.timing || '').includes('主動')) {
        const regen = entries.find(row => row.buff_key === 'regeneration');

        if (regen?.source_character_id) {
            const magic = await sourceEffectiveMagic(client, regen.source_character_id);
            const heal = Math.max(1, Math.floor(magic * 0.75));

            const currentResult = await client.query(
                'SELECT hp, max_hp FROM characters WHERE id = $1 FOR UPDATE',
                [actor.id]
            );

            if (currentResult.rows.length) {
                const oldHp = Number(currentResult.rows[0].hp);
                const maxHp = Number(currentResult.rows[0].max_hp);
                const newHp = Math.min(maxHp, oldHp + heal);
                const actualHeal = Math.max(0, newHp - oldHp);

                if (actualHeal > 0) {
                    await client.query(
                        'UPDATE characters SET hp = $1 WHERE id = $2',
                        [newHp, actor.id]
                    );
                    lines.push(`【再生】：${actor.name} 恢復 ${actualHeal} HP`);
                    changed = true;
                }
            }
        }
    }

    return { lines, changed };
}

async function resolveTurnStartStatuses(client, actorId, clock) {
    const characterResult = await client.query(
        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
        [actorId]
    );
    if (!characterResult.rows.length) {
        return { skipTurn: false, events: [], messages: [], charactersChanged: false };
    }

    const actor = characterResult.rows[0];
    const entries = await getCharacterBuffEntries(client, actorId);
    const keys = new Set(entries.map(row => row.buff_key));
    const events = [];
    const messages = [];
    let changed = false;
    let skipTurn = false;

    if (keys.has('frozen')) {
        await removeBuffKeys(client, actorId, ['frozen']);
        changed = true;
        events.push(await insertBattleEvent(client, {
            eventType: 'status_end',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId,
            content: `${actor.name} 的【冰凍】在回合開始時解除。`
        }));
    }

    if (keys.has('feign_death') && Number(actor.hp) <= 0) {
        await client.query(
            'UPDATE characters SET hp = LEAST(max_hp, 1) WHERE id = $1',
            [actorId]
        );
        await removeBuffKeys(client, actorId, ['feign_death']);
        changed = true;

        const content = `【假死】發動：${actor.name} 在回合開始時恢復至 1 HP。`;
        events.push(await insertBattleEvent(client, {
            eventType: 'status_trigger',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId,
            content
        }));
        messages.push(await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'status',
            characterId: actorId,
            characterName: actor.name,
            characterKind: actor.kind || 'player',
            content,
            payload: { statusKey: 'feign_death' }
        }));
    }

    if (keys.has('stun')) {
        await removeBuffKeys(client, actorId, ['stun']);
        changed = true;
        skipTurn = true;

        const content = `【暈厥】發動：${actor.name} 的本回合被跳過。`;
        events.push(await insertBattleEvent(client, {
            eventType: 'status_trigger',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId,
            content
        }));
        messages.push(await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'status',
            characterId: actorId,
            characterName: actor.name,
            characterKind: actor.kind || 'player',
            content,
            payload: { statusKey: 'stun', skipTurn: true }
        }));
    }

    return { skipTurn, events, messages, charactersChanged: changed };
}


async function findUsableTurnActor(client, combatants, startIndex, round, turnPass) {
    if (!combatants.length) {
        return {
            actorId: null,
            index: -1,
            turnPass,
            statusEvents: [],
            statusMessages: [],
            charactersChanged: false
        };
    }

    let index = ((startIndex % combatants.length) + combatants.length) % combatants.length;
    let pass = turnPass;
    const statusEvents = [];
    const statusMessages = [];
    let charactersChanged = false;

    // 一整輪若全部被暈厥，暈厥會各自消耗；第二圈就能找到可行動者。
    const limit = Math.max(1, combatants.length * 2 + 1);

    for (let attempt = 0; attempt < limit; attempt++) {
        const actorId = combatants[index].id;
        const status = await resolveTurnStartStatuses(
            client,
            actorId,
            { round, turnPass: pass }
        );

        statusEvents.push(...status.events);
        statusMessages.push(...status.messages);
        charactersChanged ||= status.charactersChanged;

        if (!status.skipTurn) {
            return {
                actorId,
                index,
                turnPass: pass,
                statusEvents,
                statusMessages,
                charactersChanged
            };
        }

        index += 1;
        if (index >= combatants.length) {
            index = 0;
            pass += 1;
        }
    }

    return {
        actorId: combatants[index].id,
        index,
        turnPass: pass,
        statusEvents,
        statusMessages,
        charactersChanged
    };
}

async function autoRecipientIds(client, actor, target, skill) {
    const side = actor.kind || 'player';
    const code = skill.targetCode || 'SELF';

    // 這兩個效果明確以「自身所在排」為基準，不需要另外選一排。
    if (['戰吼', '戰線保衛'].includes(skill.name)) {
        let ids = await sameRowCharacterIds(client, actor.id, {
            kind: side,
            includeAnchor: true
        });

        if (!ids.length) ids = [Number(actor.id)];

        if (skill.name === '戰線保衛') {
            ids = ids.filter(id => id !== Number(actor.id));
        }

        return ids;
    }

    if (code === 'ALL_ALLIES') {
        const result = await client.query(
            'SELECT id FROM characters WHERE kind = $1 ORDER BY id',
            [side]
        );
        let ids = result.rows.map(row => Number(row.id));

        if (skill.name === '鋼鐵帷幕') {
            ids = ids.filter(id => id !== Number(actor.id));
        }

        return ids;
    }

    if (code === 'ALLY_ROW') {
        const anchorId = target?.id || actor.id;
        let ids = await sameRowCharacterIds(client, anchorId, {
            kind: side,
            includeAnchor: true
        });

        if (!ids.length) ids = [Number(anchorId)];

        if (skill.name === '戰線保衛') {
            ids = ids.filter(id => id !== Number(actor.id));
        }

        return ids;
    }

    if (code === 'ALL_ENEMIES') {
        const result = await client.query(
            'SELECT id FROM characters WHERE kind <> $1 AND hp > 0 ORDER BY id',
            [side]
        );
        return result.rows.map(row => Number(row.id));
    }

    if (code === 'ENEMY_ROW') {
        const ids = await sameRowCharacterIds(client, target.id, {
            kind: target.kind || 'enemy',
            includeAnchor: true
        });
        return ids.length ? ids : [Number(target.id)];
    }

    if (code === 'SELF') return [Number(actor.id)];
    return [Number(target.id)];
}

function autoBuffForSkill(skill) {
    const byName = {
        '進攻指令': 'attack_order',
        '戰吼': 'war_cry',
        '加速': 'acceleration',
        '進攻架勢': 'attack_stance',
        '戰爭號角': 'war_horn',

        '挑釁': 'taunt',
        '吸引目光': 'taunt',
        '堅守': 'steadfast',
        '震怒': 'rage',
        '防守姿態': 'defensive_stance',
        '鋼鐵帷幕': 'steel_curtain',
        '戰線保衛': 'battleline_defense',
        '生命護盾': 'life_shield',
        '狂暴': 'berserk',
        '死鬥': 'duel',

        '鋒銳': 'sharpness',
        '蜃景': 'mirage',
        '視線轉移': 'dodge_down_50pct',
        '假死': 'feign_death',

        '賦能': 'empower',
        '防護指令': 'defense_order',
        '純淨領域': 'sanctuary',
        '狙擊指令': 'sniper_order',
        '再生': 'regeneration',
        '快速詠唱': 'quick_cast',
        '飛速指令': 'swift_order',
        '格擋指令': 'auto_guard',
        '行進指令': 'marching_order',
        '隨風而行': 'wind_walk',
        '障壁': 'barrier',

        '束縛': 'block_seal',
        '破陣': 'break_formation'
    };

    return byName[skill?.name] || null;
}

function skillBuffExpiresRound(skill, currentRound) {
    const text = String(skill?.effect || '');

    // 規則：除非另有註明，所有非永久持續性增減益與特殊狀態在輪結束時解除。
    if (text.includes('整場戰鬥') || text.includes('永久')) return null;
    return currentRound;
}


function mapCharacter(row, buffs = [], equippedSkills = []) {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind || 'player',
        hp: Number(row.hp),
        maxHp: Number(row.max_hp),
        ap: Number(row.ap),
        maxAp: Number(row.max_ap),
        sp: Number(row.sp),
        maxSp: Number(row.max_sp),
        patk: row.patk,
        matk: row.matk,
        crit: row.crit,
        critDamageBonus: Number(row.crit_damage_bonus || 0),
        hitRate: row.hit_rate,
        dodge: row.dodge,
        speed: row.speed,
        defense: row.defense,
        resist: row.resist,
        blockRate: Number(row.block_rate || 0),
        image: row.image_path,
        profession: row.profession || '',
        skillSlots: Math.max(0, Number(row.skill_slots ?? 1)),
        buffs,
        equippedSkills,
        effective: effectiveStatsFromBuffs(row, buffs)
    };
}

async function getBuffsByCharacterIds(characterIds) {
    const map = new Map();
    if (!characterIds.length) return map;

    const result = await pool.query(`
        SELECT
            character_id,
            buff_key,
            source_skill_key,
            source_character_id,
            expires_round,
            stack_count,
            value_num
        FROM character_buffs
        WHERE character_id = ANY($1::int[])
        ORDER BY id
    `, [characterIds]);

    for (const row of result.rows) {
        const buff = BUFF_CATALOG[row.buff_key];
        if (!buff) continue;
        if (!map.has(row.character_id)) map.set(row.character_id, []);
        map.get(row.character_id).push({
            ...buff,
            sourceSkillKey: row.source_skill_key,
            sourceCharacterId: row.source_character_id,
            expiresRound: row.expires_round === null ? null : Number(row.expires_round),
            stackCount: Math.max(1, Number(row.stack_count || 1)),
            valueNum: row.value_num === null ? null : Number(row.value_num)
        });
    }

    return map;
}


async function getSkillsByCharacterIds(characterIds) {
    const map = new Map();
    if (!characterIds.length) return map;

    const result = await pool.query(`
        SELECT character_id, slot_index, skill_key
        FROM character_skills
        WHERE character_id = ANY($1::int[])
        ORDER BY character_id, slot_index
    `, [characterIds]);

    for (const row of result.rows) {
        const skill = ALL_EQUIPPABLE_SKILLS.get(row.skill_key);
        if (!skill) continue;

        if (!map.has(row.character_id)) map.set(row.character_id, []);
        map.get(row.character_id).push({
            slotIndex: row.slot_index,
            ...skill
        });
    }

    return map;
}

async function getCharacterById(characterId) {
    const result = await pool.query('SELECT * FROM characters WHERE id = $1', [characterId]);
    if (!result.rows.length) return null;
    const [buffsMap, skillsMap] = await Promise.all([
        getBuffsByCharacterIds([characterId]),
        getSkillsByCharacterIds([characterId])
    ]);
    return mapCharacter(
        result.rows[0],
        buffsMap.get(characterId) || [],
        skillsMap.get(characterId) || []
    );
}


function mapChatMessage(row) {
    return {
        id: Number(row.id),
        channel: row.channel,
        messageType: row.message_type,
        characterId: row.character_id,
        characterName: row.character_name,
        characterKind: row.character_kind,
        content: row.content,
        payload: row.payload || {},
        createdAt: row.created_at
    };
}

function mapBattleEvent(row) {
    return {
        id: Number(row.id),
        eventType: row.event_type,
        round: Number(row.round_number),
        turnPass: Number(row.turn_pass),
        actorId: row.actor_id,
        targetId: row.target_id,
        content: row.content,
        payload: row.payload || {},
        createdAt: row.created_at
    };
}

function battleClockLabel(round, turnPass) {
    return `第${round}輪－第${turnPass}回合`;
}

async function getBattleClock(db = pool, lock = false) {
    const result = await db.query(`
        SELECT round_number, turn_pass, current_character_id
        FROM battle_state
        WHERE id = 1
        ${lock ? 'FOR UPDATE' : ''}
    `);

    const row = result.rows[0] || {
        round_number: 1,
        turn_pass: 1,
        current_character_id: null
    };

    return {
        round: Number(row.round_number),
        turnPass: Number(row.turn_pass),
        currentCharacterId: row.current_character_id
    };
}

async function insertBattleEvent(db, {
    eventType,
    round,
    turnPass,
    actorId = null,
    targetId = null,
    content,
    payload = {}
}) {
    const result = await db.query(`
        INSERT INTO battle_events (
            event_type, round_number, turn_pass,
            actor_id, target_id, content, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING *
    `, [
        eventType,
        round,
        turnPass,
        actorId,
        targetId,
        content,
        JSON.stringify(payload)
    ]);

    return mapBattleEvent(result.rows[0]);
}

async function ensureBattleLogSeed() {
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM battle_events');
    if (Number(count.rows[0]?.count || 0) > 0) return;

    const clock = await getBattleClock();
    await insertBattleEvent(pool, {
        eventType: 'battle_start',
        round: clock.round,
        turnPass: clock.turnPass,
        content: '戰鬥開始'
    });
    await insertBattleEvent(pool, {
        eventType: 'phase',
        round: clock.round,
        turnPass: clock.turnPass,
        content: battleClockLabel(clock.round, clock.turnPass)
    });
}

function buildCombatState(round, turnPass, currentId, combatants) {
    if (!combatants.length) {
        return {
            round,
            turnPass,
            currentCharacterId: null,
            current: null,
            next: null,
            entersNextTurnPass: false,
            combatants
        };
    }

    let index = combatants.findIndex(character => character.id === currentId);
    if (index < 0) index = 0;

    const current = combatants[index];
    const next = combatants[(index + 1) % combatants.length];

    return {
        round,
        turnPass,
        currentCharacterId: current.id,
        current,
        next,
        entersNextTurnPass: index === combatants.length - 1,
        combatants
    };
}

async function insertChatMessage(db, {
    channel,
    messageType = 'text',
    characterId = null,
    characterName,
    characterKind = 'player',
    content,
    payload = {}
}) {
    const result = await db.query(`
        INSERT INTO chat_messages (
            channel, message_type, character_id, character_name,
            character_kind, content, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING *
    `, [
        channel,
        messageType,
        characterId,
        characterName,
        characterKind,
        content,
        JSON.stringify(payload)
    ]);

    return mapChatMessage(result.rows[0]);
}

async function getCombatants(db = pool) {
    const result = await db.query(`
        SELECT id, name, kind, speed, hp, max_hp, ap, max_ap, sp, max_sp, image_path,
               patk, matk, crit, crit_damage_bonus, hit_rate, dodge, defense, resist, block_rate
        FROM characters
        ORDER BY id ASC
    `);

    const ids = result.rows.map(row => row.id);
    const buffsMap = new Map();

    if (ids.length) {
        const buffResult = await db.query(`
            SELECT character_id, buff_key, stack_count, value_num
            FROM character_buffs
            WHERE character_id = ANY($1::int[])
        `, [ids]);

        for (const row of buffResult.rows) {
            if (!buffsMap.has(row.character_id)) buffsMap.set(row.character_id, []);
            buffsMap.get(row.character_id).push({
                key: row.buff_key,
                stackCount: Number(row.stack_count || 1),
                valueNum: row.value_num === null ? null : Number(row.value_num)
            });
        }
    }

    return result.rows
        .map(row => {
            const mods = buffModifiers(buffsMap.get(row.id) || []);
            return {
                id: row.id,
                name: row.name,
                kind: row.kind || 'player',
                speed: Math.floor(Number(row.speed) + mods.speedFlat),
                baseSpeed: Number(row.speed),
                hp: Number(row.hp),
                maxHp: Number(row.max_hp),
                ap: Number(row.ap),
                maxAp: Number(row.max_ap),
                sp: Number(row.sp),
                maxSp: Number(row.max_sp),
                blockRate: clamp(Number(row.block_rate || 0) + mods.blockFlat, 0, 75),
                initiativeFirst: mods.initiativeFirst,
                image: row.image_path
            };
        })
        .sort((a, b) =>
            Number(Boolean(b.initiativeFirst)) - Number(Boolean(a.initiativeFirst)) ||
            Number(b.speed) - Number(a.speed) ||
            Number(a.id) - Number(b.id)
        );
}

async function getCombatState(db = pool, lock = false) {
    const clock = await getBattleClock(db, lock);
    const combatants = await getCombatants(db);

    let currentId = clock.currentCharacterId;
    if (combatants.length && !combatants.some(character => character.id === currentId)) {
        currentId = combatants[0].id;
        await db.query(`
            UPDATE battle_state
            SET current_character_id = $1, updated_at = NOW()
            WHERE id = 1
        `, [currentId]);
    }

    return buildCombatState(clock.round, clock.turnPass, currentId, combatants);
}

async function resolvePendingActionsForActor(client, actorId, clock = null) {
    if (!actorId) return { messages: [], events: [], charactersChanged: false };

    const pendingResult = await client.query(`
        SELECT
            p.*,
            a.name AS actor_name,
            a.kind AS actor_kind,
            t.name AS target_name,
            t.hp AS target_hp,
            t.max_hp AS target_max_hp
        FROM pending_actions p
        JOIN characters a ON a.id = p.actor_id
        JOIN characters t ON t.id = p.target_id
        WHERE p.actor_id = $1
        ORDER BY p.id
        FOR UPDATE OF p
    `, [actorId]);

    const messages = [];
    const events = [];
    let charactersChanged = false;

    for (const pending of pendingResult.rows) {
        if (pending.skill_key === 'rescue') {
            let content;

            if (Number(pending.target_hp) <= 0) {
                await client.query(`
                    UPDATE characters
                    SET hp = LEAST(max_hp, 1)
                    WHERE id = $1
                `, [pending.target_id]);

                content =
                    `✚ 「救援」完成\n` +
                    `${pending.actor_name} 的蓄力完成。\n` +
                    `${pending.target_name} HP 0 → 1`;
                charactersChanged = true;
            } else {
                content =
                    `✚ 「救援」失去目標\n` +
                    `${pending.target_name} 已不再是被擊倒狀態。`;
            }

            const message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: pending.actor_id,
                characterName: pending.actor_name,
                characterKind: pending.actor_kind || 'player',
                content,
                payload: {
                    skillKey: 'rescue',
                    targetId: pending.target_id,
                    resolved: true
                }
            });

            messages.push(message);

            const eventClock = clock || await getBattleClock(client);
            const battleEvent = await insertBattleEvent(client, {
                eventType: 'rescue',
                round: eventClock.round,
                turnPass: eventClock.turnPass,
                actorId: pending.actor_id,
                targetId: pending.target_id,
                content: Number(pending.target_hp) <= 0
                    ? `${pending.target_name} 因 ${pending.actor_name} 的「救援」恢復至 1 HP。`
                    : `${pending.actor_name} 的「救援」失去目標：${pending.target_name} 已不再是擊倒狀態。`,
                payload: { skillKey: 'rescue', resolved: true }
            });
            events.push(battleEvent);
        }

        await client.query('DELETE FROM pending_actions WHERE id = $1', [pending.id]);
    }

    return { messages, events, charactersChanged };
}

async function broadcastCombatState() {
    const state = await getCombatState();
    io.emit('combat:state', state);
    return state;
}

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
        callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        if (!file.mimetype?.startsWith('image/')) {
            return callback(new Error('只允許上傳圖片'));
        }
        callback(null, true);
    }
});


app.get('/api/skills/catalog', (req, res) => {
    const profession = safeProfession(String(req.query.profession || ''));
    res.json({
        professions: SKILL_DATA.professions,
        initial: SKILL_DATA.initial,
        profession,
        professionSkills: profession
            ? (SKILL_DATA.professionSkills[profession] || [])
            : [],
        common: SKILL_DATA.common
    });
});

app.put('/api/characters/:id/skills/:slotIndex', async (req, res) => {
    const characterId = number(req.params.id);
    const slotIndex = Math.floor(number(req.params.slotIndex, -1));
    const skillKey = req.body.skillKey === null
        ? null
        : String(req.body.skillKey || '');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const characterResult = await client.query(
            'SELECT id, profession, skill_slots FROM characters WHERE id = $1 FOR UPDATE',
            [characterId]
        );

        if (!characterResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到這個角色' });
        }

        const character = characterResult.rows[0];
        const requestedProfession = req.body.profession === undefined
            ? (character.profession || '')
            : safeProfession(String(req.body.profession || ''));
        const professionChanged = requestedProfession !== (character.profession || '');
        const requestedSkillSlots = req.body.skillSlots === undefined
            ? Math.max(0, Number(character.skill_slots || 0))
            : clamp(Math.floor(number(req.body.skillSlots, character.skill_slots || 0)), 0, 30);
        const skillSlotsChanged = requestedSkillSlots !== Math.max(0, Number(character.skill_slots || 0));
        const skillSlots = requestedSkillSlots;

        if (slotIndex < 0 || slotIndex >= skillSlots) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '這個戰技欄不存在' });
        }

        if (professionChanged || skillSlotsChanged) {
            await client.query(
                'UPDATE characters SET profession = $1, skill_slots = $2 WHERE id = $3',
                [requestedProfession, skillSlots, characterId]
            );
            if (professionChanged) {
                await client.query('DELETE FROM character_skills WHERE character_id = $1', [characterId]);
            } else {
                await client.query('DELETE FROM character_skills WHERE character_id = $1 AND slot_index >= $2', [characterId, skillSlots]);
            }
        }

        if (!skillKey) {
            await client.query(
                'DELETE FROM character_skills WHERE character_id = $1 AND slot_index = $2',
                [characterId, slotIndex]
            );
        } else {
            const skill = ALL_EQUIPPABLE_SKILLS.get(skillKey);

            if (!skill || !skillAllowedForProfession(skill, requestedProfession)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: '這個戰技不能由目前職業攜帶' });
            }

            // 同一角色不重複攜帶相同戰技；若已在其他欄，改成移到新欄。
            await client.query(
                'DELETE FROM character_skills WHERE character_id = $1 AND skill_key = $2',
                [characterId, skillKey]
            );

            await client.query(`
                INSERT INTO character_skills (character_id, slot_index, skill_key)
                VALUES ($1, $2, $3)
                ON CONFLICT (character_id, slot_index)
                DO UPDATE SET skill_key = EXCLUDED.skill_key
            `, [characterId, slotIndex, skillKey]);
        }

        await client.query('COMMIT');
        res.json(await getCharacterById(characterId));
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '更新攜帶戰技失敗' });
    } finally {
        client.release();
    }
});

app.get('/api/buffs/catalog', (_req, res) => {
    res.json(
        Object.values(BUFF_CATALOG)
            .filter(buff => buff.hidden !== true)
            .sort((a, b) =>
                String(a.kind || 'buff').localeCompare(String(b.kind || 'buff')) ||
                String(a.name).localeCompare(String(b.name), 'zh-Hant')
            )
    );
});

app.get('/api/characters', async (_req, res) => {
    try {
        const result = await pool.query('SELECT * FROM characters ORDER BY id');
        const ids = result.rows.map(row => row.id);
        const [buffsMap, skillsMap] = await Promise.all([
            getBuffsByCharacterIds(ids),
            getSkillsByCharacterIds(ids)
        ]);
        res.json(result.rows.map(row => mapCharacter(
            row,
            buffsMap.get(row.id) || [],
            skillsMap.get(row.id) || []
        )));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '查詢角色失敗' });
    }
});

app.post('/api/characters', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const values = [
            String(req.body.name || '').trim(),
            safeKind(req.body.kind),
            safeProfession(req.body.profession),
            clamp(Math.floor(number(req.body.skillSlots, 1)), 0, 30),
            number(req.body.hp),
            number(req.body.ap),
            number(req.body.sp),
            number(req.body.patk),
            number(req.body.matk),
            number(req.body.crit),
            number(req.body.critDamageBonus),
            number(req.body.hitRate),
            number(req.body.dodge),
            number(req.body.speed),
            number(req.body.defense),
            number(req.body.resist),
            clamp(number(req.body.blockRate), 0, 75),
            imagePath
        ];

        if (!values[0]) return res.status(400).json({ error: '名稱不能是空白' });

        const result = await pool.query(`
            INSERT INTO characters (
                name, kind, profession, skill_slots,
                hp, max_hp, ap, max_ap, sp, max_sp,
                patk, matk, crit, crit_damage_bonus, hit_rate, dodge, speed, defense, resist, block_rate, image_path
            )
            VALUES (
                $1, $2, $3, $4,
                $5, $5, $6, $6, $7, $7,
                $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
        `, values);

        res.json(mapCharacter(result.rows[0], []));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || '建立角色失敗' });
    }
});

// 角色卡一次儲存所有可編輯數值。
app.patch('/api/characters/:id', async (req, res) => {
    const characterId = number(req.params.id);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const currentResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [characterId]
        );

        if (!currentResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到這個角色' });
        }

        const current = currentResult.rows[0];
        const maxHp = Math.max(0, number(req.body.maxHp, current.max_hp));
        const maxAp = Math.max(0, number(req.body.maxAp, current.max_ap));
        const maxSp = Math.max(0, number(req.body.maxSp, current.max_sp));
        const profession = safeProfession(
            req.body.profession === undefined ? current.profession : req.body.profession
        );
        const skillSlots = clamp(
            Math.floor(number(req.body.skillSlots, current.skill_slots ?? 1)),
            0,
            30
        );

        const professionChanged = profession !== (current.profession || '');

        const values = [
            clamp(number(req.body.hp, current.hp), 0, maxHp),
            maxHp,
            clamp(number(req.body.ap, current.ap), 0, maxAp),
            maxAp,
            clamp(number(req.body.sp, current.sp), 0, maxSp),
            maxSp,
            number(req.body.patk, current.patk),
            number(req.body.matk, current.matk),
            number(req.body.crit, current.crit),
            number(req.body.critDamageBonus, current.crit_damage_bonus),
            number(req.body.hitRate, current.hit_rate),
            number(req.body.dodge, current.dodge),
            number(req.body.speed, current.speed),
            number(req.body.defense, current.defense),
            number(req.body.resist, current.resist),
            clamp(number(req.body.blockRate, current.block_rate), 0, 75),
            profession,
            skillSlots,
            characterId
        ];

        const result = await client.query(`
            UPDATE characters SET
                hp = $1, max_hp = $2,
                ap = $3, max_ap = $4,
                sp = $5, max_sp = $6,
                patk = $7, matk = $8, crit = $9, crit_damage_bonus = $10, hit_rate = $11,
                dodge = $12, speed = $13, defense = $14, resist = $15,
                block_rate = $16,
                profession = $17, skill_slots = $18
            WHERE id = $19
            RETURNING *
        `, values);

        // 換職業時清空攜帶戰技，避免保留上一職業的限定戰技。
        if (professionChanged) {
            await client.query(
                'DELETE FROM character_skills WHERE character_id = $1',
                [characterId]
            );
        } else {
            // 戰技欄縮小時，直接移除超出欄位的戰技。
            await client.query(`
                DELETE FROM character_skills
                WHERE character_id = $1 AND slot_index >= $2
            `, [characterId, skillSlots]);
        }

        await client.query('COMMIT');

        const updated = await getCharacterById(characterId);
        res.json(updated);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '更新角色失敗' });
    } finally {
        client.release();
    }
});

app.delete('/api/characters/:id', async (req, res) => {
    const characterId = number(req.params.id);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 先清掉戰場與 Buff，讓舊資料庫就算 FK 設定不同也能穩定刪除。
        await client.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [characterId]);
        await client.query('DELETE FROM character_buffs WHERE character_id = $1', [characterId]);
        await client.query('DELETE FROM character_skills WHERE character_id = $1', [characterId]);

        const result = await client.query(
            'DELETE FROM characters WHERE id = $1 RETURNING image_path',
            [characterId]
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到這個角色' });
        }

        await client.query('COMMIT');

        const imagePath = result.rows[0].image_path;
        if (imagePath?.startsWith('/uploads/')) {
            fs.unlink(path.join(UPLOAD_DIR, path.basename(imagePath)), () => {});
        }

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: '刪除角色失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/characters/:id/stat', async (req, res) => {
    const characterId = number(req.params.id);
    const delta = number(req.body.delta);
    const statType = req.body.statType;
    const columns = {
        hp: ['hp', 'max_hp'],
        ap: ['ap', 'max_ap'],
        sp: ['sp', 'max_sp']
    };

    if (!columns[statType]) return res.status(400).json({ error: '不支援這個屬性' });
    const [currentColumn, maxColumn] = columns[statType];

    try {
        const result = await pool.query(`
            UPDATE characters
            SET ${currentColumn} = LEAST(${maxColumn}, GREATEST(0, ${currentColumn} + $1))
            WHERE id = $2
            RETURNING *
        `, [delta, characterId]);

        if (!result.rows.length) return res.status(404).json({ error: '找不到這個角色' });

        const [buffsMap, skillsMap] = await Promise.all([
            getBuffsByCharacterIds([characterId]),
            getSkillsByCharacterIds([characterId])
        ]);
        res.json(mapCharacter(
            result.rows[0],
            buffsMap.get(characterId) || [],
            skillsMap.get(characterId) || []
        ));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '更新屬性失敗' });
    }
});

app.post('/api/characters/:id/buffs', async (req, res) => {
    const characterId = number(req.params.id);
    const buffKey = String(req.body.buffKey || '');
    const sourceCharacterId = number(req.body.sourceCharacterId, characterId);

    if (!BUFF_CATALOG[buffKey]) return res.status(400).json({ error: '未知的 Buff' });

    try {
        const exists = await pool.query('SELECT id FROM characters WHERE id = $1', [characterId]);
        if (!exists.rows.length) return res.status(404).json({ error: '找不到這個角色' });

        await pool.query(`
            INSERT INTO character_buffs (
                character_id, buff_key, source_skill_key,
                source_character_id, expires_round, stack_count, value_num
            )
            VALUES ($1, $2, NULL, $3, NULL, 1, NULL)
            ON CONFLICT (character_id, buff_key)
            DO UPDATE SET
                source_skill_key = NULL,
                source_character_id = NULL,
                expires_round = NULL,
                stack_count = 1,
                value_num = NULL,
                created_at = NOW()
        `, [characterId, buffKey, sourceCharacterId]);

        const character = await getCharacterById(characterId);
        res.json(character);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '新增 Buff 失敗' });
    }
});

app.delete('/api/characters/:id/buffs/:buffKey', async (req, res) => {
    const characterId = number(req.params.id);
    const buffKey = String(req.params.buffKey || '');

    try {
        await pool.query(
            'DELETE FROM character_buffs WHERE character_id = $1 AND buff_key = $2',
            [characterId, buffKey]
        );

        const character = await getCharacterById(characterId);
        if (!character) return res.status(404).json({ error: '找不到這個角色' });
        res.json(character);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '移除 Buff 失敗' });
    }
});



function parseCost(costText) {
    const text = String(costText || '');
    const ap = text.match(/(\d+)\s*AP/i);
    const sp = text.match(/(\d+)\s*SP/i) || text.match(/(\d+)\s*\+\s*SP/i);
    // 像 1AP/1SP 的主動戰技，第一版手動發動時優先使用 AP。
    if (ap) return { type: 'ap', amount: Number(ap[1]) };
    if (sp) return { type: 'sp', amount: Number(sp[1]) };
    return { type: null, amount: 0 };
}

function parseDamagePackets(effect) {
    const packets = [];
    const text = String(effect || '');
    const patterns = [
        /【([0-9.]+)(?:x(\d+))?(物理|魔法)(?:x(\d+))?】/g,
        /【(物理|魔法)([0-9.]+)(?:x(\d+))?】/g
    ];

    let match;
    while ((match = patterns[0].exec(text))) {
        packets.push({
            multiplier: Number(match[1]),
            hits: Number(match[2] || match[4] || 1),
            damageType: match[3]
        });
    }
    while ((match = patterns[1].exec(text))) {
        packets.push({
            multiplier: Number(match[2]),
            hits: Number(match[3] || 1),
            damageType: match[1]
        });
    }
    return packets;
}

function targetAllowed(skill, actor, target) {
    if (!actor || !target) return false;

    const sameSide = (actor.kind || 'player') === (target.kind || 'player');
    const code = skill.targetCode || 'SELF';
    const effect = String(skill.effect || '');
    const requiresOtherAlly = effect.includes('其他友方');

    if (skill.actionCode === 'ATTACK') {
        if (code === 'ANY_ORTHOGONAL') {
            return Number(actor.hp) > 0;
        }
        return !sameSide && Number(target.hp) > 0;
    }

    if (skill.actionCode === 'HEAL') {
        if (!sameSide) return false;
        if (code === 'ALLY_DOWN') {
            return actor.id !== target.id && Number(target.hp) <= 0;
        }
        if (code === 'SELF') return actor.id === target.id;
        if (requiresOtherAlly && actor.id === target.id) return false;
        return true;
    }

    if (skill.actionCode === 'DEBUFF') {
        return !sameSide && Number(target.hp) > 0;
    }

    if (code === 'ALLY_DOWN') {
        return sameSide && actor.id !== target.id && Number(target.hp) <= 0;
    }

    if (['ALLY','ALLY_ROW','ALL_ALLIES','ALLY_OR_SELF'].includes(code)) {
        if (!sameSide) return false;
        if (requiresOtherAlly && actor.id === target.id) return false;
        return true;
    }

    if (['ENEMY','ENEMY_ROW','ALL_ENEMIES'].includes(code)) {
        return !sameSide && Number(target.hp) > 0;
    }

    if (code === 'SELF') return actor.id === target.id;
    return true;
}

async function spendSkillCost(client, actor, skill) {
    const cost = parseCost(skill.cost);
    if (!cost.type || cost.amount <= 0) return cost;

    const current = Number(actor[cost.type]);
    if (current < cost.amount) {
        throw new Error(`${actor.name} 的 ${cost.type.toUpperCase()} 不足`);
    }

    await client.query(
        `UPDATE characters SET ${cost.type} = GREATEST(0, ${cost.type} - $1) WHERE id = $2`,
        [cost.amount, actor.id]
    );
    actor[cost.type] = current - cost.amount;
    return cost;
}

async function actorHasSkill(client, actorId, skillKey) {
    if (SKILL_CATALOG[skillKey]) return true;
    const result = await client.query(
        'SELECT 1 FROM character_skills WHERE character_id = $1 AND skill_key = $2',
        [actorId, skillKey]
    );
    return result.rows.length > 0;
}


const SUPPORTED_REACTION_SKILL_NAMES = new Set([
    // 攻擊指定時
    '守護',
    '奉獻',
    '快速移位',
    '障壁',
    '偏斜',
    '撥擋',
    '箭擊掩護',
    '重擊聲援',
    '破陣',
    '精準打擊',
    '鋒銳',
    '獵鷹之眼',
    '光導',

    // 行動 / 傷害後
    '快速治療',
    '重燃',
    '預後',
    '堅守',
    '震怒',
    '沉重反擊',
    '城墻反擊'
]);

function isContextReactionSkill(skill) {
    return Boolean(
        skill &&
        SUPPORTED_REACTION_SKILL_NAMES.has(skill.name)
    );
}

function reactionCostAvailable(character, skill) {
    const cost = parseCost(skill?.cost);
    if (!cost.type || cost.amount <= 0) return true;
    return Number(character?.[cost.type] || 0) >= cost.amount;
}

async function equippedSkillRows(client) {
    const result = await client.query(`
        SELECT
            c.*,
            cs.skill_key
        FROM character_skills cs
        JOIN characters c ON c.id = cs.character_id
        WHERE c.hp > 0
        ORDER BY c.id, cs.slot_index
    `);

    return result.rows
        .map(row => ({
            character: row,
            skill: ALL_EQUIPPABLE_SKILLS.get(row.skill_key)
        }))
        .filter(item => item.skill);
}

function reactionOptionId(actorId, skillKey, targetId = 0) {
    return `${Number(actorId)}:${skillKey}:${Number(targetId || 0)}`;
}

function reactionOption(character, skill, {
    targetId = null,
    targetName = '',
    note = '',
    meta = {}
} = {}) {
    return {
        id: reactionOptionId(character.id, skill.key, targetId),
        actorId: Number(character.id),
        actorName: character.name,
        actorKind: character.kind || 'player',
        skillKey: skill.key,
        skillName: skill.name,
        timing: skill.timing,
        cost: skill.cost,
        weapon: skill.weapon,
        effect: skill.effect,
        targetId: targetId === null ? null : Number(targetId),
        targetName,
        note,
        meta
    };
}

function attackDescriptor(skill) {
    const effect = String(skill?.effect || '');
    const packets = parseDamagePackets(effect);

    return {
        melee: effect.includes('近戰攻擊'),
        ranged: effect.includes('遠程攻擊'),
        physical: packets.some(packet => packet.damageType === '物理'),
        magical: packets.some(packet => packet.damageType === '魔法')
    };
}

async function collectAttackDeclaredReactionOptions(
    client,
    actor,
    target,
    skill
) {
    const descriptor = attackDescriptor(skill);
    const rows = await equippedSkillRows(client);
    const options = [];

    for (const { character, skill: reactionSkill } of rows) {
        if (!isContextReactionSkill(reactionSkill)) continue;
        if (!reactionCostAvailable(character, reactionSkill)) continue;

        const reactorId = Number(character.id);
        const actorId = Number(actor.id);
        const targetId = Number(target.id);
        const sameSideTarget =
            (character.kind || 'player') === (target.kind || 'player');
        const sameSideActor =
            (character.kind || 'player') === (actor.kind || 'player');

        let eligible = false;
        let note = '';

        switch (reactionSkill.name) {
            case '守護':
            case '奉獻':
            case '快速移位':
                eligible =
                    sameSideTarget &&
                    reactorId !== targetId;
                note = `代替 ${target.name} 承受本次攻擊`;
                break;

            case '障壁':
                eligible = sameSideTarget;
                note = `使 ${target.name} 下一次受到的傷害 -25%`;
                break;

            case '偏斜':
                eligible = reactorId === targetId;
                note = '對本次攻擊進行格擋';
                break;

            case '撥擋':
                eligible =
                    reactorId === targetId &&
                    descriptor.melee;
                note = '使本次攻擊其中一段傷害無效，並 AP+1';
                break;

            case '箭擊掩護':
                eligible =
                    sameSideTarget &&
                    reactorId !== targetId &&
                    descriptor.ranged &&
                    descriptor.physical;
                note = `使 ${target.name} 本次遠程物理攻擊傷害無效`;
                break;

            case '重擊聲援':
                eligible =
                    sameSideActor &&
                    reactorId !== actorId;
                note = `使 ${actor.name} 本次攻擊暴擊率 +50%`;
                break;

            case '破陣':
            case '精準打擊':
            case '鋒銳':
                eligible = reactorId === actorId;
                break;

            case '獵鷹之眼':
                eligible =
                    reactorId === actorId &&
                    descriptor.ranged;
                break;

            case '光導':
                eligible =
                    sameSideActor &&
                    reactorId !== actorId;
                note = `支援 ${actor.name} 本次攻擊`;
                break;
        }

        if (!eligible) continue;

        options.push(reactionOption(character, reactionSkill, {
            targetId,
            targetName: target.name,
            note,
            meta: {
                originalActorId: actorId,
                originalTargetId: targetId,
                descriptor
            }
        }));
    }

    return options;
}

function targetResultPhysicalHit(targetResult) {
    return (targetResult?.packets || []).some(
        packet =>
            packet?.hit === true &&
            packet?.damageType === '物理'
    );
}

async function collectPostActionReactionOptions(
    client,
    actor,
    skill,
    payload,
    cost
) {
    const rows = await equippedSkillRows(client);
    const options = [];
    const damages = Array.isArray(payload?.targets) ? payload.targets : [];
    const heals = Array.isArray(payload?.heals) ? payload.heals : [];

    for (const { character, skill: reactionSkill } of rows) {
        if (!isContextReactionSkill(reactionSkill)) continue;
        if (!reactionCostAvailable(character, reactionSkill)) continue;

        const reactorId = Number(character.id);
        const sourceActorId = Number(actor.id);
        const sameSideSource =
            (character.kind || 'player') === (actor.kind || 'player');

        if (reactionSkill.name === '快速治療') {
            for (const damage of damages) {
                const targetRow = await client.query(
                    'SELECT id, name, kind, hp FROM characters WHERE id = $1',
                    [damage.targetId]
                );
                const damaged = targetRow.rows[0];
                if (!damaged) continue;

                const sameSide =
                    (character.kind || 'player') ===
                    (damaged.kind || 'player');

                if (
                    sameSide &&
                    Number(damage.hpLoss || 0) > 0 &&
                    Number(damaged.hp) > 0
                ) {
                    options.push(reactionOption(character, reactionSkill, {
                        targetId: damaged.id,
                        targetName: damaged.name,
                        note: `${damaged.name} 剛受到 ${damage.hpLoss} 點 HP 傷害`,
                        meta: {
                            damagedTargetId: Number(damaged.id),
                            sourceActorId
                        }
                    }));
                }
            }
            continue;
        }

        if (reactionSkill.name === '堅守') {
            const selfDamage = damages.find(
                item =>
                    Number(item.targetId) === reactorId &&
                    Number(item.hpLoss || 0) > 0 &&
                    targetResultPhysicalHit(item)
            );

            if (selfDamage) {
                options.push(reactionOption(character, reactionSkill, {
                    targetId: reactorId,
                    targetName: character.name,
                    note: '自身剛受到物理傷害，可疊加堅守'
                }));
            }
            continue;
        }

        if (reactionSkill.name === '震怒') {
            const allyDamage = damages.find(item => {
                if (Number(item.hpLoss || 0) <= 0) return false;
                if (Number(item.targetId) === reactorId) return false;

                const target = item.targetSnapshot;
                if (target?.kind) {
                    return target.kind === (character.kind || 'player');
                }
                return true;
            });

            if (allyDamage) {
                options.push(reactionOption(character, reactionSkill, {
                    targetId: reactorId,
                    targetName: character.name,
                    note: '其他友方剛受到傷害'
                }));
            }
            continue;
        }

        if (reactionSkill.name === '沉重反擊') {
            const selfAttack = damages.find(
                item => Number(item.targetId) === reactorId
            );

            if (selfAttack && skill.actionCode === 'ATTACK') {
                options.push(reactionOption(character, reactionSkill, {
                    targetId: sourceActorId,
                    targetName: actor.name,
                    note: `對 ${actor.name} 進行反擊`,
                    meta: { sourceActorId }
                }));
            }
            continue;
        }

        if (reactionSkill.name === '城墻反擊') {
            const selfAttack = damages.find(
                item => Number(item.targetId) === reactorId
            );

            if (
                selfAttack &&
                skill.actionCode === 'ATTACK' &&
                Number(selfAttack.hpLoss || 0) < 1
            ) {
                options.push(reactionOption(character, reactionSkill, {
                    targetId: sourceActorId,
                    targetName: actor.name,
                    note: '本次攻擊造成低於 1 點 HP 傷害',
                    meta: { sourceActorId }
                }));
            }
            continue;
        }

        if (reactionSkill.name === '重燃') {
            if (
                cost?.type === 'sp' &&
                Number(cost.amount || 0) > 0 &&
                sameSideSource &&
                reactorId !== sourceActorId
            ) {
                options.push(reactionOption(character, reactionSkill, {
                    targetId: sourceActorId,
                    targetName: actor.name,
                    note: `${actor.name} 剛消耗 SP 發動輔助戰技`
                }));
            }
            continue;
        }

        if (reactionSkill.name === '預後') {
            if (
                reactorId === sourceActorId &&
                heals.some(item => Number(item.heal || 0) > 0)
            ) {
                options.push(reactionOption(character, reactionSkill, {
                    targetId: sourceActorId,
                    targetName: actor.name,
                    note: '自身剛造成恢復效果，可把 50% 實際治療量轉成護盾',
                    meta: {
                        heals: heals.filter(
                            item => Number(item.heal || 0) > 0
                        )
                    }
                }));
            }
        }
    }

    // 同一角色 / 戰技 / 目標只保留一次。
    const unique = new Map();
    for (const option of options) unique.set(option.id, option);
    return [...unique.values()];
}

function mapReactionWindow(row) {
    if (!row) return null;

    return {
        id: Number(row.id),
        triggerType: row.trigger_type,
        blocking: Boolean(row.blocking),
        status: row.status,
        sourceActorId: row.source_actor_id,
        sourceTargetId: row.source_target_id,
        sourceSkillKey: row.source_skill_key,
        round: Number(row.round_number),
        turnPass: Number(row.turn_pass),
        context: row.context || {},
        options: Array.isArray(row.options) ? row.options : [],
        resumePayload: row.resume_payload || null,
        resolution: row.resolution || {},
        createdAt: row.created_at
    };
}

async function createReactionWindow(client, {
    triggerType,
    blocking = false,
    sourceActorId = null,
    sourceTargetId = null,
    sourceSkillKey = null,
    round,
    turnPass,
    context = {},
    options = [],
    resumePayload = null
}) {
    if (!options.length) return null;

    const result = await client.query(`
        INSERT INTO reaction_windows (
            trigger_type, blocking, status,
            source_actor_id, source_target_id, source_skill_key,
            round_number, turn_pass,
            context, options, resume_payload
        )
        VALUES (
            $1, $2, 'open',
            $3, $4, $5,
            $6, $7,
            $8::jsonb, $9::jsonb, $10::jsonb
        )
        RETURNING *
    `, [
        triggerType,
        blocking,
        sourceActorId,
        sourceTargetId,
        sourceSkillKey,
        round,
        turnPass,
        JSON.stringify(context),
        JSON.stringify(options),
        resumePayload ? JSON.stringify(resumePayload) : null
    ]);

    return mapReactionWindow(result.rows[0]);
}

async function latestOpenReaction(db = pool) {
    const result = await db.query(`
        SELECT *
        FROM reaction_windows
        WHERE status IN ('open', 'ready')
        ORDER BY id DESC
        LIMIT 1
    `);

    return result.rows.length
        ? mapReactionWindow(result.rows[0])
        : null;
}

async function expireNonBlockingReactions(client) {
    const result = await client.query(`
        UPDATE reaction_windows
        SET status = 'expired',
            resolved_at = NOW()
        WHERE status = 'open'
          AND blocking = FALSE
        RETURNING id
    `);

    return result.rows.map(row => Number(row.id));
}

async function addShieldValue(
    client,
    characterId,
    amount,
    sourceSkillKey,
    sourceCharacterId
) {
    const shield = Math.max(0, Math.floor(Number(amount || 0)));
    if (!shield) return 0;

    const current = await client.query(`
        SELECT value_num
        FROM character_buffs
        WHERE character_id = $1
          AND buff_key = 'life_shield'
        FOR UPDATE
    `, [characterId]);

    const currentValue = Number(current.rows[0]?.value_num || 0);
    const nextValue = currentValue + shield;

    await applyBuffToCharacters(
        client,
        [characterId],
        'life_shield',
        {
            sourceSkillKey,
            sourceCharacterId,
            valueNum: nextValue
        }
    );

    return nextValue;
}

async function appendPrognosisOptionIfAvailable(
    client,
    options,
    healerId,
    heals
) {
    if (!Array.isArray(heals) || !heals.some(item => Number(item.heal || 0) > 0)) {
        return options;
    }

    const result = await client.query(`
        SELECT c.*, cs.skill_key
        FROM character_skills cs
        JOIN characters c ON c.id = cs.character_id
        WHERE c.id = $1
          AND cs.skill_key = '織光者:預後'
        LIMIT 1
    `, [healerId]);

    if (!result.rows.length) return options;

    const character = result.rows[0];
    const skill = ALL_EQUIPPABLE_SKILLS.get(character.skill_key);
    if (!skill || !reactionCostAvailable(character, skill)) return options;

    const option = reactionOption(character, skill, {
        targetId: healerId,
        targetName: character.name,
        note: '剛造成恢復效果，可把 50% 實際治療量轉成護盾',
        meta: {
            heals: heals.filter(item => Number(item.heal || 0) > 0)
        }
    });

    if (!options.some(item => item.id === option.id)) {
        return [...options, option];
    }

    return options;
}


// ---------- 即時聊天室 / 戰鬥紀錄 ----------

app.get('/api/chat/messages', async (req, res) => {
    const channel = req.query.channel === 'combat' ? 'combat' : 'team';
    const limit = clamp(number(req.query.limit, 100), 1, 200);

    try {
        const result = await pool.query(`
            SELECT *
            FROM (
                SELECT *
                FROM chat_messages
                WHERE channel = $1
                ORDER BY id DESC
                LIMIT $2
            ) messages
            ORDER BY id ASC
        `, [channel, limit]);

        res.json(result.rows.map(mapChatMessage));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '讀取聊天室失敗' });
    }
});


app.delete('/api/chat/messages', async (req, res) => {
    const channel = req.query.channel === 'team' ? 'team' : 'combat';

    try {
        await pool.query('DELETE FROM chat_messages WHERE channel = $1', [channel]);
        io.emit('chat:cleared', { channel });
        res.json({ success: true, channel });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '清空聊天室失敗' });
    }
});

app.post('/api/chat/messages', async (req, res) => {
    const characterId = number(req.body.characterId);
    const content = String(req.body.content || '').trim().slice(0, 2000);

    if (!content) return res.status(400).json({ error: '訊息不能是空白' });

    try {
        const character = await getCharacterById(characterId);
        if (!character) return res.status(404).json({ error: '找不到聊天角色' });

        const message = await insertChatMessage(pool, {
            channel: 'team',
            characterId: character.id,
            characterName: character.name,
            characterKind: character.kind,
            content
        });

        io.emit('chat:message', message);
        res.json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '傳送訊息失敗' });
    }
});

// ---------- 戰場紀錄 ----------

app.get('/api/combat/logs', async (req, res) => {
    const limit = clamp(number(req.query.limit, 250), 1, 500);

    try {
        const result = await pool.query(`
            SELECT *
            FROM (
                SELECT *
                FROM battle_events
                ORDER BY id DESC
                LIMIT $1
            ) events
            ORDER BY id ASC
        `, [limit]);

        res.json(result.rows.map(mapBattleEvent));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '讀取戰場紀錄失敗' });
    }
});


app.delete('/api/combat/logs', async (_req, res) => {
    try {
        await pool.query('DELETE FROM battle_events');
        io.emit('battle:logs-cleared');
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '清空戰場紀錄失敗' });
    }
});

// ---------- 基礎戰技 ----------

app.get('/api/combat/skills', async (req, res) => {
    const actorId = number(req.query.actorId);

    try {
        const base = Object.values(SKILL_CATALOG);
        if (!actorId) return res.json(base);

        const actor = await getCharacterById(actorId);
        if (!actor) return res.status(404).json({ error: '找不到行動角色' });

        const equipped = (actor.equippedSkills || [])
            .filter(skill => !isContextReactionSkill(skill))
            .map(skill => ({
                ...skill,
                needsRoll: skill.actionCode === 'ATTACK'
            }));

        res.json([...base, ...equipped]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '讀取可用戰技失敗' });
    }
});

app.get('/api/combat/state', async (_req, res) => {
    try {
        res.json(await getCombatState());
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '讀取戰鬥順序失敗' });
    }
});


app.get('/api/combat/reactions/open', async (_req, res) => {
    try {
        res.json(await latestOpenReaction());
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '讀取反應時點失敗' });
    }
});

app.post('/api/combat/reactions/:id/respond', async (req, res) => {
    const reactionId = number(req.params.id);
    const action = String(req.body.action || 'use');
    const optionId = String(req.body.optionId || '');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reactionResult = await client.query(`
            SELECT *
            FROM reaction_windows
            WHERE id = $1
              AND status = 'open'
            FOR UPDATE
        `, [reactionId]);

        if (!reactionResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: '這個反應時點已經結束' });
        }

        const row = reactionResult.rows[0];
        const window = mapReactionWindow(row);
        const clock = {
            round: Number(row.round_number),
            turnPass: Number(row.turn_pass)
        };

        if (action === 'skip') {
            if (window.blocking) {
                await client.query(`
                    UPDATE reaction_windows
                    SET status = 'ready',
                        resolution = $2::jsonb,
                        resolved_at = NOW()
                    WHERE id = $1
                `, [
                    reactionId,
                    JSON.stringify({
                        targetId: window.resumePayload?.targetId,
                        flags: {}
                    })
                ]);
            } else {
                await client.query(`
                    UPDATE reaction_windows
                    SET status = 'skipped',
                        resolved_at = NOW()
                    WHERE id = $1
                `, [reactionId]);
            }

            await client.query('COMMIT');

            const updated = await pool.query(
                'SELECT * FROM reaction_windows WHERE id = $1',
                [reactionId]
            );
            const mapped = mapReactionWindow(updated.rows[0]);

            io.emit(
                window.blocking ? 'combat:reaction-updated' : 'combat:reaction-closed',
                window.blocking ? mapped : { id: reactionId }
            );

            return res.json({
                success: true,
                window: mapped,
                resume: window.blocking
            });
        }

        const option = window.options.find(item => item.id === optionId);
        if (!option) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '找不到這個反應戰技' });
        }

        const reactionSkill = ALL_EQUIPPABLE_SKILLS.get(option.skillKey);
        if (!reactionSkill) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '反應戰技資料不存在' });
        }

        if (!(await actorHasSkill(client, option.actorId, option.skillKey))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '該角色目前沒有攜帶這個戰技' });
        }

        const reactorResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [option.actorId]
        );
        const reactor = reactorResult.rows[0];

        if (!reactor || Number(reactor.hp) <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '反應角色目前無法行動' });
        }

        const cost = await spendSkillCost(client, reactor, reactionSkill);
        let reactionText = '';
        let charactersChanged = cost.amount > 0;
        let battlefieldChanged = false;
        let nextOptions = window.options.filter(item => item.id !== option.id);

        if (window.triggerType === 'attack_declared') {
            const resume = {
                ...(window.resumePayload || {})
            };
            const flags = {
                ...(window.resolution?.flags || {})
            };

            const originalTargetId =
                Number(window.context?.targetId || resume.targetId);

            switch (reactionSkill.name) {
                case '守護':
                    resume.targetId = Number(reactor.id);
                    await applyBuffToCharacters(
                        client,
                        [reactor.id],
                        'guard_ready',
                        {
                            sourceSkillKey: reactionSkill.key,
                            sourceCharacterId: reactor.id
                        }
                    );
                    charactersChanged = true;
                    reactionText =
                        `${reactor.name} 發動「守護」，代替目標承受攻擊並進行格擋。`;
                    break;

                case '奉獻':
                    resume.targetId = Number(reactor.id);
                    flags.ignoreDefenseTargetId = Number(reactor.id);

                    // 戰技本身消耗 1SP，效果再讓自己 SP+1。
                    await client.query(`
                        UPDATE characters
                        SET sp = LEAST(max_sp, sp + 1)
                        WHERE id = $1
                    `, [reactor.id]);
                    charactersChanged = true;
                    reactionText =
                        `${reactor.name} 發動「奉獻」，代為承受攻擊；` +
                        `本次自身防禦與魔抗視為 0，並 SP+1。`;
                    break;

                case '快速移位':
                    await swapCharacterPositions(
                        client,
                        reactor.id,
                        originalTargetId
                    );
                    resume.targetId = Number(reactor.id);
                    battlefieldChanged = true;
                    reactionText =
                        `${reactor.name} 發動「快速移位」，與原目標交換位置並代受本次攻擊。`;
                    break;

                case '障壁':
                    await applyBuffToCharacters(
                        client,
                        [originalTargetId],
                        'barrier',
                        {
                            sourceSkillKey: reactionSkill.key,
                            sourceCharacterId: reactor.id
                        }
                    );
                    charactersChanged = true;
                    reactionText =
                        `${reactor.name} 發動「障壁」，使原目標下一次受到的傷害 -25%。`;
                    break;

                case '偏斜':
                    await applyBuffToCharacters(
                        client,
                        [originalTargetId],
                        'guard_ready',
                        {
                            sourceSkillKey: reactionSkill.key,
                            sourceCharacterId: reactor.id
                        }
                    );
                    await applyDebuffBundle(
                        client,
                        [window.sourceActorId],
                        ['damage_taken_up_25'],
                        {
                            sourceSkillKey: reactionSkill.key,
                            sourceCharacterId: reactor.id,
                            currentRound: clock.round
                        }
                    );
                    charactersChanged = true;
                    reactionText =
                        `${reactor.name} 發動「偏斜」：本次攻擊進行格擋，攻擊者獲得【易傷】。`;
                    break;

                case '撥擋':
                    flags.negateOneSegmentTargetId = originalTargetId;
                    await client.query(`
                        UPDATE characters
                        SET ap = LEAST(max_ap, ap + 1)
                        WHERE id = $1
                    `, [reactor.id]);
                    charactersChanged = true;
                    reactionText =
                        `${reactor.name} 發動「撥擋」：本次攻擊其中一段傷害無效，AP+1。`;
                    break;

                case '箭擊掩護':
                    flags.negateAllDamageTargetId = originalTargetId;
                    reactionText =
                        `${reactor.name} 發動「箭擊掩護」：原目標本次遠程物理攻擊傷害無效。`;
                    break;

                case '重擊聲援':
                    flags.critFlat = Number(flags.critFlat || 0) + 50;
                    reactionText =
                        `${reactor.name} 發動「重擊聲援」：本次攻擊暴擊率 +50%。`;
                    break;

                case '破陣':
                    flags.unblockable = true;
                    flags.applyBlockSealOnHit = true;
                    reactionText =
                        `${reactor.name} 發動「破陣」：本次攻擊無法格擋，命中時施加【格擋封印】。`;
                    break;

                case '精準打擊':
                    flags.critDamageBonus = Number(flags.critDamageBonus || 0) + 50;
                    reactionText =
                        `${reactor.name} 發動「精準打擊」：本次攻擊暴擊傷害 +50%。`;
                    break;

                case '鋒銳':
                    flags.applyBleedOnHit = true;
                    reactionText =
                        `${reactor.name} 發動「鋒銳」：本次攻擊命中時施加【流血】。`;
                    break;

                case '獵鷹之眼':
                    flags.cannotEvade = true;
                    reactionText =
                        `${reactor.name} 發動「獵鷹之眼」：本次遠程攻擊【無法迴避】。`;
                    break;

                case '光導':
                    flags.cannotEvade = true;
                    flags.cannotCrit = true;
                    reactionText =
                        `${reactor.name} 發動「光導」：本次攻擊【無法迴避】、【無法暴擊】。`;
                    break;

                default:
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: '這個攻擊反應尚未建立自動效果' });
            }

            await client.query(`
                UPDATE reaction_windows
                SET status = 'ready',
                    resolution = $2::jsonb,
                    resolved_at = NOW()
                WHERE id = $1
            `, [
                reactionId,
                JSON.stringify({
                    targetId: resume.targetId,
                    flags
                })
            ]);
        } else {
            switch (reactionSkill.name) {
                case '快速治療': {
                    const targetId = Number(option.targetId);
                    const effectiveMagic = await sourceEffectiveMagic(
                        client,
                        reactor.id
                    );
                    const requestedHeal = Math.max(
                        1,
                        Math.floor(effectiveMagic * 0.75)
                    );

                    const targetResult = await client.query(
                        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
                        [targetId]
                    );
                    const target = targetResult.rows[0];

                    if (!target) {
                        throw new Error('快速治療的目標已不存在');
                    }

                    const oldHp = Number(target.hp);
                    const newHp = Math.min(
                        Number(target.max_hp),
                        oldHp + requestedHeal
                    );
                    const actualHeal = Math.max(0, newHp - oldHp);

                    if (actualHeal > 0) {
                        await client.query(
                            'UPDATE characters SET hp = $1 WHERE id = $2',
                            [newHp, targetId]
                        );
                        charactersChanged = true;
                    }

                    nextOptions = await appendPrognosisOptionIfAvailable(
                        client,
                        nextOptions,
                        reactor.id,
                        [{
                            targetId,
                            targetName: target.name,
                            heal: actualHeal,
                            oldHp,
                            newHp
                        }]
                    );

                    reactionText =
                        `${reactor.name} 發動「快速治療」→ ${target.name}：` +
                        `HP ${oldHp} → ${newHp}` +
                        (actualHeal ? `（+${actualHeal}）` : '（未產生有效恢復）');
                    break;
                }

                case '預後': {
                    const heals = Array.isArray(option.meta?.heals)
                        ? option.meta.heals
                        : [];
                    const shieldLines = [];

                    for (const heal of heals) {
                        const shieldGain = Math.floor(
                            Number(heal.heal || 0) * 0.5
                        );
                        if (shieldGain <= 0) continue;

                        const totalShield = await addShieldValue(
                            client,
                            heal.targetId,
                            shieldGain,
                            reactionSkill.key,
                            reactor.id
                        );

                        shieldLines.push(
                            `${heal.targetName || `#${heal.targetId}`} +${shieldGain} 護盾（目前 ${totalShield}）`
                        );
                    }

                    charactersChanged = shieldLines.length > 0 || charactersChanged;
                    reactionText =
                        `${reactor.name} 發動「預後」：` +
                        (
                            shieldLines.length
                                ? shieldLines.join('；')
                                : '本次沒有可轉換的實際治療量'
                        );
                    break;
                }

                case '重燃': {
                    const targetId = Number(option.targetId);
                    const targetResult = await client.query(
                        'SELECT name, sp, max_sp FROM characters WHERE id = $1 FOR UPDATE',
                        [targetId]
                    );
                    const target = targetResult.rows[0];
                    if (!target) throw new Error('重燃目標已不存在');

                    const oldSp = Number(target.sp);
                    const newSp = Math.min(
                        Number(target.max_sp),
                        oldSp + 1
                    );

                    await client.query(
                        'UPDATE characters SET sp = $1 WHERE id = $2',
                        [newSp, targetId]
                    );
                    charactersChanged = true;

                    reactionText =
                        `${reactor.name} 發動「重燃」→ ${target.name}：SP ${oldSp} → ${newSp}。`;
                    break;
                }

                case '堅守':
                    await applyBuffToCharacters(
                        client,
                        [reactor.id],
                        'steadfast',
                        {
                            sourceSkillKey: reactionSkill.key,
                            sourceCharacterId: reactor.id,
                            expiresRound: clock.round
                        }
                    );
                    charactersChanged = true;
                    reactionText =
                        `${reactor.name} 發動「堅守」：本輪防禦 +25%、格擋率 +25%（可疊加）。`;
                    break;

                case '震怒':
                    await applyBuffToCharacters(
                        client,
                        [reactor.id],
                        'rage',
                        {
                            sourceSkillKey: reactionSkill.key,
                            sourceCharacterId: reactor.id,
                            expiresRound: clock.round
                        }
                    );
                    charactersChanged = true;
                    reactionText =
                        `${reactor.name} 發動「震怒」：本輪造成傷害 +25%、命中 +25（可疊加）。`;
                    break;

                case '沉重反擊': {
                    const targetId = Number(option.targetId);
                    const attackerResult = await client.query(
                        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
                        [targetId]
                    );
                    const attacker = attackerResult.rows[0];
                    if (!attacker) throw new Error('反擊目標已不存在');

                    const reactorBuffs = await getCharacterBuffEntries(
                        client,
                        reactor.id
                    );
                    const reactorMods = buffModifiers(reactorBuffs);
                    const attackerBuffs = await getCharacterBuffEntries(
                        client,
                        attacker.id
                    );
                    const attackerMods = buffModifiers(attackerBuffs);

                    const attackValue = Math.floor(
                        Number(reactor.patk) * reactorMods.patkMult
                    );
                    const defenseValue = Math.floor(
                        Number(attacker.defense) * attackerMods.defenseMult
                    );
                    const damage = Math.max(
                        1,
                        Math.floor(attackValue * 0.5 - defenseValue)
                    );
                    const result = await applyDirectHpLoss(
                        client,
                        attacker.id,
                        damage
                    );
                    charactersChanged = result.loss > 0 || charactersChanged;

                    reactionText =
                        `${reactor.name} 發動「沉重反擊」→ ${attacker.name}：損失 ${result.loss} HP。`;
                    break;
                }

                case '城墻反擊': {
                    const targetId = Number(option.targetId);
                    const attackerResult = await client.query(
                        'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
                        [targetId]
                    );
                    const attacker = attackerResult.rows[0];
                    if (!attacker) throw new Error('城墻反擊目標已不存在');

                    const reactorBuffs = await getCharacterBuffEntries(
                        client,
                        reactor.id
                    );
                    const reactorMods = buffModifiers(reactorBuffs);
                    const defense = Math.floor(
                        Number(reactor.defense) *
                        reactorMods.defenseMult
                    );

                    const result = await applyDirectHpLoss(
                        client,
                        attacker.id,
                        defense
                    );
                    charactersChanged = result.loss > 0 || charactersChanged;

                    reactionText =
                        `${reactor.name} 發動「城墻反擊」→ ${attacker.name}：` +
                        `依有效防禦使其損失 ${result.loss} HP。`;
                    break;
                }

                default:
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: '這個後續反應尚未建立自動效果' });
            }

            const nextStatus =
                nextOptions.length > 0
                    ? 'open'
                    : 'resolved';

            await client.query(`
                UPDATE reaction_windows
                SET options = $2::jsonb,
                    status = $3,
                    resolved_at = CASE WHEN $3 = 'resolved' THEN NOW() ELSE resolved_at END
                WHERE id = $1
            `, [
                reactionId,
                JSON.stringify(nextOptions),
                nextStatus
            ]);
        }

        const reactionMessage = await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'reaction',
            characterId: reactor.id,
            characterName: reactor.name,
            characterKind: reactor.kind || 'player',
            content: `↯ ${reactionText}`,
            payload: {
                reactionWindowId: reactionId,
                skillKey: reactionSkill.key,
                sourceSkillKey: window.sourceSkillKey
            }
        });

        const reactionEvent = await insertBattleEvent(client, {
            eventType: 'reaction',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId: reactor.id,
            targetId: option.targetId,
            content: reactionText,
            payload: {
                reactionWindowId: reactionId,
                skillKey: reactionSkill.key,
                sourceSkillKey: window.sourceSkillKey
            }
        });

        await client.query('COMMIT');

        const updatedResult = await pool.query(
            'SELECT * FROM reaction_windows WHERE id = $1',
            [reactionId]
        );
        const updatedWindow = mapReactionWindow(updatedResult.rows[0]);

        io.emit('chat:message', reactionMessage);
        io.emit('battle:event', reactionEvent);

        if (charactersChanged) io.emit('characters:changed');

        if (battlefieldChanged) {
            io.emit('battlefield:changed', {
                reason: 'reaction-swap'
            });
        }

        if (
            updatedWindow.status === 'open' ||
            updatedWindow.status === 'ready'
        ) {
            io.emit('combat:reaction-updated', updatedWindow);
        } else {
            io.emit('combat:reaction-closed', {
                id: reactionId
            });
        }

        return res.json({
            success: true,
            message: reactionMessage,
            window: updatedWindow,
            resume: updatedWindow.status === 'ready'
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {}

        console.error(error);
        return res.status(500).json({
            error: error.message || '反應戰技執行失敗'
        });
    } finally {
        client.release();
    }
});

app.post('/api/combat/use-skill', async (req, res) => {
    const actorId = number(req.body.actorId);
    let targetId = number(req.body.targetId, actorId);
    const requestedDirection = String(req.body.direction || '').toUpperCase();
    const skillKey = String(req.body.skillKey || '');
    const reactionResumeId = number(req.body.reactionResumeId, 0);
    let reactionFlags = {};
    const skill = SKILL_CATALOG[skillKey] || ALL_EQUIPPABLE_SKILLS.get(skillKey);

    if (!skill) return res.status(400).json({ error: '未知的戰技' });
    if (skill.manual === false || skill.actionCode === 'PASSIVE') {
        return res.status(400).json({ error: '被動戰技不需要手動發動' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (reactionResumeId) {
            const claimed = await client.query(`
                UPDATE reaction_windows
                SET status = 'resolving'
                WHERE id = $1
                  AND status = 'ready'
                  AND blocking = TRUE
                RETURNING *
            `, [reactionResumeId]);

            if (!claimed.rows.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: '反應時點已被其他玩家結算或已失效'
                });
            }

            const resumeWindow = mapReactionWindow(claimed.rows[0]);
            const resume = resumeWindow.resumePayload || {};
            const resolution = resumeWindow.resolution || {};

            if (
                Number(resume.actorId) !== actorId ||
                String(resume.skillKey) !== skillKey
            ) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: '反應時點與目前戰技不一致'
                });
            }

            targetId = Number(resolution.targetId || resume.targetId || targetId);
            reactionFlags = resolution.flags || {};
        } else {
            const blockingReaction = await client.query(`
                SELECT id
                FROM reaction_windows
                WHERE status IN ('open', 'ready')
                  AND blocking = TRUE
                ORDER BY id DESC
                LIMIT 1
            `);

            if (blockingReaction.rows.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: '請先處理目前的攻擊反應時點'
                });
            }

            const expiredIds = await expireNonBlockingReactions(client);
            if (expiredIds.length) {
                process.nextTick(() => {
                    for (const id of expiredIds) {
                        io.emit('combat:reaction-closed', { id });
                    }
                });
            }
        }

        if (!(await actorHasSkill(client, actorId, skillKey))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '這個角色目前沒有攜帶該戰技' });
        }

        const actorResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [actorId]
        );

        if (!actorResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到行動角色' });
        }

        const actor = actorResult.rows[0];

        if (
            (skill.targetCode || 'SELF') === 'SELF' ||
            (skill.targetCode || '') === 'ALL_ALLIES'
        ) {
            targetId = actorId;
        }

        const targetResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [targetId]
        );

        if (!targetResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到目標' });
        }

        const target = targetResult.rows[0];

        if (!targetAllowed(skill, actor, target)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error:
                    skill.actionCode === 'ATTACK'
                        ? '攻擊戰技只能指定仍存活的敵方'
                        : skill.actionCode === 'HEAL'
                            ? '恢復戰技只能指定符合條件的友方'
                            : '這個目標不符合戰技的指定條件'
            });
        }

        const battleState = await getBattleClock(client, true);

        // 攻擊先進入「指定目標」時點。
        // 只有真的攜帶對應反應戰技、且資源足夠的角色才會出現在面板。
        if (
            skill.actionCode === 'ATTACK' &&
            !reactionResumeId
        ) {
            const reactionOptions =
                await collectAttackDeclaredReactionOptions(
                    client,
                    actor,
                    target,
                    skill
                );

            if (reactionOptions.length) {
                const reactionWindow = await createReactionWindow(
                    client,
                    {
                        triggerType: 'attack_declared',
                        blocking: true,
                        sourceActorId: actor.id,
                        sourceTargetId: target.id,
                        sourceSkillKey: skill.key,
                        round: battleState.round,
                        turnPass: battleState.turnPass,
                        context: {
                            actorId: Number(actor.id),
                            actorName: actor.name,
                            targetId: Number(target.id),
                            targetName: target.name,
                            skillName: skill.name,
                            attack: attackDescriptor(skill)
                        },
                        options: reactionOptions,
                        resumePayload: {
                            actorId: Number(actor.id),
                            skillKey: skill.key,
                            targetId: Number(target.id),
                            direction: requestedDirection || null
                        }
                    }
                );

                const declareText =
                    `⚔ ${actor.name} 宣言「${skill.name}」→ ${target.name}\n` +
                    `等待可用反應戰技：` +
                    reactionOptions.map(
                        item => `${item.actorName}「${item.skillName}」`
                    ).join('、');

                const declarationMessage =
                    await insertChatMessage(client, {
                        channel: 'combat',
                        messageType: 'attack_declare',
                        characterId: actor.id,
                        characterName: actor.name,
                        characterKind: actor.kind || 'player',
                        content: declareText,
                        payload: {
                            reactionWindowId: reactionWindow.id,
                            skillKey: skill.key,
                            targetId: target.id
                        }
                    });

                const declarationEvent =
                    await insertBattleEvent(client, {
                        eventType: 'attack_declare',
                        round: battleState.round,
                        turnPass: battleState.turnPass,
                        actorId: actor.id,
                        targetId: target.id,
                        content:
                            `${actor.name} 宣言「${skill.name}」指定 ${target.name}，進入反應時點。`,
                        payload: {
                            reactionWindowId: reactionWindow.id,
                            skillKey: skill.key
                        }
                    });

                await client.query('COMMIT');

                io.emit('chat:message', declarationMessage);
                io.emit('battle:event', declarationEvent);
                io.emit('combat:reaction-opened', reactionWindow);

                return res.json({
                    success: true,
                    reactionPending: true,
                    reactionWindow,
                    message: declarationMessage
                });
            }
        }

        // 待機：也是主要行動，因此會受到嘲諷 / 中毒影響。
        if (skill.logicCode === 'WAIT') {
            await enforceActionRestrictions(client, actor, skill, target, requestedDirection);
            const waitStatus = await triggerActionStatuses(
                client,
                actor,
                skill,
                battleState.round
            );

            const content =
                `… ${actor.name} 選擇待機。` +
                (
                    waitStatus.lines.length
                        ? `\n${waitStatus.lines.join('\n')}`
                        : ''
                );

            const message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'wait',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content,
                payload: { skillKey: 'wait', actionCode: 'WAIT' }
            });

            const battleEvent = await insertBattleEvent(client, {
                eventType: 'wait',
                round: battleState.round,
                turnPass: battleState.turnPass,
                actorId: actor.id,
                content:
                    `${actor.name} 選擇待機。` +
                    (
                        waitStatus.lines.length
                            ? ` ${waitStatus.lines.join('；')}`
                            : ''
                    ),
                payload: { skillKey: 'wait' }
            });

            await client.query('COMMIT');
            io.emit('chat:message', message);
            io.emit('battle:event', battleEvent);
            if (waitStatus.changed) io.emit('characters:changed');

            return res.json({
                success: true,
                message,
                result: message.payload
            });
        }

        // 救援：【蓄力1】
        if (skill.logicCode === 'RESCUE') {
            const existing = await client.query(`
                SELECT id
                FROM pending_actions
                WHERE actor_id = $1
                  AND skill_key = 'rescue'
            `, [actorId]);

            if (existing.rows.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `${actor.name} 已經在蓄力「救援」`
                });
            }

            await enforceActionRestrictions(client, actor, skill, target, requestedDirection);

            const rescueStatus = await triggerActionStatuses(
                client,
                actor,
                skill,
                battleState.round
            );

            const cost = await spendSkillCost(client, actor, skill);

            await client.query(`
                INSERT INTO pending_actions (
                    actor_id,
                    target_id,
                    skill_key,
                    created_round,
                    created_turn_pass
                )
                VALUES ($1, $2, 'rescue', $3, $4)
            `, [
                actorId,
                targetId,
                battleState.round,
                battleState.turnPass
            ]);

            const content =
                `✚ ${actor.name} 使用「救援」→ ${target.name}\n` +
                `消耗 ${cost.amount}${String(cost.type || '').toUpperCase()}\n` +
                `⌛ 蓄力1：將在 ${actor.name} 的下一個回合開始時自動發動` +
                (
                    rescueStatus.lines.length
                        ? `\n${rescueStatus.lines.join('\n')}`
                        : ''
                );

            const message = await insertChatMessage(client, {
                channel: 'combat',
                messageType: 'skill',
                characterId: actor.id,
                characterName: actor.name,
                characterKind: actor.kind || 'player',
                content,
                payload: {
                    skillKey,
                    targetId,
                    charging: true
                }
            });

            const battleEvent = await insertBattleEvent(client, {
                eventType: 'skill',
                round: battleState.round,
                turnPass: battleState.turnPass,
                actorId: actor.id,
                targetId: target.id,
                content:
                    `${actor.name} 對 ${target.name} 使用「救援」，` +
                    `消耗 ${cost.amount}${String(cost.type || '').toUpperCase()}，開始蓄力1。`,
                payload: {
                    skillKey,
                    charging: true
                }
            });

            await client.query('COMMIT');
            io.emit('chat:message', message);
            io.emit('battle:event', battleEvent);
            io.emit('characters:changed');

            return res.json({
                success: true,
                message,
                result: message.payload
            });
        }

        const actionRestriction = await enforceActionRestrictions(
            client,
            actor,
            skill,
            target,
            requestedDirection
        );

        const cost = await spendSkillCost(client, actor, skill);

        if (actionRestriction.consumeTaunt) {
            await removeBuffKeys(client, actorId, ['taunt']);
        }

        const actionStatus = await triggerActionStatuses(
            client,
            actor,
            skill,
            battleState.round
        );

        if (actionStatus.changed) {
            const refreshedActor = await client.query(
                'SELECT * FROM characters WHERE id = $1',
                [actorId]
            );
            if (refreshedActor.rows.length) {
                Object.assign(actor, refreshedActor.rows[0]);
            }
        }

        let charactersChanged = cost.amount > 0 || actionStatus.changed;
        let initiativeChanged = false;
        let content = '';
        let payload = {
            skillKey,
            targetId,
            actionCode: skill.actionCode,
            targetCode: skill.targetCode
        };

        // 需要計算時使用完整 Buff entry，讓可疊加 Buff 正確參與公式。
        const combatBuffRows = await client.query(`
            SELECT
                character_id,
                buff_key,
                stack_count,
                value_num
            FROM character_buffs
            WHERE character_id = ANY($1::int[])
        `, [[actorId, targetId]]);

        const actorBuffEntries = combatBuffRows.rows.filter(
            row => Number(row.character_id) === Number(actorId)
        );
        const targetBuffEntries = combatBuffRows.rows.filter(
            row => Number(row.character_id) === Number(targetId)
        );

        const actorBuffKeys = new Set(
            actorBuffEntries.map(row => row.buff_key)
        );
        const targetBuffKeys = new Set(
            targetBuffEntries.map(row => row.buff_key)
        );

        if (skill.actionCode === 'ATTACK') {
            const packets = parseDamagePackets(
                String(skill.effect).split(/若|改為/)[0]
            );

            const attackTargetIds = await resolveAttackTargetIds(
                client,
                actor,
                target,
                skill,
                requestedDirection
            );

            const targetRows = await client.query(`
                SELECT *
                FROM characters
                WHERE id = ANY($1::int[])
                ORDER BY id
                FOR UPDATE
            `, [attackTargetIds]);

            const actorMods = buffModifiers(actorBuffEntries);
            const actorBuffKeys = new Set(
                actorBuffEntries.map(row => row.buff_key)
            );

            // 【使用時】型的數值效果先套用，讓當次攻擊就會吃到。
            if (skill.name === '螺旋劍') {
                await applyDebuffBundle(
                    client,
                    [targetId],
                    ['dodge_down_20'],
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        currentRound: battleState.round
                    }
                );
                await applyBuffToCharacters(
                    client,
                    [actorId],
                    'dodge_up_20',
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        expiresRound: battleState.round
                    }
                );
                charactersChanged = true;
            }

            if (skill.name === '疾風箭') {
                await applyDebuffBundle(
                    client,
                    [targetId],
                    ['dodge_down_50'],
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        currentRound: battleState.round
                    }
                );
                charactersChanged = true;
            }

            const attackHitModifierMatch = String(skill.effect).match(
                /【命中([+-]\d+)】/
            );
            const attackHitModifier = attackHitModifierMatch
                ? Number(attackHitModifierMatch[1])
                : 0;

            const defenseIgnoreMatch = String(skill.effect).match(
                /無視\s*(\d+)%\s*(?:防禦|防禦和魔抗)/
            );
            const defenseIgnoreRate = defenseIgnoreMatch
                ? clamp(Number(defenseIgnoreMatch[1]), 0, 100)
                : 0;

            const skillUnblockable =
                String(skill.effect).includes('【無法格擋】') ||
                String(skill.effect).includes('無法被格擋') ||
                reactionFlags.unblockable === true;

            const skillCannotEvade =
                String(skill.effect).includes('【無法迴避】') ||
                reactionFlags.cannotEvade === true;

            const criticalDamageRate =
                50 +
                Math.max(0, Number(actor.crit_damage_bonus || 0)) +
                Number(reactionFlags.critDamageBonus || 0);
            const criticalMultiplier =
                1 + criticalDamageRate / 100;

            const meleeAttack = String(skill.effect).includes('近戰攻擊');
            const empowerActive =
                meleeAttack &&
                actorMods.empowerMagic > 0 &&
                packets.some(packet => packet.damageType === '物理');

            let darknessAvailable = actorBuffKeys.has('darkness');
            let darknessConsumed = false;
            const targetSummaries = [];
            const allTargetResults = [];
            const allHealResults = [];
            let grandTotalDamage = 0;
            let grandHpLoss = 0;
            let anyAttackHit = false;

            for (const attackTarget of targetRows.rows) {
                // 魂靈風息：同一路線上的友方改成恢復，不進攻擊判定。
                if (
                    skill.name === '魂靈風息' &&
                    (attackTarget.kind || 'player') === (actor.kind || 'player')
                ) {
                    const oldHp = Number(attackTarget.hp);
                    const effectiveMagic = Math.floor(
                        Number(actor.matk) * actorMods.matkMult + actorMods.matkFlat
                    );
                    const heal = Math.max(1, Math.floor(effectiveMagic * 0.75));
                    const newHp = Math.min(Number(attackTarget.max_hp), oldHp + heal);
                    const actualHeal = Math.max(0, newHp - oldHp);

                    if (actualHeal > 0) {
                        await client.query(
                            'UPDATE characters SET hp = $1 WHERE id = $2',
                            [newHp, attackTarget.id]
                        );
                        charactersChanged = true;
                    }

                    targetSummaries.push(
                        `✚ ${attackTarget.name} HP ${oldHp} → ${newHp}` +
                        (actualHeal ? `（+${actualHeal}）` : '')
                    );

                    allHealResults.push({
                        targetId: Number(attackTarget.id),
                        targetName: attackTarget.name,
                        heal: actualHeal,
                        oldHp,
                        newHp
                    });
                    continue;
                }

                const targetBuffEntriesNow = await getCharacterBuffEntries(
                    client,
                    attackTarget.id
                );
                const targetBuffKeysNow = new Set(
                    targetBuffEntriesNow.map(row => row.buff_key)
                );
                const targetMods = buffModifiers(targetBuffEntriesNow);

                const effectiveHit = Math.floor(
                    Number(actor.hit_rate) +
                    actorMods.hitFlat +
                    attackHitModifier
                );

                const effectiveDodge = targetBuffKeysNow.has('frozen')
                    ? 0
                    : Math.floor(
                        Number(attackTarget.dodge) *
                        targetMods.dodgeMult +
                        targetMods.dodgeFlat
                    );

                const effectiveCrit = Math.floor(
                    Number(actor.crit) +
                    actorMods.critFlat +
                    Number(reactionFlags.critFlat || 0)
                );

                const hitThreshold = skillCannotEvade
                    ? effectiveHit
                    : effectiveHit - effectiveDodge;

                const effectiveBlockRate = clamp(
                    Number(attackTarget.block_rate || 0) + targetMods.blockFlat,
                    0,
                    75
                );

                const lines = [];
                const segmentResults = [];
                let rawTotalDamage = 0;
                let segment = 0;
                let anyHit = false;
                let anyPhysicalAttack = false;
                let anyBlock = false;
                let mirageConsumed = false;
                let bleedTriggerCount = 0;

                const bleedingEntry = targetBuffEntriesNow.find(
                    row => row.buff_key === 'bleeding'
                );
                let bleedLossPerHit = 0;
                if (bleedingEntry?.source_character_id) {
                    const bleedMagic = await sourceEffectiveMagic(
                        client,
                        bleedingEntry.source_character_id
                    );
                    bleedLossPerHit = Math.max(
                        1,
                        Math.floor(bleedMagic * 0.5)
                    );
                }

                for (const packet of packets) {
                    for (let i = 0; i < packet.hits; i++) {
                        segment += 1;

                        const roll = Math.floor(Math.random() * 100) + 1;
                        let hit = roll <= hitThreshold;
                        let forcedMissReason = '';

                        // 黑暗：下一段攻擊必定無法命中。
                        if (darknessAvailable) {
                            hit = false;
                            forcedMissReason = '黑暗';
                            darknessAvailable = false;
                            darknessConsumed = true;
                        }

                        // 幻影：下一次原本會命中的攻擊，直接迴避該段。
                        if (
                            hit &&
                            !mirageConsumed &&
                            targetBuffKeysNow.has('mirage')
                        ) {
                            hit = false;
                            forcedMissReason = '幻影';
                            mirageConsumed = true;
                            await removeBuffKeys(
                                client,
                                attackTarget.id,
                                ['mirage']
                            );
                            charactersChanged = true;
                        }

                        anyHit ||= hit;
                        anyAttackHit ||= hit;

                        const physical = packet.damageType === '物理';
                        anyPhysicalAttack ||= physical;

                        const canBlock =
                            hit &&
                            physical &&
                            !skillUnblockable &&
                            !actorMods.unblockable &&
                            !targetMods.blockDisabled &&
                            (targetMods.autoGuard || targetMods.guardReady);

                        const blocked = Boolean(canBlock);
                        anyBlock ||= blocked;

                        // 被格擋的攻擊不能暴擊；魔法傷害本身無法格擋。
                        const critical =
                            hit &&
                            !blocked &&
                            reactionFlags.cannotCrit !== true &&
                            roll <= effectiveCrit;

                        let damage = 0;
                        let bonusMagic = 0;

                        if (hit) {
                            const rawStat =
                                packet.damageType === '魔法'
                                    ? Number(actor.matk)
                                    : Number(actor.patk);

                            const attackMult =
                                packet.damageType === '魔法'
                                    ? actorMods.matkMult
                                    : actorMods.patkMult;

                            const attackFlat =
                                packet.damageType === '魔法'
                                    ? actorMods.matkFlat
                                    : 0;

                            const rawDefense =
                                packet.damageType === '魔法'
                                    ? Number(attackTarget.resist)
                                    : Number(attackTarget.defense);

                            const defenseMult =
                                packet.damageType === '魔法'
                                    ? targetMods.resistMult
                                    : targetMods.defenseMult;

                            const effectiveAttack = Math.floor(
                                rawStat * attackMult + attackFlat
                            );

                            const ignoreDefenseForReaction =
                                Number(reactionFlags.ignoreDefenseTargetId || 0) ===
                                Number(attackTarget.id);

                            const effectiveDefense = ignoreDefenseForReaction
                                ? 0
                                : Math.floor(
                                    rawDefense *
                                    defenseMult *
                                    (1 - defenseIgnoreRate / 100)
                                );

                            const baseDamage = Math.floor(
                                effectiveAttack * packet.multiplier
                            );

                            const blockFactor = blocked
                                ? 1 - effectiveBlockRate / 100
                                : 1;

                            const allDamageModifier = Math.max(
                                0,
                                1 +
                                (actorMods.damageMult - 1) +
                                (targetMods.damageTakenMult - 1)
                            );

                            damage = Math.max(
                                1,
                                Math.floor(
                                    baseDamage *
                                    blockFactor *
                                    allDamageModifier *
                                    (critical ? criticalMultiplier : 1) -
                                    effectiveDefense
                                )
                            );

                            rawTotalDamage += damage;

                            if (bleedLossPerHit > 0) {
                                bleedTriggerCount += 1;
                            }

                            // 賦能：下一次物理近戰攻擊每一個命中段附加 0.5 魔法。
                            if (empowerActive && physical) {
                                const magicAttack = Math.floor(
                                    Number(actor.matk) *
                                    actorMods.matkMult +
                                    actorMods.matkFlat
                                );
                                const magicResist = Math.floor(
                                    Number(attackTarget.resist) *
                                    targetMods.resistMult
                                );

                                const bonusDamageModifier = Math.max(
                                    0,
                                    1 +
                                    (actorMods.damageMult - 1) +
                                    (targetMods.damageTakenMult - 1)
                                );

                                bonusMagic = Math.max(
                                    1,
                                    Math.floor(
                                        magicAttack *
                                        actorMods.empowerMagic *
                                        bonusDamageModifier *
                                        (critical ? criticalMultiplier : 1) -
                                        magicResist
                                    )
                                );

                                rawTotalDamage += bonusMagic;
                            }
                        }

                        const blockText = blocked
                            ? `・格擋${effectiveBlockRate}%`
                            : '';
                        const bonusText = bonusMagic
                            ? `＋賦能魔法 ${bonusMagic}`
                            : '';
                        const forcedMissText = forcedMissReason
                            ? `（${forcedMissReason}）`
                            : '';

                        lines.push(
                            `第${segment}段 🎲 ${roll}/${hitThreshold} → ` +
                            (
                                hit
                                    ? (
                                        critical
                                            ? `暴擊 ${damage}${bonusText}`
                                            : `命中 ${damage}${blockText}${bonusText}`
                                    )
                                    : `未命中${forcedMissText}`
                            )
                        );

                        segmentResults.push({
                            segment,
                            roll,
                            hitThreshold,
                            hit,
                            forcedMissReason,
                            blocked,
                            blockRate: blocked ? effectiveBlockRate : 0,
                            critical,
                            damage,
                            bonusMagic,
                            damageType: packet.damageType
                        });
                    }
                }

                // 攻擊指定時的反應，直接作用在本次攻擊的傷害段。
                const negateAllForThisTarget =
                    Number(reactionFlags.negateAllDamageTargetId || 0) ===
                    Number(attackTarget.id);

                const negateOneForThisTarget =
                    Number(reactionFlags.negateOneSegmentTargetId || 0) ===
                    Number(attackTarget.id);

                if (negateAllForThisTarget) {
                    for (const result of segmentResults) {
                        if (!result.hit) continue;
                        result.reactionPreventedDamage =
                            Number(result.damage || 0) +
                            Number(result.bonusMagic || 0);
                        result.damage = 0;
                        result.bonusMagic = 0;
                    }
                    lines.push('反應效果：本次攻擊傷害無效');
                } else if (negateOneForThisTarget) {
                    const firstHit = segmentResults.find(item => item.hit);
                    if (firstHit) {
                        firstHit.reactionPreventedDamage =
                            Number(firstHit.damage || 0) +
                            Number(firstHit.bonusMagic || 0);
                        firstHit.damage = 0;
                        firstHit.bonusMagic = 0;
                        lines.push(`反應效果：第${firstHit.segment}段傷害無效`);
                    }
                }

                // 依「每一段傷害」順序結算護盾 / 狂暴 / 死鬥，
                // 避免多段攻擊被錯誤視為一筆總傷害。
                const shieldEntry = targetBuffEntriesNow.find(
                    row => row.buff_key === 'life_shield'
                );
                const shieldBefore =
                    shieldEntry?.value_num === null ||
                    shieldEntry?.value_num === undefined
                        ? 0
                        : Number(shieldEntry.value_num);

                const oldHp = Number(attackTarget.hp);
                let runningHp = oldHp;
                let shieldAfter = shieldBefore;
                let shieldAbsorbed = 0;
                let hpDamage = 0;
                let berserkTriggered = false;
                let duelPrevented = false;
                let berserkAvailable = targetBuffKeysNow.has('berserk');
                const duelActive = targetBuffKeysNow.has('duel');

                for (const result of segmentResults) {
                    if (!result.hit) continue;

                    let segmentDamage =
                        Number(result.damage || 0) +
                        Number(result.bonusMagic || 0);

                    if (segmentDamage <= 0) continue;

                    if (shieldAfter > 0) {
                        const absorbed = Math.min(
                            shieldAfter,
                            segmentDamage
                        );
                        shieldAfter -= absorbed;
                        segmentDamage -= absorbed;
                        shieldAbsorbed += absorbed;
                    }

                    if (segmentDamage <= 0) continue;

                    // 狂暴針對「下一次會致死的傷害段」：
                    // 該段傷害改為 0，之後的攻擊段仍正常結算。
                    if (
                        berserkAvailable &&
                        runningHp - segmentDamage <= 0
                    ) {
                        berserkAvailable = false;
                        berserkTriggered = true;
                        result.berserkPreventedDamage = segmentDamage;
                        segmentDamage = 0;
                    }

                    if (segmentDamage <= 0) continue;

                    const beforeSegmentHp = runningHp;
                    runningHp = Math.max(
                        duelActive ? 1 : 0,
                        runningHp - segmentDamage
                    );

                    const actualSegmentLoss = Math.max(
                        0,
                        beforeSegmentHp - runningHp
                    );
                    hpDamage += actualSegmentLoss;

                    if (
                        duelActive &&
                        beforeSegmentHp - segmentDamage < 1
                    ) {
                        duelPrevented = true;
                        result.duelPreventedDamage =
                            Math.max(
                                0,
                                segmentDamage - actualSegmentLoss
                            );
                    }
                }

                if (shieldBefore > 0) {
                    if (shieldAfter > 0) {
                        await client.query(`
                            UPDATE character_buffs
                            SET value_num = $1
                            WHERE character_id = $2
                              AND buff_key = 'life_shield'
                        `, [shieldAfter, attackTarget.id]);
                    } else {
                        await removeBuffKeys(
                            client,
                            attackTarget.id,
                            ['life_shield']
                        );
                    }

                    if (shieldAfter !== shieldBefore) {
                        charactersChanged = true;
                    }
                }

                if (berserkTriggered) {
                    await removeBuffKeys(
                        client,
                        attackTarget.id,
                        ['berserk']
                    );
                    charactersChanged = true;
                }

                const newHp = runningHp;

                if (newHp !== oldHp) {
                    await client.query(
                        'UPDATE characters SET hp = $1 WHERE id = $2',
                        [newHp, attackTarget.id]
                    );
                    charactersChanged = true;
                }

                // 流血屬於「額外損失 HP」，不走防禦 / 魔抗 / 護盾。
                let bleedLoss = 0;
                if (bleedTriggerCount > 0 && bleedLossPerHit > 0) {
                    const bleedResult = await applyDirectHpLoss(
                        client,
                        attackTarget.id,
                        bleedLossPerHit * bleedTriggerCount
                    );
                    bleedLoss = bleedResult.loss;
                    if (bleedLoss > 0) charactersChanged = true;
                }

                // 基礎格擋保留到下一次物理攻擊。
                if (
                    anyPhysicalAttack &&
                    targetBuffKeysNow.has('guard_ready')
                ) {
                    await removeBuffKeys(
                        client,
                        attackTarget.id,
                        ['guard_ready']
                    );
                    charactersChanged = true;
                }

                // 障壁 / 易傷等「下一次受傷」效果。
                if (
                    hpDamage > 0 &&
                    targetMods.consumeOnDamageKeys.length
                ) {
                    await removeBuffKeys(
                        client,
                        attackTarget.id,
                        targetMods.consumeOnDamageKeys
                    );
                    charactersChanged = true;
                }

                // 冰凍：受到真正 HP 傷害後解除；若護盾全擋住則不算受到傷害。
                if (
                    hpDamage > 0 &&
                    targetBuffKeysNow.has('frozen')
                ) {
                    await removeBuffKeys(
                        client,
                        attackTarget.id,
                        ['frozen']
                    );
                    charactersChanged = true;
                }

                // 命中時施加異常 / 數值減益；庇護會擋住整組減益。
                const hitDebuffs = [
                    ...onHitDebuffKeys(skill)
                ];

                if (
                    anyHit &&
                    (
                        actorMods.applyBlockSealOnHit ||
                        reactionFlags.applyBlockSealOnHit === true
                    )
                ) {
                    hitDebuffs.push('block_seal');
                }

                if (
                    anyHit &&
                    reactionFlags.applyBleedOnHit === true
                ) {
                    hitDebuffs.push('bleeding');
                }

                if (anyHit && hitDebuffs.length) {
                    const applied = await applyDebuffBundle(
                        client,
                        [attackTarget.id],
                        hitDebuffs,
                        {
                            sourceSkillKey: skill.key,
                            sourceCharacterId: actorId,
                            currentRound: battleState.round
                        }
                    );

                    if (
                        applied.applied.length ||
                        applied.protected.length
                    ) {
                        charactersChanged = true;
                    }

                    if (
                        applied.applied.some(
                            item => Boolean(
                                BUFF_CATALOG[item.key]?.modifiers?.speedFlat
                            )
                        )
                    ) {
                        initiativeChanged = true;
                    }

                    if (applied.applied.length) {
                        const names = [...new Set(
                            applied.applied.map(
                                item => BUFF_CATALOG[item.key]?.name || item.key
                            )
                        )];
                        lines.push(`命中效果：施加【${names.join('】、【')}】`);
                    }

                    if (applied.protected.length) {
                        lines.push('【庇護】發動：本次命中附帶的減益無效');
                    }

                    if (applied.resisted.length) {
                        lines.push('【抗性】已有相同抗性狀態，本次不再生效');
                    }
                }

                // 鋒銳：命中後施加流血。
                if (anyHit && actorMods.applyBleedOnHit) {
                    const applied = await applyDebuffBundle(
                        client,
                        [attackTarget.id],
                        ['bleeding'],
                        {
                            sourceSkillKey: skill.key,
                            sourceCharacterId: actorId,
                            currentRound: battleState.round
                        }
                    );
                    if (applied.applied.length || applied.protected.length) {
                        charactersChanged = true;
                    }
                    if (applied.applied.length) {
                        lines.push('鋒銳：施加【流血】');
                    }
                    if (applied.protected.length) {
                        lines.push('【庇護】發動：流血無效');
                    }
                }

                const finalHpRow = await client.query(
                    'SELECT hp FROM characters WHERE id = $1',
                    [attackTarget.id]
                );
                const finalHp = Number(finalHpRow.rows[0]?.hp ?? newHp);

                const effectLines = [];
                if (shieldAbsorbed > 0) {
                    effectLines.push(
                        `護盾吸收 ${shieldAbsorbed}（${shieldBefore} → ${shieldAfter}）`
                    );
                }
                if (bleedLoss > 0) {
                    effectLines.push(`【流血】額外損失 ${bleedLoss} HP`);
                }
                if (berserkTriggered) {
                    effectLines.push('【狂暴】發動：本次致死傷害改為 0');
                }
                if (duelPrevented) {
                    effectLines.push('【死鬥】發動：HP 保留在 1');
                }
                if (anyBlock) {
                    effectLines.push(`格擋率 ${effectiveBlockRate}% 生效`);
                }

                grandTotalDamage += rawTotalDamage;
                grandHpLoss += Math.max(0, oldHp - finalHp);

                targetSummaries.push(
                    `⚔ ${attackTarget.name} HP ${oldHp} → ${finalHp}` +
                    (effectLines.length ? `\n${effectLines.join('；')}` : '') +
                    `\n${lines.join('\n')}`
                );

                allTargetResults.push({
                    targetId: Number(attackTarget.id),
                    targetName: attackTarget.name,
                    targetSnapshot: {
                        id: Number(attackTarget.id),
                        name: attackTarget.name,
                        kind: attackTarget.kind || 'player'
                    },
                    hitThreshold,
                    effectiveHit,
                    effectiveDodge,
                    effectiveCrit,
                    rawTotalDamage,
                    hpLoss: Math.max(0, oldHp - finalHp),
                    oldHp,
                    newHp: finalHp,
                    shieldAbsorbed,
                    bleedLoss,
                    berserkTriggered,
                    duelPrevented,
                    packets: segmentResults
                });
            }

            if (darknessConsumed) {
                await removeBuffKeys(
                    client,
                    actorId,
                    ['darkness']
                );
                charactersChanged = true;
            }

            // 下一次攻擊型 Buff 在整個戰技結束後消耗一次。
            const attackConsumeKeys = [
                ...actorMods.consumeOnAttackKeys
            ];
            if (empowerActive) attackConsumeKeys.push('empower');
            if (actorBuffKeys.has('sharpness')) {
                attackConsumeKeys.push('sharpness');
            }

            if (attackConsumeKeys.length) {
                await removeBuffKeys(
                    client,
                    actorId,
                    attackConsumeKeys
                );
                charactersChanged = true;
            }

            // 防禦斬：攻擊後自身本輪防禦 +25%。
            if (skill.name === '防禦斬') {
                await applyBuffToCharacters(
                    client,
                    [actorId],
                    'defense_stance',
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        expiresRound: battleState.round
                    }
                );
                charactersChanged = true;
            }

            const targetLabel =
                allTargetResults.length > 1
                    ? `${allTargetResults.length} 名敵方`
                    : allTargetResults[0]?.targetName || target.name;

            content =
                `⚔ ${actor.name} 使用「${skill.name}」→ ${targetLabel}\n` +
                (
                    targetSummaries.length
                        ? targetSummaries.join('\n\n')
                        : '沒有可結算的攻擊目標'
                );

            payload = {
                ...payload,
                targetIds: attackTargetIds,
                heals: allHealResults,
                totalDamage: grandTotalDamage,
                totalHpLoss: grandHpLoss,
                targets: allTargetResults,
                battleLogContent:
                    `${actor.name} 使用「${skill.name}」攻擊 ${targetLabel}。\n` +
                    (
                        targetSummaries.length
                            ? targetSummaries.join('\n')
                            : '沒有造成傷害。'
                    )
            };
        } else if (skill.actionCode === 'HEAL') {
            const recipientIds = await autoRecipientIds(
                client,
                actor,
                target,
                skill
            );

            const recipientResult = await client.query(`
                SELECT *
                FROM characters
                WHERE id = ANY($1::int[])
                ORDER BY id
                FOR UPDATE
            `, [recipientIds]);

            const actorBuffResult = await client.query(`
                SELECT buff_key, stack_count, value_num
                FROM character_buffs
                WHERE character_id = $1
            `, [actorId]);

            const actorMods = buffModifiers(actorBuffResult.rows);
            const effectiveMagic = Math.floor(
                Number(actor.matk) *
                actorMods.matkMult +
                actorMods.matkFlat
            );

            const resultLines = [];
            const healResults = [];
            let totalHeal = 0;

            for (const recipient of recipientResult.rows) {
                const oldHp = Number(recipient.hp);
                let newHp = oldHp;
                let heal = 0;

                if (skill.logicCode === 'REVIVE_ONE') {
                    if (oldHp <= 0) {
                        newHp = Math.min(Number(recipient.max_hp), 1);
                        heal = Math.max(0, newHp - oldHp);
                    }
                } else if (skill.logicCode === 'LIFE_TRANSFER') {
                    const transfer = Math.max(
                        0,
                        Math.floor(Number(actor.hp) * 0.5)
                    );

                    const actorHasDuel = actorBuffResult.rows.some(
                        row => row.buff_key === 'duel'
                    );
                    const actorNewHp = Math.max(
                        actorHasDuel ? 1 : 0,
                        Number(actor.hp) - transfer
                    );

                    newHp = Math.min(
                        Number(recipient.max_hp),
                        oldHp + transfer
                    );

                    heal = Math.max(0, newHp - oldHp);

                    await client.query(
                        'UPDATE characters SET hp = $1 WHERE id = $2',
                        [actorNewHp, actorId]
                    );
                    actor.hp = actorNewHp;
                    charactersChanged = true;
                } else {
                    const magic = String(skill.effect).match(
                        /恢復[^【]*【([0-9.]+)(物理|魔法)】/
                    );
                    const percentHp = String(skill.effect).match(
                        /恢復(?:其|自身)?\s*([0-9.]+)%HP/
                    );

                    if (magic) {
                        const stat =
                            magic[2] === '物理'
                                ? Math.floor(
                                    Number(actor.patk) *
                                    actorMods.patkMult
                                )
                                : effectiveMagic;

                        heal = Math.max(
                            1,
                            Math.floor(stat * Number(magic[1]))
                        );
                    } else if (percentHp) {
                        heal = Math.max(
                            1,
                            Math.floor(
                                Number(recipient.max_hp) *
                                Number(percentHp[1]) /
                                100
                            )
                        );
                    }

                    newHp = Math.min(
                        Number(recipient.max_hp),
                        oldHp + heal
                    );
                    heal = Math.max(0, newHp - oldHp);
                }

                if (newHp !== oldHp) {
                    await client.query(
                        'UPDATE characters SET hp = $1 WHERE id = $2',
                        [newHp, recipient.id]
                    );
                    charactersChanged = true;
                }

                if (skill.logicCode === 'CLEANSE_HEAL') {
                    const debuffRows = await client.query(`
                        SELECT buff_key
                        FROM character_buffs
                        WHERE character_id = $1
                    `, [recipient.id]);

                    const debuffKeys = debuffRows.rows
                        .map(row => row.buff_key)
                        .filter(key => BUFF_CATALOG[key]?.kind === 'debuff');

                    if (debuffKeys.length) {
                        await removeBuffKeys(
                            client,
                            recipient.id,
                            debuffKeys
                        );
                        charactersChanged = true;
                    }
                }

                totalHeal += heal;
                healResults.push({
                    targetId: Number(recipient.id),
                    targetName: recipient.name,
                    heal,
                    oldHp,
                    newHp
                });
                resultLines.push(
                    `${recipient.name} HP ${oldHp} → ${newHp}` +
                    (heal ? `（+${heal}）` : '')
                );
            }

            const recipientLabel =
                recipientResult.rows.length > 1
                    ? `${recipientResult.rows.length} 名友方`
                    : recipientResult.rows[0]?.name || target.name;

            content =
                `✚ ${actor.name} 使用「${skill.name}」→ ${recipientLabel}\n` +
                (
                    resultLines.length
                        ? resultLines.join('\n')
                        : `目前沒有符合條件的恢復目標。\n${skill.effect}`
                );

            payload = {
                ...payload,
                recipientIds,
                heals: healResults,
                totalHeal,
                battleLogContent:
                    `${actor.name} 使用「${skill.name}」對 ${recipientLabel} 進行恢復。` +
                    (resultLines.length ? `\n${resultLines.join('\n')}` : '')
            };
        } else if (
            skill.actionCode === 'BUFF' ||
            skill.actionCode === 'DEBUFF' ||
            skill.actionCode === 'GUARD' ||
            (skill.actionCode === 'UTILITY' && autoBuffForSkill(skill))
        ) {
            const buffKey =
                skill.logicCode === 'BASIC_GUARD'
                    ? 'guard_ready'
                    : autoBuffForSkill(skill);

            if (!buffKey) {
                content =
                    `◆ ${actor.name} 使用「${skill.name}」→ ${target.name}\n` +
                    `${skill.effect}\n` +
                    `效果已記錄；此效果目前尚未建立可計算的 Buff 定義。`;

                payload.battleLogContent =
                    `${actor.name} 對 ${target.name} 使用「${skill.name}」。${skill.effect}`;
            } else if (skill.logicCode === 'LIFE_SHIELD') {
                const hpCost = Math.max(
                    1,
                    Math.floor(Number(actor.max_hp) * 0.25)
                );
                const oldHp = Number(actor.hp);
                const actorHasDuel = actorBuffEntries.some(
                    row => row.buff_key === 'duel'
                );
                const newHp = Math.max(
                    actorHasDuel ? 1 : 0,
                    oldHp - hpCost
                );
                const shieldValue = Math.max(0, oldHp - newHp);

                await client.query(
                    'UPDATE characters SET hp = $1 WHERE id = $2',
                    [newHp, actorId]
                );

                await applyBuffToCharacters(
                    client,
                    [actorId],
                    'life_shield',
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        expiresRound: battleState.round,
                        valueNum: shieldValue
                    }
                );

                charactersChanged = true;

                content =
                    `⬆ ${actor.name} 使用「生命護盾」\n` +
                    `HP ${oldHp} → ${newHp}\n` +
                    `獲得 ${shieldValue} 點護盾`;

                payload = {
                    ...payload,
                    shieldValue,
                    oldHp,
                    newHp,
                    battleLogContent:
                        `${actor.name} 使用「生命護盾」，消耗 ${hpCost} HP，獲得 ${shieldValue} 點護盾。`
                };
            } else if (skill.logicCode === 'LIGHT_LINK') {
                const beforeLinkMods = buffModifiers(actorBuffEntries);
                const beforeLinkMagic = Math.floor(
                    Number(actor.matk) * beforeLinkMods.matkMult +
                    beforeLinkMods.matkFlat
                );
                const afterLinkMagic = Math.floor(
                    Number(actor.matk) *
                    Math.max(0, beforeLinkMods.matkMult - 0.5) +
                    beforeLinkMods.matkFlat
                );
                const lostMagic = Math.max(
                    0,
                    beforeLinkMagic - afterLinkMagic
                );

                await client.query(`
                    DELETE FROM character_buffs
                    WHERE buff_key = 'light_link_target'
                      AND source_character_id = $1
                `, [actorId]);

                await applyBuffToCharacters(
                    client,
                    [actorId],
                    'light_link_source',
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        expiresRound: battleState.round
                    }
                );

                await applyBuffToCharacters(
                    client,
                    [targetId],
                    'light_link_target',
                    {
                        sourceSkillKey: skill.key,
                        sourceCharacterId: actorId,
                        expiresRound: battleState.round,
                        valueNum: lostMagic
                    }
                );

                charactersChanged = true;

                content =
                    `⬆ ${actor.name} 使用「熠光連結」→ ${target.name}\n` +
                    `${actor.name} 魔法攻擊 -50%\n` +
                    `${target.name} 魔法攻擊 +${lostMagic}`;

                payload = {
                    ...payload,
                    lostMagic,
                    battleLogContent:
                        `${actor.name} 使用「熠光連結」連結 ${target.name}：` +
                        `${actor.name} 魔法攻擊 -50%，${target.name} 魔法攻擊 +${lostMagic}。`
                };
            } else {
                let recipientIds;

                // 狂暴 / 假死 / 死鬥的狀態實際施加在自己身上。
                if (['狂暴', '假死', '死鬥'].includes(skill.name)) {
                    recipientIds = [actorId];
                } else {
                    recipientIds = await autoRecipientIds(
                        client,
                        actor,
                        target,
                        skill
                    );
                }

                const expiresRound =
                    ['stun', 'darkness', 'frozen', 'feign_death', 'berserk'].includes(buffKey)
                        ? battleState.round + 1
                        : skillBuffExpiresRound(skill, battleState.round);

                const definition = BUFF_CATALOG[buffKey];
                let application = {
                    applied: [],
                    protected: [],
                    resisted: []
                };

                const valueNum =
                    skill.name === '死鬥'
                        ? Number(targetId)
                        : null;

                if (
                    definition.kind === 'debuff' ||
                    definition.kind === 'special' ||
                    definition.resistance
                ) {
                    // 狂暴、死鬥等 special 不會被庇護擋；applyDebuffBundle
                    // 只會在 keys 中真的存在 debuff 時消耗庇護。
                    application = await applyDebuffBundle(
                        client,
                        recipientIds,
                        [buffKey],
                        {
                            sourceSkillKey: skill.key,
                            sourceCharacterId: actorId,
                            currentRound: battleState.round
                        }
                    );

                    // 死鬥要記住指定的敵人，供輪結束時判定代價。
                    if (skill.name === '死鬥' && application.applied.length) {
                        await client.query(`
                            UPDATE character_buffs
                            SET value_num = $1,
                                expires_round = $2
                            WHERE character_id = $3
                              AND buff_key = 'duel'
                        `, [valueNum, battleState.round, actorId]);
                    }
                } else {
                    await applyBuffToCharacters(
                        client,
                        recipientIds,
                        buffKey,
                        {
                            sourceSkillKey: skill.key,
                            sourceCharacterId: actorId,
                            expiresRound,
                            valueNum
                        }
                    );

                    application.applied = recipientIds.map(
                        characterId => ({ characterId, key: buffKey })
                    );
                }

                charactersChanged =
                    charactersChanged ||
                    application.applied.length > 0 ||
                    application.protected.length > 0;

                // 挑釁還有「本輪行動速度 -10」，是獨立減益圖標。
                if (
                    skill.name === '挑釁' &&
                    application.protected.length === 0
                ) {
                    const speedResult = await applyDebuffBundle(
                        client,
                        recipientIds,
                        ['speed_down_10'],
                        {
                            sourceSkillKey: skill.key,
                            sourceCharacterId: actorId,
                            currentRound: battleState.round
                        }
                    );
                    if (speedResult.applied.length) {
                        charactersChanged = true;
                        initiativeChanged = true;
                    }
                }

                // 視線轉移：本輪目標迴避 -50%。
                if (skill.name === '視線轉移') {
                    initiativeChanged = false;
                }

                // 有些狀態同時有立即資源效果。
                if (skill.name === '防守姿態') {
                    await client.query(
                        'UPDATE characters SET sp = sp + 1 WHERE id = $1',
                        [actorId]
                    );
                    charactersChanged = true;
                }

                if (skill.name === '進攻架勢') {
                    await client.query(
                        'UPDATE characters SET ap = ap + 1 WHERE id = $1',
                        [actorId]
                    );
                    charactersChanged = true;
                }

                if (skill.name === '狂暴') {
                    await client.query(
                        'UPDATE characters SET ap = ap + 1 WHERE id = $1',
                        [actorId]
                    );
                    charactersChanged = true;
                }

                const recipientNamesResult = await client.query(`
                    SELECT name
                    FROM characters
                    WHERE id = ANY($1::int[])
                    ORDER BY id
                `, [recipientIds]);

                const recipientNames = recipientNamesResult.rows.map(
                    row => row.name
                );
                const recipientLabel =
                    recipientNames.length > 3
                        ? `${recipientNames.length} 名角色`
                        : recipientNames.join('、') || target.name;

                const statusLines = [];

                if (application.protected.length) {
                    statusLines.push('【庇護】發動：本次減益無效');
                }

                if (application.resisted.length) {
                    statusLines.push('【抗性】同一狀態本場戰鬥已生效過，本次無效');
                }

                const appliedLabel =
                    application.applied.length
                        ? `${definition.name}：${definition.effect}`
                        : `${definition.name}未生效`;

                content =
                    `${definition.kind === 'debuff' ? '⬇' : '⬆'} ` +
                    `${actor.name} 使用「${skill.name}」→ ${recipientLabel}\n` +
                    `${appliedLabel}` +
                    (statusLines.length ? `\n${statusLines.join('\n')}` : '') +
                    (
                        application.applied.length && expiresRound
                            ? `\n持續至第 ${expiresRound} 輪結束或效果提前觸發`
                            : ''
                    );

                payload = {
                    ...payload,
                    buffKey,
                    recipientIds,
                    application,
                    battleLogContent:
                        `${actor.name} 使用「${skill.name}」→ ${recipientLabel}。` +
                        ` ${appliedLabel}。` +
                        (statusLines.length ? ` ${statusLines.join('；')}。` : '')
                };

                const m = definition.modifiers || {};
                initiativeChanged =
                    initiativeChanged ||
                    Boolean(m.speedFlat) ||
                    Boolean(m.initiativeFirst);
            }
        } else if (skill.actionCode === 'MOVE') {
            if (skill.name === '移位' || skill.name === '快速移位') {
                if ((actor.kind || 'player') !== (target.kind || 'player')) {
                    throw new Error('交換位置只能指定友方');
                }
                if (Number(actor.id) === Number(target.id)) {
                    throw new Error('交換位置必須指定另一名友方');
                }

                const swap = await swapCharacterPositions(
                    client,
                    actor.id,
                    target.id
                );

                if (skill.name === '移位') {
                    await applyBuffToCharacters(
                        client,
                        [actor.id, target.id],
                        'dodge_up_30',
                        {
                            sourceSkillKey: skill.key,
                            sourceCharacterId: actor.id,
                            expiresRound: battleState.round
                        }
                    );
                    charactersChanged = true;
                }

                content =
                    `↔ ${actor.name} 使用「${skill.name}」與 ${target.name} 交換位置` +
                    (
                        skill.name === '移位'
                            ? `\n雙方本輪迴避 +30`
                            : `\n位置已立即互換；代受效果需在被攻擊指定時使用`
                    );

                payload = {
                    ...payload,
                    swapped: true,
                    swap,
                    battleLogContent:
                        `${actor.name} 使用「${skill.name}」與 ${target.name} 交換戰場位置。` +
                        (
                            skill.name === '移位'
                                ? ' 雙方本輪迴避 +30。'
                                : ' 快速移位的代受效果需在被攻擊指定時使用。'
                        )
                };

                io.emit('battlefield:changed', {
                    reason: 'swap',
                    firstCharacterId: Number(actor.id),
                    secondCharacterId: Number(target.id)
                });
            } else {
                content =
                    `↔ ${actor.name} 使用「${skill.name}」\n${skill.effect}\n` +
                    `此移動戰技已記錄；需要指定空格的效果可直接拖曳角色完成。`;
                payload.battleLogContent =
                    `${actor.name} 使用「${skill.name}」。${skill.effect}`;
            }
        } else {
            content =
                `◆ ${actor.name} 使用「${skill.name}」→ ${target.name}\n` +
                `${skill.effect}\n` +
                `目前已完成目標限制與資源消耗，特殊效果仍以戰鬥紀錄為準。`;

            payload.battleLogContent =
                `${actor.name} 對 ${target.name} 使用「${skill.name}」。${skill.effect}`;
        }

        if (actionStatus.lines.length) {
            content += `\n${actionStatus.lines.join('\n')}`;
            payload.battleLogContent =
                `${payload.battleLogContent || content}\n${actionStatus.lines.join('\n')}`;
        }

        const postReactionOptions =
            await collectPostActionReactionOptions(
                client,
                actor,
                skill,
                payload,
                cost
            );

        let postReactionWindow = null;

        if (postReactionOptions.length) {
            postReactionWindow = await createReactionWindow(
                client,
                {
                    triggerType: 'post_action',
                    blocking: false,
                    sourceActorId: actor.id,
                    sourceTargetId: target.id,
                    sourceSkillKey: skill.key,
                    round: battleState.round,
                    turnPass: battleState.turnPass,
                    context: {
                        actorId: Number(actor.id),
                        actorName: actor.name,
                        skillName: skill.name,
                        actionCode: skill.actionCode,
                        cost,
                        targets: payload.targets || [],
                        heals: payload.heals || []
                    },
                    options: postReactionOptions
                }
            );
        }

        const message = await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'skill',
            characterId: actor.id,
            characterName: actor.name,
            characterKind: actor.kind || 'player',
            content,
            payload
        });

        const battleEvent = await insertBattleEvent(client, {
            eventType: 'skill',
            round: battleState.round,
            turnPass: battleState.turnPass,
            actorId: actor.id,
            targetId: target.id,
            content:
                payload.battleLogContent ||
                `${actor.name} 使用「${skill.name}」。`,
            payload
        });

        if (reactionResumeId) {
            await client.query(`
                UPDATE reaction_windows
                SET status = 'resolved',
                    resolved_at = NOW()
                WHERE id = $1
            `, [reactionResumeId]);
        }

        await client.query('COMMIT');

        io.emit('chat:message', message);
        io.emit('battle:event', battleEvent);

        if (reactionResumeId) {
            io.emit('combat:reaction-closed', {
                id: reactionResumeId
            });
        }

        if (postReactionWindow) {
            io.emit('combat:reaction-opened', postReactionWindow);
        }

        if (charactersChanged) {
            io.emit('characters:changed');
        }

        if (initiativeChanged) {
            broadcastCombatState().catch(error => console.error(error));
        }

        return res.json({
            success: true,
            message,
            result: payload,
            reactionWindow: postReactionWindow
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {}

        console.error(error);
        return res.status(500).json({
            error: error.message || '使用戰技失敗'
        });
    } finally {
        client.release();
    }
});

app.post('/api/combat/reset', async (_req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const combatants = await getCombatants(client);
        const firstId = combatants[0]?.id || null;

        await client.query('DELETE FROM pending_actions');
        await client.query('DELETE FROM reaction_windows');
        await client.query('DELETE FROM status_resistances');
        await client.query(`DELETE FROM character_buffs WHERE source_skill_key IS NOT NULL`);
        await client.query('DELETE FROM battle_events');

        await client.query(`
            UPDATE battle_state
            SET round_number = 1,
                turn_pass = 1,
                current_character_id = $1,
                updated_at = NOW()
            WHERE id = 1
        `, [firstId]);

        const startEvent = await insertBattleEvent(client, {
            eventType: 'battle_start',
            round: 1,
            turnPass: 1,
            content: '戰鬥開始'
        });
        const phaseEvent = await insertBattleEvent(client, {
            eventType: 'phase',
            round: 1,
            turnPass: 1,
            content: '第1輪－第1回合'
        });

        await client.query('COMMIT');

        const state = buildCombatState(1, 1, firstId, combatants);
        io.emit('combat:state', state);
        io.emit('battle:reset', [startEvent, phaseEvent]);
        io.emit('characters:changed');
        res.json(state);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '重置回合數失敗' });
    } finally {
        client.release();
    }
});

app.post('/api/combat/next-turn', async (_req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const state = await getCombatState(client, true);
        const combatants = state.combatants;

        if (!combatants.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '目前沒有角色可進行戰鬥' });
        }

        let currentIndex = combatants.findIndex(
            character => character.id === state.currentCharacterId
        );
        if (currentIndex < 0) currentIndex = 0;

        let startIndex = currentIndex + 1;
        let nextTurnPass = state.turnPass;

        if (startIndex >= combatants.length) {
            startIndex = 0;
            nextTurnPass += 1;
        }

        const selected = await findUsableTurnActor(
            client,
            combatants,
            startIndex,
            state.round,
            nextTurnPass
        );

        const nextId = selected.actorId;
        nextTurnPass = selected.turnPass;

        await client.query(`
            UPDATE battle_state
            SET current_character_id = $1,
                turn_pass = $2,
                updated_at = NOW()
            WHERE id = 1
        `, [nextId, nextTurnPass]);

        const events = [];

        if (nextTurnPass !== state.turnPass) {
            events.push(await insertBattleEvent(client, {
                eventType: 'phase',
                round: state.round,
                turnPass: nextTurnPass,
                content: battleClockLabel(state.round, nextTurnPass)
            }));
        }

        events.push(...selected.statusEvents);

        const nextCharacter = combatants.find(
            character => character.id === nextId
        );

        events.push(await insertBattleEvent(client, {
            eventType: 'turn',
            round: state.round,
            turnPass: nextTurnPass,
            actorId: nextId,
            content: `輪到 ${nextCharacter?.name || '角色'} 行動。`
        }));

        const resolution = await resolvePendingActionsForActor(
            client,
            nextId,
            { round: state.round, turnPass: nextTurnPass }
        );

        await client.query('COMMIT');

        for (const message of selected.statusMessages) {
            io.emit('chat:message', message);
        }
        for (const message of resolution.messages) {
            io.emit('chat:message', message);
        }

        for (const event of [...events, ...(resolution.events || [])]) {
            io.emit('battle:event', event);
        }

        if (
            selected.charactersChanged ||
            resolution.charactersChanged
        ) {
            io.emit('characters:changed');
        }

        const refreshedCombatants = await getCombatants();
        const newState = buildCombatState(
            state.round,
            nextTurnPass,
            nextId,
            refreshedCombatants
        );

        io.emit('combat:state', newState);
        res.json(newState);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '切換回合失敗' });
    } finally {
        client.release();
    }
});

app.post('/api/combat/next-round', async (_req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const clock = await getBattleClock(client, true);
        const nextRound = clock.round + 1;

        const expiredPreview = await client.query(`
            SELECT
                cb.character_id,
                cb.buff_key,
                cb.value_num,
                c.name AS character_name
            FROM character_buffs cb
            JOIN characters c ON c.id = cb.character_id
            WHERE cb.expires_round IS NOT NULL
              AND cb.expires_round < $1
            ORDER BY cb.character_id, cb.buff_key
        `, [nextRound]);

        const expirationEvents = [];
        let expirationChangedCharacters = false;

        // 死鬥：狀態結束時，若指定敵人仍未被擊倒，自己 HP 降至 0。
        for (const expiredBuff of expiredPreview.rows) {
            if (
                expiredBuff.buff_key === 'duel' &&
                expiredBuff.value_num !== null
            ) {
                const duelTarget = await client.query(
                    'SELECT name, hp FROM characters WHERE id = $1',
                    [Number(expiredBuff.value_num)]
                );

                if (
                    duelTarget.rows.length &&
                    Number(duelTarget.rows[0].hp) > 0
                ) {
                    await client.query(
                        'UPDATE characters SET hp = 0 WHERE id = $1',
                        [expiredBuff.character_id]
                    );
                    expirationChangedCharacters = true;

                    expirationEvents.push(await insertBattleEvent(client, {
                        eventType: 'status_trigger',
                        round: nextRound,
                        turnPass: 1,
                        actorId: expiredBuff.character_id,
                        targetId: Number(expiredBuff.value_num),
                        content:
                            `【死鬥】結束：${duelTarget.rows[0].name} 尚未被擊倒，` +
                            `${expiredBuff.character_name} 的 HP 降至 0。`
                    }));
                }
            }
        }

        const expired = await client.query(`
            DELETE FROM character_buffs
            WHERE expires_round IS NOT NULL
              AND expires_round < $1
            RETURNING id
        `, [nextRound]);

        let combatants = await getCombatants(client);
        if (!combatants.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '目前沒有角色可進行戰鬥' });
        }

        const selected = await findUsableTurnActor(
            client,
            combatants,
            0,
            nextRound,
            1
        );

        const nextId = selected.actorId;
        const nextTurnPass = selected.turnPass;

        await client.query(`
            UPDATE battle_state
            SET round_number = $1,
                turn_pass = $2,
                current_character_id = $3,
                updated_at = NOW()
            WHERE id = 1
        `, [nextRound, nextTurnPass, nextId]);

        const phaseEvent = await insertBattleEvent(client, {
            eventType: 'phase',
            round: nextRound,
            turnPass: nextTurnPass,
            content: battleClockLabel(nextRound, nextTurnPass)
        });

        for (const expiredBuff of expiredPreview.rows) {
            const buff = BUFF_CATALOG[expiredBuff.buff_key];

            expirationEvents.push(await insertBattleEvent(client, {
                eventType: 'buff_expire',
                round: nextRound,
                turnPass: nextTurnPass,
                actorId: expiredBuff.character_id,
                content:
                    `${expiredBuff.character_name} 的「${buff?.name || expiredBuff.buff_key}」` +
                    `已在上一輪結束時解除。`,
                payload: {
                    buffKey: expiredBuff.buff_key
                }
            }));
        }

        const nextCharacter = combatants.find(
            character => character.id === nextId
        );

        const turnEvent = await insertBattleEvent(client, {
            eventType: 'turn',
            round: nextRound,
            turnPass: nextTurnPass,
            actorId: nextId,
            content: `輪到 ${nextCharacter?.name || '角色'} 行動。`
        });

        const resolution = await resolvePendingActionsForActor(
            client,
            nextId,
            { round: nextRound, turnPass: nextTurnPass }
        );

        await client.query('COMMIT');

        for (const message of selected.statusMessages) {
            io.emit('chat:message', message);
        }
        for (const message of resolution.messages) {
            io.emit('chat:message', message);
        }

        for (const event of [
            phaseEvent,
            ...expirationEvents,
            ...selected.statusEvents,
            turnEvent,
            ...(resolution.events || [])
        ]) {
            io.emit('battle:event', event);
        }

        if (
            resolution.charactersChanged ||
            selected.charactersChanged ||
            expirationChangedCharacters ||
            expired.rows.length
        ) {
            io.emit('characters:changed');
        }

        combatants = await getCombatants();
        const newState = buildCombatState(
            nextRound,
            nextTurnPass,
            nextId,
            combatants
        );

        io.emit('combat:state', newState);
        res.json(newState);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: '切換輪次失敗' });
    } finally {
        client.release();
    }
});


// 單次 JOIN 取回所有戰場與格子，避免每一塊戰場各查一次資料庫。
app.get('/api/grid-groups', async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                g.id AS group_id,
                g.world_x,
                g.world_y,
                g.rows,
                g.cols,
                g.cell_size,
                c.id AS cell_id,
                c.row_index,
                c.col_index,
                c.occupied_by,
                ch.name AS character_name,
                ch.kind AS character_kind,
                ch.image_path AS character_image
            FROM grid_groups g
            LEFT JOIN cells c ON c.group_id = g.id
            LEFT JOIN characters ch ON c.occupied_by = ch.id
            ORDER BY g.id, c.row_index, c.col_index
        `);

        const groups = new Map();

        for (const row of result.rows) {
            if (!groups.has(row.group_id)) {
                groups.set(row.group_id, {
                    id: row.group_id,
                    worldX: row.world_x,
                    worldY: row.world_y,
                    rows: row.rows,
                    cols: row.cols,
                    cellSize: row.cell_size,
                    cells: []
                });
            }

            if (row.cell_id !== null) {
                groups.get(row.group_id).cells.push({
                    id: row.cell_id,
                    row: row.row_index,
                    col: row.col_index,
                    occupiedBy: row.occupied_by,
                    characterName: row.character_name,
                    characterKind: row.character_kind || 'player',
                    characterImage: row.character_image
                });
            }
        }

        res.json([...groups.values()]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '查詢戰場失敗' });
    }
});

app.post('/api/grid-groups', async (req, res) => {
    const worldX = Math.round(number(req.body.worldX));
    const worldY = Math.round(number(req.body.worldY));
    const rows = Math.floor(number(req.body.rows));
    const cols = Math.floor(number(req.body.cols));
    const cellSize = Math.floor(number(req.body.cellSize, 160));

    if (rows < 1 || cols < 1 || rows > 50 || cols > 50) {
        return res.status(400).json({ error: '高與寬必須介於 1～50' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const groupResult = await client.query(`
            INSERT INTO grid_groups (world_x, world_y, rows, cols, cell_size)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [worldX, worldY, rows, cols, cellSize]);

        const group = groupResult.rows[0];
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                params.push(group.id, row, col);
            }
        }

        await client.query(`
            INSERT INTO cells (group_id, row_index, col_index)
            VALUES ${values.join(', ')}
        `, params);

        await client.query('COMMIT');
        res.json({ success: true, id: group.id });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: '建立戰場失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/grid-groups/:id/move', async (req, res) => {
    try {
        const result = await pool.query(`
            UPDATE grid_groups SET world_x = $1, world_y = $2
            WHERE id = $3 RETURNING id
        `, [
            Math.round(number(req.body.worldX)),
            Math.round(number(req.body.worldY)),
            number(req.params.id)
        ]);

        if (!result.rows.length) return res.status(404).json({ error: '找不到這個戰場' });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '移動戰場失敗' });
    }
});

app.delete('/api/grid-groups/:id', async (req, res) => {
    const groupId = number(req.params.id);

    try {
        const occupied = await pool.query(
            'SELECT COUNT(*) FROM cells WHERE group_id = $1 AND occupied_by IS NOT NULL',
            [groupId]
        );

        if (number(occupied.rows[0].count) > 0) {
            return res.status(400).json({ error: '這片戰場上還有角色，無法刪除' });
        }

        const result = await pool.query('DELETE FROM grid_groups WHERE id = $1 RETURNING id', [groupId]);
        if (!result.rows.length) return res.status(404).json({ error: '找不到這個戰場' });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '刪除戰場失敗' });
    }
});


app.post('/api/combat/move-character', async (req, res) => {
    const characterId = number(req.body.characterId);
    const targetCellId = number(req.body.cellId);
    const actionActorId = number(req.body.actionActorId, characterId);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const characterResult = await client.query(
            'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
            [characterId]
        );
        if (!characterResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到角色' });
        }
        const character = characterResult.rows[0];

        if (actionActorId !== characterId) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `目前選擇的行動角色不是「${character.name}」`
            });
        }

        const sourceResult = await client.query(`
            SELECT c.id, c.group_id, c.row_index, c.col_index
            FROM cells c
            WHERE c.occupied_by = $1
            FOR UPDATE
        `, [characterId]);
        if (!sourceResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '角色目前不在戰場上' });
        }

        const source = sourceResult.rows[0];
        if (Number(source.id) === targetCellId) {
            await client.query('ROLLBACK');
            return res.json({ success: true, unchanged: true });
        }

        const targetResult = await client.query(`
            SELECT id, group_id, row_index, col_index, occupied_by
            FROM cells
            WHERE id = $1
            FOR UPDATE
        `, [targetCellId]);

        if (!targetResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到目標格子' });
        }

        const target = targetResult.rows[0];
        if (target.occupied_by !== null && Number(target.occupied_by) !== characterId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '這個格子已經有其他角色' });
        }

        const hasteResult = await client.query(`
            SELECT id
            FROM character_buffs
            WHERE character_id = $1
              AND buff_key = 'marching_order'
            LIMIT 1
        `, [characterId]);

        const hasSwift = hasteResult.rows.length > 0;
        const moveSpCost = hasSwift ? 0 : 1;

        if (Number(character.sp) < moveSpCost) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `${character.name} 的 SP 不足，無法移動`
            });
        }

        await client.query(
            'UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1',
            [characterId]
        );
        await client.query(
            'UPDATE cells SET occupied_by = $1 WHERE id = $2',
            [characterId, targetCellId]
        );

        if (moveSpCost > 0) {
            await client.query(
                'UPDATE characters SET sp = GREATEST(0, sp - $1) WHERE id = $2',
                [moveSpCost, characterId]
            );
        }

        if (hasSwift) {
            await removeBuffKeys(
                client,
                characterId,
                ['marching_order']
            );
        }

        const clock = await getBattleClock(client);
        const sourceLabel = `戰場${source.group_id}（${Number(source.row_index)+1},${Number(source.col_index)+1}）`;
        const targetLabel = `戰場${target.group_id}（${Number(target.row_index)+1},${Number(target.col_index)+1}）`;

        const content =
            `↔ ${character.name} 使用基礎移動\n` +
            `${sourceLabel} → ${targetLabel}\n` +
            (
                hasSwift
                    ? '【疾行】發動：本次移動消耗 -1，實際消耗 0SP'
                    : `消耗 ${moveSpCost}SP`
            );

        const message = await insertChatMessage(client, {
            channel: 'combat',
            messageType: 'move',
            characterId: character.id,
            characterName: character.name,
            characterKind: character.kind || 'player',
            content,
            payload: {
                actionCode: 'MOVE',
                sourceCellId: Number(source.id),
                targetCellId,
                spCost: moveSpCost,
                swiftConsumed: hasSwift
            }
        });

        const battleEvent = await insertBattleEvent(client, {
            eventType: 'move',
            round: clock.round,
            turnPass: clock.turnPass,
            actorId: character.id,
            content:
                `${character.name} 從 ${sourceLabel} 移動至 ${targetLabel}，` +
                (
                    hasSwift
                        ? '【疾行】使本次基礎移動消耗降為 0 SP。'
                        : `消耗 ${moveSpCost} SP。`
                ),
            payload: {
                sourceCellId: Number(source.id),
                targetCellId,
                spCost: moveSpCost,
                swiftConsumed: hasSwift
            }
        });

        await client.query('COMMIT');

        io.emit('chat:message', message);
        io.emit('battle:event', battleEvent);
        io.emit('characters:changed');
        io.emit('battlefield:changed', {
            reason: 'move',
            characterId: character.id,
            sourceCellId: Number(source.id),
            targetCellId
        });

        res.json({
            success: true,
            message,
            battleEvent,
            sp: Math.max(0, Number(character.sp) - moveSpCost),
            swiftConsumed: hasSwift
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(error);
        res.status(500).json({ error: error.message || '移動角色失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/cells/:cellId/occupy', async (req, res) => {
    const cellId = number(req.params.cellId);
    const characterId = number(req.body.characterId);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const cellCheck = await client.query(
            'SELECT occupied_by FROM cells WHERE id = $1 FOR UPDATE',
            [cellId]
        );

        if (!cellCheck.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '找不到這個格子' });
        }

        const occupiedBy = cellCheck.rows[0].occupied_by;
        if (occupiedBy !== null && occupiedBy !== characterId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '這個格子已經有其他角色' });
        }

        await client.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [characterId]);
        await client.query('UPDATE cells SET occupied_by = $1 WHERE id = $2', [characterId, cellId]);
        await client.query('COMMIT');

        io.emit('battlefield:changed', {
            reason: 'place',
            characterId,
            targetCellId: cellId
        });

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: '放置角色失敗' });
    } finally {
        client.release();
    }
});

app.patch('/api/characters/:id/vacate', async (req, res) => {
    try {
        const characterId = number(req.params.id);
        await pool.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [characterId]);
        io.emit('battlefield:changed', { reason: 'vacate', characterId });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '移除角色失敗' });
    }
});

app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: error.message || '伺服器發生錯誤' });
});

async function start() {
    try {
        await ensureSchema();
        await ensureBattleLogSeed();
        httpServer.listen(PORT, HOST, () => {
            console.log(`伺服器已啟動：http://${HOST}:${PORT}`);
            console.log('即時聊天室：Socket.IO 已啟用');
        });
    } catch (error) {
        console.error('啟動失敗：', error);
        process.exit(1);
    }
}

start();
