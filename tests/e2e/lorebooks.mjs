// The Lorebooks place (DESIGN.md → Key screens → Lorebooks), on a phone and on desktop: the Lorebooks page
// (Active lorebooks, Activation settings, New lorebook, Import, every lorebook as a row), a lorebook's page
// (SillyTavern's editor for that one lorebook, its name in the header), Activation settings, Back, and
// deleting the open lorebook. It makes its own test lorebook and deletes it. Test SillyTavern only.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/lorebooks.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/lorebooks';
const BOOK = 'Pocket Tavern lorebook test';
mkdirSync(OUT, { recursive: true });
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
    const state = await page.evaluate(() => ({ page: document.documentElement.dataset.ptPage ?? '', real: document.getElementById('pt-page')?.dataset.page ?? '', mode: document.documentElement.dataset.ptWi ?? '', title: document.querySelector('.pt-ab-title')?.textContent, sheet: !!document.getElementById('pt-sheet') }));
    throw new Error(`${label}: ${JSON.stringify(state)}`);
});

const visible = selector => { const node = document.querySelector(selector); return !!node && node.getClientRects().length > 0 && getComputedStyle(node).display !== 'none'; };
const tapRow = title => [...document.querySelectorAll('#pt-page .pt-list-row')].find(row => row.querySelector('.pt-list-row-title')?.textContent === title)?.click();
const home = page => waitFor(page, 'the Lorebooks page', () => document.getElementById('pt-page')?.dataset.page === 'pt-lorebooks');
const back = async (page, phone) => {
    if (phone) await page.locator('#pt-appbar .pt-ab-back').click();
    else await page.keyboard.press('Escape');
    await home(page);
};

for (const layout of ['phone', 'desktop']) {
    const phone = layout === 'phone';
    const context = await browser.newContext(phone
        ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) errors.push(error.message); });
    console.log(`${layout}:`);
    try {
        await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, { timeout: 60000 });
        await page.waitForTimeout(5000);
        await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        await page.evaluate(() => { document.querySelector('.pt-tabs-btn')?.click(); });
        await page.waitForTimeout(200);
        await page.evaluate(() => document.querySelector('.pt-tab[data-tab="pt-lorebooks"]').click());
        await home(page);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${layout}-home.png` });

        await step('the Lorebooks page: Active lorebooks with how many are on, Activation settings, New lorebook, Import, then every lorebook', async () => {
            const shown = await page.evaluate(() => ({
                titles: [...document.querySelectorAll('#pt-page .pt-list-row-title')].map(node => node.textContent),
                value: document.querySelector('#pt-page .pt-list-row--picker .pt-list-row-value')?.textContent,
                books: [...document.getElementById('world_editor_select').options].filter(option => option.value !== '').map(option => option.textContent.trim()),
                active: document.getElementById('world_info').selectedOptions.length,
            }));
            if (shown.titles.slice(0, 4).join('|') !== 'Active lorebooks|Activation settings|New lorebook|Import') throw new Error(JSON.stringify(shown.titles));
            if (shown.titles.slice(4).join('|') !== shown.books.join('|')) throw new Error(`rows ${JSON.stringify(shown.titles.slice(4))} vs ${JSON.stringify(shown.books)}`);
            if (shown.value !== `${shown.active} of ${shown.books.length}`) throw new Error(`value ${shown.value}`);
        });

        await step('a lorebook made in SillyTavern shows up as a row at once', async () => {
            await page.evaluate(async name => {
                const context = SillyTavern.getContext();
                await context.saveWorldInfo(name, { entries: {} }, true);
                await context.updateWorldInfoList();
            }, BOOK);
            await waitFor(page, 'the new row', name => [...document.querySelectorAll('#pt-page .pt-list-row-title')].some(node => node.textContent === name), BOOK);
        });

        await step("its row opens its page: its name in the header, its tools and entries, and none of World Info's other parts", async () => {
            await page.evaluate(tapRow, BOOK);
            await waitFor(page, 'the lorebook page', name => document.documentElement.dataset.ptPage === 'WI-SP-button' && document.documentElement.dataset.ptWi === 'book' && document.querySelector('.pt-ab-title')?.textContent === name, BOOK);
            await waitFor(page, 'its tools', () => !!document.getElementById('world_popup_new')?.offsetParent, null, 10000);
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => document.getElementById('world_popup_new').click());
                await page.waitForTimeout(250);
            }
            await waitFor(page, 'three entries', () => document.querySelectorAll('#world_popup_entries_list .world_entry').length >= 3, null, 10000);
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${OUT}/${layout}-book.png` });
            const parts = await page.evaluate(visible => ({
                top: new Function(`return (${visible})`)()('#wiTopBlock'),
                create: new Function(`return (${visible})`)()('#world_create_button'),
                select: new Function(`return (${visible})`)()('#world_editor_select'),
                search: new Function(`return (${visible})`)()('#world_info_search'),
                tab: document.querySelector('.pt-tab-on')?.dataset.tab,
            }), visible.toString());
            if (parts.top || parts.create || parts.select || !parts.search || parts.tab !== 'pt-lorebooks') throw new Error(JSON.stringify(parts));
        });

        await step(phone ? '‹ goes back to the Lorebooks page' : 'Escape goes back to the Lorebooks page', async () => {
            await back(page, phone);
        });

        await step('Activation settings is its own page, without the editor', async () => {
            await page.evaluate(tapRow, 'Activation settings');
            await waitFor(page, 'the settings page', () => document.documentElement.dataset.ptWi === 'settings' && document.querySelector('.pt-ab-title')?.textContent === 'Activation settings');
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${OUT}/${layout}-settings.png` });
            const parts = await page.evaluate(() => ({
                editor: !!document.getElementById('world_popup')?.getClientRects().length && getComputedStyle(document.getElementById('world_popup')).display !== 'none',
                depth: !!document.getElementById('world_info_depth')?.closest('.inline-drawer-content')?.getClientRects().length,
            }));
            if (parts.editor || !parts.depth) throw new Error(JSON.stringify(parts));
            await back(page, phone);
        });

        await step('Active lorebooks opens the lorebook picker', async () => {
            await page.evaluate(tapRow, 'Active lorebooks');
            await waitFor(page, 'the picker', () => !!document.querySelector('#pt-sheet .pt-panel'));
            await page.screenshot({ path: `${OUT}/${layout}-active.png` });
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await waitFor(page, 'picker closed', () => !document.getElementById('pt-sheet'));
        });

        await step('deleting the open lorebook goes back to the Lorebooks page, without its row', async () => {
            await page.evaluate(tapRow, BOOK);
            await waitFor(page, 'the lorebook page', name => document.querySelector('.pt-ab-title')?.textContent === name, BOOK);
            await page.evaluate(async name => (await import('/scripts/world-info.js')).deleteWorldInfo(name), BOOK);
            await home(page);
            await waitFor(page, 'the row gone', name => ![...document.querySelectorAll('#pt-page .pt-list-row-title')].some(node => node.textContent === name), BOOK);
        });

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        await page.evaluate(async name => {
            if (SillyTavern.getContext().getWorldInfoNames().includes(name)) await (await import('/scripts/world-info.js')).deleteWorldInfo(name);
        }, BOOK).catch(() => {});
        await page.waitForTimeout(1500);
        await context.close();
    }
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
