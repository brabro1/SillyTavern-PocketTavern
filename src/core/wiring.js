// Hands each part of Pocket Tavern what it needs from the others (the setupX(deps) calls), once at start-up.
import { setupMessages } from '../views/messages.js';
import { setupAiScreens } from '../st/ai.js';
import { setupCharacters } from '../st/characters.js';
import { setupPersonas } from '../st/personas.js';
import { setupKeys } from '../shell/keys.js';
import { setupToolPanels } from '../shell/tool-panels.js';
import { actionRow, buildPlusButton, faIcon, itemLabel, openChatMenu, renameCurrentChat, setupMenus } from '../shell/menus.js';
import { chatsHome, endStartWindow, ensurePhoneHome, setupChatsHome, syncChatsHome } from '../shell/chats-home.js';
import { applyAppearance, setAppearance, setupAppearance, syncThemeNotes } from '../themes/appearance.js';
import { setupStThemes, stThemeColors } from '../themes/st-themes.js';
import { currentShell, setupAppShell, syncTabsButton } from '../shell/app-shell.js';
import { backFromPage, closePages, currentPageId, drawerById, openPage, pageInfo, setupPages } from '../shell/pages.js';
import { editorOpen, isShown, scheduleHistorySync, setupHistory, syncEditorState } from '../shell/history.js';
import { MenuSheet, closeSheet, currentSheet, setupSheet, showSheet } from '../shell/sheet.js';
import { currentPersona, inActiveSection, openChoiceSheet, openPersonaChooser, pickFromSelect, setupChoiceSheet } from '../shell/choice-sheet.js';
import { setupSliderFill } from '../st/slider-fill.js';
import { setupPanelEdge } from '../shell/panel-edge.js';
import { setupToastSwipe } from '../shell/toast-swipe.js';
import { setupMissingAvatars } from '../features/missing-avatars.js';
import { setupChatHistory } from '../st/chat-history.js';
import { composer, loadPersonasModule, personaName, personaPicture, setupMessageBox, updatePersonaButton } from '../views/message-box.js';
import { primeChatSizes, setupChatScroll } from '../features/chat-scroll.js';
import { copyText, setupMessageMenu } from '../features/message-menu.js';
import { setupContextRing } from '../features/context-ring.js';
import { setupChatFinder } from '../features/chat-finder.js';
import { setupKeepAwake } from '../features/keep-awake.js';
import { setupServerWatch } from '../features/server-watch.js';
import { reloadWhenIdle, setupAutoReload, updateReload } from '../features/auto-reload.js';
import { setupDrafts } from '../features/drafts.js';
import { setupPictureViewer, viewerOpen } from '../features/picture-viewer.js';
import { setupPictures } from '../features/pictures.js';
import { setupTranslate } from '../features/translate.js';
import { setupFocusGuard } from '../shell/focus-guard.js';
import { setupGuidedGenerations } from '../compat/guided-generations.js';
import { setupInputHistory } from '../compat/input-history.js';
import { setupLorebookScreens } from '../st/lorebooks.js';
import { setupSettingsScreens } from '../st/settings.js';
import { $j, active, buzz, COMPACT_BELOW, ctx, detectPhone, EASE, EXTENSION_ROOT, highlight, icon, isWide, LOG, lorebookUiOn, MOTION_LABELS, motionAllowed, normalizeText, readMode, saveSettings, settings, ui, wireOnce, writeMode } from './state.js';
import { applyState, connection, extras, isConnected, syncExtras } from './activation.js';
import { characterFromChats } from './own-pages.js';

export function setupFeatures() {
    setupKeys({ active: () => active, isWide });
    setupToolPanels({ active: () => active, settings: () => settings });
    setupMenus({ active: () => active, settings: () => settings, context: ctx, buzz, icon, ui });
    setupChatsHome({ active: () => active, settings: () => settings, context: ctx, icon, isWide, motionAllowed, renameCurrentChat });
    setupAppearance({ active: () => active, settings: () => settings, EASE: () => EASE, MOTION_LABELS: () => MOTION_LABELS, applyState, syncExtras, saveSettings, $j, isWide });
    setupStThemes({ active: () => active, settings: () => settings, context: ctx, applyAppearance, saveSettings });
    setupAppShell({ active: () => active, settings: () => settings, context: ctx, chatsHome: () => chatsHome, connection: () => connection, EASE: () => EASE, buzz, endStartWindow, ensurePhoneHome, icon, isConnected, isWide, lorebookUiOn, motionAllowed, openChatMenu, syncChatsHome, syncThemeNotes, ui });
    setupPages({ settings: () => settings, icon, lorebookUiOn, characterFromChats: () => characterFromChats });
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
export function setupPersonaScreens() {
    setupPersonas({ active: () => active, settings: () => settings, context: ctx, ui, showSheet, closeSheet, MenuSheet });
}

/** src/compat/: other extensions' patches, with the helpers from here. */
export function setupCompat() {
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
export function setupCharacterScreens() {
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
export function setupAiScreenHelpers() {
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

export function setupMessageView() {
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

export function setupLorebookHelpers() {
    setupLorebookScreens({
        $j,
        active: () => active,
        closeSheet,
        ctx,
        currentPageId,
        highlight,
        icon,
        lorebookUiOn,
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

export function setupSettingsHelpers() {
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
