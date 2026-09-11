(() => {
    const STORAGE_KEY = 'trpg-art-theme';
    const themes = {
        gothic: '哥德聖堂',
        guild: '黃昏公會'
    };

    const saved = localStorage.getItem(STORAGE_KEY);
    const initial = themes[saved] ? saved : 'gothic';
    document.documentElement.dataset.theme = initial;

    window.addEventListener('DOMContentLoaded', () => {
        const button = document.getElementById('theme-button');
        const menu = document.getElementById('theme-menu');
        const label = document.getElementById('theme-label');
        const options = [...document.querySelectorAll('[data-theme-option]')];

        if (!button || !menu || !label) return;

        const closeMenu = () => {
            menu.classList.add('hidden');
            button.setAttribute('aria-expanded', 'false');
        };

        const applyTheme = theme => {
            if (!themes[theme]) return;

            document.documentElement.dataset.theme = theme;
            localStorage.setItem(STORAGE_KEY, theme);
            label.textContent = themes[theme];

            for (const option of options) {
                const active = option.dataset.themeOption === theme;
                option.classList.toggle('active', active);
                option.querySelector('i').textContent = active ? '✓' : '';
            }

            closeMenu();
        };

        applyTheme(initial);

        button.addEventListener('click', event => {
            event.stopPropagation();
            const opening = menu.classList.contains('hidden');
            menu.classList.toggle('hidden', !opening);
            button.setAttribute('aria-expanded', String(opening));
        });

        for (const option of options) {
            option.addEventListener('click', () => applyTheme(option.dataset.themeOption));
        }

        document.addEventListener('pointerdown', event => {
            if (!menu.contains(event.target) && !button.contains(event.target)) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeMenu();
        });
    });
})();