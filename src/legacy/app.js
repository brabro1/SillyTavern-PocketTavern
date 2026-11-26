/**
 * Pocket Tavern for SillyTavern
 *
 * Turns SillyTavern on a phone into an app-style interface: a top app bar, a
 * bottom tab bar, full-screen pages that the Android back gesture closes, a
 * restyled chat, and touch-first controls everywhere.
 *
 * Everything is scoped behind classes on <html> (`pt-on` and feature
 * classes). Removing them, or disabling the extension, restores the stock
 * interface. Nothing is moved out of SillyTavern's own DOM: the app bar and tab
 * bar only click SillyTavern's existing drawer toggles.
 *
 * The lorebook pickers never replace SillyTavern's own <select> elements. They
 * hide them, then read from and write to them, dispatching a normal `change`
 * event, so SillyTavern applies selections exactly as it does today.
 */

// The prelude (storage keys, translations) has to finish before this file runs.
import '../core/prelude.js';
import { svgIcon, iconCss, iconUrl } from '../ui/icons.js';
import { findTheme, themeCss, themeFromSillyTavern, ST_THEME_COLORS } from '../themes/themes.js';
import { t, setLocale, isRtl, currentLang } from '../core/i18n.js';
import { VERSION } from '../../changelog.js';
import { migrateSettings } from '../core/settings.js';
import { h } from '../core/dom.js';
import { startPopupWatch } from '../st/popup-watch.js';
import { applyLayout, isTypingField, IS_IOS, keyboardUp, resolveLayout, watchLayout } from '../shell/layout.js';
import { fitToViewport, followViewport, overlayHead, placePopover, syncToasts, wireOverlay } from '../shell/overlay.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { closeOwnPage, currentOwnPage, definePage, isOwnPage, onPageChange, openOwnPage, pageSpec, refreshOwnPage, scrollOwnPageToTop } from '../shell/page.js';
import { AI_PAGES, aiPage } from '../views/ai.js';
import { showBackPill } from '../shell/native.js';
import { restartAll } from '../core/lifecycle.js';
import { SETTINGS_OWN_PAGES, SETTINGS_PAGES, settingsPage } from '../views/settings.js';
import { appearancePage } from '../views/appearance.js';
import { DEVICE_MODES, pocketTavernPage } from '../views/pocket-tavern.js';
import { aboutPage } from '../views/about.js';
import { LOREBOOK_PAGE, lorebooksPage } from '../views/lorebooks.js';
import { draftSettingsPage } from '../views/draft-settings.js';
import { SECTIONS as DRAFT_SECTIONS } from '../features/draft/engine.js';
import { builtInInstruction, canUndo, cancelDraft, cycleWritingAs, draftRunning, draftSettings, isDrafting, previewNote, profileNames, refineChoices, refineDraft, resetDraftSettings, runDraft, saveDraftSettings, setupDraft, standaloneInstalled, startDraft, stopDraft, undoDraft, writingAsName } from '../features/draft/draft.js';
import { chatMenu } from '../views/chat-menu.js';
import { plusMenu } from '../views/plus-menu.js';
import { watchChatLoading } from '../features/chat-loading.js';
import { atBottom, cancelSwipe, foldLongMessages, markSingleVersions, onSwipeEnd, onSwipeMove, onSwipeStart, onSwipedEvent, setupMessages, syncJumpButton, unfold, updateJump } from '../views/messages.js';
import { chatsPage, chatsWelcome } from '../views/chats.js';
import { characterPage } from '../views/character.js';
import { promptEditor, promptEditorMode, promptEditorOpen, closePromptEditor, promptEditorDirty, leavePromptEditor, promptFull, setPromptFull, syncPromptEditorSession, syncPromptNameBox, fitTextarea, syncPresetTabs, syncTriggerChips, aiStatus, aiQuickRows, openPresetsOn, refreshAiPage, setupAiScreens } from '../st/ai.js';
import { aboutCharacter, characterTarget, checkCardPeek, favoriteCharacter, openCharacterPage, editCharacter, fetchCharacterChats, isCurrentCharacter, onCardPeekPress, onCharacterTap, onExportClick, openCharacterChatFor, openCharacterMenu, pressForCharacter, setupCharacters, syncCharacterPage, targetCharacter } from '../st/characters.js';
import { chatTitle, chatTitleNode, messageCount, previewBubble, rowMenuButton } from '../ui/chat-row.js';
import { listGroup, listRow } from '../ui/list.js';
import { button as uiButton } from '../ui/button.js';
import { clearBanners, hideBanner, showBanner } from '../shell/banners.js';
import { closeLoreEntry, editedLorebook, lore, lorebookList, openLoreEntry, openLorebook, openLorebookSettings, pickActiveLorebooks, scan, setupLorebookScreens, startObserver, stopObserver, syncLoreEntries, syncLorebookMode, syncWandShortcut, watchLorebooks, wiPage } from '../st/lorebooks.js';
import { PAGE_SECTIONS, SEARCH_PAGES, addSliderSteppers, buildSettings, closePageSection, describeExtensions, describeSettings, extnav, install, installApp, isStandalone, maybeShowDesktopNotice, maybeShowWhatsNew, openSettingSearch, openSillyTavernSection, openSillyTavernUpdates, openWhatsNew, pageSectionOpen, pageSections, pickTheme, removeSettingDescriptions, removeSliderSteppers, revealSetting, setSwitch, settingItems, setupSettingsScreens, statusText, syncManifest, syncPageSections, syncSettingsInputs, updatePocketTavern, updateStatusLine, yourThemeColors } from '../st/settings.js';

// This file sits two folders below Pocket Tavern's own folder (src/legacy/), which sits in
// /scripts/extensions/third-party/<folder>/.
const EXTENSION_ROOT = new URL('../../', import.meta.url);

const MODULE = 'mobileUI';
const MODE_KEY = 'pt_mode';
const LOG = '[Pocket Tavern]';

const DEFAULTS = Object.freeze({
    enabled: true,
    appShell: true,
    chatStyle: true,
    touchSizing: true,
    /** SillyTavern's Custom CSS while a Pocket Tavern theme is on (a SillyTavern theme puts its own CSS there). */
    stCustomCss: false,
    /** The Draft helper (built in from the Draft Enhancer extension): Enhance, Write and Continue in +. */
    draftHelper: true,
    /** − and + beside sliders' numbers (issue #12: off; typing the number is quicker). */
    sliderSteppers: false,
    backGesture: true,
    lorebookPicker: true,
    longSelects: false,
    wandShortcut: true,
    theme: 'pocket',
    themeBackdrop: true,
    modernFont: true,
    customIcons: true,
    /** 'full' | 'light' | 'off' */
    motion: 'full',
    /** 'small' | 'normal' | 'large' | 'xl' */
    textSize: 'normal',
    sendEffect: true,
    haptics: true,
    autoReload: true,
    /** SillyTavern's Chat Style before a Pocket Tavern theme put it on Flat ('' when untouched), and that theme's id. */
    stChatStyle: '',
    chatStyleFor: '',
    jumpButton: true,
    messageMenu: true,
    saveDrafts: true,
    keepAwake: true,
    imageViewer: true,
    niceToasts: true,
    longPress: true,
    serverWatch: true,
    fastChat: true,
    lastSeenVersion: '',
    recentLanguages: [],
    autoTranslate: false,
    charPage: true,
    charPreview: true,
    dragSwipe: true,
    foldLong: true,
    contextMeter: true,
    chatLook: 'cards',
    loreCards: true,
    sharpPictures: true,
    animatedPictures: true,
    recentTools: true,
    /** 'auto' (compact on small phones) | 'comfortable' | 'compact' */
    uiSize: 'auto',
    /** 'floating' | 'docked' */
    composerStyle: 'floating',
    /** 'auto' | 'phone' | 'desktop' (DESIGN.md → Layouts) */
    layout: 'auto',
    /** In a chat the bottom tabs tuck away; a button in the message box brings them back. */
    hideTabsInChat: true,
    desktopNoticeSeen: false,
    /** Guided Generations (another extension) as one button next to Send. Only matters when it is installed. */
    ggButton: true,
    /** The last Guided Generations action run from the sheet; holding the button runs it again. */
    ggLast: '',
});

/** The motion curve, the same as --pt-ease in style.css (DESIGN.md, motion). */
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

const MOTION_LABELS = {
    full: 'Smooth: all animations',
    light: 'Light: quick fades only (faster)',
    off: 'Off: no animations (fastest)',
};

/** SillyTavern's top-bar drawers, keyed by the id of their `.drawer` element. Icons come from icons.js. */
const PAGES = {
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

const TABS = [
    { id: 'chat', label: 'Chats', icon: 'chats' },
    { id: 'rightNavHolder', label: 'Characters', icon: 'users' },
    { id: 'pt-lorebooks', label: 'Lorebooks', icon: 'book' },
    { id: 'pt-ai', label: 'AI', icon: 'sparkles' },
    { id: 'pt-settings', label: 'Settings', icon: 'settings' },
];

/** The place a SillyTavern page belongs to: its tab stays lit, and Back from it returns to that place. */
function placeOf(pageId) {
    if (!pageId || pageId === 'pt-chats') return 'chat';
    if (pageId === 'pt-character') return 'rightNavHolder';
    if (SETTINGS_OWN_PAGES.includes(pageId)) return 'pt-settings';
    if (pageId === LOREBOOK_PAGE) return 'pt-lorebooks';
    if (isOwnPage(pageId) || TABS.some(tab => tab.id === pageId)) return pageId;
    if (AI_PAGES.includes(pageId)) return 'pt-ai';
    return 'pt-settings';
}

function isWide() {
    return document.documentElement.classList.contains('pt-desktop');
}

/** Visible height (px) below which the sheet drops secondary chrome: landscape or keyboard open. */
const COMPACT_BELOW = 520;
/**
 * Wide screens (a computer, a tablet held sideways) get the desktop layout: tabs
 * as a rail on the left, pages as a panel beside the chat, sheets as dialogs.
 * A sideways phone is wide but short, so it keeps the phone layout.
 */
/** Phones narrower than this (most 360px Androids, foldable cover screens) get the compact size on Automatic. */
const SMALL_PHONE_BELOW = 380;
let settings = null;
let active = false;
/** Stopped for this visit by src/core/lifecycle.js (after an error); SillyTavern's own screens show. */
let paused = false;
let sheet = null;

// ---------------------------------------------------------------- utilities

function ctx() {
    return globalThis.SillyTavern.getContext();
}

function $j() {
    return globalThis.jQuery;
}

const icon = (classes) => h('i', { class: `fa-solid ${classes}`, 'aria-hidden': 'true' });
/** Our own line icon (icons.js), or a Font Awesome class for drawers we do not know. */
const ui = (name, className = '') => (name.startsWith('fa-') ? icon(`${name} ${className}`) : svgIcon(name, className));

function normalizeText(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Builds a node list with every match of `query` wrapped in <mark> (never translated). */
function highlight(text, query) {
    const str = String(text ?? '');
    const q = normalizeText(query.trim());
    const norm = normalizeText(str);
    if (!q || norm.length !== str.length) return [document.createTextNode(str)];
    const nodes = [];
    let cursor = 0;
    let at = norm.indexOf(q, cursor);
    while (at !== -1) {
        if (at > cursor) nodes.push(document.createTextNode(str.slice(cursor, at)));
        nodes.push(h('mark', { raw: str.slice(at, at + q.length) }));
        cursor = at + q.length;
        at = norm.indexOf(q, cursor);
    }
    if (cursor < str.length) nodes.push(document.createTextNode(str.slice(cursor)));
    return nodes;
}

/**
 * Adds a listener to one of SillyTavern's elements only once, however often the
 * feature that needs it is switched off and on again. The handlers check whether
 * their feature is on, so a listener left behind while it is off does nothing.
 */
const wiredOnce = new WeakMap();

function wireOnce(element, type, handler) {
    if (!element) return;
    const types = wiredOnce.get(element) ?? new Set();
    if (types.has(type)) return;
    types.add(type);
    wiredOnce.set(element, types);
    element.addEventListener(type, handler);
}

function readMode() {
    try {
        const value = localStorage.getItem(MODE_KEY);
        // "always" was the old way to use it on a computer; automatic does that now.
        return value === 'phone' || value === 'never' ? value : 'auto';
    } catch {
        return 'auto';
    }
}

function writeMode(mode) {
    try {
        localStorage.setItem(MODE_KEY, mode);
    } catch (error) {
        console.warn(LOG, 'Could not store the activation mode', error);
    }
}

function loadSettings() {
    const { extensionSettings } = ctx();
    extensionSettings[MODULE] = Object.assign({}, DEFAULTS, migrateSettings(extensionSettings[MODULE]));
    settings = extensionSettings[MODULE];
}

function saveSettings() {
    ctx().saveSettingsDebounced();
}

// ------------------------------------------------------- phone detection

/** Best-effort phone check that survives Chrome's "Desktop site" mode. */
function detectPhone() {
    const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
    const sides = [screen.width, screen.height].filter(n => n > 0);
    const shortSide = sides.length ? Math.min(...sides) : Infinity;
    const uaPhone = /Android.+Mobile|iPhone|iPod/i.test(navigator.userAgent);
    return (coarse && shortSide <= 500) || uaPhone;
}

/**
 * Automatic means on everywhere: phones get the phone layout and wide screens
 * the desktop layout. "Phones only" keeps a computer on the original interface.
 */
function shouldBeActive() {
    if (paused || !settings.enabled) return false;
    const mode = readMode();
    if (mode === 'never') return false;
    if (mode === 'phone') return detectPhone();
    return true;
}

// ------------------------------------------------------------------ sheets
class MenuSheet {
    /**
     * @param {{ title: string, subtitle?: string, anchor?: Element, fill: (body: HTMLElement) => void }} options
     *        anchor: the button that opened it; on desktop the sheet is then a popover beside it
     */
    constructor({ title, subtitle, anchor, fill }) {
        this.picker = null;
        this.anchor = anchor ?? null;
        this.closing = false;
        this.fill = fill;
        this.dialog = h('dialog', { id: 'pt-sheet', class: 'pt-sheet pt-menu-sheet', 'aria-label': title });
        this.panel = h('div', { class: 'pt-panel', tabindex: '-1' });
        Object.assign(this, overlayHead({ title, subtitle, onClose: () => closeSheet() }));
        this.body = h('div', { class: 'pt-menu-body' });
        this.panel.append(this.head, this.body);
        this.dialog.append(this.panel);
        wireOverlay({ dialog: this.dialog, panel: this.panel, dragAreas: [this.head, this.body], onClose: () => closeSheet() });
        this.refresh();
    }

    refresh() {
        const scroll = this.body.scrollTop;
        this.body.replaceChildren();
        this.fill(this.body);
        this.body.scrollTop = scroll;
    }
}

let stopViewportFollow = null;

function showSheet(instance) {
    const previousFocus = sheet ? sheet.returnFocus : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (sheet) closeSheet(true);
    // Clean up any fading-out sheet so there is never a duplicate #pt-sheet ID.
    for (const stale of document.querySelectorAll('dialog#pt-sheet')) {
        if (stale.open) stale.close();
        stale.remove();
    }
    sheet = instance;
    sheet.returnFocus = previousFocus;
    // The viewport follower runs all the time Pocket Tavern is on (see applyState);
    // here the new sheet only needs to know whether the screen is short.
    sheet.dialog.classList.toggle('pt-compact', (window.visualViewport?.height ?? window.innerHeight) < COMPACT_BELOW);
    // The language of its labels, so long words (a tile name on a narrow phone) break with a hyphen.
    sheet.dialog.lang = currentLang();
    fitToViewport(sheet.dialog, COMPACT_BELOW);
    if (sheet.anchor?.isConnected && isWide()) placePopover(sheet.dialog, sheet.anchor);
    document.body.append(sheet.dialog);
    sheet.dialog.showModal();
    syncToasts();
    // Opening focuses the first field; make sure that did not scroll the sheet.
    sheet.dialog.scrollTop = 0;
    requestAnimationFrame(() => sheet?.dialog.classList.add('pt-sheet-open'));
    sheet.panel.focus({ preventScroll: true });
    scheduleHistorySync();
}

function closeSheet(immediate = false) {
    const current = sheet;
    if (!current || current.closing) return;
    current.closing = true;
    sheet = null;
    const finish = () => {
        if (current.dialog.open) current.dialog.close();
        // Before removing it: the toast container may be inside and must go back to the page.
        syncToasts();
        current.dialog.remove();
        if (!immediate && !sheet && current.returnFocus?.isConnected && document.activeElement === document.body) {
            current.returnFocus.focus({ preventScroll: true });
        }
    };
    if (immediate) {
        finish();
    } else {
        // Taps during the fade-out must not hit rows of a sheet that is already closing.
        current.dialog.style.pointerEvents = 'none';
        // New toasts during the fade-out go to the page, not into a dialog about to be removed.
        current.dialog.setAttribute('closing', '');
        syncToasts();
        current.dialog.classList.remove('pt-sheet-open');
        setTimeout(finish, 230);
    }
    scheduleHistorySync();
}

// ------------------------------------------------------- back gesture

/**
 * Android's back gesture should close whatever is on top (a sheet, a popup, a
 * page) instead of leaving SillyTavern. We keep one history entry per open
 * layer and reconcile after every change, so pages that SillyTavern opens or
 * closes on its own stay in step too.
 */
const nav = { depth: 0, suppress: 0, timer: 0, guard: 0, observer: null };

/**
 * Older SillyTavern overlays that are plain <div>s rather than <dialog>s.
 * The prompt editor comes first: it sits on top of the Presets page.
 */
const OVERLAYS = [
    // Back leaves full screen first, then the editor (asking if there are unsaved changes).
    { selector: '#completion_prompt_manager_popup', close: () => (promptFull() ? setPromptFull(false) : leavePromptEditor()), open: () => promptEditorOpen() },
    { selector: '#shadow_select_chat_popup', close: '#select_chat_cross' },
    { selector: '#character_popup', close: '#character_cross' },
    // Character Library (another extension) in its Embedded Panel mode: a page of its own (issue #1).
    { selector: '#charlib-embedded-container', close: () => closeCharacterLibrary() },
];

/** Closes Character Library's embedded panel the way it closes itself (its button toggles it). */
function closeCharacterLibrary() {
    const panel = document.getElementById('charlib-embedded-container');
    if (!isShown(panel)) return false;
    const toggle = document.querySelector('#st-gallery-btn, #charlib-launcher-dropdown [data-action="library"]');
    if (toggle) toggle.click();
    else panel.style.display = 'none';
    return true;
}

function isShown(element) {
    return !!element && getComputedStyle(element).display !== 'none';
}

/** Guided Generations' own popups (Edit Guides, Stat Tracker, Fun, Edit Intros, Corrections), when it is installed. */
function openGuidedPopups() {
    if (!active) return [];
    return [...document.querySelectorAll('body > .gg-popup')].filter(popup => popup.style.display !== 'none' && isShown(popup));
}

/** Closes one the way its own × does. */
function closeGuidedPopup(popup) {
    const close = popup.querySelector('.gg-popup-close, .gg-close-button');
    if (close) close.click();
    else popup.style.display = 'none';
}

// ------------------------------------------------------- message editor

/** SillyTavern edits a message in place; on a phone that edit gets its own full page. */
function editingTextarea() {
    return document.querySelector('#chat #curEditTextarea');
}

function editorOpen() {
    return active && settings.chatStyle && !!editingTextarea();
}

function saveEditor() {
    editingTextarea()?.closest('.mes')?.querySelector('.mes_edit_done')?.click();
}

function syncEditorState() {
    const on = active && editorOpen();
    document.documentElement.classList.toggle('pt-editing', on);
    if (on) {
        const box = editingTextarea();
        // SillyTavern sizes the box to its text; the page gives it the whole height instead.
        box.style.removeProperty('height');
    }
    scheduleHistorySync();
}

function openOverlays() {
    return OVERLAYS.filter(overlay => (overlay.open ? overlay.open() : isShown(document.querySelector(overlay.selector))));
}

function openLayerCount() {
    let count = 0;
    if (currentPageId() && currentPageId() !== 'pt-chats') count += 1;
    count += openOverlays().length;
    count += openGuidedPopups().length;
    count += document.querySelectorAll('dialog.popup[open]').length;
    if (sheet) count += 1;
    if (viewer) count += 1;
    if (editorOpen()) count += 1;
    if (chatFinderOpen()) count += 1;
    if (openLoreEntry()) count += 1;
    if (pageSectionOpen()) count += 1;
    return count;
}

function watchOverlays(on) {
    nav.observer?.disconnect();
    nav.observer = null;
    if (!on) return;
    // Guided Generations adds its popups to <body> and shows or hides them with their style.
    const watchGuidedPopup = popup => nav.observer.observe(popup, { attributes: true, attributeFilter: ['style'] });
    nav.observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes ?? []) {
                if (node.classList?.contains('gg-popup')) watchGuidedPopup(node);
                // Layers another extension adds later (Character Library makes its panel on first use).
                if (node.nodeType === 1 && OVERLAYS.some(overlay => node.matches(overlay.selector))) nav.observer.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
            }
        }
        scheduleHistorySync();
    });
    for (const overlay of OVERLAYS) {
        const element = document.querySelector(overlay.selector);
        if (element) nav.observer.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    nav.observer.observe(document.body, { childList: true });
    document.querySelectorAll('body > .gg-popup').forEach(watchGuidedPopup);
}

function scheduleHistorySync(delay = 220) {
    window.clearTimeout(nav.timer);
    nav.timer = window.setTimeout(syncHistory, delay);
}

function syncHistory() {
    nav.timer = 0;
    if (!active || !settings.backGesture) return;
    if (nav.suppress) {
        scheduleHistorySync();
        return;
    }
    const want = openLayerCount();
    try {
        if (want > nav.depth) {
            while (nav.depth < want) {
                nav.depth += 1;
                history.pushState({ pt: nav.depth }, '');
            }
        } else if (want < nav.depth) {
            const steps = nav.depth - want;
            nav.depth = want;
            nav.suppress += 1;
            history.go(-steps);
            // If no popstate arrives, do not leave the guard armed for a real back press.
            window.clearTimeout(nav.guard);
            nav.guard = window.setTimeout(() => { nav.suppress = 0; }, 800);
        }
    } catch (error) {
        console.debug(LOG, 'History sync skipped', error);
    }
}

function closeTopLayer() {
    if (viewer) {
        closeViewer();
        return true;
    }
    if (sheet) {
        closeSheet();
        return true;
    }
    const popups = document.querySelectorAll('dialog.popup[open]');
    if (popups.length) {
        const top = popups[popups.length - 1];
        const ev = new Event('cancel', { cancelable: true });
        if (top.dispatchEvent(ev) && top.open) top.close();
        return true;
    }
    const guidedPopup = openGuidedPopups().pop();
    if (guidedPopup) {
        closeGuidedPopup(guidedPopup);
        return true;
    }
    if (editorOpen()) {
        // Back keeps your changes, like a notes app. Cancel is still a tap away.
        saveEditor();
        return true;
    }
    if (chatFinderOpen()) {
        closeChatFinder();
        return true;
    }
    if (openLoreEntry()) {
        closeLoreEntry();
        return true;
    }
    const overlays = openOverlays();
    if (overlays.length) {
        const { close } = overlays[0];
        if (typeof close === 'function') close();
        else $j()(close).trigger('click');
        return true;
    }
    if (closePageSection()) return true;
    if (currentPageId()) {
        backFromPage();
        return true;
    }
    return false;
}

function onPopState(event) {
    if (nav.suppress > 0) {
        nav.suppress -= 1;
        return;
    }
    if (!active || !settings.backGesture) return;
    if (nav.depth > 0) {
        nav.depth -= 1;
        closeTopLayer();
        scheduleHistorySync(400);
    } else if (event.state?.pt) {
        // A leftover entry from before a reload: nothing is open, so keep going back.
        history.back();
    }
}

function resetHistoryTracking() {
    window.clearTimeout(nav.timer);
    window.clearTimeout(nav.guard);
    nav.timer = 0;
    nav.guard = 0;
    nav.depth = 0;
    nav.suppress = 0;
}

// ------------------------------------------------------------ pages

function drawerById(id) {
    const drawer = document.getElementById(id);
    return drawer?.classList.contains('drawer') ? drawer : null;
}

/** The id of the top-bar drawer that is currently open, if any. */
function currentPageId() {
    const own = currentOwnPage();
    if (own) return own;
    const content = document.querySelector('#top-settings-holder > .drawer > .drawer-content.openDrawer');
    return content?.closest('.drawer')?.id || null;
}

function pageInfo(drawer) {
    const known = PAGES[drawer.id];
    if (known) return known;
    const iconEl = drawer.querySelector('.drawer-icon');
    const faClass = Array.from(iconEl?.classList ?? []).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-fw', 'fa-regular'].includes(name));
    const title = iconEl?.getAttribute('title') || drawer.getAttribute('title') || drawer.id.replace(/[-_]+/g, ' ');
    return { title, long: '', icon: faClass ?? 'fa-puzzle-piece' };
}

function openPage(id) {
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
    for (const content of document.querySelectorAll('#top-settings-holder > .drawer > .drawer-content.openDrawer')) {
        if (content.parentElement !== drawer) content.parentElement.querySelector(':scope > .drawer-toggle')?.click();
    }
    if (drawer.querySelector(':scope > .drawer-content')?.classList.contains('openDrawer')) return;
    drawer.querySelector(':scope > .drawer-toggle')?.click();
}

function closePages() {
    closeOwnPage();
    closeDrawers();
}

function closeDrawers() {
    // The prompt editor lives outside the Presets drawer and would stay on screen.
    closePromptEditor();
    for (const content of document.querySelectorAll('#top-settings-holder > .drawer > .drawer-content.openDrawer')) {
        content.parentElement.querySelector(':scope > .drawer-toggle')?.click();
    }
}

/** Back from a page: from one of SillyTavern's pages to the place it belongs to (AI, Settings), else to the chat. */
function backFromPage() {
    const id = currentPageId();
    // The Draft helper's page is opened from Settings → Pocket Tavern.
    if (id === 'pt-draft') {
        openPage('pt-pocket');
        return;
    }
    // A character's page opened from Chats goes back to Chats.
    if (id === 'pt-character' && characterFromChats.chid !== null && characterFromChats.chid === characterTarget.chid) {
        characterFromChats.chid = null;
        openPage('pt-chats');
        return;
    }
    const place = id ? placeOf(id) : null;
    if (place && place !== id && (isOwnPage(place) || drawerById(place))) {
        if (place === 'rightNavHolder') showCharacterList();
        openPage(place);
    } else closePages();
}

/** Leaves the open chat for SillyTavern's start screen with the recent chats. */
function goHome() {
    closePages();
    // SillyTavern's own "Close chat" (it waits until a reply has finished).
    document.getElementById('option_close_chat')?.click();
}

/**
 * Shows SillyTavern's character list in the right panel. Skipped when the list is
 * already showing: asking again makes SillyTavern throw the list away and draw it anew.
 */
function showCharacterList() {
    const block = document.getElementById('rm_characters_block');
    if (block && block.style.display !== 'none' && getComputedStyle(block).display !== 'none' && block.querySelector('#rm_print_characters_block > *')) return;
    document.getElementById('rm_button_characters')?.click();
}

// ------------------------------------------------------------ app shell

let shell = null;

class Shell {
    constructor() {
        this.drawerObserver = null;
        this.destroyed = false;
        /** The page each place was last on (AI → Presets…), so coming back opens it again. */
        this.lastInPlace = {};
        this.timers = new Set();
        // Checked right away on resize, before the frame is drawn: the tab bar
        // steps aside and the chat starts its slide in the frame the window
        // changes, so there is one move, not two.
        this.onResize = () => {
            if (this.destroyed) return;
            this.checkKeyboard();
            // The rail's tabs change height with the window.
            if (isWide()) this.placeRailPill();
        };
        this.lastHeight = window.innerHeight;
        this.onFocusIn = event => {
            if (this.destroyed) return;
            if (isTypingField(event.target)) this.after(400, () => this.checkKeyboard());
            // Writing a message: the tabs go away again. With the on-screen
            // keyboard they go when it opens (one move, not two); with a
            // hardware keyboard there is no keyboard to wait for.
            if (event.target?.id === 'send_textarea' && this.tabsOut) {
                this.tabsOut = false;
                this.tuckPending = true;
                this.after(500, () => {
                    if (!this.tuckPending) return;
                    this.tuckPending = false;
                    this.syncTuck(true);
                });
            }
        };
        this.tabsOut = false;
        this.inChat = false;
        this.touchY = null;
        // Scrolling the chat with a finger or the wheel tucks the tabs away again
        // (not the chat moving by itself while a reply streams in).
        this.onChatTouchStart = event => {
            this.touchY = event.touches[0]?.clientY ?? null;
        };
        this.onChatTouchMove = event => {
            if (this.touchY === null || !this.tabsOut) return;
            if (Math.abs((event.touches[0]?.clientY ?? this.touchY) - this.touchY) > 24) this.tuckAgain();
        };
        this.onChatWheel = () => this.tuckAgain();
        this.onFocusOut = () => this.after(0, () => this.checkKeyboard());
        this.build();
    }

    after(ms, fn) {
        const id = window.setTimeout(() => {
            this.timers.delete(id);
            if (!this.destroyed) fn();
        }, ms);
        this.timers.add(id);
        return id;
    }

