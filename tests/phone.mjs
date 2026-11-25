// Opens SillyTavern as a phone (Pixel 7) and walks through Pocket Tavern's main
// features. Needs a running SillyTavern with Pocket Tavern installed:
//   ST_URL=http://127.0.0.1:8000 node phone.mjs
// Set CHROME_CHANNEL=chrome to use an installed Chrome instead of Playwright's.
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const ST_URL = process.env.ST_URL ?? 'http://127.0.0.1:8000';
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || undefined });
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();

const extensionErrors = [];
page.on('pageerror', error => {
    if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) extensionErrors.push(error.message);
});

let failed = 0;
async function step(name, run) {
    try {
        await run();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failed++;
        console.log(`  ✗ ${name}\n      ${String(error.message ?? error).split('\n')[0]}`);
        await mkdir('results', { recursive: true });
        await page.screenshot({ path: `results/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` }).catch(() => {});
    }
}

const until = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const closeSheet = async () => {
    await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
    await until(() => !document.getElementById('pt-sheet'));
};
// In a chat the tabs are tucked away; the arrow in the message box brings them back.
// A page that was just closed may still be sliding away, and the tabs tuck only once it is
// gone; checking too early skipped the arrow and the next tab tap hit a hidden bar.
const showTabs = async () => {
    const shown = () => page.evaluate(() => {
        const root = document.documentElement;
        const bar = document.getElementById('pt-tabbar');
        return !root.classList.contains('pt-tabs-tucked') && !!bar && getComputedStyle(bar).visibility === 'visible' && !root.dataset.ptPage;
    });
    for (let attempt = 0; attempt < 3; attempt++) {
        await page.waitForTimeout(450);
        if (await page.evaluate(() => document.documentElement.classList.contains('pt-tabs-tucked'))) {
            await page.locator('.pt-tabs-btn').click();
            await until(() => !document.documentElement.classList.contains('pt-tabs-tucked'));
        }
        await page.waitForTimeout(250);
        if (await shown() || await page.evaluate(() => !!document.documentElement.dataset.ptPage)) return;
    }
    throw new Error('the tabs did not come back');
};
const setPref = async (id, value) => {
    await page.evaluate(([selectId, choice]) => {
        const select = document.getElementById(selectId);
        select.value = choice;
        select.dispatchEvent(new Event('change'));
    }, [id, value]);
    await page.waitForTimeout(400);
};
// How far the newest message reaches under the message box (0 or less: not covered).
const lastMessageCovered = () => page.evaluate(async () => {
    const chat = document.getElementById('chat');
    chat.scrollTo(0, chat.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 400));
    const last = [...chat.querySelectorAll('.mes')].pop();
    return last.getBoundingClientRect().bottom - document.getElementById('send_form').getBoundingClientRect().top;
});
// GitHub's check runs a fresh SillyTavern (one character, no chats). Steps that need more make it
// (test data only) and the last step removes whatever was made.
const madeCharacters = [];
const ensureCharacters = async list => {
    const made = await page.evaluate(async wanted => {
        const st = await import('/script.js');
        const out = [];
        for (const [name, first] of wanted) {
            if (SillyTavern.getContext().characters.some(c => c.name === name)) continue;
            const response = await fetch('/api/characters/create', { method: 'POST', headers: st.getRequestHeaders(), body: JSON.stringify({ ch_name: name, first_mes: first }) });
            if (!response.ok) throw new Error(`could not add ${name}: ${response.status}`);
            out.push((await response.text()).trim());
        }
        if (out.length) await st.getCharacters();
        return out;
    }, list);
    madeCharacters.push(...made);
    return made;
};
const removeCharacters = avatars => page.evaluate(async list => {
    const st = await import('/script.js');
    for (const avatar of list) await fetch('/api/characters/delete', { method: 'POST', headers: st.getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, delete_chats: true }) });
    await st.getCharacters();
}, avatars);
// Opens a character's chat and saves it, so it shows in Recent chats and Chat history.
const ensureChat = name => page.evaluate(async who => {
    const context = SillyTavern.getContext();
    const id = context.characters.findIndex(x => x.name === who);
    if (String(context.characterId) !== String(id) || context.groupId) await context.selectCharacterById(String(id));
    await new Promise(resolve => setTimeout(resolve, 1000));
    await SillyTavern.getContext().saveChat?.();
}, name);
const dismissPopups = async () => {
    for (let i = 0; i < 5; i++) {
        const open = await page.evaluate(() => {
            const popup = [...document.querySelectorAll('dialog.popup[open]')].pop();
            if (!popup) return false;
            (popup.querySelector('.popup-button-cancel:not(.displayNone)') ?? popup.querySelector('.popup-button-ok'))?.click();
            return true;
        });
        if (!open) return;
        await page.waitForTimeout(500);
    }
};

console.log(`Pocket Tavern phone test on ${ST_URL}\n`);

await step('Pocket Tavern turns on for a phone', async () => {
    await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
    await until(() => document.documentElement.classList.contains('pt-on'), null, 60000);
    await page.waitForTimeout(2500);
    await dismissPopups();
    // After an update, What's new opens once; close it so it does not cover the screen.
    if (await page.locator('#pt-sheet').count()) await closeSheet();
});

await step('top bar and five tabs are shown', async () => {
    await page.locator('#pt-appbar').waitFor({ state: 'visible' });
    // The desktop rail's extra pages are in the bar too, hidden on a phone.
    const tabs = await page.locator('.pt-tab:visible').count();
    if (tabs !== 5) throw new Error(`found ${tabs} tabs`);
});

await step('each tab opens its page and Chat goes back', async () => {
    for (const id of ['rightNavHolder', 'WI-SP-button', 'ai-config-button']) {
        await page.locator(`.pt-tab[data-tab="${id}"]`).click();
        await until(want => document.documentElement.dataset.ptPage === want, id);
    }
    await page.locator('.pt-tab[data-tab="chat"]').click();
    await until(() => !document.documentElement.dataset.ptPage);
});

await step('back gesture closes a page', async () => {
    await page.locator('.pt-tab[data-tab="ai-config-button"]').click();
    await until(() => document.documentElement.dataset.ptPage === 'ai-config-button');
    await page.waitForTimeout(600);
    await page.goBack();
    await until(() => !document.documentElement.dataset.ptPage);
});

await step('More sheet lists pages and helpers', async () => {
    await page.locator('.pt-tab[data-tab="more"]').click();
    await until(() => document.querySelectorAll('#pt-sheet .pt-tile').length >= 4);
    const rows = await page.locator('#pt-sheet .pt-menu-row').allInnerTexts();
    for (const want of ['Themes', 'Phone features', 'Quick switch', "What's new"]) {
        if (!rows.some(row => row.includes(want))) throw new Error(`missing "${want}"`);
    }
    await closeSheet();
});

await step('a theme can be picked and undone', async () => {
    await page.locator('.pt-tab[data-tab="more"]').click();
    await page.locator('#pt-sheet .pt-menu-row-theme').click();
    await page.locator('#pt-sheet .pt-theme-card[data-theme="midnight"]').click();
    await until(() => document.documentElement.dataset.ptTheme === 'midnight');
    await page.locator('#pt-sheet .pt-theme-card[data-theme="st"]').click();
    await until(() => !document.documentElement.dataset.ptTheme);
    await closeSheet();
});

await step('message menu opens from ⋯', async () => {
    await page.evaluate(() => [...document.querySelectorAll('#chat .mes .extraMesButtonsHint')].filter(el => el.offsetParent).pop()?.click());
    await until(() => document.querySelectorAll('#pt-sheet .pt-menu-row').length > 0);
    await closeSheet();
});

await step('picture viewer opens from an avatar and closes with back', async () => {
    await page.evaluate(() => [...document.querySelectorAll('#chat .mes .avatar')].filter(el => el.offsetParent).pop()?.click());
    await until(() => document.querySelector('dialog.pt-viewer')?.open);
    await page.waitForTimeout(400);
    await page.goBack();
    await until(() => !document.querySelector('dialog.pt-viewer'));
});

await step("a character's animated picture that no longer exists falls back to its normal picture", async () => {
    // Before: SillyTavern swapped the failed picture for its crossed-out "missing picture" icon.
    const was = await page.evaluate(async () => {
        if (SillyTavern.getContext().characterId === undefined) await SillyTavern.getContext().selectCharacterById('0');
        const c = SillyTavern.getContext();
        const s = c.extensionSettings.mobileUI;
        const character = c.characters[c.characterId];
        const before = { animated: s.animatedPictures, link: character.data.extensions.pt_animated_avatar };
        s.animatedPictures = true;
        character.data.extensions.pt_animated_avatar = '/user/files/deleted-test-picture.gif';
        await c.reloadCurrentChat();
        return before;
    });
    try {
        await page.waitForTimeout(2500);
        const r = await page.evaluate(() => [...document.querySelectorAll('#chat .mes[is_user="false"]')].map(m => ({ missing: !!m.querySelector('.missing-avatar'), src: m.querySelector('.avatar img')?.getAttribute('src') ?? '' })));
        if (!r.length) throw new Error('no AI messages to check');
        const bad = r.filter(m => m.missing || m.src.includes('deleted-test-picture'));
        if (bad.length) throw new Error(JSON.stringify(bad));
    } finally {
        await page.evaluate(async before => {
            const c = SillyTavern.getContext();
            c.extensionSettings.mobileUI.animatedPictures = before.animated;
            c.characters[c.characterId].data.extensions.pt_animated_avatar = before.link;
            await c.reloadCurrentChat();
        }, was);
        await page.waitForTimeout(1000);
    }
});

await step('quick switch shows persona and connection', async () => {
    await page.locator('.pt-ab-quick').click();
    const rows = await page.locator('#pt-sheet .pt-menu-row').allInnerTexts();
    if (!rows.some(row => row.includes('Persona'))) throw new Error('no Persona row');
    await closeSheet();
});

await step('Translate chat is offered (greyed out until a chat is open)', async () => {
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="more"]').click());
    const row = page.locator('#pt-sheet .pt-menu-row', { hasText: 'Translate chat' });
    await row.waitFor();
    const inChat = await page.evaluate(() => !!(SillyTavern.getContext().groupId || SillyTavern.getContext().characterId !== undefined));
    if (inChat === (await row.isDisabled())) throw new Error('row enabled state does not match whether a chat is open');
    await closeSheet();
});

await step('message box: persona button, context ring and Context page; search this chat', async () => {
    // Needs a character chat; open the first character if none is open.
    await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined && !context.groupId && context.characters.length) await context.selectCharacterById('0');
    });
    const inChat = await page.evaluate(() => SillyTavern.getContext().characterId !== undefined);
    if (!inChat) throw new Error('no character to open');
    await until(() => document.querySelectorAll('#chat .mes').length > 0);
    await until(() => document.querySelector('#leftSendForm .pt-persona-chip img') && document.querySelector('#rightSendForm .pt-ctx-ring'));
    await page.locator('.pt-ctx-ring').click();
    await until(() => document.querySelector('#pt-sheet .pt-ctx-hero'));
    await closeSheet();
    // Your persona: edit the description quickly, check it saved, then put it back.
    const before = await page.evaluate(() => SillyTavern.getContext().powerUserSettings.persona_description ?? '');
    try {
    for (const text of ['Pocket Tavern test description', before]) {
        await page.locator('.pt-persona-chip').click();
        await until(() => document.querySelector('#pt-sheet .pt-persona-card-edit'));
        await page.locator('#pt-sheet .pt-persona-card-edit').click();
        await until(() => document.querySelector('#pt-sheet .pt-pe-text'));
        // Tap the box first, like a person: the editor opens without the keyboard.
        await page.locator('#pt-sheet .pt-pe-text').tap();
        await page.locator('#pt-sheet .pt-pe-text').fill(text);
        await page.locator('#pt-sheet .pt-pe-save').click();
        await until(() => !document.getElementById('pt-sheet'));
        const saved = await page.evaluate(() => SillyTavern.getContext().powerUserSettings.persona_description ?? '');
        if (saved !== text) throw new Error(`persona description not saved (got "${saved.slice(0, 30)}")`);
    }
    } finally {
        // Whatever happened above, leave the persona as it was.
        await page.evaluate(async original => {
            const box = document.getElementById('persona_description');
            if (!box || box.value === original) return;
            box.value = original;
            box.dispatchEvent(new Event('input', { bubbles: true }));
            await SillyTavern.getContext().saveSettings?.();
        }, before);
        if (await page.locator('#pt-sheet').count()) await closeSheet();
    }
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="more"]').click());
    await page.locator('#pt-sheet .pt-menu-row', { hasText: 'Search this chat' }).click();
    await until(() => document.querySelector('.pt-chat-finder input'));
    const word = await page.evaluate(() => document.querySelector('#chat .mes .mes_text')?.textContent.match(/[A-Za-z]{3,}/)?.[0] ?? 'the');
    await page.locator('.pt-chat-finder input').fill(word);
    await until(() => document.querySelectorAll('mark.pt-find-mark').length > 0);
    await page.goBack();
    await until(() => !document.querySelector('.pt-chat-finder') && !document.querySelector('mark.pt-find-mark'));
});

await step('tapping the text of a reply does not change its version', async () => {
    await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined && context.characters.length) await context.selectCharacterById('0');
    });
    await until(() => document.querySelectorAll('#chat .mes').length > 0);
    const original = await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        const id = context.chat.length - 1;
        const message = context.chat[id];
        const before = structuredClone(message);
        // Three versions, showing the second (only in this page; nothing is saved meanwhile).
        window.__ptSave = [context.saveChat, context.saveChatDebounced];
        context.saveChat = async () => {};
        context.saveChatDebounced = () => {};
        message.swipes = [message.mes, 'Second version, long enough to tap in the middle of its text.', 'Third version.'];
        message.swipe_info = [{}, {}, {}];
        message.swipe_id = 1;
        message.mes = message.swipes[1];
        context.updateMessageBlock(id, message);
        (await import('/script.js')).refreshSwipeButtons?.();
        document.getElementById('chat').scrollTo(0, 1e9);
        return before;
    });
    await page.waitForTimeout(600);
    const text = await page.locator('#chat .mes.last_mes .mes_text').boundingBox();
    await page.touchscreen.tap(text.x + text.width / 2, text.y + text.height / 2);
    await page.waitForTimeout(800);
    const afterTap = await page.evaluate(() => SillyTavern.getContext().chat.at(-1).swipe_id);
    // Put the message back as it was.
    await page.evaluate(original => {
        const context = SillyTavern.getContext();
        const id = context.chat.length - 1;
        context.chat[id] = original;
        context.updateMessageBlock(id, original);
        [context.saveChat, context.saveChatDebounced] = window.__ptSave;
    }, original);
    if (afterTap !== 1) throw new Error(`a tap on the text changed the version to ${afterTap}`);
});

await step('recent chats are grouped by character', async () => {
    await page.locator('.pt-ab-home').click();
    await until(() => document.querySelector('#chat .welcomePanel .recentChatList'));
    const grouped = await page.evaluate(() => {
        const rows = document.querySelectorAll('.recentChatList .recentChat:not(:has(.recentChatPinned))').length;
        return { rows, groups: document.querySelectorAll('.pt-chat-group').length, loose: document.querySelectorAll('.recentChatList > .recentChat:not(:has(.recentChatPinned))').length };
    });
    if (grouped.rows && (!grouped.groups || grouped.loose)) throw new Error(`groups ${grouped.groups}, loose rows ${grouped.loose}`);
});

await step('find a setting searches the Settings page', async () => {
    await page.evaluate(() => document.querySelector('#user-settings-button > .drawer-toggle')?.click());
    await until(() => document.documentElement.dataset.ptPage === 'user-settings-button');
    await page.locator('.pt-ab-search').click();
    await page.locator('#pt-sheet .pt-choice-search').fill('font');
    await until(() => document.querySelectorAll('#pt-sheet .pt-menu-row').length > 0);
    await closeSheet();
    await page.locator('.pt-tab[data-tab="chat"]').click();
    await until(() => !document.documentElement.dataset.ptPage);
});

await step('Settings opens on its sections; a section, explanations, search and back work', async () => {
    await page.evaluate(() => document.querySelector('#user-settings-button > .drawer-toggle')?.click());
    await until(() => document.documentElement.dataset.ptPage === 'user-settings-button');
    await until(() => document.querySelectorAll('.pt-set-home .pt-menu-row').length >= 6);
    if (!await page.evaluate(() => getComputedStyle(document.getElementById('user-settings-block-content')).display === 'none')) throw new Error('the list of sections also shows every setting');
    await page.locator('.pt-set-home .pt-menu-row', { hasText: 'Display' }).click();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Display');
    const shown = await page.evaluate(() => ({
        display: !!document.getElementById('messageTimestampsEnabled')?.closest('label')?.offsetParent,
        look: !!document.getElementById('themes')?.offsetParent,
        tips: document.querySelectorAll('#user-settings-block .pt-help').length,
    }));
    if (!shown.display || shown.look) throw new Error(`wrong settings in Display: ${JSON.stringify(shown)}`);
    if (shown.tips < 10) throw new Error(`only ${shown.tips} explanations`);
    // A tap on an explanation shows all of it and leaves its switch alone.
    const before = await page.evaluate(() => document.getElementById('reduced_motion').checked);
    await page.locator('label[for="reduced_motion"] .pt-help').click();
    const after = await page.evaluate(() => ({ checked: document.getElementById('reduced_motion').checked, open: document.querySelector('label[for="reduced_motion"] .pt-help').classList.contains('pt-help-open') }));
    if (after.checked !== before || !after.open) throw new Error('tapping the explanation flipped the switch, or did not open it');
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Settings' && document.documentElement.dataset.ptPage === 'user-settings-button');
    // Search from the list goes into the right section.
    await page.locator('.pt-set-home .pt-search-field').click();
    await page.locator('#pt-sheet .pt-choice-search').fill('font scale');
    await page.locator('#pt-sheet .pt-menu-row').first().click();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Look');
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Settings');
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => !document.documentElement.dataset.ptPage);

});

await step('Formatting and Extensions open on a list; a section or an extension opens as its own page, and back returns to the list', async () => {
    await page.evaluate(() => document.querySelector('#advanced-formatting-button > .drawer-toggle')?.click());
    await until(() => document.documentElement.dataset.ptPage === 'advanced-formatting-button');
    await until(() => document.querySelectorAll('#AdvancedFormatting .pt-set-home .pt-menu-row').length >= 6);
    if (await page.evaluate(() => !!document.getElementById('context_presets')?.offsetParent)) throw new Error('the list of sections also shows the settings');
    await page.locator('#AdvancedFormatting .pt-set-home .pt-menu-row', { hasText: 'Reasoning' }).click();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Reasoning');
    // Only Reasoning's settings, one switch per full-width row.
    const reasoning = await page.evaluate(() => ({
        row: Math.round(document.getElementById('reasoning_auto_parse')?.closest('label')?.getBoundingClientRect().width ?? 0),
        page: document.getElementById('AdvancedFormatting').clientWidth,
        others: !!document.getElementById('context_presets')?.offsetParent || !!document.getElementById('tokenizer')?.offsetParent,
    }));
    if (reasoning.others || reasoning.row < reasoning.page * 0.8) throw new Error(`Reasoning section: ${JSON.stringify(reasoning)}`);
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Formatting' && document.documentElement.dataset.ptPage === 'advanced-formatting-button');
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => !document.documentElement.dataset.ptPage);
    // Extensions: rows; one opens as its own page with its name in the top bar.
    await page.evaluate(() => document.querySelector('#extensions-settings-button > .drawer-toggle')?.click());
    await until(() => document.documentElement.dataset.ptPage === 'extensions-settings-button');
    await until(() => document.querySelectorAll('.pt-ext-row').length >= 4);
    await page.locator('#qr_container .pt-ext-row > .inline-drawer-toggle').click();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Quick Reply');
    const extension = await page.evaluate(() => ({
        others: [...document.querySelectorAll('.pt-ext-row:not(.pt-ext-open)')].filter(row => row.offsetParent).length,
        open: !!document.querySelector('.pt-ext-open > .inline-drawer-content')?.offsetParent,
    }));
    if (extension.others || !extension.open) throw new Error(`an extension's page: ${JSON.stringify(extension)}`);
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => document.querySelector('.pt-ab-title')?.textContent === 'Extensions' && !document.querySelector('.pt-ext-open'));
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => !document.documentElement.dataset.ptPage);
});

