// The segmented control (DESIGN.md → Components → Segmented control): 2–4 options that change a view
// or a mode. Arrow keys move between them. Styles in styles/components/segments.css.
import { h } from '../core/dom.js';

/**
 * @param {object} options
 * @param {string} options.label what it chooses, for screen readers (translated)
 * @param {{ value: string, label: string }[]} options.options 2–4 options (labels translated)
 * @param {string} options.value
 * @param {(value: string) => void} [options.onChange]
 */
export function segments({ label, options, value, onChange }) {
    const buttons = options.map(option => h('button', {
        type: 'button',
        role: 'radio',
        class: 'pt-segment pt-focus',
        'data-value': option.value,
        text: option.label,
    }));
    const group = h('div', { class: 'pt-segments', role: 'radiogroup', 'aria-label': label }, buttons);
    const select = (next, notify) => {
        for (const button of buttons) {
            const on = button.dataset.value === next;
            button.setAttribute('aria-checked', String(on));
            button.tabIndex = on ? 0 : -1;
        }
        if (notify) onChange?.(next);
    };
    group.addEventListener('click', event => {
        const button = event.target.closest('.pt-segment');
        if (button && button.getAttribute('aria-checked') !== 'true') select(button.dataset.value, true);
    });
    group.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const rtl = getComputedStyle(group).direction === 'rtl';
        const at = buttons.indexOf(document.activeElement);
        const forward = (event.key === 'ArrowRight') !== rtl;
        const to = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (forward ? 1 : -1) + buttons.length) % buttons.length;
        buttons[to].focus();
        select(buttons[to].dataset.value, true);
    });
    select(value, false);
    return group;
}
