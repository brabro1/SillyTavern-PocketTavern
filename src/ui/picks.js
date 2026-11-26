// Picks: pictures with names in a row that scrolls sideways (DESIGN.md → Chats (home) → Quick picks, and
// Characters list → Favorites). Styles in styles/components/picks.css.
import { h } from '../core/dom.js';
import { safe } from '../core/lifecycle.js';
import { avatar } from './avatar.js';
import { svgIcon } from './icons.js';

/**
 * A row that scrolls sideways, made easy with a mouse too: the wheel scrolls it, it can be dragged, and on desktop
 * ‹ and › appear at its ends while there is more to see. A drag never counts as a tap on what is under it.
 * @param {HTMLElement} track the scrolling row
 * @returns {HTMLElement} the row with its ‹ › buttons
 */
export function scrollRow(track) {
    const step = () => Math.max(160, track.clientWidth * 0.8);
    const forward = () => getComputedStyle(track).direction !== 'rtl';
    const arrow = (dir, icon, label) => h('button', {
        type: 'button', class: `pt-scroll-arrow pt-scroll-arrow--${dir} pt-focus`, 'aria-label': label, title: label, tabindex: '-1',
        onclick: safe('quick picks', () => track.scrollBy({ left: (dir === 'end') === forward() ? step() : -step(), behavior: 'smooth' })),
    }, [svgIcon(icon)]);
    const wrap = h('section', { class: 'pt-scroll-row' }, [arrow('start', 'chevron-left', 'Scroll back'), track, arrow('end', 'chevron-right', 'Scroll on')]);
    const sync = () => {
        const max = track.scrollWidth - track.clientWidth;
        const at = Math.abs(track.scrollLeft);
        wrap.classList.toggle('pt-scroll-row--start', at > 4);
        wrap.classList.toggle('pt-scroll-row--end', at < max - 4);
    };
    track.addEventListener('scroll', safe('quick picks', sync), { passive: true });
    requestAnimationFrame(safe('quick picks', sync));
    // The mouse wheel scrolls the row sideways while it can still move that way.
    track.addEventListener('wheel', safe('quick picks', event => {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        if (track.scrollWidth - track.clientWidth <= 0) return;
        const before = track.scrollLeft;
        track.scrollLeft += event.deltaY;
        if (track.scrollLeft !== before) event.preventDefault();
    }), { passive: false });
    // Dragged with the mouse, like a list on a phone.
    let drag = null;
    track.addEventListener('pointerdown', safe('quick picks', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        drag = { x: event.clientX, left: track.scrollLeft, moved: false, id: event.pointerId };
    }));
    track.addEventListener('pointermove', safe('quick picks', event => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) < 6) return;
        if (!drag.moved) {
            drag.moved = true;
            track.classList.add('pt-scroll-row-dragging');
            try {
                track.setPointerCapture(event.pointerId);
            } catch {
                // The pointer is already gone.
            }
        }
        track.scrollLeft = drag.left - dx;
    }));
    const end = safe('quick picks', () => {
        if (drag?.moved) {
            // The click that follows a drag is not a tap on a pick.
            track.addEventListener('click', click => {
                click.stopPropagation();
                click.preventDefault();
            }, { capture: true, once: true });
            requestAnimationFrame(safe('quick picks', () => track.classList.remove('pt-scroll-row-dragging')));
        }
        drag = null;
    });
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    return wrap;
}

/**
 * One pick: a 56px picture and the name under it.
 * @param {object} options
 * @param {string} options.name (user data)
 * @param {string} [options.picture]
 * @param {string} options.label what tapping it does (translated)
 * @param {() => void} options.onClick
 * @param {boolean} [options.open] the chat open right now (an accent ring)
 */
export function pick({ name, picture, label, onClick, open = false }) {
    return h('button', {
        type: 'button',
        class: `pt-quick-pick pt-focus pt-press${open ? ' pt-quick-pick--open' : ''}`,
        'aria-label': label,
        title: label,
        onclick: onClick,
    }, [avatar({ name, src: picture, size: 56 }), h('span', { class: 'pt-quick-pick-name', raw: name, dir: 'auto' })]);
}

/**
 * The row of picks, with its ‹ › on desktop.
 * @param {HTMLElement[]} picks
 * @param {string} label the row's name for screen readers (translated)
 */
export function pickRow(picks, label) {
    return scrollRow(h('div', { class: 'pt-quick-picks', 'aria-label': label }, picks));
}
