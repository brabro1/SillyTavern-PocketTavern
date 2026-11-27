// Notifications (SillyTavern's toasts, restyled; DESIGN.md → Feedback → Toast): on a phone, swipe one sideways to
// dismiss it, the way SillyTavern's own close does.
import { TOASTS } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'toast-swipe';

/** @type {{ active: () => boolean, settings: () => object, $j: () => any } | null} */
let deps = null;

export function setupToastSwipe(supplied) {
    deps = supplied;
}

const toastSwipe = { el: null, x: 0, dx: 0 };

export function onToastTouchStart(event) {
    if (!deps.active() || !deps.settings().niceToasts) return;
    const toast = event.target.closest?.(`${TOASTS} > .toast`);
    if (!toast || event.touches.length !== 1) return;
    toastSwipe.el = toast;
    toastSwipe.x = event.touches[0].clientX;
    toastSwipe.dx = 0;
    toast.style.transition = 'none';
}

export function onToastTouchMove(event) {
    const toast = toastSwipe.el;
    if (!toast) return;
    toastSwipe.dx = event.touches[0].clientX - toastSwipe.x;
    toast.style.transform = `translateX(${toastSwipe.dx}px)`;
    toast.style.opacity = String(Math.max(0.2, 1 - Math.abs(toastSwipe.dx) / 260));
}

export function onToastTouchEnd() {
    const toast = toastSwipe.el;
    if (!toast) return;
    toastSwipe.el = null;
    toast.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
    if (Math.abs(toastSwipe.dx) > 80) {
        toast.style.transform = `translateX(${toastSwipe.dx > 0 ? 120 : -120}%)`;
        toast.style.opacity = '0';
        setTimeout(safe(SOURCE, () => {
            const toastr = globalThis.toastr;
            if (toastr?.clear) toastr.clear(deps.$j()(toast), { force: true });
            else toast.remove();
        }), 200);
    } else {
        toast.style.transform = '';
        toast.style.opacity = '';
    }
}
