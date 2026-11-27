// Desktop: SillyTavern's floating tool panels (Author's Note, CFG, token probabilities, extension pop-outs) dock in a
// column right of the chat, which moves over to make room. SillyTavern drew them in the top-left corner, under the
// top bar and the rail. With SillyTavern's MovingUI on they stay where you put them.
import { TOOL_PANEL_CLOSE, TOOL_PANEL_HOLDER, TOOL_PANELS } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'tool panels';

/** @type {{ active: () => boolean, settings: () => object } | null} */
let deps = null;

export function setupToolPanels(supplied) {
    deps = supplied;
}

const tools = { observer: null, frame: 0, watched: new WeakSet() };

function dockedToolPanels() {
    if (document.body.classList.contains('movingUI')) return [];
    return [...document.querySelectorAll(TOOL_PANELS)]
        .filter(panel => !panel.classList.contains('maximized') && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none');
}

function layoutToolPanels() {
    tools.frame = 0;
    const open = deps.active() && deps.settings().appShell ? dockedToolPanels() : [];
    const openSet = new Set(open);
    document.documentElement.classList.toggle('pt-tools-open', open.length > 0);
    // Two or more share the column, one above the other. Clear stale properties on closed panels.
    for (const panel of document.querySelectorAll(TOOL_PANELS)) {
        if (!openSet.has(panel)) {
            panel.style.removeProperty('--pt-tool-i');
            panel.style.removeProperty('--pt-tool-n');
        }
    }
    open.forEach((panel, index) => {
        if (panel.style.getPropertyValue('--pt-tool-i') !== String(index)) panel.style.setProperty('--pt-tool-i', String(index));
        if (panel.style.getPropertyValue('--pt-tool-n') !== String(open.length)) panel.style.setProperty('--pt-tool-n', String(open.length));
    });
}

function watchToolPanel(panel) {
    if (tools.watched.has(panel)) return;
    tools.watched.add(panel);
    tools.observer.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
}

export function syncToolPanels() {
    const holder = document.querySelector(TOOL_PANEL_HOLDER);
    if (!deps.active() || !deps.settings().appShell || !holder) {
        cancelAnimationFrame(tools.frame);
        tools.frame = 0;
        tools.observer?.disconnect();
        tools.observer = null;
        tools.watched = new WeakSet();
        document.documentElement.classList.remove('pt-tools-open');
        document.querySelectorAll(TOOL_PANELS).forEach(panel => {
            panel.style.removeProperty('--pt-tool-i');
            panel.style.removeProperty('--pt-tool-n');
        });
        return;
    }
    if (!tools.observer) {
        tools.observer = new MutationObserver(safe(SOURCE, records => {
            for (const record of records) {
                for (const node of record.addedNodes ?? []) if (node.parentElement === holder && node.nodeType === 1) watchToolPanel(node);
            }
            if (!tools.frame) tools.frame = requestAnimationFrame(safe(SOURCE, layoutToolPanels));
        }));
        tools.observer.observe(holder, { childList: true });
        tools.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        [...holder.children].forEach(watchToolPanel);
    }
    layoutToolPanels();
}

/** Closes the newest docked tool panel the way its own × does. */
export function closeToolPanel() {
    const panel = dockedToolPanels().pop();
    if (!panel) return false;
    const close = panel.querySelector(TOOL_PANEL_CLOSE);
    if (close) close.click();
    else panel.style.display = 'none';
    return true;
}
