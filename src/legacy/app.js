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
import { appearancePage, displayPage } from '../views/appearance.js';
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
import { filterByTag } from '../st/character-list.js';
import { aboutCharacter, characterTarget, checkCardPeek, pickCharacterLorebook, favoriteCharacter, openCharacterPage, editCharacter, fetchCharacterChats, isCurrentCharacter, onCardPeekPress, onCharacterTap, onExportClick, openCharacterChatFor, openCharacterMenu, pressForCharacter, setupCharacters, syncCharacterPage, targetCharacter } from '../st/characters.js';
import { chatTitle, chatTitleNode, messageCount, previewBubble, rowMenuButton } from '../ui/chat-row.js';
import { listGroup, listRow } from '../ui/list.js';
import { setupPersonas, syncPersonaTabs } from '../st/personas.js';
import { currentShell, setupAppShell, syncShell, syncTabsButton } from '../shell/app-shell.js';
import { PAGES, TABS, backFromPage, characterCardShown, closeDrawers, closePages, currentPageId, drawerById, goHome, openPage, pageInfo, placeOf, setupPages, showCharacterList } from '../shell/pages.js';
import { OVERLAYS, editorOpen, isShown, onPopState, openOverlays, resetHistoryTracking, scheduleHistorySync, setupHistory, syncEditorState, watchOverlays } from '../shell/history.js';
import { MenuSheet, closeSheet, currentSheet, setupSheet, showSheet } from '../shell/sheet.js';
import { currentPersona, inActiveSection, openChoiceSheet, openPersonaChooser, pickFromSelect, setupChoiceSheet } from '../shell/choice-sheet.js';
import { fillRanges, setupSliderFill, watchRanges } from '../st/slider-fill.js';
import { setupPanelEdge, syncPanelEdge } from '../shell/panel-edge.js';
import { onToastTouchEnd, onToastTouchMove, onToastTouchStart, setupToastSwipe } from '../shell/toast-swipe.js';
import { markMissingAvatars, onAvatarError, setupMissingAvatars } from '../features/missing-avatars.js';
import { openChatRowMenu, setupChatHistory, syncChatHistory } from '../st/chat-history.js';
import { composer, loadPersonasModule, personaName, personaPicture, setupMessageBox, syncComposer, updatePersonaButton } from '../views/message-box.js';
import { holdAtNewest, keepAtNewest, newest, onChatWidthChange, primeChatSizes, setupChatScroll, stopChatScroll } from '../features/chat-scroll.js';
import { cancelPress, copyText, onEditCopyClick, onMessageMenuClick, onMessagePressEnd, onMessagePressMove, onMessagePressStart, onPressAfterEffects, openMessageMenu, patchClipboard, setupMessageMenu, unpatchClipboard } from '../features/message-menu.js';
import { loadMeterFromHistory, meter, onPromptReady, openContextSheet, renderMeter, setupContextRing } from '../features/context-ring.js';
import { chatFinderHasFocus, chatFinderOpen, closeChatFinder, openChatFinder, setupChatFinder } from '../features/chat-finder.js';
import { onVisibility, setAwake, setupKeepAwake } from '../features/keep-awake.js';
import { scheduleServerCheck, setupServerWatch, syncServerWatch } from '../features/server-watch.js';
import { reloadWhenIdle, setupAutoReload, updateReload } from '../features/auto-reload.js';
import { clearDraft, onDraftInput, restoreDraft, setupDrafts } from '../features/drafts.js';
import { closeViewer, onAvatarClick, setupPictureViewer, viewerOpen } from '../features/picture-viewer.js';
import { applyPendingAnimated, onAvatarPicked, setupPictures, syncPictures } from '../features/pictures.js';
import { dropTranslation, onWandTranslateClick, openTranslateSheet, queueAutoTranslate, setupTranslate, stopTranslation } from '../features/translate.js';
import { guardKeyboard, onFocusGuardFocus, onFocusGuardPointer, setupFocusGuard } from '../shell/focus-guard.js';
import { button as uiButton } from '../ui/button.js';
import { clearBanners, hideBanner, showBanner } from '../shell/banners.js';
import { closeGuidedPopup, ggPresent, guidedPopups, isGuidedPopup, openGuidedPopups, setupGuidedGenerations, syncGuided } from '../compat/guided-generations.js';
import { CHARACTER_LIBRARY_OVERLAY, closeCharacterLibrary } from '../compat/character-library.js';
import { endInputHistoryBrowse, onComposerInput, onInputHistoryClick, setupInputHistory } from '../compat/input-history.js';
import { scenePulseRow } from '../compat/scenepulse.js';
import { summaryAction, summaryButtons } from '../compat/message-summarize.js';
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
let stopViewportFollow = null;

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
        currentShell()?.update();
        // Switches already show their new state; re-render only what depends on the choice.
        if (currentSheet() && !currentSheet().picker && ['theme', 'motion', 'textSize', 'chatLook', 'uiSize', 'composerStyle', 'layout'].includes(key)) currentSheet().refresh();
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
    generating: false,
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

