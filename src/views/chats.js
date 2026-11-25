// The Chats place (DESIGN.md → Key screens → Chats (home)): Search everything at the top, then pinned
// and recent chats as chat rows. With search text, results are grouped by kind: Places, Characters,
// Chats, Lorebooks, Settings. On a phone it is the place's own screen; on desktop it fills the panel
// beside the chat. Every action comes from the shell, which runs SillyTavern's own functions.
import { h } from '../core/dom.js';
import { avatar } from '../ui/avatar.js';
import { chatRow } from '../ui/chat-row.js';
import { emptyState } from '../ui/feedback.js';
import { searchBox } from '../ui/field.js';
import { listGroup, listRow } from '../ui/list.js';

/** Rows shown before "Show all chats". */
const FIRST_ROWS = 40;
const LIMITS = { place: 5, character: 12, chat: 12, lorebook: 8, setting: 12 };
const KIND_TITLES = { place: 'Places', character: 'Characters', chat: 'Chats', lorebook: 'Lorebooks', setting: 'Settings' };

const normalize = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @typedef {object} RecentChat one entry of SillyTavern's /api/chats/recent
 * @property {string} file_name
 * @property {string} [avatar] the character's avatar file, for a character chat
 * @property {string} [group] the group's id, for a group chat
 * @property {string} [mes] the last message
 * @property {number} [chat_items] how many messages
 * @property {number} [last_mes] when it was last written to
 *
 * @typedef {object} SearchItem
 * @property {'place'|'character'|'lorebook'|'setting'} kind
 * @property {string} [title] Pocket Tavern's own words (translated)
 * @property {string} [rawTitle] a name (user data, or SillyTavern's own label)
 * @property {string} [subtitle] where it is (translated)
 * @property {string} [icon]
 * @property {string} [picture] an avatar's URL (characters)
 * @property {string} text what the search matches against
 * @property {() => void} run
 */

/**
 * @param {object} actions supplied by the shell
 * @param {() => Promise<RecentChat[]>} actions.recentChats pinned first, then newest first
 * @param {(chat: RecentChat) => { name: string, picture?: string }} actions.owner who the chat is with
 * @param {(chat: RecentChat) => boolean} actions.isOpen it is the chat open right now
 * @param {(chat: RecentChat) => boolean} actions.isPinned
 * @param {(chat: RecentChat) => void} actions.openChat
 * @param {(chat: RecentChat, button: HTMLElement) => void} actions.chatMenu
 * @param {() => Promise<SearchItem[]>} actions.searchIndex everything else Search everything finds
 * @param {() => void} actions.chooseCharacter
 * @returns {import('../shell/page.js').PageSpec}
 */
export function chatsPage(actions) {
    // Kept while the page is drawn again (a chat opened beside it on desktop), so the search stays.
    let query = '';
    let showAll = false;
    // The last list, shown at once while a fresh one loads (no flash of "Loading" when it is drawn again).
    /** @type {RecentChat[] | null} */
    let cached = null;

    return {
        title: 'Chats',
        long: 'Pinned and recent chats',
        icon: 'chats',
        render: body => {
            let chats = cached;
            /** @type {SearchItem[] | null} */
            let index = null;
            let indexLoading = false;
            const results = h('div', { class: 'pt-chats-results' });
            const search = searchBox({
                placeholder: 'Search everything',
                onSearch: value => {
                    query = value;
                    draw();
                },
            });
            const input = search.querySelector('input');
            input.value = query;
            search.querySelector('.pt-search-box-clear').hidden = !query;
            // Enter opens the first result, so Ctrl+K, a few letters and Enter gets you there.
            input.addEventListener('keydown', event => {
                if (event.key !== 'Enter' || event.isComposing) return;
                event.preventDefault();
                results.querySelector('.pt-list-row, .pt-chat-row-main')?.click();
            });
            body.append(h('div', { class: 'pt-chats-search' }, [search]), results);

            const row = chat => {
                const who = actions.owner(chat);
                return chatRow({
                    who: who.name,
                    picture: avatar({ name: who.name, src: who.picture, size: 40 }),
                    fileName: chat.file_name,
                    preview: chat.mes ?? '',
                    count: Number(chat.chat_items),
                    time: Number(chat.last_mes),
                    open: actions.isOpen(chat),
                    pinned: actions.isPinned(chat),
                    onOpen: () => actions.openChat(chat),
                    onMenu: button => actions.chatMenu(chat, button),
                });
            };
            const section = (title, rows) => h('section', { class: 'pt-chats-section' }, [h('div', { class: 'pt-list-header', text: title }), h('div', { class: 'pt-chats-rows' }, rows)]);

            const chatList = () => {
                if (chats === null) return [h('p', { class: 'pt-chats-note', text: 'Loading chats…' })];
                if (!chats.length) return [emptyState({ icon: 'chats', text: 'No chats yet', action: { label: 'Choose a character', onClick: actions.chooseCharacter } })];
                const pinned = chats.filter(actions.isPinned);
                const recent = chats.filter(chat => !actions.isPinned(chat));
                const shown = showAll ? recent : recent.slice(0, FIRST_ROWS);
                const out = [];
                if (pinned.length) out.push(section('Pinned', pinned.map(row)));
                if (shown.length) out.push(section('Recent', shown.map(row)));
                if (shown.length < recent.length) {
                    out.push(h('button', {
                        type: 'button',
                        class: 'pt-button pt-button--quiet pt-focus pt-press pt-chats-more',
                        onclick: () => {
                            showAll = true;
                            draw();
                        },
                    }, [h('span', { class: 'pt-button-label', text: 'Show all chats' })]));
                }
                return out;
            };

            const searchResults = () => {
                const words = normalize(query).split(/\s+/).filter(Boolean);
                const hit = text => {
                    const haystack = normalize(text);
                    return words.every(word => haystack.includes(word));
                };
                if (!index && !indexLoading) {
                    indexLoading = true;
                    actions.searchIndex().then(items => {
                        index = items;
                        if (results.isConnected && query) draw();
                    });
                }
                const found = { place: [], character: [], lorebook: [], setting: [] };
                for (const item of index ?? []) {
                    if (found[item.kind].length < LIMITS[item.kind] && hit(item.text)) found[item.kind].push(item);
                }
                const chatHits = (chats ?? []).filter(chat => hit(`${actions.owner(chat).name} ${chat.file_name} ${chat.mes ?? ''}`)).slice(0, LIMITS.chat);
                const listRows = items => items.map(item => listRow({
                    title: item.title,
                    rawTitle: item.rawTitle,
                    subtitle: item.subtitle,
                    icon: item.picture === undefined ? item.icon : undefined,
                    start: item.picture !== undefined ? avatar({ name: item.rawTitle ?? item.title ?? '', src: item.picture, size: 32 }) : undefined,
                    end: 'nav',
                    onClick: item.run,
                }));
                const out = [];
                for (const kind of ['place', 'character']) if (found[kind].length) out.push(listGroup({ header: KIND_TITLES[kind], rows: listRows(found[kind]) }));
                if (chatHits.length) out.push(section(KIND_TITLES.chat, chatHits.map(row)));
                for (const kind of ['lorebook', 'setting']) if (found[kind].length) out.push(listGroup({ header: KIND_TITLES[kind], rows: listRows(found[kind]) }));
                if (out.length) return out;
                if (!index || chats === null) return [h('p', { class: 'pt-chats-note', text: 'Searching…' })];
                return [emptyState({ icon: 'search', text: 'Nothing matches that.' })];
            };

            const draw = () => results.replaceChildren(...(query ? searchResults() : chatList()));
            actions.recentChats().then(list => {
                chats = list;
                cached = list;
                if (results.isConnected) draw();
            });
            draw();
        },
    };
}
