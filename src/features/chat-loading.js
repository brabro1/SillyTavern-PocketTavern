// Opening a chat (DESIGN.md → The chat → Opening a chat): if the messages take longer than 300ms to
// arrive, still placeholder messages cover the message area until they do, then fade out. No shimmer.
// The layer lives outside #chat, which SillyTavern empties when a chat loads (AGENTS.md → Known traps).
// Only the latest switch counts. Styles in styles/views/chats.css.
import { h } from '../core/dom.js';
import { safe } from '../core/lifecycle.js';
import { CHAT, MESSAGE_FORM } from '../st/selectors.js';

const WAIT = 300;
/** Give up on a load that never finishes (an error in SillyTavern): the chat area shows again. */
const LONGEST = 15000;

/**
 * Watches #chat while Pocket Tavern is on. `stop` removes everything it added.
 * @param {() => boolean} inChat whether a chat is open (SillyTavern's current chat id is set)
 */
export function watchChatLoading(inChat) {
    const chat = document.querySelector(CHAT);
    if (!chat) return { done: () => {}, loaded: () => {}, stop: () => {} };
    let layer = null;
    let waitTimer = 0;
    let giveUpTimer = 0;
    let fadeTimer = 0;

    const hasMessages = () => !!chat.querySelector('.mes');
    const clearTimers = () => {
        window.clearTimeout(waitTimer);
        window.clearTimeout(giveUpTimer);
        waitTimer = 0;
        giveUpTimer = 0;
    };
    const removeLayer = () => {
        window.clearTimeout(fadeTimer);
        fadeTimer = 0;
        layer?.remove();
        layer = null;
    };
    const finish = () => {
        clearTimers();
        if (!layer) return;
        const leaving = layer;
        leaving.classList.add('pt-chat-loading--out');
        fadeTimer = window.setTimeout(safe('chat loading: fade out', () => {
            if (layer === leaving) removeLayer();
        }), 200);
    };
    const show = safe('chat loading: show', () => {
        waitTimer = 0;
        if (hasMessages() || !inChat()) return;
        removeLayer();
        const box = chat.getBoundingClientRect();
        // Above the message box, which floats over the bottom of the chat.
        const form = document.querySelector(MESSAGE_FORM)?.getBoundingClientRect();
        const bottom = form && form.height ? Math.min(box.bottom, form.top) : box.bottom;
        const height = bottom - box.top;
        if (box.width < 50 || height < 50) return;
        // Three still message shapes, alternating sides like a conversation.
        const bubble = (side, lines) => h('div', { class: `pt-chat-loading-mes pt-chat-loading-mes--${side}` }, [
            h('span', { class: 'pt-chat-loading-avatar' }),
            h('span', { class: 'pt-chat-loading-lines' }, lines.map(width => h('span', { class: 'pt-chat-loading-line', style: `width: ${width}%` }))),
        ]);
        layer = h('div', { class: 'pt-chat-loading', 'aria-hidden': 'true', style: `top: ${Math.round(box.top)}px; left: ${Math.round(box.left)}px; width: ${Math.round(box.width)}px; height: ${Math.round(height)}px` }, [
            h('div', { class: 'pt-chat-loading-column' }, [bubble('bot', [92, 78, 54]), bubble('user', [60]), bubble('bot', [88, 70])]),
        ]);
        document.body.append(layer);
        giveUpTimer = window.setTimeout(safe('chat loading: give up', finish), LONGEST);
    });

    const observer = new MutationObserver(safe('chat loading: watch', () => {
        if (hasMessages()) {
            finish();
            return;
        }
        // #chat was just emptied: a chat is loading. The latest switch restarts the wait.
        if (!waitTimer && !layer) waitTimer = window.setTimeout(show, WAIT);
    }));
    observer.observe(chat, { childList: true });

    return {
        /** SillyTavern says the chat changed (or closed): done, whatever is on screen. */
        done: () => {
            if (!inChat() || hasMessages()) finish();
        },
        /** SillyTavern finished loading the chat, even one with no messages. */
        loaded: () => finish(),
        stop: () => {
            observer.disconnect();
            clearTimers();
            removeLayer();
        },
    };
}
