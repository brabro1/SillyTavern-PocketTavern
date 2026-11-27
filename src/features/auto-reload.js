// Reload by itself after an update (Settings → Pocket Tavern → Reload after an update).
import { safe } from '../core/lifecycle.js';
import { t } from '../core/i18n.js';
import { isTypingField } from '../shell/layout.js';
import { promptEditorDirty } from '../st/ai.js';
import { MESSAGE_BOX } from '../st/selectors.js';

const SOURCE = 'auto reload';

/**
 * @type {{ settings: () => object, context: () => any, sheetOpen: () => boolean, generating: () => boolean, editorOpen: () => boolean } | null}
 */
let deps = null;

export function setupAutoReload(supplied) {
    deps = supplied;
}

/**
 * SillyTavern runs this after it updated Pocket Tavern (the "update" hook in
 * manifest.json); this is still the old code, so the new one needs a reload.
 * It waits until nothing is in progress: the extension list or another dialog
 * open (Update all may still be updating others), a reply being written, a
 * message or prompt being edited, or a text box in use other than the message
 * box (unsent messages are kept). A few seconds first, so a batch of updates
 * can finish.
 */
export const updateReload = { pending: false, timer: 0 };

export function onPocketTavernUpdate() {
    if (!deps.settings()?.autoReload || updateReload.pending) return;
    updateReload.pending = true;
    globalThis.toastr?.info(t('The page reloads by itself when nothing is in progress.'), t('Pocket Tavern was updated'), { timeOut: 6000 });
    window.clearTimeout(updateReload.timer);
    updateReload.timer = window.setTimeout(safe(SOURCE, reloadWhenIdle), 4000);
}

function updateReloadBlocked() {
    if (document.querySelector('dialog[open]') || deps.sheetOpen()) return true;
    if (deps.generating() || deps.editorOpen() || promptEditorDirty()) return true;
    const focused = document.activeElement;
    const draftKept = focused?.matches?.(MESSAGE_BOX) && deps.settings().saveDrafts;
    return isTypingField(focused) && !draftKept;
}

export function reloadWhenIdle(force = false) {
    if (!force && !deps.settings()?.autoReload) {
        updateReload.pending = false;
        return;
    }
    if (updateReloadBlocked()) {
        updateReload.timer = window.setTimeout(safe(SOURCE, () => reloadWhenIdle(force)), 1500);
        return;
    }
    // Settings SillyTavern has not written yet go first.
    deps.context().saveSettingsDebounced?.();
    globalThis.toastr?.info(t('Reloading to finish the update…'), '', { timeOut: 2000 });
    window.setTimeout(() => location.reload(), 1500);
}