    build() {
        // ---- top app bar
        this.back = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-back',
            'aria-label': 'Back',
            // Step back one level: prompt full-screen / dirty check first, then settings section, then page.
            onclick: () => {
                if (promptEditorOpen()) {
                    if (promptFull()) setPromptFull(false);
                    else leavePromptEditor();
                    return;
                }
                // In a chat (phone): back to the Chats home.
                if (!currentPageId() && this.inChat) {
                    goHome();
                    return;
                }
                if (!closePageSection()) backFromPage();
            },
        }, [ui('arrow-left')]);
        this.avatar = h('span', { class: 'pt-ab-avatar', 'aria-hidden': 'true' });
        this.titleEl = h('span', { class: 'pt-ab-title' });
        this.subEl = h('span', { class: 'pt-ab-sub' });
        this.who = h('button', { type: 'button', class: 'pt-ab-who', onclick: () => this.onWhoClick() }, [
            this.avatar,
            h('span', { class: 'pt-ab-text' }, [this.titleEl, this.subEl]),
        ]);
        this.search = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-search',
            'aria-label': t('Find a setting'),
            title: t('Find a setting'),
            onclick: () => openSettingSearch(),
        }, [ui('search')]);
        // Back to the Chats home: closes the chat (SillyTavern's own Close chat). Desktop; a phone has ‹.
        this.home = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-home',
            'aria-label': 'Close the chat',
            title: 'Close the chat',
            onclick: () => goHome(),
        }, [ui('home')]);
        // The chat's ⋯ menu: everything about the open chat (DESIGN.md → The chat).
        this.menu = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-menu',
            'aria-label': 'Chat menu',
            title: 'Chat menu',
            onclick: () => openChatMenu(),
        }, [ui('ellipsis')]);
        this.appbar = h('header', { id: 'pt-appbar', class: 'pt-appbar', 'data-pt': '1' }, [this.back, this.home, this.who, this.search, this.menu]);

        // ---- bottom tab bar
        this.tabs = new Map();
        const tabButtons = TABS.map(tab => {
            const button = h('button', {
                type: 'button',
                class: 'pt-tab',
                'data-tab': tab.id,
                'aria-label': tab.label,
                onclick: () => this.onTab(tab.id),
            }, [
                h('span', { class: 'pt-tab-icon' }, [ui(tab.icon)]),
                h('span', { class: 'pt-tab-label', text: tab.label }),
            ]);
            this.tabs.set(tab.id, button);
            return button;
        });
        // One pill slides between tabs instead of each tab fading its own background.
        this.indicator = h('span', { class: 'pt-tab-indicator', 'aria-hidden': 'true' });
        this.tabbar = h('nav', { id: 'pt-tabbar', class: 'pt-tabbar', 'aria-label': 'Main', 'data-pt': '1' }, [
            this.indicator, ...tabButtons,
        ]);

        for (const el of [this.appbar, this.tabbar]) shieldFromDrawerAutoClose(el);

        document.body.append(this.appbar, this.tabbar);

        // The Characters page switches between list, editor and group views without events.
        // On a phone, picking someone from the list lands in their chat, like a messaging app.
        // On a computer the chat is already beside the page, so the page stays and shows their card.
        this.jumpAt = 0;
        this.onPanelClick = event => {
            const entry = event.target.closest?.('#rm_print_characters_block .character_select, #rm_print_characters_block .group_select');
            const bulk = document.querySelector('#rm_print_characters_block.group_overlay_mode_select');
            if (entry && !bulk && !isWide() && !event.target.closest('.ch_fav_icon, .tag, .bulk_select_checkbox')) {
                this.jumpAt = Date.now();
                // Tapping the character or group you are already chatting with does not change chats.
                const context = ctx();
                const sameChar = entry.dataset.chid !== undefined && context.characterId !== undefined && String(entry.dataset.chid) === String(context.characterId);
                const sameGroup = entry.dataset.grid !== undefined && context.groupId !== undefined && String(entry.dataset.grid) === String(context.groupId);
                if (sameChar || sameGroup) this.after(200, closePages);
            }
            this.after(80, () => this.update());
        };
        document.getElementById('right-nav-panel')?.addEventListener('click', this.onPanelClick);

        // Follow SillyTavern opening and closing its drawers, whoever triggers it.
        this.drawerObserver = new MutationObserver(records => {
            // One page at a time: a drawer SillyTavern (or anyone) just opened replaces Pocket Tavern's own page.
            // (A drawer that is still closing keeps its open class for a moment; that must not count.)
            const opened = records.some(record => record.target.classList.contains('openDrawer') && !String(record.oldValue ?? '').split(/\s+/).includes('openDrawer'));
            // While starting with no chat, SillyTavern reopens its locked Characters panel; the Chats page
            // stays instead. This runs before the browser draws, so the panel never shows.
            const reopened = opened && Date.now() < chatsHome.startUntil && ctx().getCurrentChatId?.() === undefined
                && records.some(record => record.target.id === 'right-nav-panel' && record.target.classList.contains('openDrawer'));
            if (reopened && currentOwnPage() === 'pt-chats') {
                closeDrawers();
                return;
            }
            if (opened && currentOwnPage()) closeOwnPage(true);
            this.update();
            ensurePhoneHome();
            scheduleHistorySync();
        });
        for (const content of document.querySelectorAll('#top-settings-holder > .drawer > .drawer-content')) {
            this.drawerObserver.observe(content, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        }
        window.addEventListener('resize', this.onResize);
        document.addEventListener('focusin', this.onFocusIn);
        document.addEventListener('focusout', this.onFocusOut);
        const chat = document.getElementById('chat');
        chat?.addEventListener('touchstart', this.onChatTouchStart, { passive: true });
        chat?.addEventListener('touchmove', this.onChatTouchMove, { passive: true });
        chat?.addEventListener('wheel', this.onChatWheel, { passive: true });
        this.checkKeyboard();
        this.update();
    }

    /**
     * In a chat the tab bar tucks away: it sat right under the message box and
     * caught taps meant for it. The arrow in the message box brings it back.
     */
    syncTuck(animate = false) {
        const root = document.documentElement;
        const can = this.inChat && tabsTuckable();
        if (!can) this.tabsOut = false;
        root.classList.toggle('pt-tabs-tuckable', can);
        this.setTucked(can && !this.tabsOut, animate);
        syncTabsButton();
    }

    setTucked(on, animate) {
        const root = document.documentElement;
        if (root.classList.contains('pt-tabs-tucked') === on) return;
        const form = document.getElementById('form_sheld');
        const chat = document.getElementById('chat');
        const atBottom = !!chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
        const glide = animate && motionAllowed() && form && !root.classList.contains('pt-keyboard');
        const before = glide ? form.getBoundingClientRect().top : 0;
        root.classList.toggle('pt-tabs-tucked', on);
        if (atBottom) chat.scrollTop = chat.scrollHeight;
        if (!glide) return;
        // Coming back it slides up from the bottom edge (going away, CSS slides it down).
        if (!on) this.tabbar.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 220, easing: EASE });
        // The message box (and the newest message above it) glide to their new place with the tabs.
        const shift = form.getBoundingClientRect().top - before;
        if (Math.abs(shift) < 4) return;
        const frames = [{ transform: `translate3d(0, ${-shift}px, 0)` }, { transform: 'none' }];
        const timing = { duration: 220, easing: EASE };
        form.animate(frames, timing);
        if (atBottom) chat.animate(frames, timing);
    }

    /** The arrow in the message box: show the tabs, or put them away again. */
    toggleTabs() {
        this.tabsOut = document.documentElement.classList.contains('pt-tabs-tucked');
        this.syncTuck(true);
    }

    tuckAgain() {
        if (!this.tabsOut) return;
        this.tabsOut = false;
        this.syncTuck(true);
    }

    destroy() {
        this.destroyed = true;
        window.clearTimeout(this.settleTimer);
        for (const id of this.timers) window.clearTimeout(id);
        this.timers.clear();
        document.getElementById('right-nav-panel')?.removeEventListener('click', this.onPanelClick);
        this.drawerObserver?.disconnect();
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('focusin', this.onFocusIn);
        document.removeEventListener('focusout', this.onFocusOut);
        const chat = document.getElementById('chat');
        chat?.removeEventListener('touchstart', this.onChatTouchStart);
        chat?.removeEventListener('touchmove', this.onChatTouchMove);
        chat?.removeEventListener('wheel', this.onChatWheel);
        this.tuckPending = false;
        this.endGlide();
        closeOwnPage(true);
        this.appbar.remove();
        this.tabbar.remove();
        const root = document.documentElement;
        root.classList.remove('pt-page-open', 'pt-keyboard', 'pt-prompt-editor', 'pt-prompt-full', 'pt-tabs-tucked', 'pt-tabs-tuckable');
        syncTabsButton();
        delete root.dataset.ptPage;
    }

    /**
     * The on-screen keyboard opened or closed (Android shrinks the window for it).
     * The tab bar steps aside, and the chat and the message box slide together,
     * as one piece, to their new place, so nothing jumps and nothing gaps.
     */
    checkKeyboard() {
        const root = document.documentElement;
        if (root.classList.contains('pt-desktop')) {
            this.endGlide();
            root.classList.remove('pt-keyboard');
            this.lastHeight = window.innerHeight;
            return;
        }
        const height = window.innerHeight;
        const keyboard = keyboardUp();
        const was = root.classList.contains('pt-keyboard');
        const before = this.lastHeight;
        this.lastHeight = height;
        if (height === before && keyboard === was) return;
        const sheld = document.getElementById('sheld');
        const chat = document.getElementById('chat');
        this.endGlide();
        // Where the chat ended on the screen before: the window already has its
        // new height here, so take the change back out.
        const oldBottom = sheld ? sheld.getBoundingClientRect().bottom - (height - before) : 0;
        root.classList.toggle('pt-keyboard', keyboard);
        // Tabs that were out when you started typing go away with the keyboard, in the same frame.
        if (keyboard && this.tuckPending) {
            this.tuckPending = false;
            this.syncTuck();
        }
        if (!sheld || !chat) return;
        const shift = Math.round(sheld.getBoundingClientRect().bottom - oldBottom);
        // Reading the newest message: stay there. (Further up, SillyTavern itself
        // keeps the line at the bottom edge in place when the chat changes height.)
        // (Known while the jump-to-newest button watches the chat; otherwise assume so, as before.)
        const wasAtBottom = atBottom();
        const keepBottom = () => {
            if (wasAtBottom) chat.scrollTop = chat.scrollHeight;
        };
        keepBottom();
        const glide = Math.abs(shift) >= 8 && motionAllowed() && !IS_IOS
            && !root.classList.contains('pt-editing') && !currentPageId() && !sheet;
        if (!glide) return;
        const timing = { duration: 240, easing: EASE };
        if (shift < 0) {
            // Opening: the chat keeps its old height while it slides up (the top
            // goes under the top bar), then takes its new height when it lands.
            const tall = `${sheld.offsetHeight - shift}px`;
            sheld.style.setProperty('height', tall, 'important');
            sheld.style.setProperty('max-height', tall, 'important');
            keepBottom();
            this.glide = sheld.animate([{ transform: 'none' }, { transform: `translate3d(0, ${shift}px, 0)` }], timing);
            this.glideLand = keepBottom;
        } else {
            // Closing: the chat already has its new height; it starts where it
            // was and slides down, showing more of the chat above.
            this.glide = sheld.animate([{ transform: `translate3d(0, ${-shift}px, 0)` }, { transform: 'none' }], timing);
            this.glideLand = null;
        }
        this.glide.onfinish = () => this.endGlide();
        this.glide.oncancel = () => this.endGlide();
    }

    /** Ends a keyboard slide: the chat back to its normal size, in place. */
    endGlide() {
        if (!this.glide) return;
        const sheld = document.getElementById('sheld');
        this.glide.cancel();
        this.glide = null;
        sheld?.style.removeProperty('height');
        sheld?.style.removeProperty('max-height');
        this.glideLand?.();
        this.glideLand = null;
    }

    onTab(id) {
        buzz(6);
        // The prompt editor sits over the Presets page and would stay over the next one.
        if (promptEditorOpen()) {
            if (sheet) closeSheet(true);
            leavePromptEditor(() => this.goTab(id));
            return;
        }
        this.goTab(id);
    }

    goTab(id) {
        // A place you picked yourself is never swapped for Chats by the start-up check (syncChatsHome).
        endStartWindow();
        if (sheet) closeSheet(true);
        // Character Library's panel covers the chat and pages: any tab leaves it.
        if (closeCharacterLibrary() && id === 'chat') return;
        if (id === 'chat') {
            const open = currentPageId();
            // Desktop: the list in the panel beside the chat; Chats again hides it.
            if (isWide()) {
                if (open === 'pt-chats') closePages();
                else openPage('pt-chats');
                return;
            }
            // Phone: the Chats page is the place's screen while no chat is open; with a chat open, the chat.
            if (open === 'pt-chats') scrollOwnPageToTop();
            else if (!open && this.tabsOut) this.tuckAgain();
            else if (ctx().getCurrentChatId?.() === undefined) openPage('pt-chats');
            else closePages();
            return;
        }
        const open = currentPageId();
        // The place you are on (or one of its pages): on desktop that hides the panel, so the chat
        // gets the room; on a phone it goes back to the place's root, or to its top.
        if (open && placeOf(open) === id) {
            if (isWide()) {
                closePages();
                return;
            }
            if (isOwnPage(id)) {
                if (open === id) scrollOwnPageToTop();
                else openPage(id);
                return;
            }
        }
        if (isOwnPage(id)) {
            // Each place keeps its page: coming back opens the page you left it on.
            const last = this.lastInPlace[id];
            openPage(last && drawerById(last) ? last : id);
            return;
        }
        if (open === id) {
            // Tapping the current tab goes "home" within it.
            if (id === 'rightNavHolder') showCharacterList();
            else if (closePageSection()) return;
            else document.querySelector(`#${id} > .drawer-content`)?.scrollTo?.({ top: 0, behavior: 'smooth' });
            return;
        }
        // Switch to the list first, so the page slides in already showing it
        // instead of showing the open character's card and then changing.
        if (id === 'rightNavHolder') showCharacterList();
        openPage(id);
    }

    /**
     * On the rail the pill is placed on the active tab's icon: the rail's tabs are
     * not all the same height, and on a short window the rail scrolls.
     */
    placeRailPill() {
        const button = this.tabs.get(this.railTab);
        const iconBox = button?.querySelector('.pt-tab-icon');
        if (!iconBox || !button.offsetParent) return;
        this.tabbar.style.setProperty('--pt-tab-y', `${button.offsetTop + iconBox.offsetTop}px`);
    }

    setSearchLabel(label) {
        if (this.search.title === label) return;
        this.search.title = label;
        this.search.setAttribute('aria-label', label);
    }

    /** Called when SillyTavern switches chats. */
    onChatChanged() {
        if (this.jumpAt && Date.now() - this.jumpAt < 4000 && currentPageId() === 'rightNavHolder') closePages();
        this.jumpAt = 0;
        this.tabsOut = false;
        this.update();
    }

    onWhoClick() {
        if (currentPageId()) return;
        const context = ctx();
        if (context.groupId || context.characterId !== undefined) openPage('rightNavHolder');
        else {
            showCharacterList();
            openPage('rightNavHolder');
        }
    }

    update() {
        checkCardPeek();
        const pageId = currentPageId();
        // When SillyTavern swaps one drawer for another, none is open for a moment.
        // Wait that out instead of flashing the chat header in between.
        if (!pageId && this.lastPage) {
            window.clearTimeout(this.settleTimer);
            this.settleTimer = window.setTimeout(() => {
                this.lastPage = currentPageId();
                this.render(this.lastPage);
            }, 200);
            return;
        }
        window.clearTimeout(this.settleTimer);
        this.lastPage = pageId;
        this.render(pageId);
    }

    render(pageId) {
        const before = this.titleEl.textContent;
        this.renderContent(pageId);
        // A short slide when the title changes, so moving between pages feels connected.
        if (before && before !== this.titleEl.textContent) {
            // Two classes with the same animation: switching restarts it without forcing a layout.
            this.swapFlip = !this.swapFlip;
            this.who.classList.toggle('pt-ab-swap', this.swapFlip);
            this.who.classList.toggle('pt-ab-swap-b', !this.swapFlip);
        }
    }

    renderContent(pageId) {
        const root = document.documentElement;
        // Settings and Formatting open on their list of sections again next time.
        for (const nav of PAGE_SECTIONS) if (nav.pageId !== pageId) nav.reset();
        root.classList.toggle('pt-page-open', !!pageId);
        if (pageId) root.dataset.ptPage = pageId;
        else delete root.dataset.ptPage;

        const wide = isWide();
        const tabId = placeOf(pageId);
        if (pageId) this.lastInPlace[tabId] = pageId;
        // A place's root has its title only; a page pushed in a place gets ‹ (DESIGN.md → Headers).
        this.appbar.classList.toggle('pt-ab-root', !!pageId && (tabId === pageId || pageId === 'pt-chats'));
        this.tabbar.style.setProperty('--pt-tab-index', String(TABS.findIndex(tab => tab.id === tabId)));
        for (const [id, button] of this.tabs) {
            const on = id === tabId;
            button.classList.toggle('pt-tab-on', on);
            if (on) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
        this.railTab = tabId;
        if (wide) this.placeRailPill();

        if (pageId && !(wide && pageId === 'pt-chats')) {
            const drawer = drawerById(pageId);
            if (drawer && settings.touchSizing) {
                requestAnimationFrame(() => fillRanges(drawer));
                addSliderSteppers(drawer);
                pageSections(pageId)?.sync();
                if (SEARCH_PAGES.includes(pageId)) {
                    describeSettings(drawer);
                    // Presets and API fill parts of their page a moment later.
                    setTimeout(() => describeSettings(drawer), 600);
                }
                if (pageId === 'extensions-settings-button') describeExtensions();
                if (pageId === 'ai-config-button') {
                    syncPresetTabs();
                    // Chat Completion Tabs builds its own tabs up to 2 seconds after an API switch; ours step aside then.
                    setTimeout(syncPresetTabs, 2500);
                }
            }
            if (pageId === 'backgrounds-button' || pageId === 'user-settings-button') syncThemeNotes();
            const info = drawer ? pageInfo(drawer) : (pageSpec(pageId) ?? { title: '', icon: 'fa-gear' });
            // The AI page shows a banner while there is no connection: draw it again when that changes.
            if (pageId === 'pt-ai' && this.aiConnected !== isConnected()) {
                this.aiConnected = isConnected();
                refreshOwnPage();
            }
            syncLorebookMode(pageId);
            if (pageId === LOREBOOK_PAGE && wiPage.mode === 'settings') this.titleEl.textContent = t('Activation settings');
            else if (pageId === LOREBOOK_PAGE && editedLorebook()) this.titleEl.textContent = editedLorebook();
            else if (typeof info.rawTitle === 'function') this.titleEl.textContent = info.rawTitle();
            else this.titleEl.textContent = t(info.title);
            this.subEl.textContent = t(info.long ?? '');
            this.subEl.classList.remove('pt-ab-offline');
            // Switch back to "Presets" as soon as the editor starts sliding away.
            const editorMode = promptEditorOpen() ? promptEditorMode() : null;
            root.classList.toggle('pt-prompt-editor', !!editorMode);
            if (editorMode === 'edit') {
                const name = document.getElementById('completion_prompt_manager_popup_entry_form_name')?.value?.trim();
                this.titleEl.textContent = t('Edit prompt');
                this.subEl.textContent = name || t('New prompt');
            } else if (editorMode === 'inspect') {
                this.titleEl.textContent = t('Prompt list');
                this.subEl.textContent = t('Prompts linked to this marker');
            }
            if (pageId === 'rightNavHolder') {
                syncCharacterPage();
                const editing = isShown(document.getElementById('rm_ch_create_block'));
                const name = document.getElementById('character_name_pole')?.value?.trim();
                if (editing) this.subEl.textContent = name ? t('Editing {name}', { name }) : t('New character');
                else if (isShown(document.getElementById('rm_group_chats_block'))) this.subEl.textContent = t('Group chat');
            }
            let headIcon = info.icon;
            const sections = pageSections(pageId);
            const section = sections?.current();
            if (section) {
                this.titleEl.textContent = section.raw ? section.title : t(section.title);
                this.subEl.textContent = t(sections.pageTitle);
                headIcon = section.icon;
            }
            this.search.hidden = !SEARCH_PAGES.includes(pageId) || !!editorMode;
            this.setSearchLabel(t('Find a setting'));
            this.menu.hidden = true;
            this.appbar.classList.remove('pt-ab-chat');
            this.avatar.replaceChildren(ui(headIcon));
            this.avatar.classList.add('pt-ab-avatar-icon');
            this.who.disabled = true;
            this.appbar.classList.add('pt-ab-page');
            this.inChat = false;
            this.syncTuck();
            return;
        }

        this.appbar.classList.remove('pt-ab-page');
        root.classList.remove('pt-prompt-editor');
        this.who.disabled = false;
        const context = ctx();
        let name = t('Chats');
        let image = null;
        let hasChat = false;
        if (context.groupId) {
            const group = context.groups?.find(g => String(g.id) === String(context.groupId));
            name = group?.name ?? t('Group chat');
            hasChat = true;
        } else if (context.characterId !== undefined && context.characters?.[context.characterId]) {
            const character = context.characters[context.characterId];
            name = character.name;
            image = character.avatar && character.avatar !== 'none'
                ? (context.getThumbnailUrl?.('avatar', character.avatar) ?? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`)
                : null;
            hasChat = true;
        }
        this.titleEl.textContent = name;
        // The header never shows connection state (DESIGN.md); problems get a banner and a dot on AI.
        this.subEl.textContent = '';
        this.subEl.classList.remove('pt-ab-offline');
        this.avatar.classList.remove('pt-ab-avatar-icon');
        if (image) {
            const existingImg = this.avatar.firstElementChild;
            if (!(existingImg instanceof HTMLImageElement) || existingImg.getAttribute('src') !== image) {
                this.avatar.replaceChildren(h('img', { src: image, alt: '' }));
            }
        } else {
            this.avatar.replaceChildren(ui(context.groupId ? 'users' : (hasChat ? 'user' : 'chats')));
        }
        // In a chat: ⋯. Search everything is the field on the Chats page.
        this.menu.hidden = !hasChat;
        this.search.hidden = true;
        this.appbar.classList.toggle('pt-ab-chat', hasChat);
        this.inChat = hasChat;
        this.syncTuck();
    }
}

function tabsTuckable() {
    const root = document.documentElement;
    return active && settings.appShell && settings.chatStyle && settings.hideTabsInChat && !root.classList.contains('pt-desktop');
}

function syncTabsButton() {
    const button = composer.tabs;
    if (!button) return;
    const tucked = document.documentElement.classList.contains('pt-tabs-tucked');
    const label = t(tucked ? 'Show tabs' : 'Hide tabs');
    button.setAttribute('aria-expanded', String(!tucked));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.classList.toggle('pt-tabs-btn-out', !tucked);
}

function syncShell() {
    const want = active && settings.appShell;
    if (want && !shell) shell = new Shell();
    else if (!want && shell) {
        shell.destroy();
        shell = null;
    }
}

// ------------------------------------------------------------ slider fill

/** SillyTavern leaves the slider's filled part at a fixed width; make it follow the value. */
function updateRangeFill(input) {
    const min = input.min === '' ? 0 : Number(input.min);
    const max = input.max === '' ? 100 : Number(input.max);
    const value = Number(input.value);
    const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
    input.style.setProperty('--pt-fill', `${percent.toFixed(1)}%`);
}

function fillRanges(root = document) {
    for (const input of root.querySelectorAll('input[type="range"]')) updateRangeFill(input);
}

function watchRanges(on) {
    const $ = $j();
    $(document).off('.ptRange');
    if (on) {
        // jQuery delegation sees both real input and SillyTavern's own .trigger('input').
        $(document).on('input.ptRange change.ptRange', 'input[type="range"]', function () {
            updateRangeFill(this);
        });
        fillRanges();
    } else {
        for (const input of document.querySelectorAll('input[type="range"]')) input.style.removeProperty('--pt-fill');
    }
}

// ------------------------------------------------------------ appearance

function ensureStyle(id) {
    let element = document.getElementById(id);
    if (!element) {
        element = h('style', { id });
        document.head.append(element);
    }
    return element;
}

let originalThemeColor;
let themeColorCall = 0;

/** Android's status bar follows <meta name="theme-color">; match it to the app bar. */
function syncThemeColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (originalThemeColor === undefined) originalThemeColor = meta ? meta.getAttribute('content') : null;
    if (!active) {
        if (meta && originalThemeColor === null) meta.remove();
        else if (meta) meta.setAttribute('content', originalThemeColor);
        return;
    }
    if (!meta) {
        meta = h('meta', { name: 'theme-color' });
        document.head.append(meta);
    }
    const call = (themeColorCall += 1);
    if (theme) {
        meta.setAttribute('content', theme.bg);
        return;
    }
    // Reading a CSS color makes the browser restyle the page at once; wait for the next frame instead.
    const target = meta;
    requestAnimationFrame(() => {
        if (!active || !target.isConnected || call !== themeColorCall) return;
        const own = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim();
        target.setAttribute('content', own || '#171717');
    });
}

const TOAST_ICONS = { success: 'circle-check', info: 'info', warning: 'alert-triangle', error: 'alert-circle' };

function toastIconCss() {
    return Object.entries(TOAST_ICONS)
        .map(([type, name]) => `html.pt-toasts #toast-container > .toast-${type} { --pt-t-icon: ${iconUrl(name)}; }`)
        .join(' ')
        // A grey magnifier drawn inside search boxes.
        + ` html.pt-on { --pt-search-icon: ${iconUrl('search', '#909090')}; --pt-think-icon: ${iconUrl('bulb')}; --pt-regen-icon: ${iconUrl('refresh')}; --pt-chev-down-icon: ${iconUrl('chevron-down')}; --pt-chev-up-icon: ${iconUrl('chevron-up')}; --pt-info-icon: ${iconUrl('info')}; --pt-warn-icon: ${iconUrl('alert-triangle')}; --pt-error-icon: ${iconUrl('alert-circle')}; --pt-ok-icon: ${iconUrl('circle-check')}; }`;
}

/** A Pocket Tavern theme (not a SillyTavern one): only these have a background of their own. */
function ownThemeOn() {
    return !!findTheme(settings.theme);
}

/** True when a chat background picture is set (not SillyTavern's empty "transparent" one). */
function chatBackgroundSet() {
    for (const id of ['bg_custom', 'bg1']) {
        const element = document.getElementById(id);
        // The picture SillyTavern set on it: its computed value still shows the old one while it fades over.
        const image = element ? element.style.backgroundImage || getComputedStyle(element).backgroundImage : 'none';
        if (/url\(/.test(image) && !/__transparent/.test(image)) return true;
    }
    return false;
}

/**
 * A chat background shows (html.pt-glass): the chat turns clear and messages
 * become tinted cards over the picture. Off when a Pocket Tavern theme shows its
 * own background, or when no background picture is set.
 */
function syncGlass() {
    const root = document.documentElement;
    const own = active && ownThemeOn() && settings.themeBackdrop;
    root.classList.toggle('pt-glass', active && !own && chatBackgroundSet());
}

const glassWatch = { observer: null, frame: 0 };

/** SillyTavern changes the background by restyling #bg1 (or #bg_custom for a chat's own). */
function watchBackground() {
    if (!active) {
        glassWatch.observer?.disconnect();
        glassWatch.observer = null;
        cancelAnimationFrame(glassWatch.frame);
        glassWatch.frame = 0;
        stThemes.observer?.disconnect();
        stThemes.observer = null;
        return;
    }
    if (glassWatch.observer) return;
    const targets = ['bg1', 'bg_custom'].map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    glassWatch.observer = new MutationObserver(() => {
        if (glassWatch.frame) return;
        glassWatch.frame = requestAnimationFrame(() => {
            glassWatch.frame = 0;
            if (active) syncGlass();
        });
    });
    for (const target of targets) glassWatch.observer.observe(target, { attributes: true, attributeFilter: ['style', 'class'] });
}

function applyAppearance() {
    const root = document.documentElement;
    const theme = active ? currentTheme() : null;
    root.classList.toggle('pt-themed', !!theme);
    // SillyTavern's themes have no background of their own: your chat background always shows, as in SillyTavern.
    root.classList.toggle('pt-backdrop', !!theme && ownThemeOn() && settings.themeBackdrop);
    syncGlass();
    watchBackground();
    root.classList.toggle('pt-font', active && settings.modernFont);
    root.classList.toggle('pt-icons', active && settings.customIcons);
    root.classList.toggle('pt-toasts', active && settings.niceToasts);
    for (const level of Object.keys(MOTION_LABELS)) root.classList.toggle(`pt-motion-${level}`, active && settings.motion === level);
    if (theme) root.dataset.ptTheme = theme.id;
    else delete root.dataset.ptTheme;

    if (active) {
        ensureStyle('pt-theme-css').textContent = themeCss(theme, 'html.pt-on.pt-themed') + toastIconCss();
        if (settings.customIcons) {
            const icons = ensureStyle('pt-icons-css');
            if (!icons.textContent) icons.textContent = iconCss('html.pt-icons');
        }
    } else {
        document.getElementById('pt-theme-css')?.remove();
        document.getElementById('pt-icons-css')?.remove();
    }
    syncThemeColor(theme);
    syncChatStyleForTheme();
    watchStThemePicks();
}

/** Runs `change` behind a circular reveal that grows from `origin` (View Transitions). */
function revealChange(origin, change) {
    const root = document.documentElement;
    const canAnimate = typeof document.startViewTransition === 'function'
        && settings.motion === 'full'
        && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canAnimate) {
        change();
        return;
    }
    const rect = origin?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : innerHeight / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('pt-vt');
    // The browser runs the change once it has captured the old look. If that capture
    // is ever delayed (busy or backgrounded page), apply the change anyway.
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        change();
    };
    window.setTimeout(run, 700);
    const transition = document.startViewTransition(run);
    transition.ready.then(() => {
        root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 240, easing: EASE, pseudoElement: '::view-transition-new(root)' },
        );
    }).catch(() => {});
    transition.finished.catch(() => {}).finally(() => root.classList.remove('pt-vt'));
}

function setAppearance(key, value, origin) {
    if (settings[key] === value) return;
    const change = () => {
        settings[key] = value;
        saveSettings();
        applyAppearance();
        syncExtras();
        syncSettingsInputs();
        shell?.update();
        // Switches already show their new state; re-render only what depends on the choice.
        if (sheet && !sheet.picker && ['theme', 'motion', 'textSize', 'chatLook', 'uiSize', 'composerStyle', 'layout'].includes(key)) sheet.refresh();
        // The layout changes the whole interface.
        if (key === 'layout') applyState();
        // Switches and segments on a settings page already show their new state (and keep the filter).
        const page = currentPageId();
        if (!SETTINGS_OWN_PAGES.includes(page) || ['theme', 'layout', 'chatLook'].includes(key)) refreshOwnPage();
    };
    if (key === 'theme') revealChange(origin, change);
    else change();
}

// -- SillyTavern's UI themes as Pocket Tavern themes

/** The SillyTavern themes on the server (loaded when the Themes sheet opens) and the converted chosen one. */
const stThemes = { list: null, loading: null, observer: null, made: { key: '', theme: null } };

/** The colors Pocket Tavern keeps of a SillyTavern theme, saved with the choice so it applies at once on the next start. */
function stThemeColors(raw) {
    return { name: raw.name, ...Object.fromEntries(ST_THEME_COLORS.map(key => [key, raw[key] ?? null])) };
}

/** The theme in use: one of Pocket Tavern's, a SillyTavern theme made to fit, or null for "Your theme". */
function currentTheme() {
    const id = settings.theme;
    const own = findTheme(id);
    if (own || typeof id !== 'string' || !id.startsWith('st:')) return own;
    const saved = settings.stTheme;
    if (!saved || `st:${saved.name}` !== id) return null;
    const key = JSON.stringify(saved);
    if (stThemes.made.key !== key) stThemes.made = { key, theme: themeFromSillyTavern(saved) };
    return stThemes.made.theme;
}

