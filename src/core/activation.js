// Turning Pocket Tavern on and off (AGENTS.md → Rules, 3): the classes on <html>, the parts that run only while it is
// on (applyState), what each switch starts and stops (syncExtras), the iOS viewport, and the connection banner.
import { t, applyLanguage } from './i18n.js';
import { startPopupWatch } from '../st/popup-watch.js';
import { applyLayout, IS_IOS, keyboardUp, watchLayout } from '../shell/layout.js';
import { followViewport } from '../shell/overlay.js';
import { watchChatLoading } from '../features/chat-loading.js';
import { cancelSwipe, foldLongMessages, markSingleVersions, onSwipeEnd, onSwipeMove, onSwipeStart, onSwipedEvent, syncJumpButton, updateJump } from '../views/messages.js';
import { promptEditor, syncPromptEditorSession, syncPromptNameBox, syncPresetTabs, syncTriggerChips } from '../st/ai.js';
import { syncCharacterPage } from '../st/characters.js';
import { syncPersonaTabs } from '../st/personas.js';
import { onWideKeyDown, onWideShortcut } from '../shell/keys.js';
import { syncToolPanels } from '../shell/tool-panels.js';
import { onHelpClick, syncDraft } from '../shell/menus.js';
import { syncChatsHome } from '../shell/chats-home.js';
import { applyAppearance, applyLayoutPrefs, applyTextSize, applyChatLook, onBackgroundPick, syncThemeNotes } from '../themes/appearance.js';
import { loadSillyTavernThemes } from '../themes/st-themes.js';
import { currentShell, syncShell } from '../shell/app-shell.js';
import { currentPageId, openPage } from '../shell/pages.js';
import { LOREBOOK_PAGE } from '../views/lorebooks.js';
import { resetHistoryTracking, scheduleHistorySync, syncEditorState, watchOverlays } from '../shell/history.js';
import { closeSheet, currentSheet } from '../shell/sheet.js';
import { watchRanges } from '../st/slider-fill.js';
import { syncPanelEdge } from '../shell/panel-edge.js';
import { onToastTouchEnd, onToastTouchMove, onToastTouchStart } from '../shell/toast-swipe.js';
import { markMissingAvatars } from '../features/missing-avatars.js';
import { syncChatHistory } from '../st/chat-history.js';
import { syncComposer } from '../views/message-box.js';
import { onChatWidthChange, primeChatSizes, stopChatScroll } from '../features/chat-scroll.js';
import { cancelPress, onEditCopyClick, onMessageMenuClick, onMessagePressEnd, onMessagePressMove, onMessagePressStart, onPressAfterEffects, patchClipboard, unpatchClipboard } from '../features/message-menu.js';
import { meter, renderMeter } from '../features/context-ring.js';
import { closeChatFinder } from '../features/chat-finder.js';
import { onVisibility, setAwake } from '../features/keep-awake.js';
import { scheduleServerCheck, syncServerWatch } from '../features/server-watch.js';
import { onDraftInput } from '../features/drafts.js';
import { closeViewer, onAvatarClick } from '../features/picture-viewer.js';
import { onAvatarPicked, syncPictures } from '../features/pictures.js';
import { stopTranslation } from '../features/translate.js';
import { onFocusGuardFocus, onFocusGuardPointer } from '../shell/focus-guard.js';
import { clearBanners, hideBanner, showBanner } from '../shell/banners.js';
import { scan, startObserver, stopObserver, syncLoreEntries, syncLorebookMode, syncWandShortcut, watchLorebooks } from '../st/lorebooks.js';
import { addSliderSteppers, install, removeSettingDescriptions, removeSliderSteppers, syncManifest, syncPageSections, updateStatusLine } from '../st/settings.js';
import { active, buzz, COMPACT_BELOW, ctx, LOG, lorebookUiOn, motionAllowed, setActive, settings, shouldBeActive } from './state.js';
import { safe } from './lifecycle.js';
import { CHAT, KEYBOARD_FOLLOWERS, SEND_BUTTON } from '../st/selectors.js';
import { h } from './dom.js';
import { CHARACTER_LIBRARY_PANEL } from '../compat/character-library.js';
import { SUMMARY_PROGRESS } from '../compat/message-summarize.js';

