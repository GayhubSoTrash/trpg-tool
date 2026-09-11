import { initBattlefield, loadGridGroups, placeCharacterOnBattlefield } from './battlefield.js';
import { initCharacters } from './characters.js';
import { initInitiative } from './initiative.js';
import { initSidebar } from './sidebar.js';
import { initModals } from './ui.js';
import { initRules } from './rules.js';
import { initChat } from './chat.js';

async function main() {
    initModals();
    initSidebar();
    initRules();
    initInitiative();
    initChat();
    initBattlefield();

    await Promise.all([
        loadGridGroups(),
        initCharacters({
            refreshBattlefield: loadGridGroups,
            placeCharacterOnBattlefield
        })
    ]);
}

main();
