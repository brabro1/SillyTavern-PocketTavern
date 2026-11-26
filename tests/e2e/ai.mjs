// The AI place (DESIGN.md → Key screens → AI), on a phone and on desktop: the status card (connected, and not
// connected with Connect and a dot on the AI tab), the quick rows, the rows to SillyTavern's screens, and
// Prompts with Chat Completion. It changes nothing for good: the connection is only marked as lost inside the
// test page, and the API it switches to is switched back. Test SillyTavern only.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/ai.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/ai';
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
    const state = await page.evaluate(() => ({ page: document.documentElement.dataset.ptPage ?? '', real: document.getElementById('pt-page')?.dataset.page ?? '', sheet: !!document.getElementById('pt-sheet'), api: SillyTavern.getContext().mainApi, status: SillyTavern.getContext().onlineStatus }));
    throw new Error(`${label}: ${JSON.stringify(state)}`);
});

const openAi = async page => {
    await page.evaluate(() => { document.querySelector('.pt-tabs-btn')?.click(); });
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="pt-ai"]').click());
    await waitFor(page, 'the AI page', () => document.getElementById('pt-page')?.dataset.page === 'pt-ai' && !!document.querySelector('#pt-page .pt-ai-status'));
};
const row = title => [...document.querySelectorAll('#pt-page .pt-list-row')].find(node => node.querySelector('.pt-list-row-title')?.textContent === title)?.click();