const SOURCE = 'activation';
/** The chat's resize listener, one wrapped copy so it can be removed again. */
const onChatResize = safe(SOURCE, onChatWidthChange);

export const extras = {
    wired: false,
    formObserver: null,
    generating: false,
};

/** A short press on the send button when you send (Light motion and Smooth alike). */
function playSendFx(button) {
    if (!active || !settings.sendEffect || !settings.chatStyle || !motionAllowed()) return;
    button.classList.remove('pt-launch');
    void button.offsetWidth;
    button.classList.add('pt-launch');
    window.clearTimeout(playSendFx.timer);
    playSendFx.timer = window.setTimeout(safe(SOURCE, () => button.classList.remove('pt-launch')), 300);
}

function onSendPointerDown(event) {
    if (!active || event.button > 0) return;
    if (event.target.closest?.(SEND_BUTTON)) buzz(12);
}

function onSendClick(event) {
    if (!active) return;
    const button = event.target.closest?.(SEND_BUTTON);
    if (button) playSendFx(button);
}

// -- keep the screen on while a reply streams in (src/features/keep-awake.js does the lock)

export function onGenerating(on) {
    extras.generating = on;
    updateJump();
    setAwake(on);
}

// -- extras: what runs while Pocket Tavern is on, and what stops when it goes off

