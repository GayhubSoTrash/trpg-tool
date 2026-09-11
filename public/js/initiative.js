import { api } from './api.js';
import { socket } from './socket.js';
import { showToast } from './ui.js';

let state = null;
let characters = [];
let selectedActionActorId =
    Number(localStorage.getItem('trpg-action-actor-id')) || null;

// 回合按鈕可以快速連點；實際 API 依序送出，避免同時寫 battle_state 造成互相覆蓋。
let transitionQueue = Promise.resolve();
let pendingTransitions = 0;
let latestServerState = null;
let needsResync = false;

const roundTurnLabel = document.getElementById('round-turn-label');
const currentName = document.getElementById('current-turn-name');
const nextName = document.getElementById('next-turn-name');
const nextButton = document.getElementById('next-turn-btn');
const nextRoundButton = document.getElementById('next-round-btn');
const resetButton = document.getElementById('reset-combat-btn');
const actionActorSelect = document.getElementById('action-actor-select');

function chineseNumber(value) {
    const digits = ['零','一','二','三','四','五','六','七','八','九'];
    if (value <= 10) return value === 10 ? '十' : digits[value];
    if (value < 20) return `十${digits[value - 10]}`;
    if (value < 100) {
        const tens = Math.floor(value / 10);
        const ones = value % 10;
        return `${digits[tens]}十${ones ? digits[ones] : ''}`;
    }
    return String(value);
}

function effectiveSpeed(character) {
    return Number(character?.effective?.speed ?? character?.speed ?? 0);
}

function initiativeFirst(character) {
    return Boolean(
        character?.initiativeFirst ??
        character?.effective?.initiativeFirst
    );
}

function sortedCharacters(source = characters) {
    return [...source].sort((a, b) =>
        Number(initiativeFirst(b)) - Number(initiativeFirst(a)) ||
        effectiveSpeed(b) - effectiveSpeed(a) ||
        Number(a.id) - Number(b.id)
    );
}

function buildLocalState(baseState, sourceCharacters = characters) {
    if (!baseState) return null;

    const combatants = sortedCharacters(sourceCharacters).map(character => ({
        id: character.id,
        name: character.name,
        kind: character.kind,
        speed: effectiveSpeed(character),
        baseSpeed: Number(character.speed),
        hp: Number(character.hp),
        maxHp: Number(character.maxHp),
        ap: Number(character.ap),
        maxAp: Number(character.maxAp),
        sp: Number(character.sp),
        maxSp: Number(character.maxSp),
        initiativeFirst: initiativeFirst(character),
        image: character.image
    }));

    if (!combatants.length) {
        return {
            ...baseState,
            currentCharacterId: null,
            current: null,
            next: null,
            entersNextTurnPass: false,
            combatants
        };
    }

    let index = combatants.findIndex(item => item.id === baseState.currentCharacterId);
    if (index < 0) index = 0;

    return {
        ...baseState,
        currentCharacterId: combatants[index].id,
        current: combatants[index],
        next: combatants[(index + 1) % combatants.length],
        entersNextTurnPass: index === combatants.length - 1,
        combatants
    };
}

function emitActionActor() {
    const actor = characters.find(item => item.id === selectedActionActorId) || null;

    document.dispatchEvent(new CustomEvent('trpg:action-actor-changed', {
        detail: {
            actorId: actor?.id || null,
            actor
        }
    }));
}

function renderActionActorSelect() {
    actionActorSelect.innerHTML = '';

    if (!characters.length) {
        const option = document.createElement('option');
        option.textContent = '無角色';
        option.value = '';
        actionActorSelect.appendChild(option);
        actionActorSelect.disabled = true;
        selectedActionActorId = null;
        emitActionActor();
        return;
    }

    actionActorSelect.disabled = false;

    if (!characters.some(item => item.id === selectedActionActorId)) {
        selectedActionActorId = state?.currentCharacterId || characters[0].id;
    }

    for (const character of sortedCharacters()) {
        const option = document.createElement('option');
        option.value = String(character.id);
        option.textContent =
            `${character.kind === 'enemy' ? '敵・' : ''}${character.name}`;
        option.title = character.name;
        actionActorSelect.appendChild(option);
    }

    actionActorSelect.value = String(selectedActionActorId);
    localStorage.setItem('trpg-action-actor-id', String(selectedActionActorId));
    emitActionActor();
}

function setTransitionVisualState() {
    const syncing = pendingTransitions > 0;
    document.querySelector('.initiative-strip')?.classList.toggle('is-syncing', syncing);

    // 不因等待 Neon 而鎖住下一位 / 下一輪，讓快速連點仍然立即有反應。
    nextButton.disabled = !state?.current;
    nextRoundButton.disabled = !state?.current;
}

