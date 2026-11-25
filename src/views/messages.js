// Messages in the chat (DESIGN.md → Key screens → The chat → Messages): versions (the counter, and dragging
// the last reply sideways), long older messages that fold with Show more, and Jump to latest. The messages
// themselves are SillyTavern's (#chat .mes); this marks them, adds a few controls, and presses SillyTavern's
// own buttons. Styles in styles/views/messages.css.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { CHAT, MESSAGE_EDITOR } from '../st/selectors.js';
import { svgIcon } from '../ui/icons.js';

/** Longer than this (characters), an older message folds. */
const LONG_MESSAGE = 2500;

/**
 * What the shell supplies, set once by setupMessages().
 * @typedef {object} MessageDeps
 * @property {() => object} context SillyTavern's getContext()
 * @property {() => { chat: boolean, fold: boolean, jump: boolean, drag: boolean }} enabled which parts are on
 * @property {() => boolean} generating a reply is being written
 * @property {() => boolean} motion animations are allowed
 * @property {(ms: number) => void} buzz a short vibration
 * @property {() => void} heightsChanged messages changed height (folding); the shell re-measures
 */
/** @type {MessageDeps | null} */
let deps = null;

export function setupMessages(supplied) {
    deps = supplied;
}

// ---- versions: "2/3" only when there is more than one --------------------------------------------

/**
 * The version pill shows "1/3" only when there is more than one version. With one, it is just the round
 * "new version" button (styles/views/messages.css → .pt-one-swipe).
 */
export function markSingleVersions() {
    // Turning off (or falling back after an error) clears the marks at once: callbacks stop running then.
    if (!deps.enabled().chat) {
        document.querySelectorAll(`${CHAT} > .mes.pt-one-swipe`).forEach(mes => mes.classList.remove('pt-one-swipe'));
        return;
    }
    requestAnimationFrame(safe('messages: versions', () => {
        const chat = deps.context().chat ?? [];
        const on = deps.enabled().chat;
        const all = document.body.classList.contains('swipeAllMessages');
        for (const mes of document.querySelectorAll(all ? `${CHAT} > .mes` : `${CHAT} > .mes.last_mes, ${CHAT} > .mes.pt-one-swipe`)) {
            const message = chat[Number(mes.getAttribute('mesid'))];
            mes.classList.toggle('pt-one-swipe', on && !((message?.swipes?.length ?? 0) > 1));
        }
    }));
}

// ---- versions: drag the last reply sideways ------------------------------------------------------

const drag = { mes: null, x: 0, y: 0, dx: 0, active: false, hint: null, started: 0, canPrevious: false, top: 120, frame: 0 };

export function onSwipeStart(event) {
    const on = deps?.enabled();
    if (!on?.chat || !on.drag || event.touches.length !== 1) return;
    const mes = event.target.closest?.(`${CHAT} .mes.last_mes`);
    if (!mes || mes.getAttribute('is_user') === 'true' || mes.querySelector(MESSAGE_EDITOR)) return;
    if (event.target.closest('textarea, input, button, a, .mes_buttons, .swipe_left, .swipe_right, pre, .mes_reasoning_details')) return;
    drag.mes = mes;
    drag.x = event.touches[0].clientX;
    drag.y = event.touches[0].clientY;
    drag.dx = 0;
    drag.active = false;
    drag.started = Date.now();
}

const paintSwipe = safe('messages: drag', () => {
    drag.frame = 0;
    if (!drag.mes || !drag.active) return;
    drag.mes.style.transition = 'none';
    drag.mes.style.transform = `translate3d(${drag.dx}px, 0, 0) rotate(${drag.dx / 60}deg)`;
    const kind = drag.dx < 0 ? 'next' : (drag.canPrevious ? 'previous' : 'none');
    if (!drag.hint || drag.hint.dataset.kind !== kind) {
        drag.hint?.remove();
        drag.hint = kind === 'none' ? null : h('div', { class: `pt-drag-hint pt-drag-${kind}`, 'data-kind': kind }, [
            svgIcon(kind === 'next' ? 'chevron-left' : 'chevron-right'),
            h('span', { text: kind === 'next' ? 'Another version' : 'Previous version' }),
        ]);
        if (drag.hint) {
            drag.hint.style.top = `${drag.top}px`;
            document.body.append(drag.hint);
        }
    }
    if (drag.hint) drag.hint.classList.toggle('pt-drag-ready', Math.abs(drag.dx) > 80);
});

export function onSwipeMove(event) {
    if (!drag.mes) return;
    const x = event.touches[0].clientX - drag.x;
    const y = event.touches[0].clientY - drag.y;
    if (!drag.active) {
        if (Math.abs(y) > 14 && Math.abs(y) > Math.abs(x)) {
            drag.mes = null;
            return;
        }
        if (Math.abs(x) < 16) return;
        drag.active = true;
        const left = drag.mes.querySelector('.swipe_left');
        drag.canPrevious = !!(left && getComputedStyle(left).display !== 'none');
        const rect = drag.mes.getBoundingClientRect();
        drag.top = Math.max(rect.top, 70) + Math.min(rect.height, 300) / 2;
    }
    drag.dx = x > 0 && !drag.canPrevious ? Math.min(24, x * 0.15) : Math.max(-150, Math.min(150, x));
    if (!drag.frame) drag.frame = requestAnimationFrame(paintSwipe);
}

