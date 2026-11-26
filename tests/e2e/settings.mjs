// The Settings place (DESIGN.md → Key screens → Settings; Settings inventory), on a phone and on desktop:
// the hub's rows, Appearance (themes, a segmented setting), Pocket Tavern (every switch, grouped, and in
// step with the Extensions panel), the filter field, About, and Back to Settings. Every setting it changes
// is put back. Test SillyTavern only.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/settings.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/settings';
mkdirSync(OUT, { recursive: true });
const VERSION = JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8')).version;
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || undefined });
let failed = 0;

async function step(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failed++;
        console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n')[0]}`);
    }
}

const waitFor = (page, label, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).catch(async () => {
    const state = await page.evaluate(() => ({ page: document.documentElement.dataset.ptPage ?? '', real: document.getElementById('pt-page')?.dataset.page ?? '', sheet: !!document.getElementById('pt-sheet') }));
    throw new Error(`${label}: ${JSON.stringify(state)}`);
});

const pt = () => SillyTavern.getContext().extensionSettings.mobileUI;
const rowTitles = () => [...document.querySelectorAll('#pt-page .pt-list-row')].filter(row => !row.hidden).map(row => row.querySelector('.pt-list-row-title')?.textContent);
const tapRow = title => [...document.querySelectorAll('#pt-page .pt-list-row')].find(row => row.querySelector('.pt-list-row-title')?.textContent === title)?.click();

const openSettings = async page => {
    await page.evaluate(() => { document.querySelector('.pt-tabs-btn')?.click(); });
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="pt-settings"]').click());
    await waitFor(page, 'Settings', () => document.getElementById('pt-page')?.dataset.page === 'pt-settings');
};
const openOwn = async (page, title, id) => {
    await page.evaluate(tapRow, title);
    await waitFor(page, title, want => document.getElementById('pt-page')?.dataset.page === want, id);
    await page.waitForTimeout(400);
};
const back = async (page, phone) => {
    if (phone) await page.locator('#pt-appbar .pt-ab-back').click();
    else {
        // In the filter field, Escape clears it, then lets go of it; the next Escape goes back.
        for (let i = 0; i < 3 && await page.evaluate(() => document.getElementById('pt-page')?.dataset.page !== 'pt-settings'); i++) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(250);
        }
    }
    await waitFor(page, 'back to Settings', () => document.getElementById('pt-page')?.dataset.page === 'pt-settings');
};
const filter = (page, text) => page.locator('#pt-page .pt-search-box-input').fill(text).then(() => page.waitForTimeout(350));

