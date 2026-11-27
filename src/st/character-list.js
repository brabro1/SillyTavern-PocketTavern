// The Characters list's own parts (DESIGN.md → Characters list), around SillyTavern's own list:
// - the Filter sheet and, while anything is filtered, a line of chips that undo each filter;
// - at the top of the list, the Favorites row and the "All characters" header;
// - a long press (finger) or right click (mouse) on a card opens that character's menu.
// Every filter is SillyTavern's own filter button, clicked (its three states: any, only, hidden), so its
// saving and the list's drawing stay SillyTavern's. Nothing of SillyTavern's moves.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { listGroup, listRow } from '../ui/list.js';
import { pick, pickRow } from '../ui/picks.js';
import { svgIcon } from '../ui/icons.js';
import { BULK_EDIT_BUTTON, BULK_MODE_CLASS, CHARACTER_FILTERS, CHARACTER_LIST, CHARACTER_LIST_TOP, CHARACTER_SEARCH } from './selectors.js';

/**
 * @typedef {object} ListDeps
 * @property {() => any} context SillyTavern's getContext()
 * @property {(instance: any) => void} showSheet
 * @property {(immediate?: boolean) => void} closeSheet
 * @property {(options: object) => any} menuSheet makes a sheet (src/shell/sheet.js)
 * @property {(chid: string) => void} openCharacterPage
 * @property {(chid: string, anchor?: HTMLElement | null) => void} cardMenu the character's menu
 * @property {() => void} closePages
 */
/** @type {ListDeps | null} */
let deps = null;

export function setupCharacterList(supplied) {
    deps = supplied;
}

// -- filters

/** SillyTavern's built-in filters, by the class on their button. */
const BUILT_IN = [
    ['filterByFavorites', 'Favorites', 'star'],
    ['filterByGroups', 'Groups', 'users'],
    ['filterByFolder', 'Folders', 'folder'],
];
const STATE_LABEL = { SELECTED: 'Only', EXCLUDED: 'Hidden', UNDEFINED: 'Any' };

const filterChips = () => [...document.querySelectorAll(`${CHARACTER_FILTERS} .tag`)];
const stateOf = chip => chip?.getAttribute('data-toggle-state') || 'UNDEFINED';
/** SillyTavern may draw the row again after a click, so a button is looked up again by its id each time. */
const chipById = id => document.querySelector(`${CHARACTER_FILTERS} .tag[id="${CSS.escape(id)}"]`);
const builtIn = name => document.querySelector(`${CHARACTER_FILTERS} .tag.${name}`);
/** Your own tags (not SillyTavern's action buttons). */
const tagChips = () => filterChips().filter(chip => !chip.classList.contains('actionable') && chip.id);
const tagName = chip => chip.querySelector('.tag_name')?.textContent.trim() ?? '';

/** Every filter that is on: its button, its name (built-in names are ours, tags are the user's) and state. */
function activeFilters() {
    const out = [];
    for (const [name, label, icon] of BUILT_IN) {
        const chip = builtIn(name);
        if (chip && stateOf(chip) !== 'UNDEFINED') out.push({ id: chip.id, title: t(label), icon, state: stateOf(chip) });
    }
    for (const chip of tagChips()) {
        if (stateOf(chip) !== 'UNDEFINED') out.push({ id: chip.id, raw: tagName(chip), icon: 'tag', state: stateOf(chip) });
    }
    return out;
}

/** Clicks SillyTavern's button until it is in the wanted state (it cycles any → only → hidden). */
function setFilter(id, want) {
    for (let step = 0; step < 3; step++) {
        const chip = chipById(id);
        if (!chip || stateOf(chip) === want) return;
        chip.click();
    }
}

function cycleFilter(id) {
    chipById(id)?.click();
}

