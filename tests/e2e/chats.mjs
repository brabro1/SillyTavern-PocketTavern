// The Chats place (DESIGN.md → Key screens → Chats (home)), on a phone and on desktop: the Assistant,
// pinned and recent chats grouped by character, a row's ⋯, Search everything, opening a chat and coming
// back, desktop's panel, welcome and home button, and start-up. Test SillyTavern only; the two chats it
// makes for this are deleted afterwards.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/chats.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/chats';
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

/** A wait that says which one it was when it times out. */
const waitFor = (page, label, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).catch(async () => {
    const state = await page.evaluate(() => ({ page: document.documentElement.dataset.ptPage ?? '', chat: SillyTavern.getContext().getCurrentChatId?.() ?? null, sheet: !!document.getElementById('pt-sheet'), headers: [...document.querySelectorAll('#pt-page .pt-list-header')].map(el => el.textContent), query: document.querySelector('#pt-page .pt-chats-search input')?.value }));
    throw new Error(`${label}: ${JSON.stringify(state)}`);
});
/**
 * Two throwaway chats with Seraphina (each with a message), so she has a card with a dropdown even on a
 * fresh SillyTavern; then no chat is open. Deleted afterwards through SillyTavern's own function.
 */
async function makeChats() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const made = await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        const id = context.characters.findIndex(character => character.name === 'Seraphina');
        await context.selectCharacterById(String(id));
        await new Promise(resolve => setTimeout(resolve, 1000));
        const script = await import('/script.js');
        const files = [];
        for (const text of ['Shall we follow the river north?', 'Tell me about the old oak.']) {
            await script.doNewChat();
            await new Promise(resolve => setTimeout(resolve, 800));
            const message = { name: context.name1, is_user: true, is_system: false, send_date: new Date().toISOString(), mes: text, extra: {} };
            context.chat.push(message);
            context.addOneMessage(message);
            await context.saveChat();
            files.push(context.getCurrentChatId());
        }
        document.getElementById('option_close_chat')?.click();
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { id, files };
    });
    await context.close();
    return made;
}

