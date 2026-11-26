// SillyTavern's Characters screens while Pocket Tavern is on (DESIGN.md → Cards → Character card, Key screens →
// Character page and editor): the list as picture cards with labelled tools
// strip; a character's page before their chat; their card in the editor (tabs, Chat and Recent chats, Export)
// without opening their chat. SillyTavern's own nodes are marked, restyled (styles/st/characters.css) and
// pressed, never moved. The page itself is src/views/character.js.
// Moved here whole from the legacy app (M3); its listeners are still registered by the legacy app, so errors
// in them are caught by the lifecycle's page-wide net (src/core/lifecycle.js) like the rest of the legacy code.
import { h } from '../core/dom.js';
import { shieldFromDrawerAutoClose } from './drawers.js';
import { t } from '../core/i18n.js';
import { refreshOwnPage } from '../shell/page.js';
import { chatTitleNode, messageCount, previewBubble } from '../ui/chat-row.js';
import { START_NEW_CHAT } from './selectors.js';
import { openFilterSheet, removeListTop, setupCharacterList, startBulkSelect, syncFilterBar, syncListTop, unwatchCardMenu, watchCardMenu } from './character-list.js';
import { listGroup, listRow } from '../ui/list.js';

const LOG = '[Pocket Tavern]';

/**
 * What the legacy app hands over (set once by setupCharacters()).
 * @type {Record<string, Function> | null}
 */
let deps = null;

export function setupCharacters(supplied) {
    deps = supplied;
    setupCharacterList({
        context: () => deps.context(),
        showSheet: instance => deps.showSheet(instance),
        closeSheet: immediate => deps.closeSheet(immediate),
        menuSheet: options => new MenuSheet(options),
        openCharacterPage: chid => openCharacterPage(chid),
        cardMenu: (chid, anchor) => openCardMenu(chid, anchor),
        closePages: () => deps.closePages(),
    });
}

const ctx = () => deps.context();
const isWide = () => deps.isWide();
const icon = (...args) => deps.icon(...args);
const ui = (...args) => deps.ui(...args);
const normalizeText = text => deps.normalizeText(text);
const wireOnce = (...args) => deps.wireOnce(...args);
const showSheet = instance => deps.showSheet(instance);
const closeSheet = immediate => deps.closeSheet(immediate);
const isShown = element => deps.isShown(element);
const currentPageId = () => deps.currentPageId();
const openPage = id => deps.openPage(id);
const closePages = () => deps.closePages();
const buzz = ms => deps.buzz(ms);
const openChoiceSheet = (...args) => deps.openChoiceSheet(...args);
const pickFromSelect = (...args) => deps.pickFromSelect(...args);
const isConnected = () => deps.isConnected();
/** The legacy app's sheet class, made through it. */
function MenuSheet(options) {
    return new deps.MenuSheet(options);
}

// -- characters page: labeled card tools, tabs, the list's toolbar

const CARD_TOOLS = [
    ['#favorite_button', 'Favorite'],
    ['#advanced_div', 'Advanced'],
    ['#world_button', 'Lore'],
    ['.chat_lorebook_button', 'Chat lore'],
    ['#char_connections_button', 'Personas'],
    ['#export_button', 'Export'],
    ['#dupe_button', 'Duplicate'],
    ['#delete_button', 'Delete'],
    ['#create_button_label', 'Create'],
];
// DESIGN.md → Character editor: Description, Greetings, Details. SillyTavern's Advanced definitions (personality,
// scenario, examples, prompt overrides) stay in its own popup, opened by the labelled Advanced button.
const CARD_TABS = [['desc', 'Description'], ['greet', 'Greetings'], ['notes', 'Details']];
const chars = { listObserver: null, listTimer: 0, tab: 'desc', passTap: false, peek: null };

/**
 * Export on a character card: SillyTavern opens a tiny PNG / JSON list next to the button, which
 * on the card's tool grid overlapped the buttons around it (Kahvana's feedback). It is a sheet
 * (a dialog on a computer) instead; picking a format clicks SillyTavern's own choice.
 */
