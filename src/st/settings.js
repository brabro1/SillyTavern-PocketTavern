// SillyTavern's settings screens while Pocket Tavern is on, and what Settings' own pages need (DESIGN.md → Key
// screens → Settings): long pages shown as rows of sections (Settings, Formatting, Extensions), Search settings,
// each setting's help as a line under it, − and + beside sliders, the Extensions panel's Pocket Tavern switches,
// the theme and SillyTavern-section actions behind Appearance, and About's updates, install and What's new.
// SillyTavern's nodes are marked, restyled and pressed, never moved. Moved here whole from the legacy app (M5);
// its listeners are still registered by the legacy app, so errors in them are caught by the lifecycle's
// page-wide net (src/core/lifecycle.js) like the rest of the legacy code.
import { t } from '../core/i18n.js';
import { CHANGES, VERSION } from '../../changelog.js';
import { h } from '../core/dom.js';
import { THEMES } from '../themes/themes.js';
import { IS_IOS, resolveLayout } from '../shell/layout.js';
import { refreshOwnPage } from '../shell/page.js';
import { SWITCHES } from '../views/pocket-tavern.js';
import { presetTabs, setPresetTab } from '../st/ai.js';

/** The choices in the Extensions panel's Pocket Tavern section. */
const SIZES = { auto: 'Automatic', comfortable: 'Comfortable', compact: 'Compact' };
const LAYOUT_NAMES = { auto: 'Automatic', phone: 'Phone', desktop: 'Desktop' };
const COMPOSER_STYLES = { floating: 'Floating', docked: 'Docked' };
const TEXT_SIZES = { small: 'Small', normal: 'Normal', large: 'Large', xl: 'Extra large' };

/**
 * What the legacy app hands over (set once by setupSettingsScreens()).
 * @type {Record<string, any> | null}
 */
let deps = null;

export function setupSettingsScreens(supplied) {
    deps = supplied;
}

const $j = (...args) => deps.$j(...args);
const applyAppearance = (...args) => deps.applyAppearance(...args);
const applyState = (...args) => deps.applyState(...args);
const buzz = (...args) => deps.buzz(...args);
const closeSheet = (...args) => deps.closeSheet(...args);
const copyText = (...args) => deps.copyText(...args);
const ctx = (...args) => deps.ctx(...args);
const currentPageId = (...args) => deps.currentPageId(...args);
const detectPhone = (...args) => deps.detectPhone(...args);
const drawerById = (...args) => deps.drawerById(...args);
const icon = (...args) => deps.icon(...args);
const inActiveSection = (...args) => deps.inActiveSection(...args);
const isWide = (...args) => deps.isWide(...args);
const motionAllowed = (...args) => deps.motionAllowed(...args);
const normalizeText = (...args) => deps.normalizeText(...args);
const openPage = (...args) => deps.openPage(...args);
const pageInfo = (...args) => deps.pageInfo(...args);
const readMode = (...args) => deps.readMode(...args);
const reloadWhenIdle = (...args) => deps.reloadWhenIdle(...args);
const saveSettings = (...args) => deps.saveSettings(...args);
const scheduleHistorySync = (...args) => deps.scheduleHistorySync(...args);
const setAppearance = (...args) => deps.setAppearance(...args);
const showSheet = (...args) => deps.showSheet(...args);
const stThemeColors = (...args) => deps.stThemeColors(...args);
const ui = (...args) => deps.ui(...args);
const writeMode = (...args) => deps.writeMode(...args);
/** The legacy app's MenuSheet, made through it. */
function MenuSheet(...args) {
    return new deps.MenuSheet(...args);
}

/** SillyTavern's own colours, for the "Your theme" card. SillyTavern writes them inline on <html>. */
export function yourThemeColors() {
    const inline = document.documentElement.style;
    const read = (name, fallback) => inline.getPropertyValue(name).trim() || fallback;
    const bg = read('--SmartThemeBlurTintColor', '#171717');
    const text = read('--SmartThemeBodyColor', '#dcdcd2');
    const accent = read('--SmartThemeQuoteColor', '#e18a24');
    return { bg, raised: `color-mix(in srgb, ${text} 9%, ${bg})`, text, accent, user: `color-mix(in srgb, ${accent} 16%, transparent)`, backdrop: bg };
}

/** Picks a theme on the Appearance page; a SillyTavern theme also brings its avatar shape, as in SillyTavern. */
export function pickTheme(id, raw, origin) {
    if (raw) {
        deps.settings().stTheme = stThemeColors(raw);
        const shape = document.getElementById('avatar_style');
        const styleVal = raw.avatar_style !== undefined ? String(raw.avatar_style) : '';
        if (shape && styleVal && styleVal !== shape.value && shape.querySelector(`option[value="${CSS.escape(styleVal)}"]`)) {
            $j()(shape).val(styleVal).trigger('change');
        }
        // Picked again (it may have changed in SillyTavern): apply its current values.
        if (deps.settings().theme === id) {
            saveSettings();
            applyAppearance();
            refreshOwnPage();
            return;
        }
    }
    setAppearance('theme', id, origin);
}

/** Opens one section of SillyTavern's settings (Look, Chat, …) once its list of sections is built. */
export function openSillyTavernSection(section) {
    openPage('user-settings-button');
    let tries = 0;
    const attempt = () => {
        if (!deps.active()) return;
        if (setnav.home && setnav.has(section)) setnav.open(section);
        else if (++tries < 20) window.setTimeout(attempt, 100);
    };
    window.setTimeout(attempt, 50);
}

// ---------------------------------------------------------- phone extras
// -- sliders: − and + beside the number

function stepButton(input, direction) {
    const onclick = () => {
        const before = input.value;
        try {
            if (direction > 0) input.stepUp();
            else input.stepDown();
        } catch {
            const size = Number(input.step) || 1;
            const decimals = (String(size).split('.')[1] || '').length;
            let next = Number(input.value || 0) + direction * size;
            if (input.min !== '') next = Math.max(Number(input.min), next);
            if (input.max !== '') next = Math.min(Number(input.max), next);
            input.value = String(decimals ? Number(next.toFixed(decimals)) : next);
        }
        if (input.value === before) return;
        buzz(4);
        // Move the slider itself, the way SillyTavern does after typing a number.
        const master = input.dataset.for ? document.getElementById(input.dataset.for) : null;
        if (master) $j()(master).val(input.value).trigger('input', { forced: true });
        else $j()(input).trigger('input').trigger('change');
    };
    return direction > 0
        ? h('button', { type: 'button', class: 'pt-step pt-step-up', 'aria-label': 'More', onclick }, ['+'])
        : h('button', { type: 'button', class: 'pt-step pt-step-down', 'aria-label': 'Less', onclick }, ['−']);
}

