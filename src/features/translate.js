// Translate the chat (DESIGN.md → The chat → Translate): a message, or the whole chat, into another language, through
// SillyTavern's own translation extension and its providers (Google straight from this browser by default). The
// original text is never changed. Every callback handed to the browser goes through safe() (AGENTS.md → Rules, 10).
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { showBanner } from '../shell/banners.js';
import { TRANSLATE_CHAT } from '../st/selectors.js';

const LOG = '[Pocket Tavern]';
const SOURCE = 'translate';

/**
 * @type {{ active: () => boolean, settings: () => object, context: () => any, shell: () => any, buzz: Function, icon: Function,
 *   ui: Function, normalizeText: Function, saveSettings: Function, primeChatSizes: Function, showSheet: Function,
 *   closeSheet: Function, MenuSheet: Function } | null}
 */
let deps = null;

export function setupTranslate(supplied) {
    deps = supplied;
}

/**
 * Uses SillyTavern's built-in Chat Translation (Google Translate through the
 * SillyTavern server by default, no key needed). The original text is never
 * changed: translations are shown on top, like SillyTavern's own feature, but
 * several messages are translated at once, newest first, so it feels instant.
 */
const translation = { running: false, cancel: false };
const TRANSLATE_WORKERS = 4;
const FALLBACK_LANGUAGES = [
    ['ar', 'Arabic'], ['zh-CN', 'Chinese (Simplified)'], ['nl', 'Dutch'], ['en', 'English'], ['fr', 'French'], ['de', 'German'],
    ['hi', 'Hindi'], ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['pl', 'Polish'],
    ['pt', 'Portuguese'], ['ru', 'Russian'], ['es', 'Spanish'], ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'],
];

async function translatorModule() {
    if (deps.context().extensionSettings?.disabledExtensions?.includes('translate')) return null;
    try {
        const module = await import('/scripts/extensions/translate/index.js');
        return typeof module.translate === 'function' ? module : null;
    } catch {
        return null;
    }
}

function translateSettings() {
    return deps.context().extensionSettings?.translate ?? null;
}

function languageOptions() {
    const select = document.getElementById('translation_target_language');
    if (select?.options.length) return Array.from(select.options).map(option => ({ value: option.value, label: option.textContent.trim() }));
    return FALLBACK_LANGUAGES.map(([value, label]) => ({ value, label }));
}

function languageName(code) {
    return languageOptions().find(language => language.value === code)?.label ?? code;
}

/** The language the chat is shown in right now, or null for the original. */
function chatLanguage() {
    const chat = deps.context().chat ?? [];
    const translated = chat.find(message => message?.extra?.display_text);
    if (!translated) return null;
    return translated.extra.pt_lang ?? translateSettings()?.target_language ?? null;
}

function setTargetLanguage(code) {
    const options = translateSettings();
    if (options) {
        options.target_language = code;
        const select = document.getElementById('translation_target_language');
        if (select) select.value = code;
        deps.context().saveSettingsDebounced?.();
    }
    deps.settings().recentLanguages = [code, ...(deps.settings().recentLanguages ?? []).filter(item => item !== code)].slice(0, 5);
    deps.saveSettings();
}

/** The translation's progress as a banner (src/shell/banners.js), with Stop while it runs. */
function translateStatus(text, { done = false, failed = false } = {}) {
    showBanner('translate', {
        status: done ? (failed ? 'warn' : 'ok') : 'info',
        text,
        action: done ? undefined : { label: 'Stop', onClick: () => { translation.cancel = true; } },
        hideAfter: done ? (failed ? 5000 : 1800) : undefined,
    });
}

// Google Translate straight from the browser: no detour through the SillyTavern
// server, and many messages in one request. A whole long chat is usually one or
// two requests, each well under a second.
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&format=html&tl=';
// The first batch is small so the messages on screen change almost at once.
const FIRST_BATCH_CHARS = 2500;
const BATCH_CHARS = 8000;
const BATCH_PARALLEL = 4;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

