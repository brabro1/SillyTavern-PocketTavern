// A message picture that fails to load (a removed group member, a missing file): SillyTavern swaps in a 50px "no
// picture" icon that spilled out of Pocket Tavern's smaller slot, so the slot shows the name's initials instead.
import { CHAT } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'missing avatars';

/** @type {{ active: () => boolean, settings: () => object, icon: Function } | null} */
let deps = null;

export function setupMissingAvatars(supplied) {
    deps = supplied;
}

// -- chat: a message picture that fails to load (a removed group member, a missing file).
// SillyTavern swaps it for a 50px "no picture" icon, which spilled out of our smaller picture slot
// (Kahvana's report). The icon is marked with the name's initials and a colour made from the name,
// and CSS draws it as a circle in the slot.

function nameHue(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) | 0;
    return Math.abs(hash) % 360;
}

function initialsOf(name) {
    const firsts = String(name).trim().split(/\s+/).map(word => word.match(/[\p{L}\p{N}]/u)?.[0]).filter(Boolean);
    if (!firsts.length) return '?';
    return (firsts.length > 1 ? firsts[0] + firsts[firsts.length - 1] : firsts[0]).toLocaleUpperCase();
}

export function markMissingAvatars(root = document.querySelector(CHAT)) {
    const want = deps.active() && deps.settings().chatStyle;
    for (const icon of root?.querySelectorAll('.mes .avatar > .missing-avatar') ?? []) {
        if (!want) {
            delete icon.dataset.ptInitials;
            icon.style.removeProperty('--pt-hue');
            continue;
        }
        const name = icon.closest('.mes')?.getAttribute('ch_name') ?? '';
        const initials = initialsOf(name);
        if (icon.dataset.ptInitials === initials) continue;
        icon.dataset.ptInitials = initials;
        icon.style.setProperty('--pt-hue', String(nameHue(name)));
    }
}

export function onAvatarError(event) {
    const img = event.target;
    if (!deps.active() || !deps.settings().chatStyle || !(img instanceof HTMLImageElement)) return;
    const mes = img.closest(`${CHAT} .mes`);
    // SillyTavern's own error handler on the picture runs after this capture listener.
    if (mes && img.closest('.avatar')) setTimeout(safe(SOURCE, () => markMissingAvatars(mes)), 0);
}
