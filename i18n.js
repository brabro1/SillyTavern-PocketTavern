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
