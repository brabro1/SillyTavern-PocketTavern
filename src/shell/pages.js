// Pages (DESIGN.md → Information architecture): SillyTavern's top-bar drawers and Pocket Tavern's own pages, one open at
// a time; which place (tab) each belongs to; Back from a page to its place; Characters' list, page and card.
import { characterTarget, openCharacterPage, targetCharacter } from '../st/characters.js';
import { closePromptEditor } from '../st/ai.js';
import { CHARACTER_LIST, OPEN_PAGE, TOP_DRAWERS } from '../st/selectors.js';
import { closeOwnPage, currentOwnPage, isOwnPage, openOwnPage } from './page.js';
import { isShown } from './history.js';
import { AI_PAGES } from '../views/ai.js';
import { SETTINGS_OWN_PAGES, SETTINGS_PAGES } from '../views/settings.js';
import { LOREBOOK_PAGE } from '../views/lorebooks.js';

/** @type {{ settings: () => object, icon: Function, lorebookUiOn: () => boolean, characterFromChats: () => { chid: string | null } } | null} */
let deps = null;

export function setupPages(supplied) {
    deps = supplied;
}

/** SillyTavern's top-bar drawers, keyed by the id of their `.drawer` element. Icons come from icons.js. */
export const PAGES = {
    'ai-config-button': { title: 'Presets', long: 'AI response settings', icon: 'sliders' },
    'sys-settings-button': { title: 'API', long: 'API connection', icon: 'plug' },
    'advanced-formatting-button': { title: 'Formatting', long: 'Prompt formatting', icon: 'type' },
    'WI-SP-button': { title: 'Lorebooks', long: 'Lorebooks and World Info', icon: 'book' },
    'user-settings-button': { title: 'SillyTavern', long: 'User settings', icon: 'settings' },
    'backgrounds-button': { title: 'Backgrounds', long: 'Chat backgrounds', icon: 'image' },
    'extensions-settings-button': { title: 'Extensions', long: 'Extensions and add-ons', icon: 'puzzle' },
    'persona-management-button': { title: 'Personas', long: 'Who you are in the chat', icon: 'smile' },
    'rightNavHolder': { title: 'Characters', long: 'Characters and groups', icon: 'users' },
};

export const TABS = [
    { id: 'chat', label: 'Chats', icon: 'chats' },
    { id: 'rightNavHolder', label: 'Characters', icon: 'users' },
    { id: 'pt-lorebooks', label: 'Lorebooks', icon: 'book' },
    { id: 'pt-ai', label: 'AI', icon: 'sparkles' },
    { id: 'pt-settings', label: 'Settings', icon: 'settings' },
];

/** Optional sixth place for Extensions and third-party extension menus (issue #18). */
export const EXTENSIONS_TAB = { id: 'pt-extensions', label: 'Extensions', icon: 'puzzle' };

/** The navigation places shown right now (five by default, six with the Extensions button on). */
export function activeTabs() {
    return deps?.settings().extensionsTab
        ? [TABS[0], TABS[1], TABS[2], TABS[3], EXTENSIONS_TAB, TABS[4]]
        : TABS;
}

/** Top-bar drawers added by other extensions (e.g. Character Library, 3D Dice Roller). */
export function extensionDrawers() {
    return Array.from(document.querySelectorAll(TOP_DRAWERS))
        .filter(drawer => drawer.id && !TABS.some(tab => tab.id === drawer.id) && !AI_PAGES.includes(drawer.id) && drawer.id !== LOREBOOK_PAGE && !SETTINGS_PAGES.includes(drawer.id))
        .map(drawer => {
            const info = pageInfo(drawer);
            return { id: drawer.id, title: info.title, icon: info.icon };
        });
}

/** The place a SillyTavern page belongs to: its tab stays lit, and Back from it returns to that place. */
export function placeOf(pageId) {
    if (!pageId || pageId === 'pt-chats') return 'chat';
    if (pageId === 'pt-character') return 'rightNavHolder';
    if (SETTINGS_OWN_PAGES.includes(pageId)) return 'pt-settings';
    if (pageId === LOREBOOK_PAGE) return 'pt-lorebooks';
    if (pageId === 'pt-extensions') return deps?.settings().extensionsTab ? 'pt-extensions' : 'pt-settings';
    if (isOwnPage(pageId) || TABS.some(tab => tab.id === pageId)) return pageId;
    if (AI_PAGES.includes(pageId)) return 'pt-ai';
    if (deps?.settings().extensionsTab && (pageId === 'extensions-settings-button' || !SETTINGS_PAGES.includes(pageId))) {
        return 'pt-extensions';
    }
    return 'pt-settings';
}


