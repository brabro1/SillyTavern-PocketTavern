// The message box's + and the chat's ⋯ (DESIGN.md → The chat): SillyTavern's ☰ and wand items and other extensions'
// tools in +, with the Draft helper's Enhance, Write and Continue; the chat's own actions in ⋯; the picture and help
// sheets. The menus' layout is src/views/plus-menu.js and src/views/chat-menu.js; this file fills them.
import { scenePulseRow } from '../compat/scenepulse.js';
import { h } from '../core/dom.js';
import { PICTURE_MENU_ITEMS } from '../st/selectors.js';
import { t } from '../core/i18n.js';
import { openChatFinder } from '../features/chat-finder.js';
import { cancelDraft, canUndo, cycleWritingAs, draftRunning, isDrafting, previewNote, refineChoices, refineDraft, runDraft, startDraft, stopDraft, undoDraft, writingAsName } from '../features/draft/draft.js';
import { openTranslateSheet } from '../features/translate.js';
import { closeSheet, currentSheet, MenuSheet, showSheet } from './sheet.js';
import { listGroup, listRow } from '../ui/list.js';
import { chatMenu } from '../views/chat-menu.js';
import { plusMenu } from '../views/plus-menu.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'menus';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, buzz: Function, icon: Function, ui: Function } | null} */
let deps = null;

export function setupMenus(supplied) {
    deps = supplied;
}

/** Items of SillyTavern's ☰ menu in the + menu's two groups, each with a line on what it does. */
const PLUS_REPLY = [
    { id: 'option_regenerate', icon: 'refresh', note: 'Write the last reply again' },
    { id: 'option_continue', icon: 'play', note: 'Make the last reply longer' },
    { id: 'option_impersonate', icon: 'mask', note: 'Let the AI write your next message' },
];
const PLUS_TOOLS = [
    { id: 'option_toggle_AN', icon: 'note', note: 'A note the AI reads at a set depth' },
    { id: 'option_toggle_CFG', icon: 'scale', note: 'Extra guidance for the next replies' },
    { id: 'option_toggle_logprobs', icon: 'chart', note: 'Which words the AI weighed for each reply' },
];
/** ☰ items that live in the chat's ⋯ instead, or that Pocket Tavern's own screens cover. */
const PLUS_ELSEWHERE = new Set(['option_select_chat', 'option_start_new_chat', 'option_close_chat', 'option_new_bookmark', 'option_back_to_main', 'option_convert_to_group', 'option_delete_mes', 'option_settings']);
/** The wand's file item belongs with Reply: it goes with your next message. */
const PLUS_ATTACH = 'attachFile';

// -- the Draft helper (src/features/draft/draft.js)

/** On while Pocket Tavern and the Draft helper switch are on, and the Draft Enhancer extension itself is not. */
export function syncDraft() {
    if (deps.active() && deps.settings().draftHelper) startDraft();
    else stopDraft();
}

/** The + menu's Write group, while the Draft helper runs. */
function draftMenuItems() {
    if (!draftRunning()) return [];
    if (isDrafting()) return [{ title: 'Cancel', subtitle: 'Stops writing and brings your draft back', icon: 'stop', run: () => { closeSheet(true); cancelDraft(); } }];
    const run = kind => () => {
        closeSheet(true);
        runDraft(kind);
    };
    const name = writingAsName();
    const items = [
        { title: 'Enhance my draft', subtitle: 'Turns what you typed into a finished message', icon: 'wand', run: run('enhance') },
        { title: 'Write for me', subtitle: 'Writes your next message; what you typed is the direction', icon: 'pencil', run: run('write') },
        { title: 'Continue my draft', subtitle: 'Finishes what you started, from where you stopped', icon: 'play', run: run('continue') },
        {
            rawTitle: t('Writing as: {name}', { name: name.raw ?? t(name.text) }),
            subtitle: 'Tap to switch between you, the character and the narrator',
            icon: 'mask',
            run: () => {
                cycleWritingAs();
                if (currentSheet() && !currentSheet().closing) currentSheet().refresh();
            },
        },
    ];
    if (canUndo()) items.push({ title: 'Undo', subtitle: 'Brings back the text you had before', icon: 'reset', run: () => { closeSheet(true); undoDraft(); } });
    return items;
}

/** Refine: the six changes, or your own. */
export function openDraftRefine() {
    const own = h('input', { type: 'text', class: 'pt-text-field pt-focus', placeholder: 'Or say what to change…', 'aria-label': 'Your change', dir: 'auto' });
    const send = () => {
        const text = own.value.trim();
        if (!text) return;
        closeSheet(true);
        refineDraft(/[.!?]$/.test(text) ? text : `${text}.`);
    };
    own.addEventListener('keydown', safe(SOURCE, event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            send();
        }
    }));
    showSheet(new MenuSheet({
        title: t('Refine'),
        subtitle: t('Changes the message in the box in one way'),
        anchor: document.querySelector('#pt-draft-bar [data-action="refine"]'),
        fill: body => {
            body.append(listGroup({ rows: refineChoices().map(([, label, change]) => listRow({ title: label, icon: 'sliders', end: 'none', onClick: () => { closeSheet(true); refineDraft(change); } })) }));
            body.append(h('div', { class: 'pt-draft-own' }, [own, h('button', { type: 'button', class: 'pt-button pt-button--primary pt-focus pt-press', onclick: send }, [h('span', { class: 'pt-button-label', text: 'Refine' })])]));
        },
    }));
}

