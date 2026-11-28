// The Chats home (DESIGN.md → Chats): the Chats page's recent and pinned chats, its search over everything
// (chats, characters, lorebooks, settings), SillyTavern's welcome screen kept in step, and opening a chat from there.
// The page itself is src/views/chats.js; this file feeds it from SillyTavern.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { currentShell } from './app-shell.js';
import { refreshOwnPage } from './page.js';
import { activeTabs, closePages, currentPageId, drawerById, extensionDrawers, openPage, pageInfo } from './pages.js';
import { openChatRowMenu } from '../st/chat-history.js';
import { CHAT, LOREBOOK_PICKER, WELCOME_RECENT_CHATS } from '../st/selectors.js';
import { openLorebook } from '../st/lorebooks.js';
import { revealSetting, SEARCH_PAGES, settingItems } from '../st/settings.js';
import { chatsWelcome } from '../views/chats.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'chats home';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, icon: Function, isWide: () => boolean, motionAllowed: () => boolean, renameCurrentChat: Function } | null} */
let deps = null;

export function setupChatsHome(supplied) {
    deps = supplied;
}

export async function lorebookNames() {
    try {
        const module = await import('/scripts/world-info.js');
        return Array.isArray(module.world_names) ? module.world_names : [];
    } catch {
        return Array.from(document.querySelectorAll(`${LOREBOOK_PICKER} option`)).map(option => option.textContent.trim()).filter(Boolean);
    }
}

export function allSettingItems() {
    const items = [];
    for (const pageId of SEARCH_PAGES) {
        const root = document.querySelector(`#${pageId} > .drawer-content`);
        if (!root) continue;
        const page = t(pageInfo(drawerById(pageId)).title);
        for (const item of settingItems(root)) items.push({ ...item, pageId, page });
    }
    return items;
}

export async function openChatFile(chat) {
    const context = deps.context();
    const file = String(chat.file_name ?? '').replace(/\.jsonl$/, '');
    if (isOpenChat(chat)) {
        if (!keepChatsPanel()) closePages();
        return;
    }
    if (!keepChatsPanel()) closePages();
    if (chat.group) {
        await context.openGroupChat?.(chat.group, file);
        return;
    }
    const id = context.characters.findIndex(character => character.avatar === chat.avatar);
    if (id === -1) return;
    await context.selectCharacterById(id);
    if (context.getCurrentChatId?.() !== file) await deps.context().openCharacterChat?.(file);
}

export const chatsHome = { observer: null, timer: 0, empty: null, pinned: null, noChat: null, homeTimer: 0, startUntil: Date.now() + 20000, welcome: null, version: '' };

/**
 * The first seconds after SillyTavern is ready: it may reopen its locked Characters panel, which Pocket
 * Tavern closes again. html.pt-starting keeps that panel invisible meanwhile (styles/st/chat.css), so it
 * never flashes. Ends after 4 s, or as soon as you pick a place yourself.
 */
export function endStartWindow() {
    chatsHome.startUntil = 0;
    document.documentElement.classList.remove('pt-starting');
}

/** SillyTavern's Assistant (its start screen's) and its version text, for the Chats page and the welcome. */
export function loadStartModules() {
    import('/scripts/welcome-screen.js').then(module => { chatsHome.welcome = module; }).catch(() => {});
    import('/script.js').then(module => { chatsHome.version = String(module.displayVersion ?? ''); }).catch(() => {});
}

/** The Assistant row: SillyTavern's own permanent Assistant chat (it creates the Assistant if needed). */
export function assistantEntry() {
    const module = chatsHome.welcome;
    if (typeof module?.openPermanentAssistantChat !== 'function') return null;
    const avatarFile = module.getPermanentAssistantAvatar?.();
    const exists = avatarFile && deps.context().characters?.some(character => character.avatar === avatarFile);
    return {
        picture: exists ? `/thumbnail?type=avatar&file=${encodeURIComponent(avatarFile)}` : 'img/logo.png',
        open: () => {
            if (!keepChatsPanel()) closePages();
            module.openPermanentAssistantChat();
        },
    };
}

/** Opens this chat (unless it is open), then runs `run` once SillyTavern has switched to it. */
export function afterOpening(chat, run) {
    if (isOpenChat(chat)) {
        run();
        return;
    }
    const context = deps.context();
    const changed = context.eventTypes?.CHAT_CHANGED;
    let done = false;
    const once = safe(SOURCE, () => {
        if (done) return;
        done = true;
        if (changed) context.eventSource?.removeListener?.(changed, once);
        setTimeout(safe(SOURCE, run), 150);
    });
    if (changed) context.eventSource?.on?.(changed, once);
    openChatFile(chat);
    // In case the event never comes.
    setTimeout(once, 2500);
}

