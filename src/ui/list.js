// List rows and groups (DESIGN.md → Components → List rows and groups). Styles in styles/components/list.css.
import { h } from '../core/dom.js';
import { svgIcon } from './icons.js';
import { toggle } from './toggle.js';

/**
 * One row. Its end shows what it does:
 * - `nav`: a chevron; the row opens something
 * - `toggle`: a switch; the whole row toggles
 * - `picker`: the current value and a chevron
 * - `object`: ⋯ for the object's menu (pass `onMenu`)
 * @param {object} options
 * @param {string} options.title Pocket Tavern's own words; use `rawTitle` for user data
 * @param {string} [options.rawTitle] a name or other user data, never translated
 * @param {string} [options.subtitle] one line of help (translated)
 * @param {string} [options.icon] a 20px icon at the start
 * @param {Node} [options.start] something else at the start instead (an avatar)
 * @param {'nav'|'toggle'|'picker'|'object'|'none'} [options.end]
 * @param {string} [options.value] for `picker`: the current choice, shown as is (it may be user data)
 * @param {boolean} [options.checked] for `toggle`
 * @param {(checked: boolean) => void} [options.onToggle]
 * @param {() => void} [options.onClick] for `nav`, `picker` and `object` rows
 * @param {(event: MouseEvent) => void} [options.onMenu] for `object`: the ⋯ button
 */
export function listRow({ title, rawTitle, subtitle, icon, start, end = 'nav', value, checked = false, onToggle, onClick, onMenu }) {
    const titleId = `pt-row-${Math.random().toString(36).slice(2, 9)}`;
    const text = h('span', { class: 'pt-list-row-text' }, [
        h('span', rawTitle !== undefined ? { class: 'pt-list-row-title', id: titleId, raw: rawTitle } : { class: 'pt-list-row-title', id: titleId, text: title }),
        subtitle ? h('span', { class: 'pt-list-row-subtitle', text: subtitle }) : null,
    ]);
    const lead = start ?? (icon ? svgIcon(icon, 'pt-list-row-icon') : null);

    if (end === 'toggle') {
        const control = toggle({ checked, labelledBy: titleId, onChange: onToggle });
        // The whole row toggles; the switch itself stays the one focusable control.
        const row = h('div', { class: 'pt-list-row pt-list-row--toggle', onclick: event => { if (!control.contains(event.target)) control.click(); } }, [lead, text, control]);
        return row;
    }

    if (end === 'object') {
        return h('div', { class: 'pt-list-row pt-list-row--object' }, [
            h('button', { type: 'button', class: 'pt-list-row-main pt-focus', onclick: onClick }, [lead, text]),
            h('button', { type: 'button', class: 'pt-icon-button pt-focus pt-press', 'aria-label': 'More actions', title: 'More actions', onclick: onMenu }, [svgIcon('ellipsis', 'pt-icon-button-icon')]),
        ]);
    }

    if (end === 'value') {
        return h('div', { class: 'pt-list-row pt-list-row--none' }, [
            lead,
            text,
            h('span', { class: 'pt-list-row-end' }, [h('span', { class: 'pt-list-row-value', raw: value ?? '' })]),
        ]);
    }

    const trail = end === 'picker'
        ? h('span', { class: 'pt-list-row-end' }, [h('span', { class: 'pt-list-row-value', raw: value ?? '' }), svgIcon('chevron-right', 'pt-list-row-chevron')])
        : end === 'nav' ? h('span', { class: 'pt-list-row-end' }, [svgIcon('chevron-right', 'pt-list-row-chevron')]) : null;
    return h('button', { type: 'button', class: `pt-list-row pt-list-row--${end} pt-focus`, onclick: onClick }, [lead, text, trail]);
}

/**
 * Rows in a rounded group, separated by hairlines that start at the text.
 * @param {object} options
 * @param {string} [options.header] a small heading above the group (translated)
 * @param {Node[]} options.rows
 */
export function listGroup({ header, rows }) {
    return h('section', { class: 'pt-list-section' }, [
        header ? h('div', { class: 'pt-list-header', text: header }) : null,
        h('div', { class: 'pt-list-group' }, rows),
    ]);
}
