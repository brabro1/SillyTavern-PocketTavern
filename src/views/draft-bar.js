// The Draft helper's result bar (DESIGN.md → The chat → Message box → Draft helper), right above the message box:
// ‹ 2/3 › (earlier results), Keep, Regenerate, Refine, Discard. While a request runs it says "Writing…" with Cancel.
// Styles in styles/views/draft.css. Every press goes to `onAction` (src/features/draft/draft.js).
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { MESSAGE_FORM, SEND_FORM } from '../st/selectors.js';
import { svgIcon } from '../ui/icons.js';

/**
 * @param {{ onAction: (action: 'prev'|'next'|'keep'|'regenerate'|'refine'|'discard'|'cancel') => void }} options
 * @returns {{ show: (at: { index: number, count: number }) => void, hide: () => void, working: (on: boolean) => void, destroy: () => void }}
 */
export function draftBar({ onAction }) {
    const pill = (action, label, icon, extra = '') => h('button', {
        type: 'button', class: `pt-draft-btn pt-focus pt-press ${extra}`, 'data-action': action, onclick: () => onAction(action),
    }, [svgIcon(icon, 'pt-draft-btn-icon'), h('span', { text: label })]);
    const prev = h('button', { type: 'button', class: 'pt-draft-nav pt-focus pt-press', 'data-action': 'prev', 'aria-label': 'Previous result', title: 'Previous result', onclick: () => onAction('prev') }, [svgIcon('chevron-left')]);
    const next = h('button', { type: 'button', class: 'pt-draft-nav pt-focus pt-press', 'data-action': 'next', 'aria-label': 'Next result', title: 'Next result', onclick: () => onAction('next') }, [svgIcon('chevron-right')]);
    const count = h('span', { class: 'pt-draft-count', 'aria-live': 'polite' });
    const nav = h('div', { class: 'pt-draft-history' }, [prev, count, next]);
    const actions = h('div', { class: 'pt-draft-actions' }, [
        nav,
        pill('keep', 'Keep', 'check', 'pt-draft-btn--keep'),
        pill('regenerate', 'Regenerate', 'refresh'),
        pill('refine', 'Refine', 'sliders'),
        pill('discard', 'Discard', 'x'),
    ]);
    const busy = h('div', { class: 'pt-draft-busy' }, [
        h('span', { class: 'pt-draft-dots', 'aria-hidden': 'true' }, [h('span'), h('span'), h('span')]),
        h('span', { class: 'pt-draft-busy-text', text: 'Writing…' }),
        pill('cancel', 'Cancel', 'stop'),
    ]);
    const el = h('div', { id: 'pt-draft-bar', class: 'pt-draft-bar', role: 'toolbar', 'aria-label': t('Draft helper'), hidden: true }, [actions, busy]);
    let showing = false;

    const place = () => {
        if (el.isConnected) return;
        const form = document.querySelector(MESSAGE_FORM);
        const row = document.querySelector(SEND_FORM);
        if (row?.parentElement) row.before(el);
        else form?.append(el);
    };
    const open = () => {
        place();
        el.hidden = false;
        // The rise starts on the next frame, after it is in the layout.
        requestAnimationFrame(() => el.classList.add('pt-draft-bar--in'));
    };

    return {
        show({ index, count: total }) {
            showing = true;
            el.classList.remove('pt-draft-bar--busy');
            nav.hidden = total < 2;
            count.textContent = `${index + 1}/${total}`;
            prev.disabled = index <= 0;
            next.disabled = index >= total - 1;
            open();
        },
        hide() {
            showing = false;
            el.classList.remove('pt-draft-bar--in', 'pt-draft-bar--busy');
            el.hidden = true;
        },
        working(on) {
            if (on) {
                el.classList.add('pt-draft-bar--busy');
                open();
            } else {
                el.classList.remove('pt-draft-bar--busy');
                if (!showing) {
                    el.classList.remove('pt-draft-bar--in');
                    el.hidden = true;
                }
            }
        },
        destroy() {
            el.remove();
        },
    };
}