/** Asks SillyTavern for its saved UI themes (the same request it makes when it starts). */
function loadSillyTavernThemes(force = false) {
    if (stThemes.loading && !force) return stThemes.loading;
    stThemes.loading = (async () => {
        try {
            const response = await fetch('/api/settings/get', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({}) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            stThemes.list = (Array.isArray(data?.themes) ? data.themes : []).filter(theme => theme && typeof theme.name === 'string' && theme.name);
        } catch (error) {
            console.warn(LOG, 'Could not load SillyTavern themes', error);
            stThemes.loading = null;
            return stThemes.list ?? [];
        }
        // The chosen one may have been changed in SillyTavern since: keep its colors current.
        const chosen = stThemes.list.find(theme => `st:${theme.name}` === settings.theme);
        if (chosen && JSON.stringify(stThemeColors(chosen)) !== JSON.stringify(settings.stTheme)) {
            settings.stTheme = stThemeColors(chosen);
            saveSettings();
            applyAppearance();
        }
        return stThemes.list;
    })();
    return stThemes.loading;
}

/** SillyTavern's own "Import a theme file" (its button is hidden in Settings → Look while Pocket Tavern is on). */
function importSillyTavernTheme(refresh) {
    const select = document.getElementById('themes');
    const button = document.getElementById('ui_preset_import_button');
    if (!button) return;
    // SillyTavern adds the imported theme to its list; then the sheet shows it too.
    if (select && !stThemes.observer) {
        stThemes.observer = new MutationObserver(() => {
            stThemes.observer?.disconnect();
            stThemes.observer = null;
            loadSillyTavernThemes(true).then(refresh);
        });
        stThemes.observer.observe(select, { childList: true });
    }
    button.click();
}

const extras = {
    wired: false,
    formObserver: null,
    wakeLock: null,
    generating: false,
    wakeTimer: 0,
    draftTimer: 0,
    draftKey: null,
    personaObserver: null,
};

function motionAllowed() {
    return settings.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A short vibration. Android only allows it right after a tap. */
function buzz(pattern = 10) {
    // Chrome logs an error for vibrate() without a real tap (for example a scripted click).
    if (active && settings.haptics && navigator.userActivation?.isActive !== false) {
        try {
            navigator.vibrate?.(pattern);
        } catch {
            // Not allowed here; nothing to do.
        }
    }
}

/** A short press on the send button when you send (Light motion and Smooth alike). */
function playSendFx(button) {
    if (!active || !settings.sendEffect || !settings.chatStyle || !motionAllowed()) return;
    button.classList.remove('pt-launch');
    void button.offsetWidth;
    button.classList.add('pt-launch');
    window.clearTimeout(playSendFx.timer);
    playSendFx.timer = window.setTimeout(() => button.classList.remove('pt-launch'), 300);
}

function onSendPointerDown(event) {
    if (!active || event.button > 0) return;
    if (event.target.closest?.('#send_but')) buzz(12);
}

function onSendClick(event) {
    if (!active) return;
    const button = event.target.closest?.('#send_but');
    if (button) playSendFx(button);
}

// -- drafts

function draftKeyNow() {
    const context = ctx();
    const chatId = context.getCurrentChatId?.() ?? context.chatId;
    if (!chatId) return null;
    const owner = context.groupId ? `g:${context.groupId}` : (context.characterId !== undefined ? `c:${context.characters?.[context.characterId]?.avatar ?? context.characterId}` : null);
    return owner ? `pt_draft:${owner}:${chatId}` : null;
}

function readDraft(key) {
    try {
        return key ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

function writeDraft(key, value) {
    if (!key) return;
    try {
        if (value && value.trim()) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch {
        // Storage full or blocked: drafts are a convenience only.
    }
}

/**
 * Opening a chat made SillyTavern focus the message box, which pops up the
 * keyboard. For a short while after a chat opens, the box only takes focus
 * when you tapped it yourself.
 */
const focusGuard = { until: 0, tapped: 0, target: null, at: 0 };

/** Where SillyTavern (and Pocket Tavern) put text you edit. */
const EDIT_AREAS = '#chat, #WorldInfo, #world_popup, #completion_prompt_manager_popup, #persona-management-block, #rm_ch_create_block, #pt-sheet';

function guardKeyboard(ms = 2500) {
    focusGuard.until = Date.now() + ms;
}

function onFocusGuardPointer(event) {
    if (!active || isWide()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    focusGuard.target = target;
    focusGuard.at = Date.now();
    if (target.closest('#send_form')) focusGuard.tapped = Date.now();
    // Opening a chat from a list: the focus that follows is not yours.
    else if (target.closest('.pt-chat-row-main, .character_select, .group_select, .select_chat_block, .pt-choice, .pt-search-hit')) guardKeyboard(3500);
}

function onFocusGuardFocus(event) {
    const box = event.target;
    if (!active || isWide() || !(box instanceof HTMLTextAreaElement)) return;
    if (box.dataset.ptCopy) return;
    const now = Date.now();
    if (box.id === 'send_textarea') {
        if (now < focusGuard.until && now - focusGuard.tapped > 1200) box.blur();
        return;
    }
    // Any other text box (editing a message, its thinking, a persona, a lorebook
    // entry...): when it took focus right after you tapped something else, like
    // ✎ Edit, keep the keyboard down. Tap the box itself to type.
    // Only real edit areas: SillyTavern's copy trick focuses a short-lived box of its own and must keep working.
    if (!box.closest(EDIT_AREAS)) return;
    const tappedElsewhere = focusGuard.target && now - focusGuard.at < 1500 && !box.contains(focusGuard.target);
    if (tappedElsewhere) box.blur();
}

function onDraftInput(event) {
    if (!active || !settings.saveDrafts || event.target?.id !== 'send_textarea') return;
    window.clearTimeout(extras.draftTimer);
    const value = event.target.value;
    const key = extras.draftKey ?? draftKeyNow();
    extras.draftTimer = window.setTimeout(() => writeDraft(key, value), 400);
}

/** Called when the chat changes: put away the old chat's draft and bring back this one's. */
function restoreDraft() {
    if (!active || !settings.saveDrafts) return;
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;
    window.clearTimeout(extras.draftTimer);
    const previous = extras.draftKey;
    const next = draftKeyNow();
    extras.draftKey = next;
    if (previous && previous === next) return;
    let changed = false;
    const current = textarea.value;
    if (current.trim()) {
        if (previous) writeDraft(previous, current);
        // SillyTavern keeps one copy of the box across reloads; if that text is
        // another chat's draft, it stays saved there instead of following you here.
        const owner = previous || draftKeyWithText(current, next);
        if (owner && owner !== next && readDraft(owner) === current) {
            textarea.value = '';
            changed = true;
        }
    } else if (previous) {
        // User cleared the box and switched chats before the 400ms debounce fired.
        writeDraft(previous, '');
    }
    const saved = readDraft(next);
    if (saved && !textarea.value.trim()) {
        textarea.value = saved;
        changed = true;
    }
    // Let SillyTavern resize the box and update its own saved copy.
    if (changed) textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function draftKeyWithText(text, except) {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('pt_draft:') && key !== except && localStorage.getItem(key) === text) return key;
        }
    } catch {
        // Storage blocked.
    }
    return null;
}

function clearDraft() {
    window.clearTimeout(extras.draftTimer);
    writeDraft(extras.draftKey ?? draftKeyNow(), '');
}

// -- keep the screen on while a reply streams in

async function setAwake(on) {
    window.clearTimeout(extras.wakeTimer);
    if (!on) {
        extras.wakePending = false;
        const lock = extras.wakeLock;
        extras.wakeLock = null;
        lock?.release?.().catch(() => {});
        return;
    }
    if (!active || !settings.keepAwake || extras.wakeLock || extras.wakePending || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    extras.wakePending = true;
    try {
        const lock = await navigator.wakeLock.request('screen');
        extras.wakePending = false;
        if (!active || !settings.keepAwake || !extras.generating || document.visibilityState !== 'visible') {
            lock?.release?.().catch(() => {});
            return;
        }
        extras.wakeLock = lock;
        lock.addEventListener('release', () => {
            if (extras.wakeLock === lock) extras.wakeLock = null;
        });
        // Never hold the screen on forever if an end event goes missing.
        extras.wakeTimer = window.setTimeout(() => setAwake(false), 10 * 60 * 1000);
    } catch {
        extras.wakePending = false;
        // Not allowed (battery saver, insecure page): just skip it.
    }
}

function onGenerating(on) {
    extras.generating = on;
    updateJump();
    setAwake(on);
}

function onVisibility() {
    // Android drops the lock when you leave the tab; take it back on return.
    if (document.visibilityState === 'visible' && extras.generating) setAwake(true);
}

// -- message menu

const MESSAGE_ACTION_ORDER = ['mes_copy', 'mes_edit', 'mes_swipe_picker', 'mes_create_branch', 'mes_create_bookmark', 'mes_hide', 'mes_unhide', 'mes_translate', 'mes_narrate', 'sd_message_gen', 'mes_embed', 'mes_prompt'];

function messageActionLabel(button) {
    const title = (button.getAttribute('title') || '').split('\n')[0].trim();
    if (title) return title;
    if (button.classList.contains('mes_bookmark')) return 'Open checkpoint';
    return 'Action';
}

/**
 * In edit mode SillyTavern's ⧉ button duplicates the message, and the copy lands
 * below a long message, off screen, so it looks like nothing happened. Ask which
 * one you meant: copy the text, or duplicate the message.
 */
let passEditCopy = false;

function onEditCopyClick(event) {
    if (!active || !settings.messageMenu) return;
    const button = event.target.closest?.('#chat .mes_edit_copy');
    if (!button) return;
    if (passEditCopy) {
        passEditCopy = false;
        return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(8);
    const message = button.closest('.mes');
    const textOf = () => message?.querySelector('.edit_textarea, #curEditTextarea')?.value ?? '';
    showSheet(new MenuSheet({
        title: 'Copy',
        subtitle: 'What would you like to do?',
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, [
            h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: async () => {
                    const text = textOf();
                    closeSheet(true);
                    const ok = await copyText(text);
                    if (ok) globalThis.toastr?.success(t('Text copied.'), '', { timeOut: 2000 });
                    else globalThis.toastr?.error(t('Your browser blocked copying. Select the text and copy it instead.'), t('Could not copy'));
                },
            }, [ui('copy', 'pt-menu-row-icon'), h('span', { class: 'pt-row-text' }, [
                h('span', { text: 'Copy text' }),
                h('small', { text: 'Put the message text on the clipboard.' }),
            ])]),
            h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: () => {
                    closeSheet(true);
                    const chatId = ctx().getCurrentChatId?.();
                    const count = ctx().chat?.length ?? 0;
                    passEditCopy = true;
                    try {
                        button.click();
                    } finally {
                        passEditCopy = false;
                    }
                    // Say where the copy went once SillyTavern has added it.
                    const check = (tries = 0) => {
                        if (!active || ctx().getCurrentChatId?.() !== chatId) return;
                        if ((ctx().chat?.length ?? 0) > count) globalThis.toastr?.success(t('A copy of the message was added right below it.'), '', { timeOut: 3000 });
                        else if (tries < 40) setTimeout(() => check(tries + 1), 250);
                    };
                    check();
                },
            }, [ui('file-plus', 'pt-menu-row-icon'), h('span', { class: 'pt-row-text' }, [
                h('span', { text: 'Duplicate message' }),
                h('small', { text: 'Add a second copy of this message to the chat, right below it.' }),
            ])]),
        ])),
    }));
}

function onMessageMenuClick(event) {
    if (!active || !settings.messageMenu) return;
    const hint = event.target.closest?.('#chat .extraMesButtonsHint');
    if (!hint) return;
    const message = hint.closest('.mes');
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(8);
    openMessageMenu(message);
}

/**
 * Copies text even where the browser has no clipboard API: SillyTavern opened by a
 * network address (http://192.168...) is not a "secure" page, so Chrome hides it.
 */
function copyWithFallback(text) {
    const area = h('textarea', { readonly: '', 'aria-hidden': 'true', 'data-pt-copy': '1' });
    area.value = text;
    // Off screen, 16px so Android does not zoom, inside the topmost open dialog so it can be focused.
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
    const openDialogs = document.querySelectorAll('dialog[open]');
    (openDialogs[openDialogs.length - 1] ?? document.body).append(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    area.remove();
    return ok;
}

async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission refused: try the old way below.
        }
    }
    return copyWithFallback(text);
}

/** SillyTavern's own Copy reads the raw message text; do the same. */
async function copyMessage(message) {
    const id = Number(message.getAttribute('mesid'));
    const text = ctx().chat?.[id]?.mes ?? message.querySelector('.mes_text')?.innerText ?? '';
    const ok = await copyText(text);
    if (ok) globalThis.toastr?.success(t('Message copied.'), '', { timeOut: 2000 });
    else globalThis.toastr?.error(t('Your browser blocked copying. Long-press the text to copy it instead.'), t('Could not copy'));
}

/**
 * Without a secure page there is no navigator.clipboard at all, so every copy
 * button in SillyTavern fails quietly. Give it one that uses the old method.
 */
function patchClipboard() {
    if (navigator.clipboard || window.isSecureContext) return;
    try {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                pt: true,
                writeText: text => (copyWithFallback(String(text)) ? Promise.resolve() : Promise.reject(new Error('Copy failed'))),
                // Reading needs a secure page; fail the way a browser would instead of throwing "not a function".
                readText: () => Promise.reject(new DOMException('Reading the clipboard needs HTTPS', 'NotAllowedError')),
            },
        });
    } catch {
        // Read-only in this browser; our own Copy still works.
    }
}

/** Turning Pocket Tavern off takes back the stand-in clipboard. */
function unpatchClipboard() {
    if (!navigator.clipboard?.pt) return;
    try {
        delete navigator.clipboard;
    } catch {
        // Could not be removed; it only copies text, so leaving it is harmless.
    }
}

function openMessageMenu(message) {
    const name = message.getAttribute('ch_name') || 'Message';
    const preview = (message.querySelector('.mes_text')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const run = button => {
        closeSheet(true);
        if (button.classList.contains('mes_copy')) {
            copyMessage(message);
            return;
        }
        // Some SillyTavern buttons listen for pointerup rather than click; send both.
        button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
        button.click();
    };
    showSheet(new MenuSheet({
        title: name,
        subtitle: preview.length > 90 ? `${preview.slice(0, 90)}…` : preview,
        fill: body => {
            if (!message.isConnected) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'This message is no longer in the chat.' }));
                return;
            }
            const buttons = Array.from(message.querySelectorAll('.mes_buttons .mes_button'))
                .filter(button => !button.classList.contains('extraMesButtonsHint') && getComputedStyle(button).display !== 'none');
            const rank = button => {
                const index = MESSAGE_ACTION_ORDER.findIndex(name => button.classList.contains(name));
                return index === -1 ? 50 : index;
            };
            buttons.sort((a, b) => rank(a) - rank(b));
            const rows = buttons.map(button => {
                const faClass = Array.from(button.classList).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-fw', 'fa-xs', 'fa-sm', 'fa-lg'].includes(name));
                return h('button', { type: 'button', class: 'pt-menu-row', onclick: () => run(button) }, [
                    faClass ? ui(faClass, 'pt-menu-row-icon') : ui('puzzle', 'pt-menu-row-icon'),
                    h('span', { text: messageActionLabel(button) }),
                ]);
            });
            const edit = message.querySelector('.mes_edit');
            if (edit && getComputedStyle(edit).display !== 'none') {
                rows.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row pt-menu-row-danger',
                    onclick: () => {
                        closeSheet(true);
                        // SillyTavern deletes from edit mode and asks to confirm first. The editor
                        // can take a moment to appear on a slow phone, so wait for its Delete.
                        edit.click();
                        const pressDelete = (tries = 0) => {
                            const button = message.querySelector('.mes_edit_delete');
                            if (button) button.click();
                            else if (tries < 30 && message.isConnected) setTimeout(() => pressDelete(tries + 1), 50);
                        };
                        setTimeout(pressDelete, 60);
                    },
                }, [ui('trash', 'pt-menu-row-icon'), h('span', { text: 'Delete message' })]));
            }
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

// -- personas: list and editor on separate tabs

/** The current persona's tools get a short label under their icon, like a character card's. */
const PERSONA_TOOLS = [
    ['#persona_rename_button', 'Rename'],
    ['#sync_name_button', 'Sync name'],
    ['#persona_lore_button', 'Lore'],
    ['#persona_set_image_button', 'Picture'],
    ['#persona_duplicate_button', 'Duplicate'],
    ['#persona_delete_button', 'Delete'],
];

function syncPersonaTabs() {
    const block = document.getElementById('persona-management-block');
    let bar = document.getElementById('pt_persona_tabs');
    const want = active && settings.touchSizing && block;
    // With the new character pages on, personas look like them: picture cards and a card with labeled tools.
    const look = !!(want && settings.charPage);
    document.documentElement.classList.toggle('pt-personapage', look);
    for (const [selector, label] of PERSONA_TOOLS) {
        const button = document.querySelector(selector);
        const tag = button?.querySelector(':scope > .pt-btn-label');
        if (look && button && !tag) button.append(h('span', { class: 'pt-btn-label', text: label }));
        else if (!look) tag?.remove();
    }
    if (!look) document.querySelectorAll('#user_avatar_block :is(.pt-default-badge, .pt-in-use)').forEach(node => node.remove());
    syncPersonaTools(!!want);
    if (!want) {
        bar?.remove();
        document.querySelector('#persona_controls .pt-persona-face')?.remove();
        block?.classList.remove('pt-persona-split', 'pt-persona-edit');
        extras.personaObserver?.disconnect();
        extras.personaObserver = null;
        return;
    }
    if (!bar) {
        const tab = (mode, iconName, label) => h('button', {
            type: 'button',
            role: 'tab',
            class: 'pt-seg',
            'data-mode': mode,
            onclick: () => {
                block.classList.toggle('pt-persona-edit', mode === 'edit');
                updatePersonaTabs();
                block.closest('.drawer-content')?.scrollTo?.({ top: 0 });
            },
        }, [ui(iconName), h('span', { class: 'pt-seg-text', text: label })]);
        bar = h('div', { id: 'pt_persona_tabs', class: 'pt-segmented pt-persona-tabs', role: 'tablist' }, [
            tab('list', 'users', 'All personas'),
            tab('edit', 'pencil', 'Edit current'),
        ]);
        block.before(bar);
        block.classList.add('pt-persona-split');
        // The list re-renders when you pick someone, and the name changes with it.
        extras.personaObserver = new MutationObserver(updatePersonaTabs);
        const name = document.getElementById('your_name');
        const list = document.getElementById('user_avatar_block');
        if (name) extras.personaObserver.observe(name, { childList: true, characterData: true, subtree: true });
        if (list) extras.personaObserver.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    updatePersonaTabs();
}

/**
 * The persona list's tools in one row (DESIGN.md → Personas): ⋯ holds Usage stats, Backup, Restore and Grid view
 * (SillyTavern's own buttons, pressed hidden), and the page controls show only when there is more than one page.
 */
function syncPersonaTools(want) {
    let more = document.getElementById('pt_persona_more');
    const grid = document.getElementById('persona_grid_toggle');
    if (!want || !grid) {
        more?.remove();
        document.getElementById('persona_pagination_container')?.classList.remove('pt-one-page');
        return;
    }
    if (!more) {
        more = h('button', { type: 'button', id: 'pt_persona_more', class: 'pt-icon-button pt-focus pt-press', 'aria-label': 'More actions', title: 'More actions', onclick: () => openPersonaTools(more) }, [ui('ellipsis', 'pt-icon-button-icon')]);
        grid.after(more);
    }
    markPersonaPages();
}

/** Page controls only when the personas do not fit on one page. */
function markPersonaPages() {
    const pages = document.getElementById('persona_pagination_container');
    if (!pages) return;
    const total = Object.keys(ctx().powerUserSettings?.personas ?? {}).length;
    const perPage = Number(pages.querySelector('select')?.value) || Infinity;
    pages.classList.toggle('pt-one-page', total <= perPage);
}

function openPersonaTools(anchor) {
    const press = selector => () => {
        closeSheet(true);
        document.querySelector(selector)?.click();
    };
    const gridOn = !!document.querySelector('#user_avatar_block.gridView');
    showSheet(new MenuSheet({
        title: t('Personas'),
        anchor,
        fill: body => body.append(listGroup({ rows: [
            listRow({ title: 'Usage stats', subtitle: 'How much each persona has written', icon: 'chart', end: 'none', onClick: press('#persona-management-button .user_stats_button') }),
            listRow({ title: 'Backup', subtitle: 'Save every persona to a file', icon: 'file-export', end: 'none', onClick: press('#personas_backup') }),
            listRow({ title: 'Restore', subtitle: 'Bring personas back from a backup file', icon: 'file-import', end: 'none', onClick: press('#personas_restore') }),
            listRow({ title: gridOn ? 'List view' : 'Grid view', subtitle: 'How the personas are shown', icon: gridOn ? 'list' : 'grid', end: 'none', onClick: press('#persona_grid_toggle') }),
        ] })),
    }));
}

function updatePersonaTabs() {
    const block = document.getElementById('persona-management-block');
    const bar = document.getElementById('pt_persona_tabs');
    if (!block || !bar) return;
    markPersonaPages();
    const editing = block.classList.contains('pt-persona-edit');
    const name = document.getElementById('your_name')?.textContent?.trim();
    for (const button of bar.querySelectorAll('.pt-seg')) {
        const on = (button.dataset.mode === 'edit') === editing;
        button.classList.toggle('pt-seg-on', on);
        button.setAttribute('aria-selected', String(on));
        if (button.dataset.mode === 'edit') {
            const label = name && name !== '[Persona Name]' ? t('Edit {name}', { name }) : t('Edit current');
            const text = button.querySelector('.pt-seg-text');
            if (text.textContent !== label) text.textContent = label;
        }
    }
    // Picture cards: a crown on your default persona (SillyTavern only rings its picture in gold).
    if (document.documentElement.classList.contains('pt-personapage')) {
        for (const card of document.querySelectorAll('#user_avatar_block .avatar-container')) {
            // The persona in use says so.
            const inUse = card.querySelector(':scope > .pt-in-use');
            if (card.classList.contains('selected') && !inUse) card.append(h('span', { class: 'pt-in-use', text: 'In use' }));
            else if (!card.classList.contains('selected')) inUse?.remove();
            const badge = card.querySelector(':scope > .pt-default-badge');
            const isDefault = card.classList.contains('default_persona');
            if (isDefault && !badge) card.append(h('span', { class: 'pt-default-badge', title: t('Default persona'), 'aria-label': t('Default persona') }, [ui('crown')]));
            else if (!isDefault && badge) badge.remove();
        }
    }
    // The current persona's picture next to its name.
    const controls = document.getElementById('persona_controls');
    const src = document.querySelector('#user_avatar_block .avatar-container.selected img')?.getAttribute('src');
    if (controls) {
        let face = controls.querySelector('.pt-persona-face');
        if (!face) {
            face = h('span', { class: 'pt-persona-face', 'aria-hidden': 'true' }, [h('img', { alt: '' })]);
            controls.prepend(face);
        }
        const img = face.querySelector('img');
        face.hidden = !src;
        if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    }
}

// -- notifications: swipe one sideways to dismiss it

const toastSwipe = { el: null, x: 0, dx: 0 };

function onToastTouchStart(event) {
    if (!active || !settings.niceToasts) return;
    const toast = event.target.closest?.('#toast-container > .toast');
    if (!toast || event.touches.length !== 1) return;
    toastSwipe.el = toast;
    toastSwipe.x = event.touches[0].clientX;
    toastSwipe.dx = 0;
    toast.style.transition = 'none';
}

function onToastTouchMove(event) {
    const toast = toastSwipe.el;
    if (!toast) return;
    toastSwipe.dx = event.touches[0].clientX - toastSwipe.x;
    toast.style.transform = `translateX(${toastSwipe.dx}px)`;
    toast.style.opacity = String(Math.max(0.2, 1 - Math.abs(toastSwipe.dx) / 260));
}

function onToastTouchEnd() {
    const toast = toastSwipe.el;
    if (!toast) return;
    toastSwipe.el = null;
    toast.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
    if (Math.abs(toastSwipe.dx) > 80) {
        toast.style.transform = `translateX(${toastSwipe.dx > 0 ? 120 : -120}%)`;
        toast.style.opacity = '0';
        setTimeout(() => {
            const toastr = globalThis.toastr;
            if (toastr?.clear) toastr.clear($j()(toast), { force: true });
            else toast.remove();
        }, 200);
    } else {
        toast.style.transform = '';
        toast.style.opacity = '';
    }
}

// -- picture viewer for chat avatars

let viewer = null;

/** The full-size picture behind a chat thumbnail, where SillyTavern serves one. */
function fullImageUrl(thumb) {
    try {
        const url = new URL(thumb, location.href);
        if (url.pathname.endsWith('/thumbnail')) {
            const file = url.searchParams.get('file');
            const type = url.searchParams.get('type');
            if (file && type === 'avatar') return `/characters/${encodeURIComponent(file)}`;
            if (file && type === 'persona') return `/User Avatars/${encodeURIComponent(file)}`;
        }
    } catch {
        // Not a URL we understand; use it as is.
    }
    return thumb;
}

function onAvatarClick(event) {
    if (!active || !settings.imageViewer) return;
    const avatar = event.target.closest?.('#chat .mes .avatar');
    const img = avatar?.querySelector('img');
    if (!img?.getAttribute('src')) return;
    // Stop SillyTavern's small floating window from opening as well.
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(8);
    const message = avatar.closest('.mes');
    const shown = img.getAttribute('src');
    // Sharp pictures put a small scaled copy (a blob: URL) in the avatar; the
    // thumbnail SillyTavern asked for still tells us which original to open.
    const source = shown.startsWith('blob:') && img.dataset.ptThumb ? img.dataset.ptThumb : shown;
    openViewer({
        thumb: shown,
        full: fullImageUrl(source),
        title: message?.getAttribute('ch_name') || 'Picture',
    });
}

class Viewer {
    constructor({ thumb, full, title }) {
        this.full = full;
        this.title = title;
        this.closing = false;
        this.state = { scale: 1, x: 0, y: 0, rot: 0 };
        this.pointers = new Map();
        this.lastTap = { t: 0, x: 0, y: 0 };
        this.tapTimer = 0;

        this.img = h('img', { class: 'pt-viewer-img', alt: title, draggable: 'false', src: thumb });
        if (full && full !== thumb) {
            const loader = new Image();
            loader.onload = () => {
                if (!this.closing) this.img.src = full;
            };
            loader.src = full;
        }
        const button = (iconName, label, onclick, extra = '') => h('button', {
            type: 'button', class: `pt-viewer-btn ${extra}`, 'aria-label': label, title: label, onclick,
        }, [ui(iconName)]);
        this.zoomButton = button('zoom-in', 'Zoom in', () => this.toggleZoom());
        this.stage = h('div', { class: 'pt-viewer-stage' }, [this.img]);
        this.dialog = h('dialog', { class: 'pt-viewer', 'aria-label': title, lang: currentLang() }, [
            h('div', { class: 'pt-viewer-top' }, [
                h('span', { class: 'pt-viewer-title', raw: title }),
                button('x', 'Close', () => closeViewer(), 'pt-viewer-close'),
            ]),
            this.stage,
            h('div', { class: 'pt-viewer-bar' }, [
                this.zoomButton,
                button('rotate-cw', 'Rotate', () => this.rotate()),
                button('external', 'Open full size', () => window.open(this.full, '_blank', 'noopener')),
                button('download', 'Save picture', () => this.download()),
            ]),
        ]);
        shieldFromDrawerAutoClose(this.dialog);
        this.dialog.addEventListener('cancel', event => {
            event.preventDefault();
            closeViewer();
        });
        this.stage.addEventListener('pointerdown', event => this.down(event));
        this.stage.addEventListener('pointermove', event => this.move(event));
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) this.stage.addEventListener(type, event => this.up(event));
        this.stage.addEventListener('wheel', event => {
            event.preventDefault();
            this.zoomAt(this.state.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
        }, { passive: false });
    }

    center() {
        const rect = this.stage.getBoundingClientRect();
        return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    }

    apply(animate = false) {
        const { scale, x, y, rot } = this.state;
        this.img.style.transition = animate ? 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
        this.img.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}deg)`;
        this.dialog.classList.toggle('pt-viewer-zoomed', scale > 1.01);
        const icon = scale > 1.01 ? 'zoom-out' : 'zoom-in';
        if (this.zoomButton.dataset.icon !== icon) {
            this.zoomButton.dataset.icon = icon;
            this.zoomButton.replaceChildren(ui(icon));
            const label = t(scale > 1.01 ? 'Zoom out' : 'Zoom in');
            this.zoomButton.setAttribute('aria-label', label);
            this.zoomButton.setAttribute('title', label);
        }
    }

    /** Keeps the picture from being dragged off screen. */
    clamp() {
        const { scale, rot } = this.state;
        const sideways = Math.abs(rot) % 180 === 90;
        const width = (sideways ? this.img.offsetHeight : this.img.offsetWidth) * scale;
        const height = (sideways ? this.img.offsetWidth : this.img.offsetHeight) * scale;
        const rect = this.stage.getBoundingClientRect();
        const maxX = Math.max(0, (width - rect.width) / 2);
        const maxY = Math.max(0, (height - rect.height) / 2);
        this.state.x = Math.min(maxX, Math.max(-maxX, this.state.x));
        this.state.y = Math.min(maxY, Math.max(-maxY, this.state.y));
    }

    zoomAt(next, px, py, animate = false) {
        const scale = Math.min(6, Math.max(1, next));
        const { cx, cy } = this.center();
        // Keep the point under the finger in place while the scale changes.
        const qx = (px - cx - this.state.x) / this.state.scale;
        const qy = (py - cy - this.state.y) / this.state.scale;
        this.state.x = px - cx - scale * qx;
        this.state.y = py - cy - scale * qy;
        this.state.scale = scale;
        if (scale === 1) {
            this.state.x = 0;
            this.state.y = 0;
        }
        this.clamp();
        this.apply(animate);
    }

    toggleZoom(px, py) {
        const { cx, cy } = this.center();
        if (this.state.scale > 1.01) this.zoomAt(1, cx, cy, true);
        else this.zoomAt(2.5, px ?? cx, py ?? cy, true);
    }

    rotate() {
        this.state.rot += 90;
        this.state.scale = 1;
        this.state.x = 0;
        this.state.y = 0;
        this.apply(true);
    }

    download() {
        const extMatch = String(this.full ?? '').split('?')[0].match(/\.(png|jpe?g|webp|gif|avif)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
        const name = `${this.title.replace(/[\\/:*?"<>|]+/g, '_') || 'picture'}.${ext}`;
        const link = h('a', { href: this.full, download: name });
        document.body.append(link);
        link.click();
        link.remove();
    }

    down(event) {
        try {
            this.stage.setPointerCapture?.(event.pointerId);
        } catch {
            // The pointer is already gone; carry on without capture.
        }
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.moved = false;
        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.state.scale };
        } else if (this.pointers.size === 1) {
            this.drag = { x: event.clientX, y: event.clientY, sx: this.state.x, sy: this.state.y };
            this.dismissY = 0;
        }
    }

    move(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 2 && this.pinch) {
            const [a, b] = [...this.pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            this.moved = true;
            if (this.pinch.dist > 0) this.zoomAt(this.pinch.scale * (dist / this.pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
            return;
        }
        if (this.pointers.size !== 1 || !this.drag) return;
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this.moved = true;
        if (this.state.scale > 1.01) {
            this.state.x = this.drag.sx + dx;
            this.state.y = this.drag.sy + dy;
            this.clamp();
            this.apply();
        } else if (dy > 0) {
            // Pull down to close, like a photo app.
            this.dismissY = dy;
            this.img.style.transition = 'none';
            this.img.style.transform = `translate(0, ${dy}px) scale(${1 - Math.min(dy, 300) / 1500}) rotate(${this.state.rot}deg)`;
            this.dialog.style.setProperty('--pt-viewer-fade', String(Math.max(0, 1 - dy / 350)));
        }
    }

    up(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.delete(event.pointerId);
        if (this.pointers.size < 2) this.pinch = null;
        if (this.pointers.size === 1) {
            // Re-anchor pan to the remaining finger so lifting one finger never snaps the image.
            const [remaining] = this.pointers.values();
            this.drag = { x: remaining.x, y: remaining.y, sx: this.state.x, sy: this.state.y };
            return;
        }
        if (this.pointers.size) return;
        this.drag = null;
        if (this.dismissY > 110) {
            closeViewer();
            return;
        }
        if (this.dismissY) {
            this.dismissY = 0;
            this.dialog.style.removeProperty('--pt-viewer-fade');
            this.apply(true);
            return;
        }
        if (this.moved || event.type !== 'pointerup') return;
        // Double tap zooms in on that spot; a single tap shows or hides the buttons.
        const now = Date.now();
        const near = Math.hypot(event.clientX - this.lastTap.x, event.clientY - this.lastTap.y) < 30;
        if (now - this.lastTap.t < 300 && near) {
            window.clearTimeout(this.tapTimer);
            this.lastTap.t = 0;
            this.toggleZoom(event.clientX, event.clientY);
            return;
        }
        this.lastTap = { t: now, x: event.clientX, y: event.clientY };
        this.tapTimer = window.setTimeout(() => this.dialog.classList.toggle('pt-viewer-bare'), 300);
    }
}

function openViewer(options) {
    const previousFocus = viewer ? viewer.returnFocus : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeViewer(true);
    viewer = new Viewer(options);
    viewer.returnFocus = previousFocus;
    document.body.append(viewer.dialog);
    viewer.dialog.showModal();
    syncToasts();
    requestAnimationFrame(() => viewer?.dialog.classList.add('pt-viewer-open'));
    scheduleHistorySync();
}

function closeViewer(immediate = false) {
    const current = viewer;
    if (!current || current.closing) return;
    current.closing = true;
    viewer = null;
    window.clearTimeout(current.tapTimer);
    const finish = () => {
        if (current.dialog.open) current.dialog.close();
        // Before removing it: the toast container may be inside and must go back to the page.
        syncToasts();
        current.dialog.remove();
        if (!immediate && !viewer && current.returnFocus?.isConnected && document.activeElement === document.body) {
            current.returnFocus.focus({ preventScroll: true });
        }
    };
    if (immediate) finish();
    else {
        current.dialog.style.pointerEvents = 'none';
        // New toasts during the fade-out go to the page, not into a dialog about to be removed.
        current.dialog.setAttribute('closing', '');
        syncToasts();
        current.dialog.classList.remove('pt-viewer-open');
        setTimeout(finish, 220);
    }
    scheduleHistorySync();
}

// -- translate the chat

/**
 * Uses SillyTavern's built-in Chat Translation (Google Translate through the
 * SillyTavern server by default, no key needed). The original text is never
 * changed: translations are shown on top, like SillyTavern's own feature, but
 * several messages are translated at once, newest first, so it feels instant.
 */
const translation = { running: false, cancel: false };
const TRANSLATE_WORKERS = 4;
const FALLBACK_LANGUAGES = [
    ['ar', 'Arabic'], ['zh-CN', 'Chinese (Simplified)'], ['nl', 'Dutch'], ['en', 'English'], ['fr', 'French'], ['de', 'German'],
    ['hi', 'Hindi'], ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['pl', 'Polish'],
    ['pt', 'Portuguese'], ['ru', 'Russian'], ['es', 'Spanish'], ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'],
];

async function translatorModule() {
    if (ctx().extensionSettings?.disabledExtensions?.includes('translate')) return null;
    try {
        const module = await import('/scripts/extensions/translate/index.js');
        return typeof module.translate === 'function' ? module : null;
    } catch {
        return null;
    }
}

function translateSettings() {
    return ctx().extensionSettings?.translate ?? null;
}

function languageOptions() {
    const select = document.getElementById('translation_target_language');
    if (select?.options.length) return Array.from(select.options).map(option => ({ value: option.value, label: option.textContent.trim() }));
    return FALLBACK_LANGUAGES.map(([value, label]) => ({ value, label }));
}

function languageName(code) {
    return languageOptions().find(language => language.value === code)?.label ?? code;
}

/** The language the chat is shown in right now, or null for the original. */
function chatLanguage() {
    const chat = ctx().chat ?? [];
    const translated = chat.find(message => message?.extra?.display_text);
    if (!translated) return null;
    return translated.extra.pt_lang ?? translateSettings()?.target_language ?? null;
}

function setTargetLanguage(code) {
    const options = translateSettings();
    if (options) {
        options.target_language = code;
        const select = document.getElementById('translation_target_language');
        if (select) select.value = code;
        ctx().saveSettingsDebounced?.();
    }
    settings.recentLanguages = [code, ...(settings.recentLanguages ?? []).filter(item => item !== code)].slice(0, 5);
    saveSettings();
}

/** The translation's progress as a banner (src/shell/banners.js), with Stop while it runs. */
function translateStatus(text, { done = false, failed = false } = {}) {
    showBanner('translate', {
        status: done ? (failed ? 'warn' : 'ok') : 'info',
        text,
        action: done ? undefined : { label: 'Stop', onClick: () => { translation.cancel = true; } },
        hideAfter: done ? (failed ? 5000 : 1800) : undefined,
    });
}

// Google Translate straight from the browser: no detour through the SillyTavern
// server, and many messages in one request. A whole long chat is usually one or
// two requests, each well under a second.
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&format=html&tl=';
// The first batch is small so the messages on screen change almost at once.
const FIRST_BATCH_CHARS = 2500;
const BATCH_CHARS = 8000;
const BATCH_PARALLEL = 4;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

/**
 * Markdown and line breaks become HTML tags that Google keeps in place, so the
 * translation keeps its bold, italics, paragraphs and code. Code is not translated.
 */
function toTranslatable(text) {
    const kept = [];
    const html = String(text)
        // Code blocks and inline code stay exactly as written.
        .replace(/```[\s\S]*?```|`[^`\n]+`/g, match => {
            kept.push(match);
            return `<code translate="no">${kept.length - 1}</code>`;
        })
        // A stray & or < that is not part of an entity or a tag.
        .replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
        .replace(/<(?![a-zA-Z/!])/g, '&lt;')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
        .replace(/\n/g, '<br>');
    return { html, kept };
}

function fromTranslated(html, kept) {
    // Keep code placeholders protected until after tag/entity/space normalization so
    // code indentation and literal <b>/<i>/<br>/entities inside code blocks stay intact.
    let text = String(html)
        .replace(/<code translate="no">\s*(\d+)\s*<\/code>/gi, '\uE000CODE$1\uE001')
        // Google sometimes moves spaces inside the tags; move them back out.
        .replace(/<(b|i)>\s+/gi, ' <$1>')
        .replace(/\s+<\/(b|i)>/gi, '</$1> ')
        // …but no space between a closing tag and punctuation.
        .replace(/<\/(b|i)>\s+([.,!?;:)\]»”’。、！？])/gi, '</$1>$2')
        // A quote right after is a closing quote only when punctuation, a line break or the end follows.
        .replace(/<\/(b|i)>\s+(&quot;|&#39;|["'])(?=[.,!?;:]|\s*<br|\s*$)/gi, '</$1>$2')
        .replace(/<\/?b>/gi, '**')
        .replace(/<\/?i>/gi, '*')
        .replace(/[ \t]*<br\s*\/?>[ \t]?/gi, '\n')
        .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, entity => ENTITIES[entity] ?? entity);
    // Tidy doubled spaces the moves above can leave, without touching line breaks.
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n');
    text = text.replace(/\uE000CODE(\d+)\uE001/g, (match, index) => kept[Number(index)] ?? match);
    return text.trim();
}

async function googleTranslateBatch(texts, code) {
    const body = new URLSearchParams();
    for (const text of texts) body.append('q', text);
    const response = await fetch(GOOGLE_URL + encodeURIComponent(code), { method: 'POST', body });
    if (!response.ok) throw new Error(`Google answered ${response.status}`);
    const data = await response.json();
    // One text may come back as ["…", "en"]; several as [["…", "en"], …].
    const list = texts.length === 1 && !Array.isArray(data[0]) ? [data] : data;
    return list.map(item => (Array.isArray(item) ? item[0] : item));
}

function messageSource(message) {
    const context = ctx();
    return context.substituteParams ? context.substituteParams(message.mes, { name2Override: message.name }) : message.mes;
}

function applyTranslation(id, message, code, text) {
    if (typeof message.extra !== 'object' || !message.extra) message.extra = {};
    message.extra.display_text = text;
    message.extra.pt_lang = code;
    ctx().updateMessageBlock?.(Number(id), message);
}

/**
 * Translates the messages `ids` (newest first) into `code`.
 * Calls onProgress(done) as batches land and returns how many failed.
 */
async function translateMessages(ids, code, { onProgress = () => {}, isCancelled = () => false } = {}) {
    const provider = translateSettings()?.provider ?? 'google';
    let done = 0;
    let failed = 0;
    // Providers other than Google, or Google when the direct route fails: SillyTavern's own route.
    const slowRoute = async list => {
        const module = await translatorModule();
        if (!module) {
            failed += list.length;
            done += list.length;
            onProgress(done);
            return;
        }
        let next = 0;
        const worker = async () => {
            while (next < list.length && !isCancelled()) {
                const id = list[next++];
                const message = ctx().chat?.[id];
                if (!message) continue;
                try {
                    const translated = await module.translate(messageSource(message), code);
                    if (isCancelled()) return;
                    const currentMessage = ctx().chat?.[id];
                    if (currentMessage === message) applyTranslation(id, message, code, translated);
                } catch {
                    failed++;
                }
                done++;
                onProgress(done);
            }
        };
        await Promise.all(Array.from({ length: TRANSLATE_WORKERS }, worker));
    };
    if (provider !== 'google') {
        await slowRoute(ids);
        return failed;
    }
    // Pack messages into batches of about BATCH_CHARS, newest first.
    const batches = [];
    let current = [];
    let size = 0;
    for (const id of ids) {
        const message = ctx().chat?.[id];
        if (!message) continue;
        const prepared = toTranslatable(messageSource(message));
        const limit = batches.length ? BATCH_CHARS : FIRST_BATCH_CHARS;
        if (current.length && size + prepared.html.length > limit) {
            batches.push(current);
            current = [];
            size = 0;
        }
        current.push({ id, prepared });
        size += prepared.html.length;
    }
    if (current.length) batches.push(current);
    let next = 0;
    const worker = async () => {
        while (next < batches.length && !isCancelled()) {
            const batch = batches[next++];
            try {
                const out = await googleTranslateBatch(batch.map(item => item.prepared.html), code);
                if (isCancelled()) return;
                batch.forEach((item, index) => {
                    const message = ctx().chat?.[item.id];
                    if (message && typeof out[index] === 'string') applyTranslation(item.id, message, code, fromTranslated(out[index], item.prepared.kept));
                    else failed++;
                });
                done += batch.length;
                onProgress(done);
            } catch (error) {
                if (isCancelled()) return;
                console.debug(LOG, 'Direct Google Translate failed; using SillyTavern instead', error);
                await slowRoute(batch.map(item => item.id));
            }
        }
    };
    await Promise.all(Array.from({ length: BATCH_PARALLEL }, worker));
    return failed;
}

async function translateChat(code) {
    if (translation.running) return;
    const provider = translateSettings()?.provider ?? 'google';
    if (provider !== 'google' && !(await translatorModule())) {
        globalThis.toastr?.error(t('Turn on "Chat Translation" in Extensions → Manage extensions.'), t('Translation is off'));
        return;
    }
    setTargetLanguage(code);
    const context = ctx();
    const chat = context.chat ?? [];
    const chatId = context.getCurrentChatId?.();
    const todo = [];
    // Newest first: the messages on screen change right away.
    for (let id = chat.length - 1; id >= 0; id--) {
        const message = chat[id];
        if (!message || message.is_system || !String(message.mes ?? '').trim()) continue;
        if (message.extra?.display_text && message.extra?.pt_lang === code) continue;
        todo.push(id);
    }
    const name = languageName(code);
    if (!todo.length) {
        translateStatus(t('Already in {lang}', { lang: name }), { done: true });
        return;
    }
    translation.running = true;
    translation.cancel = false;
    const total = todo.length;
    let failed = 0;
    translateStatus(t('Translating to {lang}… {done}/{total}', { lang: name, done: 0, total }));
    try {
        failed = await translateMessages(todo, code, {
            isCancelled: () => !active || translation.cancel || ctx().getCurrentChatId?.() !== chatId,
            onProgress: done => {
                if (!translation.cancel) translateStatus(t('Translating to {lang}… {done}/{total}', { lang: name, done, total }));
            },
        });
    } finally {
        translation.running = false;
    }
    if (ctx().getCurrentChatId?.() === chatId) await ctx().saveChat?.();
    shell?.update();
    // Every message changed its text, so its height too.
    primeChatSizes();
    if (translation.cancel) translateStatus(t('Translation stopped'), { done: true });
    else if (failed) translateStatus(failed === total ? t('Could not reach the translator') : t('Some messages could not be translated. Check your internet connection.'), { done: true, failed: true });
    else translateStatus(t('Chat shown in {lang}', { lang: name }), { done: true });
}

/** New, edited and swiped messages follow the chat's language while "Translate new messages too" is on. */
const autoQueue = new Set();
let autoTimer = 0;

function queueAutoTranslate(id) {
    if (!active || !settings.autoTranslate) return;
    const code = chatLanguage();
    const chatId = ctx().getCurrentChatId?.();
    if (!code) return;
    autoQueue.add(Number(id));
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(async () => {
        autoTimer = 0;
        if (!active || ctx().getCurrentChatId?.() !== chatId) {
            autoQueue.clear();
            return;
        }
        const ids = [...autoQueue].filter(item => {
            const message = ctx().chat?.[item];
            return message && !message.is_system && String(message.mes ?? '').trim();
        }).sort((a, b) => b - a);
        autoQueue.clear();
        if (!ids.length) return;
        await translateMessages(ids, code, {
            isCancelled: () => !active || ctx().getCurrentChatId?.() !== chatId || chatLanguage() !== code,
        });
        if (active && ctx().getCurrentChatId?.() === chatId) await ctx().saveChat?.();
    }, 150);
}

/** An edited or swiped message must not keep showing its old translation. */
function dropTranslation(id) {
    const message = ctx().chat?.[Number(id)];
    if (!message?.extra?.pt_lang) return;
    delete message.extra.display_text;
    delete message.extra.pt_lang;
}

async function showOriginal() {
    translation.cancel = true;
    const context = ctx();
    let changed = false;
    (context.chat ?? []).forEach((message, id) => {
        if (!message?.extra?.display_text && !message?.extra?.reasoning_display_text) return;
        delete message.extra.display_text;
        delete message.extra.reasoning_display_text;
        delete message.extra.pt_lang;
        context.updateMessageBlock?.(id, message);
        changed = true;
    });
    if (changed) await context.saveChat?.();
    shell?.update();
    if (changed) primeChatSizes();
    translateStatus(t('Showing the original text'), { done: true });
}

function setAutoTranslate(on) {
    settings.autoTranslate = on;
    saveSettings();
    // Pocket Tavern translates new messages itself (faster); keep SillyTavern's own auto mode off so it is not done twice.
    const options = translateSettings();
    if (options && options.auto_mode !== 'none') {
        options.auto_mode = 'none';
        const select = document.getElementById('translation_auto_mode');
        if (select) select.value = 'none';
        ctx().saveSettingsDebounced?.();
    }
}

/** The language one tap translates to: the last one picked in the sheet. */
function quickLanguage() {
    return settings.recentLanguages?.[0] ?? null;
}

/** One tap: translate the chat, show the original again, or stop a running translation. */
function quickTranslate() {
    const inChat = !!(ctx().groupId || ctx().characterId !== undefined);
    if (!inChat) {
        globalThis.toastr?.info(t('Open a chat first.'));
        return;
    }
    if (translation.running) {
        translation.cancel = true;
        return;
    }
    if (chatLanguage()) {
        showOriginal();
        return;
    }
    const code = quickLanguage();
    if (code) translateChat(code);
    else openTranslateSheet();
}

/**
 * SillyTavern's own "Translate Chat" in the ✨ menu translates one message at a
 * time. While Pocket Tavern is on, that item translates the whole chat in one tap
 * (or shows the original again), in the last language picked.
 */
function onWandTranslateClick(event) {
    if (!active || !(event.target instanceof Element) || !event.target.closest('#translate_chat')) return;
    event.preventDefault();
    event.stopPropagation();
    // Stopping the click also stops SillyTavern from closing the menu; close it the same way it would.
    const menu = document.getElementById('extensionsMenu');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('extensionsMenuButton')?.click();
    quickTranslate();
}

function openTranslateSheet() {
    const current = chatLanguage();
    const inChat = !!(ctx().groupId || ctx().characterId !== undefined);
    showSheet(new MenuSheet({
        title: t('Translate chat'),
        subtitle: current ? t('Showing {lang}. The original text is kept.', { lang: languageName(current) }) : t('Pick a language. The original text is kept.'),
        fill: body => {
            if (!inChat) {
                body.append(h('p', { class: 'pt-menu-foot', text: t('Open a chat first.') }));
                return;
            }
            const top = [];
            if (current) {
                top.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        showOriginal();
                    },
                }, [ui('reset', 'pt-menu-row-icon'), h('span', { text: t('Show original') })]));
            }
            const auto = h('input', { type: 'checkbox', class: 'pt-switch', role: 'switch' });
            auto.checked = !!settings.autoTranslate;
            auto.addEventListener('change', () => setAutoTranslate(auto.checked));
            top.push(h('label', { class: 'pt-switch-row' }, [
                h('span', { class: 'pt-switch-text' }, [h('span', { text: t('Translate new replies too') }), h('small', { text: t('Each new reply is shown in the chosen language.') })]),
                auto,
            ]));
            body.append(h('div', { class: 'pt-menu-list' }, top));

            const all = languageOptions();
            const recent = (settings.recentLanguages ?? []).map(code => all.find(language => language.value === code)).filter(Boolean);
            const languageRow = language => h('button', {
                type: 'button',
                class: `pt-menu-row pt-choice ${language.value === current ? 'pt-choice-on' : ''}`,
                'data-search': normalizeText(`${language.label} ${language.value}`),
                onclick: () => {
                    closeSheet(true);
                    buzz(8);
                    translateChat(language.value);
                },
            }, [h('span', { raw: language.label }), language.value === current ? ui('check', 'pt-menu-row-icon') : null]);
            const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search languages'), 'aria-label': t('Search languages') });
            const recentBlock = recent.length ? [h('p', { class: 'pt-menu-heading', text: t('Recent') }), h('div', { class: 'pt-menu-list' }, recent.map(languageRow))] : [];
            const allRows = all.map(languageRow);
            const allHeading = h('p', { class: 'pt-menu-heading', text: t('All languages') });
            const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
            search.addEventListener('input', () => {
                const words = normalizeText(search.value).split(/\s+/).filter(Boolean);
                let shown = 0;
                for (const row of allRows) {
                    const ok = words.every(word => row.dataset.search.includes(word));
                    row.hidden = !ok;
                    if (ok) shown++;
                }
                for (const element of recentBlock) element.hidden = words.length > 0;
                empty.hidden = shown > 0;
            });
            body.append(h('p', { class: 'pt-menu-heading', text: t('Languages') }), search, ...recentBlock, allHeading, h('div', { class: 'pt-menu-list' }, allRows), empty);
            const provider = translateSettings()?.provider ?? 'google';
            const providerName = { google: 'Google Translate', deepl: 'DeepL', bing: 'Bing', yandex: 'Yandex', libre: 'LibreTranslate', lingva: 'Lingva', deeplx: 'DeepLX', oneringtranslator: 'OneRingTranslator' }[provider] ?? provider;
            body.append(h('p', { class: 'pt-menu-foot', text: t('Tip: tap the translate button to switch between your language and the original. Hold it to open this list.') }));
            // Google is asked straight from this browser (see GOOGLE_URL); the others go through SillyTavern's server.
            body.append(h('p', {
                class: 'pt-menu-foot',
                text: provider === 'google'
                    ? t('Uses Google Translate, asked straight from this browser. You can pick another service in Extensions → Chat Translation.')
                    : t('Uses {provider} through your SillyTavern server. You can change it in Extensions → Chat Translation.', { provider: providerName }),
            }));
        },
    }));
}

// -- chat rows: the ⋯ menu, and SillyTavern's Chat history drawn as chat rows (src/ui/chat-row.js)

/**
 * The ⋯ menu of a chat row. Each item runs SillyTavern's own button or function; destructive ones
 * come last, in their own group. On desktop it opens beside its ⋯.
 */
function openChatRowMenu(fileName, items, anchor = null) {
    const rows = items.filter(Boolean);
    const instance = new MenuSheet({
        title: 'Chat',
        anchor,
        fill: body => {
            const row = item => {
                const node = listRow({ title: item.label, icon: item.icon, end: 'none', onClick: () => {
                    closeSheet(true);
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
    showSheet(instance);
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

// -- chat history: grouped by date

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
    if (!active || !settings.touchSizing || !settings.recentTools) return;
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

function syncChatHistory() {
    const list = document.getElementById('select_chat_div');
    if (!active || !settings.touchSizing || !settings.recentTools) {
        chatList.observer?.disconnect();
        chatList.observer = null;
        list?.querySelectorAll('.pt-date-heading').forEach(node => node.remove());
        if (list) undecorateRows(list);
        return;
    }
    if (list && !chatList.observer) {
        chatList.observer = new MutationObserver(records => {
            // Ignore our own headings.
            if (records.every(record => [...record.addedNodes, ...record.removedNodes].every(node => node.classList?.contains('pt-date-heading')))) return;
            window.clearTimeout(chatList.timer);
            chatList.timer = window.setTimeout(groupChatHistory, 80);
        });
        chatList.observer.observe(list, { childList: true, subtree: false, attributes: true, attributeFilter: ['style'], attributeOldValue: false });
        wireOnce(document.getElementById('select_chat_search'), 'input', () => {
            window.clearTimeout(chatList.timer);
            chatList.timer = window.setTimeout(groupChatHistory, 350);
        });
    }
}

// -- search everything: what the Chats page's search finds

async function lorebookNames() {
    try {
        const module = await import('/scripts/world-info.js');
        return Array.isArray(module.world_names) ? module.world_names : [];
    } catch {
        return Array.from(document.querySelectorAll('#world_editor_select option')).map(option => option.textContent.trim()).filter(Boolean);
    }
}

function allSettingItems() {
    const items = [];
    for (const pageId of SEARCH_PAGES) {
        const root = document.querySelector(`#${pageId} > .drawer-content`);
        if (!root) continue;
        const page = t(pageInfo(drawerById(pageId)).title);
        for (const item of settingItems(root)) items.push({ ...item, pageId, page });
    }
    return items;
}

async function openChatFile(chat) {
    const context = ctx();
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
    if (context.getCurrentChatId?.() !== file) await ctx().openCharacterChat?.(file);
}

// -- the Chats home (src/views/chats.js)

const chatsHome = { observer: null, timer: 0, empty: null, pinned: null, noChat: null, homeTimer: 0, startUntil: Date.now() + 20000, welcome: null, version: '' };

/**
 * The first seconds after SillyTavern is ready: it may reopen its locked Characters panel, which Pocket
 * Tavern closes again. html.pt-starting keeps that panel invisible meanwhile (styles/st/chat.css), so it
 * never flashes. Ends after 4 s, or as soon as you pick a place yourself.
 */
function endStartWindow() {
    chatsHome.startUntil = 0;
    document.documentElement.classList.remove('pt-starting');
}

/** SillyTavern's Assistant (its start screen's) and its version text, for the Chats page and the welcome. */
function loadStartModules() {
    import('/scripts/welcome-screen.js').then(module => { chatsHome.welcome = module; }).catch(() => {});
    import('/script.js').then(module => { chatsHome.version = String(module.displayVersion ?? ''); }).catch(() => {});
}

/** The Assistant row: SillyTavern's own permanent Assistant chat (it creates the Assistant if needed). */
function assistantEntry() {
    const module = chatsHome.welcome;
    if (typeof module?.openPermanentAssistantChat !== 'function') return null;
    const avatarFile = module.getPermanentAssistantAvatar?.();
    const exists = avatarFile && ctx().characters?.some(character => character.avatar === avatarFile);
    return {
        picture: exists ? `/thumbnail?type=avatar&file=${encodeURIComponent(avatarFile)}` : 'img/logo.png',
        open: () => {
            if (!keepChatsPanel()) closePages();
            module.openPermanentAssistantChat();
        },
    };
}

/** Opens this chat (unless it is open), then runs `run` once SillyTavern has switched to it. */
function afterOpening(chat, run) {
    if (isOpenChat(chat)) {
        run();
        return;
    }
    const context = ctx();
    const changed = context.eventTypes?.CHAT_CHANGED;
    let done = false;
    const once = () => {
        if (done) return;
        done = true;
        if (changed) context.eventSource?.removeListener?.(changed, once);
        setTimeout(run, 150);
    };
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

function isPinnedChat(chat) {
    return (chatsHome.pinned ?? []).some(pin => sameChat(pin, chat));
}

/** Recent chats, pinned first (SillyTavern's own endpoint, as its start screen asks for them). */
async function recentChatsForHome() {
    const pinned = await loadPinnedChats();
    try {
        const response = await fetch('/api/chats/recent', {
            method: 'POST',
            headers: ctx().getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max: 200, pinned }),
            cache: 'no-cache',
        });
        const list = response.ok ? await response.json() : [];
        const context = ctx();
        // Like the start screen: only chats whose character or group still exists.
        return (Array.isArray(list) ? list : []).filter(chat => (chat.group
            ? context.groups?.some(group => String(group.id) === String(chat.group))
            : context.characters?.some(character => character.avatar === chat.avatar)));
    } catch {
        return [];
    }
}