export function onExportClick(event) {
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().charPage) return;
    if (!event.target.closest?.('#export_button')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pick = format => {
        closeSheet(true);
        if (peekedChid() !== null) {
            exportCardCharacter(format);
            return;
        }
        document.querySelector(`#export_format_popup .export_format[data-format="${format}"]`)?.click();
    };
    const row = (format, iconName, note) => h('button', { type: 'button', class: 'pt-menu-row', onclick: () => pick(format) }, [
        ui(iconName, 'pt-menu-row-icon'),
        h('span', { class: 'pt-row-text' }, [h('span', { raw: format.toUpperCase() }), h('small', { text: note })]),
    ]);
    showSheet(new MenuSheet({
        title: t('Export character'),
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, [
            row('png', 'image', 'A picture card with everything inside. Most apps can open it.'),
            row('json', 'file-text', "The character's details as a text file."),
        ])),
    }));
}

// -- characters page: a character's sheet before its chat

/**
 * Tapping a character in the list opens their page (src/views/character.js): pushed over the list on a
 * phone, in the panel on a computer. Nothing changes until you pick something. Groups, bulk select and
 * the favourite star keep SillyTavern's own behaviour.
 */
export function onCharacterTap(event) {
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().charPage || !deps.settings().charPreview || chars.passTap) return;
    const entry = event.target.closest?.('#rm_print_characters_block .character_select');
    if (!entry || event.target.closest('.ch_fav_icon, .tag, .bulk_select_checkbox')) return;
    if (document.querySelector('#rm_print_characters_block.group_overlay_mode_select')) return;
    const chid = Number(entry.dataset.chid);
    if (!Number.isInteger(chid) || !ctx().characters?.[chid]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(6);
    openCharacterPage(chid);
}

export async function fetchCharacterChats(avatar) {
    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!data || typeof data !== 'object' || data.error) return [];
    return Object.values(data)
        .filter(chat => chat?.file_name)
        .sort((a, b) => (Number(b.last_mes) || 0) - (Number(a.last_mes) || 0));
}

/** Runs `then` once SillyTavern has switched chats (or after a while, if it never says so). */
function afterChatChange(then) {
    const context = ctx();
    const eventName = context.eventTypes?.CHAT_CHANGED;
    let done = false;
    const once = () => {
        if (done) return;
        done = true;
        if (eventName) context.eventSource?.removeListener?.(eventName, once);
        setTimeout(then, 150);
    };
    if (eventName) context.eventSource?.on?.(eventName, once);
    setTimeout(once, 2500);
}

/**
 * Edit a character's card without opening their chat. The card is SillyTavern's own form, filled
 * the way SillyTavern fills it for a group member it shows without their chat
 * (select_selected_character); the chat you are in, and SillyTavern's current character, stay as
 * they are. Fields, the picture, Favorite, Advanced and alternate greetings save to this
 * character (SillyTavern saves the form). Export downloads this character's file. The buttons
 * that in SillyTavern act on the character whose chat is open (Delete, Duplicate, Lore, Chat lore,
 * Personas, tags, Ext. Media, More…) open their chat first, then do their job: only those, and
 * Chat, open it.
 */
export async function editCharacter(chid) {
    closeSheet(true);
    if (deps.shell()) deps.shell().jumpAt = 0;
    const context = ctx();
    endCardPeek();
    if (!context.groupId && context.characterId !== undefined && String(context.characterId) === String(chid)) {
        await context.selectCharacterById(String(chid));
        return;
    }
    try {
        const st = await import('/script.js');
        if (typeof st.select_selected_character !== 'function') throw new Error('select_selected_character is missing');
        await st.unshallowCharacter?.(chid);
        st.select_selected_character(chid);
        const tags = await import('/scripts/tags.js').catch(() => null);
        tags?.applyTagsOnCharacterSelect?.(chid);
        chars.peek = { chid: String(chid), avatar: context.characters[chid]?.avatar };
        document.documentElement.classList.add('pt-card-peek');
        syncCharacterPage();
        deps.shell()?.update();
    } catch (error) {
        // An older or newer SillyTavern without these: open the card the usual way.
        console.warn(LOG, 'Could not open the card on its own', error);
        endCardPeek();
        await context.selectCharacterById(String(chid));
    }
}

/** The character whose card is open without their chat, or null. Checked live, never trusted. */
export function peekedChid() {
    const peek = chars.peek;
    if (!peek) return null;
    const context = ctx();
    const character = context.characters?.[peek.chid];
    const shownAvatar = document.getElementById('avatar_url_pole')?.value;
    if (!character || character.avatar !== peek.avatar || shownAvatar !== peek.avatar) return null;
    if (!context.groupId && String(context.characterId) === peek.chid) return null;
    return peek.chid;
}

