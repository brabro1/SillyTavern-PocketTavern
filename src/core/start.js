// Start-up (AGENTS.md → Rules, 10): waits for SillyTavern, loads the settings, wires every part, listens to
// SillyTavern's events, and starts, pauses, stops and resumes Pocket Tavern for src/main.js and src/core/lifecycle.js.
import { setLocale, applyLanguage } from './i18n.js';
import { IS_IOS, resolveLayout } from '../shell/layout.js';
import { refreshOwnPage } from '../shell/page.js';
import { showBackPill } from '../shell/native.js';
import { restartAll } from './lifecycle.js';
import { foldLongMessages, markSingleVersions, updateJump } from '../views/messages.js';
import { refreshAiPage } from '../st/ai.js';
import { onCardPeekPress, onCharacterTap, onExportClick } from '../st/characters.js';
import { chatsHome, endStartWindow, fadeInChat, refreshChatsHome, syncChatsHome } from '../shell/chats-home.js';
import { currentShell } from '../shell/app-shell.js';
import { closePages, currentPageId } from '../shell/pages.js';
import { onPopState } from '../shell/history.js';
import { currentSheet } from '../shell/sheet.js';
import { markMissingAvatars, onAvatarError } from '../features/missing-avatars.js';
import { updatePersonaButton } from '../views/message-box.js';
import { holdAtNewest, primeChatSizes } from '../features/chat-scroll.js';
import { loadMeterFromHistory, meter, onPromptReady, renderMeter } from '../features/context-ring.js';
import { closeChatFinder } from '../features/chat-finder.js';
import { clearDraft, restoreDraft } from '../features/drafts.js';
import { applyPendingAnimated } from '../features/pictures.js';
import { dropTranslation, onWandTranslateClick, queueAutoTranslate } from '../features/translate.js';
import { guardKeyboard } from '../shell/focus-guard.js';
import { onComposerInput, onInputHistoryClick } from '../compat/input-history.js';
import { syncWandShortcut } from '../st/lorebooks.js';
import { buildSettings, extnav, maybeShowDesktopNotice, maybeShowWhatsNew } from '../st/settings.js';
import { active, ctx, isWide, loadSettings, LOG, setPaused, settings, shouldBeActive } from './state.js';
import { applyState, chatLoading, onGenerating, onScreenChange, onStrayScroll, scheduleIosViewport, setFeatureClasses, syncConnectionBanner, syncIosViewport } from './activation.js';
import { setupAiScreenHelpers, setupCharacterScreens, setupCompat, setupFeatures, setupLorebookHelpers, setupMessageView, setupPersonaScreens, setupSettingsHelpers } from './wiring.js';
import { registerOwnPages } from './own-pages.js';
import { safe } from './lifecycle.js';

