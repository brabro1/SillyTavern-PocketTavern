// Guided Generations (another extension; DESIGN.md → Message box → Extension buttons). It adds a row of icon
// buttons to the message box, two small menus above them, and popups of its own. When it is installed and its
// switch is on, Pocket Tavern folds the row into one Guide button beside Send; its popups become sheets (CSS in
// styles/compat/guided-generations.css) and Back closes them. Everything is keyed on its own markup, so
// without Guided Generations none of this does anything.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { MESSAGE_BOX, SEND_BUTTON, SEND_FORM, SEND_FORM_RIGHT } from '../st/selectors.js';

const SOURCE = 'guided generations';

/**
 * @typedef {object} GuidedDeps
 * @property {() => boolean} active
 * @property {() => object} settings Pocket Tavern's settings (chatStyle, ggButton, ggLast)
 * @property {() => void} saveSettings
 * @property {(name: string, className?: string) => Element} ui an icon
 * @property {(pattern: number | number[]) => void} buzz
 * @property {(instance: any) => void} showSheet
 * @property {(immediate?: boolean) => void} closeSheet
 * @property {new (options: object) => any} MenuSheet
 * @property {(icon: Element, label: string, note: string, onclick: () => void) => Element} actionRow
 * @property {(element: Element) => Element} faIcon
 * @property {(element: Element) => string} itemLabel
 * @property {(id: string) => void} openPage
 */
/** @type {GuidedDeps | null} */
let deps = null;

export function setupGuidedGenerations(supplied) {
    deps = supplied;
}

const ui = (...args) => deps.ui(...args);
const buzz = pattern => deps.buzz(pattern);
const showSheet = instance => deps.showSheet(instance);
const closeSheet = immediate => deps.closeSheet(immediate);
const actionRow = (...args) => deps.actionRow(...args);
const faIcon = element => deps.faIcon(element);
const itemLabel = element => deps.itemLabel(element);
const openPage = id => deps.openPage(id);
function MenuSheet(options) {
    return new deps.MenuSheet(options);
}

/*
 * Guided Generations (another extension) adds a row of icon buttons to the
 * message box and two small pop-up menus that open above them. When it is
 * installed, Pocket Tavern folds all of that into one Guide button beside Send.
 * The button opens a sheet: the instruction you typed, then every action with
 * a name and a line on what it does, and its menus as sheets of their own.
 * Its buttons stay in the page (hidden) and the sheet presses them, so its own
 * settings and logic decide what happens. Without Guided Generations, none of
 * this exists.
 */
const guided = { button: null, count: null, watch: null, frame: 0, held: false };

const GG_ACTIONS = [
    { id: 'gg_response_button', group: 'reply', icon: 'chat', label: 'Guided response', note: 'Writes the next reply the way your instruction says' },
    { id: 'gg_swipe_button', group: 'reply', icon: 'refresh', label: 'Guided swipe', note: 'A new version of the last reply that follows your instruction' },
    { id: 'gg_continue_button', group: 'reply', icon: 'arrow-right', label: 'Guided continue', note: 'Carries on the last reply, following your instruction' },
    { id: 'gg_impersonate_button', group: 'mine', icon: 'user', label: 'Write my message as "I"', note: 'Turns your instruction into your next message. Run it again to get your instruction back.' },
    { id: 'gg_impersonate_button_2nd', group: 'mine', icon: 'contact', label: 'Write my message as "you"', note: 'The same, written in the second person' },
    { id: 'gg_impersonate_button_3rd', group: 'mine', icon: 'users', label: 'Write my message as "they"', note: 'The same, written in the third person' },
];

/** Its tool buttons repeat items of its Tools menu, so the sheet lists them there once. */
const GG_MENU_COPIES = new Set(['gg_simple_send_button', 'gg_recover_input_button', 'gg_edit_intros_button', 'gg_corrections_button', 'gg_separated_thinking_button', 'gg_spellchecker_button', 'gg_clear_input_button', 'gg_undo_button', 'gg_revert_button']);

function ggRow() {
    return document.getElementById('gg-action-button-container');
}

export function ggPresent() {
    return !!ggRow();
}

export function syncGuided() {
    const root = document.documentElement;
    const right = document.querySelector(SEND_FORM_RIGHT);
    const watching = deps.active() && deps.settings().chatStyle;
    const on = watching && deps.settings().ggButton && ggPresent() && !!right;
    root.classList.toggle('pt-gg', on);
    // Its switch in Pocket Tavern's settings only shows when Guided Generations is installed.
    const switchRowLabel = document.getElementById('pt_ggbutton')?.closest('label');
    if (switchRowLabel) switchRowLabel.hidden = !ggPresent();
    watchGuided(watching);
    if (!on) {
        guided.button?.remove();
        guided.button = null;
        return;
    }
    if (!guided.button || !guided.button.isConnected) {
        guided.button?.remove();
        guided.count = h('span', { class: 'pt-gg-count', 'aria-hidden': 'true', hidden: true });
        guided.button = h('button', { type: 'button', class: 'pt-gg-btn' }, [ui('compass'), guided.count]);
        wireGuideButton(guided.button);
    }
    // Right next to Send: it is the other way to send.
    const send = document.querySelector(SEND_BUTTON);
    if (send?.parentElement === right) {
        if (guided.button.nextElementSibling !== send) right.insertBefore(guided.button, send);
    } else if (guided.button.parentElement !== right) {
        right.append(guided.button);
    }
    updateGuideCount();
}

