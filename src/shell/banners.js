// Status banners under the header (DESIGN.md → Components → Feedback → Banner): problems that block work
// (not connected, server not answering) and the progress of a whole-chat translation. One place for all of
// them, newest first; each has a key, so showing it again updates it in place. Styles in
// styles/components/feedback.css.
import { h } from '../core/dom.js';
import { safe } from '../core/lifecycle.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { statusBanner } from '../ui/feedback.js';

let host = null;
/** @type {Map<string, { node: HTMLElement, timer: number }>} */
const shown = new Map();

function ensureHost() {
    if (host?.isConnected) return host;
    host = h('div', { id: 'pt-banners', class: 'pt-banners', 'aria-live': 'polite' });
    // A tap on a banner is not a tap outside SillyTavern's open drawer.
    shieldFromDrawerAutoClose(host);
    document.body.append(host);
    return host;
}

/**
 * Shows the banner for `key`, or updates it.
 * @param {string} key e.g. 'server', 'connection', 'translate'
 * @param {object} options as for statusBanner (src/ui/feedback.js)
 * @param {'info'|'ok'|'warn'|'danger'} [options.status]
 * @param {string} options.text one sentence (Pocket Tavern's own words)
 * @param {{ label: string, onClick: () => void }} [options.action]
 * @param {number} [options.hideAfter] ms; for a banner that only says a problem is gone ("Back online")
 */
export function showBanner(key, { hideAfter, ...options }) {
    const node = statusBanner(options);
    node.dataset.ptBanner = key;
    const old = shown.get(key);
    window.clearTimeout(old?.timer);
    if (old?.node.isConnected) old.node.replaceWith(node);
    else ensureHost().prepend(node);
    const timer = hideAfter ? window.setTimeout(safe('hiding a banner', () => hideBanner(key)), hideAfter) : 0;
    shown.set(key, { node, timer });
}

export function hideBanner(key) {
    const entry = shown.get(key);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    entry.node.remove();
    shown.delete(key);
    if (!shown.size) {
        host?.remove();
        host = null;
    }
}

export function isBannerShown(key) {
    return shown.has(key);
}

/** Every banner goes, with its timer (Pocket Tavern turning off). */
export function clearBanners() {
    for (const key of [...shown.keys()]) hideBanner(key);
    host?.remove();
    host = null;
}
