// The Chats place (DESIGN.md → Key screens → Chats (home)): Search everything at the top, quick picks, then
// pinned chats and recent chats under date headers. With search text, results are grouped by kind: Places, Characters,
// Chats, Lorebooks, Settings. On a phone it is the place's own screen; on desktop it fills the panel
// beside the chat. Every action comes from the shell, which runs SillyTavern's own functions.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { avatar } from '../ui/avatar.js';
import { chatRow } from '../ui/chat-row.js';
import { button } from '../ui/button.js';
import { emptyState } from '../ui/feedback.js';
import { svgIcon } from '../ui/icons.js';
import { pick, pickRow } from '../ui/picks.js';
import { searchBox } from '../ui/field.js';
import { listGroup, listRow } from '../ui/list.js';

/** Characters (or groups) shown before "Show all chats". */
const FIRST_GROUPS = 30;
/** People in the quick picks after the Assistant. */
const QUICK_PICKS = 10;
const LIMITS = { place: 5, character: 12, chat: 12, lorebook: 8, setting: 12 };
const KIND_TITLES = { place: 'Places', character: 'Characters', chat: 'Chats', lorebook: 'Lorebooks', setting: 'Settings' };

const normalize = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();


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
 * @param {(chat: RecentChat) => void} actions.showCharacter the character's page, without opening the chat
 * @param {(chat: RecentChat, button: HTMLElement) => void} actions.chatMenu
 * @param {() => Promise<SearchItem[]>} actions.searchIndex everything else Search everything finds
 * @param {() => void} actions.chooseCharacter
 * @param {{ picture: string, open: () => void } | null} actions.assistant SillyTavern's Assistant, when it has one
 * @param {{ newChat: (chat: RecentChat) => void, allChats: (chat: RecentChat) => void, character: ((chat: RecentChat) => void) | null }} actions.withOwner
 *        what to do with the character (or group) of a chat
 * @returns {import('../shell/page.js').PageSpec}
 */