/** Guided Generations builds its row after Pocket Tavern starts and rebuilds it when its settings change. */
function watchGuided(on) {
    const form = document.querySelector(SEND_FORM);
    if (!on || !form) {
        guided.watch?.disconnect();
        guided.watch = null;
        return;
    }
    if (guided.watch) return;
    guided.watch = new MutationObserver(safe(SOURCE, () => {
        if (guided.frame) return;
        guided.frame = requestAnimationFrame(safe(SOURCE, () => {
            guided.frame = 0;
            syncGuided();
        }));
    }));
    guided.watch.observe(form, { childList: true, subtree: true, characterData: true });
}

/** How many of its persistent guides are active, from the counter on its own button. */
function guideCount() {
    const number = parseInt((document.getElementById('pg_guide_counter_span')?.textContent ?? '').replace(/\D+/g, ''), 10);
    return Number.isFinite(number) ? number : 0;
}

function updateGuideCount() {
    if (!guided.button) return;
    const count = guideCount();
    const text = count ? String(count) : '';
    if (guided.count.textContent !== text) guided.count.textContent = text;
    guided.count.hidden = !count;
    const label = count ? t('Guided Generations, {count} guides active', { count }) : t('Guided Generations');
    if (guided.button.getAttribute('aria-label') !== label) {
        guided.button.setAttribute('aria-label', label);
        guided.button.title = label;
    }
}

/** A tap opens the sheet; holding runs the last action again. */
function wireGuideButton(button) {
    let timer = 0;
    const stop = () => {
        window.clearTimeout(timer);
        timer = 0;
    };
    button.addEventListener('pointerdown', safe(SOURCE, event => {
        if (event.button !== 0) return;
        guided.held = false;
        stop();
        timer = window.setTimeout(safe(SOURCE, () => {
            timer = 0;
            const last = lastGuidedAction();
            if (!last) return;
            guided.held = true;
            buzz([8, 40, 8]);
            runGuided(last.element, last.id);
        }), 500);
    }));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, safe(SOURCE, stop));
    // No text-selection or link menu on a long press.
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('click', safe(SOURCE, () => {
        if (guided.held) {
            guided.held = false;
            return;
        }
        buzz(6);
        openGuidedSheet();
    }));
}

function lastGuidedAction() {
    const id = deps.settings().ggLast;
    const action = GG_ACTIONS.find(item => item.id === id);
    const element = id ? document.getElementById(id) : null;
    return action && element && ggRow()?.contains(element) ? { id, element, label: action.label } : null;
}

/** Presses one of its buttons or menu items, after the sheet is gone. */
function runGuided(element, id) {
    if (id && deps.settings().ggLast !== id) {
        deps.settings().ggLast = id;
        deps.saveSettings();
    }
    closeSheet(true);
    // Its menu items are links to "#"; keep the page where it is.
    element.addEventListener('click', event => event.preventDefault(), { once: true });
    element.click();
}