/**
 * Markdown and line breaks become HTML tags that Google keeps in place, so the
 * translation keeps its bold, italics, paragraphs and code. Code is not translated.
 */
function toTranslatable(text) {
    const kept = [];
    const html = String(text)
        // Code blocks and inline code stay exactly as written.
        .replace(/```[\s\S]*?```|`[^`\n]+`/g, match => {
            kept.push(match);
            return `<code translate="no">${kept.length - 1}</code>`;
        })
        // A stray & or < that is not part of an entity or a tag.
        .replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
        .replace(/<(?![a-zA-Z/!])/g, '&lt;')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
        .replace(/\n/g, '<br>');
    return { html, kept };
}

function fromTranslated(html, kept) {
    // Keep code placeholders protected until after tag/entity/space normalization so
    // code indentation and literal <b>/<i>/<br>/entities inside code blocks stay intact.
    let text = String(html)
        .replace(/<code translate="no">\s*(\d+)\s*<\/code>/gi, '\uE000CODE$1\uE001')
        // Google sometimes moves spaces inside the tags; move them back out.
        .replace(/<(b|i)>\s+/gi, ' <$1>')
        .replace(/\s+<\/(b|i)>/gi, '</$1> ')
        // …but no space between a closing tag and punctuation.
        .replace(/<\/(b|i)>\s+([.,!?;:)\]»”’。、！？])/gi, '</$1>$2')
        // A quote right after is a closing quote only when punctuation, a line break or the end follows.
        .replace(/<\/(b|i)>\s+(&quot;|&#39;|["'])(?=[.,!?;:]|\s*<br|\s*$)/gi, '</$1>$2')
        .replace(/<\/?b>/gi, '**')
        .replace(/<\/?i>/gi, '*')
        .replace(/[ \t]*<br\s*\/?>[ \t]?/gi, '\n')
        .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, entity => ENTITIES[entity] ?? entity);
    // Tidy doubled spaces the moves above can leave, without touching line breaks.
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n');
    text = text.replace(/\uE000CODE(\d+)\uE001/g, (match, index) => kept[Number(index)] ?? match);
    return text.trim();
}

async function googleTranslateBatch(texts, code) {
    const body = new URLSearchParams();
    for (const text of texts) body.append('q', text);
    const response = await fetch(GOOGLE_URL + encodeURIComponent(code), { method: 'POST', body });
    if (!response.ok) throw new Error(`Google answered ${response.status}`);
    const data = await response.json();
    // One text may come back as ["…", "en"]; several as [["…", "en"], …].
    const list = texts.length === 1 && !Array.isArray(data[0]) ? [data] : data;
    return list.map(item => (Array.isArray(item) ? item[0] : item));
}

function messageSource(message) {
    const context = deps.context();
    return context.substituteParams ? context.substituteParams(message.mes, { name2Override: message.name }) : message.mes;
}

function applyTranslation(id, message, code, text) {
    if (typeof message.extra !== 'object' || !message.extra) message.extra = {};
    message.extra.display_text = text;
    message.extra.pt_lang = code;
    deps.context().updateMessageBlock?.(Number(id), message);
}

/**
 * Translates the messages `ids` (newest first) into `code`.
 * Calls onProgress(done) as batches land and returns how many failed.
 */
async function translateMessages(ids, code, { onProgress = () => {}, isCancelled = () => false } = {}) {
    const provider = translateSettings()?.provider ?? 'google';
    let done = 0;
    let failed = 0;
    // Providers other than Google, or Google when the direct route fails: SillyTavern's own route.
    const slowRoute = async list => {
        const module = await translatorModule();
        if (!module) {
            failed += list.length;
            done += list.length;
            onProgress(done);
            return;
        }
        let next = 0;
        const worker = async () => {
            while (next < list.length && !isCancelled()) {
                const id = list[next++];
                const message = deps.context().chat?.[id];
                if (!message) continue;
                try {
                    const translated = await module.translate(messageSource(message), code);
                    if (isCancelled()) return;
                    const currentMessage = deps.context().chat?.[id];
                    if (currentMessage === message) applyTranslation(id, message, code, translated);
                } catch {
                    failed++;
                }
                done++;
                onProgress(done);
            }
        };
        await Promise.all(Array.from({ length: TRANSLATE_WORKERS }, worker));
    };
    if (provider !== 'google') {
        await slowRoute(ids);
        return failed;
    }
    // Pack messages into batches of about BATCH_CHARS, newest first.
    const batches = [];
    let current = [];
    let size = 0;
    for (const id of ids) {
        const message = deps.context().chat?.[id];
        if (!message) continue;
        const prepared = toTranslatable(messageSource(message));
        const limit = batches.length ? BATCH_CHARS : FIRST_BATCH_CHARS;
        if (current.length && size + prepared.html.length > limit) {
            batches.push(current);
            current = [];
            size = 0;
        }
        current.push({ id, prepared });
        size += prepared.html.length;
    }
    if (current.length) batches.push(current);
    let next = 0;
    const worker = async () => {
        while (next < batches.length && !isCancelled()) {
            const batch = batches[next++];
            try {
                const out = await googleTranslateBatch(batch.map(item => item.prepared.html), code);
                if (isCancelled()) return;
                batch.forEach((item, index) => {
                    const message = deps.context().chat?.[item.id];
                    if (message && typeof out[index] === 'string') applyTranslation(item.id, message, code, fromTranslated(out[index], item.prepared.kept));
                    else failed++;
                });
                done += batch.length;
                onProgress(done);
            } catch (error) {
                if (isCancelled()) return;
                console.debug(LOG, 'Direct Google Translate failed; using SillyTavern instead', error);
                await slowRoute(batch.map(item => item.id));
            }
        }
    };
    await Promise.all(Array.from({ length: BATCH_PARALLEL }, worker));
    return failed;
}

async function translateChat(code) {
    if (translation.running) return;
    const provider = translateSettings()?.provider ?? 'google';
    if (provider !== 'google' && !(await translatorModule())) {
        globalThis.toastr?.error(t('Turn on "Chat Translation" in Extensions → Manage extensions.'), t('Translation is off'));
        return;
    }
    setTargetLanguage(code);
    const context = deps.context();
    const chat = context.chat ?? [];
    const chatId = context.getCurrentChatId?.();
    const todo = [];
    // Newest first: the messages on screen change right away.
    for (let id = chat.length - 1; id >= 0; id--) {
        const message = chat[id];
        if (!message || message.is_system || !String(message.mes ?? '').trim()) continue;
        if (message.extra?.display_text && message.extra?.pt_lang === code) continue;
        todo.push(id);
    }
    const name = languageName(code);
    if (!todo.length) {
        translateStatus(t('Already in {lang}', { lang: name }), { done: true });
        return;
    }
    translation.running = true;
    translation.cancel = false;
    const total = todo.length;
    let failed = 0;
    translateStatus(t('Translating to {lang}… {done}/{total}', { lang: name, done: 0, total }));
    try {
        failed = await translateMessages(todo, code, {
            isCancelled: () => !deps.active() || translation.cancel || deps.context().getCurrentChatId?.() !== chatId,
            onProgress: done => {
                if (!translation.cancel) translateStatus(t('Translating to {lang}… {done}/{total}', { lang: name, done, total }));
            },
        });
    } finally {
        translation.running = false;
    }
    if (deps.context().getCurrentChatId?.() === chatId) await deps.context().saveChat?.();
    deps.shell()?.update();
    // Every message changed its text, so its height too.
    deps.primeChatSizes();
    if (translation.cancel) translateStatus(t('Translation stopped'), { done: true });
    else if (failed) translateStatus(failed === total ? t('Could not reach the translator') : t('Some messages could not be translated. Check your internet connection.'), { done: true, failed: true });
    else translateStatus(t('Chat shown in {lang}', { lang: name }), { done: true });
}

/** New, edited and swiped messages follow the chat's language while "Translate new messages too" is on. */
const autoQueue = new Set();
let autoTimer = 0;

export function queueAutoTranslate(id) {
    if (!deps.active() || !deps.settings().autoTranslate) return;
    const code = chatLanguage();
    const chatId = deps.context().getCurrentChatId?.();
    if (!code) return;
    autoQueue.add(Number(id));
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(safe(SOURCE, async () => {
        autoTimer = 0;
        if (!deps.active() || deps.context().getCurrentChatId?.() !== chatId) {
            autoQueue.clear();
            return;
        }
        const ids = [...autoQueue].filter(item => {
            const message = deps.context().chat?.[item];
            return message && !message.is_system && String(message.mes ?? '').trim();
        }).sort((a, b) => b - a);
        autoQueue.clear();
        if (!ids.length) return;
        await translateMessages(ids, code, {
            isCancelled: () => !deps.active() || deps.context().getCurrentChatId?.() !== chatId || chatLanguage() !== code,
        });
        if (deps.active() && deps.context().getCurrentChatId?.() === chatId) await deps.context().saveChat?.();
    }), 150);
}

/** An edited or swiped message must not keep showing its old translation. */
export function dropTranslation(id) {
    const message = deps.context().chat?.[Number(id)];
    if (!message?.extra?.pt_lang) return;
    delete message.extra.display_text;
    delete message.extra.pt_lang;
}

async function showOriginal() {
    translation.cancel = true;
    const context = deps.context();
    let changed = false;
    (context.chat ?? []).forEach((message, id) => {
        if (!message?.extra?.display_text && !message?.extra?.reasoning_display_text) return;
        delete message.extra.display_text;
        delete message.extra.reasoning_display_text;
        delete message.extra.pt_lang;
        context.updateMessageBlock?.(id, message);
        changed = true;
    });
    if (changed) await context.saveChat?.();
    deps.shell()?.update();
    if (changed) deps.primeChatSizes();
    translateStatus(t('Showing the original text'), { done: true });
}

function setAutoTranslate(on) {
    deps.settings().autoTranslate = on;
    deps.saveSettings();
    // Pocket Tavern translates new messages itself (faster); keep SillyTavern's own auto mode off so it is not done twice.
    const options = translateSettings();
    if (options && options.auto_mode !== 'none') {
        options.auto_mode = 'none';
        const select = document.getElementById('translation_auto_mode');
        if (select) select.value = 'none';
        deps.context().saveSettingsDebounced?.();
    }
}

/** The language one tap translates to: the last one picked in the sheet. */
function quickLanguage() {
    return deps.settings().recentLanguages?.[0] ?? null;
}

/** One tap: translate the chat, show the original again, or stop a running translation. */
function quickTranslate() {
    const inChat = !!(deps.context().groupId || deps.context().characterId !== undefined);
    if (!inChat) {
        globalThis.toastr?.info(t('Open a chat first.'));
        return;
    }
    if (translation.running) {
        translation.cancel = true;
        return;
    }
    if (chatLanguage()) {
        showOriginal();
        return;
    }
    const code = quickLanguage();
    if (code) translateChat(code);
    else openTranslateSheet();
}

/**
 * SillyTavern's own "Translate Chat" in the ✨ menu translates one message at a
 * time. While Pocket Tavern is on, that item translates the whole chat in one tap
 * (or shows the original again), in the last language picked.
 */
export function onWandTranslateClick(event) {
    if (!deps.active() || !(event.target instanceof Element) || !event.target.closest(TRANSLATE_CHAT)) return;
    event.preventDefault();
    event.stopPropagation();
    // Stopping the click also stops SillyTavern from closing the menu; close it the same way it would.
    const menu = document.getElementById('extensionsMenu');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('extensionsMenuButton')?.click();
    quickTranslate();
}

export function openTranslateSheet() {
    const current = chatLanguage();
    const inChat = !!(deps.context().groupId || deps.context().characterId !== undefined);
    deps.showSheet(new deps.MenuSheet({
        title: t('Translate chat'),
        subtitle: current ? t('Showing {lang}. The original text is kept.', { lang: languageName(current) }) : t('Pick a language. The original text is kept.'),
        fill: body => {
            if (!inChat) {
                body.append(h('p', { class: 'pt-menu-foot', text: t('Open a chat first.') }));
                return;
            }
            const top = [];
            if (current) {
                top.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        deps.closeSheet(true);
                        showOriginal();
                    },
                }, [deps.ui('reset', 'pt-menu-row-icon'), h('span', { text: t('Show original') })]));
            }
            const auto = h('input', { type: 'checkbox', class: 'pt-switch', role: 'switch' });
            auto.checked = !!deps.settings().autoTranslate;
            auto.addEventListener('change', safe(SOURCE, () => setAutoTranslate(auto.checked)));
            top.push(h('label', { class: 'pt-switch-row' }, [
                h('span', { class: 'pt-switch-text' }, [h('span', { text: t('Translate new replies too') }), h('small', { text: t('Each new reply is shown in the chosen language.') })]),
                auto,
            ]));
            body.append(h('div', { class: 'pt-menu-list' }, top));

            const all = languageOptions();
            const recent = (deps.settings().recentLanguages ?? []).map(code => all.find(language => language.value === code)).filter(Boolean);
            const languageRow = language => h('button', {
                type: 'button',
                class: `pt-menu-row pt-choice ${language.value === current ? 'pt-choice-on' : ''}`,
                'data-search': deps.normalizeText(`${language.label} ${language.value}`),
                onclick: () => {
                    deps.closeSheet(true);
                    deps.buzz(8);
                    translateChat(language.value);
                },
            }, [h('span', { raw: language.label }), language.value === current ? deps.ui('check', 'pt-menu-row-icon') : null]);
            const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search languages'), 'aria-label': t('Search languages') });
            const recentBlock = recent.length ? [h('p', { class: 'pt-menu-heading', text: t('Recent') }), h('div', { class: 'pt-menu-list' }, recent.map(languageRow))] : [];
            const allRows = all.map(languageRow);
            const allHeading = h('p', { class: 'pt-menu-heading', text: t('All languages') });
            const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
            search.addEventListener('input', safe(SOURCE, () => {
                const words = deps.normalizeText(search.value).split(/\s+/).filter(Boolean);
                let shown = 0;
                for (const row of allRows) {
                    const ok = words.every(word => row.dataset.search.includes(word));
                    row.hidden = !ok;
                    if (ok) shown++;
                }
                for (const element of recentBlock) element.hidden = words.length > 0;
                empty.hidden = shown > 0;
            }));
            body.append(h('p', { class: 'pt-menu-heading', text: t('Languages') }), search, ...recentBlock, allHeading, h('div', { class: 'pt-menu-list' }, allRows), empty);
            const provider = translateSettings()?.provider ?? 'google';
            const providerName = { google: 'Google Translate', deepl: 'DeepL', bing: 'Bing', yandex: 'Yandex', libre: 'LibreTranslate', lingva: 'Lingva', deeplx: 'DeepLX', oneringtranslator: 'OneRingTranslator' }[provider] ?? provider;
            body.append(h('p', { class: 'pt-menu-foot', text: t('Tip: tap the translate button to switch between your language and the original. Hold it to open this list.') }));
            // Google is asked straight from this browser (see GOOGLE_URL); the others go through SillyTavern's server.
            body.append(h('p', {
                class: 'pt-menu-foot',
                text: provider === 'google'
                    ? t('Uses Google Translate, asked straight from this browser. You can pick another service in Extensions → Chat Translation.')
                    : t('Uses {provider} through your SillyTavern server. You can change it in Extensions → Chat Translation.', { provider: providerName }),
            }));
        },
    }));
}


/** Pocket Tavern turned off: a running translation stops and nothing waits to be translated. */
export function stopTranslation() {
    translation.cancel = true;
    window.clearTimeout(autoTimer);
    autoTimer = 0;
    autoQueue.clear();
}
