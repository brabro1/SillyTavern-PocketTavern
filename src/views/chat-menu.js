// The chat's ⋯ menu (DESIGN.md → Key screens → The chat; Where everything lives): everything about the
// open chat in one place. Each row runs SillyTavern's own control or function, passed in by the shell.
import { t } from '../core/i18n.js';
import { listGroup, listRow } from '../ui/list.js';

/**
 * @param {object} actions supplied by the shell; a missing action leaves its row out
 * @param {() => void} actions.search Search in this chat
 * @param {(() => void) | null} [actions.pins] open Pinned messages sheet
 * @param {number} [actions.pinCount] number of pinned messages in this chat
 * @param {(() => void) | null} [actions.insights] open Chat insights sheet
 * @param {(() => void) | null} actions.translate
 * @param {() => void} actions.rename
 * @param {{ label: string, subtitle?: string, icon: string, run: () => void }[]} actions.chatItems
 *        SillyTavern's own items for this chat that it shows right now (checkpoint, branch, group)
 * @param {() => void} actions.chatFiles every saved chat with this character: export, rename or delete
 * @param {(() => void) | null} actions.deleteMessages pick messages to delete (SillyTavern's own mode)
 * @returns {HTMLElement[]}
 */
export function chatMenu(actions) {
    const pinCount = Number(actions.pinCount) || 0;
    const groups = [
        listGroup({ rows: [
            listRow({ title: 'Search this chat', icon: 'search', end: 'none', onClick: actions.search }),
            ...(actions.pins ? [listRow({
                title: 'Pinned messages',
                subtitle: pinCount ? t('{count} saved', { count: pinCount }) : 'Save key story moments from this chat',
                icon: 'bookmark',
                end: 'none',
                onClick: actions.pins,
            })] : []),
            ...(actions.insights ? [listRow({ title: 'Chat insights', subtitle: 'Words, reading time and voice balance', icon: 'chart', end: 'none', onClick: actions.insights })] : []),
            ...(actions.focus ? [listRow({ title: actions.focused ? 'Exit focus mode' : 'Focus mode', icon: actions.focused ? 'minimize' : 'maximize', end: 'none', onClick: actions.focus })] : []),
            ...(actions.translate ? [listRow({ title: 'Translate chat', icon: 'languages', end: 'none', onClick: actions.translate })] : []),
            listRow({ title: 'Rename', icon: 'pencil', end: 'none', onClick: actions.rename }),
            ...actions.chatItems.map(item => listRow({ title: item.label, subtitle: item.subtitle, icon: item.icon, end: 'none', onClick: item.run })),
            listRow({ title: 'Chat files', subtitle: 'Every saved chat with this character: export or delete them', icon: 'history', end: 'none', onClick: actions.chatFiles }),
        ] }),
    ];
    // Destructive items come last, after a separator, in danger red (DESIGN.md → Menus).
    if (actions.deleteMessages) {
        const remove = listRow({ title: 'Delete messages', subtitle: 'Pick messages to remove', icon: 'trash', end: 'none', onClick: actions.deleteMessages });
        remove.classList.add('pt-list-row--danger');
        groups.push(listGroup({ rows: [remove] }));
    }
    return groups;
}
