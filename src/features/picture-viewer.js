// The picture viewer (Settings → Pocket Tavern → Picture viewer): tapping an avatar in the chat opens its full picture
// in a dialog of its own, with pinch and wheel zoom, drag, rotate and download; a swipe down or Back closes it.
import { h } from '../core/dom.js';
import { t, currentLang } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { syncToasts } from '../shell/overlay.js';
import { CHAT } from '../st/selectors.js';

const SOURCE = 'picture viewer';

/**
 * @type {{ active: () => boolean, settings: () => object, buzz: (ms: number) => void, ui: Function, icon: Function, scheduleHistorySync: () => void, motionAllowed: () => boolean } | null}
 */
let deps = null;

export function setupPictureViewer(supplied) {
    deps = supplied;
}

const ui = (...args) => deps.ui(...args);
const icon = (...args) => deps.icon(...args);

/** A viewer is open (Back closes it first). */
export function viewerOpen() {
    return !!viewer;
}

let viewer = null;

/** The full-size picture behind a chat thumbnail, where SillyTavern serves one. */
function fullImageUrl(thumb) {
    try {
        const url = new URL(thumb, location.href);
        if (url.pathname.endsWith('/thumbnail')) {
            const file = url.searchParams.get('file');
            const type = url.searchParams.get('type');
            if (file && type === 'avatar') return `/characters/${encodeURIComponent(file)}`;
            if (file && type === 'persona') return `/User Avatars/${encodeURIComponent(file)}`;
        }
    } catch {
        // Not a URL we understand; use it as is.
    }
    return thumb;
}

export function onAvatarClick(event) {
    if (!deps.active() || !deps.settings().imageViewer) return;
    const avatar = event.target.closest?.(`${CHAT} .mes .avatar`);
    const img = avatar?.querySelector('img');
    if (!img?.getAttribute('src')) return;
    // Stop SillyTavern's small floating window from opening as well.
    event.preventDefault();
    event.stopImmediatePropagation();
    deps.buzz(8);
    const message = avatar.closest('.mes');
    const shown = img.getAttribute('src');
    // Sharp pictures put a small scaled copy (a blob: URL) in the avatar; the
    // thumbnail SillyTavern asked for still tells us which original to open.
    const source = shown.startsWith('blob:') && img.dataset.ptThumb ? img.dataset.ptThumb : shown;
    openViewer({
        thumb: shown,
        full: fullImageUrl(source),
        title: message?.getAttribute('ch_name') || 'Picture',
    });
}

class Viewer {
    constructor({ thumb, full, title }) {
        this.full = full;
        this.title = title;
        this.closing = false;
        this.state = { scale: 1, x: 0, y: 0, rot: 0 };
        this.pointers = new Map();
        this.lastTap = { t: 0, x: 0, y: 0 };
        this.tapTimer = 0;

        this.img = h('img', { class: 'pt-viewer-img', alt: title, draggable: 'false', src: thumb });
        if (full && full !== thumb) {
            const loader = new Image();
            loader.onload = () => {
                if (!this.closing) this.img.src = full;
            };
            loader.src = full;
        }
        const button = (iconName, label, onclick, extra = '') => h('button', {
            type: 'button', class: `pt-viewer-btn ${extra}`, 'aria-label': label, title: label, onclick,
        }, [ui(iconName)]);
        this.zoomButton = button('zoom-in', 'Zoom in', () => this.toggleZoom());
        this.stage = h('div', { class: 'pt-viewer-stage' }, [this.img]);
        this.dialog = h('dialog', { class: 'pt-viewer', 'aria-label': title, lang: currentLang() }, [
            h('div', { class: 'pt-viewer-top' }, [
                h('span', { class: 'pt-viewer-title', raw: title }),
                button('x', 'Close', () => closeViewer(), 'pt-viewer-close'),
            ]),
            this.stage,
            h('div', { class: 'pt-viewer-bar' }, [
                this.zoomButton,
                button('rotate-cw', 'Rotate', () => this.rotate()),
                button('external', 'Open full size', () => window.open(this.full, '_blank', 'noopener')),
                button('download', 'Save picture', () => this.download()),
            ]),
        ]);
        shieldFromDrawerAutoClose(this.dialog);
        this.dialog.addEventListener('cancel', safe(SOURCE, event => {
            event.preventDefault();
            closeViewer();
        }));
        this.stage.addEventListener('pointerdown', safe(SOURCE, event => this.down(event)));
        this.stage.addEventListener('pointermove', safe(SOURCE, event => this.move(event)));
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) this.stage.addEventListener(type, safe(SOURCE, event => this.up(event)));
        this.stage.addEventListener('wheel', safe(SOURCE, event => {
            event.preventDefault();
            this.zoomAt(this.state.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
        }), { passive: false });
    }

