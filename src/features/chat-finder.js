// Search this chat (DESIGN.md → The chat → Search this chat): a bar over the chat that finds words in the chat's
// messages, older ones too (it loads them), steps through the matches and flashes each one.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { unfold } from '../views/messages.js';
import { CHAT } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'chat finder';

/** @type {{ active: () => boolean, context: () => any, motionAllowed: () => boolean, normalizeText: (text: string) => string, scheduleHistorySync: () => void, ui: Function } | null} */
let deps = null;

export function setupChatFinder(supplied) {
    deps = supplied;
}

const finder = { bar: null, hits: [], index: -1, marks: [], seq: 0, timer: 0 };

export function chatFinderOpen() {
    return !!finder.bar;
}

/** The focus is in the search bar (Escape closes it even while typing there). */
export function chatFinderHasFocus() {
    return !!finder.bar?.contains(document.activeElement);
}

export function closeChatFinder() {
    finder.seq += 1;
    window.clearTimeout(finder.timer);
    finder.timer = 0;
    clearFinderMarks();
    document.querySelectorAll(`${CHAT} .mes.pt-flash`).forEach(mes => mes.classList.remove('pt-flash'));
    finder.bar?.remove();
    finder.bar = null;
    finder.hits = [];
    finder.index = -1;
    deps.scheduleHistorySync();
}

function clearFinderMarks() {
    const parents = new Set();
    for (const mark of finder.marks) {
        if (!mark.isConnected) continue;
        if (mark.parentElement) parents.add(mark.parentElement);
        mark.replaceWith(document.createTextNode(mark.textContent));
    }
    for (const parent of parents) parent.normalize?.();
    finder.marks = [];
}

function markInMessage(mes, words) {
    if (!words.length) return;
    const text = mes.querySelector('.mes_text');
    if (!text) return;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const pattern = new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    for (const node of nodes) {
        const value = node.nodeValue;
        const norm = deps.normalizeText(value);
        const searchIn = norm.length === value.length ? norm : value;
        pattern.lastIndex = 0;
        if (!pattern.test(searchIn)) continue;
        pattern.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let last = 0;
        for (const match of searchIn.matchAll(pattern)) {
            if (!match[0].length) break;
            const start = match.index;
            const end = start + match[0].length;
            fragment.append(document.createTextNode(value.slice(last, start)));
            const mark = h('mark', { class: 'pt-find-mark', raw: value.slice(start, end) });
            finder.marks.push(mark);
            fragment.append(mark);
            last = end;
        }
        fragment.append(document.createTextNode(value.slice(last)));
        node.replaceWith(fragment);
    }
}

async function showFinderHit(index) {
    if (!finder.hits.length || !finder.bar) return;
    const token = ++finder.seq;
    finder.index = (index + finder.hits.length) % finder.hits.length;
    const id = finder.hits[finder.index];
    finder.bar.querySelector('.pt-find-count').textContent = `${finder.index + 1}/${finder.hits.length}`;
    // Older messages may not be on the page yet: ask SillyTavern to load more.
    for (let tries = 0; tries < 60 && !document.querySelector(`${CHAT} .mes[mesid="${id}"]`); tries++) {
        if (finder.seq !== token || !finder.bar || !deps.active()) return;
        const more = document.getElementById('show_more_messages');
        if (!more) break;
        more.click();
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (finder.seq !== token || !finder.bar || !deps.active()) return;
    const mes = document.querySelector(`${CHAT} .mes[mesid="${id}"]`);
    if (!mes) return;
    clearFinderMarks();
    const words = deps.normalizeText(finder.bar.querySelector('input').value).split(/\s+/).filter(Boolean);
    if (!words.length) return;
    markInMessage(mes, words);
    unfold(mes);
    const firstMark = finder.marks[0];
    (firstMark ?? mes).scrollIntoView({ block: 'center', behavior: deps.motionAllowed() ? 'smooth' : 'auto' });
    mes.classList.remove('pt-flash');
    void mes.offsetWidth;
    mes.classList.add('pt-flash');
    window.setTimeout(safe(SOURCE, () => mes.classList.remove('pt-flash')), 1600);
}

function runChatSearch() {
    const input = finder.bar?.querySelector('input');
    if (!input) return;
    const words = deps.normalizeText(input.value).split(/\s+/).filter(Boolean);
    const chat = deps.context().chat ?? [];
    finder.hits = [];
    if (words.length) {
        chat.forEach((message, id) => {
            if (message?.is_system) return;
            const text = deps.normalizeText(`${message.mes ?? ''} ${message.extra?.display_text ?? ''}`);
            if (words.every(word => text.includes(word))) finder.hits.push(id);
        });
    }
    const count = finder.bar.querySelector('.pt-find-count');
    if (!words.length) count.textContent = '';
    else if (!finder.hits.length) count.textContent = t('None');
    if (finder.hits.length) showFinderHit(finder.hits.length - 1);
    else clearFinderMarks();
}

export function openChatFinder() {
    if (finder.bar) {
        finder.bar.querySelector('input').focus();
        return;
    }
    const input = h('input', { type: 'search', class: 'text_pole', placeholder: t('Search this chat'), 'aria-label': t('Search this chat'), enterkeyhint: 'search' });
    input.addEventListener('input', safe(SOURCE, () => {
        window.clearTimeout(finder.timer);
        finder.timer = window.setTimeout(safe(SOURCE, () => {
            finder.timer = 0;
            runChatSearch();
        }), 250);
    }));
    input.addEventListener('keydown', safe(SOURCE, event => {
        // Enter: flush pending search or go to next older match; Shift+Enter: newer; Escape closes.
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            if (finder.timer) {
                window.clearTimeout(finder.timer);
                finder.timer = 0;
                runChatSearch();
            } else {
                showFinderHit(finder.index + (event.shiftKey ? 1 : -1));
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeChatFinder();
        }
    }));
    const button = (iconName, label, onclick) => h('button', { type: 'button', class: 'pt-find-btn', 'aria-label': label, title: label, onclick }, [deps.ui(iconName)]);
    finder.bar = h('div', { class: 'pt-chat-finder', role: 'search' }, [
        input,
        h('span', { class: 'pt-find-count' }),
        button('chevron-up', 'Older match', () => showFinderHit(finder.index - 1)),
        button('chevron-down', 'Newer match', () => showFinderHit(finder.index + 1)),
        button('x', 'Close search', () => closeChatFinder()),
    ]);
    shieldFromDrawerAutoClose(finder.bar);
    document.body.append(finder.bar);
    setTimeout(safe(SOURCE, () => input.focus()), 50);
    deps.scheduleHistorySync();
}
