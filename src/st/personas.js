// The Personas page (DESIGN.md → Personas): SillyTavern's persona screen with two tabs (All personas, Edit name),
// picture cards with In use and the default's crown, the list's tools in one row with ⋯, and the current
// persona's picture beside its name. Styles in styles/st/personas.css. Nothing of SillyTavern's moves.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { listGroup, listRow } from '../ui/list.js';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, ui: Function, showSheet: Function, closeSheet: Function, MenuSheet: Function } | null} */
let deps = null;

export function setupPersonas(supplied) {
    deps = supplied;
}

const ui = (...args) => deps.ui(...args);
const showSheet = instance => deps.showSheet(instance);
const closeSheet = immediate => deps.closeSheet(immediate);
function MenuSheet(options) {
    return new deps.MenuSheet(options);
}

/** The observer that follows the list and the name. */
const persona = { observer: null };

/** The current persona's tools get a short label under their icon, like a character card's. */
const PERSONA_TOOLS = [
    ['#persona_rename_button', 'Rename'],
    ['#sync_name_button', 'Sync name'],
    ['#persona_lore_button', 'Lore'],
    ['#persona_set_image_button', 'Picture'],
    ['#persona_duplicate_button', 'Duplicate'],
    ['#persona_delete_button', 'Delete'],
];

