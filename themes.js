/**
 * Pocket Tavern themes.
 *
 * A theme overrides SillyTavern's own --SmartTheme* colors (and the --pt-*
 * design tokens, see DESIGN.md) with !important stylesheet rules, so the whole interface changes
 * while the user's saved SillyTavern theme stays untouched. Choosing "Your
 * SillyTavern theme" removes the overrides again.
 */

/**
 * @typedef {object} Theme
 * @property {string} id
 * @property {string} name
 * @property {string} note
 * @property {'dark'|'light'} mode
 * @property {string} bg        page / panel surface (opaque)
 * @property {string} raised    cards and fields
 * @property {string} text
 * @property {string} muted     narration (em) text
 * @property {string} accent    buttons, active tab, selection
 * @property {string} onAccent  text on accent
 * @property {string} quote     dialogue text in chat
 * @property {string} user      user message tint
 * @property {string} bot       character message tint
 * @property {string} border
 * @property {string} [elevated] hover and popover surface (default: mixed from raised)
 * @property {string} backdrop  flat colour behind the chat (no gradients, DESIGN.md)
 */

/** @type {Theme[]} */
export const THEMES = [
    // Pocket and Pocket Light are the design system's own palette (DESIGN.md, section 2).
    // The others differ in structure, not only in hue: how light the surface is and an
    // accent tuned for it. All are flat: no glows, no gradients.
    {
        id: 'pocket', name: 'Pocket', note: 'Calm graphite, one blue accent', mode: 'dark',
        bg: '#0e0f12', raised: '#16181d', elevated: '#1e2128', text: '#eceef2', muted: '#9aa0ad', accent: '#5b8def', onAccent: '#0b1630', quote: '#b9cdf5',
        user: 'rgba(91, 141, 239, 0.12)', bot: 'rgba(255, 255, 255, 0.04)', border: 'rgba(255, 255, 255, 0.08)',
        backdrop: '#0e0f12',
    },
    {
        id: 'pocket-light', name: 'Pocket Light', note: 'The same, in daylight', mode: 'light',
        bg: '#f6f7f9', raised: '#ffffff', elevated: '#eceef2', text: '#16181d', muted: '#5a6170', accent: '#2f5fc4', onAccent: '#ffffff', quote: '#2a4f9a',
        user: 'rgba(47, 95, 196, 0.08)', bot: 'rgba(22, 24, 29, 0.035)', border: 'rgba(22, 24, 29, 0.10)',
        backdrop: '#f6f7f9',
    },
    {
        id: 'midnight', name: 'Midnight', note: 'Ink-blue night, violet accent', mode: 'dark',
        bg: '#0f1020', raised: '#1a1b33', text: '#e6e6f5', muted: '#a3a3c2', accent: '#8b7cf6', onAccent: '#14102e', quote: '#c4b5fd',
        user: 'rgba(139, 124, 246, 0.15)', bot: 'rgba(255, 255, 255, 0.045)', border: 'rgba(160, 160, 255, 0.14)',
        backdrop: '#0b0c18',
    },
    {
        id: 'amoled', name: 'AMOLED', note: 'True black, candle gold', mode: 'dark',
        bg: '#000000', raised: '#121212', text: '#ededed', muted: '#a0a0a0', accent: '#d9b36c', onAccent: '#241a05', quote: '#e8cf9e',
        user: 'rgba(217, 179, 108, 0.12)', bot: 'rgba(255, 255, 255, 0.05)', border: 'rgba(255, 255, 255, 0.10)',
        backdrop: '#000000',
    },
    {
        id: 'mocha', name: 'Mocha', note: 'Soft pastels on dark', mode: 'dark',
        bg: '#1e1e2e', raised: '#2a2a3d', text: '#cdd6f4', muted: '#a6adc8', accent: '#cba6f7', onAccent: '#1e1e2e', quote: '#f5c2e7',
        user: 'rgba(203, 166, 247, 0.14)', bot: 'rgba(205, 214, 244, 0.05)', border: 'rgba(205, 214, 244, 0.12)',
        backdrop: '#181825',
    },
    {
        id: 'ocean', name: 'Ocean', note: 'Deep sea blue', mode: 'dark',
        bg: '#0e2331', raised: '#173649', text: '#e2f0f7', muted: '#9cbccc', accent: '#5fb3d9', onAccent: '#062033', quote: '#a3d4ea',
        user: 'rgba(95, 179, 217, 0.15)', bot: 'rgba(255, 255, 255, 0.05)', border: 'rgba(163, 212, 234, 0.13)',
        backdrop: '#08161f',
    },
    {
        id: 'forest', name: 'Forest', note: 'Moss and bark', mode: 'dark',
        bg: '#141b16', raised: '#1f2a22', text: '#e4ece5', muted: '#a3b5a7', accent: '#8fbf7a', onAccent: '#14240e', quote: '#c9dc9b',
        user: 'rgba(143, 191, 122, 0.13)', bot: 'rgba(255, 255, 255, 0.045)', border: 'rgba(200, 225, 190, 0.11)',
        backdrop: '#101612',
    },
    {
        id: 'sakura', name: 'Sakura', note: 'Dusk plum and dusty rose', mode: 'dark',
        bg: '#1d1419', raised: '#2c1f27', text: '#f6e7ee', muted: '#c9aab9', accent: '#e48fae', onAccent: '#3a0f22', quote: '#f2bcd0',
        user: 'rgba(228, 143, 174, 0.14)', bot: 'rgba(255, 255, 255, 0.045)', border: 'rgba(242, 188, 208, 0.13)',
        backdrop: '#170f14',
    },
    {
        id: 'ember', name: 'Ember', note: 'Warm hearth browns', mode: 'dark',
        bg: '#1a130e', raised: '#2a1f17', text: '#f5e9df', muted: '#c6ab96', accent: '#e8924a', onAccent: '#341604', quote: '#f2c08c',
        user: 'rgba(232, 146, 74, 0.14)', bot: 'rgba(255, 255, 255, 0.045)', border: 'rgba(242, 192, 140, 0.13)',
        backdrop: '#120c08',
    },
    {
        id: 'nord', name: 'Nord', note: 'Cool arctic slate', mode: 'dark',
        bg: '#2e3440', raised: '#3b4252', text: '#eceff4', muted: '#b2bccc', accent: '#88c0d0', onAccent: '#1d2a30', quote: '#a3d1dc',
        user: 'rgba(136, 192, 208, 0.16)', bot: 'rgba(236, 239, 244, 0.05)', border: 'rgba(216, 222, 233, 0.12)',
        backdrop: '#2e3440',
    },
    {
        // Was "Neon" (a magenta glow); the id stays so a saved choice keeps working.
        id: 'cyber', name: 'Abyss', note: 'Near-black blue, cyan accent', mode: 'dark',
        bg: '#0a0b12', raised: '#141623', text: '#e6e8f2', muted: '#9a9fb8', accent: '#2ec4d6', onAccent: '#022529', quote: '#a9d8df',
        user: 'rgba(46, 196, 214, 0.12)', bot: 'rgba(255, 255, 255, 0.045)', border: 'rgba(255, 255, 255, 0.10)',
        backdrop: '#07080d',
    },
    {
        id: 'paper', name: 'Paper', note: 'Ink on paper, easy reading', mode: 'light',
        bg: '#efefec', raised: '#fbfbf9', text: '#1f2226', muted: '#5b5f64', accent: '#1e4f8f', onAccent: '#ffffff', quote: '#264b7d',
        user: 'rgba(30, 79, 143, 0.07)', bot: 'rgba(31, 34, 38, 0.035)', border: 'rgba(31, 34, 38, 0.12)',
        backdrop: '#ebebe7',
    },
    {
        id: 'cloud', name: 'Cloud', note: 'Daylight, deep teal', mode: 'light',
        bg: '#f2f5f8', raised: '#ffffff', text: '#1b2430', muted: '#56637a', accent: '#0f6e8c', onAccent: '#ffffff', quote: '#0d5c75',
        user: 'rgba(15, 110, 140, 0.08)', bot: 'rgba(27, 36, 48, 0.035)', border: 'rgba(27, 36, 48, 0.11)',
        backdrop: '#f2f5f8',
    },
    {
        id: 'lavender', name: 'Lavender', note: 'Soft lilac and plum', mode: 'light',
        bg: '#f5f2f8', raised: '#ffffff', text: '#26222f', muted: '#625b70', accent: '#6a4a9e', onAccent: '#ffffff', quote: '#5b3e8c',
        user: 'rgba(106, 74, 158, 0.08)', bot: 'rgba(38, 34, 47, 0.035)', border: 'rgba(38, 34, 47, 0.11)',
        backdrop: '#f3f0f7',
    },
];