/** Preview the note: what Enhance (or Write, with an empty box) would send right now. */
export function openDraftPreview() {
    const note = previewNote();
    showSheet(new MenuSheet({
        title: t('Preview the note'),
        subtitle: note ? '' : t('Open a chat to see the note with its names and last message.'),
        fill: body => {
            if (note) body.append(h('pre', { class: 'pt-draft-preview', raw: note, dir: 'auto' }));
        },
    }));
}

/** The + menu (src/views/plus-menu.js): SillyTavern's ☰ and wand items, and other extensions' tools. */
function openPlusMenu(anchor) {
    const options = document.getElementById('options');
    const wand = document.getElementById('extensionsMenu');
    const context = deps.context();
    const inChat = !!(context.groupId || context.characterId !== undefined);
    const fromOptions = list => list.map(item => {
        const element = options && [...options.querySelectorAll(`[id="${item.id}"]`)].find(node => menuItemShown(node, options));
        return element ? { rawTitle: itemLabel(element), subtitle: item.note, icon: item.icon, run: () => pressMenuItem(element) } : null;
    }).filter(Boolean);
    const wandItems = wand ? [...wand.querySelectorAll('.list-group-item')].filter(item => menuItemShown(item, wand)) : [];
    const wandRow = item => ({
        rawTitle: itemLabel(item),
        subtitle: TOOL_NOTES[item.id] ?? '',
        start: faIcon(item),
        // Image generation asks what to draw, in a little menu of its own.
        run: () => (item.id === 'sd_gen' && document.querySelector(PICTURE_MENU_ITEMS) ? openPictureSheet() : pressMenuItem(item)),
    });
    const known = new Set([...PLUS_REPLY, ...PLUS_TOOLS].map(item => item.id));
    // Items other extensions put in SillyTavern's ☰ menu.
    const extraOptions = options ? [...options.querySelectorAll('.options-content > :not(hr)')]
        .filter(node => node.id && !known.has(node.id) && !PLUS_ELSEWHERE.has(node.id) && menuItemShown(node, options))
        .map(node => ({ rawTitle: itemLabel(node), start: faIcon(node), run: () => pressMenuItem(node) })) : [];
    const attach = wandItems.find(item => item.id === PLUS_ATTACH);
    const reply = inChat ? [...fromOptions(PLUS_REPLY), ...(attach ? [wandRow(attach)] : [])] : [];
    const tools = [
        ...(inChat ? fromOptions(PLUS_TOOLS) : []),
        ...wandItems.filter(item => item !== attach).map(wandRow),
        ...extraOptions,
        ...[scenePulseRow({ ui: deps.ui, press: pressMenuItem })].filter(Boolean),
    ];
    showSheet(new MenuSheet({
        title: t('Reply and tools'),
        subtitle: '',
        anchor,
        fill: body => {
            const groups = plusMenu({ write: inChat ? draftMenuItems() : [], reply, tools });
            body.append(...(groups.length ? groups : [h('p', { class: 'pt-menu-foot', text: 'Open a chat first.' })]));
        },
    }));
}

export function buildPlusButton() {
    const plus = h('button', {
        type: 'button',
        class: 'pt-plus-btn',
        'aria-label': 'Reply and tools',
        title: 'Reply and tools',
        'aria-haspopup': 'dialog',
        onclick: () => {
            deps.buzz(6);
            openPlusMenu(plus);
        },
    }, [deps.ui('plus')]);
    return plus;
}

/** SillyTavern's own items for the open chat, in the chat's ⋯ menu. SillyTavern only sets their
 *  visibility when its own menu opens, so `when` reads the same facts from the chat (bookmarks.js). */
const CHAT_MENU_ITEMS = [
    { id: 'option_new_bookmark', icon: 'flag', note: 'A point in this chat you can come back to', when: () => true },
    { id: 'option_back_to_main', icon: 'arrow-left', note: 'Leave this branch for the chat it came from', when: () => !!deps.context().chatMetadata?.main_chat },
    { id: 'option_convert_to_group', icon: 'users', note: 'Turn this chat into a group chat', when: () => !deps.context().groupId },
];