/**
 * Ends the card-only view. SillyTavern's form is put back on the character whose chat is open,
 * so nothing can act on the wrong character afterwards (with Pocket Tavern off, too).
 */
export function endCardPeek() {
    const had = !!chars.peek;
    chars.peek = null;
    document.documentElement.classList.remove('pt-card-peek');
    if (!had) return;
    const context = ctx();
    if (context.groupId || context.characterId === undefined) return;
    import('/script.js').then(st => st.select_selected_character?.(context.characterId, { switchMenu: false })).catch(() => {});
}

/** Called as pages change: leaving the card (or another card opening) ends the card-only view. */
export function checkCardPeek() {
    if (!chars.peek) return;
    const editorShown = currentPageId() === 'rightNavHolder' && isShown(document.getElementById('rm_ch_create_block'));
    if (!editorShown || !peekedChid()) endCardPeek();
}

/** Opens this character's chat (the list tap: on a phone the page closes into it unless asked not to). */
export function openCharacterChatFor(chid, { stay = false, fileId = null, then = null } = {}) {
    const context = ctx();
    endCardPeek();
    if (deps.shell()) deps.shell().jumpAt = stay || isWide() ? 0 : Date.now();
    const finish = async () => {
        try {
            if (fileId && ctx().getCurrentChatId?.() !== fileId) await ctx().openCharacterChat(fileId);
        } catch (error) {
            console.warn(LOG, 'Could not open that chat', error);
        }
        if (!stay && !isWide()) closePages();
        then?.();
    };
    if (!context.groupId && String(context.characterId) === String(chid)) {
        finish();
        return;
    }
    afterChatChange(finish);
    context.selectCharacterById(String(chid));
}

/** Card controls that still need the character's chat open (SillyTavern reads them from the open chat). */
const CARD_NEEDS_CHAT = '#delete_button, #dupe_button, #world_button, .chat_lorebook_button, #char_connections_button, #tagInput, #character_open_media_overrides, #char-management-dropdown';

/** On the card-only view, a button that needs the chat opens it, then does its job. */
export function onCardPeekPress(event) {
    if (!deps.active() || !chars.peek) return;
    const target = event.target.closest?.(CARD_NEEDS_CHAT);
    if (!target || !target.closest('#rm_ch_create_block')) return;
    const chid = peekedChid();
    if (chid === null) return;
    // A dropdown opens (and a text box takes the focus) on the press, before any click: those are
    // caught on pointerdown, buttons on click.
    const isSelect = target.matches('select, input');
    event.preventDefault();
    event.stopImmediatePropagation();
    if ((event.type === 'pointerdown') !== isSelect) return;
    // These work on this character directly, through SillyTavern's own functions, so its chat stays shut.
    if (target.matches(PEEK_DIRECT)) {
        actOnCharacter(target.matches('#dupe_button') ? 'duplicate' : target.matches('#delete_button') ? 'delete' : 'lorebook', chid);
        return;
    }
    const name = ctx().characters[chid]?.name ?? '';
    globalThis.toastr?.info(t("This needs {name}'s chat, so it is open now.", { name }), '', { timeOut: 4000 });
    openCharacterChatFor(chid, {
        stay: true,
        // A dropdown or a text box gets the focus back; a button is pressed again.
        then: () => {
            const again = target.id ? document.getElementById(target.id) : document.querySelector(CARD_NEEDS_CHAT.split(', ').find(selector => target.matches(selector)));
            if (!again) return;
            if (isSelect) again.focus();
            else again.click();
        },
    });
}

/** Card controls that act on the shown character itself, without its chat (DESIGN.md → Character editor). */
const PEEK_DIRECT = '#delete_button, #dupe_button, #world_button';

/**
 * Duplicate, Delete and Lorebook for any character, without opening its chat (the card-only view and the
 * character page's ⋯): SillyTavern's own duplicateCharacter (it asks itself), deleteCharacter (after a
 * question) and writeExtensionField.
 * @param {'duplicate'|'delete'|'lorebook'} what
 */