async function removeChats(made) {
    if (!made?.files?.length) return;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(async ({ id, files }) => {
        const context = SillyTavern.getContext();
        if (files.includes(context.getCurrentChatId?.())) {
            document.getElementById('option_close_chat')?.click();
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        const script = await import('/script.js');
        for (const file of files) await script.deleteCharacterChatByName(String(id), file);
    }, made);
    await context.close();
}

const openRow = name => [...document.querySelectorAll('#pt-page .pt-chat-row-main')].find(row => row.querySelector('.pt-rc-title')?.textContent === name)?.click();

const made = await makeChats();

for (const layout of ['phone', 'desktop']) {
    const phone = layout === 'phone';
    const context = await browser.newContext(phone
        ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    // Every frame of the first seconds: is SillyTavern's Characters panel visible?
    await context.addInitScript(() => {
        window.__ptFlash = 0;
        const sample = () => {
            const panel = document.getElementById('right-nav-panel');
            if (panel && document.documentElement.classList.contains('pt-on')) {
                const box = panel.getBoundingClientRect();
                const style = getComputedStyle(panel);
                if (box.width > 50 && box.height > 50 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05) window.__ptFlash += 1;
            }
            if (performance.now() < 15000) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) errors.push(error.message); });
    console.log(`${layout}:`);
    try {
        await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await waitFor(page, 'wait 1', () => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, 60000);
        await page.waitForTimeout(5000);
        await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());

        await step("start-up with no chat open: Chats first, and SillyTavern's Characters panel never flashes", async () => {
            const start = await page.evaluate(() => ({ page: document.documentElement.dataset.ptPage, flash: window.__ptFlash, noChat: SillyTavern.getContext().getCurrentChatId?.() === undefined }));
            if (!start.noChat) return;
            if (start.page !== 'pt-chats' || start.flash) throw new Error(JSON.stringify(start));
        });
        await page.screenshot({ path: `${OUT}/${layout}-home.png` });

        await step('the Assistant first, then pinned and recent chats; no message box', async () => {
            const home = await page.evaluate(() => ({
                first: document.querySelector('#pt-page .pt-chats-results > *')?.textContent ?? '',
                headers: [...document.querySelectorAll('#pt-page .pt-list-header')].map(el => el.textContent),
                rows: document.querySelectorAll('#pt-page .pt-chat-row').length,
                box: getComputedStyle(document.getElementById('form_sheld')).display,
                root: document.getElementById('pt-appbar').classList.contains('pt-ab-root'),
            }));
            if (!home.first.includes('Assistant') || !home.headers.includes('Recent') || !home.rows || home.box !== 'none' || !home.root) throw new Error(JSON.stringify(home));
        });

        await step('a character with several chats gets one card: their latest, and a dropdown with New chat, All chats, Character and the rest', async () => {
            const toggle = page.locator('#pt-page .pt-chat-group-toggle').first();
            if (!await toggle.count()) throw new Error('no character with more than one chat in the test data');
            await toggle.click();
            const open = await page.evaluate(() => {
                const card = document.querySelector('#pt-page .pt-chat-group-card--open');
                return { actions: [...card.querySelectorAll('.pt-chat-group-action')].map(el => el.textContent), rows: card.querySelectorAll('.pt-chat-row').length, expanded: card.querySelector('.pt-chat-group-toggle').getAttribute('aria-expanded') };
            });
            await page.screenshot({ path: `${OUT}/${layout}-group.png` });
            await toggle.click();
            if (open.actions.join() !== 'New chat,All chats,Character' || open.rows < 2 || open.expanded !== 'true') throw new Error(JSON.stringify(open));
        });

        await step("a row's ⋯ offers New chat, All chats, Pin, Rename and Delete, and does not open the chat", async () => {
            await page.locator('#pt-page .pt-chat-row .pt-rc-more').first().click();
            await waitFor(page, 'wait 2', () => !!document.querySelector('#pt-sheet .pt-list-row'));
            const items = await page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-list-row-title')].map(el => el.textContent));
            await page.screenshot({ path: `${OUT}/${layout}-row-menu.png` });
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await waitFor(page, 'wait 3', () => !document.getElementById('pt-sheet'));
            for (const want of ['New chat', 'All chats', 'Rename', 'Delete']) if (!items.includes(want)) throw new Error(`no "${want}": ${items.join(', ')}`);
            if (!items.some(item => /^(Pin|Unpin)$/.test(item))) throw new Error(`no Pin: ${items.join(', ')}`);
            if (items.at(-1) !== 'Delete') throw new Error('Delete is not last');
            if (await page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() !== undefined)) throw new Error('⋯ opened the chat');
        });

        await step('Search everything groups what it finds (Places, Characters, Chats, Settings); Enter opens the first', async () => {
            await page.locator('#pt-page .pt-chats-search input').fill('seraphina');
            await waitFor(page, 'wait 4', () => {
                const headers = [...document.querySelectorAll('#pt-page .pt-list-header')].map(el => el.textContent);
                return headers.includes('Characters') && headers.includes('Chats');
            }, null, 8000);
            await page.locator('#pt-page .pt-chats-search input').fill('chats');
            await waitFor(page, 'wait 5', () => [...document.querySelectorAll('#pt-page .pt-list-header')].some(el => el.textContent === 'Places'), null, 8000);
            await page.screenshot({ path: `${OUT}/${layout}-search.png` });
            await page.locator('#pt-page .pt-chats-search input').fill('chat width');
            await waitFor(page, 'wait 6', () => /chat width/i.test(document.querySelector('#pt-page .pt-chats-results .pt-list-row-title')?.textContent ?? ''), null, 8000);
            await page.locator('#pt-page .pt-chats-search input').press('Enter');
            await waitFor(page, 'wait 7', () => document.documentElement.dataset.ptPage === 'user-settings-button', null, 8000);
            await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]').click());
            await waitFor(page, 'wait 8', () => document.documentElement.dataset.ptPage === 'pt-chats');
            await page.locator('#pt-page .pt-search-box-clear').click();
            await waitFor(page, 'list back after Clear', () => [...document.querySelectorAll('#pt-page .pt-list-header')].some(el => el.textContent === 'Recent'));
        });

        await step(phone
            ? 'a row opens its chat over the Chats page; ‹ closes it and comes back'
            : 'a row opens its chat beside the list, marked Open now; home closes it and shows the welcome', async () => {
            await page.evaluate(openRow, 'Seraphina');
            await waitFor(page, 'wait 9', () => document.querySelectorAll('#chat .mes').length > 0 && document.querySelector('.pt-ab-title')?.textContent === 'Seraphina', null, 10000);
            await page.waitForTimeout(600);
            const opened = await page.evaluate(() => ({ page: document.documentElement.dataset.ptPage ?? '', now: document.querySelector('#pt-page .pt-chat-row--open .pt-rc-title')?.textContent }));
            if (phone ? opened.page !== '' : (opened.page !== 'pt-chats' || opened.now !== 'Seraphina')) throw new Error(JSON.stringify(opened));
            await page.screenshot({ path: `${OUT}/${layout}-opened.png` });
            await page.locator(phone ? '#pt-appbar .pt-ab-back' : '#pt-appbar .pt-ab-home').click();
            await waitFor(page, 'wait 10', () => SillyTavern.getContext().getCurrentChatId?.() === undefined && document.documentElement.dataset.ptPage === 'pt-chats', null, 8000);
            if (!phone) await waitFor(page, 'the welcome in the chat column', () => !!document.querySelector('#pt-no-chat .pt-welcome'));
        });

        if (!phone) {
            await step('the welcome offers Ask the Assistant and Choose a character, and Show chats while the list is hidden', async () => {
                await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]').click());
                await waitFor(page, 'wait 11', () => !document.documentElement.classList.contains('pt-page-open'));
                await page.waitForTimeout(300);
                const labels = await page.evaluate(() => [...document.querySelectorAll('#pt-no-chat .pt-welcome button')].map(el => el.textContent.trim()));
                await page.screenshot({ path: `${OUT}/${layout}-welcome.png` });
                if (labels.join() !== 'Ask the Assistant,Show chats,Choose a character') throw new Error(labels.join(', '));
                await page.locator('#pt-no-chat .pt-welcome button', { hasText: 'Show chats' }).click();
                await waitFor(page, 'wait 12', () => document.documentElement.dataset.ptPage === 'pt-chats');
            });

            await step('Ctrl+K focuses Search everything', async () => {
                await page.evaluate(() => document.activeElement?.blur?.());
                await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyK' : 'Control+KeyK');
                await waitFor(page, 'wait 13', () => document.activeElement?.closest?.('.pt-chats-search'));
            });
        }

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        await context.close();
    }
}

await removeChats(made).catch(error => console.log(`  (cleanup: ${error.message})`));
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
