// Back (DESIGN.md → Layouts → Back): Android's back gesture, the browser's Back and Escape close whatever is on top
// (the picture viewer, SillyTavern's popups, Guided Generations' popups, the message editor, search in the chat,
// a lorebook entry, a sheet, a settings section, a page) instead of leaving SillyTavern. One history entry per
// open layer, reconciled after every change, so layers SillyTavern opens or closes by itself stay in step.
import { CHARACTER_LIBRARY_OVERLAY } from '../compat/character-library.js';
import { closeGuidedPopup, guidedPopups, isGuidedPopup, openGuidedPopups } from '../compat/guided-generations.js';
import { chatFinderOpen, closeChatFinder } from '../features/chat-finder.js';
import { closeViewer, viewerOpen } from '../features/picture-viewer.js';
import { leavePromptEditor, promptEditorOpen, promptFull, setPromptFull } from '../st/ai.js';
import { closeLoreEntry, openLoreEntry } from '../st/lorebooks.js';
import { closePageSection, pageSectionOpen } from '../st/settings.js';
import { CHARACTER_POPUP, CHARACTER_POPUP_CLOSE, CHAT, CHAT_HISTORY_POPUP, CHAT_HISTORY_CLOSE, MESSAGE_EDITOR, PROMPT_MANAGER_POPUP } from '../st/selectors.js';
import { closeSheet, currentSheet } from './sheet.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'history';

const LOG = '[Pocket Tavern]';

/** @type {{ active: () => boolean, settings: () => object, $j: Function, backFromPage: () => void, currentPageId: () => string | null } | null} */
let deps = null;

export function setupHistory(supplied) {
    deps = supplied;
}


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
export const OVERLAYS = [
    // Back leaves full screen first, then the editor (asking if there are unsaved changes).
    { selector: PROMPT_MANAGER_POPUP, close: () => (promptFull() ? setPromptFull(false) : leavePromptEditor()), open: () => promptEditorOpen() },
    { selector: CHAT_HISTORY_POPUP, close: CHAT_HISTORY_CLOSE },
    { selector: CHARACTER_POPUP, close: CHARACTER_POPUP_CLOSE },
    // Character Library (another extension) in its Embedded Panel mode: a page of its own (issue #1).
    CHARACTER_LIBRARY_OVERLAY,
];

export function isShown(element) {
    return !!element && getComputedStyle(element).display !== 'none';
}

// -- the message editor: SillyTavern edits a message in place; on a phone that edit gets its own full page

/** SillyTavern edits a message in place; on a phone that edit gets its own full page. */
function editingTextarea() {
    return document.querySelector(`${CHAT} ${MESSAGE_EDITOR}`);
}

export function editorOpen() {
    return deps.active() && deps.settings().chatStyle && !!editingTextarea();
}

function saveEditor() {
    editingTextarea()?.closest('.mes')?.querySelector('.mes_edit_done')?.click();
}

export function syncEditorState() {
    const on = deps.active() && editorOpen();
    document.documentElement.classList.toggle('pt-editing', on);
    // The message being edited is marked, so the full-page editor's size (styles/shell/app-shell.css →
    // --pt-bottom) is set on it alone and not on every message of the chat.
    const host = on ? editingTextarea()?.closest('.mes') : null;
    for (const marked of document.querySelectorAll('[data-pt-editing]')) if (marked !== host) marked.removeAttribute('data-pt-editing');
    if (host && !host.hasAttribute('data-pt-editing')) host.setAttribute('data-pt-editing', '');
    if (on) {
        const box = editingTextarea();
        // SillyTavern sizes the box to its text; the page gives it the whole height instead.
        box.style.removeProperty('height');
    }
    scheduleHistorySync();
}

export function openOverlays() {
    return OVERLAYS.filter(overlay => (overlay.open ? overlay.open() : isShown(document.querySelector(overlay.selector))));
}

function openLayerCount() {
    let count = 0;
    if (deps.currentPageId() && deps.currentPageId() !== 'pt-chats') count += 1;
    count += openOverlays().length;
    count += openGuidedPopups().length;
    count += document.querySelectorAll('dialog.popup[open]').length;
    if (currentSheet()) count += 1;
    if (viewerOpen()) count += 1;
    if (editorOpen()) count += 1;
    if (chatFinderOpen()) count += 1;
    if (openLoreEntry()) count += 1;
    if (pageSectionOpen()) count += 1;
    return count;
}

export function watchOverlays(on) {
    nav.observer?.disconnect();
    nav.observer = null;
    if (!on) return;
    // Guided Generations adds its popups to <body> and shows or hides them with their style (src/compat/guided-generations.js).
    const watchGuidedPopup = popup => nav.observer.observe(popup, { attributes: true, attributeFilter: ['style'] });
    nav.observer = new MutationObserver(safe(SOURCE, records => {
        for (const record of records) {
            for (const node of record.addedNodes ?? []) {
                if (isGuidedPopup(node)) watchGuidedPopup(node);
                // Layers another extension adds later (Character Library makes its panel on first use).
                if (node.nodeType === 1 && OVERLAYS.some(overlay => node.matches(overlay.selector))) nav.observer.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
            }
        }
        scheduleHistorySync();
    }));
    for (const overlay of OVERLAYS) {
        const element = document.querySelector(overlay.selector);
        if (element) nav.observer.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    nav.observer.observe(document.body, { childList: true });
    guidedPopups().forEach(watchGuidedPopup);
}

export function scheduleHistorySync(delay = 220) {
    window.clearTimeout(nav.timer);
    nav.timer = window.setTimeout(syncHistory, delay);
}

function syncHistory() {
    nav.timer = 0;
    if (!deps.active() || !deps.settings().backGesture) return;
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
            nav.guard = window.setTimeout(safe(SOURCE, () => { nav.suppress = 0; }), 800);
        }
    } catch (error) {
        console.debug(LOG, 'History sync skipped', error);
    }
}

function closeTopLayer() {
    if (viewerOpen()) {
        closeViewer();
        return true;
    }
    if (currentSheet()) {
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
        else deps.$j()(close).trigger('click');
        return true;
    }
    if (closePageSection()) return true;
    if (deps.currentPageId()) {
        deps.backFromPage();
        return true;
    }
    return false;
}

export function onPopState(event) {
    if (nav.suppress > 0) {
        nav.suppress -= 1;
        return;
    }
    if (!deps.active() || !deps.settings().backGesture) return;
    if (nav.depth > 0) {
        nav.depth -= 1;
        closeTopLayer();
        scheduleHistorySync(400);
    } else if (event.state?.pt) {
        // A leftover entry from before a reload: nothing is open, so keep going back.
        history.back();
    }
}

export function resetHistoryTracking() {
    window.clearTimeout(nav.timer);
    window.clearTimeout(nav.guard);
    nav.timer = 0;
    nav.guard = 0;
    nav.depth = 0;
    nav.suppress = 0;
}