async function actOnCharacter(what, chid) {
    const context = ctx();
    const character = context.characters?.[chid];
    if (!character) return;
    if (what === 'lorebook') {
        pickPeekedLorebook(chid);
        return;
    }
    const st = await import('/script.js');
    if (what === 'duplicate') {
        await st.duplicateCharacter({ avatar: character.avatar });
        return;
    }
    const sure = await context.callGenericPopup(t('Delete {name}? Their chats are deleted too. This cannot be undone.', { name: character.name }), context.POPUP_TYPE.CONFIRM);
    if (!sure) return;
    endCardPeek();
    await st.deleteCharacter(character.avatar, { deleteChats: true });
    // Back to the list: the character is gone.
    document.getElementById('rm_button_characters')?.click();
    if (currentPageId() === 'pt-character') openPage('rightNavHolder');
}

/** The character's lorebook, picked without opening their chat (the character page's Lorebook row). */
export function pickCharacterLorebook(chid) {
    pickPeekedLorebook(chid);
}

/** ★ for any character, without opening its chat: SillyTavern's own favourite toggle, then its list again. */
export async function favoriteCharacter(chid) {
    const { CharacterContextMenu } = await import('/scripts/BulkEditOverlay.js');
    await CharacterContextMenu.favorite(Number(chid));
    await ctx().getCharacters();
    if (currentPageId() === 'pt-character') refreshOwnPage();
}

/** The character's lorebook, picked from every lorebook and saved on the character (SillyTavern's writeExtensionField). */
async function pickPeekedLorebook(chid) {
    const context = ctx();
    const character = context.characters?.[chid];
    if (!character) return;
    let names = [];
    try {
        names = (await import('/scripts/world-info.js')).world_names ?? [];
    } catch {
        names = [];
    }
    const current = character.data?.extensions?.world ?? '';
    const choose = async name => {
        closeSheet(true);
        await context.writeExtensionField(Number(chid), 'world', name);
        document.getElementById('world_button')?.classList.toggle('world_set', !!name);
        globalThis.toastr?.success(name ? t('{name} now uses this lorebook.', { name: character.name }) : t('{name} has no lorebook now.', { name: character.name }), '', { timeOut: 2500 });
        if (currentPageId() === 'pt-character') refreshOwnPage();
    };
    showSheet(new MenuSheet({
        title: t('Lorebook'),
        subtitle: t('Linked to {name} and exported with the card', { name: character.name }),
        fill: body => body.append(listGroup({ rows: [
            listRow({ title: 'None', icon: current ? 'x' : 'check', end: 'none', onClick: () => choose('') }),
            ...names.map(name => listRow({ rawTitle: name, icon: name === current ? 'check' : 'book', end: 'none', onClick: () => choose(name) })),
        ] })),
    }));
}

/** Export on the card-only view: SillyTavern's export, for this character. */
async function exportCardCharacter(format) {
    const chid = peekedChid();
    return chid === null ? false : exportCharacterFile(chid, format);
}

