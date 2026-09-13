export function openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

export function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

export function initModals() {
    document.querySelectorAll('[data-close-modal]').forEach(button => {
        button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('pointerdown', event => {
            if (event.target === modal) closeModal(modal.id);
        });
    });
}

let toastTimer = null;

export function showToast(message, type = 'normal') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.remove('hidden');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

export function percent(current, max) {
    if (!max || max <= 0) return 0;
    return Math.max(0, Math.min(100, (current / max) * 100));
}

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * Escape a value before interpolating it into an innerHTML template.
 * Required for anything originating from user input or the API — character
 * names, skill/buff text, error messages.
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

export function createImageOrInitial(src, name, className = '') {
    const wrap = document.createElement('div');
    wrap.className = className;

    const initial = document.createElement('span');
    initial.className = 'image-initial';
    initial.textContent = String(name || '?').trim().charAt(0) || '?';
    wrap.appendChild(initial);

    if (src) {
        const image = document.createElement('img');
        image.src = src;
        image.alt = name || '角色圖片';
        image.draggable = false;

        image.addEventListener('load', () => initial.classList.add('hidden'));
        image.addEventListener('error', () => image.remove());

        wrap.appendChild(image);
    }

    return wrap;
}