await step('☰ and the wand open sheets, and their items work', async () => {
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Seraphina'))); });
    await until(() => document.querySelectorAll('#chat .mes').length > 0);
    await page.locator('#options_button').tap();
    await until(() => document.getElementById('pt-sheet')?.textContent.includes('Manage chat files'));
    const groups = await page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-menu-heading')].map(el => el.textContent));
    if (!groups.includes('Reply') || !groups.includes('Chats')) throw new Error(`groups: ${groups.join(', ')}`);
    if (await page.evaluate(() => getComputedStyle(document.getElementById('options')).display !== 'none')) throw new Error("SillyTavern's own menu opened too");
    await page.locator('#pt-sheet .pt-menu-row', { hasText: 'Manage chat files' }).click();
    await until(() => getComputedStyle(document.getElementById('shadow_select_chat_popup')).display !== 'none');
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => getComputedStyle(document.getElementById('shadow_select_chat_popup')).display === 'none');
    await page.locator('#extensionsMenuButton').tap();
    await until(() => document.getElementById('pt-sheet')?.textContent.includes('Token Counter'));
    await page.locator('#pt-sheet .pt-menu-row', { hasText: 'Token Counter' }).click();
    await until(() => !!document.querySelector('dialog.popup[open]'));
    await page.waitForTimeout(500);
    await page.goBack();
    await until(() => !document.querySelector('dialog.popup[open]'));
});

await step('search everything finds settings', async () => {
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="more"]').click());
    await page.locator('#pt-sheet .pt-search-field').click();
    await page.locator('#pt-sheet .pt-choice-search').fill('font');
    await until(() => [...document.querySelectorAll('#pt-sheet .pt-menu-heading')].some(el => el.textContent === 'Settings'));
    await closeSheet();
});

await step('characters page has search, labeled card tools and tabs', async () => {
    await showTabs();
    await page.locator('.pt-tab[data-tab="rightNavHolder"]').click();
    await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
    await page.locator('#character_search_bar').waitFor({ state: 'visible' });
    const ready = await page.evaluate(() => !!document.getElementById('pt_card_tabs') && document.querySelectorAll('.pt-btn-label').length >= 6);
    if (!ready) throw new Error('card tabs or tool labels missing');
    await page.locator('.pt-tab[data-tab="chat"]').click();
    await until(() => !document.documentElement.dataset.ptPage);
});

await step('character list shows its page buttons when there is more than one page', async () => {
    // A fresh SillyTavern has one character: add a throwaway one so there can be a second page.
    const added = await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        if (context.characters.length + (context.groups?.length ?? 0) >= 2) return null;
        const st = await import('/script.js');
        const response = await fetch('/api/characters/create', { method: 'POST', headers: st.getRequestHeaders(), body: JSON.stringify({ ch_name: 'Page test' }) });
        if (!response.ok) throw new Error(`could not add a test character: ${response.status}`);
        await st.getCharacters();
        return response.text();
    });
    // A page size that always leaves a second page, however few characters there are.
    const count = await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        const total = context.characters.length + (context.groups?.length ?? 0);
        const { accountStorage } = await import('/scripts/util/AccountStorage.js');
        accountStorage.setItem('Characters_PerPage', String(Math.max(1, Math.floor((total - 1) / 2) || 1)));
        await (await import('/script.js')).printCharacters(true);
        return total;
    });
    if (count < 2) throw new Error('the test needs at least two characters');
    await showTabs();
    await page.locator('.pt-tab[data-tab="rightNavHolder"]').click();
    await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
    try {
        const next = page.locator('#rm_print_characters_pagination .paginationjs-next > a');
        await next.waitFor({ state: 'visible' });
        const size = await next.boundingBox();
        if (size.height < 44 || size.width < 44) throw new Error(`page button is ${size.width}x${size.height}`);
        const before = await page.evaluate(() => document.querySelector('#rm_print_characters_pagination .paginationjs-nav')?.textContent);
        await next.click();
        await until(was => document.querySelector('#rm_print_characters_pagination .paginationjs-nav')?.textContent !== was, before);
    } finally {
        await page.evaluate(async () => {
            const { accountStorage } = await import('/scripts/util/AccountStorage.js');
            accountStorage.setItem('Characters_PerPage', '50');
            await (await import('/script.js')).printCharacters(true);
        });
        if (added) await page.evaluate(async avatar => (await import('/script.js')).deleteCharacter(avatar, { deleteChats: true }), added).catch(() => {});
    }
    await page.locator('.pt-tab[data-tab="chat"]').click();
    await until(() => !document.documentElement.dataset.ptPage);
});

await step('in a chat the tabs tuck away; the arrow brings them back and typing hides them again', async () => {
    await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
    });
    await until(() => document.querySelectorAll('#chat .mes').length > 0);
    await until(() => document.documentElement.classList.contains('pt-tabs-tucked'));
    // Hidden from touch and screen readers once it has slid away (0.2s).
    await until(() => getComputedStyle(document.querySelector('.pt-tabbar')).display === 'none', null, 2000)
        .catch(() => { throw new Error('the tucked tab bar can still be reached'); });
    const arrow = page.locator('.pt-tabs-btn');
    if (await arrow.getAttribute('aria-expanded') !== 'false') throw new Error('the arrow does not say the tabs are hidden');
    const box = await arrow.boundingBox();
    if (box.width < 44 || box.height < 44) throw new Error(`the arrow is ${box.width}x${box.height}`);
    await arrow.click();
    await page.locator('.pt-tab[data-tab="WI-SP-button"]').waitFor({ state: 'visible' });
    if (await arrow.getAttribute('aria-expanded') !== 'true') throw new Error('the arrow does not say the tabs are shown');
    await page.locator('#send_textarea').click();
    await until(() => document.documentElement.classList.contains('pt-tabs-tucked'));
    await page.evaluate(() => document.activeElement?.blur());
    const covered = await lastMessageCovered();
    if (covered > 1) throw new Error(`the newest message is ${covered}px under the message box`);
});

await step('the keyboard: chat and message box slide as one piece, and the tabs go at once', async () => {
    // Before: the chat jumped while the box slid on its own, leaving a gap (opening) or an overlap (closing).
    const size = page.viewportSize();
    const record = () => page.evaluate(() => {
        window.__kb = [];
        const t0 = performance.now();
        const tick = () => {
            const last = [...document.querySelectorAll('#chat .mes')].pop().getBoundingClientRect().bottom;
            const box = document.getElementById('form_sheld').getBoundingClientRect();
            const root = document.documentElement;
            const chat = document.getElementById('chat');
            window.__kb.push({ full: chat.scrollHeight > chat.clientHeight + 40, gap: Math.round(box.top - last), bottom: Math.round(box.bottom), vh: innerHeight, kb: root.classList.contains('pt-keyboard'), tabs: getComputedStyle(document.querySelector('.pt-tabbar')).display !== 'none' });
            if (performance.now() - t0 < 700) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    const frames = async () => {
        await page.waitForTimeout(900);
        return page.evaluate(() => window.__kb);
    };
    const steady = (rows, label) => {
        const gaps = rows.map(r => r.gap);
        // A short chat (a fresh SillyTavern: just the greeting) does not reach the box; the box may move away from it, never over it.
        if (!rows.every(r => r.full)) {
            if (Math.min(...gaps) < -1) throw new Error(`${label}: the box covered the newest message by ${-Math.min(...gaps)}px`);
        } else if (Math.max(...gaps) - Math.min(...gaps) > 3) throw new Error(`${label}: the gap between the newest message and the box went ${Math.min(...gaps)}–${Math.max(...gaps)}px`);
        const end = rows.at(-1);
        if (end.bottom > end.vh + 1) throw new Error(`${label}: the box ends at ${end.bottom}, below the screen (${end.vh})`);
    };
    try {
        await page.locator('.pt-tabs-btn').click();
        await page.locator('.pt-tab[data-tab="WI-SP-button"]').waitFor({ state: 'visible' });
        await page.evaluate(() => { const chat = document.getElementById('chat'); chat.scrollTop = chat.scrollHeight; });
        await page.waitForTimeout(300);
        await record();
        await page.locator('#send_textarea').focus();
        await page.setViewportSize({ width: size.width, height: size.height - 330 });
        const open = await frames();
        if (open.some(r => r.kb && r.tabs)) throw new Error('the tab bar was still showing above the keyboard');
        steady(open, 'opening');
        if (await page.evaluate(() => document.getElementById('sheld').style.height)) throw new Error('the chat kept a size from the slide');
        await record();
        await page.setViewportSize(size);
        const close = await frames();
        steady(close, 'closing');
    } finally {
        await page.setViewportSize(size);
        await page.evaluate(() => document.activeElement?.blur());
        await page.waitForTimeout(400);
    }
});

await step('editing the last message keeps the editor and the top bar on the screen', async () => {
    // With the tabs tucked away, opening the editor used to scroll the whole page up.
    await until(() => document.documentElement.classList.contains('pt-tabs-tucked'));
    await page.waitForTimeout(400);
    const tall = await page.evaluate(() => document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight);
    if (tall > 0) throw new Error(`the page is ${tall}px taller than the screen`);
    await page.evaluate(() => [...document.querySelectorAll('#chat .mes')].pop().querySelector('.mes_edit').click());
    await until(() => document.documentElement.classList.contains('pt-editing'));
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => ({
        scrolled: window.scrollY,
        bar: document.getElementById('pt-appbar').getBoundingClientRect().top,
        box: document.getElementById('curEditTextarea').getBoundingClientRect().top,
    }));
    await page.evaluate(() => document.querySelector('#chat .mes:has(#curEditTextarea) .mes_edit_cancel')?.click());
    await until(() => !document.documentElement.classList.contains('pt-editing'));
    if (state.scrolled || state.bar < 0 || state.box < state.bar) throw new Error(`the editor moved off the screen: ${JSON.stringify(state)}`);
});

await step("the editor fills the page in every chat look, for your messages and the AI's", async () => {
    // In the Bubbles look the editor used to shrink to its text and sit at one edge.
    const results = await page.evaluate(async () => {
        const root = document.documentElement;
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const out = [];
        for (const look of ['cards', 'bubbles', 'flat']) {
            if (look === 'cards') delete root.dataset.ptLook;
            else root.dataset.ptLook = look;
            const messages = [...document.querySelectorAll('#chat .mes')];
            for (const mes of [messages.find(m => m.getAttribute('is_user') === 'true'), messages.at(-1)].filter(Boolean)) {
                mes.querySelector('.mes_edit').click();
                await wait(600);
                const box = document.getElementById('curEditTextarea')?.getBoundingClientRect();
                const bar = document.getElementById('pt-appbar').getBoundingClientRect();
                out.push({ look, user: mes.getAttribute('is_user'), top: Math.round(box?.top ?? -1), height: Math.round(box?.height ?? 0), below: Math.round(bar.bottom), screen: innerHeight });
                document.querySelector('#chat .mes:has(#curEditTextarea) .mes_edit_cancel')?.click();
                await wait(500);
            }
        }
        delete root.dataset.ptLook;
        return out;
    });
    const bad = results.filter(r => r.height < r.screen * 0.4 || r.top < r.below || r.top > r.below + 80);
    if (bad.length) throw new Error(`editor too small or misplaced: ${JSON.stringify(bad)}`);
});

await step('compact size and docked message box fit more chat and keep 44px buttons', async () => {
    await setPref('pt_size', 'comfortable');
    await setPref('pt_composer', 'floating');
    const before = await page.evaluate(() => document.querySelector('#chat .mes').getBoundingClientRect().height);
    await setPref('pt_size', 'compact');
    await setPref('pt_composer', 'docked');
    try {
        const state = await page.evaluate(() => ({
            classes: document.documentElement.className,
            bar: document.getElementById('pt-appbar').getBoundingClientRect().height,
            card: document.querySelector('#chat .mes').getBoundingClientRect().height,
            small: [...document.querySelectorAll('#send_form .pt-tabs-btn, #send_form #options_button, #chat .mes .mes_button:not([style*="none"])')]
                .map(el => el.getBoundingClientRect())
                .filter(rect => rect.width && (rect.width < 44 || rect.height < 44)).length,
        }));
        if (!state.classes.includes('pt-compact') || !state.classes.includes('pt-docked')) throw new Error(`classes: ${state.classes}`);
        if (state.bar > 49) throw new Error(`top bar is ${state.bar}px`);
        if (state.card >= before) throw new Error('message cards did not get smaller');
        if (state.small) throw new Error(`${state.small} buttons under 44px`);
        // Docked: persona, field and Send share the bottom row, level with each other.
        const row = await page.evaluate(() => {
            const box = selector => document.querySelector(selector).getBoundingClientRect();
            const field = box('#send_textarea');
            const send = box('#send_but');
            const persona = box('#send_form .pt-persona-chip');
            return {
                send: Math.abs(send.bottom - field.bottom) <= 1 && send.left >= field.right,
                persona: Math.abs(persona.bottom - field.bottom) <= 1 && persona.right <= field.left,
                edge: window.innerHeight - send.bottom,
                // SillyTavern's clip used to cut off the field's top edge.
                topEdge: document.elementFromPoint(field.left + field.width / 2, field.top + 2)?.id === 'send_textarea',
            };
        });
        if (!row.send || !row.persona) throw new Error(`the bottom row is not persona, field, Send: ${JSON.stringify(row)}`);
        if (row.edge < 4) throw new Error(`Send is ${row.edge}px from the bottom edge`);
        if (!row.topEdge) throw new Error('the top edge of the docked text field is cut off');
        const covered = await lastMessageCovered();
        if (covered > 1) throw new Error(`the newest message is ${covered}px under the message box`);
    } finally {
        await setPref('pt_size', 'auto');
        await setPref('pt_composer', 'floating');
    }
});

await step('Guided Generations becomes one button with a sheet; Input History sits in the text field', async () => {
    // The real extensions when they are installed (the test copy), otherwise stand-ins with the same markup.
    const made = await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
        const made = { gg: false, ih: false };
        if (!document.getElementById('gg-action-button-container')) {
            made.gg = true;
            const row = document.createElement('div');
            row.id = 'gg-action-button-container';
            row.className = 'gg-action-buttons-container';
            row.innerHTML = '<div id="gg-menu-buttons-container" class="gg-menu-buttons-container"><div id="gg_menu_button" class="gg-menu-button fa-solid fa-bookmark"></div><div id="pg_menu_button" class="gg-menu-button fa-solid fa-book-open-reader"><span id="pg_guide_counter_span" class="pg-guide-counter"> 0</span></div></div>'
                + '<div id="gg-qr-container" class="gg-qr-container"></div>'
                + '<div id="gg-regular-buttons-container" class="gg-regular-buttons-container"><div id="gg_impersonate_button" class="gg-action-button fa-solid fa-user" title="Guided Impersonate (1st Person)"></div><div id="gg_swipe_button" class="gg-action-button fa-solid fa-forward" title="Guided Swipe"></div><div id="gg_response_button" class="gg-action-button fa-solid fa-dog" title="Guided Response"></div></div>';
            const items = document.getElementById('nonQRFormItems');
            items.parentNode.insertBefore(row, items.nextSibling);
            for (const [id, labels] of [['gg_tools_menu', ['Simple Send', 'Recover Input', null, 'Spellchecker', 'Help']], ['pg_tools_menu', ['Situational', 'Thinking', null, 'Show Guides']]]) {
                const menu = document.createElement('div');
                menu.id = id;
                menu.className = 'gg-tools-menu';
                for (const label of labels) {
                    const node = document.createElement(label ? 'a' : 'hr');
                    if (label) {
                        node.href = '#';
                        node.className = 'interactable';
                        node.title = `What ${label} does`;
                        node.innerHTML = `<i class="fa-solid fa-star fa-fw"></i><span>${label}</span>`;
                    }
                    menu.append(node);
                }
                document.body.append(menu);
            }
        }
        if (!document.querySelector('.stih--buttons')) {
            made.ih = true;
            const wrap = document.createElement('div');
            wrap.className = 'stih--buttons';
            wrap.innerHTML = '<div class="stih--arrows"><div class="stih--button menu_button fa-solid fa-chevron-up" title="Previous input"></div><div class="stih--button menu_button fa-solid fa-chevron-down" title="Next input"></div></div><div class="stih--button menu_button stih--menuTrigger fa-solid fa-clock-rotate-left" title="Input History"></div>';
            document.getElementById('send_textarea').insertAdjacentElement('afterend', wrap);
        }
        // Record presses on its buttons and menu items instead of running them.
        window.__ggPressed = [];
        document.querySelectorAll('#gg-action-button-container .gg-action-button, #gg_tools_menu > a, #pg_tools_menu > a').forEach(node => {
            node.addEventListener('click', event => {
                window.__ggPressed.push(node.id || node.textContent.trim());
                event.stopImmediatePropagation();
                event.preventDefault();
            }, true);
        });
        return made;
    });
    try {
        await page.locator('.pt-gg-btn').waitFor({ state: 'visible' });
        const layout = await page.evaluate(() => {
            const button = document.querySelector('.pt-gg-btn').getBoundingClientRect();
            const field = document.getElementById('send_textarea').getBoundingClientRect();
            const history = document.querySelector('.stih--menuTrigger').getBoundingClientRect();
            return {
                size: Math.min(button.width, button.height),
                beforeSend: document.querySelector('.pt-gg-btn').nextElementSibling?.id === 'send_but',
                rowHidden: getComputedStyle(document.getElementById('gg-regular-buttons-container')).display === 'none',
                historyInField: history.width >= 44 && Math.abs((history.top + history.bottom) / 2 - (field.top + field.bottom) / 2) <= field.height / 2 && history.right <= field.right + 1,
            };
        });
        if (layout.size < 44 || !layout.beforeSend || !layout.rowHidden || !layout.historyInField) throw new Error(`layout: ${JSON.stringify(layout)}`);

        await page.locator('#send_textarea').fill('Have her mention the letter');
        if (await page.evaluate(() => getComputedStyle(document.querySelector('.stih--arrows')).display) !== 'none') throw new Error('Input History arrows cover the text you are typing');

        await page.locator('.pt-gg-btn').click();
        await page.locator('#pt-sheet .pt-gg-instruction', { hasText: 'Have her mention the letter' }).waitFor();
        await page.locator('#pt-sheet .pt-menu-row', { hasText: 'Guided swipe' }).click();
        await until(() => !document.getElementById('pt-sheet'));
        if (await page.evaluate(() => window.__ggPressed.at(-1)) !== 'gg_swipe_button') throw new Error('Guided swipe did not press its button');

        await page.locator('.pt-gg-btn').click();
        await page.locator('#pt-sheet .pt-menu-row', { hasText: 'Tools' }).click();
        await page.locator('#pt-sheet .pt-menu-row', { hasText: 'Spellchecker' }).click();
        await until(() => !document.getElementById('pt-sheet'));
        const pressed = await page.evaluate(() => ({ last: window.__ggPressed.at(-1), hash: location.hash }));
        if (pressed.last !== 'Spellchecker' || pressed.hash) throw new Error(`tools: ${JSON.stringify(pressed)}`);

        // Holding the button runs the last action again.
        const box = await page.locator('.pt-gg-btn').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.up();
        await page.waitForTimeout(200);
        const held = await page.evaluate(() => ({ last: window.__ggPressed.at(-1), sheet: !!document.getElementById('pt-sheet') }));
        if (held.last !== 'gg_swipe_button' || held.sheet) throw new Error(`hold: ${JSON.stringify(held)}`);
    } finally {
        await page.evaluate(made => {
            document.getElementById('send_textarea').value = '';
            if (made.gg) {
                document.getElementById('gg-action-button-container')?.remove();
                document.getElementById('gg_tools_menu')?.remove();
                document.getElementById('pg_tools_menu')?.remove();
            }
            if (made.ih) document.querySelector('.stih--buttons')?.remove();
        }, made);
    }
    if (made.gg) {
        await until(() => !document.documentElement.classList.contains('pt-gg') && !document.querySelector('.pt-gg-btn'));
    }
});

