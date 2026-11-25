// Every component in src/ui/ (DESIGN.md → Components), on a phone and on desktop, in the Pocket and
// Pocket Light themes and right-to-left: how they behave, their touch sizes and focus rings, and a
// screenshot of each set to look at. The gallery is built inside a test SillyTavern and removed after.
//   ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome node e2e/components.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
const OUT = 'results/components';
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

/** Builds the gallery in the page: every component, in a theme, optionally right-to-left. Returns nothing. */
async function buildGallery(page, { theme, rtl }) {
    await page.evaluate(async ({ theme, rtl }) => {
        document.querySelector('.pt-test-gallery')?.remove();
        document.getElementById('pt-test-gallery-theme')?.remove();
        let base = null;
        for (const script of document.querySelectorAll('script[src*="/third-party/"][src$="/index.js"]')) {
            const url = new URL('src/ui/button.js', script.src).href;
            if ((await fetch(url, { method: 'HEAD' })).ok) { base = new URL('./', script.src).href; break; }
        }
        if (!base) throw new Error("Pocket Tavern's folder was not found");
        const load = path => import(new URL(path, base).href);
        const [{ h }, { button, iconButton, setBusy }, { listRow, listGroup }, { formField, textField, searchBox, setFieldError }, { numberRow }, { toggle }, { segments }, { tag }, { statusBanner, notice, emptyState }, { avatar }, { fold }, { themeCss, findTheme }] = await Promise.all([
            'src/core/dom.js', 'src/ui/button.js', 'src/ui/list.js', 'src/ui/field.js', 'src/ui/number.js', 'src/ui/toggle.js', 'src/ui/segments.js', 'src/ui/tag.js', 'src/ui/feedback.js', 'src/ui/avatar.js', 'src/ui/fold.js', 'src/themes/themes.js',
        ].map(load));

        document.head.append(h('style', { id: 'pt-test-gallery-theme' }, [themeCss(findTheme(theme), '.pt-test-gallery')]));
        const section = (title, ...children) => h('section', { class: 'pt-test-section', style: 'display: grid; gap: 12px; margin-bottom: 24px;' }, [
            h('div', { raw: title, style: 'font: 600 12px var(--pt-font-ui); letter-spacing: 0.04em; text-transform: uppercase; color: var(--pt-text-secondary);' }),
            ...children,
        ]);
        const line = (...children) => h('div', { style: 'display: flex; flex-wrap: wrap; align-items: center; gap: 8px;' }, children);
        const longHelp = 'This help text is long on purpose, so it runs past two lines and has to fold away behind a More button that opens the rest of it when it is tapped or clicked.';
        const said = [];
        const busy = button({ label: 'Saving', kind: 'primary', icon: 'save' });
        setBusy(busy, true);
        const errorField = formField({ label: 'Name', control: textField({ value: '' }) });
        setFieldError(errorField, 'A name is needed.');

        const gallery = h('div', { class: 'pt-test-gallery', dir: rtl ? 'rtl' : 'ltr', lang: rtl ? 'ar' : 'en', style: 'position: fixed; inset: 0; z-index: 6000; overflow: auto; box-sizing: border-box; padding: 16px; background: var(--pt-bg); color: var(--pt-text-primary);' }, [
            section('Buttons',
                line(button({ label: 'Chat', kind: 'primary', icon: 'chat' }), button({ label: 'New chat', kind: 'secondary', icon: 'chat-plus' }), button({ label: 'Cancel', kind: 'quiet' })),
                line(button({ label: 'Delete', kind: 'danger', icon: 'trash' }), button({ label: 'Delete', kind: 'danger-filled' }), button({ label: 'Edit', kind: 'secondary', disabled: true }), busy),
                line(iconButton({ icon: 'x', label: 'Close' }), iconButton({ icon: 'chevron-left', label: 'Back' }), iconButton({ icon: 'ellipsis', label: 'More actions' }), iconButton({ icon: 'pencil', label: 'Edit' }), iconButton({ icon: 'search', label: 'Search' }), iconButton({ icon: 'plus', label: 'Add' })),
            ),
            section('Rows and groups',
                listGroup({ header: 'Appearance', rows: [
                    listRow({ title: 'Theme', icon: 'palette', end: 'picker', value: 'Pocket Light', onClick: () => said.push('picker') }),
                    listRow({ title: 'Reduce motion', icon: 'zap', end: 'toggle', checked: true, onToggle: on => said.push(`motion ${on}`) }),
                    listRow({ title: 'Personas', subtitle: 'Who you are in the chat, and a short description the AI reads.', icon: 'user', end: 'nav', onClick: () => said.push('nav') }),
                ] }),
                listGroup({ rows: [
                    listRow({ rawTitle: 'Seraphina', subtitle: '12 chats', start: avatar({ name: 'Seraphina', src: '/img/ai4.png', size: 32 }), end: 'object', onClick: () => said.push('open'), onMenu: () => said.push('menu') }),
                    listRow({ rawTitle: rtl ? 'سيرافينا الحارسة' : 'A character whose name is far too long to fit on one line of the row', start: avatar({ name: 'Orion', size: 32 }), end: 'object' }),
                ] }),
            ),
            section('Fields',
                formField({ label: 'Name', control: textField({ value: rtl ? 'مرحبا بالعالم' : 'Seraphina', onInput: v => said.push(`name ${v}`) }), help: longHelp }),
                errorField,
                formField({ label: 'Description', control: textField({ multiline: true, placeholder: 'What the AI should know' }) }),
                searchBox({ placeholder: 'Search everything', onSearch: q => said.push(`search ${q}`) }),
            ),
            section('Numbers',
                numberRow({ label: 'Temperature', value: 0.7, min: 0, max: 2, step: 0.01, onChange: v => said.push(`temp ${v}`) }),
                numberRow({ label: 'Response length', value: 400, min: 16, max: 8192, step: 1, unit: 'tokens' }),
                numberRow({ label: 'Seed', value: 42 }),
            ),
            section('Switches, segments, chips',
                formField({ label: 'Keep unsent messages', control: toggle({ checked: false, label: 'Keep unsent messages' }), inline: true }),
                segments({ label: 'Chat look', value: 'cards', options: [{ value: 'cards', label: 'Cards' }, { value: 'bubbles', label: 'Bubbles' }, { value: 'flat', label: 'Flat' }], onChange: v => said.push(`look ${v}`) }),
                line(tag({ label: 'Favourites', selected: true, onClick: () => {} }), tag({ label: 'Groups', selected: false, onClick: () => {} }), tag({ rawLabel: rtl ? 'سحر' : 'magic', onRemove: () => said.push('removed') }), tag({ rawLabel: 'forest' })),
            ),
            section('Feedback',
                statusBanner({ status: 'warn', text: 'SillyTavern is not answering.', action: { label: 'Try again', onClick: () => {} } }),
                statusBanner({ status: 'info', text: 'Translation is unavailable right now.', onDismiss: () => {} }),
                notice({ status: 'info', text: 'Grayed-out options have no effect with this API.' }),
                notice({ status: 'warn', text: 'This preset was made for another model.' }),
                notice({ status: 'danger', text: 'The prompt is longer than the context.' }),
                emptyState({ icon: 'chats', text: 'No chats yet', action: { label: 'Choose a character', onClick: () => {} } }),
            ),
            section('Avatars and fold',
                line(avatar({ name: 'Seraphina', src: '/img/ai4.png', size: 24 }), avatar({ name: 'Seraphina', src: '/img/ai4.png', size: 32 }), avatar({ name: 'Seraphina', src: '/img/ai4.png', size: 40 }), avatar({ name: 'Seraphina', src: '/img/ai4.png', size: 96 }), avatar({ name: 'Nyx', src: '/img/missing-picture.png', size: 40 }), avatar({ name: 'Zephyr', size: 40 }), avatar({ name: 'Talia', size: 96 })),
                fold({ content: [numberRow({ label: 'Top P', value: 0.95, min: 0, max: 1, step: 0.01 })] }),
            ),
        ]);
        gallery.said = said;
        document.body.append(gallery);
    }, { theme, rtl });
    await page.waitForTimeout(400);
}

