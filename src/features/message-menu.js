// A message's menu (DESIGN.md → Messages → Actions): ⋯ on a message, or a long press on it (phone), opens a sheet
// with SillyTavern's own message buttons by name, Message Summarize's in a Summary group, and Delete last. Also
// copying a message (with a clipboard fallback for http pages, undone on teardown: AGENTS.md → Rules, 7).
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { summaryAction, summaryButtons } from '../compat/message-summarize.js';
import { isMessagePinned, toggleMessagePin } from './message-pins.js';
import { CHAT, MESSAGE_EDITOR } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'message menu';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, sheet: () => any, actionRow: Function, buzz: Function, closeSheet: Function, icon: Function, showSheet: Function, ui: Function, MenuSheet: Function } | null} */
let deps = null;

export function setupMessageMenu(supplied) {
    deps = supplied;
}

const MESSAGE_ACTION_ORDER = ['mes_copy', 'mes_edit', 'mes_swipe_picker', 'mes_create_branch', 'mes_create_bookmark', 'mes_hide', 'mes_unhide', 'mes_translate', 'mes_narrate', 'sd_message_gen', 'mes_embed', 'mes_prompt'];

function messageActionLabel(button) {
    const title = (button.getAttribute('title') || '').split('\n')[0].trim();
    if (title) return title;
    if (button.classList.contains('mes_bookmark')) return 'Open checkpoint';
    return 'Action';
}

/**
 * In edit mode SillyTavern's ⧉ button duplicates the message, and the copy lands
 * below a long message, off screen, so it looks like nothing happened. Ask which
 * one you meant: copy the text, or duplicate the message.
 */
let passEditCopy = false;

export function onEditCopyClick(event) {
    if (!deps.active() || !deps.settings().messageMenu) return;
    const button = event.target.closest?.(`${CHAT} .mes_edit_copy`);
    if (!button) return;
    if (passEditCopy) {
        passEditCopy = false;
        return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    deps.buzz(8);
    const message = button.closest('.mes');
    const textOf = () => message?.querySelector('.edit_textarea, #curEditTextarea')?.value ?? '';
    deps.showSheet(new deps.MenuSheet({
        title: 'Copy',
        subtitle: 'What would you like to do?',
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, [
            h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: async () => {
                    const text = textOf();
                    deps.closeSheet(true);
                    const ok = await copyText(text);
                    if (ok) globalThis.toastr?.success(t('Text copied.'), '', { timeOut: 2000 });
                    else globalThis.toastr?.error(t('Your browser blocked copying. Select the text and copy it instead.'), t('Could not copy'));
                },
            }, [deps.ui('copy', 'pt-menu-row-icon'), h('span', { class: 'pt-row-text' }, [
                h('span', { text: 'Copy text' }),
                h('small', { text: 'Put the message text on the clipboard.' }),
            ])]),
            h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: () => {
                    deps.closeSheet(true);
                    const chatId = deps.context().getCurrentChatId?.();
                    const count = deps.context().chat?.length ?? 0;
                    passEditCopy = true;
                    try {
                        button.click();
                    } finally {
                        passEditCopy = false;
                    }
                    // Say where the copy went once SillyTavern has added it.
                    const check = (tries = 0) => {
                        if (!deps.active() || deps.context().getCurrentChatId?.() !== chatId) return;
                        if ((deps.context().chat?.length ?? 0) > count) globalThis.toastr?.success(t('A copy of the message was added right below it.'), '', { timeOut: 3000 });
                        else if (tries < 40) setTimeout(safe(SOURCE, () => check(tries + 1)), 250);
                    };
                    check();
                },
            }, [deps.ui('file-plus', 'pt-menu-row-icon'), h('span', { class: 'pt-row-text' }, [
                h('span', { text: 'Duplicate message' }),
                h('small', { text: 'Add a second copy of this message to the chat, right below it.' }),
            ])]),
        ])),
    }));
}

