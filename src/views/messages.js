// Messages in the chat (DESIGN.md → Key screens → The chat → Messages): versions (the counter, and dragging
// the last reply sideways), long older messages that fold with Show more, and Jump to latest. The messages
// themselves are SillyTavern's (#chat .mes); this marks them, adds a few controls, and presses SillyTavern's
// own buttons. Styles in styles/views/messages.css.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { CHAT, MESSAGE_EDITOR } from '../st/selectors.js';
import { chatWhen } from '../ui/chat-row.js';
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
 * Shortens verbose message timestamps ("November 28, 2026 11:28 AM" → "11:28 AM" or "Nov 28") while keeping
 * the full date in the title attribute. Restores SillyTavern's exact text when Pocket Tavern turns off.
 */
function syncTimestamps(on) {
    if (!on) {
        for (const el of document.querySelectorAll(`${CHAT} .timestamp[data-pt-full-time]`)) {
            el.textContent = el.dataset.ptFullTime;
            if (el.getAttribute('title') === el.dataset.ptFullTime) el.removeAttribute('title');
            delete el.dataset.ptFullTime;
        }
        return;
    }
    for (const el of document.querySelectorAll(`${CHAT} > .mes .ch_name .timestamp`)) {
        if (el.dataset.ptFullTime) continue;
        const full = el.textContent?.trim();
        if (!full) continue;
        const short = chatWhen(full);
        if (!short || short === full) continue;
        el.dataset.ptFullTime = full;
        if (!el.getAttribute('title')) el.setAttribute('title', full);
        el.textContent = short;
    }
}

/**
 * Adds a quiet Copy button to fenced code blocks in messages; removes them cleanly on teardown.
 */
function syncCodeCopy(on) {
    if (!on) {
        document.querySelectorAll(`${CHAT} .pt-code-copy`).forEach(btn => btn.remove());
        return;
    }
    for (const pre of document.querySelectorAll(`${CHAT} > .mes .mes_text pre`)) {
        if (pre.querySelector(':scope > .pt-code-copy')) continue;
        const btn = h('button', {
            type: 'button',
            class: 'pt-code-copy pt-focus pt-press',
            'aria-label': 'Copy code',
            title: 'Copy code',
            onclick: event => {
                event.preventDefault();
                event.stopPropagation();
                const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
                navigator.clipboard?.writeText?.(code).catch(() => {});
                deps.buzz(6);
                btn.classList.add('pt-code-copy--done');
                btn.replaceChildren(svgIcon('check'));
                window.setTimeout(safe('messages: copy code', () => {
                    if (!btn.isConnected) return;
                    btn.classList.remove('pt-code-copy--done');
                    btn.replaceChildren(svgIcon('copy'));
                }), 1400);
            },
        }, [svgIcon('copy')]);
        pre.append(btn);
    }
}

/**
 * Parses a SillyTavern message date into a valid Date (or null).
 */
