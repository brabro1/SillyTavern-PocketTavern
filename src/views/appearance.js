// Settings → Appearance (DESIGN.md → Settings inventory): the theme, the chat's look, text, layout and
// motion. Every value is read and saved through the shell's actions; SillyTavern's own controls (chat
// width, backgrounds, its Look section) are used through them too.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { THEMES } from '../themes/themes.js';
import { filterField } from '../ui/filter.js';
import { svgIcon } from '../ui/icons.js';
import { listGroup, listRow } from '../ui/list.js';
import { choiceSetting } from '../ui/segments.js';

const LOOKS = [{ value: 'cards', label: 'Cards' }, { value: 'bubbles', label: 'Bubbles' }, { value: 'flat', label: 'Flat' }];
const TEXT_SIZES = [{ value: 'small', label: 'Small' }, { value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }, { value: 'xl', label: 'Extra large' }];
const FONTS = [{ value: 'system', label: 'System' }, { value: 'st', label: "SillyTavern's" }];
/** SillyTavern's own avatar styles, by their value in its setting. */
const SHAPES = [{ value: '0', label: 'Circle' }, { value: '2', label: 'Square' }, { value: '3', label: 'Rounded' }, { value: '1', label: 'Rectangle' }];
const LAYOUTS = [{ value: 'auto', label: 'Automatic' }, { value: 'phone', label: 'Phone' }, { value: 'desktop', label: 'Desktop' }];
const LAYOUT_NOTES = {
    auto: 'Phones get the phone layout; computers and tablets held sideways get the desktop layout.',
    phone: 'Always the phone layout, on any screen.',
    desktop: 'The desktop layout whenever the window is at least 768 pixels wide.',
};
const DENSITIES = [{ value: 'auto', label: 'Automatic' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }];
const DENSITY_NOTES = {
    auto: 'Compact on computers and small phones, comfortable on the rest.',
    comfortable: 'Roomy cards and bars.',
    compact: 'Slimmer bars and tighter cards, so more of the chat fits.',
};
const BOXES = [{ value: 'floating', label: 'Floating' }, { value: 'docked', label: 'Docked' }];
const BOX_NOTES = {
    floating: 'The message box floats over the chat.',
    docked: 'The message box sits flat along the bottom edge, like a messaging app.',
};
const MOTIONS = [{ value: 'full', label: 'Smooth' }, { value: 'light', label: 'Light' }, { value: 'off', label: 'Off' }];
const MOTION_NOTES = {
    full: 'Smooth: all animations',
    light: 'Light: quick fades only (faster)',
    off: 'Off: no animations (fastest)',
};

/**
 * @typedef {object} ThemeColors
 * @property {string} bg @property {string} raised @property {string} text
 * @property {string} accent @property {string} user @property {string} backdrop
 */

/** The colours a theme card previews. */
function previewColors(theme) {
    return { bg: theme.bg, raised: theme.raised, text: theme.text, accent: theme.accent, user: theme.user, backdrop: theme.backdrop };
}

/**
 * One theme as a small preview of the app in its colours.
 * @param {object} options
 * @param {string} options.id
 * @param {ThemeColors} options.colors
 * @param {{ text?: string, raw?: string }} options.name Pocket Tavern's own name, or a SillyTavern theme's
 * @param {string} options.note
 * @param {boolean} options.selected
 * @param {(button: HTMLElement) => void} options.onPick
 */
function themeCard({ id, colors, name, note, selected, onPick }) {
    const preview = h('span', { class: 'pt-theme-preview', 'aria-hidden': 'true' }, [
        h('span', { class: 'pt-tp-bar' }, [h('span', { class: 'pt-tp-dot' }), h('span', { class: 'pt-tp-line' })]),
        h('span', { class: 'pt-tp-msg pt-tp-bot' }),
        h('span', { class: 'pt-tp-msg pt-tp-user' }),
        h('span', { class: 'pt-tp-tabs' }, [h('span', { class: 'pt-tp-pill' })]),
    ]);
    for (const [key, value] of Object.entries(colors)) preview.style.setProperty(`--p-${key}`, value);
    return h('button', {
        type: 'button',
        class: `pt-theme-card pt-focus ${selected ? 'pt-theme-on' : ''}`,
        'aria-pressed': String(selected),
        'data-theme': id,
        onclick: event => onPick(event.currentTarget),
    }, [
        preview,
        h('span', { class: 'pt-theme-name' }, [
            h('span', name.raw !== undefined ? { raw: name.raw } : { text: name.text }),
            selected ? svgIcon('check', 'pt-theme-check') : null,
        ]),
        h('span', { class: 'pt-theme-note', text: note }),
    ]);
}

