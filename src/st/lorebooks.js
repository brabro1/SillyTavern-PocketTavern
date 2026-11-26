// Lorebooks while Pocket Tavern is on (DESIGN.md → Key screens → Lorebooks): the lorebook picker and its sheet
// (also used for long dropdowns), the Lorebooks shortcut under +, what the Lorebooks page (src/views/lorebooks.js)
// reads and opens, the World Info page as a lorebook's page or as Activation settings, and entry cards with
// keyword chips. SillyTavern's nodes are marked, restyled (styles/st/lorebooks.css) and pressed, never moved.
// Moved here whole from the legacy app (M5); its listeners are still registered by the legacy app, so errors in
// them are caught by the lifecycle's page-wide net (src/core/lifecycle.js) like the rest of the legacy code.
import { t } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { overlayHead, wireOverlay } from '../shell/overlay.js';
import { refreshOwnPage } from '../shell/page.js';
import { LOREBOOK_PAGE } from '../views/lorebooks.js';

/**
 * What the legacy app hands over (set once by setupLorebookScreens()).
 * @type {Record<string, any> | null}
 */
let deps = null;

export function setupLorebookScreens(supplied) {
    deps = supplied;
}

const $j = (...args) => deps.$j(...args);
const closeSheet = (...args) => deps.closeSheet(...args);
const ctx = (...args) => deps.ctx(...args);
const currentPageId = (...args) => deps.currentPageId(...args);
const highlight = (...args) => deps.highlight(...args);
const icon = (...args) => deps.icon(...args);
const normalizeText = (...args) => deps.normalizeText(...args);
const openPage = (...args) => deps.openPage(...args);
const scheduleHistorySync = (...args) => deps.scheduleHistorySync(...args);
const showSheet = (...args) => deps.showSheet(...args);
const syncEditorState = (...args) => deps.syncEditorState(...args);
const wireOnce = (...args) => deps.wireOnce(...args);

/** Selects that get the lorebook picker. `kind` mirrors the underlying control. */
const LOREBOOK_TARGETS = [
    {
        selector: '#world_info',
        kind: 'multi',
        title: 'Active lorebooks',
        subtitle: 'Global: applies to every chat',
        emptyLabel: 'No lorebooks active',
        buttonLabel: 'Choose lorebooks',
        editable: true,
        badges: true,
    },
    {
        selector: '.character_world_info_selector',
        kind: 'single',
        title: 'Primary lorebook',
        subtitle: 'Linked to this character and exported with the card',
        noneLabel: 'None',
        context: 'character',
        clearable: true,
    },
    {
        selector: '.character_extra_world_info_selector',
        kind: 'multi',
        title: 'Additional lorebooks',
        subtitle: 'Linked to this character, not exported with the card',
        emptyLabel: 'No additional lorebooks',
        buttonLabel: 'Choose lorebooks',
        context: 'character',
    },
    {
        selector: '.chat_world_info_selector',
        kind: 'single',
        title: 'Chat lorebook',
        subtitle: 'Bound to this chat only',
        noneLabel: 'None',
        clearable: true,
    },
    {
        selector: '.persona_world_info_selector',
        kind: 'single',
        title: 'Persona lorebook',
        subtitle: 'Linked to your active persona',
        noneLabel: 'None',
        clearable: true,
    },
    {
        selector: '#world_editor_select',
        kind: 'single',
        title: 'Open lorebook',
        subtitle: 'Pick a lorebook to view and edit',
        noneLabel: 'Close editor',
        placeholder: 'Pick a lorebook to edit',
    },
];

const LONG_SELECT_MIN_OPTIONS = 14;
const LONG_SELECT_EXCLUDE = '.pt-native-hidden, .template_element select, #pt-sheet select, .select2-hidden-accessible, select[multiple]';

/** @type {Map<HTMLSelectElement, Picker>} */
const pickers = new Map();
let scanTimer = 0;
let domObserver = null;
// ------------------------------------------------------------ picker model

/**
 * @typedef {{ index: number, value: string, text: string, selected: boolean, isNone: boolean }} Item
 */

class Picker {
    /**
     * @param {HTMLSelectElement} select
     * @param {typeof LOREBOOK_TARGETS[number]} config
     */
    constructor(select, config) {
        this.select = select;
        this.config = config;
        this.multi = config.kind === 'multi';
        this.isLong = config.selector === '*';
        this.root = null;
        this.optionObserver = null;
        this.onChange = () => this.render();
        this.build();
    }