function render() {
    if (!state) return;

    roundTurnLabel.textContent =
        `第${chineseNumber(state.round)}輪－第${chineseNumber(state.turnPass)}回合`;

    if (!state.current) {
        currentName.textContent = '—';
        currentName.title = '';
        nextName.textContent = '—';
        nextName.title = '';
        setTransitionVisualState();
        return;
    }

    currentName.textContent = `${state.current.name}（${state.current.speed}）`;
    currentName.title = `${state.current.name}（速度 ${state.current.speed}）`;

    const nextSuffix = state.entersNextTurnPass ? '・下一回合' : '';
    nextName.textContent =
        `${state.next?.name || '—'}（${state.next?.speed ?? '—'}）${nextSuffix}`;
    nextName.title =
        `${state.next?.name || '—'}（速度 ${state.next?.speed ?? '—'}）${nextSuffix}`;

    setTransitionVisualState();

    document.dispatchEvent(new CustomEvent('trpg:combat-state', {
        detail: state
    }));
}

async function reloadState() {
    try {
        const loaded = await api.getCombatState();
        latestServerState = loaded;

        if (pendingTransitions === 0) {
            state = loaded;
            render();
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function optimisticNextTurn() {
    if (!state?.combatants?.length || !state.currentCharacterId) return;

    const list = state.combatants;
    let index = list.findIndex(item => item.id === state.currentCharacterId);
    if (index < 0) index = 0;

    const wrapped = index >= list.length - 1;
    const nextIndex = wrapped ? 0 : index + 1;
    const current = list[nextIndex];
    const next = list[(nextIndex + 1) % list.length];

    state = {
        ...state,
        turnPass: wrapped ? state.turnPass + 1 : state.turnPass,
        currentCharacterId: current.id,
        current,
        next,
        entersNextTurnPass: nextIndex === list.length - 1
    };

    render();
}

function optimisticNextRound() {
    if (!state?.combatants?.length) return;

    const list = [...state.combatants].sort((a, b) =>
        Number(Boolean(b.initiativeFirst)) - Number(Boolean(a.initiativeFirst)) ||
        Number(b.speed) - Number(a.speed) ||
        Number(a.id) - Number(b.id)
    );

    const current = list[0];
    const next = list[1] || current;

    state = {
        ...state,
        round: state.round + 1,
        turnPass: 1,
        currentCharacterId: current.id,
        current,
        next,
        combatants: list,
        entersNextTurnPass: list.length === 1
    };

    render();
}

function queueTransition(type) {
    if (!state?.current) return;

    if (type === 'turn') optimisticNextTurn();
    else optimisticNextRound();

    pendingTransitions += 1;
    setTransitionVisualState();

    transitionQueue = transitionQueue.then(async () => {
        try {
            const serverState =
                type === 'turn'
                    ? await api.nextTurn()
                    : await api.nextRound();

            latestServerState = serverState;
        } catch (error) {
            needsResync = true;
            showToast(error.message, 'error');
        } finally {
            pendingTransitions -= 1;

            if (pendingTransitions === 0) {
                if (needsResync) {
                    needsResync = false;
                    await reloadState();
                } else if (latestServerState) {
                    state = latestServerState;
                    render();
                }
            } else {
                setTransitionVisualState();
            }
        }
    });
}

export function initInitiative() {
    nextButton.addEventListener('click', () => queueTransition('turn'));
    nextRoundButton.addEventListener('click', () => queueTransition('round'));

    document.addEventListener('trpg:characters-updated', event => {
        characters = Array.isArray(event.detail?.characters)
            ? event.detail.characters
            : [];

        // 角色 HP / Buff / 插入行動只更新本地排序與人物資料，
        // 不再每次都額外向 Neon 讀 battle_state。
        if (state) {
            state = buildLocalState(state, characters);
            render();
        }

        renderActionActorSelect();
    });

    actionActorSelect.addEventListener('change', () => {
        selectedActionActorId = Number(actionActorSelect.value) || null;

        if (selectedActionActorId) {
            localStorage.setItem(
                'trpg-action-actor-id',
                String(selectedActionActorId)
            );
        }

        emitActionActor();
    });

    document.addEventListener('trpg:set-action-actor', event => {
        const actorId = Number(event.detail?.actorId) || null;
        if (!actorId || !characters.some(item => item.id === actorId)) return;

        selectedActionActorId = actorId;
        localStorage.setItem('trpg-action-actor-id', String(actorId));
        renderActionActorSelect();
    });

    resetButton.addEventListener('click', async () => {
        resetButton.disabled = true;

        try {
            // 先等已排隊的「下一位 / 下一輪」寫完，避免重置與舊請求互相覆蓋。
            await transitionQueue;
            pendingTransitions = 0;
            latestServerState = await api.resetCombat();
            state = latestServerState;
            render();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            resetButton.disabled = false;
        }
    });

    socket?.on('combat:state', nextState => {
        latestServerState = nextState;

        // 正在快速連點時，不讓較慢回來的 Socket 狀態把畫面倒退。
        if (pendingTransitions === 0) {
            state = nextState;
            render();
        }
    });

    reloadState();
}
