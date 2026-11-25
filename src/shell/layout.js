// Phone or desktop, and whether the keyboard is up (DESIGN.md → Layouts and platform invariants).
// This is the only module that decides the layout; nothing else reads the window size for that.
import { safe } from '../core/lifecycle.js';

/** Automatic: desktop from 960 × 560 (computers, tablets held sideways). */
const AUTO_DESKTOP = '(min-width: 960px) and (min-height: 560px)';
/** Chosen "Desktop" still needs room for the chat column's 480px: below 768px wide it is a phone. */
const FORCED_DESKTOP = '(min-width: 768px)';
/** How much shorter the visible screen must be, with a text field focused, to count as the keyboard. */
const KEYBOARD_PX = 120;

export const LAYOUTS = ['auto', 'phone', 'desktop'];

const IS_IOS = /iP(hone|ad|od)/.test(globalThis.navigator?.userAgent ?? '')
    || (globalThis.navigator?.platform === 'MacIntel' && globalThis.navigator?.maxTouchPoints > 1);

/**
 * The layout for a preference (Appearance → Layout).
 * @param {'auto'|'phone'|'desktop'|string} preference unknown values count as auto
 * @returns {'phone'|'desktop'}
 */
export function resolveLayout(preference) {
    if (preference === 'phone') return 'phone';
    if (preference === 'desktop') return matchMedia(FORCED_DESKTOP).matches ? 'desktop' : 'phone';
    return matchMedia(AUTO_DESKTOP).matches ? 'desktop' : 'phone';
}

/**
 * Sets `html.pt-desktop` or `html.pt-phone` (exactly one while Pocket Tavern is on, neither when off).
 * @param {boolean} on whether Pocket Tavern's layout is in use
 * @param {string} preference
 * @returns {'phone'|'desktop'|null}
 */
export function applyLayout(on, preference) {
    const root = document.documentElement;
    const layout = on ? resolveLayout(preference) : null;
    root.classList.toggle('pt-desktop', layout === 'desktop');
    root.classList.toggle('pt-phone', layout === 'phone');
    return layout;
}

/** Calls `onChange` when a window resize or rotation could change the layout. Returns the stop function. */
export function watchLayout(onChange) {
    const queries = [AUTO_DESKTOP, FORCED_DESKTOP].map(query => matchMedia(query));
    const handler = safe('the layout watch', onChange);
    for (const query of queries) query.addEventListener?.('change', handler);
    return () => {
        for (const query of queries) query.removeEventListener?.('change', handler);
    };
}

/** A focused field you can type into: a text input, a text area or editable text, not disabled or read-only. */
export function isTypingField(element) {
    if (!element || element.disabled || element.readOnly) return false;
    if (element.isContentEditable) return true;
    if (element.tagName === 'TEXTAREA') return true;
    if (element.tagName !== 'INPUT') return false;
    return ['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']
        .includes((element.getAttribute('type') ?? '').toLowerCase());
}

/** The tallest the window has been at this width (Android shrinks the window for the keyboard). */
const base = { width: 0, height: 0 };

/**
 * Whether the on-screen keyboard is up: a typing field has focus and the visible screen is at least
 * 120px shorter than the full screen. iPhones and iPads keep the window and shrink the visual
 * viewport; Android shrinks the window, so it is compared with its tallest height at this width.
 */
export function keyboardUp(active = document.activeElement) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (Math.abs(width - base.width) > 40) {
        base.width = width;
        base.height = height;
    }
    if (height > base.height) base.height = height;
    if (!isTypingField(active)) return false;
    const visible = IS_IOS && window.visualViewport ? window.visualViewport.height : height;
    const full = IS_IOS ? height : base.height;
    return full - visible >= KEYBOARD_PX;
}

export { IS_IOS };
