// The chat (DESIGN.md → Key screens → The chat), on a phone and on desktop: the header, messages and
// their actions, versions, thinking, long messages, code, Jump to latest, and the placeholders while a
// chat loads. It works in a throwaway chat with Seraphina, filled with test messages, and deletes that
// chat afterwards (through SillyTavern's own functions). Test SillyTavern only.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/chat.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/chat';
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

/** A new chat with Seraphina, filled with messages like a real chat's. Returns what is needed to clean up. */
async function makeTestChat(page) {
    return page.evaluate(async () => {
        const context = SillyTavern.getContext();
        const id = context.characters.findIndex(character => character.name === 'Seraphina');
        if (String(context.characterId) !== String(id)) await context.selectCharacterById(String(id));
        await new Promise(resolve => setTimeout(resolve, 800));
        const before = context.getCurrentChatId();
        const script = await import('/script.js');
        await script.doNewChat();
        await new Promise(resolve => setTimeout(resolve, 800));
        const file = context.getCurrentChatId();
        const now = Date.now();
        const user = context.name1;
        const bot = context.characters[id].name;
        const message = (fields, minutes) => ({ name: fields.is_user ? user : bot, is_user: false, is_system: false, send_date: new Date(now - minutes * 60000).toISOString(), extra: {}, ...fields });
        const long = Array.from({ length: 70 }, (_, i) => `Line ${i + 1}: the road wound on through the hills, past farms and a mill by the river.`).join('\n');
        const messages = [
            message({ is_user: true, mes: long }, 9),
            message({ mes: 'Here is the map code:\n```js\nconst route = ' + JSON.stringify('north-'.repeat(60)) + ';\n```\n\n| Day | Miles |\n|---|---|\n| 1 | 12 |\n| 2 | 15 |' }, 8),
            message({ is_user: true, mes: 'What do you think?' }, 7),
            message({ mes: 'We should rest by the river tonight.', extra: { reasoning: 'They walked far today. The river is close and safe; suggest resting there.', reasoning_duration: 4200 } }, 6),
            message({ is_user: true, mes: 'Tell me a story.' }, 5),
            message({ mes: 'Version two of the story.', swipes: ['Version one of the story.', 'Version two of the story.', 'Version three of the story.'], swipe_id: 1, swipe_info: [{}, {}, {}] }, 4),
        ];
        for (const item of messages) {
            context.chat.push(item);
            context.addOneMessage(item);
        }
        await context.saveChat();
        // Drawn again by SillyTavern, as when the chat is opened.
        await context.reloadCurrentChat();
        return { id, before, file };
    });
}

async function removeTestChat(page, made) {
    if (!made?.file) return;
    await page.evaluate(async ({ id, before, file }) => {
        const context = SillyTavern.getContext();
        if (before && before !== file) await context.openCharacterChat(before);
        else await (await import('/script.js')).doNewChat();
        await new Promise(resolve => setTimeout(resolve, 800));
        await (await import('/script.js')).deleteCharacterChatByName(String(id), file);
    }, made);
}