function chatOwner(chat) {
    const context = ctx();
    if (chat.group) return { name: context.groups?.find(group => String(group.id) === String(chat.group))?.name ?? t('Group chat') };
    const character = context.characters?.find(item => item.avatar === chat.avatar);
    return { name: character?.name ?? '', picture: chat.avatar ? `/thumbnail?type=avatar&file=${encodeURIComponent(chat.avatar)}` : undefined };
}

function chatFileId(chat) {
    return String(chat.file_name ?? '').replace(/\.jsonl$/, '');
}

function isOpenChat(chat) {
    const context = ctx();
    if (context.getCurrentChatId?.() !== chatFileId(chat)) return false;
    if (chat.group) return String(context.groupId) === String(chat.group);
    return context.characters?.[context.characterId]?.avatar === chat.avatar;
}

/**
 * Opening a chat from the Chats page keeps the page: on desktop it stays in the panel beside the chat;
 * on a phone it makes way once the chat has opened (syncChatsHome), so nothing flashes in between.
 */
function keepChatsPanel() {
    return currentPageId() === 'pt-chats';
}

/** SillyTavern's own start-screen row for a chat, when its start screen is drawn (no chat open). */
function startScreenRow(chat) {
    const file = chatFileId(chat);
    return [...document.querySelectorAll('#chat .welcomePanel .recentChat')].find(row => row.dataset.file === file
        && (chat.group ? row.dataset.group === String(chat.group) : row.dataset.avatar === chat.avatar)) ?? null;
}

/**
 * A chat row's ⋯: New chat and All chats with its character, then Pin and Rename, which run SillyTavern's own start-screen buttons (there while no chat is
 * open), the open chat is renamed with SillyTavern's renameChat, and a chat that is not open is
 * deleted with SillyTavern's confirm and its own delete. The open chat is deleted from its own
 * ⋯ → Chat files, so the chat on screen never outlives its file.
 */
function openHomeChatMenu(chat, anchor) {
    const row = startScreenRow(chat);
    const open = isOpenChat(chat);
    const press = selector => () => row?.querySelector(selector)?.click();
    openChatRowMenu(chat.file_name, [
        { icon: 'plus', label: 'New chat', run: () => afterOpening(chat, () => document.getElementById('option_start_new_chat')?.click()) },
        { icon: 'history', label: 'All chats', run: () => afterOpening(chat, () => document.getElementById('option_select_chat')?.click()) },
        row ? { icon: 'bookmark', label: isPinnedChat(chat) ? 'Unpin' : 'Pin', run: press('.pinChat') } : null,
        open ? { icon: 'pencil', label: 'Rename', run: () => renameCurrentChat() } : (row ? { icon: 'pencil', label: 'Rename', run: press('.renameChat') } : null),
        open ? null : { icon: 'trash', label: 'Delete', danger: true, run: () => (row ? press('.deleteChat')() : deleteChatFile(chat)) },
    ], anchor);
}

