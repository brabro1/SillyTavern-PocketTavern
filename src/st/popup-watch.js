// While one of SillyTavern's popups is open, Pocket Tavern steps aside (DESIGN.md → Layouts):
// `html.pt-st-popup` is on and Pocket Tavern's own layers take no taps or focus (`inert`).
// One observer watches for popups opening and closing, checked at most once a frame.
import { safe } from '../core/lifecycle.js';
import { POPUP_DIALOG, POPUP_DIALOG_OPEN, POPUP_LEGACY_IDS } from './selectors.js';

const CLASS = 'pt-st-popup';

const shown = element => !!element && !element.hidden && getComputedStyle(element).display !== 'none';

/** True while one of SillyTavern's popups is open. */
export function stPopupOpen() {
    return !!document.querySelector(POPUP_DIALOG_OPEN) || POPUP_LEGACY_IDS.some(id => shown(document.getElementById(id)));
}

/** Pocket Tavern's own layers: what it adds straight to <body> (bars, sheets, viewer, banners). */
const ownLayers = () => [...document.body.children].filter(el => /^pt[-_]/.test(el.id) || [...el.classList].some(c => c.startsWith('pt-')));

/** Starts watching; returns the stop function. Runs only while Pocket Tavern is on. */
export function startPopupWatch() {
    const root = document.documentElement;
    /** Layers this watch made inert, so it only gives back what it took. */
    let made = [];
    let frame = 0;

    const check = safe('the popup watch', () => {
        frame = 0;
        const open = stPopupOpen();
        root.classList.toggle(CLASS, open);
        if (open) {
            for (const layer of ownLayers()) {
                if (!layer.inert && !layer.matches(POPUP_DIALOG)) {
                    layer.inert = true;
                    made.push(layer);
                }
            }
        } else {
            for (const layer of made) layer.inert = false;
            made = [];
        }
    });
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(check);
    };

    // SillyTavern adds and removes popup dialogs on <body> and opens them with the `open` attribute;
    // the older popups change their style. Only those changes are watched: never every node added
    // while a reply streams, never the whole page's styles. (A second observe() on the same node
    // would replace the first one's options, hence two observers.)
    const added = new MutationObserver(safe('the popup watch', schedule));
    added.observe(document.body, { childList: true });
    const opened = new MutationObserver(safe('the popup watch', schedule));
    opened.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'opening'] });
    for (const id of POPUP_LEGACY_IDS) {
        const element = document.getElementById(id);
        if (element) opened.observe(element, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    }
    const onClose = safe('the popup watch', schedule);
    document.addEventListener('close', onClose, true);
    document.addEventListener('cancel', onClose, true);
    check();

    return () => {
        added.disconnect();
        opened.disconnect();
        document.removeEventListener('close', onClose, true);
        document.removeEventListener('cancel', onClose, true);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const layer of made) layer.inert = false;
        made = [];
        root.classList.remove(CLASS);
    };
}
