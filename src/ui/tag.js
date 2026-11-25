// Chips (DESIGN.md → Components → Chips): 32px pills with a 44px hit area, for filters, tags, quick
// replies and keywords. Removable ones have a ✕ with its own 44px hit area. Styles in styles/components/tag.css.
import { h } from '../core/dom.js';
import { svgIcon } from './icons.js';

/**
 * @param {object} options
 * @param {string} [options.label] Pocket Tavern's own words, or
 * @param {string} [options.rawLabel] user data (a keyword, a tag), never translated
 * @param {boolean} [options.selected] for filters: shown as chosen (aria-pressed)
 * @param {() => void} [options.onClick]
 * @param {() => void} [options.onRemove] adds a ✕
 */
export function tag({ label, rawLabel, selected, onClick, onRemove }) {
    const text = rawLabel !== undefined ? { raw: rawLabel } : { text: label };
    const main = onClick || selected !== undefined
        ? h('button', { type: 'button', class: 'pt-tag-main pt-focus', 'aria-pressed': selected === undefined ? undefined : String(!!selected), onclick: onClick }, [h('span', { class: 'pt-tag-label', ...text })])
        : h('span', { class: 'pt-tag-main' }, [h('span', { class: 'pt-tag-label', ...text })]);
    const remove = onRemove
        ? h('button', { type: 'button', class: 'pt-tag-remove pt-focus', 'aria-label': 'Remove', title: 'Remove', onclick: onRemove }, [svgIcon('x', 'pt-tag-remove-icon')])
        : null;
    return h('span', { class: `pt-tag${selected ? ' pt-tag--selected' : ''}${onRemove ? ' pt-tag--removable' : ''}` }, [main, remove]);
}
