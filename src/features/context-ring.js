// The context ring (Settings → Pocket Tavern → Context meter; DESIGN.md → Message box): how much of the context the
// next prompt uses, as a small ring in the message box, and a sheet with what filled it and where to change it.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { button as uiButton } from '../ui/button.js';

const LOG = '[Pocket Tavern]';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, composer: () => object, sheet: () => any, closeSheet: Function, icon: Function, openPage: Function, showSheet: Function, MenuSheet: Function } | null} */
let deps = null;

export function setupContextRing(supplied) {
    deps = supplied;
}

// `live` is on while a reply of yours is being prepared: only that prompt is counted. Extensions
// and SillyTavern features send small background prompts through the same events (generateRaw,
// quiet prompts), and one of those used to replace the count ("always 64 tokens", issue #3).
export const meter = { used: 0, max: 0, breakdown: null, chatId: null, live: false, timer: 0 };

function contextMax() {
    const context = deps.context();
    return context.mainApi === 'openai' ? Number(context.chatCompletionSettings?.openai_max_context) || 0 : Number(context.maxContext) || 0;
}

/** How many tokens are kept free for the reply. */
function replyLength() {
    const context = deps.context();
    if (context.mainApi === 'openai') return Number(context.chatCompletionSettings?.openai_max_tokens) || 0;
    return Number(document.getElementById('amount_gen')?.value) || 0;
}

/** What the prompt itself may use: the context size minus the room kept for the reply. */
function contextAvailable() {
    return Math.max(0, contextMax() - replyLength());
}

async function measurePrompt(text) {
    try {
        const tokens = await deps.context().getTokenCountAsync?.(text);
        if (typeof tokens === 'number') {
            meter.used = tokens;
            meter.max = contextAvailable() || contextMax();
            meter.breakdown = null;
            renderMeter();
        }
    } catch {
        // No tokenizer for this API: leave the meter as it was.
    }
}

const CTX_PARTS = {
    system: { label: 'Main prompt and instructions', color: '#94a3b8' },
    character: { label: 'Character, persona and scenario', color: '#a78bfa' },
    examples: { label: 'Example messages', color: '#f5b942' },
    lore: { label: 'Lorebooks', color: '#2dd4bf' },
    history: { label: 'Chat history', color: 'var(--pt-accent)' },
    notes: { label: "Author's note and extras", color: '#f472b6' },
    bias: { label: 'Bias', color: '#cbd5e1' },
    other: { label: 'Other', color: '#64748b' },
};

/**
 * What filled the context on the last reply, from SillyTavern's own record of
 * each prompt (the same numbers as its Prompt popup). Null before any reply.
 */
async function contextBreakdown() {
    const module = await import('/scripts/itemized-prompts.js').catch(() => null);
    const list = module?.itemizedPrompts;
    const chat = deps.context().chat ?? [];
    if (!Array.isArray(list) || !list.length) return null;
    let index = -1;
    for (let i = list.length - 1; i >= 0; i--) {
        if (chat[list[i]?.mesId]) {
            index = i;
            break;
        }
    }
    if (index < 0) return null;
    const entry = list[index];
    const p = await module.itemizedParams(list, index, entry.mesId);
    const n = value => Math.max(0, Math.round(Number(value) || 0));
    let total;
    let available;
    let parts;
    if (p.this_main_api === 'openai') {
        total = n(p.finalPromptTokens);
        available = n(p.thisPrompt_max_context);
        const story = n(p.afterScenarioAnchorTokens) + n(p.beforeScenarioAnchorTokens) + n(p.oaiPromptTokens);
        parts = [
            ['system', n(p.oaiSystemTokens)],
            ['character', Math.max(0, story - n(p.examplesStringTokens))],
            ['examples', n(p.examplesStringTokens)],
            ['lore', n(p.worldInfoStringTokens)],
            ['history', n(p.ActualChatHistoryTokens)],
            ['bias', n(p.oaiBiasTokens)],
        ];
    } else {
        total = n(p.totalTokensInPrompt) || n(p.finalPromptTokens);
        available = n(p.thisPrompt_max_context);
        parts = [
            ['character', n(p.storyStringTokens)],
            ['examples', n(p.examplesStringTokens)],
            ['lore', n(p.worldInfoStringTokens)],
            ['history', n(p.ActualChatHistoryTokens)],
            ['notes', n(p.allAnchorsTokens)],
            ['bias', n(p.promptBiasTokens)],
        ];
    }
    const counted = parts.reduce((sum, [, tokens]) => sum + tokens, 0);
    if (total > counted + 2) parts.push(['other', total - counted]);
    if (!total) total = counted;
    return {
        total,
        available: available || contextAvailable(),
        reply: replyLength(),
        parts: parts.filter(([, tokens]) => tokens > 0).map(([key, tokens]) => ({ key, tokens })),
        character: {
            Description: n(p.charDescriptionTokens),
            Personality: n(p.charPersonalityTokens),
            Scenario: n(p.scenarioTextTokens),
            Persona: n(p.userPersonaStringTokens),
        },
        messages: Number(p.messagesCount) || 0,
    };
}