/** Deletes a chat that is not open: SillyTavern's own question, then its own delete function. */
async function deleteChatFile(chat) {
    const context = ctx();
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
async function searchIndexForHome() {
    const context = ctx();
    const places = TABS.map(tab => ({ kind: 'place', title: tab.label, icon: tab.icon, text: `${tab.label} ${t(tab.label)}`, run: () => shell?.onTab(tab.id) }));
    const characters = (context.characters ?? []).map((character, id) => ({
        kind: 'character',
        rawTitle: character.name,
        picture: character.avatar && character.avatar !== 'none' ? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}` : '',
        text: `${character.name} ${character.tags?.join?.(' ') ?? ''}`,
        run: async () => {
            if (!keepChatsPanel()) closePages();
            await ctx().selectCharacterById(id);
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
            await ctx().openGroupChat?.(group.id);
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
            setTimeout(() => revealSetting(item.row), 350);
        },
    }));
    return [...places, ...characters, ...groups, ...lorebooks, ...found];
}

/** The Chats page drawn again (the open chat changed, a chat was renamed, pinned or deleted). */
function refreshChatsHome() {
    window.clearTimeout(chatsHome.timer);
    chatsHome.timer = window.setTimeout(() => {
        chatsHome.timer = 0;
        if (active && currentPageId() === 'pt-chats') refreshOwnPage();
    }, 150);
}

/** Desktop's chat column while no chat is open: SillyTavern's logo and the ways in (src/views/chats.js). */
function syncChatsWelcome() {
    const want = active && settings.appShell && isWide() && ctx().getCurrentChatId?.() === undefined;
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
        chooseCharacter: () => shell?.onTab('rightNavHolder'),
    })]);
    if (chatsHome.empty?.isConnected) chatsHome.empty.replaceWith(next);
    else document.body.append(next);
    chatsHome.empty = next;
}

/** The chat that just opened fades in (styles/views/chats.css), instead of appearing all at once. */
function fadeInChat() {
    const chat = document.getElementById('chat');
    if (!active || !chat || ctx().getCurrentChatId?.() === undefined || !motionAllowed()) return;
    chat.classList.remove('pt-chat-enter');
    // Restart the animation: the class comes back on the next frame.
    requestAnimationFrame(() => {
        chat.classList.add('pt-chat-enter');
        chat.addEventListener('animationend', () => chat.classList.remove('pt-chat-enter'), { once: true });
    });
}

/**
 * On a phone with no chat open, the Chats page is the screen under every other: when the last page
 * closes (Back from Characters, say), Chats shows instead of an empty chat area. Checked a moment
 * later, so switching straight from one page to another never passes through it.
 */
function ensurePhoneHome() {
    window.clearTimeout(chatsHome.homeTimer);
    chatsHome.homeTimer = window.setTimeout(() => {
        chatsHome.homeTimer = 0;
        if (active && settings.appShell && !isWide() && !currentPageId() && ctx().getCurrentChatId?.() === undefined) openPage('pt-chats');
    }, 120);
}

/** Ctrl/⌘ K: the Chats page with its search field focused. */
function focusChatsSearch() {
    if (currentPageId() !== 'pt-chats') openPage('pt-chats');
    requestAnimationFrame(() => document.querySelector('#pt-page .pt-chats-search input')?.focus());
}

/**
 * With no chat open: the Chats page is what you see (a phone shows it as the place's screen, desktop
 * in the panel), SillyTavern's start screen and the message box step aside, and desktop's chat column
 * says where chats come from. SillyTavern still draws its start screen underneath; its buttons do the
 * pinning and renaming.
 */
function syncChatsHome() {
    const root = document.documentElement;
    const on = active && settings.appShell;
    const chat = document.getElementById('chat');
    root.classList.toggle('pt-starting', on && Date.now() < chatsHome.startUntil);
    if (!on) {
        chatsHome.noChat = null;
        window.clearTimeout(chatsHome.homeTimer);
        chatsHome.homeTimer = 0;
        root.classList.remove('pt-no-chat');
        document.getElementById('chat')?.classList.remove('pt-chat-enter');
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
        chatsHome.observer = new MutationObserver(records => {
            if (records.some(record => [...record.addedNodes].some(node => node.classList?.contains('welcomePanel')))) refreshChatsHome();
        });
        chatsHome.observer.observe(chat, { childList: true });
    }
    const noChat = ctx().getCurrentChatId?.() === undefined;
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
    else if (!noChat && !isWide() && currentPageId() === 'pt-chats') closePages();
    else refreshChatsHome();
}

// -- sharp pictures and animated (GIF) character pictures

/**
 * SillyTavern shows 96×144 thumbnails everywhere; on a phone a grid card needs
 * about four times that. Pictures on screen are replaced by the original image,
 * scaled down in the browser to exactly the size the screen needs (so memory
 * stays low), and characters can have an animated GIF/WebP picture.
 */
const GIF_KEY = 'pt_animated_avatar';
const pictures = {
    observer: null,
    seen: null,
    cache: new Map(),
    pending: new Map(),
    queue: [],
    running: 0,
    timer: 0,
    // Pictures the on-screen watcher reported as (nearly) on screen.
    near: new Set(),
    // New sources waiting to be put in, all in one frame.
    swaps: new Map(),
    swapFrame: 0,
    // Elements added since the last frame, scanned together.
    added: new Set(),
    addedFrame: 0,
    // The picture last shown in each kind of spot ("grid|avatar|Aria.png" → url).
    last: new Map(),
    // Animated picture links that failed to load (the file was deleted, or the
    // card came from someone else's SillyTavern), and characters whose sharp
    // picture failed. Those show SillyTavern's thumbnail instead.
    broken: new Set(),
    noSharp: new Set(),
};

/** Which kind of spot a picture sits in; pictures in the same kind of spot have the same size. */
function pictureSpot(img) {
    if (img.closest('#rm_print_characters_block')) return document.body.classList.contains('charListGrid') ? 'grid' : 'list';
    if (img.closest('#HotSwapWrapper')) return 'fav';
    if (img.closest('#chat')) return 'chat';
    return null;
}

function rememberPicture(img, url) {
    const spot = pictureSpot(img);
    const info = img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null;
    if (spot && info) pictures.last.set(`${spot}|${info.type}|${info.file}`, url);
}

/**
 * SillyTavern redraws its lists from scratch, with thumbnails. When this spot
 * already showed a sharp picture, put it straight back (this runs before the
 * page is drawn), so nothing flashes from blurry to sharp.
 */
const PICTURE_CACHE_LIMIT = 160;

function restoreKnownPicture(img) {
    const src = img.getAttribute('src') ?? '';
    const info = thumbInfo(src);
    const spot = info && pictureSpot(img);
    const url = spot && pictures.last.get(`${spot}|${info.type}|${info.file}`);
    if (!url) return false;
    if (url.startsWith('blob:') && !settings.sharpPictures) return false;
    if (!url.startsWith('blob:') && !settings.animatedPictures) return false;
    img.dataset.ptThumb = src;
    img.setAttribute('src', url);
    return true;
}

/**
 * Puts in new picture sources together, so the page restyles once and a list
 * turns sharp in one go instead of picture by picture. Pictures made within
 * about 100 ms of each other go in on the same frame.
 */
function swapPicture(img, url) {
    if (!active || !settings.sharpPictures) return;
    pictures.swaps.set(img, url);
    if (pictures.swapFrame || pictures.swapTimer) return;
    pictures.swapTimer = window.setTimeout(() => {
        pictures.swapTimer = 0;
        pictures.swapFrame = requestAnimationFrame(() => {
            pictures.swapFrame = 0;
            if (!active || !settings.sharpPictures || !pictures.swaps.size) {
                pictures.swaps.clear();
                return;
            }
            const swaps = [...pictures.swaps];
            pictures.swaps.clear();
            for (const [image, src] of swaps) {
                if (image.isConnected && (image.getAttribute('src') === image.dataset.ptThumb || thumbInfo(image.getAttribute('src') ?? ''))) {
                    image.setAttribute('src', src);
                    rememberPicture(image, src);
                }
            }
        });
    }, 100);
}

function thumbInfo(src) {
    try {
        const url = new URL(src, location.href);
        if (!url.pathname.endsWith('/thumbnail')) return null;
        const type = url.searchParams.get('type');
        const file = url.searchParams.get('file');
        if (!file || !['avatar', 'persona'].includes(type)) return null;
        return { type, file };
    } catch {
        return null;
    }
}

function animatedPictureFor(file) {
    const character = (ctx().characters ?? []).find(item => item.avatar === file);
    const url = character?.data?.extensions?.[GIF_KEY];
    // Only allow local server paths (never external URLs or protocol-relative // links from imported cards).
    return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !pictures.broken.has(url) ? url : null;
}

function fullPictureUrl({ type, file }) {
    return type === 'persona' ? `/User Avatars/${encodeURIComponent(file)}` : `/characters/${encodeURIComponent(file)}`;
}

/** The original picture scaled to `width` pixels, as an object URL (made once per size, LRU-capped). */
function sharpPicture(info, width) {
    const key = `${info.type}|${info.file}|${width}`;
    if (pictures.cache.has(key)) {
        const hit = pictures.cache.get(key);
        pictures.cache.delete(key);
        pictures.cache.set(key, hit);
        return Promise.resolve(hit);
    }
    if (pictures.pending.has(key)) return pictures.pending.get(key);
    const job = new Promise((resolve, reject) => {
        pictures.queue.push(async () => {
            if (!active || !settings.sharpPictures) {
                reject(new Error('cancelled'));
                return;
            }
            let bitmap = null;
            try {
                const response = await fetch(fullPictureUrl(info));
                if (!response.ok) throw new Error(String(response.status));
                const blob = await response.blob();
                if (!active || !settings.sharpPictures) throw new Error('cancelled');
                bitmap = await createImageBitmap(blob);
                const scale = Math.min(1, width / bitmap.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(bitmap.width * scale);
                canvas.height = Math.round(bitmap.height * scale);
                const context = canvas.getContext('2d');
                if (!context) throw new Error('no 2d context');
                context.imageSmoothingQuality = 'high';
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const out = await new Promise(done => canvas.toBlob(done, 'image/webp', 0.92));
                if (!active || !settings.sharpPictures) throw new Error('cancelled');
                const url = URL.createObjectURL(out ?? blob);
                pictures.cache.set(key, url);
                while (pictures.cache.size > PICTURE_CACHE_LIMIT) {
                    const [oldKey, oldUrl] = pictures.cache.entries().next().value;
                    pictures.cache.delete(oldKey);
                    URL.revokeObjectURL(oldUrl);
                }
                resolve(url);
            } catch (error) {
                reject(error);
            } finally {
                bitmap?.close?.();
                pictures.pending.delete(key);
            }
        });
        pumpPictures();
    });
    pictures.pending.set(key, job);
    return job;
}

function pumpPictures() {
    while (pictures.running < 3 && pictures.queue.length) {
        const task = pictures.queue.shift();
        pictures.running++;
        task().finally(() => {
            pictures.running--;
            pumpPictures();
        });
    }
}

/** Picks the best picture for one <img>. */
function upgradePicture(img) {
    if (!active) return;
    const current = img.getAttribute('src') ?? '';
    // SillyTavern sometimes sets the thumbnail again; remember what it asked for.
    const info = thumbInfo(current) ?? (img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null);
    if (!info) return;
    if (thumbInfo(current)) img.dataset.ptThumb = current;
    const animated = info.type === 'avatar' && settings.animatedPictures ? animatedPictureFor(info.file) : null;
    if (animated) {
        if (current !== animated) img.setAttribute('src', animated);
        rememberPicture(img, animated);
        return;
    }
    if (!settings.sharpPictures) {
        if (img.dataset.ptThumb && current !== img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        return;
    }
    const shown = img.getBoundingClientRect().width || img.clientWidth;
    const needed = shown * (window.devicePixelRatio || 1);
    // The thumbnail is 96 pixels wide; only bigger pictures need the original.
    if (needed <= 100 || pictures.noSharp.has(info.file)) return;
    const width = needed <= 200 ? 200 : needed <= 400 ? 400 : 640;
    sharpPicture(info, width).then(url => swapPicture(img, url)).catch(() => {});
}

/**
 * One of Pocket Tavern's pictures failed to load. Put SillyTavern's thumbnail
 * back before SillyTavern sees the error, which would swap the picture for its
 * crossed-out "missing picture" icon until the chat is reopened.
 */
function onPictureError(event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.ptThumb) return;
    const src = img.getAttribute('src') ?? '';
    const info = thumbInfo(img.dataset.ptThumb);
    if (!src || !info || src === img.dataset.ptThumb) return;
    event.stopImmediatePropagation();
    if (src.startsWith('blob:')) pictures.noSharp.add(info.file);
    else pictures.broken.add(src);
    for (const map of [pictures.cache, pictures.last]) {
        for (const [key, url] of map) if (url === src) map.delete(key);
    }
    img.setAttribute('src', img.dataset.ptThumb);
}

function watchPicture(img) {
    if (!img.dataset.ptWatched) {
        img.dataset.ptWatched = '1';
        pictures.seen?.observe(img);
    }
    scheduleVisibleCheck();
}

/**
 * Backup for the on-screen watcher: after scrolling stops, upgrade the pictures
 * it reported as near the screen that still show a thumbnail. Only those are
 * looked at, so a long chat or character list costs nothing here.
 */
function scheduleVisibleCheck(event) {
    // Text boxes scroll while you type; they never hold pictures.
    if (event?.target instanceof HTMLTextAreaElement || event?.target instanceof HTMLInputElement) return;
    window.clearTimeout(pictures.timer);
    pictures.timer = window.setTimeout(() => {
        if (!active || !(settings.sharpPictures || settings.animatedPictures)) return;
        for (const img of pictures.near) {
            if (!img.isConnected) {
                pictures.near.delete(img);
                continue;
            }
            if (thumbInfo(img.getAttribute('src') ?? '') || (img.dataset.ptThumb && img.getAttribute('src') === img.dataset.ptThumb)) upgradePicture(img);
        }
    }, 150);
}

function scanPictures(root = document) {
    if (!active) return;
    const images = root.matches?.('img') ? [root] : root.querySelectorAll?.('img') ?? [];
    for (const img of images) {
        const src = img.getAttribute('src') ?? '';
        if (thumbInfo(src)) restoreKnownPicture(img);
        if (thumbInfo(src) || img.dataset.ptThumb) watchPicture(img);
    }
}

function syncPictures() {
    const want = active && (settings.sharpPictures || settings.animatedPictures);
    if (!want) {
        pictures.observer?.disconnect();
        pictures.seen?.disconnect();
        document.removeEventListener('scroll', scheduleVisibleCheck, { capture: true });
        document.removeEventListener('error', onPictureError, { capture: true });
        pictures.observer = null;
        pictures.seen = null;
        window.clearTimeout(pictures.timer);
        pictures.timer = 0;
        window.clearTimeout(pictures.swapTimer);
        pictures.swapTimer = 0;
        cancelAnimationFrame(pictures.swapFrame);
        pictures.swapFrame = 0;
        cancelAnimationFrame(pictures.addedFrame);
        pictures.addedFrame = 0;
        pictures.queue.length = 0;
        pictures.added.clear();
        pictures.near.clear();
        pictures.swaps.clear();
        pictures.last.clear();
        // Put SillyTavern's own thumbnails back.
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            img.setAttribute('src', img.dataset.ptThumb);
            delete img.dataset.ptThumb;
            delete img.dataset.ptWatched;
        }
        document.querySelectorAll('img[data-pt-watched]').forEach(img => delete img.dataset.ptWatched);
        for (const url of pictures.cache.values()) URL.revokeObjectURL(url);
        pictures.cache.clear();
        return;
    }
    if (!settings.sharpPictures && pictures.cache.size) {
        pictures.queue.length = 0;
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            if ((img.getAttribute('src') ?? '').startsWith('blob:')) img.setAttribute('src', img.dataset.ptThumb);
        }
        for (const [key, url] of pictures.last) if (url.startsWith('blob:')) pictures.last.delete(key);
        for (const url of pictures.cache.values()) URL.revokeObjectURL(url);
        pictures.cache.clear();
    }
    if (!settings.animatedPictures) {
        for (const [key, url] of pictures.last) if (!url.startsWith('blob:')) pictures.last.delete(key);
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            const src = img.getAttribute('src') ?? '';
            if (src && !src.startsWith('blob:') && src !== img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        }
    }
    if (!pictures.seen) {
        // Only pictures that are (nearly) on screen are upgraded, so long lists stay light.
        pictures.seen = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    pictures.near.add(entry.target);
                    upgradePicture(entry.target);
                } else pictures.near.delete(entry.target);
            }
        }, { rootMargin: '300px' });
    }
    if (!pictures.observer) {
        pictures.observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') {
                    const img = record.target;
                    // SillyTavern put a thumbnail back (re-render): upgrade again.
                    if (thumbInfo(img.getAttribute('src') ?? '')) {
                        img.dataset.ptThumb = img.getAttribute('src');
                        if (restoreKnownPicture(img)) continue;
                        if (img.dataset.ptWatched) {
                            pictures.seen?.unobserve(img);
                            pictures.seen?.observe(img);
                        } else watchPicture(img);
                    }
                    continue;
                }
                if (record.target instanceof Element && record.target.closest('.mes_text')) continue;
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1) pictures.added.add(node);
                }
            }
            // Added nodes are scanned once per frame (a streaming reply adds some on every token),
            // still before the frame is drawn, so a known picture never flashes its thumbnail.
            if (pictures.added.size && !pictures.addedFrame) {
                pictures.addedFrame = requestAnimationFrame(() => {
                    pictures.addedFrame = 0;
                    const nodes = [...pictures.added];
                    pictures.added.clear();
                    for (const node of nodes) if (node.isConnected) scanPictures(node);
                });
            }
        });
        pictures.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        document.addEventListener('scroll', scheduleVisibleCheck, { capture: true, passive: true });
        document.addEventListener('error', onPictureError, { capture: true });
    }
    // Pictures already on the page, and a refresh after the animated picture changed.
    for (const img of document.querySelectorAll('img[data-pt-watched]')) {
        pictures.seen.unobserve(img);
        pictures.seen.observe(img);
    }
    scanPictures();
}

/** Re-check every picture of one character (after its animated picture changed). */
function refreshPicturesFor(file) {
    for (const img of document.querySelectorAll('img')) {
        const info = thumbInfo(img.getAttribute('src') ?? '') ?? (img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null);
        if (info?.file !== file) continue;
        if (!animatedPictureFor(file) && img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        upgradePicture(img);
    }
    shell?.update();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function setAnimatedPicture(characterId, url) {
    const context = ctx();
    const character = context.characters?.[characterId];
    if (!character) return;
    await context.writeExtensionField?.(characterId, GIF_KEY, url ?? '');
    character.data = character.data ?? {};
    character.data.extensions = character.data.extensions ?? {};
    character.data.extensions[GIF_KEY] = url ?? '';
    refreshPicturesFor(character.avatar);
}

/** True for a GIF, an animated WebP or an animated PNG (looks at the file's own bytes). */
async function isAnimatedImage(file) {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const text = (start, length) => String.fromCharCode(...head.subarray(start, start + length));
    if (text(0, 4) === 'GIF8') return true;
    // WebP: RIFF....WEBP with an animation chunk.
    if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
        for (let i = 12; i < head.length - 4; i++) {
            if (head[i] === 0x41 && text(i, 4) === 'ANIM') return true;
        }
        return false;
    }
    // PNG: an "acTL" chunk before the image data means APNG.
    if (head[0] === 0x89 && text(1, 3) === 'PNG') {
        for (let i = 8; i < head.length - 4; i++) {
            if (head[i] === 0x61 && text(i, 4) === 'acTL') return true;
            if (head[i] === 0x49 && text(i, 4) === 'IDAT') return false;
        }
    }
    return false;
}

async function uploadAnimatedFile(file, baseName) {
    const extension = (file.type.split('/')[1] ?? 'gif').replace('apng', 'png').replace(/[^a-z0-9]/gi, '') || 'gif';
    const safeName = `pt-${String(baseName || 'character').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_')}-${Date.now()}.${extension}`;
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ name: safeName, data: await fileToBase64(file) }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const { path } = await response.json();
    return `/${String(path).replace(/^\/+/, '')}`;
}

/** A picture waiting for its new character to be created. */
let pendingAnimated = null;

/**
 * SillyTavern's own picture picker (tap the character's picture). If the file
 * is animated, Pocket Tavern keeps the moving version next to the still card
 * picture SillyTavern saves; a still picture replaces any earlier animation.
 */
async function onAvatarPicked(event) {
    if (!active || !settings.animatedPictures || event.target?.id !== 'add_avatar_button') return;
    const file = event.target.files?.[0];
    if (!file) return;
    const context = ctx();
    const creating = isShown(document.getElementById('name_div')) || context.characterId === undefined;
    const character = creating ? null : context.characters?.[context.characterId];
    let animated = false;
    try {
        animated = await isAnimatedImage(file);
    } catch {
        animated = false;
    }
    if (!animated) {
        pendingAnimated = null;
        // A still picture replaces the old animation (once SillyTavern has saved the new one).
        if (character && animatedPictureFor(character.avatar)) {
            const avatar = character.avatar;
            setTimeout(() => {
                const idx = (ctx().characters ?? []).findIndex(item => item.avatar === avatar);
                if (idx !== -1) setAnimatedPicture(idx, '').catch(() => {});
            }, 2500);
        }
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        globalThis.toastr?.warning(t('That picture is too big to animate (over 15 MB); the still picture is used.'));
        return;
    }
    try {
        const url = await uploadAnimatedFile(file, character?.avatar ?? document.getElementById('character_name_pole')?.value);
        if (character) {
            const avatar = character.avatar;
            const charName = character.name;
            // Let SillyTavern finish saving the still picture first, so the two saves don't collide.
            setTimeout(async () => {
                try {
                    const idx = (ctx().characters ?? []).findIndex(item => item.avatar === avatar);
                    if (idx === -1) return;
                    await setAnimatedPicture(idx, url);
                    globalThis.toastr?.success(t('Animated picture set for {name}.', { name: charName }));
                } catch (err) {
                    console.warn(LOG, 'Animated picture save failed', err);
                }
            }, 2500);
        } else {
            pendingAnimated = { url, avatars: new Set((context.characters ?? []).map(item => item.avatar)), at: Date.now() };
        }
    } catch (error) {
        console.warn(LOG, 'Animated picture upload failed', error);
        globalThis.toastr?.error(t('Could not save the animated picture; the still picture is used.'));
    }
}

/** After a new character is created, give it the animated picture it was created with. */
function applyPendingAnimated() {
    if (!pendingAnimated) return;
    if (Date.now() - pendingAnimated.at > 10 * 60 * 1000) {
        pendingAnimated = null;
        return;
    }
    const characters = ctx().characters ?? [];
    const created = characters.find(item => !pendingAnimated.avatars.has(item.avatar));
    if (!created) return;
    const { url } = pendingAnimated;
    const avatar = created.avatar;
    pendingAnimated = null;
    setTimeout(() => {
        const idx = (ctx().characters ?? []).findIndex(item => item.avatar === avatar);
        if (idx !== -1) setAnimatedPicture(idx, url).catch(() => {});
    }, 1500);
}

// -- chat: the message box (persona button, context ring)

/**
 * The message box is one floating rounded box: the text on top, and a row of
 * tools along its bottom. Pocket Tavern adds two things to that row: your
 * persona (picture and name, tap to switch) and a ring that fills as the
 * context fills (tap it for what is in there).
 */
const composer = { persona: null, ring: null, plus: null, tabs: null, personas: null, formObserver: null };

/** SillyTavern's personas module, loaded once; it knows the current persona. */
function loadPersonasModule() {
    composer.personas ??= import('/scripts/personas.js').catch(() => null);
    return composer.personas;
}

function personaName(avatar) {
    return ctx().powerUserSettings?.personas?.[avatar] || ctx().name1 || '';
}

function personaPicture(avatar) {
    return avatar ? `/thumbnail?type=persona&file=${encodeURIComponent(avatar)}` : 'img/user-default.png';
}

async function updatePersonaButton() {
    const button = composer.persona;
    if (!button) return;
    const module = await loadPersonasModule();
    const avatar = module?.user_avatar || currentPersona();
    const name = personaName(avatar);
    const img = button.querySelector('img');
    const src = personaPicture(avatar);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    // Set as plain text: a persona's name is never translated.
    button.querySelector('.pt-persona-name').textContent = name;
    button.setAttribute('aria-label', name ? t('You are {name}. Tap to switch persona.', { name }) : t('Switch persona'));
}

function buildContextRing() {
    const ring = h('button', {
        type: 'button',
        class: 'pt-ctx-ring pt-ctx-empty',
        onclick: event => {
            buzz(6);
            openContextSheet(event.currentTarget);
        },
    }, [h('span', { class: 'pt-ctx-num', 'aria-hidden': 'true' })]);
    ring.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="pt-ctx-track" cx="18" cy="18" r="15"/><circle class="pt-ctx-fill" cx="18" cy="18" r="15" pathLength="100"/></svg>');
    return ring;
}

/**
 * The message box floats over the chat, so the chat scrolls behind it. Its
 * height (it grows as you type) is kept in --pt-form-h: the chat leaves that
 * much room at the bottom, and the jump button sits just above it.
 */
function watchFormHeight(on) {
    const sheld = document.getElementById('sheld');
    const form = document.getElementById('form_sheld');
    if (!on || !sheld || !form || !('ResizeObserver' in window)) {
        composer.formObserver?.disconnect();
        composer.formObserver = null;
        sheld?.style.removeProperty('--pt-form-h');
        return;
    }
    if (composer.formObserver) return;
    let last = -1;
    composer.formObserver = new ResizeObserver(() => {
        const height = Math.round(form.offsetHeight);
        if (height === last) return;
        const chat = document.getElementById('chat');
        // Stay at the newest message when the box grows or shrinks.
        const atBottom = chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
        last = height;
        // Written on the next frame, outside the size notification (Safari warned about a loop otherwise).
        requestAnimationFrame(() => {
            sheld.style.setProperty('--pt-form-h', `${height}px`);
            if (atBottom) chat.scrollTo(0, chat.scrollHeight);
        });
    });
    composer.formObserver.observe(form);
}

function syncComposer() {
    const left = document.getElementById('leftSendForm');
    const right = document.getElementById('rightSendForm');
    const want = active && settings.chatStyle && left && right;
    watchFormHeight(!!want);
    if (!want || !settings.contextMeter) {
        composer.ring?.remove();
        composer.ring = null;
    }
    if (!want || !settings.appShell || !settings.hideTabsInChat) {
        composer.tabs?.remove();
        composer.tabs = null;
    }
    if (!want) {
        composer.persona?.remove();
        composer.persona = null;
        composer.plus?.remove();
        composer.plus = null;
        document.getElementById('nonQRFormItems')?.classList.remove('pt-ih-browse');
        syncGuided();
        return;
    }
    if (!composer.persona || !composer.persona.isConnected) {
        composer.persona?.remove();
        composer.persona = h('button', {
            type: 'button',
            class: 'pt-persona-chip',
            title: 'Switch persona',
            onclick: () => {
                buzz(6);
                openPersonaChooser();
            },
        }, [h('img', { class: 'pt-persona-img', alt: '' }), h('span', { class: 'pt-persona-name' })]);
        left.prepend(composer.persona);
    }
    if (settings.appShell && settings.hideTabsInChat) {
        if (!composer.tabs || !composer.tabs.isConnected) {
            composer.tabs?.remove();
            composer.tabs = h('button', {
                type: 'button',
                class: 'pt-tabs-btn',
                'aria-controls': 'pt-tabbar',
                onclick: () => {
                    buzz(6);
                    shell?.toggleTabs();
                },
            }, [ui('chevron-up')]);
        }
        if (left.firstElementChild !== composer.tabs) left.prepend(composer.tabs);
        syncTabsButton();
    }
    if (settings.contextMeter && (!composer.ring || !composer.ring.isConnected)) {
        composer.ring?.remove();
        composer.ring = buildContextRing();
        right.prepend(composer.ring);
    }
    // + sits before the ring: persona, the field, +, the ring, Send (DESIGN.md → Message box).
    if (!composer.plus || !composer.plus.isConnected) composer.plus = buildPlusButton();
    const plusBefore = composer.ring?.parentElement === right ? composer.ring : right.firstElementChild;
    if (composer.plus.nextElementSibling !== plusBefore || composer.plus.parentElement !== right) right.insertBefore(composer.plus, plusBefore);
    updatePersonaButton();
    renderMeter();
    syncGuided();
}

// -- Guided Generations: its row of buttons becomes one button next to Send

/*
 * Guided Generations (another extension) adds a row of icon buttons to the
 * message box and two small pop-up menus that open above them. When it is
 * installed, Pocket Tavern folds all of that into one Guide button beside Send.
 * The button opens a sheet: the instruction you typed, then every action with
 * a name and a line on what it does, and its menus as sheets of their own.
 * Its buttons stay in the page (hidden) and the sheet presses them, so its own
 * settings and logic decide what happens. Without Guided Generations, none of
 * this exists.
 */
const guided = { button: null, count: null, watch: null, frame: 0, held: false };

const GG_ACTIONS = [
    { id: 'gg_response_button', group: 'reply', icon: 'chat', label: 'Guided response', note: 'Writes the next reply the way your instruction says' },
    { id: 'gg_swipe_button', group: 'reply', icon: 'refresh', label: 'Guided swipe', note: 'A new version of the last reply that follows your instruction' },
    { id: 'gg_continue_button', group: 'reply', icon: 'arrow-right', label: 'Guided continue', note: 'Carries on the last reply, following your instruction' },
    { id: 'gg_impersonate_button', group: 'mine', icon: 'user', label: 'Write my message as "I"', note: 'Turns your instruction into your next message. Run it again to get your instruction back.' },
    { id: 'gg_impersonate_button_2nd', group: 'mine', icon: 'contact', label: 'Write my message as "you"', note: 'The same, written in the second person' },
    { id: 'gg_impersonate_button_3rd', group: 'mine', icon: 'users', label: 'Write my message as "they"', note: 'The same, written in the third person' },
];

/** Its tool buttons repeat items of its Tools menu, so the sheet lists them there once. */
const GG_MENU_COPIES = new Set(['gg_simple_send_button', 'gg_recover_input_button', 'gg_edit_intros_button', 'gg_corrections_button', 'gg_separated_thinking_button', 'gg_spellchecker_button', 'gg_clear_input_button', 'gg_undo_button', 'gg_revert_button']);

function ggRow() {
    return document.getElementById('gg-action-button-container');
}

function ggPresent() {
    return !!ggRow();
}

function syncGuided() {
    const root = document.documentElement;
    const right = document.getElementById('rightSendForm');
    const watching = active && settings.chatStyle;
    const on = watching && settings.ggButton && ggPresent() && !!right;
    root.classList.toggle('pt-gg', on);
    // Its switch in Pocket Tavern's settings only shows when Guided Generations is installed.
    const switchRowLabel = document.getElementById('pt_ggbutton')?.closest('label');
    if (switchRowLabel) switchRowLabel.hidden = !ggPresent();
    watchGuided(watching);
    if (!on) {
        guided.button?.remove();
        guided.button = null;
        return;
    }
    if (!guided.button || !guided.button.isConnected) {
        guided.button?.remove();
        guided.count = h('span', { class: 'pt-gg-count', 'aria-hidden': 'true', hidden: true });
        guided.button = h('button', { type: 'button', class: 'pt-gg-btn' }, [ui('compass'), guided.count]);
        wireGuideButton(guided.button);
    }
    // Right next to Send: it is the other way to send.
    const send = document.getElementById('send_but');
    if (send?.parentElement === right) {
        if (guided.button.nextElementSibling !== send) right.insertBefore(guided.button, send);
    } else if (guided.button.parentElement !== right) {
        right.append(guided.button);
    }
    updateGuideCount();
}

/** Guided Generations builds its row after Pocket Tavern starts and rebuilds it when its settings change. */
function watchGuided(on) {
    const form = document.getElementById('send_form');
    if (!on || !form) {
        guided.watch?.disconnect();
        guided.watch = null;
        return;
    }
    if (guided.watch) return;
    guided.watch = new MutationObserver(() => {
        if (guided.frame) return;
        guided.frame = requestAnimationFrame(() => {
            guided.frame = 0;
            syncGuided();
        });
    });
    guided.watch.observe(form, { childList: true, subtree: true, characterData: true });
}

/** How many of its persistent guides are active, from the counter on its own button. */
function guideCount() {
    const number = parseInt((document.getElementById('pg_guide_counter_span')?.textContent ?? '').replace(/\D+/g, ''), 10);
    return Number.isFinite(number) ? number : 0;
}

function updateGuideCount() {
    if (!guided.button) return;
    const count = guideCount();
    const text = count ? String(count) : '';
    if (guided.count.textContent !== text) guided.count.textContent = text;
    guided.count.hidden = !count;
    const label = count ? t('Guided Generations, {count} guides active', { count }) : t('Guided Generations');
    if (guided.button.getAttribute('aria-label') !== label) {
        guided.button.setAttribute('aria-label', label);
        guided.button.title = label;
    }
}

/** A tap opens the sheet; holding runs the last action again. */
function wireGuideButton(button) {
    let timer = 0;
    const stop = () => {
        window.clearTimeout(timer);
        timer = 0;
    };
    button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        guided.held = false;
        stop();
        timer = window.setTimeout(() => {
            timer = 0;
            const last = lastGuidedAction();
            if (!last) return;
            guided.held = true;
            buzz([8, 40, 8]);
            runGuided(last.element, last.id);
        }, 500);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, stop);
    // No text-selection or link menu on a long press.
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('click', () => {
        if (guided.held) {
            guided.held = false;
            return;
        }
        buzz(6);
        openGuidedSheet();
    });
}

function lastGuidedAction() {
    const id = settings.ggLast;
    const action = GG_ACTIONS.find(item => item.id === id);
    const element = id ? document.getElementById(id) : null;
    return action && element && ggRow()?.contains(element) ? { id, element, label: action.label } : null;
}

/** Presses one of its buttons or menu items, after the sheet is gone. */
function runGuided(element, id) {
    if (id && settings.ggLast !== id) {
        settings.ggLast = id;
        saveSettings();
    }
    closeSheet(true);
    // Its menu items are links to "#"; keep the page where it is.
    element.addEventListener('click', event => event.preventDefault(), { once: true });
    element.click();
}

function openGuidedSheet() {
    const row = ggRow();
    if (!row) return;
    showSheet(new MenuSheet({
        title: 'Guided Generations',
        subtitle: '',
        fill: body => {
            const typed = document.getElementById('send_textarea')?.value.trim() ?? '';
            const preview = h('span', { class: 'pt-gg-instruction-text' });
            // Your own words, never translated.
            preview.textContent = typed || t('Type in the message box how the AI should steer, then pick an action. With nothing typed, each action works like the normal one.');
            body.append(h('button', {
                type: 'button',
                class: `pt-gg-instruction${typed ? '' : ' pt-gg-instruction-empty'}`,
                'aria-label': typed ? t('Your instruction. Tap to edit it.') : t('No instruction yet. Tap to type one.'),
                onclick: () => {
                    closeSheet(true);
                    document.getElementById('send_textarea')?.focus();
                },
            }, [h('span', { class: 'pt-gg-instruction-label', text: typed ? 'Your instruction' : 'No instruction yet' }), preview]));

            const rowsFor = group => GG_ACTIONS
                .filter(action => action.group === group)
                .map(action => ({ action, element: document.getElementById(action.id) }))
                .filter(({ element }) => element && row.contains(element))
                .map(({ action, element }) => actionRow(ui(action.icon, 'pt-menu-row-icon'), t(action.label), t(action.note), () => runGuided(element, action.id)));
            const reply = rowsFor('reply');
            const mine = rowsFor('mine');
            if (reply.length) body.append(h('p', { class: 'pt-menu-heading', text: 'Steer the reply' }), h('div', { class: 'pt-menu-list' }, reply));
            if (mine.length) body.append(h('p', { class: 'pt-menu-heading', text: 'Your message' }), h('div', { class: 'pt-menu-list' }, mine));

            // Buttons it adds that Pocket Tavern has no name for yet.
            const known = new Set(GG_ACTIONS.map(action => action.id));
            const other = [...row.querySelectorAll('.gg-action-button')]
                .filter(button => !known.has(button.id) && !GG_MENU_COPIES.has(button.id))
                .map(button => actionRow(faIcon(wrapIcon(button)), button.title || button.id, '', () => runGuided(button, '')));
            if (other.length) body.append(h('p', { class: 'pt-menu-heading', text: 'More actions' }), h('div', { class: 'pt-menu-list' }, other));

            const count = guideCount();
            const more = [];
            if (document.getElementById('pg_tools_menu')) {
                more.push(actionRow(ui('book', 'pt-menu-row-icon'), t('Persistent guides'), count ? t('{count} active', { count }) : t('None active'), () => openGuidedMenu('pg_tools_menu', 'Persistent guides', 'Notes the AI keeps in mind for this chat')));
            }
            if (document.getElementById('gg_tools_menu')) {
                more.push(actionRow(ui('list', 'pt-menu-row-icon'), t('Tools'), t('Simple send, spellchecker, corrections and more'), () => openGuidedMenu('gg_tools_menu', 'Guided Generations tools', '')));
            }
            more.push(actionRow(ui('settings', 'pt-menu-row-icon'), t('Guided Generations settings'), t('Choose which actions show and how they work'), () => openGuidedSettings()));
            body.append(h('p', { class: 'pt-menu-heading', text: 'More' }), h('div', { class: 'pt-menu-list' }, more));

            const last = lastGuidedAction();
            body.append(h('p', {
                class: 'pt-menu-foot',
                text: last ? t('Hold the guide button to run {action} again.', { action: t(last.label) }) : t('After you use an action, hold the guide button to run it again.'),
            }));
        },
    }));
}

/** Font Awesome classes sit on the button itself; faIcon looks for them inside an element. */
function wrapIcon(button) {
    const holder = document.createElement('span');
    const copy = button.cloneNode(false);
    copy.removeAttribute('id');
    holder.append(copy);
    return holder;
}

/** One of its menus (Persistent guides, Tools) as a sheet: the same items, groups and descriptions. */
function openGuidedMenu(menuId, title, subtitle) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    showSheet(new MenuSheet({
        title,
        subtitle,
        fill: body => {
            let rows = [];
            const flush = () => {
                if (rows.length) body.append(h('div', { class: 'pt-menu-list' }, rows));
                rows = [];
            };
            for (const node of menu.children) {
                if (node.tagName === 'HR') {
                    flush();
                    continue;
                }
                if (node.tagName !== 'A' || !(node.textContent ?? '').trim()) continue;
                rows.push(actionRow(faIcon(node), itemLabel(node), node.title || '', () => runGuided(node, '')));
            }
            flush();
        },
    }));
}

function openGuidedSettings() {
    closeSheet(true);
    openPage('extensions-settings-button');
    setTimeout(() => {
        const drawer = document.getElementById('gg_versionBadge')?.closest('.inline-drawer');
        if (!drawer) return;
        const content = drawer.querySelector('.inline-drawer-content');
        if (content && getComputedStyle(content).display === 'none') drawer.querySelector('.inline-drawer-toggle')?.click();
        drawer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 250);
}

// -- Input History (another extension): its arrows show when they can help

/** After its arrows bring back an earlier message they stay until you type your own words. */
function onInputHistoryClick(event) {
    if (!active || !settings.chatStyle) return;
    if (event.target.closest?.('#nonQRFormItems .stih--arrows')) document.getElementById('nonQRFormItems')?.classList.add('pt-ih-browse');
}

function onComposerInput(event) {
    if (!active) return;
    if (event.isTrusted && event.target?.id === 'send_textarea') document.getElementById('nonQRFormItems')?.classList.remove('pt-ih-browse');
}

/**
 * "Faster long chats" skips drawing messages that are off screen and guesses
 * their height until they are drawn. Scrolling up into a message drawn for the
 * first time then changed its height, and the chat moved under your finger.
 * So after a chat opens (or its messages change size) every message is drawn
 * once, for one frame; the browser remembers each real height from then on.
 */
const fastChat = { timer: 0, width: 0 };

function primeChatSizes(delay = 0) {
    window.clearTimeout(fastChat.timer);
    fastChat.timer = window.setTimeout(() => {
        const chat = document.getElementById('chat');
        if (!active || !settings.fastChat || !chat) return;
        chat.classList.add('pt-fast-prime');
        // Drawn in the next frame (heights are remembered then), skipped again after it.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            chat.classList.remove('pt-fast-prime');
            keepAtNewest();
        }));
    }, delay);
}

/**
 * A chat opens at its newest message. SillyTavern scrolls there once, but then
 * the messages settle (their real heights are measured, long ones fold), and
 * the chat ended up far above the newest message. For a moment after a chat
 * opens, keep it at the newest message, until you scroll yourself.
 */
const newest = { until: 0, started: null };

function keepAtNewest() {
    if (!active) return;
    const chat = document.getElementById('chat');
    if (newest.started?.()) newest.until = 0;
    if (!chat || Date.now() > newest.until || ctx().getCurrentChatId?.() === undefined) return;
    chat.scrollTop = chat.scrollHeight;
}

function holdAtNewest(ms = 2500) {
    const chat = document.getElementById('chat');
    if (!active || !chat || ctx().powerUserSettings?.auto_scroll_chat_to_bottom === false) return;
    newest.until = Date.now() + ms;
    newest.started = userScrollSince();
    for (const delay of [60, 250, 500, 900, 1400, 2200]) setTimeout(keepAtNewest, delay);
}

/**
 * Scrolling by hand: a touch, the wheel, a scroll key or the scrollbar. One set of
 * listeners on the chat (added once), so opening chats does not pile up more.
 * Returns a check: has the user scrolled since this call?
 */
const userScroll = { at: 0, wired: null };