/**
 * − and + beside sliders' numbers (Settings → Pocket Tavern → "− and + beside sliders", off by default; issue
 * #12). They are added next to SillyTavern's number box, never around it, so its own nodes stay where they are.
 */
export function addSliderSteppers(root = document) {
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().sliderSteppers) return;
    // Chat Completion sliders keep their number in a .range-block-counter box.
    for (const counter of root.querySelectorAll('.range-block-counter')) {
        const input = counter.querySelector('input[type="number"]');
        if (!input || counter.querySelector('.pt-step')) continue;
        counter.classList.add('pt-stepper');
        counter.prepend(stepButton(input, -1));
        counter.append(stepButton(input, 1));
    }
    // Text Completion, KoboldAI and NovelAI sliders have a bare number box: the buttons go on either side.
    for (const input of root.querySelectorAll('input.neo-range-input[type="number"]')) {
        if (input.closest('.range-block-counter') || input.previousElementSibling?.classList.contains('pt-step')) continue;
        input.classList.add('pt-step-input');
        input.parentElement?.classList.add('pt-step-host');
        input.before(stepButton(input, -1));
        input.after(stepButton(input, 1));
    }
}

export function removeSliderSteppers() {
    document.querySelectorAll('.pt-step').forEach(node => node.remove());
    document.querySelectorAll('.pt-step-input').forEach(node => node.classList.remove('pt-step-input'));
    document.querySelectorAll('.pt-step-host').forEach(node => node.classList.remove('pt-step-host'));
    document.querySelectorAll('.range-block-counter.pt-stepper').forEach(node => node.classList.remove('pt-stepper'));
}

// -- find a setting

export const SEARCH_PAGES = ['ai-config-button', 'sys-settings-button', 'advanced-formatting-button', 'user-settings-button', 'extensions-settings-button'];

function ownText(element) {
    let text = '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest('select, option, textarea, script, style, .pt-skip') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode() && text.length < 160) text += ` ${walker.currentNode.nodeValue}`;
    return text.replace(/\s+/g, ' ').trim();
}

function settingSection(row, root, headings) {
    const parts = [];
    const drawer = row.closest('.inline-drawer');
    if (drawer && root.contains(drawer)) {
        const header = drawer.querySelector(':scope > .inline-drawer-header, :scope > .inline-drawer-toggle');
        const text = header ? ownText(header) : '';
        if (text) parts.push(text);
    }
    let heading = null;
    for (const candidate of headings) {
        if (candidate.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) heading = candidate;
        else break;
    }
    const headingText = heading ? ownText(heading) : '';
    if (headingText && !parts.includes(headingText)) parts.unshift(headingText);
    return parts.join(' › ').slice(0, 80);
}

export function settingItems(root) {
    const items = [];
    const seen = new Set();
    const labels = new Set();
    const headings = Array.from(root.querySelectorAll('h2, h3, h4, h5, .standoutHeader'));
    for (const control of root.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea, .menu_button, .checkbox_label')) {
        if (control.closest('.template_element, #pt-sheet')) continue;
        // Include controls inside collapsed .inline-drawer-content (revealSetting opens them on tap).
        if (!inActiveSection(control, root, true)) continue;
        let row = control;
        let label = '';
        for (let depth = 0; depth < 5 && row && row !== root; depth++, row = row.parentElement) {
            label = ownText(row) || (row === control ? (control.getAttribute('title') || control.getAttribute('placeholder') || '') : '');
            if (label.length >= 2) break;
        }
        if (!row || row === root || label.length < 2 || seen.has(row)) continue;
        seen.add(row);
        const section = settingSection(row, root, headings);
        const key = `${label}|${section}`;
        if (labels.has(key)) continue;
        labels.add(key);
        items.push({ row, label: label.length > 90 ? `${label.slice(0, 90)}…` : label, section, search: normalizeText(`${label} ${section}`) });
    }
    return items;
}

export function revealSetting(row) {
    // Chat Completion Tabs keeps Parameters and Prompts apart: switch to the tab that holds it.
    const tab = row.closest('.openai-tab-content:not(.active)');
    if (tab) document.getElementById(tab.id.replace('-content-', '-btn-'))?.click();
    // Pocket Tavern's own Parameters / Prompts tabs, the same way.
    if (presetTabs.bar && row.closest('#ai_response_configuration') && !row.closest('#respective-presets-block')) setPresetTab(row.closest('.pt-ptab-prompts') ? 'prompts' : 'params');
    const section = row.closest('[data-pt-sec]')?.dataset.ptSec;
    const nav = pageSections();
    if (section && nav?.home && nav.view !== section) nav.open(section);
    // Open any folded sections around it first.
    for (let node = row.parentElement; node; node = node.parentElement) {
        if (node.classList?.contains('inline-drawer-content') && getComputedStyle(node).display === 'none') {
            node.closest('.inline-drawer')?.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header')?.click();
        }
    }
    setTimeout(() => {
        row.scrollIntoView({ block: 'center', behavior: motionAllowed() ? 'smooth' : 'auto' });
        row.classList.remove('pt-flash');
        void row.offsetWidth;
        row.classList.add('pt-flash');
        setTimeout(() => row.classList.remove('pt-flash'), 2000);
    }, 260);
}

export function openSettingSearch() {
    const pageId = currentPageId();
    const root = pageId && document.querySelector(`#${pageId} > .drawer-content`);
    if (!root) return;
    const items = settingItems(root);
    const title = pageInfo(drawerById(pageId)).title;
    // The search box is the header (Kahvana's feedback: a "Find a setting" title above it only repeated it).
    const input = h('input', { type: 'search', class: 'text_pole pt-choice-search pt-head-search', placeholder: t('Find a setting in {page}', { page: t(title) }), 'aria-label': t('Find a setting'), enterkeyhint: 'search' });
    const finder = new MenuSheet({
        title: t('Find a setting'),
        fill: body => {
            const list = h('div', { class: 'pt-menu-list' });
            const foot = h('p', { class: 'pt-menu-foot' });
            const render = () => {
                const words = normalizeText(input.value).split(/\s+/).filter(Boolean);
                const hits = words.length ? items.filter(item => words.every(word => item.search.includes(word))).slice(0, 60) : [];
                list.replaceChildren(...hits.map(item => h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        closeSheet(true);
                        revealSetting(item.row);
                    },
                }, [
                    ui('search', 'pt-menu-row-icon'),
                    h('span', { class: 'pt-row-text' }, [h('span', { raw: item.label }), item.section ? h('small', { raw: item.section }) : null]),
                ])));
                list.hidden = !hits.length;
                foot.textContent = !words.length ? t('{count} settings on this page.', { count: items.length }) : (hits.length ? '' : t('No setting matches that.'));
            };
            // Assigned, not added: the sheet can fill its body again, and the box (in the header) stays.
            input.oninput = render;
            input.onkeydown = event => {
                if (event.key !== 'Enter' || event.isComposing) return;
                event.preventDefault();
                list.querySelector('.pt-menu-row')?.click();
            };
            body.append(list, foot);
            render();
        },
    });
    finder.head.querySelector('.pt-overlay-text')?.replaceWith(input);
    showSheet(finder);
    setTimeout(() => input.focus(), 250);
}

