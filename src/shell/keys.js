// Keys on the desktop layout (DESIGN.md → Layouts): Ctrl+K (⌘K on a Mac) opens Search everything, and Escape goes
// back one step in the same order as Back.
import { closeCharacterLibrary } from '../compat/character-library.js';
import { closeGuidedPopup, openGuidedPopups } from '../compat/guided-generations.js';
import { chatFinderHasFocus, chatFinderOpen, closeChatFinder } from '../features/chat-finder.js';
import { viewerOpen } from '../features/picture-viewer.js';
import { focusChatsSearch } from './chats-home.js';
import { editorOpen, openOverlays } from './history.js';
import { isTypingField } from './layout.js';
import { backFromPage, currentPageId } from './pages.js';
import { currentSheet } from './sheet.js';
import { closeToolPanel } from './tool-panels.js';
import { leavePromptEditor, promptEditorOpen, promptFull, setPromptFull } from '../st/ai.js';
import { closeLoreEntry, openLoreEntry } from '../st/lorebooks.js';
import { closePageSection } from '../st/settings.js';

/** @type {{ active: () => boolean, isWide: () => boolean } | null} */
let deps = null;

export function setupKeys(supplied) {
    deps = supplied;
}

/** Ctrl+K (⌘K on a Mac) on the desktop layout: Search everything (on the Chats page), when you are not typing. */
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function onWideShortcut(event) {
    if (event.defaultPrevented || event.code !== 'KeyK' || event.shiftKey || event.altKey) return;
    if (!(IS_MAC ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey)) || !deps.isWide() || !deps.active()) return;
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
export function onWideKeyDown(event) {
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
