// Lorebooks while Pocket Tavern is on (DESIGN.md → Key screens → Lorebooks): the lorebook picker and its sheet
// (also used for long dropdowns), the Lorebooks shortcut under +, what the Lorebooks page (src/views/lorebooks.js)
// reads and opens, the World Info page as a lorebook's page or as Activation settings, and entry cards with
// keyword chips. SillyTavern's nodes are marked, restyled (styles/st/lorebooks.css) and pressed, never moved.
// Moved here from the 2.x app (M5); every callback it hands out goes through safe()
// (src/core/lifecycle.js).
import { t } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { overlayHead, wireOverlay } from '../shell/overlay.js';
import { refreshOwnPage } from '../shell/page.js';
import { LOREBOOK_PAGE } from '../views/lorebooks.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'lorebooks';

/**
 * What start-up hands over (src/core/wiring.js) (set once by setupLorebookScreens()).
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
        $j()(select).on('change.pt', safe(SOURCE, this.onChange));
        this.optionObserver = new MutationObserver(safe(SOURCE, () => this.render()));
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
        this.input.addEventListener('input', safe(SOURCE, () => {
            this.query = this.input.value;
            this.renderList(true);
        }));
        this.input.addEventListener('keydown', safe(SOURCE, event => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                this.input.blur();
            }
        }));
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
        this.list.addEventListener('click', safe(SOURCE, event => this.onListClick(event)));
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
            setTimeout(safe(SOURCE, () => closeSheet()), 160);
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
            requestAnimationFrame(safe(SOURCE, () => firstSelected.scrollIntoView({ block: 'center' })));
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
    const loreUi = deps.lorebookUiOn();
    for (const [select, picker] of pickers) {
        const inWorldInfo = !picker.isLong && !!select.closest('#WorldInfo');
        const wanted = picker.isLong ? deps.settings().longSelects : (deps.settings().lorebookPicker && (!inWorldInfo || loreUi));
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
            if (!loreUi && select.closest('#WorldInfo')) continue;
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
    scanTimer = window.setTimeout(safe(SOURCE, scan), 120);
}

export function startObserver() {
    if (domObserver) return;
    const baseSelector = LOREBOOK_TARGETS.map(target => target.selector).join(',');
    let wasEditing = !!document.getElementById('curEditTextarea');
    let chatEl = document.getElementById('chat');
    domObserver = new MutationObserver(safe(SOURCE, records => {
        if (!chatEl || !chatEl.isConnected) chatEl = document.getElementById('chat');
        // Fast O(1) path during reply streaming: every streamed token mutates inside #chat.
        // Only check for message-editor changes if the editor was open or a textarea was added.
        let anyOutsideChat = false;
        let maybeEditor = wasEditing;
        for (const record of records) {
            if (!chatEl || !chatEl.contains(record.target)) {
                anyOutsideChat = true;
                break;
            }
            if (!maybeEditor && record.addedNodes.length) {
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1 && (node.id === 'curEditTextarea' || node.classList?.contains('edit_textarea') || node.querySelector?.('#curEditTextarea'))) {
                        maybeEditor = true;
                        break;
                    }
                }
            }
        }
        if (!anyOutsideChat) {
            if (maybeEditor) {
                const nowEditing = !!document.getElementById('curEditTextarea');
                if (nowEditing !== wasEditing) {
                    wasEditing = nowEditing;
                    syncEditorState();
                }
            }
            return;
        }
        const selector = deps.settings().longSelects ? `${baseSelector},select` : baseSelector;
        let rescan = false;
        let layers = false;
        const nowEditing = !!document.getElementById('curEditTextarea');
        const editorChanged = nowEditing !== wasEditing;
        wasEditing = nowEditing;
        for (const record of records) {
            if (record.target === document.body) layers = true;
            // Inside the chat (a streaming reply changes it on every token) skip heavy subtree scans.
            const inChat = !!chatEl && chatEl.contains(record.target);
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
    }));
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

/** html[data-pt-wi] says which part of World Info shows (styles/st/lorebooks.css); off on every other page or when Pocket Tavern's Lorebook UI is off. */
export function syncLorebookMode(pageId) {
    const root = document.documentElement;
    if (pageId !== LOREBOOK_PAGE || !deps.lorebookUiOn()) {
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
    wiPage.timer = window.setTimeout(safe(SOURCE, () => {
        if (!deps.active()) return;
        const page = currentPageId();
        if (page === 'pt-lorebooks') refreshOwnPage();
        else if (page === LOREBOOK_PAGE && deps.lorebookUiOn()) {
            if (wiPage.mode === 'book' && !editedLorebook()) openPage('pt-lorebooks');
            else deps.shell()?.render(page);
        }
    }), 120);
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

// -- lorebooks: scannable entry cards, quick filters, structured tabbed editor

export const lore = { observer: null, timer: 0, edited: false, filter: 'all' };

/** Snapshot of every entry in the open lorebook, from its data (closed entries have no form in the DOM). */
let loreData = { name: '', byUid: new Map() };

const STATE_ORDER = ['normal', 'constant', 'vectorized'];
const STATE_LABELS = { normal: 'Triggered', constant: 'Constant', vectorized: 'Vectorized' };
const POSITION_LABELS = {
    '0': '↑Char',
    '1': '↓Char',
    '2': '↑AN',
    '3': '↓AN',
    '4': '@Depth',
    '5': '↑EM',
    '6': '↓EM',
    '7': 'Outlet',
};
const ENTRY_TABS = [
    ['content', 'Content'],
    ['triggers', 'Triggers'],
    ['placement', 'Placement'],
    ['advanced', 'Advanced'],
];

async function refreshLoreData() {
    const name = document.getElementById('world_editor_select')?.selectedOptions[0]?.textContent?.trim();
    if (!name) return;
    try {
        const data = await ctx().loadWorldInfo?.(name);
        const byUid = new Map();
        for (const entry of Object.values(data?.entries ?? {})) {
            byUid.set(String(entry.uid), {
                key: Array.isArray(entry.key) ? entry.key : [],
                content: typeof entry.content === 'string' ? entry.content : '',
                disable: !!entry.disable,
                constant: !!entry.constant,
                vectorized: !!entry.vectorized,
                position: entry.position ?? 0,
                depth: entry.depth ?? 4,
                order: entry.order ?? 100,
                probability: entry.probability ?? 100,
                sticky: Number(entry.sticky) || 0,
                group: typeof entry.group === 'string' ? entry.group.trim() : '',
            });
        }
        loreData = { name, byUid };
    } catch {
        // Keep what we had.
    }
}

function entryKeys(entry, info) {
    // An open entry has its form, with both fields: a tag picker (computers) and a plain text box (phones, or
    // SillyTavern's "plain text keys" option). Only the one in use is filled; the other stays hidden and empty.
    const select = entry.querySelector('select[name="key"]');
    if (select?.classList.contains('select2-hidden-accessible')) return Array.from(select.selectedOptions).map(option => option.textContent.trim()).filter(Boolean);
    const field = entry.querySelector('textarea[name="key"]');
    if (field) return field.value.split(',').map(key => key.trim()).filter(Boolean);
    // A closed entry has no form, so use the book's data.
    return (info?.key ?? []).map(key => String(key).trim()).filter(Boolean);
}

function entryState(entry, info) {
    const val = entry.querySelector('select[name="entryStateSelector"]')?.value;
    if (val === 'constant' || val === 'normal' || val === 'vectorized') return val;
    if (info?.constant) return 'constant';
    if (info?.vectorized) return 'vectorized';
    return 'normal';
}

function entryDisabled(entry, info) {
    const toggle = entry.querySelector('.inline-drawer-header > .world_entry_thin_controls > .killSwitch');
    if (toggle) return toggle.classList.contains('fa-toggle-off');
    return !!info?.disable;
}

function entryMetaSummary(entry, info, contentText) {
    const posSelect = entry.querySelector('.WIEnteryHeaderControls select[name="position"]');
    const posVal = posSelect ? posSelect.value : String(info?.position ?? 0);
    const depthInput = entry.querySelector('.WIEnteryHeaderControls input[name="depth"]');
    const depth = depthInput?.value !== '' && depthInput?.value !== undefined ? depthInput.value : String(info?.depth ?? 4);
    const orderInput = entry.querySelector('.WIEnteryHeaderControls input[name="order"]');
    const order = orderInput?.value !== '' && orderInput?.value !== undefined ? orderInput.value : String(info?.order ?? 100);
    const probInput = entry.querySelector('.WIEnteryHeaderControls input[name="probability"]');
    const prob = probInput?.value !== '' && probInput?.value !== undefined ? Number(probInput.value) : Number(info?.probability ?? 100);

    const posLabel = posVal === '4' ? `@D ${depth}` : (POSITION_LABELS[posVal] ?? posSelect?.selectedOptions?.[0]?.textContent?.trim() ?? '↑Char');
    const parts = [posLabel, `#${order}`];
    if (!Number.isNaN(prob) && prob < 100) parts.push(`${prob}%`);
    const trimmed = contentText.trim();
    if (trimmed) parts.push(`~${Math.max(1, Math.round(trimmed.length / 4))} tok`);
    if (info?.sticky > 0) parts.push(`Sticky ${info.sticky}`);
    if (info?.group) parts.push(info.group);
    return parts;
}

function cycleEntryState(entry) {
    const select = entry.querySelector('select[name="entryStateSelector"]');
    if (!select) return;
    const current = STATE_ORDER.includes(select.value) ? select.value : 'normal';
    const next = STATE_ORDER[(STATE_ORDER.indexOf(current) + 1) % STATE_ORDER.length];
    select.value = next;
    $j()(select).trigger('change');
}

function syncEntryTabs(entry, header, open) {
    let tabs = header.querySelector(':scope > .pt-entry-tabs');
    if (!open) {
        tabs?.remove();
        delete entry.dataset.ptEtab;
        return;
    }
    if (!entry.dataset.ptEtab) entry.dataset.ptEtab = 'content';
    const activeTab = entry.dataset.ptEtab;
    if (!tabs) {
        tabs = h('div', { class: 'pt-entry-tabs', role: 'tablist', 'aria-label': t('Entry sections') });
        for (const [id, label] of ENTRY_TABS) {
            tabs.append(h('button', {
                type: 'button',
                role: 'tab',
                class: 'pt-etab pt-focus',
                'data-etab': id,
                'aria-selected': String(activeTab === id),
                onclick: event => {
                    event.preventDefault();
                    event.stopPropagation();
                    entry.dataset.ptEtab = id;
                    for (const btn of tabs.querySelectorAll('.pt-etab')) {
                        const on = btn.dataset.etab === id;
                        btn.classList.toggle('pt-etab--on', on);
                        btn.setAttribute('aria-selected', String(on));
                    }
                    entry.scrollTop = 0;
                },
            }, [h('span', { text: label })]));
        }
        header.append(tabs);
    }
    for (const btn of tabs.querySelectorAll('.pt-etab')) {
        const on = btn.dataset.etab === activeTab;
        btn.classList.toggle('pt-etab--on', on);
        btn.setAttribute('aria-selected', String(on));
    }
    // Mark SillyTavern's unnamed section rows inside the opened form (never moves DOM nodes).
    const edit = entry.querySelector('.world_entry_edit');
    if (edit) {
        for (const child of edit.children) {
            if (child.querySelector('input[name="group"]')) child.classList.add('pt-wi-timing');
            else if (child.querySelector('select[name="characterFilter"]')) child.classList.add('pt-wi-filters');
            else if (child.classList.contains('inline-drawer')) child.classList.add('pt-wi-sources');
        }
    }
}

function syncFilterBar(list, counts, totalTokens) {
    const popup = document.getElementById('world_popup');
    if (!popup || !list) return;
    let bar = document.getElementById('pt-lore-filter');
    if (!counts.all) {
        bar?.remove();
        delete list.dataset.ptFilter;
        return;
    }
    if (!bar) {
        bar = h('div', { id: 'pt-lore-filter', class: 'pt-lore-filter', role: 'toolbar', 'aria-label': t('Filter entries') });
        list.before(bar);
    }
    const items = [
        ['all', 'All', counts.all],
        ['active', 'Enabled', counts.active],
        ['constant', 'Constant', counts.constant],
        ['disabled', 'Disabled', counts.disabled],
    ];
    if (lore.filter !== 'all' && !counts[lore.filter]) lore.filter = 'all';
    list.dataset.ptFilter = lore.filter;
    const signature = `${lore.filter}|${items.map(i => i[2]).join(',')}|${totalTokens}`;
    if (bar.dataset.sig === signature) return;
    bar.dataset.sig = signature;
    const pills = h('div', { class: 'pt-lore-filter-pills' }, items.map(([id, label, count]) => h('button', {
        type: 'button',
        class: `pt-lore-chip pt-focus pt-press ${lore.filter === id ? 'pt-lore-chip--on' : ''}`,
        'data-filter': id,
        'aria-pressed': String(lore.filter === id),
        onclick: () => {
            lore.filter = id;
            list.dataset.ptFilter = id;
            bar.dataset.sig = '';
            syncFilterBar(list, counts, totalTokens);
        },
    }, [h('span', { text: label }), h('span', { class: 'pt-lore-chip-count', raw: String(count) })])));
    const summary = totalTokens > 0
        ? h('span', { class: 'pt-lore-summary', raw: `~${totalTokens.toLocaleString()} tok` })
        : null;
    bar.replaceChildren(pills, ...(summary ? [summary] : []));
}

async function decorateEntries(forceRefresh = false) {
    if (!deps.active() || !deps.settings().touchSizing || !deps.settings().loreCards || !deps.lorebookUiOn()) return;
    const list = document.getElementById('world_popup_entries_list');
    if (!list) return;
    const currentBook = document.getElementById('world_editor_select')?.selectedOptions[0]?.textContent?.trim() ?? '';
    // SillyTavern replaces an entry's form when it is edited, and removes the form when the entry closes.
    // So after an entry was open, read the book again once its form is gone, or previews and chips show stale data.
    const closedSinceEdit = lore.edited && !list.querySelector('.world_entry [name="key"]');
    if (forceRefresh || closedSinceEdit || (currentBook && loreData.name !== currentBook)) {
        lore.edited = false;
        await refreshLoreData();
        if (!deps.active() || !deps.settings().touchSizing || !deps.settings().loreCards || !deps.lorebookUiOn()) return;
    }
    const counts = { all: 0, active: 0, constant: 0, disabled: 0 };
    let totalTokens = 0;
    for (const entry of list.querySelectorAll('.world_entry')) {
        const drawerHeader = entry.querySelector('.world_entry_form > .inline-drawer > .inline-drawer-header');
        const header = drawerHeader?.querySelector(':scope > .world_entry_thin_controls');
        if (!header || !drawerHeader) continue;
        const uid = String(entry.getAttribute('uid') ?? '');
        const info = loreData.byUid.get(uid) ?? null;
        const state = entryState(entry, info);
        const disabled = entryDisabled(entry, info);
        const contentText = entry.querySelector('textarea[name="content"]')?.value ?? info?.content ?? '';

        entry.dataset.ptState = state;
        entry.dataset.ptDisabled = disabled ? '1' : '0';
        counts.all++;
        if (disabled) counts.disabled++;
        else {
            counts.active++;
            if (state === 'constant') counts.constant++;
            if (contentText.trim()) totalTokens += Math.max(1, Math.round(contentText.trim().length / 4));
        }

        // Strategy pill button (clean semantic replacement for the emoji dropdown; cycles SillyTavern's select).
        let stateBtn = header.querySelector(':scope > .pt-entry-state');
        if (!stateBtn) {
            stateBtn = h('button', {
                type: 'button',
                class: 'pt-entry-state pt-focus pt-press',
                title: 'Switch entry strategy',
                onclick: event => {
                    event.preventDefault();
                    event.stopPropagation();
                    cycleEntryState(entry);
                },
            });
            header.append(stateBtn);
        }
        if (stateBtn.dataset.state !== state) {
            stateBtn.dataset.state = state;
            stateBtn.setAttribute('aria-label', `${t(STATE_LABELS[state])}: ${t('Switch entry strategy')}`);
            stateBtn.replaceChildren(h('span', { class: 'pt-state-dot', 'aria-hidden': 'true' }), h('span', { text: STATE_LABELS[state] }));
        }

        // Content snippet preview (closed cards only; hidden via CSS while open).
        let preview = header.querySelector(':scope > .pt-entry-preview');
        if (!preview) {
            preview = h('div', { class: 'pt-entry-preview' });
            header.append(preview);
        }
        const snippet = contentText.replace(/\s+/g, ' ').trim().slice(0, 180);
        if (preview.dataset.sig !== snippet) {
            preview.dataset.sig = snippet;
            preview.textContent = snippet;
            preview.hidden = !snippet;
        }

        // Keyword chips (closed cards only; hidden via CSS while open).
        let chips = header.querySelector(':scope > .pt-entry-keys');
        if (!chips) {
            chips = h('div', { class: 'pt-entry-keys' });
            header.append(chips);
        }
        const keys = entryKeys(entry, info);
        const signature = keys.join('\u0001');
        if (chips.dataset.keys !== signature) {
            chips.dataset.keys = signature;
            chips.replaceChildren(...keys.slice(0, 6).map(key => h('span', { class: 'pt-key-chip', raw: key })),
                ...(keys.length > 6 ? [h('span', { class: 'pt-key-chip pt-key-more', raw: `+${keys.length - 6}` })] : []));
            chips.hidden = !keys.length;
        }

        // Compact metadata summary strip (closed cards only; replaces bulky 4-column inputs).
        let meta = header.querySelector(':scope > .pt-entry-meta');
        if (!meta) {
            meta = h('div', { class: 'pt-entry-meta' });
            header.append(meta);
        }
        const metaParts = entryMetaSummary(entry, info, contentText);
        const metaSig = metaParts.join('\u0001');
        if (meta.dataset.sig !== metaSig) {
            meta.dataset.sig = metaSig;
            meta.replaceChildren(...metaParts.map(part => h('span', { class: 'pt-entry-meta-item', raw: part })));
        }

        const content = entry.querySelector('.world_entry_form > .inline-drawer > .inline-drawer-content');
        const open = !!content && content.style.display !== 'none' && getComputedStyle(content).display !== 'none';
        if (entry.classList.contains('pt-entry-open') !== open) {
            entry.classList.toggle('pt-entry-open', open);
            scheduleHistorySync();
        }
        syncEntryTabs(entry, drawerHeader, open);
    }
    syncFilterBar(list, counts, totalTokens);
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
    setTimeout(safe(SOURCE, () => decorateEntries(false)), 50);
    setTimeout(safe(SOURCE, () => decorateEntries(false)), 400);
}

export function syncLoreEntries() {
    const list = document.getElementById('world_popup_entries_list');
    const want = deps.active() && deps.settings().touchSizing && deps.settings().loreCards && deps.lorebookUiOn();
    document.documentElement.classList.toggle('pt-lorecards', !!want);
    if (!want) {
        window.clearTimeout(lore.timer);
        lore.timer = 0;
        lore.observer?.disconnect();
        lore.observer = null;
        lore.edited = false;
        lore.filter = 'all';
        document.getElementById('pt-lore-filter')?.remove();
        if (list) delete list.dataset.ptFilter;
        document.querySelectorAll('.pt-entry-keys, .pt-entry-preview, .pt-entry-meta, .pt-entry-state, .pt-entry-tabs').forEach(node => node.remove());
        document.querySelectorAll('.world_entry').forEach(node => {
            node.classList.remove('pt-entry-open');
            delete node.dataset.ptState;
            delete node.dataset.ptDisabled;
            delete node.dataset.ptEtab;
        });
        document.querySelectorAll('.pt-wi-timing, .pt-wi-filters, .pt-wi-sources').forEach(node => node.classList.remove('pt-wi-timing', 'pt-wi-filters', 'pt-wi-sources'));
        document.documentElement.classList.remove('pt-entry-editing');
        return;
    }
    if (list && !lore.observer) {
        lore.observer = new MutationObserver(safe(SOURCE, records => {
            if (records.every(record => record.target.closest?.('.pt-entry-keys, .pt-entry-preview, .pt-entry-meta, .pt-entry-state, .pt-entry-tabs'))) return;
            window.clearTimeout(lore.timer);
            lore.timer = window.setTimeout(safe(SOURCE, () => decorateEntries(false)), 120);
        }));
        lore.observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        wireOnce(list, 'input', event => {
            // Entry cards may have been switched off since (the observer goes with them).
            if (lore.observer && event.target.matches?.('textarea[name="key"], textarea[name="content"], input[name="order"], input[name="depth"], input[name="probability"]')) {
                window.clearTimeout(lore.timer);
                lore.timer = window.setTimeout(safe(SOURCE, () => decorateEntries(false)), 300);
            }
        });
        wireOnce(list, 'change', event => {
            if (lore.observer && event.target.matches?.('select[name="entryStateSelector"], select[name="position"]')) {
                window.clearTimeout(lore.timer);
                lore.timer = window.setTimeout(safe(SOURCE, () => decorateEntries(false)), 80);
            }
        });
        // Tapping anywhere on a closed entry card (outside its toggle, title field or state pill) opens it.
        wireOnce(list, 'click', event => {
            if (!lore.observer) return;
            const entry = event.target.closest?.('.world_entry:not(.pt-entry-open)');
            if (!entry) return;
            if (event.target.closest?.('.killSwitch, textarea, input, select, button, .inline-drawer-toggle, i.menu_button, .drag-handle')) return;
            entry.querySelector('.world_entry_thin_controls > .inline-drawer-toggle')?.click();
        });
    }
    decorateEntries(true);
}
