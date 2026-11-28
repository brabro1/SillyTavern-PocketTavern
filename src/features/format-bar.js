// One-tap RP formatting bar above the message box (DESIGN.md → The chat → Message box): slim pills
// (*Italic*, "Quote", **Bold**, (OOC)) shown while the message box is focused. Tapping wraps the
// selection or inserts the delimiters with the cursor between them, without dismissing the keyboard.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { MESSAGE_BOX } from '../st/selectors.js';

const SOURCE = 'format-bar';

const ACTIONS = [
    { id: 'italic', label: '*Italic*', aria: 'Italic', before: '*', after: '*', cls: 'pt-fmt-italic' },
    { id: 'quote', label: '"Quote"', aria: 'Dialogue quote', before: '"', after: '"', cls: 'pt-fmt-quote' },
    { id: 'bold', label: '**Bold**', aria: 'Bold', before: '**', after: '**', cls: 'pt-fmt-bold' },
    { id: 'ooc', label: '(OOC)', aria: 'Out of character', before: '(OOC: ', after: ')', cls: 'pt-fmt-ooc' },
];

/** @type {{ active: () => boolean, settings: () => object, buzz: (ms: number) => void } | null} */
let deps = null;
let bar = null;
let hideTimer = 0;
let wired = false;

export function setupFormatBar(supplied) {
    deps = supplied;
}

function wrapSelection(box, before, after) {
    const start = box.selectionStart ?? box.value.length;
    const end = box.selectionEnd ?? box.value.length;
    const selected = box.value.slice(start, end);
    const next = box.value.slice(0, start) + before + selected + after + box.value.slice(end);
    box.value = next;
    const cursor = selected ? start + before.length + selected.length + after.length : start + before.length;
    box.focus({ preventScroll: true });
    box.setSelectionRange(cursor, cursor);
    box.dispatchEvent(new Event('input', { bubbles: true }));
}

function showBar() {
    if (!bar) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
    bar.hidden = false;
    requestAnimationFrame(safe(SOURCE, () => {
        if (bar && !bar.hidden) bar.classList.add('pt-fmt-bar--in');
    }));
}

function hideBar(immediate = false) {
    if (!bar) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
    const finish = () => {
        if (!bar) return;
        bar.classList.remove('pt-fmt-bar--in');
        bar.hidden = true;
    };
    if (immediate) finish();
    else hideTimer = window.setTimeout(safe(SOURCE, () => {
        const box = document.querySelector(MESSAGE_BOX);
        if (document.activeElement !== box) finish();
    }), 120);
}

function onFocusIn(event) {
    if (!bar) return;
    if (event.target?.matches?.(MESSAGE_BOX)) showBar();
}

function onFocusOut(event) {
    if (!bar) return;
    if (event.target?.matches?.(MESSAGE_BOX)) hideBar(false);
}

function ensureWired() {
    if (wired) return;
    wired = true;
    document.addEventListener('focusin', safe(SOURCE, onFocusIn), true);
    document.addEventListener('focusout', safe(SOURCE, onFocusOut), true);
}

export function syncFormatBar() {
    const want = deps?.active() && deps.settings().chatStyle && deps.settings().formatBar;
    if (!want) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
        bar?.remove();
        bar = null;
        return;
    }
    ensureWired();
    if (!bar) {
        bar = h('div', {
            id: 'pt-format-bar',
            class: 'pt-fmt-bar',
            role: 'toolbar',
            'aria-label': t('Formatting'),
            hidden: true,
        }, ACTIONS.map(item => h('button', {
            type: 'button',
            class: `pt-fmt-btn pt-focus pt-press ${item.cls}`,
            'data-fmt': item.id,
            'aria-label': item.aria,
            onpointerdown: event => {
                // Keep focus on the message box so the on-screen keyboard stays up.
                event.preventDefault();
            },
            onclick: () => {
                const box = document.querySelector(MESSAGE_BOX);
                if (!box) return;
                deps.buzz(6);
                wrapSelection(box, item.before, item.after);
            },
        }, [h('span', { raw: item.label })])));
    }
    if (!bar.isConnected) {
        // Lives in #sheld above #form_sheld (like Jump to latest) so focusing the message box never shifts #form_sheld height.
        document.getElementById('sheld')?.append(bar);
    }
    const box = document.querySelector(MESSAGE_BOX);
    if (box && document.activeElement === box) showBar();
    else hideBar(true);
}
