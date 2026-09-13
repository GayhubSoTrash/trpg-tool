import { api } from './api.js';
import { socket } from './socket.js';
import { createImageOrInitial, escapeHtml, showToast } from './ui.js';

const panel = document.getElementById('chat-panel');
const collapseButton = document.getElementById('chat-collapse-btn');
const clearButton = document.getElementById('chat-clear-btn');
const reactionPanel = document.getElementById('reaction-panel');
const reactionPeers = document.getElementById('reaction-peers');
const reactionTitle = document.getElementById('reaction-title');
const reactionContext = document.getElementById('reaction-context');
const reactionOptions = document.getElementById('reaction-options');
const reactionSkipButton = document.getElementById('reaction-skip-btn');
const reactionDefaultSkipButton = document.getElementById('reaction-default-skip-btn');
const reactionDefaultBar = document.getElementById('reaction-default-bar');
const timingPickPanel = document.getElementById('timing-pick-panel');
const timingPickTitle = document.getElementById('timing-pick-title');
const timingPickContext = document.getElementById('timing-pick-context');
const timingPickOptions = document.getElementById('timing-pick-options');
const battleTab = document.getElementById('chat-tab-combat');
const teamTab = document.getElementById('chat-tab-team');
const logTab = document.getElementById('chat-tab-log');
const messagesEl = document.getElementById('chat-messages');

const teamComposer = document.getElementById('team-composer');
const identityButton = document.getElementById('chat-identity-btn');
const identityMenu = document.getElementById('chat-identity-menu');
const teamInput = document.getElementById('team-message-input');
const teamForm = document.getElementById('team-message-form');

const combatComposer = document.getElementById('combat-composer');
const combatActor = document.getElementById('combat-actor');
const combatActorMenu = document.getElementById('combat-actor-menu');
const skillButton = document.getElementById('combat-skill-btn');
const skillMenu = document.getElementById('combat-skill-menu');
const combatStep = document.getElementById('combat-step');
const targetList = document.getElementById('combat-target-list');
const executeButton = document.getElementById('combat-execute-btn');
const collapsedLabel = document.querySelector('.chat-collapsed-label');

let activeChannel = 'combat';
let characters = [];
let combatState = null;
let skills = [];
let messages = { combat: [], team: [] };
let battleLogs = [];

let selectedIdentityId = Number(localStorage.getItem('trpg-chat-identity')) || null;
let selectedActionActorId = Number(localStorage.getItem('trpg-action-actor-id')) || null;
let selectedSkillKey = null;
let selectedTargetId = null;
let selectedDirection = null;
let loadedSkillActorId = null;
let loadedSkillSignature = '';
let currentReactionWindow = null;
let currentReactionPeers = [];
let currentTimingPick = null;
let reactionBusy = false;

function characterById(id) {
    return characters.find(character => character.id === Number(id)) || null;
}

function appendMessage(message) {
    const channel = message.channel === 'team' ? 'team' : 'combat';
    if (messages[channel].some(item => item.id === message.id)) return;

    messages[channel].push(message);
    messages[channel] = messages[channel].slice(-150);

    if (activeChannel === channel) renderMessages();
}

function renderAvatar(character, className) {
    return createImageOrInitial(
        character?.image,
        character?.name || '?',
        className
    );
}

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderMessages() {
    messagesEl.innerHTML = '';

    if (activeChannel === 'log') {
        if (!battleLogs.length) {
            const empty = document.createElement('div');
            empty.className = 'chat-empty';
            empty.textContent = '尚無戰場紀錄';
            messagesEl.appendChild(empty);
            return;
        }

        for (const event of battleLogs) {
            const row = document.createElement('article');
            row.className = `battle-log-entry event-${event.eventType || 'system'}`;

            const clock = document.createElement('div');
            clock.className = 'battle-log-clock';
            clock.textContent = `第${event.round}輪\n第${event.turnPass}回合`;

            const content = document.createElement('div');
            content.className = 'battle-log-content';
            content.textContent = event.content;

            row.append(clock, content);
            messagesEl.appendChild(row);
        }

        messagesEl.scrollTop = messagesEl.scrollHeight;
        return;
    }

    const list = messages[activeChannel];

    if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = activeChannel === 'combat'
            ? '尚無戰鬥紀錄'
            : '尚無隊伍訊息';
        messagesEl.appendChild(empty);
        return;
    }

    for (const message of list) {
        const row = document.createElement('article');
        row.className =
            `chat-message ${message.channel === 'combat' ? 'combat-message' : 'team-message'}`;

        const character = characterById(message.characterId);
        row.appendChild(renderAvatar(character || {
            name: message.characterName
        }, 'chat-avatar'));

        const body = document.createElement('div');
        body.className = 'chat-message-body';

        const heading = document.createElement('div');
        heading.className = 'chat-message-heading';

        const name = document.createElement('strong');
        name.textContent = message.characterName;

        const time = document.createElement('time');
        time.textContent = formatTime(message.createdAt);

        heading.append(name, time);

        const content = document.createElement('div');
        content.className = 'chat-message-content';
        content.textContent = message.content;

        body.append(heading, content);
        row.appendChild(body);
        messagesEl.appendChild(row);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setChannel(channel) {
    activeChannel = ['combat', 'team', 'log'].includes(channel) ? channel : 'combat';

    battleTab.classList.toggle('active', activeChannel === 'combat');
    teamTab.classList.toggle('active', activeChannel === 'team');
    logTab.classList.toggle('active', activeChannel === 'log');

    combatComposer.classList.toggle('hidden', activeChannel !== 'combat');
    teamComposer.classList.toggle('hidden', activeChannel !== 'team');

    renderMessages();
}

function currentIdentity() {
    const players = characters.filter(character => character.kind !== 'enemy');

    let current = players.find(character => character.id === selectedIdentityId);
    if (!current && players.length) {
        current = players[0];
        selectedIdentityId = current.id;
        localStorage.setItem('trpg-chat-identity', String(current.id));
    }

    return current || null;
}

function renderIdentityButton() {
    identityButton.innerHTML = '';

    const character = currentIdentity();

    if (!character) {
        identityButton.textContent = '選擇角色';
        identityButton.disabled = true;
        return;
    }

    identityButton.disabled = false;
    identityButton.appendChild(renderAvatar(character, 'identity-avatar'));

    const name = document.createElement('span');
    name.textContent = character.name;

    const arrow = document.createElement('i');
    arrow.textContent = '⌄';

    identityButton.append(name, arrow);
}

function renderIdentityMenu() {
    identityMenu.innerHTML = '';

    const players = characters.filter(character => character.kind !== 'enemy');

    for (const character of players) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'identity-option';
        button.classList.toggle('active', character.id === selectedIdentityId);

        button.appendChild(renderAvatar(character, 'identity-option-avatar'));

        const name = document.createElement('span');
        name.textContent = character.name;
        button.appendChild(name);

        button.addEventListener('click', () => {
            selectedIdentityId = character.id;
            localStorage.setItem('trpg-chat-identity', String(character.id));
            identityMenu.classList.add('hidden');
            renderIdentityButton();
            renderIdentityMenu();
        });

        identityMenu.appendChild(button);
    }
}