const SOURCE = 'start';

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
    registerOwnPages({ useSillyTavernForNow });
    // Pick the language before anything is drawn.
    setLocale(ctx().getCurrentLocale?.() ?? navigator.language);
    buildSettings();
    applyState();

    let resizeTimer = 0;
    let lastWidth = window.innerWidth;
    const reevaluate = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(safe(SOURCE, () => {
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
        }), 150);
    };
    window.addEventListener('resize', safe(SOURCE, reevaluate));
    window.addEventListener('orientationchange', safe(SOURCE, reevaluate));
    window.addEventListener('popstate', safe(SOURCE, onPopState));
    window.addEventListener('scroll', safe(SOURCE, onStrayScroll), { passive: true });
    window.addEventListener('resize', safe(SOURCE, onScreenChange));
    if (IS_IOS && window.visualViewport) {
        window.visualViewport.addEventListener('resize', safe(SOURCE, scheduleIosViewport));
        window.visualViewport.addEventListener('scroll', safe(SOURCE, scheduleIosViewport));
        document.addEventListener('focusin', safe(SOURCE, scheduleIosViewport));
        document.addEventListener('focusout', safe(SOURCE, () => setTimeout(safe(SOURCE, scheduleIosViewport), 50)));
    }
    document.addEventListener('click', safe(SOURCE, onInputHistoryClick), true);
    document.addEventListener('input', safe(SOURCE, onComposerInput), true);
    document.addEventListener('error', safe(SOURCE, onAvatarError), true);
    document.addEventListener('click', safe(SOURCE, event => extnav.onClick(event)), true);
    document.addEventListener('click', safe(SOURCE, onExportClick), true);
    document.addEventListener('click', safe(SOURCE, onCharacterTap), true);
    document.addEventListener('click', safe(SOURCE, onCardPeekPress), true);
    document.addEventListener('pointerdown', safe(SOURCE, onCardPeekPress), true);
    document.addEventListener('focusin', safe(SOURCE, () => currentShell()?.checkKeyboard()));
    document.addEventListener('focusout', safe(SOURCE, () => setTimeout(safe(SOURCE, () => currentShell()?.checkKeyboard()), 50)));

    const { eventSource, event_types } = ctx();
    const refreshShell = () => currentShell()?.update();
    eventSource?.on?.(event_types.APP_READY, safe(SOURCE, () => {
        buildSettings();
        applyState();
        // SillyTavern puts back the last message box text on load; sort it into the right chat.
        restoreDraft();
        applyLanguage(active, ctx().getCurrentLocale?.() ?? navigator.language);
        if (!maybeShowDesktopNotice()) maybeShowWhatsNew();
        // SillyTavern reopens a locked panel shortly after it is ready; look again while it does.
        chatsHome.startUntil = Date.now() + 4000;
        for (const delay of [400, 1000, 2000, 3500]) setTimeout(safe(SOURCE, syncChatsHome), delay);
        setTimeout(safe(SOURCE, endStartWindow), 4000);
    }));
    for (const name of ['CHARACTER_EDITED', 'CHARACTER_PAGE_LOADED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, () => applyPendingAnimated()));
    }
    for (const name of ['ONLINE_STATUS_CHANGED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, syncConnectionBanner));
    }
    for (const name of ['ONLINE_STATUS_CHANGED', 'MAIN_API_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED', 'PRESET_CHANGED', 'OAI_PRESET_CHANGED_AFTER', 'CONNECTION_PROFILE_LOADED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, refreshAiPage));
    }
    // After SillyTavern has finished switching (or closing) the chat.
    if (event_types.CHAT_CHANGED) eventSource?.on?.(event_types.CHAT_CHANGED, safe(SOURCE, () => {
        setTimeout(safe(SOURCE, syncChatsHome), 0);
        chatLoading?.done();
        fadeInChat();
    }));
    if (event_types.CHAT_LOADED) eventSource?.on?.(event_types.CHAT_LOADED, safe(SOURCE, () => chatLoading?.loaded()));
    for (const name of ['CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_RENAMED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, () => {
            if (active && currentPageId() === 'pt-character') setTimeout(safe(SOURCE, refreshOwnPage), 200);
        }));
    }
    for (const name of ['CHAT_DELETED', 'GROUP_CHAT_DELETED', 'CHAT_RENAMED', 'CHAT_CREATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, refreshChatsHome));
    }
    eventSource?.on?.(event_types.CHAT_CHANGED, safe(SOURCE, () => {
        applyPendingAnimated();
        currentSheet()?.refresh();
        currentShell()?.onChatChanged();
        guardKeyboard();
        restoreDraft();
        // A new chat starts at the bottom; hide the jump button until you scroll up.
        setTimeout(safe(SOURCE, updateJump), 300);
        // After the messages (and folding, 200 ms) are in.
        primeChatSizes(400);
        holdAtNewest();
    }));
    if (event_types.MORE_MESSAGES_LOADED) eventSource?.on?.(event_types.MORE_MESSAGES_LOADED, safe(SOURCE, () => primeChatSizes(400)));
    if (event_types.MESSAGE_SENT) eventSource?.on?.(event_types.MESSAGE_SENT, safe(SOURCE, clearDraft));
    // Folded messages follow whatever changes in the chat.
    let chatTimer = 0;
    const chatChanged = () => {
        if (!active) return;
        markSingleVersions();
        window.clearTimeout(chatTimer);
        chatTimer = window.setTimeout(safe(SOURCE, () => {
            foldLongMessages();
            markMissingAvatars();
        }), 200);
    };
    for (const name of ['MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MORE_MESSAGES_LOADED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, chatChanged));
    }
    for (const name of ['CHAT_COMPLETION_PROMPT_READY', 'GENERATE_AFTER_COMBINE_PROMPTS']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, onPromptReady));
    }
    if (event_types.GENERATION_STARTED) {
        eventSource?.on?.(event_types.GENERATION_STARTED, safe(SOURCE, (type, _params, dryRun) => {
            meter.live = !dryRun && type !== 'quiet';
        }));
    }
    // When a reply is done (or a message goes away), read the ring again from SillyTavern's own
    // record of the last prompt: the same numbers as its Prompt popup, with the breakdown.
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED']) {
        if (!event_types[name]) continue;
        eventSource?.on?.(event_types[name], safe(SOURCE, () => {
            meter.live = false;
            if (!active || !settings.contextMeter) return;
            clearTimeout(meter.timer);
            meter.timer = window.setTimeout(safe(SOURCE, loadMeterFromHistory), 400);
        }));
    }
    if (event_types.CHAT_CHANGED) {
        eventSource?.on?.(event_types.CHAT_CHANGED, safe(SOURCE, () => {
            meter.used = 0;
            meter.breakdown = null;
            renderMeter();
            closeChatFinder();
            // SillyTavern loads the chat's prompt records a moment after the chat.
            setTimeout(safe(SOURCE, loadMeterFromHistory), 900);
            updatePersonaButton();
        }));
    }
    // The persona button follows persona changes, renames and new pictures.
    for (const name of ['PERSONA_CHANGED', 'PERSONA_RENAMED', 'PERSONA_UPDATED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, () => setTimeout(safe(SOURCE, updatePersonaButton), 50)));
    }
    // A new reply has its own record; the ring's details follow it.
    if (event_types.GENERATION_ENDED) {
        eventSource?.on?.(event_types.GENERATION_ENDED, safe(SOURCE, () => {
            meter.breakdown = null;
        }));
    }
    // Keep new, edited and swiped messages in the chat's translated language.
    for (const name of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, id => queueAutoTranslate(id)));
    }
    for (const name of ['MESSAGE_EDITED', 'MESSAGE_SWIPED']) {
        if (event_types[name]) {
            eventSource?.on?.(event_types[name], safe(SOURCE, id => {
                dropTranslation(id);
                queueAutoTranslate(id);
            }));
        }
    }
    if (event_types.GENERATION_STARTED) eventSource?.on?.(event_types.GENERATION_STARTED, safe(SOURCE, (type, options, dryRun) => {
        // Dry runs (prompt token counts) start but never end; they aren't replies.
        if (!dryRun) onGenerating(true);
    }));
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, () => onGenerating(false)));
    }
    for (const name of ['ONLINE_STATUS_CHANGED', 'CHARACTER_EDITED', 'CHARACTER_RENAMED', 'GROUP_UPDATED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], safe(SOURCE, refreshShell));
    }
    document.addEventListener('click', safe(SOURCE, onWandTranslateClick), true);
    // The wand menu can be (re)built after extensions load.
    setTimeout(safe(SOURCE, syncWandShortcut), 1500);
    setTimeout(safe(SOURCE, syncWandShortcut), 5000);
}

/** Steps aside for this visit: every class, node and layer goes, like turning Pocket Tavern off. */
function pause() {
    setPaused(true);
    if (settings) applyState();
}

/** The lifecycle's stop (after an error): steps aside, with the Back pill to try again. */
function stopApp() {
    pause();
    showBackPill(() => restartAll());
}

/**
 * Starts Pocket Tavern (called by src/main.js through the lifecycle) and returns its stop.
 * If starting throws halfway, it steps aside before passing the error on.
 */
export function startApp() {
    try {
        init();
    } catch (error) {
        stopApp();
        throw error;
    }
    return stopApp;
}

/** After a restart: it already started once, so it only comes back. */
export function resumeApp() {
    setPaused(false);
    if (settings) applyState();
    return stopApp;
}

/** Settings → Use SillyTavern for now: SillyTavern's own screens for this visit, and the Back pill. */
export function useSillyTavernForNow() {
    closePages();
    pause();
    showBackPill(() => {
        setPaused(false);
        applyState();
    });
}
