// Pocket Tavern's own settings and their migrations (AGENTS.md → Rules, 2).
// Every migration is forward-only, never throws, and works when keys are missing or unknown.

/**
 * 3.0 renamed Pocket Tavern's browser-storage keys from `stmui_*` to `pt_*` (where it runs,
 * the desktop panel width, unsent drafts). Copies each old key once, so nothing is lost.
 * The old keys stay, so going back to a 2.x version still finds them.
 */
export function migrateStorageKeys(storage = globalThis.localStorage) {
    try {
        if (!storage || storage.getItem('pt_storage_v') === '1') return;
        const old = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key?.startsWith('stmui_')) old.push(key);
        }
        for (const key of old) {
            const next = `pt_${key.slice('stmui_'.length)}`;
            if (storage.getItem(next) === null) storage.setItem(next, storage.getItem(key));
        }
        storage.setItem('pt_storage_v', '1');
    } catch {
        // Storage is blocked or full: Pocket Tavern starts with its defaults.
    }
}
