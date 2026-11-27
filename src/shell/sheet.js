// Sheets (DESIGN.md → Components → Sheet, dialog, popover): one at a time, from the bottom on a phone and as a popover
// beside the button that opened it on desktop; Back, ✕, a swipe down or a tap outside closes it, and the focus goes
// back where it was.
import { h } from '../core/dom.js';
import { currentLang } from '../core/i18n.js';
import { fitToViewport, overlayHead, placePopover, syncToasts, wireOverlay } from './overlay.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'sheet';

/** @type {{ isWide: () => boolean, scheduleHistorySync: () => void, compactBelow: number } | null} */
let deps = null;

export function setupSheet(supplied) {
    deps = supplied;
}

export class MenuSheet {
    /**
     * @param {{ title: string, subtitle?: string, anchor?: Element, fill: (body: HTMLElement) => void }} options
     *        anchor: the button that opened it; on desktop the sheet is then a popover beside it
     */
    constructor({ title, subtitle, anchor, fill }) {
        this.picker = null;
        this.anchor = anchor ?? null;
        this.closing = false;
        this.fill = fill;
        this.dialog = h('dialog', { id: 'pt-sheet', class: 'pt-sheet pt-menu-sheet', 'aria-label': title });
        this.panel = h('div', { class: 'pt-panel', tabindex: '-1' });
        Object.assign(this, overlayHead({ title, subtitle, onClose: () => closeSheet() }));
        this.body = h('div', { class: 'pt-menu-body' });
        this.panel.append(this.head, this.body);
        this.dialog.append(this.panel);
        wireOverlay({ dialog: this.dialog, panel: this.panel, dragAreas: [this.head, this.body], onClose: () => closeSheet() });
        this.refresh();
    }

    refresh() {
        const scroll = this.body.scrollTop;
        this.body.replaceChildren();
        this.fill(this.body);
        this.body.scrollTop = scroll;
    }
}

/** The sheet open now, or null. */
let sheet = null;

export function currentSheet() {
    return sheet;
}

export function showSheet(instance) {
    const previousFocus = sheet ? sheet.returnFocus : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (sheet) closeSheet(true);
    // Clean up any fading-out sheet so there is never a duplicate #pt-sheet ID.
    for (const stale of document.querySelectorAll('dialog#pt-sheet')) {
        if (stale.open) stale.close();
        stale.remove();
    }
    sheet = instance;
    sheet.returnFocus = previousFocus;
    // The viewport follower runs all the time Pocket Tavern is on (see applyState);
    // here the new sheet only needs to know whether the screen is short.
    sheet.dialog.classList.toggle('pt-compact', (window.visualViewport?.height ?? window.innerHeight) < deps.compactBelow);
    // The language of its labels, so long words (a tile name on a narrow phone) break with a hyphen.
    sheet.dialog.lang = currentLang();
    fitToViewport(sheet.dialog, deps.compactBelow);
    if (sheet.anchor?.isConnected && deps.isWide()) placePopover(sheet.dialog, sheet.anchor);
    document.body.append(sheet.dialog);
    sheet.dialog.showModal();
    syncToasts();
    // Opening focuses the first field; make sure that did not scroll the sheet.
    sheet.dialog.scrollTop = 0;
    requestAnimationFrame(safe(SOURCE, () => sheet?.dialog.classList.add('pt-sheet-open')));
    sheet.panel.focus({ preventScroll: true });
    deps.scheduleHistorySync();
}

export function closeSheet(immediate = false) {
    const current = sheet;
    if (!current || current.closing) return;
    current.closing = true;
    sheet = null;
    const finish = () => {
        if (current.dialog.open) current.dialog.close();
        // Before removing it: the toast container may be inside and must go back to the page.
        syncToasts();
        current.dialog.remove();
        if (!immediate && !sheet && current.returnFocus?.isConnected && document.activeElement === document.body) {
            current.returnFocus.focus({ preventScroll: true });
        }
    };
    if (immediate) {
        finish();
    } else {
        // Taps during the fade-out must not hit rows of a sheet that is already closing.
        current.dialog.style.pointerEvents = 'none';
        // New toasts during the fade-out go to the page, not into a dialog about to be removed.
        current.dialog.setAttribute('closing', '');
        syncToasts();
        current.dialog.classList.remove('pt-sheet-open');
        setTimeout(finish, 230);
    }
    deps.scheduleHistorySync();
}
