// What has to happen before the rest of Pocket Tavern loads (src/main.js imports this first, and imports run
// in the order they are written): storage keys moved to their new names, and the translations loaded.
import { loadLocale } from './i18n.js';
import { migrateStorageKeys } from './settings.js';

// Pocket Tavern reads its storage keys and draws labels as soon as it starts.
migrateStorageKeys();

let locale = globalThis.navigator?.language;
try {
    locale = globalThis.SillyTavern?.getContext?.().getCurrentLocale?.() ?? locale;
} catch {
    // SillyTavern is not there (the offline checks): the browser's language it is.
}
try {
    await loadLocale(locale);
} catch (error) {
    console.warn('[Pocket Tavern]', 'Translations did not load; labels stay in English.', error);
}
