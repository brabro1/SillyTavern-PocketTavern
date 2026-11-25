// The number row (DESIGN.md → Components → Number and slider, issue #12): a label, the value pill at
// the end and a slider under them. No −/+ buttons, ever. Styles in styles/components/number.css.
//
// The value pill: tapping selects the number and opens the numeric keyboard; Enter or leaving
// commits; Escape reverts; out-of-range values snap to the limit; ↑/↓ change by one step (Shift ×10).
import { h } from '../core/dom.js';

let next = 0;

const decimals = step => (String(step).split('.')[1] ?? '').length;

/**
 * @param {object} options
 * @param {string} options.label (translated)
 * @param {number} options.value
 * @param {number} [options.min] without min and max it is just the value pill
 * @param {number} [options.max]
 * @param {number} [options.step]
 * @param {string} [options.unit] shown after the number in secondary text (translated)
 * @param {(value: number) => void} [options.onChange] after a commit or while the slider moves
 * @returns {HTMLElement & { setValue(value: number): void }}
 */
export function numberRow({ label, value, min, max, step = 1, unit, onChange }) {
    const id = `pt-number-${++next}`;
    const ranged = Number.isFinite(min) && Number.isFinite(max);
    const places = decimals(step);
    const clamp = n => (ranged ? Math.min(max, Math.max(min, n)) : n);
    const show = n => (Number.isFinite(n) ? n.toFixed(places) : '');
    let current = clamp(Number(value));

    const input = h('input', { id, class: 'pt-value-input pt-focus', type: 'text', inputmode: places ? 'decimal' : 'numeric', autocomplete: 'off', spellcheck: 'false' });
    input.value = show(current);
    const pill = h('span', { class: 'pt-value-pill' }, [input, unit ? h('span', { class: 'pt-value-unit', text: unit }) : null]);
    const slider = ranged
        ? h('input', { class: 'pt-slider pt-focus', type: 'range', min, max, step, 'aria-labelledby': `${id}-label` })
        : null;
    if (slider) slider.value = String(current);

    const paint = () => {
        input.value = show(current);
        if (!slider) return;
        slider.value = String(current);
        slider.style.setProperty('--pt-fill', `${((current - min) / (max - min || 1)) * 100}%`);
    };
    const set = (n, notify) => {
        const parsed = Number(String(n).replace(',', '.'));
        if (!Number.isFinite(parsed)) return paint();
        current = clamp(Number(parsed.toFixed(places)));
        paint();
        if (notify) onChange?.(current);
    };

    input.addEventListener('focus', () => input.select());
    input.addEventListener('change', () => set(input.value, true));
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            paint();
            input.blur();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const by = step * (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
            set(current + by, true);
            input.select();
        }
    });
    slider?.addEventListener('input', () => set(slider.value, true));

    const row = h('div', { class: `pt-number-row${ranged ? '' : ' pt-number-row--plain'}` }, [
        h('label', { class: 'pt-number-label', id: `${id}-label`, for: id, text: label }),
        pill,
        slider,
    ]);
    paint();
    /** Shows a value that changed elsewhere (SillyTavern), without calling onChange. */
    row.setValue = n => set(n, false);
    return row;
}
