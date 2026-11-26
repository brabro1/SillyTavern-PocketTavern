// Pocket Tavern's own pages (AI, Settings, …): one at a time, in the same place as SillyTavern's pages
// (DESIGN.md → Navigation): between the bars on a phone, in the panel beside the rail on desktop.
// The legacy shell still owns headers and Back; it treats an open page here like an open drawer.
// Styles in styles/components/page.css.
import { h } from '../core/dom.js';
import { safe } from '../core/lifecycle.js';
import { currentLang, isRtl } from '../core/i18n.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';

/** @typedef {{ title: string, long?: string, icon: string, render: (body: HTMLElement) => void }} PageSpec */

/** @type {Map<string, PageSpec>} */
const pages = new Map();
/** @type {{ id: string, el: HTMLElement, body: HTMLElement } | null} */
let open = null;
let listener = () => {};

/** Registers a page. Its `render` fills the page's body; it runs every time the page opens. */
export function definePage(id, spec) {
    pages.set(id, spec);
}

export function isOwnPage(id) {
    return pages.has(id);
}

/** @returns {PageSpec | null} */
export function pageSpec(id) {
    return pages.get(id) ?? null;
}

export function currentOwnPage() {
    return open?.id ?? null;
}

/** Called after a page opens or closes (the shell updates its header, tabs and history). */
export function onPageChange(callback) {
    listener = callback;
}

/** How long a newly opened page's groups may take to fade in (8 at 20ms apart, 240ms each). */
const ENTER_MS = 500;

export function openOwnPage(id) {
    const spec = pages.get(id);
    if (!spec || open?.id === id) return;
    closeOwnPage(true);
    const body = h('div', { class: 'pt-page-body' });
    // The language of its labels, and right-to-left for Arabic (DESIGN.md → Layouts).
    const el = h('section', { id: 'pt-page', class: 'pt-page', 'data-page': id, 'aria-label': spec.title, lang: currentLang(), dir: isRtl() ? 'rtl' : 'ltr' }, [body]);
    shieldFromDrawerAutoClose(el);
    spec.render(body);
    // Its first groups fade in with a short rise as it opens (DESIGN.md → Motion), not when it is drawn again.
    el.classList.add('pt-page--enter');
    window.setTimeout(safe('a page', () => el.classList.remove('pt-page--enter')), ENTER_MS);
    document.body.append(el);
    open = { id, el, body };
    listener();
}

/** Closes the open page. `quiet` skips the change callback (when another page opens straight after). */
export function closeOwnPage(quiet = false) {
    if (!open) return;
    open.el.remove();
    open = null;
    if (!quiet) listener();
}

/** Draws the open page again in place (after something it shows changed). */
export function refreshOwnPage() {
    if (!open) return;
    const top = open.body.scrollTop;
    open.body.replaceChildren();
    pages.get(open.id).render(open.body);
    open.body.scrollTop = top;
}

/** Tapping the place you are on scrolls its page back to the top. */
export function scrollOwnPageToTop() {
    open?.body.scrollTo({ top: 0, behavior: 'smooth' });
}
