// Chat rows (DESIGN.md → Cards → Chat row): a title line (who, or the chat's own name, when, ⋯), the
// last message drawn as a message bubble, and how many messages. Used by the Chats home, the chat
// history and a character's chats. Everything a user wrote is built from text nodes, never HTML.
// Styles in styles/components/chat-row.css.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { svgIcon } from './icons.js';

/**
 * A message preview the way a chat message reads: *narration* and _narration_ in the narration
 * colour, "dialogue" in the quote colour, **bold**. A preview cut at its start ("…she smiles.* Then")
 * or end ("*She takes") keeps the half it is in.
 * @param {string} text the message (user data)
 * @returns {DocumentFragment}
 */
export function formatPreview(text) {
    const out = document.createDocumentFragment();
    let str = String(text ?? '').replace(/\s+/g, ' ').trim();
    const lone = str.replace(/\*\*/g, '').split('*').length - 1;
    let lead = '';
    let tail = '';
    if (lone % 2 === 1) {
        // An odd asterisk: the preview was cut inside narration.
        if (/^(?:\.\.\.|…)/.test(str) && str.indexOf('*') > -1) {
            const at = str.indexOf('*');
            lead = str.slice(0, at);
            str = str.slice(at + 1);
        } else {
            const at = str.lastIndexOf('*');
            tail = str.slice(at + 1);
            str = str.slice(0, at);
        }
    }
    if (lead) out.append(h('em', { raw: lead }));
    // No lookbehind: Safari before iOS 16.4 cannot parse it, and the whole extension would fail to load.
    const pattern = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|(^|[^\w])_([^_]+)_(?!\w)|("[^"]+"|“[^”]+”|«[^»]+»)/g;
    let cursor = 0;
    for (const match of str.matchAll(pattern)) {
        if (match.index > cursor) out.append(str.slice(cursor, match.index));
        if (match[1] !== undefined) out.append(h('strong', {}, [h('em', { raw: match[1] })]));
        else if (match[2] !== undefined) out.append(h('strong', { raw: match[2] }));
        else if (match[3] !== undefined) out.append(h('em', { raw: match[3] }));
        else if (match[5] !== undefined) out.append(match[4], h('em', { raw: match[5] }));
        else out.append(h('q', { raw: match[6] }));
        cursor = match.index + match[0].length;
    }
    if (cursor < str.length) out.append(str.slice(cursor));
    if (tail) out.append(h('em', { raw: tail }));
    return out;
}

/** The last message as a bubble, styled like the chat's message cards. */
export function previewBubble(text) {
    // The words sit in their own box so the line limit never shows a sliver of the next line.
    const words = h('span', { class: 'pt-bubble-text', dir: 'auto' });
    words.append(formatPreview(text));
    return h('span', { class: 'pt-bubble' }, [words]);
}

/** "1 message", "5 messages". */
export function messageCount(count) {
    return count === 1 ? t('1 message') : t('{count} messages', { count });
}

/**
 * The name to show for a chat: its own name when it was renamed, otherwise when it was started
 * ("Seraphina - 2023-5-12 @21h 32m 29s 224ms" reads as "Chat from 12 May 2023"). Branches and other
 * names stay as they are. `raw` means the text is the user's, never translated.
 * @returns {{ text: string, raw: boolean }}
 */
export function chatTitle(fileName) {
    const name = String(fileName ?? '').replace(/\.jsonl$/i, '').trim();
    const match = name.match(/(?:^|\s-\s)(\d{4})-(\d{1,2})-(\d{1,2})\s?@\s?(\d{1,2})h\s?(\d{1,2})m\s?(\d{1,2})s(?:\s?\d+\s?ms)?$/);
    if (!match || /^Branch #/i.test(name)) return { text: name, raw: true };
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
    if (Number.isNaN(date.getTime())) return { text: name, raw: true };
    return { text: t('Chat from {date}', { date: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }), raw: false };
}

/** A node with the chat's name (see chatTitle). */
export function chatTitleNode(tag, className, fileName) {
    const title = chatTitle(fileName);
    const node = h(tag, { class: className, raw: title.text });
    if (title.raw) node.dir = 'auto';
    return node;
}

/** ⋯ on a row: small to look at, a full 44px to tap, and it never opens the row. */
export function rowMenuButton(onOpen, label = 'Chat options') {
    const button = h('button', {
        type: 'button',
        class: 'pt-rc-more pt-focus',
        'aria-label': label,
        title: label,
        onclick: event => {
            event.preventDefault();
            event.stopPropagation();
            onOpen(event.currentTarget);
        },
    }, [svgIcon('ellipsis')]);
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) button.addEventListener(type, event => event.stopPropagation(), { passive: true });
    return button;
}

/**
 * When a chat was last written to: the time today, the weekday this week, the date before that.
 * @param {number} time ms since 1970
 */
export function chatWhen(time) {
    const date = new Date(Number(time));
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (date.getTime() >= startOfDay) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (date.getTime() >= startOfDay - 6 * 86400000) return date.toLocaleDateString(undefined, { weekday: 'short' });
    return date.toLocaleDateString(undefined, date.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One chat on the Chats home: avatar, who, when, ⋯; the last message as a bubble; the chat's own
 * name and how many messages. The open chat gets an accent edge and "Open now".
 * @param {object} options
 * @param {string} options.who the character's or group's name (user data)
 * @param {Node} options.picture an avatar (src/ui/avatar.js)
 * @param {string} options.fileName the chat file's name
 * @param {string} options.preview the last message (user data)
 * @param {number} [options.count] how many messages
 * @param {number} [options.time] when it was last written to
 * @param {boolean} [options.open] it is the chat open right now
 * @param {boolean} [options.pinned]
 * @param {() => void} options.onOpen
 * @param {((button: HTMLElement) => void) | null} [options.onMenu]
 * @param {(() => void) | null} [options.onPicture] tapping the picture does this instead (a character's page)
 */
export function chatRow({ who, picture, fileName, preview, count, time, open = false, pinned = false, onOpen, onMenu, onPicture = null }) {
    const name = h('b', { class: 'pt-rc-title', raw: who, dir: 'auto' });
    const line = h('span', { class: 'pt-rc-line' }, [name]);
    if (open) line.append(h('span', { class: 'pt-rc-now', text: 'Open now' }));
    else if (time) line.append(h('small', { class: 'pt-rc-when', raw: chatWhen(time) }));
    const meta = h('small', { class: 'pt-rc-meta' }, [chatTitleNode('span', 'pt-rc-chat', fileName)]);
    if (Number.isFinite(count)) meta.append(h('span', { text: messageCount(count) }));
    const main = h('button', { type: 'button', class: 'pt-chat-row-main pt-focus pt-press', onclick: event => {
        if (onPicture && event.target instanceof Element && event.target.closest('.pt-chat-row-picture')) onPicture();
        else onOpen();
    } }, [
        h('span', { class: `pt-chat-row-picture${onPicture ? ' pt-chat-row-picture--link' : ''}`, title: onPicture ? 'Character page' : undefined }, [picture, pinned ? h('span', { class: 'pt-chat-row-pin', title: 'Pinned' }, [svgIcon('bookmark')]) : null]),
        h('span', { class: 'pt-rc-body' }, [line, previewBubble(preview), meta]),
    ]);
    return h('div', { class: `pt-chat-row${open ? ' pt-chat-row--open' : ''}` }, [main, onMenu ? rowMenuButton(onMenu) : null]);
}
