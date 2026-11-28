// Settings → Pocket Tavern (DESIGN.md → Settings inventory): where Pocket Tavern runs, "Use SillyTavern
// for now", and every behaviour switch, grouped. Switches are never removed (DESIGN.md → Decisions); each
// says in one line what it does. Values are read and saved through the shell's actions.
import { t } from '../core/i18n.js';
import { filterField } from '../ui/filter.js';
import { listGroup, listRow } from '../ui/list.js';

/**
 * Every behaviour switch, in the order shown. `only` limits a switch to where it means something:
 * `phone` (the phone layout), `vibrate` (a phone that can vibrate), `gg` (Guided Generations is
 * installed), `charPage` (while New character pages is on). `core` switches change how Pocket Tavern
 * is put together, so the whole state is applied again. `id` is its checkbox in the Extensions panel.
 */
export const SWITCH_GROUPS = [
    { title: 'Chat', switches: [
        { key: 'messageMenu', id: 'pt_msgmenu', label: 'Message menu', hint: 'Tap ⋯ on a message for a full list of actions with names.' },
        { key: 'longPress', id: 'pt_longpress', label: 'Long-press for message menu', hint: 'Hold a message for its menu. Turn off if you prefer long-press to select text.' },
        { key: 'dragSwipe', id: 'pt_dragswipe', label: 'Drag to swipe', hint: 'Drag the last reply left for another version, right for the previous one.' },
        { key: 'foldLong', id: 'pt_foldlong', label: 'Fold long messages', hint: 'Very long older messages get a Show more button.' },
        { key: 'jumpButton', id: 'pt_jump', label: 'Jump to latest', hint: 'A button that takes you back to the newest message.' },
        { key: 'fastChat', id: 'pt_fastchat', label: 'Faster long chats', hint: 'Skips drawing messages far off screen, so long chats scroll smoothly.' },
        { key: 'contextMeter', id: 'pt_meter', label: 'Context ring', hint: 'A ring in the message box shows how full the context is. Tap it for the details.' },
        { key: 'saveDrafts', id: 'pt_drafts', label: 'Keep unsent messages', hint: 'What you type is kept for each chat, even if the browser reloads.' },
        { key: 'draftHelper', id: 'pt_draft', label: 'Draft helper', hint: 'Enhance my draft, Write for me and Continue my draft in +.' },
        { key: 'formatBar', id: 'pt_fmtbar', label: 'Formatting bar', hint: 'One-tap italic, quote, bold and OOC pills above the message box while typing.' },
        { key: 'dayDividers', id: 'pt_daydiv', label: 'Day dividers', hint: 'Quiet date labels between messages from different days.' },
        { key: 'sendEffect', id: 'pt_sendfx', label: 'Send animation', hint: 'The send button gives a short press when you send.' },
        { key: 'ggButton', id: 'pt_ggbutton', label: 'Guided Generations button', hint: 'Its row of buttons becomes one button next to Send, with every action named and explained. Off shows its own row again.', only: 'gg' },
    ] },
    { title: 'Characters and lorebooks', switches: [
        { key: 'charPage', id: 'pt_charpage', label: 'New character pages', hint: 'Big avatar, labeled tools and tabs on character cards and personas; a Filter sheet, favourites and a card menu on the list.' },
        { key: 'charPreview', id: 'pt_charpreview', label: 'Character preview', hint: 'Choosing a character shows its sheet first: Chat, New chat, Edit and its recent chats. Off opens the chat at once.', only: 'charPage' },
        { key: 'recentTools', id: 'pt_recenttools', label: 'Chat list helpers', hint: 'Chat history grouped by date.' },
        { key: 'loreCards', id: 'pt_lorecards', label: 'Lorebook entry cards', hint: 'Entries as cards with keyword chips; an opened entry fills the page.', only: 'loreUi' },
        { key: 'lorebookPicker', id: 'pt_lorebook', label: 'Easy lorebook picker', hint: 'Searchable list for global, character, chat and persona lorebooks.', core: true },
        { key: 'wandShortcut', id: 'pt_wand', label: 'Lorebooks shortcut', hint: 'A Lorebooks item among the tools under +.', core: true },
    ] },
    { title: 'Pictures', switches: [
        { key: 'sharpPictures', id: 'pt_sharp', label: 'Sharp character pictures', hint: 'Shows the full-quality picture instead of the small thumbnail, sized for your screen.' },
        { key: 'animatedPictures', id: 'pt_gifs', label: 'Animated pictures', hint: 'Pick a GIF or animated WebP as a character picture and it moves everywhere.' },
        { key: 'imageViewer', id: 'pt_viewer', label: 'Picture viewer', hint: 'Tap an avatar in the chat to see it full screen. Pinch or double-tap to zoom.' },
    ] },
    { title: 'Navigation', switches: [
        { key: 'appShell', id: 'pt_shell', label: 'App navigation', hint: 'Top bar with the current character, and tabs at the bottom.', core: true },
        { key: 'extensionsTab', id: 'pt_exttab', label: 'Extensions button', hint: 'A dedicated Extensions button in the navigation bar for extension menus and settings.', core: true },
        { key: 'hideTabsInChat', id: 'pt_tucktabs', label: 'Hide tabs in a chat', hint: 'More room for the chat, and no tabs right under the message box. Tap the arrow in the message box to show them.', only: 'phone' },
        { key: 'backGesture', id: 'pt_back', label: 'Back gesture closes panels', hint: 'Android back closes the open page, popup or sheet first.', core: true },
        { key: 'touchSizing', id: 'pt_touch', label: 'Touch-friendly panels', hint: 'Bigger buttons and sliders, roomier settings, bottom-sheet menus.', core: true },
        { key: 'chatStyle', id: 'pt_chat', label: 'Modern chat look', hint: 'Message cards, bigger text and a rounded message box.', core: true },
        { key: 'sliderSteppers', id: 'pt_steppers', label: '− and + beside sliders', hint: "Buttons that move a slider's number one step. Typing the number is often quicker." },
        { key: 'longSelects', id: 'pt_long', label: 'Searchable long dropdowns (experimental)', hint: 'Use the same list for any dropdown with 14 or more choices.', core: true },
    ] },
    { title: 'Notifications and device', switches: [
        { key: 'niceToasts', id: 'pt_toasts', label: 'Nicer notifications', hint: 'Calm cards with a small coloured icon; swipe one sideways to dismiss it.' },
        { key: 'serverWatch', id: 'pt_server', label: 'Connection check', hint: 'Shows a banner when SillyTavern stops answering, for example when Termux was closed.' },
        { key: 'keepAwake', id: 'pt_awake', label: 'Keep screen on while replying', hint: 'The screen stays on until the reply is finished.' },
        { key: 'haptics', id: 'pt_haptics', label: 'Vibration', hint: 'A short buzz on send and tab taps (Android).', only: 'vibrate' },
    ] },
    { title: 'Updates', switches: [
        { key: 'autoReload', id: 'pt_autoreload', label: 'Reload after updates', hint: 'After Pocket Tavern updates, the page reloads by itself once nothing is in progress.' },
    ] },
];

