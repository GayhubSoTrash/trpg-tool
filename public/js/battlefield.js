import { api } from './api.js';
import { closeModal, createImageOrInitial, openModal, showToast } from './ui.js';
import { socket } from './socket.js';

const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const gridMenu = document.getElementById('grid-context-menu');
const battlefieldMenu = document.getElementById('battlefield-context-menu');
const tokenMenu = document.getElementById('token-context-menu');

const camera = { x: 0, y: 0, zoom: 1 };
let panning = false;
let panStart = { x: 0, y: 0 };
let cameraStart = { x: 0, y: 0 };
let selectedGroupId = null;
let selectedTokenCharacterId = null;
let movingGroupId = null;
let moveOffset = { x: 0, y: 0 };
let contextScreen = { x: 0, y: 0 };
let selectedActionActorId =
    Number(localStorage.getItem('trpg-action-actor-id')) || null;
let battlefieldReloadTimer = null;

function updateCamera() {
    world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    document.getElementById('zoom-label').textContent = `${Math.round(camera.zoom * 100)}%`;
}

function screenToWorld(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return {
        x: (clientX - rect.left - camera.x) / camera.zoom,
        y: (clientY - rect.top - camera.y) / camera.zoom
    };
}

function hideMenus() {
    gridMenu.classList.add('hidden');
    battlefieldMenu.classList.add('hidden');
    tokenMenu.classList.add('hidden');
}

function showMenu(menu, x, y) {
    hideMenus();
    menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
    menu.classList.remove('hidden');
}

function setZoom(nextZoom, focusX = viewport.clientWidth / 2, focusY = viewport.clientHeight / 2) {
    const oldZoom = camera.zoom;
    const newZoom = Math.max(0.3, Math.min(3, nextZoom));
    camera.x = focusX - ((focusX - camera.x) / oldZoom) * newZoom;
    camera.y = focusY - ((focusY - camera.y) / oldZoom) * newZoom;
    camera.zoom = newZoom;
    updateCamera();
}