/** The chat's ⋯ menu (src/views/chat-menu.js) with SillyTavern's own controls behind each row. */
export function openChatMenu() {
    const options = document.getElementById('options');
    const press = id => () => pressMenuItem(document.getElementById(id));
    const shown = id => menuItemShown(document.getElementById(id), options);
    showSheet(new MenuSheet({
        title: deps.context().groupId ? t('Group chat') : (deps.context().characters?.[deps.context().characterId]?.name ?? t('Chat')),
        subtitle: '',
        anchor: document.querySelector('#pt-appbar .pt-ab-menu'),
        fill: body => body.append(...chatMenu({
            search: () => {
                closeSheet(true);
                openChatFinder();
            },
            translate: () => openTranslateSheet(),
            rename: () => {
                closeSheet(true);
                renameCurrentChat();
            },
            chatItems: CHAT_MENU_ITEMS.filter(item => document.getElementById(item.id)?.textContent.trim() && item.when()).map(item => ({
                label: (document.getElementById(item.id)?.textContent ?? '').trim(),
                subtitle: t(item.note),
                icon: item.icon,
                run: press(item.id),
            })),
            chatFiles: press('option_select_chat'),
            deleteMessages: shown('option_delete_mes') ? press('option_delete_mes') : null,
        })),
    }));
}

/** Renames the open chat with SillyTavern's own popup and its own renameChat (it saves and moves the file). */
export async function renameCurrentChat() {
    const context = deps.context();
    const current = context.getCurrentChatId?.();
    if (!current || typeof context.renameChat !== 'function') return;
    const name = await context.callGenericPopup?.(t('Rename this chat'), context.POPUP_TYPE?.INPUT ?? 3, current);
    const next = typeof name === 'string' ? name.trim() : '';
    if (!next || next === current) return;
    await context.renameChat(current, next);
}

/** Shown, unlike SillyTavern's spare copies (it has two "Close chat" items, one always hidden). */
function menuItemShown(element, stop) {
    if (!element || !(element.textContent ?? '').trim()) return false;
    for (let node = element; node && node !== stop; node = node.parentElement) {
        if (node.classList?.contains('displayNone') || node.style?.display === 'none' || node.hidden) return false;
    }
    return true;
}

export function actionRow(iconNode, label, note, onclick, danger = false) {
    return h('button', { type: 'button', class: `pt-menu-row pt-action-row${danger ? ' pt-menu-row-danger' : ''}`, onclick }, [
        iconNode,
        h('span', { class: 'pt-row-text' }, [h('span', { text: label }), note ? h('small', { text: note }) : null]),
    ]);
}

/** Runs a SillyTavern menu item after the sheet is gone, so whatever it opens lands on top. */
function pressMenuItem(element) {
    closeSheet(true);
    deps.buzz(6);
    element.click();
}

export function itemLabel(element) {
    return (element.querySelector(':scope > span')?.textContent ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The item's own Font Awesome icon (Pocket Tavern restyles those), or a neutral one. */
export function faIcon(element) {
    const source = element.querySelector('.extensionsMenuExtensionButton, i[class*="fa-"], div[class*="fa-"]');
    if (!source) return deps.ui('puzzle', 'pt-menu-row-icon pt-list-row-icon');
    const copy = source.cloneNode(false);
    copy.removeAttribute('id');
    copy.removeAttribute('title');
    copy.classList.add('pt-menu-row-icon', 'pt-list-row-icon', 'pt-fa-icon');
    copy.setAttribute('aria-hidden', 'true');
    return copy;
}

const TOOL_NOTES = {
    manageAttachments: 'Files and web pages the AI can look things up in',
    attachFile: 'Send a file or picture with your next message',
    sd_gen: 'Make a picture of the scene or a character',
    send_picture: 'Let the AI describe a picture',
    show_gallery_wand_button: 'Pictures saved for this character',
    ttsExtensionMenuItem: 'Turn reading replies aloud on or off',
    ttsExtensionNarrateAll: 'Read the whole chat aloud',
    token_counter: 'Count the tokens in any text',
    translate_chat: 'Translate every message in this chat',
    translate_input_message: 'Translate the message you are typing',
    pt_wand_lorebooks: 'Choose the lorebooks for all chats',
};

const PICTURE_NOTES = {
    sd_you: 'The character',
    sd_face: "The character's face",
    sd_me: 'You, as your persona',
    sd_world: 'A scene from the whole story',
    sd_last: 'What the last message describes',
    sd_raw_last: 'The last message, word for word',
    sd_background: 'A background for this chat',
};

function openPictureSheet() {
    const dropdown = document.getElementById('sd_dropdown');
    showSheet(new MenuSheet({
        title: 'Generate image',
        subtitle: 'What should the picture show?',
        fill: body => {
            const rows = [...dropdown.querySelectorAll('[id]')]
                .filter(item => menuItemShown(item, dropdown))
                .map(item => actionRow(deps.ui('image', 'pt-menu-row-icon'), itemLabel(item), PICTURE_NOTES[item.id] ?? '', () => pressMenuItem(item)));
            body.append(h('div', { class: 'pt-menu-list' }, rows));
        },
    }));
}

/** A long explanation shows two lines; a tap shows all of it (and does not flip the switch it belongs to). */
export function onHelpClick(event) {
    if (!deps.active() || !deps.settings().touchSizing) return;
    const tip = event.target.closest?.('.pt-help');
    if (!tip) return;
    event.preventDefault();
    event.stopPropagation();
    tip.classList.toggle('pt-help-open');
}