export function onSwipeEnd() {
    cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    const mes = drag.mes;
    drag.mes = null;
    if (!mes || !drag.active) return;
    const canGo = drag.dx < 0 || drag.canPrevious;
    const fast = Math.abs(drag.dx) > 40 && Date.now() - drag.started < 250;
    const go = canGo && (Math.abs(drag.dx) > 80 || fast);
    mes.style.transition = 'transform 0.25s var(--pt-ease)';
    mes.style.transform = '';
    setTimeout(safe('messages: drag settle', () => { mes.style.transition = ''; }), 260);
    drag.hint?.remove();
    drag.hint = null;
    if (!go) return;
    deps.buzz(12);
    // SillyTavern's own version buttons do the work.
    const button = mes.querySelector(drag.dx < 0 ? '.swipe_right' : '.swipe_left');
    if (button && getComputedStyle(button).display !== 'none') button.click();
}

/** SillyTavern's own quick-flick swipe would fire as well; the drag handles it. */
export function onSwipedEvent(event) {
    const on = deps?.enabled();
    if (on?.chat && on.drag) event.stopImmediatePropagation();
}

/** A drag in progress is dropped (Pocket Tavern turning off). */
export function cancelSwipe() {
    cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    drag.hint?.remove();
    drag.hint = null;
    if (drag.mes) {
        drag.mes.style.removeProperty('transform');
        drag.mes.style.removeProperty('transition');
    }
    drag.mes = null;
}

// ---- long older messages fold with Show more -----------------------------------------------------

export function foldLongMessages() {
    const on = deps.enabled();
    if (!on.chat || !on.fold) {
        document.querySelectorAll(`${CHAT} .mes.pt-long, ${CHAT} .mes.pt-long-open`).forEach(mes => mes.classList.remove('pt-long', 'pt-long-open'));
        document.querySelectorAll('.pt-more-btn').forEach(node => node.remove());
        return;
    }
    const chat = deps.context().chat ?? [];
    let changed = false;
    for (const mes of document.querySelectorAll(`${CHAT} > .mes`)) {
        const message = chat[Number(mes.getAttribute('mesid'))];
        const text = message?.extra?.display_text ?? message?.mes ?? '';
        const long = text.length > LONG_MESSAGE && !mes.classList.contains('last_mes') && !mes.querySelector(MESSAGE_EDITOR);
        if (mes.classList.contains('pt-long') !== long) changed = true;
        mes.classList.toggle('pt-long', long);
        let button = mes.querySelector('.pt-more-btn');
        if (long && !button) {
            button = h('button', {
                type: 'button',
                class: 'pt-more-btn',
                onclick: () => {
                    const open = mes.classList.toggle('pt-long-open');
                    button.textContent = open ? t('Show less') : t('Show more');
                    if (!open) mes.scrollIntoView({ block: 'nearest' });
                },
            }, [t('Show more')]);
            mes.querySelector('.mes_text')?.after(button);
        } else if (!long && button) {
            button.remove();
            mes.classList.remove('pt-long-open');
        }
    }
    // Folding changes heights.
    if (changed) deps.heightsChanged();
}

/** Opens a folded message (when the chat search lands in it). */
export function unfold(mes) {
    if (mes.classList.contains('pt-long') && !mes.classList.contains('pt-long-open')) {
        mes.classList.add('pt-long-open');
        const button = mes.querySelector('.pt-more-btn');
        if (button) button.textContent = t('Show less');
    }
}

// ---- Jump to latest ------------------------------------------------------------------------------

const jump = { button: null, frame: 0, atBottom: true, chat: null };

/** Whether the chat is scrolled to its end (new text then keeps it there). */
export function atBottom() {
    return jump.button ? jump.atBottom : true;
}

/** Shows Jump to latest when you have scrolled up; called on scroll and when a reply starts or ends. */
export function updateJump() {
    if (jump.frame) return;
    jump.frame = requestAnimationFrame(safe('messages: jump', () => {
        jump.frame = 0;
        const chat = jump.chat;
        if (!chat || !jump.button) return;
        const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
        jump.atBottom = distance < 40;
        // Not without a chat: there is no "latest message" then.
        const noChat = deps.context().getCurrentChatId?.() === undefined;
        const generating = deps.generating();
        jump.button.classList.toggle('pt-jump-on', !noChat && (distance > Math.max(320, chat.clientHeight * 0.7) || (generating && distance > 150)));
        // While a reply streams in below, the button says so.
        jump.button.classList.toggle('pt-jump-new', generating && distance > 150);
    }));
}

export function syncJumpButton() {
    const chat = document.querySelector(CHAT);
    const sheld = document.getElementById('sheld');
    const want = deps.enabled().jump && chat && sheld;
    if (!want) {
        jump.button?.remove();
        jump.button = null;
        jump.chat?.removeEventListener('scroll', updateJump);
        jump.chat = null;
        cancelAnimationFrame(jump.frame);
        jump.frame = 0;
        return;
    }
    if (jump.button) return;
    jump.chat = chat;
    jump.button = h('button', {
        type: 'button',
        class: 'pt-jump',
        'aria-label': 'Jump to the latest message',
        title: 'Latest message',
        onclick: () => {
            deps.buzz(8);
            chat.scrollTo({ top: chat.scrollHeight, behavior: deps.motion() ? 'smooth' : 'auto' });
        },
    }, [svgIcon('arrow-down'), h('span', { class: 'pt-jump-label', text: 'New text' })]);
    shieldFromDrawerAutoClose(jump.button);
    sheld.append(jump.button);
    chat.addEventListener('scroll', updateJump, { passive: true });
    updateJump();
}
