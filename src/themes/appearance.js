// Appearance (Settings → Themes, Chat and layout): Pocket Tavern's theme, motion, text size and the other looks as
// classes and generated CSS on <html>; the chat's look (Cards, Bubbles, Flat); and SillyTavern's own look beside it
// (its UI themes, its Chat Style and backgrounds), kept in step with Pocket Tavern's choices.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { currentShell } from '../shell/app-shell.js';
import { refreshOwnPage } from '../shell/page.js';
import { currentPageId, openPage } from '../shell/pages.js';
import { currentSheet } from '../shell/sheet.js';
import { AVATAR_STYLE, BACKGROUND_THUMB, UI_THEME_PICKER } from '../st/selectors.js';
import { syncSettingsInputs } from '../st/settings.js';
import { currentTheme, stThemes } from './st-themes.js';
import { findTheme, themeCss } from './themes.js';
import { iconCss, iconUrl } from '../ui/icons.js';
import { SETTINGS_OWN_PAGES } from '../views/settings.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'appearance';

/** Phones narrower than this (most 360px Androids, foldable cover screens) get the compact size on Automatic. */
const SMALL_PHONE_BELOW = 380;

/** @type {{ active: () => boolean, settings: () => object, EASE: () => string, MOTION_LABELS: () => object, applyState: Function, syncExtras: Function, saveSettings: Function, $j: Function, isWide: () => boolean } | null} */
let deps = null;

export function setupAppearance(supplied) {
    deps = supplied;
}


function ensureStyle(id) {
    let element = document.getElementById(id);
    if (!element) {
        element = h('style', { id });
        document.head.append(element);
    }
    return element;
}

let originalThemeColor;
let themeColorCall = 0;

/** Android's status bar follows <meta name="theme-color">; match it to the app bar. */
function syncThemeColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (originalThemeColor === undefined) originalThemeColor = meta ? meta.getAttribute('content') : null;
    if (!deps.active()) {
        if (meta && originalThemeColor === null) meta.remove();
        else if (meta) meta.setAttribute('content', originalThemeColor);
        return;
    }
    if (!meta) {
        meta = h('meta', { name: 'theme-color' });
        document.head.append(meta);
    }
    const call = (themeColorCall += 1);
    if (theme) {
        meta.setAttribute('content', theme.bg);
        return;
    }
    // Reading a CSS color makes the browser restyle the page at once; wait for the next frame instead.
    const target = meta;
    requestAnimationFrame(safe(SOURCE, () => {
        if (!deps.active() || !target.isConnected || call !== themeColorCall) return;
        const own = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim();
        target.setAttribute('content', own || '#171717');
    }));
}

const TOAST_ICONS = { success: 'circle-check', info: 'info', warning: 'alert-triangle', error: 'alert-circle' };

function toastIconCss() {
    return Object.entries(TOAST_ICONS)
        .map(([type, name]) => `html.pt-toasts #toast-container > .toast-${type} { --pt-t-icon: ${iconUrl(name)}; }`)
        .join(' ')
        // A grey magnifier drawn inside search boxes.
        + ` html.pt-on { --pt-search-icon: ${iconUrl('search', '#909090')}; --pt-think-icon: ${iconUrl('bulb')}; --pt-regen-icon: ${iconUrl('refresh')}; --pt-chev-down-icon: ${iconUrl('chevron-down')}; --pt-chev-up-icon: ${iconUrl('chevron-up')}; --pt-info-icon: ${iconUrl('info')}; --pt-warn-icon: ${iconUrl('alert-triangle')}; --pt-error-icon: ${iconUrl('alert-circle')}; --pt-ok-icon: ${iconUrl('circle-check')}; }`;
}

/** A Pocket Tavern theme (not a SillyTavern one): only these have a background of their own. */
export function ownThemeOn() {
    return !!findTheme(deps.settings().theme);
}

