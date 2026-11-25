// Pocket Tavern's own settings and their migrations (AGENTS.md → Rules, 2).
// Every migration is forward-only, never throws, and works when keys are missing or unknown.

/**
 * Each step turns settings saved by one version into the next shape. Index 0 takes unversioned
 * settings (2.x) to version 1. Add a step for every change to the shape; never edit an old one.
 * @type {((saved: Record<string, unknown>) => void)[]}
 */
/** Behaviour switches that are now simply how Pocket Tavern works (DESIGN.md → Decisions: six switches). */
const RETIRED_SWITCHES = ['messageMenu', 'dragSwipe', 'foldLong', 'contextMeter', 'loreCards', 'sharpPictures', 'animatedPictures', 'charPage', 'charPreview', 'recentTools', 'fastChat', 'jumpButton', 'imageViewer', 'niceToasts', 'autoReload', 'sendEffect', 'customIcons', 'wandShortcut'];

const STEPS = [
    // 1: 2.x settings are the 3.0 baseline; nothing changes yet.
    () => {},
    // 2: the retired switches go; what they switched is always on now.
    settings => {
        for (const key of RETIRED_SWITCHES) delete settings[key];
    },
];
export const SETTINGS_VERSION = STEPS.length;

/**
 * Brings settings saved under `extension_settings.mobileUI` up to SETTINGS_VERSION. Unknown keys
 * are kept, missing ones are left for the defaults, and a step that throws is skipped.
 * @returns {Record<string, unknown>} the same object (or a new one when none was saved)
 */
export function migrateSettings(saved) {
    const settings = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    const from = Number.isInteger(settings.settingsVersion) ? settings.settingsVersion : 0;
    for (let version = from; version < SETTINGS_VERSION; version++) {
        try {
            STEPS[version](settings);
        } catch (error) {
            console.warn('[Pocket Tavern]', `Settings step ${version + 1} was skipped.`, error);
        }
    }
    if (from < SETTINGS_VERSION) settings.settingsVersion = SETTINGS_VERSION;
    return settings;
}

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
