// Keep the screen on while a reply streams in (Settings → Pocket Tavern → Keep the screen on): a screen wake lock,
// let go when the reply ends, the tab is left, or after 10 minutes at most.
import { safe } from '../core/lifecycle.js';

const SOURCE = 'keep awake';

/** @type {{ active: () => boolean, settings: () => object, generating: () => boolean } | null} */
let deps = null;

export function setupKeepAwake(supplied) {
    deps = supplied;
}

const wake = { lock: null, pending: false, timer: 0 };

export async function setAwake(on) {
    window.clearTimeout(wake.timer);
    if (!on) {
        wake.pending = false;
        const lock = wake.lock;
        wake.lock = null;
        lock?.release?.().catch(() => {});
        return;
    }
    if (!deps.active() || !deps.settings().keepAwake || wake.lock || wake.pending || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    wake.pending = true;
    try {
        const lock = await navigator.wakeLock.request('screen');
        wake.pending = false;
        if (!deps.active() || !deps.settings().keepAwake || !deps.generating() || document.visibilityState !== 'visible') {
            lock?.release?.().catch(() => {});
            return;
        }
        wake.lock = lock;
        lock.addEventListener('release', safe(SOURCE, () => {
            if (wake.lock === lock) wake.lock = null;
        }));
        // Never hold the screen on forever if an end event goes missing.
        wake.timer = window.setTimeout(safe(SOURCE, () => setAwake(false)), 10 * 60 * 1000);
    } catch {
        wake.pending = false;
        // Not allowed (battery saver, insecure page): just skip it.
    }
}

export function onVisibility() {
    // Android drops the lock when you leave the tab; take it back on return.
    if (document.visibilityState === 'visible' && deps.generating()) setAwake(true);
}