function userScrollSince() {
    const chat = document.getElementById('chat');
    if (chat && userScroll.wired !== chat) {
        userScroll.wired = chat;
        const mark = () => { userScroll.at = performance.now(); };
        chat.addEventListener('touchstart', mark, { passive: true });
        chat.addEventListener('wheel', mark, { passive: true });
        // The scrollbar: a press on the chat itself, not on a message inside it.
        chat.addEventListener('pointerdown', event => { if (event.target === chat) mark(); }, { passive: true });
        document.addEventListener('keydown', event => {
            if (active && ['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && !event.target?.closest?.('textarea, input, select, [contenteditable]')) mark();
        });
    }
    const since = performance.now();
    return () => userScroll.at > since;
}

function onChatWidthChange() {
    const width = document.getElementById('chat')?.clientWidth ?? 0;
    if (!width || width === fastChat.width) return;
    fastChat.width = width;
    // A new width wraps every message differently.
    primeChatSizes(250);
}

// -- chat: a message picture that fails to load (a removed group member, a missing file).
// SillyTavern swaps it for a 50px "no picture" icon, which spilled out of our smaller picture slot
// (Kahvana's report). The icon is marked with the name's initials and a colour made from the name,
// and CSS draws it as a circle in the slot.

function nameHue(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) | 0;
    return Math.abs(hash) % 360;
}

function initialsOf(name) {
    const firsts = String(name).trim().split(/\s+/).map(word => word.match(/[\p{L}\p{N}]/u)?.[0]).filter(Boolean);
    if (!firsts.length) return '?';
    return (firsts.length > 1 ? firsts[0] + firsts[firsts.length - 1] : firsts[0]).toLocaleUpperCase();
}

function markMissingAvatars(root = document.getElementById('chat')) {
    const want = active && settings.chatStyle;
    for (const icon of root?.querySelectorAll('.mes .avatar > .missing-avatar') ?? []) {
        if (!want) {
            delete icon.dataset.ptInitials;
            icon.style.removeProperty('--pt-hue');
            continue;
        }
        const name = icon.closest('.mes')?.getAttribute('ch_name') ?? '';
        const initials = initialsOf(name);
        if (icon.dataset.ptInitials === initials) continue;
        icon.dataset.ptInitials = initials;
        icon.style.setProperty('--pt-hue', String(nameHue(name)));
    }
}

function onAvatarError(event) {
    const img = event.target;
    if (!active || !settings.chatStyle || !(img instanceof HTMLImageElement)) return;
    const mes = img.closest('#chat .mes');
    // SillyTavern's own error handler on the picture runs after this capture listener.
    if (mes && img.closest('.avatar')) setTimeout(() => markMissingAvatars(mes), 0);
}

// -- chat: search inside the chat

const finder = { bar: null, hits: [], index: -1, marks: [], seq: 0, timer: 0 };

function chatFinderOpen() {
    return !!finder.bar;
}

function closeChatFinder() {
    finder.seq += 1;
    window.clearTimeout(finder.timer);
    finder.timer = 0;
    clearFinderMarks();
    document.querySelectorAll('#chat .mes.pt-flash').forEach(mes => mes.classList.remove('pt-flash'));
    finder.bar?.remove();
    finder.bar = null;
    finder.hits = [];
    finder.index = -1;
    scheduleHistorySync();
}

function clearFinderMarks() {
    const parents = new Set();
    for (const mark of finder.marks) {
        if (!mark.isConnected) continue;
        if (mark.parentElement) parents.add(mark.parentElement);
        mark.replaceWith(document.createTextNode(mark.textContent));
    }
    for (const parent of parents) parent.normalize?.();
    finder.marks = [];
}

function markInMessage(mes, words) {
    if (!words.length) return;
    const text = mes.querySelector('.mes_text');
    if (!text) return;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const pattern = new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    for (const node of nodes) {
        const value = node.nodeValue;
        const norm = normalizeText(value);
        const searchIn = norm.length === value.length ? norm : value;
        pattern.lastIndex = 0;
        if (!pattern.test(searchIn)) continue;
        pattern.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let last = 0;
        for (const match of searchIn.matchAll(pattern)) {
            if (!match[0].length) break;
            const start = match.index;
            const end = start + match[0].length;
            fragment.append(document.createTextNode(value.slice(last, start)));
            const mark = h('mark', { class: 'pt-find-mark', raw: value.slice(start, end) });
            finder.marks.push(mark);
            fragment.append(mark);
            last = end;
        }
        fragment.append(document.createTextNode(value.slice(last)));
        node.replaceWith(fragment);
    }
}

async function showFinderHit(index) {
    if (!finder.hits.length || !finder.bar) return;
    const token = ++finder.seq;
    finder.index = (index + finder.hits.length) % finder.hits.length;
    const id = finder.hits[finder.index];
    finder.bar.querySelector('.pt-find-count').textContent = `${finder.index + 1}/${finder.hits.length}`;
    // Older messages may not be on the page yet: ask SillyTavern to load more.
    for (let tries = 0; tries < 60 && !document.querySelector(`#chat .mes[mesid="${id}"]`); tries++) {
        if (finder.seq !== token || !finder.bar || !active) return;
        const more = document.getElementById('show_more_messages');
        if (!more) break;
        more.click();
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (finder.seq !== token || !finder.bar || !active) return;
    const mes = document.querySelector(`#chat .mes[mesid="${id}"]`);
    if (!mes) return;
    clearFinderMarks();
    const words = normalizeText(finder.bar.querySelector('input').value).split(/\s+/).filter(Boolean);
    if (!words.length) return;
    markInMessage(mes, words);
    unfold(mes);
    const firstMark = finder.marks[0];
    (firstMark ?? mes).scrollIntoView({ block: 'center', behavior: motionAllowed() ? 'smooth' : 'auto' });
    mes.classList.remove('pt-flash');
    void mes.offsetWidth;
    mes.classList.add('pt-flash');
    window.setTimeout(() => mes.classList.remove('pt-flash'), 1600);
}

function runChatSearch() {
    const input = finder.bar?.querySelector('input');
    if (!input) return;
    const words = normalizeText(input.value).split(/\s+/).filter(Boolean);
    const chat = ctx().chat ?? [];
    finder.hits = [];
    if (words.length) {
        chat.forEach((message, id) => {
            if (message?.is_system) return;
            const text = normalizeText(`${message.mes ?? ''} ${message.extra?.display_text ?? ''}`);
            if (words.every(word => text.includes(word))) finder.hits.push(id);
        });
    }
    const count = finder.bar.querySelector('.pt-find-count');
    if (!words.length) count.textContent = '';
    else if (!finder.hits.length) count.textContent = t('None');
    if (finder.hits.length) showFinderHit(finder.hits.length - 1);
    else clearFinderMarks();
}

function openChatFinder() {
    if (finder.bar) {
        finder.bar.querySelector('input').focus();
        return;
    }
    const input = h('input', { type: 'search', class: 'text_pole', placeholder: t('Search this chat'), 'aria-label': t('Search this chat'), enterkeyhint: 'search' });
    input.addEventListener('input', () => {
        window.clearTimeout(finder.timer);
        finder.timer = window.setTimeout(() => {
            finder.timer = 0;
            runChatSearch();
        }, 250);
    });
    input.addEventListener('keydown', event => {
        // Enter: flush pending search or go to next older match; Shift+Enter: newer; Escape closes.
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            if (finder.timer) {
                window.clearTimeout(finder.timer);
                finder.timer = 0;
                runChatSearch();
            } else {
                showFinderHit(finder.index + (event.shiftKey ? 1 : -1));
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeChatFinder();
        }
    });
    const button = (iconName, label, onclick) => h('button', { type: 'button', class: 'pt-find-btn', 'aria-label': label, title: label, onclick }, [ui(iconName)]);
    finder.bar = h('div', { class: 'pt-chat-finder', role: 'search' }, [
        input,
        h('span', { class: 'pt-find-count' }),
        button('chevron-up', 'Older match', () => showFinderHit(finder.index - 1)),
        button('chevron-down', 'Newer match', () => showFinderHit(finder.index + 1)),
        button('x', 'Close search', () => closeChatFinder()),
    ]);
    shieldFromDrawerAutoClose(finder.bar);
    document.body.append(finder.bar);
    setTimeout(() => input.focus(), 50);
    scheduleHistorySync();
}

// -- chat: how full is the context?

// `live` is on while a reply of yours is being prepared: only that prompt is counted. Extensions
// and SillyTavern features send small background prompts through the same events (generateRaw,
// quiet prompts), and one of those used to replace the count ("always 64 tokens", issue #3).
const meter = { used: 0, max: 0, breakdown: null, chatId: null, live: false, timer: 0 };

function contextMax() {
    const context = ctx();
    return context.mainApi === 'openai' ? Number(context.chatCompletionSettings?.openai_max_context) || 0 : Number(context.maxContext) || 0;
}

/** How many tokens are kept free for the reply. */
function replyLength() {
    const context = ctx();
    if (context.mainApi === 'openai') return Number(context.chatCompletionSettings?.openai_max_tokens) || 0;
    return Number(document.getElementById('amount_gen')?.value) || 0;
}

/** What the prompt itself may use: the context size minus the room kept for the reply. */
function contextAvailable() {
    return Math.max(0, contextMax() - replyLength());
}

async function measurePrompt(text) {
    try {
        const tokens = await ctx().getTokenCountAsync?.(text);
        if (typeof tokens === 'number') {
            meter.used = tokens;
            meter.max = contextAvailable() || contextMax();
            meter.breakdown = null;
            renderMeter();
        }
    } catch {
        // No tokenizer for this API: leave the meter as it was.
    }
}

const CTX_PARTS = {
    system: { label: 'Main prompt and instructions', color: '#94a3b8' },
    character: { label: 'Character, persona and scenario', color: '#a78bfa' },
    examples: { label: 'Example messages', color: '#f5b942' },
    lore: { label: 'Lorebooks', color: '#2dd4bf' },
    history: { label: 'Chat history', color: 'var(--pt-accent)' },
    notes: { label: "Author's note and extras", color: '#f472b6' },
    bias: { label: 'Bias', color: '#cbd5e1' },
    other: { label: 'Other', color: '#64748b' },
};

/**
 * What filled the context on the last reply, from SillyTavern's own record of
 * each prompt (the same numbers as its Prompt popup). Null before any reply.
 */
async function contextBreakdown() {
    const module = await import('/scripts/itemized-prompts.js').catch(() => null);
    const list = module?.itemizedPrompts;
    const chat = ctx().chat ?? [];
    if (!Array.isArray(list) || !list.length) return null;
    let index = -1;
    for (let i = list.length - 1; i >= 0; i--) {
        if (chat[list[i]?.mesId]) {
            index = i;
            break;
        }
    }
    if (index < 0) return null;
    const entry = list[index];
    const p = await module.itemizedParams(list, index, entry.mesId);
    const n = value => Math.max(0, Math.round(Number(value) || 0));
    let total;
    let available;
    let parts;
    if (p.this_main_api === 'openai') {
        total = n(p.finalPromptTokens);
        available = n(p.thisPrompt_max_context);
        const story = n(p.afterScenarioAnchorTokens) + n(p.beforeScenarioAnchorTokens) + n(p.oaiPromptTokens);
        parts = [
            ['system', n(p.oaiSystemTokens)],
            ['character', Math.max(0, story - n(p.examplesStringTokens))],
            ['examples', n(p.examplesStringTokens)],
            ['lore', n(p.worldInfoStringTokens)],
            ['history', n(p.ActualChatHistoryTokens)],
            ['bias', n(p.oaiBiasTokens)],
        ];
    } else {
        total = n(p.totalTokensInPrompt) || n(p.finalPromptTokens);
        available = n(p.thisPrompt_max_context);
        parts = [
            ['character', n(p.storyStringTokens)],
            ['examples', n(p.examplesStringTokens)],
            ['lore', n(p.worldInfoStringTokens)],
            ['history', n(p.ActualChatHistoryTokens)],
            ['notes', n(p.allAnchorsTokens)],
            ['bias', n(p.promptBiasTokens)],
        ];
    }
    const counted = parts.reduce((sum, [, tokens]) => sum + tokens, 0);
    if (total > counted + 2) parts.push(['other', total - counted]);
    if (!total) total = counted;
    return {
        total,
        available: available || contextAvailable(),
        reply: replyLength(),
        parts: parts.filter(([, tokens]) => tokens > 0).map(([key, tokens]) => ({ key, tokens })),
        character: {
            Description: n(p.charDescriptionTokens),
            Personality: n(p.charPersonalityTokens),
            Scenario: n(p.scenarioTextTokens),
            Persona: n(p.userPersonaStringTokens),
        },
        messages: Number(p.messagesCount) || 0,
    };
}

/** After a chat opens, fill the ring from its last reply right away. */
async function loadMeterFromHistory() {
    if (!active || !settings.contextMeter) return;
    const chatId = ctx().getCurrentChatId?.();
    try {
        const info = await contextBreakdown();
        if (ctx().getCurrentChatId?.() !== chatId) return;
        meter.chatId = chatId;
        if (info) {
            meter.used = info.total;
            meter.max = info.available;
            meter.breakdown = info;
        }
        renderMeter();
    } catch (error) {
        console.debug(LOG, 'Could not read the last prompt', error);
    }
}

function contextShare() {
    return meter.used && meter.max ? Math.min(1, meter.used / meter.max) : 0;
}

/** A ring with the share drawn on it; used in the message box and, bigger, in the Context sheet. */
function paintRing(ring, share, empty) {
    const percent = Math.round(share * 100);
    // A style, not an attribute: the stylesheet's starting value would win over an attribute.
    const fill = ring.querySelector('.pt-ctx-fill');
    if (fill) fill.style.strokeDasharray = `${empty ? 0 : Math.max(2, percent)} 100`;
    ring.classList.toggle('pt-ctx-empty', empty);
    ring.classList.toggle('pt-ctx-warn', !empty && share > 0.85 && share <= 0.98);
    ring.classList.toggle('pt-ctx-full', !empty && share > 0.98);
    const num = ring.querySelector('.pt-ctx-num');
    if (num) num.textContent = empty ? '' : `${percent}%`;
}

function onPromptReady(data) {
    if (!active || !settings.contextMeter || data?.dryRun || !meter.live) return;
    meter.live = false;
    if (Array.isArray(data?.chat)) measurePrompt(data.chat.map(item => (typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''))).join('\n'));
    else if (typeof data?.prompt === 'string') measurePrompt(data.prompt);
}

function renderMeter() {
    const ring = composer.ring;
    if (!ring) return;
    const empty = !meter.used || !meter.max;
    const share = contextShare();
    paintRing(ring, share, empty);
    const label = empty ? t('Context: no reply yet. Tap for details.') : t('Context {percent}% full. Tap for details.', { percent: Math.round(share * 100) });
    ring.setAttribute('aria-label', label);
    ring.title = label;
}

/** The Context sheet: how full, what filled it, and where to change it (DESIGN.md → Message box). */
function openContextSheet(anchor) {
    const inChat = !!(ctx().groupId || ctx().characterId !== undefined);
    let info = meter.breakdown;
    let loading = inChat && !info;
    let failed = false;
    const instance = new MenuSheet({
        title: t('Context'),
        subtitle: t('What the model reads before it replies'),
        anchor,
        fill: body => fillContextSheet(body, { inChat, info, loading, failed }),
    });
    showSheet(instance);
    if (!loading) return;
    contextBreakdown().then(result => {
        info = result;
        if (result) {
            meter.used = result.total;
            meter.max = result.available;
            meter.breakdown = result;
            renderMeter();
        }
    }).catch(error => {
        failed = true;
        console.debug(LOG, 'Could not read the last prompt', error);
    }).finally(() => {
        loading = false;
        if (sheet === instance) instance.fill = body => fillContextSheet(body, { inChat, info, loading, failed });
        if (sheet === instance) instance.refresh();
    });
}

function fillContextSheet(body, { inChat, info, loading, failed }) {
    if (!inChat) {
        body.append(h('p', { class: 'pt-menu-foot', text: t('Open a chat first.') }));
        return;
    }
    const fmt = value => Number(value || 0).toLocaleString();
    const total = info?.total ?? meter.used;
    const available = info?.available ?? (meter.max || contextAvailable());
    const reply = info?.reply ?? replyLength();
    const empty = !total || !available;
    const share = empty ? 0 : Math.min(1, total / available);

    // The big ring and the headline.
    const big = h('div', { class: 'pt-ctx-big' }, [
        h('span', { class: 'pt-ctx-num' }),
        h('small', { class: 'pt-ctx-unit', text: empty ? '' : t('full') }),
    ]);
    big.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="pt-ctx-track" cx="18" cy="18" r="15"/><circle class="pt-ctx-fill" cx="18" cy="18" r="15" pathLength="100"/></svg>');
    paintRing(big, share, empty);
    if (empty) big.querySelector('.pt-ctx-num').textContent = '–';
    const head = h('div', { class: 'pt-ctx-head' });
    if (loading) {
        head.append(h('b', { text: t('Counting…') }));
    } else if (empty) {
        head.append(h('b', { text: t('No reply yet in this chat') }), h('small', { text: t('After the next reply you will see what filled the context: the character, lorebooks, chat history and more.') }));
    } else {
        head.append(
            h('b', { text: t('{used} tokens', { used: fmt(total) }) }),
            h('small', { text: t('of {available} the model can read', { available: fmt(available) }) }),
            h('small', { class: 'pt-ctx-sub', text: t('{max} context, {reply} kept for the reply', { max: fmt(available + reply), reply: fmt(reply) }) }),
        );
    }
    body.append(h('div', { class: 'pt-ctx-hero' }, [big, head]));
    if (loading) return;

    // What filled it: one bar, then one row per part.
    if (info?.parts?.length && !empty) {
        const bar = h('div', { class: 'pt-ctx-bar', role: 'img', 'aria-label': t('What filled the context') });
        for (const part of info.parts) {
            const span = h('span');
            span.style.setProperty('--c', CTX_PARTS[part.key].color);
            span.style.flexBasis = `${(part.tokens / available) * 100}%`;
            bar.append(span);
        }
        body.append(bar);
        const rows = info.parts.map(part => {
            const dot = h('span', { class: 'pt-ctx-dot' });
            dot.style.setProperty('--c', CTX_PARTS[part.key].color);
            const text = h('span', { class: 'pt-ctx-name' }, [h('span', { text: CTX_PARTS[part.key].label })]);
            if (part.key === 'character') {
                const pieces = Object.entries(info.character).filter(([, tokens]) => tokens > 0).map(([name, tokens]) => `${t(name)} ${fmt(tokens)}`);
                if (pieces.length) text.append(h('small', { text: pieces.join(', ') }));
            }
            if (part.key === 'history') {
                if (info.messages) text.append(h('small', { text: t('{count} messages', { count: info.messages }) }));
            }
            return h('div', { class: 'pt-ctx-row' }, [
                dot,
                text,
                h('span', { class: 'pt-ctx-tok' }, [h('b', { text: fmt(part.tokens) }), h('small', { text: `${Math.max(1, Math.round((part.tokens / available) * 100))}%` })]),
            ]);
        });
        const free = Math.max(0, available - total);
        const freeDot = h('span', { class: 'pt-ctx-dot pt-ctx-dot-free' });
        rows.push(h('div', { class: 'pt-ctx-row pt-ctx-row-free' }, [
            freeDot,
            h('span', { class: 'pt-ctx-name' }, [h('span', { text: t('Free space') })]),
            h('span', { class: 'pt-ctx-tok' }, [h('b', { text: fmt(free) }), h('small', { text: `${Math.round((free / available) * 100)}%` })]),
        ]));
        body.append(h('div', { class: 'pt-ctx-list' }, rows));
    }

    // A plain-words note on what this means.
    if (!empty) {
        const warn = share > 0.85;
        const note = warn
            ? t('Almost full: the oldest messages are left out so the newest ones fit.')
            : t('Room for about {free} more tokens before older messages start to drop out.', { free: fmt(Math.max(0, available - total)) });
        body.append(h('p', { class: `pt-ctx-note ${warn ? 'pt-ctx-note-warn' : ''}`, text: note }));
    }
    if (failed) body.append(h('p', { class: 'pt-ctx-note pt-ctx-note-warn', text: t('Could not read the details of the last reply.') }));

    // One action: where the prompt is put together (Chat Completion keeps it with the presets).
    const promptPage = ctx().mainApi === 'openai' ? 'ai-config-button' : 'advanced-formatting-button';
    body.append(h('div', { class: 'pt-ctx-actions' }, [uiButton({
        label: 'Open prompt settings',
        icon: 'sliders',
        onClick: () => {
            closeSheet(true);
            openPage(promptPage);
        },
    })]));
    if (info) body.append(h('p', { class: 'pt-menu-foot', text: t('Counted from the last reply in this chat.') }));
}

// -- chat: look (cards, bubbles, flat)

function applyChatLook() {
    const root = document.documentElement;
    if (active && settings.chatStyle && settings.chatLook && settings.chatLook !== 'cards') root.dataset.ptLook = settings.chatLook;
    else delete root.dataset.ptLook;
}

function pickChatLook(look) {
    const switched = useFlatChatStyle();
    if (switched) globalThis.toastr?.info(t("SillyTavern's Chat Style is now Flat, so Pocket Tavern's chat look shows."), '', { timeOut: 4000 });
    if ((settings.chatLook || 'cards') !== look) setAppearance('chatLook', look);
    else if (switched && sheet && !sheet.picker) sheet.refresh();
}

// -- SillyTavern's own look (UI themes, Chat Style, backgrounds) next to Pocket Tavern's

/**
 * A Pocket Tavern theme draws the whole look, the messages too. A SillyTavern theme picked
 * earlier (Cappuccino, Azure) often brings Chat Style: Bubbles, and SillyTavern then drew its
 * bubbles in Pocket Tavern's colours: the two looks fought. So when a Pocket Tavern theme
 * comes on (a new install, or picking one), SillyTavern's Chat Style goes to Flat once and the
 * old style is remembered; picking a SillyTavern theme again, or turning Pocket Tavern (or its
 * chat cards) off, puts it back. Only on those changes: a Chat Style you pick afterwards stays.
 */
function syncChatStyleForTheme() {
    syncStCustomCss();
    const select = document.getElementById('chat_display');
    if (!select) return;
    const own = active && settings.chatStyle && ownThemeOn() ? String(settings.theme) : '';
    if (own) {
        if (settings.chatStyleFor === own) {
            // Still on: a SillyTavern theme just picked in SillyTavern's own settings may have switched Chat Style
            // back to Bubbles or Document, so Pocket Tavern's theme keeps drawing the chat. A style picked by hand stays.
            if (select.value !== '0' && Date.now() - stThemePickedAt < 1500) useFlatChatStyle();
            return;
        }
        settings.chatStyleFor = own;
        if (select.value !== '0') {
            const name = stChatStyleName();
            settings.stChatStyle = select.value;
            useFlatChatStyle();
            globalThis.toastr?.info(t("Pocket Tavern's theme draws the chat, so SillyTavern's {style} chat style is off while it is on. Picking a SillyTavern theme in Settings → Appearance brings it back.", { style: t(name) }), '', { timeOut: 7000 });
        }
        saveSettings();
        return;
    }
    if (!settings.chatStyleFor) return;
    const back = settings.stChatStyle;
    settings.chatStyleFor = '';
    settings.stChatStyle = '';
    saveSettings();
    if (back && select.value === '0' && select.querySelector(`option[value="${CSS.escape(back)}"]`)) $j()(select).val(back).trigger('change');
}

/**
 * SillyTavern's Custom CSS (Settings → SillyTavern → Custom CSS). Picking a SillyTavern theme puts that theme's own
 * CSS there, so while a Pocket Tavern theme is on it is set aside (a `media` that matches nothing), unless
 * Appearance → "SillyTavern's Custom CSS" is on. "Your theme" and SillyTavern's themes always use it.
 */
function syncStCustomCss() {
    const style = document.getElementById('custom-style');
    if (!style) return;
    const off = active && ownThemeOn() && !settings.stCustomCss;
    if (off && style.getAttribute('media') !== 'not all') {
        style.setAttribute('media', 'not all');
        style.dataset.ptOff = '1';
    } else if (!off && style.dataset.ptOff) {
        style.removeAttribute('media');
        delete style.dataset.ptOff;
    }
}

/** When a SillyTavern theme was last picked: the avatar shape it sets right after is the theme's, not yours. */
let stThemePickedAt = 0;

/**
 * A SillyTavern theme picked in SillyTavern's own settings: Pocket Tavern's theme stays in charge. Its Chat Style
 * goes back to Flat and the avatar shape you chose comes back (a theme brings its own).
 */
function watchStThemePicks() {
    const $ = $j();
    $(document).off('.ptStTheme');
    if (!active) return;
    const shape = document.getElementById('avatar_style');
    if (shape && typeof settings.avatarShape !== 'string') {
        settings.avatarShape = shape.value;
        saveSettings();
    }
    $(document).on('change.ptStTheme', '#themes', () => {
        stThemePickedAt = Date.now();
        window.setTimeout(() => {
            if (!active) return;
            syncChatStyleForTheme();
            const select = document.getElementById('avatar_style');
            if (ownThemeOn() && select && typeof settings.avatarShape === 'string' && select.value !== settings.avatarShape
                && select.querySelector(`option[value="${CSS.escape(settings.avatarShape)}"]`)) {
                $(select).val(settings.avatarShape).trigger('change');
            }
        }, 400);
    });
    // A shape you pick yourself (Appearance or SillyTavern's own setting) is the one kept.
    $(document).on('change.ptStTheme', '#avatar_style', function () {
        if (Date.now() - stThemePickedAt < 1500) return;
        if (settings.avatarShape !== this.value) {
            settings.avatarShape = this.value;
            saveSettings();
        }
    });
}

/** SillyTavern's Chat Style when it is not Flat (Pocket Tavern's message cards only draw over Flat), else ''. */
function stChatStyleName() {
    const select = document.getElementById('chat_display');
    if (!select || select.value === '0') return '';
    return select.selectedOptions[0]?.textContent?.trim() || select.value;
}

/** Puts SillyTavern's Chat Style on Flat (it saves it); true when it changed. */
function useFlatChatStyle() {
    const select = document.getElementById('chat_display');
    if (!select || select.value === '0') return false;
    $j()(select).val('0').trigger('change');
    return true;
}

function themeNote(id, key, text, actions = []) {
    return h('div', { id, class: 'pt-inline-note', 'data-pt': '1', 'data-key': key }, [
        h('p', { text }),
        actions.length ? h('div', { class: 'pt-inline-note-actions' }, actions.map(([label, onclick]) => h('button', { type: 'button', class: 'pt-inline-note-btn', onclick }, [label]))) : null,
    ]);
}

/** On the Backgrounds page: a Pocket Tavern theme's own background is covering chat backgrounds. */
function syncBackgroundNote() {
    const header = document.getElementById('bg-header-fixed');
    let note = document.getElementById('pt_bg_note');
    const theme = active ? currentTheme() : null;
    const key = theme && ownThemeOn() && settings.themeBackdrop ? `theme:${theme.id}` : '';
    if (!header || !key) {
        note?.remove();
        return;
    }
    if (note?.dataset.key === key) return;
    note?.remove();
    note = themeNote('pt_bg_note', key, t('The {theme} theme shows its own background, so chat backgrounds are hidden.', { theme: t(theme.name) }), [
        ['Show chat backgrounds', () => setAppearance('themeBackdrop', false)],
    ]);
    header.prepend(note);
}

/**
 * At the top of Settings → Look: SillyTavern's UI Theme list is hidden there while
 * Pocket Tavern is on, because its themes are in Settings → Themes, made to fit.
 */
function syncLookNote() {
    const block = document.getElementById('UI-presets-block');
    let note = document.getElementById('pt_look_note');
    if (!block || !active) {
        note?.remove();
        return;
    }
    if (note) return;
    note = themeNote('pt_look_note', 'moved', "Themes are in Settings → Appearance: Pocket Tavern's own, and your SillyTavern themes made to fit. Theme Colors below change \"Your theme\".", [
        ['Open Appearance', () => openPage('pt-appearance')],
    ]);
    block.prepend(note);
}

function syncThemeNotes() {
    syncBackgroundNote();
    syncLookNote();
}

/**
 * Picking a background while a Pocket Tavern theme shows its own: the pick is what
 * you want to see, so the theme's background turns off.
 */
function onBackgroundPick(event) {
    if (!active || !settings.themeBackdrop || !ownThemeOn()) return;
    const thumb = event.target.closest?.('#bg_menu_content .bg_example');
    if (!thumb || event.target.closest('.jg-menu, .mobile-only-menu-toggle') || thumb.closest('.bg-selection-mode')) return;
    setAppearance('themeBackdrop', false);
    globalThis.toastr?.info(t("The theme's own background is off now. Turn it back on in Settings → Themes."), t('Showing your background'), { timeOut: 4000 });
}

// -- long-press a message for its menu

const press = { timer: 0, x: 0, y: 0, fired: 0 };

function onMessagePressStart(event) {
    if (!active || !settings.messageMenu || !settings.longPress || event.pointerType === 'mouse') return;
    const message = event.target.closest?.('#chat .mes');
    if (!message || event.target.closest('textarea, input, a, button, .mes_button, .menu_button, .avatar, .swipe_left, .swipe_right, .mes_reasoning_summary, #curEditTextarea')) return;
    if (message.querySelector('#curEditTextarea')) return;
    window.clearTimeout(press.timer);
    press.x = event.clientX;
    press.y = event.clientY;
    press.timer = window.setTimeout(() => {
        press.timer = 0;
        if (!active || !message.isConnected) return;
        press.fired = Date.now();
        window.getSelection?.()?.removeAllRanges();
        buzz(15);
        openMessageMenu(message);
    }, 520);
}

function onMessagePressMove(event) {
    if (press.timer && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
        window.clearTimeout(press.timer);
        press.timer = 0;
    }
}

function onMessagePressEnd() {
    window.clearTimeout(press.timer);
    press.timer = 0;
}

/** After a long-press opened the menu, swallow the stray tap/contextmenu on the chat (never inside the opened sheet). */
function onPressAfterEffects(event) {
    if (press.fired && Date.now() - press.fired < 700) {
        if (event.target instanceof Element && event.target.closest('#pt-sheet')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}

// -- "can't reach SillyTavern" banner

const server = { down: false, timer: 0, busy: false };

async function serverReachable() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 5000) : 0;
    try {
        // Any answer at all means the server is up; only a network failure or timeout counts.
        await fetch('/api/ping', { method: 'POST', headers: ctx().getRequestHeaders?.() ?? {}, cache: 'no-store', signal: controller?.signal });
        return true;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timeout);
    }
}

function scheduleServerCheck(delay) {
    window.clearTimeout(server.timer);
    if (!active || !settings.serverWatch) return;
    server.timer = window.setTimeout(checkServer, delay);
}

async function checkServer() {
    if (!active || !settings.serverWatch || server.busy) return;
    if (document.visibilityState !== 'visible') {
        scheduleServerCheck(30000);
        return;
    }
    server.busy = true;
    const up = await serverReachable();
    server.busy = false;
    if (!active || !settings.serverWatch) return;
    if (!up && !server.down) {
        server.down = true;
        showServerBanner();
    } else if (up && server.down) {
        server.down = false;
        showServerBanner(true);
    }
    // Check often while it is down, rarely while all is well.
    scheduleServerCheck(server.down ? 3000 : 30000);
}

function showServerBanner(back = false) {
    if (!active || !settings.serverWatch) return;
    if (back) {
        showBanner('server', { status: 'ok', text: 'Back online', hideAfter: 2200 });
        return;
    }
    showBanner('server', {
        status: 'danger',
        text: !isWide() && !IS_IOS ? "Can't reach SillyTavern. Is Termux still running?" : "Can't reach SillyTavern. Is it still running?",
        action: { label: 'Retry', onClick: () => { buzz(8); checkServer(); } },
    });
}

function syncServerWatch() {
    if (active && settings.serverWatch) scheduleServerCheck(server.down ? 1000 : 5000);
    else {
        window.clearTimeout(server.timer);
        server.down = false;
        hideBanner('server');
    }
}

// -- choice sheets (quick switcher)

/**
 * A sheet that lists choices with a search box when the list is long.
 * @param {{ title: string, subtitle?: string, options: { value: string, label: string, note?: string, image?: string }[], current?: string, onPick: (value: string) => void }} config
 */
function openChoiceSheet({ title, subtitle = '', options, current, onPick }) {
    showSheet(new MenuSheet({
        title,
        subtitle,
        fill: body => {
            const rows = options.map(option => {
                const on = option.value === current;
                return h('button', {
                    type: 'button',
                    class: `pt-menu-row pt-choice ${on ? 'pt-choice-on' : ''}`,
                    'data-search': normalizeText(`${option.label} ${option.note ?? ''}`),
                    'aria-pressed': String(on),
                    onclick: () => {
                        closeSheet(true);
                        if (option.value !== current) onPick(option.value);
                    },
                }, [
                    option.image ? h('img', { class: 'pt-choice-img', src: option.image, alt: '', loading: 'lazy' }) : null,
                    h('span', { class: 'pt-row-text' }, [
                        h('span', { raw: option.label }),
                        option.note ? h('small', { raw: option.note }) : null,
                    ]),
                    on ? ui('check', 'pt-menu-row-icon') : null,
                ]);
            });
            const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
            if (options.length > 8) {
                const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search'), 'aria-label': t('Search') });
                search.addEventListener('input', () => {
                    const words = normalizeText(search.value).split(/\s+/).filter(Boolean);
                    let shown = 0;
                    for (const row of rows) {
                        const ok = words.every(word => row.dataset.search.includes(word));
                        row.hidden = !ok;
                        if (ok) shown++;
                    }
                    empty.hidden = shown > 0;
                });
                body.append(search);
            }
            if (!options.length) body.append(h('p', { class: 'pt-menu-foot', text: t('Nothing to choose from here yet.') }));
            body.append(h('div', { class: 'pt-menu-list' }, rows), empty);
            requestAnimationFrame(() => body.querySelector('.pt-choice-on')?.scrollIntoView({ block: 'center' }));
        },
    }));
}

/** Is this control on screen in its page, i.e. not inside a section SillyTavern has hidden? */
function inActiveSection(element, root, allowCollapsedDrawers = false) {
    for (let node = element; node && node !== root; node = node.parentElement) {
        if (allowCollapsedDrawers && node.classList?.contains('inline-drawer-content')) continue;
        if (node.classList?.contains('displayNone') || node.style?.display === 'none') return false;
    }
    return true;
}

function pickFromSelect(select, value) {
    select.value = value;
    $j()(select).trigger('change');
    select.dispatchEvent(new Event('input', { bubbles: true }));
}

function personaChoices() {
    const power = ctx().powerUserSettings ?? {};
    const names = power.personas ?? {};
    const descriptions = power.persona_descriptions ?? {};
    return Object.entries(names).map(([avatar, name]) => ({
        value: avatar,
        label: name || avatar,
        note: (descriptions[avatar]?.description ?? '').replace(/\s+/g, ' ').slice(0, 70),
        image: `/thumbnail?type=persona&file=${encodeURIComponent(avatar)}`,
    })).sort((a, b) => a.label.localeCompare(b.label));
}

function currentPersona() {
    const src = document.querySelector('#user_avatar_block .avatar-container.selected')?.dataset.avatarId;
    return src ?? globalThis.user_avatar ?? '';
}

async function choosePersona(avatar) {
    try {
        const personas = await loadPersonasModule();
        if (!personas?.setUserAvatar) throw new Error('Personas module unavailable');
        await personas.setUserAvatar(avatar);
    } catch (error) {
        console.warn(LOG, 'Could not switch persona', error);
        globalThis.toastr?.error(t('Open Personas to switch instead.'), t('Could not switch persona'));
    }
}

/**
 * Your persona: the current one as a card with an Edit button, then the others
 * to switch to, then a way to all persona settings.
 */