/**
 * @param {object} actions supplied by the shell
 * @param {(key: string) => any} actions.get a Pocket Tavern setting
 * @param {(key: string, value: any, origin?: HTMLElement) => void} actions.set saves and applies it
 * @param {() => string} actions.theme the theme in use ('st' for "Your theme", 'st:<name>' for a SillyTavern theme)
 * @param {() => ThemeColors} actions.yourColors SillyTavern's own colours, for "Your theme"
 * @param {() => ({ id: string, theme: object, raw: object }[] | null)} actions.stThemes SillyTavern's themes made to fit; null while loading
 * @param {() => Promise<void>} actions.loadStThemes
 * @param {(id: string, raw: object | null, origin: HTMLElement) => void} actions.pickTheme
 * @param {((done: () => void) => void) | null} actions.importTheme null when SillyTavern has no import
 * @param {() => { look: string, stStyle: string }} actions.chatLook `look` is '' while SillyTavern's own Chat Style draws the messages
 * @param {(look: string) => void} actions.pickChatLook
 * @param {() => boolean} actions.desktop the desktop layout is on
 * @param {() => ({ min: number, max: number, value: number } | null)} actions.chatWidth SillyTavern's Chat width
 * @param {(value: number) => void} actions.setChatWidth
 * @param {() => string} actions.avatarShape SillyTavern's avatar style ('0'–'3'), or '' when it has none
 * @param {(value: string) => void} actions.setAvatarShape sets SillyTavern's own avatar style
 * @param {() => void} actions.openBackgrounds
 * @param {() => void} actions.openSillyTavernLook
 * @returns {import('../shell/page.js').PageSpec}
 */
