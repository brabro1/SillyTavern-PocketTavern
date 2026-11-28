// The message box's `+` (DESIGN.md → Key screens → The chat → Message box): quick-switch pills for the
// active connection/model/preset/lorebooks, then Write, Reply and Tools in place of SillyTavern's ☰ and
// wand menus. Each item runs SillyTavern's own control (or another extension's), passed in by the shell.
import { h } from '../core/dom.js';
import { svgIcon } from '../ui/icons.js';
import { listGroup, listRow } from '../ui/list.js';

/**
 * @typedef {object} PlusItem
 * @property {string} [title] Pocket Tavern's own words (translated)
 * @property {string} [rawTitle] a label SillyTavern or another extension wrote, shown as it is
 * @property {string} [subtitle] one line on what it does (translated)
 * @property {string} [icon] one of Pocket Tavern's icons
 * @property {Node} [start] the item's own icon instead (another extension's)
 * @property {() => void} run
 *
 * @typedef {object} QuickSwitchItem
 * @property {string} icon
 * @property {string} label Pocket Tavern's own words (translated)
 * @property {string} value current choice (user/SillyTavern text, shown as-is)
 * @property {() => void} run
 */

/**
 * @param {{ quick?: QuickSwitchItem[], write?: PlusItem[], reply: PlusItem[], tools: PlusItem[] }} items
 * @returns {HTMLElement[]}
 */
export function plusMenu({ quick = [], write = [], reply, tools }) {
    const row = item => listRow({ title: item.title, rawTitle: item.rawTitle, subtitle: item.subtitle, icon: item.icon, start: item.start, end: 'none', onClick: item.run });
    const groups = [];
    if (quick.length) {
        const strip = h('div', { class: 'pt-plus-quick', role: 'group', 'aria-label': 'Quick switch' }, quick.map(item => h('button', {
            type: 'button',
            class: 'pt-plus-quick-chip pt-focus pt-press',
            onclick: item.run,
        }, [
            svgIcon(item.icon, 'pt-plus-quick-icon'),
            h('span', { class: 'pt-plus-quick-label', text: item.label }),
            item.value ? h('span', { class: 'pt-plus-quick-val', raw: item.value, dir: 'auto' }) : null,
            svgIcon('chevron-down', 'pt-plus-quick-caret'),
        ])));
        groups.push(strip);
    }
    if (write.length) groups.push(listGroup({ header: 'Write', rows: write.map(row) }));
    if (reply.length) groups.push(listGroup({ header: 'Reply', rows: reply.map(row) }));
    if (tools.length) groups.push(listGroup({ header: 'Tools', rows: tools.map(row) }));
    return groups;
}
