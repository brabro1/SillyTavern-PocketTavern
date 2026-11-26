// The message box's `+` (DESIGN.md → Key screens → The chat → Message box): one menu with two groups,
// Reply and Tools, in place of SillyTavern's ☰ and wand menus. Each row runs SillyTavern's own control
// (or another extension's), passed in by the shell.
import { listGroup, listRow } from '../ui/list.js';

/**
 * @typedef {object} PlusItem
 * @property {string} [title] Pocket Tavern's own words (translated)
 * @property {string} [rawTitle] a label SillyTavern or another extension wrote, shown as it is
 * @property {string} [subtitle] one line on what it does (translated)
 * @property {string} [icon] one of Pocket Tavern's icons
 * @property {Node} [start] the item's own icon instead (another extension's)
 * @property {() => void} run
 */

/**
 * @param {{ write?: PlusItem[], reply: PlusItem[], tools: PlusItem[] }} items rows that do not apply right now are left
 *        out by the shell; `write` is the Draft helper's group (DESIGN.md → Message box → Draft helper)
 * @returns {HTMLElement[]}
 */
export function plusMenu({ write = [], reply, tools }) {
    const row = item => listRow({ title: item.title, rawTitle: item.rawTitle, subtitle: item.subtitle, icon: item.icon, start: item.start, end: 'none', onClick: item.run });
    const groups = [];
    if (write.length) groups.push(listGroup({ header: 'Write', rows: write.map(row) }));
    if (reply.length) groups.push(listGroup({ header: 'Reply', rows: reply.map(row) }));
    if (tools.length) groups.push(listGroup({ header: 'Tools', rows: tools.map(row) }));
    return groups;
}