export function appearancePage(actions) {
    return {
        title: 'Appearance',
        long: 'Theme, chat look, text and layout',
        icon: 'palette',
        render: body => {
            body.append(filterField(body));
            const current = actions.theme();

            // Themes: Pocket Tavern's own, then SillyTavern's made to fit.
            const own = h('div', { class: 'pt-themes' }, THEMES.map(theme => themeCard({
                id: theme.id, colors: previewColors(theme), name: { text: theme.name }, note: theme.note,
                selected: current === theme.id, onPick: button => actions.pickTheme(theme.id, null, button),
            })));
            const fromSt = h('div', { class: 'pt-themes pt-themes-st' });
            const stNote = h('p', { class: 'pt-choice-note' });
            const drawSt = () => {
                const list = actions.stThemes();
                fromSt.replaceChildren(
                    themeCard({ id: 'st', colors: actions.yourColors(), name: { text: 'Your theme' }, note: 'Your SillyTavern colors', selected: current === 'st', onPick: button => actions.pickTheme('st', null, button) }),
                    ...(list ?? []).map(item => themeCard({
                        id: item.id, colors: previewColors(item.theme), name: { raw: item.theme.name }, note: item.theme.note ?? '',
                        selected: current === item.id, onPick: button => actions.pickTheme(item.id, item.raw, button),
                    })),
                );
                stNote.textContent = t(list ? "Your SillyTavern themes with Pocket Tavern's look. \"Your theme\" keeps SillyTavern's colors exactly as they are." : 'Loading your SillyTavern themes…');
            };
            drawSt();
            if (!actions.stThemes()) actions.loadStThemes().then(() => { if (fromSt.isConnected) drawSt(); });
            body.append(h('section', { class: 'pt-list-section' }, [h('div', { class: 'pt-list-header', text: 'Pocket Tavern themes' }), own]));
            body.append(h('section', { class: 'pt-list-section' }, [h('div', { class: 'pt-list-header', text: 'From SillyTavern' }), fromSt, stNote]));
            const themeRows = [
                listRow({ title: 'Theme background', subtitle: "Use the theme's backdrop instead of your chat background.", end: 'toggle', checked: !!actions.get('themeBackdrop'), onToggle: on => actions.set('themeBackdrop', on) }),
                listRow({ title: "SillyTavern's Custom CSS", subtitle: "Also use the Custom CSS from SillyTavern's settings with Pocket Tavern's themes. A SillyTavern theme puts its own CSS there.", end: 'toggle', checked: !!actions.get('stCustomCss'), onToggle: on => actions.set('stCustomCss', on) }),
                listRow({ title: 'Chat background', subtitle: 'Pictures behind the chat', icon: 'image', onClick: actions.openBackgrounds }),
            ];
            if (actions.importTheme) themeRows.splice(1, 0, listRow({ title: 'Import a SillyTavern theme', subtitle: 'A theme file (.json) from SillyTavern', icon: 'file-import', onClick: () => actions.importTheme(() => { if (fromSt.isConnected) drawSt(); }) }));
            body.append(listGroup({ rows: themeRows }));

            // The chat.
            const look = actions.chatLook();
            const lookSetting = choiceSetting({ title: 'Chat look', options: LOOKS, value: look.look, onChange: actions.pickChatLook });
            if (look.stStyle) {
                lookSetting.append(h('p', { class: 'pt-choice-note', text: "SillyTavern's own chat style is on, so it draws the messages. Pick a look here to use Pocket Tavern's instead." }));
            }
            body.append(lookSetting);
            body.append(choiceSetting({ title: 'Text size', options: TEXT_SIZES, value: actions.get('textSize'), onChange: value => actions.set('textSize', value) }));
            body.append(choiceSetting({ title: 'Reading font', options: FONTS, value: actions.get('modernFont') ? 'system' : 'st', note: value => value === 'system' ? "Your device's own system font, crisp at every size." : "SillyTavern's font, as set in its settings.", onChange: value => actions.set('modernFont', value === 'system') }));
            const shape = actions.avatarShape();
            if (shape) body.append(choiceSetting({ title: 'Avatar shape', options: SHAPES, value: shape, note: 'Pictures in the chat, Chats and character pages.', onChange: actions.setAvatarShape }));
            body.append(listGroup({ rows: [
                listRow({ title: 'New icons', subtitle: 'Rounded line icons everywhere.', end: 'toggle', checked: !!actions.get('customIcons'), onToggle: on => actions.set('customIcons', on) }),
            ] }));

            // Layout.
            body.append(choiceSetting({ title: 'Layout', options: LAYOUTS, value: actions.get('layout') || 'auto', note: value => LAYOUT_NOTES[value], onChange: value => actions.set('layout', value) }));
            body.append(choiceSetting({ title: 'Density', options: DENSITIES, value: actions.get('uiSize') || 'auto', note: value => DENSITY_NOTES[value], onChange: value => actions.set('uiSize', value) }));
            body.append(choiceSetting({ title: 'Message box', options: BOXES, value: actions.get('composerStyle'), note: value => BOX_NOTES[value], onChange: value => actions.set('composerStyle', value) }));
            const width = actions.desktop() ? actions.chatWidth() : null;
            if (width) body.append(chatWidthSetting(width, actions.setChatWidth));

            // Motion, and SillyTavern's own look.
            body.append(choiceSetting({ title: 'Animations', options: MOTIONS, value: actions.get('motion'), note: value => MOTION_NOTES[value], onChange: value => actions.set('motion', value) }));
            body.append(listGroup({ rows: [
                listRow({ title: "SillyTavern's look", subtitle: 'Avatar shape, font scale and more', icon: 'settings', onClick: actions.openSillyTavernLook }),
            ] }));
        },
    };
}

/** SillyTavern's Chat width slider as a setting; it applies and saves as you drag. */
function chatWidthSetting({ min, max, value }, onChange) {
    const shown = h('span', { class: 'pt-width-value', 'aria-hidden': 'true' });
    const input = h('input', { type: 'range', class: 'pt-width-range pt-focus', min: String(min), max: String(max), step: '1', 'aria-label': 'Chat width' });
    input.value = String(value);
    const show = () => {
        input.style.setProperty('--pt-share', String(max > min ? (Number(input.value) - min) / (max - min) : 0));
        shown.textContent = `${input.value}%`;
    };
    show();
    input.addEventListener('input', () => {
        show();
        onChange(Number(input.value));
    });
    return h('section', { class: 'pt-list-section pt-choice-setting' }, [
        h('div', { class: 'pt-list-header', text: 'Chat width' }),
        h('div', { class: 'pt-width-row' }, [input, shown]),
        h('p', { class: 'pt-choice-note', text: "How much of a wide screen the chat uses. The same as Chat width in SillyTavern's settings." }),
    ]);
}