/** SillyTavern's own export endpoint, for one character: downloads its PNG or JSON. */
async function exportCharacterFile(chid, format) {
    const character = ctx().characters[chid];
    if (!character) return false;
    try {
        const response = await fetch('/api/characters/export', {
            method: 'POST',
            headers: ctx().getRequestHeaders(),
            body: JSON.stringify({ format, avatar_url: character.avatar }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = character.avatar.replace(/\.png$/i, `.${format}`);
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
        console.warn(LOG, 'Export failed', error);
        globalThis.toastr?.error(t('Could not export the character.'));
    }
    return true;
}

/** On the card: New chat (in their chat) and Recent chats (pick one). */
function buildCardGo() {
    const chat = h('button', {
        type: 'button',
        class: 'pt-card-go-btn pt-card-go-chat',
        onclick: () => {
            buzz(6);
            // A new chat: Recent chats (beside it) is the way back into an earlier one.
            const chid = peekedChid() ?? ctx().characterId;
            if (chid !== undefined && chid !== null) openCharacterChatFor(chid, { then: () => document.querySelector(START_NEW_CHAT)?.click() });
        },
    }, [ui('chat-plus'), h('span', { text: 'New chat' })]);
    const recent = h('button', {
        type: 'button',
        class: 'pt-card-go-btn',
        onclick: () => {
            buzz(6);
            openCardChats();
        },
    }, [ui('history'), h('span', { text: 'Recent chats' })]);
    return h('div', { id: 'pt_card_go', class: 'pt-card-go' }, [chat, recent]);
}

/** The card's character's chats, newest first; picking one keeps you in it. */
function openCardChats() {
    const context = ctx();
    const chid = peekedChid() ?? context.characterId;
    const character = context.characters?.[chid];
    if (!character) return;
    const state = { chats: null };
    const instance = new MenuSheet({
        title: 'Recent chats',
        fill: body => {
            if (!state.chats) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'Loading chats…' }));
                return;
            }
            if (!state.chats.length) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'No chats yet.' }));
                return;
            }
            const list = h('div', { class: 'pt-cs-chats' });
            for (const chat of state.chats.slice(0, 20)) {
                const fileId = String(chat.file_id ?? chat.file_name).replace(/\.jsonl$/i, '');
                const when = Number(chat.last_mes) ? new Date(Number(chat.last_mes)).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
                const line = h('span', { class: 'pt-rc-line' }, [chatTitleNode('b', 'pt-rc-title', fileId), h('small', { class: 'pt-rc-when', raw: when })]);
                if (String(ctx().characterId) === String(chid) && ctx().getCurrentChatId?.() === fileId) line.append(h('span', { class: 'pt-rc-now', text: 'Open now' }));
                const meta = h('small', { class: 'pt-rc-meta' });
                const count = Number(chat.chat_items);
                if (Number.isFinite(count)) meta.append(h('span', { text: messageCount(count) }));
                list.append(h('button', {
                    type: 'button',
                    class: 'pt-rc pt-cs-chat',
                    onclick: () => {
                        buzz(6);
                        closeSheet(true);
                        openCharacterChatFor(chid, { fileId });
                    },
                }, [h('span', { class: 'pt-rc-body' }, [line, previewBubble(chat.mes ?? ''), meta])]));
            }
            body.append(list);
        },
    });
    // The character's name is shown as it is.
    instance.subtitle.textContent = character.name;
    showSheet(instance);
    fetchCharacterChats(character.avatar).catch(() => []).then(chats => {
        state.chats = chats;
        if (deps.currentSheet() === instance && !instance.closing) instance.refresh();
    });
}

export function aboutCharacter(character) {
    const context = ctx();
    const raw = character.data?.creator_notes || character.creatorcomment || character.description || '';
    let text = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    try {
        if (text && typeof context.substituteParams === 'function') text = context.substituteParams(text, undefined, character.name);
    } catch {
        // Keep the text as written.
    }
    return text.length > 280 ? `${text.slice(0, 280).trimEnd()}…` : text;
}

/** The character the character page shows (src/views/character.js). */
export const characterTarget = { chid: null };

export function openCharacterPage(chid) {
    characterTarget.chid = String(chid);
    if (currentPageId() === 'pt-character') refreshOwnPage();
    else openPage('pt-character');
}

export function targetCharacter() {
    const chid = characterTarget.chid;
    return chid === null ? null : ctx().characters?.[chid] ?? null;
}

export function isCurrentCharacter(chid) {
    const context = ctx();
    return !context.groupId && context.characterId !== undefined && String(context.characterId) === String(chid);
}

/**
 * A control of SillyTavern's that acts on its *current* character (Delete, Duplicate, Lore, External
 * media, Favorite): for another character, their chat opens first, then the control is pressed, so it
 * can never act on the wrong one (DESIGN.md → Character editor).
 */
export function pressForCharacter(chid, selector) {
    const press = () => document.querySelector(selector)?.click();
    if (isCurrentCharacter(chid)) {
        press();
        return;
    }
    const name = ctx().characters[chid]?.name ?? '';
    globalThis.toastr?.info(t("This needs {name}'s chat, so it is open now.", { name }), '', { timeOut: 4000 });
    openCharacterChatFor(chid, { stay: true, then: press });
}

/** The page's ⋯: Export, Duplicate, Lorebooks, External media, then Delete in red. */
export function openCharacterMenu(anchor) {
    const chid = characterTarget.chid;
    const character = targetCharacter();
    if (!character) return;
    const row = (icon, title, run, danger = false) => {
        const node = listRow({ title, icon, end: 'none', onClick: () => {
            closeSheet(true);
            run();
        } });
        if (danger) node.classList.add('pt-list-row--danger');
        return node;
    };
    const instance = new MenuSheet({
        title: 'Character',
        anchor,
        fill: body => {
            body.append(listGroup({ rows: [
                row('file-export', 'Export', () => openExportSheet(chid)),
                row('copy', 'Duplicate', () => actOnCharacter('duplicate', chid)),
                row('book', 'Lorebooks', () => actOnCharacter('lorebook', chid)),
                row('image', 'External media', () => pressForCharacter(chid, '#character_open_media_overrides')),
            ] }));
            body.append(listGroup({ rows: [row('trash', 'Delete', () => actOnCharacter('delete', chid), true)] }));
        },
    });
    // The character's name is shown as it is.
    instance.title.textContent = character.name;
    instance.title.dir = 'auto';
    showSheet(instance);
}