for (const layout of ['phone', 'desktop']) {
    const phone = layout === 'phone';
    const context = await browser.newContext(phone
        ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) errors.push(error.message); });
    await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('pt-on') && SillyTavern.getContext().characters.length, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
    console.log(`${layout}:`);
    let made = null;
    try {
        made = await makeTestChat(page);
        await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length >= 6);
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${OUT}/${layout}-chat.png` });

        await step('the header is ‹ (phone) or home (desktop), the name and ⋯; no connection state', async () => {
            const header = await page.evaluate(() => {
                const shown = selector => { const el = document.querySelector(`#pt-appbar ${selector}`); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
                return { back: shown('.pt-ab-back'), home: shown('.pt-ab-home'), menu: shown('.pt-ab-menu'), title: document.querySelector('.pt-ab-title')?.textContent, sub: document.querySelector('.pt-ab-sub')?.textContent ?? '' };
            });
            if (header.back !== phone || header.home !== !phone || !header.menu || header.title !== 'Seraphina' || header.sub) throw new Error(JSON.stringify(header));
        });

        await step('a message has its header, the text across the width, ✎ and ⋯', async () => {
            const mes = await page.evaluate(() => {
                const node = [...document.querySelectorAll('#chat .mes')].at(-2);
                const text = node.querySelector('.mes_text').getBoundingClientRect();
                const card = node.getBoundingClientRect();
                return { edit: !!node.querySelector('.mes_edit'), more: !!node.querySelector('.extraMesButtonsHint'), name: node.querySelector('.name_text')?.textContent.trim(), share: text.width / card.width };
            });
            if (!mes.edit || !mes.more || !mes.name || mes.share < 0.8) throw new Error(JSON.stringify(mes));
        });

        if (!phone) {
            await step('with a mouse, ✎ and ⋯ stay quiet until the message is hovered', async () => {
                await page.mouse.move(5, 450);
                await page.waitForTimeout(300);
                const quiet = await page.evaluate(() => Number(getComputedStyle([...document.querySelectorAll('#chat .mes')].at(-2).querySelector('.extraMesButtonsHint')).opacity));
                const spot = await page.evaluate(() => { const r = [...document.querySelectorAll('#chat .mes')].at(-2).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; });
                await page.mouse.move(spot.x, spot.y);
                await page.waitForTimeout(300);
                const shown = await page.evaluate(() => Number(getComputedStyle([...document.querySelectorAll('#chat .mes')].at(-2).querySelector('.extraMesButtonsHint')).opacity));
                const hovered = await page.evaluate(({ x, y }) => ({ over: document.elementFromPoint(x, y)?.closest('.mes')?.getAttribute('mesid'), want: [...document.querySelectorAll('#chat .mes')].at(-2).getAttribute('mesid'), hover: [...document.querySelectorAll('#chat .mes:hover')].map(n => n.getAttribute('mesid')) }), spot);
                if (!(quiet < 0.5) || !(shown > 0.6)) throw new Error(`opacity ${quiet} → ${shown} ${JSON.stringify(hovered)}`);
            });
        }

        await step('⋯ on a message opens its menu', async () => {
            await page.evaluate(() => [...document.querySelectorAll('#chat .mes')].at(-2).querySelector('.extraMesButtonsHint').click());
            await page.waitForFunction(() => document.querySelectorAll('#pt-sheet .pt-menu-row, #pt-sheet .pt-list-row').length > 0, null, { timeout: 5000 });
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await page.waitForFunction(() => !document.getElementById('pt-sheet'));
        });

        await step('the last reply shows its versions: ‹, 2/3 and › as 32px buttons with a 44px tap; ‹ goes to 1/3', async () => {
            const versions = await page.evaluate(() => {
                const last = document.querySelector('#chat .mes.last_mes');
                const box = selector => { const el = last.querySelector(selector); if (!el || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); };
                const tap = selector => { const el = last.querySelector(selector); const after = getComputedStyle(el, '::after'); const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height) - 2 * Math.min(parseFloat(after.top) || 0, parseFloat(after.left) || 0)); };
                return { left: box('.swipe_left'), right: box('.swipe_right'), count: last.querySelector('.swipes-counter')?.textContent.replace(/[​\s]/g, ''), tapLeft: tap('.swipe_left') };
            });
            if (versions.left < 30 || versions.right < 30 || versions.count !== '2/3' || versions.tapLeft < 44) throw new Error(JSON.stringify(versions));
            await page.evaluate(() => document.querySelector('#chat .mes.last_mes .swipe_left').click());
            await page.waitForFunction(() => (document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent ?? '').replace(/[​\s]/g, '') === '1/3'
                && document.querySelector('#chat .mes.last_mes .mes_text')?.textContent.includes('Version one'), null, { timeout: 5000 });
        });

        await step('thinking is a closed box that opens with a tap; while thinking, its title breathes', async () => {
            const closed = await page.evaluate(() => {
                const box = [...document.querySelectorAll('#chat .mes .mes_reasoning_details')].find(box => box.textContent.includes('river is close'));
                return box ? !box.open : null;
            });
            if (closed !== true) throw new Error(`thinking box closed: ${closed}`);
            const seen = await page.evaluate(() => { const box = [...document.querySelectorAll('#chat .mes .mes_reasoning_details')].find(item => item.textContent.includes('river is close')); return { display: getComputedStyle(box).display, mes: box.closest('.mes').getAttribute('mesid'), height: Math.round(box.getBoundingClientRect().height) }; });
            if (seen.display === 'none' || !seen.height) throw new Error(`the thinking box is not shown: ${JSON.stringify(seen)}`);
            // A real tap, at the end of the row where the arrow is (the whole row opens it).
            const row = await page.evaluate(() => { const r = [...document.querySelectorAll('#chat .mes .mes_reasoning_details')].find(box => box.textContent.includes('river is close')).querySelector('.mes_reasoning_summary').getBoundingClientRect(); return { x: r.right - 12, y: r.top + r.height / 2 }; });
            await page.mouse.click(row.x, row.y);
            await page.waitForFunction(() => [...document.querySelectorAll('#chat .mes .mes_reasoning_details')].find(box => box.textContent.includes('river is close'))?.open, null, { timeout: 3000 });
            const breathing = await page.evaluate(() => {
                const box = [...document.querySelectorAll('#chat .mes .mes_reasoning_details')].find(box => box.textContent.includes('river is close'));
                box.dataset.state = 'thinking';
                const name = getComputedStyle(box.querySelector('.mes_reasoning_header_title')).animationName;
                delete box.dataset.state;
                return name;
            });
            if (!breathing || breathing === 'none') throw new Error('the title does not breathe while thinking');
            await page.mouse.click(row.x, row.y);
        });

        await step('a long older message folds with Show more; code and tables scroll inside themselves', async () => {
            const state = await page.evaluate(() => {
                const long = document.querySelector('#chat .mes.pt-long');
                const pre = document.querySelector('#chat .mes .mes_text pre');
                const table = document.querySelector('#chat .mes .mes_text table');
                return {
                    long: !!long,
                    more: !!long?.querySelector('.pt-more-btn'),
                    pre: pre ? { scroll: [pre, pre.querySelector('code')].some(el => el && el.scrollWidth > el.clientWidth + 1), overflow: getComputedStyle(pre).overflowX, wrap: getComputedStyle(pre.querySelector('code') ?? pre).whiteSpace, copy: !!pre.querySelector('.pt-code-copy') } : null,
                    table: table ? getComputedStyle(table).overflowX : null,
                    pageWide: document.scrollingElement.scrollWidth > window.innerWidth + 1,
                };
            });
            if (!state.long || !state.more) throw new Error(`fold: ${JSON.stringify(state)}`);
            if (!state.pre || state.pre.overflow !== 'auto' || !state.pre.scroll || !state.pre.copy || state.table !== 'auto' || state.pageWide) throw new Error(`code: ${JSON.stringify(state)}`);
            await page.evaluate(() => document.querySelector('#chat .mes.pt-long .pt-more-btn').click());
            await page.waitForFunction(() => document.querySelector('#chat .mes.pt-long')?.classList.contains('pt-long-open'));
            await page.evaluate(() => document.querySelector('#chat .mes.pt-long .pt-more-btn').click());
        });

        await step('Focus mode hides chrome cleanly and toggles off again; + shows quick-switch chips', async () => {
            await page.locator('.pt-plus-btn').click();
            await page.waitForFunction(() => !!document.querySelector('#pt-sheet .pt-plus-quick-chip'), null, { timeout: 5000 });
            await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await page.waitForFunction(() => !document.getElementById('pt-sheet'));
            if (phone) {
                await page.locator('#pt-appbar .pt-ab-menu').click();
                await page.waitForFunction(() => [...document.querySelectorAll('#pt-sheet .pt-list-row-title')].some(n => n.textContent === 'Focus mode'));
                await page.locator('#pt-sheet .pt-list-row', { hasText: 'Focus mode' }).click();
                await page.waitForFunction(() => document.documentElement.classList.contains('pt-focus-mode') && getComputedStyle(document.getElementById('pt-focus-exit')).display !== 'none');
                await page.locator('#pt-focus-exit').click();
                await page.waitForFunction(() => !document.documentElement.classList.contains('pt-focus-mode'));
            } else {
                await page.locator('#pt-appbar .pt-ab-focus').click();
                await page.waitForFunction(() => document.documentElement.classList.contains('pt-focus-mode') && getComputedStyle(document.getElementById('pt-tabbar')).display === 'none');
                await page.keyboard.press('Escape');
                await page.waitForFunction(() => !document.documentElement.classList.contains('pt-focus-mode'));
            }
        });

        await step('Jump to latest appears when you scroll up and takes you to the end', async () => {
            // The long message unfolded, so the chat is well taller than the screen.
            await page.evaluate(() => { const long = document.querySelector('#chat .mes.pt-long'); if (long && !long.classList.contains('pt-long-open')) long.querySelector('.pt-more-btn').click(); });
            await page.waitForTimeout(300);
            await page.evaluate(() => { const chat = document.getElementById('chat'); chat.scrollTop = 0; chat.dispatchEvent(new Event('scroll')); });
            await page.waitForFunction(() => document.querySelector('.pt-jump')?.classList.contains('pt-jump-on'), null, { timeout: 5000 });
            await page.screenshot({ path: `${OUT}/${layout}-jump.png` });
            await page.evaluate(() => document.querySelector('.pt-jump').click());
            await page.waitForFunction(() => { const chat = document.getElementById('chat'); return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40; }, null, { timeout: 5000 });
        });

        await step('a chat that takes a moment to load shows still placeholders outside #chat, above the message box, then fades them', async () => {
            await page.evaluate(() => { const chat = document.getElementById('chat'); window.__ptSaved = [...chat.children]; chat.replaceChildren(); });
            try {
                if (await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve(!!document.querySelector('.pt-chat-loading')), 120)))) throw new Error('placeholders showed before 300ms');
                await page.waitForFunction(() => !!document.querySelector('body > .pt-chat-loading .pt-chat-loading-mes'), null, { timeout: 2000 });
                await page.screenshot({ path: `${OUT}/${layout}-loading.png` });
                const box = await page.evaluate(() => {
                    const layer = document.querySelector('.pt-chat-loading').getBoundingClientRect();
                    const form = document.getElementById('form_sheld').getBoundingClientRect();
                    return { bottom: Math.round(layer.bottom), formTop: Math.round(form.top) };
                });
                if (box.bottom > box.formTop + 1) throw new Error(`placeholders cover the message box: ${JSON.stringify(box)}`);
            } finally {
                await page.evaluate(() => document.getElementById('chat').append(...window.__ptSaved));
            }
            await page.waitForFunction(() => !document.querySelector('.pt-chat-loading'), null, { timeout: 2000 });
        });

        await step('RP formatting bar appears when focusing the message box and wraps text cleanly', async () => {
            try {
                await page.locator('#send_textarea').click();
                await page.waitForFunction(() => {
                    const bar = document.getElementById('pt-format-bar');
                    return !!bar && !bar.hidden && bar.querySelectorAll('.pt-fmt-btn').length === 4;
                }, null, { timeout: 5000 });
                await page.locator('#pt-format-bar .pt-fmt-btn[data-fmt="italic"]').click();
                const val = await page.locator('#send_textarea').inputValue();
                if (val !== '**') throw new Error(`unexpected formatted value: ${JSON.stringify(val)}`);
            } finally {
                await page.evaluate(() => {
                    const box = document.getElementById('send_textarea');
                    if (box) { box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); box.blur(); }
                });
            }
        });

        await step('Story Moments pins a message, jumps from Pinned messages, and Chat insights shows local stats', async () => {
            try {
                // Pin the last message via its ⋯ menu.
                await page.evaluate(() => document.querySelector('#chat .mes.last_mes .extraMesButtonsHint')?.click());
                await page.waitForFunction(() => !!document.querySelector('#pt-sheet.pt-sheet-open .pt-menu-row'), null, { timeout: 5000 });
                await page.locator('#pt-sheet .pt-menu-row', { hasText: 'Pin message' }).click();
                await page.waitForFunction(() => !!document.querySelector('#chat .mes.last_mes.pt-mes-pinned'), null, { timeout: 5000 });
                // Open Chat ⋯ → Pinned messages and verify the pin is listed, then unpin it cleanly.
                await page.locator('#pt-appbar .pt-ab-menu').click();
                await page.waitForFunction(() => !!document.querySelector('#pt-sheet.pt-sheet-open .pt-list-row'), null, { timeout: 5000 });
                await page.locator('#pt-sheet .pt-list-row', { hasText: 'Pinned messages' }).click();
                await page.waitForFunction(() => document.querySelectorAll('#pt-sheet .pt-pin-row').length >= 1, null, { timeout: 5000 });
                await page.locator('#pt-sheet .pt-pin-row .pt-icon-btn').first().click();
                await page.waitForFunction(() => !document.querySelector('#chat .mes.pt-mes-pinned'), null, { timeout: 5000 });
                await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
                await page.waitForFunction(() => !document.getElementById('pt-sheet'), null, { timeout: 5000 });
                // Open Chat ⋯ → Chat insights and verify KPIs + voice balance render.
                await page.locator('#pt-appbar .pt-ab-menu').click();
                await page.waitForFunction(() => !!document.querySelector('#pt-sheet.pt-sheet-open .pt-list-row'), null, { timeout: 5000 });
                await page.locator('#pt-sheet .pt-list-row', { hasText: 'Chat insights' }).click();
                await page.waitForFunction(() => document.querySelectorAll('#pt-sheet .pt-insight-card').length === 3 && !!document.querySelector('#pt-sheet .pt-insight-bar'), null, { timeout: 5000 });
                await page.waitForTimeout(300);
                await page.screenshot({ path: `${OUT}/${layout}-insights.png` });
                await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
                await page.waitForFunction(() => !document.getElementById('pt-sheet'), null, { timeout: 5000 });
            } finally {
                await page.evaluate(() => {
                    const s = SillyTavern.getContext().extensionSettings.mobileUI;
                    if (s?.pinnedMessages) { s.pinnedMessages = {}; SillyTavern.getContext().saveSettingsDebounced(); }
                    document.querySelector('#pt-sheet .pt-overlay-close')?.click();
                }).catch(() => {});
            }
        });

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        await removeTestChat(page, made).catch(error => console.log(`  (cleanup: ${error.message})`));
        await context.close();
    }
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