export function drawerById(id) {
    const drawer = document.getElementById(id);
    return drawer?.classList.contains('drawer') ? drawer : null;
}

/** The id of the top-bar drawer that is currently open, if any. */
export function currentPageId() {
    const own = currentOwnPage();
    if (own) return own;
    const content = document.querySelector(OPEN_PAGE);
    return content?.closest('.drawer')?.id || null;
}

export function pageInfo(drawer) {
    const known = PAGES[drawer.id];
    if (known) return known;
    const iconEl = drawer.querySelector('.drawer-icon');
    const faClass = Array.from(iconEl?.classList ?? []).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-fw', 'fa-regular'].includes(name));
    const title = iconEl?.getAttribute('title') || drawer.getAttribute('title') || drawer.id.replace(/[-_]+/g, ' ');
    return { title, long: '', icon: faClass ?? 'fa-puzzle-piece' };
}

export function openPage(id) {
    if (isOwnPage(id)) {
        closeDrawers();
        openOwnPage(id);
        return;
    }
    closeOwnPage(true);
    const drawer = drawerById(id);
    if (!drawer) return;
    // One page at a time. SillyTavern leaves a locked panel (e.g. the Characters lock) open when another
    // one opens, so the page you left would stay open under the new one and its tab could not be picked
    // again. Pocket Tavern shows one page beside the chat, so a locked one closes here too.
    for (const content of document.querySelectorAll(OPEN_PAGE)) {
        if (content.parentElement !== drawer) content.parentElement.querySelector(':scope > .drawer-toggle')?.click();
    }
    if (drawer.querySelector(':scope > .drawer-content')?.classList.contains('openDrawer')) return;
    drawer.querySelector(':scope > .drawer-toggle')?.click();
}

export function closePages() {
    closeOwnPage();
    closeDrawers();
}

export function closeDrawers() {
    // The prompt editor lives outside the Presets drawer and would stay on screen.
    closePromptEditor();
    for (const content of document.querySelectorAll(OPEN_PAGE)) {
        content.parentElement.querySelector(':scope > .drawer-toggle')?.click();
    }
}

/** Back from a page: from one of SillyTavern's pages to the place it belongs to (AI, Settings), else to the chat. */
export function backFromPage() {
    const id = currentPageId();
    // The Draft helper's page is opened from Settings → Pocket Tavern.
    if (id === 'pt-draft') {
        openPage('pt-pocket');
        return;
    }
    // A character's page opened from Chats goes back to Chats.
    if (id === 'pt-character' && deps.characterFromChats().chid !== null && deps.characterFromChats().chid === characterTarget.chid) {
        deps.characterFromChats().chid = null;
        openPage('pt-chats');
        return;
    }
    // A character's card (editing, a new character, a group): back to their page when it was opened from
    // there, else to the list. SillyTavern's own list button closes the card (and the card-only view).
    if (id === 'rightNavHolder' && characterCardShown()) {
        const target = targetCharacter();
        const fromPage = !!target && document.getElementById('avatar_url_pole')?.value === target.avatar;
        document.getElementById('rm_button_characters')?.click();
        if (fromPage) openCharacterPage(characterTarget.chid);
        return;
    }
    // When Pocket Tavern's Lorebook UI is off, SillyTavern's World Info is the place's root (issue #16).
    if (id === LOREBOOK_PAGE && deps && !deps.lorebookUiOn()) {
        closePages();
        return;
    }
    // With the Extensions button on and no extra extension drawers, Extensions itself is the place's root.
    if (id === 'extensions-settings-button' && deps?.settings().extensionsTab && !extensionDrawers().length) {
        closePages();
        return;
    }
    const place = id ? placeOf(id) : null;
    if (place && place !== id && (isOwnPage(place) || drawerById(place))) {
        if (place === 'rightNavHolder') showCharacterList();
        openPage(place);
    } else closePages();
}

/** A character's card, a new character or a group is open in Characters instead of the list. */
export function characterCardShown() {
    return isShown(document.getElementById('rm_ch_create_block')) || isShown(document.getElementById('rm_group_chats_block'));
}

/** Leaves the open chat for SillyTavern's start screen with the recent chats. */
export function goHome() {
    closePages();
    // SillyTavern's own "Close chat" (it waits until a reply has finished).
    document.getElementById('option_close_chat')?.click();
}

/**
 * Shows SillyTavern's character list in the right panel. Skipped when the list is
 * already showing: asking again makes SillyTavern throw the list away and draw it anew.
 */
export function showCharacterList() {
    const block = document.getElementById('rm_characters_block');
    if (block && block.style.display !== 'none' && getComputedStyle(block).display !== 'none' && block.querySelector(`${CHARACTER_LIST} > *`)) return;
    document.getElementById('rm_button_characters')?.click();
}