for (const layout of ['phone', 'desktop']) {
    const phone = layout === 'phone';
    const context = await browser.newContext(phone
        ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) errors.push(error.message); });
    console.log(`${layout}:`);
    let api = null;
    try {
        await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, { timeout: 60000 });
        await page.waitForTimeout(5000);
        await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        api = await page.evaluate(() => document.getElementById('main_api').value);
        await openAi(page);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${layout}-ai.png` });

        await step('the status card names the API (and the model when there is one), with a status-coloured dot', async () => {
            const card = await page.evaluate(() => {
                const node = document.querySelector('#pt-page .pt-ai-status');
                return {
                    api: node.querySelector('.pt-ai-status-api')?.textContent ?? '',
                    state: node.querySelector('.pt-ai-status-state')?.textContent,
                    dot: getComputedStyle(node.querySelector('.pt-ai-status-dot')).backgroundColor,
                    connected: SillyTavern.getContext().onlineStatus !== 'no_connection',
                    connect: !!node.querySelector('.pt-button'),
                };
            });
            if (!card.api || card.state !== (card.connected ? 'Connected' : 'Not connected') || card.connect === card.connected || card.dot === 'rgba(0, 0, 0, 0)') throw new Error(JSON.stringify(card));
        });

        await step('not connected: the card says so with Connect, and the AI tab gets a dot', async () => {
            const before = await page.evaluate(() => SillyTavern.getContext().onlineStatus);
            try {
                // Test page only: as if the connection dropped.
                await page.evaluate(async () => (await import('/script.js')).setOnlineStatus('no_connection'));
                await waitFor(page, 'the card without a connection', () => document.querySelector('#pt-page .pt-ai-status--off .pt-button') && document.querySelector('.pt-tab[data-tab="pt-ai"]')?.classList.contains('pt-tab-alert'));
                await page.screenshot({ path: `${OUT}/${layout}-not-connected.png` });
                const dot = await page.evaluate(() => getComputedStyle(document.querySelector('.pt-tab[data-tab="pt-ai"] .pt-tab-icon'), '::after').backgroundColor);
                if (!dot || dot === 'rgba(0, 0, 0, 0)') throw new Error(`tab dot: ${dot}`);
            } finally {
                await page.evaluate(async status => (await import('/script.js')).setOnlineStatus(status), before);
            }
            if (before !== 'no_connection') await waitFor(page, 'the dot gone again', () => !document.querySelector('.pt-tab[data-tab="pt-ai"]')?.classList.contains('pt-tab-alert'));
        });

        await step('a quick row (preset) shows the current choice and opens the choices', async () => {
            const quick = await page.evaluate(() => [...document.querySelectorAll('#pt-page .pt-list-row--picker')].map(node => ({ title: node.querySelector('.pt-list-row-title').textContent, value: node.querySelector('.pt-list-row-value').textContent })));
            const preset = quick.find(item => item.title === 'Preset');
            if (!preset?.value) throw new Error(`quick rows: ${JSON.stringify(quick)}`);
            await page.evaluate(row, 'Preset');
            await waitFor(page, 'the preset choices', () => document.querySelectorAll('#pt-sheet .pt-choice').length > 1 && !!document.querySelector('#pt-sheet .pt-choice-on'));
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await waitFor(page, 'choices closed', () => !document.getElementById('pt-sheet'));
        });

        await step('Connection settings, Samplers and Formatting open SillyTavern\'s pages, and Back returns to AI', async () => {
            for (const [title, id] of [['Connection settings', 'sys-settings-button'], ['Samplers', 'ai-config-button'], ['Formatting', 'advanced-formatting-button']]) {
                await page.evaluate(row, title);
                await waitFor(page, `${title} opens`, want => document.documentElement.dataset.ptPage === want, id);
                await page.waitForTimeout(500);
                if (phone) await page.locator('#pt-appbar .pt-ab-back').click();
                else await page.keyboard.press('Escape');
                await waitFor(page, `back from ${title}`, () => document.getElementById('pt-page')?.dataset.page === 'pt-ai');
                await page.waitForTimeout(300);
            }
        });

        await step("Formatting: Instruct mode and the System prompt are switch rows that press SillyTavern's own checkbox; the note shows only with Chat Completion", async () => {
            const section = title => page.evaluate(want => [...document.querySelectorAll('#AdvancedFormatting .pt-menu-row')].find(node => node.querySelector('.pt-row-text > span')?.textContent === want)?.click(), title);
            const back = async () => {
                if (phone) await page.locator('#pt-appbar .pt-ab-back').click();
                else await page.keyboard.press('Escape');
                await page.waitForTimeout(400);
            };
            await page.evaluate(row, 'Formatting');
            await waitFor(page, 'Formatting opens', () => document.documentElement.dataset.ptPage === 'advanced-formatting-button' && !!document.querySelector('#AdvancedFormatting .pt-menu-row'));
            const before = await page.evaluate(() => document.getElementById('sysprompt_enabled').checked);
            try {
                await section('System prompt');
                await waitFor(page, 'the System prompt section', () => document.getElementById('AdvancedFormatting').dataset.ptView === 'sysprompt');
                const shown = await page.evaluate(() => {
                    const top = [...document.querySelectorAll('#AdvancedFormatting .pt-fmt-top')].find(node => node.dataset.ptSec === 'sysprompt');
                    const control = top?.querySelector('[role="switch"]');
                    const note = top?.querySelector('.pt-fmt-cc');
                    const select = document.getElementById('sysprompt_select');
                    return {
                        title: top?.querySelector('.pt-list-row-title')?.textContent,
                        on: control?.getAttribute('aria-checked'),
                        power: getComputedStyle(document.getElementById('sysprompt_enabled_label')).display,
                        note: note ? getComputedStyle(note).display : null,
                        cc: document.getElementById('main_api').value === 'openai',
                        selectWidth: Math.round(select.getBoundingClientRect().width),
                        rowWidth: Math.round(select.parentElement.getBoundingClientRect().width),
                        content: Math.round(document.getElementById('sysprompt_content').getBoundingClientRect().height),
                    };
                });
                await page.screenshot({ path: `${OUT}/${layout}-sysprompt.png` });
                if (shown.title !== 'Use the system prompt' || shown.on !== String(before) || shown.power !== 'none') throw new Error(JSON.stringify(shown));
                if ((shown.note === 'flex') !== shown.cc) throw new Error(`the Chat Completion note: ${JSON.stringify(shown)}`);
                if (phone && shown.selectWidth < shown.rowWidth - 2) throw new Error(`the preset picker does not take its own line: ${JSON.stringify(shown)}`);
                if (shown.content < 160) throw new Error(`the prompt box is ${shown.content}px tall`);
                await page.locator('#AdvancedFormatting .pt-fmt-top[data-pt-sec="sysprompt"] [role="switch"]').click();
                await waitFor(page, 'the checkbox follows', want => document.getElementById('sysprompt_enabled').checked === want, !before);
                await back();
                await section('Instruct template');
                await waitFor(page, 'the Instruct section', () => document.getElementById('AdvancedFormatting').dataset.ptView === 'instruct');
                const instruct = await page.evaluate(() => ({
                    on: document.querySelector('#AdvancedFormatting .pt-fmt-top[data-pt-sec="instruct"] [role="switch"]')?.getAttribute('aria-checked'),
                    box: document.getElementById('instruct_enabled').checked,
                }));
                if (instruct.on !== String(instruct.box)) throw new Error(JSON.stringify(instruct));
                await back();
            } finally {
                await page.evaluate(want => { const box = document.getElementById('sysprompt_enabled'); if (box.checked !== want) box.click(); }, before);
                await page.waitForTimeout(1500);
            }
            await back();
            await waitFor(page, 'back on AI', () => document.getElementById('pt-page')?.dataset.page === 'pt-ai');
        });

        await step('with Chat Completion, Prompts opens the Presets page on its Prompts', async () => {
            await page.evaluate(() => { const select = document.getElementById('main_api'); select.value = 'openai'; jQuery(select).trigger('change'); });
            await waitFor(page, 'a Prompts row', () => [...document.querySelectorAll('#pt-page .pt-list-row-title')].some(node => node.textContent === 'Prompts'));
            await page.evaluate(row, 'Prompts');
            await waitFor(page, 'the prompt list shown', () => {
                if (document.documentElement.dataset.ptPage !== 'ai-config-button') return false;
                const manager = document.getElementById('completion_prompt_manager');
                const ours = document.getElementById('pt_ptab_prompts');
                return ours ? ours.getAttribute('aria-selected') === 'true' : !!manager?.getBoundingClientRect().height;
            }, null, 10000);
            await page.screenshot({ path: `${OUT}/${layout}-prompts.png` });
        });

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        if (api) await page.evaluate(value => { const select = document.getElementById('main_api'); if (select.value !== value) { select.value = value; jQuery(select).trigger('change'); } }, api).catch(() => {});
        await page.waitForTimeout(2000);
        await context.close();
    }
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