    build() {
        const { select } = this;
        this.root = h('div', { class: `pt-picker ${this.multi ? 'pt-picker-multi' : 'pt-picker-single'}`, 'data-pt': '1' });
        const anchor = select.nextElementSibling?.classList.contains('select2') ? select.nextElementSibling : select;
        anchor.after(this.root);
        select.classList.add('pt-native-hidden');
        $j()(select).on('change.pt', this.onChange);
        this.optionObserver = new MutationObserver(() => this.render());
        this.optionObserver.observe(select, { childList: true, subtree: true, characterData: true });
        this.render();
    }

    destroy() {
        $j()(this.select).off('change.pt', this.onChange);
        this.optionObserver?.disconnect();
        this.root?.remove();
        this.select.classList.remove('pt-native-hidden');
        if (deps.sheet()?.picker === this) closeSheet();
    }

    /** @returns {Item[]} */
    items() {
        return Array.from(this.select.options).map((option, index) => {
            const isNone = option.value === '';
            return {
                index,
                value: option.value,
                text: this.cleanText(option, isNone),
                selected: option.selected,
                isNone,
            };
        }).filter(item => !(this.multi && item.isNone));
    }

    cleanText(option, isNone) {
        const raw = (option.textContent ?? '').trim();
        if (!isNone) return raw;
        return this.config.noneLabel ?? (raw.replace(/^[-–—\s]+|[-–—\s]+$/g, '') || 'None');
    }

    get title() {
        const scope = this.select.closest('.character_world');
        const name = scope?.querySelector('.character_name')?.textContent?.trim();
        const base = t(this.config.title);
        return name && this.config.context === 'character' ? `${base} · ${name}` : base;
    }

    selectedItems() {
        return this.items().filter(item => item.selected && !item.isNone);
    }

    realBookCount() {
        return this.items().filter(item => !item.isNone).length;
    }