// -- long pages in sections: Settings and Formatting

/**
 * Some SillyTavern pages are one long list of controls (User Settings has about a hundred).
 * They open on a short list of sections instead, like a phone's own Settings app, and a
 * section shows only its own controls; Back returns to the list. Nothing is moved: each
 * block is marked with its section and the others are hidden (`.pt-sec-off`).
 */
class PageSections {
    /**
     * @param {object} spec
     * @param {string} spec.pageId - the page's drawer id
     * @param {string} spec.rootClass - class on <html> while the list is in use
     * @param {string} spec.pageTitle - the page's name, shown under a section's title
     * @param {{ id: string, icon: string, title: string, note: string }[]} spec.sections
     * @param {() => HTMLElement | null} spec.block - the page's drawer content
     * @param {(nav: PageSections, block: HTMLElement) => boolean} spec.mark - marks the blocks; false when the page is not laid out as expected
     * @param {(nav: PageSections, block: HTMLElement, list: HTMLElement) => void} spec.place - puts the list of sections on the page
     */
    constructor(spec) {
        Object.assign(this, spec);
        this.view = 'home';
        this.home = null;
        this.marked = [];
    }

    markAs(element, id) {
        if (!element || element.dataset.ptSec) return;
        element.dataset.ptSec = id;
        this.marked.push(element);
    }

    has(id) {
        return this.marked.some(element => element.dataset.ptSec === id);
    }

    current() {
        return this.view === 'home' ? null : this.sections.find(section => section.id === this.view) ?? null;
    }

    row(iconName, title, note, onclick) {
        return h('button', { type: 'button', class: 'pt-menu-row', onclick }, [
            ui(iconName, 'pt-menu-row-icon'),
            h('span', { class: 'pt-row-text' }, [h('span', { text: title }), h('small', { text: note })]),
            ui('chevron-right', 'pt-menu-row-go'),
        ]);
    }

    sectionList() {
        return h('div', { class: 'pt-menu-list' }, this.sections.filter(section => this.has(section.id))
            .map(section => this.row(section.icon, section.title, section.note, () => this.open(section.id))));
    }

    apply() {
        const block = this.block();
        if (!block || !this.home) return;
        block.dataset.ptView = this.view;
        for (const element of this.marked) element.classList.toggle('pt-sec-off', element.dataset.ptSec !== this.view);
    }

    scrollTop() {
        const block = this.block();
        if (block) block.scrollTop = 0;
    }

    open(id) {
        if (!this.home) return;
        this.view = id;
        this.apply();
        this.scrollTop();
        deps.shell()?.render(currentPageId());
        scheduleHistorySync();
    }

    isOpen() {
        return !!this.home && this.view !== 'home' && currentPageId() === this.pageId;
    }

    /** Back from a section to the list of sections. */
    close() {
        if (!this.isOpen()) return false;
        this.view = 'home';
        this.apply();
        this.scrollTop();
        deps.shell()?.render(currentPageId());
        scheduleHistorySync();
        return true;
    }

    /** The page opens on its list again next time. */
    reset() {
        if (this.view === 'home') return;
        this.view = 'home';
        this.apply();
    }

    teardown() {
        for (const element of this.marked) {
            delete element.dataset.ptSec;
            element.classList.remove('pt-sec-off');
        }
        this.marked = [];
        this.home?.remove();
        this.home = null;
        this.view = 'home';
        const block = this.block();
        if (block) delete block.dataset.ptView;
        document.documentElement.classList.remove(this.rootClass);
    }

    sync() {
        const block = this.block();
        if (!deps.active() || !deps.settings().touchSizing || !block) {
            if (this.home || this.marked.length) this.teardown();
            return;
        }
        if (this.home?.isConnected) return;
        this.teardown();
        if (!this.mark(this, block)) {
            this.teardown();
            return;
        }
        this.home = h('div', { class: 'pt-set-home', 'data-pt': '1' });
        this.place(this, block, this.home);
        document.documentElement.classList.add(this.rootClass);
        this.apply();
    }
}

const SETTINGS_SECTIONS = [
    { id: 'look', icon: 'palette', title: 'Look', note: 'Theme, colors, avatars, text size and chat width' },
    { id: 'display', icon: 'eye', title: 'Display', note: 'Timestamps, token counts, icons and effects' },
    { id: 'chat', icon: 'chat', title: 'Chat', note: 'Sending, streaming, swipes and replies' },
    { id: 'characters', icon: 'users', title: 'Characters', note: 'Character list, card import and avatars' },
    { id: 'other', icon: 'sliders', title: 'Sounds and more', note: 'Sounds, smooth streaming, tools and window layout' },
    { id: 'css', icon: 'brush', title: 'Custom CSS', note: 'Your own style rules' },
    { id: 'stscript', icon: 'scroll', title: 'STscript', note: 'How slash commands are read' },
];