/**
 * A card's menu in the list (a long press or right click; DESIGN.md → Characters list): the same things as
 * the character's page and its ⋯, so the list leads straight to chats, the editor and lorebooks.
 */
export function openCardMenu(chid, anchor = null) {
    const character = ctx().characters?.[chid];
    if (!character) return;
    const favorite = character.fav === true || character.fav === 'true';
    const row = (iconName, title, run, danger = false) => {
        const node = listRow({ title, icon: iconName, end: 'none', onClick: () => {
            closeSheet(true);
            run();
        } });
        if (danger) node.classList.add('pt-list-row--danger');
        return node;
    };
    const instance = new MenuSheet({
        title: 'Character',
        anchor,
        fill: body => {
            body.append(listGroup({ rows: [
                row('user', 'Open their page', () => openCharacterPage(chid)),
                row('chat', 'Chat', () => openCharacterChatFor(chid)),
                row('chat-plus', 'New chat', () => openCharacterChatFor(chid, { then: () => document.querySelector(START_NEW_CHAT)?.click() })),
                row('pencil', 'Edit', () => {
                    characterTarget.chid = String(chid);
                    editCharacter(chid);
                }),
            ] }));
            body.append(listGroup({ rows: [
                row('star', favorite ? 'Remove from favourites' : 'Add to favourites', () => favoriteCharacter(chid)),
                row('book', 'Lorebook', () => actOnCharacter('lorebook', chid)),
                row('copy', 'Duplicate', () => actOnCharacter('duplicate', chid)),
                row('file-export', 'Export', () => openExportSheet(chid)),
                row('check', 'Select several', () => startBulkSelect()),
            ] }));
            body.append(listGroup({ rows: [row('trash', 'Delete', () => actOnCharacter('delete', chid), true)] }));
        },
    });
    // The character's name is shown as it is.
    instance.title.textContent = character.name;
    instance.title.dir = 'auto';
    showSheet(instance);
}

/** Export: PNG or JSON, through SillyTavern's own export, for this character. */
function openExportSheet(chid) {
    const pick = format => {
        closeSheet(true);
        exportCharacterFile(chid, format);
    };
    showSheet(new MenuSheet({
        title: t('Export character'),
        fill: body => body.append(listGroup({ rows: [
            listRow({ rawTitle: 'PNG', subtitle: 'A picture card with everything inside. Most apps can open it.', icon: 'image', end: 'none', onClick: () => pick('png') }),
            listRow({ rawTitle: 'JSON', subtitle: "The character's details as a text file.", icon: 'file-text', end: 'none', onClick: () => pick('json') }),
        ] })),
    }));
}