export function chatsPage(actions) {
    // Kept while the page is drawn again (a chat opened beside it on desktop), so the search stays.
    let query = '';
    let showAll = false;
    /** Whose list of chats is open, by owner key; remembered while the app stays open. */
    const openGroups = new Set();
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
                    // The picture opens their page; the rest of the row opens the chat.
                    onPicture: chat.group ? null : () => actions.showCharacter(chat),
                });
            };
            const section = (title, rows) => h('section', { class: 'pt-chats-section' }, [h('div', { class: 'pt-list-header', text: title }), h('div', { class: 'pt-chats-rows' }, rows)]);
            const ownerKey = chat => (chat.group ? `g:${chat.group}` : `c:${chat.avatar}`);

            /**
             * One character's (or group's) recent chats: the latest as a row, and when there are more, a
             * dropdown with New chat, All chats and the character, then every other recent chat with them.
             */
            const groupCard = chats => {
                const latest = chats[0];
                // Only one chat with them: just the row (its ⋯ has New chat and All chats).
                if (chats.length === 1) return row(latest);
                const key = ownerKey(latest);
                const card = h('div', { class: 'pt-chat-group-card' }, [row(latest)]);
                const action = (icon, label, run) => h('button', { type: 'button', class: 'pt-chat-group-action pt-focus pt-press', onclick: () => run(latest) }, [svgIcon(icon), h('span', { text: label })]);
                const panel = h('div', { class: 'pt-chat-group-panel' }, [
                    h('div', { class: 'pt-chat-group-actions' }, [
                        action('plus', 'New chat', actions.withOwner.newChat),
                        action('history', 'All chats', actions.withOwner.allChats),
                        actions.withOwner.character && !latest.group ? action('user', 'Character', actions.withOwner.character) : null,
                    ]),
                    ...chats.slice(1).map(row),
                ]);
                const name = actions.owner(latest).name;
                const toggle = h('button', { type: 'button', class: 'pt-chat-group-toggle pt-focus' }, [
                    h('span', { class: 'pt-chat-group-count', raw: chats.length === 2 ? t('1 more chat') : t('{count} more chats', { count: chats.length - 1 }) }),
                    svgIcon('chevron-down', 'pt-chat-group-chevron'),
                ]);
                toggle.setAttribute('aria-label', `${toggle.textContent} · ${name}`);
                const setOpen = open => {
                    card.classList.toggle('pt-chat-group-card--open', open);
                    toggle.setAttribute('aria-expanded', String(open));
                    if (open) openGroups.add(key);
                    else openGroups.delete(key);
                };
                toggle.addEventListener('click', () => setOpen(!card.classList.contains('pt-chat-group-card--open')));
                card.append(toggle, panel);
                setOpen(openGroups.has(key));
                return card;
            };

            /**
             * Quick picks (DESIGN.md → Chats (home)): the Assistant, then the characters and groups chatted with
             * most recently, as pictures with names that scroll sideways. Tapping one opens their latest chat.
             */
            const quickPicks = groups => {
                const picks = [];
                if (actions.assistant) {
                    picks.push(pick({ name: t('Assistant'), picture: actions.assistant.picture, label: t('Ask the Assistant'), onClick: actions.assistant.open }));
                }
                // The Assistant's own chat is already the first pick.
                const people = groups.filter(chats => !actions.assistant || actions.owner(chats[0]).picture !== actions.assistant.picture);
                for (const chats of people.slice(0, QUICK_PICKS)) {
                    const latest = chats[0];
                    const who = actions.owner(latest);
                    // A character's pick opens their page; a group has none, so its pick opens the chat.
                    picks.push(latest.group
                        ? pick({ name: who.name, picture: who.picture, label: t('Open the latest chat with {name}', { name: who.name }), onClick: () => actions.openChat(latest), open: actions.isOpen(latest) })
                        : pick({ name: who.name, picture: who.picture, label: t('Open the page of {name}', { name: who.name }), onClick: () => actions.showCharacter(latest), open: actions.isOpen(latest) }));
                }
                if (!picks.length) return null;
                return pickRow(picks, t('Quick picks'));
            };

            /** Today, Yesterday, Earlier this week or Older, from when a chat was last written to. */
            const dayBucket = time => {
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                const at = Number(time) || 0;
                if (at >= today) return 'Today';
                if (at >= today - 86400000) return 'Yesterday';
                if (at >= today - 6 * 86400000) return 'Earlier this week';
                return 'Older';
            };

            const chatList = () => {
                if (chats === null) return [h('p', { class: 'pt-chats-note', text: 'Loading chats…' })];
                if (!chats.length) return [quickPicks([]), emptyState({ icon: 'chats', text: 'No chats yet', action: { label: 'Choose a character', onClick: actions.chooseCharacter } })].filter(Boolean);
                const pinned = chats.filter(actions.isPinned);
                // The rest grouped by character (or group chat), newest first: one card each.
                const groups = new Map();
                for (const chat of chats.filter(item => !actions.isPinned(item))) {
                    const key = ownerKey(chat);
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(chat);
                }
                const all = [...groups.values()];
                const shown = showAll ? all : all.slice(0, FIRST_GROUPS);
                const out = [quickPicks(all)].filter(Boolean);
                if (pinned.length) out.push(section('Pinned', pinned.map(row)));
                // Recent, under date headers (cards stay newest first).
                const buckets = new Map();
                for (const chats of shown) {
                    const bucket = dayBucket(chats[0].last_mes);
                    if (!buckets.has(bucket)) buckets.set(bucket, []);
                    buckets.get(bucket).push(chats);
                }
                for (const [bucket, list] of buckets) out.push(section(bucket, list.map(groupCard)));
                if (shown.length < all.length) {
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

/**
 * Desktop's chat column while no chat is open: SillyTavern's logo, its version, and the ways in:
 * ask the Assistant, show the chats, choose a character.
 * @param {object} actions
 * @param {string} actions.version e.g. "SillyTavern 1.13.2" (SillyTavern's own text, shown as it is)
 * @param {(() => void) | null} actions.assistant
 * @param {(() => void) | null} actions.showChats when the list is not already in the panel
 * @param {() => void} actions.chooseCharacter
 */
export function chatsWelcome({ version, assistant, showChats, chooseCharacter }) {
    return h('div', { class: 'pt-welcome' }, [
        h('img', { class: 'pt-welcome-logo', src: 'img/logo.png', alt: '' }),
        h('div', { class: 'pt-welcome-title', role: 'heading', 'aria-level': '2', text: 'Welcome back' }),
        h('div', { class: 'pt-welcome-version', raw: version }),
        h('p', { class: 'pt-welcome-text', text: assistant ? 'Pick up a chat, start one with a character, or ask the Assistant.' : 'Pick up a chat, or start one with a character.' }),
        h('div', { class: 'pt-welcome-actions' }, [
            assistant ? button({ label: 'Ask the Assistant', kind: 'primary', icon: 'sparkles', onClick: assistant }) : null,
            showChats ? button({ label: 'Show chats', icon: 'chats', onClick: showChats }) : null,
            button({ label: 'Choose a character', icon: 'users', onClick: chooseCharacter }),
        ]),
    ]);
}