/** True when a chat background picture is set (not SillyTavern's empty "transparent" one). */
function chatBackgroundSet() {
    for (const id of ['bg_custom', 'bg1']) {
        const element = document.getElementById(id);
        // The picture SillyTavern set on it: its computed value still shows the old one while it fades over.
        const image = element ? element.style.backgroundImage || getComputedStyle(element).backgroundImage : 'none';
        if (/url\(/.test(image) && !/__transparent/.test(image)) return true;
    }
    return false;
}

/**
 * A chat background shows (html.pt-glass): the chat turns clear and messages
 * become tinted cards over the picture. Off when a Pocket Tavern theme shows its
 * own background, or when no background picture is set.
 */
function syncGlass() {
    const root = document.documentElement;
    const own = deps.active() && ownThemeOn() && deps.settings().themeBackdrop;
    root.classList.toggle('pt-glass', deps.active() && !own && chatBackgroundSet());
}

const glassWatch = { observer: null, frame: 0 };

/** SillyTavern changes the background by restyling #bg1 (or #bg_custom for a chat's own). */
function watchBackground() {
    if (!deps.active()) {
        glassWatch.observer?.disconnect();
        glassWatch.observer = null;
        cancelAnimationFrame(glassWatch.frame);
        glassWatch.frame = 0;
        stThemes.observer?.disconnect();
        stThemes.observer = null;
        return;
    }
    if (glassWatch.observer) return;
    const targets = ['bg1', 'bg_custom'].map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    glassWatch.observer = new MutationObserver(safe(SOURCE, () => {
        if (glassWatch.frame) return;
        glassWatch.frame = requestAnimationFrame(safe(SOURCE, () => {
            glassWatch.frame = 0;
            if (deps.active()) syncGlass();
        }));
    }));
    for (const target of targets) glassWatch.observer.observe(target, { attributes: true, attributeFilter: ['style', 'class'] });
}

export function applyAppearance() {
    const root = document.documentElement;
    const theme = deps.active() ? currentTheme() : null;
    root.classList.toggle('pt-themed', !!theme);
    // SillyTavern's themes have no background of their own: your chat background always shows, as in SillyTavern.
    root.classList.toggle('pt-backdrop', !!theme && ownThemeOn() && deps.settings().themeBackdrop);
    syncGlass();
    watchBackground();
    root.classList.toggle('pt-font', deps.active() && deps.settings().modernFont);
    root.classList.toggle('pt-icons', deps.active() && deps.settings().customIcons);
    root.classList.toggle('pt-toasts', deps.active() && deps.settings().niceToasts);
    for (const level of Object.keys(deps.MOTION_LABELS())) root.classList.toggle(`pt-motion-${level}`, deps.active() && deps.settings().motion === level);
    if (theme) root.dataset.ptTheme = theme.id;
    else delete root.dataset.ptTheme;

    if (deps.active()) {
        ensureStyle('pt-theme-css').textContent = themeCss(theme, 'html.pt-on.pt-themed') + toastIconCss();
        if (deps.settings().customIcons) {
            const icons = ensureStyle('pt-icons-css');
            if (!icons.textContent) icons.textContent = iconCss('html.pt-icons');
        }
    } else {
        document.getElementById('pt-theme-css')?.remove();
        document.getElementById('pt-icons-css')?.remove();
    }
    syncThemeColor(theme);
    syncChatStyleForTheme();
    watchStThemePicks();
}

/** Runs `change` behind a circular reveal that grows from `origin` (View Transitions). */
function revealChange(origin, change) {
    const root = document.documentElement;
    const canAnimate = typeof document.startViewTransition === 'function'
        && deps.settings().motion === 'full'
        && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canAnimate) {
        change();
        return;
    }
    const rect = origin?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : innerHeight / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('pt-vt');
    // The browser runs the change once it has captured the old look. If that capture
    // is ever delayed (busy or backgrounded page), apply the change anyway.
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        change();
    };
    window.setTimeout(safe(SOURCE, run), 700);
    const transition = document.startViewTransition(run);
    transition.ready.then(() => {
        root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 240, easing: deps.EASE(), pseudoElement: '::view-transition-new(root)' },
        );
    }).catch(() => {});
    transition.finished.catch(() => {}).finally(() => root.classList.remove('pt-vt'));
}

export function setAppearance(key, value, origin) {
    if (deps.settings()[key] === value) return;
    const change = () => {
        deps.settings()[key] = value;
        deps.saveSettings();
        applyAppearance();
        deps.syncExtras();
        syncSettingsInputs();
        currentShell()?.update();
        // Switches already show their new state; re-render only what depends on the choice.
        if (currentSheet() && !currentSheet().picker && ['theme', 'motion', 'textSize', 'chatLook', 'uiSize', 'composerStyle', 'layout'].includes(key)) currentSheet().refresh();
        // The layout changes the whole interface.
        if (key === 'layout') deps.applyState();
        // Switches and segments on a settings page already show their new state (and keep the filter).
        const page = currentPageId();
        if (!SETTINGS_OWN_PAGES.includes(page) || ['theme', 'layout', 'chatLook'].includes(key)) refreshOwnPage();
    };
    if (key === 'theme') revealChange(origin, change);
    else change();
}

export function applyChatLook() {
    const root = document.documentElement;
    if (deps.active() && deps.settings().chatStyle && deps.settings().chatLook && deps.settings().chatLook !== 'cards') root.dataset.ptLook = deps.settings().chatLook;
    else delete root.dataset.ptLook;
}

