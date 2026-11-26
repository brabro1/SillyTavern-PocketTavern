// Settings → About (DESIGN.md → Settings inventory): the version, What's new, updates, installing as an
// app, and where to read more or report a problem.
import { h } from '../core/dom.js';
import { filterField } from '../ui/filter.js';
import { listGroup, listRow } from '../ui/list.js';

const REPO = 'https://github.com/brabro1/SillyTavern-PocketTavern';

/**
 * @param {object} actions supplied by the shell
 * @param {string} actions.version
 * @param {() => void} actions.openWhatsNew
 * @param {(row: HTMLElement) => void} actions.updatePocketTavern shows its progress in the row's value
 * @param {() => void} actions.openSillyTavernUpdates
 * @param {() => ((() => void) | null)} actions.installApp null once it is installed
 * @param {(url: string) => void} actions.openLink opens a page in a new tab
 * @returns {import('../shell/page.js').PageSpec}
 */
export function aboutPage(actions) {
    return {
        title: 'About',
        long: 'Version, updates and help',
        icon: 'info',
        render: body => {
            body.append(filterField(body));
            body.append(h('div', { class: 'pt-about-head' }, [
                h('div', { class: 'pt-about-name', role: 'heading', 'aria-level': '2', text: 'Pocket Tavern' }),
                h('div', { class: 'pt-about-version', raw: `v${actions.version}` }),
            ]));
            const update = listRow({ title: 'Update Pocket Tavern', icon: 'download', end: 'picker', value: `v${actions.version}`, onClick: () => actions.updatePocketTavern(update) });
            const install = actions.installApp();
            body.append(listGroup({ header: 'Updates', rows: [
                listRow({ title: "What's new", icon: 'star', onClick: actions.openWhatsNew }),
                update,
                listRow({ title: 'SillyTavern updates', icon: 'refresh', onClick: actions.openSillyTavernUpdates }),
                install ? listRow({ title: 'Install as an app', subtitle: 'Opens full screen from your home screen.', icon: 'download', onClick: install }) : null,
            ].filter(Boolean) }));
            body.append(listGroup({ header: 'Help', rows: [
                listRow({ title: 'Guide', subtitle: 'How to use Pocket Tavern', icon: 'book', end: 'none', onClick: () => actions.openLink(`${REPO}/blob/main/docs/guide.md`) }),
                listRow({ title: 'GitHub', subtitle: 'Code, releases and notes', icon: 'external', end: 'none', onClick: () => actions.openLink(REPO) }),
                listRow({ title: 'Report a problem', subtitle: 'Opens a new issue on GitHub', icon: 'flag', end: 'none', onClick: () => actions.openLink(`${REPO}/issues/new/choose`) }),
            ] }));
        },
    };
}