/** After a chat opens, fill the ring from its last reply right away. */
export async function loadMeterFromHistory() {
    if (!deps.active() || !deps.settings().contextMeter) return;
    const chatId = deps.context().getCurrentChatId?.();
    try {
        const info = await contextBreakdown();
        if (deps.context().getCurrentChatId?.() !== chatId) return;
        meter.chatId = chatId;
        if (info) {
            meter.used = info.total;
            meter.max = info.available;
            meter.breakdown = info;
        }
        renderMeter();
    } catch (error) {
        console.debug(LOG, 'Could not read the last prompt', error);
    }
}

function contextShare() {
    return meter.used && meter.max ? Math.min(1, meter.used / meter.max) : 0;
}

/** A ring with the share drawn on it; used in the message box and, bigger, in the Context sheet. */
function paintRing(ring, share, empty) {
    const percent = Math.round(share * 100);
    // A style, not an attribute: the stylesheet's starting value would win over an attribute.
    const fill = ring.querySelector('.pt-ctx-fill');
    if (fill) fill.style.strokeDasharray = `${empty ? 0 : Math.max(2, percent)} 100`;
    ring.classList.toggle('pt-ctx-empty', empty);
    ring.classList.toggle('pt-ctx-warn', !empty && share > 0.85 && share <= 0.98);
    ring.classList.toggle('pt-ctx-full', !empty && share > 0.98);
    const num = ring.querySelector('.pt-ctx-num');
    if (num) num.textContent = empty ? '' : `${percent}%`;
}

export function onPromptReady(data) {
    if (!deps.active() || !deps.settings().contextMeter || data?.dryRun || !meter.live) return;
    meter.live = false;
    if (Array.isArray(data?.chat)) measurePrompt(data.chat.map(item => (typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''))).join('\n'));
    else if (typeof data?.prompt === 'string') measurePrompt(data.prompt);
}

export function renderMeter() {
    const ring = deps.composer().ring;
    if (!ring) return;
    const empty = !meter.used || !meter.max;
    const share = contextShare();
    paintRing(ring, share, empty);
    const label = empty ? t('Context: no reply yet. Tap for details.') : t('Context {percent}% full. Tap for details.', { percent: Math.round(share * 100) });
    ring.setAttribute('aria-label', label);
    ring.title = label;
}

/** The Context sheet: how full, what filled it, and where to change it (DESIGN.md → Message box). */
export function openContextSheet(anchor) {
    const inChat = !!(deps.context().groupId || deps.context().characterId !== undefined);
    let info = meter.breakdown;
    let loading = inChat && !info;
    let failed = false;
    const instance = new deps.MenuSheet({
        title: t('Context'),
        subtitle: t('What the model reads before it replies'),
        anchor,
        fill: body => fillContextSheet(body, { inChat, info, loading, failed }),
    });
    deps.showSheet(instance);
    if (!loading) return;
    contextBreakdown().then(result => {
        info = result;
        if (result) {
            meter.used = result.total;
            meter.max = result.available;
            meter.breakdown = result;
            renderMeter();
        }
    }).catch(error => {
        failed = true;
        console.debug(LOG, 'Could not read the last prompt', error);
    }).finally(() => {
        loading = false;
        if (deps.sheet() === instance) instance.fill = body => fillContextSheet(body, { inChat, info, loading, failed });
        if (deps.sheet() === instance) instance.refresh();
    });
}