const setnav = new PageSections({
    pageId: 'user-settings-button',
    rootClass: 'pt-setnav',
    pageTitle: 'SillyTavern',
    sections: SETTINGS_SECTIONS,
    block: () => document.getElementById('user-settings-block'),
    mark: (nav, block) => {
        const content = block.querySelector('#user-settings-block-content');
        if (!content) return false;
        const theme = content.querySelector('#UI-Theme-Block');
        nav.markAs(theme?.querySelector('#UI-presets-block'), 'look');
        for (const child of theme?.querySelector(':scope > .flexNoGap')?.children ?? []) {
            nav.markAs(child, child.querySelectorAll(':scope > label.checkbox_label').length >= 5 ? 'display' : 'look');
        }
        for (const group of content.querySelectorAll('#UI-Customization > div')) {
            if (group.querySelector('#aux_field, #tag_import_setting')) nav.markAs(group, 'characters');
            else for (const child of group.children) nav.markAs(child, child.id === 'CustomCSS-block' ? 'css' : 'other');
        }
        for (const group of content.querySelectorAll('#power-user-option-checkboxes > *')) {
            nav.markAs(group, group.querySelector('[id^="stscript_"]') ? 'stscript' : 'chat');
        }
        // Anything else (a newer SillyTavern, another extension) goes to "Sounds and more", so nothing gets lost.
        const sweep = parent => {
            for (const child of parent.children) {
                if (child.dataset.ptSec) continue;
                if (child.querySelector('[data-pt-sec]')) sweep(child);
                else nav.markAs(child, 'other');
            }
        };
        sweep(content);
        return nav.has('look');
    },
    place: (nav, block, list) => {
        list.append(
            h('button', { type: 'button', class: 'pt-search-field', onclick: () => openSettingSearch() }, [ui('search'), h('span', { text: 'Search settings' })]),
            nav.sectionList(),
            h('div', { class: 'pt-menu-list' }, [nav.row('sliders', 'Pocket Tavern', 'Where it runs and how it behaves', () => openPage('pt-pocket'))]),
        );
        // The block on top holds the title, language, account and version; the list goes first in it.
        const top = block.querySelector('#settingsSearch')?.closest('#user-settings-block > *');
        if (top) top.prepend(list);
        else block.prepend(list);
    },
});

/**
 * Formatting (Advanced Formatting) is nine headed blocks in three columns, about three
 * screens long on a phone (Kahvana's feedback). Each column, or each block of the last
 * one, becomes a section.
 */
const FORMATTING_SECTIONS = [
    { id: 'context', icon: 'file-text', title: 'Context template', note: 'Story string and how the prompt is put together' },
    { id: 'instruct', icon: 'list', title: 'Instruct template', note: 'Instruct mode and the sequences around messages' },
    { id: 'sysprompt', icon: 'scroll', title: 'System prompt', note: 'Instructions sent before the chat' },
    { id: 'reasoning', icon: 'bulb', title: 'Reasoning', note: 'Thinking blocks: finding, showing and sending them' },
    { id: 'stopping', icon: 'stop', title: 'Stopping strings', note: 'Words that end a reply' },
    { id: 'tokenizer', icon: 'type', title: 'Tokenizer', note: 'How tokens are counted' },
    { id: 'misc', icon: 'sliders', title: 'Miscellaneous', note: 'Start reply with, model binding and more' },
];

const afnav = new PageSections({
    pageId: 'advanced-formatting-button',
    rootClass: 'pt-afnav',
    pageTitle: 'Formatting',
    sections: FORMATTING_SECTIONS,
    block: () => document.getElementById('AdvancedFormatting'),
    mark: (nav, block) => {
        const columns = block.querySelector(':scope > .flex-container.spaceEvenly');
        if (!columns) return false;
        nav.markAs(columns.querySelector(':scope > #ContextSettings'), 'context');
        nav.markAs(columns.querySelector(':scope > #InstructSettingsColumn'), 'instruct');
        for (const child of columns.querySelector(':scope > #SystemPromptColumn')?.children ?? []) {
            if (child.matches('#SystemPromptBlock') || (child.matches('h4') && child.nextElementSibling?.id === 'SystemPromptBlock')) nav.markAs(child, 'sysprompt');
            else if (child.querySelector('#custom_stopping_strings')) nav.markAs(child, 'stopping');
            else if (child.querySelector('#tokenizer')) nav.markAs(child, 'tokenizer');
            else if (child.querySelector('#reasoning_auto_parse, #reasoning_select')) nav.markAs(child, 'reasoning');
            else nav.markAs(child, 'misc');
        }
        // A newer SillyTavern's extra column goes to Miscellaneous, so nothing gets lost.
        for (const child of columns.children) if (!child.querySelector('[data-pt-sec]')) nav.markAs(child, 'misc');
        return nav.has('context') && nav.has('reasoning');
    },
    place: (nav, block, list) => {
        list.append(nav.sectionList());
        // After the title row (Master Import / Export) and the Chat Completion notice.
        block.querySelector(':scope > .flex-container.spaceEvenly')?.before(list);
    },
});

/**
 * Extensions: SillyTavern shows each extension's settings as a fold-out card. They become a
 * list like Settings, and an extension opens as its own page (Kahvana's feedback): the other
 * extensions and the page's own controls step aside while one is open. Opening and closing
 * still go through SillyTavern's own fold-out, so its state stays right.
 */
