// Sheets and dialogs (DESIGN.md → Components → Overlays): their header, the ways to close them, and
// fitting them to the part of the screen you can see. Styles in styles/components/overlay.css.
// Which sheet is open is still kept by the legacy app (showSheet / closeSheet) until its callers move.
import { h } from '../core/dom.js';
import { currentLang, isRtl } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { button, iconButton } from '../ui/button.js';

/**
 * The header of a sheet, dialog or full-screen editor: title and an optional subtitle at the start,
 * ✕ at the end, and a primary Save pill just before ✕ when the thing needs saving. On a phone a
 * drag handle sits above it. The title is a div with role="heading" (SillyTavern styles h1–h3).
 * @param {object} options
 * @param {string} options.title (translated)
 * @param {string} [options.subtitle] (translated)
 * @param {() => void} options.onClose
 * @param {{ label?: string, onClick: () => void }} [options.save]
 * @returns {{ head: HTMLElement, title: HTMLElement, subtitle: HTMLElement, text: HTMLElement }}
 */
export function overlayHead({ title, subtitle, onClose, save }) {
    const titleEl = h('div', { class: 'pt-overlay-title', role: 'heading', 'aria-level': '2', text: title });
    const subtitleEl = h('div', { class: 'pt-overlay-subtitle', text: subtitle ?? '' });
    const text = h('div', { class: 'pt-overlay-text' }, [titleEl, subtitleEl]);
    const close = iconButton({ icon: 'x', label: 'Close', onClick: () => onClose() });
    close.classList.add('pt-overlay-close');
    const saveButton = save ? button({ label: save.label ?? 'Save', kind: 'primary', onClick: save.onClick }) : null;
    saveButton?.classList.add('pt-overlay-save');
    const head = h('div', { class: 'pt-overlay-head' }, [
        h('div', { class: 'pt-overlay-grab', 'aria-hidden': 'true' }),
        h('div', { class: 'pt-overlay-row' }, [text, saveButton, close]),
    ]);
    // Its own direction: the legacy sheets are not marked right-to-left themselves (they mirror with CSS).
    head.lang = currentLang();
    if (isRtl()) head.dir = 'rtl';
    return { head, title: titleEl, subtitle: subtitleEl, text };
}

/**
 * Every way out of a sheet or dialog: tapping the scrim, Escape (the dialog's cancel), and on a phone
 * dragging the sheet down from its header, or from its contents when they are scrolled to the top.
 * A quick flick closes too. All of them call `onClose`.
 * @param {object} options
 * @param {HTMLDialogElement} options.dialog
 * @param {HTMLElement} options.panel the part that moves
 * @param {HTMLElement[]} options.dragAreas the header, and the scrolling contents
 * @param {() => void} options.onClose
 */
