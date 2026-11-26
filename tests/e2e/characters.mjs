// The Characters place (DESIGN.md → Cards → Character card; Key screens → Character page and editor), on a
// phone and on desktop: SillyTavern's list as a grid of picture cards, a character's page
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
        // SillyTavern keeps filters between visits: start from none, so every card is there.
        await page.evaluate(() => document.querySelector('#rm_characters_block .rm_tag_filter .clearAllFilters')?.click());
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

        await step('one toolbar (search, Filter, Sort and view, +); Favorites and "All characters" head the list; SillyTavern\'s pill row and favourites stay hidden', async () => {
            const top = await page.evaluate(() => ({
                tools: [...document.querySelectorAll('#pt_char_toolbar .pt-ctool')].map(node => node.getAttribute('aria-label')),
                pills: getComputedStyle(document.querySelector('#rm_characters_block .rm_tag_filter')).display,
                hotswap: getComputedStyle(document.getElementById('CharListButtonAndHotSwaps')).display,
                first: document.getElementById('rm_print_characters_block').firstElementChild?.id,
                headers: [...document.querySelectorAll('#pt_char_top .pt-list-header')].map(node => node.textContent),
                favorites: [...document.querySelectorAll('#pt_char_top .pt-quick-pick-name')].map(node => node.textContent),
                count: document.querySelector('#pt_char_top .pt-char-count-n')?.textContent,
                wanted: SillyTavern.getContext().characters.filter(character => character.fav === true || character.fav === 'true').length,
                total: SillyTavern.getContext().characters.length + (SillyTavern.getContext().groups?.length ?? 0),
            }));
            if (top.tools.join('|') !== 'Filter|Sort and view|Add and more') throw new Error(`tools: ${top.tools}`);
            if (top.pills !== 'none' || top.hotswap !== 'none' || top.first !== 'pt_char_top') throw new Error(JSON.stringify(top));
            if (top.favorites.length !== top.wanted || (top.wanted && top.headers[0] !== 'Favorites')) throw new Error(`favourites: ${JSON.stringify(top)}`);
            if (!top.headers.includes('All characters') || top.count !== String(top.total)) throw new Error(`header: ${JSON.stringify(top)}`);
        });

        await step('Filter: Favorites goes any → only through SillyTavern\'s own button, a chip shows it, and ✕ undoes it', async () => {
            await page.locator('#pt_char_toolbar .pt-ctool-filter').click();
            await waitFor(page, 'the Filter sheet', () => [...document.querySelectorAll('#pt-sheet .pt-list-row-title')].some(node => node.textContent === 'Favorites'));
            const rows = await page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-list-section')].map(section => section.querySelector('.pt-list-header')?.textContent ?? ''));
            if (!rows.includes('Show')) throw new Error(`sections: ${rows}`);
            await page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-list-row')].find(row => row.querySelector('.pt-list-row-title')?.textContent === 'Favorites').click());
            await waitFor(page, 'only favourites', () => document.querySelector('#rm_characters_block .rm_tag_filter .filterByFavorites')?.getAttribute('data-toggle-state') === 'SELECTED'
                && [...document.querySelectorAll('#pt-sheet .pt-list-row')].find(row => row.querySelector('.pt-list-row-title')?.textContent === 'Favorites')?.querySelector('.pt-list-row-value')?.textContent === 'Only');
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await waitFor(page, 'sheet closed', () => !document.getElementById('pt-sheet'));
            const bar = await page.evaluate(() => ({
                chips: [...document.querySelectorAll('#pt_char_filters .pt-filter-chip')].map(node => node.textContent.trim()),
                count: document.querySelector('#pt_char_toolbar .pt-ctool-filter')?.dataset.count,
                shown: [...document.querySelectorAll('#rm_print_characters_block > .character_select')].filter(card => getComputedStyle(card).display !== 'none').every(card => card.classList.contains('is_fav')),
            }));
            await page.screenshot({ path: `${OUT}/${layout}-filtered.png` });
            if (bar.chips.join() !== 'Favorites' || bar.count !== '1' || !bar.shown) throw new Error(JSON.stringify(bar));
            await page.locator('#pt_char_filters .pt-filter-chip').first().click();
            await waitFor(page, 'the filter undone', () => document.querySelector('#rm_characters_block .rm_tag_filter .filterByFavorites')?.getAttribute('data-toggle-state') === 'UNDEFINED' && !document.getElementById('pt_char_filters'));
        });

        await step("a right click (desktop) or long press (phone) on a card opens that character's menu, and nothing else happens", async () => {
            // The list may still be drawing itself again after the last filter.
            await page.waitForTimeout(800);
            const card = page.locator('#rm_print_characters_block > .character_select').filter({ hasText: 'Seraphina' }).first();
            await card.scrollIntoViewIfNeeded();
            if (phone) {
                const box = await card.boundingBox();
                const cdp = await page.context().newCDPSession(page);
                const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
                await page.waitForTimeout(700);
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await cdp.detach();
            } else await card.click({ button: 'right' });
            await waitFor(page, 'the card menu', () => document.querySelector('#pt-sheet [role="heading"]')?.textContent === 'Seraphina');
            const menu = await page.evaluate(() => ({
                rows: [...document.querySelectorAll('#pt-sheet .pt-list-row-title')].map(node => node.textContent),
                page: document.getElementById('pt-page')?.dataset.page ?? null,
            }));
            await page.screenshot({ path: `${OUT}/${layout}-card-menu.png` });
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await waitFor(page, 'menu closed', () => !document.getElementById('pt-sheet'));
            const want = ['Open their page', 'Chat', 'New chat', 'Edit', 'Lorebook', 'Duplicate', 'Export', 'Select several', 'Delete'];
            if (want.some(title => !menu.rows.includes(title)) || menu.page) throw new Error(JSON.stringify(menu));
            if (await page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() ?? null) !== before) throw new Error('the menu opened a chat');
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
            const links = await page.evaluate(() => ({
                lorebook: [...document.querySelectorAll('#pt-page .pt-list-row')].find(row => row.querySelector('.pt-list-row-title')?.textContent === 'Lorebook')?.querySelector('.pt-list-row-value')?.textContent ?? null,
                world: SillyTavern.getContext().characters.find(character => character.name === 'Seraphina')?.data?.extensions?.world || '',
            }));
            if (links.lorebook !== (links.world || 'None')) throw new Error(`the Lorebook row: ${JSON.stringify(links)}`);
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

        await step("in the editor the favourites row steps aside, and ‹ goes back to the character's page", async () => {
            await page.evaluate(tapCharacter, 'Seraphina');
            await waitFor(page, 'the page', () => document.getElementById('pt-page')?.dataset.page === 'pt-character');
            await page.locator('#pt-page .pt-character-actions .pt-button', { hasText: 'Edit' }).click();
            await waitFor(page, 'their card', () => document.getElementById('character_name_pole')?.value === 'Seraphina' && document.documentElement.classList.contains('pt-card-peek'));
            await page.waitForTimeout(400);
            const card = await page.evaluate(() => ({
                favorites: getComputedStyle(document.getElementById('CharListButtonAndHotSwaps')).display,
                back: getComputedStyle(document.querySelector('#pt-appbar .pt-ab-back')).display !== 'none',
            }));
            if (card.favorites !== 'none' || !card.back) throw new Error(JSON.stringify(card));
            await page.locator('#pt-appbar .pt-ab-back').click();
            await waitFor(page, "back on Seraphina's page", () => document.getElementById('pt-page')?.dataset.page === 'pt-character' && document.querySelector('#pt-page .pt-character-name')?.textContent === 'Seraphina' && !document.documentElement.classList.contains('pt-card-peek'));
            if (await page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() ?? null) !== before) throw new Error('going back changed the chat');
            await page.locator('#pt-appbar .pt-ab-back').click();
            await waitFor(page, 'the list', () => !document.getElementById('pt-page') && document.documentElement.dataset.ptPage === 'rightNavHolder');
        });

        await step(phone ? '‹ on the page goes back to the list' : 'Escape on the page goes back to the list', async () => {
            await page.evaluate(tapCharacter, 'Seraphina');
            await waitFor(page, 'the page again', () => document.getElementById('pt-page')?.dataset.page === 'pt-character');
            await page.waitForTimeout(300);
            if (phone) await page.locator('#pt-appbar .pt-ab-back').click();
            else await page.keyboard.press('Escape');
            await waitFor(page, 'the list', () => !document.getElementById('pt-page') && document.documentElement.dataset.ptPage === 'rightNavHolder');
        });

        await step("on their card, Lorebook, Duplicate and Delete work on them without opening their chat", async () => {
            const chatNow = () => page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() ?? null);
            const openCard = async () => {
                if (await page.evaluate(() => document.documentElement.classList.contains('pt-card-peek'))) return;
                await page.evaluate(tapCharacter, 'Seraphina');
                await waitFor(page, 'the page', () => document.getElementById('pt-page')?.dataset.page === 'pt-character');
                await page.locator('#pt-page .pt-character-actions .pt-button', { hasText: 'Edit' }).click();
                await waitFor(page, 'their card', () => document.getElementById('character_name_pole')?.value === 'Seraphina' && document.documentElement.classList.contains('pt-card-peek'));
                await page.waitForTimeout(400);
            };
            // SillyTavern's own question, answered No so nothing changes in the test data.
            const cancelPopup = async label => {
                await waitFor(page, label, () => !!document.querySelector('dialog.popup[open] .popup-button-cancel'));
                const text = await page.evaluate(() => document.querySelector('dialog.popup[open] .popup-content')?.textContent ?? '');
                await page.evaluate(() => document.querySelector('dialog.popup[open] .popup-button-cancel').click());
                await waitFor(page, `${label} closed`, () => !document.querySelector('dialog.popup[open]'));
                return text;
            };
            const start = await chatNow();
            await openCard();
            await page.evaluate(() => document.getElementById('world_button').click());
            await waitFor(page, 'the lorebook sheet', () => document.querySelector('#pt-sheet .pt-sheet-title, #pt-sheet [role="heading"]')?.textContent === 'Lorebook' && !!document.querySelector('#pt-sheet .pt-list-row'));
            const none = await page.evaluate(() => document.querySelector('#pt-sheet .pt-list-row-title')?.textContent);
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await waitFor(page, 'sheet closed', () => !document.getElementById('pt-sheet'));
            if (none !== 'None') throw new Error(`the lorebook sheet starts with ${none}`);
            await page.evaluate(() => document.getElementById('dupe_button').click());
            await cancelPopup('the duplicate question');
            await page.evaluate(() => document.getElementById('delete_button').click());
            const question = await cancelPopup('the delete question');
            if (!/Delete Seraphina\?/.test(question)) throw new Error(`delete asked: ${question}`);
            if (await chatNow() !== start) throw new Error('a card button opened their chat');
            if (!await page.evaluate(() => document.documentElement.classList.contains('pt-card-peek'))) throw new Error('the card closed');
        });

        await step("the card's New chat opens their chat and starts a new one (SillyTavern asks first)", async () => {
            const label = await page.evaluate(() => document.querySelector('.pt-card-go-chat')?.textContent.trim());
            if (label !== 'New chat') throw new Error(`the button says ${label}`);
            await page.locator('.pt-card-go-chat').click();
            await waitFor(page, "SillyTavern's new chat question in Seraphina's chat", () => SillyTavern.getContext().name2 === 'Seraphina' && !!document.querySelector('dialog.popup[open] .popup-button-cancel'), null, 12000);
            await page.evaluate(() => document.querySelector('dialog.popup[open] .popup-button-cancel').click());
            await waitFor(page, 'question closed', () => !document.querySelector('dialog.popup[open]'));
            await page.waitForTimeout(800);
            if (phone) {
                await page.evaluate(() => { document.querySelector('.pt-tabs-btn')?.click(); });
                await page.waitForTimeout(200);
            }
            await page.evaluate(() => document.querySelector('.pt-tab[data-tab="rightNavHolder"]').click());
            await waitFor(page, 'Characters again', () => document.documentElement.dataset.ptPage === 'rightNavHolder' && !document.getElementById('pt-page'));
            await page.waitForTimeout(500);
        });

        await step("Characters → Lorebooks → Characters switches each time, even with SillyTavern's Characters lock on", async () => {
            // Lorebooks is Pocket Tavern's own page: SillyTavern's Characters panel must close for it.
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
                for (const id of ['pt-lorebooks', 'rightNavHolder', 'pt-lorebooks', 'rightNavHolder']) {
                    await tap(id);
                    await waitFor(page, `${id} open alone`, want => {
                        const open = [...document.querySelectorAll('#top-settings-holder > .drawer > .drawer-content.openDrawer')].map(node => node.parentElement.id);
                        return document.documentElement.dataset.ptPage === want && (want.startsWith('pt-') ? open.length === 0 : open.length === 1 && open[0] === want);
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