    /** Applies a selection through the original control. */
    commit(index, selected) {
        const option = this.select.options[index];
        if (!option) return;
        if (this.multi) {
            option.selected = selected;
        } else {
            this.select.selectedIndex = index;
        }
        this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    clearAll() {
        let changed = false;
        for (const option of this.select.options) {
            if (option.selected) {
                option.selected = false;
                changed = true;
            }
        }
        if (changed) this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    render() {
        if (!this.root) return;
        const root = this.root;
        root.replaceChildren();
        const items = this.items();
        const selected = items.filter(item => item.selected && !item.isNone);
        const total = items.filter(item => !item.isNone).length;

        if (this.multi) {
            root.append(this.renderChips(selected));
            const open = h('button', {
                type: 'button',
                class: 'pt-open menu_button',
                onclick: () => openSheet(this),
            }, [
                icon('fa-book-atlas'),
                h('span', { class: 'pt-open-label', text: this.config.buttonLabel ?? 'Choose' }),
                h('span', { class: 'pt-count', text: total ? `${selected.length}/${total}` : '0' }),
            ]);
            root.append(open);
        } else {
            const current = selected[0] ?? null;
            const hasValue = !!current;
            const button = h('button', {
                type: 'button',
                class: `pt-single text_pole ${hasValue ? '' : 'pt-single-empty'}`,
                'aria-haspopup': 'dialog',
                onclick: () => openSheet(this),
            }, [
                h('span', {
                    class: 'pt-single-label',
                    ...(hasValue ? { raw: current.text } : { text: this.config.placeholder ?? this.config.noneLabel ?? 'None' }),
                }),
                icon('fa-chevron-down pt-chevron'),
            ]);
            root.append(button);
            if (hasValue && this.config.clearable && items.some(item => item.isNone)) {
                root.append(h('button', {
                    type: 'button',
                    class: 'pt-clear menu_button',
                    'aria-label': t('Remove {name}', { name: current.text }),
                    title: 'Remove',
                    onclick: () => {
                        const none = items.find(item => item.isNone);
                        if (none) this.commit(none.index, true);
                    },
                }, [icon('fa-xmark')]));
            }
        }
        if (deps.sheet()?.picker === this) deps.sheet().refresh();
    }

    renderChips(selected) {
        const wrap = h('div', { class: 'pt-chips' });
        if (!selected.length) {
            wrap.append(h('span', { class: 'pt-chips-empty', text: this.config.emptyLabel ?? 'Nothing selected' }));
            return wrap;
        }
        const visible = selected.slice(0, 8);
        for (const item of visible) {
            wrap.append(h('span', { class: 'pt-chip' }, [
                h('span', { class: 'pt-chip-text', raw: item.text }),
                h('button', {
                    type: 'button',
                    class: 'pt-chip-x',
                    'aria-label': t('Remove {name}', { name: item.text }),
                    onclick: () => this.commit(item.index, false),
                }, [icon('fa-xmark')]),
            ]));
        }
        if (selected.length > visible.length) {
            wrap.append(h('button', {
                type: 'button',
                class: 'pt-chip pt-chip-more',
                onclick: () => openSheet(this, { filter: 'selected' }),
                text: t('+{count} more', { count: selected.length - visible.length }),
            }));
        }
        return wrap;
    }
}


class Sheet {
    /**
     * @param {Picker} picker
     * @param {{filter?: 'all'|'selected'}} [options]
     */
    constructor(picker, options = {}) {
        this.picker = picker;
        this.query = '';
        this.filter = options.filter ?? 'all';
        this.closing = false;
        this.build();
    }

    build() {
        const { picker } = this;
        this.dialog = h('dialog', { id: 'pt-sheet', class: 'pt-sheet', 'aria-label': picker.title });
        this.panel = h('div', { class: 'pt-panel', tabindex: '-1' });
        if (picker.items().length > 6) this.panel.classList.add('pt-panel-fixed');

        Object.assign(this, overlayHead({ title: picker.title, subtitle: picker.config.subtitle, onClose: () => closeSheet() }));

        this.input = h('input', {
            type: 'search',
            class: 'pt-search-input text_pole',
            placeholder: picker.config.searchLabel ?? 'Search lorebooks',
            enterkeyhint: 'search',
            autocomplete: 'off',
            autocapitalize: 'off',
            spellcheck: 'false',
            'aria-label': picker.config.searchLabel ?? 'Search lorebooks',
        });
        this.input.addEventListener('input', () => {
            this.query = this.input.value;
            this.renderList(true);
        });
        this.input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                this.input.blur();
            }
        });
        this.clearSearch = h('button', {
            type: 'button',
            class: 'pt-search-clear',
            'aria-label': 'Clear search',
            onclick: () => {
                this.input.value = '';
                this.query = '';
                this.renderList(true);
                this.input.focus();
            },
        }, [icon('fa-xmark')]);
        this.searchBox = h('div', { class: 'pt-search' }, [icon('fa-magnifying-glass pt-search-icon'), this.input, this.clearSearch]);

        this.tools = h('div', { class: 'pt-tools' });
        this.list = h('ul', { class: 'pt-list', role: 'listbox', 'aria-multiselectable': picker.multi ? 'true' : 'false' });
        this.status = h('p', { class: 'pt-status', role: 'status', 'aria-live': 'polite' });
        this.hint = h('p', { class: 'pt-hint', text: picker.multi ? 'Changes apply as you tap.' : `Tap to choose${picker.config.noun ? '' : ' a lorebook'}.` });

        this.controls = h('div', { class: 'pt-controls' }, [this.searchBox, this.tools]);
        this.panel.append(this.head, this.controls, this.list, h('div', { class: 'pt-foot' }, [this.status, this.hint]));
        this.dialog.append(this.panel);

