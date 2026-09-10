const camera = { x: 0, y: 0, zoom: 1 };
const viewport = document.getElementById('viewport');
const world = document.getElementById('world');

function updateWorldTransform() {
    world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
}

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let cameraStartX = 0;
let cameraStartY = 0;
let lastMouseDownTime = 0;

window.addEventListener('blur', () => {
    isPanning = false;
    viewport.classList.remove('panning');
});

viewport.addEventListener('pointerdown', (event) => {
    if (event.target !== viewport && event.target !== world) return;

    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    cameraStartX = camera.x;
    cameraStartY = camera.y;
    viewport.classList.add('panning');
    viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener('pointermove', (event) => {
    if (!isPanning) return;
    camera.x = cameraStartX + (event.clientX - panStartX);
    camera.y = cameraStartY + (event.clientY - panStartY);
    updateWorldTransform();
});

viewport.addEventListener('pointerup', (event) => {
    isPanning = false;
    viewport.classList.remove('panning');
    viewport.releasePointerCapture(event.pointerId);
});

viewport.addEventListener('wheel', (event) => {
    event.preventDefault();

    const zoomSpeed = 0.001;
    const oldZoom = camera.zoom;
    let newZoom = camera.zoom - event.deltaY * zoomSpeed;
    newZoom = Math.min(Math.max(newZoom, 0.3), 3);

    const rect = viewport.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    camera.x = mouseX - ((mouseX - camera.x) / oldZoom) * newZoom;
    camera.y = mouseY - ((mouseY - camera.y) / oldZoom) * newZoom;
    camera.zoom = newZoom;

    updateWorldTransform();
});

function worldToScreen(worldX, worldY) {
    return {
        x: worldX * camera.zoom + camera.x,
        y: worldY * camera.zoom + camera.y
    };
}

function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - camera.x) / camera.zoom,
        y: (screenY - camera.y) / camera.zoom
    };
}

const modal = document.getElementById('create-modal');
const openBtn = document.getElementById('open-create-btn');
const closeBtn = document.getElementById('close-create-btn');

openBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
});

closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.add('hidden');
    }
});

const imageInput = document.getElementById('input-image');
const previewImg = document.getElementById('preview-img');
const previewPlaceholder = document.getElementById('preview-placeholder');

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    previewImg.src = imageUrl;
    previewImg.classList.remove('hidden');
    previewPlaceholder.classList.add('hidden');
});

const form = document.getElementById('create-form');
form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData();
    formData.append('name', document.getElementById('input-name').value);
    formData.append('hp', document.getElementById('input-hp').value);
    formData.append('ap', document.getElementById('input-ap').value);
    formData.append('sp', document.getElementById('input-sp').value);
    formData.append('patk', document.getElementById('input-patk').value);
    formData.append('matk', document.getElementById('input-matk').value);
    formData.append('crit', document.getElementById('input-crit').value);
    formData.append('hitRate', document.getElementById('input-hitRate').value);
    formData.append('dodge', document.getElementById('input-dodge').value);
    formData.append('speed', document.getElementById('input-speed').value);
    formData.append('defense', document.getElementById('input-defense').value);
    formData.append('resist', document.getElementById('input-resist').value);

    const imageFile = document.getElementById('input-image').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    const response = await fetch('/api/characters', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        alert(error.error || '創建角色失敗');
        return;
    }

    form.reset();
    previewImg.classList.add('hidden');
    previewPlaceholder.classList.remove('hidden');
    modal.classList.add('hidden');

    loadCharacters();
});

loadCharacters();

async function loadGridGroups() {
    const response = await fetch('/api/grid-groups');
    const groups = await response.json();

    document.querySelectorAll('.grid-group').forEach(el => el.remove());

    groups.forEach(group => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'grid-group';
        groupDiv.dataset.groupId = group.id;
        groupDiv.dataset.worldX = group.worldX;
        groupDiv.dataset.worldY = group.worldY;

        group.cells.forEach(cell => {
            const cellWorldX = group.worldX + cell.col * group.cellSize;
            const cellWorldY = group.worldY + cell.row * group.cellSize;

            const cellDiv = document.createElement('div');
            cellDiv.className = 'cell';
            cellDiv.dataset.cellId = cell.id;
            cellDiv.dataset.groupId = group.id;
            cellDiv.style.left = cellWorldX + 'px';
            cellDiv.style.top = cellWorldY + 'px';
            cellDiv.style.width = group.cellSize + 'px';
            cellDiv.style.height = group.cellSize + 'px';

            groupDiv.appendChild(cellDiv);
        });

        world.appendChild(groupDiv);
    });
}

loadGridGroups();

const contextMenu = document.getElementById('context-menu');
const contextMenuBattlefield = document.getElementById('context-menu-battlefield');
const menuMove = document.getElementById('menu-move');
const menuDelete = document.getElementById('menu-delete');
const menuAdd = document.getElementById('menu-add');
const addModal = document.getElementById('add-modal');
const addModelCloseBtn = document.getElementById('close-add-btn');