export const extnav = {
    pageId: 'extensions-settings-button',
    pageTitle: 'Extensions',
    rootClass: 'pt-extnav',
    /** The open extension's fold-out (`.inline-drawer`), or null on the list. */
    drawer: null,
    rows: [],
    block: () => document.getElementById('rm_extensions_block'),
    lists: () => ['extensions_settings', 'extensions_settings2'].map(id => document.getElementById(id)).filter(Boolean),
    headerOf: drawer => drawer.querySelector(':scope > .inline-drawer-header, :scope > .inline-drawer-toggle'),
    shown(drawer) {
        const content = drawer.querySelector(':scope > .inline-drawer-content');
        return !!content && content.style.display !== 'none' && getComputedStyle(content).display !== 'none';
    },
    titleOf(drawer) {
        const header = this.headerOf(drawer);
        const name = header?.querySelector('b, strong')?.textContent ?? (header ? ownText(header) : '');
        return name.replace(/\s+/g, ' ').trim();
    },
    current() {
        if (!this.drawer) return null;
        // An extension's own name: shown as it is, never looked up for a translation.
        return { title: this.titleOf(this.drawer) || t('Extensions'), icon: 'puzzle', raw: true };
    },
    isOpen() {
        return !!this.drawer && currentPageId() === this.pageId;
    },
    enter(drawer) {
        this.leave({ fold: true, render: false });
        this.drawer = drawer;
        drawer.classList.add('pt-ext-open');
        // Each box between the fold-out and the list, so CSS can hide everything beside it.
        for (let node = drawer.parentElement; node && !node.classList.contains('extensions_block'); node = node.parentElement) {
            node.classList.add('pt-ext-path');
        }
        const block = this.block();
        if (block) {
            block.dataset.ptView = 'ext';
            block.scrollTop = 0;
        }
        deps.shell()?.render(currentPageId());
        scheduleHistorySync();
    },
    leave({ fold = true, render = true } = {}) {
        const drawer = this.drawer;
        if (!drawer) return false;
        this.drawer = null;
        drawer.classList.remove('pt-ext-open');
        document.querySelectorAll('.pt-ext-path').forEach(node => node.classList.remove('pt-ext-path'));
        const block = this.block();
        if (block) block.dataset.ptView = 'home';
        if (fold && this.shown(drawer)) this.headerOf(drawer)?.click();
        if (render) {
            deps.shell()?.render(currentPageId());
            scheduleHistorySync();
        }
        return true;
    },
    /** Back from an extension to the list. */
    close() {
        return this.isOpen() && this.leave();
    },
    /** Leaving the page folds the extension, so the page opens on the list next time. */
    reset() {
        this.leave({ render: false });
    },
    /** A click on an extension's name: follow SillyTavern's fold-out once it has opened or closed. */
    onClick(event) {
        if (!deps.active() || !deps.settings().touchSizing || !this.rows.length) return;
        const drawer = event.target.closest?.('.inline-drawer-toggle')?.closest('.inline-drawer');
        if (!drawer || !this.rows.includes(drawer)) return;
        const wasOpen = this.shown(drawer);
        setTimeout(() => {
            if (!wasOpen && this.shown(drawer)) this.enter(drawer);
            else if (wasOpen && drawer === this.drawer) this.leave({ fold: false });
        }, 0);
    },
    teardown() {
        this.leave({ fold: false, render: false });
        for (const node of document.querySelectorAll('.pt-ext-row, .pt-ext-list')) node.classList.remove('pt-ext-row', 'pt-ext-list');
        this.rows = [];
        const block = this.block();
        if (block) delete block.dataset.ptView;
        document.documentElement.classList.remove(this.rootClass);
    },
    sync() {
        const block = this.block();
        if (!deps.active() || !deps.settings().touchSizing || !block) {
            if (this.rows.length || this.drawer) this.teardown();
            return;
        }
        // Extensions add their settings as they load, so mark the rows again each time the page opens.
        this.rows = [];
        for (const list of this.lists()) {
            // An extension's fold-outs: the outermost ones in the list (not the ones inside its settings).
            const rows = [...list.querySelectorAll('.inline-drawer')].filter(drawer => !drawer.parentElement.closest('.inline-drawer'));
            for (const drawer of rows) drawer.classList.add('pt-ext-row');
            list.classList.toggle('pt-ext-list', rows.length > 0);
            this.rows.push(...rows);
        }
        if (!this.rows.length) {
            this.teardown();
            return;
        }
        // Only a click opens a page: a fold-out still sliding shut after Back looks open here.
        if (this.drawer && !this.rows.includes(this.drawer)) this.leave({ fold: false, render: false });
        if (!this.drawer) block.dataset.ptView = 'home';
        document.documentElement.classList.add(this.rootClass);
    },
};

export const PAGE_SECTIONS = [setnav, afnav, extnav];

export function pageSections(pageId = currentPageId()) {
    return PAGE_SECTIONS.find(nav => nav.pageId === pageId) ?? null;
}

export function pageSectionOpen() {
    return !!pageSections()?.isOpen();
}

/** Back from a section to its page's list of sections; false when no section is open. */
export function closePageSection() {
    return !!pageSections()?.close();
}

export function syncPageSections() {
    for (const nav of PAGE_SECTIONS) nav.sync();
}

// -- settings: descriptions

/**
 * SillyTavern explains most settings in tooltips, which a phone never shows.
 * Show each one as a line under its setting, and lay toggles out as rows:
 * the label on the left, the switch on the right.
 */
export function describeSettings(root) {
    if (!deps.active() || !deps.settings().touchSizing || !root) return;
    const plain = text => String(text ?? '').replace(/\s+/g, ' ').trim();
    const useful = (tip, label) => {
        const a = plain(tip).toLowerCase();
        const b = plain(label).toLowerCase().replace(/[:：]$/, '');
        return a.length >= 6 && a !== b && !b.includes(a);
    };
    const help = text => h('small', { class: 'pt-help pt-skip', 'data-pt': '1', text: plain(text) });
    const skip = '.template_element, #pt-sheet, .world_entry, .inline-drawer-header';
    for (const label of root.querySelectorAll('label.checkbox_label')) {
        if (label.dataset.ptRow || label.closest(skip)) continue;
        if (!label.querySelector(':scope > input[type="checkbox"]') || label.querySelectorAll('input, select, textarea').length !== 1) continue;
        // Icon-only toggles (Formatting's "Bind to context" and the like) keep their look.
        if (!plain(label.textContent)) continue;
        label.dataset.ptRow = '1';
        label.classList.add('pt-setrow');
        if (label.classList.contains('pt-check')) continue;
        const icon = label.querySelector('.fa-circle-info[title]');
        const tip = label.getAttribute('title') || icon?.getAttribute('title') || '';
        if (!useful(tip, label.textContent)) continue;
        label.append(help(tip));
        icon?.classList.add('pt-tip-shown');
    }
    // "Avatars: [Circle]" and similar rows on the Settings page.
    for (const select of root.querySelectorAll('#user-settings-block-content .flex-container > select, #UI-language-block > select')) {
        const row = select.parentElement;
        if (row.dataset.ptRow || !row.querySelector(':scope > span, :scope > label')) continue;
        row.dataset.ptRow = '1';
        row.classList.add('pt-selrow');
        const tip = row.getAttribute('title') || '';
        if (useful(tip, row.querySelector(':scope > span, :scope > label')?.textContent)) row.append(help(tip));
    }
    // Sliders and other settings keep their explanation in an ⓘ icon.
    for (const icon of root.querySelectorAll('.fa-circle-info[title]')) {
        if (icon.classList.contains('pt-tip-shown') || icon.closest(`${skip}, label.checkbox_label, .pt-set-home`)) continue;
        const holder = icon.parentElement;
        if (!holder || holder === root) continue;
        const tip = icon.getAttribute('title');
        if (!useful(tip, holder.textContent)) continue;
        holder.after(help(tip));
        icon.classList.add('pt-tip-shown');
    }
}

export function removeSettingDescriptions() {
    document.querySelectorAll('.pt-help, .pt-ext-note').forEach(node => node.remove());
    document.querySelectorAll('[data-pt-row]').forEach(node => {
        delete node.dataset.ptRow;
        node.classList.remove('pt-setrow', 'pt-selrow');
    });
    document.querySelectorAll('.pt-tip-shown').forEach(node => node.classList.remove('pt-tip-shown'));
}