await step("another extension's buttons and a theme's CSS keep the text on its own row", async () => {
    // Guided Generations puts a row of buttons in the box; some themes stop the box from wrapping.
    // (Its row as it looks with the Guided Generations button switched off.)
    const result = await page.evaluate(async () => {
        const toggle = document.getElementById('pt_ggbutton');
        const wasOn = toggle?.checked;
        if (wasOn) toggle.click();
        const style = document.createElement('style');
        style.id = 'test-hostile';
        style.textContent = '#send_form { flex-wrap: nowrap !important; } #nonQRFormItems { display: flex !important; } #send_textarea { order: 9 !important; grid-area: auto !important; }';
        document.head.append(style);
        const row = document.createElement('div');
        row.id = 'gg-action-button-container';
        row.className = 'gg-action-buttons-container';
        row.style.display = 'flex';
        row.innerHTML = '<div class="gg-action-button fa-solid fa-dog"></div><div class="gg-action-button fa-solid fa-forward-fast"></div>';
        const items = document.getElementById('nonQRFormItems');
        items.parentNode.insertBefore(row, items.nextSibling);
        await new Promise(resolve => setTimeout(resolve, 300));
        const form = document.getElementById('send_form').getBoundingClientRect();
        const text = document.getElementById('send_textarea').getBoundingClientRect();
        const send = document.getElementById('send_but').getBoundingClientRect();
        const button = row.querySelector('.gg-action-button').getBoundingClientRect();
        row.remove();
        style.remove();
        if (wasOn) toggle.click();
        return { share: text.width / form.width, ownRow: text.bottom <= send.top + 1, button: Math.min(button.width, button.height) };
    });
    if (result.share < 0.8 || !result.ownRow) throw new Error(`the text was squeezed: ${JSON.stringify(result)}`);
    if (result.button < 44) throw new Error(`the extension's buttons are ${result.button}px`);
});

await step("Moonlit Echoes and ScenePulse: their chat styles draw the messages, the box stays clear, ScenePulse opens from Tools", async () => {
    // Stand-ins with the same markup and rules as the real extensions (the test copy has them switched off).
    const barBefore = await page.evaluate(() => document.getElementById('pt-appbar').getBoundingClientRect().height);
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.id = 'test-ext-standins';
        // Moonlit's rules for the top bar, the chat and the message box, then ScenePulse's for its two buttons and its panel.
        style.textContent = ':root { --topBarBlockSize: 40px !important; }'
            + ' #chat { -webkit-mask-image: linear-gradient(black 80%, transparent); mask-image: linear-gradient(black 80%, transparent); }'
            + ' body.echostyle #chat .mes .mes_text { padding-left: 97px !important; min-height: 200px; }'
            + ' #send_form { opacity: 0.6; } #nonQRFormItems { transition: all 0.8s ease; } #leftSendForm { display: flex; } #leftSendForm > * { display: flex; }'
            + ' #nonQRFormItems #options_button { width: 13px !important; height: 13px !important; }'
            + ' .sp-st-restore { display: flex; width: 34px; height: 34px; padding: 4px; flex-shrink: 0; }'
            + ' .sp-mobile-fab { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 100000; width: 60px; height: 60px; }'
            + ' .sp-mobile-fab.sp-fab-visible { display: flex !important; }'
            + ' #sp-panel { display: none; position: fixed; inset: 44px 0 0 0; z-index: 1000; } #sp-panel.sp-visible { display: flex; }';
        document.head.append(style);
        const fab = document.createElement('button');
        fab.id = 'sp-mobile-fab';
        fab.className = 'sp-mobile-fab sp-fab-visible';
        const panel = document.createElement('div');
        panel.id = 'sp-panel';
        panel.className = 'sp-mode-mobile';
        document.body.append(fab, panel);
        const button = document.createElement('div');
        button.id = 'sp-st-restore';
        button.className = 'sp-st-restore';
        button.style.display = 'flex';
        button.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" class="sp-mascot-pulse"/></svg>';
        button.addEventListener('click', () => panel.classList.add('sp-visible'));
        document.getElementById('rightSendForm').append(button);
    });
    try {
        await page.waitForTimeout(300);
        const bar = await page.evaluate(() => document.getElementById('pt-appbar').getBoundingClientRect().height);
        if (bar !== barBefore) throw new Error(`a theme changed the top bar from ${barBefore}px to ${bar}px`);
        const box = await page.evaluate(() => {
            const send = document.getElementById('send_but').getBoundingClientRect();
            const at = document.elementFromPoint(send.left + send.width / 2, send.top + send.height / 2);
            const menu = document.getElementById('options_button').getBoundingClientRect();
            return {
                opacity: getComputedStyle(document.getElementById('send_form')).opacity,
                fab: getComputedStyle(document.getElementById('sp-mobile-fab')).display,
                inRow: getComputedStyle(document.getElementById('sp-st-restore')).display,
                send: Math.round(Math.min(send.width, send.height)),
                sendFree: !!at?.closest('#send_but'),
                menu: Math.round(Math.min(menu.width, menu.height)),
            };
        });
        if (box.opacity !== '1') throw new Error(`the message box is faded to ${box.opacity}`);
        if (box.fab !== 'none' || !box.sendFree) throw new Error(`ScenePulse's floating button covers Send: ${JSON.stringify(box)}`);
        if (box.inRow !== 'none' || box.send < 40) throw new Error(`ScenePulse's button crowds the row next to Send: ${JSON.stringify(box)}`);
        if (box.menu < 44) throw new Error(`☰ is ${box.menu}px`);
        // Tools lists ScenePulse; tapping it opens its panel, above the tab bar.
        const pulseRow = () => [...document.querySelectorAll('#pt-sheet .pt-menu-row')].find(row => row.textContent.includes('ScenePulse'));
        await page.locator('#extensionsMenuButton').click();
        await until(`(${pulseRow})()`);
        await page.evaluate(`(${pulseRow})().click()`);
        await until(() => document.getElementById('sp-panel').classList.contains('sp-visible'));
        const layer = await page.evaluate(() => [Number(getComputedStyle(document.getElementById('sp-panel')).zIndex), Number(getComputedStyle(document.querySelector('.pt-tabbar')).zIndex)]);
        if (!(layer[0] > layer[1])) throw new Error(`ScenePulse's panel (z ${layer[0]}) is under the tab bar (z ${layer[1]})`);
        await page.evaluate(() => document.getElementById('sp-panel').classList.remove('sp-visible'));
        // Moonlit's chat styles draw the messages themselves; the tabs arrow still steps aside for the keyboard.
        const looks = await page.evaluate(async () => {
            const card = () => { const s = getComputedStyle(document.querySelector('#chat .mes')); return `${s.borderTopLeftRadius}|${s.paddingTop}|${s.marginTop}`; };
            const cards = card();
            // Read at once: Pocket Tavern's own keyboard check takes the made-up class away again.
            document.documentElement.classList.add('pt-keyboard');
            const arrow = getComputedStyle(document.querySelector('.pt-tabs-btn')).display;
            document.documentElement.classList.remove('pt-keyboard');
            document.body.dataset.testFlat = String(document.body.classList.contains('flatchat'));
            document.body.classList.remove('flatchat');
            document.body.classList.add('echostyle');
            await new Promise(resolve => setTimeout(resolve, 100));
            return { cards, echo: card(), arrow };
        });
        if (looks.arrow !== 'none') throw new Error(`the tabs arrow shows with the keyboard up (${looks.arrow})`);
        if (looks.echo === looks.cards) throw new Error(`the message cards stayed on in Moonlit's Echo style (${looks.cards})`);
        // The editor in Echo, right as it opens: the whole page, Save on top of the faded-out box.
        await page.evaluate(() => [...document.querySelectorAll('#chat .mes')].pop().querySelector('.mes_edit').click());
        await until(() => document.documentElement.classList.contains('pt-editing'));
        await page.waitForTimeout(150);
        const editor = await page.evaluate(() => {
            const save = document.querySelector('#chat .mes:has(#curEditTextarea) .mes_edit_done').getBoundingClientRect();
            const hit = document.elementFromPoint(save.left + save.width / 2, save.top + save.height / 2);
            return { saveOnTop: !!hit?.closest('.mes_edit_done'), area: document.getElementById('curEditTextarea').getBoundingClientRect().width / innerWidth };
        });
        await page.evaluate(() => document.querySelector('#chat .mes:has(#curEditTextarea) .mes_edit_cancel')?.click());
        await until(() => !document.documentElement.classList.contains('pt-editing'));
        if (!editor.saveOnTop) throw new Error("the message box covers the editor's Save while it opens");
        if (editor.area < 0.9) throw new Error(`the editor's text field is only ${Math.round(editor.area * 100)}% wide in Echo`);
    } finally {
        await page.evaluate(() => {
            document.documentElement.classList.remove('pt-keyboard');
            document.body.classList.remove('echostyle');
            if (document.body.dataset.testFlat === 'true') document.body.classList.add('flatchat');
            delete document.body.dataset.testFlat;
            document.getElementById('test-ext-standins')?.remove();
            for (const id of ['sp-mobile-fab', 'sp-panel', 'sp-st-restore']) document.getElementById(id)?.remove();
        });
    }
});

await step('the prompt editor reaches the tabs, opens full screen and asks before unsaved changes are lost; number boxes show the whole number', async () => {
    const api = await page.evaluate(() => document.getElementById('main_api').value);
    const setApi = want => page.evaluate(value => {
        const select = document.getElementById('main_api');
        if (select.value === value) return;
        select.value = value;
        select.dispatchEvent(new Event('change'));
    }, want);
    try {
        await setApi('openai');
        await page.waitForTimeout(800);
        await showTabs();
        await page.locator('.pt-tab[data-tab="ai-config-button"]').click();
        await until(() => document.documentElement.dataset.ptPage === 'ai-config-button');
        await until(() => !!document.querySelector('#completion_prompt_manager_list .prompt-manager-edit-action'), null, 15000);
        // Beside − and +: no browser arrows over the number (Firefox always shows them), and room for seven digits.
        const box = await page.evaluate(() => {
            const input = [...document.querySelectorAll('#ai-config-button .range-block-counter.pt-stepper input[type="number"]')].find(box => box.getClientRects().length);
            const style = getComputedStyle(input);
            const measure = document.createElement('canvas').getContext('2d');
            measure.font = style.font;
            return { appearance: style.appearance, room: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), need: Math.ceil(measure.measureText('1000000').width) };
        });
        if (box.appearance !== 'textfield' || box.room < box.need) throw new Error(`number box: ${JSON.stringify(box)}`);
        // Chat Completion Tabs (a stand-in when it is not installed): its tabs are 44px.
        const tabHeight = await page.evaluate(() => {
            let bar = document.querySelector('#ai-config-button .openai-tab-buttons');
            const made = !bar;
            if (made) {
                bar = document.createElement('div');
                bar.className = 'openai-tab-buttons';
                bar.innerHTML = '<button class="openai-tab-button active">Parameters</button><button class="openai-tab-button">Prompts</button>';
                (document.getElementById('openai_api-presets') ?? document.getElementById('left-nav-panel')).append(bar);
            }
            const height = Math.round(bar.querySelector('.openai-tab-button').getBoundingClientRect().height);
            if (made) bar.remove();
            else (document.getElementById('openai-tab-btn-prompts') ?? document.getElementById('pt_ptab_prompts'))?.click();
            return height;
        });
        if (tabHeight < 44) throw new Error(`the Parameters and Prompts tabs are ${tabHeight}px`);
        // Chat Completion Tabs (when installed) builds its tabs up to 2 seconds after the API switch and may hide the list on Parameters.
        await page.waitForTimeout(2200);
        await page.evaluate(() => (document.getElementById('openai-tab-btn-prompts') ?? document.getElementById('pt_ptab_prompts'))?.click());
        const edit = page.locator('#completion_prompt_manager_list .prompt-manager-edit-action').first();
        await edit.scrollIntoViewIfNeeded();
        await edit.click();
        await until(() => document.documentElement.classList.contains('pt-prompt-editor'));
        await page.waitForTimeout(600);
        // SillyTavern stops its drawers 50px short of the bottom; the editor is a page and reaches the tabs.
        const fit = await page.evaluate(() => ({
            bottom: Math.round(document.getElementById('completion_prompt_manager_popup').getBoundingClientRect().bottom),
            tabs: Math.round(document.getElementById('pt-tabbar').getBoundingClientRect().top),
        }));
        if (Math.abs(fit.bottom - fit.tabs) > 2) throw new Error(`the editor ends at ${fit.bottom}px, the tabs start at ${fit.tabs}px`);
        // Full screen: the prompt text gets the page, and back leaves full screen, not the editor.
        await page.locator('#pt_prompt_full').click();
        await until(() => document.documentElement.classList.contains('pt-prompt-full'));
        const full = await page.evaluate(() => ({
            fields: getComputedStyle(document.querySelector('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form > .flex-container')).display,
            text: Math.round(document.getElementById('completion_prompt_manager_popup_entry_form_prompt').getBoundingClientRect().height),
        }));
        if (full.fields !== 'none' || full.text < 400) throw new Error(`full screen: ${JSON.stringify(full)}`);
        await page.waitForTimeout(400);
        await page.goBack();
        await until(() => !document.documentElement.classList.contains('pt-prompt-full'));
        await page.waitForTimeout(500);
        if (!(await page.evaluate(() => document.documentElement.classList.contains('pt-prompt-editor')))) throw new Error('back closed the editor instead of leaving full screen');
        // A change, then another tab: it asks. Keep editing stays; Discard changes goes on.
        const prompt = page.locator('#completion_prompt_manager_popup_entry_form_prompt');
        await prompt.tap();
        await prompt.press('End');
        await page.keyboard.type(' (test)');
        await page.evaluate(() => document.querySelector('.pt-tab[data-tab="rightNavHolder"]').click());
        await until(() => /without saving/.test(document.querySelector('#pt-sheet')?.textContent ?? ''));
        await page.locator('#pt-sheet .pt-action-row', { hasText: 'Keep editing' }).click();
        await until(() => !document.getElementById('pt-sheet'));
        await page.waitForTimeout(300);
        if (await page.evaluate(() => document.documentElement.dataset.ptPage) !== 'ai-config-button') throw new Error('Keep editing left the editor');
        await page.evaluate(() => document.querySelector('.pt-tab[data-tab="rightNavHolder"]').click());
        await until(() => !!document.getElementById('pt-sheet'));
        await page.locator('#pt-sheet .pt-action-row', { hasText: 'Discard changes' }).click();
        await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
        await until(() => document.getElementById('completion_prompt_manager_popup').style.display === 'none');
    } finally {
        if (await page.locator('#pt-sheet').count()) await closeSheet();
        await setApi(api);
        // SillyTavern saves a second later; the desktop step reloads the settings.
        await page.waitForTimeout(1500);
        await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
        await page.waitForTimeout(400);
    }
});

await step('a long lorebook shows every entry, and the Notes & tags tab keeps the tabs their size', async () => {
    const name = 'Pocket Tavern test lorebook';
    try {
        await page.evaluate(async name => {
            const context = SillyTavern.getContext();
            await context.saveWorldInfo(name, { entries: {} }, true);
            await context.updateWorldInfoList();
        }, name);
        await showTabs();
        await page.locator('.pt-tab[data-tab="WI-SP-button"]').click();
        await until(() => document.documentElement.dataset.ptPage === 'WI-SP-button');
        await page.evaluate(name => {
            const select = document.getElementById('world_editor_select');
            select.value = [...select.options].find(option => option.textContent === name).value;
            jQuery(select).trigger('change');
        }, name);
        await until(() => document.getElementById('world_popup_new')?.offsetParent, null, 10000);
        // SillyTavern stopped the editor at the screen's height, so entries past the third or fourth could not be reached.
        for (let i = 0; i < 12; i++) {
            await page.evaluate(() => document.getElementById('world_popup_new').click());
            await page.waitForTimeout(150);
        }
        await until(() => document.querySelectorAll('#world_popup_entries_list .world_entry').length >= 12, null, 10000);
        const reach = await page.evaluate(() => {
            const panel = document.querySelector('#WI-SP-button > .drawer-content');
            const entries = [...document.querySelectorAll('#world_popup_entries_list .world_entry')];
            const last = entries[entries.length - 1];
            const bottom = last.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + panel.scrollTop;
            return { entries: entries.length, bottom: Math.round(bottom), scroll: panel.scrollHeight };
        });
        if (reach.bottom > reach.scroll + 2) throw new Error(`the last entry is out of reach: ${JSON.stringify(reach)}`);
        // Keyword chips follow an edit: SillyTavern replaces the entry's key list, so they are read again when it closes.
        const chips = await page.evaluate(async () => {
            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
            const entry = document.querySelector('#world_popup_entries_list .world_entry');
            const toggle = () => entry.querySelector('.world_entry_thin_controls > .inline-drawer-toggle').click();
            toggle();
            await sleep(700);
            const field = [...entry.querySelectorAll('textarea[name="key"]')].find(node => node.offsetParent);
            if (!field) return 'no key field';
            field.value = 'alpha, beta';
            field.dispatchEvent(new Event('input', { bubbles: true }));
            jQuery(field).trigger('change');
            await sleep(400);
            toggle();
            await sleep(1200);
            return [...entry.querySelectorAll('.pt-entry-keys .pt-key-chip')].map(chip => chip.textContent).join(',');
        });
        if (chips !== 'alpha,beta') throw new Error(`keyword chips after an edit: ${chips}`);
    } finally {
        await page.evaluate(async name => {
            const context = SillyTavern.getContext();
            const select = document.getElementById('world_editor_select');
            select.value = '';
            jQuery(select).trigger('change');
            await fetch('/api/worldinfo/delete', { method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify({ name }) });
            await context.updateWorldInfoList();
        }, name);
        await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
        await page.waitForTimeout(400);
    }
    // The character card's tabs: Notes & tags has no big text box, and the tabs grew to fill the space.
    await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
    });
    await page.waitForTimeout(800);
    await page.locator('.pt-ab-who').click();
    await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
    // The page keeps its last view (the list); open the card.
    await page.evaluate(() => document.getElementById('rm_button_selected_ch')?.click());
    await until(() => !!document.getElementById('pt_card_tabs')?.offsetParent, null, 10000);
    await page.locator('#pt_card_tabs .pt-seg[data-tab="notes"]').click();
    await page.waitForTimeout(400);
    const tabs = await page.evaluate(() => Math.round(document.getElementById('pt_card_tabs').getBoundingClientRect().height));
    await page.locator('#pt_card_tabs .pt-seg[data-tab="desc"]').click();
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
    await page.waitForTimeout(400);
    if (tabs > 60) throw new Error(`the card's tabs are ${tabs}px tall on Notes & tags`);
});