/** Every switch, in order. */
export const SWITCHES = SWITCH_GROUPS.flatMap(group => group.switches);

const MODES = { auto: 'Automatic: phones and computers', phone: 'Phones only', never: 'Off on this device' };
/** The short name shown in the row. */
const MODE_NAMES = { auto: 'Automatic', phone: 'Phones only', never: 'Off' };

/** Where Pocket Tavern's Lorebook interface is used (issue #16). */
export const LOREBOOK_UI_MODES = {
    both: 'Phone and desktop',
    phone: 'Phone only',
    desktop: 'Desktop only',
    off: "Off (SillyTavern's own)",
};
const LOREBOOK_UI_NAMES = {
    both: 'Phone and desktop',
    phone: 'Phone only',
    desktop: 'Desktop only',
    off: 'Off',
};

/**
 * @param {object} actions supplied by the shell
 * @param {(key: string) => boolean} actions.get a switch's value
 * @param {(item: object, on: boolean) => void} actions.set saves and applies a switch
 * @param {(only: string) => boolean} actions.applies whether an `only` condition holds here
 * @param {() => string} actions.mode 'auto' | 'phone' | 'never'
 * @param {() => void} actions.pickMode opens the choices for "Use it on this device"
 * @param {() => string} [actions.lorebookUi] 'both' | 'phone' | 'desktop' | 'off'
 * @param {() => void} [actions.pickLorebookUi] opens the choices for "Lorebook interface"
 * @param {() => string} actions.status one line: is Pocket Tavern on here, and with which layout
 * @param {() => void} actions.useSillyTavernForNow
 * @param {() => void} actions.openDraft the Draft helper's own settings page
 * @returns {import('../shell/page.js').PageSpec}
 */
export function pocketTavernPage(actions) {
    return {
        title: 'Pocket Tavern',
        long: 'Where it runs and how it behaves',
        icon: 'sliders',
        render: body => {
            body.append(filterField(body));
            body.append(listGroup({ rows: [
                listRow({ title: 'Use it on this device', subtitle: actions.status(), icon: 'phone', end: 'picker', value: t(MODE_NAMES[actions.mode()] ?? MODE_NAMES.auto), onClick: actions.pickMode }),
                listRow({ title: 'Use SillyTavern for now', subtitle: "SillyTavern's own screens until you come back or reload.", icon: 'log-out', onClick: actions.useSillyTavernForNow }),
            ] }));
            body.append(listGroup({ rows: [
                listRow({ title: 'Draft helper', subtitle: 'Enhance, write or continue your message', icon: 'wand', onClick: actions.openDraft }),
            ] }));
            for (const group of SWITCH_GROUPS) {
                const rows = group.switches
                    .filter(item => !item.only || actions.applies(item.only))
                    .map(item => listRow({ title: item.label, subtitle: item.hint, end: 'toggle', checked: actions.get(item.key), onToggle: on => actions.set(item, on) }));
                if (group.title === 'Characters and lorebooks' && actions.pickLorebookUi) {
                    rows.unshift(listRow({
                        title: 'Lorebook interface',
                        subtitle: "Pocket Tavern's lorebooks page and entry cards. Off uses SillyTavern's own.",
                        icon: 'book',
                        end: 'picker',
                        value: t(LOREBOOK_UI_NAMES[actions.lorebookUi?.()] ?? LOREBOOK_UI_NAMES.both),
                        onClick: actions.pickLorebookUi,
                    }));
                }
                if (rows.length) body.append(listGroup({ header: group.title, rows }));
            }
        },
    };
}

export { MODES as DEVICE_MODES };