export function onMessageMenuClick(event) {
    if (!deps.active() || !deps.settings().messageMenu) return;
    const hint = event.target.closest?.(`${CHAT} .extraMesButtonsHint`);
    if (!hint) return;
    const message = hint.closest('.mes');
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    deps.buzz(8);
    openMessageMenu(message);
}

/**
 * Copies text even where the browser has no clipboard API: SillyTavern opened by a
 * network address (http://192.168...) is not a "secure" page, so Chrome hides it.
 */
function copyWithFallback(text) {
    const area = h('textarea', { readonly: '', 'aria-hidden': 'true', 'data-pt-copy': '1' });
    area.value = text;
    // Off screen, 16px so Android does not zoom, inside the topmost open dialog so it can be focused.
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
    const openDialogs = document.querySelectorAll('dialog[open]');
    (openDialogs[openDialogs.length - 1] ?? document.body).append(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    area.remove();
    return ok;
}

export async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission refused: try the old way below.
        }
    }
    return copyWithFallback(text);
}

/** SillyTavern's own Copy reads the raw message text; do the same. */
async function copyMessage(message) {
    const id = Number(message.getAttribute('mesid'));
    const text = deps.context().chat?.[id]?.mes ?? message.querySelector('.mes_text')?.innerText ?? '';
    const ok = await copyText(text);
    if (ok) globalThis.toastr?.success(t('Message copied.'), '', { timeOut: 2000 });
    else globalThis.toastr?.error(t('Your browser blocked copying. Long-press the text to copy it instead.'), t('Could not copy'));
}

/**
 * Without a secure page there is no navigator.clipboard at all, so every copy
 * button in SillyTavern fails quietly. Give it one that uses the old method.
 */
export function patchClipboard() {
    if (navigator.clipboard || window.isSecureContext) return;
    try {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                pt: true,
                writeText: text => (copyWithFallback(String(text)) ? Promise.resolve() : Promise.reject(new Error('Copy failed'))),
                // Reading needs a secure page; fail the way a browser would instead of throwing "not a function".
                readText: () => Promise.reject(new DOMException('Reading the clipboard needs HTTPS', 'NotAllowedError')),
            },
        });
    } catch {
        // Read-only in this browser; our own Copy still works.
    }
}

/** Turning Pocket Tavern off takes back the stand-in clipboard. */
export function unpatchClipboard() {
    if (!navigator.clipboard?.pt) return;
    try {
        delete navigator.clipboard;
    } catch {
        // Could not be removed; it only copies text, so leaving it is harmless.
    }
}