await step('the character list view keeps rows apart, and the start screen can hide the message box', async () => {
    // List view with long rows (many tags): the rows used to shrink to 64px and run into each other.
    await showTabs();
    await page.locator('.pt-tab[data-tab="rightNavHolder"]').click();
    await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
    await page.evaluate(() => document.getElementById('rm_button_characters')?.click());
    await page.waitForTimeout(600);
    const wasGrid = await page.evaluate(() => document.body.classList.contains('charListGrid'));
    try {
        const rows = await page.evaluate(() => {
            document.body.classList.remove('charListGrid');
            for (const row of document.querySelectorAll('#rm_print_characters_block .character_select')) {
                const tags = row.querySelector('.tags');
                if (tags) tags.insertAdjacentHTML('beforeend', ['Female', 'Submissive', 'AnyPOV', 'Angst', 'Dead Dove', 'nerd', 'glasses', 'OC'].map(name => `<span class="tag pt-test-tag"><span class="tag_name">${name}</span></span>`).join(''));
            }
            return [...document.querySelectorAll('#rm_print_characters_block .character_select')].slice(0, 4).map(row => ({ h: Math.round(row.getBoundingClientRect().height), content: row.scrollHeight }));
        });
        const squeezed = rows.filter(row => row.content > row.h + 1);
        if (!rows.length || squeezed.length) throw new Error(`list rows are squeezed: ${JSON.stringify(rows)}`);
    } finally {
        await page.evaluate(wasGrid => {
            document.querySelectorAll('.pt-test-tag').forEach(tag => tag.remove());
            document.body.classList.toggle('charListGrid', wasGrid);
        }, wasGrid);
    }
    // The start screen's eye hides the message box for more room, and shows it again.
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('option_close_chat')?.click());
    await until(() => !!document.getElementById('pt_home_box'), null, 10000);
    try {
        await page.locator('#pt_home_box').click();
        await until(() => getComputedStyle(document.getElementById('form_sheld')).display === 'none');
        await page.locator('#pt_home_box').click();
        await until(() => getComputedStyle(document.getElementById('form_sheld')).display !== 'none');
    } finally {
        await page.evaluate(() => {
            if (SillyTavern.getContext().extensionSettings.mobileUI.homeHideBox) document.getElementById('pt_home_box')?.click();
        });
    }
});