        wireOverlay({ dialog: this.dialog, panel: this.panel, dragAreas: [this.head, this.list], onClose: () => closeSheet() });
        this.list.addEventListener('click', event => this.onListClick(event));
        this.renderTools();
        this.renderList(true);
    }

    onListClick(event) {
        const row = event.target.closest('.pt-row');
        if (!row) return;
        const index = Number(row.dataset.index);
        const { picker } = this;
        if (event.target.closest('.pt-edit')) {
            this.openInEditor(index);
            return;
        }
        const option = picker.select.options[index];
        if (!option) return;
        if (picker.multi) {
            picker.commit(index, !option.selected);
        } else {
            const already = option.selected;
            row.classList.add('pt-row-flash');
            if (!already) picker.commit(index, true);
            else this.refresh();
            setTimeout(() => closeSheet(), 160);
        }
    }

    openInEditor(index) {
        const name = this.picker.select.options[index]?.textContent?.trim();
        const editor = document.querySelector('#world_editor_select');
        if (!editor || !name) return;
        const target = Array.from(editor.options).find(option => option.textContent.trim() === name);
        if (!target) return;
        closeSheet();
        editor.value = target.value;
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        // Opened from the wand menu the drawer is closed; show it so the book is visible.
        wiPage.mode = 'book';
        openPage(LOREBOOK_PAGE);
        document.querySelector('#WorldInfo')?.scrollTo?.({ top: 0 });
    }

    renderTools(cachedItems = null) {
        const { picker } = this;
        this.tools.replaceChildren();
        if (!picker.multi) return;
        const real = (cachedItems ?? picker.items()).filter(item => !item.isNone);
        const selectedCount = real.filter(item => item.selected).length;
        const seg = (id, label, count) => h('button', {
            type: 'button',
            class: `pt-seg ${this.filter === id ? 'pt-seg-on' : ''}`,
            'aria-pressed': String(this.filter === id),
            onclick: () => {
                this.filter = id;
                this.renderTools();
                this.renderList(true);
            },
        }, [label, h('span', { class: 'pt-seg-count', raw: String(count) })]);
        this.tools.append(
            h('div', { class: 'pt-segmented', role: 'group' }, [
                seg('all', 'All', real.length),
                seg('selected', 'Selected', selectedCount),
            ]),
            h('button', {
                type: 'button',
                class: 'pt-clear-all menu_button',
                disabled: selectedCount === 0,
                onclick: () => {
                    picker.clearAll();
                },
            }, [icon('fa-eraser'), 'Clear all']),
        );
    }

    /** Re-reads the underlying control and updates rows in place. */
    refresh() {
        this.title.textContent = this.picker.title;
        const all = this.picker.items();
        this.renderTools(all);
        this.renderList(false, all);
    }

    badgesFor(item, badgeCtx) {
        if (!this.picker.config.badges || !badgeCtx) return [];
        const badges = [];
        if (badgeCtx.charBook && badgeCtx.charBook === item.text) badges.push('Character');
        if (badgeCtx.chatBook && badgeCtx.chatBook === item.text) badges.push('Chat');
        return badges;
    }

    renderList(resetScroll, cachedItems = null) {
        const { picker } = this;
        const previousScroll = this.list.scrollTop;
        const all = cachedItems ?? picker.items();
        const q = normalizeText(this.query.trim());
        let rows = all.filter(item => !q || normalizeText(item.text).includes(q));
        if (picker.multi && this.filter === 'selected') rows = rows.filter(item => item.selected);

        let badgeCtx = null;
        if (picker.config.badges) {
            try {
                const context = ctx();
                const character = context.characters?.[context.characterId];
                badgeCtx = {
                    chatBook: context.chatMetadata?.world_info ?? null,
                    charBook: character?.data?.extensions?.world ?? null,
                };
            } catch {
                // Badges are decorative; ignore context lookup failures.
            }
        }

        this.clearSearch.hidden = !this.query;
        this.list.replaceChildren();

        for (const item of rows) {
            const badges = this.badgesFor(item, badgeCtx);
            const mark = h('span', { class: 'pt-mark', 'aria-hidden': 'true' }, [icon(picker.multi ? 'fa-check' : 'fa-circle')]);
            const name = h('span', { class: `pt-name ${item.isNone ? 'pt-name-none' : ''}` }, item.isNone ? [document.createTextNode(t(item.text))] : highlight(item.text, this.query));
            const main = h('span', { class: 'pt-main' }, [
                name,
                badges.length ? h('span', { class: 'pt-badges' }, badges.map(text => h('span', { class: 'pt-badge', text }))) : null,
            ]);
            const rowButton = h('button', {
                type: 'button',
                class: 'pt-row-btn',
                role: 'option',
                'aria-selected': String(item.selected),
            }, [mark, main]);
            const li = h('li', {
                role: 'presentation',
                class: `pt-row ${item.selected ? 'pt-row-on' : ''} ${item.isNone ? 'pt-row-none' : ''}`,
                'data-index': String(item.index),
            }, [rowButton]);
            if (picker.config.editable && !item.isNone) {
                li.append(h('button', {
                    type: 'button',
                    class: 'pt-edit',
                    title: 'Open in lorebook editor',
                    'aria-label': t('Open {name} in the lorebook editor', { name: item.text }),
                }, [icon('fa-pen-to-square')]));
            }
            this.list.append(li);
        }

        const realItems = all.filter(item => !item.isNone);
        const selectedItems = realItems.filter(item => item.selected);
        const realRows = rows.filter(item => !item.isNone).length;
        if (!realRows) {
            const total = realItems.length;
            let message = 'Nothing matches your search.';
            if (!total) message = picker.config.noun ? 'No options available.' : 'No lorebooks found yet. Create one from the Lorebooks page.';
            else if (!q && this.filter === 'selected') message = 'Nothing selected yet.';
            this.list.append(h('li', { class: 'pt-empty', text: message }));
        }

        const total = realItems.length;
        const selectedCount = selectedItems.length;
        const chosen = selectedItems[0];
        this.status.textContent = picker.multi
            ? t('{count} of {total} selected', { count: selectedCount, total })
            : (chosen ? t('Selected: {name}', { name: chosen.text }) : t('Nothing selected'));

        if (resetScroll) this.list.scrollTop = 0;
        else this.list.scrollTop = previousScroll;
        const firstSelected = this.list.querySelector('.pt-row-on:not(.pt-row-none)');
        if (resetScroll && !q && firstSelected && !picker.multi) {
            requestAnimationFrame(() => firstSelected.scrollIntoView({ block: 'center' }));
        }
    }
}

