// Desktop: drag the panel's edge to make it wider (DESIGN.md → Layouts → Desktop). The width is kept per place,
// between a minimum and what leaves the chat room; a double click puts it back.
import { h } from '../core/dom.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { OPEN_PAGE } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'panel-edge';

/** @type {{ active: () => boolean, settings: () => object } | null} */
let deps = null;

export function setupPanelEdge(supplied) {
    deps = supplied;
}

const PANEL_WIDTH_KEY = 'pt_panel_w';
const PANEL_MIN = 360;
/** How far past the widest width the edge must be dragged before the panel snaps to the full width. */
const PANEL_SNAP = 60;
let panelEdge = null;
let panelEdgeFrame = 0;

function savedPanelWidth() {
    try {
        return Number(localStorage.getItem(PANEL_WIDTH_KEY)) || 0;
    } catch {
        return 0;
    }
}

/** The stylesheet keeps it between 360px and what leaves the chat 480px. */
function applyPanelWidth(width) {
    const root = document.documentElement;
    if (width) root.style.setProperty('--pt-panel-saved', `${Math.round(width)}px`);
    else root.style.removeProperty('--pt-panel-saved');
    root.classList.toggle('pt-panel-sized', !!width);
    // Dragged well past what leaves the chat 420px: the panel takes the whole width (issue #13).
    const most = panelMostWidth();
    root.classList.toggle('pt-panel-full', !!width && width > most + PANEL_SNAP);
    if (panelEdge) {
        panelEdge.setAttribute('aria-valuemax', String(Math.round(most + PANEL_SNAP + 1)));
        panelEdge.setAttribute('aria-valuenow', String(Math.round(width || panelWidthNow() || PANEL_MIN)));
    }
}

/** The widest the panel gets while the chat keeps 420px beside it. */
function panelMostWidth() {
    const rail = document.getElementById('pt-tabbar')?.getBoundingClientRect().right ?? 88;
    const right = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pt-right')) || 0;
    return Math.max(PANEL_MIN, window.innerWidth - rail - right - 420);
}

function storePanelWidth(width) {
    try {
        if (width) localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width)));
        else localStorage.removeItem(PANEL_WIDTH_KEY);
    } catch { /* private mode: the width lasts until reload */ }
}

/** The panel's current width as drawn (the stylesheet clamps the saved one). */
function panelWidthNow() {
    const panel = document.getElementById('pt-page') || document.querySelector(OPEN_PAGE);
    return panel ? panel.getBoundingClientRect().width : 0;
}

let onResize = null;

export function syncPanelEdge() {
    const want = deps.active() && deps.settings().appShell;
    if (!want) {
        cancelAnimationFrame(panelEdgeFrame);
        panelEdgeFrame = 0;
        if (onResize) {
            window.removeEventListener('resize', onResize);
            onResize = null;
        }
        panelEdge?.remove();
        panelEdge = null;
        applyPanelWidth(0);
        document.documentElement.classList.remove('pt-resizing');
        return;
    }
    applyPanelWidth(savedPanelWidth());
    if (panelEdge) return;
    onResize = safe(SOURCE, () => {
        if (deps.active() && panelEdge) applyPanelWidth(savedPanelWidth());
    });
    window.addEventListener('resize', onResize);
    panelEdge = h('div', {
        id: 'pt-panel-edge',
        class: 'pt-panel-edge',
        role: 'separator',
        'aria-orientation': 'vertical',
        'aria-label': 'Panel width',
        'aria-valuemin': String(PANEL_MIN),
        'aria-valuemax': String(Math.round(panelMostWidth() + PANEL_SNAP + 1)),
        'aria-valuenow': String(Math.round(savedPanelWidth() || PANEL_MIN)),
        title: 'Drag to change the width. Double-click to reset.',
        tabindex: '0',
        'data-pt': '1',
    });
    shieldFromDrawerAutoClose(panelEdge);
    let dragX = 0;
    // Where on the edge it was grabbed, so the edge stays under the pointer instead of jumping to it.
    let grab = 0;
    let moved = false;
    const railRight = () => document.getElementById('pt-tabbar')?.getBoundingClientRect().right ?? 88;
    const dragged = () => Math.max(PANEL_MIN, dragX - grab - railRight());
    const onMove = event => {
        dragX = event.clientX;
        moved = true;
        if (panelEdgeFrame) return;
        panelEdgeFrame = requestAnimationFrame(safe(SOURCE, () => {
            panelEdgeFrame = 0;
            if (deps.active() && panelEdge) applyPanelWidth(dragged());
        }));
    };
    const onUp = event => {
        try {
            panelEdge?.releasePointerCapture?.(event.pointerId);
        } catch {
            // Capture was already released (e.g. pointercancel).
        }
        panelEdge?.removeEventListener('pointermove', onMove);
        panelEdge?.removeEventListener('pointerup', onUp);
        panelEdge?.removeEventListener('pointercancel', onUp);
        cancelAnimationFrame(panelEdgeFrame);
        panelEdgeFrame = 0;
        document.documentElement.classList.remove('pt-resizing');
        // A click without a drag (half of a double-click) changes nothing.
        if (!moved || !deps.active()) return;
        applyPanelWidth(dragged());
        // Keep what is drawn, so a width past the limit does not linger unseen.
        const width = Math.round(panelWidthNow() || dragged());
        applyPanelWidth(width);
        storePanelWidth(width);
    };
    panelEdge.addEventListener('pointerdown', safe(SOURCE, event => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragX = event.clientX;
        moved = false;
        grab = event.clientX - railRight() - (panelWidthNow() || PANEL_MIN);
        try {
            panelEdge.setPointerCapture?.(event.pointerId);
        } catch {
            // Carry on without capture.
        }
        document.documentElement.classList.add('pt-resizing');
        panelEdge.addEventListener('pointermove', onMove);
        panelEdge.addEventListener('pointerup', onUp);
        panelEdge.addEventListener('pointercancel', onUp);
    }));
    panelEdge.addEventListener('dblclick', safe(SOURCE, () => {
        applyPanelWidth(0);
        storePanelWidth(0);
    }));
    panelEdge.addEventListener('keydown', safe(SOURCE, event => {
        const step = event.shiftKey ? 64 : 16;
        let width = 0;
        if (event.key === 'ArrowRight') width = panelWidthNow() + step;
        else if (event.key === 'ArrowLeft') width = panelWidthNow() - step;
        else if (event.key === 'Home') width = -1;
        else return;
        event.preventDefault();
        if (width < 0) {
            applyPanelWidth(0);
            storePanelWidth(0);
            return;
        }
        applyPanelWidth(Math.max(PANEL_MIN, width));
        const drawn = Math.round(panelWidthNow() || Math.max(PANEL_MIN, width));
        applyPanelWidth(drawn);
        storePanelWidth(drawn);
    }));
    document.body.append(panelEdge);
}
