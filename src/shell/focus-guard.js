// Keeping the phone's keyboard down when you did not ask for it: right after a chat opens, SillyTavern focuses the
// message box, and right after a tap elsewhere (✎ Edit) another box can take the focus. Desktop is left alone.
import { EDIT_AREAS, MESSAGE_BOX, SEND_FORM } from '../st/selectors.js';

/** @type {{ active: () => boolean, isWide: () => boolean } | null} */
let deps = null;

export function setupFocusGuard(supplied) {
    deps = supplied;
}

/**
 * Opening a chat made SillyTavern focus the message box, which pops up the
 * keyboard. For a short while after a chat opens, the box only takes focus
 * when you tapped it yourself.
 */
const focusGuard = { until: 0, tapped: 0, target: null, at: 0 };


export function guardKeyboard(ms = 2500) {
    focusGuard.until = Date.now() + ms;
}

export function onFocusGuardPointer(event) {
    if (!deps.active() || deps.isWide()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    focusGuard.target = target;
    focusGuard.at = Date.now();
    if (target.closest(SEND_FORM)) focusGuard.tapped = Date.now();
    // Opening a chat from a list: the focus that follows is not yours.
    else if (target.closest('.pt-chat-row-main, .character_select, .group_select, .select_chat_block, .pt-choice, .pt-search-hit')) guardKeyboard(3500);
}

export function onFocusGuardFocus(event) {
    const box = event.target;
    if (!deps.active() || deps.isWide() || !(box instanceof HTMLTextAreaElement)) return;
    if (box.dataset.ptCopy) return;
    const now = Date.now();
    if (box.matches(MESSAGE_BOX)) {
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