/** SillyTavern's pinned chats (its start screen keeps them in account storage): read only. */
async function loadPinnedChats() {
    try {
        const { accountStorage } = await import('/scripts/util/AccountStorage.js');
        const state = JSON.parse(accountStorage.getItem('pinnedChats') || '{}');
        chatsHome.pinned = state && typeof state === 'object' ? Object.values(state) : [];
    } catch {
        chatsHome.pinned = [];
    }
    return chatsHome.pinned;
}

const sameChat = (a, b) => a.file_name === b.file_name && ((a.group && String(a.group) === String(b.group)) || (!a.group && a.avatar === b.avatar));

export function isPinnedChat(chat) {
    return (chatsHome.pinned ?? []).some(pin => sameChat(pin, chat));
}

/** Recent chats, pinned first (SillyTavern's own endpoint, as its start screen asks for them). */
export async function recentChatsForHome() {
    const pinned = await loadPinnedChats();
    try {
        const response = await fetch('/api/chats/recent', {
            method: 'POST',
            headers: deps.context().getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max: 200, pinned }),
            cache: 'no-cache',
        });
        const list = response.ok ? await response.json() : [];
        const context = deps.context();
        // Like the start screen: only chats whose character or group still exists.
        return (Array.isArray(list) ? list : []).filter(chat => (chat.group
            ? context.groups?.some(group => String(group.id) === String(chat.group))
            : context.characters?.some(character => character.avatar === chat.avatar)));
    } catch {
        return [];
    }
}

export function chatOwner(chat) {
    const context = deps.context();
    if (chat.group) return { name: context.groups?.find(group => String(group.id) === String(chat.group))?.name ?? t('Group chat') };
    const character = context.characters?.find(item => item.avatar === chat.avatar);
    return { name: character?.name ?? '', picture: chat.avatar ? `/thumbnail?type=avatar&file=${encodeURIComponent(chat.avatar)}` : undefined };
}

function chatFileId(chat) {
    return String(chat.file_name ?? '').replace(/\.jsonl$/, '');
}

export function isOpenChat(chat) {
    const context = deps.context();
    if (context.getCurrentChatId?.() !== chatFileId(chat)) return false;
    if (chat.group) return String(context.groupId) === String(chat.group);
    return context.characters?.[context.characterId]?.avatar === chat.avatar;
}

/**
 * Opening a chat from the Chats page keeps the page: on desktop it stays in the panel beside the chat;
 * on a phone it makes way once the chat has opened (syncChatsHome), so nothing flashes in between.
 */
export function keepChatsPanel() {
    return currentPageId() === 'pt-chats';
}

/** SillyTavern's own start-screen row for a chat, when its start screen is drawn (no chat open). */
function startScreenRow(chat) {
    const file = chatFileId(chat);
    return [...document.querySelectorAll(WELCOME_RECENT_CHATS)].find(row => row.dataset.file === file
        && (chat.group ? row.dataset.group === String(chat.group) : row.dataset.avatar === chat.avatar)) ?? null;
}

/**
 * A chat row's ⋯: New chat and All chats with its character, then Pin and Rename, which run SillyTavern's own start-screen buttons (there while no chat is
 * open), the open chat is renamed with SillyTavern's renameChat, and a chat that is not open is
 * deleted with SillyTavern's confirm and its own delete. The open chat is deleted from its own
 * ⋯ → Chat files, so the chat on screen never outlives its file.
 */
export function openHomeChatMenu(chat, anchor) {
    const row = startScreenRow(chat);
    const open = isOpenChat(chat);
    const press = selector => () => row?.querySelector(selector)?.click();
    openChatRowMenu(chat.file_name, [
        { icon: 'plus', label: 'New chat', run: () => afterOpening(chat, () => document.getElementById('option_start_new_chat')?.click()) },
        { icon: 'history', label: 'All chats', run: () => afterOpening(chat, () => document.getElementById('option_select_chat')?.click()) },
        row ? { icon: 'bookmark', label: isPinnedChat(chat) ? 'Unpin' : 'Pin', run: press('.pinChat') } : null,
        open ? { icon: 'pencil', label: 'Rename', run: () => deps.renameCurrentChat() } : (row ? { icon: 'pencil', label: 'Rename', run: press('.renameChat') } : null),
        open ? null : { icon: 'trash', label: 'Delete', danger: true, run: () => (row ? press('.deleteChat')() : deleteChatFile(chat)) },
    ], anchor);
}