export function syncCharacterPage() {
    const form = document.getElementById('form_create');
    const want = deps.active() && deps.settings().touchSizing && deps.settings().charPage;
    document.documentElement.classList.toggle('pt-charpage', !!want);
    if (!want) {
        window.clearTimeout(chars.listTimer);
        chars.listTimer = 0;
        restoreCharToolbar();
        document.getElementById('rm_characters_block')?.classList.remove('pt-one-page');
        document.querySelectorAll('.pt-btn-label, #pt_card_tabs, .pt-hero-name, #pt_card_go').forEach(node => node.remove());
        removeListTop();
        unwatchCardMenu();
        endCardPeek();
        form?.classList.remove('pt-ctab-desc', 'pt-ctab-greet', 'pt-ctab-notes');
        chars.listObserver?.disconnect();
        chars.listObserver = null;
        return;
    }
    buildCharToolbar();
    updateCharPaging();
    if (!form) return;

    // Each card tool gets a short label under its icon.
    for (const [selector, label] of CARD_TOOLS) {
        const button = form.querySelector(selector);
        if (button && !button.querySelector('.pt-btn-label')) button.append(h('span', { class: 'pt-btn-label', text: label }));
    }


    // The name, big, under the avatar.
    const avatarLabel = document.getElementById('avatar_div_div');
    let heroName = form.querySelector('.pt-hero-name');
    if (avatarLabel && !heroName) {
        heroName = h('div', { class: 'pt-hero-name' });
        avatarLabel.after(heroName);
    }
    if (heroName) {
        const creating = isShown(document.getElementById('name_div'));
        heroName.hidden = creating;
        heroName.textContent = document.getElementById('character_name_pole')?.value?.trim() || '';
        // Chat and Recent chats, while editing a character (not a new one, not a group member).
        let go = document.getElementById('pt_card_go');
        if (!go) {
            go = buildCardGo();
            heroName.after(go);
        }
        go.hidden = creating || !!ctx().groupId;
    }

    // Description, first message and notes on tabs instead of one long scroll.
    if (!document.getElementById('pt_card_tabs')) {
        const bar = h('div', { id: 'pt_card_tabs', class: 'pt-segmented pt-card-tabs', role: 'tablist' },
            CARD_TABS.map(([key, label]) => h('button', {
                type: 'button',
                role: 'tab',
                class: 'pt-seg',
                'data-tab': key,
                onclick: () => setCardTab(key),
            }, [label])));
        const anchor = document.getElementById('spoiler_free_desc') ?? document.getElementById('descriptionWrapper');
        anchor?.before(bar);
    }
    setCardTab(chars.tab, false);

    // The list re-renders on search, sort and paging: its top and toolbar follow each time.
    if (!chars.listObserver) {
        const list = document.getElementById('rm_print_characters_block');
        if (list) {
            chars.listObserver = new MutationObserver(() => {
                window.clearTimeout(chars.listTimer);
                chars.listTimer = window.setTimeout(() => {
                    syncListTop();
                    watchCardMenu();
                    updateCharPaging();
                    updateCharToolbar();
                }, 150);
            });
            chars.listObserver.observe(list, { childList: true });
        }
    }
    syncListTop();
    watchCardMenu();
}

/**
 * One tidy row above the character list: search, sort, grid/list and a ＋ menu
 * with everything SillyTavern spreads over several rows of small buttons.
 * SillyTavern's own buttons stay in the page (hidden) and do the actual work.
 */
function buildCharToolbar() {
    const top = document.getElementById('charListFixedTop');
    const search = document.getElementById('character_search_bar');
    if (!top || !search) return;
    let bar = document.getElementById('pt_char_toolbar');
    if (!bar) {
        const button = (iconName, label, onclick, extra = '') => h('button', {
            type: 'button', class: `pt-ctool ${extra}`, 'aria-label': label, title: label, onclick,
        }, [ui(iconName)]);
        bar = h('div', { id: 'pt_char_toolbar', class: 'pt-char-toolbar' }, [
            h('div', { class: 'pt-ctool-search' }),
            button('filter', 'Filter', () => openFilterSheet(), 'pt-ctool-filter'),
            button('sort', 'Sort and view', () => openSortSheet(), 'pt-ctool-sort'),
            button('plus', 'Add and more', () => openCharActions(), 'pt-ctool-add'),
        ]);
        shieldFromDrawerAutoClose(bar);
        top.prepend(bar);
    }
    // SillyTavern's search box moves into the row (it goes back when Pocket Tavern is turned off).
    const slot = bar.querySelector('.pt-ctool-search');
    if (search.parentElement !== slot) {
        // Where it was, so turning off puts it back in the same place, not at the end of the form.
        charSearchHome.parent = search.parentElement;
        charSearchHome.next = search.nextSibling;
        slot.append(search);
    }
    updateCharToolbar();
}

const charSearchHome = { parent: null, next: null };

function updateCharToolbar() {
    const bar = document.getElementById('pt_char_toolbar');
    if (!bar) return;
    const sort = document.getElementById('character_sort_order');
    const sortButton = bar.querySelector('.pt-ctool-sort');
    if (sort && sortButton) sortButton.title = `${t('Sort and view')}: ${sort.selectedOptions[0]?.textContent.trim() ?? ''}`;
    syncFilterBar();
}

function restoreCharToolbar() {
    const search = document.getElementById('character_search_bar');
    const form = document.getElementById('form_character_search_form');
    const { parent, next } = charSearchHome;
    if (search && parent?.isConnected && search.parentElement !== parent) parent.insertBefore(search, next?.parentNode === parent ? next : null);
    else if (search && form && !form.contains(search)) form.append(search);
    charSearchHome.parent = charSearchHome.next = null;
    document.getElementById('pt_char_toolbar')?.remove();
}

