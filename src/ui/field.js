// Fields (DESIGN.md → Components → Fields): text fields, text areas and the search field, each with an
// optional label, help and error. Styles in styles/components/field.css.
import { h } from '../core/dom.js';
import { safe } from '../core/lifecycle.js';
import { svgIcon } from './icons.js';

let next = 0;
const uid = prefix => `${prefix}-${++next}`;

/**
 * A labelled field: label above (phone) or beside (desktop, `inline`), the control, then help or an error.
 * @param {object} options
 * @param {string} options.label (translated)
 * @param {HTMLElement} options.control the input, text area, switch, picker or value pill
 * @param {string} [options.help] two lines at most, then "More" (translated)
 * @param {boolean} [options.inline] short controls sit beside their label on desktop
 */
export function formField({ label, control, help, inline = false }) {
    const id = control.id || uid('pt-field');
    control.id = id;
    const helpId = help ? `${id}-help` : null;
    if (helpId) control.setAttribute('aria-describedby', helpId);
    const errorId = `${id}-error`;
    return h('div', { class: `pt-form-field${inline ? ' pt-form-field--inline' : ''}`, 'data-error-id': errorId }, [
        h('label', { class: 'pt-form-label', for: id, text: label }),
        control,
        help ? helpText(help, helpId) : null,
        h('div', { class: 'pt-form-error', id: errorId, role: 'alert', hidden: true }),
    ]);
}

/** Shows or clears an error under a field made by formField(): danger text and a danger border. */
export function setFieldError(field, message) {
    const error = field.querySelector('.pt-form-error');
    const control = field.querySelector('.pt-text-field');
    error.textContent = message ?? '';
    error.hidden = !message;
    field.classList.toggle('pt-form-field--error', !!message);
    if (control) {
        if (message) {
            control.setAttribute('aria-invalid', 'true');
            control.setAttribute('aria-errormessage', error.id);
        } else {
            control.removeAttribute('aria-invalid');
            control.removeAttribute('aria-errormessage');
        }
    }
}

/** Help text clamped to two lines, with "More" when it is longer. */
export function helpText(text, id) {
    const body = h('span', { class: 'pt-help-text', text });
    const more = h('button', { type: 'button', class: 'pt-help-more pt-focus', text: 'More', hidden: true, onclick: () => {
        wrap.classList.add('pt-help-block--open');
        more.hidden = true;
    } });
    const wrap = h('div', { class: 'pt-help-block', id }, [body, more]);
    // Only once it is on screen can its height be measured.
    requestAnimationFrame(safe('help text', () => {
        if (body.scrollHeight > body.clientHeight + 1) more.hidden = false;
    }));
    return wrap;
}

/**
 * A text field or, with `multiline`, a text area that grows with its text up to 40% of the window.
 * @param {object} options
 * @param {string} [options.value] may be user data; set as is
 * @param {string} [options.placeholder] (translated)
 * @param {boolean} [options.multiline]
 * @param {string} [options.inputmode]
 * @param {(value: string) => void} [options.onInput]
 * @param {(value: string) => void} [options.onChange] when the field is left with a new value
 */
export function textField({ value = '', placeholder, multiline = false, inputmode, onInput, onChange }) {
    const control = h(multiline ? 'textarea' : 'input', {
        class: `pt-text-field${multiline ? ' pt-text-field--area' : ''} pt-focus`,
        placeholder,
        inputmode,
        type: multiline ? undefined : 'text',
        rows: multiline ? 3 : undefined,
        dir: 'auto',
    });
    control.value = value;
    const grow = () => {
        if (!multiline) return;
        control.style.height = 'auto';
        control.style.height = `${Math.min(control.scrollHeight + 2, window.innerHeight * 0.4)}px`;
    };
    control.addEventListener('input', () => {
        grow();
        onInput?.(control.value);
    });
    if (onChange) control.addEventListener('change', () => onChange(control.value));
    if (multiline) requestAnimationFrame(safe('text area', grow));
    return control;
}

/**
 * The search field: a leading search icon, and ✕ to clear once there is text. Calls `onSearch`
 * as you type, at most every 150ms.
 * @param {object} options
 * @param {string} options.placeholder (translated)
 * @param {(query: string) => void} options.onSearch
 */
export function searchBox({ placeholder, onSearch }) {
    let timer = 0;
    const input = h('input', { type: 'search', class: 'pt-search-box-input pt-focus', placeholder, 'aria-label': placeholder, enterkeyhint: 'search', dir: 'auto' });
    const clear = h('button', { type: 'button', class: 'pt-icon-button pt-search-box-clear pt-focus', 'aria-label': 'Clear', title: 'Clear', hidden: true }, [svgIcon('x', 'pt-icon-button-icon')]);
    const run = () => {
        clear.hidden = !input.value;
        window.clearTimeout(timer);
        timer = window.setTimeout(safe('search', () => onSearch(input.value.trim())), 150);
    };
    input.addEventListener('input', run);
    // Escape clears the text first, then lets go of the field, so the next Escape goes back.
    input.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        if (input.value) {
            input.value = '';
            run();
        } else input.blur();
    });
    clear.addEventListener('click', () => {
        input.value = '';
        run();
        input.focus();
    });
    return h('div', { class: 'pt-search-box' }, [svgIcon('search', 'pt-search-box-icon'), input, clear]);
}
