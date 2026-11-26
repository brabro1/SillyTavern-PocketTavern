// The filter field at the top of a settings page (DESIGN.md → Settings inventory). Typing hides the rows
// and groups of the page that don't match; a group whose heading matches keeps all its rows.
import { h } from '../core/dom.js';
import { searchBox } from './field.js';

const normalize = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @param {HTMLElement} root the page body; its `.pt-list-section`s are filtered
 * @param {string} [placeholder] (translated)
 * @returns {HTMLElement} the field, to put at the top of the page
 */
export function filterField(root, placeholder = 'Filter settings') {
    const none = h('p', { class: 'pt-filter-none', text: 'Nothing matches that.', hidden: true });
    const run = query => {
        const words = normalize(query).split(/\s+/).filter(Boolean);
        const matches = node => words.every(word => normalize(node.textContent).includes(word));
        let shown = 0;
        for (const section of root.querySelectorAll('.pt-list-section')) {
            const header = section.querySelector(':scope > .pt-list-header');
            const rows = [...section.querySelectorAll('.pt-list-row')];
            const all = !words.length || (header && matches(header));
            let any = false;
            if (rows.length) {
                for (const row of rows) {
                    const on = all || matches(row);
                    row.hidden = !on;
                    any ||= on;
                }
            } else any = all || matches(section);
            section.hidden = !any;
            if (any) shown++;
        }
        none.hidden = shown > 0;
        if (!none.isConnected) root.append(none);
    };
    return searchBox({ placeholder, onSearch: run });
}
