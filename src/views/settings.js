// The Settings place (DESIGN.md → Key screens → Settings): Appearance, Personas, SillyTavern, Extensions
// (and pages other extensions add), Pocket Tavern and About. Appearance, Pocket Tavern and About are
// Pocket Tavern's own pages; the others are SillyTavern's own screens, restyled.
import { listGroup, listRow } from '../ui/list.js';

/** SillyTavern pages that belong to Settings (and any page another extension adds). */
export const SETTINGS_PAGES = ['user-settings-button', 'persona-management-button', 'backgrounds-button', 'extensions-settings-button'];

/** Pocket Tavern's own pages inside Settings: Back from them returns to Settings. */
export const SETTINGS_OWN_PAGES = ['pt-appearance', 'pt-display', 'pt-pocket', 'pt-about', 'pt-draft'];

/**
 * @param {object} actions supplied by the shell
 * @param {(id: string) => void} actions.openPage opens one of SillyTavern's pages by its drawer id, or one of Pocket Tavern's
 * @param {() => { id: string, title: string, icon: string }[]} actions.extensionPages pages other extensions added
 * @param {(name: string) => Node | undefined} [actions.iconFor] builds a 20px icon node for a drawer icon name
 * @param {() => boolean} [actions.separateExtensions] true while Extensions has its own navigation button (issue #18)
 * @param {() => string} actions.themeName the theme in use (may be a SillyTavern theme's own name)
 * @param {string} actions.version
 * @returns {import('../shell/page.js').PageSpec}
 */
export function settingsPage(actions) {
    return {
        title: 'Settings',
        long: '',
        icon: 'settings',
        render: body => {
            const separate = !!actions.separateExtensions?.();
            const others = separate ? [] : actions.extensionPages();
            const systemRows = [
                listRow({ title: 'SillyTavern', subtitle: 'Its own settings, by section', icon: 'settings', onClick: () => actions.openPage('user-settings-button') }),
            ];
            if (!separate) {
                systemRows.push(listRow({ title: 'Extensions', subtitle: 'Extensions and add-ons', icon: 'puzzle', onClick: () => actions.openPage('extensions-settings-button') }));
            }
            body.append(
                listGroup({ rows: [
                    listRow({ title: 'Appearance', icon: 'palette', end: 'picker', value: actions.themeName(), onClick: () => actions.openPage('pt-appearance') }),
                    listRow({ title: 'Chat and layout', subtitle: 'Chat look, text, layout and motion', icon: 'chat', onClick: () => actions.openPage('pt-display') }),
                    listRow({ title: 'Personas', subtitle: 'Who you are in the chat', icon: 'smile', onClick: () => actions.openPage('persona-management-button') }),
                ] }),
                listGroup({ rows: systemRows }),
            );
            if (others.length) {
                body.append(listGroup({
                    header: 'Extension menus',
                    rows: others.map(page => listRow({
                        rawTitle: page.title,
                        icon: 'puzzle',
                        start: actions.iconFor?.(page.icon),
                        onClick: () => actions.openPage(page.id),
                    })),
                }));
            }
            body.append(
                listGroup({ rows: [
                    listRow({ title: 'Pocket Tavern', subtitle: 'Where it runs and how it behaves', icon: 'sliders', onClick: () => actions.openPage('pt-pocket') }),
                    listRow({ title: 'About', icon: 'info', end: 'picker', value: `v${actions.version}`, onClick: () => actions.openPage('pt-about') }),
                ] }),
            );
        },
    };
}

/**
 * The optional Extensions place (when Settings → Pocket Tavern → Extensions button is on; issue #18):
 * groups third-party extension menus first, then All extensions (SillyTavern's Extensions screen).
 * @param {object} actions
 * @param {(id: string) => void} actions.openPage
 * @param {() => { id: string, title: string, icon: string }[]} actions.extensionPages
 * @param {(name: string) => Node | undefined} [actions.iconFor]
 * @returns {import('../shell/page.js').PageSpec}
 */
export function extensionsPage(actions) {
    return {
        title: 'Extensions',
        long: 'Extensions and add-ons',
        icon: 'puzzle',
        render: body => {
            const others = actions.extensionPages();
            if (others.length) {
                body.append(listGroup({
                    header: 'Extension menus',
                    rows: others.map(page => listRow({
                        rawTitle: page.title,
                        icon: 'puzzle',
                        start: actions.iconFor?.(page.icon),
                        onClick: () => actions.openPage(page.id),
                    })),
                }));
            }
            body.append(listGroup({ rows: [
                listRow({ title: 'All extensions', subtitle: 'Manage extensions and their settings', icon: 'puzzle', onClick: () => actions.openPage('extensions-settings-button') }),
            ] }));
        },
    };
}
