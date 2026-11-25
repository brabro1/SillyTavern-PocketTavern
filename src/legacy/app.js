/**
 * Pocket Tavern for SillyTavern
 *
 * Turns SillyTavern on a phone into an app-style interface: a top app bar, a
 * bottom tab bar, full-screen pages that the Android back gesture closes, a
 * restyled chat, and touch-first controls everywhere.
 *
 * Everything is scoped behind classes on <html> (`pt-on` and feature
 * classes). Removing them, or disabling the extension, restores the stock
 * interface. Nothing is moved out of SillyTavern's own DOM: the app bar and tab
 * bar only click SillyTavern's existing drawer toggles.
 *
 * The lorebook pickers never replace SillyTavern's own <select> elements. They
 * hide them, then read from and write to them, dispatching a normal `change`
 * event, so SillyTavern applies selections exactly as it does today.
 */

// The prelude (storage keys, translations) has to finish before this file runs.
import '../core/prelude.js';
import { svgIcon, iconCss, iconUrl } from '../ui/icons.js';
import { THEMES, findTheme, themeCss, themeFromSillyTavern, ST_THEME_COLORS } from '../themes/themes.js';
import { t, setLocale, isRtl, currentLang } from '../core/i18n.js';
import { CHANGES, VERSION } from '../../changelog.js';
import { migrateSettings } from '../core/settings.js';
import { h } from '../core/dom.js';
import { startPopupWatch } from '../st/popup-watch.js';
import { applyLayout, isTypingField, IS_IOS, keyboardUp, resolveLayout, watchLayout } from '../shell/layout.js';
import { fitToViewport, followViewport, overlayHead, syncToasts, wireOverlay } from '../shell/overlay.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { closeOwnPage, currentOwnPage, definePage, isOwnPage, onPageChange, openOwnPage, pageSpec, refreshOwnPage, scrollOwnPageToTop } from '../shell/page.js';
import { AI_PAGES, aiPage } from '../views/ai.js';
import { showBackPill } from '../shell/native.js';
import { restartAll } from '../core/lifecycle.js';
import { SETTINGS_PAGES, settingsPage } from '../views/settings.js';

// This file sits two folders below Pocket Tavern's own folder (src/legacy/), which sits in
// /scripts/extensions/third-party/<folder>/.
const EXTENSION_ROOT = new URL('../../', import.meta.url);

const MODULE = 'mobileUI';
const MODE_KEY = 'pt_mode';
const LOG = '[Pocket Tavern]';

const DEFAULTS = Object.freeze({
    enabled: true,
    appShell: true,
    chatStyle: true,
    touchSizing: true,
    backGesture: true,
    lorebookPicker: true,
    longSelects: false,
    wandShortcut: true,
    theme: 'pocket',
    themeBackdrop: true,
    modernFont: true,
    customIcons: true,
    /** 'full' | 'light' | 'off' */
    motion: 'full',
    /** 'small' | 'normal' | 'large' | 'xl' */
    textSize: 'normal',
    sendEffect: true,
    haptics: true,
    autoReload: true,
    homeHideBox: false,
    /** SillyTavern's Chat Style before a Pocket Tavern theme put it on Flat ('' when untouched), and that theme's id. */
    stChatStyle: '',
    chatStyleFor: '',
    jumpButton: true,
    messageMenu: true,
    saveDrafts: true,
    keepAwake: true,
    imageViewer: true,
    niceToasts: true,
    longPress: true,
    serverWatch: true,
    fastChat: true,
    lastSeenVersion: '',
    recentLanguages: [],
    autoTranslate: false,
    charPage: true,
    charPreview: true,
    dragSwipe: true,
    foldLong: true,
    contextMeter: true,
    chatLook: 'cards',
    loreCards: true,
    sharpPictures: true,
    animatedPictures: true,
    recentTools: true,
    /** 'auto' (compact on small phones) | 'comfortable' | 'compact' */
    uiSize: 'auto',
    /** 'floating' | 'docked' */
    composerStyle: 'floating',
    /** 'auto' | 'phone' | 'desktop' (DESIGN.md → Layouts) */
    layout: 'auto',
    /** In a chat the bottom tabs tuck away; a button in the message box brings them back. */
    hideTabsInChat: true,
    desktopNoticeSeen: false,
    /** Guided Generations (another extension) as one button next to Send. Only matters when it is installed. */
    ggButton: true,
    /** The last Guided Generations action run from the sheet; holding the button runs it again. */
    ggLast: '',
});

const SIZES = { auto: 'Automatic', comfortable: 'Comfortable', compact: 'Compact' };
const SIZE_NOTES = {
    auto: 'Compact on computers and small phones, comfortable on the rest.',
    comfortable: 'Roomy cards and bars.',
    compact: 'Slimmer bars and tighter cards, so more of the chat fits.',
};
const LAYOUT_NAMES = { auto: 'Automatic', phone: 'Phone', desktop: 'Desktop' };
const LAYOUT_NOTES = {
    auto: 'Phones get the phone layout; computers and tablets held sideways get the desktop layout.',
    phone: 'Always the phone layout, on any screen.',
    desktop: 'The desktop layout whenever the window is at least 768 pixels wide.',
};

const COMPOSER_STYLES = { floating: 'Floating', docked: 'Docked' };
const COMPOSER_NOTES = {
    floating: 'The message box floats over the chat.',
    docked: 'The message box sits flat along the bottom edge, like a messaging app.',
};

const TEXT_SIZES = { small: 'Small', normal: 'Normal', large: 'Large', xl: 'Extra large' };

/** Features shown as switches in Settings → Features and in the settings panel. */
const EXTRAS = [
    { key: 'ggButton', id: 'pt_ggbutton', label: 'Guided Generations button', hint: 'Its row of buttons becomes one button next to Send, with every action named and explained. Off shows its own row again.', when: () => ggPresent() },
    { key: 'hideTabsInChat', id: 'pt_tucktabs', label: 'Hide tabs in a chat', hint: 'More room for the chat, and no tabs right under the message box. Tap the arrow in the message box to show them.', when: () => !isWide() },
    { key: 'messageMenu', id: 'pt_msgmenu', label: 'Message menu', hint: 'Tap ⋯ on a message for a full list of actions with names.' },
    { key: 'dragSwipe', id: 'pt_dragswipe', label: 'Drag to swipe', hint: 'Drag the last reply left for another version, right for the previous one.' },
    { key: 'foldLong', id: 'pt_foldlong', label: 'Fold long messages', hint: 'Very long older messages get a Show more button.' },
    { key: 'contextMeter', id: 'pt_meter', label: 'Context ring', hint: 'A ring in the message box shows how full the context is. Tap it for the details.' },
    { key: 'loreCards', id: 'pt_lorecards', label: 'Lorebook entry cards', hint: 'Entries as cards with keyword chips; an opened entry fills the page.' },
    { key: 'sharpPictures', id: 'pt_sharp', label: 'Sharp character pictures', hint: 'Shows the full-quality picture instead of the small thumbnail, sized for your screen.' },
    { key: 'animatedPictures', id: 'pt_gifs', label: 'Animated pictures', hint: 'Pick a GIF or animated WebP as a character picture and it moves everywhere.' },
    { key: 'charPage', id: 'pt_charpage', label: 'New character pages', hint: 'Big avatar, labeled tools and tabs on character cards and personas; names under favorites; an A–Z strip on the list.' },
    { key: 'charPreview', id: 'pt_charpreview', label: 'Character preview', hint: 'Choosing a character shows its sheet first: Chat, New chat, Edit and its recent chats. Off opens the chat at once.', when: () => settings.charPage },
    { key: 'recentTools', id: 'pt_recenttools', label: 'Chat list helpers', hint: 'Search and swipe in Recent chats; chat history grouped by date.' },
    { key: 'longPress', id: 'pt_longpress', label: 'Long-press for message menu', hint: 'Hold a message for its menu. Turn off if you prefer long-press to select text.' },
    { key: 'serverWatch', id: 'pt_server', label: 'Connection check', hint: 'Shows a banner when SillyTavern stops answering, for example when Termux was closed.' },
    { key: 'fastChat', id: 'pt_fastchat', label: 'Faster long chats', hint: 'Skips drawing messages far off screen, so long chats scroll smoothly.' },
    { key: 'jumpButton', id: 'pt_jump', label: 'Jump to latest', hint: 'A button that takes you back to the newest message.' },
    { key: 'saveDrafts', id: 'pt_drafts', label: 'Keep unsent messages', hint: 'What you type is kept for each chat, even if the browser reloads.' },
    { key: 'keepAwake', id: 'pt_awake', label: 'Keep screen on while replying', hint: 'The screen stays on until the reply is finished.' },
    { key: 'imageViewer', id: 'pt_viewer', label: 'Picture viewer', hint: 'Tap an avatar in the chat to see it full screen. Pinch or double-tap to zoom.' },
    { key: 'niceToasts', id: 'pt_toasts', label: 'Nicer notifications', hint: 'Calm cards with a small coloured icon; swipe one sideways to dismiss it.' },
    { key: 'sendEffect', id: 'pt_sendfx', label: 'Send animation', hint: 'The send button gives a short press when you send.' },
    { key: 'haptics', id: 'pt_haptics', label: 'Vibration', hint: 'A short buzz on send and tab taps (Android).', when: () => !isWide() && typeof navigator.vibrate === 'function' },
    { key: 'autoReload', id: 'pt_autoreload', label: 'Reload after updates', hint: 'After Pocket Tavern updates, the page reloads by itself once nothing is in progress.' },
];

/** The motion curve, the same as --pt-ease in style.css (DESIGN.md, motion). */
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

const MOTION_LABELS = {
    full: 'Smooth: all animations',
    light: 'Light: quick fades only (faster)',
    off: 'Off: no animations (fastest)',
};

/** Selects that get the lorebook picker. `kind` mirrors the underlying control. */
const LOREBOOK_TARGETS = [
    {
        selector: '#world_info',
        kind: 'multi',
        title: 'Active lorebooks',
        subtitle: 'Global: applies to every chat',
        emptyLabel: 'No lorebooks active',
        buttonLabel: 'Choose lorebooks',
        editable: true,
        badges: true,
    },
    {
        selector: '.character_world_info_selector',
        kind: 'single',
        title: 'Primary lorebook',
        subtitle: 'Linked to this character and exported with the card',
        noneLabel: 'None',
        context: 'character',
        clearable: true,
    },
    {
        selector: '.character_extra_world_info_selector',
        kind: 'multi',
        title: 'Additional lorebooks',
        subtitle: 'Linked to this character, not exported with the card',
        emptyLabel: 'No additional lorebooks',
        buttonLabel: 'Choose lorebooks',
        context: 'character',
    },
    {
        selector: '.chat_world_info_selector',
        kind: 'single',
        title: 'Chat lorebook',
        subtitle: 'Bound to this chat only',
        noneLabel: 'None',
        clearable: true,
    },
    {
        selector: '.persona_world_info_selector',
        kind: 'single',
        title: 'Persona lorebook',
        subtitle: 'Linked to your active persona',
        noneLabel: 'None',
        clearable: true,
    },
    {
        selector: '#world_editor_select',
        kind: 'single',
        title: 'Open lorebook',
        subtitle: 'Pick a lorebook to view and edit',
        noneLabel: 'Close editor',
        placeholder: 'Pick a lorebook to edit',
    },
];

/** SillyTavern's top-bar drawers, keyed by the id of their `.drawer` element. Icons come from icons.js. */
const PAGES = {
    'ai-config-button': { title: 'Presets', long: 'AI response settings', icon: 'sliders' },
    'sys-settings-button': { title: 'API', long: 'API connection', icon: 'plug' },
    'advanced-formatting-button': { title: 'Formatting', long: 'Prompt formatting', icon: 'type' },
    'WI-SP-button': { title: 'Lorebooks', long: 'Lorebooks and World Info', icon: 'book' },
    'user-settings-button': { title: 'SillyTavern', long: 'User settings', icon: 'settings' },
    'backgrounds-button': { title: 'Backgrounds', long: 'Chat backgrounds', icon: 'image' },
    'extensions-settings-button': { title: 'Extensions', long: 'Extensions and add-ons', icon: 'puzzle' },
    'persona-management-button': { title: 'Personas', long: 'Who you are in the chat', icon: 'smile' },
    'rightNavHolder': { title: 'Characters', long: 'Characters and groups', icon: 'users' },
};

const TABS = [
    { id: 'chat', label: 'Chats', icon: 'chats' },
    { id: 'rightNavHolder', label: 'Characters', icon: 'users' },
    { id: 'WI-SP-button', label: 'Lorebooks', icon: 'book' },
    { id: 'pt-ai', label: 'AI', icon: 'sparkles' },
    { id: 'pt-settings', label: 'Settings', icon: 'settings' },
];

/** The place a SillyTavern page belongs to: its tab stays lit, and Back from it returns to that place. */
function placeOf(pageId) {
    if (!pageId) return 'chat';
    if (isOwnPage(pageId) || TABS.some(tab => tab.id === pageId)) return pageId;
    if (AI_PAGES.includes(pageId)) return 'pt-ai';
    return 'pt-settings';
}

function isWide() {
    return document.documentElement.classList.contains('pt-desktop');
}

const LONG_SELECT_MIN_OPTIONS = 14;
/** Visible height (px) below which the sheet drops secondary chrome: landscape or keyboard open. */
const COMPACT_BELOW = 520;
/**
 * Wide screens (a computer, a tablet held sideways) get the desktop layout: tabs
 * as a rail on the left, pages as a panel beside the chat, sheets as dialogs.
 * A sideways phone is wide but short, so it keeps the phone layout.
 */
/** Phones narrower than this (most 360px Androids, foldable cover screens) get the compact size on Automatic. */
const SMALL_PHONE_BELOW = 380;
const LONG_SELECT_EXCLUDE = '.pt-native-hidden, .template_element select, #pt-sheet select, .select2-hidden-accessible, select[multiple]';

/** @type {Map<HTMLSelectElement, Picker>} */
const pickers = new Map();
let settings = null;
let active = false;
/** Stopped for this visit by src/core/lifecycle.js (after an error); SillyTavern's own screens show. */
let paused = false;
let sheet = null;
let scanTimer = 0;
let domObserver = null;

// ---------------------------------------------------------------- utilities

function ctx() {
    return globalThis.SillyTavern.getContext();
}

function $j() {
    return globalThis.jQuery;
}

const icon = (classes) => h('i', { class: `fa-solid ${classes}`, 'aria-hidden': 'true' });
/** Our own line icon (icons.js), or a Font Awesome class for drawers we do not know. */
const ui = (name, className = '') => (name.startsWith('fa-') ? icon(`${name} ${className}`) : svgIcon(name, className));

function normalizeText(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Builds a node list with every match of `query` wrapped in <mark> (never translated). */
function highlight(text, query) {
    const str = String(text ?? '');
    const q = normalizeText(query.trim());
    const norm = normalizeText(str);
    if (!q || norm.length !== str.length) return [document.createTextNode(str)];
    const nodes = [];
    let cursor = 0;
    let at = norm.indexOf(q, cursor);
    while (at !== -1) {
        if (at > cursor) nodes.push(document.createTextNode(str.slice(cursor, at)));
        nodes.push(h('mark', { raw: str.slice(at, at + q.length) }));
        cursor = at + q.length;
        at = norm.indexOf(q, cursor);
    }
    if (cursor < str.length) nodes.push(document.createTextNode(str.slice(cursor)));
    return nodes;
}

/**
 * Adds a listener to one of SillyTavern's elements only once, however often the
 * feature that needs it is switched off and on again. The handlers check whether
 * their feature is on, so a listener left behind while it is off does nothing.
 */
const wiredOnce = new WeakMap();

function wireOnce(element, type, handler) {
    if (!element) return;
    const types = wiredOnce.get(element) ?? new Set();
    if (types.has(type)) return;
    types.add(type);
    wiredOnce.set(element, types);
    element.addEventListener(type, handler);
}

function readMode() {
    try {
        const value = localStorage.getItem(MODE_KEY);
        // "always" was the old way to use it on a computer; automatic does that now.
        return value === 'phone' || value === 'never' ? value : 'auto';
    } catch {
        return 'auto';
    }
}

function writeMode(mode) {
    try {
        localStorage.setItem(MODE_KEY, mode);
    } catch (error) {
        console.warn(LOG, 'Could not store the activation mode', error);
    }
}

function loadSettings() {
    const { extensionSettings } = ctx();
    extensionSettings[MODULE] = Object.assign({}, DEFAULTS, migrateSettings(extensionSettings[MODULE]));
    settings = extensionSettings[MODULE];
}

function saveSettings() {
    ctx().saveSettingsDebounced();
}

// ------------------------------------------------------- phone detection

/** Best-effort phone check that survives Chrome's "Desktop site" mode. */
function detectPhone() {
    const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
    const sides = [screen.width, screen.height].filter(n => n > 0);
    const shortSide = sides.length ? Math.min(...sides) : Infinity;
    const uaPhone = /Android.+Mobile|iPhone|iPod/i.test(navigator.userAgent);
    return (coarse && shortSide <= 500) || uaPhone;
}

/**
 * Automatic means on everywhere: phones get the phone layout and wide screens
 * the desktop layout. "Phones only" keeps a computer on the original interface.
 */
function shouldBeActive() {
    if (paused || !settings.enabled) return false;
    const mode = readMode();
    if (mode === 'never') return false;
    if (mode === 'phone') return detectPhone();
    return true;
}

// ------------------------------------------------------------ picker model

/**
 * @typedef {{ index: number, value: string, text: string, selected: boolean, isNone: boolean }} Item
 */

class Picker {
    /**
     * @param {HTMLSelectElement} select
     * @param {typeof LOREBOOK_TARGETS[number]} config
     */
    constructor(select, config) {
        this.select = select;
        this.config = config;
        this.multi = config.kind === 'multi';
        this.isLong = config.selector === '*';
        this.root = null;
        this.optionObserver = null;
        this.onChange = () => this.render();
        this.build();
    }

    build() {
        const { select } = this;
        this.root = h('div', { class: `pt-picker ${this.multi ? 'pt-picker-multi' : 'pt-picker-single'}`, 'data-pt': '1' });
        const anchor = select.nextElementSibling?.classList.contains('select2') ? select.nextElementSibling : select;
        anchor.after(this.root);
        select.classList.add('pt-native-hidden');
        $j()(select).on('change.pt', this.onChange);
        this.optionObserver = new MutationObserver(() => this.render());
        this.optionObserver.observe(select, { childList: true, subtree: true, characterData: true });
        this.render();
    }

    destroy() {
        $j()(this.select).off('change.pt', this.onChange);
        this.optionObserver?.disconnect();
        this.root?.remove();
        this.select.classList.remove('pt-native-hidden');
        if (sheet?.picker === this) closeSheet();
    }

    /** @returns {Item[]} */
    items() {
        return Array.from(this.select.options).map((option, index) => {
            const isNone = option.value === '';
            return {
                index,
                value: option.value,
                text: this.cleanText(option, isNone),
                selected: option.selected,
                isNone,
            };
        }).filter(item => !(this.multi && item.isNone));
    }

    cleanText(option, isNone) {
        const raw = (option.textContent ?? '').trim();
        if (!isNone) return raw;
        return this.config.noneLabel ?? (raw.replace(/^[-–—\s]+|[-–—\s]+$/g, '') || 'None');
    }

    get title() {
        const scope = this.select.closest('.character_world');
        const name = scope?.querySelector('.character_name')?.textContent?.trim();
        const base = t(this.config.title);
        return name && this.config.context === 'character' ? `${base} · ${name}` : base;
    }

    selectedItems() {
        return this.items().filter(item => item.selected && !item.isNone);
    }

    realBookCount() {
        return this.items().filter(item => !item.isNone).length;
    }

    /** Applies a selection through the original control. */
    commit(index, selected) {
        const option = this.select.options[index];
        if (!option) return;
        if (this.multi) {
            option.selected = selected;
        } else {
            this.select.selectedIndex = index;
        }
        this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clearAll() {
        let changed = false;
        for (const option of this.select.options) {
            if (option.selected) {
                option.selected = false;
                changed = true;
            }
        }
        if (changed) this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    render() {
        if (!this.root) return;
        const root = this.root;
        root.replaceChildren();
        const items = this.items();
        const selected = items.filter(item => item.selected && !item.isNone);
        const total = items.filter(item => !item.isNone).length;

        if (this.multi) {
            root.append(this.renderChips(selected));
            const open = h('button', {
                type: 'button',
                class: 'pt-open menu_button',
                onclick: () => openSheet(this),
            }, [
                icon('fa-book-atlas'),
                h('span', { class: 'pt-open-label', text: this.config.buttonLabel ?? 'Choose' }),
                h('span', { class: 'pt-count', text: total ? `${selected.length}/${total}` : '0' }),
            ]);
            root.append(open);
        } else {
            const current = selected[0] ?? null;
            const hasValue = !!current;
            const button = h('button', {
                type: 'button',
                class: `pt-single text_pole ${hasValue ? '' : 'pt-single-empty'}`,
                'aria-haspopup': 'dialog',
                onclick: () => openSheet(this),
            }, [
                h('span', {
                    class: 'pt-single-label',
                    ...(hasValue ? { raw: current.text } : { text: this.config.placeholder ?? this.config.noneLabel ?? 'None' }),
                }),
                icon('fa-chevron-down pt-chevron'),
            ]);
            root.append(button);
            if (hasValue && this.config.clearable && items.some(item => item.isNone)) {
                root.append(h('button', {
                    type: 'button',
                    class: 'pt-clear menu_button',
                    'aria-label': t('Remove {name}', { name: current.text }),
                    title: 'Remove',
                    onclick: () => {
                        const none = items.find(item => item.isNone);
                        if (none) this.commit(none.index, true);
                    },
                }, [icon('fa-xmark')]));
            }
        }
        if (sheet?.picker === this) sheet.refresh();
    }

    renderChips(selected) {
        const wrap = h('div', { class: 'pt-chips' });
        if (!selected.length) {
            wrap.append(h('span', { class: 'pt-chips-empty', text: this.config.emptyLabel ?? 'Nothing selected' }));
            return wrap;
        }
        const visible = selected.slice(0, 8);
        for (const item of visible) {
            wrap.append(h('span', { class: 'pt-chip' }, [
                h('span', { class: 'pt-chip-text', raw: item.text }),
                h('button', {
                    type: 'button',
                    class: 'pt-chip-x',
                    'aria-label': t('Remove {name}', { name: item.text }),
                    onclick: () => this.commit(item.index, false),
                }, [icon('fa-xmark')]),
            ]));
        }
        if (selected.length > visible.length) {
            wrap.append(h('button', {
                type: 'button',
                class: 'pt-chip pt-chip-more',
                onclick: () => openSheet(this, { filter: 'selected' }),
                text: t('+{count} more', { count: selected.length - visible.length }),
            }));
        }
        return wrap;
    }
}

// ------------------------------------------------------------------ sheets

class Sheet {
    /**
     * @param {Picker} picker
     * @param {{filter?: 'all'|'selected'}} [options]
     */
    constructor(picker, options = {}) {
        this.picker = picker;
        this.query = '';
        this.filter = options.filter ?? 'all';
        this.closing = false;
        this.build();
    }

    build() {
        const { picker } = this;
        this.dialog = h('dialog', { id: 'pt-sheet', class: 'pt-sheet', 'aria-label': picker.title });
        this.panel = h('div', { class: 'pt-panel', tabindex: '-1' });
        if (picker.items().length > 6) this.panel.classList.add('pt-panel-fixed');

        Object.assign(this, overlayHead({ title: picker.title, subtitle: picker.config.subtitle, onClose: () => closeSheet() }));

        this.input = h('input', {
            type: 'search',
            class: 'pt-search-input text_pole',
            placeholder: picker.config.searchLabel ?? 'Search lorebooks',
            enterkeyhint: 'search',
            autocomplete: 'off',
            autocapitalize: 'off',
            spellcheck: 'false',
            'aria-label': picker.config.searchLabel ?? 'Search lorebooks',
        });
        this.input.addEventListener('input', () => {
            this.query = this.input.value;
            this.renderList(true);
        });
        this.input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                this.input.blur();
            }
        });
        this.clearSearch = h('button', {
            type: 'button',
            class: 'pt-search-clear',
            'aria-label': 'Clear search',
            onclick: () => {
                this.input.value = '';
                this.query = '';
                this.renderList(true);
                this.input.focus();
            },
        }, [icon('fa-xmark')]);
        this.searchBox = h('div', { class: 'pt-search' }, [icon('fa-magnifying-glass pt-search-icon'), this.input, this.clearSearch]);

        this.tools = h('div', { class: 'pt-tools' });
        this.list = h('ul', { class: 'pt-list', role: 'listbox', 'aria-multiselectable': picker.multi ? 'true' : 'false' });
        this.status = h('p', { class: 'pt-status', role: 'status', 'aria-live': 'polite' });
        this.hint = h('p', { class: 'pt-hint', text: picker.multi ? 'Changes apply as you tap.' : `Tap to choose${picker.config.noun ? '' : ' a lorebook'}.` });

        this.controls = h('div', { class: 'pt-controls' }, [this.searchBox, this.tools]);
        this.panel.append(this.head, this.controls, this.list, h('div', { class: 'pt-foot' }, [this.status, this.hint]));
        this.dialog.append(this.panel);

        wireOverlay({ dialog: this.dialog, panel: this.panel, dragAreas: [this.head, this.list], onClose: () => closeSheet() });
        this.list.addEventListener('click', event => this.onListClick(event));
        this.renderTools();
        this.renderList(true);
    }

    onListClick(event) {
        const row = event.target.closest('.pt-row');
        if (!row) return;
        const index = Number(row.dataset.index);
        const { picker } = this;
        if (event.target.closest('.pt-edit')) {
            this.openInEditor(index);
            return;
        }
        const option = picker.select.options[index];
        if (!option) return;
        if (picker.multi) {
            picker.commit(index, !option.selected);
        } else {
            const already = option.selected;
            row.classList.add('pt-row-flash');
            if (!already) picker.commit(index, true);
            else this.refresh();
            setTimeout(() => closeSheet(), 160);
        }
    }

    openInEditor(index) {
        const name = this.picker.select.options[index]?.textContent?.trim();
        const editor = document.querySelector('#world_editor_select');
        if (!editor || !name) return;
        const target = Array.from(editor.options).find(option => option.textContent.trim() === name);
        if (!target) return;
        closeSheet();
        editor.value = target.value;
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        // Opened from the wand menu the drawer is closed; show it so the book is visible.
        openPage('WI-SP-button');
        document.querySelector('#WorldInfo')?.scrollTo?.({ top: 0 });
    }

    renderTools(cachedItems = null) {
        const { picker } = this;
        this.tools.replaceChildren();
        if (!picker.multi) return;
        const real = (cachedItems ?? picker.items()).filter(item => !item.isNone);
        const selectedCount = real.filter(item => item.selected).length;
        const seg = (id, label, count) => h('button', {
            type: 'button',
            class: `pt-seg ${this.filter === id ? 'pt-seg-on' : ''}`,
            'aria-pressed': String(this.filter === id),
            onclick: () => {
                this.filter = id;
                this.renderTools();
                this.renderList(true);
            },
        }, [label, h('span', { class: 'pt-seg-count', raw: String(count) })]);
        this.tools.append(
            h('div', { class: 'pt-segmented', role: 'group' }, [
                seg('all', 'All', real.length),
                seg('selected', 'Selected', selectedCount),
            ]),
            h('button', {
                type: 'button',
                class: 'pt-clear-all menu_button',
                disabled: selectedCount === 0,
                onclick: () => {
                    picker.clearAll();
                },
            }, [icon('fa-eraser'), 'Clear all']),
        );
    }

    /** Re-reads the underlying control and updates rows in place. */
    refresh() {
        this.title.textContent = this.picker.title;
        const all = this.picker.items();
        this.renderTools(all);
        this.renderList(false, all);
    }

    badgesFor(item, badgeCtx) {
        if (!this.picker.config.badges || !badgeCtx) return [];
        const badges = [];
        if (badgeCtx.charBook && badgeCtx.charBook === item.text) badges.push('Character');
        if (badgeCtx.chatBook && badgeCtx.chatBook === item.text) badges.push('Chat');
        return badges;
    }

    renderList(resetScroll, cachedItems = null) {
        const { picker } = this;
        const previousScroll = this.list.scrollTop;
        const all = cachedItems ?? picker.items();
        const q = normalizeText(this.query.trim());
        let rows = all.filter(item => !q || normalizeText(item.text).includes(q));
        if (picker.multi && this.filter === 'selected') rows = rows.filter(item => item.selected);

        let badgeCtx = null;
        if (picker.config.badges) {
            try {
                const context = ctx();
                const character = context.characters?.[context.characterId];
                badgeCtx = {
                    chatBook: context.chatMetadata?.world_info ?? null,
                    charBook: character?.data?.extensions?.world ?? null,
                };
            } catch {
                // Badges are decorative; ignore context lookup failures.
            }
        }

        this.clearSearch.hidden = !this.query;
        this.list.replaceChildren();

        for (const item of rows) {
            const badges = this.badgesFor(item, badgeCtx);
            const mark = h('span', { class: 'pt-mark', 'aria-hidden': 'true' }, [icon(picker.multi ? 'fa-check' : 'fa-circle')]);
            const name = h('span', { class: `pt-name ${item.isNone ? 'pt-name-none' : ''}` }, item.isNone ? [document.createTextNode(t(item.text))] : highlight(item.text, this.query));
            const main = h('span', { class: 'pt-main' }, [
                name,
                badges.length ? h('span', { class: 'pt-badges' }, badges.map(text => h('span', { class: 'pt-badge', text }))) : null,
            ]);
            const rowButton = h('button', {
                type: 'button',
                class: 'pt-row-btn',
                role: 'option',
                'aria-selected': String(item.selected),
            }, [mark, main]);
            const li = h('li', {
                role: 'presentation',
                class: `pt-row ${item.selected ? 'pt-row-on' : ''} ${item.isNone ? 'pt-row-none' : ''}`,
                'data-index': String(item.index),
            }, [rowButton]);
            if (picker.config.editable && !item.isNone) {
                li.append(h('button', {
                    type: 'button',
                    class: 'pt-edit',
                    title: 'Open in lorebook editor',
                    'aria-label': t('Open {name} in the lorebook editor', { name: item.text }),
                }, [icon('fa-pen-to-square')]));
            }
            this.list.append(li);
        }

        const realItems = all.filter(item => !item.isNone);
        const selectedItems = realItems.filter(item => item.selected);
        const realRows = rows.filter(item => !item.isNone).length;
        if (!realRows) {
            const total = realItems.length;
            let message = 'Nothing matches your search.';
            if (!total) message = picker.config.noun ? 'No options available.' : 'No lorebooks found yet. Create one from the Lorebooks page.';
            else if (!q && this.filter === 'selected') message = 'Nothing selected yet.';
            this.list.append(h('li', { class: 'pt-empty', text: message }));
        }

        const total = realItems.length;
        const selectedCount = selectedItems.length;
        const chosen = selectedItems[0];
        this.status.textContent = picker.multi
            ? t('{count} of {total} selected', { count: selectedCount, total })
            : (chosen ? t('Selected: {name}', { name: chosen.text }) : t('Nothing selected'));

        if (resetScroll) this.list.scrollTop = 0;
        else this.list.scrollTop = previousScroll;
        const firstSelected = this.list.querySelector('.pt-row-on:not(.pt-row-none)');
        if (resetScroll && !q && firstSelected && !picker.multi) {
            requestAnimationFrame(() => firstSelected.scrollIntoView({ block: 'center' }));
        }
    }
}

/** A sheet with arbitrary content: the "More" menu. */
class MenuSheet {
    /**
     * @param {{ title: string, subtitle?: string, fill: (body: HTMLElement) => void }} options
     */
    constructor({ title, subtitle, fill }) {
        this.picker = null;
        this.closing = false;
        this.fill = fill;
        this.dialog = h('dialog', { id: 'pt-sheet', class: 'pt-sheet pt-menu-sheet', 'aria-label': title });
        this.panel = h('div', { class: 'pt-panel', tabindex: '-1' });
        Object.assign(this, overlayHead({ title, subtitle, onClose: () => closeSheet() }));
        this.body = h('div', { class: 'pt-menu-body' });
        this.panel.append(this.head, this.body);
        this.dialog.append(this.panel);
        wireOverlay({ dialog: this.dialog, panel: this.panel, dragAreas: [this.head, this.body], onClose: () => closeSheet() });
        this.refresh();
    }

    refresh() {
        const scroll = this.body.scrollTop;
        this.body.replaceChildren();
        this.fill(this.body);
        this.body.scrollTop = scroll;
    }
}

let stopViewportFollow = null;

function showSheet(instance) {
    const previousFocus = sheet ? sheet.returnFocus : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (sheet) closeSheet(true);
    // Clean up any fading-out sheet so there is never a duplicate #pt-sheet ID.
    for (const stale of document.querySelectorAll('dialog#pt-sheet')) {
        if (stale.open) stale.close();
        stale.remove();
    }
    sheet = instance;
    sheet.returnFocus = previousFocus;
    // The viewport follower runs all the time Pocket Tavern is on (see applyState);
    // here the new sheet only needs to know whether the screen is short.
    sheet.dialog.classList.toggle('pt-compact', (window.visualViewport?.height ?? window.innerHeight) < COMPACT_BELOW);
    // The language of its labels, so long words (a tile name on a narrow phone) break with a hyphen.
    sheet.dialog.lang = currentLang();
    fitToViewport(sheet.dialog, COMPACT_BELOW);
    document.body.append(sheet.dialog);
    sheet.dialog.showModal();
    syncToasts();
    // Opening focuses the first field; make sure that did not scroll the sheet.
    sheet.dialog.scrollTop = 0;
    requestAnimationFrame(() => sheet?.dialog.classList.add('pt-sheet-open'));
    sheet.panel.focus({ preventScroll: true });
    scheduleHistorySync();
}

function openSheet(picker, options = {}) {
    showSheet(new Sheet(picker, options));
}

function closeSheet(immediate = false) {
    const current = sheet;
    if (!current || current.closing) return;
    current.closing = true;
    sheet = null;
    const finish = () => {
        if (current.dialog.open) current.dialog.close();
        // Before removing it: the toast container may be inside and must go back to the page.
        syncToasts();
        current.dialog.remove();
        if (!immediate && !sheet && current.returnFocus?.isConnected && document.activeElement === document.body) {
            current.returnFocus.focus({ preventScroll: true });
        }
    };
    if (immediate) {
        finish();
    } else {
        // Taps during the fade-out must not hit rows of a sheet that is already closing.
        current.dialog.style.pointerEvents = 'none';
        // New toasts during the fade-out go to the page, not into a dialog about to be removed.
        current.dialog.setAttribute('closing', '');
        syncToasts();
        current.dialog.classList.remove('pt-sheet-open');
        setTimeout(finish, 230);
    }
    scheduleHistorySync();
}

// ------------------------------------------------------- back gesture

/**
 * Android's back gesture should close whatever is on top (a sheet, a popup, a
 * page) instead of leaving SillyTavern. We keep one history entry per open
 * layer and reconcile after every change, so pages that SillyTavern opens or
 * closes on its own stay in step too.
 */
const nav = { depth: 0, suppress: 0, timer: 0, guard: 0, observer: null };

/**
 * Older SillyTavern overlays that are plain <div>s rather than <dialog>s.
 * The prompt editor comes first: it sits on top of the Presets page.
 */
const OVERLAYS = [
    // Back leaves full screen first, then the editor (asking if there are unsaved changes).
    { selector: '#completion_prompt_manager_popup', close: () => (promptFull() ? setPromptFull(false) : leavePromptEditor()), open: () => promptEditorOpen() },
    { selector: '#shadow_select_chat_popup', close: '#select_chat_cross' },
    { selector: '#character_popup', close: '#character_cross' },
    // Character Library (another extension) in its Embedded Panel mode: a page of its own (issue #1).
    { selector: '#charlib-embedded-container', close: () => closeCharacterLibrary() },
];

/** Closes Character Library's embedded panel the way it closes itself (its button toggles it). */
function closeCharacterLibrary() {
    const panel = document.getElementById('charlib-embedded-container');
    if (!isShown(panel)) return false;
    const toggle = document.querySelector('#st-gallery-btn, #charlib-launcher-dropdown [data-action="library"]');
    if (toggle) toggle.click();
    else panel.style.display = 'none';
    return true;
}

function isShown(element) {
    return !!element && getComputedStyle(element).display !== 'none';
}

/** Guided Generations' own popups (Edit Guides, Stat Tracker, Fun, Edit Intros, Corrections), when it is installed. */
function openGuidedPopups() {
    if (!active) return [];
    return [...document.querySelectorAll('body > .gg-popup')].filter(popup => popup.style.display !== 'none' && isShown(popup));
}

/** Closes one the way its own × does. */
function closeGuidedPopup(popup) {
    const close = popup.querySelector('.gg-popup-close, .gg-close-button');
    if (close) close.click();
    else popup.style.display = 'none';
}

// ------------------------------------------------------- message editor

/** SillyTavern edits a message in place; on a phone that edit gets its own full page. */
function editingTextarea() {
    return document.querySelector('#chat #curEditTextarea');
}

function editorOpen() {
    return active && settings.chatStyle && !!editingTextarea();
}

function saveEditor() {
    editingTextarea()?.closest('.mes')?.querySelector('.mes_edit_done')?.click();
}

function syncEditorState() {
    const on = active && editorOpen();
    document.documentElement.classList.toggle('pt-editing', on);
    if (on) {
        const box = editingTextarea();
        // SillyTavern sizes the box to its text; the page gives it the whole height instead.
        box.style.removeProperty('height');
    }
    scheduleHistorySync();
}

// ------------------------------------------------------- prompt editor

const PROMPT_EDITOR = '#completion_prompt_manager_popup';

function promptEditor() {
    return document.querySelector(PROMPT_EDITOR);
}

/**
 * 'edit', 'inspect' or null. SillyTavern shows it with jQuery's slideDown and hides
 * it with slideUp, so its inline display is the truth. (The computed value lags:
 * drawers fade their `display` out with a transition. The class is not reliable
 * either: SillyTavern's tap-outside handler can drop it on its own.)
 */
function promptEditorMode() {
    const popup = promptEditor();
    const shown = popup?.style.display;
    if (!shown || shown === 'none') return null;
    return document.getElementById('completion_prompt_manager_popup_inspect')?.style.display === 'flex' ? 'inspect' : 'edit';
}

/** Open and not already sliding away (SillyTavern drops the class when it starts closing). */
function promptEditorOpen() {
    const popup = promptEditor();
    if (!promptEditorMode()) return false;
    return popup.classList.contains('openDrawer') || !$j()(popup).is(':animated');
}

/** Closes the prompt editor the way its own ✕ does, without saving. */
function closePromptEditor() {
    const mode = promptEditorMode();
    if (!mode) return false;
    const button = mode === 'inspect'
        ? document.getElementById('completion_prompt_manager_popup_close_button')
        : document.getElementById('completion_prompt_manager_popup_entry_form_close');
    if (button) button.click();
    else $j()(PROMPT_EDITOR).slideUp(150).removeClass('openDrawer');
    return true;
}

/** What the edit form held when it opened, to tell whether leaving would lose changes. */
const promptEdit = { open: false, snapshot: '' };

function promptFormState() {
    const form = document.querySelector('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form');
    if (!form) return '';
    return JSON.stringify(Array.from(form.querySelectorAll('input, select, textarea:not(#pt_prompt_name)'), field => {
        if (field.type === 'checkbox' || field.type === 'radio') return field.checked;
        if (field.multiple) return Array.from(field.selectedOptions, option => option.value).join('|');
        return field.value;
    }));
}

function promptEditorDirty() {
    return promptEdit.open && promptEditorMode() === 'edit' && promptFormState() !== promptEdit.snapshot;
}

/**
 * Leaves the prompt editor (Back, Escape, another tab). With unsaved changes it
 * asks first: save, keep editing or discard. `then` runs once the editor is left.
 */
function leavePromptEditor(then) {
    if (!promptEditorDirty()) {
        closePromptEditor();
        then?.();
        return;
    }
    const name = document.getElementById('completion_prompt_manager_popup_entry_form_name')?.value?.trim();
    showSheet(new MenuSheet({
        title: t('Leave without saving?'),
        subtitle: name || t('New prompt'),
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, [
            actionRow(ui('save', 'pt-menu-row-icon'), t('Save'), t('Save the prompt, then go on.'), () => {
                closeSheet(true);
                // SillyTavern's Save also closes the editor.
                document.getElementById('completion_prompt_manager_popup_entry_form_save')?.click();
                then?.();
            }),
            actionRow(ui('pencil', 'pt-menu-row-icon'), t('Keep editing'), t('Stay in the editor.'), () => closeSheet()),
            actionRow(ui('trash', 'pt-menu-row-icon'), t('Discard changes'), t('Close the editor without saving.'), () => {
                closeSheet(true);
                closePromptEditor();
                then?.();
            }, true),
        ])),
    }));
}

function promptFull() {
    return document.documentElement.classList.contains('pt-prompt-full');
}

/** Full screen: the prompt text gets the whole editor (and on a computer, the whole width). */
function setPromptFull(on) {
    if (promptFull() === on) return;
    document.documentElement.classList.toggle('pt-prompt-full', on);
    syncPromptFullButton();
    // A mouse goes straight to the text; on a phone the keyboard waits for a tap.
    if (on && matchMedia('(hover: hover) and (pointer: fine)').matches) {
        document.getElementById('completion_prompt_manager_popup_entry_form_prompt')?.focus({ preventScroll: true });
    }
}

function syncPromptFullButton() {
    const footer = document.querySelector('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form_footer');
    let button = document.getElementById('pt_prompt_full');
    if (!active || !settings.appShell || !settings.touchSizing || !footer) {
        button?.remove();
        document.documentElement.classList.remove('pt-prompt-full');
        return;
    }
    if (!button) {
        button = h('button', {
            type: 'button',
            id: 'pt_prompt_full',
            class: 'menu_button pt-prompt-full-btn',
            onclick: () => {
                buzz(6);
                setPromptFull(!promptFull());
            },
        });
        footer.insertBefore(button, document.getElementById('completion_prompt_manager_popup_entry_form_save'));
    }
    const on = promptFull();
    const label = t(on ? 'Exit full screen' : 'Full screen');
    if (button.dataset.on !== String(on)) {
        button.dataset.on = String(on);
        button.replaceChildren(ui(on ? 'minimize' : 'maximize'));
    }
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(on));
    button.title = label;
}

/** Runs when the editor opens or closes: remember what it opened with, and leave full screen when it closes. */
function syncPromptEditorSession() {
    const mode = active ? promptEditorMode() : null;
    if (mode === 'edit' && !promptEdit.open) {
        promptEdit.open = true;
        promptEdit.snapshot = promptFormState();
    } else if (mode !== 'edit' && promptEdit.open) {
        promptEdit.open = false;
        promptEdit.snapshot = '';
    }
    if (mode !== 'edit') document.documentElement.classList.remove('pt-prompt-full');
    syncPromptFullButton();
}

/**
 * The prompt name is a one-line <input>, so long names get cut off on a phone.
 * Show a wrapping box over it that writes straight back into SillyTavern's input.
 */
function syncPromptNameBox() {
    const input = document.getElementById('completion_prompt_manager_popup_entry_form_name');
    if (!input) return;
    let box = document.getElementById('pt_prompt_name');
    const want = active && settings.touchSizing;
    if (!want) {
        box?.remove();
        input.classList.remove('pt-native-hidden');
        return;
    }
    if (!box) {
        box = h('textarea', {
            id: 'pt_prompt_name',
            class: 'text_pole pt-prompt-name',
            rows: '1',
            'aria-label': 'Prompt name',
            enterkeyhint: 'done',
            autocomplete: 'off',
            spellcheck: 'false',
        });
        box.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                box.blur();
            }
        });
        box.addEventListener('input', () => {
            const clean = box.value.replace(/[\r\n]+/g, ' ');
            if (clean !== box.value) box.value = clean;
            input.value = clean;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            fitTextarea(box);
            shell?.update();
        });
        input.after(box);
        input.classList.add('pt-native-hidden');
    }
    if (document.activeElement !== box && box.value !== input.value) box.value = input.value;
    box.disabled = input.disabled;
    box.readOnly = input.readOnly;
    fitTextarea(box);
}

/** Grows a textarea with its text where the browser cannot do it in CSS. */
function fitTextarea(box) {
    if (CSS.supports?.('field-sizing', 'content') || !box.isConnected) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
}

function openOverlays() {
    return OVERLAYS.filter(overlay => (overlay.open ? overlay.open() : isShown(document.querySelector(overlay.selector))));
}

function openLayerCount() {
    let count = 0;
    if (currentPageId()) count += 1;
    count += openOverlays().length;
    count += openGuidedPopups().length;
    count += document.querySelectorAll('dialog.popup[open]').length;
    if (sheet) count += 1;
    if (viewer) count += 1;
    if (editorOpen()) count += 1;
    if (chatFinderOpen()) count += 1;
    if (openLoreEntry()) count += 1;
    if (pageSectionOpen()) count += 1;
    return count;
}

function watchOverlays(on) {
    nav.observer?.disconnect();
    nav.observer = null;
    if (!on) return;
    // Guided Generations adds its popups to <body> and shows or hides them with their style.
    const watchGuidedPopup = popup => nav.observer.observe(popup, { attributes: true, attributeFilter: ['style'] });
    nav.observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes ?? []) {
                if (node.classList?.contains('gg-popup')) watchGuidedPopup(node);
                // Layers another extension adds later (Character Library makes its panel on first use).
                if (node.nodeType === 1 && OVERLAYS.some(overlay => node.matches(overlay.selector))) nav.observer.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
            }
        }
        scheduleHistorySync();
    });
    for (const overlay of OVERLAYS) {
        const element = document.querySelector(overlay.selector);
        if (element) nav.observer.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    nav.observer.observe(document.body, { childList: true });
    document.querySelectorAll('body > .gg-popup').forEach(watchGuidedPopup);
}

function scheduleHistorySync(delay = 220) {
    window.clearTimeout(nav.timer);
    nav.timer = window.setTimeout(syncHistory, delay);
}

function syncHistory() {
    nav.timer = 0;
    if (!active || !settings.backGesture) return;
    if (nav.suppress) {
        scheduleHistorySync();
        return;
    }
    const want = openLayerCount();
    try {
        if (want > nav.depth) {
            while (nav.depth < want) {
                nav.depth += 1;
                history.pushState({ pt: nav.depth }, '');
            }
        } else if (want < nav.depth) {
            const steps = nav.depth - want;
            nav.depth = want;
            nav.suppress += 1;
            history.go(-steps);
            // If no popstate arrives, do not leave the guard armed for a real back press.
            window.clearTimeout(nav.guard);
            nav.guard = window.setTimeout(() => { nav.suppress = 0; }, 800);
        }
    } catch (error) {
        console.debug(LOG, 'History sync skipped', error);
    }
}

function closeTopLayer() {
    if (viewer) {
        closeViewer();
        return true;
    }
    if (sheet) {
        closeSheet();
        return true;
    }
    const popups = document.querySelectorAll('dialog.popup[open]');
    if (popups.length) {
        const top = popups[popups.length - 1];
        const ev = new Event('cancel', { cancelable: true });
        if (top.dispatchEvent(ev) && top.open) top.close();
        return true;
    }
    const guidedPopup = openGuidedPopups().pop();
    if (guidedPopup) {
        closeGuidedPopup(guidedPopup);
        return true;
    }
    if (editorOpen()) {
        // Back keeps your changes, like a notes app. Cancel is still a tap away.
        saveEditor();
        return true;
    }
    if (chatFinderOpen()) {
        closeChatFinder();
        return true;
    }
    if (openLoreEntry()) {
        closeLoreEntry();
        return true;
    }
    const overlays = openOverlays();
    if (overlays.length) {
        const { close } = overlays[0];
        if (typeof close === 'function') close();
        else $j()(close).trigger('click');
        return true;
    }
    if (closePageSection()) return true;
    if (currentPageId()) {
        backFromPage();
        return true;
    }
    return false;
}

function onPopState(event) {
    if (nav.suppress > 0) {
        nav.suppress -= 1;
        return;
    }
    if (!active || !settings.backGesture) return;
    if (nav.depth > 0) {
        nav.depth -= 1;
        closeTopLayer();
        scheduleHistorySync(400);
    } else if (event.state?.pt) {
        // A leftover entry from before a reload: nothing is open, so keep going back.
        history.back();
    }
}

function resetHistoryTracking() {
    window.clearTimeout(nav.timer);
    window.clearTimeout(nav.guard);
    nav.timer = 0;
    nav.guard = 0;
    nav.depth = 0;
    nav.suppress = 0;
}

// ------------------------------------------------------------ pages

function drawerById(id) {
    const drawer = document.getElementById(id);
    return drawer?.classList.contains('drawer') ? drawer : null;
}

/** The id of the top-bar drawer that is currently open, if any. */
function currentPageId() {
    const own = currentOwnPage();
    if (own) return own;
    const content = document.querySelector('#top-settings-holder > .drawer > .drawer-content.openDrawer');
    return content?.closest('.drawer')?.id || null;
}

function pageInfo(drawer) {
    const known = PAGES[drawer.id];
    if (known) return known;
    const iconEl = drawer.querySelector('.drawer-icon');
    const faClass = Array.from(iconEl?.classList ?? []).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-fw', 'fa-regular'].includes(name));
    const title = iconEl?.getAttribute('title') || drawer.getAttribute('title') || drawer.id.replace(/[-_]+/g, ' ');
    return { title, long: '', icon: faClass ?? 'fa-puzzle-piece' };
}

function openPage(id) {
    if (isOwnPage(id)) {
        closeDrawers();
        openOwnPage(id);
        return;
    }
    closeOwnPage(true);
    const drawer = drawerById(id);
    if (!drawer) return;
    if (drawer.querySelector(':scope > .drawer-content')?.classList.contains('openDrawer')) return;
    drawer.querySelector(':scope > .drawer-toggle')?.click();
}

function closePages() {
    closeOwnPage();
    closeDrawers();
}

function closeDrawers() {
    // The prompt editor lives outside the Presets drawer and would stay on screen.
    closePromptEditor();
    for (const content of document.querySelectorAll('#top-settings-holder > .drawer > .drawer-content.openDrawer')) {
        content.parentElement.querySelector(':scope > .drawer-toggle')?.click();
    }
}

/** Back from a page: from one of SillyTavern's pages to the place it belongs to (AI, Settings), else to the chat. */
function backFromPage() {
    const id = currentPageId();
    const place = id ? placeOf(id) : null;
    if (place && place !== id && isOwnPage(place)) openPage(place);
    else closePages();
}

/** Leaves the open chat for SillyTavern's start screen with the recent chats. */
function goHome() {
    closePages();
    // SillyTavern's own "Close chat" (it waits until a reply has finished).
    document.getElementById('option_close_chat')?.click();
}

/**
 * Shows SillyTavern's character list in the right panel. Skipped when the list is
 * already showing: asking again makes SillyTavern throw the list away and draw it anew.
 */
function showCharacterList() {
    const block = document.getElementById('rm_characters_block');
    if (block && block.style.display !== 'none' && getComputedStyle(block).display !== 'none' && block.querySelector('#rm_print_characters_block > *')) return;
    document.getElementById('rm_button_characters')?.click();
}

// ------------------------------------------------------------ app shell

let shell = null;

class Shell {
    constructor() {
        this.drawerObserver = null;
        this.destroyed = false;
        /** The page each place was last on (AI → Presets…), so coming back opens it again. */
        this.lastInPlace = {};
        this.timers = new Set();
        // Checked right away on resize, before the frame is drawn: the tab bar
        // steps aside and the chat starts its slide in the frame the window
        // changes, so there is one move, not two.
        this.onResize = () => {
            if (this.destroyed) return;
            this.checkKeyboard();
            // The rail's tabs change height with the window.
            if (isWide()) this.placeRailPill();
        };
        this.lastHeight = window.innerHeight;
        this.onFocusIn = event => {
            if (this.destroyed) return;
            if (isTypingField(event.target)) this.after(400, () => this.checkKeyboard());
            // Writing a message: the tabs go away again. With the on-screen
            // keyboard they go when it opens (one move, not two); with a
            // hardware keyboard there is no keyboard to wait for.
            if (event.target?.id === 'send_textarea' && this.tabsOut) {
                this.tabsOut = false;
                this.tuckPending = true;
                this.after(500, () => {
                    if (!this.tuckPending) return;
                    this.tuckPending = false;
                    this.syncTuck(true);
                });
            }
        };
        this.tabsOut = false;
        this.inChat = false;
        this.touchY = null;
        // Scrolling the chat with a finger or the wheel tucks the tabs away again
        // (not the chat moving by itself while a reply streams in).
        this.onChatTouchStart = event => {
            this.touchY = event.touches[0]?.clientY ?? null;
        };
        this.onChatTouchMove = event => {
            if (this.touchY === null || !this.tabsOut) return;
            if (Math.abs((event.touches[0]?.clientY ?? this.touchY) - this.touchY) > 24) this.tuckAgain();
        };
        this.onChatWheel = () => this.tuckAgain();
        this.onFocusOut = () => this.after(0, () => this.checkKeyboard());
        this.build();
    }

    after(ms, fn) {
        const id = window.setTimeout(() => {
            this.timers.delete(id);
            if (!this.destroyed) fn();
        }, ms);
        this.timers.add(id);
        return id;
    }

    build() {
        // ---- top app bar
        this.back = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-back',
            'aria-label': 'Back',
            // Step back one level: prompt full-screen / dirty check first, then settings section, then page.
            onclick: () => {
                if (promptEditorOpen()) {
                    if (promptFull()) setPromptFull(false);
                    else leavePromptEditor();
                    return;
                }
                if (!closePageSection()) backFromPage();
            },
        }, [ui('arrow-left')]);
        this.avatar = h('span', { class: 'pt-ab-avatar', 'aria-hidden': 'true' });
        this.titleEl = h('span', { class: 'pt-ab-title' });
        this.subEl = h('span', { class: 'pt-ab-sub' });
        this.who = h('button', { type: 'button', class: 'pt-ab-who', onclick: () => this.onWhoClick() }, [
            this.avatar,
            h('span', { class: 'pt-ab-text' }, [this.titleEl, this.subEl]),
        ]);
        this.translateBadge = h('span', { class: 'pt-ab-badge', 'aria-hidden': 'true' });
        this.translateBtn = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-translate',
            'aria-label': 'Translate chat',
            title: 'Tap to translate, hold to pick the language',
        }, [ui('languages'), this.translateBadge]);
        // Tap/click: translate the chat (or back to original). Hold or Shift+Enter / right-click: pick language.
        this.translateHold = 0;
        let translateHeld = 0;
        this.translateBtn.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            window.clearTimeout(this.translateHold);
            this.translateHold = this.after(450, () => {
                translateHeld = Date.now();
                buzz(15);
                openTranslateSheet();
            });
        });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) this.translateBtn.addEventListener(type, () => window.clearTimeout(this.translateHold));
        this.translateBtn.addEventListener('contextmenu', event => {
            event.preventDefault();
            if (isWide()) openTranslateSheet();
        });
        this.translateBtn.addEventListener('keydown', event => {
            if ((event.key === 'Enter' && event.shiftKey) || event.key === 'ArrowDown' || event.key === 'ContextMenu') {
                event.preventDefault();
                openTranslateSheet();
            }
        });
        this.translateBtn.addEventListener('click', () => {
            if (Date.now() - translateHeld < 700) return;
            buzz(6);
            quickTranslate();
        });
        this.actions = h('div', { class: 'pt-ab-actions' }, [
            this.translateBtn,
            h('button', {
                type: 'button',
                class: 'pt-ab-btn pt-ab-chats',
                'aria-label': 'Chat history',
                title: 'Chat history',
                onclick: () => document.getElementById('option_select_chat')?.click(),
            }, [ui('history')]),
            h('button', {
                type: 'button',
                class: 'pt-ab-btn pt-ab-new',
                'aria-label': 'Start a new chat',
                title: 'New chat',
                onclick: () => document.getElementById('option_start_new_chat')?.click(),
            }, [ui('chat-plus')]),
        ]);
        this.quick = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-quick',
            'aria-label': t('Quick switch'),
            title: t('Quick switch'),
            onclick: () => {
                buzz(6);
                openQuickSwitch();
            },
        }, [ui('zap')]);
        this.search = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-search',
            'aria-label': t('Find a setting'),
            title: t('Find a setting'),
            onclick: () => (currentPageId() ? openSettingSearch() : openGlobalSearch()),
        }, [ui('search')]);
        this.home = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-home',
            'aria-label': 'Recent chats',
            title: 'Recent chats',
            onclick: () => goHome(),
        }, [ui('home')]);
        this.appbar = h('header', { id: 'pt-appbar', class: 'pt-appbar', 'data-pt': '1' }, [this.back, this.home, this.who, this.search, this.quick, this.actions]);

        // ---- bottom tab bar
        this.tabs = new Map();
        const tabButtons = TABS.map(tab => {
            const button = h('button', {
                type: 'button',
                class: 'pt-tab',
                'data-tab': tab.id,
                'aria-label': tab.label,
                onclick: () => this.onTab(tab.id),
            }, [
                h('span', { class: 'pt-tab-icon' }, [ui(tab.icon)]),
                h('span', { class: 'pt-tab-label', text: tab.label }),
            ]);
            this.tabs.set(tab.id, button);
            return button;
        });
        // One pill slides between tabs instead of each tab fading its own background.
        this.indicator = h('span', { class: 'pt-tab-indicator', 'aria-hidden': 'true' });
        this.tabbar = h('nav', { id: 'pt-tabbar', class: 'pt-tabbar', 'aria-label': 'Main', 'data-pt': '1' }, [
            this.indicator, ...tabButtons,
        ]);

        for (const el of [this.appbar, this.tabbar]) shieldFromDrawerAutoClose(el);

        document.body.append(this.appbar, this.tabbar);

        // The Characters page switches between list, editor and group views without events.
        // On a phone, picking someone from the list lands in their chat, like a messaging app.
        // On a computer the chat is already beside the page, so the page stays and shows their card.
        this.jumpAt = 0;
        this.onPanelClick = event => {
            const entry = event.target.closest?.('#rm_print_characters_block .character_select, #rm_print_characters_block .group_select');
            const bulk = document.querySelector('#rm_print_characters_block.group_overlay_mode_select');
            if (entry && !bulk && !isWide() && !event.target.closest('.ch_fav_icon, .tag, .bulk_select_checkbox')) {
                this.jumpAt = Date.now();
                // Tapping the character or group you are already chatting with does not change chats.
                const context = ctx();
                const sameChar = entry.dataset.chid !== undefined && context.characterId !== undefined && String(entry.dataset.chid) === String(context.characterId);
                const sameGroup = entry.dataset.grid !== undefined && context.groupId !== undefined && String(entry.dataset.grid) === String(context.groupId);
                if (sameChar || sameGroup) this.after(200, closePages);
            }
            this.after(80, () => this.update());
        };
        document.getElementById('right-nav-panel')?.addEventListener('click', this.onPanelClick);

        // Follow SillyTavern opening and closing its drawers, whoever triggers it.
        this.drawerObserver = new MutationObserver(records => {
            // One page at a time: a drawer SillyTavern (or anyone) just opened replaces Pocket Tavern's own page.
            // (A drawer that is still closing keeps its open class for a moment; that must not count.)
            const opened = records.some(record => record.target.classList.contains('openDrawer') && !String(record.oldValue ?? '').split(/\s+/).includes('openDrawer'));
            if (opened && currentOwnPage()) closeOwnPage(true);
            this.update();
            scheduleHistorySync();
        });
        for (const content of document.querySelectorAll('#top-settings-holder > .drawer > .drawer-content')) {
            this.drawerObserver.observe(content, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        }
        window.addEventListener('resize', this.onResize);
        document.addEventListener('focusin', this.onFocusIn);
        document.addEventListener('focusout', this.onFocusOut);
        const chat = document.getElementById('chat');
        chat?.addEventListener('touchstart', this.onChatTouchStart, { passive: true });
        chat?.addEventListener('touchmove', this.onChatTouchMove, { passive: true });
        chat?.addEventListener('wheel', this.onChatWheel, { passive: true });
        this.checkKeyboard();
        this.update();
    }

    /**
     * In a chat the tab bar tucks away: it sat right under the message box and
     * caught taps meant for it. The arrow in the message box brings it back.
     */
    syncTuck(animate = false) {
        const root = document.documentElement;
        const can = this.inChat && tabsTuckable();
        if (!can) this.tabsOut = false;
        root.classList.toggle('pt-tabs-tuckable', can);
        this.setTucked(can && !this.tabsOut, animate);
        syncTabsButton();
    }

    setTucked(on, animate) {
        const root = document.documentElement;
        if (root.classList.contains('pt-tabs-tucked') === on) return;
        const form = document.getElementById('form_sheld');
        const chat = document.getElementById('chat');
        const atBottom = !!chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
        const glide = animate && motionAllowed() && form && !root.classList.contains('pt-keyboard');
        const before = glide ? form.getBoundingClientRect().top : 0;
        root.classList.toggle('pt-tabs-tucked', on);
        if (atBottom) chat.scrollTop = chat.scrollHeight;
        if (!glide) return;
        // Coming back it slides up from the bottom edge (going away, CSS slides it down).
        if (!on) this.tabbar.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 220, easing: EASE });
        // The message box (and the newest message above it) glide to their new place with the tabs.
        const shift = form.getBoundingClientRect().top - before;
        if (Math.abs(shift) < 4) return;
        const frames = [{ transform: `translate3d(0, ${-shift}px, 0)` }, { transform: 'none' }];
        const timing = { duration: 220, easing: EASE };
        form.animate(frames, timing);
        if (atBottom) chat.animate(frames, timing);
    }

    /** The arrow in the message box: show the tabs, or put them away again. */
    toggleTabs() {
        this.tabsOut = document.documentElement.classList.contains('pt-tabs-tucked');
        this.syncTuck(true);
    }

    tuckAgain() {
        if (!this.tabsOut) return;
        this.tabsOut = false;
        this.syncTuck(true);
    }

    destroy() {
        this.destroyed = true;
        window.clearTimeout(this.settleTimer);
        window.clearTimeout(this.translateHold);
        for (const id of this.timers) window.clearTimeout(id);
        this.timers.clear();
        document.getElementById('right-nav-panel')?.removeEventListener('click', this.onPanelClick);
        this.drawerObserver?.disconnect();
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('focusin', this.onFocusIn);
        document.removeEventListener('focusout', this.onFocusOut);
        const chat = document.getElementById('chat');
        chat?.removeEventListener('touchstart', this.onChatTouchStart);
        chat?.removeEventListener('touchmove', this.onChatTouchMove);
        chat?.removeEventListener('wheel', this.onChatWheel);
        this.tuckPending = false;
        this.endGlide();
        closeOwnPage(true);
        this.appbar.remove();
        this.tabbar.remove();
        const root = document.documentElement;
        root.classList.remove('pt-page-open', 'pt-keyboard', 'pt-prompt-editor', 'pt-prompt-full', 'pt-tabs-tucked', 'pt-tabs-tuckable');
        syncTabsButton();
        delete root.dataset.ptPage;
    }

    /**
     * The on-screen keyboard opened or closed (Android shrinks the window for it).
     * The tab bar steps aside, and the chat and the message box slide together,
     * as one piece, to their new place, so nothing jumps and nothing gaps.
     */
    checkKeyboard() {
        const root = document.documentElement;
        if (root.classList.contains('pt-desktop')) {
            this.endGlide();
            root.classList.remove('pt-keyboard');
            this.lastHeight = window.innerHeight;
            return;
        }
        const height = window.innerHeight;
        const keyboard = keyboardUp();
        const was = root.classList.contains('pt-keyboard');
        const before = this.lastHeight;
        this.lastHeight = height;
        if (height === before && keyboard === was) return;
        const sheld = document.getElementById('sheld');
        const chat = document.getElementById('chat');
        this.endGlide();
        // Where the chat ended on the screen before: the window already has its
        // new height here, so take the change back out.
        const oldBottom = sheld ? sheld.getBoundingClientRect().bottom - (height - before) : 0;
        root.classList.toggle('pt-keyboard', keyboard);
        // Tabs that were out when you started typing go away with the keyboard, in the same frame.
        if (keyboard && this.tuckPending) {
            this.tuckPending = false;
            this.syncTuck();
        }
        if (!sheld || !chat) return;
        const shift = Math.round(sheld.getBoundingClientRect().bottom - oldBottom);
        // Reading the newest message: stay there. (Further up, SillyTavern itself
        // keeps the line at the bottom edge in place when the chat changes height.)
        // (Known while the jump-to-newest button watches the chat; otherwise assume so, as before.)
        const atBottom = extras.jump ? extras.atBottom !== false : true;
        const keepBottom = () => {
            if (atBottom) chat.scrollTop = chat.scrollHeight;
        };
        keepBottom();
        const glide = Math.abs(shift) >= 8 && motionAllowed() && !IS_IOS
            && !root.classList.contains('pt-editing') && !currentPageId() && !sheet;
        if (!glide) return;
        const timing = { duration: 240, easing: EASE };
        if (shift < 0) {
            // Opening: the chat keeps its old height while it slides up (the top
            // goes under the top bar), then takes its new height when it lands.
            const tall = `${sheld.offsetHeight - shift}px`;
            sheld.style.setProperty('height', tall, 'important');
            sheld.style.setProperty('max-height', tall, 'important');
            keepBottom();
            this.glide = sheld.animate([{ transform: 'none' }, { transform: `translate3d(0, ${shift}px, 0)` }], timing);
            this.glideLand = keepBottom;
        } else {
            // Closing: the chat already has its new height; it starts where it
            // was and slides down, showing more of the chat above.
            this.glide = sheld.animate([{ transform: `translate3d(0, ${-shift}px, 0)` }, { transform: 'none' }], timing);
            this.glideLand = null;
        }
        this.glide.onfinish = () => this.endGlide();
        this.glide.oncancel = () => this.endGlide();
    }

    /** Ends a keyboard slide: the chat back to its normal size, in place. */
    endGlide() {
        if (!this.glide) return;
        const sheld = document.getElementById('sheld');
        this.glide.cancel();
        this.glide = null;
        sheld?.style.removeProperty('height');
        sheld?.style.removeProperty('max-height');
        this.glideLand?.();
        this.glideLand = null;
    }

    onTab(id) {
        buzz(6);
        // The prompt editor sits over the Presets page and would stay over the next one.
        if (promptEditorOpen()) {
            if (sheet) closeSheet(true);
            leavePromptEditor(() => this.goTab(id));
            return;
        }
        this.goTab(id);
    }

    goTab(id) {
        if (sheet) closeSheet(true);
        // Character Library's panel covers the chat and pages: any tab leaves it.
        if (closeCharacterLibrary() && id === 'chat') return;
        if (id === 'chat') {
            if (!currentPageId() && this.tabsOut) this.tuckAgain();
            else closePages();
            return;
        }
        const open = currentPageId();
        // The place you are on (or one of its pages): on desktop that hides the panel, so the chat
        // gets the room; on a phone it goes back to the place's root, or to its top.
        if (open && placeOf(open) === id) {
            if (isWide()) {
                closePages();
                return;
            }
            if (isOwnPage(id)) {
                if (open === id) scrollOwnPageToTop();
                else openPage(id);
                return;
            }
        }
        if (isOwnPage(id)) {
            // Each place keeps its page: coming back opens the page you left it on.
            const last = this.lastInPlace[id];
            openPage(last && drawerById(last) ? last : id);
            return;
        }
        if (open === id) {
            // Tapping the current tab goes "home" within it.
            if (id === 'rightNavHolder') showCharacterList();
            else if (closePageSection()) return;
            else document.querySelector(`#${id} > .drawer-content`)?.scrollTo?.({ top: 0, behavior: 'smooth' });
            return;
        }
        // Switch to the list first, so the page slides in already showing it
        // instead of showing the open character's card and then changing.
        if (id === 'rightNavHolder') showCharacterList();
        openPage(id);
    }

    /**
     * On the rail the pill is placed on the active tab's icon: the rail's tabs are
     * not all the same height, and on a short window the rail scrolls.
     */
    placeRailPill() {
        const button = this.tabs.get(this.railTab);
        const iconBox = button?.querySelector('.pt-tab-icon');
        if (!iconBox || !button.offsetParent) return;
        this.tabbar.style.setProperty('--pt-tab-y', `${button.offsetTop + iconBox.offsetTop}px`);
    }

    setSearchLabel(label) {
        if (this.search.title === label) return;
        this.search.title = label;
        this.search.setAttribute('aria-label', label);
    }

    /** Called when SillyTavern switches chats. */
    onChatChanged() {
        if (this.jumpAt && Date.now() - this.jumpAt < 4000 && currentPageId() === 'rightNavHolder') closePages();
        this.jumpAt = 0;
        this.tabsOut = false;
        this.update();
    }

    onWhoClick() {
        if (currentPageId()) return;
        const context = ctx();
        if (context.groupId || context.characterId !== undefined) openPage('rightNavHolder');
        else {
            showCharacterList();
            openPage('rightNavHolder');
        }
    }

    update() {
        checkCardPeek();
        const pageId = currentPageId();
        // When SillyTavern swaps one drawer for another, none is open for a moment.
        // Wait that out instead of flashing the chat header in between.
        if (!pageId && this.lastPage) {
            window.clearTimeout(this.settleTimer);
            this.settleTimer = window.setTimeout(() => {
                this.lastPage = currentPageId();
                this.render(this.lastPage);
            }, 200);
            return;
        }
        window.clearTimeout(this.settleTimer);
        this.lastPage = pageId;
        this.render(pageId);
    }

    render(pageId) {
        const before = this.titleEl.textContent;
        this.renderContent(pageId);
        // A short slide when the title changes, so moving between pages feels connected.
        if (before && before !== this.titleEl.textContent) {
            // Two classes with the same animation: switching restarts it without forcing a layout.
            this.swapFlip = !this.swapFlip;
            this.who.classList.toggle('pt-ab-swap', this.swapFlip);
            this.who.classList.toggle('pt-ab-swap-b', !this.swapFlip);
        }
    }

    renderContent(pageId) {
        const root = document.documentElement;
        // Settings and Formatting open on their list of sections again next time.
        for (const nav of PAGE_SECTIONS) if (nav.pageId !== pageId) nav.reset();
        root.classList.toggle('pt-page-open', !!pageId);
        if (pageId) root.dataset.ptPage = pageId;
        else delete root.dataset.ptPage;

        const wide = isWide();
        const tabId = placeOf(pageId);
        if (pageId) this.lastInPlace[tabId] = pageId;
        // A place's root has its title only; a page pushed in a place gets ‹ (DESIGN.md → Headers).
        this.appbar.classList.toggle('pt-ab-root', !!pageId && tabId === pageId);
        this.tabbar.style.setProperty('--pt-tab-index', String(TABS.findIndex(tab => tab.id === tabId)));
        for (const [id, button] of this.tabs) {
            const on = id === tabId;
            button.classList.toggle('pt-tab-on', on);
            if (on) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
        this.railTab = tabId;
        if (wide) this.placeRailPill();

        if (pageId) {
            const drawer = drawerById(pageId);
            if (drawer && settings.touchSizing) {
                requestAnimationFrame(() => fillRanges(drawer));
                addSliderSteppers(drawer);
                pageSections(pageId)?.sync();
                if (SEARCH_PAGES.includes(pageId)) {
                    describeSettings(drawer);
                    // Presets and API fill parts of their page a moment later.
                    setTimeout(() => describeSettings(drawer), 600);
                }
                if (pageId === 'extensions-settings-button') describeExtensions();
                if (pageId === 'ai-config-button') {
                    syncPresetTabs();
                    // Chat Completion Tabs builds its own tabs up to 2 seconds after an API switch; ours step aside then.
                    setTimeout(syncPresetTabs, 2500);
                }
            }
            if (pageId === 'backgrounds-button' || pageId === 'user-settings-button') syncThemeNotes();
            const info = drawer ? pageInfo(drawer) : (pageSpec(pageId) ?? { title: '', icon: 'fa-gear' });
            // The AI page shows a banner while there is no connection: draw it again when that changes.
            if (pageId === 'pt-ai' && this.aiConnected !== isConnected()) {
                this.aiConnected = isConnected();
                refreshOwnPage();
            }
            this.titleEl.textContent = t(info.title);
            this.subEl.textContent = t(info.long ?? '');
            this.subEl.classList.remove('pt-ab-offline');
            // Switch back to "Presets" as soon as the editor starts sliding away.
            const editorMode = promptEditorOpen() ? promptEditorMode() : null;
            root.classList.toggle('pt-prompt-editor', !!editorMode);
            if (editorMode === 'edit') {
                const name = document.getElementById('completion_prompt_manager_popup_entry_form_name')?.value?.trim();
                this.titleEl.textContent = t('Edit prompt');
                this.subEl.textContent = name || t('New prompt');
            } else if (editorMode === 'inspect') {
                this.titleEl.textContent = t('Prompt list');
                this.subEl.textContent = t('Prompts linked to this marker');
            }
            if (pageId === 'rightNavHolder') {
                syncCharacterPage();
                const editing = isShown(document.getElementById('rm_ch_create_block'));
                const name = document.getElementById('character_name_pole')?.value?.trim();
                if (editing) this.subEl.textContent = name ? t('Editing {name}', { name }) : t('New character');
                else if (isShown(document.getElementById('rm_group_chats_block'))) this.subEl.textContent = t('Group chat');
            }
            let headIcon = info.icon;
            const sections = pageSections(pageId);
            const section = sections?.current();
            if (section) {
                this.titleEl.textContent = section.raw ? section.title : t(section.title);
                this.subEl.textContent = t(sections.pageTitle);
                headIcon = section.icon;
            }
            this.search.hidden = !SEARCH_PAGES.includes(pageId) || !!editorMode;
            this.setSearchLabel(t('Find a setting'));
            this.quick.hidden = true;
            this.avatar.replaceChildren(ui(headIcon));
            this.avatar.classList.add('pt-ab-avatar-icon');
            this.who.disabled = true;
            this.appbar.classList.add('pt-ab-page');
            this.inChat = false;
            this.syncTuck();
            return;
        }

        this.appbar.classList.remove('pt-ab-page');
        root.classList.remove('pt-prompt-editor');
        // Outside a page the same button searches everything (in a chat, that includes the chat itself).
        this.setSearchLabel(t('Search everything'));
        this.quick.hidden = false;
        this.who.disabled = false;
        const context = ctx();
        let name = 'SillyTavern';
        let image = null;
        let hasChat = false;
        if (context.groupId) {
            const group = context.groups?.find(g => String(g.id) === String(context.groupId));
            name = group?.name ?? t('Group chat');
            hasChat = true;
        } else if (context.characterId !== undefined && context.characters?.[context.characterId]) {
            const character = context.characters[context.characterId];
            name = character.name;
            image = character.avatar && character.avatar !== 'none'
                ? (context.getThumbnailUrl?.('avatar', character.avatar) ?? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`)
                : null;
            hasChat = true;
        }
        this.titleEl.textContent = name;
        const status = context.onlineStatus;
        const connected = status && status !== 'no_connection';
        // Some APIs report "Valid" (the key check) instead of a model name; never translate raw model names.
        this.subEl.textContent = !connected ? t('Not connected') : (/^valid$/i.test(String(status)) ? t('Connected') : String(status));
        this.subEl.classList.toggle('pt-ab-offline', !connected);
        this.avatar.classList.remove('pt-ab-avatar-icon');
        if (image) {
            const existingImg = this.avatar.firstElementChild;
            if (!(existingImg instanceof HTMLImageElement) || existingImg.getAttribute('src') !== image) {
                this.avatar.replaceChildren(h('img', { src: image, alt: '' }));
            }
        } else {
            this.avatar.replaceChildren(ui(context.groupId ? 'users' : (hasChat ? 'user' : 'chats')));
        }
        this.actions.hidden = !hasChat;
        this.search.hidden = false;
        const shownIn = hasChat ? chatLanguage() : null;
        this.translateBtn.classList.toggle('pt-ab-on', !!shownIn);
        const next = shownIn ?? quickLanguage();
        this.translateBadge.textContent = next ? next.split('-')[0].toUpperCase() : '';
        this.translateBadge.hidden = !next;
        this.translateBtn.setAttribute('aria-label', shownIn ? t('Show original') : (next ? t('Translate to {lang}', { lang: languageName(next) }) : t('Translate chat')));
        this.home.hidden = !hasChat;
        this.inChat = hasChat;
        this.syncTuck();
    }
}

function tabsTuckable() {
    const root = document.documentElement;
    return active && settings.appShell && settings.chatStyle && settings.hideTabsInChat && !root.classList.contains('pt-desktop');
}

function syncTabsButton() {
    const button = composer.tabs;
    if (!button) return;
    const tucked = document.documentElement.classList.contains('pt-tabs-tucked');
    const label = t(tucked ? 'Show tabs' : 'Hide tabs');
    button.setAttribute('aria-expanded', String(!tucked));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.classList.toggle('pt-tabs-btn-out', !tucked);
}

function openMobileSettings() {
    openPage('extensions-settings-button');
    setTimeout(() => {
        // The container uses `display: contents`, so scroll to the drawer inside it.
        const drawer = document.querySelector('#pt_settings .inline-drawer');
        if (!drawer) return;
        const content = drawer.querySelector('.inline-drawer-content');
        if (content && getComputedStyle(content).display === 'none') drawer.querySelector('.inline-drawer-toggle')?.click();
        drawer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 250);
}

function syncShell() {
    const want = active && settings.appShell;
    if (want && !shell) shell = new Shell();
    else if (!want && shell) {
        shell.destroy();
        shell = null;
    }
}

// ------------------------------------------------------------ slider fill

/** SillyTavern leaves the slider's filled part at a fixed width; make it follow the value. */
function updateRangeFill(input) {
    const min = input.min === '' ? 0 : Number(input.min);
    const max = input.max === '' ? 100 : Number(input.max);
    const value = Number(input.value);
    const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
    input.style.setProperty('--pt-fill', `${percent.toFixed(1)}%`);
}

function fillRanges(root = document) {
    for (const input of root.querySelectorAll('input[type="range"]')) updateRangeFill(input);
}

function watchRanges(on) {
    const $ = $j();
    $(document).off('.ptRange');
    if (on) {
        // jQuery delegation sees both real input and SillyTavern's own .trigger('input').
        $(document).on('input.ptRange change.ptRange', 'input[type="range"]', function () {
            updateRangeFill(this);
        });
        fillRanges();
    } else {
        for (const input of document.querySelectorAll('input[type="range"]')) input.style.removeProperty('--pt-fill');
    }
}

// ------------------------------------------------------------ appearance

function ensureStyle(id) {
    let element = document.getElementById(id);
    if (!element) {
        element = h('style', { id });
        document.head.append(element);
    }
    return element;
}

let originalThemeColor;
let themeColorCall = 0;

/** Android's status bar follows <meta name="theme-color">; match it to the app bar. */
function syncThemeColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (originalThemeColor === undefined) originalThemeColor = meta ? meta.getAttribute('content') : null;
    if (!active) {
        if (meta && originalThemeColor === null) meta.remove();
        else if (meta) meta.setAttribute('content', originalThemeColor);
        return;
    }
    if (!meta) {
        meta = h('meta', { name: 'theme-color' });
        document.head.append(meta);
    }
    const call = (themeColorCall += 1);
    if (theme) {
        meta.setAttribute('content', theme.bg);
        return;
    }
    // Reading a CSS color makes the browser restyle the page at once; wait for the next frame instead.
    const target = meta;
    requestAnimationFrame(() => {
        if (!active || !target.isConnected || call !== themeColorCall) return;
        const own = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim();
        target.setAttribute('content', own || '#171717');
    });
}

const TOAST_ICONS = { success: 'circle-check', info: 'info', warning: 'alert-triangle', error: 'alert-circle' };

function toastIconCss() {
    return Object.entries(TOAST_ICONS)
        .map(([type, name]) => `html.pt-toasts #toast-container > .toast-${type} { --pt-t-icon: ${iconUrl(name)}; }`)
        .join(' ')
        // A grey magnifier drawn inside search boxes.
        + ` html.pt-on { --pt-search-icon: ${iconUrl('search', '#909090')}; --pt-think-icon: ${iconUrl('bulb')}; --pt-regen-icon: ${iconUrl('refresh')}; --pt-chev-down-icon: ${iconUrl('chevron-down')}; --pt-chev-up-icon: ${iconUrl('chevron-up')}; --pt-info-icon: ${iconUrl('info')}; --pt-warn-icon: ${iconUrl('alert-triangle')}; --pt-error-icon: ${iconUrl('alert-circle')}; --pt-ok-icon: ${iconUrl('circle-check')}; }`;
}

/** A Pocket Tavern theme (not a SillyTavern one): only these have a background of their own. */
function ownThemeOn() {
    return !!findTheme(settings.theme);
}

/** True when a chat background picture is set (not SillyTavern's empty "transparent" one). */
function chatBackgroundSet() {
    for (const id of ['bg_custom', 'bg1']) {
        const element = document.getElementById(id);
        // The picture SillyTavern set on it: its computed value still shows the old one while it fades over.
        const image = element ? element.style.backgroundImage || getComputedStyle(element).backgroundImage : 'none';
        if (/url\(/.test(image) && !/__transparent/.test(image)) return true;
    }
    return false;
}

/**
 * A chat background shows (html.pt-glass): the chat turns clear and messages
 * become tinted cards over the picture. Off when a Pocket Tavern theme shows its
 * own background, or when no background picture is set.
 */
function syncGlass() {
    const root = document.documentElement;
    const own = active && ownThemeOn() && settings.themeBackdrop;
    root.classList.toggle('pt-glass', active && !own && chatBackgroundSet());
}

const glassWatch = { observer: null, frame: 0 };

/** SillyTavern changes the background by restyling #bg1 (or #bg_custom for a chat's own). */
function watchBackground() {
    if (!active) {
        glassWatch.observer?.disconnect();
        glassWatch.observer = null;
        cancelAnimationFrame(glassWatch.frame);
        glassWatch.frame = 0;
        stThemes.observer?.disconnect();
        stThemes.observer = null;
        return;
    }
    if (glassWatch.observer) return;
    const targets = ['bg1', 'bg_custom'].map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    glassWatch.observer = new MutationObserver(() => {
        if (glassWatch.frame) return;
        glassWatch.frame = requestAnimationFrame(() => {
            glassWatch.frame = 0;
            if (active) syncGlass();
        });
    });
    for (const target of targets) glassWatch.observer.observe(target, { attributes: true, attributeFilter: ['style', 'class'] });
}

function applyAppearance() {
    const root = document.documentElement;
    const theme = active ? currentTheme() : null;
    root.classList.toggle('pt-themed', !!theme);
    // SillyTavern's themes have no background of their own: your chat background always shows, as in SillyTavern.
    root.classList.toggle('pt-backdrop', !!theme && ownThemeOn() && settings.themeBackdrop);
    syncGlass();
    watchBackground();
    root.classList.toggle('pt-font', active && settings.modernFont);
    root.classList.toggle('pt-icons', active && settings.customIcons);
    root.classList.toggle('pt-toasts', active && settings.niceToasts);
    for (const level of Object.keys(MOTION_LABELS)) root.classList.toggle(`pt-motion-${level}`, active && settings.motion === level);
    if (theme) root.dataset.ptTheme = theme.id;
    else delete root.dataset.ptTheme;

    if (active) {
        ensureStyle('pt-theme-css').textContent = themeCss(theme, 'html.pt-on.pt-themed') + toastIconCss();
        if (settings.customIcons) {
            const icons = ensureStyle('pt-icons-css');
            if (!icons.textContent) icons.textContent = iconCss('html.pt-icons');
        }
    } else {
        document.getElementById('pt-theme-css')?.remove();
        document.getElementById('pt-icons-css')?.remove();
    }
    syncThemeColor(theme);
    syncChatStyleForTheme();
}

/** Runs `change` behind a circular reveal that grows from `origin` (View Transitions). */
function revealChange(origin, change) {
    const root = document.documentElement;
    const canAnimate = typeof document.startViewTransition === 'function'
        && settings.motion === 'full'
        && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canAnimate) {
        change();
        return;
    }
    const rect = origin?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : innerHeight / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('pt-vt');
    // The browser runs the change once it has captured the old look. If that capture
    // is ever delayed (busy or backgrounded page), apply the change anyway.
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        change();
    };
    window.setTimeout(run, 700);
    const transition = document.startViewTransition(run);
    transition.ready.then(() => {
        root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 240, easing: EASE, pseudoElement: '::view-transition-new(root)' },
        );
    }).catch(() => {});
    transition.finished.catch(() => {}).finally(() => root.classList.remove('pt-vt'));
}

function setAppearance(key, value, origin) {
    if (settings[key] === value) return;
    const change = () => {
        settings[key] = value;
        saveSettings();
        applyAppearance();
        syncExtras();
        syncSettingsInputs();
        shell?.update();
        // Switches already show their new state; re-render only what depends on the choice.
        if (sheet && !sheet.picker && ['theme', 'motion', 'textSize', 'chatLook', 'uiSize', 'composerStyle', 'layout'].includes(key)) sheet.refresh();
        // The layout changes the whole interface.
        if (key === 'layout') applyState();
        refreshOwnPage();
    };
    if (key === 'theme') revealChange(origin, change);
    else change();
}

// -- SillyTavern's UI themes as Pocket Tavern themes

/** The SillyTavern themes on the server (loaded when the Themes sheet opens) and the converted chosen one. */
const stThemes = { list: null, loading: null, observer: null, made: { key: '', theme: null } };

/** The colors Pocket Tavern keeps of a SillyTavern theme, saved with the choice so it applies at once on the next start. */
function stThemeColors(raw) {
    return { name: raw.name, ...Object.fromEntries(ST_THEME_COLORS.map(key => [key, raw[key] ?? null])) };
}

/** The theme in use: one of Pocket Tavern's, a SillyTavern theme made to fit, or null for "Your theme". */
function currentTheme() {
    const id = settings.theme;
    const own = findTheme(id);
    if (own || typeof id !== 'string' || !id.startsWith('st:')) return own;
    const saved = settings.stTheme;
    if (!saved || `st:${saved.name}` !== id) return null;
    const key = JSON.stringify(saved);
    if (stThemes.made.key !== key) stThemes.made = { key, theme: themeFromSillyTavern(saved) };
    return stThemes.made.theme;
}

/** Asks SillyTavern for its saved UI themes (the same request it makes when it starts). */
function loadSillyTavernThemes(force = false) {
    if (stThemes.loading && !force) return stThemes.loading;
    stThemes.loading = (async () => {
        try {
            const response = await fetch('/api/settings/get', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({}) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            stThemes.list = (Array.isArray(data?.themes) ? data.themes : []).filter(theme => theme && typeof theme.name === 'string' && theme.name);
        } catch (error) {
            console.warn(LOG, 'Could not load SillyTavern themes', error);
            stThemes.loading = null;
            return stThemes.list ?? [];
        }
        // The chosen one may have been changed in SillyTavern since: keep its colors current.
        const chosen = stThemes.list.find(theme => `st:${theme.name}` === settings.theme);
        if (chosen && JSON.stringify(stThemeColors(chosen)) !== JSON.stringify(settings.stTheme)) {
            settings.stTheme = stThemeColors(chosen);
            saveSettings();
            applyAppearance();
        }
        return stThemes.list;
    })();
    return stThemes.loading;
}

/** SillyTavern's own "Import a theme file" (its button is hidden in Settings → Look while Pocket Tavern is on). */
function importSillyTavernTheme(refresh) {
    const select = document.getElementById('themes');
    const button = document.getElementById('ui_preset_import_button');
    if (!button) return;
    // SillyTavern adds the imported theme to its list; then the sheet shows it too.
    if (select && !stThemes.observer) {
        stThemes.observer = new MutationObserver(() => {
            stThemes.observer?.disconnect();
            stThemes.observer = null;
            loadSillyTavernThemes(true).then(refresh);
        });
        stThemes.observer.observe(select, { childList: true });
    }
    button.click();
}

/** Colors for a theme card preview. "Your theme" reads SillyTavern's own values. */
function previewColors(theme) {
    if (theme) {
        return { bg: theme.bg, raised: theme.raised, text: theme.text, accent: theme.accent, user: theme.user, backdrop: theme.backdrop };
    }
    // SillyTavern writes its theme colors inline on <html>; our overrides live in a stylesheet.
    const inline = document.documentElement.style;
    const read = (name, fallback) => inline.getPropertyValue(name).trim() || fallback;
    const bg = read('--SmartThemeBlurTintColor', '#171717');
    const text = read('--SmartThemeBodyColor', '#dcdcd2');
    const accent = read('--SmartThemeQuoteColor', '#e18a24');
    return {
        bg,
        raised: `color-mix(in srgb, ${text} 9%, ${bg})`,
        text,
        accent,
        user: `color-mix(in srgb, ${accent} 16%, transparent)`,
        backdrop: bg,
    };
}

function themeCard(theme, current, raw = null) {
    const id = theme?.id ?? 'st';
    const colors = previewColors(theme);
    const preview = h('span', { class: 'pt-theme-preview', 'aria-hidden': 'true' }, [
        h('span', { class: 'pt-tp-bar' }, [h('span', { class: 'pt-tp-dot' }), h('span', { class: 'pt-tp-line' })]),
        h('span', { class: 'pt-tp-msg pt-tp-bot' }),
        h('span', { class: 'pt-tp-msg pt-tp-user' }),
        h('span', { class: 'pt-tp-tabs' }, [h('span', { class: 'pt-tp-pill' })]),
    ]);
    for (const [key, value] of Object.entries(colors)) preview.style.setProperty(`--p-${key}`, value);
    const selected = current === id;
    return h('button', {
        type: 'button',
        class: `pt-theme-card ${selected ? 'pt-theme-on' : ''}`,
        'aria-pressed': String(selected),
        'data-theme': id,
        onclick: event => {
            if (raw) {
                settings.stTheme = stThemeColors(raw);
                // Its avatar shape too, as when it is picked in SillyTavern (SillyTavern saves it).
                const shape = document.getElementById('avatar_style');
                const styleVal = raw.avatar_style !== undefined ? String(raw.avatar_style) : '';
                if (shape && styleVal && styleVal !== shape.value && shape.querySelector(`option[value="${CSS.escape(styleVal)}"]`)) {
                    $j()(shape).val(styleVal).trigger('change');
                }
                // Picked again (it may have changed in SillyTavern): apply its current values.
                if (settings.theme === id) {
                    saveSettings();
                    applyAppearance();
                    return;
                }
            }
            setAppearance('theme', id, event.currentTarget);
        },
    }, [
        preview,
        h('span', { class: 'pt-theme-name' }, [
            h('span', raw ? { raw: theme.name } : { text: theme?.name ?? 'Your theme' }),
            selected ? h('span', { class: 'pt-theme-check' }, [ui('check')]) : null,
        ]),
        h('span', { class: 'pt-theme-note', text: theme?.note ?? 'Your SillyTavern colors' }),
    ]);
}

function switchRow(key, label, hint) {
    const input = h('input', { type: 'checkbox', class: 'pt-switch', role: 'switch' });
    input.checked = !!settings[key];
    input.addEventListener('change', () => setAppearance(key, input.checked));
    return h('label', { class: 'pt-switch-row' }, [
        h('span', { class: 'pt-switch-text' }, [h('span', { text: label }), hint ? h('small', { text: hint }) : null]),
        input,
    ]);
}

function motionControl() {
    const names = { full: 'Smooth', light: 'Light', off: 'Off' };
    return h('div', { class: 'pt-segmented pt-motion-seg', role: 'group', 'aria-label': 'Animations' },
        Object.keys(names).map(level => h('button', {
            type: 'button',
            class: `pt-seg ${settings.motion === level ? 'pt-seg-on' : ''}`,
            'aria-pressed': String(settings.motion === level),
            onclick: () => setAppearance('motion', level),
        }, [names[level]])));
}

/** SillyTavern's own Chat width slider, as a control in the Themes sheet; it applies and saves right away. */
function chatWidthControl() {
    const source = document.getElementById('chat_width_slider');
    if (!source) return null;
    const value = h('span', { class: 'pt-width-value', 'aria-hidden': 'true' });
    const input = h('input', { type: 'range', class: 'pt-width-range', min: source.min || '25', max: source.max || '100', step: '1', 'aria-label': 'Chat width' });
    input.value = source.value;
    // The filled part of the track ends under the knob (as a 0–1 share of the range).
    const show = () => {
        const min = Number(input.min);
        const max = Number(input.max);
        input.style.setProperty('--pt-share', String(max > min ? (Number(input.value) - min) / (max - min) : 0));
        value.textContent = `${input.value}%`;
    };
    show();
    input.addEventListener('input', () => {
        show();
        $j()(source).val(input.value).trigger('input', { forced: true });
    });
    return h('div', { class: 'pt-width-row' }, [input, value]);
}

/** A row of choices for one setting, like Size or Message box. */
function choiceControl(key, names, label) {
    return h('div', { class: 'pt-segmented pt-look-seg', role: 'group', 'aria-label': label },
        Object.entries(names).map(([value, text]) => h('button', {
            type: 'button',
            class: `pt-seg ${settings[key] === value ? 'pt-seg-on' : ''}`,
            'aria-pressed': String(settings[key] === value),
            onclick: () => setAppearance(key, value),
        }, [text])));
}

function openThemeSheet() {
    const refresh = () => {
        if (sheet && sheet.fill === fill && !sheet.closing) sheet.refresh();
    };
    const fill = body => {
            body.append(h('p', { class: 'pt-menu-heading', text: 'Pocket Tavern' }));
            body.append(h('div', { class: 'pt-themes' }, THEMES.map(theme => themeCard(theme, settings.theme))));
            // SillyTavern's UI themes live here instead of in Settings → Look, made to fit.
            body.append(h('p', { class: 'pt-menu-heading', text: 'From SillyTavern' }));
            const fromSt = (stThemes.list ?? []).map(raw => [themeFromSillyTavern(raw), raw]).filter(([theme]) => theme);
            body.append(h('div', { class: 'pt-themes pt-themes-st' }, [themeCard(null, settings.theme), ...fromSt.map(([theme, raw]) => themeCard(theme, settings.theme, raw))]));
            body.append(h('p', { class: 'pt-menu-foot', text: stThemes.list ? "Your SillyTavern themes with Pocket Tavern's look. \"Your theme\" keeps SillyTavern's colors exactly as they are." : 'Loading your SillyTavern themes…' }));
            if (document.getElementById('ui_preset_import_button')) {
                body.append(h('div', { class: 'pt-menu-list' }, [h('button', {
                    type: 'button',
                    class: 'pt-menu-row pt-st-import',
                    onclick: () => importSillyTavernTheme(refresh),
                }, [ui('file-import', 'pt-menu-row-icon'), h('span', { class: 'pt-row-text' }, [h('span', { text: 'Import a SillyTavern theme' }), h('small', { text: 'A theme file (.json) from SillyTavern' })])])]));
            }
            if (!stThemes.list) loadSillyTavernThemes().then(refresh);
            body.append(h('p', { class: 'pt-menu-heading', text: 'Look and feel' }));
            body.append(h('div', { class: 'pt-menu-list' }, [
                switchRow('themeBackdrop', 'Theme background', 'Use the theme\'s backdrop instead of your chat background.'),
                switchRow('modernFont', 'Modern font', isWide() ? "Your computer's own system font, crisp at every size." : 'Your phone\'s own system font, crisp at every size.'),
                switchRow('customIcons', 'New icons', 'Rounded line icons everywhere.'),
            ]));
            body.append(h('p', { class: 'pt-menu-heading', text: 'Chat look' }));
            body.append(chatLookControl());
            const stStyle = stChatStyleName();
            if (stStyle) body.append(h('p', { class: 'pt-menu-foot', text: t("SillyTavern's {style} chat style is on, so it draws the messages. Pick a look here to use Pocket Tavern's instead.", { style: t(stStyle) }) }));
            body.append(h('p', { class: 'pt-menu-heading', text: 'Size' }));
            body.append(choiceControl('uiSize', SIZES, 'Size'));
            body.append(h('p', { class: 'pt-menu-foot', text: SIZE_NOTES[settings.uiSize] ?? '' }));
            body.append(h('p', { class: 'pt-menu-heading', text: 'Layout' }));
            body.append(choiceControl('layout', LAYOUT_NAMES, 'Layout'));
            body.append(h('p', { class: 'pt-menu-foot', text: LAYOUT_NOTES[settings.layout] ?? LAYOUT_NOTES.auto }));
            body.append(h('p', { class: 'pt-menu-heading', text: 'Message box' }));
            body.append(choiceControl('composerStyle', COMPOSER_STYLES, 'Message box'));
            body.append(h('p', { class: 'pt-menu-foot', text: COMPOSER_NOTES[settings.composerStyle] ?? '' }));
            // The desktop layout (a computer, a tablet held sideways): how wide the chat column is.
            const width = document.documentElement.classList.contains('pt-desktop') ? chatWidthControl() : null;
            if (width) {
                body.append(h('p', { class: 'pt-menu-heading', text: 'Chat width' }));
                body.append(width);
                body.append(h('p', { class: 'pt-menu-foot', text: "How much of a wide screen the chat uses. The same as Chat width in SillyTavern's settings." }));
            }
            body.append(h('p', { class: 'pt-menu-heading', text: 'Animations' }));
            body.append(motionControl());
            body.append(h('p', { class: 'pt-menu-foot', text: MOTION_LABELS[settings.motion] }));
    };
    showSheet(new MenuSheet({
        title: 'Themes',
        subtitle: isWide() ? 'Changes how Pocket Tavern looks. Your SillyTavern theme stays saved.' : 'Changes the look on your phone. Your SillyTavern theme stays saved.',
        fill,
    }));
}

// -------------------------------------------------- long single selects

/**
 * Optional: any big single-choice dropdown (presets, themes, models…) gets the
 * same searchable sheet. Off by default because the native Android list is fine
 * for short menus and some extensions manage their own selects.
 */
function labelForSelect(select) {
    const clean = text => (text ?? '').replace(/\s+/g, ' ').trim();
    const explicit = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
    const direct = clean(select.getAttribute('aria-label')) || clean(explicit?.textContent);
    if (direct) return direct;
    // Nearest short heading-like element right before the control, a few levels up.
    let node = select;
    for (let depth = 0; depth < 3 && node && node !== document.body; depth++, node = node.parentElement) {
        const previous = node.previousElementSibling;
        const text = clean(previous?.textContent);
        if (previous && text && text.length <= 60 && !previous.querySelector('select, input, textarea')) return text;
    }
    const fromId = (select.id || '').replace(/_?select$/, '').replace(/[_-]+/g, ' ').trim();
    return fromId ? fromId.charAt(0).toUpperCase() + fromId.slice(1) : 'Choose an option';
}

function longSelectConfig(select) {
    const label = labelForSelect(select);
    return {
        selector: '*',
        kind: 'single',
        title: label,
        subtitle: '',
        noneLabel: 'None',
        searchLabel: 'Search',
        noun: 'option',
    };
}

// ------------------------------------------------------------------ scan

function matchTarget(select) {
    if (select.closest('.template_element, #character_world_template, #pt-sheet')) return null;
    for (const target of LOREBOOK_TARGETS) {
        if (select.matches(target.selector)) return target;
    }
    return null;
}

function scan() {
    scanTimer = 0;
    for (const [select, picker] of pickers) {
        const wanted = picker.isLong ? settings.longSelects : settings.lorebookPicker;
        if (!select.isConnected || !active || !wanted) {
            picker.destroy();
            pickers.delete(select);
        }
    }
    if (!active) return;

    if (settings.lorebookPicker) {
        const selector = LOREBOOK_TARGETS.map(target => target.selector).join(',');
        for (const select of document.querySelectorAll(selector)) {
            if (pickers.has(select) || !(select instanceof HTMLSelectElement)) continue;
            const target = matchTarget(select);
            if (target) pickers.set(select, new Picker(select, target));
        }
    }

    if (settings.longSelects) {
        for (const select of document.querySelectorAll('select:not([multiple])')) {
            if (pickers.has(select) || select.matches(LONG_SELECT_EXCLUDE)) continue;
            if (select.closest('#pt-sheet, .pt-settings') || select.options.length < LONG_SELECT_MIN_OPTIONS) continue;
            pickers.set(select, new Picker(select, longSelectConfig(select)));
        }
    }
}

function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(scan, 120);
}

function startObserver() {
    if (domObserver) return;
    const baseSelector = LOREBOOK_TARGETS.map(target => target.selector).join(',');
    let wasEditing = !!document.getElementById('curEditTextarea');
    domObserver = new MutationObserver(records => {
        const selector = settings.longSelects ? `${baseSelector},select` : baseSelector;
        let rescan = false;
        let layers = false;
        const nowEditing = !!document.getElementById('curEditTextarea');
        const editorChanged = nowEditing !== wasEditing;
        wasEditing = nowEditing;
        const chat = document.getElementById('chat');
        for (const record of records) {
            if (record.target === document.body) layers = true;
            // Inside the chat (a streaming reply changes it on every token) skip heavy subtree scans.
            const inChat = !!chat && chat.contains(record.target);
            if (inChat || rescan) continue;
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1 || node.closest?.('#chat')) continue;
                if (node.matches?.(selector) || node.querySelector?.(selector)) {
                    rescan = true;
                    break;
                }
            }
            if (!rescan && settings.longSelects && record.target instanceof HTMLSelectElement && record.addedNodes.length && !pickers.has(record.target)) {
                rescan = true;
            }
            if (!rescan && record.removedNodes.length && pickers.size) {
                for (const select of pickers.keys()) {
                    if (!select.isConnected) {
                        rescan = true;
                        break;
                    }
                }
            }
        }
        if (rescan) scheduleScan();
        // SillyTavern popups are <dialog>s appended to and removed from <body>.
        if (layers) scheduleHistorySync();
        if (editorChanged) syncEditorState();
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
    domObserver?.disconnect();
    domObserver = null;
    window.clearTimeout(scanTimer);
    scanTimer = 0;
}

// ------------------------------------------------------------- wand entry

function syncWandShortcut() {
    const existing = document.getElementById('pt_wand_container');
    const want = active && settings.wandShortcut && settings.lorebookPicker;
    if (!want) {
        if (existing) {
            existing.remove();
            // The wand is shown for our item; SillyTavern hides it when it has no items of its own.
            const wand = document.getElementById('extensionsMenuButton');
            if (wand && wandDisplay.saved) wand.style.display = wandDisplay.value;
            wandDisplay.saved = false;
        }
        return;
    }
    if (existing) return;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const item = h('div', {
        id: 'pt_wand_lorebooks',
        class: 'list-group-item flex-container flexGap5 interactable',
        tabindex: '0',
        role: 'button',
        title: 'Choose which lorebooks are active in all chats',
        onclick: () => {
            const select = document.querySelector('#world_info');
            const picker = select && pickers.get(select);
            // SillyTavern closes the wand menu itself when a menu item is clicked.
            if (picker) openSheet(picker);
        },
        onkeydown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.currentTarget.click();
            }
        },
    }, [h('div', { class: 'fa-solid fa-book-atlas extensionsMenuExtensionButton' }), h('span', { text: 'Lorebooks' })]);
    menu.append(h('div', { id: 'pt_wand_container', class: 'extension_container' }, [item]));
    const button = document.getElementById('extensionsMenuButton');
    if (button) {
        wandDisplay.value = button.style.display;
        wandDisplay.saved = true;
        button.style.display = '';
    }
}

const wandDisplay = { saved: false, value: '' };

// ---------------------------------------------------------- phone extras

const extras = {
    wired: false,
    jump: null,
    jumpFrame: 0,
    formObserver: null,
    wakeLock: null,
    generating: false,
    wakeTimer: 0,
    draftTimer: 0,
    draftKey: null,
    personaObserver: null,
};

function motionAllowed() {
    return settings.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A short vibration. Android only allows it right after a tap. */
function buzz(pattern = 10) {
    // Chrome logs an error for vibrate() without a real tap (for example a scripted click).
    if (active && settings.haptics && navigator.userActivation?.isActive !== false) {
        try {
            navigator.vibrate?.(pattern);
        } catch {
            // Not allowed here; nothing to do.
        }
    }
}

/** A short press on the send button when you send (Light motion and Smooth alike). */
function playSendFx(button) {
    if (!active || !settings.sendEffect || !settings.chatStyle || !motionAllowed()) return;
    button.classList.remove('pt-launch');
    void button.offsetWidth;
    button.classList.add('pt-launch');
    window.clearTimeout(playSendFx.timer);
    playSendFx.timer = window.setTimeout(() => button.classList.remove('pt-launch'), 300);
}

function onSendPointerDown(event) {
    if (!active || event.button > 0) return;
    if (event.target.closest?.('#send_but')) buzz(12);
}

function onSendClick(event) {
    if (!active) return;
    const button = event.target.closest?.('#send_but');
    if (button) playSendFx(button);
}

// -- jump to latest

function onChatScroll() {
    if (extras.jumpFrame) return;
    extras.jumpFrame = requestAnimationFrame(() => {
        extras.jumpFrame = 0;
        const chat = document.getElementById('chat');
        if (!chat || !extras.jump) return;
        const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
        extras.atBottom = distance < 40;
        // Not on the start screen: there is no "latest message" there, and it covered the chat list.
        // (No chat open = the start screen; cheaper than searching a long chat on every frame.)
        const welcome = ctx().getCurrentChatId?.() === undefined;
        extras.jump.classList.toggle('pt-jump-on', !welcome && (distance > Math.max(320, chat.clientHeight * 0.7) || (extras.generating && distance > 150)));
        // While a reply streams in below, the button says so.
        extras.jump.classList.toggle('pt-jump-new', extras.generating && distance > 150);
    });
}

function syncJumpButton() {
    const chat = document.getElementById('chat');
    const sheld = document.getElementById('sheld');
    const want = active && settings.jumpButton && chat && sheld;
    if (!want) {
        extras.jump?.remove();
        extras.jump = null;
        chat?.removeEventListener('scroll', onChatScroll);
        cancelAnimationFrame(extras.jumpFrame);
        extras.jumpFrame = 0;
        return;
    }
    if (extras.jump) return;
    extras.jump = h('button', {
        type: 'button',
        class: 'pt-jump',
        'aria-label': 'Jump to the latest message',
        title: 'Latest message',
        onclick: () => {
            buzz(8);
            chat.scrollTo({ top: chat.scrollHeight, behavior: motionAllowed() ? 'smooth' : 'auto' });
        },
    }, [ui('arrow-down'), h('span', { class: 'pt-jump-label', text: 'New text' })]);
    shieldFromDrawerAutoClose(extras.jump);
    sheld.append(extras.jump);
    chat.addEventListener('scroll', onChatScroll, { passive: true });
    onChatScroll();
}

// -- drafts

function draftKeyNow() {
    const context = ctx();
    const chatId = context.getCurrentChatId?.() ?? context.chatId;
    if (!chatId) return null;
    const owner = context.groupId ? `g:${context.groupId}` : (context.characterId !== undefined ? `c:${context.characters?.[context.characterId]?.avatar ?? context.characterId}` : null);
    return owner ? `pt_draft:${owner}:${chatId}` : null;
}

function readDraft(key) {
    try {
        return key ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

function writeDraft(key, value) {
    if (!key) return;
    try {
        if (value && value.trim()) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch {
        // Storage full or blocked: drafts are a convenience only.
    }
}

/**
 * Opening a chat made SillyTavern focus the message box, which pops up the
 * keyboard. For a short while after a chat opens, the box only takes focus
 * when you tapped it yourself.
 */
const focusGuard = { until: 0, tapped: 0, target: null, at: 0 };

/** Where SillyTavern (and Pocket Tavern) put text you edit. */
const EDIT_AREAS = '#chat, #WorldInfo, #world_popup, #completion_prompt_manager_popup, #persona-management-block, #rm_ch_create_block, #pt-sheet';

function guardKeyboard(ms = 2500) {
    focusGuard.until = Date.now() + ms;
}

function onFocusGuardPointer(event) {
    if (!active || isWide()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    focusGuard.target = target;
    focusGuard.at = Date.now();
    if (target.closest('#send_form')) focusGuard.tapped = Date.now();
    // Opening a chat from a list: the focus that follows is not yours.
    else if (target.closest('.recentChat, .pt-group-main, .character_select, .group_select, .select_chat_block, .pt-choice, .pt-search-hit')) guardKeyboard(3500);
}

function onFocusGuardFocus(event) {
    const box = event.target;
    if (!active || isWide() || !(box instanceof HTMLTextAreaElement)) return;
    if (box.dataset.ptCopy) return;
    const now = Date.now();
    if (box.id === 'send_textarea') {
        if (now < focusGuard.until && now - focusGuard.tapped > 1200) box.blur();
        return;
    }
    // Any other text box (editing a message, its thinking, a persona, a lorebook
    // entry...): when it took focus right after you tapped something else, like
    // ✎ Edit, keep the keyboard down. Tap the box itself to type.
    // Only real edit areas: SillyTavern's copy trick focuses a short-lived box of its own and must keep working.
    if (!box.closest(EDIT_AREAS)) return;
    const tappedElsewhere = focusGuard.target && now - focusGuard.at < 1500 && !box.contains(focusGuard.target);
    if (tappedElsewhere) box.blur();
}

function onDraftInput(event) {
    if (!active || !settings.saveDrafts || event.target?.id !== 'send_textarea') return;
    window.clearTimeout(extras.draftTimer);
    const value = event.target.value;
    const key = extras.draftKey ?? draftKeyNow();
    extras.draftTimer = window.setTimeout(() => writeDraft(key, value), 400);
}

/** Called when the chat changes: put away the old chat's draft and bring back this one's. */
function restoreDraft() {
    if (!active || !settings.saveDrafts) return;
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;
    window.clearTimeout(extras.draftTimer);
    const previous = extras.draftKey;
    const next = draftKeyNow();
    extras.draftKey = next;
    if (previous && previous === next) return;
    let changed = false;
    const current = textarea.value;
    if (current.trim()) {
        if (previous) writeDraft(previous, current);
        // SillyTavern keeps one copy of the box across reloads; if that text is
        // another chat's draft, it stays saved there instead of following you here.
        const owner = previous || draftKeyWithText(current, next);
        if (owner && owner !== next && readDraft(owner) === current) {
            textarea.value = '';
            changed = true;
        }
    } else if (previous) {
        // User cleared the box and switched chats before the 400ms debounce fired.
        writeDraft(previous, '');
    }
    const saved = readDraft(next);
    if (saved && !textarea.value.trim()) {
        textarea.value = saved;
        changed = true;
    }
    // Let SillyTavern resize the box and update its own saved copy.
    if (changed) textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function draftKeyWithText(text, except) {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('pt_draft:') && key !== except && localStorage.getItem(key) === text) return key;
        }
    } catch {
        // Storage blocked.
    }
    return null;
}

function clearDraft() {
    window.clearTimeout(extras.draftTimer);
    writeDraft(extras.draftKey ?? draftKeyNow(), '');
}

// -- keep the screen on while a reply streams in

async function setAwake(on) {
    window.clearTimeout(extras.wakeTimer);
    if (!on) {
        extras.wakePending = false;
        const lock = extras.wakeLock;
        extras.wakeLock = null;
        lock?.release?.().catch(() => {});
        return;
    }
    if (!active || !settings.keepAwake || extras.wakeLock || extras.wakePending || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    extras.wakePending = true;
    try {
        const lock = await navigator.wakeLock.request('screen');
        extras.wakePending = false;
        if (!active || !settings.keepAwake || !extras.generating || document.visibilityState !== 'visible') {
            lock?.release?.().catch(() => {});
            return;
        }
        extras.wakeLock = lock;
        lock.addEventListener('release', () => {
            if (extras.wakeLock === lock) extras.wakeLock = null;
        });
        // Never hold the screen on forever if an end event goes missing.
        extras.wakeTimer = window.setTimeout(() => setAwake(false), 10 * 60 * 1000);
    } catch {
        extras.wakePending = false;
        // Not allowed (battery saver, insecure page): just skip it.
    }
}

function onGenerating(on) {
    extras.generating = on;
    onChatScroll();
    setAwake(on);
}

function onVisibility() {
    // Android drops the lock when you leave the tab; take it back on return.
    if (document.visibilityState === 'visible' && extras.generating) setAwake(true);
}

// -- message menu

const MESSAGE_ACTION_ORDER = ['mes_copy', 'mes_edit', 'mes_swipe_picker', 'mes_create_branch', 'mes_create_bookmark', 'mes_hide', 'mes_unhide', 'mes_translate', 'mes_narrate', 'sd_message_gen', 'mes_embed', 'mes_prompt'];

function messageActionLabel(button) {
    const title = (button.getAttribute('title') || '').split('\n')[0].trim();
    if (title) return title;
    if (button.classList.contains('mes_bookmark')) return 'Open checkpoint';
    return 'Action';
}

/**
 * In edit mode SillyTavern's ⧉ button duplicates the message, and the copy lands
 * below a long message, off screen, so it looks like nothing happened. Ask which
 * one you meant: copy the text, or duplicate the message.
 */
let passEditCopy = false;

function onEditCopyClick(event) {
    if (!active || !settings.messageMenu) return;
    const button = event.target.closest?.('#chat .mes_edit_copy');
    if (!button) return;
    if (passEditCopy) {
        passEditCopy = false;
        return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(8);
    const message = button.closest('.mes');
    const textOf = () => message?.querySelector('.edit_textarea, #curEditTextarea')?.value ?? '';
    showSheet(new MenuSheet({
        title: 'Copy',
        subtitle: 'What would you like to do?',
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, [
            h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: async () => {
                    const text = textOf();
                    closeSheet(true);
                    const ok = await copyText(text);
                    if (ok) globalThis.toastr?.success(t('Text copied.'), '', { timeOut: 2000 });
                    else globalThis.toastr?.error(t('Your browser blocked copying. Select the text and copy it instead.'), t('Could not copy'));
                },
            }, [ui('copy', 'pt-menu-row-icon'), h('span', { class: 'pt-row-text' }, [
                h('span', { text: 'Copy text' }),
                h('small', { text: 'Put the message text on the clipboard.' }),
            ])]),
            h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: () => {
                    closeSheet(true);
                    const chatId = ctx().getCurrentChatId?.();
                    const count = ctx().chat?.length ?? 0;
                    passEditCopy = true;
                    try {
                        button.click();
                    } finally {
                        passEditCopy = false;
                    }
                    // Say where the copy went once SillyTavern has added it.
                    const check = (tries = 0) => {
                        if (!active || ctx().getCurrentChatId?.() !== chatId) return;
                        if ((ctx().chat?.length ?? 0) > count) globalThis.toastr?.success(t('A copy of the message was added right below it.'), '', { timeOut: 3000 });
                        else if (tries < 40) setTimeout(() => check(tries + 1), 250);
                    };
                    check();
                },
            }, [ui('file-plus', 'pt-menu-row-icon'), h('span', { class: 'pt-row-text' }, [
                h('span', { text: 'Duplicate message' }),
                h('small', { text: 'Add a second copy of this message to the chat, right below it.' }),
            ])]),
        ])),
    }));
}

function onMessageMenuClick(event) {
    if (!active || !settings.messageMenu) return;
    const hint = event.target.closest?.('#chat .extraMesButtonsHint');
    if (!hint) return;
    const message = hint.closest('.mes');
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(8);
    openMessageMenu(message);
}

/**
 * Copies text even where the browser has no clipboard API: SillyTavern opened by a
 * network address (http://192.168...) is not a "secure" page, so Chrome hides it.
 */
function copyWithFallback(text) {
    const area = h('textarea', { readonly: '', 'aria-hidden': 'true', 'data-pt-copy': '1' });
    area.value = text;
    // Off screen, 16px so Android does not zoom, inside the topmost open dialog so it can be focused.
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
    const openDialogs = document.querySelectorAll('dialog[open]');
    (openDialogs[openDialogs.length - 1] ?? document.body).append(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    area.remove();
    return ok;
}

async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission refused: try the old way below.
        }
    }
    return copyWithFallback(text);
}

/** SillyTavern's own Copy reads the raw message text; do the same. */
async function copyMessage(message) {
    const id = Number(message.getAttribute('mesid'));
    const text = ctx().chat?.[id]?.mes ?? message.querySelector('.mes_text')?.innerText ?? '';
    const ok = await copyText(text);
    if (ok) globalThis.toastr?.success(t('Message copied.'), '', { timeOut: 2000 });
    else globalThis.toastr?.error(t('Your browser blocked copying. Long-press the text to copy it instead.'), t('Could not copy'));
}

/**
 * Without a secure page there is no navigator.clipboard at all, so every copy
 * button in SillyTavern fails quietly. Give it one that uses the old method.
 */
function patchClipboard() {
    if (navigator.clipboard || window.isSecureContext) return;
    try {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                pt: true,
                writeText: text => (copyWithFallback(String(text)) ? Promise.resolve() : Promise.reject(new Error('Copy failed'))),
                // Reading needs a secure page; fail the way a browser would instead of throwing "not a function".
                readText: () => Promise.reject(new DOMException('Reading the clipboard needs HTTPS', 'NotAllowedError')),
            },
        });
    } catch {
        // Read-only in this browser; our own Copy still works.
    }
}

/** Turning Pocket Tavern off takes back the stand-in clipboard. */
function unpatchClipboard() {
    if (!navigator.clipboard?.pt) return;
    try {
        delete navigator.clipboard;
    } catch {
        // Could not be removed; it only copies text, so leaving it is harmless.
    }
}

function openMessageMenu(message) {
    const name = message.getAttribute('ch_name') || 'Message';
    const preview = (message.querySelector('.mes_text')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const run = button => {
        closeSheet(true);
        if (button.classList.contains('mes_copy')) {
            copyMessage(message);
            return;
        }
        // Some SillyTavern buttons listen for pointerup rather than click; send both.
        button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
        button.click();
    };
    showSheet(new MenuSheet({
        title: name,
        subtitle: preview.length > 90 ? `${preview.slice(0, 90)}…` : preview,
        fill: body => {
            if (!message.isConnected) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'This message is no longer in the chat.' }));
                return;
            }
            const buttons = Array.from(message.querySelectorAll('.mes_buttons .mes_button'))
                .filter(button => !button.classList.contains('extraMesButtonsHint') && getComputedStyle(button).display !== 'none');
            const rank = button => {
                const index = MESSAGE_ACTION_ORDER.findIndex(name => button.classList.contains(name));
                return index === -1 ? 50 : index;
            };
            buttons.sort((a, b) => rank(a) - rank(b));
            const rows = buttons.map(button => {
                const faClass = Array.from(button.classList).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-fw', 'fa-xs', 'fa-sm', 'fa-lg'].includes(name));
                return h('button', { type: 'button', class: 'pt-menu-row', onclick: () => run(button) }, [
                    faClass ? ui(faClass, 'pt-menu-row-icon') : ui('puzzle', 'pt-menu-row-icon'),
                    h('span', { text: messageActionLabel(button) }),
                ]);
            });
            const edit = message.querySelector('.mes_edit');
            if (edit && getComputedStyle(edit).display !== 'none') {
                rows.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row pt-menu-row-danger',
                    onclick: () => {
                        closeSheet(true);
                        // SillyTavern deletes from edit mode and asks to confirm first. The editor
                        // can take a moment to appear on a slow phone, so wait for its Delete.
                        edit.click();
                        const pressDelete = (tries = 0) => {
                            const button = message.querySelector('.mes_edit_delete');
                            if (button) button.click();
                            else if (tries < 30 && message.isConnected) setTimeout(() => pressDelete(tries + 1), 50);
                        };
                        setTimeout(pressDelete, 60);
                    },
                }, [ui('trash', 'pt-menu-row-icon'), h('span', { text: 'Delete message' })]));
            }
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

// -- personas: list and editor on separate tabs

/** The current persona's tools get a short label under their icon, like a character card's. */
const PERSONA_TOOLS = [
    ['#persona_rename_button', 'Rename'],
    ['#sync_name_button', 'Sync name'],
    ['#persona_lore_button', 'Lore'],
    ['#persona_set_image_button', 'Picture'],
    ['#persona_duplicate_button', 'Duplicate'],
    ['#persona_delete_button', 'Delete'],
];

function syncPersonaTabs() {
    const block = document.getElementById('persona-management-block');
    let bar = document.getElementById('pt_persona_tabs');
    const want = active && settings.touchSizing && block;
    // With the new character pages on, personas look like them: picture cards and a card with labeled tools.
    const look = !!(want && settings.charPage);
    document.documentElement.classList.toggle('pt-personapage', look);
    for (const [selector, label] of PERSONA_TOOLS) {
        const button = document.querySelector(selector);
        const tag = button?.querySelector(':scope > .pt-btn-label');
        if (look && button && !tag) button.append(h('span', { class: 'pt-btn-label', text: label }));
        else if (!look) tag?.remove();
    }
    if (!look) document.querySelectorAll('#user_avatar_block .pt-default-badge').forEach(node => node.remove());
    if (!want) {
        bar?.remove();
        document.querySelector('#persona_controls .pt-persona-face')?.remove();
        block?.classList.remove('pt-persona-split', 'pt-persona-edit');
        extras.personaObserver?.disconnect();
        extras.personaObserver = null;
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
        extras.personaObserver = new MutationObserver(updatePersonaTabs);
        const name = document.getElementById('your_name');
        const list = document.getElementById('user_avatar_block');
        if (name) extras.personaObserver.observe(name, { childList: true, characterData: true, subtree: true });
        if (list) extras.personaObserver.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    updatePersonaTabs();
}

function updatePersonaTabs() {
    const block = document.getElementById('persona-management-block');
    const bar = document.getElementById('pt_persona_tabs');
    if (!block || !bar) return;
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

// -- notifications: swipe one sideways to dismiss it

const toastSwipe = { el: null, x: 0, dx: 0 };

function onToastTouchStart(event) {
    if (!active || !settings.niceToasts) return;
    const toast = event.target.closest?.('#toast-container > .toast');
    if (!toast || event.touches.length !== 1) return;
    toastSwipe.el = toast;
    toastSwipe.x = event.touches[0].clientX;
    toastSwipe.dx = 0;
    toast.style.transition = 'none';
}

function onToastTouchMove(event) {
    const toast = toastSwipe.el;
    if (!toast) return;
    toastSwipe.dx = event.touches[0].clientX - toastSwipe.x;
    toast.style.transform = `translateX(${toastSwipe.dx}px)`;
    toast.style.opacity = String(Math.max(0.2, 1 - Math.abs(toastSwipe.dx) / 260));
}

function onToastTouchEnd() {
    const toast = toastSwipe.el;
    if (!toast) return;
    toastSwipe.el = null;
    toast.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
    if (Math.abs(toastSwipe.dx) > 80) {
        toast.style.transform = `translateX(${toastSwipe.dx > 0 ? 120 : -120}%)`;
        toast.style.opacity = '0';
        setTimeout(() => {
            const toastr = globalThis.toastr;
            if (toastr?.clear) toastr.clear($j()(toast), { force: true });
            else toast.remove();
        }, 200);
    } else {
        toast.style.transform = '';
        toast.style.opacity = '';
    }
}

// -- picture viewer for chat avatars

let viewer = null;

/** The full-size picture behind a chat thumbnail, where SillyTavern serves one. */
function fullImageUrl(thumb) {
    try {
        const url = new URL(thumb, location.href);
        if (url.pathname.endsWith('/thumbnail')) {
            const file = url.searchParams.get('file');
            const type = url.searchParams.get('type');
            if (file && type === 'avatar') return `/characters/${encodeURIComponent(file)}`;
            if (file && type === 'persona') return `/User Avatars/${encodeURIComponent(file)}`;
        }
    } catch {
        // Not a URL we understand; use it as is.
    }
    return thumb;
}

function onAvatarClick(event) {
    if (!active || !settings.imageViewer) return;
    const avatar = event.target.closest?.('#chat .mes .avatar');
    const img = avatar?.querySelector('img');
    if (!img?.getAttribute('src')) return;
    // Stop SillyTavern's small floating window from opening as well.
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(8);
    const message = avatar.closest('.mes');
    const shown = img.getAttribute('src');
    // Sharp pictures put a small scaled copy (a blob: URL) in the avatar; the
    // thumbnail SillyTavern asked for still tells us which original to open.
    const source = shown.startsWith('blob:') && img.dataset.ptThumb ? img.dataset.ptThumb : shown;
    openViewer({
        thumb: shown,
        full: fullImageUrl(source),
        title: message?.getAttribute('ch_name') || 'Picture',
    });
}

class Viewer {
    constructor({ thumb, full, title }) {
        this.full = full;
        this.title = title;
        this.closing = false;
        this.state = { scale: 1, x: 0, y: 0, rot: 0 };
        this.pointers = new Map();
        this.lastTap = { t: 0, x: 0, y: 0 };
        this.tapTimer = 0;

        this.img = h('img', { class: 'pt-viewer-img', alt: title, draggable: 'false', src: thumb });
        if (full && full !== thumb) {
            const loader = new Image();
            loader.onload = () => {
                if (!this.closing) this.img.src = full;
            };
            loader.src = full;
        }
        const button = (iconName, label, onclick, extra = '') => h('button', {
            type: 'button', class: `pt-viewer-btn ${extra}`, 'aria-label': label, title: label, onclick,
        }, [ui(iconName)]);
        this.zoomButton = button('zoom-in', 'Zoom in', () => this.toggleZoom());
        this.stage = h('div', { class: 'pt-viewer-stage' }, [this.img]);
        this.dialog = h('dialog', { class: 'pt-viewer', 'aria-label': title, lang: currentLang() }, [
            h('div', { class: 'pt-viewer-top' }, [
                h('span', { class: 'pt-viewer-title', raw: title }),
                button('x', 'Close', () => closeViewer(), 'pt-viewer-close'),
            ]),
            this.stage,
            h('div', { class: 'pt-viewer-bar' }, [
                this.zoomButton,
                button('rotate-cw', 'Rotate', () => this.rotate()),
                button('external', 'Open full size', () => window.open(this.full, '_blank', 'noopener')),
                button('download', 'Save picture', () => this.download()),
            ]),
        ]);
        shieldFromDrawerAutoClose(this.dialog);
        this.dialog.addEventListener('cancel', event => {
            event.preventDefault();
            closeViewer();
        });
        this.stage.addEventListener('pointerdown', event => this.down(event));
        this.stage.addEventListener('pointermove', event => this.move(event));
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) this.stage.addEventListener(type, event => this.up(event));
        this.stage.addEventListener('wheel', event => {
            event.preventDefault();
            this.zoomAt(this.state.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
        }, { passive: false });
    }

    center() {
        const rect = this.stage.getBoundingClientRect();
        return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    }

    apply(animate = false) {
        const { scale, x, y, rot } = this.state;
        this.img.style.transition = animate ? 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
        this.img.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}deg)`;
        this.dialog.classList.toggle('pt-viewer-zoomed', scale > 1.01);
        const icon = scale > 1.01 ? 'zoom-out' : 'zoom-in';
        if (this.zoomButton.dataset.icon !== icon) {
            this.zoomButton.dataset.icon = icon;
            this.zoomButton.replaceChildren(ui(icon));
            const label = t(scale > 1.01 ? 'Zoom out' : 'Zoom in');
            this.zoomButton.setAttribute('aria-label', label);
            this.zoomButton.setAttribute('title', label);
        }
    }

    /** Keeps the picture from being dragged off screen. */
    clamp() {
        const { scale, rot } = this.state;
        const sideways = Math.abs(rot) % 180 === 90;
        const width = (sideways ? this.img.offsetHeight : this.img.offsetWidth) * scale;
        const height = (sideways ? this.img.offsetWidth : this.img.offsetHeight) * scale;
        const rect = this.stage.getBoundingClientRect();
        const maxX = Math.max(0, (width - rect.width) / 2);
        const maxY = Math.max(0, (height - rect.height) / 2);
        this.state.x = Math.min(maxX, Math.max(-maxX, this.state.x));
        this.state.y = Math.min(maxY, Math.max(-maxY, this.state.y));
    }

    zoomAt(next, px, py, animate = false) {
        const scale = Math.min(6, Math.max(1, next));
        const { cx, cy } = this.center();
        // Keep the point under the finger in place while the scale changes.
        const qx = (px - cx - this.state.x) / this.state.scale;
        const qy = (py - cy - this.state.y) / this.state.scale;
        this.state.x = px - cx - scale * qx;
        this.state.y = py - cy - scale * qy;
        this.state.scale = scale;
        if (scale === 1) {
            this.state.x = 0;
            this.state.y = 0;
        }
        this.clamp();
        this.apply(animate);
    }

    toggleZoom(px, py) {
        const { cx, cy } = this.center();
        if (this.state.scale > 1.01) this.zoomAt(1, cx, cy, true);
        else this.zoomAt(2.5, px ?? cx, py ?? cy, true);
    }

    rotate() {
        this.state.rot += 90;
        this.state.scale = 1;
        this.state.x = 0;
        this.state.y = 0;
        this.apply(true);
    }

    download() {
        const extMatch = String(this.full ?? '').split('?')[0].match(/\.(png|jpe?g|webp|gif|avif)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
        const name = `${this.title.replace(/[\\/:*?"<>|]+/g, '_') || 'picture'}.${ext}`;
        const link = h('a', { href: this.full, download: name });
        document.body.append(link);
        link.click();
        link.remove();
    }

    down(event) {
        try {
            this.stage.setPointerCapture?.(event.pointerId);
        } catch {
            // The pointer is already gone; carry on without capture.
        }
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.moved = false;
        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.state.scale };
        } else if (this.pointers.size === 1) {
            this.drag = { x: event.clientX, y: event.clientY, sx: this.state.x, sy: this.state.y };
            this.dismissY = 0;
        }
    }

    move(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 2 && this.pinch) {
            const [a, b] = [...this.pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            this.moved = true;
            if (this.pinch.dist > 0) this.zoomAt(this.pinch.scale * (dist / this.pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
            return;
        }
        if (this.pointers.size !== 1 || !this.drag) return;
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this.moved = true;
        if (this.state.scale > 1.01) {
            this.state.x = this.drag.sx + dx;
            this.state.y = this.drag.sy + dy;
            this.clamp();
            this.apply();
        } else if (dy > 0) {
            // Pull down to close, like a photo app.
            this.dismissY = dy;
            this.img.style.transition = 'none';
            this.img.style.transform = `translate(0, ${dy}px) scale(${1 - Math.min(dy, 300) / 1500}) rotate(${this.state.rot}deg)`;
            this.dialog.style.setProperty('--pt-viewer-fade', String(Math.max(0, 1 - dy / 350)));
        }
    }

    up(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.delete(event.pointerId);
        if (this.pointers.size < 2) this.pinch = null;
        if (this.pointers.size === 1) {
            // Re-anchor pan to the remaining finger so lifting one finger never snaps the image.
            const [remaining] = this.pointers.values();
            this.drag = { x: remaining.x, y: remaining.y, sx: this.state.x, sy: this.state.y };
            return;
        }
        if (this.pointers.size) return;
        this.drag = null;
        if (this.dismissY > 110) {
            closeViewer();
            return;
        }
        if (this.dismissY) {
            this.dismissY = 0;
            this.dialog.style.removeProperty('--pt-viewer-fade');
            this.apply(true);
            return;
        }
        if (this.moved || event.type !== 'pointerup') return;
        // Double tap zooms in on that spot; a single tap shows or hides the buttons.
        const now = Date.now();
        const near = Math.hypot(event.clientX - this.lastTap.x, event.clientY - this.lastTap.y) < 30;
        if (now - this.lastTap.t < 300 && near) {
            window.clearTimeout(this.tapTimer);
            this.lastTap.t = 0;
            this.toggleZoom(event.clientX, event.clientY);
            return;
        }
        this.lastTap = { t: now, x: event.clientX, y: event.clientY };
        this.tapTimer = window.setTimeout(() => this.dialog.classList.toggle('pt-viewer-bare'), 300);
    }
}

function openViewer(options) {
    const previousFocus = viewer ? viewer.returnFocus : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeViewer(true);
    viewer = new Viewer(options);
    viewer.returnFocus = previousFocus;
    document.body.append(viewer.dialog);
    viewer.dialog.showModal();
    syncToasts();
    requestAnimationFrame(() => viewer?.dialog.classList.add('pt-viewer-open'));
    scheduleHistorySync();
}

function closeViewer(immediate = false) {
    const current = viewer;
    if (!current || current.closing) return;
    current.closing = true;
    viewer = null;
    window.clearTimeout(current.tapTimer);
    const finish = () => {
        if (current.dialog.open) current.dialog.close();
        // Before removing it: the toast container may be inside and must go back to the page.
        syncToasts();
        current.dialog.remove();
        if (!immediate && !viewer && current.returnFocus?.isConnected && document.activeElement === document.body) {
            current.returnFocus.focus({ preventScroll: true });
        }
    };
    if (immediate) finish();
    else {
        current.dialog.style.pointerEvents = 'none';
        // New toasts during the fade-out go to the page, not into a dialog about to be removed.
        current.dialog.setAttribute('closing', '');
        syncToasts();
        current.dialog.classList.remove('pt-viewer-open');
        setTimeout(finish, 220);
    }
    scheduleHistorySync();
}

// -- translate the chat

/**
 * Uses SillyTavern's built-in Chat Translation (Google Translate through the
 * SillyTavern server by default, no key needed). The original text is never
 * changed: translations are shown on top, like SillyTavern's own feature, but
 * several messages are translated at once, newest first, so it feels instant.
 */
const translation = { running: false, cancel: false, status: null };
const TRANSLATE_WORKERS = 4;
const FALLBACK_LANGUAGES = [
    ['ar', 'Arabic'], ['zh-CN', 'Chinese (Simplified)'], ['nl', 'Dutch'], ['en', 'English'], ['fr', 'French'], ['de', 'German'],
    ['hi', 'Hindi'], ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['pl', 'Polish'],
    ['pt', 'Portuguese'], ['ru', 'Russian'], ['es', 'Spanish'], ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'],
];

async function translatorModule() {
    if (ctx().extensionSettings?.disabledExtensions?.includes('translate')) return null;
    try {
        const module = await import('/scripts/extensions/translate/index.js');
        return typeof module.translate === 'function' ? module : null;
    } catch {
        return null;
    }
}

function translateSettings() {
    return ctx().extensionSettings?.translate ?? null;
}

function languageOptions() {
    const select = document.getElementById('translation_target_language');
    if (select?.options.length) return Array.from(select.options).map(option => ({ value: option.value, label: option.textContent.trim() }));
    return FALLBACK_LANGUAGES.map(([value, label]) => ({ value, label }));
}

function languageName(code) {
    return languageOptions().find(language => language.value === code)?.label ?? code;
}

/** The language the chat is shown in right now, or null for the original. */
function chatLanguage() {
    const chat = ctx().chat ?? [];
    const translated = chat.find(message => message?.extra?.display_text);
    if (!translated) return null;
    return translated.extra.pt_lang ?? translateSettings()?.target_language ?? null;
}

function setTargetLanguage(code) {
    const options = translateSettings();
    if (options) {
        options.target_language = code;
        const select = document.getElementById('translation_target_language');
        if (select) select.value = code;
        ctx().saveSettingsDebounced?.();
    }
    settings.recentLanguages = [code, ...(settings.recentLanguages ?? []).filter(item => item !== code)].slice(0, 5);
    saveSettings();
}

function translateStatus(text, { done = false, failed = false } = {}) {
    let status = translation.status;
    if (!status) {
        status = h('div', { class: 'pt-banner pt-banner-info', role: 'status', 'aria-live': 'polite' }, [
            ui('languages', 'pt-banner-icon'),
            h('span', { class: 'pt-banner-text' }, [h('b'), h('small')]),
            h('button', {
                type: 'button',
                class: 'pt-banner-btn',
                onclick: () => {
                    translation.cancel = true;
                },
            }, [t('Stop')]),
        ]);
        shieldFromDrawerAutoClose(status);
        document.body.append(status);
        translation.status = status;
    }
    const [title, note] = status.querySelectorAll('.pt-banner-text > *');
    title.textContent = text;
    note.textContent = failed ? t('Some messages could not be translated. Check your internet connection.') : '';
    note.hidden = !failed;
    status.querySelector('.pt-banner-btn').hidden = done;
    status.classList.toggle('pt-banner-ok', done && !failed);
    window.clearTimeout(translation.hideTimer);
    translation.hideTimer = 0;
    if (done) {
        translation.hideTimer = window.setTimeout(() => {
            translation.hideTimer = 0;
            if (translation.status !== status || translation.running) return;
            status.classList.add('pt-banner-out');
            setTimeout(() => status.remove(), 250);
            translation.status = null;
        }, failed ? 5000 : 1800);
    }
}

// Google Translate straight from the browser: no detour through the SillyTavern
// server, and many messages in one request. A whole long chat is usually one or
// two requests, each well under a second.
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&format=html&tl=';
// The first batch is small so the messages on screen change almost at once.
const FIRST_BATCH_CHARS = 2500;
const BATCH_CHARS = 8000;
const BATCH_PARALLEL = 4;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

/**
 * Markdown and line breaks become HTML tags that Google keeps in place, so the
 * translation keeps its bold, italics, paragraphs and code. Code is not translated.
 */
function toTranslatable(text) {
    const kept = [];
    const html = String(text)
        // Code blocks and inline code stay exactly as written.
        .replace(/```[\s\S]*?```|`[^`\n]+`/g, match => {
            kept.push(match);
            return `<code translate="no">${kept.length - 1}</code>`;
        })
        // A stray & or < that is not part of an entity or a tag.
        .replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
        .replace(/<(?![a-zA-Z/!])/g, '&lt;')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
        .replace(/\n/g, '<br>');
    return { html, kept };
}

function fromTranslated(html, kept) {
    // Keep code placeholders protected until after tag/entity/space normalization so
    // code indentation and literal <b>/<i>/<br>/entities inside code blocks stay intact.
    let text = String(html)
        .replace(/<code translate="no">\s*(\d+)\s*<\/code>/gi, '\uE000CODE$1\uE001')
        // Google sometimes moves spaces inside the tags; move them back out.
        .replace(/<(b|i)>\s+/gi, ' <$1>')
        .replace(/\s+<\/(b|i)>/gi, '</$1> ')
        // …but no space between a closing tag and punctuation.
        .replace(/<\/(b|i)>\s+([.,!?;:)\]»”’。、！？])/gi, '</$1>$2')
        // A quote right after is a closing quote only when punctuation, a line break or the end follows.
        .replace(/<\/(b|i)>\s+(&quot;|&#39;|["'])(?=[.,!?;:]|\s*<br|\s*$)/gi, '</$1>$2')
        .replace(/<\/?b>/gi, '**')
        .replace(/<\/?i>/gi, '*')
        .replace(/[ \t]*<br\s*\/?>[ \t]?/gi, '\n')
        .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, entity => ENTITIES[entity] ?? entity);
    // Tidy doubled spaces the moves above can leave, without touching line breaks.
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n');
    text = text.replace(/\uE000CODE(\d+)\uE001/g, (match, index) => kept[Number(index)] ?? match);
    return text.trim();
}

async function googleTranslateBatch(texts, code) {
    const body = new URLSearchParams();
    for (const text of texts) body.append('q', text);
    const response = await fetch(GOOGLE_URL + encodeURIComponent(code), { method: 'POST', body });
    if (!response.ok) throw new Error(`Google answered ${response.status}`);
    const data = await response.json();
    // One text may come back as ["…", "en"]; several as [["…", "en"], …].
    const list = texts.length === 1 && !Array.isArray(data[0]) ? [data] : data;
    return list.map(item => (Array.isArray(item) ? item[0] : item));
}

function messageSource(message) {
    const context = ctx();
    return context.substituteParams ? context.substituteParams(message.mes, { name2Override: message.name }) : message.mes;
}

function applyTranslation(id, message, code, text) {
    if (typeof message.extra !== 'object' || !message.extra) message.extra = {};
    message.extra.display_text = text;
    message.extra.pt_lang = code;
    ctx().updateMessageBlock?.(Number(id), message);
}

/**
 * Translates the messages `ids` (newest first) into `code`.
 * Calls onProgress(done) as batches land and returns how many failed.
 */
async function translateMessages(ids, code, { onProgress = () => {}, isCancelled = () => false } = {}) {
    const provider = translateSettings()?.provider ?? 'google';
    let done = 0;
    let failed = 0;
    // Providers other than Google, or Google when the direct route fails: SillyTavern's own route.
    const slowRoute = async list => {
        const module = await translatorModule();
        if (!module) {
            failed += list.length;
            done += list.length;
            onProgress(done);
            return;
        }
        let next = 0;
        const worker = async () => {
            while (next < list.length && !isCancelled()) {
                const id = list[next++];
                const message = ctx().chat?.[id];
                if (!message) continue;
                try {
                    const translated = await module.translate(messageSource(message), code);
                    if (isCancelled()) return;
                    const currentMessage = ctx().chat?.[id];
                    if (currentMessage === message) applyTranslation(id, message, code, translated);
                } catch {
                    failed++;
                }
                done++;
                onProgress(done);
            }
        };
        await Promise.all(Array.from({ length: TRANSLATE_WORKERS }, worker));
    };
    if (provider !== 'google') {
        await slowRoute(ids);
        return failed;
    }
    // Pack messages into batches of about BATCH_CHARS, newest first.
    const batches = [];
    let current = [];
    let size = 0;
    for (const id of ids) {
        const message = ctx().chat?.[id];
        if (!message) continue;
        const prepared = toTranslatable(messageSource(message));
        const limit = batches.length ? BATCH_CHARS : FIRST_BATCH_CHARS;
        if (current.length && size + prepared.html.length > limit) {
            batches.push(current);
            current = [];
            size = 0;
        }
        current.push({ id, prepared });
        size += prepared.html.length;
    }
    if (current.length) batches.push(current);
    let next = 0;
    const worker = async () => {
        while (next < batches.length && !isCancelled()) {
            const batch = batches[next++];
            try {
                const out = await googleTranslateBatch(batch.map(item => item.prepared.html), code);
                if (isCancelled()) return;
                batch.forEach((item, index) => {
                    const message = ctx().chat?.[item.id];
                    if (message && typeof out[index] === 'string') applyTranslation(item.id, message, code, fromTranslated(out[index], item.prepared.kept));
                    else failed++;
                });
                done += batch.length;
                onProgress(done);
            } catch (error) {
                if (isCancelled()) return;
                console.debug(LOG, 'Direct Google Translate failed; using SillyTavern instead', error);
                await slowRoute(batch.map(item => item.id));
            }
        }
    };
    await Promise.all(Array.from({ length: BATCH_PARALLEL }, worker));
    return failed;
}

async function translateChat(code) {
    if (translation.running) return;
    const provider = translateSettings()?.provider ?? 'google';
    if (provider !== 'google' && !(await translatorModule())) {
        globalThis.toastr?.error(t('Turn on "Chat Translation" in Extensions → Manage extensions.'), t('Translation is off'));
        return;
    }
    setTargetLanguage(code);
    const context = ctx();
    const chat = context.chat ?? [];
    const chatId = context.getCurrentChatId?.();
    const todo = [];
    // Newest first: the messages on screen change right away.
    for (let id = chat.length - 1; id >= 0; id--) {
        const message = chat[id];
        if (!message || message.is_system || !String(message.mes ?? '').trim()) continue;
        if (message.extra?.display_text && message.extra?.pt_lang === code) continue;
        todo.push(id);
    }
    const name = languageName(code);
    if (!todo.length) {
        translateStatus(t('Already in {lang}', { lang: name }), { done: true });
        return;
    }
    translation.running = true;
    translation.cancel = false;
    const total = todo.length;
    let failed = 0;
    translateStatus(t('Translating to {lang}… {done}/{total}', { lang: name, done: 0, total }));
    try {
        failed = await translateMessages(todo, code, {
            isCancelled: () => !active || translation.cancel || ctx().getCurrentChatId?.() !== chatId,
            onProgress: done => {
                if (!translation.cancel) translateStatus(t('Translating to {lang}… {done}/{total}', { lang: name, done, total }));
            },
        });
    } finally {
        translation.running = false;
    }
    if (ctx().getCurrentChatId?.() === chatId) await ctx().saveChat?.();
    shell?.update();
    // Every message changed its text, so its height too.
    primeChatSizes();
    if (translation.cancel) translateStatus(t('Translation stopped'), { done: true });
    else translateStatus(failed === total ? t('Could not reach the translator') : t('Chat shown in {lang}', { lang: name }), { done: true, failed: failed > 0 });
}

/** New, edited and swiped messages follow the chat's language while "Translate new messages too" is on. */
const autoQueue = new Set();
let autoTimer = 0;

function queueAutoTranslate(id) {
    if (!active || !settings.autoTranslate) return;
    const code = chatLanguage();
    const chatId = ctx().getCurrentChatId?.();
    if (!code) return;
    autoQueue.add(Number(id));
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(async () => {
        autoTimer = 0;
        if (!active || ctx().getCurrentChatId?.() !== chatId) {
            autoQueue.clear();
            return;
        }
        const ids = [...autoQueue].filter(item => {
            const message = ctx().chat?.[item];
            return message && !message.is_system && String(message.mes ?? '').trim();
        }).sort((a, b) => b - a);
        autoQueue.clear();
        if (!ids.length) return;
        await translateMessages(ids, code, {
            isCancelled: () => !active || ctx().getCurrentChatId?.() !== chatId || chatLanguage() !== code,
        });
        if (active && ctx().getCurrentChatId?.() === chatId) await ctx().saveChat?.();
    }, 150);
}

/** An edited or swiped message must not keep showing its old translation. */
function dropTranslation(id) {
    const message = ctx().chat?.[Number(id)];
    if (!message?.extra?.pt_lang) return;
    delete message.extra.display_text;
    delete message.extra.pt_lang;
}

async function showOriginal() {
    translation.cancel = true;
    const context = ctx();
    let changed = false;
    (context.chat ?? []).forEach((message, id) => {
        if (!message?.extra?.display_text && !message?.extra?.reasoning_display_text) return;
        delete message.extra.display_text;
        delete message.extra.reasoning_display_text;
        delete message.extra.pt_lang;
        context.updateMessageBlock?.(id, message);
        changed = true;
    });
    if (changed) await context.saveChat?.();
    shell?.update();
    if (changed) primeChatSizes();
    translateStatus(t('Showing the original text'), { done: true });
}

function setAutoTranslate(on) {
    settings.autoTranslate = on;
    saveSettings();
    // Pocket Tavern translates new messages itself (faster); keep SillyTavern's own auto mode off so it is not done twice.
    const options = translateSettings();
    if (options && options.auto_mode !== 'none') {
        options.auto_mode = 'none';
        const select = document.getElementById('translation_auto_mode');
        if (select) select.value = 'none';
        ctx().saveSettingsDebounced?.();
    }
}

/** The language one tap translates to: the last one picked in the sheet. */
function quickLanguage() {
    return settings.recentLanguages?.[0] ?? null;
}

/** One tap: translate the chat, show the original again, or stop a running translation. */
function quickTranslate() {
    const inChat = !!(ctx().groupId || ctx().characterId !== undefined);
    if (!inChat) {
        globalThis.toastr?.info(t('Open a chat first.'));
        return;
    }
    if (translation.running) {
        translation.cancel = true;
        return;
    }
    if (chatLanguage()) {
        showOriginal();
        return;
    }
    const code = quickLanguage();
    if (code) translateChat(code);
    else openTranslateSheet();
}

/**
 * SillyTavern's own "Translate Chat" in the ✨ menu translates one message at a
 * time. While Pocket Tavern is on, that item does the same one-tap translate as the
 * button in the top bar.
 */
function onWandTranslateClick(event) {
    if (!active || !(event.target instanceof Element) || !event.target.closest('#translate_chat')) return;
    event.preventDefault();
    event.stopPropagation();
    // Stopping the click also stops SillyTavern from closing the menu; close it the same way it would.
    const menu = document.getElementById('extensionsMenu');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('extensionsMenuButton')?.click();
    quickTranslate();
}

function openTranslateSheet() {
    const current = chatLanguage();
    const inChat = !!(ctx().groupId || ctx().characterId !== undefined);
    showSheet(new MenuSheet({
        title: t('Translate chat'),
        subtitle: current ? t('Showing {lang}. The original text is kept.', { lang: languageName(current) }) : t('Pick a language. The original text is kept.'),
        fill: body => {
            if (!inChat) {
                body.append(h('p', { class: 'pt-menu-foot', text: t('Open a chat first.') }));
                return;
            }
            const top = [];
            if (current) {
                top.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        showOriginal();
                    },
                }, [ui('reset', 'pt-menu-row-icon'), h('span', { text: t('Show original') })]));
            }
            const auto = h('input', { type: 'checkbox', class: 'pt-switch', role: 'switch' });
            auto.checked = !!settings.autoTranslate;
            auto.addEventListener('change', () => setAutoTranslate(auto.checked));
            top.push(h('label', { class: 'pt-switch-row' }, [
                h('span', { class: 'pt-switch-text' }, [h('span', { text: t('Translate new replies too') }), h('small', { text: t('Each new reply is shown in the chosen language.') })]),
                auto,
            ]));
            body.append(h('div', { class: 'pt-menu-list' }, top));

            const all = languageOptions();
            const recent = (settings.recentLanguages ?? []).map(code => all.find(language => language.value === code)).filter(Boolean);
            const languageRow = language => h('button', {
                type: 'button',
                class: `pt-menu-row pt-choice ${language.value === current ? 'pt-choice-on' : ''}`,
                'data-search': normalizeText(`${language.label} ${language.value}`),
                onclick: () => {
                    closeSheet(true);
                    buzz(8);
                    translateChat(language.value);
                },
            }, [h('span', { raw: language.label }), language.value === current ? ui('check', 'pt-menu-row-icon') : null]);
            const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search languages'), 'aria-label': t('Search languages') });
            const recentBlock = recent.length ? [h('p', { class: 'pt-menu-heading', text: t('Recent') }), h('div', { class: 'pt-menu-list' }, recent.map(languageRow))] : [];
            const allRows = all.map(languageRow);
            const allHeading = h('p', { class: 'pt-menu-heading', text: t('All languages') });
            const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
            search.addEventListener('input', () => {
                const words = normalizeText(search.value).split(/\s+/).filter(Boolean);
                let shown = 0;
                for (const row of allRows) {
                    const ok = words.every(word => row.dataset.search.includes(word));
                    row.hidden = !ok;
                    if (ok) shown++;
                }
                for (const element of recentBlock) element.hidden = words.length > 0;
                empty.hidden = shown > 0;
            });
            body.append(h('p', { class: 'pt-menu-heading', text: t('Languages') }), search, ...recentBlock, allHeading, h('div', { class: 'pt-menu-list' }, allRows), empty);
            const provider = translateSettings()?.provider ?? 'google';
            const providerName = { google: 'Google Translate', deepl: 'DeepL', bing: 'Bing', yandex: 'Yandex', libre: 'LibreTranslate', lingva: 'Lingva', deeplx: 'DeepLX', oneringtranslator: 'OneRingTranslator' }[provider] ?? provider;
            body.append(h('p', { class: 'pt-menu-foot', text: t('Tip: tap the translate button to switch between your language and the original. Hold it to open this list.') }));
            // Google is asked straight from this browser (see GOOGLE_URL); the others go through SillyTavern's server.
            body.append(h('p', {
                class: 'pt-menu-foot',
                text: provider === 'google'
                    ? t('Uses Google Translate, asked straight from this browser. You can pick another service in Extensions → Chat Translation.')
                    : t('Uses {provider} through your SillyTavern server. You can change it in Extensions → Chat Translation.', { provider: providerName }),
            }));
        },
    }));
}

// -- characters page: labeled card tools, tabs, favorites captions, A–Z strip

const CARD_TOOLS = [
    ['#favorite_button', 'Favorite'],
    ['#advanced_div', 'Advanced'],
    ['#world_button', 'Lore'],
    ['.chat_lorebook_button', 'Chat lore'],
    ['#char_connections_button', 'Personas'],
    ['#export_button', 'Export'],
    ['#dupe_button', 'Duplicate'],
    ['#delete_button', 'Delete'],
    ['#create_button_label', 'Create'],
];
const CARD_TABS = [['desc', 'Description'], ['greet', 'First message'], ['notes', 'Notes & tags']];
const chars = { observer: null, listObserver: null, azTimer: 0, tab: 'desc', passTap: false, peek: null };

/**
 * Export on a character card: SillyTavern opens a tiny PNG / JSON list next to the button, which
 * on the card's tool grid overlapped the buttons around it (Kahvana's feedback). It is a sheet
 * (a dialog on a computer) instead; picking a format clicks SillyTavern's own choice.
 */
function onExportClick(event) {
    if (!active || !settings.touchSizing || !settings.charPage) return;
    if (!event.target.closest?.('#export_button')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pick = format => {
        closeSheet(true);
        if (peekedChid() !== null) {
            exportCardCharacter(format);
            return;
        }
        document.querySelector(`#export_format_popup .export_format[data-format="${format}"]`)?.click();
    };
    const row = (format, iconName, note) => h('button', { type: 'button', class: 'pt-menu-row', onclick: () => pick(format) }, [
        ui(iconName, 'pt-menu-row-icon'),
        h('span', { class: 'pt-row-text' }, [h('span', { raw: format.toUpperCase() }), h('small', { text: note })]),
    ]);
    showSheet(new MenuSheet({
        title: t('Export character'),
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, [
            row('png', 'image', 'A picture card with everything inside. Most apps can open it.'),
            row('json', 'file-text', "The character's details as a text file."),
        ])),
    }));
}

// -- characters page: a character's sheet before its chat

/**
 * Tapping a character in the list shows its sheet (a dialog on a computer): picture, a few
 * words about them, Chat, New chat and Edit, and their recent chats with the last message of
 * each. Nothing changes until you pick something. Groups, bulk select and the favourite star
 * keep SillyTavern's own behaviour.
 */
function onCharacterTap(event) {
    if (!active || !settings.touchSizing || !settings.charPage || !settings.charPreview || chars.passTap) return;
    const entry = event.target.closest?.('#rm_print_characters_block .character_select');
    if (!entry || event.target.closest('.ch_fav_icon, .tag, .bulk_select_checkbox')) return;
    if (document.querySelector('#rm_print_characters_block.group_overlay_mode_select')) return;
    const chid = Number(entry.dataset.chid);
    if (!Number.isInteger(chid) || !ctx().characters?.[chid]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(6);
    openCharacterSheet(entry, chid);
}

async function fetchCharacterChats(avatar) {
    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!data || typeof data !== 'object' || data.error) return [];
    return Object.values(data)
        .filter(chat => chat?.file_name)
        .sort((a, b) => (Number(b.last_mes) || 0) - (Number(a.last_mes) || 0));
}

/** Runs `then` once SillyTavern has switched chats (or after a while, if it never says so). */
function afterChatChange(then) {
    const context = ctx();
    const eventName = context.eventTypes?.CHAT_CHANGED;
    let done = false;
    const once = () => {
        if (done) return;
        done = true;
        if (eventName) context.eventSource?.removeListener?.(eventName, once);
        setTimeout(then, 150);
    };
    if (eventName) context.eventSource?.on?.(eventName, once);
    setTimeout(once, 2500);
}

/**
 * Opens a chat with this character: the list tap SillyTavern and Pocket Tavern already know
 * (on a phone the page closes into the chat; on a computer the card stays beside it), then the
 * chosen chat if it is not their latest, then `then`.
 */
function chatWithCharacter(entry, chid, fileId, then) {
    closeSheet(true);
    const context = ctx();
    const same = !context.groupId && context.characterId !== undefined && String(context.characterId) === String(chid);
    const finish = async () => {
        try {
            if (fileId && ctx().characters[chid]?.chat !== fileId) await ctx().openCharacterChat(fileId);
        } catch (error) {
            console.warn(LOG, 'Could not open that chat', error);
        }
        then?.();
    };
    if (!same) afterChatChange(finish);
    chars.passTap = true;
    try {
        if (entry?.isConnected) entry.click();
        else context.selectCharacterById(String(chid));
    } finally {
        chars.passTap = false;
    }
    // Already their chat: no switch happens, so carry on now (on a phone, back to the chat).
    if (same) {
        finish().then(() => {
            if (!isWide()) closePages();
        });
    }
}

/**
 * Edit a character's card without opening their chat. The card is SillyTavern's own form, filled
 * the way SillyTavern fills it for a group member it shows without their chat
 * (select_selected_character); the chat you are in, and SillyTavern's current character, stay as
 * they are. Fields, the picture, Favorite, Advanced and alternate greetings save to this
 * character (SillyTavern saves the form). Export downloads this character's file. The buttons
 * that in SillyTavern act on the character whose chat is open (Delete, Duplicate, Lore, Chat lore,
 * Personas, tags, Ext. Media, More…) open their chat first, then do their job: only those, and
 * Chat, open it.
 */
async function editCharacter(chid) {
    closeSheet(true);
    if (shell) shell.jumpAt = 0;
    const context = ctx();
    endCardPeek();
    if (!context.groupId && context.characterId !== undefined && String(context.characterId) === String(chid)) {
        await context.selectCharacterById(String(chid));
        return;
    }
    try {
        const st = await import('/script.js');
        if (typeof st.select_selected_character !== 'function') throw new Error('select_selected_character is missing');
        await st.unshallowCharacter?.(chid);
        st.select_selected_character(chid);
        const tags = await import('/scripts/tags.js').catch(() => null);
        tags?.applyTagsOnCharacterSelect?.(chid);
        chars.peek = { chid: String(chid), avatar: context.characters[chid]?.avatar };
        document.documentElement.classList.add('pt-card-peek');
        syncCharacterPage();
        shell?.update();
    } catch (error) {
        // An older or newer SillyTavern without these: open the card the usual way.
        console.warn(LOG, 'Could not open the card on its own', error);
        endCardPeek();
        await context.selectCharacterById(String(chid));
    }
}

/** The character whose card is open without their chat, or null. Checked live, never trusted. */
function peekedChid() {
    const peek = chars.peek;
    if (!peek) return null;
    const context = ctx();
    const character = context.characters?.[peek.chid];
    const shownAvatar = document.getElementById('avatar_url_pole')?.value;
    if (!character || character.avatar !== peek.avatar || shownAvatar !== peek.avatar) return null;
    if (!context.groupId && String(context.characterId) === peek.chid) return null;
    return peek.chid;
}

/**
 * Ends the card-only view. SillyTavern's form is put back on the character whose chat is open,
 * so nothing can act on the wrong character afterwards (with Pocket Tavern off, too).
 */
function endCardPeek() {
    const had = !!chars.peek;
    chars.peek = null;
    document.documentElement.classList.remove('pt-card-peek');
    if (!had) return;
    const context = ctx();
    if (context.groupId || context.characterId === undefined) return;
    import('/script.js').then(st => st.select_selected_character?.(context.characterId, { switchMenu: false })).catch(() => {});
}

/** Called as pages change: leaving the card (or another card opening) ends the card-only view. */
function checkCardPeek() {
    if (!chars.peek) return;
    const editorShown = currentPageId() === 'rightNavHolder' && isShown(document.getElementById('rm_ch_create_block'));
    if (!editorShown || !peekedChid()) endCardPeek();
}

/** Opens this character's chat (the list tap: on a phone the page closes into it unless asked not to). */
function openCharacterChatFor(chid, { stay = false, fileId = null, then = null } = {}) {
    const context = ctx();
    endCardPeek();
    if (shell) shell.jumpAt = stay || isWide() ? 0 : Date.now();
    const finish = async () => {
        try {
            if (fileId && ctx().getCurrentChatId?.() !== fileId) await ctx().openCharacterChat(fileId);
        } catch (error) {
            console.warn(LOG, 'Could not open that chat', error);
        }
        if (!stay && !isWide()) closePages();
        then?.();
    };
    if (!context.groupId && String(context.characterId) === String(chid)) {
        finish();
        return;
    }
    afterChatChange(finish);
    context.selectCharacterById(String(chid));
}

const CARD_NEEDS_CHAT = '#delete_button, #dupe_button, #world_button, .chat_lorebook_button, #char_connections_button, #tagInput, #character_open_media_overrides, #char-management-dropdown';

/** On the card-only view, a button that needs the chat opens it, then does its job. */
function onCardPeekPress(event) {
    if (!active || !chars.peek) return;
    const target = event.target.closest?.(CARD_NEEDS_CHAT);
    if (!target || !target.closest('#rm_ch_create_block')) return;
    const chid = peekedChid();
    if (chid === null) return;
    // A dropdown opens (and a text box takes the focus) on the press, before any click: those are
    // caught on pointerdown, buttons on click.
    const isSelect = target.matches('select, input');
    event.preventDefault();
    event.stopImmediatePropagation();
    if ((event.type === 'pointerdown') !== isSelect) return;
    const name = ctx().characters[chid]?.name ?? '';
    globalThis.toastr?.info(t("This needs {name}'s chat, so it is open now.", { name }), '', { timeOut: 4000 });
    openCharacterChatFor(chid, {
        stay: true,
        // A dropdown or a text box gets the focus back; a button is pressed again.
        then: () => {
            const again = target.id ? document.getElementById(target.id) : document.querySelector(CARD_NEEDS_CHAT.split(', ').find(selector => target.matches(selector)));
            if (!again) return;
            if (isSelect) again.focus();
            else again.click();
        },
    });
}

/** Export on the card-only view: SillyTavern's export, for this character. */
async function exportCardCharacter(format) {
    const chid = peekedChid();
    const character = chid === null ? null : ctx().characters[chid];
    if (!character) return false;
    try {
        const response = await fetch('/api/characters/export', {
            method: 'POST',
            headers: ctx().getRequestHeaders(),
            body: JSON.stringify({ format, avatar_url: character.avatar }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = character.avatar.replace(/\.png$/i, `.${format}`);
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
        console.warn(LOG, 'Export failed', error);
        globalThis.toastr?.error(t('Could not export the character.'));
    }
    return true;
}

/** On the card: Chat (their latest chat) and Recent chats (pick one). */
function buildCardGo() {
    const chat = h('button', {
        type: 'button',
        class: 'pt-card-go-btn pt-card-go-chat',
        onclick: () => {
            buzz(6);
            const chid = peekedChid() ?? ctx().characterId;
            if (chid !== undefined && chid !== null) openCharacterChatFor(chid);
        },
    }, [ui('chat'), h('span', { text: 'Chat' })]);
    const recent = h('button', {
        type: 'button',
        class: 'pt-card-go-btn',
        onclick: () => {
            buzz(6);
            openCardChats();
        },
    }, [ui('history'), h('span', { text: 'Recent chats' })]);
    return h('div', { id: 'pt_card_go', class: 'pt-card-go' }, [chat, recent]);
}

/** The card's character's chats, newest first; picking one keeps you in it. */
function openCardChats() {
    const context = ctx();
    const chid = peekedChid() ?? context.characterId;
    const character = context.characters?.[chid];
    if (!character) return;
    const state = { chats: null };
    const instance = new MenuSheet({
        title: 'Recent chats',
        fill: body => {
            if (!state.chats) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'Loading chats…' }));
                return;
            }
            if (!state.chats.length) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'No chats yet.' }));
                return;
            }
            const list = h('div', { class: 'pt-cs-chats' });
            for (const chat of state.chats.slice(0, 20)) {
                const fileId = String(chat.file_id ?? chat.file_name).replace(/\.jsonl$/i, '');
                const when = Number(chat.last_mes) ? new Date(Number(chat.last_mes)).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
                const line = h('span', { class: 'pt-rc-line' }, [titleNode('b', 'pt-rc-title', fileId), h('small', { class: 'pt-rc-when', raw: when })]);
                if (String(ctx().characterId) === String(chid) && ctx().getCurrentChatId?.() === fileId) line.append(h('span', { class: 'pt-rc-now', text: 'Open now' }));
                const meta = h('small', { class: 'pt-rc-meta' });
                const count = Number(chat.chat_items);
                if (Number.isFinite(count)) meta.append(h('span', { text: messageCount(count) }));
                list.append(h('button', {
                    type: 'button',
                    class: 'pt-rc pt-cs-chat',
                    onclick: () => {
                        buzz(6);
                        closeSheet(true);
                        openCharacterChatFor(chid, { fileId });
                    },
                }, [h('span', { class: 'pt-rc-body' }, [line, previewBubble(chat.mes ?? ''), meta])]));
            }
            body.append(list);
        },
    });
    // The character's name is shown as it is.
    instance.subtitle.textContent = character.name;
    showSheet(instance);
    fetchCharacterChats(character.avatar).catch(() => []).then(chats => {
        state.chats = chats;
        if (sheet === instance && !instance.closing) instance.refresh();
    });
}

function aboutCharacter(character) {
    const context = ctx();
    const raw = character.data?.creator_notes || character.creatorcomment || character.description || '';
    let text = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    try {
        if (text && typeof context.substituteParams === 'function') text = context.substituteParams(text, undefined, character.name);
    } catch {
        // Keep the text as written.
    }
    return text.length > 280 ? `${text.slice(0, 280).trimEnd()}…` : text;
}

function openCharacterSheet(entry, chid) {
    const context = ctx();
    const character = context.characters[chid];
    const state = { chats: null };
    const instance = new MenuSheet({
        title: 'Character',
        fill: body => fillCharacterSheet(body, { entry, chid, character, chats: state.chats }),
    });
    instance.dialog.classList.add('pt-char-sheet');
    // A character's name is shown as it is, never translated.
    instance.title.textContent = character.name;
    instance.title.dir = 'auto';
    instance.dialog.setAttribute('aria-label', character.name);
    showSheet(instance);
    fetchCharacterChats(character.avatar).catch(() => []).then(chats => {
        state.chats = chats;
        if (sheet === instance && !instance.closing) instance.refresh();
    });
}

function fillCharacterSheet(body, { entry, chid, character, chats }) {
    const context = ctx();
    // Who they are.
    const picture = h('img', { class: 'pt-cs-avatar', alt: '', loading: 'lazy' });
    picture.src = context.getThumbnailUrl?.('avatar', character.avatar) ?? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`;
    picture.addEventListener('error', () => picture.classList.add('pt-cs-avatar-missing'), { once: true });
    const about = aboutCharacter(character);
    const hero = h('div', { class: 'pt-cs-hero' }, [picture]);
    if (about) {
        const text = h('p', { class: 'pt-cs-about' });
        text.append(formatPreview(about));
        text.dir = 'auto';
        hero.append(text);
    }
    body.append(hero);

    // What to do.
    const action = (iconName, label, run, primary = false) => h('button', {
        type: 'button',
        class: `pt-cs-action${primary ? ' pt-cs-primary' : ''}`,
        onclick: () => {
            buzz(6);
            run();
        },
    }, [ui(iconName), h('span', { text: label })]);
    body.append(h('div', { class: 'pt-cs-actions' }, [
        action('chat', 'Chat', () => chatWithCharacter(entry, chid, null), true),
        action('chat-plus', 'New chat', () => chatWithCharacter(entry, chid, null, () => document.getElementById('option_start_new_chat')?.click())),
        action('pencil', 'Edit', () => editCharacter(chid)),
    ]));

    // Their chats, newest first.
    body.append(h('p', { class: 'pt-recent-heading pt-cs-heading', text: 'Recent chats' }));
    if (!chats) {
        body.append(h('p', { class: 'pt-menu-foot', text: 'Loading chats…' }));
        return;
    }
    if (!chats.length) {
        body.append(h('p', { class: 'pt-menu-foot', text: 'No chats yet. Chat starts the first one.' }));
        return;
    }
    const list = h('div', { class: 'pt-cs-chats' });
    for (const chat of chats.slice(0, 5)) {
        const fileId = String(chat.file_id ?? chat.file_name).replace(/\.jsonl$/i, '');
        const when = Number(chat.last_mes) ? new Date(Number(chat.last_mes)).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
        const line = h('span', { class: 'pt-rc-line' }, [titleNode('b', 'pt-rc-title', fileId), h('small', { class: 'pt-rc-when', raw: when })]);
        if (character.chat === fileId) line.append(h('span', { class: 'pt-rc-now', text: 'Latest' }));
        const meta = h('small', { class: 'pt-rc-meta' });
        const count = Number(chat.chat_items);
        if (Number.isFinite(count)) meta.append(h('span', { text: messageCount(count) }));
        list.append(h('button', {
            type: 'button',
            class: 'pt-rc pt-cs-chat',
            onclick: () => {
                buzz(6);
                chatWithCharacter(entry, chid, fileId);
            },
        }, [h('span', { class: 'pt-rc-body' }, [line, previewBubble(chat.mes ?? ''), meta])]));
    }
    body.append(list);
    if (chats.length > 5) {
        body.append(h('button', {
            type: 'button',
            class: 'pt-cs-all menu_button',
            onclick: () => chatWithCharacter(entry, chid, null, () => document.getElementById('option_select_chat')?.click()),
        }, [ui('history'), h('span', { text: t('All chats ({count})', { count: chats.length }) })]));
    }
}

function displayName(title) {
    return String(title ?? '').split('\n')[0].replace(/^\[[^\]]+\]\s*/, '').trim();
}

function syncCharacterPage() {
    const form = document.getElementById('form_create');
    const want = active && settings.touchSizing && settings.charPage;
    document.documentElement.classList.toggle('pt-charpage', !!want);
    if (!want) {
        window.clearTimeout(chars.azTimer);
        chars.azTimer = 0;
        restoreCharToolbar();
        document.getElementById('rm_characters_block')?.classList.remove('pt-one-page');
        document.querySelectorAll('.pt-btn-label, #pt_card_tabs, .pt-hero-name, #pt_card_go, .pt-cap, #pt_az, #pt_az_bubble').forEach(node => node.remove());
        endCardPeek();
        form?.classList.remove('pt-ctab-desc', 'pt-ctab-greet', 'pt-ctab-notes');
        chars.observer?.disconnect();
        chars.listObserver?.disconnect();
        chars.observer = null;
        chars.listObserver = null;
        return;
    }
    buildCharToolbar();
    updateCharPaging();
    if (!form) return;

    // Each card tool gets a short label under its icon.
    for (const [selector, label] of CARD_TOOLS) {
        const button = form.querySelector(selector);
        if (button && !button.querySelector('.pt-btn-label')) button.append(h('span', { class: 'pt-btn-label', text: label }));
    }


    // The name, big, under the avatar.
    const avatarLabel = document.getElementById('avatar_div_div');
    let heroName = form.querySelector('.pt-hero-name');
    if (avatarLabel && !heroName) {
        heroName = h('div', { class: 'pt-hero-name' });
        avatarLabel.after(heroName);
    }
    if (heroName) {
        const creating = isShown(document.getElementById('name_div'));
        heroName.hidden = creating;
        heroName.textContent = document.getElementById('character_name_pole')?.value?.trim() || '';
        // Chat and Recent chats, while editing a character (not a new one, not a group member).
        let go = document.getElementById('pt_card_go');
        if (!go) {
            go = buildCardGo();
            heroName.after(go);
        }
        go.hidden = creating || !!ctx().groupId;
    }

    // Description, first message and notes on tabs instead of one long scroll.
    if (!document.getElementById('pt_card_tabs')) {
        const bar = h('div', { id: 'pt_card_tabs', class: 'pt-segmented pt-card-tabs', role: 'tablist' },
            CARD_TABS.map(([key, label]) => h('button', {
                type: 'button',
                role: 'tab',
                class: 'pt-seg',
                'data-tab': key,
                onclick: () => setCardTab(key),
            }, [label])));
        const anchor = document.getElementById('spoiler_free_desc') ?? document.getElementById('descriptionWrapper');
        anchor?.before(bar);
    }
    setCardTab(chars.tab, false);

    // Favorites strip: names under the round avatars.
    captionFavorites();
    if (!chars.observer) {
        chars.observer = new MutationObserver(() => captionFavorites());
        const wrapper = document.getElementById('HotSwapWrapper');
        if (wrapper) chars.observer.observe(wrapper, { childList: true, subtree: true });
    }
    // The list re-renders on search, sort and paging: rebuild the A–Z strip each time.
    if (!chars.listObserver) {
        const list = document.getElementById('rm_print_characters_block');
        if (list) {
            chars.listObserver = new MutationObserver(() => {
                window.clearTimeout(chars.azTimer);
                chars.azTimer = window.setTimeout(() => {
                    buildAzStrip();
                    updateCharPaging();
                    updateCharToolbar();
                }, 150);
            });
            chars.listObserver.observe(list, { childList: true });
            // Once: the observer is made again each time the character pages are switched back on.
            wireOnce(document.getElementById('character_sort_order'), 'change', () => setTimeout(buildAzStrip, 300));
        }
    }
    buildAzStrip();
}

/**
 * One tidy row above the character list: search, sort, grid/list and a ＋ menu
 * with everything SillyTavern spreads over several rows of small buttons.
 * SillyTavern's own buttons stay in the page (hidden) and do the actual work.
 */
function buildCharToolbar() {
    const top = document.getElementById('charListFixedTop');
    const search = document.getElementById('character_search_bar');
    if (!top || !search) return;
    let bar = document.getElementById('pt_char_toolbar');
    if (!bar) {
        const button = (iconName, label, onclick, extra = '') => h('button', {
            type: 'button', class: `pt-ctool ${extra}`, 'aria-label': label, title: label, onclick,
        }, [ui(iconName)]);
        bar = h('div', { id: 'pt_char_toolbar', class: 'pt-char-toolbar' }, [
            h('div', { class: 'pt-ctool-search' }),
            button('sort', 'Sort', () => openSortSheet(), 'pt-ctool-sort'),
            button('grid', 'Grid or list', () => {
                buzz(6);
                document.getElementById('charListGridToggle')?.click();
                setTimeout(updateCharToolbar, 50);
            }, 'pt-ctool-view'),
            button('plus', 'Add and more', () => openCharActions(), 'pt-ctool-add'),
        ]);
        shieldFromDrawerAutoClose(bar);
        top.prepend(bar);
    }
    // SillyTavern's search box moves into the row (it goes back when Pocket Tavern is turned off).
    const slot = bar.querySelector('.pt-ctool-search');
    if (search.parentElement !== slot) {
        // Where it was, so turning off puts it back in the same place, not at the end of the form.
        charSearchHome.parent = search.parentElement;
        charSearchHome.next = search.nextSibling;
        slot.append(search);
    }
    updateCharToolbar();
}

const charSearchHome = { parent: null, next: null };

function updateCharToolbar() {
    const bar = document.getElementById('pt_char_toolbar');
    if (!bar) return;
    const grid = document.body.classList.contains('charListGrid');
    const view = bar.querySelector('.pt-ctool-view');
    const icon = grid ? 'list' : 'grid';
    if (view && view.dataset.icon !== icon) {
        view.dataset.icon = icon;
        view.replaceChildren(ui(icon));
        const label = t(grid ? 'Show as list' : 'Show as grid');
        view.setAttribute('aria-label', label);
        view.setAttribute('title', label);
    }
    const sort = document.getElementById('character_sort_order');
    const sortButton = bar.querySelector('.pt-ctool-sort');
    if (sort && sortButton) sortButton.title = `${t('Sort')}: ${sort.selectedOptions[0]?.textContent.trim() ?? ''}`;
}

function restoreCharToolbar() {
    const search = document.getElementById('character_search_bar');
    const form = document.getElementById('form_character_search_form');
    const { parent, next } = charSearchHome;
    if (search && parent?.isConnected && search.parentElement !== parent) parent.insertBefore(search, next?.parentNode === parent ? next : null);
    else if (search && form && !form.contains(search)) form.append(search);
    charSearchHome.parent = charSearchHome.next = null;
    document.getElementById('pt_char_toolbar')?.remove();
}

function openSortSheet() {
    const select = document.getElementById('character_sort_order');
    if (!select) return;
    openChoiceSheet({
        title: t('Sort characters'),
        options: Array.from(select.options).filter(option => !option.hidden && option.value !== 'Search').map(option => ({ value: option.value, label: option.textContent.trim() })),
        current: select.value,
        onPick: value => {
            pickFromSelect(select, value);
            setTimeout(() => {
                updateCharToolbar();
                buildAzStrip();
            }, 300);
        },
    });
}

/** Every button from SillyTavern's toolbar (and extensions that add one), with its name. */
function openCharActions() {
    const buttons = Array.from(document.querySelectorAll('#rm_button_bar > .menu_button, #rm_buttons_container > .menu_button'))
        .filter(button => button.style.display !== 'none' && !button.classList.contains('displayNone'));
    const nameOf = button => {
        const known = {
            rm_button_create: 'New character',
            character_import_button: 'Import from a file',
            external_import_button: 'Import from a link',
            rm_button_group_chats: 'New group chat',
        }[button.id];
        return known ? t(known) : (button.getAttribute('title') || '').split('\n')[0].trim() || t('Action');
    };
    showSheet(new MenuSheet({
        title: t('Characters'),
        subtitle: t('Add characters, groups and more'),
        fill: body => {
            const rows = buttons.map(button => {
                const faClass = Array.from(button.classList).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-fw'].includes(name));
                return h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        button.click();
                    },
                }, [faClass ? ui(faClass, 'pt-menu-row-icon') : ui('plus', 'pt-menu-row-icon'), h('span', { text: nameOf(button) })]);
            });
            const bulk = document.getElementById('bulkEditButton');
            if (bulk) {
                rows.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        bulk.click();
                    },
                }, [ui('check', 'pt-menu-row-icon'), h('span', { text: t('Select several') })]));
            }
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

/** Paging controls only matter when there is more than one page. */
function updateCharPaging() {
    if (!active || !settings.touchSizing || !settings.charPage) return;
    const holder = document.getElementById('rm_characters_block');
    if (!holder) return;
    const box = document.getElementById('rm_print_characters_pagination');
    // SillyTavern shows no page numbers here, only ‹ › and "1-25 .. 40", so look at those.
    const can = selector => {
        const item = box?.querySelector(selector);
        return !!item && !item.classList.contains('disabled');
    };
    const numbers = (box?.querySelector('.paginationjs-nav')?.textContent ?? '').match(/\d+/g)?.map(Number) ?? [];
    const many = box?.querySelectorAll('li.paginationjs-page').length > 1
        || can('.paginationjs-prev') || can('.paginationjs-next')
        || (numbers.length >= 3 && numbers[1] < numbers[2]);
    holder.classList.toggle('pt-one-page', !many);
}

function setCardTab(key, scroll = true) {
    chars.tab = key;
    const form = document.getElementById('form_create');
    if (!form) return;
    for (const [name] of CARD_TABS) form.classList.toggle(`pt-ctab-${name}`, name === key);
    for (const button of document.querySelectorAll('#pt_card_tabs .pt-seg')) {
        const on = button.dataset.tab === key;
        button.classList.toggle('pt-seg-on', on);
        button.setAttribute('aria-selected', String(on));
    }
    if (scroll) document.getElementById('pt_card_tabs')?.scrollIntoView({ block: 'nearest' });
}

function captionFavorites() {
    for (const avatar of document.querySelectorAll('#HotSwapWrapper .hotswap .avatar')) {
        if (avatar.querySelector('.pt-cap')) continue;
        const name = displayName(avatar.getAttribute('title'));
        if (name) avatar.append(h('span', { class: 'pt-cap', raw: name }));
    }
}

function letterOf(name) {
    const first = normalizeText(String(name ?? '').trim()).charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : '#';
}

/** A strip of letters on the right of the list; tap or slide to jump. Only for A–Z / Z–A order. */
function buildAzStrip() {
    const holder = document.getElementById('rm_characters_block');
    const list = document.getElementById('rm_print_characters_block');
    const old = document.getElementById('pt_az');
    const none = () => {
        old?.remove();
        document.getElementById('pt_az_bubble')?.remove();
    };
    if (!active || !settings.touchSizing || !settings.charPage || !holder || !list) return none();
    const sort = document.getElementById('character_sort_order')?.selectedOptions[0];
    if (sort?.dataset.field !== 'name' || sort?.dataset.order === 'random') return none();
    const entries = Array.from(list.querySelectorAll(':scope > .character_select, :scope > .group_select, :scope > .bogus_folder_select'));
    if (entries.length < 10) return none();
    const firstOf = new Map();
    for (const entry of entries) {
        const letter = letterOf(entry.querySelector('.ch_name')?.textContent);
        if (!firstOf.has(letter)) firstOf.set(letter, entry);
    }
    if (firstOf.size < 3) return none();
    const letters = Array.from(firstOf.keys());
    // Same letters as before (the list was only redrawn): keep the strip, just point it at the new entries.
    if (old && old.parentElement === holder && old.dataset.letters === letters.join('')) {
        old.ptFirst = firstOf;
        placeAzStrip(old, list, letters.length);
        return;
    }
    old?.remove();
    const strip = h('div', { id: 'pt_az', class: 'pt-az', role: 'navigation', 'aria-label': 'Jump to letter', 'data-letters': letters.join('') }, [
        // A soft light that glides to the letter under your finger (or mouse).
        h('i', { class: 'pt-az-glow', 'aria-hidden': 'true' }),
        ...letters.map(letter => h('span', { raw: letter, 'data-letter': letter })),
    ]);
    strip.ptFirst = firstOf;
    const spans = Array.from(strip.querySelectorAll('span'));
    let bubble = document.getElementById('pt_az_bubble');
    if (!bubble) {
        bubble = h('div', { id: 'pt_az_bubble', class: 'pt-az-bubble', 'aria-hidden': 'true' });
        holder.append(bubble);
    }
    let current = -1;
    let last = '';
    let dragging = false;
    let frame = 0;
    let pending = null;
    const indexAt = clientY => {
        const rect = strip.getBoundingClientRect();
        if (rect.height <= 0) return -1;
        return Math.max(0, Math.min(letters.length - 1, Math.floor(((clientY - rect.top) / rect.height) * letters.length)));
    };
    // Letters near the active one grow and lean out (distance 0-3), like a lens over the strip.
    const mark = index => {
        if (index === current) return;
        current = index;
        spans.forEach((span, i) => {
            const distance = index < 0 ? '' : String(Math.min(4, Math.abs(i - index)));
            if (span.dataset.d !== distance) span.dataset.d = distance;
        });
        if (index >= 0) strip.style.setProperty('--pt-az-y', `${spans[index].offsetTop + spans[index].offsetHeight / 2}px`);
        strip.classList.toggle('pt-az-on', index >= 0);
    };
    const jump = clientY => {
        const index = indexAt(clientY);
        if (index < 0) return;
        mark(index);
        // The bubble rides beside your finger, kept level with the strip.
        const holderTop = holder.getBoundingClientRect().top;
        const rect = strip.getBoundingClientRect();
        const y = Math.max(rect.top, Math.min(rect.bottom, clientY)) - holderTop;
        bubble.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
        const letter = letters[index];
        if (letter === last) return;
        last = letter;
        const target = strip.ptFirst.get(letter);
        if (target?.isConnected) list.scrollTop += target.getBoundingClientRect().top - list.getBoundingClientRect().top - 2;
        bubble.textContent = letter;
        bubble.classList.add('pt-az-bubble-on');
        buzz(4);
    };
    // Pointer moves come many per frame; act on the latest once a frame.
    const queue = (clientY, run) => {
        pending = { clientY, run };
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (pending && strip.isConnected) pending.run(pending.clientY);
            pending = null;
        });
    };
    strip.addEventListener('pointerdown', event => {
        event.preventDefault();
        try {
            strip.setPointerCapture?.(event.pointerId);
        } catch {
            // The pointer is already gone.
        }
        dragging = true;
        last = '';
        strip.classList.add('pt-az-active');
        jump(event.clientY);
    });
    strip.addEventListener('pointermove', event => {
        if (dragging) queue(event.clientY, jump);
        // A mouse over the strip: the lens follows it, and nothing scrolls until you press.
        else if (event.pointerType === 'mouse') queue(event.clientY, y => mark(indexAt(y)));
    });
    const end = event => {
        dragging = false;
        last = '';
        strip.classList.remove('pt-az-active');
        bubble.classList.remove('pt-az-bubble-on');
        // Only a mouse still over the strip keeps the lens. A finger lifts away, and phones keep
        // :hover on the last thing touched, so a touch always puts the strip back to rest.
        if (event?.pointerType !== 'mouse' || !strip.matches(':hover')) mark(-1);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) strip.addEventListener(type, end);
    strip.addEventListener('pointerleave', () => {
        if (!dragging) mark(-1);
    });
    shieldFromDrawerAutoClose(strip);
    holder.append(strip);
    placeAzStrip(strip, list, letters.length);
}

/** Sits exactly beside the list, below the controls. Only writes when the place changed. */
function placeAzStrip(strip, list, count) {
    const top = `${list.offsetTop + 6}px`;
    const height = `${Math.max(120, Math.min(list.clientHeight - 12, count * 26))}px`;
    if (strip.style.top !== top) strip.style.top = top;
    if (strip.style.height !== height) strip.style.height = height;
}

// -- recent chats: search, pinned section, swipe to pin or delete

const welcome = { observer: null };

// -- start screen: hide the message box for more room (both layouts)

const home = { observer: null };

function syncHomeBox() {
    const root = document.documentElement;
    let button = document.getElementById('pt_home_box');
    if (!active || !settings.chatStyle) {
        button?.remove();
        root.classList.remove('pt-home-nobox');
        home.observer?.disconnect();
        home.observer = null;
        return;
    }
    const chat = document.getElementById('chat');
    // The start screen comes and goes as chats open and close.
    if (chat && !home.observer) {
        home.observer = new MutationObserver(() => syncHomeBox());
        home.observer.observe(chat, { childList: true });
    }
    const panel = document.querySelector('#chat .welcomePanel');
    const hidden = !!settings.homeHideBox;
    root.classList.toggle('pt-home-nobox', hidden && !!panel);
    const header = panel?.querySelector('.welcomeHeaderTitle');
    if (!header) return;
    if (!button || !header.contains(button)) {
        button?.remove();
        button = h('div', {
            id: 'pt_home_box',
            class: 'mes_button pt-home-box',
            role: 'button',
            tabindex: '0',
            onclick: () => toggleHomeBox(),
            onkeydown: event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                toggleHomeBox();
            },
        });
        const anchor = header.querySelector('.showRecentChats');
        if (anchor) anchor.before(button);
        else header.append(button);
    }
    const label = t(hidden ? 'Show the message box' : 'Hide the message box');
    if (button.dataset.on !== String(hidden)) {
        button.dataset.on = String(hidden);
        button.replaceChildren(ui(hidden ? 'eye' : 'eye-off'));
    }
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(hidden));
}

function toggleHomeBox() {
    buzz(6);
    settings.homeHideBox = !settings.homeHideBox;
    saveSettings();
    syncHomeBox();
}

function syncWelcome() {
    const chat = document.getElementById('chat');
    const want = active && settings.chatStyle && settings.recentTools;
    if (!want) {
        welcome.observer?.disconnect();
        welcome.observer = null;
        for (const group of document.querySelectorAll('.pt-chat-group')) {
            group.querySelectorAll('.recentChat').forEach(card => group.before(card));
            group.remove();
        }
        document.querySelectorAll('.showMoreChats.pt-native-hidden').forEach(node => node.classList.remove('pt-native-hidden'));
        document.querySelectorAll('.pt-recent-search, .pt-recent-heading, .pt-recent-empty, .pt-swipe-hint').forEach(node => node.remove());
        document.querySelectorAll('.recentChat.pt-match, .recentChat.pt-nomatch').forEach(node => node.classList.remove('pt-match', 'pt-nomatch'));
        document.querySelectorAll('.recentChatList.pt-searching').forEach(node => node.classList.remove('pt-searching'));
        document.querySelectorAll('.welcomePanel[data-pt]').forEach(node => delete node.dataset.pt);
        undecorateRows(document.querySelector('#chat .welcomePanel') ?? document.createElement('div'));
        return;
    }
    if (chat && !welcome.observer) {
        welcome.observer = new MutationObserver(() => enhanceWelcome());
        welcome.observer.observe(chat, { childList: true, subtree: false });
    }
    enhanceWelcome();
}

function enhanceWelcome() {
    const panel = document.querySelector('#chat .welcomePanel');
    if (!panel || panel.dataset.pt === '1') return;
    const list = panel.querySelector('.recentChatList');
    if (!list) return;
    panel.dataset.pt = '1';
    const cards = Array.from(list.querySelectorAll('.recentChat'));

    // Pinned chats first under their own heading, as they are.
    const pinned = cards.filter(card => card.querySelector('.recentChatPinned'));
    const rest = cards.filter(card => !pinned.includes(card));
    if (pinned.length) pinned[0].before(h('p', { class: 'pt-recent-heading', text: 'Pinned' }));

    // The rest grouped by character (or group chat): one card each, newest first.
    const groups = new Map();
    for (const card of rest) {
        const key = card.dataset.group ? `g:${card.dataset.group}` : `c:${card.dataset.avatar}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(card);
    }
    if (groups.size) {
        onChatScroll();
        // A placeholder marks the spot: the rows themselves move into the groups.
        const spot = document.createComment('pt-groups');
        rest[0].before(spot);
        if (pinned.length) spot.before(h('p', { class: 'pt-recent-heading', text: 'Recent' }));
        for (const chats of groups.values()) spot.before(buildChatGroup(chats));
        spot.remove();
    }
    // SillyTavern's own "show more" folds chats away; the groups show them all.
    list.querySelector('.showMoreChats')?.classList.add('pt-native-hidden');

    if (cards.length > 3) {
        const empty = h('p', { class: 'pt-recent-empty', text: 'No chat matches that.', hidden: true });
        const search = h('input', { type: 'search', class: 'text_pole pt-recent-search', placeholder: 'Search recent chats', 'aria-label': 'Search recent chats', enterkeyhint: 'search' });
        search.addEventListener('input', () => {
            const words = normalizeText(search.value).split(/\s+/).filter(Boolean);
            let shown = 0;
            for (const card of cards) {
                if (!card.isConnected) continue;
                // A chat matches by its own text or its character's name.
                const group = card.closest('.pt-chat-group');
                const text = normalizeText(`${card.textContent} ${group?.dataset.name ?? ''}`);
                const match = !words.length || words.every(word => text.includes(word));
                card.classList.toggle('pt-match', words.length > 0 && match);
                card.classList.toggle('pt-nomatch', !match);
                if (match) shown++;
            }
            for (const group of list.querySelectorAll('.pt-chat-group')) {
                group.hidden = words.length > 0 && !group.querySelector('.recentChat:not(.pt-nomatch)');
                group.classList.toggle('pt-group-found', words.length > 0 && !group.hidden);
            }
            list.classList.toggle('pt-searching', words.length > 0);
            empty.hidden = shown > 0;
        });
        list.before(search);
        list.append(empty);
    }

    for (const card of cards) {
        decorateRecentRow(card);
        wireSwipe(card, card.parentElement);
    }
    showWelcomeFromTop();
}

/**
 * SillyTavern scrolls the chat to its end after drawing the start screen (and
 * again after its welcome message), which put you at the bottom of Recent
 * chats. Start at the top instead, unless you already started scrolling.
 */
function showWelcomeFromTop() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    const started = userScrollSince();
    for (const delay of [0, 120, 400, 900]) {
        setTimeout(() => {
            if (active && !started() && chat.querySelector('.welcomePanel')) chat.scrollTop = 0;
        }, delay);
    }
}

/** The cards after this one that are on screen (or just below), for the glide. */
function followingCards(group) {
    const out = [];
    const limit = window.innerHeight + 200;
    for (let node = group.nextElementSibling; node && out.length < 12; node = node.nextElementSibling) {
        if (node.getBoundingClientRect().top > limit) break;
        out.push(node);
    }
    return out;
}

/** Characters whose chat list is open; remembered while the app stays open. */
const openChatGroups = new Set();

/** Opens this chat, then runs `then` once SillyTavern has switched to it. */
function openRecentThen(card, then) {
    const context = ctx();
    const before = context.getCurrentChatId?.();
    const done = () => setTimeout(then, 150);
    if (before && before === card.dataset.file) {
        done();
        return;
    }
    const chatChangedEvent = context.eventTypes?.CHAT_CHANGED;
    let fired = false;
    const once = () => {
        if (fired) return;
        fired = true;
        if (chatChangedEvent) context.eventSource?.removeListener?.(chatChangedEvent, once);
        done();
    };
    if (chatChangedEvent) context.eventSource?.on?.(chatChangedEvent, once);
    card.click();
    // In case the event never comes (for example the chat was already open).
    setTimeout(once, 2500);
}

// -- chat previews: the last message drawn like a message, in the chat's own colours

/**
 * Builds a message preview the way a chat message reads: *narration* and _narration_ in the
 * narration colour, "dialogue" in the quote colour, **bold**. Plain DOM nodes from text, never
 * HTML. A preview cut at its start ("…she smiles.* Then") or end ("*She takes") keeps the half
 * it is in.
 */
function formatPreview(text) {
    const out = document.createDocumentFragment();
    let str = String(text ?? '').replace(/\s+/g, ' ').trim();
    const lone = str.replace(/\*\*/g, '').split('*').length - 1;
    let lead = '';
    let tail = '';
    if (lone % 2 === 1) {
        // An odd asterisk: the preview was cut inside narration.
        if (/^(?:\.\.\.|…)/.test(str) && str.indexOf('*') > -1) {
            const at = str.indexOf('*');
            lead = str.slice(0, at);
            str = str.slice(at + 1);
        } else {
            const at = str.lastIndexOf('*');
            tail = str.slice(at + 1);
            str = str.slice(0, at);
        }
    }
    if (lead) out.append(h('em', { raw: lead }));
    // No lookbehind: Safari before iOS 16.4 cannot parse it, and the whole extension would fail to load.
    const pattern = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|(^|[^\w])_([^_]+)_(?!\w)|("[^"]+"|“[^”]+”|«[^»]+»)/g;
    let cursor = 0;
    for (const match of str.matchAll(pattern)) {
        if (match.index > cursor) out.append(str.slice(cursor, match.index));
        if (match[1] !== undefined) out.append(h('strong', {}, [h('em', { raw: match[1] })]));
        else if (match[2] !== undefined) out.append(h('strong', { raw: match[2] }));
        else if (match[3] !== undefined) out.append(h('em', { raw: match[3] }));
        else if (match[5] !== undefined) out.append(match[4], h('em', { raw: match[5] }));
        else out.append(h('q', { raw: match[6] }));
        cursor = match.index + match[0].length;
    }
    if (cursor < str.length) out.append(str.slice(cursor));
    if (tail) out.append(h('em', { raw: tail }));
    return out;
}

/** A message bubble with the preview in it, styled like the chat's message cards. */
function previewBubble(text) {
    // The words sit in their own box so the line limit never shows a sliver of the next line.
    const words = h('span', { class: 'pt-bubble-text' });
    // Its own direction from its words, so a cut line ends with … on the right side in any language.
    words.dir = 'auto';
    words.append(formatPreview(text));
    return h('span', { class: 'pt-bubble' }, [words]);
}

/** "1 message", "5 messages". */
function messageCount(count) {
    return count === 1 ? t('1 message') : t('{count} messages', { count });
}

/**
 * The name to show for a chat: its own name when it was renamed, otherwise when it was started
 * ("Seraphina - 2023-5-12 @21h 32m 29s 224ms" reads as "Chat from 12 May 2023"). Branches and
 * other names stay as they are. Returns `{ text, raw }`: `raw` is user text, never translated.
 */
function chatTitle(fileName) {
    const name = String(fileName ?? '').replace(/\.jsonl$/i, '').trim();
    const match = name.match(/(?:^|\s-\s)(\d{4})-(\d{1,2})-(\d{1,2})\s?@\s?(\d{1,2})h\s?(\d{1,2})m\s?(\d{1,2})s(?:\s?\d+\s?ms)?$/);
    if (!match || /^Branch #/i.test(name)) return { text: name, raw: true };
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
    if (Number.isNaN(date.getTime())) return { text: name, raw: true };
    return { text: t('Chat from {date}', { date: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }), raw: false };
}

function titleNode(tag, className, fileName) {
    const title = chatTitle(fileName);
    const node = h(tag, { class: className });
    node.textContent = title.text;
    if (title.raw) node.dir = 'auto';
    return node;
}

/** The ⋯ menu of a chat row: rename, pin, export, delete. Each runs SillyTavern's own button. */
function openChatRowMenu(fileName, items) {
    const instance = new MenuSheet({
        title: 'Chat',
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, items.filter(Boolean).map(item => h('button', {
            type: 'button',
            class: `pt-menu-row${item.danger ? ' pt-danger' : ''}`,
            onclick: () => {
                closeSheet(true);
                item.run();
            },
        }, [ui(item.icon, 'pt-menu-row-icon'), h('span', { text: item.label })])))),
    });
    // The chat's name is shown as it is.
    instance.title.textContent = chatTitle(fileName).text;
    instance.dialog.setAttribute('aria-label', instance.title.textContent);
    showSheet(instance);
}

function moreButton(label, onOpen) {
    const button = h('button', {
        type: 'button',
        class: 'pt-rc-more',
        'aria-label': label,
        title: label,
        onclick: event => {
            event.preventDefault();
            event.stopPropagation();
            buzz(6);
            onOpen();
        },
    }, [ui('ellipsis')]);
    // The row opens its chat on a tap; the menu button must not.
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) button.addEventListener(type, event => event.stopPropagation(), { passive: true });
    return button;
}

/**
 * A recent chat on the start screen: a title line (character or chat name, when, ⋯), the last
 * message as a bubble, and how many messages. SillyTavern's own row stays underneath (hidden),
 * so tapping opens the chat and its pin, rename and delete buttons do the work.
 */
function decorateRecentRow(card) {
    if (card.querySelector(':scope > .pt-rc-body')) return;
    card.classList.add('pt-rc');
    const inGroup = !!card.closest('.pt-group-chats');
    const name = card.querySelector('.characterName')?.textContent.trim() ?? '';
    const head = h('div', { class: 'pt-rc-line' });
    if (inGroup) {
        head.append(titleNode('b', 'pt-rc-title', card.dataset.file));
    } else {
        const who = h('b', { class: 'pt-rc-title', raw: name });
        who.dir = 'auto';
        head.append(who);
    }
    const date = card.querySelector('.chatDate');
    const when = h('small', { class: 'pt-rc-when', raw: date?.textContent.trim() ?? '' });
    if (date?.title) when.title = date.title;
    const pinned = () => !!card.querySelector('.pinChat.active, .recentChatPinned');
    head.append(when, moreButton('Chat options', () => openChatRowMenu(card.dataset.file, [
        { icon: 'bookmark', label: pinned() ? 'Unpin' : 'Pin', run: () => card.querySelector('.pinChat')?.click() },
        { icon: 'pencil', label: 'Rename', run: () => card.querySelector('.renameChat')?.click() },
        { icon: 'trash', label: 'Delete', danger: true, run: () => card.querySelector('.deleteChat')?.click() },
    ])));
    const count = Number.parseInt(card.querySelector('.counterBlock small')?.textContent ?? '', 10);
    const meta = h('small', { class: 'pt-rc-meta' });
    if (!inGroup && card.dataset.file) meta.append(titleNode('span', 'pt-rc-chat', card.dataset.file));
    if (Number.isFinite(count)) meta.append(h('span', { text: messageCount(count) }));
    const body = h('div', { class: 'pt-rc-body' }, [head, previewBubble(card.querySelector('.chatMessage')?.textContent ?? '')]);
    if (meta.childElementCount) body.append(meta);
    card.append(body);
}

function undecorateRows(root = document) {
    root.querySelectorAll('.pt-rc-body').forEach(node => node.remove());
    root.querySelectorAll('.pt-rc').forEach(node => node.classList.remove('pt-rc'));
}

/**
 * A chat in Chat history: its name (or when it was started), when it was last written to and
 * how many messages, the last message as a bubble, and ⋯ for rename, export and delete.
 */
function decorateHistoryRow(block) {
    if (block.querySelector(':scope > .pt-rc-body')) return;
    block.classList.add('pt-rc');
    const fileName = block.getAttribute('file_name') ?? '';
    const head = h('div', { class: 'pt-rc-line' }, [titleNode('b', 'pt-rc-title', fileName)]);
    if (block.hasAttribute('highlight')) head.append(h('span', { class: 'pt-rc-now', text: 'Open now' }));
    const button = selector => () => block.querySelector(selector)?.click();
    head.append(moreButton('Chat options', () => openChatRowMenu(fileName, [
        { icon: 'pencil', label: 'Rename', run: button('.renameChatButton') },
        { icon: 'file-export', label: 'Export as JSONL', run: button('.exportRawChatButton') },
        { icon: 'file-text', label: 'Download as text', run: button('.exportChatButton') },
        { icon: 'trash', label: 'Delete', danger: true, run: button('.PastChat_cross') },
    ])));
    const meta = h('small', { class: 'pt-rc-meta' }, [h('span', { raw: block.querySelector('.chat_messages_date')?.textContent.trim() ?? '' })]);
    const count = Number.parseInt((block.querySelector('.chat_messages_num')?.textContent ?? '').replace(/\D+/g, ' '), 10);
    if (Number.isFinite(count)) meta.append(h('span', { text: messageCount(count) }));
    block.append(h('div', { class: 'pt-rc-body' }, [head, previewBubble(block.querySelector('.select_chat_block_mes')?.textContent ?? ''), meta]));
}

/**
 * One character's recent chats as a dropdown card. The top row shows the
 * character, the last thing said and when; tap it for the latest chat, or the
 * arrow to open the list: quick actions (new chat, all chats, character card)
 * and every recent chat with them. SillyTavern's own chat rows are moved in, so
 * tapping, renaming, pinning and deleting work as before.
 */
function buildChatGroup(chats) {
    const latest = chats[0];
    const isGroupChat = latest.classList.contains('group');
    const key = isGroupChat ? `g:${latest.dataset.group}` : `c:${latest.dataset.avatar}`;
    const name = latest.querySelector('.characterName')?.textContent.trim() ?? '';
    const group = h('section', { class: 'pt-chat-group', 'data-name': name });
    if (isGroupChat) group.classList.add('pt-chat-group-group');

    // The top row: open the latest chat.
    const main = h('button', {
        type: 'button',
        class: 'pt-group-main',
        onclick: () => {
            buzz(6);
            latest.click();
        },
    });
    main.setAttribute('aria-label', t('Open the latest chat with {name}', { name }));
    const picture = latest.querySelector(':scope > .avatar')?.cloneNode(true);
    const face = h('span', { class: 'pt-group-face' });
    if (picture) {
        picture.classList.add('pt-group-avatar');
        picture.removeAttribute('title');
        face.append(picture);
    }
    if (chats.length > 1) face.append(h('span', { class: 'pt-group-badge', text: String(chats.length) }));
    const title = h('b', { class: 'pt-group-name' });
    title.textContent = name;
    const when = h('small', { class: 'pt-group-when' });
    when.textContent = latest.querySelector('.chatDate')?.textContent.trim() ?? '';
    const last = previewBubble(latest.querySelector('.chatMessage')?.textContent ?? '');
    last.classList.add('pt-group-last');
    main.append(face, h('span', { class: 'pt-group-text' }, [h('span', { class: 'pt-group-line' }, [title, when]), last]));

    // The arrow: open or close the list.
    const toggle = h('button', {
        type: 'button',
        class: 'pt-group-toggle',
        'aria-label': t('Show chats with {name}', { name }),
        onclick: () => {
            buzz(4);
            setOpen(!group.classList.contains('pt-group-open'), true);
        },
    }, [ui('chevron-down')]);
    const setOpen = (open, animate = false) => {
        // The cards below move by however much this one grows or shrinks; they
        // glide there (movement only, so it stays smooth) instead of the card
        // growing frame by frame.
        const below = animate && motionAllowed() ? followingCards(group) : [];
        const before = below.map(card => card.getBoundingClientRect().top);
        group.classList.toggle('pt-group-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) openChatGroups.add(key);
        else openChatGroups.delete(key);
        if (!below.length && !(animate && motionAllowed())) return;
        const quick = settings.motion === 'light';
        const timing = { duration: quick ? 150 : 220, easing: EASE };
        below.forEach((card, index) => {
            const shift = before[index] - card.getBoundingClientRect().top;
            if (Math.abs(shift) > 1) card.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], timing);
        });
        if (open) {
            panel.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], timing);
        }
    };

    // Inside: quick actions, then the chats.
    const action = (iconName, label, run) => h('button', {
        type: 'button',
        class: 'pt-group-action',
        onclick: () => {
            buzz(6);
            openRecentThen(latest, run);
        },
    }, [ui(iconName), h('span', { text: label })]);
    const actions = h('div', { class: 'pt-group-actions' }, [
        action('plus', 'New chat', () => document.getElementById('option_start_new_chat')?.click()),
        action('history', 'All chats', () => document.getElementById('option_select_chat')?.click()),
        isGroupChat ? null : action('user', 'Character', () => openPage('rightNavHolder')),
    ]);
    const list = h('div', { class: 'pt-group-chats' }, chats);
    const panel = h('div', { class: 'pt-group-panel' }, [h('div', { class: 'pt-group-inner' }, [actions, list])]);
    group.append(h('div', { class: 'pt-group-head' }, [main, toggle]), panel);
    setOpen(openChatGroups.has(key));
    return group;
}

/** Swipe a recent chat right to pin or unpin it, left to delete it (SillyTavern asks first). */
function wireSwipe(card) {
    if (card.dataset.ptSwipe) return;
    card.dataset.ptSwipe = '1';
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let tracking = false;
    let swiping = false;
    let hint = null;
    let cardTop = 0;
    let cardHeight = 0;
    let frame = 0;
    const paint = () => {
        frame = 0;
        if (!swiping) return;
        card.style.transition = 'none';
        card.style.transform = `translate3d(${dx}px, 0, 0)`;
        const pinnedNow = !!card.querySelector('.pinChat.active, .recentChatPinned');
        const kind = dx > 0 ? 'pin' : 'delete';
        if (!hint || hint.dataset.kind !== kind) {
            hint?.remove();
            hint = h('div', { class: `pt-swipe-hint pt-swipe-${kind}`, 'data-kind': kind }, [
                ui(kind === 'pin' ? 'bookmark' : 'trash'),
                h('span', { text: kind === 'pin' ? (pinnedNow ? 'Unpin' : 'Pin') : 'Delete' }),
            ]);
            hint.style.top = `${cardTop}px`;
            hint.style.height = `${cardHeight}px`;
            card.parentElement?.append(hint);
        }
        hint.classList.toggle('pt-swipe-ready', Math.abs(dx) > 90);
    };
    const reset = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        card.style.transition = 'transform 0.22s var(--pt-ease)';
        card.style.transform = '';
        hint?.remove();
        hint = null;
        setTimeout(() => {
            card.style.transition = '';
        }, 240);
    };
    card.addEventListener('touchstart', event => {
        if (!active || !settings.chatStyle || !settings.recentTools) return;
        if (event.touches.length !== 1 || event.target.closest('button')) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        dx = 0;
        tracking = true;
        swiping = false;
    }, { passive: true });
    card.addEventListener('touchmove', event => {
        if (!tracking) return;
        const x = event.touches[0].clientX - startX;
        const y = event.touches[0].clientY - startY;
        if (!swiping) {
            if (Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) {
                tracking = false;
                return;
            }
            if (Math.abs(x) < 14) return;
            swiping = true;
            cardTop = card.offsetTop;
            cardHeight = card.offsetHeight;
        }
        dx = Math.max(-140, Math.min(140, x));
        if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });
    const end = () => {
        if (!tracking) return;
        tracking = false;
        if (!swiping) return;
        const action = Math.abs(dx) > 90 ? (dx > 0 ? 'pin' : 'delete') : null;
        reset();
        if (action) {
            buzz(12);
            card.querySelector(action === 'pin' ? '.pinChat' : '.deleteChat')?.click();
        }
        // Then swallow the tap the browser sends after the swipe, so the chat does not open.
        const swallow = event => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        card.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => card.removeEventListener('click', swallow, { capture: true }), 400);
    };
    card.addEventListener('touchend', end);
    card.addEventListener('touchcancel', end);
}

// -- chat history: grouped by date

const chatList = { observer: null, timer: 0 };

function chatDateOf(block) {
    const text = block.querySelector('.chat_messages_date')?.textContent?.trim();
    let time = text ? Date.parse(text) : NaN;
    if (Number.isNaN(time)) {
        const match = (block.getAttribute('file_name') ?? '').match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@?(\d{1,2})?h?\s*(\d{1,2})?m?/);
        if (match) time = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0)).getTime();
    }
    return Number.isNaN(time) ? null : new Date(time);
}

function dateGroup(date) {
    if (!date) return t('Older');
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86400000;
    if (date.getTime() >= startOfDay) return t('Today');
    if (date.getTime() >= startOfDay - day) return t('Yesterday');
    if (date.getTime() >= startOfDay - 6 * day) return t('This week');
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return t('This month');
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function groupChatHistory() {
    const list = document.getElementById('select_chat_div');
    if (!list) return;
    list.querySelectorAll('.pt-date-heading').forEach(node => node.remove());
    if (!active || !settings.touchSizing || !settings.recentTools) return;
    let lastGroup = null;
    for (const wrapper of list.querySelectorAll(':scope > .select_chat_block_wrapper')) {
        if (getComputedStyle(wrapper).display === 'none') continue;
        const block = wrapper.querySelector('.select_chat_block');
        if (block) decorateHistoryRow(block);
        const group = dateGroup(block ? chatDateOf(block) : null);
        if (group !== lastGroup) {
            wrapper.before(h('p', { class: 'pt-date-heading', text: group }));
            lastGroup = group;
        }
    }
}

function syncChatHistory() {
    const list = document.getElementById('select_chat_div');
    if (!active || !settings.touchSizing || !settings.recentTools) {
        chatList.observer?.disconnect();
        chatList.observer = null;
        list?.querySelectorAll('.pt-date-heading').forEach(node => node.remove());
        if (list) undecorateRows(list);
        return;
    }
    if (list && !chatList.observer) {
        chatList.observer = new MutationObserver(records => {
            // Ignore our own headings.
            if (records.every(record => [...record.addedNodes, ...record.removedNodes].every(node => node.classList?.contains('pt-date-heading')))) return;
            window.clearTimeout(chatList.timer);
            chatList.timer = window.setTimeout(groupChatHistory, 80);
        });
        chatList.observer.observe(list, { childList: true, subtree: false, attributes: true, attributeFilter: ['style'], attributeOldValue: false });
        wireOnce(document.getElementById('select_chat_search'), 'input', () => {
            window.clearTimeout(chatList.timer);
            chatList.timer = window.setTimeout(groupChatHistory, 350);
        });
    }
}

// -- search everything

async function recentChatList() {
    try {
        const response = await fetch('/api/chats/recent', {
            method: 'POST',
            headers: ctx().getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max: 200 }),
            cache: 'no-cache',
        });
        return response.ok ? await response.json() : [];
    } catch {
        return [];
    }
}

async function lorebookNames() {
    try {
        const module = await import('/scripts/world-info.js');
        return Array.isArray(module.world_names) ? module.world_names : [];
    } catch {
        return Array.from(document.querySelectorAll('#world_editor_select option')).map(option => option.textContent.trim()).filter(Boolean);
    }
}

function allSettingItems() {
    const items = [];
    for (const pageId of SEARCH_PAGES) {
        const root = document.querySelector(`#${pageId} > .drawer-content`);
        if (!root) continue;
        const page = t(pageInfo(drawerById(pageId)).title);
        for (const item of settingItems(root)) items.push({ ...item, pageId, page });
    }
    return items;
}

async function openChatFile(chat) {
    const context = ctx();
    const file = String(chat.file_name ?? '').replace(/\.jsonl$/, '');
    closePages();
    if (chat.group) {
        await context.openGroupChat?.(chat.group, file);
        return;
    }
    const id = context.characters.findIndex(character => character.avatar === chat.avatar);
    if (id === -1) return;
    await context.selectCharacterById(id);
    if (context.getCurrentChatId?.() !== file) await ctx().openCharacterChat?.(file);
}

function openLorebook(name) {
    openPage('WI-SP-button');
    setTimeout(() => {
        const select = document.getElementById('world_editor_select');
        const option = Array.from(select?.options ?? []).find(item => item.textContent.trim() === name);
        if (select && option) {
            select.value = option.value;
            $j()(select).trigger('change');
        }
    }, 300);
}

function openGlobalSearch() {
    const context = ctx();
    const characters = (context.characters ?? []).map((character, id) => ({ kind: 'character', id, name: character.name, note: (character.description ?? '').replace(/\s+/g, ' ').slice(0, 80), avatar: character.avatar }));
    const groups = (context.groups ?? []).map(group => ({ kind: 'group', id: group.id, name: group.name, note: t('Group chat') }));
    let chats = null;
    let lorebooks = null;
    let settingsIndex = null;
    const load = Promise.all([
        recentChatList().then(list => {
            chats = list;
        }),
        lorebookNames().then(list => {
            lorebooks = list;
        }),
    ]);
    showSheet(new MenuSheet({
        title: t('Search everything'),
        subtitle: t('Characters, chats, lorebooks and settings'),
        fill: body => {
            const input = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Type to search…'), 'aria-label': t('Search everything'), enterkeyhint: 'search' });
            const results = h('div', { class: 'pt-search-results' });
            const section = (title, rows) => (rows.length ? [h('p', { class: 'pt-menu-heading', text: title }), h('div', { class: 'pt-menu-list' }, rows)] : []);
            const row = (iconOrImage, label, note, onclick) => h('button', { type: 'button', class: 'pt-menu-row', onclick }, [
                iconOrImage.startsWith('/') ? h('img', { class: 'pt-choice-img', src: iconOrImage, alt: '', loading: 'lazy' }) : ui(iconOrImage, 'pt-menu-row-icon'),
                h('span', { class: 'pt-row-text' }, [h('span', { raw: label }), note ? h('small', { raw: note }) : null]),
            ]);
            const charByAvatar = new Map(characters.map(c => [c.avatar, c.name]));
            const groupById = new Map(groups.map(g => [String(g.id), g.name]));
            const ownerName = chat => (chat.group ? groupById.get(String(chat.group)) : charByAvatar.get(chat.avatar)) ?? '';
            const render = () => {
                const words = normalizeText(input.value).split(/\s+/).filter(Boolean);
                if (!words.length) {
                    results.replaceChildren(h('p', { class: 'pt-menu-foot', text: t('Find a character, a chat by its name or last message, a lorebook or a setting.') }));
                    return;
                }
                const hit = text => {
                    const norm = normalizeText(text);
                    return words.every(word => norm.includes(word));
                };
                const go = action => () => {
                    closeSheet(true);
                    action();
                };
                const characterRows = [...characters, ...groups].filter(item => hit(`${item.name} ${item.note}`)).slice(0, 12).map(item => item.kind === 'character'
                    ? row(item.avatar ? `/thumbnail?type=avatar&file=${encodeURIComponent(item.avatar)}` : 'user', item.name, item.note, go(async () => {
                        closePages();
                        await ctx().selectCharacterById(item.id);
                    }))
                    : row('users', item.name, item.note, go(async () => {
                        closePages();
                        await ctx().openGroupChat?.(item.id);
                    })));
                const chatRows = (chats ?? []).filter(chat => hit(`${ownerName(chat)} ${chat.file_name ?? ''} ${chat.mes ?? ''}`)).slice(0, 12).map(chat => row(
                    chat.avatar ? `/thumbnail?type=avatar&file=${encodeURIComponent(chat.avatar)}` : 'chats',
                    ownerName(chat) || String(chat.file_name ?? '').replace(/\.jsonl$/, ''),
                    `${String(chat.mes ?? '').replace(/\s+/g, ' ').slice(0, 80)}`,
                    go(() => openChatFile(chat)),
                ));
                const loreRows = (lorebooks ?? []).filter(name => hit(name)).slice(0, 8).map(name => row('book', name, t('Lorebook'), go(() => openLorebook(name))));
                if (!settingsIndex) settingsIndex = allSettingItems();
                const settingRows = settingsIndex.filter(item => hit(`${item.label} ${item.section} ${item.page}`)).slice(0, 12).map(item => row('settings', item.label, [item.page, item.section].filter(Boolean).join(' › '), go(() => {
                    openPage(item.pageId);
                    setTimeout(() => revealSetting(item.row), 350);
                })));
                const blocks = [
                    ...section(t('Characters'), characterRows),
                    ...section(t('Chats'), chatRows),
                    ...section(t('Lorebooks'), loreRows),
                    ...section(t('Settings'), settingRows),
                ];
                if (chats === null) blocks.push(h('p', { class: 'pt-menu-foot', text: t('Loading chats…') }));
                results.replaceChildren(...(blocks.length ? blocks : [h('p', { class: 'pt-menu-foot', text: t('Nothing matches that.') })]));
            };
            input.addEventListener('input', render);
            // Enter opens the first result, so Ctrl+K, a few letters and Enter gets you there.
            input.addEventListener('keydown', event => {
                if (event.key !== 'Enter' || event.isComposing) return;
                event.preventDefault();
                results.querySelector('.pt-menu-row')?.click();
            });
            load.then(() => {
                if (input.isConnected) render();
            });
            // One search (DESIGN.md): in a chat it also searches the chat's own messages.
            const inChat = !!(context.groupId || context.characterId !== undefined);
            const chatSearch = inChat ? h('div', { class: 'pt-menu-list pt-search-this-chat' }, [row('search', t('Search this chat'), '', () => {
                closeSheet(true);
                // The bar searches the chat, so show the chat, not the page that was open.
                closePages();
                openChatFinder();
            })]) : null;
            if (chatSearch) body.append(input, chatSearch, results);
            else body.append(input, results);
            render();
            setTimeout(() => { if (input.isConnected) input.focus(); }, 250);
        },
    }));
}

// -- sharp pictures and animated (GIF) character pictures

/**
 * SillyTavern shows 96×144 thumbnails everywhere; on a phone a grid card needs
 * about four times that. Pictures on screen are replaced by the original image,
 * scaled down in the browser to exactly the size the screen needs (so memory
 * stays low), and characters can have an animated GIF/WebP picture.
 */
const GIF_KEY = 'pt_animated_avatar';
const pictures = {
    observer: null,
    seen: null,
    cache: new Map(),
    pending: new Map(),
    queue: [],
    running: 0,
    timer: 0,
    // Pictures the on-screen watcher reported as (nearly) on screen.
    near: new Set(),
    // New sources waiting to be put in, all in one frame.
    swaps: new Map(),
    swapFrame: 0,
    // Elements added since the last frame, scanned together.
    added: new Set(),
    addedFrame: 0,
    // The picture last shown in each kind of spot ("grid|avatar|Aria.png" → url).
    last: new Map(),
    // Animated picture links that failed to load (the file was deleted, or the
    // card came from someone else's SillyTavern), and characters whose sharp
    // picture failed. Those show SillyTavern's thumbnail instead.
    broken: new Set(),
    noSharp: new Set(),
};

/** Which kind of spot a picture sits in; pictures in the same kind of spot have the same size. */
function pictureSpot(img) {
    if (img.closest('#rm_print_characters_block')) return document.body.classList.contains('charListGrid') ? 'grid' : 'list';
    if (img.closest('#HotSwapWrapper')) return 'fav';
    if (img.closest('#chat')) return 'chat';
    return null;
}

function rememberPicture(img, url) {
    const spot = pictureSpot(img);
    const info = img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null;
    if (spot && info) pictures.last.set(`${spot}|${info.type}|${info.file}`, url);
}

/**
 * SillyTavern redraws its lists from scratch, with thumbnails. When this spot
 * already showed a sharp picture, put it straight back (this runs before the
 * page is drawn), so nothing flashes from blurry to sharp.
 */
const PICTURE_CACHE_LIMIT = 160;

function restoreKnownPicture(img) {
    const src = img.getAttribute('src') ?? '';
    const info = thumbInfo(src);
    const spot = info && pictureSpot(img);
    const url = spot && pictures.last.get(`${spot}|${info.type}|${info.file}`);
    if (!url) return false;
    if (url.startsWith('blob:') && !settings.sharpPictures) return false;
    if (!url.startsWith('blob:') && !settings.animatedPictures) return false;
    img.dataset.ptThumb = src;
    img.setAttribute('src', url);
    return true;
}

/**
 * Puts in new picture sources together, so the page restyles once and a list
 * turns sharp in one go instead of picture by picture. Pictures made within
 * about 100 ms of each other go in on the same frame.
 */
function swapPicture(img, url) {
    if (!active || !settings.sharpPictures) return;
    pictures.swaps.set(img, url);
    if (pictures.swapFrame || pictures.swapTimer) return;
    pictures.swapTimer = window.setTimeout(() => {
        pictures.swapTimer = 0;
        pictures.swapFrame = requestAnimationFrame(() => {
            pictures.swapFrame = 0;
            if (!active || !settings.sharpPictures || !pictures.swaps.size) {
                pictures.swaps.clear();
                return;
            }
            const swaps = [...pictures.swaps];
            pictures.swaps.clear();
            for (const [image, src] of swaps) {
                if (image.isConnected && (image.getAttribute('src') === image.dataset.ptThumb || thumbInfo(image.getAttribute('src') ?? ''))) {
                    image.setAttribute('src', src);
                    rememberPicture(image, src);
                }
            }
        });
    }, 100);
}

function thumbInfo(src) {
    try {
        const url = new URL(src, location.href);
        if (!url.pathname.endsWith('/thumbnail')) return null;
        const type = url.searchParams.get('type');
        const file = url.searchParams.get('file');
        if (!file || !['avatar', 'persona'].includes(type)) return null;
        return { type, file };
    } catch {
        return null;
    }
}

function animatedPictureFor(file) {
    const character = (ctx().characters ?? []).find(item => item.avatar === file);
    const url = character?.data?.extensions?.[GIF_KEY];
    // Only allow local server paths (never external URLs or protocol-relative // links from imported cards).
    return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !pictures.broken.has(url) ? url : null;
}

function fullPictureUrl({ type, file }) {
    return type === 'persona' ? `/User Avatars/${encodeURIComponent(file)}` : `/characters/${encodeURIComponent(file)}`;
}

/** The original picture scaled to `width` pixels, as an object URL (made once per size, LRU-capped). */
function sharpPicture(info, width) {
    const key = `${info.type}|${info.file}|${width}`;
    if (pictures.cache.has(key)) {
        const hit = pictures.cache.get(key);
        pictures.cache.delete(key);
        pictures.cache.set(key, hit);
        return Promise.resolve(hit);
    }
    if (pictures.pending.has(key)) return pictures.pending.get(key);
    const job = new Promise((resolve, reject) => {
        pictures.queue.push(async () => {
            if (!active || !settings.sharpPictures) {
                reject(new Error('cancelled'));
                return;
            }
            let bitmap = null;
            try {
                const response = await fetch(fullPictureUrl(info));
                if (!response.ok) throw new Error(String(response.status));
                const blob = await response.blob();
                if (!active || !settings.sharpPictures) throw new Error('cancelled');
                bitmap = await createImageBitmap(blob);
                const scale = Math.min(1, width / bitmap.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(bitmap.width * scale);
                canvas.height = Math.round(bitmap.height * scale);
                const context = canvas.getContext('2d');
                if (!context) throw new Error('no 2d context');
                context.imageSmoothingQuality = 'high';
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const out = await new Promise(done => canvas.toBlob(done, 'image/webp', 0.92));
                if (!active || !settings.sharpPictures) throw new Error('cancelled');
                const url = URL.createObjectURL(out ?? blob);
                pictures.cache.set(key, url);
                while (pictures.cache.size > PICTURE_CACHE_LIMIT) {
                    const [oldKey, oldUrl] = pictures.cache.entries().next().value;
                    pictures.cache.delete(oldKey);
                    URL.revokeObjectURL(oldUrl);
                }
                resolve(url);
            } catch (error) {
                reject(error);
            } finally {
                bitmap?.close?.();
                pictures.pending.delete(key);
            }
        });
        pumpPictures();
    });
    pictures.pending.set(key, job);
    return job;
}

function pumpPictures() {
    while (pictures.running < 3 && pictures.queue.length) {
        const task = pictures.queue.shift();
        pictures.running++;
        task().finally(() => {
            pictures.running--;
            pumpPictures();
        });
    }
}

/** Picks the best picture for one <img>. */
function upgradePicture(img) {
    if (!active) return;
    const current = img.getAttribute('src') ?? '';
    // SillyTavern sometimes sets the thumbnail again; remember what it asked for.
    const info = thumbInfo(current) ?? (img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null);
    if (!info) return;
    if (thumbInfo(current)) img.dataset.ptThumb = current;
    const animated = info.type === 'avatar' && settings.animatedPictures ? animatedPictureFor(info.file) : null;
    if (animated) {
        if (current !== animated) img.setAttribute('src', animated);
        rememberPicture(img, animated);
        return;
    }
    if (!settings.sharpPictures) {
        if (img.dataset.ptThumb && current !== img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        return;
    }
    const shown = img.getBoundingClientRect().width || img.clientWidth;
    const needed = shown * (window.devicePixelRatio || 1);
    // The thumbnail is 96 pixels wide; only bigger pictures need the original.
    if (needed <= 100 || pictures.noSharp.has(info.file)) return;
    const width = needed <= 200 ? 200 : needed <= 400 ? 400 : 640;
    sharpPicture(info, width).then(url => swapPicture(img, url)).catch(() => {});
}

/**
 * One of Pocket Tavern's pictures failed to load. Put SillyTavern's thumbnail
 * back before SillyTavern sees the error, which would swap the picture for its
 * crossed-out "missing picture" icon until the chat is reopened.
 */
function onPictureError(event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.ptThumb) return;
    const src = img.getAttribute('src') ?? '';
    const info = thumbInfo(img.dataset.ptThumb);
    if (!src || !info || src === img.dataset.ptThumb) return;
    event.stopImmediatePropagation();
    if (src.startsWith('blob:')) pictures.noSharp.add(info.file);
    else pictures.broken.add(src);
    for (const map of [pictures.cache, pictures.last]) {
        for (const [key, url] of map) if (url === src) map.delete(key);
    }
    img.setAttribute('src', img.dataset.ptThumb);
}

function watchPicture(img) {
    if (!img.dataset.ptWatched) {
        img.dataset.ptWatched = '1';
        pictures.seen?.observe(img);
    }
    scheduleVisibleCheck();
}

/**
 * Backup for the on-screen watcher: after scrolling stops, upgrade the pictures
 * it reported as near the screen that still show a thumbnail. Only those are
 * looked at, so a long chat or character list costs nothing here.
 */
function scheduleVisibleCheck(event) {
    // Text boxes scroll while you type; they never hold pictures.
    if (event?.target instanceof HTMLTextAreaElement || event?.target instanceof HTMLInputElement) return;
    window.clearTimeout(pictures.timer);
    pictures.timer = window.setTimeout(() => {
        if (!active || !(settings.sharpPictures || settings.animatedPictures)) return;
        for (const img of pictures.near) {
            if (!img.isConnected) {
                pictures.near.delete(img);
                continue;
            }
            if (thumbInfo(img.getAttribute('src') ?? '') || (img.dataset.ptThumb && img.getAttribute('src') === img.dataset.ptThumb)) upgradePicture(img);
        }
    }, 150);
}

function scanPictures(root = document) {
    if (!active) return;
    const images = root.matches?.('img') ? [root] : root.querySelectorAll?.('img') ?? [];
    for (const img of images) {
        const src = img.getAttribute('src') ?? '';
        if (thumbInfo(src)) restoreKnownPicture(img);
        if (thumbInfo(src) || img.dataset.ptThumb) watchPicture(img);
    }
}

function syncPictures() {
    const want = active && (settings.sharpPictures || settings.animatedPictures);
    if (!want) {
        pictures.observer?.disconnect();
        pictures.seen?.disconnect();
        document.removeEventListener('scroll', scheduleVisibleCheck, { capture: true });
        document.removeEventListener('error', onPictureError, { capture: true });
        pictures.observer = null;
        pictures.seen = null;
        window.clearTimeout(pictures.timer);
        pictures.timer = 0;
        window.clearTimeout(pictures.swapTimer);
        pictures.swapTimer = 0;
        cancelAnimationFrame(pictures.swapFrame);
        pictures.swapFrame = 0;
        cancelAnimationFrame(pictures.addedFrame);
        pictures.addedFrame = 0;
        pictures.queue.length = 0;
        pictures.added.clear();
        pictures.near.clear();
        pictures.swaps.clear();
        pictures.last.clear();
        // Put SillyTavern's own thumbnails back.
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            img.setAttribute('src', img.dataset.ptThumb);
            delete img.dataset.ptThumb;
            delete img.dataset.ptWatched;
        }
        document.querySelectorAll('img[data-pt-watched]').forEach(img => delete img.dataset.ptWatched);
        for (const url of pictures.cache.values()) URL.revokeObjectURL(url);
        pictures.cache.clear();
        return;
    }
    if (!settings.sharpPictures && pictures.cache.size) {
        pictures.queue.length = 0;
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            if ((img.getAttribute('src') ?? '').startsWith('blob:')) img.setAttribute('src', img.dataset.ptThumb);
        }
        for (const [key, url] of pictures.last) if (url.startsWith('blob:')) pictures.last.delete(key);
        for (const url of pictures.cache.values()) URL.revokeObjectURL(url);
        pictures.cache.clear();
    }
    if (!settings.animatedPictures) {
        for (const [key, url] of pictures.last) if (!url.startsWith('blob:')) pictures.last.delete(key);
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            const src = img.getAttribute('src') ?? '';
            if (src && !src.startsWith('blob:') && src !== img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        }
    }
    if (!pictures.seen) {
        // Only pictures that are (nearly) on screen are upgraded, so long lists stay light.
        pictures.seen = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    pictures.near.add(entry.target);
                    upgradePicture(entry.target);
                } else pictures.near.delete(entry.target);
            }
        }, { rootMargin: '300px' });
    }
    if (!pictures.observer) {
        pictures.observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') {
                    const img = record.target;
                    // SillyTavern put a thumbnail back (re-render): upgrade again.
                    if (thumbInfo(img.getAttribute('src') ?? '')) {
                        img.dataset.ptThumb = img.getAttribute('src');
                        if (restoreKnownPicture(img)) continue;
                        if (img.dataset.ptWatched) {
                            pictures.seen?.unobserve(img);
                            pictures.seen?.observe(img);
                        } else watchPicture(img);
                    }
                    continue;
                }
                if (record.target instanceof Element && record.target.closest('.mes_text')) continue;
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1) pictures.added.add(node);
                }
            }
            // Added nodes are scanned once per frame (a streaming reply adds some on every token),
            // still before the frame is drawn, so a known picture never flashes its thumbnail.
            if (pictures.added.size && !pictures.addedFrame) {
                pictures.addedFrame = requestAnimationFrame(() => {
                    pictures.addedFrame = 0;
                    const nodes = [...pictures.added];
                    pictures.added.clear();
                    for (const node of nodes) if (node.isConnected) scanPictures(node);
                });
            }
        });
        pictures.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        document.addEventListener('scroll', scheduleVisibleCheck, { capture: true, passive: true });
        document.addEventListener('error', onPictureError, { capture: true });
    }
    // Pictures already on the page, and a refresh after the animated picture changed.
    for (const img of document.querySelectorAll('img[data-pt-watched]')) {
        pictures.seen.unobserve(img);
        pictures.seen.observe(img);
    }
    scanPictures();
}

/** Re-check every picture of one character (after its animated picture changed). */
function refreshPicturesFor(file) {
    for (const img of document.querySelectorAll('img')) {
        const info = thumbInfo(img.getAttribute('src') ?? '') ?? (img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null);
        if (info?.file !== file) continue;
        if (!animatedPictureFor(file) && img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        upgradePicture(img);
    }
    shell?.update();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function setAnimatedPicture(characterId, url) {
    const context = ctx();
    const character = context.characters?.[characterId];
    if (!character) return;
    await context.writeExtensionField?.(characterId, GIF_KEY, url ?? '');
    character.data = character.data ?? {};
    character.data.extensions = character.data.extensions ?? {};
    character.data.extensions[GIF_KEY] = url ?? '';
    refreshPicturesFor(character.avatar);
}

/** True for a GIF, an animated WebP or an animated PNG (looks at the file's own bytes). */
async function isAnimatedImage(file) {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const text = (start, length) => String.fromCharCode(...head.subarray(start, start + length));
    if (text(0, 4) === 'GIF8') return true;
    // WebP: RIFF....WEBP with an animation chunk.
    if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
        for (let i = 12; i < head.length - 4; i++) {
            if (head[i] === 0x41 && text(i, 4) === 'ANIM') return true;
        }
        return false;
    }
    // PNG: an "acTL" chunk before the image data means APNG.
    if (head[0] === 0x89 && text(1, 3) === 'PNG') {
        for (let i = 8; i < head.length - 4; i++) {
            if (head[i] === 0x61 && text(i, 4) === 'acTL') return true;
            if (head[i] === 0x49 && text(i, 4) === 'IDAT') return false;
        }
    }
    return false;
}

async function uploadAnimatedFile(file, baseName) {
    const extension = (file.type.split('/')[1] ?? 'gif').replace('apng', 'png').replace(/[^a-z0-9]/gi, '') || 'gif';
    const safeName = `pt-${String(baseName || 'character').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_')}-${Date.now()}.${extension}`;
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ name: safeName, data: await fileToBase64(file) }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const { path } = await response.json();
    return `/${String(path).replace(/^\/+/, '')}`;
}

/** A picture waiting for its new character to be created. */
let pendingAnimated = null;

/**
 * SillyTavern's own picture picker (tap the character's picture). If the file
 * is animated, Pocket Tavern keeps the moving version next to the still card
 * picture SillyTavern saves; a still picture replaces any earlier animation.
 */
async function onAvatarPicked(event) {
    if (!active || !settings.animatedPictures || event.target?.id !== 'add_avatar_button') return;
    const file = event.target.files?.[0];
    if (!file) return;
    const context = ctx();
    const creating = isShown(document.getElementById('name_div')) || context.characterId === undefined;
    const character = creating ? null : context.characters?.[context.characterId];
    let animated = false;
    try {
        animated = await isAnimatedImage(file);
    } catch {
        animated = false;
    }
    if (!animated) {
        pendingAnimated = null;
        // A still picture replaces the old animation (once SillyTavern has saved the new one).
        if (character && animatedPictureFor(character.avatar)) {
            const avatar = character.avatar;
            setTimeout(() => {
                const idx = (ctx().characters ?? []).findIndex(item => item.avatar === avatar);
                if (idx !== -1) setAnimatedPicture(idx, '').catch(() => {});
            }, 2500);
        }
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        globalThis.toastr?.warning(t('That picture is too big to animate (over 15 MB); the still picture is used.'));
        return;
    }
    try {
        const url = await uploadAnimatedFile(file, character?.avatar ?? document.getElementById('character_name_pole')?.value);
        if (character) {
            const avatar = character.avatar;
            const charName = character.name;
            // Let SillyTavern finish saving the still picture first, so the two saves don't collide.
            setTimeout(async () => {
                try {
                    const idx = (ctx().characters ?? []).findIndex(item => item.avatar === avatar);
                    if (idx === -1) return;
                    await setAnimatedPicture(idx, url);
                    globalThis.toastr?.success(t('Animated picture set for {name}.', { name: charName }));
                } catch (err) {
                    console.warn(LOG, 'Animated picture save failed', err);
                }
            }, 2500);
        } else {
            pendingAnimated = { url, avatars: new Set((context.characters ?? []).map(item => item.avatar)), at: Date.now() };
        }
    } catch (error) {
        console.warn(LOG, 'Animated picture upload failed', error);
        globalThis.toastr?.error(t('Could not save the animated picture; the still picture is used.'));
    }
}

/** After a new character is created, give it the animated picture it was created with. */
function applyPendingAnimated() {
    if (!pendingAnimated) return;
    if (Date.now() - pendingAnimated.at > 10 * 60 * 1000) {
        pendingAnimated = null;
        return;
    }
    const characters = ctx().characters ?? [];
    const created = characters.find(item => !pendingAnimated.avatars.has(item.avatar));
    if (!created) return;
    const { url } = pendingAnimated;
    const avatar = created.avatar;
    pendingAnimated = null;
    setTimeout(() => {
        const idx = (ctx().characters ?? []).findIndex(item => item.avatar === avatar);
        if (idx !== -1) setAnimatedPicture(idx, url).catch(() => {});
    }, 1500);
}

// -- chat: the message box (persona button, context ring)

/**
 * The message box is one floating rounded box: the text on top, and a row of
 * tools along its bottom. Pocket Tavern adds two things to that row: your
 * persona (picture and name, tap to switch) and a ring that fills as the
 * context fills (tap it for what is in there).
 */
const composer = { persona: null, ring: null, tabs: null, personas: null, formObserver: null };

/** SillyTavern's personas module, loaded once; it knows the current persona. */
function loadPersonasModule() {
    composer.personas ??= import('/scripts/personas.js').catch(() => null);
    return composer.personas;
}

function personaName(avatar) {
    return ctx().powerUserSettings?.personas?.[avatar] || ctx().name1 || '';
}

function personaPicture(avatar) {
    return avatar ? `/thumbnail?type=persona&file=${encodeURIComponent(avatar)}` : 'img/user-default.png';
}

async function updatePersonaButton() {
    const button = composer.persona;
    if (!button) return;
    const module = await loadPersonasModule();
    const avatar = module?.user_avatar || currentPersona();
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
        onclick: () => {
            buzz(6);
            openContextSheet();
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
        return;
    }
    if (composer.formObserver) return;
    let last = -1;
    composer.formObserver = new ResizeObserver(() => {
        const height = Math.round(form.offsetHeight);
        if (height === last) return;
        const chat = document.getElementById('chat');
        // Stay at the newest message when the box grows or shrinks.
        const atBottom = chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
        last = height;
        // Written on the next frame, outside the size notification (Safari warned about a loop otherwise).
        requestAnimationFrame(() => {
            sheld.style.setProperty('--pt-form-h', `${height}px`);
            if (atBottom) chat.scrollTo(0, chat.scrollHeight);
        });
    });
    composer.formObserver.observe(form);
}

function syncComposer() {
    const left = document.getElementById('leftSendForm');
    const right = document.getElementById('rightSendForm');
    const want = active && settings.chatStyle && left && right;
    watchFormHeight(!!want);
    if (!want || !settings.contextMeter) {
        composer.ring?.remove();
        composer.ring = null;
    }
    if (!want || !settings.appShell || !settings.hideTabsInChat) {
        composer.tabs?.remove();
        composer.tabs = null;
    }
    if (!want) {
        composer.persona?.remove();
        composer.persona = null;
        document.getElementById('nonQRFormItems')?.classList.remove('pt-ih-browse');
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
                buzz(6);
                openPersonaChooser();
            },
        }, [h('img', { class: 'pt-persona-img', alt: '' }), h('span', { class: 'pt-persona-name' })]);
        left.prepend(composer.persona);
    }
    if (settings.appShell && settings.hideTabsInChat) {
        if (!composer.tabs || !composer.tabs.isConnected) {
            composer.tabs?.remove();
            composer.tabs = h('button', {
                type: 'button',
                class: 'pt-tabs-btn',
                'aria-controls': 'pt-tabbar',
                onclick: () => {
                    buzz(6);
                    shell?.toggleTabs();
                },
            }, [ui('chevron-up')]);
        }
        if (left.firstElementChild !== composer.tabs) left.prepend(composer.tabs);
        syncTabsButton();
    }
    if (settings.contextMeter && (!composer.ring || !composer.ring.isConnected)) {
        composer.ring?.remove();
        composer.ring = buildContextRing();
        right.prepend(composer.ring);
    }
    updatePersonaButton();
    renderMeter();
    syncGuided();
}

// -- Guided Generations: its row of buttons becomes one button next to Send

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

function ggPresent() {
    return !!ggRow();
}

function syncGuided() {
    const root = document.documentElement;
    const right = document.getElementById('rightSendForm');
    const watching = active && settings.chatStyle;
    const on = watching && settings.ggButton && ggPresent() && !!right;
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
    const send = document.getElementById('send_but');
    if (send?.parentElement === right) {
        if (guided.button.nextElementSibling !== send) right.insertBefore(guided.button, send);
    } else if (guided.button.parentElement !== right) {
        right.append(guided.button);
    }
    updateGuideCount();
}

/** Guided Generations builds its row after Pocket Tavern starts and rebuilds it when its settings change. */
function watchGuided(on) {
    const form = document.getElementById('send_form');
    if (!on || !form) {
        guided.watch?.disconnect();
        guided.watch = null;
        return;
    }
    if (guided.watch) return;
    guided.watch = new MutationObserver(() => {
        if (guided.frame) return;
        guided.frame = requestAnimationFrame(() => {
            guided.frame = 0;
            syncGuided();
        });
    });
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
    button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        guided.held = false;
        stop();
        timer = window.setTimeout(() => {
            timer = 0;
            const last = lastGuidedAction();
            if (!last) return;
            guided.held = true;
            buzz([8, 40, 8]);
            runGuided(last.element, last.id);
        }, 500);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, stop);
    // No text-selection or link menu on a long press.
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('click', () => {
        if (guided.held) {
            guided.held = false;
            return;
        }
        buzz(6);
        openGuidedSheet();
    });
}

function lastGuidedAction() {
    const id = settings.ggLast;
    const action = GG_ACTIONS.find(item => item.id === id);
    const element = id ? document.getElementById(id) : null;
    return action && element && ggRow()?.contains(element) ? { id, element, label: action.label } : null;
}

/** Presses one of its buttons or menu items, after the sheet is gone. */
function runGuided(element, id) {
    if (id && settings.ggLast !== id) {
        settings.ggLast = id;
        saveSettings();
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
            const typed = document.getElementById('send_textarea')?.value.trim() ?? '';
            const preview = h('span', { class: 'pt-gg-instruction-text' });
            // Your own words, never translated.
            preview.textContent = typed || t('Type in the message box how the AI should steer, then pick an action. With nothing typed, each action works like the normal one.');
            body.append(h('button', {
                type: 'button',
                class: `pt-gg-instruction${typed ? '' : ' pt-gg-instruction-empty'}`,
                'aria-label': typed ? t('Your instruction. Tap to edit it.') : t('No instruction yet. Tap to type one.'),
                onclick: () => {
                    closeSheet(true);
                    document.getElementById('send_textarea')?.focus();
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
    setTimeout(() => {
        const drawer = document.getElementById('gg_versionBadge')?.closest('.inline-drawer');
        if (!drawer) return;
        const content = drawer.querySelector('.inline-drawer-content');
        if (content && getComputedStyle(content).display === 'none') drawer.querySelector('.inline-drawer-toggle')?.click();
        drawer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 250);
}

// -- Input History (another extension): its arrows show when they can help

/** After its arrows bring back an earlier message they stay until you type your own words. */
function onInputHistoryClick(event) {
    if (!active || !settings.chatStyle) return;
    if (event.target.closest?.('#nonQRFormItems .stih--arrows')) document.getElementById('nonQRFormItems')?.classList.add('pt-ih-browse');
}

function onComposerInput(event) {
    if (!active) return;
    if (event.isTrusted && event.target?.id === 'send_textarea') document.getElementById('nonQRFormItems')?.classList.remove('pt-ih-browse');
}

// -- chat: drag the last reply sideways to swipe

const drag = { mes: null, x: 0, y: 0, dx: 0, active: false, hint: null, started: 0, canPrevious: false, top: 120, frame: 0 };

function onSwipeStart(event) {
    if (!active || !settings.chatStyle || !settings.dragSwipe || event.touches.length !== 1) return;
    const mes = event.target.closest?.('#chat .mes.last_mes');
    if (!mes || mes.getAttribute('is_user') === 'true' || mes.querySelector('#curEditTextarea')) return;
    if (event.target.closest('textarea, input, button, a, .mes_buttons, .swipe_left, .swipe_right, pre, .mes_reasoning_details')) return;
    drag.mes = mes;
    drag.x = event.touches[0].clientX;
    drag.y = event.touches[0].clientY;
    drag.dx = 0;
    drag.active = false;
    drag.started = Date.now();
}

function paintSwipe() {
    drag.frame = 0;
    if (!drag.mes || !drag.active) return;
    drag.mes.style.transition = 'none';
    drag.mes.style.transform = `translate3d(${drag.dx}px, 0, 0) rotate(${drag.dx / 60}deg)`;
    const kind = drag.dx < 0 ? 'next' : (drag.canPrevious ? 'previous' : 'none');
    if (!drag.hint || drag.hint.dataset.kind !== kind) {
        drag.hint?.remove();
        drag.hint = kind === 'none' ? null : h('div', { class: `pt-drag-hint pt-drag-${kind}`, 'data-kind': kind }, [
            ui(kind === 'next' ? 'chevron-left' : 'chevron-right'),
            h('span', { text: kind === 'next' ? 'Another version' : 'Previous version' }),
        ]);
        if (drag.hint) {
            drag.hint.style.top = `${drag.top}px`;
            document.body.append(drag.hint);
        }
    }
    if (drag.hint) drag.hint.classList.toggle('pt-drag-ready', Math.abs(drag.dx) > 80);
}

function onSwipeMove(event) {
    if (!drag.mes) return;
    const x = event.touches[0].clientX - drag.x;
    const y = event.touches[0].clientY - drag.y;
    if (!drag.active) {
        if (Math.abs(y) > 14 && Math.abs(y) > Math.abs(x)) {
            drag.mes = null;
            return;
        }
        if (Math.abs(x) < 16) return;
        drag.active = true;
        const left = drag.mes.querySelector('.swipe_left');
        drag.canPrevious = !!(left && getComputedStyle(left).display !== 'none');
        const rect = drag.mes.getBoundingClientRect();
        drag.top = Math.max(rect.top, 70) + Math.min(rect.height, 300) / 2;
    }
    drag.dx = x > 0 && !drag.canPrevious ? Math.min(24, x * 0.15) : Math.max(-150, Math.min(150, x));
    if (!drag.frame) drag.frame = requestAnimationFrame(paintSwipe);
}

function onSwipeEnd() {
    cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    const mes = drag.mes;
    drag.mes = null;
    if (!mes || !drag.active) return;
    const canGo = drag.dx < 0 || drag.canPrevious;
    const fast = Math.abs(drag.dx) > 40 && Date.now() - drag.started < 250;
    const go = canGo && (Math.abs(drag.dx) > 80 || fast);
    mes.style.transition = 'transform 0.25s var(--pt-ease)';
    mes.style.transform = '';
    setTimeout(() => {
        mes.style.transition = '';
    }, 260);
    drag.hint?.remove();
    drag.hint = null;
    if (!go) return;
    buzz(12);
    const button = mes.querySelector(drag.dx < 0 ? '.swipe_right' : '.swipe_left');
    if (button && getComputedStyle(button).display !== 'none') button.click();
}

/** SillyTavern's own quick-flick swipe would fire as well; let the drag handle it. */
function onSwipedEvent(event) {
    if (active && settings.chatStyle && settings.dragSwipe) event.stopImmediatePropagation();
}

// -- chat: fold very long messages

const LONG_MESSAGE = 2500;

/**
 * The swipe pill shows "1/3" only when there is more than one version. With
 * one, it is just the round "new version" button.
 */
function syncSwipeCounters() {
    requestAnimationFrame(() => {
        const chat = ctx().chat ?? [];
        const all = document.body.classList.contains('swipeAllMessages');
        for (const mes of document.querySelectorAll(all ? '#chat > .mes' : '#chat > .mes.last_mes, #chat > .mes.pt-one-swipe')) {
            const message = chat[Number(mes.getAttribute('mesid'))];
            mes.classList.toggle('pt-one-swipe', active && !((message?.swipes?.length ?? 0) > 1));
        }
    });
}

/**
 * "Faster long chats" skips drawing messages that are off screen and guesses
 * their height until they are drawn. Scrolling up into a message drawn for the
 * first time then changed its height, and the chat moved under your finger.
 * So after a chat opens (or its messages change size) every message is drawn
 * once, for one frame; the browser remembers each real height from then on.
 */
const fastChat = { timer: 0, width: 0 };

function primeChatSizes(delay = 0) {
    window.clearTimeout(fastChat.timer);
    fastChat.timer = window.setTimeout(() => {
        const chat = document.getElementById('chat');
        if (!active || !settings.fastChat || !chat) return;
        chat.classList.add('pt-fast-prime');
        // Drawn in the next frame (heights are remembered then), skipped again after it.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            chat.classList.remove('pt-fast-prime');
            keepAtNewest();
        }));
    }, delay);
}

/**
 * A chat opens at its newest message. SillyTavern scrolls there once, but then
 * the messages settle (their real heights are measured, long ones fold), and
 * the chat ended up far above the newest message. For a moment after a chat
 * opens, keep it at the newest message, until you scroll yourself.
 */
const newest = { until: 0, started: null };

function keepAtNewest() {
    if (!active) return;
    const chat = document.getElementById('chat');
    if (newest.started?.()) newest.until = 0;
    if (!chat || Date.now() > newest.until || ctx().getCurrentChatId?.() === undefined) return;
    chat.scrollTop = chat.scrollHeight;
}

function holdAtNewest(ms = 2500) {
    const chat = document.getElementById('chat');
    if (!active || !chat || ctx().powerUserSettings?.auto_scroll_chat_to_bottom === false) return;
    newest.until = Date.now() + ms;
    newest.started = userScrollSince();
    for (const delay of [60, 250, 500, 900, 1400, 2200]) setTimeout(keepAtNewest, delay);
}

/**
 * Scrolling by hand: a touch, the wheel, a scroll key or the scrollbar. One set of
 * listeners on the chat (added once), so opening chats does not pile up more.
 * Returns a check: has the user scrolled since this call?
 */
const userScroll = { at: 0, wired: null };

function userScrollSince() {
    const chat = document.getElementById('chat');
    if (chat && userScroll.wired !== chat) {
        userScroll.wired = chat;
        const mark = () => { userScroll.at = performance.now(); };
        chat.addEventListener('touchstart', mark, { passive: true });
        chat.addEventListener('wheel', mark, { passive: true });
        // The scrollbar: a press on the chat itself, not on a message inside it.
        chat.addEventListener('pointerdown', event => { if (event.target === chat) mark(); }, { passive: true });
        document.addEventListener('keydown', event => {
            if (active && ['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && !event.target?.closest?.('textarea, input, select, [contenteditable]')) mark();
        });
    }
    const since = performance.now();
    return () => userScroll.at > since;
}

function onChatWidthChange() {
    const width = document.getElementById('chat')?.clientWidth ?? 0;
    if (!width || width === fastChat.width) return;
    fastChat.width = width;
    // A new width wraps every message differently.
    primeChatSizes(250);
}

// -- chat: a message picture that fails to load (a removed group member, a missing file).
// SillyTavern swaps it for a 50px "no picture" icon, which spilled out of our smaller picture slot
// (Kahvana's report). The icon is marked with the name's initials and a colour made from the name,
// and CSS draws it as a circle in the slot.

function nameHue(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) | 0;
    return Math.abs(hash) % 360;
}

function initialsOf(name) {
    const firsts = String(name).trim().split(/\s+/).map(word => word.match(/[\p{L}\p{N}]/u)?.[0]).filter(Boolean);
    if (!firsts.length) return '?';
    return (firsts.length > 1 ? firsts[0] + firsts[firsts.length - 1] : firsts[0]).toLocaleUpperCase();
}

function markMissingAvatars(root = document.getElementById('chat')) {
    const want = active && settings.chatStyle;
    for (const icon of root?.querySelectorAll('.mes .avatar > .missing-avatar') ?? []) {
        if (!want) {
            delete icon.dataset.ptInitials;
            icon.style.removeProperty('--pt-hue');
            continue;
        }
        const name = icon.closest('.mes')?.getAttribute('ch_name') ?? '';
        const initials = initialsOf(name);
        if (icon.dataset.ptInitials === initials) continue;
        icon.dataset.ptInitials = initials;
        icon.style.setProperty('--pt-hue', String(nameHue(name)));
    }
}

function onAvatarError(event) {
    const img = event.target;
    if (!active || !settings.chatStyle || !(img instanceof HTMLImageElement)) return;
    const mes = img.closest('#chat .mes');
    // SillyTavern's own error handler on the picture runs after this capture listener.
    if (mes && img.closest('.avatar')) setTimeout(() => markMissingAvatars(mes), 0);
}

function foldLongMessages() {
    if (!active || !settings.chatStyle || !settings.foldLong) {
        document.querySelectorAll('#chat .mes.pt-long, #chat .mes.pt-long-open').forEach(mes => mes.classList.remove('pt-long', 'pt-long-open'));
        document.querySelectorAll('.pt-more-btn').forEach(node => node.remove());
        return;
    }
    const chat = ctx().chat ?? [];
    let changed = false;
    for (const mes of document.querySelectorAll('#chat > .mes')) {
        const message = chat[Number(mes.getAttribute('mesid'))];
        const text = message?.extra?.display_text ?? message?.mes ?? '';
        const long = text.length > LONG_MESSAGE && !mes.classList.contains('last_mes') && !mes.querySelector('#curEditTextarea');
        if (mes.classList.contains('pt-long') !== long) changed = true;
        mes.classList.toggle('pt-long', long);
        let button = mes.querySelector('.pt-more-btn');
        if (long && !button) {
            button = h('button', {
                type: 'button',
                class: 'pt-more-btn',
                onclick: () => {
                    const open = mes.classList.toggle('pt-long-open');
                    button.textContent = open ? t('Show less') : t('Show more');
                    if (!open) mes.scrollIntoView({ block: 'nearest' });
                },
            }, [t('Show more')]);
            mes.querySelector('.mes_text')?.after(button);
        } else if (!long && button) {
            button.remove();
            mes.classList.remove('pt-long-open');
        }
    }
    // Folding changes heights; let the browser remember the new ones.
    if (changed) primeChatSizes();
}

// -- chat: search inside the chat

const finder = { bar: null, hits: [], index: -1, marks: [], seq: 0, timer: 0 };

function chatFinderOpen() {
    return !!finder.bar;
}

function closeChatFinder() {
    finder.seq += 1;
    window.clearTimeout(finder.timer);
    finder.timer = 0;
    clearFinderMarks();
    document.querySelectorAll('#chat .mes.pt-flash').forEach(mes => mes.classList.remove('pt-flash'));
    finder.bar?.remove();
    finder.bar = null;
    finder.hits = [];
    finder.index = -1;
    scheduleHistorySync();
}

function clearFinderMarks() {
    const parents = new Set();
    for (const mark of finder.marks) {
        if (!mark.isConnected) continue;
        if (mark.parentElement) parents.add(mark.parentElement);
        mark.replaceWith(document.createTextNode(mark.textContent));
    }
    for (const parent of parents) parent.normalize?.();
    finder.marks = [];
}

function markInMessage(mes, words) {
    if (!words.length) return;
    const text = mes.querySelector('.mes_text');
    if (!text) return;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const pattern = new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    for (const node of nodes) {
        const value = node.nodeValue;
        const norm = normalizeText(value);
        const searchIn = norm.length === value.length ? norm : value;
        pattern.lastIndex = 0;
        if (!pattern.test(searchIn)) continue;
        pattern.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let last = 0;
        for (const match of searchIn.matchAll(pattern)) {
            if (!match[0].length) break;
            const start = match.index;
            const end = start + match[0].length;
            fragment.append(document.createTextNode(value.slice(last, start)));
            const mark = h('mark', { class: 'pt-find-mark', raw: value.slice(start, end) });
            finder.marks.push(mark);
            fragment.append(mark);
            last = end;
        }
        fragment.append(document.createTextNode(value.slice(last)));
        node.replaceWith(fragment);
    }
}

async function showFinderHit(index) {
    if (!finder.hits.length || !finder.bar) return;
    const token = ++finder.seq;
    finder.index = (index + finder.hits.length) % finder.hits.length;
    const id = finder.hits[finder.index];
    finder.bar.querySelector('.pt-find-count').textContent = `${finder.index + 1}/${finder.hits.length}`;
    // Older messages may not be on the page yet: ask SillyTavern to load more.
    for (let tries = 0; tries < 60 && !document.querySelector(`#chat .mes[mesid="${id}"]`); tries++) {
        if (finder.seq !== token || !finder.bar || !active) return;
        const more = document.getElementById('show_more_messages');
        if (!more) break;
        more.click();
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (finder.seq !== token || !finder.bar || !active) return;
    const mes = document.querySelector(`#chat .mes[mesid="${id}"]`);
    if (!mes) return;
    clearFinderMarks();
    const words = normalizeText(finder.bar.querySelector('input').value).split(/\s+/).filter(Boolean);
    if (!words.length) return;
    markInMessage(mes, words);
    if (mes.classList.contains('pt-long') && !mes.classList.contains('pt-long-open')) {
        mes.classList.add('pt-long-open');
        const more = mes.querySelector('.pt-more-btn');
        if (more) more.textContent = t('Show less');
    }
    const firstMark = finder.marks[0];
    (firstMark ?? mes).scrollIntoView({ block: 'center', behavior: motionAllowed() ? 'smooth' : 'auto' });
    mes.classList.remove('pt-flash');
    void mes.offsetWidth;
    mes.classList.add('pt-flash');
    window.setTimeout(() => mes.classList.remove('pt-flash'), 1600);
}

function runChatSearch() {
    const input = finder.bar?.querySelector('input');
    if (!input) return;
    const words = normalizeText(input.value).split(/\s+/).filter(Boolean);
    const chat = ctx().chat ?? [];
    finder.hits = [];
    if (words.length) {
        chat.forEach((message, id) => {
            if (message?.is_system) return;
            const text = normalizeText(`${message.mes ?? ''} ${message.extra?.display_text ?? ''}`);
            if (words.every(word => text.includes(word))) finder.hits.push(id);
        });
    }
    const count = finder.bar.querySelector('.pt-find-count');
    if (!words.length) count.textContent = '';
    else if (!finder.hits.length) count.textContent = t('None');
    if (finder.hits.length) showFinderHit(finder.hits.length - 1);
    else clearFinderMarks();
}

function openChatFinder() {
    if (finder.bar) {
        finder.bar.querySelector('input').focus();
        return;
    }
    const input = h('input', { type: 'search', class: 'text_pole', placeholder: t('Search this chat'), 'aria-label': t('Search this chat'), enterkeyhint: 'search' });
    input.addEventListener('input', () => {
        window.clearTimeout(finder.timer);
        finder.timer = window.setTimeout(() => {
            finder.timer = 0;
            runChatSearch();
        }, 250);
    });
    input.addEventListener('keydown', event => {
        // Enter: flush pending search or go to next older match; Shift+Enter: newer; Escape closes.
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            if (finder.timer) {
                window.clearTimeout(finder.timer);
                finder.timer = 0;
                runChatSearch();
            } else {
                showFinderHit(finder.index + (event.shiftKey ? 1 : -1));
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeChatFinder();
        }
    });
    const button = (iconName, label, onclick) => h('button', { type: 'button', class: 'pt-find-btn', 'aria-label': label, title: label, onclick }, [ui(iconName)]);
    finder.bar = h('div', { class: 'pt-chat-finder', role: 'search' }, [
        input,
        h('span', { class: 'pt-find-count' }),
        button('chevron-up', 'Older match', () => showFinderHit(finder.index - 1)),
        button('chevron-down', 'Newer match', () => showFinderHit(finder.index + 1)),
        button('x', 'Close search', () => closeChatFinder()),
    ]);
    shieldFromDrawerAutoClose(finder.bar);
    document.body.append(finder.bar);
    setTimeout(() => input.focus(), 50);
    scheduleHistorySync();
}

// -- chat: how full is the context?

// `live` is on while a reply of yours is being prepared: only that prompt is counted. Extensions
// and SillyTavern features send small background prompts through the same events (generateRaw,
// quiet prompts), and one of those used to replace the count ("always 64 tokens", issue #3).
const meter = { used: 0, max: 0, breakdown: null, chatId: null, live: false, timer: 0 };

function contextMax() {
    const context = ctx();
    return context.mainApi === 'openai' ? Number(context.chatCompletionSettings?.openai_max_context) || 0 : Number(context.maxContext) || 0;
}

/** How many tokens are kept free for the reply. */
function replyLength() {
    const context = ctx();
    if (context.mainApi === 'openai') return Number(context.chatCompletionSettings?.openai_max_tokens) || 0;
    return Number(document.getElementById('amount_gen')?.value) || 0;
}

/** What the prompt itself may use: the context size minus the room kept for the reply. */
function contextAvailable() {
    return Math.max(0, contextMax() - replyLength());
}

async function measurePrompt(text) {
    try {
        const tokens = await ctx().getTokenCountAsync?.(text);
        if (typeof tokens === 'number') {
            meter.used = tokens;
            meter.max = contextAvailable() || contextMax();
            meter.breakdown = null;
            renderMeter();
        }
    } catch {
        // No tokenizer for this API: leave the meter as it was.
    }
}

const CTX_PARTS = {
    system: { label: 'Main prompt and instructions', color: '#94a3b8' },
    character: { label: 'Character, persona and scenario', color: '#a78bfa' },
    examples: { label: 'Example messages', color: '#f5b942' },
    lore: { label: 'Lorebooks', color: '#2dd4bf' },
    history: { label: 'Chat history', color: 'var(--pt-accent)' },
    notes: { label: "Author's note and extras", color: '#f472b6' },
    bias: { label: 'Bias', color: '#cbd5e1' },
    other: { label: 'Other', color: '#64748b' },
};

/**
 * What filled the context on the last reply, from SillyTavern's own record of
 * each prompt (the same numbers as its Prompt popup). Null before any reply.
 */
async function contextBreakdown() {
    const module = await import('/scripts/itemized-prompts.js').catch(() => null);
    const list = module?.itemizedPrompts;
    const chat = ctx().chat ?? [];
    if (!Array.isArray(list) || !list.length) return null;
    let index = -1;
    for (let i = list.length - 1; i >= 0; i--) {
        if (chat[list[i]?.mesId]) {
            index = i;
            break;
        }
    }
    if (index < 0) return null;
    const entry = list[index];
    const p = await module.itemizedParams(list, index, entry.mesId);
    const n = value => Math.max(0, Math.round(Number(value) || 0));
    let total;
    let available;
    let parts;
    if (p.this_main_api === 'openai') {
        total = n(p.finalPromptTokens);
        available = n(p.thisPrompt_max_context);
        const story = n(p.afterScenarioAnchorTokens) + n(p.beforeScenarioAnchorTokens) + n(p.oaiPromptTokens);
        parts = [
            ['system', n(p.oaiSystemTokens)],
            ['character', Math.max(0, story - n(p.examplesStringTokens))],
            ['examples', n(p.examplesStringTokens)],
            ['lore', n(p.worldInfoStringTokens)],
            ['history', n(p.ActualChatHistoryTokens)],
            ['bias', n(p.oaiBiasTokens)],
        ];
    } else {
        total = n(p.totalTokensInPrompt) || n(p.finalPromptTokens);
        available = n(p.thisPrompt_max_context);
        parts = [
            ['character', n(p.storyStringTokens)],
            ['examples', n(p.examplesStringTokens)],
            ['lore', n(p.worldInfoStringTokens)],
            ['history', n(p.ActualChatHistoryTokens)],
            ['notes', n(p.allAnchorsTokens)],
            ['bias', n(p.promptBiasTokens)],
        ];
    }
    const counted = parts.reduce((sum, [, tokens]) => sum + tokens, 0);
    if (total > counted + 2) parts.push(['other', total - counted]);
    if (!total) total = counted;
    return {
        total,
        available: available || contextAvailable(),
        reply: replyLength(),
        parts: parts.filter(([, tokens]) => tokens > 0).map(([key, tokens]) => ({ key, tokens })),
        character: {
            Description: n(p.charDescriptionTokens),
            Personality: n(p.charPersonalityTokens),
            Scenario: n(p.scenarioTextTokens),
            Persona: n(p.userPersonaStringTokens),
        },
        facts: [
            ['Messages in context', p.messagesCount],
            ['Example messages', p.examplesCount],
            ['Model', p.modelUsed],
            ['Preset', p.presetName],
            ['Connection', p.apiUsed || p.mainApiFriendlyName],
            ['Tokenizer', p.selectedTokenizer],
        ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ''),
        showPrompt: () => module.promptItemize(list, entry.mesId),
    };
}

/** After a chat opens, fill the ring from its last reply right away. */
async function loadMeterFromHistory() {
    if (!active || !settings.contextMeter) return;
    const chatId = ctx().getCurrentChatId?.();
    try {
        const info = await contextBreakdown();
        if (ctx().getCurrentChatId?.() !== chatId) return;
        meter.chatId = chatId;
        if (info) {
            meter.used = info.total;
            meter.max = info.available;
            meter.breakdown = info;
        }
        renderMeter();
    } catch (error) {
        console.debug(LOG, 'Could not read the last prompt', error);
    }
}

function contextShare() {
    return meter.used && meter.max ? Math.min(1, meter.used / meter.max) : 0;
}

/** A ring with the share drawn on it; used in the message box and, bigger, in the Context sheet. */
function paintRing(ring, share, empty) {
    const percent = Math.round(share * 100);
    // A style, not an attribute: the stylesheet's starting value would win over an attribute.
    const fill = ring.querySelector('.pt-ctx-fill');
    if (fill) fill.style.strokeDasharray = `${empty ? 0 : Math.max(2, percent)} 100`;
    ring.classList.toggle('pt-ctx-empty', empty);
    ring.classList.toggle('pt-ctx-warn', !empty && share > 0.85 && share <= 0.98);
    ring.classList.toggle('pt-ctx-full', !empty && share > 0.98);
    const num = ring.querySelector('.pt-ctx-num');
    if (num) num.textContent = empty ? '' : `${percent}%`;
}

function onPromptReady(data) {
    if (!active || !settings.contextMeter || data?.dryRun || !meter.live) return;
    meter.live = false;
    if (Array.isArray(data?.chat)) measurePrompt(data.chat.map(item => (typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''))).join('\n'));
    else if (typeof data?.prompt === 'string') measurePrompt(data.prompt);
}

function renderMeter() {
    const ring = composer.ring;
    if (!ring) return;
    const empty = !meter.used || !meter.max;
    const share = contextShare();
    paintRing(ring, share, empty);
    const label = empty ? t('Context: no reply yet. Tap for details.') : t('Context {percent}% full. Tap for details.', { percent: Math.round(share * 100) });
    ring.setAttribute('aria-label', label);
    ring.title = label;
}

/** The Context sheet: how full, what filled it, and where to change it. */
function openContextSheet() {
    const inChat = !!(ctx().groupId || ctx().characterId !== undefined);
    let info = meter.breakdown;
    let loading = inChat && !info;
    let failed = false;
    const instance = new MenuSheet({
        title: t('Context'),
        subtitle: t('What the model reads before it replies'),
        fill: body => fillContextSheet(body, { inChat, info, loading, failed }),
    });
    showSheet(instance);
    if (!loading) return;
    contextBreakdown().then(result => {
        info = result;
        if (result) {
            meter.used = result.total;
            meter.max = result.available;
            meter.breakdown = result;
            renderMeter();
        }
    }).catch(error => {
        failed = true;
        console.debug(LOG, 'Could not read the last prompt', error);
    }).finally(() => {
        loading = false;
        if (sheet === instance) instance.fill = body => fillContextSheet(body, { inChat, info, loading, failed });
        if (sheet === instance) instance.refresh();
    });
}

function fillContextSheet(body, { inChat, info, loading, failed }) {
    if (!inChat) {
        body.append(h('p', { class: 'pt-menu-foot', text: t('Open a chat first.') }));
        return;
    }
    const fmt = value => Number(value || 0).toLocaleString();
    const total = info?.total ?? meter.used;
    const available = info?.available ?? (meter.max || contextAvailable());
    const reply = info?.reply ?? replyLength();
    const empty = !total || !available;
    const share = empty ? 0 : Math.min(1, total / available);

    // The big ring and the headline.
    const big = h('div', { class: 'pt-ctx-big' }, [
        h('span', { class: 'pt-ctx-num' }),
        h('small', { class: 'pt-ctx-unit', text: empty ? '' : t('full') }),
    ]);
    big.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="pt-ctx-track" cx="18" cy="18" r="15"/><circle class="pt-ctx-fill" cx="18" cy="18" r="15" pathLength="100"/></svg>');
    paintRing(big, share, empty);
    if (empty) big.querySelector('.pt-ctx-num').textContent = '–';
    const head = h('div', { class: 'pt-ctx-head' });
    if (loading) {
        head.append(h('b', { text: t('Counting…') }));
    } else if (empty) {
        head.append(h('b', { text: t('No reply yet in this chat') }), h('small', { text: t('After the next reply you will see what filled the context: the character, lorebooks, chat history and more.') }));
    } else {
        head.append(
            h('b', { text: t('{used} tokens', { used: fmt(total) }) }),
            h('small', { text: t('of {available} the model can read', { available: fmt(available) }) }),
            h('small', { class: 'pt-ctx-sub', text: t('{max} context, {reply} kept for the reply', { max: fmt(available + reply), reply: fmt(reply) }) }),
        );
    }
    body.append(h('div', { class: 'pt-ctx-hero' }, [big, head]));
    if (loading) return;

    // What filled it: one bar, then one row per part.
    if (info?.parts?.length && !empty) {
        const bar = h('div', { class: 'pt-ctx-bar', role: 'img', 'aria-label': t('What filled the context') });
        for (const part of info.parts) {
            const span = h('span');
            span.style.setProperty('--c', CTX_PARTS[part.key].color);
            span.style.flexBasis = `${(part.tokens / available) * 100}%`;
            bar.append(span);
        }
        body.append(bar);
        const rows = info.parts.map(part => {
            const dot = h('span', { class: 'pt-ctx-dot' });
            dot.style.setProperty('--c', CTX_PARTS[part.key].color);
            const text = h('span', { class: 'pt-ctx-name' }, [h('span', { text: CTX_PARTS[part.key].label })]);
            if (part.key === 'character') {
                const pieces = Object.entries(info.character).filter(([, tokens]) => tokens > 0).map(([name, tokens]) => `${t(name)} ${fmt(tokens)}`);
                if (pieces.length) text.append(h('small', { text: pieces.join(', ') }));
            }
            if (part.key === 'history') {
                const count = info.facts.find(([name]) => name === 'Messages in context')?.[1];
                if (count) text.append(h('small', { text: t('{count} messages', { count }) }));
            }
            return h('div', { class: 'pt-ctx-row' }, [
                dot,
                text,
                h('span', { class: 'pt-ctx-tok' }, [h('b', { text: fmt(part.tokens) }), h('small', { text: `${Math.max(1, Math.round((part.tokens / available) * 100))}%` })]),
            ]);
        });
        const free = Math.max(0, available - total);
        const freeDot = h('span', { class: 'pt-ctx-dot pt-ctx-dot-free' });
        rows.push(h('div', { class: 'pt-ctx-row pt-ctx-row-free' }, [
            freeDot,
            h('span', { class: 'pt-ctx-name' }, [h('span', { text: t('Free space') })]),
            h('span', { class: 'pt-ctx-tok' }, [h('b', { text: fmt(free) }), h('small', { text: `${Math.round((free / available) * 100)}%` })]),
        ]));
        body.append(h('div', { class: 'pt-ctx-list' }, rows));
    }

    // A plain-words note on what this means.
    if (!empty) {
        const warn = share > 0.85;
        const note = warn
            ? t('Almost full: the oldest messages are left out so the newest ones fit.')
            : t('Room for about {free} more tokens before older messages start to drop out.', { free: fmt(Math.max(0, available - total)) });
        body.append(h('p', { class: `pt-ctx-note ${warn ? 'pt-ctx-note-warn' : ''}`, text: note }));
    }
    if (failed) body.append(h('p', { class: 'pt-ctx-note pt-ctx-note-warn', text: t('Could not read the details of the last reply.') }));

    // Facts about the last reply and the settings.
    const facts = [...(info?.facts ?? []).filter(([name]) => name !== 'Messages in context' || !info?.parts?.length)];
    facts.push(['Context size', fmt(available + reply)], ['Kept for the reply', fmt(reply)]);
    body.append(h('div', { class: 'pt-ctx-facts' }, facts.map(([name, value]) => {
        const fact = h('div', { class: 'pt-ctx-fact' }, [h('small', { text: name })]);
        // Values (model and preset names) are shown as they are, not translated.
        const strong = document.createElement('b');
        strong.textContent = String(value);
        fact.append(strong);
        return fact;
    })));

    const actions = [];
    if (info?.showPrompt) {
        actions.push(h('button', {
            type: 'button',
            class: 'pt-ctx-btn',
            onclick: () => {
                closeSheet(true);
                info.showPrompt();
            },
        }, [ui('file-text'), h('span', { text: 'Show the full prompt' })]));
    }
    actions.push(h('button', {
        type: 'button',
        class: 'pt-ctx-btn',
        onclick: () => {
            closeSheet(true);
            openPage('ai-config-button');
        },
    }, [ui('sliders'), h('span', { text: 'Change context size' })]));
    body.append(h('div', { class: 'pt-ctx-actions' }, actions));
    if (info) body.append(h('p', { class: 'pt-menu-foot', text: t('Counted from the last reply in this chat.') }));
}

function meterText() {
    if (!meter.used || !meter.max) return t('Shown after the next reply');
    return t('{used} of {max} tokens ({percent}%)', { used: meter.used.toLocaleString(), max: meter.max.toLocaleString(), percent: Math.round((meter.used / meter.max) * 100) });
}

// -- chat: look (cards, bubbles, flat)

function applyChatLook() {
    const root = document.documentElement;
    if (active && settings.chatStyle && settings.chatLook && settings.chatLook !== 'cards') root.dataset.ptLook = settings.chatLook;
    else delete root.dataset.ptLook;
}

function chatLookControl() {
    const names = { cards: 'Cards', bubbles: 'Bubbles', flat: 'Flat' };
    // SillyTavern's own Bubbles or Document style draws the messages itself: then none of these is on.
    const paused = !!stChatStyleName();
    return h('div', { class: 'pt-segmented pt-look-seg', role: 'group', 'aria-label': 'Chat look' },
        Object.entries(names).map(([look, label]) => {
            const on = !paused && (settings.chatLook || 'cards') === look;
            return h('button', {
                type: 'button',
                class: `pt-seg ${on ? 'pt-seg-on' : ''}`,
                'aria-pressed': String(on),
                onclick: () => pickChatLook(look),
            }, [label]);
        }));
}

function pickChatLook(look) {
    const switched = useFlatChatStyle();
    if (switched) globalThis.toastr?.info(t("SillyTavern's Chat Style is now Flat, so Pocket Tavern's chat look shows."), '', { timeOut: 4000 });
    if ((settings.chatLook || 'cards') !== look) setAppearance('chatLook', look);
    else if (switched && sheet && !sheet.picker) sheet.refresh();
}

// -- SillyTavern's own look (UI themes, Chat Style, backgrounds) next to Pocket Tavern's

/**
 * A Pocket Tavern theme draws the whole look, the messages too. A SillyTavern theme picked
 * earlier (Cappuccino, Azure) often brings Chat Style: Bubbles, and SillyTavern then drew its
 * bubbles in Pocket Tavern's colours: the two looks fought. So when a Pocket Tavern theme
 * comes on (a new install, or picking one), SillyTavern's Chat Style goes to Flat once and the
 * old style is remembered; picking a SillyTavern theme again, or turning Pocket Tavern (or its
 * chat cards) off, puts it back. Only on those changes: a Chat Style you pick afterwards stays.
 */
function syncChatStyleForTheme() {
    const select = document.getElementById('chat_display');
    if (!select) return;
    const own = active && settings.chatStyle && ownThemeOn() ? String(settings.theme) : '';
    if (own) {
        if (settings.chatStyleFor === own) return;
        settings.chatStyleFor = own;
        if (select.value !== '0') {
            const name = stChatStyleName();
            settings.stChatStyle = select.value;
            useFlatChatStyle();
            globalThis.toastr?.info(t("Pocket Tavern's theme draws the chat, so SillyTavern's {style} chat style is off while it is on. Picking a SillyTavern theme in Settings → Themes brings it back.", { style: t(name) }), '', { timeOut: 7000 });
        }
        saveSettings();
        return;
    }
    if (!settings.chatStyleFor) return;
    const back = settings.stChatStyle;
    settings.chatStyleFor = '';
    settings.stChatStyle = '';
    saveSettings();
    if (back && select.value === '0' && select.querySelector(`option[value="${CSS.escape(back)}"]`)) $j()(select).val(back).trigger('change');
}

/** SillyTavern's Chat Style when it is not Flat (Pocket Tavern's message cards only draw over Flat), else ''. */
function stChatStyleName() {
    const select = document.getElementById('chat_display');
    if (!select || select.value === '0') return '';
    return select.selectedOptions[0]?.textContent?.trim() || select.value;
}

/** Puts SillyTavern's Chat Style on Flat (it saves it); true when it changed. */
function useFlatChatStyle() {
    const select = document.getElementById('chat_display');
    if (!select || select.value === '0') return false;
    $j()(select).val('0').trigger('change');
    return true;
}

function themeNote(id, key, text, actions = []) {
    return h('div', { id, class: 'pt-inline-note', 'data-pt': '1', 'data-key': key }, [
        h('p', { text }),
        actions.length ? h('div', { class: 'pt-inline-note-actions' }, actions.map(([label, onclick]) => h('button', { type: 'button', class: 'pt-inline-note-btn', onclick }, [label]))) : null,
    ]);
}

/** On the Backgrounds page: a Pocket Tavern theme's own background is covering chat backgrounds. */
function syncBackgroundNote() {
    const header = document.getElementById('bg-header-fixed');
    let note = document.getElementById('pt_bg_note');
    const theme = active ? currentTheme() : null;
    const key = theme && ownThemeOn() && settings.themeBackdrop ? `theme:${theme.id}` : '';
    if (!header || !key) {
        note?.remove();
        return;
    }
    if (note?.dataset.key === key) return;
    note?.remove();
    note = themeNote('pt_bg_note', key, t('The {theme} theme shows its own background, so chat backgrounds are hidden.', { theme: t(theme.name) }), [
        ['Show chat backgrounds', () => setAppearance('themeBackdrop', false)],
    ]);
    header.prepend(note);
}

/**
 * At the top of Settings → Look: SillyTavern's UI Theme list is hidden there while
 * Pocket Tavern is on, because its themes are in Settings → Themes, made to fit.
 */
function syncLookNote() {
    const block = document.getElementById('UI-presets-block');
    let note = document.getElementById('pt_look_note');
    if (!block || !active) {
        note?.remove();
        return;
    }
    if (note) return;
    note = themeNote('pt_look_note', 'moved', "Themes are in Settings → Themes: Pocket Tavern's own, and your SillyTavern themes made to fit. Theme Colors below change \"Your theme\".", [
        ['Open Themes', () => openThemeSheet()],
    ]);
    block.prepend(note);
}

function syncThemeNotes() {
    syncBackgroundNote();
    syncLookNote();
}

/**
 * Picking a background while a Pocket Tavern theme shows its own: the pick is what
 * you want to see, so the theme's background turns off.
 */
function onBackgroundPick(event) {
    if (!active || !settings.themeBackdrop || !ownThemeOn()) return;
    const thumb = event.target.closest?.('#bg_menu_content .bg_example');
    if (!thumb || event.target.closest('.jg-menu, .mobile-only-menu-toggle') || thumb.closest('.bg-selection-mode')) return;
    setAppearance('themeBackdrop', false);
    globalThis.toastr?.info(t("The theme's own background is off now. Turn it back on in Settings → Themes."), t('Showing your background'), { timeOut: 4000 });
}

// -- lorebooks: entry cards with keyword chips, full-screen entry editor

const lore = { observer: null, timer: 0, edited: false };

/** Keywords of every entry in the open lorebook, from its data (entries build their insides only when opened). */
let loreKeys = { name: '', byUid: new Map() };

async function refreshLoreKeys() {
    const name = document.getElementById('world_editor_select')?.selectedOptions[0]?.textContent?.trim();
    if (!name) return;
    try {
        const data = await ctx().loadWorldInfo?.(name);
        const byUid = new Map();
        for (const entry of Object.values(data?.entries ?? {})) byUid.set(String(entry.uid), Array.isArray(entry.key) ? entry.key : []);
        loreKeys = { name, byUid };
    } catch {
        // Keep what we had.
    }
}

function entryKeys(entry) {
    // An open entry has its form, with both fields: a tag picker (computers) and a plain text box (phones, or
    // SillyTavern's "plain text keys" option). Only the one in use is filled; the other stays hidden and empty.
    const select = entry.querySelector('select[name="key"]');
    if (select?.classList.contains('select2-hidden-accessible')) return Array.from(select.selectedOptions).map(option => option.textContent.trim()).filter(Boolean);
    const field = entry.querySelector('textarea[name="key"]');
    if (field) return field.value.split(',').map(key => key.trim()).filter(Boolean);
    // A closed entry has no form, so use the book's data.
    return (loreKeys.byUid.get(String(entry.getAttribute('uid'))) ?? []).map(key => String(key).trim()).filter(Boolean);
}

async function decorateEntries(forceRefresh = false) {
    if (!active || !settings.touchSizing || !settings.loreCards) return;
    const list = document.getElementById('world_popup_entries_list');
    if (!list) return;
    const currentBook = document.getElementById('world_editor_select')?.selectedOptions[0]?.textContent?.trim() ?? '';
    // SillyTavern replaces an entry's key list when it is edited, and removes the form when the entry closes.
    // So after an entry was open, read the book again once its form is gone, or the chips show the old keys.
    const closedSinceEdit = lore.edited && !list.querySelector('.world_entry [name="key"]');
    if (forceRefresh || closedSinceEdit || (currentBook && loreKeys.name !== currentBook)) {
        lore.edited = false;
        await refreshLoreKeys();
        if (!active || !settings.touchSizing || !settings.loreCards) return;
    }
    for (const entry of list.querySelectorAll('.world_entry')) {
        // The content block uses the same class, so ask for the one in the header.
        const header = entry.querySelector('.inline-drawer-header > .world_entry_thin_controls');
        if (!header) continue;
        let chips = header.querySelector('.pt-entry-keys');
        if (!chips) {
            chips = h('div', { class: 'pt-entry-keys' });
            header.append(chips);
        }
        const keys = entryKeys(entry);
        const signature = keys.join('\u0001');
        if (chips.dataset.keys !== signature) {
            chips.dataset.keys = signature;
            chips.replaceChildren(...keys.slice(0, 8).map(key => h('span', { class: 'pt-key-chip', raw: key })),
                ...(keys.length > 8 ? [h('span', { class: 'pt-key-chip pt-key-more', raw: `+${keys.length - 8}` })] : []));
            chips.hidden = !keys.length;
        }
        const content = entry.querySelector('.inline-drawer-content');
        const open = !!content && content.style.display !== 'none' && getComputedStyle(content).display !== 'none';
        if (entry.classList.contains('pt-entry-open') !== open) {
            entry.classList.toggle('pt-entry-open', open);
            scheduleHistorySync();
        }
    }
    const anyOpen = !!list.querySelector('.world_entry.pt-entry-open');
    if (anyOpen) lore.edited = true;
    document.documentElement.classList.toggle('pt-entry-editing', anyOpen);
}

function openLoreEntry() {
    return document.querySelector('#world_popup_entries_list .world_entry.pt-entry-open');
}

function closeLoreEntry() {
    const entry = openLoreEntry();
    entry?.querySelector('.world_entry_thin_controls > .inline-drawer-toggle')?.click();
    setTimeout(() => decorateEntries(false), 50);
    setTimeout(() => decorateEntries(false), 400);
}

function syncLoreEntries() {
    const list = document.getElementById('world_popup_entries_list');
    const want = active && settings.touchSizing && settings.loreCards;
    document.documentElement.classList.toggle('pt-lorecards', !!want);
    if (!want) {
        window.clearTimeout(lore.timer);
        lore.timer = 0;
        lore.observer?.disconnect();
        lore.observer = null;
        lore.edited = false;
        document.querySelectorAll('.pt-entry-keys').forEach(node => node.remove());
        document.querySelectorAll('.world_entry.pt-entry-open').forEach(node => node.classList.remove('pt-entry-open'));
        document.documentElement.classList.remove('pt-entry-editing');
        return;
    }
    if (list && !lore.observer) {
        lore.observer = new MutationObserver(records => {
            if (records.every(record => record.target.closest?.('.pt-entry-keys'))) return;
            window.clearTimeout(lore.timer);
            lore.timer = window.setTimeout(() => decorateEntries(false), 120);
        });
        lore.observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        wireOnce(list, 'input', event => {
            // Entry cards may have been switched off since (the observer goes with them).
            if (lore.observer && event.target.matches?.('textarea[name="key"]')) {
                window.clearTimeout(lore.timer);
                lore.timer = window.setTimeout(() => decorateEntries(false), 300);
            }
        });
    }
    decorateEntries(true);
}

// -- presets: prompt triggers as chips

// -- presets: Parameters and Prompts as two tabs (Chat Completion)

/**
 * With the Chat Completion API the Presets page is the sampler settings and then, far below, the
 * prompt list. Chat Completion Tabs (another extension) splits them into two tabs; without it,
 * Pocket Tavern shows two tabs of its own (Kahvana's idea). Nothing is moved: the half that is not
 * shown is hidden, and with Chat Completion Tabs installed its own tabs are used instead.
 */
const presetTabs = { tab: 'params', bar: null, marked: [] };

function teardownPresetTabs() {
    presetTabs.bar?.remove();
    presetTabs.bar = null;
    for (const node of presetTabs.marked) node.classList.remove('pt-ptab-path', 'pt-ptab-prompts');
    presetTabs.marked = [];
    const panel = document.getElementById('left-nav-panel');
    if (panel) delete panel.dataset.ptPtab;
    document.documentElement.classList.remove('pt-ptabs');
}

function setPresetTab(tab) {
    presetTabs.tab = tab;
    const panel = document.getElementById('left-nav-panel');
    if (panel) panel.dataset.ptPtab = tab;
    for (const button of presetTabs.bar?.children ?? []) {
        const on = button.id === `pt_ptab_${tab}`;
        button.classList.toggle('pt-seg-on', on);
        button.setAttribute('aria-selected', String(on));
    }
}

function syncPresetTabs() {
    const manager = document.getElementById('completion_prompt_manager');
    // The page's list of blocks: the preset picker on top (shown on both tabs), then the settings.
    const scope = document.getElementById('ai_response_configuration');
    const head = document.querySelector('#openai_api-presets > div');
    const want = active && settings.touchSizing && document.getElementById('main_api')?.value === 'openai'
        && !document.querySelector('.openai-tab-buttons') && !!head && !!scope?.contains(manager) && !!scope.querySelector(':scope > #respective-presets-block');
    if (!want) {
        if (presetTabs.bar || presetTabs.marked.length) teardownPresetTabs();
        return;
    }
    if (!presetTabs.bar?.isConnected) {
        teardownPresetTabs();
        // The prompt list's block, and each box between it and the page's list of settings.
        const block = manager.closest('.range-block') ?? manager;
        block.classList.add('pt-ptab-prompts');
        presetTabs.marked.push(block);
        for (let node = block.parentElement; node && node !== scope; node = node.parentElement) {
            node.classList.add('pt-ptab-path');
            presetTabs.marked.push(node);
        }
        presetTabs.bar = h('div', { class: 'pt-segmented pt-ptabs', role: 'tablist', 'aria-label': 'Presets', 'data-pt': '1' },
            [['params', 'Parameters', 'sliders'], ['prompts', 'Prompts', 'note']].map(([id, label, icon]) => h('button', {
                type: 'button', id: `pt_ptab_${id}`, class: 'pt-seg', role: 'tab', onclick: () => setPresetTab(id),
            }, [ui(icon), h('span', { text: label })])));
        head.after(presetTabs.bar);
    }
    setPresetTab(presetTabs.tab);
    document.documentElement.classList.add('pt-ptabs');
}

function syncTriggerChips() {
    const select = document.getElementById('completion_prompt_manager_popup_entry_form_injection_trigger');
    if (!select) return;
    let chips = document.getElementById('pt_trigger_chips');
    const want = active && settings.touchSizing;
    if (!want) {
        chips?.remove();
        select.classList.remove('pt-native-hidden');
        return;
    }
    if (!chips) {
        chips = h('div', { id: 'pt_trigger_chips', class: 'pt-trigger-chips', role: 'group', 'aria-label': 'Triggers' });
        chips.addEventListener('click', event => {
            const chip = event.target.closest('.pt-trigger-chip');
            if (!chip) return;
            const option = Array.from(select.options).find(item => item.value === chip.dataset.value);
            if (!option) return;
            option.selected = !option.selected;
            $j()(select).trigger('change');
            buzz(6);
            syncTriggerChips();
        });
        select.after(chips);
        select.classList.add('pt-native-hidden');
    }
    const none = !Array.from(select.options).some(option => option.selected);
    chips.replaceChildren(...Array.from(select.options).map(option => h('button', {
        type: 'button',
        class: `pt-trigger-chip ${option.selected ? 'pt-trigger-on' : ''}`,
        'data-value': option.value,
        'aria-pressed': String(option.selected),
    }, [option.textContent.trim()])), h('small', { class: 'pt-trigger-note', text: none ? t('None picked: used for every kind of reply.') : '' }));
}

// -- sliders: − and + beside the number

function stepButton(input, direction) {
    const onclick = () => {
        const before = input.value;
        try {
            if (direction > 0) input.stepUp();
            else input.stepDown();
        } catch {
            const size = Number(input.step) || 1;
            const decimals = (String(size).split('.')[1] || '').length;
            let next = Number(input.value || 0) + direction * size;
            if (input.min !== '') next = Math.max(Number(input.min), next);
            if (input.max !== '') next = Math.min(Number(input.max), next);
            input.value = String(decimals ? Number(next.toFixed(decimals)) : next);
        }
        if (input.value === before) return;
        buzz(4);
        // Move the slider itself, the way SillyTavern does after typing a number.
        const master = input.dataset.for ? document.getElementById(input.dataset.for) : null;
        if (master) $j()(master).val(input.value).trigger('input', { forced: true });
        else $j()(input).trigger('input').trigger('change');
    };
    return direction > 0
        ? h('button', { type: 'button', class: 'pt-step pt-step-up', 'aria-label': 'More', onclick }, ['+'])
        : h('button', { type: 'button', class: 'pt-step pt-step-down', 'aria-label': 'Less', onclick }, ['−']);
}

function addSliderSteppers(root = document) {
    if (!active || !settings.touchSizing) return;
    // Chat Completion sliders keep their number in a .range-block-counter box.
    for (const counter of root.querySelectorAll('.range-block-counter')) {
        const input = counter.querySelector('input[type="number"]');
        if (!input || counter.querySelector('.pt-step')) continue;
        counter.classList.add('pt-stepper');
        counter.prepend(stepButton(input, -1));
        counter.append(stepButton(input, 1));
    }
    // Text Completion, KoboldAI and NovelAI sliders have a bare number box; wrap it.
    for (const input of root.querySelectorAll('input.neo-range-input[type="number"]')) {
        if (input.closest('.range-block-counter, .pt-step-wrap')) continue;
        const wrap = h('span', { class: 'pt-step-wrap' });
        input.before(wrap);
        wrap.append(stepButton(input, -1), input, stepButton(input, 1));
    }
}

function removeSliderSteppers() {
    document.querySelectorAll('.pt-step-wrap').forEach(wrap => {
        const input = wrap.querySelector('input');
        if (input) wrap.before(input);
        wrap.remove();
    });
    document.querySelectorAll('.pt-step').forEach(node => node.remove());
    document.querySelectorAll('.range-block-counter.pt-stepper').forEach(node => node.classList.remove('pt-stepper'));
}

// -- long-press a message for its menu

const press = { timer: 0, x: 0, y: 0, fired: 0 };

function onMessagePressStart(event) {
    if (!active || !settings.messageMenu || !settings.longPress || event.pointerType === 'mouse') return;
    const message = event.target.closest?.('#chat .mes');
    if (!message || event.target.closest('textarea, input, a, button, .mes_button, .menu_button, .avatar, .swipe_left, .swipe_right, .mes_reasoning_summary, #curEditTextarea')) return;
    if (message.querySelector('#curEditTextarea')) return;
    window.clearTimeout(press.timer);
    press.x = event.clientX;
    press.y = event.clientY;
    press.timer = window.setTimeout(() => {
        press.timer = 0;
        if (!active || !message.isConnected) return;
        press.fired = Date.now();
        window.getSelection?.()?.removeAllRanges();
        buzz(15);
        openMessageMenu(message);
    }, 520);
}

function onMessagePressMove(event) {
    if (press.timer && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
        window.clearTimeout(press.timer);
        press.timer = 0;
    }
}

function onMessagePressEnd() {
    window.clearTimeout(press.timer);
    press.timer = 0;
}

/** After a long-press opened the menu, swallow the stray tap/contextmenu on the chat (never inside the opened sheet). */
function onPressAfterEffects(event) {
    if (press.fired && Date.now() - press.fired < 700) {
        if (event.target instanceof Element && event.target.closest('#pt-sheet')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}

// -- "can't reach SillyTavern" banner

const server = { down: false, timer: 0, banner: null, busy: false };

async function serverReachable() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 5000) : 0;
    try {
        // Any answer at all means the server is up; only a network failure or timeout counts.
        await fetch('/api/ping', { method: 'POST', headers: ctx().getRequestHeaders?.() ?? {}, cache: 'no-store', signal: controller?.signal });
        return true;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timeout);
    }
}

function scheduleServerCheck(delay) {
    window.clearTimeout(server.timer);
    if (!active || !settings.serverWatch) return;
    server.timer = window.setTimeout(checkServer, delay);
}

async function checkServer() {
    if (!active || !settings.serverWatch || server.busy) return;
    if (document.visibilityState !== 'visible') {
        scheduleServerCheck(30000);
        return;
    }
    server.busy = true;
    const up = await serverReachable();
    server.busy = false;
    if (!active || !settings.serverWatch) return;
    if (!up && !server.down) {
        server.down = true;
        showServerBanner();
    } else if (up && server.down) {
        server.down = false;
        showServerBanner(true);
    }
    // Check often while it is down, rarely while all is well.
    scheduleServerCheck(server.down ? 3000 : 30000);
}

function showServerBanner(back = false) {
    server.banner?.remove();
    server.banner = null;
    if (!active || !settings.serverWatch) return;
    const offlineHint = !isWide() && !IS_IOS
        ? t('Is Termux still running? This reconnects by itself when the server is back.')
        : t('Make sure SillyTavern is still running, then try again.');
    const banner = h('div', { class: `pt-banner ${back ? 'pt-banner-ok' : ''}`, role: 'status', 'aria-live': 'polite' }, [
        ui(back ? 'circle-check' : 'plug', 'pt-banner-icon'),
        h('span', { class: 'pt-banner-text' }, back
            ? [h('b', { text: t('Back online') })]
            : [h('b', { text: t("Can't reach SillyTavern") }), h('small', { raw: offlineHint })]),
        back ? null : h('button', {
            type: 'button',
            class: 'pt-banner-btn',
            onclick: () => {
                buzz(8);
                checkServer();
            },
        }, [t('Retry')]),
    ]);
    shieldFromDrawerAutoClose(banner);
    document.body.append(banner);
    server.banner = banner;
    if (back) {
        setTimeout(() => {
            if (server.banner === banner) {
                banner.classList.add('pt-banner-out');
                setTimeout(() => banner.remove(), 250);
                server.banner = null;
            }
        }, 2200);
    }
}

function syncServerWatch() {
    if (active && settings.serverWatch) scheduleServerCheck(server.down ? 1000 : 5000);
    else {
        window.clearTimeout(server.timer);
        server.down = false;
        server.banner?.remove();
        server.banner = null;
    }
}

// -- choice sheets (quick switcher)

/**
 * A sheet that lists choices with a search box when the list is long.
 * @param {{ title: string, subtitle?: string, options: { value: string, label: string, note?: string, image?: string }[], current?: string, onPick: (value: string) => void }} config
 */
function openChoiceSheet({ title, subtitle = '', options, current, onPick }) {
    showSheet(new MenuSheet({
        title,
        subtitle,
        fill: body => {
            const rows = options.map(option => {
                const on = option.value === current;
                return h('button', {
                    type: 'button',
                    class: `pt-menu-row pt-choice ${on ? 'pt-choice-on' : ''}`,
                    'data-search': normalizeText(`${option.label} ${option.note ?? ''}`),
                    'aria-pressed': String(on),
                    onclick: () => {
                        closeSheet(true);
                        if (option.value !== current) onPick(option.value);
                    },
                }, [
                    option.image ? h('img', { class: 'pt-choice-img', src: option.image, alt: '', loading: 'lazy' }) : null,
                    h('span', { class: 'pt-row-text' }, [
                        h('span', { raw: option.label }),
                        option.note ? h('small', { raw: option.note }) : null,
                    ]),
                    on ? ui('check', 'pt-menu-row-icon') : null,
                ]);
            });
            const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
            if (options.length > 8) {
                const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search'), 'aria-label': t('Search') });
                search.addEventListener('input', () => {
                    const words = normalizeText(search.value).split(/\s+/).filter(Boolean);
                    let shown = 0;
                    for (const row of rows) {
                        const ok = words.every(word => row.dataset.search.includes(word));
                        row.hidden = !ok;
                        if (ok) shown++;
                    }
                    empty.hidden = shown > 0;
                });
                body.append(search);
            }
            if (!options.length) body.append(h('p', { class: 'pt-menu-foot', text: t('Nothing to choose from here yet.') }));
            body.append(h('div', { class: 'pt-menu-list' }, rows), empty);
            requestAnimationFrame(() => body.querySelector('.pt-choice-on')?.scrollIntoView({ block: 'center' }));
        },
    }));
}

/** Is this control on screen in its page, i.e. not inside a section SillyTavern has hidden? */
function inActiveSection(element, root, allowCollapsedDrawers = false) {
    for (let node = element; node && node !== root; node = node.parentElement) {
        if (allowCollapsedDrawers && node.classList?.contains('inline-drawer-content')) continue;
        if (node.classList?.contains('displayNone') || node.style?.display === 'none') return false;
    }
    return true;
}

function optionsOf(select) {
    return Array.from(select.options)
        .filter(option => !option.disabled && !option.hidden && option.value !== '')
        .map(option => ({ value: option.value, label: option.textContent.trim() || option.value, note: option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '' }));
}

function pickFromSelect(select, value) {
    select.value = value;
    $j()(select).trigger('change');
    select.dispatchEvent(new Event('input', { bubbles: true }));
}

const PRESET_SELECTS = {
    openai: '#settings_preset_openai',
    kobold: '#settings_preset',
    koboldhorde: '#settings_preset',
    novel: '#settings_preset_novel',
    textgenerationwebui: '#settings_preset_textgenerationwebui',
};

function currentPresetSelect() {
    const id = PRESET_SELECTS[ctx().mainApi];
    return id ? document.querySelector(id) : null;
}

function currentModelSelect() {
    const block = document.getElementById('rm_api_block');
    if (!block) return null;
    const candidates = Array.from(block.querySelectorAll('select[id^="model_"], select[id$="_model"], select[id*="model_select"]'))
        .filter(select => !select.multiple && inActiveSection(select, block) && select.options.length > 1);
    return candidates[0] ?? null;
}

function personaChoices() {
    const power = ctx().powerUserSettings ?? {};
    const names = power.personas ?? {};
    const descriptions = power.persona_descriptions ?? {};
    return Object.entries(names).map(([avatar, name]) => ({
        value: avatar,
        label: name || avatar,
        note: (descriptions[avatar]?.description ?? '').replace(/\s+/g, ' ').slice(0, 70),
        image: `/thumbnail?type=persona&file=${encodeURIComponent(avatar)}`,
    })).sort((a, b) => a.label.localeCompare(b.label));
}

function currentPersona() {
    const src = document.querySelector('#user_avatar_block .avatar-container.selected')?.dataset.avatarId;
    return src ?? globalThis.user_avatar ?? '';
}

async function choosePersona(avatar) {
    try {
        const personas = await loadPersonasModule();
        if (!personas?.setUserAvatar) throw new Error('Personas module unavailable');
        await personas.setUserAvatar(avatar);
    } catch (error) {
        console.warn(LOG, 'Could not switch persona', error);
        globalThis.toastr?.error(t('Open Personas to switch instead.'), t('Could not switch persona'));
    }
}

/**
 * Your persona: the current one as a card with an Edit button, then the others
 * to switch to, then a way to all persona settings.
 */
async function openPersonaChooser() {
    const module = await loadPersonasModule();
    const instance = new MenuSheet({
        title: t('Your persona'),
        subtitle: t('Who you are in the chat'),
        fill: body => {
            // Read fresh each time: after switching, the sheet redraws with the new persona.
            const current = module?.user_avatar || currentPersona();
            const all = personaChoices();
            const description = ctx().powerUserSettings?.persona_descriptions?.[current]?.description ?? '';
            const name = h('b', { class: 'pt-persona-card-name' });
            name.textContent = personaName(current) || t('No name');
            const note = h('small', { class: 'pt-persona-card-desc' });
            note.textContent = description.replace(/\s+/g, ' ').trim() || t('No description yet.');
            body.append(h('div', { class: 'pt-persona-card' }, [
                h('img', { class: 'pt-persona-card-img', src: personaPicture(current), alt: '' }),
                h('span', { class: 'pt-persona-card-text' }, [name, note]),
                current ? h('button', {
                    type: 'button',
                    class: 'pt-persona-card-edit',
                    onclick: () => {
                        buzz(6);
                        openPersonaEditor(current);
                    },
                }, [ui('pencil'), h('span', { text: 'Edit' })]) : null,
            ]));
            const others = all.filter(option => option.value !== current);
            if (others.length) {
                body.append(h('p', { class: 'pt-menu-heading', text: t('Switch to') }));
                const rows = others.map(option => h('button', {
                    type: 'button',
                    class: 'pt-menu-row pt-choice',
                    'data-search': normalizeText(`${option.label} ${option.note ?? ''}`),
                    onclick: async () => {
                        // Stay open: you see the switch and can switch again.
                        buzz(8);
                        await choosePersona(option.value);
                        if (sheet === instance) instance.refresh();
                    },
                }, [
                    h('img', { class: 'pt-choice-img', src: option.image, alt: '', loading: 'lazy' }),
                    h('span', { class: 'pt-row-text' }, [h('span', { raw: option.label }), option.note ? h('small', { raw: option.note }) : null]),
                ]));
                const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
                if (others.length > 8) {
                    const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search'), 'aria-label': t('Search') });
                    search.addEventListener('input', () => {
                        const words = normalizeText(search.value).split(/\s+/).filter(Boolean);
                        let shown = 0;
                        for (const row of rows) {
                            const ok = words.every(word => row.dataset.search.includes(word));
                            row.hidden = !ok;
                            if (ok) shown++;
                        }
                        empty.hidden = shown > 0;
                    });
                    body.append(search);
                }
                body.append(h('div', { class: 'pt-menu-list' }, rows), empty);
            }
            body.append(h('div', { class: 'pt-menu-list' }, [h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: () => {
                    closeSheet(true);
                    openPage('persona-management-button');
                },
            }, [ui('settings', 'pt-menu-row-icon'), h('span', { text: 'All persona settings' }), ui('chevron-right', 'pt-menu-row-go')])]));
        },
    });
    showSheet(instance);
}

/** A quick editor for the current persona: its name and description. */
function openPersonaEditor(avatar) {
    if (!avatar) return;
    const power = ctx().powerUserSettings ?? {};
    const startName = power.personas?.[avatar] ?? '';
    const startText = power.persona_descriptions?.[avatar]?.description ?? (avatar === currentPersona() ? power.persona_description ?? '' : '');
    const nameInput = h('input', { type: 'text', class: 'text_pole pt-pe-name', 'aria-label': t('Name'), maxlength: '100', enterkeyhint: 'next' });
    nameInput.value = startName;
    const textInput = h('textarea', { class: 'text_pole pt-pe-text', rows: '8', 'aria-label': t('Description'), placeholder: t('Who are you? Looks, personality, anything the character should know about you.') });
    textInput.value = startText;
    nameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            textInput.focus();
        }
    });
    const count = h('small', { class: 'pt-pe-count' });
    let countTimer = 0;
    const recount = () => {
        window.clearTimeout(countTimer);
        countTimer = window.setTimeout(async () => {
            try {
                const tokens = await ctx().getTokenCountAsync?.(textInput.value);
                if (typeof tokens === 'number') count.textContent = t('{count} tokens', { count: tokens.toLocaleString() });
            } catch {
                count.textContent = '';
            }
        }, 300);
    };
    textInput.addEventListener('input', () => {
        fitTextarea(textInput);
        recount();
    });
    const save = async () => {
        const newName = nameInput.value.trim();
        if (!newName) {
            globalThis.toastr?.warning(t('Give your persona a name.'));
            nameInput.focus();
            return;
        }
        try {
            await savePersonaEdits(avatar, { name: newName, nameChanged: newName !== startName, text: textInput.value, textChanged: textInput.value !== startText });
            closeSheet();
            globalThis.toastr?.success(newName, t('Persona saved'), { timeOut: 1800 });
        } catch (error) {
            console.warn(LOG, 'Could not save the persona', error);
            globalThis.toastr?.error(t('Open Personas to edit it instead.'), t('Could not save the persona'));
        }
    };
    showSheet(new MenuSheet({
        title: t('Edit persona'),
        subtitle: t('Name and description'),
        fill: body => {
            body.append(h('div', { class: 'pt-pe' }, [
                h('div', { class: 'pt-pe-top' }, [
                    h('img', { class: 'pt-persona-card-img', src: personaPicture(avatar), alt: '' }),
                    h('label', { class: 'pt-pe-field' }, [h('small', { text: 'Name' }), nameInput]),
                ]),
                h('label', { class: 'pt-pe-field' }, [h('span', { class: 'pt-pe-label' }, [h('small', { text: 'Description' }), count]), textInput]),
                h('div', { class: 'pt-pe-actions' }, [
                    h('button', { type: 'button', class: 'pt-pe-btn', onclick: () => closeSheet() }, [h('span', { text: 'Cancel' })]),
                    h('button', { type: 'button', class: 'pt-pe-btn pt-pe-save', onclick: save }, [ui('check'), h('span', { text: 'Save' })]),
                ]),
            ]));
            requestAnimationFrame(() => fitTextarea(textInput));
            recount();
        },
    }));
}

/** Writes the edits the same way SillyTavern's Personas page does. */
async function savePersonaEdits(avatar, { name, nameChanged, text, textChanged }) {
    const context = ctx();
    const power = context.powerUserSettings;
    const personas = await loadPersonasModule();
    const isCurrent = (personas?.user_avatar || currentPersona()) === avatar;
    if (textChanged) {
        if (isCurrent) {
            // SillyTavern's own description box saves it (and its token count) on input.
            const box = document.getElementById('persona_description');
            if (!box) throw new Error('No persona description box');
            box.value = text;
            box.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            power.persona_descriptions[avatar] = { ...(power.persona_descriptions[avatar] ?? {}), description: text };
        }
    }
    if (nameChanged) {
        const oldName = power.personas[avatar];
        power.personas[avatar] = name;
        if (isCurrent) {
            const script = await import('/script.js');
            script.setUserName?.(name, { toastPersonaNameChange: false });
        }
        await context.eventSource?.emit?.(context.eventTypes?.PERSONA_RENAMED ?? 'persona_renamed', { avatarId: avatar, oldName, newName: name });
    }
    context.saveSettingsDebounced?.();
    await personas?.getUserAvatars?.(true, avatar);
    personas?.setPersonaDescription?.();
    updatePersonaButton();
}

function openQuickSwitch() {
    showSheet(new MenuSheet({
        title: t('Quick switch'),
        subtitle: t('Change who you are, the connection, the model or the preset.'),
        fill: body => {
            const rows = [];
            const row = (iconName, label, value, onclick, disabled = false) => h('button', {
                type: 'button', class: 'pt-menu-row', disabled, onclick,
            }, [
                ui(iconName, 'pt-menu-row-icon'),
                h('span', { class: 'pt-row-text' }, [h('span', { text: label }), h('small', { raw: value || t('Not set') })]),
                ui('chevron-right', 'pt-menu-row-go'),
            ]);
            const currentPersonaName = document.getElementById('your_name')?.textContent?.trim();
            rows.push(row('smile', t('Persona'), currentPersonaName, () => openPersonaChooser()));
            const profiles = document.getElementById('connection_profiles');
            if (profiles && optionsOf(profiles).length) {
                rows.push(row('plug', t('Connection profile'), profiles.selectedOptions[0]?.textContent.trim(), () => openChoiceSheet({
                    title: t('Connection profile'),
                    options: optionsOf(profiles),
                    current: profiles.value,
                    onPick: value => pickFromSelect(profiles, value),
                })));
            }
            const model = currentModelSelect();
            if (model) {
                rows.push(row('flask', t('Model'), model.selectedOptions[0]?.textContent.trim(), () => openChoiceSheet({
                    title: t('Model'),
                    options: optionsOf(model),
                    current: model.value,
                    onPick: value => {
                        pickFromSelect(model, value);
                        globalThis.toastr?.success(model.selectedOptions[0]?.textContent.trim() ?? value, t('Model'), { timeOut: 2000 });
                    },
                })));
            }
            const preset = currentPresetSelect();
            if (preset) {
                rows.push(row('sliders', t('Preset'), preset.selectedOptions[0]?.textContent.trim(), () => openChoiceSheet({
                    title: t('Preset'),
                    options: Array.from(preset.options).filter(option => !option.disabled).map(option => ({ value: option.value, label: option.textContent.trim() })),
                    current: preset.value,
                    onPick: value => pickFromSelect(preset, value),
                })));
            }
            if (settings.contextMeter) rows.push(row('chart', t('Context used'), meterText(), () => openContextSheet()));
            const status = ctx().onlineStatus;
            rows.push(row('globe', t('API connection'), status && status !== 'no_connection' ? t('Connected') : t('Not connected'), () => {
                closeSheet(true);
                openPage('sys-settings-button');
            }));
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

// -- find a setting

const SEARCH_PAGES = ['ai-config-button', 'sys-settings-button', 'advanced-formatting-button', 'user-settings-button', 'extensions-settings-button'];

function ownText(element) {
    let text = '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest('select, option, textarea, script, style, .pt-skip') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode() && text.length < 160) text += ` ${walker.currentNode.nodeValue}`;
    return text.replace(/\s+/g, ' ').trim();
}

function settingSection(row, root, headings) {
    const parts = [];
    const drawer = row.closest('.inline-drawer');
    if (drawer && root.contains(drawer)) {
        const header = drawer.querySelector(':scope > .inline-drawer-header, :scope > .inline-drawer-toggle');
        const text = header ? ownText(header) : '';
        if (text) parts.push(text);
    }
    let heading = null;
    for (const candidate of headings) {
        if (candidate.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) heading = candidate;
        else break;
    }
    const headingText = heading ? ownText(heading) : '';
    if (headingText && !parts.includes(headingText)) parts.unshift(headingText);
    return parts.join(' › ').slice(0, 80);
}

function settingItems(root) {
    const items = [];
    const seen = new Set();
    const labels = new Set();
    const headings = Array.from(root.querySelectorAll('h2, h3, h4, h5, .standoutHeader'));
    for (const control of root.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea, .menu_button, .checkbox_label')) {
        if (control.closest('.template_element, #pt-sheet')) continue;
        // Include controls inside collapsed .inline-drawer-content (revealSetting opens them on tap).
        if (!inActiveSection(control, root, true)) continue;
        let row = control;
        let label = '';
        for (let depth = 0; depth < 5 && row && row !== root; depth++, row = row.parentElement) {
            label = ownText(row) || (row === control ? (control.getAttribute('title') || control.getAttribute('placeholder') || '') : '');
            if (label.length >= 2) break;
        }
        if (!row || row === root || label.length < 2 || seen.has(row)) continue;
        seen.add(row);
        const section = settingSection(row, root, headings);
        const key = `${label}|${section}`;
        if (labels.has(key)) continue;
        labels.add(key);
        items.push({ row, label: label.length > 90 ? `${label.slice(0, 90)}…` : label, section, search: normalizeText(`${label} ${section}`) });
    }
    return items;
}

function revealSetting(row) {
    // Chat Completion Tabs keeps Parameters and Prompts apart: switch to the tab that holds it.
    const tab = row.closest('.openai-tab-content:not(.active)');
    if (tab) document.getElementById(tab.id.replace('-content-', '-btn-'))?.click();
    // Pocket Tavern's own Parameters / Prompts tabs, the same way.
    if (presetTabs.bar && row.closest('#ai_response_configuration') && !row.closest('#respective-presets-block')) setPresetTab(row.closest('.pt-ptab-prompts') ? 'prompts' : 'params');
    const section = row.closest('[data-pt-sec]')?.dataset.ptSec;
    const nav = pageSections();
    if (section && nav?.home && nav.view !== section) nav.open(section);
    // Open any folded sections around it first.
    for (let node = row.parentElement; node; node = node.parentElement) {
        if (node.classList?.contains('inline-drawer-content') && getComputedStyle(node).display === 'none') {
            node.closest('.inline-drawer')?.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header')?.click();
        }
    }
    setTimeout(() => {
        row.scrollIntoView({ block: 'center', behavior: motionAllowed() ? 'smooth' : 'auto' });
        row.classList.remove('pt-flash');
        void row.offsetWidth;
        row.classList.add('pt-flash');
        setTimeout(() => row.classList.remove('pt-flash'), 2000);
    }, 260);
}

function openSettingSearch() {
    const pageId = currentPageId();
    const root = pageId && document.querySelector(`#${pageId} > .drawer-content`);
    if (!root) return;
    const items = settingItems(root);
    const title = pageInfo(drawerById(pageId)).title;
    // The search box is the header (Kahvana's feedback: a "Find a setting" title above it only repeated it).
    const input = h('input', { type: 'search', class: 'text_pole pt-choice-search pt-head-search', placeholder: t('Find a setting in {page}', { page: t(title) }), 'aria-label': t('Find a setting'), enterkeyhint: 'search' });
    const finder = new MenuSheet({
        title: t('Find a setting'),
        fill: body => {
            const list = h('div', { class: 'pt-menu-list' });
            const foot = h('p', { class: 'pt-menu-foot' });
            const render = () => {
                const words = normalizeText(input.value).split(/\s+/).filter(Boolean);
                const hits = words.length ? items.filter(item => words.every(word => item.search.includes(word))).slice(0, 60) : [];
                list.replaceChildren(...hits.map(item => h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        revealSetting(item.row);
                    },
                }, [
                    ui('search', 'pt-menu-row-icon'),
                    h('span', { class: 'pt-row-text' }, [h('span', { raw: item.label }), item.section ? h('small', { raw: item.section }) : null]),
                ])));
                list.hidden = !hits.length;
                foot.textContent = !words.length ? t('{count} settings on this page.', { count: items.length }) : (hits.length ? '' : t('No setting matches that.'));
            };
            // Assigned, not added: the sheet can fill its body again, and the box (in the header) stays.
            input.oninput = render;
            input.onkeydown = event => {
                if (event.key !== 'Enter' || event.isComposing) return;
                event.preventDefault();
                list.querySelector('.pt-menu-row')?.click();
            };
            body.append(list, foot);
            render();
        },
    });
    finder.head.querySelector('.pt-overlay-text')?.replaceWith(input);
    showSheet(finder);
    setTimeout(() => input.focus(), 250);
}

// -- long pages in sections: Settings and Formatting

/**
 * Some SillyTavern pages are one long list of controls (User Settings has about a hundred).
 * They open on a short list of sections instead, like a phone's own Settings app, and a
 * section shows only its own controls; Back returns to the list. Nothing is moved: each
 * block is marked with its section and the others are hidden (`.pt-sec-off`).
 */
class PageSections {
    /**
     * @param {object} spec
     * @param {string} spec.pageId - the page's drawer id
     * @param {string} spec.rootClass - class on <html> while the list is in use
     * @param {string} spec.pageTitle - the page's name, shown under a section's title
     * @param {{ id: string, icon: string, title: string, note: string }[]} spec.sections
     * @param {() => HTMLElement | null} spec.block - the page's drawer content
     * @param {(nav: PageSections, block: HTMLElement) => boolean} spec.mark - marks the blocks; false when the page is not laid out as expected
     * @param {(nav: PageSections, block: HTMLElement, list: HTMLElement) => void} spec.place - puts the list of sections on the page
     */
    constructor(spec) {
        Object.assign(this, spec);
        this.view = 'home';
        this.home = null;
        this.marked = [];
    }

    markAs(element, id) {
        if (!element || element.dataset.ptSec) return;
        element.dataset.ptSec = id;
        this.marked.push(element);
    }

    has(id) {
        return this.marked.some(element => element.dataset.ptSec === id);
    }

    current() {
        return this.view === 'home' ? null : this.sections.find(section => section.id === this.view) ?? null;
    }

    row(iconName, title, note, onclick) {
        return h('button', { type: 'button', class: 'pt-menu-row', onclick }, [
            ui(iconName, 'pt-menu-row-icon'),
            h('span', { class: 'pt-row-text' }, [h('span', { text: title }), h('small', { text: note })]),
            ui('chevron-right', 'pt-menu-row-go'),
        ]);
    }

    sectionList() {
        return h('div', { class: 'pt-menu-list' }, this.sections.filter(section => this.has(section.id))
            .map(section => this.row(section.icon, section.title, section.note, () => this.open(section.id))));
    }

    apply() {
        const block = this.block();
        if (!block || !this.home) return;
        block.dataset.ptView = this.view;
        for (const element of this.marked) element.classList.toggle('pt-sec-off', element.dataset.ptSec !== this.view);
    }

    scrollTop() {
        const block = this.block();
        if (block) block.scrollTop = 0;
    }

    open(id) {
        if (!this.home) return;
        this.view = id;
        this.apply();
        this.scrollTop();
        shell?.render(currentPageId());
        scheduleHistorySync();
    }

    isOpen() {
        return !!this.home && this.view !== 'home' && currentPageId() === this.pageId;
    }

    /** Back from a section to the list of sections. */
    close() {
        if (!this.isOpen()) return false;
        this.view = 'home';
        this.apply();
        this.scrollTop();
        shell?.render(currentPageId());
        scheduleHistorySync();
        return true;
    }

    /** The page opens on its list again next time. */
    reset() {
        if (this.view === 'home') return;
        this.view = 'home';
        this.apply();
    }

    teardown() {
        for (const element of this.marked) {
            delete element.dataset.ptSec;
            element.classList.remove('pt-sec-off');
        }
        this.marked = [];
        this.home?.remove();
        this.home = null;
        this.view = 'home';
        const block = this.block();
        if (block) delete block.dataset.ptView;
        document.documentElement.classList.remove(this.rootClass);
    }

    sync() {
        const block = this.block();
        if (!active || !settings.touchSizing || !block) {
            if (this.home || this.marked.length) this.teardown();
            return;
        }
        if (this.home?.isConnected) return;
        this.teardown();
        if (!this.mark(this, block)) {
            this.teardown();
            return;
        }
        this.home = h('div', { class: 'pt-set-home', 'data-pt': '1' });
        this.place(this, block, this.home);
        document.documentElement.classList.add(this.rootClass);
        this.apply();
    }
}

const SETTINGS_SECTIONS = [
    { id: 'look', icon: 'palette', title: 'Look', note: 'Theme, colors, avatars, text size and chat width' },
    { id: 'display', icon: 'eye', title: 'Display', note: 'Timestamps, token counts, icons and effects' },
    { id: 'chat', icon: 'chat', title: 'Chat', note: 'Sending, streaming, swipes and replies' },
    { id: 'characters', icon: 'users', title: 'Characters', note: 'Character list, card import and avatars' },
    { id: 'other', icon: 'sliders', title: 'Sounds and more', note: 'Sounds, smooth streaming, tools and window layout' },
    { id: 'css', icon: 'brush', title: 'Custom CSS', note: 'Your own style rules' },
    { id: 'stscript', icon: 'scroll', title: 'STscript', note: 'How slash commands are read' },
];

const setnav = new PageSections({
    pageId: 'user-settings-button',
    rootClass: 'pt-setnav',
    pageTitle: 'SillyTavern',
    sections: SETTINGS_SECTIONS,
    block: () => document.getElementById('user-settings-block'),
    mark: (nav, block) => {
        const content = block.querySelector('#user-settings-block-content');
        if (!content) return false;
        const theme = content.querySelector('#UI-Theme-Block');
        nav.markAs(theme?.querySelector('#UI-presets-block'), 'look');
        for (const child of theme?.querySelector(':scope > .flexNoGap')?.children ?? []) {
            nav.markAs(child, child.querySelectorAll(':scope > label.checkbox_label').length >= 5 ? 'display' : 'look');
        }
        for (const group of content.querySelectorAll('#UI-Customization > div')) {
            if (group.querySelector('#aux_field, #tag_import_setting')) nav.markAs(group, 'characters');
            else for (const child of group.children) nav.markAs(child, child.id === 'CustomCSS-block' ? 'css' : 'other');
        }
        for (const group of content.querySelectorAll('#power-user-option-checkboxes > *')) {
            nav.markAs(group, group.querySelector('[id^="stscript_"]') ? 'stscript' : 'chat');
        }
        // Anything else (a newer SillyTavern, another extension) goes to "Sounds and more", so nothing gets lost.
        const sweep = parent => {
            for (const child of parent.children) {
                if (child.dataset.ptSec) continue;
                if (child.querySelector('[data-pt-sec]')) sweep(child);
                else nav.markAs(child, 'other');
            }
        };
        sweep(content);
        return nav.has('look');
    },
    place: (nav, block, list) => {
        list.append(
            h('button', { type: 'button', class: 'pt-search-field', onclick: () => openSettingSearch() }, [ui('search'), h('span', { text: 'Search settings' })]),
            nav.sectionList(),
            h('div', { class: 'pt-menu-list' }, [isWide()
                ? nav.row('desktop', 'Pocket Tavern', 'Desktop layout, helpers and themes', () => openMobileSettings())
                : nav.row('phone', 'Pocket Tavern', 'Phone layout, gestures and helpers', () => openMobileSettings())]),
        );
        // The block on top holds the title, language, account and version; the list goes first in it.
        const top = block.querySelector('#settingsSearch')?.closest('#user-settings-block > *');
        if (top) top.prepend(list);
        else block.prepend(list);
    },
});

/**
 * Formatting (Advanced Formatting) is nine headed blocks in three columns, about three
 * screens long on a phone (Kahvana's feedback). Each column, or each block of the last
 * one, becomes a section.
 */
const FORMATTING_SECTIONS = [
    { id: 'context', icon: 'file-text', title: 'Context template', note: 'Story string and how the prompt is put together' },
    { id: 'instruct', icon: 'list', title: 'Instruct template', note: 'Instruct mode and the sequences around messages' },
    { id: 'sysprompt', icon: 'scroll', title: 'System prompt', note: 'Instructions sent before the chat' },
    { id: 'reasoning', icon: 'bulb', title: 'Reasoning', note: 'Thinking blocks: finding, showing and sending them' },
    { id: 'stopping', icon: 'stop', title: 'Stopping strings', note: 'Words that end a reply' },
    { id: 'tokenizer', icon: 'type', title: 'Tokenizer', note: 'How tokens are counted' },
    { id: 'misc', icon: 'sliders', title: 'Miscellaneous', note: 'Start reply with, model binding and more' },
];

const afnav = new PageSections({
    pageId: 'advanced-formatting-button',
    rootClass: 'pt-afnav',
    pageTitle: 'Formatting',
    sections: FORMATTING_SECTIONS,
    block: () => document.getElementById('AdvancedFormatting'),
    mark: (nav, block) => {
        const columns = block.querySelector(':scope > .flex-container.spaceEvenly');
        if (!columns) return false;
        nav.markAs(columns.querySelector(':scope > #ContextSettings'), 'context');
        nav.markAs(columns.querySelector(':scope > #InstructSettingsColumn'), 'instruct');
        for (const child of columns.querySelector(':scope > #SystemPromptColumn')?.children ?? []) {
            if (child.matches('#SystemPromptBlock') || (child.matches('h4') && child.nextElementSibling?.id === 'SystemPromptBlock')) nav.markAs(child, 'sysprompt');
            else if (child.querySelector('#custom_stopping_strings')) nav.markAs(child, 'stopping');
            else if (child.querySelector('#tokenizer')) nav.markAs(child, 'tokenizer');
            else if (child.querySelector('#reasoning_auto_parse, #reasoning_select')) nav.markAs(child, 'reasoning');
            else nav.markAs(child, 'misc');
        }
        // A newer SillyTavern's extra column goes to Miscellaneous, so nothing gets lost.
        for (const child of columns.children) if (!child.querySelector('[data-pt-sec]')) nav.markAs(child, 'misc');
        return nav.has('context') && nav.has('reasoning');
    },
    place: (nav, block, list) => {
        list.append(nav.sectionList());
        // After the title row (Master Import / Export) and the Chat Completion notice.
        block.querySelector(':scope > .flex-container.spaceEvenly')?.before(list);
    },
});

/**
 * Extensions: SillyTavern shows each extension's settings as a fold-out card. They become a
 * list like Settings, and an extension opens as its own page (Kahvana's feedback): the other
 * extensions and the page's own controls step aside while one is open. Opening and closing
 * still go through SillyTavern's own fold-out, so its state stays right.
 */
const extnav = {
    pageId: 'extensions-settings-button',
    pageTitle: 'Extensions',
    rootClass: 'pt-extnav',
    /** The open extension's fold-out (`.inline-drawer`), or null on the list. */
    drawer: null,
    rows: [],
    block: () => document.getElementById('rm_extensions_block'),
    lists: () => ['extensions_settings', 'extensions_settings2'].map(id => document.getElementById(id)).filter(Boolean),
    headerOf: drawer => drawer.querySelector(':scope > .inline-drawer-header, :scope > .inline-drawer-toggle'),
    shown(drawer) {
        const content = drawer.querySelector(':scope > .inline-drawer-content');
        return !!content && content.style.display !== 'none' && getComputedStyle(content).display !== 'none';
    },
    titleOf(drawer) {
        const header = this.headerOf(drawer);
        const name = header?.querySelector('b, strong')?.textContent ?? (header ? ownText(header) : '');
        return name.replace(/\s+/g, ' ').trim();
    },
    current() {
        if (!this.drawer) return null;
        // An extension's own name: shown as it is, never looked up for a translation.
        return { title: this.titleOf(this.drawer) || t('Extensions'), icon: 'puzzle', raw: true };
    },
    isOpen() {
        return !!this.drawer && currentPageId() === this.pageId;
    },
    enter(drawer) {
        this.leave({ fold: true, render: false });
        this.drawer = drawer;
        drawer.classList.add('pt-ext-open');
        // Each box between the fold-out and the list, so CSS can hide everything beside it.
        for (let node = drawer.parentElement; node && !node.classList.contains('extensions_block'); node = node.parentElement) {
            node.classList.add('pt-ext-path');
        }
        const block = this.block();
        if (block) {
            block.dataset.ptView = 'ext';
            block.scrollTop = 0;
        }
        shell?.render(currentPageId());
        scheduleHistorySync();
    },
    leave({ fold = true, render = true } = {}) {
        const drawer = this.drawer;
        if (!drawer) return false;
        this.drawer = null;
        drawer.classList.remove('pt-ext-open');
        document.querySelectorAll('.pt-ext-path').forEach(node => node.classList.remove('pt-ext-path'));
        const block = this.block();
        if (block) block.dataset.ptView = 'home';
        if (fold && this.shown(drawer)) this.headerOf(drawer)?.click();
        if (render) {
            shell?.render(currentPageId());
            scheduleHistorySync();
        }
        return true;
    },
    /** Back from an extension to the list. */
    close() {
        return this.isOpen() && this.leave();
    },
    /** Leaving the page folds the extension, so the page opens on the list next time. */
    reset() {
        this.leave({ render: false });
    },
    /** A click on an extension's name: follow SillyTavern's fold-out once it has opened or closed. */
    onClick(event) {
        if (!active || !settings.touchSizing || !this.rows.length) return;
        const drawer = event.target.closest?.('.inline-drawer-toggle')?.closest('.inline-drawer');
        if (!drawer || !this.rows.includes(drawer)) return;
        const wasOpen = this.shown(drawer);
        setTimeout(() => {
            if (!wasOpen && this.shown(drawer)) this.enter(drawer);
            else if (wasOpen && drawer === this.drawer) this.leave({ fold: false });
        }, 0);
    },
    teardown() {
        this.leave({ fold: false, render: false });
        for (const node of document.querySelectorAll('.pt-ext-row, .pt-ext-list')) node.classList.remove('pt-ext-row', 'pt-ext-list');
        this.rows = [];
        const block = this.block();
        if (block) delete block.dataset.ptView;
        document.documentElement.classList.remove(this.rootClass);
    },
    sync() {
        const block = this.block();
        if (!active || !settings.touchSizing || !block) {
            if (this.rows.length || this.drawer) this.teardown();
            return;
        }
        // Extensions add their settings as they load, so mark the rows again each time the page opens.
        this.rows = [];
        for (const list of this.lists()) {
            // An extension's fold-outs: the outermost ones in the list (not the ones inside its settings).
            const rows = [...list.querySelectorAll('.inline-drawer')].filter(drawer => !drawer.parentElement.closest('.inline-drawer'));
            for (const drawer of rows) drawer.classList.add('pt-ext-row');
            list.classList.toggle('pt-ext-list', rows.length > 0);
            this.rows.push(...rows);
        }
        if (!this.rows.length) {
            this.teardown();
            return;
        }
        // Only a click opens a page: a fold-out still sliding shut after Back looks open here.
        if (this.drawer && !this.rows.includes(this.drawer)) this.leave({ fold: false, render: false });
        if (!this.drawer) block.dataset.ptView = 'home';
        document.documentElement.classList.add(this.rootClass);
    },
};

const PAGE_SECTIONS = [setnav, afnav, extnav];

function pageSections(pageId = currentPageId()) {
    return PAGE_SECTIONS.find(nav => nav.pageId === pageId) ?? null;
}

function pageSectionOpen() {
    return !!pageSections()?.isOpen();
}

/** Back from a section to its page's list of sections; false when no section is open. */
function closePageSection() {
    return !!pageSections()?.close();
}

function syncPageSections() {
    for (const nav of PAGE_SECTIONS) nav.sync();
}

// -- settings: descriptions

/**
 * SillyTavern explains most settings in tooltips, which a phone never shows.
 * Show each one as a line under its setting, and lay toggles out as rows:
 * the label on the left, the switch on the right.
 */
function describeSettings(root) {
    if (!active || !settings.touchSizing || !root) return;
    const plain = text => String(text ?? '').replace(/\s+/g, ' ').trim();
    const useful = (tip, label) => {
        const a = plain(tip).toLowerCase();
        const b = plain(label).toLowerCase().replace(/[:：]$/, '');
        return a.length >= 6 && a !== b && !b.includes(a);
    };
    const help = text => h('small', { class: 'pt-help pt-skip', 'data-pt': '1', text: plain(text) });
    const skip = '.template_element, #pt-sheet, .world_entry, .inline-drawer-header';
    for (const label of root.querySelectorAll('label.checkbox_label')) {
        if (label.dataset.ptRow || label.closest(skip)) continue;
        if (!label.querySelector(':scope > input[type="checkbox"]') || label.querySelectorAll('input, select, textarea').length !== 1) continue;
        // Icon-only toggles (Formatting's "Bind to context" and the like) keep their look.
        if (!plain(label.textContent)) continue;
        label.dataset.ptRow = '1';
        label.classList.add('pt-setrow');
        if (label.classList.contains('pt-check')) continue;
        const icon = label.querySelector('.fa-circle-info[title]');
        const tip = label.getAttribute('title') || icon?.getAttribute('title') || '';
        if (!useful(tip, label.textContent)) continue;
        label.append(help(tip));
        icon?.classList.add('pt-tip-shown');
    }
    // "Avatars: [Circle]" and similar rows on the Settings page.
    for (const select of root.querySelectorAll('#user-settings-block-content .flex-container > select, #UI-language-block > select')) {
        const row = select.parentElement;
        if (row.dataset.ptRow || !row.querySelector(':scope > span, :scope > label')) continue;
        row.dataset.ptRow = '1';
        row.classList.add('pt-selrow');
        const tip = row.getAttribute('title') || '';
        if (useful(tip, row.querySelector(':scope > span, :scope > label')?.textContent)) row.append(help(tip));
    }
    // Sliders and other settings keep their explanation in an ⓘ icon.
    for (const icon of root.querySelectorAll('.fa-circle-info[title]')) {
        if (icon.classList.contains('pt-tip-shown') || icon.closest(`${skip}, label.checkbox_label, .pt-set-home`)) continue;
        const holder = icon.parentElement;
        if (!holder || holder === root) continue;
        const tip = icon.getAttribute('title');
        if (!useful(tip, holder.textContent)) continue;
        holder.after(help(tip));
        icon.classList.add('pt-tip-shown');
    }
}

function removeSettingDescriptions() {
    document.querySelectorAll('.pt-help, .pt-ext-note').forEach(node => node.remove());
    document.querySelectorAll('[data-pt-row]').forEach(node => {
        delete node.dataset.ptRow;
        node.classList.remove('pt-setrow', 'pt-selrow');
    });
    document.querySelectorAll('.pt-tip-shown').forEach(node => node.classList.remove('pt-tip-shown'));
}

/** One line on what each built-in extension does, under its name on the Extensions page. */
const EXTENSION_NOTES = {
    assets_container: 'More extensions, themes and sample characters',
    expressions_container: "Shows the character's emotion pictures",
    sd_container: 'Makes pictures with an image AI',
    tts_container: 'Reads replies aloud',
    qr_container: 'Buttons that send saved messages or commands',
    translation_container: 'Translates messages with an online translator',
    caption_container: 'Describes pictures you send',
    summarize_container: 'Keeps a running summary of long chats',
    regex_container: 'Find-and-replace rules for messages and prompts',
    vectors_container: 'Lets the AI recall older messages and files',
    pt_settings: 'The phone layout you are using now',
};

/** The same notes where they differ on the desktop layout. */
const EXTENSION_NOTES_WIDE = {
    pt_settings: 'The desktop layout you are using now',
};

function describeExtensions() {
    if (!active || !settings.touchSizing) return;
    for (const [id, note] of Object.entries({ ...EXTENSION_NOTES, ...(isWide() ? EXTENSION_NOTES_WIDE : {}) })) {
        const header = document.querySelector(`#${id} .inline-drawer-header`);
        if (!header || header.querySelector('.pt-ext-note')) continue;
        header.append(h('small', { class: 'pt-ext-note pt-skip', 'data-pt': '1', text: note }));
    }
}

// -- the ☰ and wand menus as sheets

/** SillyTavern's chat options menu, in groups, each item with a line on what it does. */
const CHAT_OPTIONS = [
    {
        title: 'Reply', chat: true, items: [
            { id: 'option_regenerate', icon: 'refresh', note: 'Write the last reply again' },
            { id: 'option_continue', icon: 'play', note: 'Make the last reply longer' },
            { id: 'option_impersonate', icon: 'mask', note: 'Let the AI write your next message' },
        ],
    },
    {
        title: 'This chat', chat: true, items: [
            { id: 'option_toggle_AN', icon: 'note', note: 'A note the AI reads at a set depth' },
            { id: 'option_toggle_CFG', icon: 'scale', note: 'Extra guidance for the next replies' },
            { id: 'option_toggle_logprobs', icon: 'chart', note: 'Which words the AI weighed for each reply' },
            { id: 'option_new_bookmark', icon: 'flag', note: 'A point in this chat you can come back to' },
            { id: 'option_back_to_main', icon: 'arrow-left', note: 'Leave this branch for the chat it came from' },
            { id: 'option_convert_to_group', icon: 'users', note: 'Turn this chat into a group chat' },
            { id: 'option_delete_mes', icon: 'trash', note: 'Pick messages to remove', danger: true },
        ],
    },
    {
        title: 'Chats', items: [
            { id: 'option_start_new_chat', icon: 'chat-plus', note: 'A fresh chat with the same character' },
            { id: 'option_select_chat', icon: 'history', note: 'Every saved chat with this character' },
            { id: 'option_close_chat', icon: 'x', note: 'Back to the start screen' },
        ],
    },
];

/** Shown, unlike SillyTavern's spare copies (it has two "Close chat" items, one always hidden). */
function menuItemShown(element, stop) {
    if (!element || !(element.textContent ?? '').trim()) return false;
    for (let node = element; node && node !== stop; node = node.parentElement) {
        if (node.classList?.contains('displayNone') || node.style?.display === 'none' || node.hidden) return false;
    }
    return true;
}

function actionRow(iconNode, label, note, onclick, danger = false) {
    return h('button', { type: 'button', class: `pt-menu-row pt-action-row${danger ? ' pt-menu-row-danger' : ''}`, onclick }, [
        iconNode,
        h('span', { class: 'pt-row-text' }, [h('span', { text: label }), note ? h('small', { text: note }) : null]),
    ]);
}

/** Runs a SillyTavern menu item after the sheet is gone, so whatever it opens lands on top. */
function pressMenuItem(element) {
    closeSheet(true);
    buzz(6);
    element.click();
}

function itemLabel(element) {
    return (element.querySelector(':scope > span')?.textContent ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The item's own Font Awesome icon (Pocket Tavern restyles those), or a neutral one. */
function faIcon(element) {
    const source = element.querySelector('.extensionsMenuExtensionButton, i[class*="fa-"], div[class*="fa-"]');
    if (!source) return ui('puzzle', 'pt-menu-row-icon');
    const copy = source.cloneNode(false);
    copy.removeAttribute('id');
    copy.removeAttribute('title');
    copy.classList.add('pt-menu-row-icon', 'pt-fa-icon');
    copy.setAttribute('aria-hidden', 'true');
    return copy;
}

async function openChatOptions() {
    const menu = document.getElementById('options');
    if (!menu) return;
    // SillyTavern decides which checkpoint items apply when its menu opens; do the same.
    try {
        (await import('/scripts/bookmarks.js')).showBookmarksButtons?.();
    } catch (error) {
        console.debug(LOG, 'Checkpoint items not refreshed', error);
    }
    const context = ctx();
    const inChat = !!(context.groupId || context.characterId !== undefined);
    showSheet(new MenuSheet({
        title: 'Chat options',
        subtitle: '',
        fill: body => {
            const known = new Set();
            for (const group of CHAT_OPTIONS) {
                const rows = [];
                for (const item of group.items) {
                    known.add(item.id);
                    if (group.chat && !inChat) continue;
                    const element = [...menu.querySelectorAll(`[id="${item.id}"]`)].find(node => menuItemShown(node, menu));
                    if (element) rows.push(actionRow(ui(item.icon, 'pt-menu-row-icon'), itemLabel(element), item.note, () => pressMenuItem(element), item.danger));
                }
                if (rows.length) body.append(h('h4', { class: 'pt-menu-heading', text: group.title }), h('div', { class: 'pt-menu-list' }, rows));
            }
            // Items other extensions put in the menu.
            const extra = [...menu.querySelectorAll('.options-content > :not(hr)')]
                .filter(node => !known.has(node.id) && menuItemShown(node, menu))
                .map(node => actionRow(faIcon(node), itemLabel(node), '', () => pressMenuItem(node)));
            if (extra.length) body.append(h('h4', { class: 'pt-menu-heading', text: 'From extensions' }), h('div', { class: 'pt-menu-list' }, extra));
        },
    }));
}

const TOOL_NOTES = {
    manageAttachments: 'Files and web pages the AI can look things up in',
    attachFile: 'Send a file or picture with your next message',
    sd_gen: 'Make a picture of the scene or a character',
    send_picture: 'Let the AI describe a picture',
    show_gallery_wand_button: 'Pictures saved for this character',
    ttsExtensionMenuItem: 'Turn reading replies aloud on or off',
    ttsExtensionNarrateAll: 'Read the whole chat aloud',
    token_counter: 'Count the tokens in any text',
    translate_chat: 'Translate every message in this chat',
    translate_input_message: 'Translate the message you are typing',
    pt_wand_lorebooks: 'Choose the lorebooks for all chats',
    'sp-st-restore': 'Characters, mood and quests in this scene',
};

/** ScenePulse puts its button next to Send, where a phone has no room for it (Send got squeezed), so it opens from Tools instead. */
function scenePulseRow() {
    const button = document.getElementById('sp-st-restore');
    if (!button || button.style.display === 'none') return null;
    const art = button.querySelector('svg')?.cloneNode(true);
    if (art) {
        art.querySelectorAll('[class]').forEach(node => node.removeAttribute('class'));
        art.setAttribute('class', 'pt-menu-row-icon');
        art.setAttribute('aria-hidden', 'true');
    }
    return actionRow(art ?? ui('puzzle', 'pt-menu-row-icon'), 'ScenePulse', TOOL_NOTES['sp-st-restore'], () => pressMenuItem(button));
}

const PICTURE_NOTES = {
    sd_you: 'The character',
    sd_face: "The character's face",
    sd_me: 'You, as your persona',
    sd_world: 'A scene from the whole story',
    sd_last: 'What the last message describes',
    sd_raw_last: 'The last message, word for word',
    sd_background: 'A background for this chat',
};

function openToolsSheet() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    showSheet(new MenuSheet({
        title: 'Tools',
        subtitle: 'From your extensions',
        fill: body => {
            const rows = [...menu.querySelectorAll('.list-group-item')]
                .filter(item => menuItemShown(item, menu))
                .map(item => actionRow(faIcon(item), itemLabel(item), TOOL_NOTES[item.id] ?? '', () => {
                    // Image generation asks what to draw, in a little menu of its own.
                    if (item.id === 'sd_gen' && document.querySelector('#sd_dropdown [id]')) openPictureSheet();
                    else pressMenuItem(item);
                }));
            const pulse = scenePulseRow();
            if (pulse) rows.push(pulse);
            body.append(rows.length ? h('div', { class: 'pt-menu-list' }, rows) : h('p', { class: 'pt-menu-foot', text: 'No extension has added a tool yet.' }));
        },
    }));
}

function openPictureSheet() {
    const dropdown = document.getElementById('sd_dropdown');
    showSheet(new MenuSheet({
        title: 'Generate image',
        subtitle: 'What should the picture show?',
        fill: body => {
            const rows = [...dropdown.querySelectorAll('[id]')]
                .filter(item => menuItemShown(item, dropdown))
                .map(item => actionRow(ui('image', 'pt-menu-row-icon'), itemLabel(item), PICTURE_NOTES[item.id] ?? '', () => pressMenuItem(item)));
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

/** Taps on ☰ and the wand open the sheets instead of SillyTavern's small pop-up menus. */
function onMenuButtonClick(event) {
    if (!active || !settings.touchSizing) return;
    // A long explanation shows two lines; a tap shows all of it (and does not flip the switch it belongs to).
    const tip = event.target.closest?.('.pt-help');
    if (tip) {
        event.preventDefault();
        event.stopPropagation();
        tip.classList.toggle('pt-help-open');
        return;
    }
    const options = event.target.closest?.('#options_button');
    const wand = !options && event.target.closest?.('#extensionsMenuButton');
    if (!options && !wand) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    buzz(6);
    if (options) openChatOptions();
    else openToolsSheet();
}

// -- install as an app

const install = { prompt: null, originalManifest: undefined };

function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
}

/** Points Chrome at a manifest with a proper home-screen icon while Pocket Tavern is on. */
function syncManifest() {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    if (install.originalManifest === undefined) install.originalManifest = link.getAttribute('href');
    const ours = new URL('app.webmanifest', EXTENSION_ROOT).href;
    const want = active ? ours : install.originalManifest;
    if (want === null) link.removeAttribute('href');
    else if (link.getAttribute('href') !== want) link.setAttribute('href', want);
    document.documentElement.classList.toggle('pt-standalone', active && isStandalone());
}

async function installApp() {
    if (install.prompt) {
        const event = install.prompt;
        install.prompt = null;
        event.prompt();
        await event.userChoice.catch(() => null);
        return;
    }
    showSheet(new MenuSheet({
        title: t('Install as an app'),
        subtitle: t('Open SillyTavern from your home screen, full screen, without the browser bar.'),
        // Each device installs a site its own way: Safari on iPhone and iPad, Chrome on Android, a computer's browser.
        fill: body => body.append(h('div', { class: 'pt-steps' }, IS_IOS ? [
            h('p', { text: t('1. Tap Safari\'s Share button (the square with an arrow).') }),
            h('p', { text: t('2. Tap "Add to Home Screen".') }),
            h('p', { text: t('3. Tap Add. SillyTavern now has its own icon.') }),
        ] : isWide() ? [
            h('p', { text: t('1. In Chrome or Edge, click the install icon at the right of the address bar, or open the browser menu.') }),
            h('p', { text: t('2. Choose "Install" or "Install page as app".') }),
            h('p', { class: 'pt-menu-foot', text: t('Firefox cannot install sites as apps; open SillyTavern in Chrome or Edge for this.') }),
        ] : [
            h('p', { text: t('1. Tap Chrome\'s ⋮ menu (top right).') }),
            h('p', { text: t('2. Tap "Add to Home screen" or "Install app".') }),
            h('p', { text: t('3. Tap Install. SillyTavern now has its own icon.') }),
            h('p', { class: 'pt-menu-foot', text: t('Keep Termux running in the background as usual; the app opens the same SillyTavern.') }),
        ])),
    }));
}

// -- what's new

function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff) return diff;
    }
    return 0;
}

function openWhatsNew(since) {
    const entries = CHANGES.filter(entry => !since || compareVersions(entry.version, since) > 0);
    showSheet(new MenuSheet({
        title: t("What's new"),
        subtitle: t('Pocket Tavern {version}', { version: VERSION }),
        fill: body => {
            for (const entry of (entries.length ? entries : CHANGES.slice(0, 1))) {
                body.append(h('p', { class: 'pt-menu-heading', text: entry.version }));
                body.append(h('ul', { class: 'pt-news' }, entry.items.map(item => h('li', { text: t(item) }))));
            }
        },
    }));
}

/**
 * Automatic used to mean phones only. The first time Pocket Tavern turns on by
 * itself on a computer or tablet, say so once and offer the way back.
 */
function maybeShowDesktopNotice() {
    if (!active || settings.desktopNoticeSeen || readMode() !== 'auto' || detectPhone()) return false;
    settings.desktopNoticeSeen = true;
    settings.lastSeenVersion = VERSION;
    saveSettings();
    setTimeout(() => {
        if (!active || sheet) return;
        showSheet(new MenuSheet({
        title: 'Pocket Tavern is on here too',
        subtitle: 'It now switches on by itself on computers and tablets. Wide screens get the desktop layout.',
        fill: body => {
            body.append(h('div', { class: 'pt-menu-list' }, [
                h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => closeSheet(),
                }, [ui('check', 'pt-menu-row-icon'), h('span', { text: 'Keep it on' })]),
                h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        writeMode('phone');
                        closeSheet(true);
                        applyState();
                        syncSettingsMode();
                    },
                }, [ui('phone', 'pt-menu-row-icon'), h('span', { text: 'Use it on phones only' })]),
            ]));
            body.append(h('p', { class: 'pt-menu-foot', text: 'You can change this any time in Extensions → Pocket Tavern.' }));
        },
    }));
    }, 1200);
    return true;
}

function syncSettingsMode() {
    const select = document.getElementById('pt_mode');
    if (select) select.value = readMode();
    updateStatusLine();
}

function maybeShowWhatsNew() {
    if (!active) return;
    const seen = settings.lastSeenVersion;
    settings.lastSeenVersion = VERSION;
    saveSettings();
    // Only after an update, never on a fresh install.
    if (seen && compareVersions(VERSION, seen) > 0) {
        setTimeout(() => {
            if (active && !sheet) openWhatsNew(seen);
        }, 1200);
    }
}

// -- language

function applyLanguage() {
    setLocale(ctx().getCurrentLocale?.() ?? navigator.language);
    const root = document.documentElement;
    root.classList.toggle('pt-rtl', active && isRtl());
    if (active) {
        root.style.setProperty('--pt-l-save', JSON.stringify(t('Save')));
        root.style.setProperty('--pt-l-cancel', JSON.stringify(t('Cancel')));
    } else {
        root.style.removeProperty('--pt-l-save');
        root.style.removeProperty('--pt-l-cancel');
    }
}

function applyTextSize() {
    const root = document.documentElement;
    if (active && settings.textSize && settings.textSize !== 'normal') root.dataset.ptText = settings.textSize;
    else delete root.dataset.ptText;
}

function isCompact() {
    if (settings.uiSize === 'compact') return true;
    if (settings.uiSize !== 'auto') return false;
    // A computer (mouse or trackpad, desktop layout): compact, like SillyTavern's own density.
    if (isWide() && matchMedia('(pointer: fine)').matches) return true;
    const sides = [screen.width, screen.height].filter(n => n > 0);
    return sides.length > 0 && Math.min(...sides) < SMALL_PHONE_BELOW;
}

/** Size (compact or comfortable), the message box style and the tucked tabs. */
function applyLayoutPrefs() {
    const root = document.documentElement;
    root.classList.toggle('pt-compact', active && isCompact());
    root.classList.toggle('pt-docked', active && settings.chatStyle && settings.composerStyle === 'docked');
    shell?.syncTuck();
}

function syncExtras() {
    applyTextSize();
    applyChatLook();
    applyLayoutPrefs();
    syncComposer();
    // (Also takes the one-version marker off again when Pocket Tavern turns off.)
    syncSwipeCounters();
    foldLongMessages();
    markMissingAvatars();
    syncLoreEntries();
    syncTriggerChips();
    syncPresetTabs();
    renderMeter();
    if (active && settings.touchSizing) addSliderSteppers();
    else removeSliderSteppers();
    syncPageSections();
    if (!active || !settings.touchSizing) removeSettingDescriptions();
    if (!active) {
        closeChatFinder();
        window.clearTimeout(press.timer);
        press.timer = 0;
        cancelAnimationFrame(drag.frame);
        drag.frame = 0;
        drag.hint?.remove();
        drag.hint = null;
        drag.mes = null;
        translation.cancel = true;
        window.clearTimeout(translation.hideTimer);
        translation.hideTimer = 0;
        translation.status?.remove();
        translation.status = null;
        window.clearTimeout(autoTimer);
        autoTimer = 0;
        autoQueue.clear();
        window.clearTimeout(meter.timer);
        meter.timer = 0;
        extras.promptObserver?.disconnect();
        extras.promptObserver = null;
    } else if (!extras.promptObserver) {
        const editor = promptEditor();
        if (editor) {
            let timer = 0;
            extras.promptObserver = new MutationObserver(() => {
                if (timer || !active) return;
                timer = window.setTimeout(() => {
                    timer = 0;
                    if (!active) return;
                    syncPromptNameBox();
                    syncTriggerChips();
                    syncPromptEditorSession();
                    shell?.update();
                }, 60);
            });
            extras.promptObserver.observe(editor, { attributes: true, attributeFilter: ['style', 'class'] });
        }
    }
    syncPictures();
    syncCharacterPage();
    syncWelcome();
    syncChatHistory();
    applyLanguage();
    syncEditorState();
    syncServerWatch();
    syncManifest();
    const fastOn = active && settings.fastChat;
    if (fastOn && !document.documentElement.classList.contains('pt-fast-chat')) primeChatSizes();
    document.documentElement.classList.toggle('pt-fast-chat', fastOn);
    if (fastOn) window.addEventListener('resize', onChatWidthChange);
    else {
        window.removeEventListener('resize', onChatWidthChange);
        window.clearTimeout(fastChat.timer);
        document.getElementById('chat')?.classList.remove('pt-fast-prime');
    }
    syncJumpButton();
    syncPersonaTabs();
    syncPromptNameBox();
    syncPromptEditorSession();
    syncPanelEdge();
    syncToolPanels();
    syncHomeBox();
    syncThemeNotes();
    if (!active || !settings.keepAwake) setAwake(false);
    if (!active || !settings.imageViewer) closeViewer(true);
    if (active) patchClipboard();
    else unpatchClipboard();
    if (extras.wired) return;
    extras.wired = true;
    document.addEventListener('click', onBackgroundPick, true);
    // Capture phase: runs before SillyTavern's own delegated handlers.
    document.addEventListener('pointerdown', onSendPointerDown, true);
    window.addEventListener('mousedown', onChatMouseDown, true);
    // The mark comes off at the end of the mousedown, or, when something stopped it on the way
    // (the rail's tabs do), before the mouseup and click that follow can act on it.
    window.addEventListener('mousedown', releaseKeptOpen);
    window.addEventListener('mouseup', releaseKeptOpen, true);
    window.addEventListener('click', releaseKeptOpen, true);
    // Capture on window: Escape on one of SillyTavern's pages must reach Back (to AI or Settings) before
    // SillyTavern's own handler closes the drawer.
    window.addEventListener('keydown', onWideKeyDown, true);
    document.addEventListener('keydown', onWideShortcut);
    watchLayout(() => {
        setFeatureClasses();
        applyLayoutPrefs();
        shell?.update();
        updateStatusLine();
        scheduleHistorySync();
    });
    document.addEventListener('click', onSendClick, true);
    document.addEventListener('click', onMenuButtonClick, true);
    document.addEventListener('click', onMessageMenuClick, true);
    document.addEventListener('click', onEditCopyClick, true);
    document.addEventListener('click', onAvatarClick, true);
    document.addEventListener('change', onAvatarPicked, true);
    document.addEventListener('touchstart', onSwipeStart, { passive: true });
    document.addEventListener('touchmove', onSwipeMove, { passive: true });
    document.addEventListener('touchend', onSwipeEnd);
    document.addEventListener('touchcancel', onSwipeEnd);
    window.addEventListener('swiped-left', onSwipedEvent, true);
    window.addEventListener('swiped-right', onSwipedEvent, true);
    document.addEventListener('touchstart', onToastTouchStart, { passive: true });
    document.addEventListener('touchmove', onToastTouchMove, { passive: true });
    document.addEventListener('touchend', onToastTouchEnd);
    document.addEventListener('touchcancel', onToastTouchEnd);
    document.addEventListener('input', onDraftInput, true);
    document.addEventListener('pointerdown', onFocusGuardPointer, true);
    document.addEventListener('focusin', onFocusGuardFocus, true);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onMessagePressStart, true);
    document.addEventListener('pointermove', onMessagePressMove, true);
    for (const type of ['pointerup', 'pointercancel', 'scroll']) document.addEventListener(type, onMessagePressEnd, true);
    document.addEventListener('click', onPressAfterEffects, true);
    document.addEventListener('contextmenu', onPressAfterEffects, true);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleServerCheck(300);
    });
    window.addEventListener('online', () => scheduleServerCheck(300));
    window.addEventListener('offline', () => scheduleServerCheck(300));
    window.addEventListener('beforeinstallprompt', event => {
        // Only while Pocket Tavern is on (More -> Install as an app); off, the browser's own prompt is left alone.
        if (!active) return;
        event.preventDefault();
        install.prompt = event;
    });
    window.addEventListener('appinstalled', () => {
        install.prompt = null;
        globalThis.toastr?.success(t('SillyTavern is on your home screen now.'), t('Installed'));
    });
}

function textSizeControl() {
    return h('div', { class: 'pt-segmented pt-text-seg', role: 'group', 'aria-label': 'Chat text size' },
        Object.entries(TEXT_SIZES).map(([size, label]) => h('button', {
            type: 'button',
            class: `pt-seg ${settings.textSize === size ? 'pt-seg-on' : ''}`,
            'aria-pressed': String(settings.textSize === size),
            'aria-label': label,
            onclick: () => setAppearance('textSize', size),
        }, [h('span', { class: `pt-aa pt-aa-${size}`, text: 'Aa' })])));
}

function openExtrasSheet() {
    showSheet(new MenuSheet({
        title: isWide() ? 'Features' : 'Phone features',
        subtitle: isWide() ? 'Small helpers that make SillyTavern nicer to use.' : 'Small helpers that make SillyTavern nicer on a phone.',
        fill: body => {
            body.append(h('p', { class: 'pt-menu-heading', text: 'Chat text size' }));
            body.append(textSizeControl());
            body.append(h('p', { class: 'pt-menu-heading', text: 'Helpers' }));
            body.append(h('div', { class: 'pt-menu-list' }, EXTRAS.filter(extra => !extra.when || extra.when()).map(extra => switchRow(extra.key, extra.label, extra.hint))));
        },
    }));
}

// ------------------------------------------------------------ activation

function setFeatureClasses() {
    const root = document.documentElement;
    root.classList.toggle('pt-on', active);
    root.classList.toggle('pt-touch', active && settings.touchSizing);
    root.classList.toggle('pt-shell', active && settings.appShell);
    root.classList.toggle('pt-chat', active && settings.chatStyle);
    applyLayout(active && settings.appShell, settings.layout);
}

/*
 * iPhones and iPads. SillyTavern asks the browser to shrink the page for the
 * keyboard; Android does, Safari does not: the keyboard covers the bottom of
 * the page and Safari pans the part you can see. So while the keyboard is up,
 * Pocket Tavern sizes its bars, the chat, pages and the message editor to the
 * visible part of the screen (the browser's visualViewport), instead of the
 * whole page. SillyTavern's transform on <html> (a fix for flicker in Chrome)
 * is turned off there too, so the bars are fixed to the screen, not the page.
 */
const ios = { frame: 0 };

function syncIosViewport() {
    const root = document.documentElement;
    const on = active && IS_IOS;
    root.classList.toggle('pt-ios', on);
    const vv = window.visualViewport;
    const keyboard = on && !!vv && keyboardUp();
    root.classList.toggle('pt-ios-kb', keyboard);
    if (keyboard) {
        const top = `${Math.round(vv.offsetTop)}px`;
        const visible = `${Math.round(vv.height)}px`;
        if (root.style.getPropertyValue('--pt-ios-top') !== top) root.style.setProperty('--pt-ios-top', top);
        if (root.style.getPropertyValue('--pt-ios-h') !== visible) root.style.setProperty('--pt-ios-h', visible);
    } else {
        root.style.removeProperty('--pt-ios-top');
        root.style.removeProperty('--pt-ios-h');
    }
}

function scheduleIosViewport() {
    if (!IS_IOS || ios.frame) return;
    ios.frame = requestAnimationFrame(() => {
        ios.frame = 0;
        syncIosViewport();
        shell?.checkKeyboard();
    });
}

/** Folding, unfolding or turning the device: sizes that were picked from the screen are picked again. */
let resizeTimer = 0;
function onScreenChange() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        if (!active) return;
        applyLayoutPrefs();
        syncIosViewport();
    }, 250);
}

/**
 * The page itself never scrolls in Pocket Tavern: the chat and pages scroll inside
 * it. If something scrolls it anyway (the browser bringing a text box into view),
 * the fixed bars and the message editor would slide off the screen, so put it back.
 * Not on iPhones: Safari scrolls the page on purpose to show the keyboard.
 */
function onStrayScroll() {
    if (!active || !settings.appShell || IS_IOS) return;
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
}

/** On the desktop layout a page stays open beside the chat while you use the chat. */
const keptOpen = [];

/**
 * SillyTavern closes every open panel that is not pinned on any mousedown that
 * reaches <html>. On the desktop layout a page stays open beside the chat, so it
 * is marked pinned only while this one event runs (the class has no styling).
 * The event itself still reaches document listeners: menus, pickers and other
 * extensions that close on an outside click. Back, the tab again, or Escape
 * still close the page.
 */
function onChatMouseDown(event) {
    const root = document.documentElement;
    if (!active || !root.classList.contains('pt-desktop') || !root.classList.contains('pt-page-open')) return;
    if (event.target.closest?.('.drawer-content')) return;
    for (const drawer of document.querySelectorAll('.openDrawer:not(.pinnedOpen)')) {
        drawer.classList.add('pinnedOpen');
        keptOpen.push(drawer);
    }
    if (!keptOpen.length) return;
    // Taken off once the event has bubbled to the window, or on the next task if something stopped it.
    window.setTimeout(releaseKeptOpen, 0);
}

function releaseKeptOpen() {
    for (const drawer of keptOpen.splice(0)) drawer.classList.remove('pinnedOpen');
}

// -- reload by itself after an update

/**
 * SillyTavern runs this after it updated Pocket Tavern (the "update" hook in
 * manifest.json); this is still the old code, so the new one needs a reload.
 * It waits until nothing is in progress: the extension list or another dialog
 * open (Update all may still be updating others), a reply being written, a
 * message or prompt being edited, or a text box in use other than the message
 * box (unsent messages are kept). A few seconds first, so a batch of updates
 * can finish.
 */
const updateReload = { pending: false, timer: 0 };

export function onPocketTavernUpdate() {
    if (!settings?.autoReload || updateReload.pending) return;
    updateReload.pending = true;
    globalThis.toastr?.info(t('The page reloads by itself when nothing is in progress.'), t('Pocket Tavern was updated'), { timeOut: 6000 });
    window.clearTimeout(updateReload.timer);
    updateReload.timer = window.setTimeout(reloadWhenIdle, 4000);
}

function updateReloadBlocked() {
    if (document.querySelector('dialog[open]') || sheet || viewer) return true;
    if (extras.generating || editorOpen() || promptEditorDirty()) return true;
    const focused = document.activeElement;
    const draftKept = focused?.id === 'send_textarea' && settings.saveDrafts;
    return isTypingField(focused) && !draftKept;
}

function reloadWhenIdle(force = false) {
    if (!force && !settings?.autoReload) {
        updateReload.pending = false;
        return;
    }
    if (updateReloadBlocked()) {
        updateReload.timer = window.setTimeout(() => reloadWhenIdle(force), 1500);
        return;
    }
    // Settings SillyTavern has not written yet go first.
    ctx().saveSettingsDebounced?.();
    globalThis.toastr?.info(t('Reloading to finish the update…'), '', { timeOut: 2000 });
    window.setTimeout(() => location.reload(), 1500);
}

// -- Settings → Update Pocket Tavern, and SillyTavern updates (both layouts)

/** Pocket Tavern's folder name, from where it was loaded (scripts/extensions/third-party/<folder>/). */
function extensionFolder() {
    const match = decodeURIComponent(EXTENSION_ROOT.pathname).match(/\/third-party\/([^/]+)\//);
    return match ? match[1] : 'SillyTavern-PocketTavern';
}

/** Asks SillyTavern's own extension endpoint; installed for one user or for everyone. */
async function extensionRequest(endpoint, global) {
    return fetch(`/api/extensions/${endpoint}`, {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ extensionName: extensionFolder(), global }),
    });
}

/**
 * The same update as Extensions → Manage extensions → update, in one tap: SillyTavern's
 * server pulls the new version, then the page reloads (once nothing is in progress).
 */
async function updatePocketTavern(button) {
    if (button.disabled) return;
    const note = button.querySelector('.pt-menu-row-note, .pt-list-row-value');
    const before = note?.textContent ?? '';
    button.disabled = true;
    if (note) note.textContent = t('Checking…');
    buzz(6);
    try {
        let global = false;
        let response = await extensionRequest('version', global);
        if (response.status === 404) {
            global = true;
            response = await extensionRequest('version', global);
        }
        if (!response.ok) throw new Error((await response.text()) || response.statusText);
        const info = await response.json();
        if (info.isUpToDate) {
            globalThis.toastr?.success(t('You have the newest version ({version}).', { version: VERSION }), t('Pocket Tavern is up to date'));
            return;
        }
        if (note) note.textContent = t('Updating…');
        response = await extensionRequest('update', global);
        if (!response.ok) throw new Error((await response.text()) || response.statusText);
        const result = await response.json();
        if (result.isUpToDate) {
            globalThis.toastr?.success(t('You have the newest version ({version}).', { version: VERSION }), t('Pocket Tavern is up to date'));
            return;
        }
        closeSheet(true);
        globalThis.toastr?.success(t('The page reloads by itself when nothing is in progress.'), t('Pocket Tavern was updated'), { timeOut: 6000 });
        updateReload.pending = true;
        window.clearTimeout(updateReload.timer);
        updateReload.timer = window.setTimeout(() => reloadWhenIdle(true), 1500);
    } catch (error) {
        console.warn(LOG, 'Update failed', error);
        globalThis.toastr?.error(String(error?.message ?? error).slice(0, 200), t('Could not update Pocket Tavern'));
    } finally {
        button.disabled = false;
        if (note && button.isConnected && note.textContent !== before) note.textContent = before;
    }
}

/**
 * SillyTavern cannot update itself from the page: it has to be stopped and started
 * again where it runs. This checks for a newer version (only when opened) and shows
 * the quickest way for each kind of device.
 */
async function openSillyTavernUpdates() {
    const state = { local: null, latest: null, failed: false };
    const commandRow = (label, command) => h('div', { class: 'pt-command' }, [
        h('code', { text: command }),
        h('button', {
            type: 'button',
            class: 'pt-command-copy',
            'aria-label': t('Copy {label}', { label }),
            title: t('Copy'),
            onclick: async () => {
                const done = await copyText(command);
                if (done) globalThis.toastr?.success(t('Copied. Paste it where SillyTavern runs.'), '', { timeOut: 2500 });
            },
        }, [ui('copy')]),
    ]);
    const updateSheet = new MenuSheet({
        title: t('SillyTavern updates'),
        subtitle: t('Check for a new version and see how to update'),
        fill: body => {
            let status = t('Checking for a new version…');
            if (state.failed) status = t('Could not check for a new version. Are you online?');
            else if (state.local && state.latest) {
                status = compareVersions(state.latest, state.local) > 0
                    ? t('SillyTavern {latest} is out. You have {local}.', { latest: state.latest, local: state.local })
                    : t('You have the newest SillyTavern ({local}).', { local: state.local });
            }
            body.append(
                h('p', { class: 'pt-update-status', text: status }),
                h('p', { class: 'pt-menu-heading', text: t('On Android (Termux)') }),
                h('p', { class: 'pt-menu-foot', text: t('Tap the "Update SillyTavern" shortcut on your home screen (from the one-tap start setup), or run this in Termux:') }),
                commandRow('Termux', 'cd ~/SillyTavern && git pull && npm install'),
                h('p', { class: 'pt-menu-heading', text: t('On Windows') }),
                h('p', { class: 'pt-menu-foot', text: t('Close SillyTavern, then double-click UpdateAndStart.bat in its folder (or use Update in SillyTavern Launcher).') }),
                h('p', { class: 'pt-menu-heading', text: t('On macOS or Linux') }),
                h('p', { class: 'pt-menu-foot', text: t('Close SillyTavern, then run this in its folder and start it again:') }),
                commandRow('macOS or Linux', 'git pull && npm install'),
                h('p', { class: 'pt-menu-foot', text: t('Using SillyTavern from an iPhone or iPad? Update it on the computer or phone it runs on.') }),
            );
        },
    });
    showSheet(updateSheet);
    try {
        const [local, latest] = await Promise.all([
            fetch('/version').then(response => response.json()),
            // Only asked when this sheet opens: GitHub's list of SillyTavern releases.
            fetch('https://api.github.com/repos/SillyTavern/SillyTavern/releases/latest', { headers: { Accept: 'application/vnd.github+json' } }).then(response => response.json()),
        ]);
        state.local = String(local.pkgVersion ?? '').trim() || null;
        state.latest = String(latest.tag_name ?? '').replace(/^v/i, '').trim() || null;
        if (!state.local || !state.latest) state.failed = true;
    } catch {
        state.failed = true;
    }
    if (sheet === updateSheet) updateSheet.refresh();
}

// -- desktop: drag the panel's edge to make it wider

const PANEL_WIDTH_KEY = 'pt_panel_w';
const PANEL_MIN = 360;
let panelEdge = null;
let panelEdgeFrame = 0;

function savedPanelWidth() {
    try {
        return Number(localStorage.getItem(PANEL_WIDTH_KEY)) || 0;
    } catch {
        return 0;
    }
}

/** The stylesheet keeps it between 360px and what leaves the chat 480px. */
function applyPanelWidth(width) {
    const root = document.documentElement;
    if (width) root.style.setProperty('--pt-panel-saved', `${Math.round(width)}px`);
    else root.style.removeProperty('--pt-panel-saved');
    root.classList.toggle('pt-panel-sized', !!width);
    if (panelEdge) panelEdge.setAttribute('aria-valuenow', String(Math.round(width || panelWidthNow() || PANEL_MIN)));
}

function storePanelWidth(width) {
    try {
        if (width) localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width)));
        else localStorage.removeItem(PANEL_WIDTH_KEY);
    } catch { /* private mode: the width lasts until reload */ }
}

/** The panel's current width as drawn (the stylesheet clamps the saved one). */
function panelWidthNow() {
    const panel = document.querySelector('#top-settings-holder > .drawer > .drawer-content.openDrawer');
    return panel ? panel.getBoundingClientRect().width : 0;
}

function syncPanelEdge() {
    const want = active && settings.appShell;
    if (!want) {
        cancelAnimationFrame(panelEdgeFrame);
        panelEdgeFrame = 0;
        panelEdge?.remove();
        panelEdge = null;
        applyPanelWidth(0);
        document.documentElement.classList.remove('pt-resizing');
        return;
    }
    applyPanelWidth(savedPanelWidth());
    if (panelEdge) return;
    panelEdge = h('div', {
        id: 'pt-panel-edge',
        class: 'pt-panel-edge',
        role: 'separator',
        'aria-orientation': 'vertical',
        'aria-label': 'Panel width',
        'aria-valuemin': String(PANEL_MIN),
        'aria-valuemax': '760',
        'aria-valuenow': String(Math.round(savedPanelWidth() || PANEL_MIN)),
        title: 'Drag to change the width. Double-click to reset.',
        tabindex: '0',
        'data-pt': '1',
    });
    shieldFromDrawerAutoClose(panelEdge);
    let dragX = 0;
    // Where on the edge it was grabbed, so the edge stays under the pointer instead of jumping to it.
    let grab = 0;
    let moved = false;
    const railRight = () => document.getElementById('pt-tabbar')?.getBoundingClientRect().right ?? 88;
    const dragged = () => Math.max(PANEL_MIN, dragX - grab - railRight());
    const onMove = event => {
        dragX = event.clientX;
        moved = true;
        if (panelEdgeFrame) return;
        panelEdgeFrame = requestAnimationFrame(() => {
            panelEdgeFrame = 0;
            if (active && panelEdge) applyPanelWidth(dragged());
        });
    };
    const onUp = event => {
        try {
            panelEdge?.releasePointerCapture?.(event.pointerId);
        } catch {
            // Capture was already released (e.g. pointercancel).
        }
        panelEdge?.removeEventListener('pointermove', onMove);
        panelEdge?.removeEventListener('pointerup', onUp);
        panelEdge?.removeEventListener('pointercancel', onUp);
        cancelAnimationFrame(panelEdgeFrame);
        panelEdgeFrame = 0;
        document.documentElement.classList.remove('pt-resizing');
        // A click without a drag (half of a double-click) changes nothing.
        if (!moved || !active) return;
        applyPanelWidth(dragged());
        // Keep what is drawn, so a width past the limit does not linger unseen.
        const width = Math.round(panelWidthNow() || dragged());
        applyPanelWidth(width);
        storePanelWidth(width);
    };
    panelEdge.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragX = event.clientX;
        moved = false;
        grab = event.clientX - railRight() - (panelWidthNow() || PANEL_MIN);
        try {
            panelEdge.setPointerCapture?.(event.pointerId);
        } catch {
            // Carry on without capture.
        }
        document.documentElement.classList.add('pt-resizing');
        panelEdge.addEventListener('pointermove', onMove);
        panelEdge.addEventListener('pointerup', onUp);
        panelEdge.addEventListener('pointercancel', onUp);
    });
    panelEdge.addEventListener('dblclick', () => {
        applyPanelWidth(0);
        storePanelWidth(0);
    });
    panelEdge.addEventListener('keydown', event => {
        const step = event.shiftKey ? 64 : 16;
        let width = 0;
        if (event.key === 'ArrowRight') width = panelWidthNow() + step;
        else if (event.key === 'ArrowLeft') width = panelWidthNow() - step;
        else if (event.key === 'Home') width = -1;
        else return;
        event.preventDefault();
        if (width < 0) {
            applyPanelWidth(0);
            storePanelWidth(0);
            return;
        }
        applyPanelWidth(Math.max(PANEL_MIN, width));
        const drawn = Math.round(panelWidthNow() || Math.max(PANEL_MIN, width));
        applyPanelWidth(drawn);
        storePanelWidth(drawn);
    });
    document.body.append(panelEdge);
}

// -- desktop: SillyTavern's floating tool panels (Author's Note, CFG, token
// probabilities, extension pop-outs) dock in a column right of the chat, which
// moves over to make room. SillyTavern drew them in the top-left corner, under
// the top bar and the rail. With SillyTavern's MovingUI on they stay where you put them.

const TOOL_PANELS = '#movingDivs > div';
const tools = { observer: null, frame: 0, watched: new WeakSet() };

function dockedToolPanels() {
    if (document.body.classList.contains('movingUI')) return [];
    return [...document.querySelectorAll(TOOL_PANELS)]
        .filter(panel => !panel.classList.contains('maximized') && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none');
}

function layoutToolPanels() {
    tools.frame = 0;
    const open = active && settings.appShell ? dockedToolPanels() : [];
    const openSet = new Set(open);
    document.documentElement.classList.toggle('pt-tools-open', open.length > 0);
    // Two or more share the column, one above the other. Clear stale properties on closed panels.
    for (const panel of document.querySelectorAll(TOOL_PANELS)) {
        if (!openSet.has(panel)) {
            panel.style.removeProperty('--pt-tool-i');
            panel.style.removeProperty('--pt-tool-n');
        }
    }
    open.forEach((panel, index) => {
        if (panel.style.getPropertyValue('--pt-tool-i') !== String(index)) panel.style.setProperty('--pt-tool-i', String(index));
        if (panel.style.getPropertyValue('--pt-tool-n') !== String(open.length)) panel.style.setProperty('--pt-tool-n', String(open.length));
    });
}

function watchToolPanel(panel) {
    if (tools.watched.has(panel)) return;
    tools.watched.add(panel);
    tools.observer.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
}

function syncToolPanels() {
    const holder = document.getElementById('movingDivs');
    if (!active || !settings.appShell || !holder) {
        cancelAnimationFrame(tools.frame);
        tools.frame = 0;
        tools.observer?.disconnect();
        tools.observer = null;
        tools.watched = new WeakSet();
        document.documentElement.classList.remove('pt-tools-open');
        document.querySelectorAll(TOOL_PANELS).forEach(panel => {
            panel.style.removeProperty('--pt-tool-i');
            panel.style.removeProperty('--pt-tool-n');
        });
        return;
    }
    if (!tools.observer) {
        tools.observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes ?? []) if (node.parentElement === holder && node.nodeType === 1) watchToolPanel(node);
            }
            if (!tools.frame) tools.frame = requestAnimationFrame(layoutToolPanels);
        });
        tools.observer.observe(holder, { childList: true });
        tools.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        [...holder.children].forEach(watchToolPanel);
    }
    layoutToolPanels();
}

/** Closes the newest docked tool panel the way its own × does. */
function closeToolPanel() {
    const panel = dockedToolPanels().pop();
    if (!panel) return false;
    const close = panel.querySelector('.floating_panel_close, #logprobsViewerClose, .dragClose, [id$="Close"]');
    if (close) close.click();
    else panel.style.display = 'none';
    return true;
}

/** Ctrl+K (⌘K on a Mac) on the desktop layout: Search everything, when you are not typing. */
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function onWideShortcut(event) {
    if (event.defaultPrevented || event.code !== 'KeyK' || event.shiftKey || event.altKey) return;
    if (!(IS_MAC ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey)) || !isWide() || !active) return;
    // In a text box SillyTavern uses Ctrl+K for inline code.
    // Held down after it opened Search everything, the repeats must not reach the browser
    // (its own Ctrl+K is the address bar search), even though the search box now has focus.
    if (event.repeat && sheet) {
        event.preventDefault();
        return;
    }
    if (isTypingField(document.activeElement) || sheet || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    openGlobalSearch();
}

/** Escape on the desktop layout: back one step (a settings section, then the page). */
function onWideKeyDown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!document.documentElement.classList.contains('pt-desktop')) return;
    // Open sheets and SillyTavern's popups close themselves on Escape.
    if (sheet || viewer || document.querySelector('dialog[open]') || editorOpen()) return;
    // The prompt editor: full screen first, then the editor (asking if there are unsaved changes).
    if (promptEditorOpen()) {
        event.preventDefault();
        if (promptFull()) setPromptFull(false);
        else leavePromptEditor();
        return;
    }
    // Character Library's panel has no Escape of its own (keys typed inside it stay in its frame).
    if (!isTypingField(document.activeElement) && closeCharacterLibrary()) {
        event.preventDefault();
        return;
    }
    if (openOverlays().length) return;
    const guidedPopup = openGuidedPopups().pop();
    if (guidedPopup) {
        closeGuidedPopup(guidedPopup);
        event.preventDefault();
        return;
    }
    const typing = isTypingField(document.activeElement);
    // The same order as Back: the chat search bar, then an open lorebook entry, before the page.
    if (chatFinderOpen() && (!typing || finder.bar.contains(document.activeElement))) {
        closeChatFinder();
        event.preventDefault();
        return;
    }
    // Typing in the entry keeps Escape for the text box.
    if (!typing && openLoreEntry()) {
        closeLoreEntry();
        event.preventDefault();
        return;
    }
    // Typing in a tool panel (Author's Note) or side-panel field keeps Escape for the text box.
    if (typing) return;
    if (closeToolPanel()) {
        event.preventDefault();
        return;
    }
    if (closePageSection() || (currentPageId() && (backFromPage(), true))) {
        event.preventDefault();
        event.stopPropagation();
    }
}

/** The SillyTavern popup watch (src/st/popup-watch.js) while Pocket Tavern is on; the shell takes it over in M1c. */
let stopPopupWatch = null;

function applyState() {
    const next = shouldBeActive();
    const changed = next !== active;
    active = next;
    setFeatureClasses();
    applyAppearance();
    watchRanges(active && settings.touchSizing);
    if (active) {
        startObserver();
        stopPopupWatch ??= startPopupWatch();
        // A SillyTavern theme saved from an older version (or changed in SillyTavern since) gets its current values.
        if (changed && String(settings.theme).startsWith('st:')) loadSillyTavernThemes();
        // Kept running while on: adding and removing its page-wide variables for every sheet restyled the whole page twice.
        if (!stopViewportFollow) stopViewportFollow = followViewport(() => sheet?.dialog, COMPACT_BELOW);
    } else {
        stopObserver();
        stopPopupWatch?.();
        stopPopupWatch = null;
        closeSheet(true);
        stopViewportFollow?.();
        stopViewportFollow = null;
    }
    syncShell();
    syncIosViewport();
    const backGesture = active && settings.backGesture;
    watchOverlays(backGesture);
    if (!backGesture) resetHistoryTracking();
    else scheduleHistorySync();
    scan();
    syncWandShortcut();
    syncExtras();
    updateStatusLine();
    if (changed) console.info(LOG, active ? 'active' : 'inactive');
}

// ------------------------------------------------------------- settings UI

function updateStatusLine() {
    const line = document.getElementById('pt_status');
    if (!line) return;
    const mode = readMode();
    let text;
    if (!settings.enabled) text = t('Pocket Tavern is off.');
    else if (mode === 'never') text = t('Off on this device (set to "Off on this device").');
    else if (mode === 'phone') text = detectPhone() ? t('Active on this device (phone layout).') : t('Off on this device (phones only — your screen is {width}px wide).', { width: window.innerWidth });
    else if (document.documentElement.classList.contains('pt-desktop')) text = t('Active on this device (desktop layout).');
    else text = t('Active on this device (phone layout).');
    line.textContent = text;
    line.classList.toggle('pt-status-active', active);
}

function buildSettings() {
    if (document.getElementById('pt_settings')) return;
    const container = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!container) return;

    const check = (id, label, hint) => h('label', { class: 'checkbox_label pt-check', for: id }, [
        h('input', { type: 'checkbox', id }),
        h('span', { class: 'pt-check-text' }, [
            h('span', { class: 'pt-check-label', text: label }),
            hint ? h('small', { class: 'pt-check-hint', text: hint }) : null,
        ]),
    ]);

    const modeSelect = h('select', { id: 'pt_mode', class: 'text_pole' }, [
        h('option', { value: 'auto', text: 'Automatic: phones and computers' }),
        h('option', { value: 'phone', text: 'Phones only' }),
        h('option', { value: 'never', text: 'Off on this device' }),
    ]);

    const panel = h('div', { id: 'pt_settings', class: 'pt-settings extension_container' }, [
        h('div', { class: 'inline-drawer' }, [
            h('div', { class: 'inline-drawer-toggle inline-drawer-header' }, [
                h('b', { text: 'Pocket Tavern' }),
                h('div', { class: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }),
            ]),
            h('div', { class: 'inline-drawer-content' }, [
                check('pt_enabled', 'Enable Pocket Tavern', 'Off brings back the original interface.'),
                h('p', { id: 'pt_status', class: 'pt-status-line' }),
                h('label', { class: 'pt-field', for: 'pt_mode' }, [
                    h('span', { class: 'pt-field-label', text: 'Use it on this device' }),
                    modeSelect,
                ]),
                h('small', { class: 'pt-note', text: 'Phones get the phone layout and wide screens the desktop layout, on their own. Pick "Phones only" to keep the original interface on this computer.' }),
                h('hr'),
                h('label', { class: 'pt-field', for: 'pt_theme' }, [
                    h('span', { class: 'pt-field-label', text: 'Theme' }),
                    h('select', { id: 'pt_theme', class: 'text_pole' }, [
                        h('option', { value: 'st', text: 'Your SillyTavern theme' }),
                        ...THEMES.map(theme => h('option', { value: theme.id, text: `${theme.name}: ${theme.note}` })),
                    ]),
                ]),
                h('label', { class: 'pt-field', for: 'pt_motion' }, [
                    h('span', { class: 'pt-field-label', text: 'Animations' }),
                    h('select', { id: 'pt_motion', class: 'text_pole' }, Object.entries(MOTION_LABELS).map(([value, text]) => h('option', { value, text }))),
                ]),
                check('pt_backdrop', 'Theme background', "Use the theme's backdrop instead of your chat background."),
                check('pt_font', 'Modern font', resolveLayout(settings.layout) === 'desktop' ? "Your computer's own system font." : "Your phone's own system font."),
                check('pt_icons', 'New icons', 'Rounded line icons everywhere.'),
                h('label', { class: 'pt-field', for: 'pt_size' }, [
                    h('span', { class: 'pt-field-label', text: 'Size' }),
                    h('select', { id: 'pt_size', class: 'text_pole' }, Object.entries(SIZES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('label', { class: 'pt-field', for: 'pt_layout' }, [
                    h('span', { class: 'pt-field-label', text: 'Layout' }),
                    h('select', { id: 'pt_layout', class: 'text_pole' }, Object.entries(LAYOUT_NAMES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('label', { class: 'pt-field', for: 'pt_composer' }, [
                    h('span', { class: 'pt-field-label', text: 'Message box' }),
                    h('select', { id: 'pt_composer', class: 'text_pole' }, Object.entries(COMPOSER_STYLES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('label', { class: 'pt-field', for: 'pt_textsize' }, [
                    h('span', { class: 'pt-field-label', text: 'Chat text size' }),
                    h('select', { id: 'pt_textsize', class: 'text_pole' }, Object.entries(TEXT_SIZES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('hr'),
                ...EXTRAS.map(extra => check(extra.id, extra.label, extra.hint)),
                h('hr'),
                check('pt_shell', 'App navigation', 'Top bar with the current character, and tabs at the bottom.'),
                check('pt_chat', 'Modern chat look', 'Message cards, bigger text and a rounded message box.'),
                check('pt_touch', 'Touch-friendly panels', 'Bigger buttons and sliders, roomier settings, bottom-sheet menus.'),
                check('pt_back', 'Back gesture closes panels', 'Android back closes the open page, popup or sheet first.'),
                check('pt_lorebook', 'Easy lorebook picker', 'Searchable list for global, character, chat and persona lorebooks.'),
                check('pt_wand', 'Lorebooks shortcut in the ✨ menu', ''),
                check('pt_long', 'Searchable long dropdowns (experimental)', 'Use the same list for any dropdown with 14 or more choices.'),
                h('small', { class: 'pt-note', text: 'Changes apply right away. Nothing here changes your characters, chats or lorebooks.' }),
            ]),
        ]),
    ]);
    container.append(panel);

    const bind = (id, key, appearance = false) => {
        const input = document.getElementById(id);
        input.checked = !!settings[key];
        input.addEventListener('change', () => {
            if (appearance) {
                setAppearance(key, input.checked);
                return;
            }
            settings[key] = input.checked;
            saveSettings();
            applyState();
        });
    };
    bind('pt_enabled', 'enabled');
    bind('pt_shell', 'appShell');
    bind('pt_chat', 'chatStyle');
    bind('pt_touch', 'touchSizing');
    bind('pt_back', 'backGesture');
    bind('pt_lorebook', 'lorebookPicker');
    bind('pt_wand', 'wandShortcut');
    bind('pt_long', 'longSelects');
    bind('pt_backdrop', 'themeBackdrop', true);
    bind('pt_font', 'modernFont', true);
    bind('pt_icons', 'customIcons', true);
    for (const extra of EXTRAS) bind(extra.id, extra.key, true);
    for (const [id, key] of [['pt_theme', 'theme'], ['pt_motion', 'motion'], ['pt_textsize', 'textSize'], ['pt_size', 'uiSize'], ['pt_composer', 'composerStyle'], ['pt_layout', 'layout']]) {
        const select = document.getElementById(id);
        if (id === 'pt_theme') syncSettingsThemeOption(select);
        else select.value = settings[key];
        select.addEventListener('change', () => setAppearance(key, select.value));
    }

    modeSelect.value = readMode();
    modeSelect.addEventListener('change', () => {
        writeMode(modeSelect.value);
        applyState();
    });
    updateStatusLine();
}

function syncSettingsThemeOption(select) {
    if (!select) return;
    select.querySelector('option[data-pt-st]')?.remove();
    const id = settings.theme;
    if (typeof id === 'string' && id.startsWith('st:')) {
        select.append(h('option', { value: id, 'data-pt-st': '1', raw: `${id.slice(3)} (${t('From SillyTavern')})` }));
    }
    select.value = id;
}

/** Keeps the Extensions-panel controls in step when settings change from a sheet. */
function syncSettingsInputs() {
    const pairs = { pt_backdrop: 'themeBackdrop', pt_font: 'modernFont', pt_icons: 'customIcons' };
    for (const extra of EXTRAS) pairs[extra.id] = extra.key;
    for (const [id, key] of Object.entries(pairs)) {
        const input = document.getElementById(id);
        if (input) input.checked = !!settings[key];
    }
    syncSettingsThemeOption(document.getElementById('pt_theme'));
    for (const [id, key] of [['pt_motion', 'motion'], ['pt_textsize', 'textSize'], ['pt_size', 'uiSize'], ['pt_composer', 'composerStyle'], ['pt_layout', 'layout']]) {
        const select = document.getElementById(id);
        if (select) select.value = settings[key];
    }
}

// ------------------------------------------------------------------- init

function isConnected() {
    const status = ctx().onlineStatus;
    return !!status && status !== 'no_connection';
}

/** Pocket Tavern's own pages (AI, Settings) with the actions they need from here. */
function registerOwnPages() {
    definePage('pt-ai', aiPage({ openPage, connected: isConnected }));
    definePage('pt-settings', settingsPage({
        openPage,
        extensionPages: () => Array.from(document.querySelectorAll('#top-settings-holder > .drawer'))
            .filter(drawer => drawer.id && !TABS.some(tab => tab.id === drawer.id) && !AI_PAGES.includes(drawer.id) && !SETTINGS_PAGES.includes(drawer.id))
            .map(drawer => ({ id: drawer.id, title: pageInfo(drawer).title })),
        themeName: () => currentTheme()?.name ?? t('Your theme'),
        openThemes: () => openThemeSheet(),
        openFeatures: () => openExtrasSheet(),
        openPocketTavernSettings: () => openMobileSettings(),
        useSillyTavernForNow,
        openWhatsNew: () => openWhatsNew(),
        updatePocketTavern: row => updatePocketTavern(row),
        openSillyTavernUpdates: () => openSillyTavernUpdates(),
        installApp: isStandalone() ? null : () => installApp(),
        version: VERSION,
    }));
    onPageChange(() => {
        shell?.update();
        scheduleHistorySync();
    });
}

function init() {
    if (!globalThis.SillyTavern?.getContext || !globalThis.jQuery) {
        console.warn(LOG, 'SillyTavern context is not available; extension not started.');
        return;
    }
    loadSettings();
    registerOwnPages();
    // Pick the language before anything is drawn.
    setLocale(ctx().getCurrentLocale?.() ?? navigator.language);
    buildSettings();
    applyState();

    let resizeTimer = 0;
    let lastWidth = window.innerWidth;
    const reevaluate = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            // Only the height changed (the keyboard on Android opens and closes like this) and nothing
            // it decides would change: the classes are enough, not the whole pass over pages and the chat.
            const sameWidth = window.innerWidth === lastWidth;
            lastWidth = window.innerWidth;
            const nextActive = shouldBeActive();
            if (!active && !nextActive) return;
            const wideNow = active && settings.appShell && resolveLayout(settings.layout) === 'desktop';
            if (sameWidth && nextActive === active && wideNow === isWide()) {
                setFeatureClasses();
                syncIosViewport();
                return;
            }
            applyState();
        }, 150);
    };
    window.addEventListener('resize', reevaluate);
    window.addEventListener('orientationchange', reevaluate);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('scroll', onStrayScroll, { passive: true });
    window.addEventListener('resize', onScreenChange);
    if (IS_IOS && window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleIosViewport);
        window.visualViewport.addEventListener('scroll', scheduleIosViewport);
        document.addEventListener('focusin', scheduleIosViewport);
        document.addEventListener('focusout', () => setTimeout(scheduleIosViewport, 50));
    }
    document.addEventListener('click', onInputHistoryClick, true);
    document.addEventListener('input', onComposerInput, true);
    document.addEventListener('error', onAvatarError, true);
    document.addEventListener('click', event => extnav.onClick(event), true);
    document.addEventListener('click', onExportClick, true);
    document.addEventListener('click', onCharacterTap, true);
    document.addEventListener('click', onCardPeekPress, true);
    document.addEventListener('pointerdown', onCardPeekPress, true);
    document.addEventListener('focusin', () => shell?.checkKeyboard());
    document.addEventListener('focusout', () => setTimeout(() => shell?.checkKeyboard(), 50));

    const { eventSource, event_types } = ctx();
    const refreshShell = () => shell?.update();
    eventSource?.on?.(event_types.APP_READY, () => {
        buildSettings();
        applyState();
        // SillyTavern puts back the last message box text on load; sort it into the right chat.
        restoreDraft();
        applyLanguage();
        if (!maybeShowDesktopNotice()) maybeShowWhatsNew();
    });
    for (const name of ['CHARACTER_EDITED', 'CHARACTER_PAGE_LOADED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], () => applyPendingAnimated());
    }
    eventSource?.on?.(event_types.CHAT_CHANGED, () => {
        applyPendingAnimated();
        sheet?.refresh();
        shell?.onChatChanged();
        guardKeyboard();
        restoreDraft();
        // A new chat starts at the bottom; hide the jump button until you scroll up.
        setTimeout(onChatScroll, 300);
        // After the messages (and folding, 200 ms) are in.
        primeChatSizes(400);
        holdAtNewest();
    });
    if (event_types.MORE_MESSAGES_LOADED) eventSource?.on?.(event_types.MORE_MESSAGES_LOADED, () => primeChatSizes(400));
    if (event_types.MESSAGE_SENT) eventSource?.on?.(event_types.MESSAGE_SENT, clearDraft);
    // Folded messages follow whatever changes in the chat.
    let chatTimer = 0;
    const chatChanged = () => {
        if (!active) return;
        syncSwipeCounters();
        window.clearTimeout(chatTimer);
        chatTimer = window.setTimeout(() => {
            foldLongMessages();
            markMissingAvatars();
        }, 200);
    };
    for (const name of ['MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MORE_MESSAGES_LOADED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], chatChanged);
    }
    for (const name of ['CHAT_COMPLETION_PROMPT_READY', 'GENERATE_AFTER_COMBINE_PROMPTS']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], onPromptReady);
    }
    if (event_types.GENERATION_STARTED) {
        eventSource?.on?.(event_types.GENERATION_STARTED, (type, _params, dryRun) => {
            meter.live = !dryRun && type !== 'quiet';
        });
    }
    // When a reply is done (or a message goes away), read the ring again from SillyTavern's own
    // record of the last prompt: the same numbers as its Prompt popup, with the breakdown.
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED']) {
        if (!event_types[name]) continue;
        eventSource?.on?.(event_types[name], () => {
            meter.live = false;
            if (!active || !settings.contextMeter) return;
            clearTimeout(meter.timer);
            meter.timer = window.setTimeout(loadMeterFromHistory, 400);
        });
    }
    if (event_types.CHAT_CHANGED) {
        eventSource?.on?.(event_types.CHAT_CHANGED, () => {
            meter.used = 0;
            meter.breakdown = null;
            renderMeter();
            closeChatFinder();
            // SillyTavern loads the chat's prompt records a moment after the chat.
            setTimeout(loadMeterFromHistory, 900);
            updatePersonaButton();
        });
    }
    // The persona button follows persona changes, renames and new pictures.
    for (const name of ['PERSONA_CHANGED', 'PERSONA_RENAMED', 'PERSONA_UPDATED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], () => setTimeout(updatePersonaButton, 50));
    }
    // A new reply has its own record; the ring's details follow it.
    if (event_types.GENERATION_ENDED) {
        eventSource?.on?.(event_types.GENERATION_ENDED, () => {
            meter.breakdown = null;
        });
    }
    // Keep new, edited and swiped messages in the chat's translated language.
    for (const name of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], id => queueAutoTranslate(id));
    }
    for (const name of ['MESSAGE_EDITED', 'MESSAGE_SWIPED']) {
        if (event_types[name]) {
            eventSource?.on?.(event_types[name], id => {
                dropTranslation(id);
                queueAutoTranslate(id);
            });
        }
    }
    if (event_types.GENERATION_STARTED) eventSource?.on?.(event_types.GENERATION_STARTED, (type, options, dryRun) => {
        // Dry runs (prompt token counts) start but never end; they aren't replies.
        if (!dryRun) onGenerating(true);
    });
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], () => onGenerating(false));
    }
    for (const name of ['ONLINE_STATUS_CHANGED', 'CHARACTER_EDITED', 'CHARACTER_RENAMED', 'GROUP_UPDATED', 'SETTINGS_UPDATED']) {
        if (event_types[name]) eventSource?.on?.(event_types[name], refreshShell);
    }
    document.addEventListener('click', onWandTranslateClick, true);
    // The wand menu can be (re)built after extensions load.
    setTimeout(syncWandShortcut, 1500);
    setTimeout(syncWandShortcut, 5000);
}

/** Steps aside for this visit: every class, node and layer goes, like turning Pocket Tavern off. */
function pauseLegacy() {
    paused = true;
    if (settings) applyState();
}

/** The lifecycle's stop (after an error): steps aside, with the Back pill to try again. */
function stopLegacy() {
    pauseLegacy();
    showBackPill(() => restartAll());
}

/**
 * Starts the 2.x app (called by src/main.js through the lifecycle) and returns its stop.
 * If starting throws halfway, it steps aside before passing the error on.
 */
export function startLegacy() {
    try {
        init();
    } catch (error) {
        stopLegacy();
        throw error;
    }
    return stopLegacy;
}

/** After a restart: it already started once, so it only comes back. */
export function resumeLegacy() {
    paused = false;
    if (settings) applyState();
    return stopLegacy;
}

/** Settings → Use SillyTavern for now: SillyTavern's own screens for this visit, and the Back pill. */
function useSillyTavernForNow() {
    closePages();
    pauseLegacy();
    showBackPill(() => {
        paused = false;
        applyState();
    });
}