function openGuidedSheet() {
    const row = ggRow();
    if (!row) return;
    showSheet(new MenuSheet({
        title: 'Guided Generations',
        subtitle: '',
        fill: body => {
            const typed = document.querySelector(MESSAGE_BOX)?.value.trim() ?? '';
            const preview = h('span', { class: 'pt-gg-instruction-text' });
            // Your own words, never translated.
            preview.textContent = typed || t('Type in the message box how the AI should steer, then pick an action. With nothing typed, each action works like the normal one.');
            body.append(h('button', {
                type: 'button',
                class: `pt-gg-instruction${typed ? '' : ' pt-gg-instruction-empty'}`,
                'aria-label': typed ? t('Your instruction. Tap to edit it.') : t('No instruction yet. Tap to type one.'),
                onclick: () => {
                    closeSheet(true);
                    document.querySelector(MESSAGE_BOX)?.focus();
                },
            }, [h('span', { class: 'pt-gg-instruction-label', text: typed ? 'Your instruction' : 'No instruction yet' }), preview]));

            const rowsFor = group => GG_ACTIONS
                .filter(action => action.group === group)
                .map(action => ({ action, element: document.getElementById(action.id) }))
                .filter(({ element }) => element && row.contains(element))
                .map(({ action, element }) => actionRow(ui(action.icon, 'pt-menu-row-icon'), t(action.label), t(action.note), () => runGuided(element, action.id)));
            const reply = rowsFor('reply');
            const mine = rowsFor('mine');
            if (reply.length) body.append(h('p', { class: 'pt-menu-heading', text: 'Steer the reply' }), h('div', { class: 'pt-menu-list' }, reply));
            if (mine.length) body.append(h('p', { class: 'pt-menu-heading', text: 'Your message' }), h('div', { class: 'pt-menu-list' }, mine));

            // Buttons it adds that Pocket Tavern has no name for yet.
            const known = new Set(GG_ACTIONS.map(action => action.id));
            const other = [...row.querySelectorAll('.gg-action-button')]
                .filter(button => !known.has(button.id) && !GG_MENU_COPIES.has(button.id))
                .map(button => actionRow(faIcon(wrapIcon(button)), button.title || button.id, '', () => runGuided(button, '')));
            if (other.length) body.append(h('p', { class: 'pt-menu-heading', text: 'More actions' }), h('div', { class: 'pt-menu-list' }, other));

            const count = guideCount();
            const more = [];
            if (document.getElementById('pg_tools_menu')) {
                more.push(actionRow(ui('book', 'pt-menu-row-icon'), t('Persistent guides'), count ? t('{count} active', { count }) : t('None active'), () => openGuidedMenu('pg_tools_menu', 'Persistent guides', 'Notes the AI keeps in mind for this chat')));
            }
            if (document.getElementById('gg_tools_menu')) {
                more.push(actionRow(ui('list', 'pt-menu-row-icon'), t('Tools'), t('Simple send, spellchecker, corrections and more'), () => openGuidedMenu('gg_tools_menu', 'Guided Generations tools', '')));
            }
            more.push(actionRow(ui('settings', 'pt-menu-row-icon'), t('Guided Generations settings'), t('Choose which actions show and how they work'), () => openGuidedSettings()));
            body.append(h('p', { class: 'pt-menu-heading', text: 'More' }), h('div', { class: 'pt-menu-list' }, more));

            const last = lastGuidedAction();
            body.append(h('p', {
                class: 'pt-menu-foot',
                text: last ? t('Hold the guide button to run {action} again.', { action: t(last.label) }) : t('After you use an action, hold the guide button to run it again.'),
            }));
        },
    }));
}

/** Font Awesome classes sit on the button itself; faIcon looks for them inside an element. */
function wrapIcon(button) {
    const holder = document.createElement('span');
    const copy = button.cloneNode(false);
    copy.removeAttribute('id');
    holder.append(copy);
    return holder;
}

/** One of its menus (Persistent guides, Tools) as a sheet: the same items, groups and descriptions. */
function openGuidedMenu(menuId, title, subtitle) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    showSheet(new MenuSheet({
        title,
        subtitle,
        fill: body => {
            let rows = [];
            const flush = () => {
                if (rows.length) body.append(h('div', { class: 'pt-menu-list' }, rows));
                rows = [];
            };
            for (const node of menu.children) {
                if (node.tagName === 'HR') {
                    flush();
                    continue;
                }
                if (node.tagName !== 'A' || !(node.textContent ?? '').trim()) continue;
                rows.push(actionRow(faIcon(node), itemLabel(node), node.title || '', () => runGuided(node, '')));
            }
            flush();
        },
    }));
}

function openGuidedSettings() {
    closeSheet(true);
    openPage('extensions-settings-button');
    setTimeout(safe(SOURCE, () => {
        const drawer = document.getElementById('gg_versionBadge')?.closest('.inline-drawer');
        if (!drawer) return;
        const content = drawer.querySelector('.inline-drawer-content');
        if (content && getComputedStyle(content).display === 'none') drawer.querySelector('.inline-drawer-toggle')?.click();
        drawer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }), 250);
}

// -- its popups (Edit Guides, Stat Tracker, Fun, Edit Intros, Corrections)

/** Guided Generations' own popups (Edit Guides, Stat Tracker, Fun, Edit Intros, Corrections), when it is installed. */
export function openGuidedPopups() {
    if (!deps?.active()) return [];
    return [...document.querySelectorAll('body > .gg-popup')].filter(popup => popup.style.display !== 'none' && getComputedStyle(popup).display !== 'none');
}

/** Closes one the way its own × does. */
export function closeGuidedPopup(popup) {
    const close = popup.querySelector('.gg-popup-close, .gg-close-button');
    if (close) close.click();
    else popup.style.display = 'none';
}

/** Guided Generations adds its popups to <body>: is this one of them? */
export function isGuidedPopup(node) {
    return !!node?.classList?.contains('gg-popup');
}

/** Its popups already on the page. */
export function guidedPopups() {
    return [...document.querySelectorAll('body > .gg-popup')];
}
