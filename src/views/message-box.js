// Pocket Tavern's parts of SillyTavern's message box (DESIGN.md → Message box): your persona as a chip at the start,
// the tabs arrow, `+` and the context ring at the end beside Send, the box's height kept for the chat (and, docked
// on desktop, the bar's surface), and Guided Generations' button. SillyTavern's own box and buttons stay in place.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { endInputHistoryBrowse } from '../compat/input-history.js';
import { syncGuided } from '../compat/guided-generations.js';
import { openContextSheet, renderMeter } from '../features/context-ring.js';
import { CHAT, SEND_FORM_RIGHT } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'message box';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, shell: () => any, buildPlusButton: Function, buzz: Function, currentPersona: Function, openPersonaChooser: Function, syncTabsButton: Function, ui: Function } | null} */
let deps = null;

export function setupMessageBox(supplied) {
    deps = supplied;
}

/**
 * The message box is one floating rounded box: the text on top, and a row of
 * tools along its bottom. Pocket Tavern adds two things to that row: your
 * persona (picture and name, tap to switch) and a ring that fills as the
 * context fills (tap it for what is in there).
 */
export const composer = { persona: null, ring: null, plus: null, tabs: null, personas: null, formObserver: null, dockBar: null };

/** SillyTavern's personas module, loaded once; it knows the current persona. */
export function loadPersonasModule() {
    composer.personas ??= import('/scripts/personas.js').catch(() => null);
    return composer.personas;
}

export function personaName(avatar) {
    return deps.context().powerUserSettings?.personas?.[avatar] || deps.context().name1 || '';
}

export function personaPicture(avatar) {
    return avatar ? `/thumbnail?type=persona&file=${encodeURIComponent(avatar)}` : 'img/user-default.png';
}

export async function updatePersonaButton() {
    const button = composer.persona;
    if (!button) return;
    const module = await loadPersonasModule();
    const avatar = module?.user_avatar || deps.currentPersona();
    const name = personaName(avatar);
    const img = button.querySelector('img');
    const src = personaPicture(avatar);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    // Set as plain text: a persona's name is never translated.
    button.querySelector('.pt-persona-name').textContent = name;
    button.setAttribute('aria-label', name ? t('You are {name}. Tap to switch persona.', { name }) : t('Switch persona'));
}

function buildContextRing() {
    const ring = h('button', {
        type: 'button',
        class: 'pt-ctx-ring pt-ctx-empty',
        onclick: event => {
            deps.buzz(6);
            openContextSheet(event.currentTarget);
        },
    }, [h('span', { class: 'pt-ctx-num', 'aria-hidden': 'true' })]);
    ring.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="pt-ctx-track" cx="18" cy="18" r="15"/><circle class="pt-ctx-fill" cx="18" cy="18" r="15" pathLength="100"/></svg>');
    return ring;
}

/**
 * The message box floats over the chat, so the chat scrolls behind it. Its
 * height (it grows as you type) is kept in --pt-form-h: the chat leaves that
 * much room at the bottom, and the jump button sits just above it.
 */
function watchFormHeight(on) {
    const sheld = document.getElementById('sheld');
    const form = document.getElementById('form_sheld');
    if (!on || !sheld || !form || !('ResizeObserver' in window)) {
        composer.formObserver?.disconnect();
        composer.formObserver = null;
        sheld?.style.removeProperty('--pt-form-h');
        composer.dockBar?.remove();
        composer.dockBar = null;
        return;
    }
    // Docked on desktop: the bar's surface along the bottom of the whole chat area. SillyTavern's chat column
    // clips anything reaching out of it, so the surface is a layer of its own behind the column, as tall as
    // the box (styles/legacy.css → Docked on desktop; only shown there).
    if (!composer.dockBar || !composer.dockBar.isConnected) {
        composer.dockBar?.remove();
        composer.dockBar = h('div', { id: 'pt_dock_bar', class: 'pt-dock-bar', 'aria-hidden': 'true', hidden: true });
        document.body.append(composer.dockBar);
    }
    if (composer.formObserver) return;
    let last = -1;
    composer.formObserver = new ResizeObserver(safe(SOURCE, () => {
        const height = Math.round(form.offsetHeight);
        if (height === last) return;
        const chat = document.querySelector(CHAT);
        // Stay at the newest message when the box grows or shrinks.
        const atBottom = chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
        last = height;
        // Written on the next frame, outside the size notification (Safari warned about a loop otherwise).
        requestAnimationFrame(safe(SOURCE, () => {
            sheld.style.setProperty('--pt-form-h', `${height}px`);
            if (composer.dockBar) {
                composer.dockBar.style.setProperty('height', `${height}px`);
                // No box (no chat open, or a page over it): no bar.
                composer.dockBar.hidden = !height;
            }
            if (atBottom) chat.scrollTo(0, chat.scrollHeight);
        }));
    }));
    composer.formObserver.observe(form);
}

export function syncComposer() {
    const left = document.getElementById('leftSendForm');
    const right = document.querySelector(SEND_FORM_RIGHT);
    const want = deps.active() && deps.settings().chatStyle && left && right;
    watchFormHeight(!!want);
    if (!want || !deps.settings().contextMeter) {
        composer.ring?.remove();
        composer.ring = null;
    }
    if (!want || !deps.settings().appShell || !deps.settings().hideTabsInChat) {
        composer.tabs?.remove();
        composer.tabs = null;
    }
    if (!want) {
        composer.persona?.remove();
        composer.persona = null;
        composer.plus?.remove();
        composer.plus = null;
        endInputHistoryBrowse();
        syncGuided();
        return;
    }
    if (!composer.persona || !composer.persona.isConnected) {
        composer.persona?.remove();
        composer.persona = h('button', {
            type: 'button',
            class: 'pt-persona-chip',
            title: 'Switch persona',
            onclick: () => {
                deps.buzz(6);
                deps.openPersonaChooser();
            },
        }, [h('img', { class: 'pt-persona-img', alt: '' }), h('span', { class: 'pt-persona-name' })]);
        left.prepend(composer.persona);
    }
    if (deps.settings().appShell && deps.settings().hideTabsInChat) {
        if (!composer.tabs || !composer.tabs.isConnected) {
            composer.tabs?.remove();
            composer.tabs = h('button', {
                type: 'button',
                class: 'pt-tabs-btn',
                'aria-controls': 'pt-tabbar',
                onclick: () => {
                    deps.buzz(6);
                    deps.shell()?.toggleTabs();
                },
            }, [deps.ui('chevron-up')]);
        }
        if (left.firstElementChild !== composer.tabs) left.prepend(composer.tabs);
        deps.syncTabsButton();
    }
    if (deps.settings().contextMeter && (!composer.ring || !composer.ring.isConnected)) {
        composer.ring?.remove();
        composer.ring = buildContextRing();
        right.prepend(composer.ring);
    }
    // + sits before the ring: persona, the field, +, the ring, Send (DESIGN.md → Message box).
    if (!composer.plus || !composer.plus.isConnected) composer.plus = deps.buildPlusButton();
    const plusBefore = composer.ring?.parentElement === right ? composer.ring : right.firstElementChild;
    if (composer.plus.nextElementSibling !== plusBefore || composer.plus.parentElement !== right) right.insertBefore(composer.plus, plusBefore);
    updatePersonaButton();
    renderMeter();
    syncGuided();
}
