/**
 * Translations for Pocket Tavern's own labels. The English text is the key, so a
 * missing translation simply shows English. SillyTavern's own interface is
 * translated by SillyTavern.
 */

/** @type {Record<string, Record<string, string>>} */
const DICTIONARIES = Object.create(null);

let current = Object.create(null);
let currentCode = 'en';
let rtl = false;

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

/** Languages with a file in locales/. To add one, add locales/<code>.js and its code here. */
export const LANGUAGES = ['es', 'pt', 'ru', 'zh', 'ja', 'ar'];

/**
 * Loads the translations for a locale like "es-es" or "zh-cn", once, from locales/<code>.js.
 * Only the language in use is ever downloaded. English needs nothing.
 */
export async function loadLocale(locale) {
    const base = String(locale || '').trim().toLowerCase().split(/[-_]/)[0];
    if (!LANGUAGES.includes(base) || Object.hasOwn(DICTIONARIES, base)) return;
    const { default: entries } = await import(`../../locales/${base}.js`);
    addDictionary(base, entries);
}

/** Picks the dictionary for a locale like "es-es" or "zh-cn". */
export function setLocale(locale) {
    const code = String(locale || 'en').trim().toLowerCase();
    const base = code.split(/[-_]/)[0];
    if (Object.hasOwn(DICTIONARIES, code)) {
        current = DICTIONARIES[code];
        currentCode = code;
    } else if (Object.hasOwn(DICTIONARIES, base)) {
        current = DICTIONARIES[base];
        currentCode = base;
    } else {
        current = Object.create(null);
        currentCode = 'en';
    }
    rtl = RTL_LANGUAGES.includes(currentCode.split(/[-_]/)[0]);
}

/** The language Pocket Tavern's own labels are shown in ("en" when there is no translation). */
export function currentLang() {
    return currentCode;
}

export function isRtl() {
    return rtl;
}

/** Translates `text`; `{name}` placeholders are filled from `values`. */
export function t(text, values) {
    let out = Object.hasOwn(current, text) ? current[text] : text;
    if (values) out = out.replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(values, key) ? String(values[key]) : match));
    return out;
}

export function addDictionary(code, entries) {
    const key = String(code || '').trim().toLowerCase();
    if (!key) return;
    const dict = Object.hasOwn(DICTIONARIES, key) ? DICTIONARIES[key] : Object.create(null);
    Object.assign(dict, entries);
    DICTIONARIES[key] = dict;
}

/**
 * Follows SillyTavern's language: picks the dictionary, mirrors the layout for Arabic and gives CSS the words it
 * draws itself (Save, Cancel). With `on` false, takes the mirroring and the words away again.
 */
export function applyLanguage(on, locale) {
    setLocale(locale);
    const root = document.documentElement;
    root.classList.toggle('pt-rtl', on && isRtl());
    if (on) {
        root.style.setProperty('--pt-l-save', JSON.stringify(t('Save')));
        root.style.setProperty('--pt-l-cancel', JSON.stringify(t('Cancel')));
    } else {
        root.style.removeProperty('--pt-l-save');
        root.style.removeProperty('--pt-l-cancel');
    }
}