export function syncExtras() {
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
            extras.promptObserver = new MutationObserver(safe(SOURCE, () => {
                if (timer || !active) return;
                timer = window.setTimeout(safe(SOURCE, () => {
                    timer = 0;
                    if (!active) return;
                    syncPromptNameBox();
                    syncTriggerChips();
                    syncPromptEditorSession();
                    currentShell()?.update();
                }), 60);
            }));
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
    if (fastOn) window.addEventListener('resize', onChatResize);
    else {
        window.removeEventListener('resize', onChatResize);
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
    document.addEventListener('click', safe(SOURCE, onBackgroundPick), true);
    // Capture phase: runs before SillyTavern's own delegated handlers.
    document.addEventListener('pointerdown', safe(SOURCE, onSendPointerDown), true);
    window.addEventListener('mousedown', safe(SOURCE, onChatMouseDown), true);
    // The mark comes off at the end of the mousedown, or, when something stopped it on the way
    // (the rail's tabs do), before the mouseup and click that follow can act on it.
    window.addEventListener('mousedown', safe(SOURCE, releaseKeptOpen));
    window.addEventListener('mouseup', safe(SOURCE, releaseKeptOpen), true);
    window.addEventListener('click', safe(SOURCE, releaseKeptOpen), true);
    // Capture on window: Escape on one of SillyTavern's pages must reach Back (to AI or Settings) before
    // SillyTavern's own handler closes the drawer.
    window.addEventListener('keydown', safe(SOURCE, onWideKeyDown), true);
    document.addEventListener('keydown', safe(SOURCE, onWideShortcut));
    watchLayout(() => {
        setFeatureClasses();
        applyLayoutPrefs();
        // Lorebook UI can be scoped to Phone only or Desktop only (issue #16): re-sync on layout change.
        scan();
        syncLoreEntries();
        if (active && currentPageId() === 'pt-lorebooks' && !lorebookUiOn()) openPage(LOREBOOK_PAGE);
        else syncLorebookMode(currentPageId());
        currentShell()?.update();
        updateStatusLine();
        scheduleHistorySync();
    });
    document.addEventListener('click', safe(SOURCE, onSendClick), true);
    document.addEventListener('click', safe(SOURCE, onHelpClick), true);
    document.addEventListener('click', safe(SOURCE, onMessageMenuClick), true);
    document.addEventListener('click', safe(SOURCE, onEditCopyClick), true);
    document.addEventListener('click', safe(SOURCE, onAvatarClick), true);
    document.addEventListener('change', safe(SOURCE, onAvatarPicked), true);
    document.addEventListener('touchstart', safe(SOURCE, onSwipeStart), { passive: true });
    document.addEventListener('touchmove', safe(SOURCE, onSwipeMove), { passive: true });
    document.addEventListener('touchend', safe(SOURCE, onSwipeEnd));
    document.addEventListener('touchcancel', safe(SOURCE, onSwipeEnd));
    window.addEventListener('swiped-left', safe(SOURCE, onSwipedEvent), true);
    window.addEventListener('swiped-right', safe(SOURCE, onSwipedEvent), true);
    document.addEventListener('touchstart', safe(SOURCE, onToastTouchStart), { passive: true });
    document.addEventListener('touchmove', safe(SOURCE, onToastTouchMove), { passive: true });
    document.addEventListener('touchend', safe(SOURCE, onToastTouchEnd));
    document.addEventListener('touchcancel', safe(SOURCE, onToastTouchEnd));
    document.addEventListener('input', safe(SOURCE, onDraftInput), true);
    document.addEventListener('pointerdown', safe(SOURCE, onFocusGuardPointer), true);
    document.addEventListener('focusin', safe(SOURCE, onFocusGuardFocus), true);
    document.addEventListener('visibilitychange', safe(SOURCE, onVisibility));
    document.addEventListener('pointerdown', safe(SOURCE, onMessagePressStart), true);
    document.addEventListener('pointermove', safe(SOURCE, onMessagePressMove), true);
    for (const type of ['pointerup', 'pointercancel', 'scroll']) document.addEventListener(type, safe(SOURCE, onMessagePressEnd), true);
    document.addEventListener('click', safe(SOURCE, onPressAfterEffects), true);
    document.addEventListener('contextmenu', safe(SOURCE, onPressAfterEffects), true);
    document.addEventListener('visibilitychange', safe(SOURCE, () => {
        if (document.visibilityState === 'visible') scheduleServerCheck(300);
    }));
    window.addEventListener('online', safe(SOURCE, () => scheduleServerCheck(300)));
    window.addEventListener('offline', safe(SOURCE, () => scheduleServerCheck(300)));
    window.addEventListener('beforeinstallprompt', safe(SOURCE, event => {
        // Only while Pocket Tavern is on (More -> Install as an app); off, the browser's own prompt is left alone.
        if (!active) return;
        event.preventDefault();
        install.prompt = event;
    }));
    window.addEventListener('appinstalled', safe(SOURCE, () => {
        install.prompt = null;
        globalThis.toastr?.success(t('SillyTavern is on your home screen now.'), t('Installed'));
    }));
}

// ------------------------------------------------------------ activation

export function setFeatureClasses() {
    const root = document.documentElement;
    root.classList.toggle('pt-on', active);
    root.classList.toggle('pt-touch', active && settings.touchSizing);
    root.classList.toggle('pt-shell', active && settings.appShell);
    root.classList.toggle('pt-chat', active && settings.chatStyle);
    applyLayout(active && settings.appShell, settings.layout);
    root.classList.toggle('pt-lore-ui', active && lorebookUiOn());
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
const ios = { frame: 0, sheet: null };

/**
 * The elements that follow Safari's keyboard (styles/shell/ios.css). The visible top and height change every
 * frame while the keyboard slides, so they are set on these elements only (--pt-ios-top and --pt-ios-h do not
 * inherit): on <html> each change restyled the whole page. Each entry names an id, a class or an attribute.
 */
const IOS_KEYBOARD_ELEMENTS = [
    '.pt-appbar', '.pt-tabbar', '.pt-page', '.pt-chat-finder', '.pt-banners', `${CHAT} [data-pt-editing]`,
    ...KEYBOARD_FOLLOWERS, CHARACTER_LIBRARY_PANEL, SUMMARY_PROGRESS,
].join(', ');

/** Puts the visible top and height on the keyboard-following elements, or takes them away (null). */
function setIosKeyboardVars(top, height) {
    if (top === null) {
        ios.sheet?.remove();
        ios.sheet = null;
        return;
    }
    if (!ios.sheet) {
        ios.sheet = h('style', { id: 'pt-ios-vars' });
        ios.sheet.textContent = `html.pt-ios-kb :is(${IOS_KEYBOARD_ELEMENTS}) { --pt-ios-top: 0px; --pt-ios-h: 100dvh; }`;
        document.head.append(ios.sheet);
    }
    const rule = ios.sheet.sheet?.cssRules[0];
    if (!rule) return;
    if (rule.style.getPropertyValue('--pt-ios-top') !== top) rule.style.setProperty('--pt-ios-top', top);
    if (rule.style.getPropertyValue('--pt-ios-h') !== height) rule.style.setProperty('--pt-ios-h', height);
}

export function syncIosViewport() {
    const root = document.documentElement;
    const on = active && IS_IOS;
    root.classList.toggle('pt-ios', on);
    const vv = window.visualViewport;
    const keyboard = on && !!vv && keyboardUp();
    root.classList.toggle('pt-ios-kb', keyboard);
    if (keyboard) setIosKeyboardVars(`${Math.round(vv.offsetTop)}px`, `${Math.round(vv.height)}px`);
    else setIosKeyboardVars(null);
}

export function scheduleIosViewport() {
    if (!IS_IOS || ios.frame) return;
    ios.frame = requestAnimationFrame(safe(SOURCE, () => {
        ios.frame = 0;
        syncIosViewport();
        currentShell()?.checkKeyboard();
    }));
}

/** Folding, unfolding or turning the device: sizes that were picked from the screen are picked again. */
let resizeTimer = 0;
export function onScreenChange() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(safe(SOURCE, () => {
        if (!active) return;
        applyLayoutPrefs();
        syncIosViewport();
    }), 250);
}

/**
 * The page itself never scrolls in Pocket Tavern: the chat and pages scroll inside
 * it. If something scrolls it anyway (the browser bringing a text box into view),
 * the fixed bars and the message editor would slide off the screen, so put it back.
 * Not on iPhones: Safari scrolls the page on purpose to show the keyboard.
 */
export function onStrayScroll() {
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
    window.setTimeout(safe(SOURCE, releaseKeptOpen), 0);
}

function releaseKeptOpen() {
    for (const drawer of keptOpen.splice(0)) drawer.classList.remove('pinnedOpen');
}

/** The SillyTavern popup watch (src/st/popup-watch.js) while Pocket Tavern is on; the shell takes it over in M1c. */
let stopPopupWatch = null;
let stopViewportFollow = null;
/** Placeholder messages while a chat loads (src/features/chat-loading.js). */
export let chatLoading = null;

export function applyState() {
    const next = shouldBeActive();
    const changed = next !== active;
    setActive(next);
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
    if (active && currentPageId() === 'pt-lorebooks' && !lorebookUiOn()) openPage(LOREBOOK_PAGE);
    else if (active && currentPageId() === LOREBOOK_PAGE) syncLorebookMode(LOREBOOK_PAGE);
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

export function isConnected() {
    const status = ctx().onlineStatus;
    return !!status && status !== 'no_connection';
}

export const connection = { timer: 0 };

/** "Not connected to an AI" with Fix (opens AI) while a chat is open and no API is connected. */
export function syncConnectionBanner() {
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
    connection.timer = window.setTimeout(safe(SOURCE, () => {
        connection.timer = 0;
        if (!active || isConnected()) return;
        showBanner('connection', {
            status: 'warn',
            text: 'Not connected to an AI',
            action: { label: 'Fix', onClick: () => openPage('pt-ai') },
        });
    }), 2500);
}

/** Pocket Tavern's own pages (AI, Settings) with the actions they need from here. */
/** src/views/messages.js: versions, folding and Jump to latest, with the switches and helpers from here. */
/** src/features/: features with the switches and helpers from here. */