export function pickChatLook(look) {
    const switched = useFlatChatStyle();
    if (switched) globalThis.toastr?.info(t("SillyTavern's Chat Style is now Flat, so Pocket Tavern's chat look shows."), '', { timeOut: 4000 });
    if ((deps.settings().chatLook || 'cards') !== look) setAppearance('chatLook', look);
    else if (switched && currentSheet() && !currentSheet().picker) currentSheet().refresh();
}

/**
 * A Pocket Tavern theme draws the whole look, the messages too. A SillyTavern theme picked
 * earlier (Cappuccino, Azure) often brings Chat Style: Bubbles, and SillyTavern then drew its
 * bubbles in Pocket Tavern's colours: the two looks fought. So when a Pocket Tavern theme
 * comes on (a new install, or picking one), SillyTavern's Chat Style goes to Flat once and the
 * old style is remembered; picking a SillyTavern theme again, or turning Pocket Tavern (or its
 * chat cards) off, puts it back. Only on those changes: a Chat Style you pick afterwards stays.
 */
export function syncChatStyleForTheme() {
    syncStCustomCss();
    const select = document.getElementById('chat_display');
    if (!select) return;
    const own = deps.active() && deps.settings().chatStyle && ownThemeOn() ? String(deps.settings().theme) : '';
    if (own) {
        if (deps.settings().chatStyleFor === own) {
            // Still on: a SillyTavern theme just picked in SillyTavern's own settings may have switched Chat Style
            // back to Bubbles or Document, so Pocket Tavern's theme keeps drawing the chat. A style picked by hand stays.
            if (select.value !== '0' && Date.now() - stThemePickedAt < 1500) useFlatChatStyle();
            return;
        }
        deps.settings().chatStyleFor = own;
        if (select.value !== '0') {
            const name = stChatStyleName();
            deps.settings().stChatStyle = select.value;
            useFlatChatStyle();
            globalThis.toastr?.info(t("Pocket Tavern's theme draws the chat, so SillyTavern's {style} chat style is off while it is on. Picking a SillyTavern theme in Settings → Appearance brings it back.", { style: t(name) }), '', { timeOut: 7000 });
        }
        deps.saveSettings();
        return;
    }
    if (!deps.settings().chatStyleFor) return;
    const back = deps.settings().stChatStyle;
    deps.settings().chatStyleFor = '';
    deps.settings().stChatStyle = '';
    deps.saveSettings();
    if (back && select.value === '0' && select.querySelector(`option[value="${CSS.escape(back)}"]`)) deps.$j()(select).val(back).trigger('change');
}

/**
 * SillyTavern's Custom CSS (Settings → SillyTavern → Custom CSS). Picking a SillyTavern theme puts that theme's own
 * CSS there, so while a Pocket Tavern theme is on it is set aside (a `media` that matches nothing), unless
 * Appearance → "SillyTavern's Custom CSS" is on. "Your theme" and SillyTavern's themes always use it.
 */
function syncStCustomCss() {
    const style = document.getElementById('custom-style');
    if (!style) return;
    const off = deps.active() && ownThemeOn() && !deps.settings().stCustomCss;
    if (off && style.getAttribute('media') !== 'not all') {
        style.setAttribute('media', 'not all');
        style.dataset.ptOff = '1';
    } else if (!off && style.dataset.ptOff) {
        style.removeAttribute('media');
        delete style.dataset.ptOff;
    }
}

/** When a SillyTavern theme was last picked: the avatar shape it sets right after is the theme's, not yours. */
let stThemePickedAt = 0;

/**
 * A SillyTavern theme picked in SillyTavern's own settings: Pocket Tavern's theme stays in charge. Its Chat Style
 * goes back to Flat and the avatar shape you chose comes back (a theme brings its own).
 */
export function watchStThemePicks() {
    const $ = deps.$j();
    $(document).off('.ptStTheme');
    if (!deps.active()) return;
    const shape = document.getElementById('avatar_style');
    if (shape && typeof deps.settings().avatarShape !== 'string') {
        deps.settings().avatarShape = shape.value;
        deps.saveSettings();
    }
    $(document).on('change.ptStTheme', UI_THEME_PICKER, () => {
        stThemePickedAt = Date.now();
        window.setTimeout(safe(SOURCE, () => {
            if (!deps.active()) return;
            syncChatStyleForTheme();
            const select = document.getElementById('avatar_style');
            if (ownThemeOn() && select && typeof deps.settings().avatarShape === 'string' && select.value !== deps.settings().avatarShape
                && select.querySelector(`option[value="${CSS.escape(deps.settings().avatarShape)}"]`)) {
                $(select).val(deps.settings().avatarShape).trigger('change');
            }
        }), 400);
    });
    // A shape you pick yourself (Appearance or SillyTavern's own setting) is the one kept.
    $(document).on('change.ptStTheme', AVATAR_STYLE, function () {
        if (Date.now() - stThemePickedAt < 1500) return;
        if (deps.settings().avatarShape !== this.value) {
            deps.settings().avatarShape = this.value;
            deps.saveSettings();
        }
    });
}

