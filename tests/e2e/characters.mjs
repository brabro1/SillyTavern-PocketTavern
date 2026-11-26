// The Characters place (DESIGN.md → Cards → Character card; Key screens → Character page and editor), on a
// phone and on desktop: SillyTavern's list as a grid of picture cards, the A–Z strip, a character's page
// (nothing changes until you pick something), its ⋯, Edit without opening the chat, and Back. It changes
// no character. Test SillyTavern only.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/characters.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/characters';
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
    const state = await page.evaluate(() => ({ page: document.documentElement.dataset.ptPage ?? '', real: document.getElementById('pt-page')?.dataset.page ?? '', sheet: !!document.getElementById('pt-sheet'), pole: document.getElementById('character_name_pole')?.value }));
    throw new Error(`${label}: ${JSON.stringify(state)}`);
});

const tapCharacter = name => [...document.querySelectorAll('#rm_print_characters_block .character_select')].find(entry => entry.querySelector('.ch_name')?.textContent.trim() === name)?.click();

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
        // Start in a chat with someone other than Seraphina, so a chat switch would show.
        await page.evaluate(async () => {
            const context = SillyTavern.getContext();
            const other = context.characters.findIndex(character => character.name !== 'Seraphina');
            // A fresh SillyTavern has only Seraphina: then there is no other chat to start in.
            if (other !== -1) await context.selectCharacterById(String(other));
        });
        await page.waitForTimeout(1500);
        const before = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() ?? null);
        await page.evaluate(() => { document.querySelector('.pt-tabs-btn')?.click(); });
        await page.waitForTimeout(300);
        await page.evaluate(() => document.querySelector('.pt-tab[data-tab="rightNavHolder"]').click());
        await waitFor(page, 'Characters open', () => document.documentElement.dataset.ptPage === 'rightNavHolder' && document.querySelectorAll('#rm_print_characters_block .character_select').length > 0);
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${OUT}/${layout}-list.png` });

        await step('the list is a grid of picture cards (3:4, name at the bottom); 3 columns on a phone, columns at least 120px on desktop', async () => {
            const grid = await page.evaluate(() => {
                const cards = [...document.querySelectorAll('#rm_print_characters_block .character_select')].filter(card => card.getBoundingClientRect().height);
                const first = cards[0].getBoundingClientRect();
                const row = cards.filter(card => Math.abs(card.getBoundingClientRect().top - first.top) < 4);
                const picture = cards[0].querySelector('.avatar')?.getBoundingClientRect();
                return { grid: document.body.classList.contains('charListGrid'), columns: row.length, width: Math.round(first.width), ratio: picture ? +(picture.height / picture.width).toFixed(2) : 0, name: !!cards[0].querySelector('.ch_name')?.getBoundingClientRect().height };
            });
            if (!grid.grid || !grid.name) throw new Error(JSON.stringify(grid));
            const many = await page.evaluate(() => document.querySelectorAll('#rm_print_characters_block .character_select').length >= 3);
            if (phone ? (many && grid.columns !== 3) : grid.width < 120) throw new Error(`columns: ${JSON.stringify(grid)}`);
            if (grid.ratio < 1.2 || grid.ratio > 1.45) throw new Error(`picture ratio ${grid.ratio}`);
        });

        await step('an A–Z strip runs beside the list', async () => {
            if (await page.evaluate(() => SillyTavern.getContext().characters.length < 8)) return console.log('      (too few characters for an A–Z strip; checked with the full test data)');
            const strip = await page.evaluate(() => { const node = document.getElementById('pt_az'); return node ? { letters: node.childElementCount, shown: !!node.getBoundingClientRect().height } : null; });
            if (!strip?.shown || strip.letters < 3) throw new Error(JSON.stringify(strip));
        });

        await step('tapping a character opens their page, not their chat: picture, name, ★ and ⋯, Chat · New chat · Edit, and their chats', async () => {
            await page.evaluate(tapCharacter, 'Seraphina');
            await waitFor(page, 'the character page', () => document.getElementById('pt-page')?.dataset.page === 'pt-character' && !!document.querySelector('#pt-page .pt-chat-row'));
            const shown = await page.evaluate(() => ({
                name: document.querySelector('#pt-page .pt-character-name')?.textContent,
                title: document.querySelector('.pt-ab-title')?.textContent,
                picture: Math.round(document.querySelector('#pt-page .pt-avatar')?.getBoundingClientRect().width ?? 0),
                buttons: [...document.querySelectorAll('#pt-page .pt-character-title .pt-icon-button')].map(button => button.getAttribute('aria-label')),
                actions: [...document.querySelectorAll('#pt-page .pt-character-actions .pt-button')].map(button => button.textContent.trim()),
                back: getComputedStyle(document.querySelector('#pt-appbar .pt-ab-back')).display !== 'none',
            }));
            // After the page's fade-in, so screenshots compare cleanly.
            await page.waitForTimeout(400);
            await page.screenshot({ path: `${OUT}/${layout}-page.png` });
            if (shown.name !== 'Seraphina' || shown.picture !== 96 || shown.actions.join('|') !== 'Chat|New chat|Edit' || shown.buttons.length !== 2 || !shown.back) throw new Error(JSON.stringify(shown));
            if (await page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() ?? null) !== before) throw new Error('tapping a character switched chats');
        });

        await step("the page's ⋯ has Export, Duplicate, Lorebooks, External media, then Delete in red; Export offers PNG and JSON", async () => {
            await page.locator('#pt-page .pt-character-title .pt-icon-button').last().click();
            await waitFor(page, 'the menu', () => !!document.querySelector('#pt-sheet .pt-list-row'));
            const menu = await page.evaluate(() => ({
                rows: [...document.querySelectorAll('#pt-sheet .pt-list-row-title')].map(node => node.textContent),
                red: [...document.querySelectorAll('#pt-sheet .pt-list-row')].at(-1)?.classList.contains('pt-list-row--danger'),
            }));
            if (menu.rows.join('|') !== 'Export|Duplicate|Lorebooks|External media|Delete' || !menu.red) throw new Error(JSON.stringify(menu));
            await page.locator('#pt-sheet .pt-list-row', { hasText: 'Export' }).click();
            await waitFor(page, 'the export sheet', () => [...document.querySelectorAll('#pt-sheet .pt-list-row-title')].map(node => node.textContent).join() === 'PNG,JSON');
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await waitFor(page, 'sheet closed', () => !document.getElementById('pt-sheet'));
        });

        await step('Edit shows their card without opening their chat; leaving puts SillyTavern back on the open chat', async () => {
            await page.locator('#pt-page .pt-character-actions .pt-button', { hasText: 'Edit' }).click();
            await waitFor(page, 'their card', () => document.getElementById('character_name_pole')?.value === 'Seraphina' && document.documentElement.classList.contains('pt-card-peek') && document.documentElement.dataset.ptPage === 'rightNavHolder');
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${OUT}/${layout}-editor.png` });
            if (await page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() ?? null) !== before) throw new Error("Edit opened the character's chat");
            if (!await page.evaluate(() => !!document.getElementById('pt_card_tabs')?.getBoundingClientRect().height)) throw new Error('the card has no tabs');
            await page.evaluate(() => document.getElementById('rm_button_characters')?.click());
            await waitFor(page, 'back on the open chat', () => !document.documentElement.classList.contains('pt-card-peek') && document.getElementById('character_name_pole')?.value !== 'Seraphina');
        });

        await step(phone ? '‹ on the page goes back to the list' : 'Escape on the page goes back to the list', async () => {
            await page.evaluate(tapCharacter, 'Seraphina');
            await waitFor(page, 'the page again', () => document.getElementById('pt-page')?.dataset.page === 'pt-character');
            await page.waitForTimeout(300);
            if (phone) await page.locator('#pt-appbar .pt-ab-back').click();
            else await page.keyboard.press('Escape');
            await waitFor(page, 'the list', () => !document.getElementById('pt-page') && document.documentElement.dataset.ptPage === 'rightNavHolder');
        });

        await step("Characters → Lorebooks → Characters switches each time, even with SillyTavern's Characters lock on", async () => {
            const lock = await page.evaluate(() => document.getElementById('rm_button_panel_pin')?.checked ?? null);
            const pin = on => page.evaluate(value => { const box = document.getElementById('rm_button_panel_pin'); if (box && box.checked !== value) { box.checked = value; jQuery(box).trigger('change'); } }, on);
            const tap = async id => {
                await page.evaluate(() => { document.querySelector('.pt-tabs-btn')?.click(); });
                await page.waitForTimeout(200);
                await page.locator(`.pt-tab[data-tab="${id}"]`).click();
            };
            try {
                if (lock !== null) await pin(true);
                await page.waitForTimeout(300);
                // Characters is open already (tapping it again would hide it on desktop).
                for (const id of ['WI-SP-button', 'rightNavHolder', 'WI-SP-button', 'rightNavHolder']) {
                    await tap(id);
                    await waitFor(page, `${id} open alone`, want => {
                        const open = [...document.querySelectorAll('#top-settings-holder > .drawer > .drawer-content.openDrawer')].map(node => node.parentElement.id);
                        return document.documentElement.dataset.ptPage === want && open.length === 1 && open[0] === want;
                    }, id);
                    await page.waitForTimeout(300);
                }
            } finally {
                if (lock !== null) await pin(lock);
            }
        });

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        await context.close();
    }
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
