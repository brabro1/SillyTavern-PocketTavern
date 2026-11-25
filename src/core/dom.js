// The safe DOM builder (AGENTS.md → Rules, 6). Pocket Tavern builds every node with h() and text nodes,
// never innerHTML.
import { t } from './i18n.js';

/**
 * Builds an element.
 * - `text`, `title`, `aria-label`, `placeholder` and string children are Pocket Tavern's own labels:
 *   they go through t().
 * - `raw` is for user data (names, chat text, entry titles): set as text, never translated.
 * - `on<event>` adds a listener; `class` sets the class name; `true` sets an empty attribute;
 *   `false`, `null` and `undefined` leave it out.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {(Node | string | null | false | undefined)[]} [children]
 */
export function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === false || value === null || value === undefined) continue;
        if (key === 'class') el.className = value;
        else if (key === 'raw') el.textContent = String(value);
        else if (key === 'text') el.textContent = typeof value === 'string' ? t(value) : value;
        else if (key === 'title' || key === 'aria-label' || key === 'placeholder') el.setAttribute(key, t(String(value)));
        else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children) {
        if (child === null || child === false || child === undefined) continue;
        el.append(typeof child === 'string' ? t(child) : child);
    }
    return el;
}