async function openPersonaChooser() {
    const module = await loadPersonasModule();
    const instance = new MenuSheet({
        title: t('Your persona'),
        subtitle: t('Who you are in the chat'),
        fill: body => {
            // Read fresh each time: after switching, the sheet redraws with the new persona.
            const current = module?.user_avatar || currentPersona();
            const all = personaChoices();
            const description = ctx().powerUserSettings?.persona_descriptions?.[current]?.description ?? '';
            const name = h('b', { class: 'pt-persona-card-name' });
            name.textContent = personaName(current) || t('No name');
            const note = h('small', { class: 'pt-persona-card-desc' });
            note.textContent = description.replace(/\s+/g, ' ').trim() || t('No description yet.');
            body.append(h('div', { class: 'pt-persona-card' }, [
                h('img', { class: 'pt-persona-card-img', src: personaPicture(current), alt: '' }),
                h('span', { class: 'pt-persona-card-text' }, [name, note]),
                current ? h('button', {
                    type: 'button',
                    class: 'pt-persona-card-edit',
                    onclick: () => {
                        buzz(6);
                        openPersonaEditor(current);
                    },
                }, [ui('pencil'), h('span', { text: 'Edit' })]) : null,
            ]));
            const others = all.filter(option => option.value !== current);
            if (others.length) {
                body.append(h('p', { class: 'pt-menu-heading', text: t('Switch to') }));
                const rows = others.map(option => h('button', {
                    type: 'button',
                    class: 'pt-menu-row pt-choice',
                    'data-search': normalizeText(`${option.label} ${option.note ?? ''}`),
                    onclick: async () => {
                        // Stay open: you see the switch and can switch again.
                        buzz(8);
                        await choosePersona(option.value);
                        if (sheet === instance) instance.refresh();
                    },
                }, [
                    h('img', { class: 'pt-choice-img', src: option.image, alt: '', loading: 'lazy' }),
                    h('span', { class: 'pt-row-text' }, [h('span', { raw: option.label }), option.note ? h('small', { raw: option.note }) : null]),
                ]));
                const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
                if (others.length > 8) {
                    const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search'), 'aria-label': t('Search') });
                    search.addEventListener('input', () => {
                        const words = normalizeText(search.value).split(/\s+/).filter(Boolean);
                        let shown = 0;
                        for (const row of rows) {
                            const ok = words.every(word => row.dataset.search.includes(word));
                            row.hidden = !ok;
                            if (ok) shown++;
                        }
                        empty.hidden = shown > 0;
                    });
                    body.append(search);
                }
                body.append(h('div', { class: 'pt-menu-list' }, rows), empty);
            }
            body.append(h('div', { class: 'pt-menu-list' }, [h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: () => {
                    closeSheet(true);
                    openPage('persona-management-button');
                },
            }, [ui('settings', 'pt-menu-row-icon'), h('span', { text: 'All persona settings' }), ui('chevron-right', 'pt-menu-row-go')])]));
        },
    });
    showSheet(instance);
}

/** A quick editor for the current persona: its name and description. */
function openPersonaEditor(avatar) {
    if (!avatar) return;
    const power = ctx().powerUserSettings ?? {};
    const startName = power.personas?.[avatar] ?? '';
    const startText = power.persona_descriptions?.[avatar]?.description ?? (avatar === currentPersona() ? power.persona_description ?? '' : '');
    const nameInput = h('input', { type: 'text', class: 'text_pole pt-pe-name', 'aria-label': t('Name'), maxlength: '100', enterkeyhint: 'next' });
    nameInput.value = startName;
    const textInput = h('textarea', { class: 'text_pole pt-pe-text', rows: '8', 'aria-label': t('Description'), placeholder: t('Who are you? Looks, personality, anything the character should know about you.') });
    textInput.value = startText;
    nameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            textInput.focus();
        }
    });
    const count = h('small', { class: 'pt-pe-count' });
    let countTimer = 0;
    const recount = () => {
        window.clearTimeout(countTimer);
        countTimer = window.setTimeout(async () => {
            try {
                const tokens = await ctx().getTokenCountAsync?.(textInput.value);
                if (typeof tokens === 'number') count.textContent = t('{count} tokens', { count: tokens.toLocaleString() });
            } catch {
                count.textContent = '';
            }
        }, 300);
    };
    textInput.addEventListener('input', () => {
        fitTextarea(textInput);
        recount();
    });
    const save = async () => {
        const newName = nameInput.value.trim();
        if (!newName) {
            globalThis.toastr?.warning(t('Give your persona a name.'));
            nameInput.focus();
            return;
        }
        try {
            await savePersonaEdits(avatar, { name: newName, nameChanged: newName !== startName, text: textInput.value, textChanged: textInput.value !== startText });
            closeSheet();
            globalThis.toastr?.success(newName, t('Persona saved'), { timeOut: 1800 });
        } catch (error) {
            console.warn(LOG, 'Could not save the persona', error);
            globalThis.toastr?.error(t('Open Personas to edit it instead.'), t('Could not save the persona'));
        }
    };
    showSheet(new MenuSheet({
        title: t('Edit persona'),
        subtitle: t('Name and description'),
        fill: body => {
            body.append(h('div', { class: 'pt-pe' }, [
                h('div', { class: 'pt-pe-top' }, [
                    h('img', { class: 'pt-persona-card-img', src: personaPicture(avatar), alt: '' }),
                    h('label', { class: 'pt-pe-field' }, [h('small', { text: 'Name' }), nameInput]),
                ]),
                h('label', { class: 'pt-pe-field' }, [h('span', { class: 'pt-pe-label' }, [h('small', { text: 'Description' }), count]), textInput]),
                h('div', { class: 'pt-pe-actions' }, [
                    h('button', { type: 'button', class: 'pt-pe-btn', onclick: () => closeSheet() }, [h('span', { text: 'Cancel' })]),
                    h('button', { type: 'button', class: 'pt-pe-btn pt-pe-save', onclick: save }, [ui('check'), h('span', { text: 'Save' })]),
                ]),
            ]));
            requestAnimationFrame(() => fitTextarea(textInput));
            recount();
        },
    }));
}

/** Writes the edits the same way SillyTavern's Personas page does. */
async function savePersonaEdits(avatar, { name, nameChanged, text, textChanged }) {
    const context = ctx();
    const power = context.powerUserSettings;
    const personas = await loadPersonasModule();
    const isCurrent = (personas?.user_avatar || currentPersona()) === avatar;
    if (textChanged) {
        if (isCurrent) {
            // SillyTavern's own description box saves it (and its token count) on input.
            const box = document.getElementById('persona_description');
            if (!box) throw new Error('No persona description box');
            box.value = text;
            box.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            power.persona_descriptions[avatar] = { ...(power.persona_descriptions[avatar] ?? {}), description: text };
        }
    }
    if (nameChanged) {
        const oldName = power.personas[avatar];
        power.personas[avatar] = name;
        if (isCurrent) {
            const script = await import('/script.js');
            script.setUserName?.(name, { toastPersonaNameChange: false });
        }
        await context.eventSource?.emit?.(context.eventTypes?.PERSONA_RENAMED ?? 'persona_renamed', { avatarId: avatar, oldName, newName: name });
    }
    context.saveSettingsDebounced?.();
    await personas?.getUserAvatars?.(true, avatar);
    personas?.setPersonaDescription?.();
    updatePersonaButton();
}

// -- the message box's + (in place of SillyTavern's ☰ and wand) and the chat's ⋯

/** Items of SillyTavern's ☰ menu in the + menu's two groups, each with a line on what it does. */
const PLUS_REPLY = [
    { id: 'option_regenerate', icon: 'refresh', note: 'Write the last reply again' },
    { id: 'option_continue', icon: 'play', note: 'Make the last reply longer' },
    { id: 'option_impersonate', icon: 'mask', note: 'Let the AI write your next message' },
];
const PLUS_TOOLS = [
    { id: 'option_toggle_AN', icon: 'note', note: 'A note the AI reads at a set depth' },
    { id: 'option_toggle_CFG', icon: 'scale', note: 'Extra guidance for the next replies' },
    { id: 'option_toggle_logprobs', icon: 'chart', note: 'Which words the AI weighed for each reply' },
];
/** ☰ items that live in the chat's ⋯ instead, or that Pocket Tavern's own screens cover. */
const PLUS_ELSEWHERE = new Set(['option_select_chat', 'option_start_new_chat', 'option_close_chat', 'option_new_bookmark', 'option_back_to_main', 'option_convert_to_group', 'option_delete_mes', 'option_settings']);
/** The wand's file item belongs with Reply: it goes with your next message. */
const PLUS_ATTACH = 'attachFile';

// -- the Draft helper (src/features/draft/draft.js)

/** On while Pocket Tavern and the Draft helper switch are on, and the Draft Enhancer extension itself is not. */
function syncDraft() {
    if (active && settings.draftHelper) startDraft();
    else stopDraft();
}

/** The + menu's Write group, while the Draft helper runs. */
function draftMenuItems() {
    if (!draftRunning()) return [];
    if (isDrafting()) return [{ title: 'Cancel', subtitle: 'Stops writing and brings your draft back', icon: 'stop', run: () => { closeSheet(true); cancelDraft(); } }];
    const run = kind => () => {
        closeSheet(true);
        runDraft(kind);
    };
    const name = writingAsName();
    const items = [
        { title: 'Enhance my draft', subtitle: 'Turns what you typed into a finished message', icon: 'wand', run: run('enhance') },
        { title: 'Write for me', subtitle: 'Writes your next message; what you typed is the direction', icon: 'pencil', run: run('write') },
        { title: 'Continue my draft', subtitle: 'Finishes what you started, from where you stopped', icon: 'play', run: run('continue') },
        {
            rawTitle: t('Writing as: {name}', { name: name.raw ?? t(name.text) }),
            subtitle: 'Tap to switch between you, the character and the narrator',
            icon: 'mask',
            run: () => {
                cycleWritingAs();
                if (sheet && !sheet.closing) sheet.refresh();
            },
        },
    ];
    if (canUndo()) items.push({ title: 'Undo', subtitle: 'Brings back the text you had before', icon: 'reset', run: () => { closeSheet(true); undoDraft(); } });
    return items;
}

/** Refine: the six changes, or your own. */
function openDraftRefine() {
    const own = h('input', { type: 'text', class: 'pt-text-field pt-focus', placeholder: 'Or say what to change…', 'aria-label': 'Your change', dir: 'auto' });
    const send = () => {
        const text = own.value.trim();
        if (!text) return;
        closeSheet(true);
        refineDraft(/[.!?]$/.test(text) ? text : `${text}.`);
    };
    own.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            send();
        }
    });
    showSheet(new MenuSheet({
        title: t('Refine'),
        subtitle: t('Changes the message in the box in one way'),
        anchor: document.querySelector('#pt-draft-bar [data-action="refine"]'),
        fill: body => {
            body.append(listGroup({ rows: refineChoices().map(([, label, change]) => listRow({ title: label, icon: 'sliders', end: 'none', onClick: () => { closeSheet(true); refineDraft(change); } })) }));
            body.append(h('div', { class: 'pt-draft-own' }, [own, h('button', { type: 'button', class: 'pt-button pt-button--primary pt-focus pt-press', onclick: send }, [h('span', { class: 'pt-button-label', text: 'Refine' })])]));
        },
    }));
}

/** Preview the note: what Enhance (or Write, with an empty box) would send right now. */
function openDraftPreview() {
    const note = previewNote();
    showSheet(new MenuSheet({
        title: t('Preview the note'),
        subtitle: note ? '' : t('Open a chat to see the note with its names and last message.'),
        fill: body => {
            if (note) body.append(h('pre', { class: 'pt-draft-preview', raw: note, dir: 'auto' }));
        },
    }));
}

/** The + menu (src/views/plus-menu.js): SillyTavern's ☰ and wand items, and other extensions' tools. */
function openPlusMenu(anchor) {
    const options = document.getElementById('options');
    const wand = document.getElementById('extensionsMenu');
    const context = ctx();
    const inChat = !!(context.groupId || context.characterId !== undefined);
    const fromOptions = list => list.map(item => {
        const element = options && [...options.querySelectorAll(`[id="${item.id}"]`)].find(node => menuItemShown(node, options));
        return element ? { rawTitle: itemLabel(element), subtitle: item.note, icon: item.icon, run: () => pressMenuItem(element) } : null;
    }).filter(Boolean);
    const wandItems = wand ? [...wand.querySelectorAll('.list-group-item')].filter(item => menuItemShown(item, wand)) : [];
    const wandRow = item => ({
        rawTitle: itemLabel(item),
        subtitle: TOOL_NOTES[item.id] ?? '',
        start: faIcon(item),
        // Image generation asks what to draw, in a little menu of its own.
        run: () => (item.id === 'sd_gen' && document.querySelector('#sd_dropdown [id]') ? openPictureSheet() : pressMenuItem(item)),
    });
    const known = new Set([...PLUS_REPLY, ...PLUS_TOOLS].map(item => item.id));
    // Items other extensions put in SillyTavern's ☰ menu.
    const extraOptions = options ? [...options.querySelectorAll('.options-content > :not(hr)')]
        .filter(node => node.id && !known.has(node.id) && !PLUS_ELSEWHERE.has(node.id) && menuItemShown(node, options))
        .map(node => ({ rawTitle: itemLabel(node), start: faIcon(node), run: () => pressMenuItem(node) })) : [];
    const attach = wandItems.find(item => item.id === PLUS_ATTACH);
    const reply = inChat ? [...fromOptions(PLUS_REPLY), ...(attach ? [wandRow(attach)] : [])] : [];
    const tools = [
        ...(inChat ? fromOptions(PLUS_TOOLS) : []),
        ...wandItems.filter(item => item !== attach).map(wandRow),
        ...extraOptions,
        ...[scenePulseRow()].filter(Boolean),
    ];
    showSheet(new MenuSheet({
        title: t('Reply and tools'),
        subtitle: '',
        anchor,
        fill: body => {
            const groups = plusMenu({ write: inChat ? draftMenuItems() : [], reply, tools });
            body.append(...(groups.length ? groups : [h('p', { class: 'pt-menu-foot', text: 'Open a chat first.' })]));
        },
    }));
}

function buildPlusButton() {
    const plus = h('button', {
        type: 'button',
        class: 'pt-plus-btn',
        'aria-label': 'Reply and tools',
        title: 'Reply and tools',
        'aria-haspopup': 'dialog',
        onclick: () => {
            buzz(6);
            openPlusMenu(plus);
        },
    }, [ui('plus')]);
    return plus;
}

/** SillyTavern's own items for the open chat, in the chat's ⋯ menu. SillyTavern only sets their
 *  visibility when its own menu opens, so `when` reads the same facts from the chat (bookmarks.js). */
const CHAT_MENU_ITEMS = [
    { id: 'option_new_bookmark', icon: 'flag', note: 'A point in this chat you can come back to', when: () => true },
    { id: 'option_back_to_main', icon: 'arrow-left', note: 'Leave this branch for the chat it came from', when: () => !!ctx().chatMetadata?.main_chat },
    { id: 'option_convert_to_group', icon: 'users', note: 'Turn this chat into a group chat', when: () => !ctx().groupId },
];

/** The chat's ⋯ menu (src/views/chat-menu.js) with SillyTavern's own controls behind each row. */
function openChatMenu() {
    const options = document.getElementById('options');
    const press = id => () => pressMenuItem(document.getElementById(id));
    const shown = id => menuItemShown(document.getElementById(id), options);
    showSheet(new MenuSheet({
        title: ctx().groupId ? t('Group chat') : (ctx().characters?.[ctx().characterId]?.name ?? t('Chat')),
        subtitle: '',
        anchor: document.querySelector('#pt-appbar .pt-ab-menu'),
        fill: body => body.append(...chatMenu({
            search: () => {
                closeSheet(true);
                openChatFinder();
            },
            translate: () => openTranslateSheet(),
            rename: () => {
                closeSheet(true);
                renameCurrentChat();
            },
            chatItems: CHAT_MENU_ITEMS.filter(item => document.getElementById(item.id)?.textContent.trim() && item.when()).map(item => ({
                label: (document.getElementById(item.id)?.textContent ?? '').trim(),
                subtitle: t(item.note),
                icon: item.icon,
                run: press(item.id),
            })),
            chatFiles: press('option_select_chat'),
            deleteMessages: shown('option_delete_mes') ? press('option_delete_mes') : null,
        })),
    }));
}

/** Renames the open chat with SillyTavern's own popup and its own renameChat (it saves and moves the file). */
async function renameCurrentChat() {
    const context = ctx();
    const current = context.getCurrentChatId?.();
    if (!current || typeof context.renameChat !== 'function') return;
    const name = await context.callGenericPopup?.(t('Rename this chat'), context.POPUP_TYPE?.INPUT ?? 3, current);
    const next = typeof name === 'string' ? name.trim() : '';
    if (!next || next === current) return;
    await context.renameChat(current, next);
}

/** Shown, unlike SillyTavern's spare copies (it has two "Close chat" items, one always hidden). */
function menuItemShown(element, stop) {
    if (!element || !(element.textContent ?? '').trim()) return false;
    for (let node = element; node && node !== stop; node = node.parentElement) {
        if (node.classList?.contains('displayNone') || node.style?.display === 'none' || node.hidden) return false;
    }
    return true;
}

function actionRow(iconNode, label, note, onclick, danger = false) {
    return h('button', { type: 'button', class: `pt-menu-row pt-action-row${danger ? ' pt-menu-row-danger' : ''}`, onclick }, [
        iconNode,
        h('span', { class: 'pt-row-text' }, [h('span', { text: label }), note ? h('small', { text: note }) : null]),
    ]);
}

/** Runs a SillyTavern menu item after the sheet is gone, so whatever it opens lands on top. */
function pressMenuItem(element) {
    closeSheet(true);
    buzz(6);
    element.click();
}

function itemLabel(element) {
    return (element.querySelector(':scope > span')?.textContent ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The item's own Font Awesome icon (Pocket Tavern restyles those), or a neutral one. */
function faIcon(element) {
    const source = element.querySelector('.extensionsMenuExtensionButton, i[class*="fa-"], div[class*="fa-"]');
    if (!source) return ui('puzzle', 'pt-menu-row-icon pt-list-row-icon');
    const copy = source.cloneNode(false);
    copy.removeAttribute('id');
    copy.removeAttribute('title');
    copy.classList.add('pt-menu-row-icon', 'pt-list-row-icon', 'pt-fa-icon');
    copy.setAttribute('aria-hidden', 'true');
    return copy;
}

const TOOL_NOTES = {
    manageAttachments: 'Files and web pages the AI can look things up in',
    attachFile: 'Send a file or picture with your next message',
    sd_gen: 'Make a picture of the scene or a character',
    send_picture: 'Let the AI describe a picture',
    show_gallery_wand_button: 'Pictures saved for this character',
    ttsExtensionMenuItem: 'Turn reading replies aloud on or off',
    ttsExtensionNarrateAll: 'Read the whole chat aloud',
    token_counter: 'Count the tokens in any text',
    translate_chat: 'Translate every message in this chat',
    translate_input_message: 'Translate the message you are typing',
    pt_wand_lorebooks: 'Choose the lorebooks for all chats',
    'sp-st-restore': 'Characters, mood and quests in this scene',
};

/** ScenePulse puts its button next to Send, where a phone has no room for it (Send got squeezed), so it opens from + → Tools instead. */
function scenePulseRow() {
    const button = document.getElementById('sp-st-restore');
    if (!button || button.style.display === 'none') return null;
    const art = button.querySelector('svg')?.cloneNode(true);
    if (art) {
        art.querySelectorAll('[class]').forEach(node => node.removeAttribute('class'));
        art.setAttribute('class', 'pt-menu-row-icon pt-list-row-icon');
        art.setAttribute('aria-hidden', 'true');
    }
    return { rawTitle: 'ScenePulse', subtitle: TOOL_NOTES['sp-st-restore'], start: art ?? ui('puzzle', 'pt-menu-row-icon pt-list-row-icon'), run: () => pressMenuItem(button) };
}

const PICTURE_NOTES = {
    sd_you: 'The character',
    sd_face: "The character's face",
    sd_me: 'You, as your persona',
    sd_world: 'A scene from the whole story',
    sd_last: 'What the last message describes',
    sd_raw_last: 'The last message, word for word',
    sd_background: 'A background for this chat',
};

function openPictureSheet() {
    const dropdown = document.getElementById('sd_dropdown');
    showSheet(new MenuSheet({
        title: 'Generate image',
        subtitle: 'What should the picture show?',
        fill: body => {
            const rows = [...dropdown.querySelectorAll('[id]')]
                .filter(item => menuItemShown(item, dropdown))
                .map(item => actionRow(ui('image', 'pt-menu-row-icon'), itemLabel(item), PICTURE_NOTES[item.id] ?? '', () => pressMenuItem(item)));
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

/** A long explanation shows two lines; a tap shows all of it (and does not flip the switch it belongs to). */
function onHelpClick(event) {
    if (!active || !settings.touchSizing) return;
    const tip = event.target.closest?.('.pt-help');
    if (!tip) return;
    event.preventDefault();
    event.stopPropagation();
    tip.classList.toggle('pt-help-open');
}

// -- language

function applyLanguage() {
    setLocale(ctx().getCurrentLocale?.() ?? navigator.language);
    const root = document.documentElement;
    root.classList.toggle('pt-rtl', active && isRtl());
    if (active) {
        root.style.setProperty('--pt-l-save', JSON.stringify(t('Save')));
        root.style.setProperty('--pt-l-cancel', JSON.stringify(t('Cancel')));
    } else {
        root.style.removeProperty('--pt-l-save');
        root.style.removeProperty('--pt-l-cancel');
    }
}

function applyTextSize() {
    const root = document.documentElement;
    if (active && settings.textSize && settings.textSize !== 'normal') root.dataset.ptText = settings.textSize;
    else delete root.dataset.ptText;
}

function isCompact() {
    if (settings.uiSize === 'compact') return true;
    if (settings.uiSize !== 'auto') return false;
    // A computer (mouse or trackpad, desktop layout): compact, like SillyTavern's own density.
    if (isWide() && matchMedia('(pointer: fine)').matches) return true;
    const sides = [screen.width, screen.height].filter(n => n > 0);
    return sides.length > 0 && Math.min(...sides) < SMALL_PHONE_BELOW;
}

/** Size (compact or comfortable), the message box style and the tucked tabs. */
function applyLayoutPrefs() {
    const root = document.documentElement;
    root.classList.toggle('pt-compact', active && isCompact());
    root.classList.toggle('pt-docked', active && settings.chatStyle && settings.composerStyle === 'docked');
    shell?.syncTuck();
}

function syncExtras() {
    watchLorebooks();
    syncDraft();
    if (!active) syncLorebookMode(null);
    applyTextSize();
    applyChatLook();
    applyLayoutPrefs();
    syncComposer();
    // (Also takes the one-version marker off again when Pocket Tavern turns off.)
    markSingleVersions();
    foldLongMessages();
    markMissingAvatars();
    syncLoreEntries();
    syncTriggerChips();
    syncPresetTabs();
    renderMeter();
    if (active && settings.touchSizing && settings.sliderSteppers) addSliderSteppers();
    else removeSliderSteppers();
    syncPageSections();
    if (!active || !settings.touchSizing) removeSettingDescriptions();
    if (!active) {
        closeChatFinder();
        window.clearTimeout(press.timer);
        press.timer = 0;
        cancelSwipe();
        translation.cancel = true;
        clearBanners();
        window.clearTimeout(autoTimer);
        autoTimer = 0;
        autoQueue.clear();
        window.clearTimeout(meter.timer);
        meter.timer = 0;
        extras.promptObserver?.disconnect();
        extras.promptObserver = null;
    } else if (!extras.promptObserver) {
        const editor = promptEditor();
        if (editor) {
            let timer = 0;
            extras.promptObserver = new MutationObserver(() => {
                if (timer || !active) return;
                timer = window.setTimeout(() => {
                    timer = 0;
                    if (!active) return;
                    syncPromptNameBox();
                    syncTriggerChips();
                    syncPromptEditorSession();
                    shell?.update();
                }, 60);
            });
            extras.promptObserver.observe(editor, { attributes: true, attributeFilter: ['style', 'class'] });
        }
    }
    syncPictures();
    syncCharacterPage();
    syncChatsHome();
    syncChatHistory();
    applyLanguage();
    syncEditorState();
    syncServerWatch();
    syncConnectionBanner();
    syncManifest();
    const fastOn = active && settings.fastChat;
    if (fastOn && !document.documentElement.classList.contains('pt-fast-chat')) primeChatSizes();
    document.documentElement.classList.toggle('pt-fast-chat', fastOn);
    if (fastOn) window.addEventListener('resize', onChatWidthChange);
    else {
        window.removeEventListener('resize', onChatWidthChange);
        window.clearTimeout(fastChat.timer);
        document.getElementById('chat')?.classList.remove('pt-fast-prime');
    }
    syncJumpButton();
    syncPersonaTabs();
    syncPromptNameBox();
    syncPromptEditorSession();
    syncPanelEdge();
    syncToolPanels();
    syncThemeNotes();
    if (!active || !settings.keepAwake) setAwake(false);
    if (!active || !settings.imageViewer) closeViewer(true);
    if (active) patchClipboard();
    else unpatchClipboard();
    if (extras.wired) return;
    extras.wired = true;
    document.addEventListener('click', onBackgroundPick, true);
    // Capture phase: runs before SillyTavern's own delegated handlers.
    document.addEventListener('pointerdown', onSendPointerDown, true);
    window.addEventListener('mousedown', onChatMouseDown, true);
    // The mark comes off at the end of the mousedown, or, when something stopped it on the way
    // (the rail's tabs do), before the mouseup and click that follow can act on it.
    window.addEventListener('mousedown', releaseKeptOpen);
    window.addEventListener('mouseup', releaseKeptOpen, true);
    window.addEventListener('click', releaseKeptOpen, true);
    // Capture on window: Escape on one of SillyTavern's pages must reach Back (to AI or Settings) before
    // SillyTavern's own handler closes the drawer.
    window.addEventListener('keydown', onWideKeyDown, true);
    document.addEventListener('keydown', onWideShortcut);
    watchLayout(() => {
        setFeatureClasses();
        applyLayoutPrefs();
        shell?.update();
        updateStatusLine();
        scheduleHistorySync();
    });
    document.addEventListener('click', onSendClick, true);
    document.addEventListener('click', onHelpClick, true);
    document.addEventListener('click', onMessageMenuClick, true);
    document.addEventListener('click', onEditCopyClick, true);
    document.addEventListener('click', onAvatarClick, true);
    document.addEventListener('change', onAvatarPicked, true);
    document.addEventListener('touchstart', onSwipeStart, { passive: true });
    document.addEventListener('touchmove', onSwipeMove, { passive: true });
    document.addEventListener('touchend', onSwipeEnd);
    document.addEventListener('touchcancel', onSwipeEnd);
    window.addEventListener('swiped-left', onSwipedEvent, true);
    window.addEventListener('swiped-right', onSwipedEvent, true);
    document.addEventListener('touchstart', onToastTouchStart, { passive: true });
    document.addEventListener('touchmove', onToastTouchMove, { passive: true });
    document.addEventListener('touchend', onToastTouchEnd);
    document.addEventListener('touchcancel', onToastTouchEnd);
    document.addEventListener('input', onDraftInput, true);
    document.addEventListener('pointerdown', onFocusGuardPointer, true);
    document.addEventListener('focusin', onFocusGuardFocus, true);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onMessagePressStart, true);
    document.addEventListener('pointermove', onMessagePressMove, true);
    for (const type of ['pointerup', 'pointercancel', 'scroll']) document.addEventListener(type, onMessagePressEnd, true);
    document.addEventListener('click', onPressAfterEffects, true);
    document.addEventListener('contextmenu', onPressAfterEffects, true);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleServerCheck(300);
    });
    window.addEventListener('online', () => scheduleServerCheck(300));
    window.addEventListener('offline', () => scheduleServerCheck(300));
    window.addEventListener('beforeinstallprompt', event => {
        // Only while Pocket Tavern is on (More -> Install as an app); off, the browser's own prompt is left alone.
        if (!active) return;
        event.preventDefault();
        install.prompt = event;
    });
    window.addEventListener('appinstalled', () => {
        install.prompt = null;
        globalThis.toastr?.success(t('SillyTavern is on your home screen now.'), t('Installed'));
    });
}

// ------------------------------------------------------------ activation

function setFeatureClasses() {
    const root = document.documentElement;
    root.classList.toggle('pt-on', active);
    root.classList.toggle('pt-touch', active && settings.touchSizing);
    root.classList.toggle('pt-shell', active && settings.appShell);
    root.classList.toggle('pt-chat', active && settings.chatStyle);
    applyLayout(active && settings.appShell, settings.layout);
}

/*
 * iPhones and iPads. SillyTavern asks the browser to shrink the page for the
 * keyboard; Android does, Safari does not: the keyboard covers the bottom of
 * the page and Safari pans the part you can see. So while the keyboard is up,
 * Pocket Tavern sizes its bars, the chat, pages and the message editor to the
 * visible part of the screen (the browser's visualViewport), instead of the
 * whole page. SillyTavern's transform on <html> (a fix for flicker in Chrome)
 * is turned off there too, so the bars are fixed to the screen, not the page.
 */
const ios = { frame: 0 };

function syncIosViewport() {
    const root = document.documentElement;
    const on = active && IS_IOS;
    root.classList.toggle('pt-ios', on);
    const vv = window.visualViewport;
    const keyboard = on && !!vv && keyboardUp();
    root.classList.toggle('pt-ios-kb', keyboard);
    if (keyboard) {
        const top = `${Math.round(vv.offsetTop)}px`;
        const visible = `${Math.round(vv.height)}px`;
        if (root.style.getPropertyValue('--pt-ios-top') !== top) root.style.setProperty('--pt-ios-top', top);
        if (root.style.getPropertyValue('--pt-ios-h') !== visible) root.style.setProperty('--pt-ios-h', visible);
    } else {
        root.style.removeProperty('--pt-ios-top');
        root.style.removeProperty('--pt-ios-h');
    }
}

function scheduleIosViewport() {
    if (!IS_IOS || ios.frame) return;
    ios.frame = requestAnimationFrame(() => {
        ios.frame = 0;
        syncIosViewport();
        shell?.checkKeyboard();
    });
}

/** Folding, unfolding or turning the device: sizes that were picked from the screen are picked again. */
let resizeTimer = 0;
function onScreenChange() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        if (!active) return;
        applyLayoutPrefs();
        syncIosViewport();
    }, 250);
}

/**
 * The page itself never scrolls in Pocket Tavern: the chat and pages scroll inside
 * it. If something scrolls it anyway (the browser bringing a text box into view),
 * the fixed bars and the message editor would slide off the screen, so put it back.
 * Not on iPhones: Safari scrolls the page on purpose to show the keyboard.
 */
function onStrayScroll() {
    if (!active || !settings.appShell || IS_IOS) return;
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
}

/** On the desktop layout a page stays open beside the chat while you use the chat. */
const keptOpen = [];

/**
 * SillyTavern closes every open panel that is not pinned on any mousedown that
 * reaches <html>. On the desktop layout a page stays open beside the chat, so it
 * is marked pinned only while this one event runs (the class has no styling).
 * The event itself still reaches document listeners: menus, pickers and other
 * extensions that close on an outside click. Back, the tab again, or Escape
 * still close the page.
 */
function onChatMouseDown(event) {
    const root = document.documentElement;
    if (!active || !root.classList.contains('pt-desktop') || !root.classList.contains('pt-page-open')) return;
    if (event.target.closest?.('.drawer-content')) return;
    for (const drawer of document.querySelectorAll('.openDrawer:not(.pinnedOpen)')) {
        drawer.classList.add('pinnedOpen');
        keptOpen.push(drawer);
    }
    if (!keptOpen.length) return;
    // Taken off once the event has bubbled to the window, or on the next task if something stopped it.
    window.setTimeout(releaseKeptOpen, 0);
}

function releaseKeptOpen() {
    for (const drawer of keptOpen.splice(0)) drawer.classList.remove('pinnedOpen');
}

// -- reload by itself after an update

/**
 * SillyTavern runs this after it updated Pocket Tavern (the "update" hook in
 * manifest.json); this is still the old code, so the new one needs a reload.
 * It waits until nothing is in progress: the extension list or another dialog
 * open (Update all may still be updating others), a reply being written, a
 * message or prompt being edited, or a text box in use other than the message
 * box (unsent messages are kept). A few seconds first, so a batch of updates
 * can finish.
 */
const updateReload = { pending: false, timer: 0 };

export function onPocketTavernUpdate() {
    if (!settings?.autoReload || updateReload.pending) return;
    updateReload.pending = true;
    globalThis.toastr?.info(t('The page reloads by itself when nothing is in progress.'), t('Pocket Tavern was updated'), { timeOut: 6000 });
    window.clearTimeout(updateReload.timer);
    updateReload.timer = window.setTimeout(reloadWhenIdle, 4000);
}

function updateReloadBlocked() {
    if (document.querySelector('dialog[open]') || sheet || viewer) return true;
    if (extras.generating || editorOpen() || promptEditorDirty()) return true;
    const focused = document.activeElement;
    const draftKept = focused?.id === 'send_textarea' && settings.saveDrafts;
    return isTypingField(focused) && !draftKept;
}

function reloadWhenIdle(force = false) {
    if (!force && !settings?.autoReload) {
        updateReload.pending = false;
        return;
    }
    if (updateReloadBlocked()) {
        updateReload.timer = window.setTimeout(() => reloadWhenIdle(force), 1500);
        return;
    }
    // Settings SillyTavern has not written yet go first.
    ctx().saveSettingsDebounced?.();
    globalThis.toastr?.info(t('Reloading to finish the update…'), '', { timeOut: 2000 });
    window.setTimeout(() => location.reload(), 1500);
}

// -- desktop: drag the panel's edge to make it wider

const PANEL_WIDTH_KEY = 'pt_panel_w';
const PANEL_MIN = 360;
/** How far past the widest width the edge must be dragged before the panel snaps to the full width. */
const PANEL_SNAP = 60;
let panelEdge = null;
let panelEdgeFrame = 0;

function savedPanelWidth() {
    try {
        return Number(localStorage.getItem(PANEL_WIDTH_KEY)) || 0;
    } catch {
        return 0;
    }
}

/** The stylesheet keeps it between 360px and what leaves the chat 480px. */
function applyPanelWidth(width) {
    const root = document.documentElement;
    if (width) root.style.setProperty('--pt-panel-saved', `${Math.round(width)}px`);
    else root.style.removeProperty('--pt-panel-saved');
    root.classList.toggle('pt-panel-sized', !!width);
    // Dragged well past what leaves the chat 420px: the panel takes the whole width (issue #13).
    const most = panelMostWidth();
    root.classList.toggle('pt-panel-full', !!width && width > most + PANEL_SNAP);
    if (panelEdge) {
        panelEdge.setAttribute('aria-valuemax', String(Math.round(most + PANEL_SNAP + 1)));
        panelEdge.setAttribute('aria-valuenow', String(Math.round(width || panelWidthNow() || PANEL_MIN)));
    }
}

/** The widest the panel gets while the chat keeps 420px beside it. */
function panelMostWidth() {
    const rail = document.getElementById('pt-tabbar')?.getBoundingClientRect().right ?? 88;
    const right = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pt-right')) || 0;
    return Math.max(PANEL_MIN, window.innerWidth - rail - right - 420);
}

function storePanelWidth(width) {
    try {
        if (width) localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width)));
        else localStorage.removeItem(PANEL_WIDTH_KEY);
    } catch { /* private mode: the width lasts until reload */ }
}

