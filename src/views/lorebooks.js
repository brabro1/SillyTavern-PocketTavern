// The Lorebooks place (DESIGN.md → Key screens → Lorebooks): Active lorebooks, Activation settings, New
// lorebook and Import, then every lorebook as a row that opens its page (SillyTavern's editor for that one
// lorebook). Every value is read from SillyTavern and every change goes through its own controls.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { filterField } from '../ui/filter.js';
import { listGroup, listRow } from '../ui/list.js';

/** SillyTavern's World Info page belongs to the Lorebooks place: Back from it returns here. */
export const LOREBOOK_PAGE = 'WI-SP-button';

/** More lorebooks than this get a filter field. */
const FILTER_FROM = 8;

/**
 * @typedef {object} Lorebook
 * @property {string} name (user data)
 * @property {boolean} active on for every chat
 *
 * @param {object} actions supplied by the shell
 * @param {() => Lorebook[]} actions.books every lorebook, in SillyTavern's order
 * @param {() => void} actions.pickActive opens the Active lorebooks picker
 * @param {() => void} actions.openSettings SillyTavern's activation settings, as a page
 * @param {() => void} actions.create SillyTavern's own New button (it asks for a name)
 * @param {() => void} actions.importBook SillyTavern's own Import button
 * @param {(name: string) => void} actions.openBook a lorebook's page
 * @returns {import('../shell/page.js').PageSpec}
 */
export function lorebooksPage(actions) {
    return {
        title: 'Lorebooks',
        long: 'Lorebooks and their entries',
        icon: 'book',
        render: body => {
            const books = actions.books();
            const active = books.filter(book => book.active).length;
            if (books.length > FILTER_FROM) body.append(filterField(body, 'Filter lorebooks'));
            body.append(listGroup({ rows: [
                listRow({ title: 'Active lorebooks', subtitle: 'On in every chat', icon: 'book', end: 'picker', value: t('{count} of {total}', { count: active, total: books.length }), onClick: actions.pickActive }),
                listRow({ title: 'Activation settings', subtitle: 'Scan depth, budget and recursion', icon: 'sliders', onClick: actions.openSettings }),
            ] }));
            body.append(listGroup({ rows: [
                listRow({ title: 'New lorebook', icon: 'plus', end: 'none', onClick: actions.create }),
                listRow({ title: 'Import', subtitle: 'A lorebook file (.json, .lorebook or .png)', icon: 'file-import', end: 'none', onClick: actions.importBook }),
            ] }));
            body.append(books.length
                ? listGroup({ header: 'Lorebooks', rows: books.map(book => listRow({ rawTitle: book.name, subtitle: book.active ? 'Active in every chat' : undefined, icon: 'book', onClick: () => actions.openBook(book.name) })) })
                : h('p', { class: 'pt-filter-none', text: 'No lorebooks yet. New lorebook starts one.' }));
        },
    };
}