/** One line on what each built-in extension does, under its name on the Extensions page. */
const EXTENSION_NOTES = {
    assets_container: 'More extensions, themes and sample characters',
    expressions_container: "Shows the character's emotion pictures",
    sd_container: 'Makes pictures with an image AI',
    tts_container: 'Reads replies aloud',
    qr_container: 'Buttons that send saved messages or commands',
    translation_container: 'Translates messages with an online translator',
    caption_container: 'Describes pictures you send',
    summarize_container: 'Keeps a running summary of long chats',
    regex_container: 'Find-and-replace rules for messages and prompts',
    vectors_container: 'Lets the AI recall older messages and files',
    pt_settings: 'The phone layout you are using now',
};

/** The same notes where they differ on the desktop layout. */
const EXTENSION_NOTES_WIDE = {
    pt_settings: 'The desktop layout you are using now',
};

export function describeExtensions() {
    if (!deps.active() || !deps.settings().touchSizing) return;
    for (const [id, note] of Object.entries({ ...EXTENSION_NOTES, ...(isWide() ? EXTENSION_NOTES_WIDE : {}) })) {
        const header = document.querySelector(`#${id} .inline-drawer-header`);
        if (!header || header.querySelector('.pt-ext-note')) continue;
        header.append(h('small', { class: 'pt-ext-note pt-skip', 'data-pt': '1', text: note }));
    }
}

// -- install as an app

export const install = { prompt: null, originalManifest: undefined };

export function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
}

/** Points Chrome at a manifest with a proper home-screen icon while Pocket Tavern is on. */
export function syncManifest() {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    if (install.originalManifest === undefined) install.originalManifest = link.getAttribute('href');
    const ours = new URL('app.webmanifest', deps.EXTENSION_ROOT()).href;
    const want = deps.active() ? ours : install.originalManifest;
    if (want === null) link.removeAttribute('href');
    else if (link.getAttribute('href') !== want) link.setAttribute('href', want);
    document.documentElement.classList.toggle('pt-standalone', deps.active() && isStandalone());
}

export async function installApp() {
    if (install.prompt) {
        const event = install.prompt;
        install.prompt = null;
        event.prompt();
        await event.userChoice.catch(() => null);
        return;
    }
    showSheet(new MenuSheet({
        title: t('Install as an app'),
        subtitle: t('Open SillyTavern from your home screen, full screen, without the browser bar.'),
        // Each device installs a site its own way: Safari on iPhone and iPad, Chrome on Android, a computer's browser.
        fill: body => body.append(h('div', { class: 'pt-steps' }, IS_IOS ? [
            h('p', { text: t('1. Tap Safari\'s Share button (the square with an arrow).') }),
            h('p', { text: t('2. Tap "Add to Home Screen".') }),
            h('p', { text: t('3. Tap Add. SillyTavern now has its own icon.') }),
        ] : isWide() ? [
            h('p', { text: t('1. In Chrome or Edge, click the install icon at the right of the address bar, or open the browser menu.') }),
            h('p', { text: t('2. Choose "Install" or "Install page as app".') }),
            h('p', { class: 'pt-menu-foot', text: t('Firefox cannot install sites as apps; open SillyTavern in Chrome or Edge for this.') }),
        ] : [
            h('p', { text: t('1. Tap Chrome\'s ⋮ menu (top right).') }),
            h('p', { text: t('2. Tap "Add to Home screen" or "Install app".') }),
            h('p', { text: t('3. Tap Install. SillyTavern now has its own icon.') }),
            h('p', { class: 'pt-menu-foot', text: t('Keep Termux running in the background as usual; the app opens the same SillyTavern.') }),
        ])),
    }));
}

// -- what's new

function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff) return diff;
    }
    return 0;
}

export function openWhatsNew(since) {
    const entries = CHANGES.filter(entry => !since || compareVersions(entry.version, since) > 0);
    showSheet(new MenuSheet({
        title: t("What's new"),
        subtitle: t('Pocket Tavern {version}', { version: VERSION }),
        fill: body => {
            for (const entry of (entries.length ? entries : CHANGES.slice(0, 1))) {
                body.append(h('p', { class: 'pt-menu-heading', text: entry.version }));
                body.append(h('ul', { class: 'pt-news' }, entry.items.map(item => h('li', { text: t(item) }))));
            }
        },
    }));
}

/**
 * Automatic used to mean phones only. The first time Pocket Tavern turns on by
 * itself on a computer or tablet, say so once and offer the way back.
 */
export function maybeShowDesktopNotice() {
    if (!deps.active() || deps.settings().desktopNoticeSeen || readMode() !== 'auto' || detectPhone()) return false;
    deps.settings().desktopNoticeSeen = true;
    deps.settings().lastSeenVersion = VERSION;
    saveSettings();
    setTimeout(() => {
        if (!deps.active() || deps.sheet()) return;
        showSheet(new MenuSheet({
        title: 'Pocket Tavern is on here too',
        subtitle: 'It now switches on by itself on computers and tablets. Wide screens get the desktop layout.',
        fill: body => {
            body.append(h('div', { class: 'pt-menu-list' }, [
                h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => closeSheet(),
                }, [ui('check', 'pt-menu-row-icon'), h('span', { text: 'Keep it on' })]),
                h('button', {
                    type: 'button',
                    class: 'pt-menu-row',
                    onclick: () => {
                        writeMode('phone');
                        closeSheet(true);
                        applyState();
                        syncSettingsMode();
                    },
                }, [ui('phone', 'pt-menu-row-icon'), h('span', { text: 'Use it on phones only' })]),
            ]));
            body.append(h('p', { class: 'pt-menu-foot', text: 'You can change this any time in Extensions → Pocket Tavern.' }));
        },
    }));
    }, 1200);
    return true;
}

function syncSettingsMode() {
    const select = document.getElementById('pt_mode');
    if (select) select.value = readMode();
    updateStatusLine();
}

export function maybeShowWhatsNew() {
    if (!deps.active()) return;
    const seen = deps.settings().lastSeenVersion;
    deps.settings().lastSeenVersion = VERSION;
    saveSettings();
    // Only after an update, never on a fresh install.
    if (seen && compareVersions(VERSION, seen) > 0) {
        setTimeout(() => {
            if (deps.active() && !deps.sheet()) openWhatsNew(seen);
        }, 1200);
    }
}

// -- Settings → Update Pocket Tavern, and SillyTavern updates (both layouts)

/** Pocket Tavern's folder name, from where it was loaded (scripts/extensions/third-party/<folder>/). */
function extensionFolder() {
    const match = decodeURIComponent(deps.EXTENSION_ROOT().pathname).match(/\/third-party\/([^/]+)\//);
    return match ? match[1] : 'SillyTavern-PocketTavern';
}

/** Asks SillyTavern's own extension endpoint; installed for one user or for everyone. */
async function extensionRequest(endpoint, global) {
    return fetch(`/api/extensions/${endpoint}`, {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ extensionName: extensionFolder(), global }),
    });
}