/** The panel's current width as drawn (the stylesheet clamps the saved one). */
function panelWidthNow() {
    const panel = document.querySelector('#top-settings-holder > .drawer > .drawer-content.openDrawer');
    return panel ? panel.getBoundingClientRect().width : 0;
}

function syncPanelEdge() {
    const want = active && settings.appShell;
    if (!want) {
        cancelAnimationFrame(panelEdgeFrame);
        panelEdgeFrame = 0;
        panelEdge?.remove();
        panelEdge = null;
        applyPanelWidth(0);
        document.documentElement.classList.remove('pt-resizing');
        return;
    }
    applyPanelWidth(savedPanelWidth());
    if (panelEdge) return;
    panelEdge = h('div', {
        id: 'pt-panel-edge',
        class: 'pt-panel-edge',
        role: 'separator',
        'aria-orientation': 'vertical',
        'aria-label': 'Panel width',
        'aria-valuemin': String(PANEL_MIN),
        'aria-valuemax': String(Math.round(panelMostWidth() + PANEL_SNAP + 1)),
        'aria-valuenow': String(Math.round(savedPanelWidth() || PANEL_MIN)),
        title: 'Drag to change the width. Double-click to reset.',
        tabindex: '0',
        'data-pt': '1',
    });
    shieldFromDrawerAutoClose(panelEdge);
    let dragX = 0;
    // Where on the edge it was grabbed, so the edge stays under the pointer instead of jumping to it.
    let grab = 0;
    let moved = false;
    const railRight = () => document.getElementById('pt-tabbar')?.getBoundingClientRect().right ?? 88;
    const dragged = () => Math.max(PANEL_MIN, dragX - grab - railRight());
    const onMove = event => {
        dragX = event.clientX;
        moved = true;
        if (panelEdgeFrame) return;
        panelEdgeFrame = requestAnimationFrame(() => {
            panelEdgeFrame = 0;
            if (active && panelEdge) applyPanelWidth(dragged());
        });
    };
    const onUp = event => {
        try {
            panelEdge?.releasePointerCapture?.(event.pointerId);
        } catch {
            // Capture was already released (e.g. pointercancel).
        }
        panelEdge?.removeEventListener('pointermove', onMove);
        panelEdge?.removeEventListener('pointerup', onUp);
        panelEdge?.removeEventListener('pointercancel', onUp);
        cancelAnimationFrame(panelEdgeFrame);
        panelEdgeFrame = 0;
        document.documentElement.classList.remove('pt-resizing');
        // A click without a drag (half of a double-click) changes nothing.
        if (!moved || !active) return;
        applyPanelWidth(dragged());
        // Keep what is drawn, so a width past the limit does not linger unseen.
        const width = Math.round(panelWidthNow() || dragged());
        applyPanelWidth(width);
        storePanelWidth(width);
    };
    panelEdge.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragX = event.clientX;
        moved = false;
        grab = event.clientX - railRight() - (panelWidthNow() || PANEL_MIN);
        try {
            panelEdge.setPointerCapture?.(event.pointerId);
        } catch {
            // Carry on without capture.
        }
        document.documentElement.classList.add('pt-resizing');
        panelEdge.addEventListener('pointermove', onMove);
        panelEdge.addEventListener('pointerup', onUp);
        panelEdge.addEventListener('pointercancel', onUp);
    });
    panelEdge.addEventListener('dblclick', () => {
        applyPanelWidth(0);
        storePanelWidth(0);
    });
    panelEdge.addEventListener('keydown', event => {
        const step = event.shiftKey ? 64 : 16;
        let width = 0;
        if (event.key === 'ArrowRight') width = panelWidthNow() + step;
        else if (event.key === 'ArrowLeft') width = panelWidthNow() - step;
        else if (event.key === 'Home') width = -1;
        else return;
        event.preventDefault();
        if (width < 0) {
            applyPanelWidth(0);
            storePanelWidth(0);
            return;
        }
        applyPanelWidth(Math.max(PANEL_MIN, width));
        const drawn = Math.round(panelWidthNow() || Math.max(PANEL_MIN, width));
        applyPanelWidth(drawn);
        storePanelWidth(drawn);
    });
    document.body.append(panelEdge);
}

// -- desktop: SillyTavern's floating tool panels (Author's Note, CFG, token
// probabilities, extension pop-outs) dock in a column right of the chat, which
// moves over to make room. SillyTavern drew them in the top-left corner, under
// the top bar and the rail. With SillyTavern's MovingUI on they stay where you put them.

const TOOL_PANELS = '#movingDivs > div';
const tools = { observer: null, frame: 0, watched: new WeakSet() };

function dockedToolPanels() {
    if (document.body.classList.contains('movingUI')) return [];
    return [...document.querySelectorAll(TOOL_PANELS)]
        .filter(panel => !panel.classList.contains('maximized') && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none');
}

function layoutToolPanels() {
    tools.frame = 0;
    const open = active && settings.appShell ? dockedToolPanels() : [];
    const openSet = new Set(open);
    document.documentElement.classList.toggle('pt-tools-open', open.length > 0);
    // Two or more share the column, one above the other. Clear stale properties on closed panels.
    for (const panel of document.querySelectorAll(TOOL_PANELS)) {
        if (!openSet.has(panel)) {
            panel.style.removeProperty('--pt-tool-i');
            panel.style.removeProperty('--pt-tool-n');
        }
    }
    open.forEach((panel, index) => {
        if (panel.style.getPropertyValue('--pt-tool-i') !== String(index)) panel.style.setProperty('--pt-tool-i', String(index));
        if (panel.style.getPropertyValue('--pt-tool-n') !== String(open.length)) panel.style.setProperty('--pt-tool-n', String(open.length));
    });
}

function watchToolPanel(panel) {
    if (tools.watched.has(panel)) return;
    tools.watched.add(panel);
    tools.observer.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
}

function syncToolPanels() {
    const holder = document.getElementById('movingDivs');
    if (!active || !settings.appShell || !holder) {
        cancelAnimationFrame(tools.frame);
        tools.frame = 0;
        tools.observer?.disconnect();
        tools.observer = null;
        tools.watched = new WeakSet();
        document.documentElement.classList.remove('pt-tools-open');
        document.querySelectorAll(TOOL_PANELS).forEach(panel => {
            panel.style.removeProperty('--pt-tool-i');
            panel.style.removeProperty('--pt-tool-n');
        });
        return;
    }
    if (!tools.observer) {
        tools.observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes ?? []) if (node.parentElement === holder && node.nodeType === 1) watchToolPanel(node);
            }
            if (!tools.frame) tools.frame = requestAnimationFrame(layoutToolPanels);
        });
        tools.observer.observe(holder, { childList: true });
        tools.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        [...holder.children].forEach(watchToolPanel);
    }
    layoutToolPanels();
}

/** Closes the newest docked tool panel the way its own × does. */
function closeToolPanel() {
    const panel = dockedToolPanels().pop();
    if (!panel) return false;
    const close = panel.querySelector('.floating_panel_close, #logprobsViewerClose, .dragClose, [id$="Close"]');
    if (close) close.click();
    else panel.style.display = 'none';
    return true;
}

/** Ctrl+K (⌘K on a Mac) on the desktop layout: Search everything (on the Chats page), when you are not typing. */
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function onWideShortcut(event) {
    if (event.defaultPrevented || event.code !== 'KeyK' || event.shiftKey || event.altKey) return;
    if (!(IS_MAC ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey)) || !isWide() || !active) return;
    // In a text box SillyTavern uses Ctrl+K for inline code.
    // Held down after it opened Search everything, the repeats must not reach the browser
    // (its own Ctrl+K is the address bar search), even though the search box now has focus.
    if (event.repeat && currentPageId() === 'pt-chats') {
        event.preventDefault();
        return;
    }
    if (isTypingField(document.activeElement) || sheet || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    focusChatsSearch();
}

/** Escape on the desktop layout: back one step (a settings section, then the page). */
function onWideKeyDown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!document.documentElement.classList.contains('pt-desktop')) return;
    // Open sheets and SillyTavern's popups close themselves on Escape.
    if (sheet || viewer || document.querySelector('dialog[open]') || editorOpen()) return;
    // The prompt editor: full screen first, then the editor (asking if there are unsaved changes).
    if (promptEditorOpen()) {
        event.preventDefault();
        if (promptFull()) setPromptFull(false);
        else leavePromptEditor();
        return;
    }
    // Character Library's panel has no Escape of its own (keys typed inside it stay in its frame).
    if (!isTypingField(document.activeElement) && closeCharacterLibrary()) {
        event.preventDefault();
        return;
    }
    if (openOverlays().length) return;
    const guidedPopup = openGuidedPopups().pop();
    if (guidedPopup) {
        closeGuidedPopup(guidedPopup);
        event.preventDefault();
        return;
    }
    const typing = isTypingField(document.activeElement);
    // The same order as Back: the chat search bar, then an open lorebook entry, before the page.
    if (chatFinderOpen() && (!typing || finder.bar.contains(document.activeElement))) {
        closeChatFinder();
        event.preventDefault();
        return;
    }
    // Typing in the entry keeps Escape for the text box.
    if (!typing && openLoreEntry()) {
        closeLoreEntry();
        event.preventDefault();
        return;
    }
    // Typing in a tool panel (Author's Note) or side-panel field keeps Escape for the text box.
    if (typing) return;
    if (closeToolPanel()) {
        event.preventDefault();
        return;
    }
    if (closePageSection() || (currentPageId() && (backFromPage(), true))) {
        event.preventDefault();
        event.stopPropagation();
    }
}

/** The SillyTavern popup watch (src/st/popup-watch.js) while Pocket Tavern is on; the shell takes it over in M1c. */
let stopPopupWatch = null;
/** Placeholder messages while a chat loads (src/features/chat-loading.js). */
let chatLoading = null;

function applyState() {
    const next = shouldBeActive();
    const changed = next !== active;
    active = next;
    setFeatureClasses();
    applyAppearance();
    watchRanges(active && settings.touchSizing);
    if (active) {
        startObserver();
        stopPopupWatch ??= startPopupWatch();
        chatLoading ??= watchChatLoading(() => ctx().getCurrentChatId?.() !== undefined);
        // A SillyTavern theme saved from an older version (or changed in SillyTavern since) gets its current values.
        if (changed && String(settings.theme).startsWith('st:')) loadSillyTavernThemes();
        // Kept running while on: adding and removing its page-wide variables for every sheet restyled the whole page twice.
        if (!stopViewportFollow) stopViewportFollow = followViewport(() => sheet?.dialog, COMPACT_BELOW);
    } else {
        stopObserver();
        stopPopupWatch?.();
        stopPopupWatch = null;
        chatLoading?.stop();
        chatLoading = null;
        closeSheet(true);
        stopViewportFollow?.();
        stopViewportFollow = null;
    }
    syncShell();
    syncIosViewport();
    const backGesture = active && settings.backGesture;
    watchOverlays(backGesture);
    if (!backGesture) resetHistoryTracking();
    else scheduleHistorySync();
    scan();
    syncWandShortcut();
    syncExtras();
    updateStatusLine();
    if (changed) console.info(LOG, active ? 'active' : 'inactive');
}

// ------------------------------------------------------------------- init

function isConnected() {
    const status = ctx().onlineStatus;
    return !!status && status !== 'no_connection';
}

const connection = { timer: 0 };

/** "Not connected to an AI" with Fix (opens AI) while a chat is open and no API is connected. */
function syncConnectionBanner() {
    window.clearTimeout(connection.timer);
    connection.timer = 0;
    shell?.tabs?.get('pt-ai')?.classList.toggle('pt-tab-alert', active && !isConnected());
    const context = ctx();
    const inChat = !!(context.groupId || context.characterId !== undefined);
    if (!active || !inChat || isConnected()) {
        hideBanner('connection');
        return;
    }
    // SillyTavern connects by itself at start and when a profile changes; give it a moment.
    connection.timer = window.setTimeout(() => {
        connection.timer = 0;
        if (!active || isConnected()) return;
        showBanner('connection', {
            status: 'warn',
            text: 'Not connected to an AI',
            action: { label: 'Fix', onClick: () => openPage('pt-ai') },
        });
    }, 2500);
}

/** Pocket Tavern's own pages (AI, Settings) with the actions they need from here. */
/** src/views/messages.js: versions, folding and Jump to latest, with the switches and helpers from here. */
/** src/st/characters.js: the Characters screens, with the switches and helpers from here. */
function setupCharacterScreens() {
    setupCharacters({
        context: ctx,
        active: () => active,
        settings: () => settings,
        currentSheet: () => sheet,
        shell: () => shell,
        isWide,
        icon,
        ui,
        normalizeText,
        wireOnce,
        MenuSheet,
        showSheet,
        closeSheet,
        isShown,
        currentPageId,
        openPage,
        closePages,
        buzz,
        openChoiceSheet,
        pickFromSelect,
        isConnected,
    });
}

/** src/st/ai.js: SillyTavern's AI screens, with the switches and helpers from here. */
function setupAiScreenHelpers() {
    setupAiScreens({
        context: ctx,
        active: () => active,
        settings: () => settings,
        shell: () => shell,
        icon,
        ui,
        MenuSheet,
        showSheet,
        closeSheet,
        currentPageId,
        openPage,
        buzz,
        openChoiceSheet,
        inActiveSection,
        pickFromSelect,
        actionRow,
        isConnected,
    });
}

function setupMessageView() {
    setupMessages({
        context: ctx,
        enabled: () => ({
            chat: active && settings.chatStyle,
            fold: active && settings.chatStyle && settings.foldLong,
            jump: active && settings.jumpButton,
            drag: active && settings.chatStyle && settings.dragSwipe,
        }),
        generating: () => !!extras.generating,
        motion: motionAllowed,
        buzz,
        heightsChanged: () => primeChatSizes(),
    });
}

/** A character's page opened from Chats (a quick pick, a chat's picture): Back returns to Chats. */
const characterFromChats = { chid: null };

/** Opens a chat's character's page, without opening the chat. */
function showCharacterFromChats(chat) {
    const chid = (ctx().characters ?? []).findIndex(character => character.avatar === chat.avatar);
    if (chid < 0) return;
    characterFromChats.chid = String(chid);
    openCharacterPage(chid);
}

function registerOwnPages() {
    definePage('pt-chats', chatsPage({
        recentChats: recentChatsForHome,
        owner: chatOwner,
        isOpen: isOpenChat,
        isPinned: isPinnedChat,
        openChat: chat => openChatFile(chat),
        showCharacter: chat => showCharacterFromChats(chat),
        chatMenu: (chat, button) => openHomeChatMenu(chat, button),
        searchIndex: searchIndexForHome,
        chooseCharacter: () => shell?.onTab('rightNavHolder'),
        get assistant() {
            return assistantEntry();
        },
        withOwner: {
            newChat: chat => afterOpening(chat, () => document.getElementById('option_start_new_chat')?.click()),
            allChats: chat => afterOpening(chat, () => document.getElementById('option_select_chat')?.click()),
            character: chat => showCharacterFromChats(chat),
        },
    }));
    loadStartModules();
    definePage('pt-character', characterPage({
        character: () => {
            const character = targetCharacter();
            if (!character) return null;
            return {
                name: character.name,
                picture: ctx().getThumbnailUrl?.('avatar', character.avatar) ?? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`,
                about: aboutCharacter(character),
                favorite: character.fav === true || character.fav === 'true',
                latest: character.chat,
            };
        },
        chats: () => fetchCharacterChats(targetCharacter()?.avatar ?? ''),
        isOpen: fileId => isCurrentCharacter(characterTarget.chid) && ctx().getCurrentChatId?.() === fileId,
        chat: fileId => openCharacterChatFor(characterTarget.chid, { fileId }),
        newChat: () => openCharacterChatFor(characterTarget.chid, { then: () => document.getElementById('option_start_new_chat')?.click() }),
        // SillyTavern's Characters page opens first, then its form is filled for this character: the other
        // way round, the page change ended the card-only view before the form was even showing.
        edit: async () => {
            const chid = characterTarget.chid;
            openPage('rightNavHolder');
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 60)));
            await editCharacter(chid);
        },
        favorite: () => favoriteCharacter(characterTarget.chid),
        menu: anchor => openCharacterMenu(anchor),
    }));
    definePage('pt-ai', aiPage({
        openPage,
        status: aiStatus,
        quick: aiQuickRows,
        chatCompletion: () => ctx().mainApi === 'openai',
        openSamplers: () => openPresetsOn('params'),
        openPrompts: () => openPresetsOn('prompts'),
    }));
    definePage('pt-settings', settingsPage({
        openPage,
        extensionPages: () => Array.from(document.querySelectorAll('#top-settings-holder > .drawer'))
            .filter(drawer => drawer.id && !TABS.some(tab => tab.id === drawer.id) && !AI_PAGES.includes(drawer.id) && drawer.id !== LOREBOOK_PAGE && !SETTINGS_PAGES.includes(drawer.id))
            .map(drawer => ({ id: drawer.id, title: pageInfo(drawer).title })),
        themeName: () => { const theme = currentTheme(); return theme ? (findTheme(theme.id) ? t(theme.name) : theme.name) : t('Your theme'); },
        version: VERSION,
    }));
    definePage('pt-lorebooks', lorebooksPage({
        books: lorebookList,
        pickActive: pickActiveLorebooks,
        openSettings: openLorebookSettings,
        create: () => document.getElementById('world_create_button')?.click(),
        importBook: () => document.getElementById('world_import_button')?.click(),
        openBook: openLorebook,
    }));
    definePage('pt-appearance', appearancePage({
        get: key => settings[key],
        set: (key, value, origin) => setAppearance(key, value, origin),
        theme: () => (findTheme(settings.theme) || String(settings.theme).startsWith('st:')) ? String(settings.theme) : 'st',
        yourColors: yourThemeColors,
        stThemes: () => stThemes.list ? stThemes.list.map(raw => ({ raw, theme: themeFromSillyTavern(raw) })).filter(item => item.theme).map(item => ({ ...item, id: `st:${item.raw.name}` })) : null,
        loadStThemes: () => loadSillyTavernThemes(),
        pickTheme,
        importTheme: document.getElementById('ui_preset_import_button') ? done => importSillyTavernTheme(done) : null,
        chatLook: () => { const stStyle = stChatStyleName(); return { look: stStyle ? '' : (settings.chatLook || 'cards'), stStyle }; },
        pickChatLook,
        desktop: isWide,
        chatWidth: () => {
            const source = document.getElementById('chat_width_slider');
            return source ? { min: Number(source.min || 25), max: Number(source.max || 100), value: Number(source.value) } : null;
        },
        setChatWidth: value => { const source = document.getElementById('chat_width_slider'); if (source) $j()(source).val(value).trigger('input', { forced: true }); },
        avatarShape: () => document.getElementById('avatar_style')?.value ?? '',
        setAvatarShape: value => { const select = document.getElementById('avatar_style'); if (select && select.value !== value) $j()(select).val(value).trigger('change'); },
        openBackgrounds: () => openPage('backgrounds-button'),
        openSillyTavernLook: () => openSillyTavernSection('look'),
    }));
    definePage('pt-pocket', pocketTavernPage({
        get: key => !!settings[key],
        set: setSwitch,
        applies: only => only === 'phone' ? !isWide()
            : only === 'vibrate' ? !isWide() && typeof navigator.vibrate === 'function'
                : only === 'gg' ? ggPresent()
                    : only === 'charPage' ? !!settings.charPage : true,
        mode: readMode,
        pickMode: () => openChoiceSheet({
            title: t('Use it on this device'),
            options: Object.entries(DEVICE_MODES).map(([value, label]) => ({ value, label: t(label) })),
            current: readMode(),
            onPick: value => {
                writeMode(value);
                applyState();
                updateStatusLine();
                refreshOwnPage();
            },
        }),
        status: statusText,
        useSillyTavernForNow,
        openDraft: () => openPage('pt-draft'),
    }));
    setupDraft({ context: ctx, settings: () => settings, save: saveSettings, openRefine: openDraftRefine });
    definePage('pt-draft', draftSettingsPage({
        sections: DRAFT_SECTIONS,
        settings: draftSettings,
        set: (key, value) => {
            draftSettings()[key] = value;
            saveDraftSettings();
        },
        pick: openChoiceSheet,
        profiles: profileNames,
        builtIn: builtInInstruction,
        preview: openDraftPreview,
        reset: () => {
            resetDraftSettings();
            refreshOwnPage();
            globalThis.toastr?.success?.(t('Settings reset'), t('Draft helper'), { timeOut: 1500 });
        },
        standalone: standaloneInstalled,
        enabled: () => !!settings.draftHelper,
        setEnabled: on => setAppearance('draftHelper', on),
    }));
    definePage('pt-about', aboutPage({
        version: VERSION,
        openWhatsNew: () => openWhatsNew(),
        updatePocketTavern: row => updatePocketTavern(row),
        openSillyTavernUpdates: () => openSillyTavernUpdates(),
        installApp: () => isStandalone() ? null : () => installApp(),
        openLink: url => window.open(url, '_blank', 'noopener'),
    }));
    onPageChange(() => {
        shell?.update();
        scheduleHistorySync();
        syncChatsWelcome();
        ensurePhoneHome();
    });
}

function setupLorebookHelpers() {
    setupLorebookScreens({
        $j,
        active: () => active,
        closeSheet,
        ctx,
        currentPageId,
        highlight,
        icon,
        normalizeText,
        openPage,
        scheduleHistorySync,
        settings: () => settings,
        sheet: () => sheet,
        shell: () => shell,
        showSheet,
        syncEditorState,
        wireOnce,
    });
}

function setupSettingsHelpers() {
    setupSettingsScreens({
        $j,
        EXTENSION_ROOT: () => EXTENSION_ROOT,
        LOG: () => LOG,
        MOTION_LABELS: () => MOTION_LABELS,
        MenuSheet,
        active: () => active,
        applyAppearance,
        applyState,
        buzz,
        closeSheet,
        copyText,
        ctx,
        currentPageId,
        detectPhone,
        drawerById,
        icon,
        inActiveSection,
        isWide,
        motionAllowed,
        normalizeText,
        openPage,
        pageInfo,
        readMode,
        reloadWhenIdle,
        saveSettings,
        scheduleHistorySync,
        setAppearance,
        settings: () => settings,
        sheet: () => sheet,
        shell: () => shell,
        showSheet,
        stThemeColors,
        ui,
        updateReload: () => updateReload,
        writeMode,
    });
}

function init() {
    if (!globalThis.SillyTavern?.getContext || !globalThis.jQuery) {
        console.warn(LOG, 'SillyTavern context is not available; extension not started.');
        return;
    }
    loadSettings();
    setupSettingsHelpers();
    setupLorebookHelpers();
    setupMessageView();
    setupCharacterScreens();
    setupAiScreenHelpers();
    registerOwnPages();
    // Pick the language before anything is drawn.
    setLocale(ctx().getCurrentLocale?.() ?? navigator.language);
    buildSettings();
    applyState();

    let resizeTimer = 0;
    let lastWidth = window.innerWidth;
    const reevaluate = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            // Only the height changed (the keyboard on Android opens and closes like this) and nothing
            // it decides would change: the classes are enough, not the whole pass over pages and the chat.
            const sameWidth = window.innerWidth === lastWidth;
            lastWidth = window.innerWidth;
            const nextActive = shouldBeActive();
            if (!active && !nextActive) return;
            const wideNow = active && settings.appShell && resolveLayout(settings.layout) === 'desktop';
            if (sameWidth && nextActive === active && wideNow === isWide()) {
                setFeatureClasses();
                syncIosViewport();
                return;
            }
            applyState();
        }, 150);
    };
    window.addEventListener('resize', reevaluate);
    window.addEventListener('orientationchange', reevaluate);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('scroll', onStrayScroll, { passive: true });
    window.addEventListener('resize', onScreenChange);
    if (IS_IOS && window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleIosViewport);
        window.visualViewport.addEventListener('scroll', scheduleIosViewport);
        document.addEventListener('focusin', scheduleIosViewport);
        document.addEventListener('focusout', () => setTimeout(scheduleIosViewport, 50));
    }
    document.addEventListener('click', onInputHistoryClick, true);
    document.addEventListener('input', onComposerInput, true);
    document.addEventListener('error', onAvatarError, true);
    document.addEventListener('click', event => extnav.onClick(event), true);
    document.addEventListener('click', onExportClick, true);
    document.addEventListener('click', onCharacterTap, true);
    document.addEventListener('click', onCardPeekPress, true);
    document.addEventListener('pointerdown', onCardPeekPress, true);
    document.addEventListener('focusin', () => shell?.checkKeyboard());
    document.addEventListener('focusout', () => setTimeout(() => shell?.checkKeyboard(), 50));

    const { eventSource, event_types } = ctx();
    const refreshShell = () => shell?.update();
    eventSource?.on?.(event_types.APP_READY, () => {
        buildSettings();
        applyState();
        // SillyTavern puts back the last message box text on load; sort it into the right chat.
        restoreDraft();
        applyLanguage();
        if (!maybeShowDesktopNotice()) maybeShowWhatsNew();
        // SillyTavern reopens a locked panel shortly after it is ready; look again while it does.
        chatsHome.startUntil = Date.now() + 4000;
        for (const delay of [400, 1000, 2000, 3500]) setTimeout(syncChatsHome, delay);
        setTimeout(endStartWindow, 4000);
    });
    for (const name of ['CHARACTER_EDITED', 'CHARACTER_PAGE_LOADED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], () => applyPendingAnimated());
    }
    for (const name of ['ONLINE_STATUS_CHANGED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], syncConnectionBanner);
    }
    for (const name of ['ONLINE_STATUS_CHANGED', 'MAIN_API_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED', 'PRESET_CHANGED', 'OAI_PRESET_CHANGED_AFTER', 'CONNECTION_PROFILE_LOADED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], refreshAiPage);
    }
    // After SillyTavern has finished switching (or closing) the chat.
    if (event_types.CHAT_CHANGED) eventSource?.on?.(event_types.CHAT_CHANGED, () => {
        setTimeout(syncChatsHome, 0);
        chatLoading?.done();
        fadeInChat();
    });
    if (event_types.CHAT_LOADED) eventSource?.on?.(event_types.CHAT_LOADED, () => chatLoading?.loaded());
    for (const name of ['CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_RENAMED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], () => {
            if (active && currentPageId() === 'pt-character') setTimeout(refreshOwnPage, 200);
        });
    }
    for (const name of ['CHAT_DELETED', 'GROUP_CHAT_DELETED', 'CHAT_RENAMED', 'CHAT_CREATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], refreshChatsHome);
    }
    eventSource?.on?.(event_types.CHAT_CHANGED, () => {
        applyPendingAnimated();
        sheet?.refresh();
        shell?.onChatChanged();
        guardKeyboard();
        restoreDraft();
        // A new chat starts at the bottom; hide the jump button until you scroll up.
        setTimeout(updateJump, 300);
        // After the messages (and folding, 200 ms) are in.
        primeChatSizes(400);
        holdAtNewest();
    });
    if (event_types.MORE_MESSAGES_LOADED) eventSource?.on?.(event_types.MORE_MESSAGES_LOADED, () => primeChatSizes(400));
    if (event_types.MESSAGE_SENT) eventSource?.on?.(event_types.MESSAGE_SENT, clearDraft);
    // Folded messages follow whatever changes in the chat.
    let chatTimer = 0;
    const chatChanged = () => {
        if (!active) return;
        markSingleVersions();
        window.clearTimeout(chatTimer);
        chatTimer = window.setTimeout(() => {
            foldLongMessages();
            markMissingAvatars();
        }, 200);
    };
    for (const name of ['MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MORE_MESSAGES_LOADED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], chatChanged);
    }
    for (const name of ['CHAT_COMPLETION_PROMPT_READY', 'GENERATE_AFTER_COMBINE_PROMPTS']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], onPromptReady);
    }
    if (event_types.GENERATION_STARTED) {
        eventSource?.on?.(event_types.GENERATION_STARTED, (type, _params, dryRun) => {
            meter.live = !dryRun && type !== 'quiet';
        });
    }
    // When a reply is done (or a message goes away), read the ring again from SillyTavern's own
    // record of the last prompt: the same numbers as its Prompt popup, with the breakdown.
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED']) {
        if (!event_types[name]) continue;
        eventSource?.on?.(event_types[name], () => {
            meter.live = false;
            if (!active || !settings.contextMeter) return;
            clearTimeout(meter.timer);
            meter.timer = window.setTimeout(loadMeterFromHistory, 400);
        });
    }
    if (event_types.CHAT_CHANGED) {
        eventSource?.on?.(event_types.CHAT_CHANGED, () => {
            meter.used = 0;
            meter.breakdown = null;
            renderMeter();
            closeChatFinder();
            // SillyTavern loads the chat's prompt records a moment after the chat.
            setTimeout(loadMeterFromHistory, 900);
            updatePersonaButton();
        });
    }
    // The persona button follows persona changes, renames and new pictures.
    for (const name of ['PERSONA_CHANGED', 'PERSONA_RENAMED', 'PERSONA_UPDATED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], () => setTimeout(updatePersonaButton, 50));
    }
    // A new reply has its own record; the ring's details follow it.
    if (event_types.GENERATION_ENDED) {
        eventSource?.on?.(event_types.GENERATION_ENDED, () => {
            meter.breakdown = null;
        });
    }
    // Keep new, edited and swiped messages in the chat's translated language.
    for (const name of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], id => queueAutoTranslate(id));
    }
    for (const name of ['MESSAGE_EDITED', 'MESSAGE_SWIPED']) {
        if (event_types[name]) {
            eventSource?.on?.(event_types[name], id => {
                dropTranslation(id);
                queueAutoTranslate(id);
            });
        }
    }
    if (event_types.GENERATION_STARTED) eventSource?.on?.(event_types.GENERATION_STARTED, (type, options, dryRun) => {
        // Dry runs (prompt token counts) start but never end; they aren't replies.
        if (!dryRun) onGenerating(true);
    });
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], () => onGenerating(false));
    }
    for (const name of ['ONLINE_STATUS_CHANGED', 'CHARACTER_EDITED', 'CHARACTER_RENAMED', 'GROUP_UPDATED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], refreshShell);
    }
    document.addEventListener('click', onWandTranslateClick, true);
    // The wand menu can be (re)built after extensions load.
    setTimeout(syncWandShortcut, 1500);
    setTimeout(syncWandShortcut, 5000);
}

/** Steps aside for this visit: every class, node and layer goes, like turning Pocket Tavern off. */
function pauseLegacy() {
    paused = true;
    if (settings) applyState();
}

/** The lifecycle's stop (after an error): steps aside, with the Back pill to try again. */
function stopLegacy() {
    pauseLegacy();
    showBackPill(() => restartAll());
}

/**
 * Starts the 2.x app (called by src/main.js through the lifecycle) and returns its stop.
 * If starting throws halfway, it steps aside before passing the error on.
 */
export function startLegacy() {
    try {
        init();
    } catch (error) {
        stopLegacy();
        throw error;
    }
    return stopLegacy;
}

/** After a restart: it already started once, so it only comes back. */
export function resumeLegacy() {
    paused = false;
    if (settings) applyState();
    return stopLegacy;
}

/** Settings → Use SillyTavern for now: SillyTavern's own screens for this visit, and the Back pill. */
function useSillyTavernForNow() {
    closePages();
    pauseLegacy();
    showBackPill(() => {
        paused = false;
        applyState();
    });
}