/** SillyTavern's Chat Style when it is not Flat (Pocket Tavern's message cards only draw over Flat), else ''. */
export function stChatStyleName() {
    const select = document.getElementById('chat_display');
    if (!select || select.value === '0') return '';
    return select.selectedOptions[0]?.textContent?.trim() || select.value;
}

/** Puts SillyTavern's Chat Style on Flat (it saves it); true when it changed. */
export function useFlatChatStyle() {
    const select = document.getElementById('chat_display');
    if (!select || select.value === '0') return false;
    deps.$j()(select).val('0').trigger('change');
    return true;
}

function themeNote(id, key, text, actions = []) {
    return h('div', { id, class: 'pt-inline-note', 'data-pt': '1', 'data-key': key }, [
        h('p', { text }),
        actions.length ? h('div', { class: 'pt-inline-note-actions' }, actions.map(([label, onclick]) => h('button', { type: 'button', class: 'pt-inline-note-btn', onclick }, [label]))) : null,
    ]);
}

/** On the Backgrounds page: a Pocket Tavern theme's own background is covering chat backgrounds. */
function syncBackgroundNote() {
    const header = document.getElementById('bg-header-fixed');
    let note = document.getElementById('pt_bg_note');
    const theme = deps.active() ? currentTheme() : null;
    const key = theme && ownThemeOn() && deps.settings().themeBackdrop ? `theme:${theme.id}` : '';
    if (!header || !key) {
        note?.remove();
        return;
    }
    if (note?.dataset.key === key) return;
    note?.remove();
    note = themeNote('pt_bg_note', key, t('The {theme} theme shows its own background, so chat backgrounds are hidden.', { theme: t(theme.name) }), [
        ['Show chat backgrounds', () => setAppearance('themeBackdrop', false)],
    ]);
    header.prepend(note);
}

/**
 * At the top of Settings → Look: SillyTavern's UI Theme list is hidden there while
 * Pocket Tavern is on, because its themes are in Settings → Themes, made to fit.
 */
function syncLookNote() {
    const block = document.getElementById('UI-presets-block');
    let note = document.getElementById('pt_look_note');
    if (!block || !deps.active()) {
        note?.remove();
        return;
    }
    if (note) return;
    note = themeNote('pt_look_note', 'moved', "Themes are in Settings → Appearance: Pocket Tavern's own, and your SillyTavern themes made to fit. Theme Colors below change \"Your theme\".", [
        ['Open Appearance', () => openPage('pt-appearance')],
    ]);
    block.prepend(note);
}

export function syncThemeNotes() {
    syncBackgroundNote();
    syncLookNote();
}

/**
 * Picking a background while a Pocket Tavern theme shows its own: the pick is what
 * you want to see, so the theme's background turns off.
 */
export function onBackgroundPick(event) {
    if (!deps.active() || !deps.settings().themeBackdrop || !ownThemeOn()) return;
    const thumb = event.target.closest?.(BACKGROUND_THUMB);
    if (!thumb || event.target.closest('.jg-menu, .mobile-only-menu-toggle') || thumb.closest('.bg-selection-mode')) return;
    setAppearance('themeBackdrop', false);
    globalThis.toastr?.info(t("The theme's own background is off now. Turn it back on in Settings → Themes."), t('Showing your background'), { timeOut: 4000 });
}

export function applyTextSize() {
    const root = document.documentElement;
    if (deps.active() && deps.settings().textSize && deps.settings().textSize !== 'normal') root.dataset.ptText = deps.settings().textSize;
    else delete root.dataset.ptText;
}

function isCompact() {
    if (deps.settings().uiSize === 'compact') return true;
    if (deps.settings().uiSize !== 'auto') return false;
    // A computer (mouse or trackpad, desktop layout): compact, like SillyTavern's own density.
    if (deps.isWide() && matchMedia('(pointer: fine)').matches) return true;
    const sides = [screen.width, screen.height].filter(n => n > 0);
    return sides.length > 0 && Math.min(...sides) < SMALL_PHONE_BELOW;
}

/** Size (compact or comfortable), the message box style and the tucked tabs. */
export function applyLayoutPrefs() {
    const root = document.documentElement;
    root.classList.toggle('pt-compact', deps.active() && isCompact());
    root.classList.toggle('pt-docked', deps.active() && deps.settings().chatStyle && deps.settings().composerStyle === 'docked');
    currentShell()?.syncTuck();
}