export function wireOverlay({ dialog, panel, dragAreas, onClose }) {
    dialog.addEventListener('click', safe('a sheet', event => {
        if (event.target === dialog) onClose();
    }));
    shieldFromDrawerAutoClose(dialog);
    dialog.addEventListener('cancel', safe('a sheet', event => {
        event.preventDefault();
        onClose();
    }));

    // The sheet is its own layer while dragging and moves once per frame; nothing else changes
    // meanwhile. The listeners never block the browser's own scrolling.
    let startY = null;
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let dy = 0;
    let dragging = false;
    let frame = 0;
    const paint = safe('a sheet', () => {
        frame = 0;
        panel.style.transform = `translate3d(0, ${dy}px, 0)`;
    });
    const begin = event => {
        // Only bottom sheets on phones drag to close; centred desktop dialogs stay put.
        if (document.documentElement.classList.contains('pt-desktop') || event.touches.length !== 1
            || event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        startY = lastY = event.touches[0].clientY;
        lastT = event.timeStamp;
        speed = 0;
        dy = 0;
        dragging = false;
    };
    const move = event => {
        if (startY === null) return;
        const y = event.touches[0].clientY;
        if (!dragging) {
            // From the contents, only a downward pull at the very top drags; anything else scrolls.
            const body = dragAreas[0] === event.currentTarget ? null : event.currentTarget;
            if (y - startY < 6 || (body && body.scrollTop > 0)) {
                if (body && (y - startY < -6 || body.scrollTop > 0)) startY = null;
                return;
            }
            dragging = true;
            startY = y;
            panel.style.transition = 'none';
            panel.style.willChange = 'transform';
        }
        const dt = Math.max(1, event.timeStamp - lastT);
        speed = (y - lastY) / dt;
        lastY = y;
        lastT = event.timeStamp;
        dy = Math.max(0, y - startY);
        if (!frame) frame = requestAnimationFrame(paint);
    };
    const end = () => {
        if (startY === null) return;
        startY = null;
        if (!dragging) return;
        dragging = false;
        cancelAnimationFrame(frame);
        frame = 0;
        // A drag that started on a row must not also press it, but a short cancelled drag must not
        // swallow the next real tap.
        const swallow = click => {
            click.preventDefault();
            click.stopPropagation();
        };
        const disarm = () => dialog.removeEventListener('click', swallow, { capture: true });
        dialog.addEventListener('click', swallow, { capture: true, once: true });
        dialog.addEventListener('touchstart', disarm, { capture: true, once: true, passive: true });
        setTimeout(disarm, 250);
        panel.style.transition = '';
        panel.style.willChange = '';
        // Pulled far enough, or flicked down: keep going from where the finger let go.
        if (dy > 90 || speed > 0.55) {
            panel.style.transform = 'translateY(100%)';
            onClose();
        } else panel.style.transform = '';
    };
    for (const area of dragAreas.filter(Boolean)) {
        area.addEventListener('touchstart', safe('a sheet', begin), { passive: true });
        area.addEventListener('touchmove', safe('a sheet', move), { passive: true });
        area.addEventListener('touchend', safe('a sheet', end));
        area.addEventListener('touchcancel', safe('a sheet', end));
    }
}

/**
 * Sizes an open sheet to the part of the screen above the keyboard. The values go on the sheet
 * itself: on <html> they restyled the whole page on every frame of the keyboard's slide.
 * @param {HTMLDialogElement | null | undefined} dialog
 * @param {number} compactBelow below this visible height the sheet drops its handle and subtitle
 */
export function fitToViewport(dialog, compactBelow) {
    const vv = window.visualViewport;
    if (!vv || !dialog) return;
    const height = `${Math.round(vv.height)}px`;
    const top = `${Math.round(vv.offsetTop)}px`;
    if (dialog.style.getPropertyValue('--pt-vv-height') !== height) dialog.style.setProperty('--pt-vv-height', height);
    if (dialog.style.getPropertyValue('--pt-vv-top') !== top) dialog.style.setProperty('--pt-vv-top', top);
    dialog.classList.toggle('pt-compact', vv.height < compactBelow);
}

/**
 * On desktop a menu is a popover anchored to its trigger (DESIGN.md → Layouts): the sheet's panel is
 * placed beside the button, opening above it when the button sits in the lower half of the window and
 * below it otherwise, its end edge lined up with the button's. Positions come from the button's
 * measured box, so they are physical (left/top) and already right for right-to-left pages.
 * @param {HTMLDialogElement} dialog the sheet
 * @param {Element} anchor the button that opened it
 * @param {number} [width] the popover's width in px
 */
export function placePopover(dialog, anchor, width = 360) {
    const box = anchor.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const size = Math.min(width, viewWidth - margin * 2);
    const end = isRtl() ? box.left : box.right - size;
    const left = Math.max(margin, Math.min(end, viewWidth - size - margin));
    const above = box.top + box.height / 2 > viewHeight / 2;
    dialog.classList.add('pt-popover');
    // It grows from the corner nearest its button.
    const endSide = isRtl() ? 'left' : 'right';
    dialog.style.setProperty('--pt-pop-origin', `${above ? 'bottom' : 'top'} ${endSide}`);
    dialog.style.setProperty('--pt-pop-shift', above ? '6px' : '-6px');
    dialog.style.setProperty('--pt-pop-left', `${Math.round(left)}px`);
    dialog.style.setProperty('--pt-pop-width', `${Math.round(size)}px`);
    if (above) {
        dialog.style.setProperty('--pt-pop-bottom', `${Math.round(viewHeight - box.top + gap)}px`);
        dialog.style.setProperty('--pt-pop-max', `${Math.round(box.top - gap - margin)}px`);
    } else {
        dialog.style.setProperty('--pt-pop-top', `${Math.round(box.bottom + gap)}px`);
        dialog.style.setProperty('--pt-pop-max', `${Math.round(viewHeight - box.bottom - gap - margin)}px`);
    }
}

/** Keeps the open sheet fitted while the visible screen changes. Returns the stop function. */
export function followViewport(getDialog, compactBelow) {
    const vv = window.visualViewport;
    if (!vv) return null;
    let frame = 0;
    const fit = safe('fitting a sheet', () => {
        frame = 0;
        fitToViewport(getDialog(), compactBelow);
    });
    const apply = () => {
        if (frame || !getDialog()) return;
        frame = requestAnimationFrame(fit);
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
        cancelAnimationFrame(frame);
    };
}

/**
 * Toasts in the top layer: a sheet is a modal dialog, which draws over everything, so SillyTavern's
 * toasts would sit under it. SillyTavern's own helper moves the toast container into the newest open
 * dialog and back once none is open. Loaded lazily, so a missing or renamed helper leaves toasts as
 * they were instead of breaking anything.
 */
let fixToasts = null;
import(new URL('../../../popup.js', new URL('../../', import.meta.url)).href)
    .then(module => { fixToasts = typeof module.fixToastrForDialogs === 'function' ? module.fixToastrForDialogs : null; })
    .catch(() => { fixToasts = null; });

export function syncToasts() {
    try {
        fixToasts?.();
    } catch {
        // Toasts keep showing where they were.
    }
}
