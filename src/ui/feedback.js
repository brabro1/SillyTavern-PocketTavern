// Feedback (DESIGN.md → Components → Feedback): the status banner for problems that block work, quiet
// notices, and empty states. Toasts are SillyTavern's own, restyled (styles/st/). Styles in
// styles/components/feedback.css.
import { h } from '../core/dom.js';
import { svgIcon } from './icons.js';

const STATUS_ICON = { info: 'info', ok: 'circle-check', warn: 'alert-triangle', danger: 'alert-circle' };

/**
 * A banner under the header for a problem that blocks work (not connected, server not answering).
 * One sentence and one quiet action. It goes away by itself when the problem is gone; only a banner
 * that blocks nothing can be dismissed.
 * @param {object} options
 * @param {'info'|'warn'|'danger'} [options.status]
 * @param {string} options.text one sentence (translated)
 * @param {{ label: string, onClick: () => void }} [options.action]
 * @param {() => void} [options.onDismiss] only for banners that block nothing
 */
export function statusBanner({ status = 'warn', text, action, onDismiss }) {
    return h('div', { class: `pt-status-banner pt-status-banner--${status}`, role: status === 'danger' ? 'alert' : 'status' }, [
        svgIcon(STATUS_ICON[status] ?? 'info', 'pt-status-banner-icon'),
        h('span', { class: 'pt-status-banner-text', text }),
        action ? h('button', { type: 'button', class: 'pt-button pt-button--quiet pt-focus pt-press', onclick: action.onClick }, [h('span', { class: 'pt-button-label', text: action.label })]) : null,
        onDismiss ? h('button', { type: 'button', class: 'pt-icon-button pt-focus pt-press', 'aria-label': 'Dismiss', title: 'Dismiss', onclick: onDismiss }, [svgIcon('x', 'pt-icon-button-icon')]) : null,
    ]);
}

/**
 * A quiet note in the flow of a screen: 6% of the status colour, a hairline, an 18px icon.
 * @param {object} options
 * @param {'info'|'warn'|'danger'} [options.status]
 * @param {string} options.text (translated)
 */
export function notice({ status = 'info', text }) {
    return h('div', { class: `pt-notice pt-notice--${status}` }, [
        svgIcon(STATUS_ICON[status] ?? 'info', 'pt-notice-icon'),
        h('span', { class: 'pt-notice-text', text }),
    ]);
}

/**
 * An empty state: a 24px icon, one sentence, one action ("No chats yet" · Choose a character).
 * @param {object} options
 * @param {string} options.icon
 * @param {string} options.text (translated)
 * @param {{ label: string, onClick: () => void }} [options.action]
 */
export function emptyState({ icon, text, action }) {
    return h('div', { class: 'pt-empty-state' }, [
        svgIcon(icon, 'pt-empty-state-icon'),
        h('p', { class: 'pt-empty-state-text', text }),
        action ? h('button', { type: 'button', class: 'pt-button pt-button--secondary pt-focus pt-press', onclick: action.onClick }, [h('span', { class: 'pt-button-label', text: action.label })]) : null,
    ]);
}
