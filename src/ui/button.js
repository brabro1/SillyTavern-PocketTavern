// Buttons (DESIGN.md → Components → Buttons): pills for labelled actions, round icon buttons for the
// icons everyone knows. Styles in styles/components/button.css.
import { h } from '../core/dom.js';
import { svgIcon } from './icons.js';

const KINDS = ['primary', 'secondary', 'quiet', 'danger', 'danger-filled'];

/**
 * A labelled pill button.
 * @param {object} options
 * @param {string} options.label Pocket Tavern's own words (translated)
 * @param {'primary'|'secondary'|'quiet'|'danger'|'danger-filled'} [options.kind] primary is the one main action of a screen
 * @param {string} [options.icon] a 20px leading icon from src/ui/icons.js
 * @param {(event: MouseEvent) => void} [options.onClick]
 * @param {boolean} [options.disabled]
 * @param {'button'|'submit'} [options.type]
 */
export function button({ label, kind = 'secondary', icon, onClick, disabled = false, type = 'button' }) {
    const variant = KINDS.includes(kind) ? kind : 'secondary';
    return h('button', { type, class: `pt-button pt-button--${variant} pt-focus pt-press`, disabled, onclick: onClick }, [
        icon ? svgIcon(icon, 'pt-button-icon') : null,
        h('span', { class: 'pt-button-label', text: label }),
    ]);
}

/**
 * Shows that a button's action is running (DESIGN.md → Feedback → Waiting): a spinner replaces its
 * icon and it takes no presses until done.
 */
export function setBusy(buttonElement, busy) {
    buttonElement.classList.toggle('pt-button--busy', busy);
    buttonElement.setAttribute('aria-busy', String(busy));
    buttonElement.disabled = busy;
}

/**
 * A round icon-only button: 44px hit area, 20px icon. The label is read by screen readers.
 * @param {object} options
 * @param {string} options.icon
 * @param {string} options.label e.g. "Close" for ✕ (translated)
 * @param {(event: MouseEvent) => void} [options.onClick]
 * @param {boolean} [options.disabled]
 */
export function iconButton({ icon, label, onClick, disabled = false }) {
    return h('button', { type: 'button', class: 'pt-icon-button pt-focus pt-press', 'aria-label': label, title: label, disabled, onclick: onClick }, [
        svgIcon(icon, 'pt-icon-button-icon'),
    ]);
}