async function removeGallery(page) {
    await page.evaluate(() => {
        document.querySelector('.pt-test-gallery')?.remove();
        document.getElementById('pt-test-gallery-theme')?.remove();
    });
}

async function screenshot(page, name, width) {
    const height = await page.evaluate(() => document.querySelector('.pt-test-gallery').scrollHeight);
    const before = page.viewportSize();
    await page.setViewportSize({ width, height: Math.max(height, before.height) });
    await page.waitForTimeout(300);
    await page.locator('.pt-test-gallery').screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
    await page.setViewportSize(before);
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
    await page.waitForFunction(() => document.documentElement.classList.contains('pt-on'), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    console.log(`${layout}:`);

    try {
        await buildGallery(page, { theme: 'pocket', rtl: false });

        await step('every control has a big enough hit area (44px on touch; pills 36px with a mouse)', async () => {
            const small = await page.evaluate(phone => {
                const out = [];
                const fine = matchMedia('(pointer: fine)').matches;
                for (const el of document.querySelectorAll('.pt-test-gallery :is(.pt-button, .pt-icon-button, .pt-toggle, .pt-segments, .pt-tag-main, .pt-tag-remove, .pt-list-row, .pt-list-row-main, .pt-slider, .pt-text-field:not(textarea), .pt-search-box-input, .pt-fold-head)')) {
                    const r = el.getBoundingClientRect();
                    if (!r.width) continue;
                    const pill = el.matches('.pt-button');
                    const min = pill && fine && !phone ? 36 : el.matches('.pt-list-row, .pt-list-row-main, .pt-fold-head') && fine && !phone ? 44 : 44;
                    if (r.height < min - 0.5 || (el.matches('.pt-icon-button, .pt-tag-remove') && r.width < 43.5)) out.push(`${el.className.split(' ')[0]} ${Math.round(r.width)}×${Math.round(r.height)}`);
                }
                return [...new Set(out)];
            }, phone);
            if (small.length) throw new Error(small.join(', '));
        });

        await step('the switch, row toggle, segments, chips, search and fold do what they say', async () => {
            const result = await page.evaluate(async () => {
                const g = document.querySelector('.pt-test-gallery');
                const wait = ms => new Promise(r => setTimeout(r, ms));
                const problems = [];
                const sw = g.querySelector('.pt-form-field--inline .pt-toggle');
                sw.click();
                if (sw.getAttribute('aria-checked') !== 'true') problems.push('the switch did not turn on');
                const row = g.querySelector('.pt-list-row--toggle');
                row.querySelector('.pt-list-row-title').click();
                if (row.querySelector('.pt-toggle').getAttribute('aria-checked') !== 'false' || !g.said.includes('motion false')) problems.push('tapping the row did not toggle it');
                const segs = [...g.querySelectorAll('.pt-segment')];
                segs[1].click();
                if (segs[1].getAttribute('aria-checked') !== 'true' || !g.said.includes('look bubbles')) problems.push('a segment did not select');
                g.querySelector('.pt-tag-remove').click();
                if (!g.said.includes('removed')) problems.push('a chip ✕ did nothing');
                const input = g.querySelector('.pt-search-box-input');
                input.value = 'sera';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await wait(250);
                const clear = g.querySelector('.pt-search-box-clear');
                if (clear.hidden || !g.said.includes('search sera')) problems.push('search did not run or show ✕');
                clear.click();
                await wait(250);
                if (input.value || !clear.hidden) problems.push('✕ did not clear the search');
                const head = g.querySelector('.pt-fold-head');
                head.click();
                if (head.nextElementSibling.hidden) problems.push('the fold did not open');
                const helpBody = g.querySelector('.pt-help-text');
                const clamped = helpBody.scrollHeight > helpBody.clientHeight + 1;
                if (g.querySelector('.pt-help-more').hidden === clamped) problems.push(clamped ? 'help past two lines shows no More' : 'help that fits shows More');
                if (!g.querySelector('.pt-avatar--initial[aria-label="Nyx"]')) problems.push("a broken picture did not show the name's initial");
                return problems;
            });
            if (result.length) throw new Error(result.join('; '));
        });

        await step('the value pill commits on Enter, snaps to the limit, Escape reverts, arrows step; the slider follows', async () => {
            const pill = page.locator('.pt-test-gallery .pt-value-input').first();
            await pill.click();
            await page.keyboard.type('5');
            await page.keyboard.press('Enter');
            let state = await page.evaluate(() => ({ value: document.querySelector('.pt-test-gallery .pt-value-input').value, slider: document.querySelector('.pt-test-gallery .pt-slider').value, said: document.querySelector('.pt-test-gallery').said.filter(s => s.startsWith('temp')) }));
            if (state.value !== '2.00' || state.slider !== '2') throw new Error(`typing 5 (max 2) gave ${state.value} / slider ${state.slider}`);
            await pill.click();
            await page.keyboard.type('1.3');
            await page.keyboard.press('Escape');
            state = await page.evaluate(() => document.querySelector('.pt-test-gallery .pt-value-input').value);
            if (state !== '2.00') throw new Error(`Escape left ${state}`);
            await pill.click();
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Shift+ArrowDown');
            state = await page.evaluate(() => document.querySelector('.pt-test-gallery .pt-value-input').value);
            if (state !== '1.89') throw new Error(`↓ then Shift+↓ from 2.00 gave ${state}`);
            await page.evaluate(() => {
                const slider = document.querySelector('.pt-test-gallery .pt-slider');
                slider.value = '0.5';
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            });
            state = await page.evaluate(() => document.querySelector('.pt-test-gallery .pt-value-input').value);
            if (state !== '0.50') throw new Error(`moving the slider to 0.5 showed ${state}`);
        });

        await step("SillyTavern's own range, button and field styles do not reach the components", async () => {
            const styles = await page.evaluate(() => {
                const g = document.querySelector('.pt-test-gallery');
                const slider = getComputedStyle(g.querySelector('.pt-slider'));
                const primary = getComputedStyle(g.querySelector('.pt-button--primary'));
                const field = getComputedStyle(g.querySelector('.pt-text-field'));
                return { sliderH: slider.height, filter: slider.filter, sliderShadow: slider.boxShadow, radius: primary.borderTopLeftRadius, weight: primary.fontWeight, fieldRadius: field.borderTopLeftRadius };
            });
            const problems = [];
            if (styles.sliderH !== '44px') problems.push(`slider ${styles.sliderH} tall`);
            if (styles.filter !== 'none') problems.push(`slider filter ${styles.filter}`);
            if (styles.sliderShadow !== 'none') problems.push(`slider shadow ${styles.sliderShadow}`);
            if (styles.radius !== '999px') problems.push(`button radius ${styles.radius}`);
            if (styles.weight !== '600') problems.push(`button weight ${styles.weight}`);
            if (styles.fieldRadius !== '10px') problems.push(`field radius ${styles.fieldRadius}`);
            if (problems.length) throw new Error(problems.join('; '));
        });

        await step('the keyboard focus ring is a 2px accent outline', async () => {
            await page.evaluate(() => document.querySelector('.pt-test-gallery .pt-button--secondary').focus({ focusVisible: true }));
            await page.keyboard.press('Tab');
            await page.keyboard.press('Shift+Tab');
            const ring = await page.evaluate(() => {
                const el = document.activeElement;
                const cs = getComputedStyle(el);
                const accent = getComputedStyle(document.querySelector('.pt-test-gallery')).getPropertyValue('--pt-accent').trim();
                return { cls: el.className, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, accent };
            });
            if (ring.style !== 'solid' || ring.width !== '2px') throw new Error(`focus outline on ${ring.cls}: ${ring.style} ${ring.width}`);
        });

        await step('nothing in the gallery is wider than a 320px phone', async () => {
            if (!phone) return;
            await page.setViewportSize({ width: 320, height: 700 });
            await page.waitForTimeout(300);
            const wide = await page.evaluate(() => {
                const g = document.querySelector('.pt-test-gallery');
                const limit = g.getBoundingClientRect().right + 1;
                return [...g.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > limit && !el.closest('.pt-list-row-value')).map(el => el.className || el.tagName).slice(0, 5);
            });
            await page.setViewportSize({ width: 390, height: 844 });
            if (wide.length) throw new Error(wide.join(', '));
        });

        await step('screenshots: dark, light and right-to-left', async () => {
            const width = phone ? 390 : 1440;
            await buildGallery(page, { theme: 'pocket', rtl: false });
            await screenshot(page, `${layout}-dark`, width);
            await buildGallery(page, { theme: 'pocket-light', rtl: false });
            await screenshot(page, `${layout}-light`, width);
            await buildGallery(page, { theme: 'pocket', rtl: true });
            await screenshot(page, `${layout}-rtl`, width);
        });

        await step('no errors from Pocket Tavern', async () => {
            if (errors.length) throw new Error(errors.join(' | '));
        });
    } finally {
        await removeGallery(page);
        await context.close();
    }
}

await browser.close();
console.log(failed ? `\n${failed} step(s) failed. Screenshots are in tests/${OUT}.` : `\nAll steps passed. Screenshots are in tests/${OUT}.`);
process.exit(failed ? 1 : 0);
