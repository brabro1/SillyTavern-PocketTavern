// Quick checks that need no browser: every file loads as a module, the
// manifests are valid, versions agree, icons and themes are sound, CSS has no
// active blur or brace errors, and each translation row is complete.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
let failed = 0;
const ok = message => console.log(`  ✓ ${message}`);
const fail = (message, error) => {
    failed++;
    console.log(`  ✗ ${message}${error ? `\n      ${error}` : ''}`);
};

// Every file of a kind under the given folders, as paths relative to the repo root.
async function filesIn(folders, extension) {
    const found = [];
    for (const folder of folders) {
        const entries = await readdir(new URL(folder, root), { recursive: true, withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
            found.push(relative(rootPath, join(entry.parentPath ?? entry.path, entry.name)).replaceAll('\\', '/'));
        }
    }
    return found.sort();
}
const MODULES = ['index.js', 'changelog.js', ...await filesIn(['src/', 'locales/'], '.js')];
const STYLESHEETS = ['style.css', ...await filesIn(['styles/'], '.css')];
const readAll = async files => (await Promise.all(files.map(file => readFile(new URL(file, root), 'utf8')))).join('\n');

for (const file of MODULES) {
    try {
        await import(new URL(file, root));
        ok(`${file} loads`);
    } catch (error) {
        fail(`${file} loads`, error);
    }
}

// Every theme meets DESIGN.md's contrast rule (including generated --pt-text-muted and --pt-danger) and stays flat.
let defaultThemeBg = null;
try {
    const { THEMES, themeCss } = await import(new URL('src/themes/themes.js', root));
    defaultThemeBg = THEMES[0]?.bg ?? null;
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const lum = hex => {
        const [r, g, b] = rgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const problems = [];
    for (const t of THEMES) {
        const css = themeCss(t, 'html.pt-themed');
        const mutedLow = css.match(/--pt-text-muted:\s*(#[0-9a-f]{6})/i)?.[1];
        const danger = css.match(/--pt-danger:\s*(#[0-9a-f]{6})/i)?.[1];
        const checks = [
            ['text', t.text, t.bg, 4.5],
            ['text on cards', t.text, t.raised, 4.5],
            ['narration', t.muted, t.bg, 4.5],
            ['narration on cards', t.muted, t.raised, 4.5],
            ['dialogue', t.quote, t.bg, 4.5],
            ['dialogue on cards', t.quote, t.raised, 4.5],
            ['accent', t.accent, t.bg, 3],
            ['text on accent', t.onAccent, t.accent, 4.5],
            ...(mutedLow ? [['muted', mutedLow, t.bg, 3], ['muted on cards', mutedLow, t.raised, 3]] : []),
            ...(danger ? [['danger', danger, t.bg, 4.5], ['danger on cards', danger, t.raised, 4.5]] : []),
        ];
        for (const [what, fg, bg, min] of checks) {
            const value = ratio(fg, bg);
            if (value < min) problems.push(`${t.name} ${what} ${value.toFixed(2)} < ${min}`);
        }
        if (/gradient/.test(t.backdrop)) problems.push(`${t.name} has a gradient backdrop`);
    }
    if (problems.length) fail('themes meet the contrast rule', problems.join('; '));
    else ok(`${THEMES.length} themes meet the contrast rule and are flat`);
} catch (error) {
    fail('themes meet the contrast rule', error);
}

const json = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
try {
    const manifest = await json('manifest.json');
    const { VERSION } = await import(new URL('changelog.js', root));
    if (manifest.version === VERSION) ok(`version ${VERSION} matches the changelog`);
    else fail(`manifest.json version ${manifest.version} differs from changelog ${VERSION}`);
    const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8');
    if (changelog.includes(`## ${VERSION}`)) ok('CHANGELOG.md lists this version');
    else fail(`CHANGELOG.md has no "## ${VERSION}" section`);
    // SillyTavern calls manifest hooks by name after an update; a typo would silently stop the reload.
    const index = await import(new URL('index.js', root));
    const missing = Object.values(manifest.hooks ?? {}).filter(name => typeof index[name] !== 'function');
    if (missing.length) fail(`manifest.json hooks name functions index.js does not export: ${missing.join(', ')}`);
    else ok('manifest.json hooks point at exported functions');
} catch (error) {
    fail('manifest.json is valid', error);
}

try {
    const app = await json('app.webmanifest');
    for (const icon of app.icons) {
        if (icon.src.startsWith('/')) continue;
        await readFile(new URL(icon.src, root));
    }
    if (defaultThemeBg && (app.background_color?.toLowerCase() !== defaultThemeBg.toLowerCase() || app.theme_color?.toLowerCase() !== defaultThemeBg.toLowerCase())) {
        fail(`app.webmanifest colors (${app.background_color}/${app.theme_color}) differ from default theme bg (${defaultThemeBg})`);
    } else {
        ok('app.webmanifest is valid, its icons exist, and its colors match the default theme');
    }
} catch (error) {
    fail('app.webmanifest is valid', error);
}

try {
    const { ICONS, FA_MAP } = await import(new URL('src/ui/icons.js', root));
    const bad = Object.entries(FA_MAP).filter(([, name]) => !Object.hasOwn(ICONS, name)).map(([fa, name]) => `${fa}->${name}`);
    if (bad.length) fail(`FA_MAP references missing icons: ${bad.join(', ')}`);
    else ok(`${Object.keys(ICONS).length} icons and ${Object.keys(FA_MAP).length} Font Awesome mappings are valid`);
} catch (error) {
    fail('icons.js is valid', error);
}

try {
    const { t, setLocale } = await import(new URL('src/core/i18n.js', root));
    const { LANGS, STRINGS } = await import(new URL('locales/strings.js', root));
    const indexSource = await readAll(MODULES.filter(file => file.startsWith('src/')));
    const issues = [];
    const placeholders = str => [...str.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

    for (const [key, row] of Object.entries(STRINGS)) {
        if (!Array.isArray(row) || row.length !== LANGS.length) {
            issues.push(`wrong column count for "${key}"`);
            continue;
        }
        const expectedPh = placeholders(key);
        row.forEach((value, idx) => {
            if (typeof value !== 'string' || !value.trim()) issues.push(`empty ${LANGS[idx]} translation for "${key}"`);
            else if (placeholders(value) !== expectedPh) issues.push(`placeholder mismatch in ${LANGS[idx]} for "${key}"`);
        });
    }

    // Verify prototype-key safety in i18n.js
    setLocale('es');
    if (t('constructor') !== 'constructor' || t('toString') !== 'toString') {
        issues.push('i18n.js t() leaked Object.prototype keys');
    }
    setLocale('en');

    // Every static t('...') call in src/ should have a row in locales/
    const missingKeys = [];
    for (const m of indexSource.matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
        if (m[2].includes('${')) continue;
        const key = m[2].replace(/\\(['"\\])/g, '$1');
        if (!Object.hasOwn(STRINGS, key)) missingKeys.push(key);
    }
    const uniqueMissing = [...new Set(missingKeys)];
    if (uniqueMissing.length) issues.push(`missing locales/ rows for t() calls: ${uniqueMissing.join(' | ')}`);

    if (issues.length) fail('locales/ and i18n.js checks', issues.join('; '));
    else ok(`${Object.keys(STRINGS).length} translations in ${LANGS.length} languages (placeholders & t() calls verified)`);
} catch (error) {
    fail('locales/ rows are complete', error);
}

try {
    const css = await readAll(STYLESHEETS);
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const opens = (stripped.match(/\{/g) || []).length;
    const closes = (stripped.match(/\}/g) || []).length;
    const activeBlur = stripped.match(/(?:-webkit-)?backdrop-filter\s*:(?!\s*none\b)[^;}\n]+/gi) || [];
    const cssIssues = [];
    if (opens !== closes) cssIssues.push(`unbalanced braces (${opens} open vs ${closes} close)`);
    if (activeBlur.length) cssIssues.push(`active backdrop-filter found: ${activeBlur.join(', ')}`);
    if (cssIssues.length) fail('stylesheet static checks', cssIssues.join('; '));
    else ok(`the stylesheets are balanced (${opens} blocks) and have zero active backdrop-filter`);

    // DESIGN.md, Tokens: type, radius, spacing and motion come from the scales.
    const scale = [];
    const offType = [...stripped.matchAll(/font-size:\s*(\d+)px/g)].map(m => m[1]).filter(v => !['12', '14', '15', '16', '20', '24'].includes(v));
    if (offType.length) scale.push(`font sizes off the 12/14/15/16/20/24 scale: ${[...new Set(offType)].join(', ')}px`);
    // Spacing on the 4px scale; 1px hairline offsets and the quick reply chips' 6px
    // ((44px tap row - 32px chip) / 2) are the documented exceptions.
    const offSpace = [];
    for (const m of stripped.matchAll(/(?:^|[\s;{])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?)\s*:\s*([^;}]*)/gm)) {
        for (const v of m[2].matchAll(/(\d+(?:\.\d+)?)px/g)) if (Number(v[1]) % 4 && v[1] !== '1' && !(m[1] === 'margin' && m[2].trim() === '6px 0')) offSpace.push(`${m[1]}: ${m[2].trim()}`);
    }
    if (offSpace.length) scale.push(`spacing off the 4px scale: ${[...new Set(offSpace)].slice(0, 6).join(' | ')}`);
    const offRadius = [...stripped.matchAll(/border-radius:\s*([^;}]+)/g)].map(m => m[1].trim().replace(/\s*!important$/, ''))
        .filter(v => /\b(1[1-9]|[2-9]\d)px/.test(v) && !/999px/.test(v));
    if (offRadius.length) scale.push(`radii outside the tokens: ${[...new Set(offRadius)].join(', ')}`);
    const offMotion = [];
    for (const m of stripped.matchAll(/(?:^|[\s;{])(?:transition|animation)(?:-duration)?\s*:\s*([^;}]*)/gm)) {
        if (/infinite/.test(m[1])) continue;
        for (const t of m[1].matchAll(/\b(\d*\.?\d+)(ms|s)\b/g)) {
            const ms = t[2] === 's' ? Number(t[1]) * 1000 : Number(t[1]);
            if (ms >= 1 && (ms < 150 || ms > 240)) offMotion.push(m[1].trim());
        }
        if (/cubic-bezier|\bease(?:-in|-out|-in-out)?\b(?![-\w])/.test(m[1].replace(/var\([^)]*\)/g, ''))) offMotion.push(m[1].trim());
    }
    if (offMotion.length) scale.push(`motion outside 150-240ms with --pt-ease: ${[...new Set(offMotion)].slice(0, 6).join(' | ')}`);
    if (/html\.pt-on\s*\*\s*\{[^}]*scrollbar-width/.test(stripped)) scale.push('scrollbars are hidden on every element');
    if (scale.length) fail('the stylesheets follow the DESIGN.md scales', scale.join('; '));
    else ok('the stylesheets follow the type, spacing, radius and motion scales');
} catch (error) {
    fail('stylesheet static checks', error);
}

// 3.0 copies the 2.x storage keys (stmui_*) to their new names (pt_*) once, and never overwrites a newer value.
try {
    const { migrateStorageKeys } = await import(new URL('src/core/settings.js', root));
    const store = new Map([['stmui_mode', 'phones'], ['stmui_draft:Seraphina:chat 1', 'Hello'], ['pt_panel_w', '400'], ['stmui_panel_w', '300'], ['other', 'x']]);
    const storage = { get length() { return store.size; }, key: i => [...store.keys()][i] ?? null, getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    migrateStorageKeys(storage);
    store.set('stmui_mode', 'off');
    migrateStorageKeys(storage);
    const problems = [];
    if (store.get('pt_mode') !== 'phones') problems.push(`pt_mode is ${store.get('pt_mode')}`);
    if (store.get('pt_draft:Seraphina:chat 1') !== 'Hello') problems.push('the draft was not copied');
    if (store.get('pt_panel_w') !== '400') problems.push('a newer pt_ value was overwritten');
    if (!store.has('stmui_mode')) problems.push('an old key was removed');
    migrateStorageKeys(null);
    if (problems.length) fail('storage keys move from stmui_ to pt_', problems.join('; '));
    else ok('storage keys move from stmui_ to pt_ once, without overwriting');
} catch (error) {
    fail('storage keys move from stmui_ to pt_', error);
}

// Older iPhones (Safari before iOS 16.4) cannot parse a regex lookbehind; one would stop the whole extension loading there.
try {
    const found = [];
    for (const file of MODULES) {
        const text = await readFile(new URL(file, root), 'utf8');
        if (/\(\?<[=!]/.test(text)) found.push(file);
    }
    if (found.length) fail('no regex lookbehind (older Safari)', found.join(', '));
    else ok('no regex lookbehind, so older iPhones load the extension');
} catch (error) {
    fail('no regex lookbehind (older Safari)', error);
}

// A SillyTavern theme's message cards keep its own User Message and AI Message colours (GitHub issue #5).
try {
    const { themeFromSillyTavern } = await import(new URL('src/themes/themes.js', root));
    const st = {
        name: 'Same tints', main_text_color: 'rgba(220, 220, 210, 1)', quote_text_color: 'rgba(165, 140, 115, 1)',
        italics_text_color: 'rgba(235, 215, 190, 1)', blur_tint_color: 'rgba(23, 23, 23, 1)', chat_tint_color: 'rgba(23, 23, 23, 1)',
        user_mes_blur_tint_color: 'rgba(34, 30, 32, 0.75)', bot_mes_blur_tint_color: 'rgba(34, 30, 32, 0.75)',
    };
    const same = themeFromSillyTavern(st);
    const azure = themeFromSillyTavern({ ...st, name: 'Two tints', user_mes_blur_tint_color: 'rgba(40, 90, 180, 0.4)', bot_mes_blur_tint_color: 'rgba(10, 20, 60, 0.5)' });
    const problems = [];
    if (same.user !== same.bot) problems.push(`equal tints gave different cards (${same.user} / ${same.bot})`);
    if (same.glass.userCard !== same.glass.botCard) problems.push('equal tints gave different cards over a background');
    if (same.user.includes('165, 140, 115')) problems.push('your card is tinted with the quote colour');
    if (azure.user === azure.bot) problems.push('different tints gave the same card');
    if (problems.length) fail("SillyTavern themes keep their own message colours", problems.join('; '));
    else ok("SillyTavern themes keep their own User Message and AI Message colours");
} catch (error) {
    fail("SillyTavern themes keep their own message colours", error);
}

if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
}
console.log('\nAll checks passed.');