let contextTargetGroupId = null;
let movingGroupId = null;
let moveOffsetWorldX = 0;
let moveOffsetWorldY = 0;
let lastContextMenuScreenX = 0;
let lastContextMenuScreenY = 0;

function showContextMenu(x, y, groupId) {
    contextTargetGroupId = groupId;
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.remove('hidden');
    hideContextMenuBattlefield();
}

function hideContextMenu() {
    contextMenu.classList.add('hidden');
    contextTargetGroupId = null;
}

function showContextMenuBattlefield(x, y) {
    contextMenuBattlefield.style.left = x + 'px';
    contextMenuBattlefield.style.top = y + 'px';
    contextMenuBattlefield.classList.remove('hidden');
    hideContextMenu();
}

function hideContextMenuBattlefield() {
    contextMenuBattlefield.classList.add('hidden');
}


viewport.addEventListener('contextmenu', (event) => {
    const cellDiv = event.target.closest('.cell');
    if (event.target === viewport) {
        event.preventDefault();
        lastContextMenuScreenX = event.clientX;
        lastContextMenuScreenY = event.clientY;
        showContextMenuBattlefield(event.clientX, event.clientY);
        return;
    }
    else if (!cellDiv) return;
    event.preventDefault();
    const groupId = Number(cellDiv.dataset.groupId);
    lastContextMenuScreenX = event.clientX;
    lastContextMenuScreenY = event.clientY;
    showContextMenu(event.clientX, event.clientY, groupId);

});

document.addEventListener('click', (event) => {
    if (!contextMenu.contains(event.target)) {
        hideContextMenu();
    }
    if (!contextMenuBattlefield.contains(event.target)) {
        hideContextMenuBattlefield();
    }
});

menuAdd.addEventListener('click', async () => {
    hideContextMenuBattlefield();
    addModal.classList.remove('hidden');
});

addModelCloseBtn.addEventListener('click', async () => {
    addModal.classList.add('hidden');
});

addModal.addEventListener('click', (e) => {
    if (e.target === addModal) {
        addModal.classList.add('hidden');
    }
});

menuDelete.addEventListener('click', async () => {
    const groupId = contextTargetGroupId;
    hideContextMenu();

    const response = await fetch(`/api/grid-groups/${groupId}`, { method: 'DELETE' });
    if (response.ok) {
        loadGridGroups();
    } else {
        const error = await response.json();
        alert(error.error);
    }
});

menuMove.addEventListener('click', () => {
    movingGroupId = contextTargetGroupId;
    hideContextMenu();
    viewport.style.cursor = 'move';

    const groupDiv = document.querySelector(`.grid-group[data-group-id="${movingGroupId}"]`);
    const groupWorldX = Number(groupDiv.dataset.worldX);
    const groupWorldY = Number(groupDiv.dataset.worldY);

    const rect = viewport.getBoundingClientRect();
    const mouseWorldPos = screenToWorld(lastContextMenuScreenX - rect.left, lastContextMenuScreenY - rect.top);

    moveOffsetWorldX = mouseWorldPos.x - groupWorldX;
    moveOffsetWorldY = mouseWorldPos.y - groupWorldY;
});

viewport.addEventListener('pointermove', (event) => {
    if (movingGroupId === null) return;

    const rect = viewport.getBoundingClientRect();
    const worldPos = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const groupDiv = document.querySelector(`.grid-group[data-group-id="${movingGroupId}"]`);
    if (!groupDiv) return;

    const newWorldX = worldPos.x - moveOffsetWorldX;
    const newWorldY = worldPos.y - moveOffsetWorldY;
    const originalWorldX = Number(groupDiv.dataset.worldX);
    const originalWorldY = Number(groupDiv.dataset.worldY);

    groupDiv.style.transform = `translate(${newWorldX - originalWorldX}px, ${newWorldY - originalWorldY}px)`;
});