/** A sheet with arbitrary content: the "More" menu. */
function openSheet(picker, options = {}) {
    showSheet(new Sheet(picker, options));
}

// -------------------------------------------------- long single selects

/**
 * Optional: any big single-choice dropdown (presets, themes, models…) gets the
 * same searchable sheet. Off by default because the native Android list is fine
 * for short menus and some extensions manage their own selects.
 */
function labelForSelect(select) {
    const clean = text => (text ?? '').replace(/\s+/g, ' ').trim();
    const explicit = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
    const direct = clean(select.getAttribute('aria-label')) || clean(explicit?.textContent);
    if (direct) return direct;
    // Nearest short heading-like element right before the control, a few levels up.
    let node = select;
    for (let depth = 0; depth < 3 && node && node !== document.body; depth++, node = node.parentElement) {
        const previous = node.previousElementSibling;
        const text = clean(previous?.textContent);
        if (previous && text && text.length <= 60 && !previous.querySelector('select, input, textarea')) return text;
    }
    const fromId = (select.id || '').replace(/_?select$/, '').replace(/[_-]+/g, ' ').trim();
    return fromId ? fromId.charAt(0).toUpperCase() + fromId.slice(1) : 'Choose an option';
}

function longSelectConfig(select) {
    const label = labelForSelect(select);
    return {
        selector: '*',
        kind: 'single',
        title: label,
        subtitle: '',
        noneLabel: 'None',
        searchLabel: 'Search',
        noun: 'option',
    };
}

// ------------------------------------------------------------------ scan

function matchTarget(select) {
    if (select.closest('.template_element, #character_world_template, #pt-sheet')) return null;
    for (const target of LOREBOOK_TARGETS) {
        if (select.matches(target.selector)) return target;
    }
    return null;
}

export function scan() {
    scanTimer = 0;
    for (const [select, picker] of pickers) {
        const wanted = picker.isLong ? deps.settings().longSelects : deps.settings().lorebookPicker;
        if (!select.isConnected || !deps.active() || !wanted) {
            picker.destroy();
            pickers.delete(select);
        }
    }
    if (!deps.active()) return;

    if (deps.settings().lorebookPicker) {
        const selector = LOREBOOK_TARGETS.map(target => target.selector).join(',');
        for (const select of document.querySelectorAll(selector)) {
            if (pickers.has(select) || !(select instanceof HTMLSelectElement)) continue;
            const target = matchTarget(select);
            if (target) pickers.set(select, new Picker(select, target));
        }
    }

    if (deps.settings().longSelects) {
        for (const select of document.querySelectorAll('select:not([multiple])')) {
            if (pickers.has(select) || select.matches(LONG_SELECT_EXCLUDE)) continue;
            if (select.closest('#pt-sheet, .pt-settings') || select.options.length < LONG_SELECT_MIN_OPTIONS) continue;
            pickers.set(select, new Picker(select, longSelectConfig(select)));
        }
    }
}