await step('a theme gives way to the background you pick, every theme shows it under tinted message cards with solid bars, SillyTavern themes are in Themes instead of Settings → Look, and the chat look switches Chat Style to Flat', async () => {
    const before = await page.evaluate(() => {
        const s = SillyTavern.getContext().extensionSettings.mobileUI;
        return { avatar: document.getElementById('avatar_style').value, theme: s.theme, backdrop: s.themeBackdrop, stTheme: s.stTheme, style: document.getElementById('chat_display').value, bg: decodeURIComponent((getComputedStyle(document.getElementById('bg1')).backgroundImage.match(/\/backgrounds\/([^"')]+)/) ?? [])[1] ?? '') || null };
    });
    const openThemes = async () => {
        await showTabs();
        await page.locator('.pt-tab[data-tab="more"]').click();
        await page.locator('#pt-sheet .pt-menu-row-theme').click();
    };
    try {
        // A Pocket Tavern theme with its own background on.
        await openThemes();
        await page.locator('#pt-sheet .pt-theme-card[data-theme="sakura"]').click();
        await until(() => document.documentElement.dataset.ptTheme === 'sakura');
        await page.evaluate(() => {
            const input = [...document.querySelectorAll('#pt-sheet .pt-switch-row')].find(row => /Theme background/.test(row.textContent))?.querySelector('input');
            if (input && !input.checked) input.click();
        });
        await until(() => document.documentElement.classList.contains('pt-backdrop'));
        await closeSheet();
        // The Backgrounds page says why backgrounds don't show.
        await page.locator('.pt-tab[data-tab="more"]').click();
        await page.locator('#pt-sheet .pt-tile', { hasText: 'Backgrounds' }).click();
        await until(() => document.documentElement.dataset.ptPage === 'backgrounds-button');
        await until(() => /Sakura theme shows its own background/.test(document.getElementById('pt_bg_note')?.textContent ?? ''));
        const button = await page.evaluate(() => Math.round(document.querySelector('#pt_bg_note .pt-inline-note-btn').getBoundingClientRect().height));
        if (button < 44) throw new Error(`the note's button is ${button}px tall`);
        // Picking a background turns the theme's own background off, and the chat lets the picture through.
        const thumbs = await page.locator('#bg_menu_content .bg_example').count();
        if (!thumbs) throw new Error('no backgrounds to pick');
        await page.locator('#bg_menu_content .bg_example').nth(Math.min(4, thumbs - 1)).click();
        await until(() => !document.documentElement.classList.contains('pt-backdrop') && !document.getElementById('pt_bg_note'));
        const tint = await page.evaluate(() => getComputedStyle(document.getElementById('chat')).backgroundColor);
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(tint)) throw new Error(`the chat still covers the background: ${tint}`);
        // With the background showing, the bars stay solid (DESIGN.md: no glassmorphism) and the cards let it through.
        const bar = await page.evaluate(() => ({
            glass: document.documentElement.classList.contains('pt-glass'),
            color: getComputedStyle(document.querySelector('.pt-appbar')).backgroundColor,
            card: getComputedStyle(document.querySelector('#chat .mes:not([is_system="true"])') ?? document.body).backgroundColor,
        }));
        const alphaOf = color => (/rgba|\//.test(color) ? Number((color.match(/[\d.]+(?=\)$)/) ?? ['1'])[0]) : 1);
        if (!bar.glass || alphaOf(bar.color) < 1) throw new Error(`the top bar is not solid over the background: ${JSON.stringify(bar)}`);
        await page.evaluate(() => globalThis.toastr?.clear());
        // Settings → Look: SillyTavern's theme list is hidden; a note points to More → Themes.
        await page.locator('.pt-tab[data-tab="more"]').click();
        await page.locator('#pt-sheet .pt-tile', { hasText: 'Settings' }).click();
        await until(() => document.documentElement.dataset.ptPage === 'user-settings-button');
        await page.evaluate(() => [...document.querySelectorAll('.pt-set-home .pt-menu-row')].find(row => /Look/.test(row.textContent))?.click());
        await until(() => (document.getElementById('pt_look_note')?.getBoundingClientRect().height ?? 0) > 0);
        const listShown = await page.evaluate(() => document.getElementById('themes')?.getBoundingClientRect().height ?? 0);
        if (listShown) throw new Error("SillyTavern's UI Theme list still shows in Settings → Look");
        await page.locator('#pt_look_note .pt-inline-note-btn', { hasText: 'Open Themes' }).click();
        // The Themes sheet lists SillyTavern's themes, made to fit; picking one applies it.
        await until(() => document.querySelectorAll('#pt-sheet .pt-themes-st .pt-theme-card[data-theme^="st:"]').length > 0, null, 10000);
        const picked = await page.evaluate(() => document.querySelector('#pt-sheet .pt-themes-st .pt-theme-card[data-theme^="st:"]').dataset.theme);
        await page.locator(`#pt-sheet .pt-theme-card[data-theme="${picked}"]`).click();
        await until(want => document.documentElement.dataset.ptTheme === want && SillyTavern.getContext().extensionSettings.mobileUI.stTheme?.name === want.slice(3), picked);
        // A SillyTavern theme always shows your background (it has none of its own), as glass.
        const stGlass = await page.evaluate(() => ({
            glass: document.documentElement.classList.contains('pt-glass'),
            backdrop: document.documentElement.classList.contains('pt-backdrop'),
            text: getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBodyColor').trim(),
        }));
        if (!stGlass.glass || stGlass.backdrop || !/^#[0-9a-f]{6}$/i.test(stGlass.text)) throw new Error(`the SillyTavern theme: ${JSON.stringify(stGlass)}`);
        await page.locator('#pt-sheet .pt-theme-card[data-theme="st"]').click();
        await until(() => !document.documentElement.dataset.ptTheme);
        await closeSheet();
        // SillyTavern's Bubbles style pauses the chat look; picking one puts Chat Style back on Flat.
        await setPref('chat_display', '1');
        await openThemes();
        const paused = await page.evaluate(() => ({
            on: document.querySelectorAll('#pt-sheet .pt-look-seg[aria-label="Chat look"] .pt-seg-on').length,
            note: [...document.querySelectorAll('#pt-sheet .pt-menu-foot')].some(foot => /Bubbles chat style is on/.test(foot.textContent)),
        }));
        if (paused.on || !paused.note) throw new Error(`with SillyTavern's Bubbles the chat look shows ${JSON.stringify(paused)}`);
        await page.locator('#pt-sheet .pt-look-seg[aria-label="Chat look"] .pt-seg', { hasText: 'Cards' }).click();
        await until(() => document.getElementById('chat_display').value === '0');
        await closeSheet();
        await page.evaluate(() => globalThis.toastr?.clear());
    } finally {
        if (await page.locator('#pt-sheet').count()) await closeSheet();
        await page.evaluate(b => {
            const s = SillyTavern.getContext().extensionSettings.mobileUI;
            s.theme = b.theme;
            s.themeBackdrop = b.backdrop;
            if (b.stTheme === undefined) delete s.stTheme;
            else s.stTheme = b.stTheme;
            SillyTavern.getContext().saveSettingsDebounced();
            if (b.bg) [...document.querySelectorAll('#bg_menu_content .bg_example')].find(e => e.getAttribute('bgfile') === b.bg)?.click();
        }, before);
        await setPref('chat_display', before.style);
        // Picking a SillyTavern theme set its avatar shape too.
        await setPref('avatar_style', before.avatar);
        // Re-apply the restored theme the same way the Themes sheet does.
        await openThemes();
        await page.locator(`#pt-sheet .pt-theme-card[data-theme="${before.theme}"]`).click();
        await page.waitForTimeout(600);
        await closeSheet();
        await page.evaluate(() => globalThis.toastr?.clear());
    }
    // "Swipes on all messages": an older message with one version shows no empty swipe circle.
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
    const empty = await page.evaluate(() => {
        const had = document.body.classList.contains('swipeAllMessages');
        document.body.classList.add('swipeAllMessages');
        const found = [...document.querySelectorAll('#chat > .mes:not(.last_mes):not(.swipes_visible):not(.last_swipe) > .swipeRightBlock')].filter(block => getComputedStyle(block).display !== 'none').length;
        if (!had) document.body.classList.remove('swipeAllMessages');
        return found;
    });
    if (empty) throw new Error(`${empty} older messages show an empty swipe button`);
});

await step('backgrounds are big enough to pick, the next-version button is an arrow, and the chat width slider fills to its knob; a computer is compact', async () => {
    // Background thumbnails never drop below 150px, whatever SillyTavern's column count.
    await showTabs();
    await page.locator('.pt-tab[data-tab="more"]').click();
    await page.locator('#pt-sheet .pt-tile', { hasText: 'Backgrounds' }).click();
    await until(() => document.documentElement.dataset.ptPage === 'backgrounds-button');
    const thumbs = await page.evaluate(() => {
        document.documentElement.style.setProperty('--bg-thumb-columns', '6');
        const widths = [...document.querySelectorAll('#bg_menu_content .bg_example')].slice(0, 3).map(e => Math.round(e.getBoundingClientRect().width));
        document.documentElement.style.removeProperty('--bg-thumb-columns');
        return widths;
    });
    if (!thumbs.length || thumbs.some(w => w < 150)) throw new Error(`background thumbnails are ${thumbs.join(', ')}px wide`);
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
    // The last message's "next version" button uses the › arrow, not a refresh icon.
    const icon = await page.evaluate(() => {
        const button = document.querySelector('#chat .mes.last_swipe > .swipeRightBlock .swipe_right');
        if (!button) return null;
        const own = getComputedStyle(button).getPropertyValue('--pt-icon').trim();
        const regen = getComputedStyle(document.documentElement).getPropertyValue('--pt-regen-icon').trim();
        return { regen: !!own && own === regen };
    });
    if (icon?.regen) throw new Error('the next-version button still shows the refresh icon');
    // A computer (mouse, desktop layout) picks Compact on Automatic; the chat width slider fills to its knob.
    // On a fresh SillyTavern the one-time desktop notice would cover the page; the desktop step later shows it on purpose.
    await page.evaluate(async () => {
        SillyTavern.getContext().extensionSettings.mobileUI.desktopNoticeSeen = true;
        SillyTavern.getContext().saveSettingsDebounced();
        await new Promise(resolve => setTimeout(resolve, 2500));
    });
    const desk = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const tab = await desk.newPage();
    try {
        await tab.goto(ST_URL);
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-desktop'), null, { timeout: 60000 });
        await tab.waitForTimeout(1500);
        const auto = await tab.evaluate(() => SillyTavern.getContext().extensionSettings.mobileUI.uiSize);
        const compact = await tab.evaluate(() => document.documentElement.classList.contains('pt-compact'));
        if ((auto ?? 'auto') === 'auto' && !compact) throw new Error('a computer on Automatic size is not compact');
        // Anything that opened by itself (What's new) closes first.
        await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        await tab.waitForFunction(() => !document.getElementById('pt-sheet'), null, { timeout: 8000 }).catch(() => {});
        await tab.evaluate(() => document.querySelector('.pt-tab[data-tab="more"]')?.click());
        await tab.locator('#pt-sheet .pt-menu-row-theme').click();
        await tab.waitForFunction(() => !!document.querySelector('#pt-sheet .pt-width-range'));
        const share = await tab.evaluate(() => {
            const input = document.querySelector('#pt-sheet .pt-width-range');
            const expected = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
            return { share: Number(input.style.getPropertyValue('--pt-share')), expected, height: Math.round(input.getBoundingClientRect().height) };
        });
        if (Math.abs(share.share - share.expected) > 0.01 || share.height < 44) throw new Error(`chat width slider: ${JSON.stringify(share)}`);
    } finally {
        await desk.close();
    }
});

await step('a message picture that fails to load shows the name\'s initials inside its slot', async () => {
    await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
    });
    await until(() => !!document.querySelector('#chat .mes .avatar img'), null, 10000);
    // In the page only: the picture's address is broken, and SillyTavern swaps in its "no picture" icon.
    await page.evaluate(() => { document.querySelector('#chat .mes .avatar img').src = '/thumbnail?type=avatar&file=__pocket_tavern_missing__.png'; });
    await until(() => !!document.querySelector('#chat .mes .avatar > .missing-avatar[data-pt-initials]'), null, 8000);
    const picture = await page.evaluate(() => {
        const icon = document.querySelector('#chat .mes .avatar > .missing-avatar');
        const box = icon.getBoundingClientRect();
        const slot = icon.parentElement.getBoundingClientRect();
        return { initials: icon.dataset.ptInitials, inside: box.width <= slot.width + 0.5 && box.height <= slot.height + 0.5 && box.left >= slot.left - 0.5 && box.top >= slot.top - 0.5 };
    });
    if (!/^\p{L}|^\p{N}|^\?$/u.test(picture.initials) || !picture.inside) throw new Error(`missing picture: ${JSON.stringify(picture)}`);
});

await step('Export opens a sheet; the card tools fill their row and message cards keep their colour under Moonlit Echoes; Bubbles keeps SillyTavern\'s own ‹; Backgrounds has no scroll button', async () => {
    // Message cards and the swipe arrow, in the open chat (stand-ins drawn in the page only).
    const chatLook = await page.evaluate(() => {
        const style = document.createElement('style');
        // Moonlit Echoes' rule (same declaration): it unsets every message's background.
        style.textContent = '#chat .mes { background-color: unset !important; }';
        document.head.append(style);
        const mes = document.querySelector('#chat .mes:not([is_system="true"])');
        const card = getComputedStyle(mes).backgroundColor;
        style.remove();
        // SillyTavern's Bubbles (a theme such as Cappuccino turns it on): SillyTavern places ‹ itself.
        document.body.classList.add('bubblechat');
        const arrow = getComputedStyle(document.querySelector('#chat .mes > .swipe_left')).position;
        document.body.classList.remove('bubblechat');
        return { card, arrow };
    });
    if (/^rgba\(0, 0, 0, 0\)$/.test(chatLook.card)) throw new Error('message cards lose their colour under Moonlit Echoes');
    if (chatLook.arrow === 'relative') throw new Error('under Bubbles, ‹ is pulled into the message row');
    await page.locator('.pt-ab-who').click();
    await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
    await page.evaluate(() => document.getElementById('rm_button_selected_ch')?.click());
    await until(() => !!document.getElementById('export_button')?.offsetParent, null, 10000);
    const tools = await page.evaluate(() => {
        const style = document.createElement('style');
        // Moonlit Echoes lays the picture area out from the start edge (stand-in with the effect it had).
        style.textContent = '#avatar_div { align-items: flex-start !important; } #avatar_controls { width: auto !important; flex: 0 1 auto !important; }';
        document.head.append(style);
        const controls = document.getElementById('avatar_controls').getBoundingClientRect().width;
        const card = document.getElementById('avatar_div').getBoundingClientRect().width;
        style.remove();
        return { controls: Math.round(controls), card: Math.round(card) };
    });
    if (tools.controls < tools.card * 0.9) throw new Error(`the card tools are squeezed: ${JSON.stringify(tools)}`);
    await page.locator('#export_button').click();
    await until(() => document.querySelectorAll('#pt-sheet .pt-menu-row').length === 2);
    if (await page.evaluate(() => getComputedStyle(document.getElementById('export_format_popup')).display !== 'none')) throw new Error("SillyTavern's small export list opened too");
    await closeSheet();
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
    await page.waitForTimeout(400);
    if (await page.evaluate(() => getComputedStyle(document.getElementById('bg-scroll-top')).display !== 'none')) throw new Error('the Backgrounds scroll button shows');
});

await step("Character Library's embedded panel sits between the top bar and the tabs", async () => {
    // A stand-in with the extension's own id and inline sizes (it is not installed on GitHub's check).
    // Measured with the tabs showing: tucked away in a chat, the panel rightly reaches the bottom.
    await showTabs();
    const fit = await page.evaluate(() => {
        const panel = document.createElement('div');
        panel.id = 'charlib-embedded-container';
        Object.assign(panel.style, { position: 'fixed', top: 'var(--topBarBlockSize, 37px)', left: '0', right: '0', bottom: '0', zIndex: '2999', display: 'block', background: '#1a1a2e' });
        document.body.append(panel);
        const box = panel.getBoundingClientRect();
        const bar = document.querySelector('.pt-appbar').getBoundingClientRect();
        const tabs = document.getElementById('pt-tabbar').getBoundingClientRect();
        panel.remove();
        return { top: Math.round(box.top - bar.bottom), bottom: Math.round(tabs.top - box.bottom) };
    });
    if (Math.abs(fit.top) > 1 || fit.bottom < -1) throw new Error(`Character Library's panel is under Pocket Tavern's bars: ${JSON.stringify(fit)}`);
});

await step('More can update Pocket Tavern in one tap and shows SillyTavern updates', async () => {
    // SillyTavern's own extension endpoints, answered here so nothing is really pulled.
    const asked = [];
    await page.route('**/api/extensions/version', route => {
        asked.push('version');
        return route.fulfill({ json: { isUpToDate: false, currentBranchName: 'main', currentCommitHash: 'x', remoteUrl: '' } });
    });
    await page.route('**/api/extensions/update', route => {
        asked.push('update');
        return route.fulfill({ json: { isUpToDate: true } });
    });
    await page.route('https://api.github.com/repos/SillyTavern/SillyTavern/releases/latest', route => route.fulfill({ json: { tag_name: 'v99.0.0' } }));
    try {
        await showTabs();
        await page.locator('.pt-tab[data-tab="more"]').click();
        await until(() => !!document.querySelector('#pt-sheet .pt-update-row'));
        await page.locator('#pt-sheet .pt-update-row').click();
        await until(() => /up to date/i.test(document.querySelector('#toast-container')?.textContent ?? ''), null, 10000);
        if (asked.join(',') !== 'version,update') throw new Error(`asked SillyTavern for: ${asked.join(',')}`);
        await page.locator('#pt-sheet .pt-menu-row', { hasText: 'SillyTavern updates' }).click();
        await until(() => /99\.0\.0 is out/.test(document.querySelector('.pt-update-status')?.textContent ?? ''), null, 10000);
        const copy = await page.locator('#pt-sheet .pt-command-copy').count();
        if (copy < 2) throw new Error('the update commands have no copy buttons');
        await closeSheet();
    } finally {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        if (await page.locator('#pt-sheet').count()) await closeSheet();
        // Its notifications sit where the next step's banner shows.
        await page.evaluate(() => { globalThis.toastr?.clear(); document.getElementById('toast-container')?.replaceChildren(); });
    }
});

await step('banner shows when the server stops answering', async () => {
    await page.route('**/api/ping*', route => route.abort());
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await until(() => document.querySelector('.pt-banner:not(.pt-banner-ok)'));
    await page.unroute('**/api/ping*');
    await page.locator('.pt-banner-btn').click();
    await until(() => !document.querySelector('.pt-banner:not(.pt-banner-ok)'));
});

await step('turning Pocket Tavern off leaves nothing behind, and on again works', async () => {
    const off = await page.evaluate(async () => {
        document.getElementById('pt_enabled').click();
        await new Promise(resolve => setTimeout(resolve, 600));
        // Pocket Tavern's own names start with "pt-" or "pt_"; match whole class names so "prompt-…" never counts.
        const ours = el => [...el.classList].some(c => c.startsWith('pt-')) || /^pt[-_]/.test(el.id) || ['data-pt-sec', 'data-pt-row', 'data-pt-view'].some(a => el.hasAttribute(a));
        const stray = [...document.querySelectorAll('body *')].filter(el => ours(el) && !el.closest('#pt_settings')).length;
        const classes = document.documentElement.className;
        document.getElementById('pt_enabled').click();
        return { stray, classes };
    });
    if (off.stray || /(^|\s)pt-/.test(off.classes)) throw new Error(`left behind: ${off.stray} nodes, classes "${off.classes}"`);
    await until(() => document.documentElement.classList.contains('pt-on'));
});

await step('desktop layout: a rail with every page, a panel that stays open and can be widened, a prompt editor that fills it', async () => {
    // Automatic covers computers now: no setting needed. The one-time notice says so.
    await page.evaluate(async () => {
        const context = SillyTavern.getContext();
        context.extensionSettings.mobileUI.desktopNoticeSeen = false;
        context.saveSettingsDebounced();
        await new Promise(resolve => setTimeout(resolve, 2500));
    });
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tab = await desk.newPage();
    tab.on('pageerror', error => {
        if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) extensionErrors.push(`desktop: ${error.message}`);
    });
    try {
        await tab.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-desktop'), null, { timeout: 120000 });
        await tab.waitForFunction(() => /on here too/.test(document.querySelector('#pt-sheet')?.textContent ?? ''), null, { timeout: 10000 });
        await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        await tab.waitForTimeout(600);
        const rail = await tab.evaluate(() => { const r = document.querySelector('.pt-tabbar').getBoundingClientRect(); return { w: r.width, h: r.height }; });
        if (rail.w > 120 || rail.h < 300) throw new Error(`tabs are not a rail: ${JSON.stringify(rail)}`);
        await tab.locator('.pt-tab[data-tab="ai-config-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'ai-config-button');
        const layout = await tab.evaluate(() => {
            const panel = document.querySelector('#ai-config-button > .drawer-content').getBoundingClientRect();
            const chat = document.getElementById('sheld').getBoundingClientRect();
            return { panelRight: panel.right, panelWidth: panel.width, chatLeft: chat.left };
        });
        if (layout.panelWidth > 520 || layout.chatLeft < layout.panelRight) throw new Error(`page is not a panel beside the chat: ${JSON.stringify(layout)}`);
        await tab.locator('#send_textarea').click();
        await tab.evaluate(() => { window.ptTestDown = false; document.addEventListener('mousedown', () => { window.ptTestDown = true; }, { once: true }); });
        await tab.mouse.click(1400, 450);
        await tab.waitForTimeout(400);
        if (await tab.evaluate(() => document.documentElement.dataset.ptPage) !== 'ai-config-button') throw new Error('the page closed when the chat was clicked');
        // The page stays open without swallowing the click: menus and other extensions still hear it.
        if (!await tab.evaluate(() => window.ptTestDown)) throw new Error('a click beside the page never reached the document');
        if (await tab.evaluate(() => document.querySelectorAll('.pinnedOpen').length)) throw new Error('a panel was left marked as pinned');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.documentElement.dataset.ptPage);
        await tab.locator('.pt-tab[data-tab="more"]').click();
        await tab.waitForFunction(() => !!document.getElementById('pt-sheet'));
        const box = await tab.evaluate(() => document.querySelector('#pt-sheet .pt-panel').getBoundingClientRect());
        if (box.bottom > 880) throw new Error('More is not a centred dialog');
        await tab.keyboard.press('Escape');
        // ScenePulse's side panel (it sets its own top from SillyTavern's hidden top bar) and Moonlit's rule that shows every tool.
        const side = await tab.evaluate(async () => {
            const style = document.createElement('style');
            style.textContent = '#leftSendForm > * { display: flex; }';
            document.head.append(style);
            const panel = document.createElement('div');
            panel.id = 'sp-panel';
            panel.className = 'sp-visible';
            panel.style.cssText = 'position: fixed; top: 1px; right: 0; bottom: 0; width: 280px; z-index: 1000;';
            document.body.append(panel);
            await new Promise(resolve => setTimeout(resolve, 100));
            const out = {
                top: Math.round(panel.getBoundingClientRect().top),
                bar: Math.round(document.getElementById('pt-appbar').getBoundingClientRect().bottom),
                arrow: getComputedStyle(document.querySelector('.pt-tabs-btn')).display,
            };
            panel.remove();
            style.remove();
            return out;
        });
        if (side.top < side.bar) throw new Error(`ScenePulse's panel starts at ${side.top}px, under the top bar (${side.bar}px)`);
        if (side.arrow !== 'none') throw new Error(`the tabs arrow shows in the desktop layout (${side.arrow})`);
        // The rail lists SillyTavern's other pages too, the pill follows, and More does not repeat them.
        const railTabs = await tab.locator('.pt-tab:visible').count();
        if (railTabs < 10) throw new Error(`the rail shows ${railTabs} tabs`);
        await tab.locator('.pt-tab[data-tab="user-settings-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'user-settings-button');
        await tab.waitForTimeout(800);
        const pill = await tab.evaluate(() => ({
            pill: Math.round(document.querySelector('.pt-tab-indicator').getBoundingClientRect().top),
            icon: Math.round(document.querySelector('.pt-tab[data-tab="user-settings-button"] .pt-tab-icon').getBoundingClientRect().top),
        }));
        if (Math.abs(pill.pill - pill.icon) > 2) throw new Error(`the rail's pill is not on Settings: ${JSON.stringify(pill)}`);
        // The panel's edge drags it wider, the width is kept, and a double-click puts it back.
        const widthOf = () => tab.evaluate(() => Math.round(document.querySelector('#user-settings-button > .drawer-content').getBoundingClientRect().width));
        const edge = await tab.evaluate(() => {
            const rect = document.getElementById('pt-panel-edge').getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + 300 };
        });
        const start = await widthOf();
        await tab.mouse.move(edge.x, edge.y);
        await tab.mouse.down();
        await tab.mouse.move(edge.x + 150, edge.y, { steps: 6 });
        await tab.mouse.up();
        await tab.waitForTimeout(300);
        const wider = await widthOf();
        const kept = await tab.evaluate(() => localStorage.getItem('pt_panel_w'));
        if (wider - start < 140 || Number(kept) !== wider) throw new Error(`dragging the edge: ${start}px to ${wider}px, kept "${kept}"`);
        await tab.mouse.dblclick(edge.x + 150, edge.y);
        await tab.waitForTimeout(300);
        if (Math.abs(await widthOf() - start) > 1 || await tab.evaluate(() => localStorage.getItem('pt_panel_w'))) throw new Error('a double-click on the edge did not reset the panel');
        // Extensions: one column in the panel.
        await tab.locator('.pt-tab[data-tab="extensions-settings-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'extensions-settings-button');
        await tab.waitForTimeout(600);
        const columns = await tab.evaluate(() => [document.getElementById('extensions_settings'), document.getElementById('extensions_settings2')].map(node => Math.round(node.getBoundingClientRect().left)));
        if (columns[0] !== columns[1]) throw new Error(`the Extensions page has two columns: ${columns}`);
        await tab.locator('.pt-tab[data-tab="more"]').click();
        await tab.waitForFunction(() => !!document.getElementById('pt-sheet'));
        const tiles = await tab.locator('#pt-sheet .pt-tile-label').allInnerTexts();
        if (tiles.some(label => ['API', 'Settings', 'Extensions', 'Personas'].includes(label.trim()))) throw new Error(`More repeats the rail: ${tiles}`);
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('pt-sheet'));
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.documentElement.dataset.ptPage);
        // A laptop window with browser bars: More still fits on the rail.
        await tab.setViewportSize({ width: 1280, height: 620 });
        await tab.waitForTimeout(500);
        const short = await tab.evaluate(() => ({
            more: Math.round(document.querySelector('.pt-tab[data-tab="more"]').getBoundingClientRect().bottom),
            rail: Math.round(document.getElementById('pt-tabbar').getBoundingClientRect().bottom),
        }));
        if (short.more > short.rail) throw new Error(`More is cut off at 620px tall: ${JSON.stringify(short)}`);
        await tab.setViewportSize({ width: 1440, height: 900 });
        await tab.waitForTimeout(500);
        // The prompt editor fills the panel to the bottom, full screen takes the width, and Escape leaves it step by step.
        const api = await tab.evaluate(() => document.getElementById('main_api').value);
        const setApi = want => tab.evaluate(value => {
            const select = document.getElementById('main_api');
            if (select.value === value) return;
            select.value = value;
            select.dispatchEvent(new Event('change'));
        }, want);
        try {
            await setApi('openai');
            await tab.waitForTimeout(800);
            await tab.locator('.pt-tab[data-tab="ai-config-button"]').click();
            await tab.waitForFunction(() => !!document.querySelector('#completion_prompt_manager_list .prompt-manager-edit-action'), null, { timeout: 15000 });
            // Chat Completion Tabs (when installed) builds its tabs up to 2 seconds after the API switch.
            await tab.waitForTimeout(2200);
            await tab.evaluate(() => (document.getElementById('openai-tab-btn-prompts') ?? document.getElementById('pt_ptab_prompts'))?.click());
            const edit = tab.locator('#completion_prompt_manager_list .prompt-manager-edit-action').first();
            await edit.scrollIntoViewIfNeeded();
            await edit.click();
            await tab.waitForFunction(() => document.documentElement.classList.contains('pt-prompt-editor'));
            await tab.waitForTimeout(600);
            const editor = await tab.evaluate(() => ({
                bottom: Math.round(document.getElementById('completion_prompt_manager_popup').getBoundingClientRect().bottom),
                width: Math.round(document.getElementById('completion_prompt_manager_popup').getBoundingClientRect().width),
                panel: Math.round(document.querySelector('#ai-config-button > .drawer-content').getBoundingClientRect().width),
                screen: innerHeight,
            }));
            if (editor.bottom !== editor.screen || editor.width !== editor.panel) throw new Error(`the prompt editor does not fill the panel: ${JSON.stringify(editor)}`);
            await tab.locator('#pt_prompt_full').click();
            await tab.waitForTimeout(400);
            const fullWidth = await tab.evaluate(() => Math.round(document.getElementById('completion_prompt_manager_popup').getBoundingClientRect().width));
            if (fullWidth < 1200) throw new Error(`full screen is ${fullWidth}px wide`);
            await tab.keyboard.press('Escape');
            await tab.waitForFunction(() => !document.documentElement.classList.contains('pt-prompt-full'));
            await tab.keyboard.press('Escape');
            await tab.waitForFunction(() => document.getElementById('completion_prompt_manager_popup').style.display === 'none');
        } finally {
            await setApi(api);
            // SillyTavern saves a second later; wait, or closing the window loses the change.
            await tab.waitForTimeout(2000);
        }
    } finally {
        await desk.close();
    }
});

await step('desktop layout: tool panels dock beside the chat, the Token Counter fits, personas look like characters, picking a character keeps its card', async () => {
    const desk = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const tab = await desk.newPage();
    tab.on('pageerror', error => {
        if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) extensionErrors.push(`desktop: ${error.message}`);
    });
    const settle = (ms = 500) => tab.waitForTimeout(ms);
    try {
        await tab.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-desktop') && window.SillyTavern?.getContext, null, { timeout: 120000 });
        await settle(2500);
        await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        await tab.evaluate(async () => {
            const context = SillyTavern.getContext();
            if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
        });
        await settle(1500);
        // Token probabilities (a tool panel) docks in a column on the right, and the chat moves over.
        const chatBefore = await tab.evaluate(() => Math.round(document.getElementById('sheld').getBoundingClientRect().right));
        await tab.evaluate(() => document.getElementById('option_toggle_logprobs').click());
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-tools-open'), null, { timeout: 5000 });
        await settle();
        const docked = await tab.evaluate(() => {
            const panel = document.getElementById('logprobsViewer').getBoundingClientRect();
            return { left: Math.round(panel.left), right: Math.round(panel.right), top: Math.round(panel.top), bar: Math.round(document.getElementById('pt-appbar').getBoundingClientRect().bottom), chat: Math.round(document.getElementById('sheld').getBoundingClientRect().right), screen: innerWidth };
        });
        if (docked.right < docked.screen - 24 || docked.top < docked.bar || docked.chat > docked.left) throw new Error(`Token probabilities is not docked beside the chat: ${JSON.stringify({ ...docked, chatBefore })}`);
        await tab.mouse.click(docked.screen / 2, 450);
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.documentElement.classList.contains('pt-tools-open'), null, { timeout: 5000 });
        // The Token Counter is a dialog as tall as what it holds, not the whole screen.
        await tab.evaluate(() => document.getElementById('token_counter')?.click());
        await tab.waitForFunction(() => !!document.querySelector('dialog[open] #token_counter_textarea'), null, { timeout: 5000 });
        await settle();
        const counter = await tab.evaluate(() => Math.round(document.querySelector('dialog[open]').getBoundingClientRect().height));
        if (counter > 760) throw new Error(`the Token Counter is ${counter}px tall`);
        await tab.keyboard.press('Escape');
        await settle();
        // Picking someone on the Characters page keeps the page open and shows their card.
        await tab.locator('.pt-tab[data-tab="rightNavHolder"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
        await tab.evaluate(() => document.getElementById('rm_button_characters')?.click());
        await settle(800);
        await tab.locator('#rm_print_characters_block .character_select').first().click();
        // Their sheet first; Chat opens the chat beside the page.
        await tab.waitForFunction(() => !!document.querySelector('#pt-sheet.pt-char-sheet .pt-cs-primary'), null, { timeout: 5000 });
        await tab.locator('#pt-sheet .pt-cs-primary').click();
        await settle(2500);
        if (await tab.evaluate(() => document.documentElement.dataset.ptPage) !== 'rightNavHolder') throw new Error('picking a character closed the page');
        // Personas: labeled tools like a character card, and on a wide page the list and the card side by side.
        await tab.locator('.pt-tab[data-tab="persona-management-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'persona-management-button');
        await settle(600);
        if (!(await tab.locator('#persona_rename_button .pt-btn-label').count())) throw new Error('the persona tools have no labels');
        const edge = await tab.evaluate(() => {
            const rect = document.getElementById('pt-panel-edge').getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + 300 };
        });
        await tab.mouse.move(edge.x, edge.y);
        await tab.mouse.down();
        await tab.mouse.move(edge.x + 400, edge.y, { steps: 6 });
        await tab.mouse.up();
        await settle(500);
        const side = await tab.evaluate(() => ['.persona_management_left_column', '.persona_management_right_column'].map(sel => getComputedStyle(document.querySelector(`#persona-management-block > ${sel}`)).display));
        await tab.mouse.dblclick(edge.x + 400, edge.y);
        if (side.includes('none')) throw new Error(`the persona list and card are not side by side on a wide page: ${side}`);
        // Backgrounds: Auto-select, New folder and Add background are 44px icons.
        await tab.locator('.pt-tab[data-tab="backgrounds-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'backgrounds-button');
        await settle(600);
        const bg = await tab.evaluate(() => [...document.querySelectorAll('#Backgrounds .bg-header-row-1 > .menu_button_icon')].map(button => ({ w: Math.round(button.getBoundingClientRect().width), text: getComputedStyle(button.querySelector('span')).display })));
        if (!bg.length || bg.some(button => button.w < 44 || button.text !== 'none')) throw new Error(`the Backgrounds buttons: ${JSON.stringify(bg)}`);
        // On a computer, More says Features, not Phone features.
        await tab.locator('.pt-tab[data-tab="more"]').click();
        await tab.waitForFunction(() => !!document.getElementById('pt-sheet'));
        const rows = await tab.locator('#pt-sheet .pt-menu-row').allInnerTexts();
        if (rows.some(row => row.includes('Phone features')) || !rows.some(row => row.includes('Features'))) throw new Error('More still says Phone features on a computer');
        await tab.keyboard.press('Escape');
    } finally {
        await desk.close();
    }
});

await step('on a 320px phone every message box tool stays 44px, lorebook chips have a 44px ×, Arabic mirrors row arrows, and the translate note says where Google is asked', async () => {
    const small = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 320, height: 640 } });
    const tab = await small.newPage();
    tab.on('pageerror', error => {
        if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) extensionErrors.push(`320px: ${error.message}`);
    });
    try {
        await tab.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-on') && window.SillyTavern?.getContext, null, { timeout: 120000 });
        await tab.waitForTimeout(2500);
        await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        await tab.evaluate(async () => {
            const context = SillyTavern.getContext();
            if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
        });
        await tab.waitForTimeout(2000);
        // With Guided Generations' button there are seven tools; none may be squeezed under 44px.
        const tools = await tab.evaluate(() => ['leftSendForm', 'rightSendForm'].flatMap(id => [...document.getElementById(id).children]
            .filter(node => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0)
            .map(node => ({ name: node.id || node.className.split(' ')[0], w: Math.round(node.getBoundingClientRect().width) }))));
        // Send is a 42px circle in a 44px tap area; everything else is at least 44px wide.
        const tooSmall = tools.filter(tool => tool.w < (/send_but/.test(tool.name) ? 42 : 44));
        if (tooSmall.length) throw new Error(`squeezed at 320px: ${JSON.stringify(tooSmall)}`);
        // A lorebook chip's × is a full 44px target (the chip itself is 44px tall).
        const chip = await tab.evaluate(() => {
            const holder = document.createElement('div');
            holder.className = 'pt-chips';
            holder.innerHTML = '<span class="pt-chip"><span class="pt-chip-text">Book</span><button type="button" class="pt-chip-x">x</button></span>';
            document.body.append(holder);
            const rect = holder.querySelector('.pt-chip-x').getBoundingClientRect();
            holder.remove();
            return { w: Math.round(rect.width), h: Math.round(rect.height) };
        });
        if (chip.w < 44 || chip.h < 44) throw new Error(`lorebook chip × is ${chip.w}x${chip.h}`);
        // Arabic: the row arrows point the way you read, and the chat's name sits by its picture.
        if (await tab.evaluate(() => document.documentElement.classList.contains('pt-tabs-tucked'))) await tab.locator('.pt-tabs-btn').click();
        await tab.locator('.pt-tab[data-tab="more"]').click();
        await tab.waitForFunction(() => !!document.querySelector('#pt-sheet .pt-menu-row-go'));
        const rtl = await tab.evaluate(() => {
            const root = document.documentElement;
            root.classList.add('pt-rtl');
            const arrow = getComputedStyle(document.querySelector('#pt-sheet .pt-menu-row-go')).transform;
            const align = getComputedStyle(document.querySelector('.pt-ab-who')).textAlign;
            root.classList.remove('pt-rtl');
            return { arrow, align };
        });
        if (!rtl.arrow.startsWith('matrix(-1') || !['start', 'right'].includes(rtl.align)) throw new Error(`Arabic: ${JSON.stringify(rtl)}`);
        // Google Translate is asked straight from the browser; the note must not say "through your server".
        await tab.locator('#pt-sheet .pt-menu-row', { hasText: 'Translate chat' }).click();
        await tab.waitForFunction(() => /Translate chat/.test(document.querySelector('#pt-sheet .pt-overlay-title')?.textContent ?? ''));
        const note = await tab.evaluate(() => ({
            provider: SillyTavern.getContext().extensionSettings?.translate?.provider ?? 'google',
            text: [...document.querySelectorAll('#pt-sheet .pt-menu-foot')].map(node => node.textContent).join(' '),
        }));
        if (note.provider === 'google' && !/straight from this browser/.test(note.text)) throw new Error(`translate note: ${note.text}`);
        await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
    } finally {
        await small.close();
    }
});

