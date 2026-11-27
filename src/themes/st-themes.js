// SillyTavern's UI themes as Pocket Tavern themes (Settings → Appearance → From SillyTavern): its saved themes, read
// the way SillyTavern reads them, made to fit Pocket Tavern's look (src/themes/themes.js → themeFromSillyTavern).
import { findTheme, ST_THEME_COLORS, themeFromSillyTavern } from './themes.js';
import { safe } from '../core/lifecycle.js';

const LOG = '[Pocket Tavern]';
const SOURCE = 'st themes';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, applyAppearance: Function, saveSettings: Function } | null} */
let deps = null;

export function setupStThemes(supplied) {
    deps = supplied;
}

/** The SillyTavern themes on the server (loaded when the Themes sheet opens) and the converted chosen one. */
export const stThemes = { list: null, loading: null, observer: null, made: { key: '', theme: null } };

/** The colors Pocket Tavern keeps of a SillyTavern theme, saved with the choice so it applies at once on the next start. */
export function stThemeColors(raw) {
    return { name: raw.name, ...Object.fromEntries(ST_THEME_COLORS.map(key => [key, raw[key] ?? null])) };
}

/** The theme in use: one of Pocket Tavern's, a SillyTavern theme made to fit, or null for "Your theme". */
export function currentTheme() {
    const id = deps.settings().theme;
    const own = findTheme(id);
    if (own || typeof id !== 'string' || !id.startsWith('st:')) return own;
    const saved = deps.settings().stTheme;
    if (!saved || `st:${saved.name}` !== id) return null;
    const key = JSON.stringify(saved);
    if (stThemes.made.key !== key) stThemes.made = { key, theme: themeFromSillyTavern(saved) };
    return stThemes.made.theme;
}

/** Asks SillyTavern for its saved UI themes (the same request it makes when it starts). */
export function loadSillyTavernThemes(force = false) {
    if (stThemes.loading && !force) return stThemes.loading;
    stThemes.loading = (async () => {
        try {
            const response = await fetch('/api/settings/get', { method: 'POST', headers: deps.context().getRequestHeaders(), body: JSON.stringify({}) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            stThemes.list = (Array.isArray(data?.themes) ? data.themes : []).filter(theme => theme && typeof theme.name === 'string' && theme.name);
        } catch (error) {
            console.warn(LOG, 'Could not load SillyTavern themes', error);
            stThemes.loading = null;
            return stThemes.list ?? [];
        }
        // The chosen one may have been changed in SillyTavern since: keep its colors current.
        const chosen = stThemes.list.find(theme => `st:${theme.name}` === deps.settings().theme);
        if (chosen && JSON.stringify(stThemeColors(chosen)) !== JSON.stringify(deps.settings().stTheme)) {
            deps.settings().stTheme = stThemeColors(chosen);
            deps.saveSettings();
            deps.applyAppearance();
        }
        return stThemes.list;
    })();
    return stThemes.loading;
}

/** SillyTavern's own "Import a theme file" (its button is hidden in Settings → Look while Pocket Tavern is on). */
export function importSillyTavernTheme(refresh) {
    const select = document.getElementById('themes');
    const button = document.getElementById('ui_preset_import_button');
    if (!button) return;
    // SillyTavern adds the imported theme to its list; then the sheet shows it too.
    if (select && !stThemes.observer) {
        stThemes.observer = new MutationObserver(safe(SOURCE, () => {
            stThemes.observer?.disconnect();
            stThemes.observer = null;
            loadSillyTavernThemes(true).then(refresh);
        }));
        stThemes.observer.observe(select, { childList: true });
    }
    button.click();
}