export function syncPersonaTabs() {
    const block = document.getElementById('persona-management-block');
    let bar = document.getElementById('pt_persona_tabs');
    const want = deps.active() && deps.settings().touchSizing && block;
    // With the new character pages on, personas look like them: picture cards and a card with labeled tools.
    const look = !!(want && deps.settings().charPage);
    document.documentElement.classList.toggle('pt-personapage', look);
    for (const [selector, label] of PERSONA_TOOLS) {
        const button = document.querySelector(selector);
        const tag = button?.querySelector(':scope > .pt-btn-label');
        if (look && button && !tag) button.append(h('span', { class: 'pt-btn-label', text: label }));
        else if (!look) tag?.remove();
    }
    if (!look) document.querySelectorAll('#user_avatar_block :is(.pt-default-badge, .pt-in-use)').forEach(node => node.remove());
    syncPersonaTools(!!want);
    if (!want) {
        bar?.remove();
        document.querySelector('#persona_controls .pt-persona-face')?.remove();
        block?.classList.remove('pt-persona-split', 'pt-persona-edit');
        persona.observer?.disconnect();
        persona.observer = null;
        return;
    }
    if (!bar) {
        const tab = (mode, iconName, label) => h('button', {
            type: 'button',
            role: 'tab',
            class: 'pt-seg',
            'data-mode': mode,
            onclick: () => {
                block.classList.toggle('pt-persona-edit', mode === 'edit');
                updatePersonaTabs();
                block.closest('.drawer-content')?.scrollTo?.({ top: 0 });
            },
        }, [ui(iconName), h('span', { class: 'pt-seg-text', text: label })]);
        bar = h('div', { id: 'pt_persona_tabs', class: 'pt-segmented pt-persona-tabs', role: 'tablist' }, [
            tab('list', 'users', 'All personas'),
            tab('edit', 'pencil', 'Edit current'),
        ]);
        block.before(bar);
        block.classList.add('pt-persona-split');
        // The list re-renders when you pick someone, and the name changes with it.
        persona.observer = new MutationObserver(safe('personas', updatePersonaTabs));
        const name = document.getElementById('your_name');
        const list = document.getElementById('user_avatar_block');
        if (name) persona.observer.observe(name, { childList: true, characterData: true, subtree: true });
        if (list) persona.observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    updatePersonaTabs();
}

/**
 * The persona list's tools in one row (DESIGN.md → Personas): ⋯ holds Usage stats, Backup, Restore and Grid view
 * (SillyTavern's own buttons, pressed hidden), and the page controls show only when there is more than one page.
 */
function syncPersonaTools(want) {
    let more = document.getElementById('pt_persona_more');
    const grid = document.getElementById('persona_grid_toggle');
    if (!want || !grid) {
        more?.remove();
        document.getElementById('persona_pagination_container')?.classList.remove('pt-one-page');
        return;
    }
    if (!more) {
        more = h('button', { type: 'button', id: 'pt_persona_more', class: 'pt-icon-button pt-focus pt-press', 'aria-label': 'More actions', title: 'More actions', onclick: () => openPersonaTools(more) }, [ui('ellipsis', 'pt-icon-button-icon')]);
        grid.after(more);
    }
    markPersonaPages();
}

/** Page controls only when the personas do not fit on one page. */
function markPersonaPages() {
    const pages = document.getElementById('persona_pagination_container');
    if (!pages) return;
    const total = Object.keys(deps.context().powerUserSettings?.personas ?? {}).length;
    const perPage = Number(pages.querySelector('select')?.value) || Infinity;
    pages.classList.toggle('pt-one-page', total <= perPage);
}

function openPersonaTools(anchor) {
    const press = selector => () => {
        closeSheet(true);
        document.querySelector(selector)?.click();
    };
    const gridOn = !!document.querySelector('#user_avatar_block.gridView');
    showSheet(new MenuSheet({
        title: t('Personas'),
        anchor,
        fill: body => body.append(listGroup({ rows: [
            listRow({ title: 'Usage stats', subtitle: 'How much each persona has written', icon: 'chart', end: 'none', onClick: press('#persona-management-button .user_stats_button') }),
            listRow({ title: 'Backup', subtitle: 'Save every persona to a file', icon: 'file-export', end: 'none', onClick: press('#personas_backup') }),
            listRow({ title: 'Restore', subtitle: 'Bring personas back from a backup file', icon: 'file-import', end: 'none', onClick: press('#personas_restore') }),
            listRow({ title: gridOn ? 'List view' : 'Grid view', subtitle: 'How the personas are shown', icon: gridOn ? 'list' : 'grid', end: 'none', onClick: press('#persona_grid_toggle') }),
        ] })),
    }));
}

function updatePersonaTabs() {
    const block = document.getElementById('persona-management-block');
    const bar = document.getElementById('pt_persona_tabs');
    if (!block || !bar) return;
    markPersonaPages();
    const editing = block.classList.contains('pt-persona-edit');
    const name = document.getElementById('your_name')?.textContent?.trim();
    for (const button of bar.querySelectorAll('.pt-seg')) {
        const on = (button.dataset.mode === 'edit') === editing;
        button.classList.toggle('pt-seg-on', on);
        button.setAttribute('aria-selected', String(on));
        if (button.dataset.mode === 'edit') {
            const label = name && name !== '[Persona Name]' ? t('Edit {name}', { name }) : t('Edit current');
            const text = button.querySelector('.pt-seg-text');
            if (text.textContent !== label) text.textContent = label;
        }
    }
    // Picture cards: a crown on your default persona (SillyTavern only rings its picture in gold).
    if (document.documentElement.classList.contains('pt-personapage')) {
        for (const card of document.querySelectorAll('#user_avatar_block .avatar-container')) {
            // The persona in use says so.
            const inUse = card.querySelector(':scope > .pt-in-use');
            if (card.classList.contains('selected') && !inUse) card.append(h('span', { class: 'pt-in-use', text: 'In use' }));
            else if (!card.classList.contains('selected')) inUse?.remove();
            const badge = card.querySelector(':scope > .pt-default-badge');
            const isDefault = card.classList.contains('default_persona');
            if (isDefault && !badge) card.append(h('span', { class: 'pt-default-badge', title: t('Default persona'), 'aria-label': t('Default persona') }, [ui('crown')]));
            else if (!isDefault && badge) badge.remove();
        }
    }
    // The current persona's picture next to its name.
    const controls = document.getElementById('persona_controls');
    const src = document.querySelector('#user_avatar_block .avatar-container.selected img')?.getAttribute('src');
    if (controls) {
        let face = controls.querySelector('.pt-persona-face');
        if (!face) {
            face = h('span', { class: 'pt-persona-face', 'aria-hidden': 'true' }, [h('img', { alt: '' })]);
            controls.prepend(face);
        }
        const img = face.querySelector('img');
        face.hidden = !src;
        if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    }
}
