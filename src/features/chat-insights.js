// Chat insights sheet (Chat ⋯ → Chat insights): local O(N) reading stats for the open chat — total words,
// estimated reading time, message counts, You vs Character voice share, average reply length and pinned moments.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { listGroup, listRow } from '../ui/list.js';
import { currentPins } from './message-pins.js';

/** @type {{ context: () => any, showSheet: Function, MenuSheet: any } | null} */
let deps = null;

export function setupChatInsights(supplied) {
    deps = supplied;
}

function countWords(text) {
    const clean = String(text ?? '').trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
}

function computeInsights(chat) {
    let userMessages = 0;
    let botMessages = 0;
    let userWords = 0;
    let botWords = 0;
    let longest = 0;
    let firstDate = '';
    for (const msg of chat) {
        if (!msg || msg.is_system) continue;
        const words = countWords(msg.extra?.display_text ?? msg.mes ?? '');
        if (words > longest) longest = words;
        if (!firstDate && msg.send_date) firstDate = String(msg.send_date);
        if (msg.is_user) {
            userMessages++;
            userWords += words;
        } else {
            botMessages++;
            botWords += words;
        }
    }
    const totalMessages = userMessages + botMessages;
    const totalWords = userWords + botWords;
    const readingMins = totalWords > 0 ? Math.max(1, Math.round(totalWords / 220)) : 0;
    const avgReply = botMessages > 0 ? Math.round(botWords / botMessages) : 0;
    const avgYou = userMessages > 0 ? Math.round(userWords / userMessages) : 0;
    const userShare = totalWords > 0 ? Math.round((userWords / totalWords) * 100) : 50;
    return {
        totalMessages,
        userMessages,
        botMessages,
        totalWords,
        userWords,
        botWords,
        readingMins,
        avgReply,
        avgYou,
        longest,
        userShare,
        botShare: 100 - userShare,
        pins: currentPins().length,
    };
}

export function openChatInsights() {
    const context = deps?.context?.();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const name = context?.groupId ? t('Group chat') : (context?.characters?.[context?.characterId]?.name ?? t('Chat'));
    const stats = computeInsights(chat);

    const kpi = (value, label) => h('div', { class: 'pt-insight-card' }, [
        h('span', { class: 'pt-insight-value', raw: value }),
        h('span', { class: 'pt-insight-label', text: label }),
    ]);

    deps.showSheet(new deps.MenuSheet({
        title: t('Chat insights'),
        subtitle: name,
        fill: body => {
            if (!stats.totalMessages) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'Send a message first to see stats for this chat.' }));
                return;
            }
            const grid = h('div', { class: 'pt-insights-grid' }, [
                kpi(stats.totalWords.toLocaleString(), 'Words'),
                kpi(stats.totalMessages.toLocaleString(), 'Messages'),
                kpi(t('~{n} min', { n: stats.readingMins }), 'Reading time'),
            ]);
            const barYou = h('span', { class: 'pt-insight-bar-you' });
            barYou.style.width = `${stats.userShare}%`;
            const barBot = h('span', { class: 'pt-insight-bar-bot' });
            barBot.style.width = `${stats.botShare}%`;
            const shareCard = h('section', { class: 'pt-list-section' }, [
                h('div', { class: 'pt-list-header', text: 'Voice balance' }),
                h('div', { class: 'pt-insight-share' }, [
                    h('div', { class: 'pt-insight-bar', 'aria-hidden': 'true' }, [barYou, barBot]),
                    h('div', { class: 'pt-insight-legend' }, [
                        h('span', { class: 'pt-insight-leg-item' }, [
                            h('span', { class: 'pt-insight-dot pt-insight-dot--you', 'aria-hidden': 'true' }),
                            h('span', { raw: `${t('You')} · ${stats.userShare}% (${stats.userWords.toLocaleString()})` }),
                        ]),
                        h('span', { class: 'pt-insight-leg-item' }, [
                            h('span', { class: 'pt-insight-dot pt-insight-dot--bot', 'aria-hidden': 'true' }),
                            h('span', { raw: `${name} · ${stats.botShare}% (${stats.botWords.toLocaleString()})` }),
                        ]),
                    ]),
                ]),
            ]);
            const details = listGroup({
                header: 'Details',
                rows: [
                    listRow({ title: 'Your messages', end: 'value', value: String(stats.userMessages) }),
                    listRow({ title: 'Character replies', end: 'value', value: String(stats.botMessages) }),
                    listRow({ title: 'Average reply length', end: 'value', value: t('{n} words', { n: stats.avgReply }) }),
                    listRow({ title: 'Longest message', end: 'value', value: t('{n} words', { n: stats.longest }) }),
                    listRow({ title: 'Pinned messages', end: 'value', value: String(stats.pins) }),
                ],
            });
            body.append(grid, shareCard, details);
        },
    }));
}