function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(scan, 120);
}

export function startObserver() {
    if (domObserver) return;
    const baseSelector = LOREBOOK_TARGETS.map(target => target.selector).join(',');
    let wasEditing = !!document.getElementById('curEditTextarea');
    domObserver = new MutationObserver(records => {
        const selector = deps.settings().longSelects ? `${baseSelector},select` : baseSelector;
        let rescan = false;
        let layers = false;
        const nowEditing = !!document.getElementById('curEditTextarea');
        const editorChanged = nowEditing !== wasEditing;
        wasEditing = nowEditing;
        const chat = document.getElementById('chat');
        for (const record of records) {
            if (record.target === document.body) layers = true;
            // Inside the chat (a streaming reply changes it on every token) skip heavy subtree scans.
            const inChat = !!chat && chat.contains(record.target);
            if (inChat || rescan) continue;
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1 || node.closest?.('#chat')) continue;
                if (node.matches?.(selector) || node.querySelector?.(selector)) {
                    rescan = true;
                    break;
                }
            }
            if (!rescan && deps.settings().longSelects && record.target instanceof HTMLSelectElement && record.addedNodes.length && !pickers.has(record.target)) {
                rescan = true;
            }
            if (!rescan && record.removedNodes.length && pickers.size) {
                for (const select of pickers.keys()) {
                    if (!select.isConnected) {
                        rescan = true;
                        break;
                    }
                }
            }
        }
        if (rescan) scheduleScan();
        // SillyTavern popups are <dialog>s appended to and removed from <body>.
        if (layers) scheduleHistorySync();
        if (editorChanged) syncEditorState();
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
}

export function stopObserver() {
    domObserver?.disconnect();
    domObserver = null;
    window.clearTimeout(scanTimer);
    scanTimer = 0;
}

// ------------------------------------------------------------- wand entry

export function syncWandShortcut() {
    const existing = document.getElementById('pt_wand_container');
    const want = deps.active() && deps.settings().wandShortcut && deps.settings().lorebookPicker;
    if (!want) {
        if (existing) {
            existing.remove();
            // The wand is shown for our item; SillyTavern hides it when it has no items of its own.
            const wand = document.getElementById('extensionsMenuButton');
            if (wand && wandDisplay.saved) wand.style.display = wandDisplay.value;
            wandDisplay.saved = false;
        }
        return;
    }
    if (existing) return;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const item = h('div', {
        id: 'pt_wand_lorebooks',
        class: 'list-group-item flex-container flexGap5 interactable',
        tabindex: '0',
        role: 'button',
        title: 'Choose which lorebooks are active in all chats',
        onclick: () => {
            const select = document.querySelector('#world_info');
            const picker = select && pickers.get(select);
            // SillyTavern closes the wand menu itself when a menu item is clicked.
            if (picker) openSheet(picker);
        },
        onkeydown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.currentTarget.click();
            }
        },
    }, [h('div', { class: 'fa-solid fa-book-atlas extensionsMenuExtensionButton' }), h('span', { text: 'Lorebooks' })]);
    menu.append(h('div', { id: 'pt_wand_container', class: 'extension_container' }, [item]));
    const button = document.getElementById('extensionsMenuButton');
    if (button) {
        wandDisplay.value = button.style.display;
        wandDisplay.saved = true;
        button.style.display = '';
    }
}

const wandDisplay = { saved: false, value: '' };

/** A lorebook's page: SillyTavern's editor, showing that one lorebook (DESIGN.md → Lorebooks). */
export function openLorebook(name) {
    const select = document.getElementById('world_editor_select');
    const option = Array.from(select?.options ?? []).find(item => item.textContent.trim() === name);
    if (select && option && select.value !== option.value) {
        select.value = option.value;
        $j()(select).trigger('change');
    }
    wiPage.mode = 'book';
    openPage(LOREBOOK_PAGE);
    deps.shell()?.render(currentPageId());
}

// -- the Lorebooks place (src/views/lorebooks.js)

/** Which part of SillyTavern's World Info page shows: one lorebook's editor, or the activation settings. */
export const wiPage = { mode: 'book', observer: null, timer: 0 };

