// The switch (DESIGN.md → Components → Switch). A real button with role="switch"; styles in
// styles/components/toggle.css. Views that show SillyTavern's own checkboxes as switches pass
// `onChange` and set the hidden checkbox themselves (AGENTS.md → Restyle, replace, or hide?).
import { h } from '../core/dom.js';

/**
 * @param {object} options
 * @param {boolean} [options.checked]
 * @param {string} [options.label] its own label for screen readers (translated), or
 * @param {string} [options.labelledBy] the id of the visible label it belongs to
 * @param {(checked: boolean) => void} [options.onChange]
 * @param {boolean} [options.disabled]
 */
export function toggle({ checked = false, label, labelledBy, onChange, disabled = false }) {
    const control = h('button', {
        type: 'button',
        role: 'switch',
        class: 'pt-toggle pt-focus',
        'aria-checked': String(!!checked),
        'aria-label': labelledBy ? undefined : label,
        'aria-labelledby': labelledBy,
        disabled,
    }, [h('span', { class: 'pt-toggle-knob' })]);
    control.addEventListener('click', () => {
        const next = control.getAttribute('aria-checked') !== 'true';
        control.setAttribute('aria-checked', String(next));
        onChange?.(next);
    });
    return control;
}

/** Sets a switch without telling its listener (for example when SillyTavern changed the value). */
export function setToggle(control, checked) {
    control.setAttribute('aria-checked', String(!!checked));
}
