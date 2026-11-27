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
import { t, setLocale, currentLang, applyLanguage } from '../core/i18n.js';
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
import { actionRow, buildPlusButton, faIcon, itemLabel, onHelpClick, openChatMenu, openDraftPreview, openDraftRefine, renameCurrentChat, setupMenus, syncDraft } from '../shell/menus.js';
import { afterOpening, allSettingItems, assistantEntry, chatOwner, chatsHome, endStartWindow, ensurePhoneHome, fadeInChat, focusChatsSearch, isOpenChat, isPinnedChat, keepChatsPanel, loadStartModules, lorebookNames, openChatFile, openHomeChatMenu, recentChatsForHome, refreshChatsHome, searchIndexForHome, setupChatsHome, syncChatsHome, syncChatsWelcome } from '../shell/chats-home.js';
import { applyAppearance, applyLayoutPrefs, applyTextSize, applyChatLook, onBackgroundPick, ownThemeOn, pickChatLook, setAppearance, setupAppearance, stChatStyleName, syncChatStyleForTheme, syncThemeNotes, useFlatChatStyle, watchStThemePicks } from '../themes/appearance.js';
import { currentTheme, importSillyTavernTheme, loadSillyTavernThemes, setupStThemes, stThemeColors, stThemes } from '../themes/st-themes.js';
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

// -- extras: what runs while Pocket Tavern is on, and what stops when it goes off

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
    applyLanguage(active, ctx().getCurrentLocale?.() ?? navigator.language);
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
    setupMenus({ active: () => active, settings: () => settings, context: ctx, buzz, icon, ui });
    setupChatsHome({ active: () => active, settings: () => settings, context: ctx, icon, isWide, motionAllowed, renameCurrentChat });
    setupAppearance({ active: () => active, settings: () => settings, EASE: () => EASE, MOTION_LABELS: () => MOTION_LABELS, applyState, syncExtras, saveSettings, $j, isWide });
    setupStThemes({ active: () => active, settings: () => settings, context: ctx, applyAppearance, saveSettings });
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
        applyLanguage(active, ctx().getCurrentLocale?.() ?? navigator.language);
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
