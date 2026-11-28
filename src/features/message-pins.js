// Story Moments (lightweight message pins): saves bookmarked message ids per chat under
// extension_settings.mobileUI.pinnedMessages without touching SillyTavern's chat files (AGENTS.md Rule 1).
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { CHAT } from '../st/selectors.js';
import { svgIcon } from '../ui/icons.js';
import { unfold } from '../views/messages.js';

const SOURCE = 'message-pins';
const MAX_PINS_PER_CHAT = 50;

/** @type {{ active: () => boolean, settings: () => object, saveSettings: () => void, context: () => any, buzz: Function, showSheet: Function, closeSheet: Function, MenuSheet: any, motionAllowed: () => boolean } | null} */
let deps = null;

export function setupMessagePins(supplied) {
    deps = supplied;
}

function currentChatKey() {
    const context = deps?.context?.();
    const chatId = context?.getCurrentChatId?.();
    if (!chatId) return '';
    const owner = context.groupId ? `g:${context.groupId}` : `c:${context.characterId ?? ''}`;
    return `${owner}|${chatId}`;
}

function storeMap() {
    const s = deps?.settings?.();
    if (!s) return {};
    if (!s.pinnedMessages || typeof s.pinnedMessages !== 'object' || Array.isArray(s.pinnedMessages)) {
        s.pinnedMessages = {};
    }
    return s.pinnedMessages;
}

/** Pins for the open chat, sorted by message order. */
export function currentPins() {
    const key = currentChatKey();
    if (!key) return [];
    const list = storeMap()[key];
    return Array.isArray(list) ? list : [];
}

export function isMessagePinned(mesId) {
    const id = Number(mesId);
    if (!Number.isFinite(id)) return false;
    return currentPins().some(pin => pin.mesId === id);
}

export function toggleMessagePin(mes) {
    const key = currentChatKey();
    if (!key || !mes) return false;
    const mesId = Number(mes.getAttribute('mesid'));
    if (!Number.isFinite(mesId)) return false;
    const map = storeMap();
    const list = Array.isArray(map[key]) ? [...map[key]] : [];
    const existing = list.findIndex(pin => pin.mesId === mesId);
    let pinned;
    if (existing >= 0) {
        list.splice(existing, 1);
        pinned = false;
    } else {
        const message = deps.context().chat?.[mesId];
        const rawText = (message?.extra?.display_text ?? message?.mes ?? mes.querySelector('.mes_text')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const name = (message?.name ?? mes.querySelector('.name_text')?.textContent ?? '').trim();
        list.push({ mesId, name, preview: rawText.slice(0, 140), at: Date.now() });
        list.sort((a, b) => a.mesId - b.mesId);
        if (list.length > MAX_PINS_PER_CHAT) list.splice(0, list.length - MAX_PINS_PER_CHAT);
        pinned = true;
    }
    if (list.length) map[key] = list;
    else delete map[key];
    deps.saveSettings();
    syncPinnedMarks();
    return pinned;
}

export function removePin(mesId) {
    const key = currentChatKey();
    if (!key) return;
    const map = storeMap();
    const list = Array.isArray(map[key]) ? map[key].filter(pin => pin.mesId !== mesId) : [];
    if (list.length) map[key] = list;
    else delete map[key];
    deps.saveSettings();
    syncPinnedMarks();
}

/** Adds or removes the subtle pinned mark on messages in #chat (completely cleared on teardown). */
export function syncPinnedMarks() {
    if (!deps?.active() || !deps.settings().chatStyle) {
        document.querySelectorAll(`${CHAT} > .mes.pt-mes-pinned, ${CHAT} > .mes.pt-mes-flash`).forEach(el => {
            el.classList.remove('pt-mes-pinned', 'pt-mes-flash');
        });
        return;
    }
    const pinnedIds = new Set(currentPins().map(pin => pin.mesId));
    for (const mes of document.querySelectorAll(`${CHAT} > .mes`)) {
        const id = Number(mes.getAttribute('mesid'));
        mes.classList.toggle('pt-mes-pinned', pinnedIds.has(id));
    }
}

function jumpToMessage(mesId) {
    deps.closeSheet(true);
    const mes = document.querySelector(`${CHAT} > .mes[mesid="${mesId}"]`);
    if (!mes) {
        globalThis.toastr?.info(t('That message is further up in the chat. Scroll up to load earlier messages.'));
        return;
    }
    unfold(mes);
    mes.scrollIntoView({ behavior: deps.motionAllowed() ? 'smooth' : 'auto', block: 'center' });
    mes.classList.remove('pt-mes-flash');
    void mes.offsetWidth;
    mes.classList.add('pt-mes-flash');
    window.setTimeout(safe(SOURCE, () => mes.classList.remove('pt-mes-flash')), 1400);
}

/** Opens the Pinned messages sheet from Chat ⋯. */
export function openPinnedSheet() {
    const sheet = new deps.MenuSheet({
        title: t('Pinned messages'),
        subtitle: t('Story moments saved from this chat'),
        fill: body => {
            const pins = currentPins();
            if (!pins.length) {
                body.append(h('div', { class: 'pt-pins-empty' }, [
                    svgIcon('bookmark', 'pt-pins-empty-icon'),
                    h('p', { class: 'pt-pins-empty-title', text: 'No pinned messages yet' }),
                    h('p', { class: 'pt-pins-empty-note', text: 'Open any message menu and choose Pin message to bookmark key story moments.' }),
                ]));
                return;
            }
            const list = h('div', { class: 'pt-list-group' }, pins.map(pin => {
                const liveMsg = deps.context().chat?.[pin.mesId];
                const preview = ((liveMsg?.extra?.display_text ?? liveMsg?.mes ?? pin.preview) || '').replace(/\s+/g, ' ').trim().slice(0, 140);
                const speaker = (liveMsg?.name ?? pin.name) || t('Message');
                return h('div', { class: 'pt-list-row pt-list-row--object pt-pin-row' }, [
                    h('button', {
                        type: 'button',
                        class: 'pt-list-row-main pt-focus',
                        onclick: () => {
                            deps.buzz(6);
                            jumpToMessage(pin.mesId);
                        },
                    }, [
                        svgIcon('bookmark', 'pt-list-row-icon pt-pin-icon'),
                        h('span', { class: 'pt-list-row-text' }, [
                            h('span', { class: 'pt-list-row-title', raw: `${speaker} · #${pin.mesId + 1}` }),
                            h('span', { class: 'pt-list-row-subtitle', raw: preview || '…' }),
                        ]),
                    ]),
                    h('button', {
                        type: 'button',
                        class: 'pt-icon-btn pt-focus pt-press',
                        'aria-label': 'Unpin message',
                        title: 'Unpin message',
                        onclick: event => {
                            event.stopPropagation();
                            deps.buzz(6);
                            removePin(pin.mesId);
                            sheet.refresh();
                        },
                    }, [svgIcon('x')]),
                ]);
            }));
            body.append(list);
        },
    });
    deps.showSheet(sheet);
}