/** The lorebook SillyTavern's editor shows, or '' (user data). */
export function editedLorebook() {
    const select = document.getElementById('world_editor_select');
    return select && select.value !== '' ? (select.selectedOptions[0]?.textContent?.trim() ?? '') : '';
}

export function lorebookList() {
    const on = new Set(Array.from(document.getElementById('world_info')?.selectedOptions ?? []).map(option => option.textContent.trim()));
    return Array.from(document.getElementById('world_editor_select')?.options ?? [])
        .filter(option => option.value !== '')
        .map(option => ({ name: option.textContent.trim(), active: on.has(option.textContent.trim()) }));
}

/** html[data-pt-wi] says which part of World Info shows (styles/st/lorebooks.css); off on every other page. */
export function syncLorebookMode(pageId) {
    const root = document.documentElement;
    if (pageId !== LOREBOOK_PAGE) {
        wiPage.mode = 'book';
        delete root.dataset.ptWi;
        root.classList.remove('pt-wi-book');
        return;
    }
    root.dataset.ptWi = wiPage.mode;
    root.classList.toggle('pt-wi-book', !!editedLorebook());
}

export function openLorebookSettings() {
    wiPage.mode = 'settings';
    openPage(LOREBOOK_PAGE);
    deps.shell()?.render(currentPageId());
    // The settings are folded away in SillyTavern ("Click to expand"): unfold them.
    const fold = document.querySelector('#wiTopBlock .inline-drawer');
    const content = fold?.querySelector('.inline-drawer-content');
    if (content && getComputedStyle(content).display === 'none') fold.querySelector('.inline-drawer-toggle')?.click();
}

/** Active lorebooks: the lorebook picker, or SillyTavern's own list when the Easy lorebook picker is off. */
export function pickActiveLorebooks() {
    const picker = pickers.get(document.getElementById('world_info'));
    if (picker) openSheet(picker);
    else openLorebookSettings();
}

/**
 * Keeps the Lorebooks page and a lorebook's header in step with SillyTavern: a lorebook made, renamed or
 * deleted, or the active ones changed. Deleting the open lorebook goes back to the Lorebooks page.
 */
function onLorebooksChanged() {
    window.clearTimeout(wiPage.timer);
    wiPage.timer = window.setTimeout(() => {
        if (!deps.active()) return;
        const page = currentPageId();
        if (page === 'pt-lorebooks') refreshOwnPage();
        else if (page === LOREBOOK_PAGE) {
            if (wiPage.mode === 'book' && !editedLorebook()) openPage('pt-lorebooks');
            else deps.shell()?.render(page);
        }
    }, 120);
}

export function watchLorebooks() {
    const $ = $j();
    $(document).off('.ptLore');
    wiPage.observer?.disconnect();
    wiPage.observer = null;
    window.clearTimeout(wiPage.timer);
    if (!deps.active()) return;
    $(document).on('change.ptLore', '#world_editor_select, #world_info', onLorebooksChanged);
    const select = document.getElementById('world_editor_select');
    if (select) {
        wiPage.observer = new MutationObserver(onLorebooksChanged);
        wiPage.observer.observe(select, { childList: true, subtree: true, characterData: true });
    }
}

// -- lorebooks: entry cards with keyword chips, full-screen entry editor

export const lore = { observer: null, timer: 0, edited: false };

/** Keywords of every entry in the open lorebook, from its data (entries build their insides only when opened). */
let loreKeys = { name: '', byUid: new Map() };

async function refreshLoreKeys() {
    const name = document.getElementById('world_editor_select')?.selectedOptions[0]?.textContent?.trim();
    if (!name) return;
    try {
        const data = await ctx().loadWorldInfo?.(name);
        const byUid = new Map();
        for (const entry of Object.values(data?.entries ?? {})) byUid.set(String(entry.uid), Array.isArray(entry.key) ? entry.key : []);
        loreKeys = { name, byUid };
    } catch {
        // Keep what we had.
    }
}

function entryKeys(entry) {
    // An open entry has its form, with both fields: a tag picker (computers) and a plain text box (phones, or
    // SillyTavern's "plain text keys" option). Only the one in use is filled; the other stays hidden and empty.
    const select = entry.querySelector('select[name="key"]');
    if (select?.classList.contains('select2-hidden-accessible')) return Array.from(select.selectedOptions).map(option => option.textContent.trim()).filter(Boolean);
    const field = entry.querySelector('textarea[name="key"]');
    if (field) return field.value.split(',').map(key => key.trim()).filter(Boolean);
    // A closed entry has no form, so use the book's data.
    return (loreKeys.byUid.get(String(entry.getAttribute('uid'))) ?? []).map(key => String(key).trim()).filter(Boolean);
}