export function findTheme(id) {
    return THEMES.find(theme => theme.id === id) ?? null;
}

// -- SillyTavern's UI themes, made to fit Pocket Tavern

/** The colors of a SillyTavern theme that Pocket Tavern uses (what is saved with the choice). */
export const ST_THEME_COLORS = [
    'main_text_color', 'italics_text_color', 'underline_text_color', 'quote_text_color',
    'blur_tint_color', 'chat_tint_color', 'user_mes_blur_tint_color', 'bot_mes_blur_tint_color',
    'shadow_color', 'shadow_width', 'blur_strength',
];

const parseColor = value => {
    const text = String(value ?? '').trim();
    const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
    if (rgb) {
        const a = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : Number(rgb[4]);
        return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
    }
    const hex6 = text.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (hex6) {
        const n = parseInt(hex6[1], 16);
        return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: hex6[2] ? parseInt(hex6[2], 16) / 255 : 1 };
    }
    const hex3 = text.match(/^#([0-9a-f]{3})([0-9a-f])?$/i);
    if (hex3) {
        const [r, g, b] = [...hex3[1]].map(ch => parseInt(ch + ch, 16));
        return { r, g, b, a: hex3[2] ? parseInt(hex3[2] + hex3[2], 16) / 255 : 1 };
    }
    return null;
};
/** `top` laid over the solid color `base`. */
const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
/** `amount` (0–1) of `b` mixed into `a`. */
const mixRgb = (a, b, amount) => ({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount, a: 1 });
const luminance = c => {
    const ch = v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const chroma = c => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
const hex = c => `#${[c.r, c.g, c.b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const rgba = (c, alpha) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`;
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
/** Moves `fg` away from `bg` (toward white on dark, black on light) until it reaches `min` contrast. */
const readable = (fg, bg, min) => {
    const target = luminance(bg) < 0.4 ? WHITE : BLACK;
    let color = fg;
    for (let i = 0; i < 24 && contrast(color, bg) < min; i++) color = mixRgb(color, target, 0.08);
    return color;
};

/** How far apart two colors are (0–441). */
const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * A Pocket Tavern theme from a SillyTavern UI theme. With no chat background it
 * is solid: its text, narration, dialogue and panel colors on Pocket Tavern's
 * recipe (raised cards, quiet message tints, checked contrast). Over a chat
 * background (see `glass`) its message cards keep its own tints and how
 * see-through they are, and its text shadow, with floors so text stays readable.
 * Panels stay solid and nothing is blurred (DESIGN.md, section 7). The most colorful of its text colors becomes
 * the accent.
 * @param {Record<string, any>} st A SillyTavern theme (its saved JSON).
 * @returns {Theme|null}
 */
export function themeFromSillyTavern(st) {
    if (!st?.name) return null;
    const text0 = parseColor(st.main_text_color) ?? { r: 220, g: 220, b: 210, a: 1 };
    const rawPanel = parseColor(st.blur_tint_color);
    const rawChat = parseColor(st.chat_tint_color);
    const surfaceHint = rawPanel && rawPanel.a >= 0.25 ? rawPanel : (rawChat && rawChat.a >= 0.25 ? rawChat : null);
    const dark = surfaceHint ? luminance(surfaceHint) < 0.35 : luminance(text0) > 0.3;
    const base = dark ? { r: 12, g: 12, b: 14, a: 1 } : { r: 250, g: 250, b: 248, a: 1 };
    const panel = rawPanel ?? base;
    let bg = over(panel, base);
    for (let i = 0; i < 24 && contrast(over(text0, bg), bg) < 7; i++) bg = mixRgb(bg, base, 0.12);
    const text = readable(over(text0, bg), bg, 7);
    const pick = name => {
        const color = parseColor(st[name]);
        return color ? over(color, bg) : null;
    };
    const quote = readable(pick('quote_text_color') ?? text, bg, 4.5);
    const muted = readable(pick('italics_text_color') ?? mixRgb(text, bg, 0.35), bg, 4.5);
    const candidates = ['quote_text_color', 'underline_text_color', 'main_text_color', 'italics_text_color'].map(pick).filter(Boolean);
    const vivid = candidates.reduce((best, color) => (chroma(color) > chroma(best) ? color : best), candidates[0] ?? text);
    const accent = readable(vivid, bg, 3);
    const darkInk = mixRgb(accent, BLACK, 0.82);
    const onAccent = contrast(WHITE, accent) >= contrast(darkInk, accent) ? WHITE : darkInk;
    const floor = mixRgb(bg, base, 0.35);
    // Message cards in the theme's own tints (Azure: navy for the character, blue for you),
    // kept dark (or light) enough that the text reads on them.
    const cardFrom = tint => {
        if (!tint) return bg;
        let color = mixRgb(bg, { ...tint, a: 1 }, 0.6);
        for (let i = 0; i < 24 && contrast(text, color) < 7; i++) color = mixRgb(color, bg, 0.15);
        return color;
    };
    const botTint = parseColor(st.bot_mes_blur_tint_color);
    const userTint = parseColor(st.user_mes_blur_tint_color);
    const botCard = cardFrom(botTint);
    let userCard = cardFrom(userTint);
    if (distance(botCard, userCard) < 14) {
        userCard = mixRgb(botCard, accent, 0.16);
        for (let i = 0; i < 24 && contrast(text, userCard) < 7; i++) userCard = mixRgb(userCard, bg, 0.15);
    }
    // SillyTavern draws two layers over a chat background: the chat tint, then each message's tint.
    // Pocket Tavern draws only the cards (the picture shows between them), so a card takes the
    // strength of both layers together; with one layer, Cappuccino's cards went pale over a bright
    // picture and its brown quotes were hard to read (Kahvana's report).
    const chatTint = parseColor(st.chat_tint_color);
    const tintAlpha = Math.max(botTint?.a ?? 0, userTint?.a ?? 0);
    const stacked = 1 - (1 - tintAlpha) * (1 - (chatTint?.a ?? 0));
    const shadow = parseColor(st.shadow_color);
    return {
        id: `st:${st.name}`,
        name: st.name,
        note: 'From SillyTavern',
        mode: dark ? 'dark' : 'light',
        bg: hex(bg),
        // Cards are a step lighter than the page: toward the text on dark, toward white on light (like Paper and Cloud).
        raised: hex(dark ? mixRgb(bg, text, 0.07) : mixRgb(bg, WHITE, 0.7)),
        text: hex(text),
        muted: hex(muted),
        accent: hex(accent),
        onAccent: hex(onAccent),
        quote: hex(quote),
        user: rgba(accent, dark ? 0.14 : 0.08),
        bot: rgba(text, dark ? 0.045 : 0.035),
        border: rgba(text, dark ? 0.12 : 0.11),
        backdrop: hex(floor),
        glass: {
            card: clamp(Math.max(tintAlpha + 0.3, stacked), 0.55, 0.94),
            shadow: clamp(Number(st.shadow_width) || 0, 0, 3),
            shadowColor: shadow ? rgba(shadow, clamp(shadow.a, 0, 0.9)) : 'transparent',
            botCard: hex(botCard),
            userCard: hex(userCard),
        },
    };
}

/**
 * Message cards over a chat background. A SillyTavern theme brings its own tints;
 * Pocket Tavern's themes get cards in their surface colour. Only the cards are
 * see-through: bars, pages, sheets and the composer stay solid, and nothing is blurred.
 */
function glassOf(t) {
    if (t.glass) return t.glass;
    const light = t.mode === 'light';
    return {
        card: light ? 0.82 : 0.76,
        // A faint shadow under light text keeps it clear over a sharp picture.
        shadow: light ? 0 : 1,
        shadowColor: light ? 'transparent' : 'rgba(0, 0, 0, 0.55)',
        botCard: t.bg,
        userCard: `color-mix(in srgb, ${t.accent} 16%, ${t.bg})`,
    };
}

const see = (color, alpha) => `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;

function readableOnBoth(fg, a, b, min) {
    let color = readable(fg, a, min);
    if (b) color = readable(color, b, min);
    return color;
}

/**
 * Text colors for glass: checked against bot and user cards as they look over a
 * mid-tone picture (each card's color at its see-through amount over grey), and
 * lifted where they would fade. Returns only the colors that changed.
 */
function glassInk(t, g) {
    // A card over a mid-grey picture, and over a bright one (dark cards) or a dark one (light cards):
    // bright pictures made dark cards pale enough to lose their quote colour (Kahvana's report).
    const backdrops = [{ r: 128, g: 128, b: 128, a: 1 }, t.mode === 'light' ? { r: 24, g: 24, b: 24, a: 1 } : { r: 232, g: 232, b: 232, a: 1 }];
    let cards = [g.botCard, g.userCard].map(parseColor).filter(Boolean);
    if (!cards.length) {
        const bg = parseColor(t.bg);
        if (!bg) return {};
        cards = [bg];
    }
    const surfaces = cards.flatMap(card => backdrops.map(backdrop => over({ ...card, a: g.card }, backdrop)));
    const out = {};
    for (const [key, min] of [['text', 7], ['muted', 4.5], ['quote', 4.5]]) {
        const color = parseColor(t[key]);
        if (!color) continue;
        let fixed = color;
        for (const seen of surfaces) fixed = readable(fixed, seen, min);
        if (hex(fixed) !== hex(color)) out[key] = hex(fixed);
    }
    return out;
}

/** The stylesheet for one theme. `scope` is the selector the overrides hang off. */
export function themeCss(theme, scope) {
    if (!theme) return '';
    const t = theme;
    const g = glassOf(t);
    const ink = glassInk(t, g);
    const bgRgb = parseColor(t.bg);
    const raisedRgb = parseColor(t.raised) ?? bgRgb;
    const mutedRgb = parseColor(t.muted);
    const mutedLow = bgRgb && mutedRgb
        ? hex(readableOnBoth(mixRgb(mutedRgb, bgRgb, 0.22), bgRgb, raisedRgb, 3.2))
        : t.muted;
    const danger = bgRgb
        ? hex(readableOnBoth({ r: 229, g: 83, b: 83, a: 1 }, bgRgb, raisedRgb, 4.6))
        : '#e55353';
    const warn = bgRgb
        ? hex(readableOnBoth(t.mode === 'light' ? { r: 180, g: 92, b: 0, a: 1 } : { r: 240, g: 168, b: 60, a: 1 }, bgRgb, raisedRgb, 4.5))
        : (t.mode === 'light' ? '#9a5500' : '#f0a83c');
    const ok = bgRgb
        ? hex(readableOnBoth(t.mode === 'light' ? { r: 26, g: 127, b: 75, a: 1 } : { r: 79, g: 186, b: 126, a: 1 }, bgRgb, raisedRgb, 4.5))
        : (t.mode === 'light' ? '#1a7f4b' : '#4fba7e');
    const info = bgRgb
        ? hex(readableOnBoth(t.mode === 'light' ? { r: 15, g: 102, b: 178, a: 1 } : { r: 92, g: 174, b: 240, a: 1 }, bgRgb, raisedRgb, 4.5))
        : (t.mode === 'light' ? '#0f66b2' : '#5caef0');
    const gold = bgRgb
        ? hex(readableOnBoth(t.mode === 'light' ? { r: 160, g: 106, b: 0, a: 1 } : { r: 245, g: 204, b: 76, a: 1 }, bgRgb, raisedRgb, 4.5))
        : (t.mode === 'light' ? '#9a6700' : '#f5cc4c');
    const inkCss = [
        ink.text ? `--SmartThemeBodyColor: ${ink.text} !important;` : '',
        ink.text ? `--pt-text-primary: ${ink.text};` : '',
        ink.muted ? `--SmartThemeEmColor: ${ink.muted} !important;` : '',
        ink.muted ? `--pt-text-secondary: ${ink.muted};` : '',
        ink.quote ? `--SmartThemeQuoteColor: ${ink.quote} !important;` : '',
    ].filter(Boolean).join('\n    ');
    return `${scope} {
    color-scheme: ${t.mode};
    --SmartThemeBodyColor: ${t.text} !important;
    --SmartThemeEmColor: ${t.muted} !important;
    --SmartThemeUnderlineColor: ${t.accent} !important;
    --SmartThemeQuoteColor: ${t.quote} !important;
    --SmartThemeBlurTintColor: ${t.bg} !important;
    --SmartThemeChatTintColor: ${see(t.bg, 0.86)} !important;
    --SmartThemeUserMesBlurTintColor: ${t.user} !important;
    --SmartThemeBotMesBlurTintColor: ${t.bot} !important;
    --SmartThemeBorderColor: ${t.border} !important;
    --SmartThemeShadowColor: transparent !important;
    --SmartThemeFastUIBGColor: ${t.bg} !important;
    --shadowWidth: 0 !important;
    --pt-bg: ${t.bg};
    --pt-surface: ${t.raised};
    --pt-surface-elevated: ${t.elevated ?? `color-mix(in srgb, ${t.text} 8%, ${t.raised})`};
    --pt-border: ${t.border};
    --pt-text-primary: ${t.text};
    --pt-text-secondary: ${t.muted};
    --pt-text-muted: ${mutedLow};
    --pt-accent: ${t.accent};
    --pt-on-accent: ${t.onAccent};
    --pt-danger: ${danger};
    --pt-warn: ${warn};
    --pt-ok: ${ok};
    --pt-info: ${info};
    --pt-gold: ${gold};
    --pt-card-user: ${t.user};
    --pt-card-bot: ${t.bot};
    --pt-backdrop: ${t.backdrop};
}
/* A chat background shows: the chat itself is clear and each message is a tinted
   card over the picture. Bars, pages, sheets and the composer stay solid. */
${scope}.stmui-glass {
    --SmartThemeChatTintColor: transparent !important;
    --SmartThemeBotMesBlurTintColor: ${see(g.botCard, g.card)} !important;
    --SmartThemeUserMesBlurTintColor: ${see(g.userCard, g.card)} !important;
    --SmartThemeShadowColor: ${g.shadowColor} !important;
    --shadowWidth: ${g.shadow} !important;
    --pt-card-bot: ${see(g.botCard, g.card)};
    --pt-card-user: ${see(g.userCard, g.card)};
    ${inkCss}
}
/* Looks without cards (Flat, SillyTavern's Document) keep a tinted chat to read on. */
${scope}.stmui-glass:is([data-stmui-look="flat"], :has(body:is(.documentstyle, .echostyle, .whisperstyle, .hushstyle, .ripplestyle, .tidestyle))) {
    --SmartThemeChatTintColor: ${see(t.bg, g.card)} !important;
}
`;
}