function parseMessageDate(raw) {
    if (!raw) return null;
    if (typeof raw === 'number') {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const text = String(raw).trim();
    if (!text) return null;
    // SillyTavern formats like "2026-11-28@11h28m" or "November 28, 2026 11:28 AM"
    const normalized = text.replace(/@(\d+)h(\d+)m.*$/i, ' $1:$2');
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

function dayDividerLabel(date, now) {
    const startOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOf(now) - startOf(date)) / 86400000);
    if (diffDays === 0) return t('Today');
    if (diffDays === 1) return t('Yesterday');
    const sameYear = date.getFullYear() === now.getFullYear();
    try {
        return new Intl.DateTimeFormat(undefined, sameYear
            ? { month: 'short', day: 'numeric' }
            : { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    } catch {
        return date.toDateString();
    }
}

let lastDividerSig = '';

/**
 * Sets a quiet data-pt-day attribute on messages that start a new calendar day (rendered via CSS ::before,
 * zero extra DOM children inside #chat). Cleans up completely on teardown.
 */
function syncDayDividers(on) {
    if (!on) {
        lastDividerSig = '';
        for (const mes of document.querySelectorAll(`${CHAT} > .mes[data-pt-day]`)) delete mes.dataset.ptDay;
        return;
    }
    const chat = deps.context().chat ?? [];
    const chatId = deps.context().getCurrentChatId?.() ?? '';
    const nodes = document.querySelectorAll(`${CHAT} > .mes`);
    const sig = `${chatId}|${nodes.length}|${nodes[0]?.getAttribute('mesid') ?? ''}|${nodes[nodes.length - 1]?.getAttribute('mesid') ?? ''}`;
    if (sig === lastDividerSig) return;
    lastDividerSig = sig;
    const now = new Date();
    let prevKey = '';
    for (const mes of nodes) {
        const idx = Number(mes.getAttribute('mesid'));
        const message = chat[idx];
        const tsEl = mes.querySelector('.ch_name .timestamp');
        const date = parseMessageDate(message?.send_date) ?? parseMessageDate(tsEl?.dataset.ptFullTime ?? tsEl?.textContent);
        if (!date) {
            delete mes.dataset.ptDay;
            continue;
        }
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        if (key !== prevKey) {
            prevKey = key;
            const label = dayDividerLabel(date, now);
            if (mes.dataset.ptDay !== label) mes.dataset.ptDay = label;
        } else {
            delete mes.dataset.ptDay;
        }
    }
}

/**
 * The version pill shows "1/3" only when there is more than one version. With one, it is just the round
 * "new version" button (styles/views/messages.css → .pt-one-swipe).
 */
export function markSingleVersions() {
    // Turning off (or falling back after an error) clears the marks at once: callbacks stop running then.
    if (!deps.enabled().chat) {
        document.querySelectorAll(`${CHAT} > .mes.pt-one-swipe`).forEach(mes => mes.classList.remove('pt-one-swipe'));
        syncTimestamps(false);
        syncCodeCopy(false);
        syncDayDividers(false);
        return;
    }
    requestAnimationFrame(safe('messages: versions', () => {
        const chat = deps.context().chat ?? [];
        const flags = deps.enabled();
        const on = flags.chat;
        const all = document.body.classList.contains('swipeAllMessages');
        for (const mes of document.querySelectorAll(all ? `${CHAT} > .mes` : `${CHAT} > .mes.last_mes, ${CHAT} > .mes.pt-one-swipe`)) {
            const message = chat[Number(mes.getAttribute('mesid'))];
            mes.classList.toggle('pt-one-swipe', on && !((message?.swipes?.length ?? 0) > 1));
        }
        syncTimestamps(on);
        syncCodeCopy(on);
        syncDayDividers(on && flags.dayDividers);
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

// ---- Live typing indicator ("{name} is writing…") ------------------------------------------------

const typing = { pill: null, label: null, streamed: false };

/** Once tokens visibly stream into the reply, hide the typing pill so its dots never tick during streaming. */
export function onStreamToken() {
    if (typing.streamed) return;
    typing.streamed = true;
    typing.pill?.remove();
    typing.pill = null;
    typing.label = null;
}

export function syncTypingIndicator() {
    const flags = deps?.enabled();
    const context = deps?.context?.();
    const inChat = context?.getCurrentChatId?.() !== undefined;
    const generating = !!deps?.generating();
    if (!generating) typing.streamed = false;
    const want = !!flags?.chat && inChat && generating && !typing.streamed;
    if (!want) {
        typing.pill?.remove();
        typing.pill = null;
        typing.label = null;
        return;
    }
    const sheld = document.getElementById('sheld');
    if (!sheld) return;
    const charName = !context.groupId ? (context.characters?.[context.characterId]?.name?.trim() ?? '') : '';
    const text = charName ? t('{name} is writing…', { name: charName }) : t('Writing…');
    if (!typing.pill) {
        typing.label = h('span', { class: 'pt-typing-text', raw: text });
        typing.pill = h('div', { id: 'pt-typing-pill', class: 'pt-typing-pill', role: 'status', 'aria-live': 'polite' }, [
            h('span', { class: 'pt-typing-dots', 'aria-hidden': 'true' }, [h('span'), h('span'), h('span')]),
            typing.label,
        ]);
        sheld.append(typing.pill);
    } else if (typing.label) {
        typing.label.textContent = text;
    }
}
