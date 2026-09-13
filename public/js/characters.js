import { api } from './api.js';
import { closeModal, createImageOrInitial, escapeHtml, openModal, percent, showToast } from './ui.js';
import { getSidebarSection, setSidebarCounts } from './sidebar.js';

let characters = [];
let buffCatalog = [];
let currentSection = getSidebarSection();
let refreshBattlefield = () => {};
let placeCharacterOnBattlefield = async () => {};
let activeAdjustment = null;
let sheetCharacterId = null;
let buffCharacterId = null;
let skillPickerSlotIndex = null;
let skillCatalogCache = new Map();
let createKind = currentSection;
let statDisplayMode = localStorage.getItem('trpg-stat-mode') || 'number';

const list = document.getElementById('character-list');
const searchInput = document.getElementById('character-search');
const modeButton = document.getElementById('stat-mode-btn');

function compactNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(4)));
}

function formatStat(current, max) {
    return statDisplayMode === 'percent'
        ? `${Math.round(percent(Number(current), Number(max)))}%`
        : `${compactNumber(current)}/${compactNumber(max)}`;
}

function emitCharactersUpdated() {
    document.dispatchEvent(new CustomEvent('trpg:characters-updated', {
        detail: { characters: [...characters] }
    }));
}

function replaceCharacter(updated) {
    const index = characters.findIndex(character => character.id === updated.id);
    if (index !== -1) characters[index] = updated;
    emitCharactersUpdated();
}

function updateModeButton() {
    modeButton.textContent = statDisplayMode === 'percent' ? '百分比' : '數字';
    modeButton.title = '切換 HP / AP / SP 顯示方式';
}

function updateSectionLabels() {
    if (currentSection === 'rules') return;

    const enemy = currentSection === 'enemy';
    document.getElementById('sidebar-kicker').textContent = enemy ? 'ENEMIES' : 'PARTY';
    document.getElementById('sidebar-title').textContent = enemy ? '敵人資訊' : '角色列表';
    document.getElementById('sidebar-sort-hint').textContent = '依速度排序';
    searchInput.placeholder = enemy ? '搜尋敵人…' : '搜尋角色…';
    document.getElementById('add-character-label').textContent = enemy ? '新增敵人' : '新增角色';
}

function toggleStatDisplayMode() {
    statDisplayMode = statDisplayMode === 'number' ? 'percent' : 'number';
    localStorage.setItem('trpg-stat-mode', statDisplayMode);
    updateModeButton();
    renderCharacters();

    const character = characters.find(item => item.id === sheetCharacterId);
    if (character) fillCharacterSheet(character);
}

const statMaxKey = {
    hp: 'maxHp',
    ap: 'maxAp',
    sp: 'maxSp'
};

function stopAdjustment(commit = true) {
    if (!activeAdjustment) return;

    const adjustment = activeAdjustment;
    activeAdjustment = null;

    clearTimeout(adjustment.delay);
    clearInterval(adjustment.interval);

    if (!commit || adjustment.totalDelta === 0) return;

    const character = characters.find(item => item.id === adjustment.characterId);
    if (!character) return;

    api.changeStat(adjustment.characterId, adjustment.type, adjustment.totalDelta)
        .then(updated => {
            replaceCharacter(updated);
            updateCardStat(updated, adjustment.type);
            if (sheetCharacterId === adjustment.characterId) {
                fillCharacterSheet(updated, false);
            }
        })
        .catch(error => {
            character[adjustment.type] = adjustment.before;
            updateCardStat(character, adjustment.type);
            if (sheetCharacterId === adjustment.characterId) {
                fillCharacterSheet(character, false);
            }
            showToast(error.message, 'error');
        });
}

function applyLocalStatDelta(characterId, type, delta) {
    const character = characters.find(item => item.id === characterId);
    if (!character) return 0;

    const maxKey = statMaxKey[type];
    const before = Number(character[type]);
    const max = Number(character[maxKey]);
    const next = Math.min(max, Math.max(0, before + delta));

    const actualDelta = next - before;
    if (!actualDelta) return 0;

    character[type] = next;
    updateCardStat(character, type);

    if (sheetCharacterId === characterId) {
        fillCharacterSheet(character, false);
    }

    return actualDelta;
}

function updateCardStat(character, type) {
    const card = list.querySelector(`[data-character-id="${character.id}"]`);
    if (!card) return;

    const bar = card.querySelector(`.character-stat.${type}`);
    if (!bar) return;

    const current = character[type];
    const max = character[statMaxKey[type]];

    bar.querySelector('i').style.width = `${percent(current, max)}%`;
    bar.querySelector('em').textContent = formatStat(current, max);
}

function statStep(character, type, direction) {
    if (statDisplayMode === 'percent') {
        const max = Number(character[statMaxKey[type]]) || 0;
        // 百分比模式：每次固定改變最大值的 1%。
        return Number((direction * max / 100).toFixed(4));
    }
    // 數字模式：每次固定 1 點。
    return direction;
}

function createStatBar(type, current, max, character) {
    const bar = document.createElement('div');
    bar.className = `character-stat ${type}`;
    bar.title = '數字模式：每次 1｜百分比模式：每次 1%｜長按 650ms 後每 70ms 連續調整';

    const fill = document.createElement('i');
    fill.style.width = `${percent(current, max)}%`;

    const label = document.createElement('span');
    label.innerHTML = `<b>${type.toUpperCase()}</b><em>${formatStat(current, max)}</em>`;
    bar.append(fill, label);

    bar.addEventListener('mousedown', event => {
        const direction = event.button === 0 ? -1 : event.button === 2 ? 1 : 0;
        if (!direction) return;
        const delta = statStep(character, type, direction);
        if (!delta) return;

        event.preventDefault();

        // 若上一次尚未完成，先送出上一筆累計。
        stopAdjustment(true);

        activeAdjustment = {
            characterId: character.id,
            type,
            delta,
            totalDelta: 0,
            before: Number(character[type]),
            delay: null,
            interval: null
        };

        activeAdjustment.totalDelta += applyLocalStatDelta(character.id, type, delta);

        activeAdjustment.delay = setTimeout(() => {
            if (!activeAdjustment) return;

            activeAdjustment.interval = setInterval(() => {
                if (!activeAdjustment) return;

                activeAdjustment.totalDelta += applyLocalStatDelta(
                    activeAdjustment.characterId,
                    activeAdjustment.type,
                    activeAdjustment.delta
                );
            }, 70);
        }, 650);
    });

    bar.addEventListener('contextmenu', event => event.preventDefault());
    return bar;
}

