// SillyTavern's Chat history (the list of a character's chats) as Pocket Tavern's chat rows (src/ui/chat-row.js),
// grouped under date headers, each with a ⋯ menu that presses SillyTavern's own buttons for that chat (Settings →
// Pocket Tavern → Chat list helpers). SillyTavern's rows stay in place, restyled.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { chatTitle, chatTitleNode, messageCount, previewBubble, rowMenuButton } from '../ui/chat-row.js';
import { listGroup, listRow } from '../ui/list.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'chat-history';

/** @type {{ active: () => boolean, settings: () => object, closeSheet: Function, highlight: Function, icon: Function, showSheet: Function, ui: Function, wireOnce: Function, MenuSheet: Function } | null} */
let deps = null;

export function setupChatHistory(supplied) {
    deps = supplied;
}

/**
 * The ⋯ menu of a chat row. Each item runs SillyTavern's own button or function; destructive ones
 * come last, in their own group. On desktop it opens beside its ⋯.
 */
export function openChatRowMenu(fileName, items, anchor = null) {
    const rows = items.filter(Boolean);
    const instance = new deps.MenuSheet({
        title: 'Chat',
        anchor,
        fill: body => {
            const row = item => {
                const node = listRow({ title: item.label, icon: item.icon, end: 'none', onClick: () => {
                    deps.closeSheet(true);
                    item.run();
                } });
                if (item.danger) node.classList.add('pt-list-row--danger');
                return node;
            };
            const plain = rows.filter(item => !item.danger);
            const danger = rows.filter(item => item.danger);
            if (plain.length) body.append(listGroup({ rows: plain.map(row) }));
            if (danger.length) body.append(listGroup({ rows: danger.map(row) }));
        },
    });
    // The chat's name is shown as it is.
    instance.title.textContent = chatTitle(fileName).text;
    instance.dialog.setAttribute('aria-label', instance.title.textContent);
    deps.showSheet(instance);
}

function undecorateRows(root = document) {
    root.querySelectorAll('.pt-rc-body').forEach(node => node.remove());
    root.querySelectorAll('.pt-rc').forEach(node => node.classList.remove('pt-rc'));
}

/**
 * A chat in Chat history: its name (or when it was started), when it was last written to and
 * how many messages, the last message as a bubble, and ⋯ for rename, export and delete.
 */
function decorateHistoryRow(block) {
    if (block.querySelector(':scope > .pt-rc-body')) return;
    block.classList.add('pt-rc');
    const fileName = block.getAttribute('file_name') ?? '';
    const head = h('div', { class: 'pt-rc-line' }, [chatTitleNode('b', 'pt-rc-title', fileName)]);
    if (block.hasAttribute('highlight')) head.append(h('span', { class: 'pt-rc-now', text: 'Open now' }));
    const button = selector => () => block.querySelector(selector)?.click();
    head.append(rowMenuButton(anchor => openChatRowMenu(fileName, [
        { icon: 'pencil', label: 'Rename', run: button('.renameChatButton') },
        { icon: 'file-export', label: 'Export as JSONL', run: button('.exportRawChatButton') },
        { icon: 'file-text', label: 'Download as text', run: button('.exportChatButton') },
        { icon: 'trash', label: 'Delete', danger: true, run: button('.PastChat_cross') },
    ], anchor)));
    const meta = h('small', { class: 'pt-rc-meta' }, [h('span', { raw: block.querySelector('.chat_messages_date')?.textContent.trim() ?? '' })]);
    const count = Number.parseInt((block.querySelector('.chat_messages_num')?.textContent ?? '').replace(/\D+/g, ' '), 10);
    if (Number.isFinite(count)) meta.append(h('span', { text: messageCount(count) }));
    block.append(h('div', { class: 'pt-rc-body' }, [head, previewBubble(block.querySelector('.select_chat_block_mes')?.textContent ?? ''), meta]));
}

const chatList = { observer: null, timer: 0 };

function chatDateOf(block) {
    const text = block.querySelector('.chat_messages_date')?.textContent?.trim();
    let time = text ? Date.parse(text) : NaN;
    if (Number.isNaN(time)) {
        const match = (block.getAttribute('file_name') ?? '').match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@?(\d{1,2})?h?\s*(\d{1,2})?m?/);
        if (match) time = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0)).getTime();
    }
    return Number.isNaN(time) ? null : new Date(time);
}

function dateGroup(date) {
    if (!date) return t('Older');
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86400000;
    if (date.getTime() >= startOfDay) return t('Today');
    if (date.getTime() >= startOfDay - day) return t('Yesterday');
    if (date.getTime() >= startOfDay - 6 * day) return t('This week');
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return t('This month');
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function groupChatHistory() {
    const list = document.getElementById('select_chat_div');
    if (!list) return;
    list.querySelectorAll('.pt-date-heading').forEach(node => node.remove());
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().recentTools) return;
    let lastGroup = null;
    for (const wrapper of list.querySelectorAll(':scope > .select_chat_block_wrapper')) {
        if (getComputedStyle(wrapper).display === 'none') continue;
        const block = wrapper.querySelector('.select_chat_block');
        if (block) decorateHistoryRow(block);
        const group = dateGroup(block ? chatDateOf(block) : null);
        if (group !== lastGroup) {
            wrapper.before(h('p', { class: 'pt-date-heading', text: group }));
            lastGroup = group;
        }
    }
}

export function syncChatHistory() {
    const list = document.getElementById('select_chat_div');
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().recentTools) {
        chatList.observer?.disconnect();
        chatList.observer = null;
        list?.querySelectorAll('.pt-date-heading').forEach(node => node.remove());
        if (list) undecorateRows(list);
        return;
    }
    if (list && !chatList.observer) {
        chatList.observer = new MutationObserver(safe(SOURCE, records => {
            // Ignore our own headings.
            if (records.every(record => [...record.addedNodes, ...record.removedNodes].every(node => node.classList?.contains('pt-date-heading')))) return;
            window.clearTimeout(chatList.timer);
            chatList.timer = window.setTimeout(safe(SOURCE, groupChatHistory), 80);
        }));
        chatList.observer.observe(list, { childList: true, subtree: false, attributes: true, attributeFilter: ['style'], attributeOldValue: false });
        deps.wireOnce(document.getElementById('select_chat_search'), 'input', () => {
            window.clearTimeout(chatList.timer);
            chatList.timer = window.setTimeout(safe(SOURCE, groupChatHistory), 350);
        });
    }
}