    center() {
        const rect = this.stage.getBoundingClientRect();
        return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    }

    apply(animate = false) {
        const { scale, x, y, rot } = this.state;
        // With Reduce motion (Pocket Tavern's or the system's) the picture jumps instead of gliding.
        this.img.style.transition = animate && deps.motionAllowed() ? 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
        this.img.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}deg)`;
        this.dialog.classList.toggle('pt-viewer-zoomed', scale > 1.01);
        const icon = scale > 1.01 ? 'zoom-out' : 'zoom-in';
        if (this.zoomButton.dataset.icon !== icon) {
            this.zoomButton.dataset.icon = icon;
            this.zoomButton.replaceChildren(ui(icon));
            const label = t(scale > 1.01 ? 'Zoom out' : 'Zoom in');
            this.zoomButton.setAttribute('aria-label', label);
            this.zoomButton.setAttribute('title', label);
        }
    }

    /** Keeps the picture from being dragged off screen. */
    clamp() {
        const { scale, rot } = this.state;
        const sideways = Math.abs(rot) % 180 === 90;
        const width = (sideways ? this.img.offsetHeight : this.img.offsetWidth) * scale;
        const height = (sideways ? this.img.offsetWidth : this.img.offsetHeight) * scale;
        const rect = this.stage.getBoundingClientRect();
        const maxX = Math.max(0, (width - rect.width) / 2);
        const maxY = Math.max(0, (height - rect.height) / 2);
        this.state.x = Math.min(maxX, Math.max(-maxX, this.state.x));
        this.state.y = Math.min(maxY, Math.max(-maxY, this.state.y));
    }

    zoomAt(next, px, py, animate = false) {
        const scale = Math.min(6, Math.max(1, next));
        const { cx, cy } = this.center();
        // Keep the point under the finger in place while the scale changes.
        const qx = (px - cx - this.state.x) / this.state.scale;
        const qy = (py - cy - this.state.y) / this.state.scale;
        this.state.x = px - cx - scale * qx;
        this.state.y = py - cy - scale * qy;
        this.state.scale = scale;
        if (scale === 1) {
            this.state.x = 0;
            this.state.y = 0;
        }
        this.clamp();
        this.apply(animate);
    }

    toggleZoom(px, py) {
        const { cx, cy } = this.center();
        if (this.state.scale > 1.01) this.zoomAt(1, cx, cy, true);
        else this.zoomAt(2.5, px ?? cx, py ?? cy, true);
    }

    rotate() {
        this.state.rot += 90;
        this.state.scale = 1;
        this.state.x = 0;
        this.state.y = 0;
        this.apply(true);
    }

    download() {
        const extMatch = String(this.full ?? '').split('?')[0].match(/\.(png|jpe?g|webp|gif|avif)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
        const name = `${this.title.replace(/[\\/:*?"<>|]+/g, '_') || 'picture'}.${ext}`;
        const link = h('a', { href: this.full, download: name });
        document.body.append(link);
        link.click();
        link.remove();
    }

    down(event) {
        try {
            this.stage.setPointerCapture?.(event.pointerId);
        } catch {
            // The pointer is already gone; carry on without capture.
        }
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.moved = false;
        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.state.scale };
        } else if (this.pointers.size === 1) {
            this.drag = { x: event.clientX, y: event.clientY, sx: this.state.x, sy: this.state.y };
            this.dismissY = 0;
        }
    }

    move(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 2 && this.pinch) {
            const [a, b] = [...this.pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            this.moved = true;
            if (this.pinch.dist > 0) this.zoomAt(this.pinch.scale * (dist / this.pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
            return;
        }
        if (this.pointers.size !== 1 || !this.drag) return;
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this.moved = true;
        if (this.state.scale > 1.01) {
            this.state.x = this.drag.sx + dx;
            this.state.y = this.drag.sy + dy;
            this.clamp();
            this.apply();
        } else if (dy > 0) {
            // Pull down to close, like a photo app.
            this.dismissY = dy;
            this.img.style.transition = 'none';
            this.img.style.transform = `translate(0, ${dy}px) scale(${1 - Math.min(dy, 300) / 1500}) rotate(${this.state.rot}deg)`;
            this.dialog.style.setProperty('--pt-viewer-fade', String(Math.max(0, 1 - dy / 350)));
        }
    }

    up(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.delete(event.pointerId);
        if (this.pointers.size < 2) this.pinch = null;
        if (this.pointers.size === 1) {
            // Re-anchor pan to the remaining finger so lifting one finger never snaps the image.
            const [remaining] = this.pointers.values();
            this.drag = { x: remaining.x, y: remaining.y, sx: this.state.x, sy: this.state.y };
            return;
        }
        if (this.pointers.size) return;
        this.drag = null;
        if (this.dismissY > 110) {
            closeViewer();
            return;
        }
        if (this.dismissY) {
            this.dismissY = 0;
            this.dialog.style.removeProperty('--pt-viewer-fade');
            this.apply(true);
            return;
        }
        if (this.moved || event.type !== 'pointerup') return;
        // Double tap zooms in on that spot; a single tap shows or hides the buttons.
        const now = Date.now();
        const near = Math.hypot(event.clientX - this.lastTap.x, event.clientY - this.lastTap.y) < 30;
        if (now - this.lastTap.t < 300 && near) {
            window.clearTimeout(this.tapTimer);
            this.lastTap.t = 0;
            this.toggleZoom(event.clientX, event.clientY);
            return;
        }
        this.lastTap = { t: now, x: event.clientX, y: event.clientY };
        this.tapTimer = window.setTimeout(safe(SOURCE, () => this.dialog.classList.toggle('pt-viewer-bare')), 300);
    }
}

function openViewer(options) {
    const previousFocus = viewer ? viewer.returnFocus : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeViewer(true);
    viewer = new Viewer(options);
    viewer.returnFocus = previousFocus;
    document.body.append(viewer.dialog);
    viewer.dialog.showModal();
    syncToasts();
    requestAnimationFrame(safe(SOURCE, () => viewer?.dialog.classList.add('pt-viewer-open')));
    deps.scheduleHistorySync();
}

export function closeViewer(immediate = false) {
    const current = viewer;
    if (!current || current.closing) return;
    current.closing = true;
    viewer = null;
    window.clearTimeout(current.tapTimer);
    const finish = () => {
        if (current.dialog.open) current.dialog.close();
        // Before removing it: the toast container may be inside and must go back to the page.
        syncToasts();
        current.dialog.remove();
        if (!immediate && !viewer && current.returnFocus?.isConnected && document.activeElement === document.body) {
            current.returnFocus.focus({ preventScroll: true });
        }
    };
    if (immediate) finish();
    else {
        current.dialog.style.pointerEvents = 'none';
        // New toasts during the fade-out go to the page, not into a dialog about to be removed.
        current.dialog.setAttribute('closing', '');
        syncToasts();
        current.dialog.classList.remove('pt-viewer-open');
        setTimeout(safe(SOURCE, finish), 220);
    }
    deps.scheduleHistorySync();
}