// -- keep the screen on while a reply streams in (src/features/keep-awake.js does the lock)

function onGenerating(on) {
    extras.generating = on;
    updateJump();
    setAwake(on);
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
    const places = TABS.map(tab => ({ kind: 'place', title: tab.label, icon: tab.icon, text: `${tab.label} ${t(tab.label)}`, run: () => currentShell()?.onTab(tab.id) }));
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
        chooseCharacter: () => currentShell()?.onTab('rightNavHolder'),
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
    else if (switched && currentSheet() && !currentSheet().picker) currentSheet().refresh();
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
                if (currentSheet() && !currentSheet().closing) currentSheet().refresh();
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
        ...[scenePulseRow({ ui, press: pressMenuItem })].filter(Boolean),
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
};

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
    currentShell()?.syncTuck();
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
        cancelPress();
        cancelSwipe();
        stopTranslation();
        clearBanners();
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
                    currentShell()?.update();
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
        stopChatScroll();
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
        currentShell()?.update();
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
        currentShell()?.checkKeyboard();
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
    if (isTypingField(document.activeElement) || currentSheet() || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    focusChatsSearch();
}

/** Escape on the desktop layout: back one step (a settings section, then the page). */
function onWideKeyDown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!document.documentElement.classList.contains('pt-desktop')) return;
    // Open sheets and SillyTavern's popups close themselves on Escape.
    if (currentSheet() || viewerOpen() || document.querySelector('dialog[open]') || editorOpen()) return;
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
    if (chatFinderOpen() && (!typing || chatFinderHasFocus())) {
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
        if (!stopViewportFollow) stopViewportFollow = followViewport(() => currentSheet()?.dialog, COMPACT_BELOW);
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
    currentShell()?.tabs?.get('pt-ai')?.classList.toggle('pt-tab-alert', active && !isConnected());
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
/** src/features/: features with the switches and helpers from here. */
function setupFeatures() {
    setupAppShell({ active: () => active, settings: () => settings, context: ctx, chatsHome: () => chatsHome, connection: () => connection, EASE: () => EASE, buzz, endStartWindow, ensurePhoneHome, icon, isConnected, isWide, motionAllowed, openChatMenu, syncChatsHome, syncThemeNotes, ui });
    setupPages({ settings: () => settings, icon, characterFromChats: () => characterFromChats });
    setupHistory({ active: () => active, settings: () => settings, $j, backFromPage, currentPageId });
    setupSheet({ isWide, scheduleHistorySync, compactBelow: COMPACT_BELOW });
    setupChoiceSheet({ settings: () => settings, context: ctx, sheet: currentSheet, $j, buzz, closeSheet, icon, normalizeText, openPage, showSheet, ui, loadPersonasModule, personaName, personaPicture, updatePersonaButton, MenuSheet });
    setupSliderFill({ $j });
    setupPanelEdge({ active: () => active, settings: () => settings });
    setupToastSwipe({ active: () => active, settings: () => settings, $j });
    setupMissingAvatars({ active: () => active, settings: () => settings, icon });
    setupChatHistory({ active: () => active, settings: () => settings, closeSheet, highlight, icon, showSheet, ui, wireOnce, MenuSheet });
    setupMessageBox({ active: () => active, settings: () => settings, context: ctx, shell: currentShell, buildPlusButton, buzz, currentPersona, openPersonaChooser, syncTabsButton, ui });
    setupChatScroll({ active: () => active, settings: () => settings, context: ctx });
    setupMessageMenu({ active: () => active, settings: () => settings, context: ctx, sheet: currentSheet, actionRow, buzz, closeSheet, icon, showSheet, ui, MenuSheet });
    setupContextRing({ active: () => active, settings: () => settings, context: ctx, composer: () => composer, sheet: currentSheet, closeSheet, icon, openPage, showSheet, MenuSheet });
    setupChatFinder({ active: () => active, context: ctx, motionAllowed, normalizeText, scheduleHistorySync, ui });
    setupKeepAwake({ active: () => active, settings: () => settings, generating: () => extras.generating });
    setupServerWatch({ active: () => active, settings: () => settings, context: ctx, isWide, buzz });
    setupDrafts({ active: () => active, settings: () => settings, context: ctx });
    setupPictureViewer({ active: () => active, settings: () => settings, buzz, ui, icon, scheduleHistorySync, motionAllowed });
    setupPictures({ active: () => active, settings: () => settings, context: ctx, icon, isShown, shell: currentShell });
    setupTranslate({ active: () => active, settings: () => settings, context: ctx, shell: currentShell, buzz, icon, ui, normalizeText, saveSettings, primeChatSizes, showSheet, closeSheet, MenuSheet });
    setupFocusGuard({ active: () => active, isWide });
    setupAutoReload({ settings: () => settings, context: ctx, sheetOpen: () => !!currentSheet() || viewerOpen(), generating: () => extras.generating, editorOpen });
}

/** src/st/personas.js: the Personas page, with the switches and helpers from here. */
function setupPersonaScreens() {
    setupPersonas({ active: () => active, settings: () => settings, context: ctx, ui, showSheet, closeSheet, MenuSheet });
}

/** src/compat/: other extensions' patches, with the helpers from here. */
function setupCompat() {
    setupGuidedGenerations({
        active: () => active,
        settings: () => settings,
        saveSettings,
        ui,
        buzz,
        showSheet,
        closeSheet,
        MenuSheet,
        actionRow,
        faIcon,
        itemLabel,
        openPage,
    });
    setupInputHistory({ active: () => active, settings: () => settings });
}

/** src/st/characters.js: the Characters screens, with the switches and helpers from here. */
function setupCharacterScreens() {
    setupCharacters({
        context: ctx,
        active: () => active,
        settings: () => settings,
        currentSheet,
        shell: currentShell,
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
        shell: currentShell,
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
        chooseCharacter: () => currentShell()?.onTab('rightNavHolder'),
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
                creator: String(character.data?.creator ?? '').trim(),
                lorebook: String(character.data?.extensions?.world ?? ''),
                tags: (ctx().tagMap?.[character.avatar] ?? [])
                    .map(id => ctx().tags?.find(item => item.id === id))
                    .filter(Boolean)
                    .map(item => ({ id: String(item.id), name: item.name })),
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
        openLorebook: name => openLorebook(name),
        pickLorebook: () => pickCharacterLorebook(characterTarget.chid),
        // Characters, showing only this tag.
        showTag: id => {
            openPage('rightNavHolder');
            showCharacterList();
            setTimeout(() => filterByTag(id), 300);
        },
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
    const appearanceActions = {
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
    };
    definePage('pt-appearance', appearancePage(appearanceActions));
    definePage('pt-display', displayPage(appearanceActions));
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
        currentShell()?.update();
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
        sheet: currentSheet,
        shell: currentShell,
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
        sheet: currentSheet,
        shell: currentShell,
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
    setupCompat();
    setupPersonaScreens();
    setupFeatures();
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
    document.addEventListener('focusin', () => currentShell()?.checkKeyboard());
    document.addEventListener('focusout', () => setTimeout(() => currentShell()?.checkKeyboard(), 50));

    const { eventSource, event_types } = ctx();
    const refreshShell = () => currentShell()?.update();
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
        currentSheet()?.refresh();
        currentShell()?.onChatChanged();
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