/** Filter: Favorites, Groups, Folders and every tag, each tapped through any → only → hidden. */
export function openFilterSheet() {
    let body = null;
    const draw = () => {
        if (!body) return;
        const row = ({ id, title, raw, icon, color }) => {
            const state = stateOf(chipById(id));
            const node = listRow({
                ...(raw !== undefined ? { rawTitle: raw } : { title }),
                icon: color ? undefined : icon,
                start: color ? h('span', { class: 'pt-filter-dot', style: `background:${color}` }) : undefined,
                end: 'picker',
                value: t(STATE_LABEL[state]),
                onClick: () => {
                    cycleFilter(id);
                    setTimeout(safe('character filters', () => { draw(); syncFilterBar(); }), 80);
                },
            });
            node.classList.toggle('pt-filter-on', state !== 'UNDEFINED');
            node.dataset.ptFilter = state;
            return node;
        };
        const shown = BUILT_IN.map(([name, label, icon]) => ({ chip: builtIn(name), label, icon })).filter(item => item.chip);
        const tags = tagChips();
        const parts = [
            listGroup({ header: 'Show', rows: shown.map(({ chip, label, icon }) => row({ id: chip.id, title: label, icon })) }),
        ];
        if (tags.length) {
            parts.push(listGroup({
                header: 'Tags',
                rows: tags.map(chip => row({ id: chip.id, raw: tagName(chip), icon: 'tag', color: chip.style.backgroundColor || '' })),
            }));
        }
        const manage = builtIn('manageTags');
        const clear = builtIn('clearAllFilters');
        parts.push(listGroup({ rows: [
            manage ? listRow({ title: 'Edit tags', icon: 'tag', end: 'nav', onClick: () => { deps.closeSheet(true); manage.click(); } }) : null,
            clear ? listRow({ title: 'Clear all filters', icon: 'x', end: 'none', onClick: () => { clear.click(); setTimeout(safe('character filters', () => { draw(); syncFilterBar(); }), 80); } }) : null,
        ].filter(Boolean) }));
        body.replaceChildren(h('p', { class: 'pt-filter-hint', text: 'Tap one to go from any to only, then hidden.' }), ...parts);
    };
    deps.showSheet(deps.menuSheet({
        title: t('Filter'),
        fill: target => {
            body = target;
            draw();
        },
    }));
}

/** The chips under the toolbar while something is filtered, and the count on the Filter button. */
export function syncFilterBar() {
    const top = document.querySelector(CHARACTER_LIST_TOP);
    const toolbar = document.getElementById('pt_char_toolbar');
    if (!top || !toolbar) return;
    const active = activeFilters();
    const button = toolbar.querySelector('.pt-ctool-filter');
    if (button) {
        if (active.length) button.dataset.count = String(active.length);
        else delete button.dataset.count;
        button.classList.toggle('pt-ctool-on', active.length > 0);
    }
    let bar = document.getElementById('pt_char_filters');
    if (!active.length) {
        bar?.remove();
        return;
    }
    if (!bar) {
        bar = h('div', { id: 'pt_char_filters', class: 'pt-char-filters', role: 'list', 'aria-label': t('Filters') });
        toolbar.after(bar);
    }
    const chip = filter => h('button', {
        type: 'button',
        role: 'listitem',
        class: `pt-filter-chip pt-focus${filter.state === 'EXCLUDED' ? ' pt-filter-chip--hidden' : ''}`,
        title: t('Remove this filter'),
        onclick: () => {
            setFilter(filter.id, 'UNDEFINED');
            setTimeout(safe('character filters', syncFilterBar), 80);
        },
    }, [
        svgIcon(filter.state === 'EXCLUDED' ? 'eye-off' : filter.icon, 'pt-filter-chip-icon'),
        h('span', filter.raw !== undefined ? { raw: filter.raw, dir: 'auto' } : { text: filter.title }),
        svgIcon('x', 'pt-filter-chip-x'),
    ]);
    const clear = builtIn('clearAllFilters');
    bar.replaceChildren(...active.map(chip), clear ? h('button', {
        type: 'button',
        class: 'pt-filter-clear pt-focus',
        text: 'Clear',
        onclick: () => {
            clear.click();
            setTimeout(safe('character filters', syncFilterBar), 80);
        },
    }) : null);
}

/** The list showing only this tag (a tag tapped on a character's page). */
export function filterByTag(id) {
    setFilter(String(id), 'SELECTED');
    syncFilterBar();
    syncListTop();
}

// -- the top of the list: Favorites and "All characters"

const isFavorite = item => item?.fav === true || item?.fav === 'true';

