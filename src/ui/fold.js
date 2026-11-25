// The one "Advanced" fold a form may have (DESIGN.md → Components → Disclosure): a row whose chevron
// turns 90° and whose content appears below it, fading in. It never nests. Sections of a long screen
// are rows that open pages instead. Styles in styles/components/fold.css.
import { h } from '../core/dom.js';
import { svgIcon } from './icons.js';

let next = 0;

/**
 * @param {object} options
 * @param {string} [options.label] (translated)
 * @param {Node[]} options.content
 * @param {boolean} [options.open]
 */
export function fold({ label = 'Advanced', content, open = false }) {
    const id = `pt-fold-${++next}`;
    const body = h('div', { class: 'pt-fold-body', id, hidden: !open }, content);
    const head = h('button', { type: 'button', class: 'pt-fold-head pt-focus', 'aria-expanded': String(open), 'aria-controls': id }, [
        h('span', { class: 'pt-fold-label', text: label }),
        svgIcon('chevron-right', 'pt-fold-chevron'),
    ]);
    head.addEventListener('click', () => {
        const nowOpen = head.getAttribute('aria-expanded') !== 'true';
        head.setAttribute('aria-expanded', String(nowOpen));
        body.hidden = !nowOpen;
    });
    return h('div', { class: 'pt-fold' }, [head, body]);
}