function initCamera() {
    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0 || movingGroupId !== null) return;
        if (event.target.closest('.cell')) return;

        panning = true;
        panStart = { x: event.clientX, y: event.clientY };
        cameraStart = { x: camera.x, y: camera.y };
        viewport.classList.add('panning');
        viewport.setPointerCapture(event.pointerId);
    });

    viewport.addEventListener('pointermove', event => {
        if (movingGroupId !== null) {
            const group = world.querySelector(`[data-group-id="${movingGroupId}"]`);
            if (!group) return;
            const position = screenToWorld(event.clientX, event.clientY);
            const x = position.x - moveOffset.x;
            const y = position.y - moveOffset.y;
            group.style.left = `${x}px`;
            group.style.top = `${y}px`;
            group.dataset.previewX = x;
            group.dataset.previewY = y;
            return;
        }

        if (!panning) return;
        camera.x = cameraStart.x + event.clientX - panStart.x;
        camera.y = cameraStart.y + event.clientY - panStart.y;
        updateCamera();
    });

    viewport.addEventListener('pointerup', event => {
        panning = false;
        viewport.classList.remove('panning');
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    });

    viewport.addEventListener('wheel', event => {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        setZoom(camera.zoom - event.deltaY * 0.001, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    window.addEventListener('blur', () => {
        panning = false;
        viewport.classList.remove('panning');
    });

    document.getElementById('zoom-out-btn').addEventListener('click', () => setZoom(camera.zoom - 0.1));
    document.getElementById('zoom-in-btn').addEventListener('click', () => setZoom(camera.zoom + 0.1));
    document.getElementById('zoom-reset-btn').addEventListener('click', () => {
        camera.x = 0;
        camera.y = 0;
        camera.zoom = 1;
        updateCamera();
    });
}

function openCharacterSheet(characterId) {
    document.dispatchEvent(new CustomEvent('trpg:open-character', { detail: { characterId } }));
}

function setCellOccupied(cell, occupied) {
    cell.classList.toggle('occupied', occupied);
}

function makeBattleToken(character) {
    const token = createImageOrInitial(character.image, character.name, 'battle-token');
    token.classList.add(character.kind === 'enemy' ? 'enemy-token' : 'player-token');
    token.dataset.characterId = character.id;
    token.dataset.name = character.name || '角色';
    token.dataset.kind = character.kind || 'player';
    token.dataset.image = character.image || '';
    token.title = `${character.name || '角色'}：選為行動角色後可拖曳移動（戰場內移動消耗 1 SP）`;

    const name = document.createElement('small');
    name.textContent = character.name || '';
    token.appendChild(name);

    token.addEventListener('dblclick', event => {
        event.stopPropagation();
        openCharacterSheet(Number(character.id));
    });

    setupBattleTokenDrag(token);
    return token;
}

function tokenCharacterData(token) {
    return {
        id: Number(token.dataset.characterId),
        name: token.dataset.name || '角色',
        kind: token.dataset.kind || 'player',
        image: token.dataset.image || ''
    };
}

export async function placeCharacterOnBattlefield(character, targetCell) {
    if (!targetCell) return false;

    const targetExisting = targetCell.querySelector('.battle-token');
    if (targetExisting && Number(targetExisting.dataset.characterId) !== Number(character.id)) {
        showToast('這個格子已經有其他角色', 'error');
        return false;
    }

    const existingToken = world.querySelector(`.battle-token[data-character-id="${character.id}"]`);
    const sourceCell = existingToken?.closest('.cell') || null;

    if (sourceCell === targetCell) return true;

    const token = existingToken || makeBattleToken(character);

    // Optimistic UI：先移動畫面，資料庫在背景確認，避免 Neon 遠端延遲讓拖曳卡住。
    sourceCell && setCellOccupied(sourceCell, false);
    targetCell.appendChild(token);
    setCellOccupied(targetCell, true);

    try {
        if (sourceCell) {
            await api.moveCharacter(
                Number(character.id),
                Number(targetCell.dataset.cellId),
                selectedActionActorId
            );
        } else {
            await api.occupyCell(Number(targetCell.dataset.cellId), Number(character.id));
        }
        return true;
    } catch (error) {
        setCellOccupied(targetCell, false);
        if (sourceCell) {
            sourceCell.appendChild(token);
            setCellOccupied(sourceCell, true);
        } else {
            token.remove();
        }
        showToast(error.message, 'error');
        return false;
    }
}

function setupBattleTokenDrag(token) {
    token.addEventListener('pointerdown', startEvent => {
        if (startEvent.button !== 0) return;
        startEvent.stopPropagation();

        const character = tokenCharacterData(token);
        const sourceCell = token.closest('.cell');

        if (
            sourceCell &&
            selectedActionActorId &&
            Number(character.id) !== Number(selectedActionActorId)
        ) {
            showToast(`請先把行動角色切換為「${character.name}」再移動`, 'error');
            return;
        }
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
            const targetCell = target?.closest('.cell');
            if (!targetCell) return;

            const moved = await placeCharacterOnBattlefield(character, targetCell);
            if (moved) {
                showToast(
                    sourceCell
                        ? `${character.name} 已移動（消耗 1 SP）`
                        : `${character.name} 已放置到戰場`
                );
            }
        }

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', end);
    });
}

function createBattleToken(cell) {
    return makeBattleToken({
        id: cell.occupiedBy,
        name: cell.characterName,
        kind: cell.characterKind,
        image: cell.characterImage
    });
}

export async function loadGridGroups() {
    try {
        const groups = await api.getGridGroups();
        world.innerHTML = '';

        for (const group of groups) {
            const groupElement = document.createElement('section');
            groupElement.className = 'grid-group';
            groupElement.dataset.groupId = group.id;
            groupElement.dataset.worldX = group.worldX;
            groupElement.dataset.worldY = group.worldY;
            groupElement.style.left = `${group.worldX}px`;
            groupElement.style.top = `${group.worldY}px`;

            for (const cell of group.cells) {
                const cellElement = document.createElement('div');
                cellElement.className = 'cell';
                cellElement.dataset.cellId = cell.id;
                cellElement.dataset.groupId = group.id;
                cellElement.style.left = `${cell.col * group.cellSize}px`;
                cellElement.style.top = `${cell.row * group.cellSize}px`;
                cellElement.style.width = `${group.cellSize}px`;
                cellElement.style.height = `${group.cellSize}px`;

                if (cell.occupiedBy) {
                    setCellOccupied(cellElement, true);
                    cellElement.appendChild(createBattleToken(cell));
                }

                groupElement.appendChild(cellElement);
            }

            world.appendChild(groupElement);
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function vacateCharacterLocalFirst(characterId) {
    const token = world.querySelector(`.battle-token[data-character-id="${characterId}"]`);
    const cell = token?.closest('.cell');
    if (!token || !cell) return;

    token.remove();
    setCellOccupied(cell, false);
}

function initContextMenus() {
    viewport.addEventListener('contextmenu', event => {
        event.preventDefault();
        contextScreen = { x: event.clientX, y: event.clientY };

        const token = event.target.closest('.battle-token');
        if (token) {
            selectedTokenCharacterId = Number(token.dataset.characterId);
            showMenu(tokenMenu, event.clientX, event.clientY);
            return;
        }

        const cell = event.target.closest('.cell');
        if (cell) {
            selectedGroupId = Number(cell.dataset.groupId);
            showMenu(gridMenu, event.clientX, event.clientY);
            return;
        }

        selectedGroupId = null;
        showMenu(battlefieldMenu, event.clientX, event.clientY);
    });

    document.addEventListener('pointerdown', event => {
        const insideMenu = [gridMenu, battlefieldMenu, tokenMenu].some(menu => menu.contains(event.target));
        if (!insideMenu) hideMenus();
    });

    document.getElementById('menu-token-sheet').addEventListener('click', () => {
        const characterId = selectedTokenCharacterId;
        hideMenus();
        if (characterId) openCharacterSheet(characterId);
    });

    document.getElementById('menu-token-vacate').addEventListener('click', async () => {
        const characterId = selectedTokenCharacterId;
        hideMenus();
        if (!characterId) return;

        const token = world.querySelector(`.battle-token[data-character-id="${characterId}"]`);
        const cell = token?.closest('.cell');
        if (token && cell) {
            token.remove();
            setCellOccupied(cell, false);
        }

        try {
            await api.vacateCharacter(characterId);
            showToast('已從戰場移除');
        } catch (error) {
            await loadGridGroups();
            showToast(error.message, 'error');
        }
    });

    document.getElementById('menu-add').addEventListener('click', () => {
        hideMenus();
        openModal('grid-modal');
    });

    document.getElementById('menu-delete').addEventListener('click', async () => {
        const groupId = selectedGroupId;
        hideMenus();
        if (!groupId) return;

        try {
            await api.deleteGridGroup(groupId);
            world.querySelector(`[data-group-id="${groupId}"]`)?.remove();
            showToast('戰場已刪除');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.getElementById('menu-move').addEventListener('click', () => {
        const groupId = selectedGroupId;
        hideMenus();
        const group = world.querySelector(`[data-group-id="${groupId}"]`);
        if (!group) return;

        const pointer = screenToWorld(contextScreen.x, contextScreen.y);
        moveOffset = {
            x: pointer.x - Number(group.dataset.worldX),
            y: pointer.y - Number(group.dataset.worldY)
        };
        movingGroupId = groupId;
        viewport.classList.add('moving-group');
        showToast('移動滑鼠，點一下確定位置');
    });

    viewport.addEventListener('click', async () => {
        if (movingGroupId === null) return;

        const group = world.querySelector(`[data-group-id="${movingGroupId}"]`);
        if (!group) return;

        const x = Math.round(Number(group.dataset.previewX ?? group.dataset.worldX) / 10) * 10;
        const y = Math.round(Number(group.dataset.previewY ?? group.dataset.worldY) / 10) * 10;
        const oldX = Number(group.dataset.worldX);
        const oldY = Number(group.dataset.worldY);
        const groupId = movingGroupId;

        movingGroupId = null;
        viewport.classList.remove('moving-group');
        group.dataset.worldX = x;
        group.dataset.worldY = y;

        try {
            await api.moveGridGroup(groupId, x, y);
        } catch (error) {
            group.style.left = `${oldX}px`;
            group.style.top = `${oldY}px`;
            group.dataset.worldX = oldX;
            group.dataset.worldY = oldY;
            showToast(error.message, 'error');
        }
    });

    document.addEventListener('trpg:vacate-local', event => {
        vacateCharacterLocalFirst(Number(event.detail?.characterId));
    });
}

function initGridForm() {
    document.getElementById('grid-form').addEventListener('submit', async event => {
        event.preventDefault();
        const position = screenToWorld(contextScreen.x, contextScreen.y);

        try {
            await api.createGridGroup({
                worldX: Math.round(position.x),
                worldY: Math.round(position.y),
                rows: document.getElementById('input-row').value,
                cols: document.getElementById('input-col').value
            });
            event.target.reset();
            closeModal('grid-modal');
            await loadGridGroups();
            showToast('戰場建立完成');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

export function initBattlefield() {
    initCamera();
    initContextMenus();
    initGridForm();
    updateCamera();

    document.addEventListener('trpg:action-actor-changed', event => {
        selectedActionActorId = Number(event.detail?.actorId) || null;
    });

    // 其他瀏覽器移動角色時也會更新戰場。
    socket?.on('battlefield:changed', () => {
        clearTimeout(battlefieldReloadTimer);
        battlefieldReloadTimer = setTimeout(() => {
            loadGridGroups();
        }, 90);
    });
}