/**
 * The same update as Extensions → Manage extensions → update, in one tap: SillyTavern's
 * server pulls the new version, then the page reloads (once nothing is in progress).
 */
export async function updatePocketTavern(button) {
    if (button.disabled) return;
    const note = button.querySelector('.pt-menu-row-note, .pt-list-row-value');
    const before = note?.textContent ?? '';
    button.disabled = true;
    if (note) note.textContent = t('Checking…');
    buzz(6);
    try {
        let global = false;
        let response = await extensionRequest('version', global);
        if (response.status === 404) {
            global = true;
            response = await extensionRequest('version', global);
        }
        if (!response.ok) throw new Error((await response.text()) || response.statusText);
        const info = await response.json();
        if (info.isUpToDate) {
            globalThis.toastr?.success(t('You have the newest version ({version}).', { version: VERSION }), t('Pocket Tavern is up to date'));
            return;
        }
        if (note) note.textContent = t('Updating…');
        response = await extensionRequest('update', global);
        if (!response.ok) throw new Error((await response.text()) || response.statusText);
        const result = await response.json();
        if (result.isUpToDate) {
            globalThis.toastr?.success(t('You have the newest version ({version}).', { version: VERSION }), t('Pocket Tavern is up to date'));
            return;
        }
        closeSheet(true);
        globalThis.toastr?.success(t('The page reloads by itself when nothing is in progress.'), t('Pocket Tavern was updated'), { timeOut: 6000 });
        deps.updateReload().pending = true;
        window.clearTimeout(deps.updateReload().timer);
        deps.updateReload().timer = window.setTimeout(() => reloadWhenIdle(true), 1500);
    } catch (error) {
        console.warn(deps.LOG(), 'Update failed', error);
        globalThis.toastr?.error(String(error?.message ?? error).slice(0, 200), t('Could not update Pocket Tavern'));
    } finally {
        button.disabled = false;
        if (note && button.isConnected && note.textContent !== before) note.textContent = before;
    }
}

/**
 * SillyTavern cannot update itself from the page: it has to be stopped and started
 * again where it runs. This checks for a newer version (only when opened) and shows
 * the quickest way for each kind of device.
 */
export async function openSillyTavernUpdates() {
    const state = { local: null, latest: null, failed: false };
    const commandRow = (label, command) => h('div', { class: 'pt-command' }, [
        h('code', { text: command }),
        h('button', {
            type: 'button',
            class: 'pt-command-copy',
            'aria-label': t('Copy {label}', { label }),
            title: t('Copy'),
            onclick: async () => {
                const done = await copyText(command);
                if (done) globalThis.toastr?.success(t('Copied. Paste it where SillyTavern runs.'), '', { timeOut: 2500 });
            },
        }, [ui('copy')]),
    ]);
    const updateSheet = new MenuSheet({
        title: t('SillyTavern updates'),
        subtitle: t('Check for a new version and see how to update'),
        fill: body => {
            let status = t('Checking for a new version…');
            if (state.failed) status = t('Could not check for a new version. Are you online?');
            else if (state.local && state.latest) {
                status = compareVersions(state.latest, state.local) > 0
                    ? t('SillyTavern {latest} is out. You have {local}.', { latest: state.latest, local: state.local })
                    : t('You have the newest SillyTavern ({local}).', { local: state.local });
            }
            body.append(
                h('p', { class: 'pt-update-status', text: status }),
                h('p', { class: 'pt-menu-heading', text: t('On Android (Termux)') }),
                h('p', { class: 'pt-menu-foot', text: t('Tap the "Update SillyTavern" shortcut on your home screen (from the one-tap start setup), or run this in Termux:') }),
                commandRow('Termux', 'cd ~/SillyTavern && git pull && npm install'),
                h('p', { class: 'pt-menu-heading', text: t('On Windows') }),
                h('p', { class: 'pt-menu-foot', text: t('Close SillyTavern, then double-click UpdateAndStart.bat in its folder (or use Update in SillyTavern Launcher).') }),
                h('p', { class: 'pt-menu-heading', text: t('On macOS or Linux') }),
                h('p', { class: 'pt-menu-foot', text: t('Close SillyTavern, then run this in its folder and start it again:') }),
                commandRow('macOS or Linux', 'git pull && npm install'),
                h('p', { class: 'pt-menu-foot', text: t('Using SillyTavern from an iPhone or iPad? Update it on the computer or phone it runs on.') }),
            );
        },
    });
    showSheet(updateSheet);
    try {
        const [local, latest] = await Promise.all([
            fetch('/version').then(response => response.json()),
            // Only asked when this sheet opens: GitHub's list of SillyTavern releases.
            fetch('https://api.github.com/repos/SillyTavern/SillyTavern/releases/latest', { headers: { Accept: 'application/vnd.github+json' } }).then(response => response.json()),
        ]);
        state.local = String(local.pkgVersion ?? '').trim() || null;
        state.latest = String(latest.tag_name ?? '').replace(/^v/i, '').trim() || null;
        if (!state.local || !state.latest) state.failed = true;
    } catch {
        state.failed = true;
    }
    if (deps.sheet() === updateSheet) updateSheet.refresh();
}

// ------------------------------------------------------------- settings UI

/** One line: is Pocket Tavern on here, and with which layout (translated). */
export function statusText() {
    const mode = readMode();
    if (!deps.settings().enabled) return t('Pocket Tavern is off.');
    if (mode === 'never') return t('Off on this device (set to "Off on this device").');
    if (mode === 'phone' && !detectPhone()) return t('Off on this device (phones only — your screen is {width}px wide).', { width: window.innerWidth });
    return document.documentElement.classList.contains('pt-desktop') ? t('Active on this device (desktop layout).') : t('Active on this device (phone layout).');
}

export function updateStatusLine() {
    const line = document.getElementById('pt_status');
    if (!line) return;
    line.textContent = statusText();
    line.classList.toggle('pt-status-active', deps.active());
}

/** Saves and applies one behaviour switch (Settings → Pocket Tavern, or the Extensions panel). */
export function setSwitch(item, on) {
    if (!item.core) {
        setAppearance(item.key, on);
        return;
    }
    deps.settings()[item.key] = on;
    saveSettings();
    applyState();
    syncSettingsInputs();
}