await step('desktop layout: Escape closes Search this chat before the page, and Enter in Search everything opens the first result', async () => {
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tab = await desk.newPage();
    tab.on('pageerror', error => {
        if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) extensionErrors.push(`desktop: ${error.message}`);
    });
    try {
        await tab.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-desktop') && window.SillyTavern?.getContext, null, { timeout: 120000 });
        await tab.waitForTimeout(2500);
        await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        await tab.evaluate(async () => {
            const context = SillyTavern.getContext();
            if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
        });
        await tab.waitForTimeout(1500);
        await tab.locator('.pt-tab[data-tab="more"]').click();
        await tab.locator('#pt-sheet .pt-menu-row', { hasText: 'Search this chat' }).click();
        await tab.waitForFunction(() => document.activeElement?.closest?.('.pt-chat-finder'));
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.querySelector('.pt-chat-finder'), null, { timeout: 3000 });
        // Ctrl+K, a few letters and Enter: the first result opens (here a setting on the Settings page).
        await tab.evaluate(() => document.activeElement?.blur?.());
        await tab.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyK' : 'Control+KeyK');
        await tab.waitForFunction(() => /Search everything/.test(document.querySelector('#pt-sheet .pt-overlay-title')?.textContent ?? ''));
        await tab.waitForTimeout(300);
        await tab.keyboard.type('chat width');
        await tab.waitForTimeout(400);
        await tab.keyboard.press('Enter');
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'user-settings-button' && !document.getElementById('pt-sheet'), null, { timeout: 5000 });
        await tab.keyboard.press('Escape');
    } finally {
        await desk.close();
    }
});

await step('desktop layout at 1366 × 768: preset buttons stay one row, the prompt dropdown gets its own line, Chat Completion Tabs sticks flush, the Backgrounds tabs clear their buttons and take clicks at their edges, the Personas buttons share their row, Moonlit Echoes keeps the swipe arrows together, the switches their shape and Chat Top Bar on the chat column, and lists indent four characters', async () => {
    const desk = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const tab = await desk.newPage();
    tab.on('pageerror', error => {
        if (/Mobile-UI|PocketTavern|\bpt-[a-z]/i.test(`${error.stack ?? ''} ${error.message}`)) extensionErrors.push(`1366: ${error.message}`);
    });
    let api = null;
    try {
        await tab.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-desktop') && window.SillyTavern?.getContext, null, { timeout: 120000 });
        await tab.waitForTimeout(2500);
        await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        // The prompt list only lives in the Chat Completion API; switched back in finally.
        api = await tab.evaluate(() => document.getElementById('main_api').value);
        await tab.evaluate(() => { const select = document.getElementById('main_api'); select.value = 'openai'; jQuery(select).trigger('change'); });
        await tab.waitForTimeout(1500);
        await tab.locator('.pt-tab[data-tab="ai-config-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'ai-config-button');
        await tab.waitForTimeout(800);
        const presets = await tab.evaluate(() => {
            const head = document.querySelector('#ai-config-button .title_restorable.standoutHeader:has(#import_oai_preset)');
            const rows = () => new Set([...head.querySelectorAll(':scope > .flex-container > *')].filter(node => node.offsetParent).map(node => Math.round(node.getBoundingClientRect().top))).size;
            // A larger font (the report): the buttons move under the name as one row, never 3 + 1.
            const title = head.querySelector('strong');
            title.style.fontSize = '22px';
            const bigRows = rows();
            title.style.fontSize = '';
            const select = document.getElementById('completion_prompt_manager_footer_append_prompt');
            const footer = select?.parentElement;
            const button = footer?.querySelector(':scope > a');
            return {
                rows: rows(),
                bigRows,
                select: select && Math.round(select.getBoundingClientRect().width),
                footer: footer && Math.round(footer.getBoundingClientRect().width),
                below: !!(select && button) && select.getBoundingClientRect().top >= button.getBoundingClientRect().bottom - 1,
            };
        });
        if (presets.rows !== 1 || presets.bigRows !== 1) throw new Error(`preset buttons wrap: ${JSON.stringify(presets)}`);
        if (presets.select !== null && (presets.select < presets.footer * 0.8 || !presets.below)) throw new Error(`prompt dropdown is squeezed: ${JSON.stringify(presets)}`);
        // Chat Completion Tabs (when installed): its bar sticks flush with the top of the page, with no strip above it.
        const tabsGap = await tab.evaluate(async () => {
            const bar = document.querySelector('.openai-tab-buttons');
            const scroller = bar?.closest('.scrollableInner');
            if (!bar || !scroller) return null;
            scroller.scrollTop = 700;
            await new Promise(resolve => setTimeout(resolve, 300));
            const gap = Math.round(bar.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
            scroller.scrollTop = 0;
            return gap;
        });
        if (tabsGap !== null && Math.abs(tabsGap) > 1) throw new Error(`Chat Completion Tabs' bar sticks ${tabsGap}px from the top of the page`);
        // Without Chat Completion Tabs, Pocket Tavern's own Parameters / Prompts tabs each show one half.
        const ownTabs = await tab.evaluate(async () => {
            if (!document.getElementById('pt_ptab_prompts')) return null;
            const shown = () => ({ prompts: !!document.getElementById('completion_prompt_manager')?.offsetParent, sliders: !!document.getElementById('range_block_openai')?.offsetParent });
            const params = shown();
            document.getElementById('pt_ptab_prompts').click();
            await new Promise(resolve => setTimeout(resolve, 200));
            const prompts = shown();
            document.getElementById('pt_ptab_params').click();
            return { params, prompts };
        });
        if (ownTabs && (ownTabs.params.prompts || !ownTabs.params.sliders || !ownTabs.prompts.prompts || ownTabs.prompts.sliders)) throw new Error(`Parameters / Prompts tabs: ${JSON.stringify(ownTabs)}`);
        // Backgrounds: Global and Chat never sit under the select, − and + buttons.
        await tab.locator('.pt-tab[data-tab="backgrounds-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'backgrounds-button');
        await tab.waitForTimeout(800);
        const bg = await tab.evaluate(() => {
            const boxes = selector => [...document.querySelectorAll(selector)].filter(node => node.offsetParent).map(node => node.getBoundingClientRect());
            const tabs = boxes('#bg_tabs .bg_tab_button');
            const buttons = boxes('#bg_tabs .heading-controls > button');
            const hit = tabs.some(a => buttons.some(b => b.left < a.right - 1 && a.left < b.right - 1 && b.top < a.bottom - 1 && a.top < b.bottom - 1));
            // SillyTavern's − / + thumbnail buttons could not change Pocket Tavern's grid, so they are hidden (issue #7).
            const zoom = ['bg_thumb_zoom_out', 'bg_thumb_zoom_in'].some(id => document.getElementById(id)?.offsetParent);
            return { hit, zoom, small: buttons.filter(b => b.width < 44 || b.height < 44).length };
        });
        if (bg.hit || bg.small || bg.zoom) throw new Error(`Backgrounds tab row: ${JSON.stringify(bg)}`);
        // The link inside each tab switches it: it fills the tab, so a click near the top or bottom edge works too.
        const edges = await tab.evaluate(() => [...document.querySelectorAll('#bg_tabs .bg_tab_button')].filter(node => node.offsetParent).every(node => {
            const box = node.getBoundingClientRect();
            return [box.top + 3, box.bottom - 3].every(y => document.elementFromPoint(box.left + box.width / 2, y)?.closest('a'));
        }));
        if (!edges) throw new Error('a Backgrounds tab ignores clicks near its top or bottom edge');
        // Personas: Usage Stats, Backup and Restore share the whole row.
        await tab.locator('.pt-tab[data-tab="persona-management-button"]').click();
        await tab.waitForFunction(() => document.documentElement.dataset.ptPage === 'persona-management-button');
        await tab.waitForTimeout(800);
        const personaRow = await tab.evaluate(() => {
            const buttons = [...document.querySelectorAll('.user_stats_button, #personas_backup, #personas_restore')].map(node => node.getBoundingClientRect());
            const row = document.getElementById('persona-management-block').getBoundingClientRect();
            return { start: Math.round(buttons[0].left - row.left), end: Math.round(row.right - buttons.at(-1).right) };
        });
        if (Math.abs(personaRow.start) > 4 || Math.abs(personaRow.end) > 4) throw new Error(`the Personas buttons do not fill their row: ${JSON.stringify(personaRow)}`);
        await tab.keyboard.press('Escape');
        // Moonlit Echoes' swipe rules (a stand-in with the same declarations): ‹ stays against the rest of the pill.
        await tab.evaluate(async () => {
            const context = SillyTavern.getContext();
            if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
        });
        await tab.waitForTimeout(1500);
        const pill = await tab.evaluate(async () => {
            const style = document.createElement('style');
            style.id = 'test-moonlit-swipes';
            style.textContent = '#chat .swipe_left { position: absolute; right: calc(1em + 100px) !important; left: auto; bottom: 20px; }'
                + ' #chat .last_mes .swipe_left, #chat .last_mes .swipe_right { transform: scale(0.8); }'
                + ' #chat .last_mes .swipes-counter { width: 60px; letter-spacing: 1.5px; } .swipes-counter { margin-right: 10px; }';
            document.head.append(style);
            // Three versions of the last reply in memory only (never saved), so ‹ shows.
            const last = SillyTavern.getContext().chat.at(-1);
            const before = { swipes: last.swipes, id: last.swipe_id, info: last.swipe_info };
            last.swipes = [last.mes, `${last.mes} (2)`, `${last.mes} (3)`];
            last.swipe_id = 0;
            last.swipe_info = last.swipes.map(() => ({}));
            const script = await import('/script.js');
            script.refreshSwipeButtons(true, false);
            await new Promise(resolve => setTimeout(resolve, 300));
            const mes = document.querySelector('#chat .mes.last_mes');
            const left = mes.querySelector('.swipe_left').getBoundingClientRect();
            const right = mes.querySelector('.swipeRightBlock').getBoundingClientRect();
            const out = { gap: Math.round(right.left - left.right), top: Math.round(right.top - left.top), scale: getComputedStyle(mes.querySelector('.swipe_left')).transform };
            style.remove();
            Object.assign(last, { swipes: before.swipes, swipe_id: before.id, swipe_info: before.info });
            script.refreshSwipeButtons(true, false);
            return out;
        });
        if (pill.gap < 0 || pill.gap > 8 || Math.abs(pill.top) > 2 || pill.scale !== 'none') throw new Error(`Moonlit Echoes pulls the swipe arrows apart: ${JSON.stringify(pill)}`);
        // Moonlit Echoes' checkbox rules (a stand-in with the same declarations): a settings switch keeps its pill shape and edge.
        const toggle = await tab.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = "input[type='checkbox'] { border: none !important; border-radius: 100% !important; } input[type='checkbox']:checked { background-color: red !important; }";
            document.head.append(style);
            const input = document.querySelector('#user-settings-block label.checkbox_label > input[type="checkbox"]');
            const look = getComputedStyle(input);
            const out = { radius: look.borderRadius, edge: look.borderTopWidth };
            style.remove();
            return out;
        });
        if (toggle.radius !== '999px' || toggle.edge !== '1px') throw new Error(`a switch loses its shape under Moonlit Echoes: ${JSON.stringify(toggle)}`);
        // Chat Top Bar under Moonlit Echoes (stand-ins with the same declarations): the bar lines up with the chat column (issue #8).
        // Lists in a message indent about four characters, not the browser's 40px (issue #6).
        const extras = await tab.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = '#extensionTopBar { position: fixed; top: calc(var(--topBarBlockSize) + 5px) !important; left: 50%; transform: translateX(-50%); width: calc(var(--sheldWidth) - 20px) !important; height: 40px; display: flex; }'
                + ' body:has(#extensionTopBar) #sheld { padding-top: calc(var(--topBarBlockSize)) !important; }';
            document.head.append(style);
            const sheld = document.getElementById('sheld');
            const chat = document.getElementById('chat');
            const bar = document.createElement('div');
            bar.id = 'extensionTopBar';
            sheld.insertBefore(bar, chat);
            const a = bar.getBoundingClientRect();
            const c = chat.getBoundingClientRect();
            const top = { left: Math.round(a.left - c.left), right: Math.round(c.right - a.right), gap: Math.round(c.top - a.bottom) };
            bar.remove();
            style.remove();
            const list = document.createElement('ul');
            list.innerHTML = '<li>one</li>';
            const text = document.querySelector('#chat .mes .mes_text');
            text.append(list);
            const indent = parseFloat(getComputedStyle(list).paddingInlineStart) / parseFloat(getComputedStyle(text).fontSize);
            list.remove();
            return { top, indent };
        });
        if (Math.abs(extras.top.left) > 1 || Math.abs(extras.top.right) > 1 || Math.abs(extras.top.gap) > 1) throw new Error(`Chat Top Bar does not line up with the chat under Moonlit Echoes: ${JSON.stringify(extras.top)}`);
        if (extras.indent > 1.5) throw new Error(`lists in a message indent ${extras.indent.toFixed(2)}em`);
    } finally {
        if (api) {
            await tab.evaluate(value => { const select = document.getElementById('main_api'); select.value = value; jQuery(select).trigger('change'); }, api).catch(() => {});
            await tab.waitForTimeout(2500);
        }
        await desk.close();
    }
});

await step('over a chat background, pages, sheets and the message box are solid and nothing is blurred; toasts sit above sheets; tables keep whole words', async () => {
    const before = await page.evaluate(() => {
        const s = SillyTavern.getContext().extensionSettings.mobileUI;
        return { theme: s.theme, backdrop: s.themeBackdrop, bg: document.getElementById('bg1').style.backgroundImage, noBlur: document.body.classList.contains('no-blur') };
    });
    const opaque = color => !/rgba\(.*,\s*0?\.\d+\)|\/\s*0?\.\d+\)/.test(color);
    // Picking a theme can turn its own background back on a moment later: switch it off until glass shows.
    const ensureGlass = async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
            await page.waitForTimeout(500);
            const state = await page.evaluate(() => {
                document.getElementById('bg1').style.backgroundImage = 'url("img/ai4.png")';
                if (document.documentElement.classList.contains('pt-backdrop')) document.getElementById('pt_backdrop').click();
                return document.documentElement.classList.contains('pt-glass');
            });
            if (state) return;
        }
        throw new Error('glass did not turn on over the background');
    };
    try {
        // A see-through theme over a chat background (drawn only, nothing saved to the chat).
        await page.evaluate(() => {
            const theme = document.getElementById('pt_theme');
            theme.value = 'amoled';
            theme.dispatchEvent(new Event('change', { bubbles: true }));
            document.body.classList.add('no-blur');
        });
        await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Seraphina'))); });
        await until(() => document.querySelectorAll('#chat .mes').length > 0);
        await ensureGlass();
        const box = await page.evaluate(() => getComputedStyle(document.getElementById('send_form')).backgroundColor);
        if (!opaque(box)) throw new Error(`message box is see-through with No Blur: ${box}`);
        await showTabs();
        await page.locator('.pt-tab[data-tab="more"]').click();
        await page.locator('#pt-sheet').waitFor();
        const sheetBg = await page.evaluate(() => getComputedStyle(document.querySelector('#pt-sheet .pt-panel')).backgroundColor);
        if (!opaque(sheetBg)) throw new Error(`More is see-through with No Blur: ${sheetBg}`);
        // A toast while the sheet is open is drawn above it, where it can be tapped.
        const toast = await page.evaluate(async () => {
            window.toastr.info('Above the sheet', 'Test', { timeOut: 1500 });
            await new Promise(resolve => setTimeout(resolve, 400));
            const el = document.querySelector('#toast-container .toast');
            if (!el) return 'no toast';
            const r = el.getBoundingClientRect();
            return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) ? 'ok' : 'under the sheet';
        });
        if (toast !== 'ok') throw new Error(`toast: ${toast}`);
        await closeSheet();
        await page.evaluate(() => document.querySelector('#extensions-settings-button > .drawer-toggle').click());
        await until(() => document.documentElement.dataset.ptPage === 'extensions-settings-button');
        await page.waitForTimeout(400);
        const pageBg = await page.evaluate(() => getComputedStyle(document.querySelector('#extensions-settings-button .drawer-content')).backgroundColor);
        if (!opaque(pageBg)) throw new Error(`Extensions page is see-through with No Blur: ${pageBg}`);
        await page.locator('.pt-tab[data-tab="chat"]').click();
        await until(() => !document.documentElement.dataset.ptPage);
        // With SillyTavern's blur on too, nothing in the page is blurred (DESIGN.md).
        await ensureGlass();
        const blurred = await page.evaluate(async () => {
            document.body.classList.remove('no-blur');
            await new Promise(resolve => setTimeout(resolve, 200));
            return [...document.querySelectorAll('*')].filter(el => { const b = getComputedStyle(el).backdropFilter; return b && b !== 'none'; }).map(el => el.id || String(el.className).slice(0, 30)).slice(0, 5);
        });
        if (blurred.length) throw new Error(`blurred elements: ${blurred.join(', ')}`);
        // A table wider than the card scrolls instead of cutting words.
        const table = await page.evaluate(() => {
            const text = [...document.querySelectorAll('#chat .mes .mes_text')].pop();
            text.insertAdjacentHTML('beforeend', '<table id="pt_test_table"><tr><th>Name</th><th>Role</th><th>Notes about this person that go on and on</th></tr><tr><td>Seraphina</td><td>Guardian</td><td>Lives in the forest glade and heals travellers</td></tr></table>');
            const el = document.getElementById('pt_test_table');
            const cut = [...el.querySelectorAll('td, th')].some(cell => cell.getClientRects().length && cell.firstChild && (() => {
                const range = document.createRange();
                range.selectNodeContents(cell);
                const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top)));
                return lines.size > 1 && !/\s/.test(cell.textContent.trim());
            })());
            const result = { cut, display: getComputedStyle(el).display, inside: el.getBoundingClientRect().right <= text.getBoundingClientRect().right + 1 };
            el.remove();
            return result;
        });
        if (table.cut) throw new Error('a one-word table cell was split across lines');
        if (!table.inside) throw new Error('a table runs out of its message');
    } finally {
        await page.evaluate(b => {
            const theme = document.getElementById('pt_theme');
            theme.value = b.theme;
            theme.dispatchEvent(new Event('change', { bubbles: true }));
            const backdrop = document.getElementById('pt_backdrop');
            if (backdrop.checked !== b.backdrop) backdrop.click();
            document.getElementById('bg1').style.backgroundImage = b.bg;
            document.body.classList.toggle('no-blur', b.noBlur);
        }, before).catch(() => {});
        await page.waitForTimeout(2200);
    }
});

