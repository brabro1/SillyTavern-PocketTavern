// The Draft helper (DESIGN.md → The chat → Message box → Draft helper), on a phone and on desktop: the + menu's Write
// group, "Writing as" switching while the menu stays open, Enhance my draft through SillyTavern's Impersonate with a
// canned model reply (reasoning and a tracker cleaned away), the result bar with Regenerate, ‹ and Discard, the
// settings page, and turning the switch off taking everything away. The model is never called: the test page
// answers SillyTavern's own generate request. It switches the API back afterwards. Test SillyTavern only.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/draft.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/draft';
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

const waitFor = (page, label, fn, arg, timeout = 10000) => page.waitForFunction(fn, arg, { timeout }).catch(async () => {
    const state = await page.evaluate(() => ({ box: document.querySelector('#send_textarea')?.value, bar: document.getElementById('pt-draft-bar')?.className, sheet: !!document.getElementById('pt-sheet') }));
    throw new Error(`${label}: ${JSON.stringify(state)}`);
});
const box = page => page.evaluate(() => document.querySelector('#send_textarea').value);
const sheetRow = text => [...document.querySelectorAll('#pt-sheet .pt-list-row')].find(row => row.textContent.includes(text))?.click();

const REPLIES = [
    '<think>plan the wave</think>I raise a hand in a small wave. "Hi there. Mind if I sit here?"\n<tracker>mood: calm</tracker>',
    'I wave again, a little shyer this time. "Hello."',
];