export function buildSettings() {
    if (document.getElementById('pt_settings')) return;
    const container = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!container) return;

    const check = (id, label, hint) => h('label', { class: 'checkbox_label pt-check', for: id }, [
        h('input', { type: 'checkbox', id }),
        h('span', { class: 'pt-check-text' }, [
            h('span', { class: 'pt-check-label', text: label }),
            hint ? h('small', { class: 'pt-check-hint', text: hint }) : null,
        ]),
    ]);

    const modeSelect = h('select', { id: 'pt_mode', class: 'text_pole' }, [
        h('option', { value: 'auto', text: 'Automatic: phones and computers' }),
        h('option', { value: 'phone', text: 'Phones only' }),
        h('option', { value: 'never', text: 'Off on this device' }),
    ]);

    const panel = h('div', { id: 'pt_settings', class: 'pt-settings extension_container' }, [
        h('div', { class: 'inline-drawer' }, [
            h('div', { class: 'inline-drawer-toggle inline-drawer-header' }, [
                h('b', { text: 'Pocket Tavern' }),
                h('div', { class: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }),
            ]),
            h('div', { class: 'inline-drawer-content' }, [
                check('pt_enabled', 'Enable Pocket Tavern', 'Off brings back the original interface.'),
                h('p', { id: 'pt_status', class: 'pt-status-line' }),
                h('label', { class: 'pt-field', for: 'pt_mode' }, [
                    h('span', { class: 'pt-field-label', text: 'Use it on this device' }),
                    modeSelect,
                ]),
                h('small', { class: 'pt-note', text: 'Phones get the phone layout and wide screens the desktop layout, on their own. Pick "Phones only" to keep the original interface on this computer.' }),
                h('hr'),
                h('label', { class: 'pt-field', for: 'pt_theme' }, [
                    h('span', { class: 'pt-field-label', text: 'Theme' }),
                    h('select', { id: 'pt_theme', class: 'text_pole' }, [
                        h('option', { value: 'st', text: 'Your SillyTavern theme' }),
                        ...THEMES.map(theme => h('option', { value: theme.id, text: `${theme.name}: ${theme.note}` })),
                    ]),
                ]),
                h('label', { class: 'pt-field', for: 'pt_motion' }, [
                    h('span', { class: 'pt-field-label', text: 'Animations' }),
                    h('select', { id: 'pt_motion', class: 'text_pole' }, Object.entries(deps.MOTION_LABELS()).map(([value, text]) => h('option', { value, text }))),
                ]),
                check('pt_backdrop', 'Theme background', "Use the theme's backdrop instead of your chat background."),
                check('pt_font', 'Modern font', resolveLayout(deps.settings().layout) === 'desktop' ? "Your computer's own system font." : "Your phone's own system font."),
                check('pt_icons', 'New icons', 'Rounded line icons everywhere.'),
                h('label', { class: 'pt-field', for: 'pt_size' }, [
                    h('span', { class: 'pt-field-label', text: 'Size' }),
                    h('select', { id: 'pt_size', class: 'text_pole' }, Object.entries(SIZES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('label', { class: 'pt-field', for: 'pt_layout' }, [
                    h('span', { class: 'pt-field-label', text: 'Layout' }),
                    h('select', { id: 'pt_layout', class: 'text_pole' }, Object.entries(LAYOUT_NAMES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('label', { class: 'pt-field', for: 'pt_composer' }, [
                    h('span', { class: 'pt-field-label', text: 'Message box' }),
                    h('select', { id: 'pt_composer', class: 'text_pole' }, Object.entries(COMPOSER_STYLES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('label', { class: 'pt-field', for: 'pt_textsize' }, [
                    h('span', { class: 'pt-field-label', text: 'Chat text size' }),
                    h('select', { id: 'pt_textsize', class: 'text_pole' }, Object.entries(TEXT_SIZES).map(([value, text]) => h('option', { value, text }))),
                ]),
                h('hr'),
                ...SWITCHES.map(item => check(item.id, item.label, item.hint)),
                h('small', { class: 'pt-note', text: 'Changes apply right away. Nothing here changes your characters, chats or lorebooks.' }),
            ]),
        ]),
    ]);
    container.append(panel);

    const bind = (id, key, appearance = false) => {
        const input = document.getElementById(id);
        input.checked = !!deps.settings()[key];
        input.addEventListener('change', () => {
            if (appearance) {
                setAppearance(key, input.checked);
                return;
            }
            deps.settings()[key] = input.checked;
            saveSettings();
            applyState();
        });
    };
    bind('pt_enabled', 'enabled');
    bind('pt_backdrop', 'themeBackdrop', true);
    bind('pt_font', 'modernFont', true);
    bind('pt_icons', 'customIcons', true);
    for (const item of SWITCHES) {
        const input = document.getElementById(item.id);
        input.checked = !!deps.settings()[item.key];
        input.addEventListener('change', () => setSwitch(item, input.checked));
    }
    for (const [id, key] of [['pt_theme', 'theme'], ['pt_motion', 'motion'], ['pt_textsize', 'textSize'], ['pt_size', 'uiSize'], ['pt_composer', 'composerStyle'], ['pt_layout', 'layout']]) {
        const select = document.getElementById(id);
        if (id === 'pt_theme') syncSettingsThemeOption(select);
        else select.value = deps.settings()[key];
        select.addEventListener('change', () => setAppearance(key, select.value));
    }

    modeSelect.value = readMode();
    modeSelect.addEventListener('change', () => {
        writeMode(modeSelect.value);
        applyState();
    });
    updateStatusLine();
}

function syncSettingsThemeOption(select) {
    if (!select) return;
    select.querySelector('option[data-pt-st]')?.remove();
    const id = deps.settings().theme;
    if (typeof id === 'string' && id.startsWith('st:')) {
        select.append(h('option', { value: id, 'data-pt-st': '1', raw: `${id.slice(3)} (${t('From SillyTavern')})` }));
    }
    select.value = id;
}

/** Keeps the Extensions-panel controls in step when settings change from a sheet. */
export function syncSettingsInputs() {
    const pairs = { pt_backdrop: 'themeBackdrop', pt_font: 'modernFont', pt_icons: 'customIcons' };
    for (const item of SWITCHES) pairs[item.id] = item.key;
    for (const [id, key] of Object.entries(pairs)) {
        const input = document.getElementById(id);
        if (input) input.checked = !!deps.settings()[key];
    }
    syncSettingsThemeOption(document.getElementById('pt_theme'));
    for (const [id, key] of [['pt_motion', 'motion'], ['pt_textsize', 'textSize'], ['pt_size', 'uiSize'], ['pt_composer', 'composerStyle'], ['pt_layout', 'layout']]) {
        const select = document.getElementById(id);
        if (select) select.value = deps.settings()[key];
    }
}