/** Deletes a chat that is not open: SillyTavern's own question, then its own delete function. */
async function deleteChatFile(chat) {
    const context = deps.context();
    const ok = await context.callGenericPopup?.(t('Delete this chat? This cannot be undone.'), context.POPUP_TYPE?.CONFIRM ?? 2);
    if (!ok || isOpenChat(chat)) return;
    try {
        if (chat.group) {
            await (await import('/scripts/group-chats.js')).deleteGroupChatByName(String(chat.group), chatFileId(chat));
        } else {
            const id = context.characters.findIndex(character => character.avatar === chat.avatar);
            if (id === -1) return;
            await (await import('/script.js')).deleteCharacterChatByName(String(id), chatFileId(chat));
        }
    } finally {
        refreshChatsHome();
    }
}

/** Everything else Search everything finds: the places, characters and groups, lorebooks, settings. */
export async function searchIndexForHome() {
    const context = deps.context();
    const tabs = activeTabs();
    const places = [
        ...tabs.map(tab => ({ kind: 'place', title: tab.label, icon: tab.icon, text: `${tab.label} ${t(tab.label)}`, run: () => currentShell()?.onTab(tab.id) })),
        ...(!deps.settings().extensionsTab ? [{ kind: 'place', title: 'Extensions', icon: 'puzzle', text: `Extensions ${t('Extensions')}`, run: () => openPage('extensions-settings-button') }] : []),
        { kind: 'place', title: 'API', icon: 'plug', text: `API Connection ${t('API')} ${t('Connection settings')}`, run: () => openPage('sys-settings-button') },
        { kind: 'place', title: 'Appearance', icon: 'palette', text: `Appearance Themes ${t('Appearance')} ${t('Themes')}`, run: () => openPage('pt-appearance') },
        { kind: 'place', title: 'Personas', icon: 'smile', text: `Personas ${t('Personas')}`, run: () => openPage('persona-management-button') },
        { kind: 'place', title: 'Pocket Tavern', icon: 'sliders', text: 'Pocket Tavern', run: () => openPage('pt-pocket') },
        ...extensionDrawers().map(drawer => ({ kind: 'place', rawTitle: drawer.title, subtitle: 'Extensions', icon: 'puzzle', text: `${drawer.title} Extensions ${t('Extensions')}`, run: () => openPage(drawer.id) })),
    ];
    const characters = (context.characters ?? []).map((character, id) => ({
        kind: 'character',
        rawTitle: character.name,
        picture: character.avatar && character.avatar !== 'none' ? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}` : '',
        text: `${character.name} ${character.tags?.join?.(' ') ?? ''}`,
        run: async () => {
            if (!keepChatsPanel()) closePages();
            await deps.context().selectCharacterById(id);
        },
    }));
    const groups = (context.groups ?? []).map(group => ({
        kind: 'character',
        rawTitle: group.name,
        subtitle: 'Group chat',
        icon: 'users',
        text: group.name,
        run: async () => {
            if (!keepChatsPanel()) closePages();
            await deps.context().openGroupChat?.(group.id);
        },
    }));
    const lorebooks = (await lorebookNames()).map(name => ({ kind: 'lorebook', rawTitle: name, icon: 'book', text: name, run: () => openLorebook(name) }));
    const found = allSettingItems().map(item => ({
        kind: 'setting',
        rawTitle: item.label,
        subtitle: [item.page, item.section].filter(Boolean).join(' › '),
        icon: 'settings',
        text: `${item.label} ${item.section} ${item.page}`,
        run: () => {
            openPage(item.pageId);
            setTimeout(safe(SOURCE, () => revealSetting(item.row)), 350);
        },
    }));
    return [...places, ...characters, ...groups, ...lorebooks, ...found];
}

/** The Chats page drawn again (the open chat changed, a chat was renamed, pinned or deleted). */
export function refreshChatsHome() {
    window.clearTimeout(chatsHome.timer);
    chatsHome.timer = window.setTimeout(safe(SOURCE, () => {
        chatsHome.timer = 0;
        if (deps.active() && currentPageId() === 'pt-chats') refreshOwnPage();
    }), 150);
}

/** Desktop's chat column while no chat is open: SillyTavern's logo and the ways in (src/views/chats.js). */
export function syncChatsWelcome() {
    const want = deps.active() && deps.settings().appShell && deps.isWide() && deps.context().getCurrentChatId?.() === undefined;
    if (!want) {
        chatsHome.empty?.remove();
        chatsHome.empty = null;
        return;
    }
    const assistant = assistantEntry();
    const listOpen = currentPageId() === 'pt-chats';
    const key = `${!!assistant}|${listOpen}|${chatsHome.version}`;
    if (chatsHome.empty?.isConnected && chatsHome.empty.dataset.key === key) return;
    const next = h('div', { id: 'pt-no-chat', class: 'pt-no-chat-empty', 'data-key': key }, [chatsWelcome({
        version: chatsHome.version,
        assistant: assistant?.open ?? null,
        showChats: listOpen ? null : () => openPage('pt-chats'),
        chooseCharacter: () => currentShell()?.onTab('rightNavHolder'),
    })]);
    if (chatsHome.empty?.isConnected) chatsHome.empty.replaceWith(next);
    else document.body.append(next);
    chatsHome.empty = next;
}

/** The chat that just opened fades in (styles/views/chats.css), instead of appearing all at once. */
export function fadeInChat() {
    const chat = document.querySelector(CHAT);
    if (!deps.active() || !chat || deps.context().getCurrentChatId?.() === undefined || !deps.motionAllowed()) return;
    chat.classList.remove('pt-chat-enter');
    // Restart the animation: the class comes back on the next frame.
    requestAnimationFrame(safe(SOURCE, () => {
        chat.classList.add('pt-chat-enter');
        chat.addEventListener('animationend', safe(SOURCE, () => chat.classList.remove('pt-chat-enter')), { once: true });
    }));
}

/**
 * On a phone with no chat open, the Chats page is the screen under every other: when the last page
 * closes (Back from Characters, say), Chats shows instead of an empty chat area. Checked a moment
 * later, so switching straight from one page to another never passes through it.
 */
export function ensurePhoneHome() {
    window.clearTimeout(chatsHome.homeTimer);
    chatsHome.homeTimer = window.setTimeout(safe(SOURCE, () => {
        chatsHome.homeTimer = 0;
        if (deps.active() && deps.settings().appShell && !deps.isWide() && !currentPageId() && deps.context().getCurrentChatId?.() === undefined) openPage('pt-chats');
    }), 120);
}

/** Ctrl/⌘ K: the Chats page with its search field focused. */
export function focusChatsSearch() {
    if (currentPageId() !== 'pt-chats') openPage('pt-chats');
    requestAnimationFrame(safe(SOURCE, () => document.querySelector('#pt-page .pt-chats-search input')?.focus()));
}

/**
 * With no chat open: the Chats page is what you see (a phone shows it as the place's screen, desktop
 * in the panel), SillyTavern's start screen and the message box step aside, and desktop's chat column
 * says where chats come from. SillyTavern still draws its start screen underneath; its buttons do the
 * pinning and renaming.
 */
export function syncChatsHome() {
    const root = document.documentElement;
    const on = deps.active() && deps.settings().appShell;
    const chat = document.querySelector(CHAT);
    root.classList.toggle('pt-starting', on && Date.now() < chatsHome.startUntil);
    if (!on) {
        chatsHome.noChat = null;
        window.clearTimeout(chatsHome.homeTimer);
        chatsHome.homeTimer = 0;
        root.classList.remove('pt-no-chat');
        document.querySelector(CHAT)?.classList.remove('pt-chat-enter');
        chatsHome.observer?.disconnect();
        chatsHome.observer = null;
        chatsHome.empty?.remove();
        chatsHome.empty = null;
        window.clearTimeout(chatsHome.timer);
        chatsHome.timer = 0;
        return;
    }
    if (chat && !chatsHome.observer) {
        // SillyTavern draws its start screen again after a pin, rename or delete there.
        chatsHome.observer = new MutationObserver(safe(SOURCE, records => {
            if (records.some(record => [...record.addedNodes].some(node => node.classList?.contains('welcomePanel')))) refreshChatsHome();
        }));
        chatsHome.observer.observe(chat, { childList: true });
    }
    const noChat = deps.context().getCurrentChatId?.() === undefined;
    root.classList.toggle('pt-no-chat', noChat);
    syncChatsWelcome();
    // At start with no chat, Chats comes first, even where SillyTavern reopens its Characters panel a
    // moment later because its panel lock was on (panel locks mean nothing in Pocket Tavern).
    const starting = Date.now() < chatsHome.startUntil;
    // Only when the chat has just closed (or at start): a list you hid yourself stays hidden.
    const justClosed = noChat && chatsHome.noChat !== true;
    chatsHome.noChat = noChat;
    if (noChat && (justClosed || starting) && (!currentPageId() || (starting && currentPageId() === 'rightNavHolder'))) openPage('pt-chats');
    // On a phone a chat that opens (from anywhere) takes the screen; desktop keeps the list beside it.
    else if (!noChat && !deps.isWide() && currentPageId() === 'pt-chats') closePages();
    else refreshChatsHome();
}