/** Sort and view: Grid or List (SillyTavern's own toggle), then every sort order SillyTavern offers. */
function openSortSheet() {
    const select = document.getElementById('character_sort_order');
    if (!select) return;
    const grid = document.body.classList.contains('charListGrid');
    const done = () => setTimeout(() => {
        updateCharToolbar();
        syncListTop();
    }, 300);
    const choice = (title, iconName, on, run, raw = false) => {
        const node = listRow({
            ...(raw ? { rawTitle: title } : { title }), icon: on ? 'check' : iconName, end: 'none',
            onClick: () => {
                closeSheet(true);
                run();
                done();
            },
        });
        node.classList.toggle('pt-choice-on', on);
        return node;
    };
    const options = Array.from(select.options).filter(option => !option.hidden && option.value !== 'Search');
    showSheet(new MenuSheet({
        title: t('Sort and view'),
        fill: body => {
            body.append(listGroup({ header: 'Show as', rows: [
                choice('Grid', 'grid', grid, () => { if (!grid) document.getElementById('charListGridToggle')?.click(); }),
                choice('List', 'list', !grid, () => { if (grid) document.getElementById('charListGridToggle')?.click(); }),
            ] }));
            // SillyTavern's own option names (already in the person's language).
            body.append(listGroup({ header: 'Sort by', rows: options.map(option => choice(option.textContent.trim(), 'sort', option.value === select.value, () => pickFromSelect(select, option.value), true)) }));
        },
    }));
}

/** Every button from SillyTavern's toolbar (and extensions that add one), with its name. */
function openCharActions() {
    const buttons = Array.from(document.querySelectorAll('#rm_button_bar > .menu_button, #rm_buttons_container > .menu_button'))
        .filter(button => button.style.display !== 'none' && !button.classList.contains('displayNone'));
    const nameOf = button => {
        const known = {
            rm_button_create: 'New character',
            character_import_button: 'Import from a file',
            external_import_button: 'Import from a link',
            rm_button_group_chats: 'New group chat',
        }[button.id];
        return known ? t(known) : (button.getAttribute('title') || '').split('\n')[0].trim() || t('Action');
    };
    showSheet(new MenuSheet({
        title: t('Characters'),
        subtitle: t('Add characters, groups and more'),
        fill: body => {
            const rows = buttons.map(button => {
                const faClass = Array.from(button.classList).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-fw'].includes(name));
                return h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        button.click();
                    },
                }, [faClass ? ui(faClass, 'pt-menu-row-icon') : ui('plus', 'pt-menu-row-icon'), h('span', { text: nameOf(button) })]);
            });
            const bulk = document.getElementById('bulkEditButton');
            if (bulk) {
                rows.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        bulk.click();
                    },
                }, [ui('check', 'pt-menu-row-icon'), h('span', { text: t('Select several') })]));
            }
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

/** Paging controls only matter when there is more than one page. */
function updateCharPaging() {
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().charPage) return;
    const holder = document.getElementById('rm_characters_block');
    if (!holder) return;
    const box = document.getElementById('rm_print_characters_pagination');
    // SillyTavern shows no page numbers here, only ‹ › and "1-25 .. 40", so look at those.
    const can = selector => {
        const item = box?.querySelector(selector);
        return !!item && !item.classList.contains('disabled');
    };
    const numbers = (box?.querySelector('.paginationjs-nav')?.textContent ?? '').match(/\d+/g)?.map(Number) ?? [];
    const many = box?.querySelectorAll('li.paginationjs-page').length > 1
        || can('.paginationjs-prev') || can('.paginationjs-next')
        || (numbers.length >= 3 && numbers[1] < numbers[2]);
    holder.classList.toggle('pt-one-page', !many);
}

function setCardTab(key, scroll = true) {
    chars.tab = key;
    const form = document.getElementById('form_create');
    if (!form) return;
    for (const [name] of CARD_TABS) form.classList.toggle(`pt-ctab-${name}`, name === key);
    for (const button of document.querySelectorAll('#pt_card_tabs .pt-seg')) {
        const on = button.dataset.tab === key;
        button.classList.toggle('pt-seg-on', on);
        button.setAttribute('aria-selected', String(on));
    }
    if (scroll) document.getElementById('pt_card_tabs')?.scrollIntoView({ block: 'nearest' });
}