async function decorateEntries(forceRefresh = false) {
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().loreCards) return;
    const list = document.getElementById('world_popup_entries_list');
    if (!list) return;
    const currentBook = document.getElementById('world_editor_select')?.selectedOptions[0]?.textContent?.trim() ?? '';
    // SillyTavern replaces an entry's key list when it is edited, and removes the form when the entry closes.
    // So after an entry was open, read the book again once its form is gone, or the chips show the old keys.
    const closedSinceEdit = lore.edited && !list.querySelector('.world_entry [name="key"]');
    if (forceRefresh || closedSinceEdit || (currentBook && loreKeys.name !== currentBook)) {
        lore.edited = false;
        await refreshLoreKeys();
        if (!deps.active() || !deps.settings().touchSizing || !deps.settings().loreCards) return;
    }
    for (const entry of list.querySelectorAll('.world_entry')) {
        // The content block uses the same class, so ask for the one in the header.
        const header = entry.querySelector('.inline-drawer-header > .world_entry_thin_controls');
        if (!header) continue;
        let chips = header.querySelector('.pt-entry-keys');
        if (!chips) {
            chips = h('div', { class: 'pt-entry-keys' });
            header.append(chips);
        }
        const keys = entryKeys(entry);
        const signature = keys.join('\u0001');
        if (chips.dataset.keys !== signature) {
            chips.dataset.keys = signature;
            chips.replaceChildren(...keys.slice(0, 8).map(key => h('span', { class: 'pt-key-chip', raw: key })),
                ...(keys.length > 8 ? [h('span', { class: 'pt-key-chip pt-key-more', raw: `+${keys.length - 8}` })] : []));
            chips.hidden = !keys.length;
        }
        const content = entry.querySelector('.inline-drawer-content');
        const open = !!content && content.style.display !== 'none' && getComputedStyle(content).display !== 'none';
        if (entry.classList.contains('pt-entry-open') !== open) {
            entry.classList.toggle('pt-entry-open', open);
            scheduleHistorySync();
        }
    }
    const anyOpen = !!list.querySelector('.world_entry.pt-entry-open');
    if (anyOpen) lore.edited = true;
    document.documentElement.classList.toggle('pt-entry-editing', anyOpen);
}

export function openLoreEntry() {
    return document.querySelector('#world_popup_entries_list .world_entry.pt-entry-open');
}

export function closeLoreEntry() {
    const entry = openLoreEntry();
    entry?.querySelector('.world_entry_thin_controls > .inline-drawer-toggle')?.click();
    setTimeout(() => decorateEntries(false), 50);
    setTimeout(() => decorateEntries(false), 400);
}

export function syncLoreEntries() {
    const list = document.getElementById('world_popup_entries_list');
    const want = deps.active() && deps.settings().touchSizing && deps.settings().loreCards;
    document.documentElement.classList.toggle('pt-lorecards', !!want);
    if (!want) {
        window.clearTimeout(lore.timer);
        lore.timer = 0;
        lore.observer?.disconnect();
        lore.observer = null;
        lore.edited = false;
        document.querySelectorAll('.pt-entry-keys').forEach(node => node.remove());
        document.querySelectorAll('.world_entry.pt-entry-open').forEach(node => node.classList.remove('pt-entry-open'));
        document.documentElement.classList.remove('pt-entry-editing');
        return;
    }
    if (list && !lore.observer) {
        lore.observer = new MutationObserver(records => {
            if (records.every(record => record.target.closest?.('.pt-entry-keys'))) return;
            window.clearTimeout(lore.timer);
            lore.timer = window.setTimeout(() => decorateEntries(false), 120);
        });
        lore.observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        wireOnce(list, 'input', event => {
            // Entry cards may have been switched off since (the observer goes with them).
            if (lore.observer && event.target.matches?.('textarea[name="key"]')) {
                window.clearTimeout(lore.timer);
                lore.timer = window.setTimeout(() => decorateEntries(false), 300);
            }
        });
    }
    decorateEntries(true);
}