function setupCharacterDrag(imageArea, character) {
    imageArea.addEventListener('pointerdown', startEvent => {
        if (startEvent.button !== 0) return;

        const startX = startEvent.clientX;
        const startY = startEvent.clientY;
        let dragging = false;
        let ghost = null;

        function move(event) {
            if (!dragging && Math.hypot(event.clientX - startX, event.clientY - startY) > 6) {
                dragging = true;
                ghost = createImageOrInitial(character.image, character.name, 'drag-ghost');
                ghost.classList.add(character.kind === 'enemy' ? 'enemy-token' : 'player-token');
                document.body.appendChild(ghost);
            }

            if (!ghost) return;
            ghost.style.left = `${event.clientX - 28}px`;
            ghost.style.top = `${event.clientY - 28}px`;
        }

        async function end(event) {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', end);
            ghost?.remove();
            if (!dragging) return;

            const target = document.elementFromPoint(event.clientX, event.clientY);
            const cell = target?.closest('.cell');
            if (!cell) return;

            await placeCharacterOnBattlefield(character, cell);
        }

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', end);
    });
}

function buffIconSvg(icon) {
    const icons = {
        sword: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 4-4"></path><path d="m14 4 6 0v6l-9 9-6-6z"></path><path d="m8 12 4 4"></path></svg>`,
        command_attack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 16 8"></path><path d="m13 5 6 0 0 6"></path><path d="m4 10 5 5"></path><path d="M4 4h5"></path></svg>`,
        warcry: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4"></path><path d="M7 9v6"></path><path d="M10 7v10"></path><path d="M14 8c2 1 3 2.3 3 4s-1 3-3 4"></path><path d="M17 5c3 2 5 4.3 5 7s-2 5-5 7"></path></svg>`,
        shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.7 8-7 10-4.3-2-7-5.4-7-10V6z"></path><path d="M12 7v10"></path><path d="M8 11h8"></path></svg>`,
        command_defense: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.7 8-7 10-4.3-2-7-5.4-7-10V6z"></path><path d="M9 12h6"></path><path d="M12 9v6"></path></svg>`,
        crosshair: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path></svg>`,
        wing: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16c4-1 8-5 11-11 2 5 0 11-5 14-3 2-6 1-8 0 2 0 4-1 6-3"></path><path d="M8 14c3-1 6-4 8-7"></path></svg>`,
        regen: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5c-7 0-11 3-12 9 4 1 8-1 10-5"></path><path d="M6 19c1-5 4-8 9-11"></path><path d="M4 16v4h4"></path></svg>`,
        boot: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v8l-4 4c2 3 6 4 10 4h6v-4l-7-2-1-10z"></path><path d="M5 16h8"></path></svg>`,
        auto_guard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.7 8-7 10-4.3-2-7-5.4-7-10V6z"></path><path d="m8 12 2.5 2.5L16 9"></path></svg>`,
        stance_attack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 5-5"></path><path d="m10 14 8-8"></path><path d="m14 4 6 0v6"></path><path d="M4 8c2-2 4-3 7-3"></path></svg>`,
        barrier: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V9l7-5 7 5v11"></path><path d="M8 20V10l4-3 4 3v10"></path><path d="M3 20h18"></path></svg>`,
        acceleration: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15h7"></path><path d="M6 11h8"></path><path d="M9 7h9"></path><path d="m14 15 4-4 2 2-4 4z"></path></svg>`,
        war_horn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h5l8-5v14l-8-5H4z"></path><path d="M8 14v5"></path><path d="M18 8c2 1 3 2 3 4s-1 3-3 4"></path></svg>`,
        taunt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10l3 4-3 10H7L4 9z"></path><path d="M9 10h1M14 10h1"></path><path d="M9 15c2-1 4-1 6 0"></path></svg>`,
        steadfast: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14"></path><path d="M7 20V8l5-4 5 4v12"></path><path d="M9 12h6"></path></svg>`,
        rage: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2 4-2 5 1 8 2-2 3-4 3-6 3 3 5 6 4 10-1 4-4 6-8 6s-7-2-8-6c-1-4 2-7 5-10 0 3 1 5 3 6-2-4 1-5 0-8z"></path></svg>`,
        steel_curtain: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V6h5v14"></path><path d="M10 20V4h5v16"></path><path d="M16 20V7h4v13"></path><path d="M3 20h18"></path></svg>`,
        line_defense: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18"></path><path d="M6 18V9l3-3 3 3v9"></path><path d="M13 18v-7l3-3 3 3v7"></path></svg>`,
        life_shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S5 17 5 10V6l7-3 7 3v4c0 7-7 11-7 11z"></path><path d="M12 8v7M8.5 11.5h7"></path></svg>`,
        sharpness: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 18 6"></path><path d="M14 4h6v6"></path><path d="m7 14 3 3"></path><path d="M4 6h5"></path></svg>`,
        mirage: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c3-5 6-7 8-7s5 2 8 7"></path><path d="M5 19c3-3 5-4 7-4s4 1 7 4"></path><path d="M8 6c1-2 2-3 4-3s3 1 4 3"></path></svg>`,
        sanctuary: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 8v12H5V8z"></path><path d="M9 20v-7h6v7"></path><path d="M12 7v3M10.5 8.5h3"></path></svg>`,
        quick_cast: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13h6l-1 9 9-13h-6z"></path></svg>`,
        link_source: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15 6 18a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0"></path><path d="m15 9 3-3a3 3 0 1 1 4 4l-4 4a3 3 0 0 1-4 0"></path><path d="m8 16 8-8"></path></svg>`,
        link_target: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"></path><path d="m15 7 5 5-5 5"></path><circle cx="7" cy="12" r="3"></circle></svg>`,
        wind: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h10c3 0 3-4 0-4"></path><path d="M3 12h16c3 0 3-4 0-4"></path><path d="M3 16h11c3 0 3 4 0 4"></path></svg>`,
        empower: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 10-10"></path><path d="m13 5 6 0 0 6"></path><path d="M6 6l2 2M4 10h3M10 4v3"></path><path d="M15 15l2 2M18 13v3M13 18h3"></path></svg>`,
        guard_ready: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"></path><path d="M8 12h8"></path></svg>`,
        block_seal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"></path><path d="m8 8 8 8M16 8l-8 8"></path></svg>`,
        break_formation: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 19 5"></path><path d="M14 4h6v6"></path><path d="M5 8h5M5 12h3M5 16h1"></path></svg>`,
        bleeding: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s5 6 5 11a5 5 0 0 1-10 0c0-5 5-11 5-11z"></path></svg>`,
        stun: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.2 5.2L20 6l-3.3 4.7L22 13l-5.3 2.3L20 20l-5.8-1.2L12 24l-2.2-5.2L4 20l3.3-4.7L2 13l5.3-2.3L4 6l5.8 1.2z"></path></svg>`,
        feign_death: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14"></path><path d="M7 19v-7a5 5 0 0 1 10 0v7"></path><path d="M9 8 7 6M15 8l2-2"></path><path d="M12 11v5M9.5 13.5h5"></path></svg>`,
        darkness: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><path d="m4 4 16 16"></path></svg>`,
        poison: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6"></path><path d="M10 3v5l-5 8a4 4 0 0 0 3.5 6h7a4 4 0 0 0 3.5-6l-5-8V3"></path><path d="M7 16h10"></path></svg>`,
        burning: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2c1 4-2 5 0 8 2-2 4-4 4-7 3 4 4 7 3 11-1 5-4 8-8 8s-8-3-8-8c0-4 3-7 6-10 0 4 1 6 3 7-2-4 2-6 0-9z"></path></svg>`,
        frozen: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4 7l16 10M4 17 20 7"></path><path d="m9 4 3 3 3-3M9 20l3-3 3 3M5 10l4-1-1-4M19 14l-4 1 1 4"></path></svg>`,
        berserk: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20 18 4"></path><path d="m14 4 4 0 0 4"></path><path d="M4 13c2-4 5-6 9-6"></path><path d="M8 21c-2-2-3-5-2-8"></path></svg>`,
        duel: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 7-7M13 11l7-7M15 4h5v5"></path><path d="m20 20-7-7M11 11 4 4M4 4h5v5"></path></svg>`,
        attack_down: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 16 8"></path><path d="m13 5 6 0 0 6"></path><path d="m4 10 5 5"></path><path d="m15 16 3 3 3-3"></path></svg>`,
        defense_down: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"></path><path d="M8 12h8"></path><path d="m15 16 3 3 3-3"></path></svg>`,
        dodge_down: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h14"></path><path d="m13 8 4 4-4 4"></path><path d="M19 4v16"></path></svg>`,
        dodge_up: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12H7"></path><path d="m11 8-4 4 4 4"></path><path d="M5 4v16"></path></svg>`,
        speed_down: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h10"></path><path d="M6 12h11"></path><path d="M9 8h10"></path><path d="m15 17 3 3 3-3"></path></svg>`,
        vulnerable: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"></path><path d="m8 8 8 8M16 8l-8 8"></path></svg>`
    };

    return icons[icon] || icons.sword;
}


