const body = document.body;
const sidebar = document.getElementById('sidebar');
const partyButton = document.getElementById('view-party-btn');
const enemyButton = document.getElementById('view-enemy-btn');
const rulesButton = document.getElementById('view-rules-btn');
const collapseButton = document.getElementById('collapse-sidebar-btn');

const validSections = new Set(['player', 'enemy', 'rules']);
let savedSection = localStorage.getItem('trpg-sidebar-section');
let section = validSections.has(savedSection) ? savedSection : 'player';
let collapsed = localStorage.getItem('trpg-sidebar-collapsed') === 'true';

function applyState() {
    body.classList.toggle('sidebar-collapsed', collapsed);
    body.classList.toggle('enemy-view', section === 'enemy');
    body.classList.toggle('rules-view', section === 'rules');

    partyButton.classList.toggle('active', section === 'player');
    enemyButton.classList.toggle('active', section === 'enemy');
    rulesButton.classList.toggle('active', section === 'rules');

    partyButton.setAttribute('aria-pressed', section === 'player');
    enemyButton.setAttribute('aria-pressed', section === 'enemy');
    rulesButton.setAttribute('aria-pressed', section === 'rules');

    collapseButton.classList.toggle('collapsed', collapsed);
    collapseButton.title = collapsed ? '展開側欄' : '收合側欄';

    localStorage.setItem('trpg-sidebar-section', section);
    localStorage.setItem('trpg-sidebar-collapsed', String(collapsed));
}

function selectSection(nextSection) {
    section = nextSection;
    collapsed = false;
    applyState();

    document.dispatchEvent(new CustomEvent('trpg:section-change', {
        detail: { section }
    }));
}

export function setSidebarCounts(playerCount, enemyCount) {
    document.getElementById('party-count').textContent = playerCount;
    document.getElementById('enemy-count').textContent = enemyCount;
}

export function getSidebarSection() {
    return section;
}

export function initSidebar() {
    partyButton.addEventListener('click', () => selectSection('player'));
    enemyButton.addEventListener('click', () => selectSection('enemy'));
    rulesButton.addEventListener('click', () => selectSection('rules'));

    collapseButton.addEventListener('click', () => {
        collapsed = !collapsed;
        applyState();
    });

    applyState();
    return section;
}