function favoritePicks() {
    const context = deps.context();
    const thumb = file => context.getThumbnailUrl?.('avatar', file) ?? `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;
    const picks = [];
    (context.characters ?? []).forEach((character, chid) => {
        if (!isFavorite(character)) return;
        picks.push({ name: character.name, sort: character.name, node: pick({
            name: character.name,
            picture: thumb(character.avatar),
            label: t('Open the page of {name}', { name: character.name }),
            onClick: () => deps.openCharacterPage(String(chid)),
        }) });
    });
    for (const group of context.groups ?? []) {
        if (!isFavorite(group)) continue;
        picks.push({ name: group.name, sort: group.name, node: pick({
            name: group.name,
            picture: group.avatar_url || undefined,
            label: t('Open the latest chat with {name}', { name: group.name }),
            onClick: async () => {
                const { openGroupById } = await import('/scripts/group-chats.js');
                await openGroupById(group.id);
                deps.closePages();
            },
        }) });
    }
    return picks.sort((a, b) => a.sort.localeCompare(b.sort)).map(item => item.node);
}

/** True while the list shows a subset: a search, a filter, bulk select. Favorites step aside then. */
function narrowed(list) {
    return !!document.querySelector(CHARACTER_SEARCH)?.value.trim() || activeFilters().length > 0 || list.classList.contains(BULK_MODE_CLASS);
}

/**
 * Puts the Favorites row and the "All characters" header first in the list. SillyTavern empties the list on
 * every search, sort and page, so this runs again after each (src/st/characters.js → its list observer).
 */
export function syncListTop() {
    const list = document.querySelector(CHARACTER_LIST);
    if (!list) return;
    let top = document.getElementById('pt_char_top');
    if (!top) top = h('div', { id: 'pt_char_top', class: 'pt-char-top', 'data-pt': '1' });
    const context = deps.context();
    const total = (context.characters?.length ?? 0) + (context.groups?.length ?? 0);
    const picks = narrowed(list) ? [] : favoritePicks();
    const key = `${picks.length}|${total}|${narrowed(list)}|${(context.characters ?? []).filter(isFavorite).map(c => c.avatar).join(',')}`;
    if (top.dataset.key !== key) {
        top.dataset.key = key;
        const parts = [];
        if (picks.length) {
            parts.push(h('div', { class: 'pt-list-header', text: 'Favorites' }), pickRow(picks, t('Favorites')));
        }
        parts.push(h('div', { class: 'pt-char-count' }, [
            h('span', { class: 'pt-list-header', text: narrowed(list) ? 'Results' : 'All characters' }),
            narrowed(list) ? null : h('span', { class: 'pt-char-count-n', text: String(total) }),
        ]));
        top.replaceChildren(...parts);
    }
    if (list.firstElementChild !== top) list.prepend(top);
}

export function removeListTop() {
    document.getElementById('pt_char_top')?.remove();
    document.getElementById('pt_char_filters')?.remove();
}

// -- a card's menu: long press or right click

const LONG_PRESS_MS = 500;
let press = null;
let listening = null;

const cardOf = target => target?.closest?.(`${CHARACTER_LIST} > .character_select[data-chid]`);
const bulkOn = () => !!document.querySelector(CHARACTER_LIST)?.classList.contains(BULK_MODE_CLASS);

const onContextMenu = safe('character card menu', event => {
    const card = cardOf(event.target);
    if (!card || bulkOn()) return;
    event.preventDefault();
    deps.cardMenu(card.dataset.chid, card);
});

const onTouchStart = safe('character card menu', event => {
    const card = cardOf(event.target);
    if (!card || bulkOn() || event.touches.length !== 1) return;
    const { clientX: x, clientY: y } = event.touches[0];
    window.clearTimeout(press?.timer);
    press = {
        x, y, card, fired: false,
        timer: window.setTimeout(safe('character card menu', () => {
            if (!press) return;
            press.fired = true;
            navigator.vibrate?.(8);
            deps.cardMenu(card.dataset.chid, card);
        }), LONG_PRESS_MS),
    };
});

const onTouchMove = safe('character card menu', event => {
    if (!press) return;
    const touch = event.touches[0];
    if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10) {
        window.clearTimeout(press.timer);
        press = null;
    }
});

const onTouchEnd = safe('character card menu', event => {
    if (!press) return;
    window.clearTimeout(press.timer);
    // After the menu opened, the lifted finger is not a tap: no click on the card, and none on the sheet's
    // backdrop that is now under the finger (it would close the menu at once).
    if (press.fired && event.cancelable) event.preventDefault();
    press = null;
});

/** Listens on the list once; follows the list element if SillyTavern makes a new one. */
export function watchCardMenu() {
    const list = document.querySelector(CHARACTER_LIST);
    if (list === listening) return;
    unwatchCardMenu();
    if (!list) return;
    list.addEventListener('contextmenu', onContextMenu);
    list.addEventListener('touchstart', onTouchStart, { passive: true });
    list.addEventListener('touchmove', onTouchMove, { passive: true });
    list.addEventListener('touchend', onTouchEnd);
    list.addEventListener('touchcancel', onTouchEnd);
    listening = list;
}

export function unwatchCardMenu() {
    if (!listening) return;
    listening.removeEventListener('contextmenu', onContextMenu);
    listening.removeEventListener('touchstart', onTouchStart);
    listening.removeEventListener('touchmove', onTouchMove);
    listening.removeEventListener('touchend', onTouchEnd);
    listening.removeEventListener('touchcancel', onTouchEnd);
    window.clearTimeout(press?.timer);
    press = null;
    listening = null;
}

/** "Select several": SillyTavern's own bulk edit. */
export function startBulkSelect() {
    document.querySelector(BULK_EDIT_BUTTON)?.click();
}
