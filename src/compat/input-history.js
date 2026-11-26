// Input History (another extension, by LenAnderson): arrows and a history button at the end of the message
// box (styles/compat/input-history.css). Its arrows show while the box is empty, and after they bring back
// an earlier message they stay until you type your own words (html class pt-ih-browse on the box's row).
// Keyed on its own .stih-- markup: without it nothing here does anything.
import { safe } from '../core/lifecycle.js';
import { MESSAGE_BOX, MESSAGE_ROW } from '../st/selectors.js';

/** @type {{ active: () => boolean, settings: () => object } | null} */
let deps = null;

export function setupInputHistory(supplied) {
    deps = supplied;
}

/** A press on its arrows: browsing earlier messages, so the arrows stay. */
export const onInputHistoryClick = safe('input history', event => {
    if (!deps?.active() || !deps.settings().chatStyle) return;
    if (event.target.closest?.(`${MESSAGE_ROW} .stih--arrows`)) document.querySelector(MESSAGE_ROW)?.classList.add('pt-ih-browse');
});

/** Your own typing ends the browsing. */
export const onComposerInput = safe('input history', event => {
    if (!deps?.active()) return;
    if (event.isTrusted && event.target?.matches?.(MESSAGE_BOX)) endInputHistoryBrowse();
});

export function endInputHistoryBrowse() {
    document.querySelector(MESSAGE_ROW)?.classList.remove('pt-ih-browse');
}
