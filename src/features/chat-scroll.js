// Keeping the chat where you expect it: a chat opens at its newest message and stays there while its messages
// settle (until you scroll yourself), and with "Faster long chats" every message is drawn once so its real
// height is known and the chat never jumps under your finger.
import { CHAT } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'chat scroll';

/** @type {{ active: () => boolean, settings: () => object, context: () => any } | null} */
let deps = null;

export function setupChatScroll(supplied) {
    deps = supplied;
}

/**
 * "Faster long chats" skips drawing messages that are off screen and guesses
 * their height until they are drawn. Scrolling up into a message drawn for the
 * first time then changed its height, and the chat moved under your finger.
 * So after a chat opens (or its messages change size) every message is drawn
 * once, for one frame; the browser remembers each real height from then on.
 */
const fastChat = { timer: 0, width: 0 };

export function primeChatSizes(delay = 0) {
    window.clearTimeout(fastChat.timer);
    fastChat.timer = window.setTimeout(safe(SOURCE, () => {
        const chat = document.querySelector(CHAT);
        if (!deps.active() || !deps.settings().fastChat || !chat) return;
        chat.classList.add('pt-fast-prime');
        // Drawn in the next frame (heights are remembered then), skipped again after it.
        requestAnimationFrame(safe(SOURCE, () => requestAnimationFrame(safe(SOURCE, () => {
            chat.classList.remove('pt-fast-prime');
            keepAtNewest();
        }))));
    }), delay);
}

/**
 * A chat opens at its newest message. SillyTavern scrolls there once, but then
 * the messages settle (their real heights are measured, long ones fold), and
 * the chat ended up far above the newest message. For a moment after a chat
 * opens, keep it at the newest message, until you scroll yourself.
 */
export const newest = { until: 0, started: null, timers: new Set() };

export function keepAtNewest() {
    if (!deps.active()) return;
    const chat = document.querySelector(CHAT);
    if (newest.started?.()) newest.until = 0;
    if (!chat || Date.now() > newest.until || deps.context().getCurrentChatId?.() === undefined) return;
    chat.scrollTop = chat.scrollHeight;
}

export function holdAtNewest(ms = 2500) {
    const chat = document.querySelector(CHAT);
    if (!deps.active() || !chat || deps.context().powerUserSettings?.auto_scroll_chat_to_bottom === false) return;
    for (const id of newest.timers) window.clearTimeout(id);
    newest.timers.clear();
    newest.until = Date.now() + ms;
    newest.started = userScrollSince();
    for (const delay of [60, 250, 500, 900, 1400, 2200]) {
        const id = window.setTimeout(safe(SOURCE, () => {
            newest.timers.delete(id);
            keepAtNewest();
        }), delay);
        newest.timers.add(id);
    }
}

/**
 * Scrolling by hand: a touch, the wheel, a scroll key or the scrollbar. One set of
 * listeners on the chat (added once), so opening chats does not pile up more.
 * Returns a check: has the user scrolled since this call?
 */
const userScroll = { at: 0, wired: null };

function userScrollSince() {
    const chat = document.querySelector(CHAT);
    if (chat && userScroll.wired !== chat) {
        userScroll.wired = chat;
        const mark = () => { userScroll.at = performance.now(); };
        chat.addEventListener('touchstart', mark, { passive: true });
        chat.addEventListener('wheel', mark, { passive: true });
        // The scrollbar: a press on the chat itself, not on a message inside it.
        chat.addEventListener('pointerdown', safe(SOURCE, event => { if (event.target === chat) mark(); }), { passive: true });
        document.addEventListener('keydown', safe(SOURCE, event => {
            if (deps.active() && ['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && !event.target?.closest?.('textarea, input, select, [contenteditable]')) mark();
        }));
    }
    const since = performance.now();
    return () => userScroll.at > since;
}

export function onChatWidthChange() {
    const width = document.querySelector(CHAT)?.clientWidth ?? 0;
    if (!width || width === fastChat.width) return;
    fastChat.width = width;
    // A new width wraps every message differently.
    primeChatSizes(250);
}

/** Pocket Tavern turned off: no drawing pass left waiting. */
export function stopChatScroll() {
    window.clearTimeout(fastChat.timer);
    fastChat.timer = 0;
    for (const id of newest.timers) window.clearTimeout(id);
    newest.timers.clear();
    newest.until = 0;
}