function currentActor() {
    return characterById(selectedActionActorId) || characterById(combatState?.currentCharacterId);
}

function renderCombatActor() {
    combatActor.innerHTML = '';

    const actor = currentActor();

    if (!actor) {
        combatActor.textContent = '選擇戰技操作者';
        skillButton.disabled = true;
        syncReactionDefaultSkipButton();
        return;
    }

    const knockedOut = isActorUnableToAct(actor);
    skillButton.disabled = knockedOut;
    combatActor.title = knockedOut
        ? `${actor.name} 已擊倒，無法發動戰技`
        : '點擊切換戰技操作者';
    combatActor.appendChild(renderAvatar(actor, 'identity-avatar'));

    const copy = document.createElement('span');
    copy.className = 'combat-actor-copy';

    const name = document.createElement('strong');
    name.textContent = actor.name;

    const resources = document.createElement('small');
    resources.textContent =
        `AP ${actor.ap}/${actor.maxAp}・SP ${actor.sp}/${actor.maxSp}`;

    copy.append(name, resources);

    const hint = document.createElement('em');
    hint.textContent = '點擊切換';

    const arrow = document.createElement('i');
    arrow.className = 'combat-actor-chevron';
    arrow.textContent = '⌄';

    combatActor.append(copy, hint, arrow);
    syncReactionDefaultSkipButton();
}

function renderCombatActorMenu() {
    combatActorMenu.innerHTML = '';

    for (const character of characters) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'combat-actor-option';
        button.classList.toggle(
            'active',
            character.id === selectedActionActorId
        );
        button.title = `切換為 ${character.name}`;

        button.appendChild(
            renderAvatar(character, 'identity-option-avatar')
        );

        const name = document.createElement('strong');
        name.textContent = character.name;

        const resource = document.createElement('small');
        resource.textContent =
            `AP ${character.ap}/${character.maxAp}・SP ${character.sp}/${character.maxSp}`;

        const copy = document.createElement('span');
        copy.append(name, resource);

        button.appendChild(copy);

        button.addEventListener('click', event => {
            event.stopPropagation();
            combatActorMenu.classList.add('hidden');

            document.dispatchEvent(
                new CustomEvent('trpg:set-action-actor', {
                    detail: { actorId: character.id }
                })
            );
        });

        combatActorMenu.appendChild(button);
    }
}

function selectedSkill() {
    return skills.find(skill => skill.key === selectedSkillKey) || null;
}


function reactionTriggerLabel(window) {
    if (!window) return '反應時點';

    const code = window.triggerType || window.context?.timingCode;
    if (
        code === 'ON_TARGET_DECLARED' ||
        code === 'attack_declared'
    ) {
        return '指定目標時・反應時點';
    }

    if (window.context?.timingLabel) {
        return `${window.context.timingLabel}・可用反應`;
    }

    if (
        code === 'AFTER_SKILL' ||
        code === 'AFTER_DAMAGE' ||
        code === 'AFTER_ATTACK' ||
        code === 'post_action'
    ) {
        return '發動戰技後・可用反應';
    }

    return '反應時點';
}

function reactionContextText(window) {
    if (!window) return '';

    const context = window.context || {};
    const code = window.triggerType || context.timingCode;

    if (
        code === 'ON_TARGET_DECLARED' ||
        code === 'attack_declared'
    ) {
        return `${context.actorName || '角色'}「${context.skillName || '攻擊'}」→ ${context.targetName || '目標'}`;
    }

    return `${context.actorName || '角色'}「${context.skillName || '戰技'}」・${context.timingLabel || '時點'}`;
}