await step("with SillyTavern's blur on, the message editor and an opened lorebook entry stay on the screen", async () => {
    // A backdrop-filter on #chat or a page made it the frame for the fixed editor, which
    // then sat in the scrolled chat or page, far above the screen (seen on a real phone).
    const noBlur = await page.evaluate(() => document.body.classList.contains('no-blur'));
    const onScreen = r => r && r.top >= 0 && r.top < 200 && r.bottom <= 900;
    const book = 'Pocket Tavern blur test';
    try {
        await page.evaluate(() => document.body.classList.remove('no-blur'));
        await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Seraphina'))); });
        await until(() => document.querySelectorAll('#chat .mes .mes_edit').length > 0);
        // A chat long enough to scroll, drawn in this page only (a fresh SillyTavern has one message).
        await page.evaluate(async () => {
            const context = SillyTavern.getContext();
            const sample = context.chat.filter(message => !message.is_system).slice(0, 4);
            while (context.chat.length < 24) for (const message of sample) context.chat.push(structuredClone(message));
            await context.clearChat();
            await context.printMessages();
        });
        await until(() => document.querySelectorAll('#chat .mes .mes_edit').length >= 20);
        await page.evaluate(() => document.getElementById('chat').scrollTo(0, 1e9));
        await page.waitForTimeout(2800);
        // SillyTavern blurs #chat when No Blur is off; Pocket Tavern switches that off, which keeps fixed layers on screen.
        const chatBlur = await page.evaluate(() => getComputedStyle(document.getElementById('chat')).backdropFilter);
        if (chatBlur !== 'none') throw new Error(`#chat is blurred (${chatBlur}): fixed layers inside it would be trapped`);
        // An older message, so the chat is scrolled when the editor opens.
        await page.evaluate(() => { const all = [...document.querySelectorAll('#chat .mes .mes_edit')]; all[Math.max(0, all.length - 3)].click(); });
        await until(() => document.documentElement.classList.contains('pt-editing'));
        await page.waitForTimeout(400);
        const editor = await page.evaluate(() => { const b = document.getElementById('curEditTextarea').closest('.mes').getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
        if (!onScreen(editor)) throw new Error(`the message editor is off the screen: ${JSON.stringify(editor)}`);
        await page.evaluate(() => document.querySelector('#chat .mes:has(#curEditTextarea) .mes_edit_cancel').click());
        await until(() => !document.documentElement.classList.contains('pt-editing'));
        // A lorebook entry opened from further down the page.
        await showTabs();
        await page.locator('.pt-tab[data-tab="WI-SP-button"]').click();
        await until(() => document.documentElement.dataset.ptPage === 'WI-SP-button');
        // A lorebook of its own with a dozen entries, so the page scrolls (deleted below).
        await page.evaluate(async name => {
            const context = SillyTavern.getContext();
            await context.saveWorldInfo(name, { entries: {} }, true);
            await context.updateWorldInfoList();
            const select = document.getElementById('world_editor_select');
            select.value = [...select.options].find(option => option.textContent === name).value;
            jQuery(select).trigger('change');
        }, book);
        await until(() => document.getElementById('world_popup_new')?.offsetParent, null, 10000);
        for (let i = 0; i < 12; i++) {
            await page.evaluate(() => document.getElementById('world_popup_new').click());
            await page.waitForTimeout(150);
        }
        await until(() => document.querySelectorAll('#world_popup_entries_list .world_entry').length >= 12, null, 10000);
        await page.evaluate(() => {
            const entry = document.querySelectorAll('#world_popup_entries_list .world_entry')[6];
            entry.scrollIntoView({ block: 'center' });
            entry.querySelector('.inline-drawer-toggle').click();
        });
        await until(() => document.documentElement.classList.contains('pt-entry-editing'));
        await page.waitForTimeout(400);
        const entry = await page.evaluate(() => {
            const b = document.querySelector('.world_entry.pt-entry-open').getBoundingClientRect();
            return { top: Math.round(b.top), bottom: Math.round(b.bottom), scrolled: Math.round(document.getElementById('WorldInfo').scrollTop) };
        });
        if (!entry.scrolled) throw new Error('the Lorebooks page was not scrolled: the test would prove nothing');
        if (!onScreen(entry)) throw new Error(`the opened entry is off the screen: ${JSON.stringify(entry)}`);
        await page.evaluate(() => document.querySelector('.world_entry.pt-entry-open .inline-drawer-toggle').click());
        await until(() => !document.documentElement.classList.contains('pt-entry-editing'));
    } finally {
        await page.evaluate(async ([had, name]) => {
            const context = SillyTavern.getContext();
            document.body.classList.toggle('no-blur', had);
            document.querySelector('#chat .mes:has(#curEditTextarea) .mes_edit_cancel')?.click();
            const select = document.getElementById('world_editor_select');
            select.value = '';
            jQuery(select).trigger('change');
            await fetch('/api/worldinfo/delete', { method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify({ name }) });
            await context.updateWorldInfoList();
            document.querySelector('.pt-tab[data-tab="chat"]')?.click();
            // The chat as it is on disk again.
            await context.reloadCurrentChat();
        }, [noBlur, book]).catch(() => {});
        await page.waitForTimeout(1000);
    }
});

await step("the context ring counts your reply's prompt, not small background prompts (issue #3)", async () => {
    const ring = await page.evaluate(async () => {
        const { eventSource, eventTypes } = SillyTavern.getContext();
        const percent = () => document.querySelector('#send_form .pt-ctx-ring .pt-ctx-num')?.textContent ?? null;
        const wait = () => new Promise(resolve => setTimeout(resolve, 600));
        const long = Array.from({ length: 400 }, (_, i) => `The rain kept falling over the old tavern, line ${i}.`).join('\n');
        await eventSource.emit(eventTypes.GENERATION_STARTED, 'normal', {}, false);
        await eventSource.emit(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, { prompt: long, dryRun: false });
        await wait();
        const reply = percent();
        // An extension's generateRaw, a quiet prompt, and a raw chat-completion prompt.
        await eventSource.emit(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, { prompt: 'Summarize in one word.', dryRun: false });
        await eventSource.emit(eventTypes.CHAT_COMPLETION_PROMPT_READY, { chat: [{ role: 'user', content: 'hi' }], dryRun: false });
        await eventSource.emit(eventTypes.GENERATION_STARTED, 'quiet', {}, false);
        await eventSource.emit(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, { prompt: 'Describe the mood.', dryRun: false });
        await wait();
        const after = percent();
        await eventSource.emit(eventTypes.GENERATION_STOPPED);
        return { reply, after };
    });
    if (!ring.reply || ring.reply === '0%') throw new Error(`the reply's prompt was not counted: ${JSON.stringify(ring)}`);
    if (ring.after !== ring.reply) throw new Error(`a background prompt replaced the count: ${JSON.stringify(ring)}`);
});

await step('message text is 15px on a phone and 16px on a computer, line height 1.6 (Compact 1.5), and the editor buttons stay in two rows', async () => {
    const text = await page.evaluate(() => {
        const p = document.querySelector('#chat .mes .mes_text');
        const s = getComputedStyle(p);
        return { size: s.fontSize, line: Number.parseFloat(s.lineHeight) / Number.parseFloat(s.fontSize), scale: getComputedStyle(document.documentElement).getPropertyValue('--fontScale').trim() || '1' };
    });
    // SillyTavern's Font scale multiplies it; the test copy leaves it at 1.
    if (text.scale === '1' && text.size !== '15px') throw new Error(`phone message text is ${text.size}`);
    if (Math.abs(text.line - 1.6) > 0.02) throw new Error(`line height is ${text.line.toFixed(2)}`);
    await setPref('pt_size', 'compact');
    try {
        const compact = await page.evaluate(() => {
            const s = getComputedStyle(document.querySelector('#chat .mes .mes_text'));
            return Number.parseFloat(s.lineHeight) / Number.parseFloat(s.fontSize);
        });
        if (Math.abs(compact - 1.5) > 0.02) throw new Error(`Compact line height is ${compact.toFixed(2)}`);
    } finally {
        await setPref('pt_size', 'auto');
    }
    // The message editor: five tools on one row, Cancel and Save on the next (the 8px gap once wrapped them).
    await page.evaluate(() => [...document.querySelectorAll('#chat .mes')].pop().querySelector('.mes_edit').click());
    await until(() => document.documentElement.classList.contains('pt-editing'));
    try {
        const rows = () => page.evaluate(() => {
            const buttons = [...document.querySelectorAll('#chat .mes:has(#curEditTextarea) .mes_edit_buttons .menu_button')]
                .filter(button => getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width);
            return buttons.map(button => `${button.className.match(/mes_edit_\w+/)?.[0]}@${Math.round(button.getBoundingClientRect().top)}`);
        });
        // The editor moves into place over a moment; then the buttons must settle in two rows.
        let seen = [];
        for (let i = 0; i < 10; i++) {
            await page.waitForTimeout(150);
            seen = await rows();
            if (new Set(seen.map(item => item.split('@')[1])).size === 2) break;
        }
        const count = new Set(seen.map(item => item.split('@')[1])).size;
        if (count !== 2) throw new Error(`the editor buttons take ${count} rows: ${seen.join(', ')}`);
    } finally {
        await page.evaluate(() => document.querySelector('#chat .mes:has(#curEditTextarea) .mes_edit_cancel')?.click());
        await until(() => !document.documentElement.classList.contains('pt-editing'));
    }
    const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tab = await wide.newPage();
    try {
        await tab.goto(ST_URL, { waitUntil: 'domcontentloaded' });
        await tab.waitForFunction(() => document.documentElement.classList.contains('pt-desktop') && window.SillyTavern?.getContext, null, { timeout: 120000 });
        await tab.evaluate(async () => {
            const context = SillyTavern.getContext();
            if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
        });
        await tab.waitForFunction(() => !!document.querySelector('#chat .mes .mes_text'), null, { timeout: 15000 });
        const size = await tab.evaluate(() => getComputedStyle(document.querySelector('#chat .mes .mes_text')).fontSize);
        if (text.scale === '1' && size !== '16px') throw new Error(`desktop message text is ${size}`);
    } finally {
        await wide.close();
    }
});

await step("More… on a character card stays above the Description tabs at 1920 × 1080 and on a phone (issue #4)", async () => {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
        const view = await browser.newContext(viewport.width > 900 ? { viewport } : { ...devices['Pixel 7'], viewport });
        const tab = await view.newPage();
        try {
            await tab.goto(ST_URL, { waitUntil: 'domcontentloaded' });
            await tab.waitForFunction(() => document.documentElement.classList.contains('pt-on') && window.SillyTavern?.getContext, null, { timeout: 120000 });
            await tab.waitForTimeout(1500);
            await tab.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
            await tab.evaluate(async () => {
                const context = SillyTavern.getContext();
                if (context.characterId === undefined && !context.groupId) await context.selectCharacterById('0');
            });
            await tab.waitForTimeout(800);
            await tab.evaluate(() => document.getElementById('rightNavDrawerIcon')?.click());
            await tab.waitForTimeout(600);
            await tab.evaluate(() => document.getElementById('rm_button_selected_ch')?.click());
            await tab.waitForFunction(() => document.getElementById('pt_card_tabs')?.getBoundingClientRect().height > 0, null, { timeout: 10000 });
            const gap = await tab.evaluate(() => document.getElementById('pt_card_tabs').getBoundingClientRect().top
                - document.getElementById('char-management-dropdown').getBoundingClientRect().bottom);
            if (gap < 0) throw new Error(`at ${viewport.width}px, More… reaches ${Math.round(-gap)}px under the tabs`);
        } finally {
            await view.close();
        }
    }
});

await step('tapping a character shows its sheet (not its chat); Chat, Edit and a recent chat do what they say; turned off it opens the chat', async () => {
    await ensureCharacters([['Aria', 'Hello, I am Aria.'], ['Seraphina', '*She smiles and sets down her cup.* "Welcome, traveler."']]);
    await ensureChat('Seraphina');
    await ensureChat('Aria');
    const goCharacters = async () => {
        await showTabs();
        await page.locator('.pt-tab[data-tab="rightNavHolder"]').click();
        await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
        await page.evaluate(() => document.getElementById('rm_button_characters')?.click());
        await until(() => !!document.querySelector('#rm_print_characters_block .character_select'));
    };
    const tapCharacter = name => page.evaluate(who => {
        const entry = [...document.querySelectorAll('#rm_print_characters_block .character_select')].find(row => row.querySelector('.ch_name')?.textContent.trim() === who);
        entry.scrollIntoView({ block: 'center' });
        entry.click();
    }, name);
    const chatId = () => page.evaluate(() => SillyTavern.getContext().getCurrentChatId?.() ?? null);
    // Start from another character, so a chat switch would show.
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Aria'))); });
    await page.waitForTimeout(1500);
    const before = await chatId();
    await goCharacters();
    await tapCharacter('Seraphina');
    await until(() => !!document.querySelector('#pt-sheet.pt-char-sheet'));
    const sheetState = await page.evaluate(() => ({
        title: document.querySelector('#pt-sheet .pt-overlay-title')?.textContent,
        actions: [...document.querySelectorAll('#pt-sheet .pt-cs-action')].map(button => button.textContent.trim()),
        page: document.documentElement.dataset.ptPage,
    }));
    if (sheetState.title !== 'Seraphina') throw new Error(`the sheet is titled ${sheetState.title}`);
    if (sheetState.actions.join('|') !== 'Chat|New chat|Edit') throw new Error(`actions: ${sheetState.actions.join(', ')}`);
    if (await chatId() !== before) throw new Error('tapping a character switched chats');
    // Its recent chats come in with their last message as a bubble.
    await until(() => !!document.querySelector('#pt-sheet .pt-cs-chat .pt-bubble'));
    const narration = await page.evaluate(() => !!document.querySelector('#pt-sheet .pt-cs-chat .pt-bubble em'));
    if (!narration) throw new Error("the preview does not draw *narration* like the chat");
    // Edit: their card, without their chat (the chat you are in stays open behind it).
    await page.locator('#pt-sheet .pt-cs-action', { hasText: 'Edit' }).click();
    await until(() => !document.getElementById('pt-sheet') && document.getElementById('character_name_pole')?.value === 'Seraphina');
    await page.waitForTimeout(800);
    if (await page.evaluate(() => document.documentElement.dataset.ptPage) !== 'rightNavHolder') throw new Error('Edit left the Characters page');
    if (!(await page.evaluate(() => !!document.getElementById('pt_card_tabs')?.getBoundingClientRect().height))) throw new Error('Edit did not show the card');
    if (await chatId() !== before) throw new Error("Edit opened the character's chat");
    if (!(await page.locator('#pt_card_go').isVisible())) throw new Error('the card has no Chat and Recent chats buttons');
    // The card's Chat opens their chat.
    await page.locator('#pt_card_go .pt-card-go-chat').click();
    await until(() => SillyTavern.getContext().characters[SillyTavern.getContext().characterId]?.name === 'Seraphina', null, 10000);
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Aria'))); });
    await page.waitForTimeout(1200);
    // Leaving a card without pressing Chat leaves you in your chat, with SillyTavern's card back on it.
    await goCharacters();
    await tapCharacter('Seraphina');
    await until(() => !!document.querySelector('#pt-sheet .pt-cs-action'));
    await page.locator('#pt-sheet .pt-cs-action', { hasText: 'Edit' }).click();
    await until(() => document.getElementById('character_name_pole')?.value === 'Seraphina');
    await page.evaluate(() => document.getElementById('rm_button_characters')?.click());
    await until(() => document.getElementById('character_name_pole')?.value === 'Aria' && !document.documentElement.classList.contains('pt-card-peek'), null, 8000);
    if (await chatId() !== before) throw new Error('leaving the card changed the chat');
    // Chat from the sheet: on a phone it lands in the chat.
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Aria'))); });
    await page.waitForTimeout(1200);
    await goCharacters();
    await tapCharacter('Seraphina');
    await until(() => !!document.querySelector('#pt-sheet .pt-cs-primary'));
    await page.locator('#pt-sheet .pt-cs-primary').click();
    await until(() => SillyTavern.getContext().characters[SillyTavern.getContext().characterId]?.name === 'Seraphina' && !document.documentElement.dataset.ptPage, null, 10000);
    // Turned off, a tap opens the chat at once, as before.
    await page.evaluate(() => {
        const box = document.getElementById('pt_charpreview');
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    try {
        await goCharacters();
        await tapCharacter('Aria');
        await until(() => SillyTavern.getContext().characters[SillyTavern.getContext().characterId]?.name === 'Aria', null, 10000);
        if (await page.locator('#pt-sheet.pt-char-sheet').count()) throw new Error('the sheet opened with Character preview off');
    } finally {
        await page.evaluate(() => {
            const box = document.getElementById('pt_charpreview');
            box.checked = true;
            box.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(1500);
        if (await page.evaluate(() => !!document.documentElement.dataset.ptPage)) await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
    }
});

await step('recent chats and chat history show each chat as a title, a message bubble and ⋯; the start screen header has one fold button', async () => {
    await page.locator('.pt-ab-home').click();
    await until(() => !!document.querySelector('#chat .welcomePanel .recentChat.pt-rc .pt-bubble'), null, 10000);
    const home = await page.evaluate(() => {
        const visible = el => !!el && getComputedStyle(el).display !== 'none';
        const panel = document.querySelector('#chat .welcomePanel');
        const row = panel.querySelector('.recentChat.pt-rc');
        return {
            stInfoHidden: getComputedStyle(row.querySelector('.recentChatInfo')).display === 'none',
            more: !!row.querySelector('.pt-rc-more'),
            show: visible(panel.querySelector('.showRecentChats')),
            hide: visible(panel.querySelector('.hideRecentChats')),
            moreSize: (() => { const r = row.querySelector('.pt-rc-more').getBoundingClientRect(); return Math.round(r.width); })(),
        };
    });
    if (!home.stInfoHidden || !home.more) throw new Error(`recent chat row: ${JSON.stringify(home)}`);
    if (home.show === home.hide) throw new Error(`show and hide recent chats are both ${home.show ? 'shown' : 'hidden'}`);
    // ⋯ opens the chat's menu without opening the chat.
    await page.evaluate(() => document.querySelector('#chat .welcomePanel .recentChat.pt-rc .pt-rc-more').click());
    await until(() => !!document.getElementById('pt-sheet'));
    const items = await page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-menu-row')].map(row => row.textContent.trim()));
    if (!items.includes('Rename') || !items.includes('Delete') || !items.some(item => /^(Pin|Unpin)$/.test(item))) throw new Error(`menu: ${items.join(', ')}`);
    await closeSheet();
    if (await page.evaluate(() => !!SillyTavern.getContext().getCurrentChatId?.())) throw new Error('⋯ opened the chat');
    // Folding the list leaves one button to bring it back.
    await page.evaluate(() => document.querySelector('#chat .welcomePanel .hideRecentChats').click());
    const folded = await page.evaluate(() => {
        const visible = el => !!el && getComputedStyle(el).display !== 'none';
        const panel = document.querySelector('#chat .welcomePanel');
        return { show: visible(panel.querySelector('.showRecentChats')), hide: visible(panel.querySelector('.hideRecentChats')), list: visible(panel.querySelector('.welcomeRecent')) };
    });
    await page.evaluate(() => document.querySelector('#chat .welcomePanel .showRecentChats').click());
    if (!folded.show || folded.hide || folded.list) throw new Error(`folded: ${JSON.stringify(folded)}`);
    // Chat history rows.
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Seraphina'))); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById('option_select_chat')?.click());
    await until(() => !!document.querySelector('#select_chat_div .select_chat_block.pt-rc .pt-bubble'), null, 10000);
    const history = await page.evaluate(() => {
        const block = document.querySelector('#select_chat_div .select_chat_block.pt-rc');
        return {
            stHidden: getComputedStyle(block.querySelector('#select_chat_name_wrapper')).display === 'none',
            title: block.querySelector('.pt-rc-title')?.textContent,
            now: !!document.querySelector('#select_chat_div .select_chat_block[highlight] .pt-rc-now'),
        };
    });
    if (!history.stHidden || !history.title) throw new Error(`history row: ${JSON.stringify(history)}`);
    if (!history.now) throw new Error('the open chat is not marked');
    await page.evaluate(() => document.querySelector('#select_chat_div .pt-rc-more').click());
    await until(() => !!document.getElementById('pt-sheet'));
    const historyItems = await page.evaluate(() => [...document.querySelectorAll('#pt-sheet .pt-menu-row')].map(row => row.textContent.trim()));
    if (historyItems.join('|') !== 'Rename|Export as JSONL|Download as text|Delete') throw new Error(`history menu: ${historyItems.join(', ')}`);
    await closeSheet();
    await page.evaluate(() => document.getElementById('select_chat_cross')?.click());
    await page.waitForTimeout(500);
});

await step('notifications are calm cards: a solid surface, a small coloured icon, no coloured fill', async () => {
    const look = await page.evaluate(async () => {
        toastr.warning('Connection is slow.');
        await new Promise(resolve => setTimeout(resolve, 400));
        const toast = document.querySelector('#toast-container > .toast-warning');
        const s = getComputedStyle(toast);
        const surface = getComputedStyle(document.documentElement).getPropertyValue('--pt-surface-elevated').trim();
        const probe = document.createElement('div');
        probe.style.background = surface;
        document.body.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const out = { bg: s.backgroundColor, expected, icon: getComputedStyle(toast, '::after').maskImage || getComputedStyle(toast, '::after').webkitMaskImage, tile: getComputedStyle(toast, '::before').content };
        toastr.clear();
        return out;
    });
    if (look.bg !== look.expected) throw new Error(`the toast is ${look.bg}, not the surface ${look.expected}`);
    if (!/url\(/.test(look.icon)) throw new Error('the toast has no icon');
    if (look.tile !== 'none') throw new Error('the old icon tile is still drawn');
});

await step('the A–Z strip: a light on the letter under the finger, a lens around it, and a bubble beside the finger', async () => {
    await showTabs();
    await page.locator('.pt-tab[data-tab="rightNavHolder"]').click();
    await until(() => document.documentElement.dataset.ptPage === 'rightNavHolder');
    await page.evaluate(() => document.getElementById('rm_button_characters')?.click());
    const sort = await page.evaluate(() => document.getElementById('character_sort_order')?.value);
    const total = await page.evaluate(() => SillyTavern.getContext().characters.length + (SillyTavern.getContext().groups?.length ?? 0));
    const names = ['Bram', 'Cora', 'Dax', 'Esme', 'Felix', 'Gale', 'Hugo', 'Iris', 'Kian', 'Lyra', 'Milo', 'Nora'];
    const madeHere = total >= 12 ? [] : await ensureCharacters(names.slice(0, 12 - total).map(name => [name, 'Hello.']));
    try {
        await page.evaluate(() => {
            const select = document.getElementById('character_sort_order');
            const option = [...select.options].find(item => item.dataset.field === 'name' && item.dataset.order === 'asc');
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await until(() => document.getElementById('pt_az')?.getBoundingClientRect().height > 0, null, 8000);
        const box = await page.evaluate(() => { const r = document.getElementById('pt_az').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.4 }; });
        await page.mouse.move(box.x, box.y);
        await page.mouse.down();
        await page.mouse.move(box.x, box.y + 20, { steps: 3 });
        await page.waitForTimeout(250);
        const during = await page.evaluate(() => ({
            on: document.getElementById('pt_az').classList.contains('pt-az-on'),
            lens: [...document.querySelectorAll('#pt_az span')].map(span => span.dataset.d).filter(d => d !== undefined && d !== '').length,
            active: document.querySelector('#pt_az span[data-d="0"]')?.textContent,
            bubble: document.getElementById('pt_az_bubble')?.classList.contains('pt-az-bubble-on'),
            bubbleText: document.getElementById('pt_az_bubble')?.textContent,
        }));
        await page.mouse.up();
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => document.getElementById('pt_az_bubble')?.classList.contains('pt-az-bubble-on'));
        if (!during.on || during.lens < 3 || !during.bubble) throw new Error(`while dragging: ${JSON.stringify(during)}`);
        if (during.active !== during.bubbleText) throw new Error(`the light is on ${during.active} but the bubble says ${during.bubbleText}`);
        if (after) throw new Error('the bubble stayed after letting go');
        // A finger: everything rests again the moment it lifts (phones keep :hover after a touch).
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: box.x, y }] });
        await touch('touchStart', box.y);
        await touch('touchMove', box.y + 20);
        await page.waitForTimeout(200);
        await touch('touchEnd');
        await page.waitForTimeout(300);
        const lifted = await page.evaluate(() => ({ on: document.getElementById('pt_az').classList.contains('pt-az-on'), lens: document.querySelectorAll('#pt_az span[data-d]:not([data-d=""])').length }));
        await cdp.detach();
        if (lifted.on || lifted.lens) throw new Error(`the strip stayed lit after the finger lifted: ${JSON.stringify(lifted)}`);
    } finally {
        await page.evaluate(value => {
            const select = document.getElementById('character_sort_order');
            if (value && select.value !== value) {
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, sort);
        await page.waitForTimeout(800);
        await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
        await page.waitForTimeout(500);
        if (madeHere.length) {
            await removeCharacters(madeHere);
            madeCharacters.splice(0, madeCharacters.length, ...madeCharacters.filter(avatar => !madeHere.includes(avatar)));
        }
    }
});

await step("SillyTavern's notices (Formatting's \"Grayed-out options…\" and the rest) are quiet cards with an icon, not a thick coloured bar", async () => {
    const look = await page.evaluate(() => {
        const out = {};
        // SillyTavern's notes, Pocket Tavern's own note, and SillyTavern's plain "Hint:" paragraph.
        const make = { warning: ['div', 'info-block warning'], error: ['div', 'info-block error'], hint: ['div', 'info-block hint'], note: ['div', 'pt-inline-note'], paragraph: ['p', 'hint'] };
        for (const [kind, [tag, className]] of Object.entries(make)) {
            const block = document.createElement(tag);
            block.className = className;
            block.textContent = 'A notice.';
            document.getElementById('AdvancedFormatting')?.append(block);
            const s = getComputedStyle(block);
            out[kind] = { left: s.borderLeftWidth, pad: s.paddingLeft, icon: getComputedStyle(block, '::before').maskImage || getComputedStyle(block, '::before').webkitMaskImage };
            block.remove();
        }
        const notice = document.getElementById('advanced-formatting-cc-notice');
        out.formatting = notice ? getComputedStyle(notice).paddingLeft : null;
        return out;
    });
    for (const [kind, s] of Object.entries(look)) {
        if (kind === 'formatting') continue;
        if (s.left !== '1px' || s.pad !== '44px' || !/url\(/.test(s.icon)) throw new Error(`${kind}: ${JSON.stringify(s)}`);
    }
    if (look.formatting !== '44px') throw new Error(`the Formatting notice keeps SillyTavern's padding (${look.formatting})`);
});

await step('swipe arrows are two round buttons with the count between them, apart in every state', async () => {
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="chat"]')?.click());
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(String(c.characters.findIndex(x => x.name === 'Seraphina'))); });
    await page.waitForTimeout(1200);
    for (const state of [{ one: true, visible: false }, { one: false, visible: true }]) {
        const shape = await page.evaluate(({ one, visible }) => {
            const mes = [...document.querySelectorAll('#chat .mes')].pop();
            const had = [...mes.classList];
            mes.classList.toggle('pt-one-swipe', one);
            mes.classList.toggle('swipes_visible', visible);
            mes.classList.add('last_swipe');
            const box = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { left: r.left, right: r.right, w: Math.round(r.width), h: Math.round(r.height), radius: s.borderRadius, shown: s.display !== 'none' && r.width > 0 }; };
            const out = { left: box(mes.querySelector('.swipe_left')), right: box(mes.querySelector('.swipeRightBlock .swipe_right')) };
            mes.className = had.join(' ');
            return out;
        }, state);
        if (!shape.right.shown || shape.right.w !== shape.right.h || shape.right.radius !== '50%') throw new Error(`› is not round: ${JSON.stringify(shape.right)}`);
        if (state.visible) {
            if (!shape.left.shown || shape.left.w !== shape.left.h || shape.left.radius !== '50%') throw new Error(`‹ is not round: ${JSON.stringify(shape.left)}`);
            if (shape.left.right > shape.right.left) throw new Error('‹ and › overlap');
        } else if (shape.left.shown) throw new Error('‹ shows with one version');
    }
});

await step("a Pocket Tavern theme puts a SillyTavern theme's Bubbles chat style on Flat, and gives it back for a SillyTavern theme or when Pocket Tavern is off", async () => {
    const setSelect = (id, value) => page.evaluate(([i, v]) => {
        const select = document.getElementById(i);
        select.value = v;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, value]);
    const display = () => page.evaluate(() => String(SillyTavern.getContext().powerUserSettings.chat_display));
    const before = await page.evaluate(() => ({ theme: document.getElementById('pt_theme').value, display: String(SillyTavern.getContext().powerUserSettings.chat_display) }));
    try {
        await setSelect('pt_theme', 'st');
        await page.waitForTimeout(600);
        // As a SillyTavern theme such as Cappuccino leaves it.
        await page.evaluate(() => jQuery('#chat_display').val('1').trigger('change'));
        await page.waitForTimeout(600);
        await setSelect('pt_theme', 'pocket');
        await page.waitForTimeout(1000);
        if (await display() !== '0') throw new Error('Bubbles stayed on with the Pocket theme');
        if (await page.evaluate(() => document.body.classList.contains('bubblechat'))) throw new Error('the chat is still drawn as bubbles');
        await setSelect('pt_theme', 'st');
        await page.waitForTimeout(1000);
        if (await display() !== '1') throw new Error('Bubbles did not come back with Your SillyTavern theme');
        // A style picked by hand while a Pocket Tavern theme is on is left alone.
        await setSelect('pt_theme', 'pocket');
        await page.waitForTimeout(1000);
        await page.evaluate(() => jQuery('#chat_display').val('1').trigger('change'));
        await page.waitForTimeout(1000);
        await page.evaluate(() => document.querySelector('#pt-sheet .pt-overlay-close')?.click());
        if (await display() !== '1') throw new Error('Pocket Tavern undid a chat style picked by hand');
    } finally {
        await page.evaluate(() => globalThis.toastr?.clear());
        await setSelect('pt_theme', before.theme);
        await page.waitForTimeout(800);
        await page.evaluate(value => jQuery('#chat_display').val(value).trigger('change'), before.display);
        await page.evaluate(() => { const s = SillyTavern.getContext().extensionSettings.mobileUI; s.stChatStyle = ''; s.chatStyleFor = ''; SillyTavern.getContext().saveSettingsDebounced(); });
        await page.waitForTimeout(2000);
    }
});

await step('a sheet has a title (not an h1–h3) and ✕ at the end: a 44px button named Close that closes it; no "Close" or "Done" words', async () => {
    await showTabs();
    await page.evaluate(() => document.querySelector('.pt-tab[data-tab="more"]').click());
    await until(() => document.querySelector('#pt-sheet.pt-sheet-open'));
    const head = await page.evaluate(() => {
        const sheet = document.getElementById('pt-sheet');
        const close = sheet.querySelector('.pt-overlay-head .pt-overlay-close');
        const title = sheet.querySelector('.pt-overlay-title');
        const r = close?.getBoundingClientRect();
        const words = [...sheet.querySelectorAll('.pt-overlay-head button')].map(b => b.textContent.trim()).filter(Boolean);
        return {
            close: !!close, label: close?.getAttribute('aria-label'), w: r?.width, h: r?.height,
            atEnd: !!close && !close.nextElementSibling,
            role: title?.getAttribute('role'), heading: !!sheet.querySelector('.pt-overlay-head :is(h1, h2, h3)'), words,
        };
    });
    if (!head.close || head.label !== 'Close' || head.w < 43.5 || head.h < 43.5 || !head.atEnd) throw new Error(`✕: ${JSON.stringify(head)}`);
    if (head.role !== 'heading' || head.heading) throw new Error(`title: role ${head.role}, h1–h3 ${head.heading}`);
    if (head.words.length) throw new Error(`words in the header: ${head.words.join(', ')}`);
    await page.locator('#pt-sheet .pt-overlay-close').click();
    await until(() => !document.getElementById('pt-sheet'));
});

await step('Appearance → Layout: Automatic follows the screen, Phone stays a phone, Desktop needs 768px; exactly one of pt-phone and pt-desktop is on', async () => {
    const setLayout = value => page.evaluate(value => {
        const select = document.getElementById('pt_layout');
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    const layout = () => page.evaluate(() => {
        const root = document.documentElement.classList;
        return `${root.contains('pt-phone') ? 'phone' : ''}${root.contains('pt-desktop') ? 'desktop' : ''}`;
    });
    const expect = async (size, value, want) => {
        await page.setViewportSize(size);
        await setLayout(value);
        await page.waitForTimeout(500);
        const got = await layout();
        if (got !== want) throw new Error(`${value} at ${size.width}×${size.height} gave "${got}", not ${want}`);
    };
    const before = page.viewportSize();
    try {
        await expect({ width: 390, height: 844 }, 'auto', 'phone');
        await expect({ width: 390, height: 844 }, 'desktop', 'phone');
        await expect({ width: 1024, height: 700 }, 'auto', 'desktop');
        await expect({ width: 1024, height: 700 }, 'phone', 'phone');
        await expect({ width: 820, height: 1180 }, 'auto', 'phone');
        await expect({ width: 820, height: 1180 }, 'desktop', 'desktop');
    } finally {
        await page.setViewportSize(before);
        await setLayout('auto');
        await page.waitForTimeout(2000);
    }
});

await step("while one of SillyTavern's popups is open, Pocket Tavern steps aside (its bars take no taps), and comes back after", async () => {
    const result = await page.evaluate(async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const { callGenericPopup, POPUP_TYPE } = await import('/scripts/popup.js');
        const closed = callGenericPopup('A test popup', POPUP_TYPE.TEXT);
        await wait(400);
        const root = document.documentElement;
        const bars = ['pt-appbar', 'pt-tabbar'].map(id => document.getElementById(id)).filter(Boolean);
        const during = { stepAside: root.classList.contains('pt-st-popup'), bars: bars.length, inert: bars.filter(bar => bar.inert).length };
        document.querySelector('dialog.popup[open] .popup-button-ok')?.click();
        await closed;
        await wait(400);
        return { during, after: { stepAside: root.classList.contains('pt-st-popup'), inert: [...document.body.children].filter(el => el.inert).map(el => el.id || el.className) } };
    });
    if (!result.during.stepAside) throw new Error('html.pt-st-popup was not on while the popup was open');
    if (!result.during.bars || result.during.inert !== result.during.bars) throw new Error(`${result.during.inert} of ${result.during.bars} bars were inert`);
    if (result.after.stepAside || result.after.inert.length) throw new Error(`still stepped aside after closing: ${JSON.stringify(result.after)}`);
});

await step("an error in Pocket Tavern switches to SillyTavern's own screens for the visit, leaves nothing behind, says so, and a reload brings it back", async () => {
    const result = await page.evaluate(async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        // Pocket Tavern's folder: the one whose index.js has a src/core/lifecycle.js next to it.
        let lifecycle = null;
        for (const script of document.querySelectorAll('script[src*="/third-party/"][src$="/index.js"]')) {
            const url = new URL('src/core/lifecycle.js', script.src).href;
            if ((await fetch(url, { method: 'HEAD' })).ok) { lifecycle = url; break; }
        }
        if (!lifecycle) return { error: 'Pocket Tavern\'s lifecycle.js was not found' };
        // The same URL gives the same module the extension is running, so this is a real crash.
        const { crash } = await import(lifecycle);
        const quiet = console.error;
        console.error = () => {};
        crash('a test', new Error('forced by phone.mjs'));
        console.error = quiet;
        await wait(800);
        const ours = el => [...el.classList].some(c => c.startsWith('pt-')) || /^pt[-_]/.test(el.id) || ['data-pt-sec', 'data-pt-row', 'data-pt-view'].some(a => el.hasAttribute(a));
        return {
            classes: document.documentElement.className,
            stray: [...document.querySelectorAll('body *')].filter(el => ours(el) && !el.closest('#pt_settings')).map(el => el.id || el.className).slice(0, 5),
            toast: document.getElementById('toast-container')?.textContent ?? '',
        };
    });
    if (result.error) throw new Error(result.error);
    if (/(^|\s)pt-/.test(result.classes)) throw new Error(`classes left on <html>: ${result.classes}`);
    if (result.stray.length) throw new Error(`left behind: ${result.stray.join(', ')}`);
    if (!/Something went wrong in Pocket Tavern/.test(result.toast)) throw new Error(`no toast said so: "${result.toast.slice(0, 120)}"`);
    await page.evaluate(() => globalThis.toastr?.clear());
    await page.reload();
    await until(() => document.documentElement.classList.contains('pt-on'), null, 20000);
});

await step('test characters made on a fresh SillyTavern are removed', async () => {
    if (!madeCharacters.length) return;
    await page.evaluate(() => document.getElementById('option_close_chat')?.click());
    await page.waitForTimeout(1500);
    await removeCharacters(madeCharacters.splice(0));
});

await step('no errors from Pocket Tavern', async () => {
    if (extensionErrors.length) throw new Error(extensionErrors.join(' | '));
});

await browser.close();
console.log(failed ? `\n${failed} step(s) failed. Screenshots are in tests/results.` : '\nAll steps passed.');
process.exit(failed ? 1 : 0);
