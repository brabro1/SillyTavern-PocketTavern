// Character Library (another extension) in its Embedded Panel mode (issue #1). Its panel covers the chat
// and pages, so Pocket Tavern treats it as a page of its own: Back and every tab close it, the way its own
// button does. Placed between the bars by styles/compat/character-library.css. Without the extension (no
// panel on the page) nothing here does anything.

const PANEL = '#charlib-embedded-container';
/** Its embedded panel (it follows Safari's keyboard like a page: src/core/activation.js). */
export const CHARACTER_LIBRARY_PANEL = PANEL;
const TOGGLE = '#st-gallery-btn, #charlib-launcher-dropdown [data-action="library"]';

const isShown = element => !!element && getComputedStyle(element).display !== 'none';

/** Closes the embedded panel the way it closes itself (its button toggles it); true when it was open. */
export function closeCharacterLibrary() {
    const panel = document.querySelector(PANEL);
    if (!isShown(panel)) return false;
    const toggle = document.querySelector(TOGGLE);
    if (toggle) toggle.click();
    else panel.style.display = 'none';
    return true;
}

/** Its panel as one of the layers Back closes (src/shell/history.js → OVERLAYS). */
export const CHARACTER_LIBRARY_OVERLAY = { selector: PANEL, close: () => closeCharacterLibrary() };