function fillContextSheet(body, { inChat, info, loading, failed }) {
    if (!inChat) {
        body.append(h('p', { class: 'pt-menu-foot', text: t('Open a chat first.') }));
        return;
    }
    const fmt = value => Number(value || 0).toLocaleString();
    const total = info?.total ?? meter.used;
    const available = info?.available ?? (meter.max || contextAvailable());
    const reply = info?.reply ?? replyLength();
    const empty = !total || !available;
    const share = empty ? 0 : Math.min(1, total / available);

    // The big ring and the headline.
    const big = h('div', { class: 'pt-ctx-big' }, [
        h('span', { class: 'pt-ctx-num' }),
        h('small', { class: 'pt-ctx-unit', text: empty ? '' : t('full') }),
    ]);
    big.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="pt-ctx-track" cx="18" cy="18" r="15"/><circle class="pt-ctx-fill" cx="18" cy="18" r="15" pathLength="100"/></svg>');
    paintRing(big, share, empty);
    if (empty) big.querySelector('.pt-ctx-num').textContent = '–';
    const head = h('div', { class: 'pt-ctx-head' });
    if (loading) {
        head.append(h('b', { text: t('Counting…') }));
    } else if (empty) {
        head.append(h('b', { text: t('No reply yet in this chat') }), h('small', { text: t('After the next reply you will see what filled the context: the character, lorebooks, chat history and more.') }));
    } else {
        head.append(
            h('b', { text: t('{used} tokens', { used: fmt(total) }) }),
            h('small', { text: t('of {available} the model can read', { available: fmt(available) }) }),
            h('small', { class: 'pt-ctx-sub', text: t('{max} context, {reply} kept for the reply', { max: fmt(available + reply), reply: fmt(reply) }) }),
        );
    }
    body.append(h('div', { class: 'pt-ctx-hero' }, [big, head]));
    if (loading) return;

    // What filled it: one bar, then one row per part.
    if (info?.parts?.length && !empty) {
        const bar = h('div', { class: 'pt-ctx-bar', role: 'img', 'aria-label': t('What filled the context') });
        for (const part of info.parts) {
            const span = h('span');
            span.style.setProperty('--c', CTX_PARTS[part.key].color);
            span.style.flexBasis = `${(part.tokens / available) * 100}%`;
            bar.append(span);
        }
        body.append(bar);
        const rows = info.parts.map(part => {
            const dot = h('span', { class: 'pt-ctx-dot' });
            dot.style.setProperty('--c', CTX_PARTS[part.key].color);
            const text = h('span', { class: 'pt-ctx-name' }, [h('span', { text: CTX_PARTS[part.key].label })]);
            if (part.key === 'character') {
                const pieces = Object.entries(info.character).filter(([, tokens]) => tokens > 0).map(([name, tokens]) => `${t(name)} ${fmt(tokens)}`);
                if (pieces.length) text.append(h('small', { text: pieces.join(', ') }));
            }
            if (part.key === 'history') {
                if (info.messages) text.append(h('small', { text: t('{count} messages', { count: info.messages }) }));
            }
            return h('div', { class: 'pt-ctx-row' }, [
                dot,
                text,
                h('span', { class: 'pt-ctx-tok' }, [h('b', { text: fmt(part.tokens) }), h('small', { text: `${Math.max(1, Math.round((part.tokens / available) * 100))}%` })]),
            ]);
        });
        const free = Math.max(0, available - total);
        const freeDot = h('span', { class: 'pt-ctx-dot pt-ctx-dot-free' });
        rows.push(h('div', { class: 'pt-ctx-row pt-ctx-row-free' }, [
            freeDot,
            h('span', { class: 'pt-ctx-name' }, [h('span', { text: t('Free space') })]),
            h('span', { class: 'pt-ctx-tok' }, [h('b', { text: fmt(free) }), h('small', { text: `${Math.round((free / available) * 100)}%` })]),
        ]));
        body.append(h('div', { class: 'pt-ctx-list' }, rows));
    }

    // A plain-words note on what this means.
    if (!empty) {
        const warn = share > 0.85;
        const note = warn
            ? t('Almost full: the oldest messages are left out so the newest ones fit.')
            : t('Room for about {free} more tokens before older messages start to drop out.', { free: fmt(Math.max(0, available - total)) });
        body.append(h('p', { class: `pt-ctx-note ${warn ? 'pt-ctx-note-warn' : ''}`, text: note }));
    }
    if (failed) body.append(h('p', { class: 'pt-ctx-note pt-ctx-note-warn', text: t('Could not read the details of the last reply.') }));

    // One action: where the prompt is put together (Chat Completion keeps it with the presets).
    const promptPage = deps.context().mainApi === 'openai' ? 'ai-config-button' : 'advanced-formatting-button';
    body.append(h('div', { class: 'pt-ctx-actions' }, [uiButton({
        label: 'Open prompt settings',
        icon: 'sliders',
        onClick: () => {
            deps.closeSheet(true);
            deps.openPage(promptPage);
        },
    })]));
    if (info) body.append(h('p', { class: 'pt-menu-foot', text: t('Counted from the last reply in this chat.') }));
}
