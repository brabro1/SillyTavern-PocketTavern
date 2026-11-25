// The Settings place (DESIGN.md → Key screens → Settings). For now its rows lead to the legacy sheets
// and SillyTavern's own screens; M5 builds Appearance, Personas, Pocket Tavern and About as pages.
import { listGroup, listRow } from '../ui/list.js';

/** SillyTavern pages that belong to Settings (and any page another extension adds). */
export const SETTINGS_PAGES = ['user-settings-button', 'persona-management-button', 'backgrounds-button', 'extensions-settings-button'];

/**
 * @param {object} actions supplied by the shell
 * @param {(id: string) => void} actions.openPage opens one of SillyTavern's pages by its drawer id
 * @param {() => { id: string, title: string }[]} actions.extensionPages pages other extensions added
 * @param {() => string} actions.themeName the theme in use (may be a SillyTavern theme's own name)
 * @param {() => void} actions.openThemes
 * @param {() => void} actions.openFeatures
 * @param {() => void} actions.openPocketTavernSettings
 * @param {() => void} actions.useSillyTavernForNow SillyTavern's own screens for this visit
 * @param {() => void} actions.openWhatsNew
 * @param {(row: HTMLElement) => void} actions.updatePocketTavern shows its progress in the row's value
 * @param {() => void} actions.openSillyTavernUpdates
 * @param {(() => void) | null} actions.installApp null once it is installed
 * @param {string} actions.version
 * @returns {import('../shell/page.js').PageSpec}
 */
export function settingsPage(actions) {
    return {
        title: 'Settings',
        long: '',
        icon: 'settings',
        render: body => {
            const others = actions.extensionPages();
            const update = listRow({ title: 'Update Pocket Tavern', icon: 'download', end: 'picker', value: `v${actions.version}`, onClick: () => actions.updatePocketTavern(update) });
            body.append(
                listGroup({ header: 'Appearance', rows: [
                    listRow({ title: 'Themes', icon: 'palette', end: 'picker', value: actions.themeName(), onClick: actions.openThemes }),
                    listRow({ title: 'Backgrounds', subtitle: 'Chat backgrounds', icon: 'image', onClick: () => actions.openPage('backgrounds-button') }),
                ] }),
                listGroup({ rows: [
                    listRow({ title: 'Personas', subtitle: 'Who you are in the chat', icon: 'smile', onClick: () => actions.openPage('persona-management-button') }),
                    listRow({ title: 'SillyTavern', subtitle: 'User settings', icon: 'settings', onClick: () => actions.openPage('user-settings-button') }),
                    listRow({ title: 'Extensions', subtitle: 'Extensions and add-ons', icon: 'puzzle', onClick: () => actions.openPage('extensions-settings-button') }),
                    ...others.map(page => listRow({ rawTitle: page.title, icon: 'puzzle', onClick: () => actions.openPage(page.id) })),
                ] }),
                listGroup({ header: 'Pocket Tavern', rows: [
                    listRow({ title: 'Features', icon: 'list', onClick: actions.openFeatures }),
                    listRow({ title: 'Pocket Tavern settings', icon: 'sliders', onClick: actions.openPocketTavernSettings }),
                    listRow({ title: 'Use SillyTavern for now', subtitle: "SillyTavern's own screens until you come back or reload.", icon: 'log-out', onClick: actions.useSillyTavernForNow }),
                ] }),
                listGroup({ header: 'About', rows: [
                    listRow({ title: "What's new", icon: 'star', onClick: actions.openWhatsNew }),
                    update,
                    listRow({ title: 'SillyTavern updates', icon: 'refresh', onClick: actions.openSillyTavernUpdates }),
                    ...(actions.installApp ? [listRow({ title: 'Install as an app', icon: 'download', onClick: actions.installApp })] : []),
                ] }),
            );
        },
    };
}