let buffTooltipLayer = null;

function ensureBuffTooltipLayer() {
    if (buffTooltipLayer) return buffTooltipLayer;

    buffTooltipLayer = document.createElement('div');
    buffTooltipLayer.id = 'buff-tooltip-layer';
    buffTooltipLayer.className = 'buff-tooltip-layer hidden';
    document.body.appendChild(buffTooltipLayer);
    return buffTooltipLayer;
}

function showBuffTooltip(button, text) {
    const layer = ensureBuffTooltipLayer();
    layer.textContent = text;
    layer.classList.remove('hidden');

    requestAnimationFrame(() => {
        const rect = button.getBoundingClientRect();
        const tooltipRect = layer.getBoundingClientRect();

        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        left = Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, left));

        // 比原本再往上留更多距離，避免壓住角色卡與 Buff 圖標。
        let top = rect.top - tooltipRect.height - 34;

        if (top < 10) {
            // 上方空間不足才放到下方。
            top = Math.min(
                window.innerHeight - tooltipRect.height - 10,
                rect.bottom + 18
            );
        }

        layer.style.left = `${left}px`;
        layer.style.top = `${Math.max(10, top)}px`;
    });
}

function hideBuffTooltip() {
    buffTooltipLayer?.classList.add('hidden');
}

function formatStatDelta(delta) {
    const value = Number(delta || 0);
    if (!Number.isFinite(value) || Math.abs(value) < 0.0001) return '';
    const rounded = Number.isInteger(value) ? value : Number(value.toFixed(2));
    return rounded > 0 ? `(+${rounded})` : `(${rounded})`;
}