for (const layout of ['phone', 'desktop']) {
    const phone = layout === 'phone';
    const context = await browser.newContext(phone
        ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) errors.push(error.message); });
    // SillyTavern's own request to the model, answered here as a stream.
    const sent = [];
    await page.route('**/api/backends/chat-completions/generate', async route => {
        sent.push(route.request().postData() || '');
        const reply = REPLIES[Math.min(sent.length - 1, REPLIES.length - 1)];
        const body = reply.match(/.{1,12}/gs).map(piece => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
        await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body });
    });
    console.log(`${layout}:`);
    let api = null;
    let saved = null;
    try {
        await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, { timeout: 60000 });
        await page.waitForTimeout(5000);
        await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        api = await page.evaluate(() => document.getElementById('main_api').value);
        saved = await page.evaluate(() => JSON.stringify(SillyTavern.getContext().extensionSettings.mobileUI.draft ?? null));
        await page.evaluate(() => { const select = document.getElementById('main_api'); select.value = 'openai'; jQuery(select).trigger('change'); });
        await page.waitForTimeout(800);
        // Test page only: as if connected (the request never leaves the page).
        await page.evaluate(async () => (await import('/script.js')).setOnlineStatus('Connected'));
        await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Seraphina'))); });
        await page.waitForTimeout(2500);
        await page.locator('#send_textarea').fill('i wave and say hi');

        await step('+ starts with Write: Enhance my draft, Write for me, Continue my draft, Writing as', async () => {
            await page.locator('.pt-plus-btn').click();
            await waitFor(page, 'the + menu', () => !!document.querySelector('#pt-sheet .pt-list-header'));
            const groups = await page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-list-section')].map(section => [section.querySelector('.pt-list-header')?.textContent, [...section.querySelectorAll('.pt-list-row-title')].map(node => node.textContent)]));
            if (groups[0]?.[0] !== 'Write' || groups[0][1].slice(0, 3).join('|') !== 'Enhance my draft|Write for me|Continue my draft' || !/^Writing as: /.test(groups[0][1][3])) throw new Error(JSON.stringify(groups));
            await page.screenshot({ path: `${OUT}/${layout}-menu.png` });
        });

        await step('"Writing as" moves to the next choice and the menu stays open', async () => {
            const name = () => page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-list-row-title')].find(node => /^Writing as/.test(node.textContent))?.textContent);
            const first = await name();
            await page.evaluate(sheetRow, 'Writing as');
            await page.waitForTimeout(250);
            const second = await name();
            if (!second || second === first || !await page.evaluate(() => !!document.getElementById('pt-sheet'))) throw new Error(`${first} → ${second}`);
            // Round to the start again (you → character → narrator).
            for (let i = 0; i < 2; i++) {
                await page.evaluate(sheetRow, 'Writing as');
                await page.waitForTimeout(200);
            }
            if (await name() !== first) throw new Error(`did not come back to ${first}`);
        });

        await step('Enhance my draft goes through Impersonate with the note, and the box gets the cleaned result', async () => {
            await page.evaluate(sheetRow, 'Enhance my draft');
            await waitFor(page, 'the result bar', () => !!document.querySelector('#pt-draft-bar.pt-draft-bar--in:not(.pt-draft-bar--busy)'), null, 20000);
            if (sent.length !== 1 || !sent[0].includes('Enhance my draft: this is') || !sent[0].includes('i wave and say hi')) throw new Error(`requests: ${sent.length}`);
            const text = await box(page);
            if (text !== 'I raise a hand in a small wave. "Hi there. Mind if I sit here?"') throw new Error(JSON.stringify(text));
            await page.waitForTimeout(300);
            await page.screenshot({ path: `${OUT}/${layout}-bar.png` });
        });

        await step('the bar sits right above the message box with Keep, Regenerate, Refine and Discard, 44px tall', async () => {
            const bar = await page.evaluate(() => {
                const node = document.getElementById('pt-draft-bar');
                return { next: node.nextElementSibling?.id, buttons: [...node.querySelectorAll('.pt-draft-actions .pt-draft-btn')].map(button => button.textContent.trim()), heights: [...node.querySelectorAll('.pt-draft-btn')].filter(button => button.getClientRects().length).map(button => Math.round(button.getBoundingClientRect().height)) };
            });
            if (bar.next !== 'send_form' || bar.buttons.join('|') !== 'Keep|Regenerate|Refine|Discard' || bar.heights.some(height => height < 44)) throw new Error(JSON.stringify(bar));
        });

        await step('Regenerate adds a second result; ‹ brings the first back; Discard restores the draft', async () => {
            await page.locator('#pt-draft-bar [data-action="regenerate"]').click();
            await waitFor(page, 'the second result', () => document.querySelector('#pt-draft-bar .pt-draft-count')?.textContent === '2/2' && !document.querySelector('#pt-draft-bar--busy'), null, 20000);
            if (await box(page) !== REPLIES[1]) throw new Error(await box(page));
            await page.locator('#pt-draft-bar [data-action="prev"]').click();
            await page.waitForTimeout(200);
            if (!(await box(page)).startsWith('I raise a hand')) throw new Error(await box(page));
            await page.locator('#pt-draft-bar [data-action="discard"]').click();
            await page.waitForTimeout(200);
            if (await box(page) !== 'i wave and say hi' || !await page.evaluate(() => document.getElementById('pt-draft-bar').hidden)) throw new Error(await box(page));
        });

        await step('Settings → Pocket Tavern → Draft helper shows its groups', async () => {
            await page.evaluate(() => { document.querySelector('.pt-tabs-btn')?.click(); document.querySelector('.pt-tab[data-tab="pt-settings"]').click(); });
            await waitFor(page, 'Settings', () => document.getElementById('pt-page')?.dataset.page === 'pt-settings');
            await page.evaluate(() => [...document.querySelectorAll('#pt-page .pt-list-row')].find(row => row.querySelector('.pt-list-row-title')?.textContent === 'Pocket Tavern')?.click());
            await waitFor(page, 'Pocket Tavern', () => document.getElementById('pt-page')?.dataset.page === 'pt-pocket');
            await page.evaluate(() => [...document.querySelectorAll('#pt-page .pt-list-row--nav')].find(row => row.querySelector('.pt-list-row-title')?.textContent === 'Draft helper')?.click());
            await waitFor(page, 'the Draft helper page', () => document.getElementById('pt-page')?.dataset.page === 'pt-draft');
            await page.waitForTimeout(400);
            await page.screenshot({ path: `${OUT}/${layout}-settings.png` });
            const headers = await page.evaluate(() => [...document.querySelectorAll('#pt-page .pt-list-header')].map(node => node.textContent));
            if (headers.join('|') !== 'General|Writing|Model compatibility|Instructions|Clean-up') throw new Error(JSON.stringify(headers));
        });

        await step('turning the Draft helper off takes away its bar and commands; on brings them back', async () => {
            const state = () => page.evaluate(() => ({ bar: !!document.getElementById('pt-draft-bar'), command: !!SillyTavern.getContext().SlashCommandParser.commands['enhance-draft'] }));
            await page.evaluate(() => document.getElementById('pt_draft').click());
            await page.waitForTimeout(400);
            const off = await state();
            await page.evaluate(() => document.getElementById('pt_draft').click());
            await page.waitForTimeout(400);
            const on = await state();
            if (off.bar || off.command || !on.command) throw new Error(JSON.stringify({ off, on }));
        });

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        await page.evaluate(({ value, draft }) => {
            const select = document.getElementById('main_api');
            if (value && select.value !== value) { select.value = value; jQuery(select).trigger('change'); }
            const settings = SillyTavern.getContext().extensionSettings.mobileUI;
            const before = JSON.parse(draft);
            if (before === null) delete settings.draft;
            else settings.draft = before;
            SillyTavern.getContext().saveSettingsDebounced();
        }, { value: api, draft: saved }).catch(() => {});
        await page.waitForTimeout(2000);
        await context.close();
    }
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