for (const layout of ['phone', 'desktop']) {
    const phone = layout === 'phone';
    const context = await browser.newContext(phone
        ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) errors.push(error.message); });
    console.log(`${layout}:`);
    let saved = null;
    try {
        await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, { timeout: 60000 });
        await page.waitForTimeout(5000);
        await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        saved = await page.evaluate(() => { const s = SillyTavern.getContext().extensionSettings.mobileUI; return { theme: s.theme, stTheme: s.stTheme, textSize: s.textSize, jumpButton: s.jumpButton }; });
        await openSettings(page);
        await page.screenshot({ path: `${OUT}/${layout}-hub.png` });

        await step('the hub: Appearance, Personas, SillyTavern, Extensions, then Pocket Tavern and About', async () => {
            const titles = await page.evaluate(rowTitles);
            const order = ['Appearance', 'Personas', 'SillyTavern', 'Extensions', 'Pocket Tavern', 'About'].map(title => titles.indexOf(title));
            if (order.some(at => at === -1) || order.some((at, i) => i && at < order[i - 1])) throw new Error(JSON.stringify(titles));
        });

        await step('Appearance: theme cards (one picked), and picking one changes the theme', async () => {
            await openOwn(page, 'Appearance', 'pt-appearance');
            await page.screenshot({ path: `${OUT}/${layout}-appearance.png` });
            const cards = await page.evaluate(() => ({ count: document.querySelectorAll('#pt-page .pt-themes:not(.pt-themes-st) .pt-theme-card').length, on: document.querySelectorAll('#pt-page .pt-theme-on').length }));
            if (cards.count < 6 || cards.on !== 1) throw new Error(JSON.stringify(cards));
            const other = await page.evaluate(() => [...document.querySelectorAll('#pt-page .pt-themes:not(.pt-themes-st) .pt-theme-card')].find(card => !card.classList.contains('pt-theme-on')).dataset.theme);
            await page.locator(`#pt-page .pt-theme-card[data-theme="${other}"]`).click();
            await waitFor(page, 'the theme picked', want => SillyTavern.getContext().extensionSettings.mobileUI.theme === want && document.querySelector('#pt-page .pt-theme-on')?.dataset.theme === want, other);
        });

        await step('Appearance: Text size is a segmented control that saves at once', async () => {
            const next = saved.textSize === 'large' ? 'normal' : 'large';
            const group = page.locator('#pt-page .pt-choice-setting', { hasText: 'Text size' });
            await group.locator(`.pt-segment[data-value="${next}"]`).click();
            await waitFor(page, 'text size saved', want => SillyTavern.getContext().extensionSettings.mobileUI.textSize === want, next);
            if (await group.locator(`.pt-segment[data-value="${next}"]`).getAttribute('aria-checked') !== 'true') throw new Error('segment not shown as picked');
        });

        await step('the filter hides what does not match, and says so when nothing does', async () => {
            await filter(page, 'density');
            const shown = await page.evaluate(() => [...document.querySelectorAll('#pt-page .pt-list-section')].filter(section => !section.hidden).map(section => section.querySelector('.pt-list-header')?.textContent ?? ''));
            if (shown.join() !== 'Density') throw new Error(JSON.stringify(shown));
            await filter(page, 'zzzz');
            if (!await page.evaluate(() => !document.querySelector('#pt-page .pt-filter-none')?.hidden)) throw new Error('no "Nothing matches that."');
            await back(page, phone);
        });

        await step('Pocket Tavern: device line, Use SillyTavern for now, and every switch in groups', async () => {
            await openOwn(page, 'Pocket Tavern', 'pt-pocket');
            await page.screenshot({ path: `${OUT}/${layout}-pocket-tavern.png` });
            const info = await page.evaluate(() => ({
                headers: [...document.querySelectorAll('#pt-page .pt-list-header')].map(node => node.textContent),
                switches: document.querySelectorAll('#pt-page .pt-list-row--toggle').length,
                titles: [...document.querySelectorAll('#pt-page .pt-list-row-title')].map(node => node.textContent),
            }));
            for (const header of ['Chat', 'Characters and lorebooks', 'Pictures', 'Navigation', 'Notifications and device', 'Updates']) {
                if (!info.headers.includes(header)) throw new Error(`no ${header}: ${JSON.stringify(info.headers)}`);
            }
            if (!info.titles.includes('Use it on this device') || !info.titles.includes('Use SillyTavern for now')) throw new Error(JSON.stringify(info.titles));
            // 26 switches; Hide tabs and Vibration only on a phone, Guided Generations only when installed.
            if (info.switches < 22) throw new Error(`only ${info.switches} switches`);
        });

        await step('a switch saves at once and the Extensions panel follows', async () => {
            await filter(page, 'jump');
            const titles = await page.evaluate(rowTitles);
            if (titles.join() !== 'Jump to latest') throw new Error(JSON.stringify(titles));
            const before = await page.evaluate(() => SillyTavern.getContext().extensionSettings.mobileUI.jumpButton);
            await page.locator('#pt-page .pt-list-row--toggle:not([hidden]) .pt-toggle').click();
            await waitFor(page, 'saved', want => SillyTavern.getContext().extensionSettings.mobileUI.jumpButton === want && document.getElementById('pt_jump')?.checked === want, !before);
            // The page keeps its filter (it is not drawn again).
            if (await page.locator('#pt-page .pt-search-box-input').inputValue() !== 'jump') throw new Error('the filter was cleared');
            await back(page, phone);
        });

        await step('About: the version, updates and help', async () => {
            await openOwn(page, 'About', 'pt-about');
            await page.screenshot({ path: `${OUT}/${layout}-about.png` });
            const about = await page.evaluate(() => ({ version: document.querySelector('#pt-page .pt-about-version')?.textContent, titles: [...document.querySelectorAll('#pt-page .pt-list-row-title')].map(node => node.textContent) }));
            if (about.version !== `v${VERSION}`) throw new Error(JSON.stringify(about));
            for (const title of ["What's new", 'Update Pocket Tavern', 'SillyTavern updates', 'Guide', 'GitHub', 'Report a problem']) {
                if (!about.titles.includes(title)) throw new Error(`no ${title}: ${JSON.stringify(about.titles)}`);
            }
            await back(page, phone);
        });

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        if (saved) {
            await page.evaluate(values => {
                const settings = SillyTavern.getContext().extensionSettings.mobileUI;
                Object.assign(settings, values);
                SillyTavern.getContext().saveSettingsDebounced();
            }, saved).catch(() => {});
        }
        await page.waitForTimeout(2000);
        await context.close();
    }
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