export function openMessageMenu(message) {
    const name = message.getAttribute('ch_name') || 'Message';
    const preview = (message.querySelector('.mes_text')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const run = button => {
        deps.closeSheet(true);
        if (button.classList.contains('mes_copy')) {
            copyMessage(message);
            return;
        }
        // Some SillyTavern buttons listen for pointerup rather than click; send both.
        button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
        button.click();
    };
    deps.showSheet(new deps.MenuSheet({
        title: name,
        subtitle: preview.length > 90 ? `${preview.slice(0, 90)}…` : preview,
        fill: body => {
            if (!message.isConnected) {
                body.append(h('p', { class: 'pt-menu-foot', text: 'This message is no longer in the chat.' }));
                return;
            }
            const shown = Array.from(message.querySelectorAll('.mes_buttons .mes_button'))
                .filter(button => !button.classList.contains('extraMesButtonsHint') && getComputedStyle(button).display !== 'none');
            // Message Summarize's buttons get a group of their own, with short names (src/compat/message-summarize.js).
            const summary = summaryButtons(shown);
            const buttons = shown.filter(button => !summary.includes(button));
            const rank = button => {
                const index = MESSAGE_ACTION_ORDER.findIndex(name => button.classList.contains(name));
                return index === -1 ? 50 : index;
            };
            buttons.sort((a, b) => rank(a) - rank(b));
            const rows = buttons.map(button => {
                const faClass = Array.from(button.classList).find(name => name.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-fw', 'fa-xs', 'fa-sm', 'fa-lg'].includes(name));
                return h('button', { type: 'button', class: 'pt-menu-row', onclick: () => run(button) }, [
                    faClass ? deps.ui(faClass, 'pt-menu-row-icon') : deps.ui('puzzle', 'pt-menu-row-icon'),
                    h('span', { text: messageActionLabel(button) }),
                ]);
            });
            const mesId = Number(message.getAttribute('mesid'));
            if (Number.isFinite(mesId)) {
                const pinned = isMessagePinned(mesId);
                rows.unshift(h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        deps.closeSheet(true);
                        deps.buzz(8);
                        const nowPinned = toggleMessagePin(message);
                        globalThis.toastr?.success(t(nowPinned ? 'Message pinned.' : 'Message unpinned.'), '', { timeOut: 2000 });
                    },
                }, [deps.ui('bookmark', 'pt-menu-row-icon'), h('span', { text: pinned ? 'Unpin message' : 'Pin message' })]));
            }
            const edit = message.querySelector('.mes_edit');
            if (edit && getComputedStyle(edit).display !== 'none') {
                rows.push(h('button', {
                    type: 'button',
                    class: 'pt-menu-row pt-menu-row-danger',
                    onclick: () => {
                        deps.closeSheet(true);
                        // SillyTavern deletes from edit mode and asks to confirm first. The editor
                        // can take a moment to appear on a slow phone, so wait for its Delete.
                        edit.click();
                        const pressDelete = (tries = 0) => {
                            const button = message.querySelector('.mes_edit_delete');
                            if (button) button.click();
                            else if (tries < 30 && message.isConnected) setTimeout(safe(SOURCE, () => pressDelete(tries + 1)), 50);
                        };
                        setTimeout(pressDelete, 60);
                    },
                }, [deps.ui('trash', 'pt-menu-row-icon'), h('span', { text: 'Delete message' })]));
            }
            body.append(h('div', { class: 'pt-menu-list' }, rows));
            if (summary.length) {
                body.append(h('p', { class: 'pt-menu-heading', text: 'Summary' }), h('div', { class: 'pt-menu-list' }, summary.map(button => {
                    const action = summaryAction(button);
                    const faClass = Array.from(button.classList).find(name => name.startsWith('fa-') && name !== 'fa-solid');
                    return deps.actionRow(faClass ? deps.ui(faClass, 'pt-menu-row-icon') : deps.ui('note', 'pt-menu-row-icon'), t(action.label), t(action.note), () => run(button));
                })));
            }
        },
    }));
}

const press = { timer: 0, x: 0, y: 0, fired: 0 };

/** Pocket Tavern turned off: a long press in progress never opens a menu. */
export function cancelPress() {
    window.clearTimeout(press.timer);
    press.timer = 0;
}

export function onMessagePressStart(event) {
    if (!deps.active() || !deps.settings().messageMenu || !deps.settings().longPress || event.pointerType === 'mouse') return;
    const message = event.target.closest?.(`${CHAT} .mes`);
    if (!message || event.target.closest('textarea, input, a, button, .mes_button, .menu_button, .avatar, .swipe_left, .swipe_right, .mes_reasoning_summary, #curEditTextarea')) return;
    if (message.querySelector(MESSAGE_EDITOR)) return;
    window.clearTimeout(press.timer);
    press.x = event.clientX;
    press.y = event.clientY;
    press.timer = window.setTimeout(safe(SOURCE, () => {
        press.timer = 0;
        if (!deps.active() || !message.isConnected) return;
        press.fired = Date.now();
        window.getSelection?.()?.removeAllRanges();
        deps.buzz(15);
        openMessageMenu(message);
    }), 520);
}

export function onMessagePressMove(event) {
    if (press.timer && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
        window.clearTimeout(press.timer);
        press.timer = 0;
    }
}

export function onMessagePressEnd() {
    window.clearTimeout(press.timer);
    press.timer = 0;
}

/** After a long-press opened the menu, swallow the stray tap/contextmenu on the chat (never inside the opened sheet). */
export function onPressAfterEffects(event) {
    if (press.fired && Date.now() - press.fired < 700) {
        if (event.target instanceof Element && event.target.closest('#pt-sheet')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}