viewport.addEventListener('click', async (event) => {
    if (movingGroupId === null) return;

    const rect = viewport.getBoundingClientRect();
    const worldPos = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const finalX = Math.round((worldPos.x - moveOffsetWorldX) / 10) * 10;
    const finalY = Math.round((worldPos.y - moveOffsetWorldY) / 10) * 10;

    const groupIdToMove = movingGroupId;
    movingGroupId = null;
    viewport.style.cursor = 'grab';

    await fetch(`/api/grid-groups/${groupIdToMove}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldX: finalX, worldY: finalY })
    });

    loadGridGroups();
});

const battlefieldForm = document.getElementById('add-form');

battlefieldForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const rect = viewport.getBoundingClientRect();
    const mouseWorldPos = screenToWorld(lastContextMenuScreenX - rect.left, lastContextMenuScreenY - rect.top);

    const response = await fetch('/api/grid-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            worldX: Math.round(mouseWorldPos.x),
            worldY: Math.round(mouseWorldPos.y),
            rows: document.getElementById('input-row').value,
            cols: document.getElementById('input-col').value
        })
    });

    if (!response.ok) {
        const error = await response.json();
        alert(error.error || '創建格子群組失敗');
        return;
    }

    battlefieldForm.reset();
    addModal.classList.add('hidden');
    loadGridGroups();
});

const characterListDiv = document.getElementById('character-list');
let allCharacters = [];

async function loadCharacters() {
    const response = await fetch('/api/characters');
    allCharacters = await response.json();
    renderCharacterList();
}

function renderCharacterList() {
    const sorted = [...allCharacters].sort((a, b) => b.speed - a.speed);
    characterListDiv.innerHTML = '';

    sorted.forEach((character) => {
        const card = document.createElement('div');
        card.classList.add('character-card');
        card.dataset.characterId = character.id;

        const left = document.createElement('div');
        left.classList.add('character-card-left');

        const img = document.createElement('img');
        img.src = character.image || '/default-avatar.png';
        img.draggable = false;
        left.appendChild(img);

        const speedBadge = document.createElement('div');
        speedBadge.classList.add('speed-badge');
        speedBadge.textContent = character.speed;
        left.appendChild(speedBadge);

        const nameDiv = document.createElement('div');
        nameDiv.classList.add('character-name');
        nameDiv.textContent = character.name;
        left.appendChild(nameDiv);

        const right = document.createElement('div');
        right.classList.add('character-card-right');
        right.appendChild(createStatBar('hp', character.hp, character.maxHp, character));
        right.appendChild(createStatBar('ap', character.ap, character.maxAp, character));
        right.appendChild(createStatBar('sp', character.sp, character.maxSp, character));

        card.appendChild(left);
        card.appendChild(right);
        characterListDiv.appendChild(card);

        setupCharacterCardEvents(card, img, character);
    });
}

let activeStatAdjustment = null;

function stopActiveAdjustment() {
    if (activeStatAdjustment) {
        clearTimeout(activeStatAdjustment.delayId);
        clearInterval(activeStatAdjustment.timerId);
        activeStatAdjustment = null;
    }
}

document.addEventListener('mouseup', stopActiveAdjustment);

function createStatBar(type, current, max, character) {
    const bar = document.createElement('div');
    bar.classList.add('stat-bar', type);

    const fill = document.createElement('div');
    fill.classList.add('stat-bar-fill');
    const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    fill.style.width = percent + '%';

    const label = document.createElement('div');
    label.classList.add('stat-bar-label');
    label.innerHTML = `<span>${type.toUpperCase()}</span> ${current}/${max}`;

    bar.appendChild(fill);
    bar.appendChild(label);

    bar.addEventListener('mousedown', (e) => {
        stopActiveAdjustment();

        const direction = e.button === 0 ? -1 : e.button === 2 ? 1 : null;
        if (direction === null) return;

        adjustStat(character.id, type, direction);

        activeStatAdjustment = { delayId: null, timerId: null };

        activeStatAdjustment.delayId = setTimeout(() => {
            activeStatAdjustment.timerId = setInterval(() => {
                adjustStat(character.id, type, direction);
            }, 70);
        }, 500);
    });
    bar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    return bar;
}

async function adjustStat(characterId, statType, delta) {
    const response = await fetch(`/api/characters/${characterId}/stat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statType, delta })
    });

    if (response.ok) {
        const updated = await response.json();
        const index = allCharacters.findIndex(c => c.id === characterId);
        if (index !== -1) allCharacters[index] = updated;
        renderCharacterList();
    }
}

function setupCharacterCardEvents(card, img, character) {
    img.addEventListener('dblclick', () => {
        openCharacterEditModal(character);
    });

    img.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        startTokenDrag(character, event);
    });
}

function startTokenDrag(character, startEvent) {
    const ghostToken = document.createElement('img');
    ghostToken.src = character.image || '/default-avatar.png';
    ghostToken.classList.add('drag-ghost-token');
    ghostToken.style.position = 'fixed';
    ghostToken.style.width = '50px';
    ghostToken.style.height = '50px';
    ghostToken.style.pointerEvents = 'none';
    ghostToken.style.zIndex = '3000';
    document.body.appendChild(ghostToken);

    function moveGhost(event) {
        ghostToken.style.left = (event.clientX - 25) + 'px';
        ghostToken.style.top = (event.clientY - 25) + 'px';
    }
    moveGhost(startEvent);

    function onPointerMove(event) {
        moveGhost(event);
    }

    async function onPointerUp(event) {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        ghostToken.remove();

        const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
        const cellDiv = elementBelow ? elementBelow.closest('.cell') : null;

        if (cellDiv) {
            const cellId = Number(cellDiv.dataset.cellId);
            const response = await fetch(`/api/cells/${cellId}/occupy`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId: character.id })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error);
            } else {
                loadGridGroups();
            }
        }
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}