function createBuffIcon(character, buff) {
    const button = document.createElement('button');
    button.type = 'button';
    const statusClass =
        buff.subtype === 'abnormal'
            ? 'debuff-status abnormal-status'
            : buff.kind === 'debuff'
                ? 'debuff-status'
                : buff.kind === 'special'
                    ? 'special-status'
                    : 'buff-status';
    button.className = `buff-icon ${statusClass}`;
    button.innerHTML = buffIconSvg(buff.icon);
    const stackText = Number(buff.stackCount || 1) > 1
        ? ` ×${buff.stackCount}`
        : '';
    const valueText = buff.parametric
        ? ''
        : (buff.valueNum !== null && buff.valueNum !== undefined
            ? `\n目前數值：${compactNumber(buff.valueNum)}`
            : '');
    const durationText = buff.expiresRound
        ? `\n期限：第 ${buff.expiresRound} 輪結束前或提前觸發`
        : '';
    const sourceText = buff.sourceSkillName
        ? `\n來自 ${buff.sourceCharacterName || '未知角色'} 的「${buff.sourceSkillName}」`
        : '';
    const kindText =
        buff.subtype === 'abnormal'
            ? '異常狀態'
            : buff.kind === 'debuff'
                ? '減益'
                : buff.kind === 'special'
                    ? '特殊狀態'
                    : '增益';
    const detailText =
        `【${kindText}】${buff.name}${stackText}\n${buff.effect}${valueText}${durationText}${sourceText}\n點擊可移除`;
    button.dataset.tooltip = detailText;
    button.title = `${buff.name}${stackText}｜${buff.effect}`;
    button.setAttribute('aria-label', `${buff.name}${stackText}：${buff.effect}`);

    if (Number(buff.stackCount || 1) > 1) {
        const badge = document.createElement('span');
        badge.className = 'buff-stack-count';
        badge.textContent = String(buff.stackCount);
        button.appendChild(badge);
    }

    button.addEventListener('mouseenter', () => {
        showBuffTooltip(button, detailText);
    });
    button.addEventListener('mouseleave', hideBuffTooltip);
    button.addEventListener('blur', hideBuffTooltip);

    button.addEventListener('click', async event => {
        event.stopPropagation();
        try {
            const key = buff.dbKey || buff.key;
            const updated = await api.removeBuff(character.id, key);
            replaceCharacter(updated);
            renderCharacters();
            showToast(`已移除 ${buff.name}`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    return button;
}

function openParametricModPicker(character, catalogEntry) {
    const stats = catalogEntry.stats || [];
    const modes = catalogEntry.modes || ['flat', 'pct'];
    const panel = document.createElement('div');
    panel.className = 'buff-mod-picker';
    panel.innerHTML = `
        <label>能力值
            <select id="buff-mod-stat">
                ${stats.map(s => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.label)}</option>`).join('')}
            </select>
        </label>
        <label>模式
            <select id="buff-mod-mode">
                ${modes.map(m => `<option value="${escapeHtml(m)}">${m === 'pct' ? '百分比' : '固定值'}</option>`).join('')}
            </select>
        </label>
        <label>數值（整數，可負）
            <input id="buff-mod-value" type="number" step="1" value="10">
        </label>
        <button type="button" class="primary-btn" id="buff-mod-apply">套用</button>
    `;

    const choices = document.getElementById('buff-choice-list');
    choices.innerHTML = '';
    choices.appendChild(panel);

    panel.querySelector('#buff-mod-apply').addEventListener('click', async () => {
        const stat = panel.querySelector('#buff-mod-stat').value;
        const mode = panel.querySelector('#buff-mod-mode').value;
        const valueNum = Math.trunc(Number(panel.querySelector('#buff-mod-value').value));
        if (!Number.isFinite(valueNum) || valueNum === 0) {
            showToast('請輸入非零整數', 'error');
            return;
        }
        try {
            const sourceCharacterId =
                Number(localStorage.getItem('trpg-action-actor-id')) ||
                character.id;
            const updated = await api.addBuff(
                character.id,
                null,
                sourceCharacterId,
                { stat, mode, valueNum }
            );
            replaceCharacter(updated);
            renderCharacters();
            closeModal('buff-modal');
            const label = stats.find(s => s.key === stat)?.label || stat;
            showToast(`已套用 ${label} ${valueNum > 0 ? '+' : ''}${valueNum}${mode === 'pct' ? '%' : ''}`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function openTickValuePicker(character, buff) {
    const panel = document.createElement('div');
    panel.className = 'buff-mod-picker';
    panel.innerHTML = `
        <p class="buff-picker-hint">設定「${escapeHtml(buff.name)}」每次損失的 HP 數值。</p>
        <label>效果值（正整數）
            <input id="buff-tick-value" type="number" min="1" step="1" value="10">
        </label>
        <button type="button" class="primary-btn" id="buff-tick-apply">套用</button>
    `;

    const choices = document.getElementById('buff-choice-list');
    choices.innerHTML = '';
    choices.appendChild(panel);

    panel.querySelector('#buff-tick-apply').addEventListener('click', async () => {
        const valueNum = Math.trunc(Number(panel.querySelector('#buff-tick-value').value));
        if (!Number.isFinite(valueNum) || valueNum <= 0) {
            showToast('請輸入正整數效果值', 'error');
            return;
        }
        try {
            const updated = await api.addBuff(character.id, buff.key, null, { valueNum });
            replaceCharacter(updated);
            renderCharacters();
            closeModal('buff-modal');
            showToast(`已套用 ${buff.name}（每次 ${valueNum} HP）`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function openLinkedCharacterPicker(character, buff, {
    mode = 'source',
    title = '選擇角色'
} = {}) {
    const panel = document.createElement('div');
    panel.className = 'buff-mod-picker';
    const options = characters
        .filter(item => item.id !== character.id || mode === 'source')
        .map(item => `
            <option value="${item.id}">
                ${escapeHtml(item.name)}（${item.kind === 'enemy' ? '敵方' : '友方'}）
            </option>
        `)
        .join('');

    panel.innerHTML = `
        <p class="buff-picker-hint">${escapeHtml(title)}</p>
        <label>角色
            <select id="buff-link-character">${options}</select>
        </label>
        <button type="button" class="primary-btn" id="buff-link-apply">套用</button>
    `;

    const choices = document.getElementById('buff-choice-list');
    choices.innerHTML = '';
    choices.appendChild(panel);

    if (!options) {
        showToast('沒有可選角色', 'error');
        return;
    }

    panel.querySelector('#buff-link-apply').addEventListener('click', async () => {
        const linkedId = Number(panel.querySelector('#buff-link-character').value);
        if (!linkedId) {
            showToast('請選擇角色', 'error');
            return;
        }
        try {
            const extra = mode === 'link'
                ? { valueNum: linkedId }
                : {};
            const sourceCharacterId = mode === 'source' ? linkedId : null;
            const updated = await api.addBuff(
                character.id,
                buff.key,
                sourceCharacterId,
                extra
            );
            replaceCharacter(updated);
            renderCharacters();
            closeModal('buff-modal');
            const linked = characters.find(item => item.id === linkedId);
            showToast(`已套用 ${buff.name} → ${linked?.name || linkedId}`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function openBuffPicker(character) {
    buffCharacterId = character.id;
    document.getElementById('buff-target-name').textContent = character.name;

    const choices = document.getElementById('buff-choice-list');
    choices.innerHTML = '';
    const activeKeys = new Set((character.buffs || []).map(buff => buff.dbKey || buff.key));

    for (const buff of buffCatalog) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buff-choice';
        if (buff.parametricPicker) {
            button.disabled = false;
            const category = buff.categoryLabel || '能力值修正';
            button.innerHTML = `
                <span class="buff-choice-icon">${buffIconSvg(buff.icon)}</span>
                <span><strong>${escapeHtml(buff.name)}</strong><small>${escapeHtml(category)}｜${escapeHtml(buff.effect)}</small></span>
                <em>設定</em>
            `;
            button.addEventListener('click', () => {
                openParametricModPicker(character, buff);
            });
            choices.appendChild(button);
            continue;
        }

        button.disabled = activeKeys.has(buff.key);
        const category =
            buff.categoryLabel ||
            (buff.subtype === 'abnormal'
                ? '異常狀態'
                : buff.kind === 'debuff'
                    ? '減益'
                    : buff.kind === 'special'
                        ? '特殊狀態'
                        : '增益');
        const needsExtra = buff.manualValue || buff.manualSource || buff.manualLink;
        button.innerHTML = `
            <span class="buff-choice-icon">${buffIconSvg(buff.icon)}</span>
            <span><strong>${escapeHtml(buff.name)}</strong><small>${escapeHtml(category)}｜${escapeHtml(buff.effect)}</small></span>
            <em>${activeKeys.has(buff.key) ? '已套用' : (needsExtra ? '設定' : '＋')}</em>
        `;

        button.addEventListener('click', async () => {
            if (buff.manualValue) {
                openTickValuePicker(character, buff);
                return;
            }
            if (buff.manualSource) {
                openLinkedCharacterPicker(character, buff, {
                    mode: 'source',
                    title: `選擇「${buff.name}」的施加者`
                });
                return;
            }
            if (buff.manualLink) {
                openLinkedCharacterPicker(character, buff, {
                    mode: 'link',
                    title: `選擇「${buff.name}」的指定對象`
                });
                return;
            }
            try {
                const sourceCharacterId =
                    Number(localStorage.getItem('trpg-action-actor-id')) ||
                    character.id;
                const updated = await api.addBuff(
                    character.id,
                    buff.key,
                    sourceCharacterId
                );
                replaceCharacter(updated);
                renderCharacters();
                closeModal('buff-modal');
                showToast(`已套用 ${buff.name}`);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });

        choices.appendChild(button);
    }

    openModal('buff-modal');
}

function createBuffArea(character) {
    const area = document.createElement('div');
    area.className = `buff-area ${(character.buffs || []).length ? 'has-buffs' : ''}`;

    // 固定保留狀態列：＋ 永遠放第一顆，
    // 不再藏在 hover drawer 裡，避免 Buff 多時難以點擊。
    const row = document.createElement('div');
    row.className = 'buff-row';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'buff-add-btn buff-add-inline';
    addButton.innerHTML = '<span>＋</span>';
    addButton.title = '新增 Buff／Debuff／狀態';
    addButton.setAttribute('aria-label', '新增 Buff／Debuff／狀態');
    addButton.addEventListener('click', event => {
        event.stopPropagation();
        openBuffPicker(character);
    });

    row.appendChild(addButton);

    for (const buff of character.buffs || []) {
        row.appendChild(createBuffIcon(character, buff));
    }

    area.appendChild(row);
    return area;
}

function renderCharacters() {
    if (currentSection === 'rules') return;

    const keyword = searchInput.value.trim().toLowerCase();
    const playerCount = characters.filter(character => character.kind !== 'enemy').length;
    const enemyCount = characters.filter(character => character.kind === 'enemy').length;
    setSidebarCounts(playerCount, enemyCount);

    const sorted = [...characters]
        .filter(character => (character.kind === 'enemy' ? 'enemy' : 'player') === currentSection)
        .filter(character => String(character.name).toLowerCase().includes(keyword))
        .sort((a, b) => Number(b.speed) - Number(a.speed) || Number(a.id) - Number(b.id));

    list.innerHTML = '';

    if (!sorted.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-list';
        empty.textContent = currentSection === 'enemy' ? '尚未建立敵人' : '尚未建立角色';
        list.appendChild(empty);
        return;
    }

    for (const character of sorted) {
        const card = document.createElement('article');
        card.className = `character-card ${character.kind === 'enemy' ? 'enemy-card' : ''}`;
        card.dataset.characterId = character.id;

        const portrait = createImageOrInitial(character.image, character.name, 'character-portrait');
        portrait.title = '雙擊查看角色卡；拖曳到戰場';
        portrait.addEventListener('dblclick', () => openCharacterSheet(character));
        setupCharacterDrag(portrait, character);

        const speed = document.createElement('span');
        speed.className = 'speed-badge';
        const shownSpeed = character.effective?.speed ?? character.speed;
        speed.textContent = shownSpeed;
        if (shownSpeed !== character.speed) {
            speed.classList.add('buffed-speed');
            speed.title = `基礎速度 ${character.speed} → Buff後 ${shownSpeed}`;
        }
        portrait.appendChild(speed);

        const name = document.createElement('div');
        name.className = 'character-name';
        name.innerHTML = `<span>${escapeHtml(character.name)}</span>${character.kind === 'enemy' ? '<small>ENEMY</small>' : ''}`;

        const stats = document.createElement('div');
        stats.className = 'character-bars';
        stats.append(
            createStatBar('hp', character.hp, character.maxHp, character),
            createStatBar('ap', character.ap, character.maxAp, character),
            createStatBar('sp', character.sp, character.maxSp, character)
        );

        const main = document.createElement('div');
        main.className = 'character-main';
        main.append(name, stats);

        card.append(portrait, main, createBuffArea(character));
        list.appendChild(card);
    }
}

function setSheetInput(id, value) {
    document.getElementById(id).value = value ?? 0;
}


function getEquippedSkillAt(character, slotIndex) {
    return (character.equippedSkills || []).find(skill => Number(skill.slotIndex) === slotIndex) || null;
}

function renderInitialSkillTags() {
    const container = document.getElementById('initial-skill-tags');
    if (!container || container.childElementCount) return;

    for (const name of ['基礎攻擊', '救援', '基礎格擋', '基礎移動']) {
        const tag = document.createElement('span');
        tag.textContent = name;
        container.appendChild(tag);
    }
}

function renderSkillLoadout(character) {
    renderInitialSkillTags();

    const container = document.getElementById('sheet-skill-slots');
    if (!container) return;

    container.innerHTML = '';
    const slotCount = Math.max(0, Math.min(30, Number(character.skillSlots ?? 1)));

    if (!slotCount) {
        const empty = document.createElement('div');
        empty.className = 'skill-slots-empty';
        empty.textContent = '戰技數量為 0，目前沒有可裝備的戰技欄。';
        container.appendChild(empty);
        return;
    }

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
        const equipped = getEquippedSkillAt(character, slotIndex);

        const button = document.createElement('button');
        button.type = 'button';
        const actionClass = equipped
            ? ` action-${String(equipped.actionCode || 'UTILITY').toLowerCase()}`
            : '';
        button.className = `skill-slot ${equipped ? 'equipped' : ''}${actionClass}`;

        if (equipped) {
            button.innerHTML = `
                <span class="skill-slot-number">${slotIndex + 1}</span>
                <span class="skill-slot-content">
                    <strong>${escapeHtml(equipped.name)}</strong>
                    <small>${escapeHtml(equipped.source)}｜Lv.${escapeHtml(equipped.level)}｜${escapeHtml(equipped.cost)}</small>
                </span>
            `;
            button.title = `${equipped.name}\n${equipped.effect}`;
        } else {
            button.innerHTML = `
                <span class="skill-slot-number">${slotIndex + 1}</span>
                <span class="skill-slot-empty-mark">＋ 選擇戰技</span>
            `;
        }

        button.addEventListener('click', () => openSkillPicker(character, slotIndex));
        container.appendChild(button);
    }
}

async function getSkillCatalog(profession) {
    const key = profession || '';
    if (skillCatalogCache.has(key)) return skillCatalogCache.get(key);

    const catalog = await api.getSkillCatalog(key);
    skillCatalogCache.set(key, catalog);
    return catalog;
}

function createSkillChoice(skill, character, slotIndex, selectedProfession) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `skill-picker-choice action-${String(skill.actionCode || 'UTILITY').toLowerCase()}`;

    const alreadyEquipped = (character.equippedSkills || [])
        .some(item => item.key === skill.key && Number(item.slotIndex) !== slotIndex);

    button.disabled = alreadyEquipped;
    button.innerHTML = `
        <span class="skill-choice-level">Lv.${escapeHtml(skill.level)}</span>
        <span class="skill-choice-main">
            <strong>${escapeHtml(skill.name)}</strong>
            <small>${escapeHtml(skill.timing)}｜${escapeHtml(skill.cost)}｜${escapeHtml(skill.weapon)}</small>
            <p>${escapeHtml(skill.effect)}</p>
        </span>
        <em>${alreadyEquipped ? '已攜帶' : '選擇'}</em>
    `;

    button.addEventListener('click', () => {
        if (button.disabled) return;

        const previousProfession = character.profession || '';
        const previousSkills = structuredClone(character.equippedSkills || []);
        const professionChanged = Boolean(selectedProfession && selectedProfession !== previousProfession);
        const baseSkills = professionChanged ? [] : previousSkills;
        const optimisticSkills = baseSkills.filter(item => Number(item.slotIndex) !== slotIndex && item.key !== skill.key);
        optimisticSkills.push({ slotIndex, ...skill });
        optimisticSkills.sort((a, b) => Number(a.slotIndex) - Number(b.slotIndex));

        character.profession = selectedProfession || previousProfession;
        character.equippedSkills = optimisticSkills;
        renderSkillLoadout(character);
        renderCharacters();
        closeModal('skill-picker-modal');

        // UI 先立刻完成，資料庫同步放到背景，避免 Neon 網路延遲讓點擊像沒反應。
        api.setCharacterSkill(character.id, slotIndex, skill.key, character.profession, Number(document.getElementById('sheet-skillSlots-input').value) || character.skillSlots || 0)
            .then(updated => {
                replaceCharacter(updated);
                if (sheetCharacterId === character.id) renderSkillLoadout(updated);
            })
            .catch(error => {
                character.profession = previousProfession;
                character.equippedSkills = previousSkills;
                renderSkillLoadout(character);
                renderCharacters();
                showToast(error.message, 'error');
            });
    });

    return button;
}

async function openSkillPicker(character, slotIndex) {
    skillPickerSlotIndex = slotIndex;

    const current = getEquippedSkillAt(character, slotIndex);
    const currentEl = document.getElementById('skill-picker-current');
    const listEl = document.getElementById('skill-picker-list');

    currentEl.innerHTML = `
        <span>戰技欄 ${slotIndex + 1}</span>
        <strong>${current ? escapeHtml(current.name) : '尚未攜帶戰技'}</strong>
    `;

    listEl.innerHTML = '<div class="skill-picker-loading">讀取戰技資料…</div>';
    openModal('skill-picker-modal');

    try {
        const selectedProfession = document.getElementById('sheet-profession-select').value || character.profession || '';
        const catalog = await getSkillCatalog(selectedProfession);
        listEl.innerHTML = '';

        if (current) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'skill-remove-choice';
            remove.textContent = `卸下目前戰技：${current.name}`;

            remove.addEventListener('click', () => {
                const previousSkills = structuredClone(character.equippedSkills || []);
                character.equippedSkills = previousSkills.filter(item => Number(item.slotIndex) !== slotIndex);
                renderSkillLoadout(character);
                renderCharacters();
                closeModal('skill-picker-modal');

                api.setCharacterSkill(character.id, slotIndex, null, selectedProfession, Number(document.getElementById('sheet-skillSlots-input').value) || character.skillSlots || 0)
                    .then(updated => replaceCharacter(updated))
                    .catch(error => {
                        character.equippedSkills = previousSkills;
                        renderSkillLoadout(character);
                        renderCharacters();
                        showToast(error.message, 'error');
                    });
            });

            listEl.appendChild(remove);
        }

        const addGroup = (title, skills, hint = '') => {
            const section = document.createElement('section');
            section.className = 'skill-picker-group';

            const heading = document.createElement('div');
            heading.className = 'skill-picker-group-heading';
            heading.innerHTML = `<strong>${escapeHtml(title)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}`;
            section.appendChild(heading);

            if (!skills.length) {
                const empty = document.createElement('div');
                empty.className = 'skill-picker-empty';
                empty.textContent = '目前沒有可選戰技。';
                section.appendChild(empty);
            } else {
                for (const skill of skills) {
                    section.appendChild(createSkillChoice(skill, character, slotIndex, selectedProfession));
                }
            }

            listEl.appendChild(section);
        };

        if (selectedProfession) {
            addGroup(
                `${selectedProfession}戰技`,
                catalog.professionSkills || [],
                '依職業分頁'
            );
        } else {
            addGroup('職業戰技', [], '請先在角色卡選擇職業並儲存');
        }

        addGroup('通用戰技', catalog.common || [], '所有職業皆可選擇');
    } catch (error) {
        listEl.innerHTML = `<div class="skill-picker-error">${escapeHtml(error.message)}</div>`;
    }
}

function fillCharacterSheet(character, overwriteInputs = true) {
    sheetCharacterId = character.id;
    const enemy = character.kind === 'enemy';

    document.getElementById('sheet-kicker').textContent = enemy ? 'ENEMY SHEET' : 'CHARACTER SHEET';
    document.getElementById('sheet-name').textContent = character.name;
    document.getElementById('sheet-delete-btn').textContent = enemy ? '刪除敵人' : '刪除角色';

    const imageWrap = document.getElementById('sheet-image-wrap');
    imageWrap.innerHTML = '';
    const image = createImageOrInitial(character.image, character.name, 'sheet-image');
    image.classList.toggle('enemy-token', enemy);
    imageWrap.appendChild(image);

    for (const [type, current, max] of [
        ['hp', character.hp, character.maxHp],
        ['ap', character.ap, character.maxAp],
        ['sp', character.sp, character.maxSp]
    ]) {
        document.getElementById(`sheet-${type}-fill`).style.width = `${percent(current, max)}%`;
        if (overwriteInputs) {
            setSheetInput(`sheet-${type}-input`, current);
            setSheetInput(`sheet-max-${type}-input`, max);
        }
    }

    if (overwriteInputs) {
        const values = {
            'sheet-patk-input': character.patk,
            'sheet-matk-input': character.matk,
            'sheet-crit-input': character.crit,
            'sheet-critDamageBonus-input': character.critDamageBonus ?? 0,
            'sheet-hitRate-input': character.hitRate,
            'sheet-dodge-input': character.dodge,
            'sheet-speed-input': character.speed,
            'sheet-defense-input': character.defense,
            'sheet-resist-input': character.resist,
            'sheet-blockRate-input': character.blockRate ?? 0,
            'sheet-skillSlots-input': character.skillSlots ?? 1
        };
        for (const [id, value] of Object.entries(values)) setSheetInput(id, value);
        document.getElementById('sheet-profession-select').value = character.profession || '';

        const effectivePairs = {
            'sheet-patk-input': ['物理攻擊', 'patk', character.patk, character.effective?.patk, character.effective?.patkDelta],
            'sheet-matk-input': ['魔法攻擊', 'matk', character.matk, character.effective?.matk, character.effective?.matkDelta],
            'sheet-crit-input': ['暴擊率 %', 'crit', character.crit, character.effective?.crit, character.effective?.critDelta],
            'sheet-critDamageBonus-input': ['額外暴擊傷害 %', 'critDamageBonus', character.critDamageBonus ?? 0, character.effective?.critDamageBonus ?? character.critDamageBonus ?? 0, character.effective?.critDamageBonusDelta],
            'sheet-hitRate-input': ['命中', 'hitRate', character.hitRate, character.effective?.hitRate, character.effective?.hitRateDelta],
            'sheet-dodge-input': ['迴避', 'dodge', character.dodge, character.effective?.dodge, character.effective?.dodgeDelta],
            'sheet-speed-input': ['行動速度', 'speed', character.speed, character.effective?.speed, character.effective?.speedDelta],
            'sheet-defense-input': ['防禦', 'defense', character.defense, character.effective?.defense, character.effective?.defenseDelta],
            'sheet-resist-input': ['魔抗', 'resist', character.resist, character.effective?.resist, character.effective?.resistDelta],
            'sheet-blockRate-input': ['格擋率', 'blockRate', character.blockRate, character.effective?.blockRate, character.effective?.blockRateDelta]
        };

        for (const [id, [label, deltaKey, base, effective, delta]] of Object.entries(effectivePairs)) {
            const input = document.getElementById(id);
            const baseNumber = Number(base ?? 0);
            const effectiveNumber = Number(effective ?? baseNumber);
            const deltaNumber = Number(
                delta ?? (effectiveNumber - baseNumber)
            );
            const changed = Math.abs(deltaNumber) > 0.0001;
            const deltaText = formatStatDelta(deltaNumber);

            input.classList.toggle('buffed-stat-input', changed);
            input.title = changed
                ? `${label}：基礎 ${compactNumber(baseNumber)} → 有效 ${compactNumber(effectiveNumber)}`
                : `${label}：${compactNumber(baseNumber)}`;

            const deltaEl = document.querySelector(`.stat-delta[data-delta="${deltaKey}"]`);
            if (deltaEl) {
                deltaEl.textContent = deltaText;
                deltaEl.classList.toggle('is-up', deltaNumber > 0);
                deltaEl.classList.toggle('is-down', deltaNumber < 0);
                deltaEl.classList.toggle('hidden', !deltaText);
            }
        }

        const maxHpDeltaEl = document.querySelector('.stat-delta[data-delta="maxHp"]');
        if (maxHpDeltaEl) {
            const maxHpDelta = Number(character.effective?.maxHpDelta || 0);
            const maxHpText = formatStatDelta(maxHpDelta);
            maxHpDeltaEl.textContent = maxHpText;
            maxHpDeltaEl.classList.toggle('is-up', maxHpDelta > 0);
            maxHpDeltaEl.classList.toggle('is-down', maxHpDelta < 0);
            maxHpDeltaEl.classList.toggle('hidden', !maxHpText);
        }
    }

    renderSkillLoadout(character);

    const buffStrip = document.getElementById('sheet-buffs');
    buffStrip.innerHTML = '';
    for (const buff of character.buffs || []) buffStrip.appendChild(createBuffIcon(character, buff));
    buffStrip.classList.toggle('hidden', !(character.buffs || []).length);
}

function openCharacterSheet(character) {
    fillCharacterSheet(character);
    openModal('character-sheet-modal');
}

async function loadCharacters() {
    try {
        const fallbackBuffs = [
            { key: 'patk_up_25', name: '物理攻擊 +25%', effect: '物理攻擊 +25%', icon: 'stat_up', kind: 'buff' },
            { key: 'damage_up_25', name: '造成傷害 +25%', effect: '造成傷害 +25%', icon: 'stat_up', kind: 'buff' },
            { key: 'defense_up_25', name: '防禦 +25%', effect: '防禦 +25%', icon: 'stat_up', kind: 'buff' }
        ];

        const [loadedCharacters, loadedBuffs] = await Promise.all([
            api.getCharacters(),
            buffCatalog.length
                ? Promise.resolve(buffCatalog)
                : api.getBuffCatalog().catch(() => fallbackBuffs)
        ]);

        characters = loadedCharacters;
        buffCatalog = loadedBuffs?.length ? loadedBuffs : fallbackBuffs;
        renderCharacters();
        emitCharactersUpdated();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function openCreateModal() {
    createKind = currentSection;
    const enemy = createKind === 'enemy';

    document.getElementById('create-kicker').textContent = enemy ? 'ENEMY' : 'CHARACTER';
    document.getElementById('create-title').textContent = enemy ? '建立敵人' : '建立角色';
    document.getElementById('create-description').textContent = enemy
        ? '建立敵方單位後，可以從敵人列表拖曳到戰場。'
        : '建立角色後，可以從角色列表拖曳到戰場。';
    document.getElementById('create-submit-label').textContent = enemy ? '建立敵人' : '建立角色';
    openModal('create-modal');
}

function initCreateCharacter() {
    const form = document.getElementById('create-form');
    const imageInput = document.getElementById('input-image');
    const preview = document.getElementById('preview-img');
    const placeholder = document.getElementById('preview-placeholder');

    document.getElementById('open-create-btn').addEventListener('click', openCreateModal);

    imageInput.addEventListener('change', () => {
        const file = imageInput.files[0];
        if (!file) {
            preview.classList.add('hidden');
            placeholder.classList.remove('hidden');
            return;
        }

        preview.src = URL.createObjectURL(file);
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('kind', createKind);
        formData.append('profession', document.getElementById('input-profession').value);
        formData.append('skillSlots', document.getElementById('input-skillSlots').value);

        const fields = {
            name: 'input-name', hp: 'input-hp', ap: 'input-ap', sp: 'input-sp',
            patk: 'input-patk', matk: 'input-matk', crit: 'input-crit',
            critDamageBonus: 'input-critDamageBonus',
            hitRate: 'input-hitRate', dodge: 'input-dodge', speed: 'input-speed',
            defense: 'input-defense', resist: 'input-resist',
            blockRate: 'input-blockRate'
        };

        for (const [name, id] of Object.entries(fields)) {
            formData.append(name, document.getElementById(id).value);
        }
        if (imageInput.files[0]) formData.append('image', imageInput.files[0]);

        try {
            const created = await api.createCharacter(formData);
            characters.push(created);
            form.reset();
            preview.src = '';
            preview.classList.add('hidden');
            placeholder.classList.remove('hidden');
            closeModal('create-modal');
            renderCharacters();
            emitCharactersUpdated();
            showToast(createKind === 'enemy' ? '敵人建立完成' : '角色建立完成');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function readSheetPayload() {
    const value = id => Number(document.getElementById(id).value);
    return {
        hp: value('sheet-hp-input'),
        maxHp: value('sheet-max-hp-input'),
        ap: value('sheet-ap-input'),
        maxAp: value('sheet-max-ap-input'),
        sp: value('sheet-sp-input'),
        maxSp: value('sheet-max-sp-input'),
        patk: value('sheet-patk-input'),
        matk: value('sheet-matk-input'),
        crit: value('sheet-crit-input'),
        critDamageBonus: Math.max(0, value('sheet-critDamageBonus-input')),
        hitRate: value('sheet-hitRate-input'),
        dodge: value('sheet-dodge-input'),
        speed: value('sheet-speed-input'),
        defense: value('sheet-defense-input'),
        resist: value('sheet-resist-input'),
        blockRate: Math.max(0, Math.min(75, value('sheet-blockRate-input'))),
        profession: document.getElementById('sheet-profession-select').value,
        skillSlots: Math.max(0, Math.min(30, value('sheet-skillSlots-input')))
    };
}

function initCharacterSheetActions() {
    document.getElementById('sheet-skillSlots-input').addEventListener('input', event => {
        const character = characters.find(item => item.id === sheetCharacterId);
        if (!character) return;

        const preview = {
            ...character,
            skillSlots: Math.max(0, Math.min(30, Number(event.target.value) || 0))
        };
        renderSkillLoadout(preview);
    });

    document.getElementById('sheet-profession-select').addEventListener('change', event => {
        const profession = event.target.value;
        const character = characters.find(item => item.id === sheetCharacterId);
        skillCatalogCache.delete(profession);
        getSkillCatalog(profession).catch(() => {});
        if (character) {
            renderSkillLoadout({ ...character, profession });
        }
    });

    document.getElementById('sheet-save-btn').addEventListener('click', () => {
        const character = characters.find(item => item.id === sheetCharacterId);
        if (!character) return;

        const payload = readSheetPayload();
        const before = { ...character };
        const optimistic = {
            ...character,
            ...payload,
            effective: {
                ...(character.effective || {}),
                patk: payload.patk,
                matk: payload.matk,
                crit: payload.crit,
                critDamageBonus: payload.critDamageBonus,
                hitRate: payload.hitRate,
                dodge: payload.dodge,
                speed: payload.speed,
                defense: payload.defense,
                resist: payload.resist,
                blockRate: payload.blockRate
            }
        };

        replaceCharacter(optimistic);
        renderCharacters();
        emitCharactersUpdated();
        closeModal('character-sheet-modal');
        showToast('正在儲存角色資料…');

        api.updateCharacter(character.id, payload)
            .then(updated => {
                replaceCharacter(updated);
                renderCharacters();
                emitCharactersUpdated();
                showToast('角色數值已儲存');
            })
            .catch(error => {
                replaceCharacter(before);
                renderCharacters();
                emitCharactersUpdated();
                showToast(`儲存失敗：${error.message}`, 'error');
            });
    });

    document.getElementById('sheet-vacate-btn').addEventListener('click', async () => {
        if (sheetCharacterId === null) return;
        try {
            await api.vacateCharacter(sheetCharacterId);
            document.dispatchEvent(new CustomEvent('trpg:vacate-local', {
                detail: { characterId: sheetCharacterId }
            }));
            showToast('已從戰場移除');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.getElementById('sheet-delete-btn').addEventListener('click', async () => {
        const character = characters.find(item => item.id === sheetCharacterId);
        if (!character) return;

        const label = character.kind === 'enemy' ? '敵人' : '角色';
        if (!window.confirm(`確定要永久刪除${label}「${character.name}」嗎？\n這個操作無法復原。`)) return;

        const deletedId = character.id;
        try {
            await api.deleteCharacter(deletedId);
            characters = characters.filter(item => item.id !== deletedId);
            closeModal('character-sheet-modal');
            sheetCharacterId = null;
            renderCharacters();
            emitCharactersUpdated();
            document.dispatchEvent(new CustomEvent('trpg:vacate-local', {
                detail: { characterId: deletedId }
            }));
            showToast(`${label}「${character.name}」已刪除`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.addEventListener('trpg:open-character', event => {
        const character = characters.find(item => item.id === Number(event.detail?.characterId));
        if (character) openCharacterSheet(character);
    });

    document.addEventListener('trpg:reload-characters', () => {
        loadCharacters();
    });
}

export function initCharacters(options = {}) {
    refreshBattlefield = options.refreshBattlefield || refreshBattlefield;
    placeCharacterOnBattlefield = options.placeCharacterOnBattlefield || placeCharacterOnBattlefield;

    searchInput.addEventListener('input', renderCharacters);
    modeButton.addEventListener('click', toggleStatDisplayMode);
    document.addEventListener('mouseup', () => stopAdjustment(true));
    window.addEventListener('blur', () => stopAdjustment(true));
    document.addEventListener('mouseleave', () => stopAdjustment(true));

    document.addEventListener('trpg:section-change', event => {
        currentSection = event.detail.section;
        searchInput.value = '';
        updateSectionLabels();
        renderCharacters();
    });

    updateModeButton();
    updateSectionLabels();
    initCreateCharacter();
    initCharacterSheetActions();
    return loadCharacters();
}
