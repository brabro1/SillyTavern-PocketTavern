// "Can't reach SillyTavern" (Settings → Pocket Tavern → Server watch): a quiet ping every 30 seconds, every 3 while
// the server is down, and a banner that says so, with Retry; "Back online" when it answers again.
import { safe } from '../core/lifecycle.js';
import { IS_IOS } from '../shell/layout.js';
import { hideBanner, showBanner } from '../shell/banners.js';

const SOURCE = 'server watch';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, isWide: () => boolean, buzz: (ms: number) => void } | null} */
let deps = null;

export function setupServerWatch(supplied) {
    deps = supplied;
}

const server = { down: false, timer: 0, busy: false };

async function serverReachable() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 5000) : 0;
    try {
        // Any answer at all means the server is up; only a network failure or timeout counts.
        await fetch('/api/ping', { method: 'POST', headers: deps.context().getRequestHeaders?.() ?? {}, cache: 'no-store', signal: controller?.signal });
        return true;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timeout);
    }
}

export function scheduleServerCheck(delay) {
    window.clearTimeout(server.timer);
    if (!deps.active() || !deps.settings().serverWatch) return;
    server.timer = window.setTimeout(safe(SOURCE, checkServer), delay);
}

async function checkServer() {
    if (!deps.active() || !deps.settings().serverWatch || server.busy) return;
    if (document.visibilityState !== 'visible') {
        scheduleServerCheck(30000);
        return;
    }
    server.busy = true;
    const up = await serverReachable();
    server.busy = false;
    if (!deps.active() || !deps.settings().serverWatch) return;
    if (!up && !server.down) {
        server.down = true;
        showServerBanner();
    } else if (up && server.down) {
        server.down = false;
        showServerBanner(true);
    }
    // Check often while it is down, rarely while all is well.
    scheduleServerCheck(server.down ? 3000 : 30000);
}

function showServerBanner(back = false) {
    if (!deps.active() || !deps.settings().serverWatch) return;
    if (back) {
        showBanner('server', { status: 'ok', text: 'Back online', hideAfter: 2200 });
        return;
    }
    showBanner('server', {
        status: 'danger',
        text: !deps.isWide() && !IS_IOS ? "Can't reach SillyTavern. Is Termux still running?" : "Can't reach SillyTavern. Is it still running?",
        action: { label: 'Retry', onClick: () => { deps.buzz(8); checkServer(); } },
    });
}

export function syncServerWatch() {
    if (deps.active() && deps.settings().serverWatch) scheduleServerCheck(server.down ? 1000 : 5000);
    else {
        window.clearTimeout(server.timer);
        server.down = false;
        hideBanner('server');
    }
}
