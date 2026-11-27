// Drafts (Settings → Pocket Tavern → Keep unsent messages): what you type in the message box is kept per chat, in
// this browser's storage, and comes back when you open that chat again. Sending clears it.
import { safe } from '../core/lifecycle.js';
import { MESSAGE_BOX } from '../st/selectors.js';

/** @type {{ active: () => boolean, settings: () => object, context: () => any } | null} */
let deps = null;

export function setupDrafts(supplied) {
    deps = supplied;
}

/** The pending write and the chat the box's text belongs to. */
const draft = { timer: 0, key: null };

function draftKeyNow() {
    const context = deps.context();
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

export function onDraftInput(event) {
    if (!deps.active() || !deps.settings().saveDrafts || !event.target?.matches?.(MESSAGE_BOX)) return;
    window.clearTimeout(draft.timer);
    const value = event.target.value;
    const key = draft.key ?? draftKeyNow();
    draft.timer = window.setTimeout(safe('drafts', () => writeDraft(key, value)), 400);
}

/** Called when the chat changes: put away the old chat's draft and bring back this one's. */
export function restoreDraft() {
    if (!deps.active() || !deps.settings().saveDrafts) return;
    const textarea = document.querySelector(MESSAGE_BOX);
    if (!textarea) return;
    window.clearTimeout(draft.timer);
    const previous = draft.key;
    const next = draftKeyNow();
    draft.key = next;
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

export function clearDraft() {
    window.clearTimeout(draft.timer);
    writeDraft(draft.key ?? draftKeyNow(), '');
}
