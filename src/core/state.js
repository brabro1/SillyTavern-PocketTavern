// Pocket Tavern's state and small helpers (AGENTS.md → Repo map, core): its settings (extension_settings.mobileUI,
// with defaults and migrations), whether it is on, the activation mode, and helpers every part shares. `settings`,
// `active` and `paused` are live bindings: other modules read them, and only this module (through its setters)
// changes them.
import { svgIcon } from '../ui/icons.js';
import { migrateSettings } from './settings.js';
import { h } from './dom.js';
import { safe } from './lifecycle.js';

const SOURCE = 'state';

// This file sits two folders below Pocket Tavern's own folder (src/core/), which sits in
// /scripts/extensions/third-party/<folder>/.
export const EXTENSION_ROOT = new URL('../../', import.meta.url);

const MODULE = 'mobileUI';
const MODE_KEY = 'pt_mode';
export const LOG = '[Pocket Tavern]';

const DEFAULTS = Object.freeze({
    enabled: true,
    appShell: true,
    chatStyle: true,
    touchSizing: true,
    /** SillyTavern's Custom CSS while a Pocket Tavern theme is on (a SillyTavern theme puts its own CSS there). */
    stCustomCss: false,
    /** The Draft helper (built in from the Draft Enhancer extension): Enhance, Write and Continue in +. */
    draftHelper: true,
    /** − and + beside sliders' numbers (issue #12: off; typing the number is quicker). */
    sliderSteppers: false,
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

/** The motion curve, the same as --pt-ease in style.css (DESIGN.md, motion). */
export const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

export const MOTION_LABELS = {
    full: 'Smooth: all animations',
    light: 'Light: quick fades only (faster)',
    off: 'Off: no animations (fastest)',
};

export function isWide() {
    return document.documentElement.classList.contains('pt-desktop');
}

/** Visible height (px) below which the sheet drops secondary chrome: landscape or keyboard open. */
export const COMPACT_BELOW = 520;
/**
 * Wide screens (a computer, a tablet held sideways) get the desktop layout: tabs
 * as a rail on the left, pages as a panel beside the chat, sheets as dialogs.
 * A sideways phone is wide but short, so it keeps the phone layout.
 */
export let settings = null;
export let active = false;
/** Stopped for this visit by src/core/lifecycle.js (after an error); SillyTavern's own screens show. */
export let paused = false;

// ---------------------------------------------------------------- utilities

export function ctx() {
    return globalThis.SillyTavern.getContext();
}

export function $j() {
    return globalThis.jQuery;
}

export const icon = (classes) => h('i', { class: `fa-solid ${classes}`, 'aria-hidden': 'true' });
/** Our own line icon (icons.js), or a Font Awesome class for drawers we do not know. */
export const ui = (name, className = '') => (name.startsWith('fa-') ? icon(`${name} ${className}`) : svgIcon(name, className));

export function normalizeText(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Builds a node list with every match of `query` wrapped in <mark> (never translated). */
export function highlight(text, query) {
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

export function wireOnce(element, type, handler) {
    if (!element) return;
    const types = wiredOnce.get(element) ?? new Set();
    if (types.has(type)) return;
    types.add(type);
    wiredOnce.set(element, types);
    element.addEventListener(type, safe(SOURCE, handler));
}

export function readMode() {
    try {
        const value = localStorage.getItem(MODE_KEY);
        // "always" was the old way to use it on a computer; automatic does that now.
        return value === 'phone' || value === 'never' ? value : 'auto';
    } catch {
        return 'auto';
    }
}

export function writeMode(mode) {
    try {
        localStorage.setItem(MODE_KEY, mode);
    } catch (error) {
        console.warn(LOG, 'Could not store the activation mode', error);
    }
}

export function loadSettings() {
    const { extensionSettings } = ctx();
    extensionSettings[MODULE] = Object.assign({}, DEFAULTS, migrateSettings(extensionSettings[MODULE]));
    settings = extensionSettings[MODULE];
}

export function saveSettings() {
    ctx().saveSettingsDebounced();
}

// ------------------------------------------------------- phone detection

/** Best-effort phone check that survives Chrome's "Desktop site" mode. */
export function detectPhone() {
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
export function shouldBeActive() {
    if (paused || !settings.enabled) return false;
    const mode = readMode();
    if (mode === 'never') return false;
    if (mode === 'phone') return detectPhone();
    return true;
}

export function motionAllowed() {
    return settings.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A short vibration. Android only allows it right after a tap. */
export function buzz(pattern = 10) {
    // Chrome logs an error for vibrate() without a real tap (for example a scripted click).
    if (active && settings.haptics && navigator.userActivation?.isActive !== false) {
        try {
            navigator.vibrate?.(pattern);
        } catch {
            // Not allowed here; nothing to do.
        }
    }
}


export function setActive(on) {
    active = on;
}

export function setPaused(on) {
    paused = on;
}