function renderReactionPeers(peers = []) {
    if (!reactionPeers) return;
    reactionPeers.innerHTML = '';
    currentReactionPeers = Array.isArray(peers) ? peers : [];

    if (!currentReactionPeers.length) {
        reactionPeers.classList.add('hidden');
        return;
    }

    reactionPeers.classList.remove('hidden');
    for (const peer of currentReactionPeers) {
        const chip = document.createElement('div');
        chip.className = 'reaction-peer-chip';
        const waiting = peer.status === 'open' || peer.status === 'queued';
        chip.dataset.waiting = waiting ? 'true' : 'false';
        const speedLabel = peer.reactorSpeed != null
            ? `速${peer.reactorSpeed}`
            : '';
        const statusLabel = peer.status === 'queued'
            ? '速度順序等待中'
            : peer.status === 'open'
                ? '選擇反應中'
                : peer.status;
        chip.innerHTML = `
            <strong>${escapeHtml(peer.reactorName || `角色#${peer.reactorId}`)}</strong>
            <small>${escapeHtml([speedLabel, statusLabel].filter(Boolean).join('・'))}</small>
        `;
        reactionPeers.appendChild(chip);
    }
}

function isActorUnableToAct(actor = currentActor()) {
    return !actor || Number(actor.hp) <= 0;
}

function syncSkillButtonAvailability() {
    const actor = currentActor();
    const knockedOut = isActorUnableToAct(actor);
    const blocking = Boolean(
        currentReactionWindow &&
        ['open', 'ready'].includes(currentReactionWindow.status) &&
        currentReactionWindow.blocking
    );
    skillButton.disabled = knockedOut || blocking;
}

function syncReactionDefaultSkipButton() {
    if (!reactionDefaultSkipButton) return;
    const actor = currentActor();
    const enabled = Boolean(actor?.reactionDefaultSkip);
    // Always visible while an action actor is selected (not only during windows).
    reactionDefaultBar?.classList.toggle('hidden', !actor);
    reactionDefaultSkipButton.classList.toggle('is-on', enabled);
    reactionDefaultSkipButton.textContent = enabled
        ? '已默認不反應（點擊取消）'
        : '默認不做反應';
    reactionDefaultSkipButton.disabled = !actor || reactionBusy;
}

function renderReactionPanel() {
    reactionOptions.innerHTML = '';
    syncReactionDefaultSkipButton();

    if (
        !currentReactionWindow ||
        !['open', 'ready'].includes(currentReactionWindow.status)
    ) {
        reactionPanel.classList.add('hidden');
        syncSkillButtonAvailability();
        // Still show peer chips when others are choosing.
        if (!currentReactionPeers.length) {
            reactionPeers?.classList.add('hidden');
        }
        return;
    }

    reactionPanel.classList.remove('hidden');
    const reactorLabel = currentReactionWindow.reactorName ||
        currentReactionWindow.options?.[0]?.actorName ||
        '反應';
    reactionTitle.textContent = `${reactorLabel}・${reactionTriggerLabel(currentReactionWindow)}`;
    reactionContext.textContent = reactionContextText(currentReactionWindow);

    const blocking = currentReactionWindow.blocking === true;
    syncSkillButtonAvailability();

    if (currentReactionWindow.status === 'ready') {
        const row = document.createElement('div');
        row.className = 'reaction-ready';
        row.innerHTML = `
            <strong>反應已確認</strong>
            <small>正在繼續結算原攻擊…</small>
        `;
        reactionOptions.appendChild(row);
        reactionSkipButton.classList.add('hidden');
        return;
    }

    reactionSkipButton.classList.remove('hidden');
    reactionSkipButton.textContent = '本次不反應';

    for (const option of currentReactionWindow.options || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reaction-option';
        button.disabled = reactionBusy;

        const pickHint = option.needsPick
            ? `<small class="reaction-pick-hint">需先選擇：${escapeHtml(option.needsPick)}</small>`
            : '';

        button.innerHTML = `
            <div class="reaction-option-head">
                <span class="reaction-actor-mark">${escapeHtml(option.actorName?.slice(0, 1) || '?')}</span>
                <div>
                    <strong>${escapeHtml(option.skillName)}</strong>
                    <small>${escapeHtml(option.cost)}・${escapeHtml(option.timing)}</small>
                </div>
            </div>
            <p>${escapeHtml(option.note || option.effect)}</p>
            ${pickHint}
            <em>${escapeHtml(option.effect)}</em>
        `;

        button.addEventListener('click', () => {
            beginReactionOption(option);
        });

        reactionOptions.appendChild(button);
    }
}

async function resumeReactionAttack(window) {
    if (!window?.resumePayload || !window?.id) return;

    const payload = {
        ...window.resumePayload,
        reactionResumeId: window.id
    };

    const response = await api.useCombatSkill(payload);

    if (response?.message) appendMessage(response.message);
    if (response?.pickRequest) {
        showTimingPick(response.pickRequest, payload);
    }

    if (response?.resume && response?.reactionWindow?.status === 'ready') {
        currentReactionWindow = response.reactionWindow;
        renderReactionPanel();
        await resumeReactionAttack(response.reactionWindow);
        return;
    }

    await loadOpenReaction();
}

function hideTimingPick() {
    currentTimingPick = null;
    timingPickPanel?.classList.add('hidden');
    if (timingPickOptions) timingPickOptions.innerHTML = '';
}

function showTimingPick(pickRequest, resumeBase = null) {
    currentTimingPick = { pickRequest, resumeBase };
    if (!timingPickPanel || !timingPickOptions) return;

    timingPickPanel.classList.remove('hidden');
    if (timingPickTitle) {
        timingPickTitle.textContent = pickRequest.prompt || '選擇適用目標';
    }
    if (timingPickContext) {
        timingPickContext.textContent = pickRequest.skillName || '';
    }

    timingPickOptions.innerHTML = '';
    for (const id of pickRequest.candidateIds || []) {
        const character = characterById(id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reaction-option';
        button.innerHTML = `
            <div class="reaction-option-head">
                <strong>${escapeHtml(character?.name || `角色 #${id}`)}</strong>
            </div>
            <p>套用「${escapeHtml(pickRequest.skillName || '效果')}」</p>
        `;
        button.addEventListener('click', () => {
            confirmTimingPick(id);
        });
        timingPickOptions.appendChild(button);
    }
}

async function confirmTimingPick(pickedTargetId) {
    if (!currentTimingPick?.pickRequest) return;
    const base = currentTimingPick.resumeBase || {
        actorId: selectedActionActorId,
        skillKey: selectedSkillKey,
        targetId: selectedTargetId
    };

    try {
        hideTimingPick();
        const response = await api.useCombatSkill({
            ...base,
            pickedTargetId,
            reactionResumeId: base.reactionResumeId || undefined
        });
        if (response?.message) appendMessage(response.message);
        if (response?.pickRequest) {
            showTimingPick(response.pickRequest, {
                ...base,
                reactionResumeId: response.reactionWindow?.id
            });
        }
        if (response?.reactionWindow) {
            currentReactionWindow = response.reactionWindow;
            renderReactionPanel();
        }
        document.dispatchEvent(new Event('trpg:reload-characters'));
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleReactionResponse(response) {
    if (response?.message) appendMessage(response.message);

    if (Array.isArray(response?.peers)) {
        renderReactionPeers(response.peers);
    }

    const window = response?.window || null;

    if (response?.resume && window?.status === 'ready') {
        currentReactionWindow = window;
        renderReactionPanel();

        try {
            await resumeReactionAttack(window);
        } catch (error) {
            showToast(error.message, 'error');
            await loadOpenReaction();
        }
        return;
    }

    if (window && window.status === 'open') {
        currentReactionWindow = window;
        renderReactionPanel();
        return;
    }

    // This character finished; keep peers visible and pick up own/next state.
    currentReactionWindow = null;
    renderReactionPanel();
    await loadOpenReaction();
}

async function toggleReactionDefaultSkip() {
    const actor = currentActor();
    if (!actor || reactionBusy) return;

    reactionBusy = true;
    syncReactionDefaultSkipButton();
    try {
        const enabled = !Boolean(actor.reactionDefaultSkip);
        const response = await api.setReactionDefaultSkip(actor.id, enabled);
        if (response?.character) {
            const idx = characters.findIndex(item => item.id === actor.id);
            if (idx >= 0) characters[idx] = {
                ...characters[idx],
                ...response.character
            };
        }
        document.dispatchEvent(new CustomEvent('trpg:characters-updated', {
            detail: { characters }
        }));
        showToast(
            enabled
                ? `${actor.name} 已設為默認不做反應`
                : `${actor.name} 已取消默認不做反應`
        );
        if (response?.resume) {
            await handleReactionResponse({
                resume: true,
                window: response.resume
            });
        } else {
            await loadOpenReaction();
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        reactionBusy = false;
        syncReactionDefaultSkipButton();
        renderReactionPanel();
    }
}

async function beginReactionOption(option) {
    if (!currentReactionWindow || reactionBusy || !option) return;

    const choices = option.pickChoices || [];
    if (
        option.needsPick &&
        choices.length === 0 &&
        option.skipPickIfEmpty
    ) {
        await useReactionOption(option.id, option.autoMetaIfEmpty || {});
        return;
    }

    if (option.needsPick && choices.length) {
        showReactionPick(option);
        return;
    }

    if (option.needsPick && !choices.length) {
        showToast('目前沒有可選項目', 'error');
        return;
    }

    await useReactionOption(option.id);
}

function showReactionPick(option, phase = 'primary') {
    if (!timingPickPanel || !timingPickOptions) {
        useReactionOption(option.id);
        return;
    }

    currentTimingPick = {
        kind: 'reaction',
        option,
        reactionId: currentReactionWindow.id,
        phase,
        pendingMeta: currentTimingPick?.pendingMeta || {}
    };

    timingPickPanel.classList.remove('hidden');
    if (timingPickTitle) {
        timingPickTitle.textContent =
            phase === 'ally'
                ? `選擇「${option.skillName}」的友方目標`
                : option.skillName
                    ? `選擇「${option.skillName}」的參數`
                    : '選擇反應參數';
    }
    if (timingPickContext) {
        timingPickContext.textContent = option.note || option.effect || '';
    }

    timingPickOptions.innerHTML = '';

    if (phase === 'ally') {
        const allies = (characters || []).filter(item =>
            item.id !== option.actorId &&
            (item.kind || 'player') === (option.actorKind || 'player') &&
            Number(item.hp) > 0
        );
        for (const ally of allies) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reaction-option';
            button.innerHTML = `
                <div class="reaction-option-head">
                    <strong>${escapeHtml(ally.name)}</strong>
                </div>
            `;
            button.addEventListener('click', async () => {
                const meta = {
                    ...(currentTimingPick?.pendingMeta || {}),
                    allyId: ally.id,
                    targetId: ally.id,
                    pickedTargetId: ally.id
                };
                hideTimingPick();
                await useReactionOption(option.id, meta);
            });
            timingPickOptions.appendChild(button);
        }
        return;
    }

    for (const choice of option.pickChoices || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reaction-option';
        button.innerHTML = `
            <div class="reaction-option-head">
                <strong>${escapeHtml(choice.label || choice.id)}</strong>
            </div>
        `;
        button.addEventListener('click', async () => {
            const meta = { ...(choice.meta || {}) };
            if (option.needsSecondaryPick === 'ally_other') {
                currentTimingPick = {
                    kind: 'reaction',
                    option,
                    pendingMeta: meta
                };
                showReactionPick(option, 'ally');
                return;
            }
            hideTimingPick();
            await useReactionOption(option.id, {
                ...meta,
                targetId: meta.targetId || meta.redirectTargetId || choice.id
            });
        });
        timingPickOptions.appendChild(button);
    }
}

async function useReactionOption(optionId, meta = {}) {
    if (!currentReactionWindow || reactionBusy) return;

    reactionBusy = true;
    renderReactionPanel();

    try {
        const response = await api.respondReaction(
            currentReactionWindow.id,
            {
                action: 'use',
                optionId,
                meta,
                targetId: meta.targetId || meta.redirectTargetId || undefined
            }
        );
        await handleReactionResponse(response);
    } catch (error) {
        showToast(error.message, 'error');
        await loadOpenReaction();
    } finally {
        reactionBusy = false;
        renderReactionPanel();
    }
}

async function skipReactionWindow() {
    if (!currentReactionWindow || reactionBusy) return;

    reactionBusy = true;
    renderReactionPanel();

    try {
        const response = await api.respondReaction(
            currentReactionWindow.id,
            {
                action: 'skip'
            }
        );
        await handleReactionResponse(response);
    } catch (error) {
        showToast(error.message, 'error');
        await loadOpenReaction();
    } finally {
        reactionBusy = false;
        renderReactionPanel();
    }
}

async function loadOpenReaction() {
    try {
        const state = await api.getOpenReaction(selectedActionActorId);
        // Backward compatible if API still returns a bare window.
        const mine = state?.mine !== undefined
            ? state.mine
            : (state?.id ? state : null);
        const peers = Array.isArray(state?.peers) ? state.peers : [];
        const resume = state?.resume || null;

        renderReactionPeers(peers);
        currentReactionWindow = mine || null;
        renderReactionPanel();

        if (
            resume?.blocking &&
            resume?.status === 'ready' &&
            resume?.resumePayload &&
            !reactionBusy
        ) {
            reactionBusy = true;
            try {
                await resumeReactionAttack(resume);
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 100));
                await loadOpenReaction();
            } finally {
                reactionBusy = false;
                renderReactionPanel();
            }
            return;
        }

        if (
            mine?.blocking &&
            mine?.status === 'ready' &&
            mine?.resumePayload &&
            !reactionBusy
        ) {
            reactionBusy = true;
            try {
                await resumeReactionAttack(mine);
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 100));
                await loadOpenReaction();
            } finally {
                reactionBusy = false;
                renderReactionPanel();
            }
        }
    } catch (error) {
        console.error(error);
    }
}

function renderSkillMenu() {
    skillMenu.innerHTML = '';

    for (const skill of skills) {
        const button = document.createElement('button');
        button.type = 'button';
        const actionClass = String(skill.actionCode || 'UTILITY').toLowerCase();
        button.className = `skill-option action-${actionClass}`;
        // 無限可能的呼喚 is flagged passive server-side but is cast by hand.
        button.disabled =
            (skill.manual === false || skill.actionCode === 'PASSIVE') &&
            skill.logicCode !== 'INFINITE_CALL';

        button.innerHTML = `
            <div>
                <strong>${escapeHtml(skill.name)}</strong>
                <small>${escapeHtml(skill.timing)}・${escapeHtml(skill.cost)}・${escapeHtml(skill.weapon)}・${escapeHtml(skill.actionCode || '')}</small>
            </div>
            <p>${escapeHtml(skill.effect)}</p>
        `;

        button.addEventListener('click', () => {
            if (button.disabled) return;
            selectedSkillKey = skill.key;
            selectedTargetId = null;
            selectedDirection = null;
            skillMenu.classList.add('hidden');
            skillButton.querySelector('span').textContent = skill.name;
            renderCombatStep();
        });

        skillMenu.appendChild(button);
    }
}

function targetCandidates(skill, actor) {
    if (!skill || !actor) return [];

    const sameSide = character => character.kind === actor.kind;
    const code = skill.targetCode || skill.target || 'SELF';
    const effect = String(skill.effect || '');
    const requiresOtherAlly = effect.includes('其他友方');

    // 魂靈風息一類的正點方向效果，可以用任一其他角色作為方向錨點。
    if (code === 'ANY_ORTHOGONAL') {
        return characters.filter(
            character =>
                character.id !== actor.id &&
                Number(character.hp) > 0
        );
    }

    // 移轉一類：友方移動或敵方攻擊，同一指定入口。
    if (code === 'ALLY_OR_ENEMY') {
        return characters.filter(character => {
            if (Number(character.hp) <= 0) return false;
            if (requiresOtherAlly && sameSide(character) && character.id === actor.id) {
                return false;
            }
            return true;
        });
    }

    // 攻擊 / 敵方減益：只出現仍存活的敵方。
    if (
        skill.actionCode === 'ATTACK' ||
        skill.actionCode === 'DEBUFF' ||
        ['ENEMY','ENEMY_ROW','ENEMY_COLUMN','ALL_ENEMIES'].includes(code)
    ) {
        return characters.filter(
            character =>
                !sameSide(character) &&
                Number(character.hp) > 0
        );
    }

    // 救援 / 復甦類：只顯示 HP <= 0 的友方。
    if (code === 'ALLY_DOWN') {
        return characters.filter(
            character =>
                sameSide(character) &&
                character.id !== actor.id &&
                Number(character.hp) <= 0
        );
    }

    if (code === 'SELF') return [actor];

    // 恢復技一定不會把敵人列為目標。
    if (
        skill.actionCode === 'HEAL' ||
        ['ALLY','ALLY_ROW','ALLY_OR_SELF','ALL_ALLIES'].includes(code)
    ) {
        return characters.filter(character => {
            if (!sameSide(character)) return false;
            if (requiresOtherAlly && character.id === actor.id) return false;
            return true;
        });
    }

    // Buff 也依友方限制；技能有「其他友方」時排除自己。
    if (skill.actionCode === 'BUFF' || skill.actionCode === 'GUARD') {
        return characters.filter(character => {
            if (!sameSide(character)) return false;
            if (requiresOtherAlly && character.id === actor.id) return false;
            return true;
        });
    }

    return [actor];
}

function targetLabel(skill) {
    const code = skill?.targetCode || 'SELF';

    if (
        skill?.actionCode === 'ATTACK' ||
        skill?.actionCode === 'DEBUFF' ||
        ['ENEMY','ENEMY_ROW','ENEMY_COLUMN','ALL_ENEMIES','ANY_ORTHOGONAL','ALLY_OR_ENEMY'].includes(code)
    ) {
        if (code === 'ENEMY_ROW') {
            if (skill?.targetShape === 'ROW_ADJACENT_2') {
                return '選擇橫排上的敵人（自動包含相鄰 1 名）';
            }
            return '選擇敵方所在橫排';
        }
        if (code === 'ENEMY_COLUMN') {
            if (skill?.targetShape === 'FORWARD_COLUMN') {
                return '選擇敵方場地（自動攻擊自身正前方一列）';
            }
            if (skill?.targetShape === 'COLUMN_ADJACENT_2') {
                return '選擇敵人（自動包含前／後相鄰 1 名）';
            }
            return '選擇前後列中的敵方';
        }
        if (code === 'ALL_ENEMIES') return '全體敵方';
        if (code === 'ANY_ORTHOGONAL') return '選擇前／後／左／右方向上的角色';
        if (code === 'ALLY_OR_ENEMY') return '選擇其他友方或敵方';
        return '選擇敵方目標';
    }

    if (code === 'ALLY_DOWN') {
        return '選擇被擊倒的友方';
    }

    if (code === 'ALLY_ROW') {
        return '選擇友方所在排';
    }

    if (
        ['ALLY','ALL_ALLIES','ALLY_OR_SELF'].includes(code) ||
        ['HEAL','BUFF','GUARD'].includes(skill?.actionCode)
    ) {
        return '選擇友方目標';
    }

    return '確認使用者';
}

function renderCombatStep() {
    const skill = selectedSkill();
    const actor = currentActor();

    targetList.innerHTML = '';
    executeButton.classList.add('hidden');

    if (!skill || !actor) {
        combatStep.classList.add('hidden');
        return;
    }

    combatStep.classList.remove('hidden');
    const candidates = targetCandidates(skill, actor);
    document.getElementById('combat-target-title').textContent = targetLabel(skill);

    // 魂靈風息：直接指定「前 / 後 / 左 / 右」。
    if ((skill.targetCode || '') === 'ANY_ORTHOGONAL') {
        selectedTargetId = actor.id;

        const directionWrap = document.createElement('div');
        directionWrap.className = 'direction-picker';

        const directions = [
            ['UP', '↑', '前'],
            ['DOWN', '↓', '後'],
            ['LEFT', '←', '左'],
            ['RIGHT', '→', '右']
        ];

        for (const [value, arrow, label] of directions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'direction-choice';
            button.classList.toggle('active', selectedDirection === value);
            button.innerHTML = `<strong>${arrow}</strong><span>${label}</span>`;
            button.addEventListener('click', () => {
                selectedDirection = value;
                renderCombatStep();
            });
            directionWrap.appendChild(button);
        }

        targetList.appendChild(directionWrap);

        const note = document.createElement('div');
        note.className = 'combat-group-target';
        note.innerHTML =
            `<strong>施術者自己一定包含</strong>` +
            `<small>沿所選方向的世界座標直線延伸，跨不同戰場格群也會結算；友方回血、敵方受魔法攻擊。</small>`;
        targetList.appendChild(note);

        if (selectedDirection) {
            const label = directions.find(item => item[0] === selectedDirection)?.[2] || '';
            executeButton.classList.remove('hidden');
            executeButton.textContent = `✦ 向${label}使用「${skill.name}」`;
        }
        return;
    }

    // 自身戰技直接把自己設為目標，不必多點一次。
    if ((skill.targetCode || '') === 'SELF' && candidates.length === 1) {
        selectedTargetId = actor.id;
        executeButton.classList.remove('hidden');
        executeButton.textContent = skill.needsRoll ? '🎲 擲骰並使用戰技' : `◆ 使用「${skill.name}」`;
        return;
    }

    // 全隊型戰技不再要求逐一選擇隊友。
    if ((skill.targetCode || '') === 'ALL_ALLIES') {
        selectedTargetId = actor.id;

        const notice = document.createElement('div');
        notice.className = 'combat-group-target';
        notice.innerHTML = `<strong>全體友方</strong><small>此戰技會自動套用到同陣營所有角色</small>`;
        targetList.appendChild(notice);

        executeButton.classList.remove('hidden');
        executeButton.textContent = `⬆ 對全體使用「${skill.name}」`;
        return;
    }

    // 全體敵方攻擊只需要確認一次，不必逐個點人。
    if ((skill.targetCode || '') === 'ALL_ENEMIES') {
        const firstEnemy = candidates[0];
        if (!firstEnemy) return;

        selectedTargetId = firstEnemy.id;

        const notice = document.createElement('div');
        notice.className = 'combat-group-target enemy-group-target';
        notice.innerHTML = `<strong>全體敵方</strong><small>此戰技會自動對目前存活的所有敵方結算</small>`;
        targetList.appendChild(notice);

        executeButton.classList.remove('hidden');
        executeButton.textContent = skill.needsRoll
            ? `🎲 對全體使用「${skill.name}」`
            : `◆ 對全體使用「${skill.name}」`;
        return;
    }

    if (!candidates.length) {
        const empty = document.createElement('div');
        empty.className = 'combat-target-empty';
        empty.textContent = '目前沒有符合條件的目標';
        targetList.appendChild(empty);
        return;
    }

    for (const target of candidates) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className =
            `combat-target ${target.kind === actor.kind ? 'ally-target' : 'enemy-target'}`;
        button.classList.toggle('active', target.id === selectedTargetId);
        button.appendChild(renderAvatar(target, 'combat-target-avatar'));

        const text = document.createElement('div');
        text.innerHTML = `<strong>${escapeHtml(target.name)}</strong><small>HP ${escapeHtml(target.hp)}/${escapeHtml(target.maxHp)}</small>`;
        button.appendChild(text);
        button.addEventListener('click', () => {
            selectedTargetId = target.id;
            renderCombatStep();
        });
        targetList.appendChild(button);
    }

    if (selectedTargetId) {
        executeButton.classList.remove('hidden');
        executeButton.textContent = skill.needsRoll
            ? '🎲 擲骰並使用戰技'
            : `◆ 使用「${skill.name}」`;
    }
}

async function executeSkill() {
    const actor = currentActor();
    const skill = selectedSkill();

    if (!actor || !skill || !selectedTargetId) return;

    if (Number(actor.hp) <= 0) {
        showToast(`${actor.name} 已擊倒，無法發動戰技`, 'error');
        return;
    }

    // 點擊當下先擋資源不足，避免進伺服器後才在指定／反應之後失敗。
    const costMatch = String(skill.cost || '').match(/(\d+)\s*(AP|SP)/i);
    if (costMatch) {
        const amount = Number(costMatch[1]);
        const type = costMatch[2].toUpperCase() === 'AP' ? 'ap' : 'sp';
        const current = Number(actor[type] || 0);
        if (current < amount) {
            showToast(
                `${actor.name} 的 ${type.toUpperCase()} 不足（需要 ${amount}，目前 ${current}）`,
                'error'
            );
            return;
        }
    }

    executeButton.disabled = true;

    try {
        const response = await api.useCombatSkill({
            actorId: actor.id,
            skillKey: skill.key,
            targetId: selectedTargetId,
            direction: selectedDirection
        });

        if (response?.message) appendMessage(response.message);

        if (response?.pickRequest) {
            showTimingPick(response.pickRequest, {
                actorId: actor.id,
                skillKey: skill.key,
                targetId: selectedTargetId,
                direction: selectedDirection
            });
        }

        if (response?.resume && response?.reactionWindow?.status === 'ready') {
            await handleReactionResponse({
                resume: true,
                window: response.reactionWindow
            });
        } else {
            await loadOpenReaction();
        }

        selectedSkillKey = null;
        selectedTargetId = null;
        selectedDirection = null;
        skillButton.querySelector('span').textContent = '選擇戰技';
        renderCombatStep();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        executeButton.disabled = false;
    }
}

async function loadMessages() {
    try {
        const [combat, team] = await Promise.all([
            api.getChatMessages('combat'),
            api.getChatMessages('team')
        ]);

        messages.combat = combat;
        messages.team = team;
        renderMessages();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadBattleLogs() {
    try {
        battleLogs = await api.getBattleLogs();
        if (activeChannel === 'log') renderMessages();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function skillSignature(actor) {
    if (!actor) return '';

    return [
        actor.id,
        actor.profession || '',
        actor.skillSlots || 0,
        ...(actor.equippedSkills || [])
            .map(skill => `${skill.slotIndex}:${skill.key}`)
            .sort()
    ].join('|');
}

async function loadSkills(actorId = currentActor()?.id, force = false) {
    const actor = characterById(actorId);
    const signature = skillSignature(actor);

    if (
        !force &&
        actorId &&
        loadedSkillActorId === Number(actorId) &&
        loadedSkillSignature === signature &&
        skills.length
    ) {
        renderSkillMenu();
        renderCombatStep();
        return;
    }

    try {
        skills = actorId ? await api.getCombatSkills(actorId) : [];
        loadedSkillActorId = Number(actorId) || null;
        loadedSkillSignature = signature;

        selectedSkillKey = null;
        selectedTargetId = null;
        selectedDirection = null;
        skillButton.querySelector('span').textContent = '選擇戰技';
        renderSkillMenu();
        renderCombatStep();
    } catch (error) {
        showToast(error.message, 'error');
    }
}


async function clearCurrentChannel() {
    clearButton.disabled = true;

    try {
        if (activeChannel === 'log') {
            await api.clearBattleLogs();
            battleLogs = [];
        } else {
            await api.clearChatMessages(activeChannel);
            messages[activeChannel] = [];
        }

        renderMessages();
        showToast(
            activeChannel === 'log'
                ? '戰場紀錄已清空'
                : `${activeChannel === 'team' ? '隊伍' : '戰鬥'}聊天室已清空`
        );
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        clearButton.disabled = false;
    }
}

function initEvents() {
    battleTab.addEventListener('click', () => setChannel('combat'));
    teamTab.addEventListener('click', () => setChannel('team'));
    logTab.addEventListener('click', () => setChannel('log'));
    clearButton.addEventListener('click', clearCurrentChannel);
    reactionSkipButton.addEventListener('click', skipReactionWindow);
    reactionDefaultSkipButton?.addEventListener('click', toggleReactionDefaultSkip);

    function toggleChatPanel() {
        document.body.classList.toggle('chat-collapsed');
        collapseButton.textContent =
            document.body.classList.contains('chat-collapsed') ? '‹' : '›';
    }

    collapseButton.addEventListener('click', toggleChatPanel);
    collapsedLabel?.addEventListener('click', toggleChatPanel);

    identityButton.addEventListener('click', event => {
        event.stopPropagation();
        identityMenu.classList.toggle('hidden');
    });

    combatActor.addEventListener('click', event => {
        event.stopPropagation();
        if (combatActor.disabled) return;
        combatActorMenu.classList.toggle('hidden');
    });

    skillButton.addEventListener('click', event => {
        event.stopPropagation();
        skillMenu.classList.toggle('hidden');
    });

    document.addEventListener('pointerdown', event => {
        if (!identityMenu.contains(event.target) && !identityButton.contains(event.target)) {
            identityMenu.classList.add('hidden');
        }

        if (!skillMenu.contains(event.target) && !skillButton.contains(event.target)) {
            skillMenu.classList.add('hidden');
        }

        if (!combatActorMenu.contains(event.target) && !combatActor.contains(event.target)) {
            combatActorMenu.classList.add('hidden');
        }
    });

    teamForm.addEventListener('submit', async event => {
        event.preventDefault();

        const character = currentIdentity();
        const content = teamInput.value.trim();

        if (!character || !content) return;

        teamInput.value = '';

        try {
            const message = await api.sendTeamMessage(character.id, content);
            appendMessage(message);
        } catch (error) {
            teamInput.value = content;
            showToast(error.message, 'error');
        }
    });

    executeButton.addEventListener('click', executeSkill);

    document.addEventListener('trpg:characters-updated', event => {
        characters = Array.isArray(event.detail?.characters)
            ? event.detail.characters
            : [];

        renderIdentityButton();
        renderIdentityMenu();
        if (selectedActionActorId && !characters.some(item => item.id === selectedActionActorId)) {
            selectedActionActorId = combatState?.currentCharacterId || characters[0]?.id || null;
        }
        renderCombatActor();
        renderCombatActorMenu();
        renderCombatStep();
        renderMessages();

        if (selectedActionActorId) {
            const actor = characterById(selectedActionActorId);
            const signature = skillSignature(actor);

            if (
                loadedSkillActorId !== selectedActionActorId ||
                loadedSkillSignature !== signature
            ) {
                loadSkills(selectedActionActorId, true);
            }
        }
    });

    document.addEventListener('trpg:action-actor-changed', event => {
        selectedActionActorId = Number(event.detail?.actorId) || null;
        if (selectedActionActorId) {
            localStorage.setItem('trpg-action-actor-id', String(selectedActionActorId));
        }
        renderCombatActor();
        renderCombatActorMenu();
        loadSkills(selectedActionActorId, true);
        syncReactionDefaultSkipButton();
        loadOpenReaction();
    });

    document.addEventListener('trpg:combat-state', event => {
        combatState = event.detail || null;
        renderCombatActor();
        renderCombatStep();
    });

    socket?.on('chat:cleared', event => {
        const channel = event?.channel === 'team' ? 'team' : 'combat';
        messages[channel] = [];
        if (activeChannel === channel) renderMessages();
    });

    socket?.on('battle:logs-cleared', () => {
        battleLogs = [];
        if (activeChannel === 'log') renderMessages();
    });

    socket?.on('combat:reaction-opened', () => {
        loadOpenReaction();
    });

    socket?.on('combat:reaction-batch', () => {
        loadOpenReaction();
    });

    socket?.on('combat:auto-cast', async payload => {
        const queue = payload?.queue || [];
        for (const item of queue) {
            try {
                const response = await api.useCombatSkill({
                    actorId: item.actorId,
                    skillKey: item.skillKey,
                    targetId: item.targetId,
                    autoCast: true
                });
                if (response?.message) appendMessage(response.message);
                await loadOpenReaction();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
    });

    socket?.on('combat:timing-pick', pickRequest => {
        showTimingPick(pickRequest, {
            actorId: selectedActionActorId,
            skillKey: selectedSkillKey,
            targetId: selectedTargetId
        });
    });

    socket?.on('combat:reaction-updated', async window => {
        if (
            window?.blocking &&
            window?.status === 'ready' &&
            window?.resumePayload &&
            !reactionBusy
        ) {
            reactionBusy = true;
            try {
                currentReactionWindow = window;
                renderReactionPanel();
                await resumeReactionAttack(window);
            } catch (error) {
                // another client may resume first
            } finally {
                reactionBusy = false;
                await loadOpenReaction();
            }
            return;
        }
        await loadOpenReaction();
    });

    socket?.on('combat:reaction-closed', async () => {
        await loadOpenReaction();
    });

    socket?.on('chat:message', appendMessage);

    socket?.on('battle:event', event => {
        if (battleLogs.some(item => item.id === event.id)) return;
        battleLogs.push(event);
        battleLogs = battleLogs.slice(-500);
        if (activeChannel === 'log') renderMessages();
    });

    socket?.on('battle:reset', events => {
        battleLogs = Array.isArray(events) ? events : [];
        if (activeChannel === 'log') renderMessages();
    });

    socket?.on('characters:changed', () => {
        document.dispatchEvent(new Event('trpg:reload-characters'));
    });

    socket?.on('connect', () => {
        panel.classList.remove('offline');
    });

    socket?.on('disconnect', () => {
        panel.classList.add('offline');
    });
}

export function initChat() {
    initEvents();
    renderIdentityButton();
    renderCombatActor();
    setChannel('combat');

    loadMessages();
    loadBattleLogs();
    loadSkills();
    loadOpenReaction();
}
