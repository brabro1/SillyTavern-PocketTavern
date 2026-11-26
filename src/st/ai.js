// SillyTavern's AI screens while Pocket Tavern is on (DESIGN.md → Key screens → AI): the prompt editor (full
// screen, asks before it drops changes), the Presets page's Parameters and Prompts tabs and its trigger chips,
// and what the AI page (src/views/ai.js) reads: the API, model and preset, through SillyTavern's own controls.
// SillyTavern's nodes are marked, restyled (styles/st/ai.css) and pressed, never moved.
// Moved here whole from the legacy app (M4); its listeners are still registered by the legacy app, so errors in
// them are caught by the lifecycle's page-wide net (src/core/lifecycle.js) like the rest of the legacy code.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { refreshOwnPage } from '../shell/page.js';
import { chatCompletionTab, chatCompletionTabsShown } from '../compat/chat-completion-tabs.js';

/**
 * What the legacy app hands over (set once by setupAiScreens()).
 * @type {Record<string, Function> | null}
 */
let deps = null;

export function setupAiScreens(supplied) {
    deps = supplied;
}

const ctx = () => deps.context();
const icon = (...args) => deps.icon(...args);
const ui = (...args) => deps.ui(...args);
const showSheet = instance => deps.showSheet(instance);
const closeSheet = immediate => deps.closeSheet(immediate);
const currentPageId = () => deps.currentPageId();
const openPage = id => deps.openPage(id);
const buzz = ms => deps.buzz(ms);
const openChoiceSheet = (...args) => deps.openChoiceSheet(...args);
const inActiveSection = (...args) => deps.inActiveSection(...args);
const pickFromSelect = (...args) => deps.pickFromSelect(...args);
const actionRow = (...args) => deps.actionRow(...args);
const isConnected = () => deps.isConnected();
/** SillyTavern's jQuery (its own change handlers listen through it). */
const $j = () => globalThis.jQuery;
/** The legacy app's sheet class, made through it. */
function MenuSheet(options) {
    return new deps.MenuSheet(options);
}

// ------------------------------------------------------- prompt editor

const PROMPT_EDITOR = '#completion_prompt_manager_popup';

export function promptEditor() {
    return document.querySelector(PROMPT_EDITOR);
}

/**
 * 'edit', 'inspect' or null. SillyTavern shows it with jQuery's slideDown and hides
 * it with slideUp, so its inline display is the truth. (The computed value lags:
 * drawers fade their `display` out with a transition. The class is not reliable
 * either: SillyTavern's tap-outside handler can drop it on its own.)
 */
export function promptEditorMode() {
    const popup = promptEditor();
    const shown = popup?.style.display;
    if (!shown || shown === 'none') return null;
    return document.getElementById('completion_prompt_manager_popup_inspect')?.style.display === 'flex' ? 'inspect' : 'edit';
}

/** Open and not already sliding away (SillyTavern drops the class when it starts closing). */
export function promptEditorOpen() {
    const popup = promptEditor();
    if (!promptEditorMode()) return false;
    return popup.classList.contains('openDrawer') || !$j()(popup).is(':animated');
}

/** Closes the prompt editor the way its own ✕ does, without saving. */
export function closePromptEditor() {
    const mode = promptEditorMode();
    if (!mode) return false;
    const button = mode === 'inspect'
        ? document.getElementById('completion_prompt_manager_popup_close_button')
        : document.getElementById('completion_prompt_manager_popup_entry_form_close');
    if (button) button.click();
    else $j()(PROMPT_EDITOR).slideUp(150).removeClass('openDrawer');
    return true;
}

/** What the edit form held when it opened, to tell whether leaving would lose changes. */
const promptEdit = { open: false, snapshot: '' };

function promptFormState() {
    const form = document.querySelector('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form');
    if (!form) return '';
    return JSON.stringify(Array.from(form.querySelectorAll('input, select, textarea:not(#pt_prompt_name)'), field => {
        if (field.type === 'checkbox' || field.type === 'radio') return field.checked;
        if (field.multiple) return Array.from(field.selectedOptions, option => option.value).join('|');
        return field.value;
    }));
}

export function promptEditorDirty() {
    return promptEdit.open && promptEditorMode() === 'edit' && promptFormState() !== promptEdit.snapshot;
}

/**
 * Leaves the prompt editor (Back, Escape, another tab). With unsaved changes it
 * asks first: save, keep editing or discard. `then` runs once the editor is left.
 */
export function leavePromptEditor(then) {
    if (!promptEditorDirty()) {
        closePromptEditor();
        then?.();
        return;
    }
    const name = document.getElementById('completion_prompt_manager_popup_entry_form_name')?.value?.trim();
    showSheet(new MenuSheet({
        title: t('Leave without saving?'),
        subtitle: name || t('New prompt'),
        fill: body => body.append(h('div', { class: 'pt-menu-list' }, [
            actionRow(ui('save', 'pt-menu-row-icon'), t('Save'), t('Save the prompt, then go on.'), () => {
                closeSheet(true);
                // SillyTavern's Save also closes the editor.
                document.getElementById('completion_prompt_manager_popup_entry_form_save')?.click();
                then?.();
            }),
            actionRow(ui('pencil', 'pt-menu-row-icon'), t('Keep editing'), t('Stay in the editor.'), () => closeSheet()),
            actionRow(ui('trash', 'pt-menu-row-icon'), t('Discard changes'), t('Close the editor without saving.'), () => {
                closeSheet(true);
                closePromptEditor();
                then?.();
            }, true),
        ])),
    }));
}

export function promptFull() {
    return document.documentElement.classList.contains('pt-prompt-full');
}

/** Full screen: the prompt text gets the whole editor (and on a computer, the whole width). */
export function setPromptFull(on) {
    if (promptFull() === on) return;
    document.documentElement.classList.toggle('pt-prompt-full', on);
    syncPromptFullButton();
    // A mouse goes straight to the text; on a phone the keyboard waits for a tap.
    if (on && matchMedia('(hover: hover) and (pointer: fine)').matches) {
        document.getElementById('completion_prompt_manager_popup_entry_form_prompt')?.focus({ preventScroll: true });
    }
}

function syncPromptFullButton() {
    const footer = document.querySelector('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form_footer');
    let button = document.getElementById('pt_prompt_full');
    if (!deps.active() || !deps.settings().appShell || !deps.settings().touchSizing || !footer) {
        button?.remove();
        document.documentElement.classList.remove('pt-prompt-full');
        return;
    }
    if (!button) {
        button = h('button', {
            type: 'button',
            id: 'pt_prompt_full',
            class: 'menu_button pt-prompt-full-btn',
            onclick: () => {
                buzz(6);
                setPromptFull(!promptFull());
            },
        });
        footer.insertBefore(button, document.getElementById('completion_prompt_manager_popup_entry_form_save'));
    }
    const on = promptFull();
    const label = t(on ? 'Exit full screen' : 'Full screen');
    if (button.dataset.on !== String(on)) {
        button.dataset.on = String(on);
        button.replaceChildren(ui(on ? 'minimize' : 'maximize'));
    }
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(on));
    button.title = label;
}

/** Runs when the editor opens or closes: remember what it opened with, and leave full screen when it closes. */
export function syncPromptEditorSession() {
    const mode = deps.active() ? promptEditorMode() : null;
    if (mode === 'edit' && !promptEdit.open) {
        promptEdit.open = true;
        promptEdit.snapshot = promptFormState();
    } else if (mode !== 'edit' && promptEdit.open) {
        promptEdit.open = false;
        promptEdit.snapshot = '';
    }
    if (mode !== 'edit') document.documentElement.classList.remove('pt-prompt-full');
    syncPromptFullButton();
}

/**
 * The prompt name is a one-line <input>, so long names get cut off on a phone.
 * Show a wrapping box over it that writes straight back into SillyTavern's input.
 */
export function syncPromptNameBox() {
    const input = document.getElementById('completion_prompt_manager_popup_entry_form_name');
    if (!input) return;
    let box = document.getElementById('pt_prompt_name');
    const want = deps.active() && deps.settings().touchSizing;
    if (!want) {
        box?.remove();
        input.classList.remove('pt-native-hidden');
        return;
    }
    if (!box) {
        box = h('textarea', {
            id: 'pt_prompt_name',
            class: 'text_pole pt-prompt-name',
            rows: '1',
            'aria-label': 'Prompt name',
            enterkeyhint: 'done',
            autocomplete: 'off',
            spellcheck: 'false',
        });
        box.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                box.blur();
            }
        });
        box.addEventListener('input', () => {
            const clean = box.value.replace(/[\r\n]+/g, ' ');
            if (clean !== box.value) box.value = clean;
            input.value = clean;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            fitTextarea(box);
            deps.shell()?.update();
        });
        input.after(box);
        input.classList.add('pt-native-hidden');
    }
    if (document.activeElement !== box && box.value !== input.value) box.value = input.value;
    box.disabled = input.disabled;
    box.readOnly = input.readOnly;
    fitTextarea(box);
}

/** Grows a textarea with its text where the browser cannot do it in CSS. */
export function fitTextarea(box) {
    if (CSS.supports?.('field-sizing', 'content') || !box.isConnected) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
}

// -- presets: prompt triggers as chips

// -- presets: Parameters and Prompts as two tabs (Chat Completion)

/**
 * With the Chat Completion API the Presets page is the sampler settings and then, far below, the
 * prompt list. Chat Completion Tabs (another extension) splits them into two tabs; without it,
 * Pocket Tavern shows two tabs of its own (Kahvana's idea). Nothing is moved: the half that is not
 * shown is hidden, and with Chat Completion Tabs installed its own tabs are used instead.
 */
export const presetTabs = { tab: 'params', bar: null, marked: [] };

export function teardownPresetTabs() {
    presetTabs.bar?.remove();
    presetTabs.bar = null;
    for (const node of presetTabs.marked) node.classList.remove('pt-ptab-path', 'pt-ptab-prompts');
    presetTabs.marked = [];
    const panel = document.getElementById('left-nav-panel');
    if (panel) delete panel.dataset.ptPtab;
    document.documentElement.classList.remove('pt-ptabs');
}

export function setPresetTab(tab) {
    presetTabs.tab = tab;
    const panel = document.getElementById('left-nav-panel');
    if (panel) panel.dataset.ptPtab = tab;
    for (const button of presetTabs.bar?.children ?? []) {
        const on = button.id === `pt_ptab_${tab}`;
        button.classList.toggle('pt-seg-on', on);
        button.setAttribute('aria-selected', String(on));
    }
}

export function syncPresetTabs() {
    const manager = document.getElementById('completion_prompt_manager');
    // The page's list of blocks: the preset picker on top (shown on both tabs), then the settings.
    const scope = document.getElementById('ai_response_configuration');
    const head = document.querySelector('#openai_api-presets > div');
    const want = deps.active() && deps.settings().touchSizing && document.getElementById('main_api')?.value === 'openai'
        && !chatCompletionTabsShown() && !!head && !!scope?.contains(manager) && !!scope.querySelector(':scope > #respective-presets-block');
    if (!want) {
        if (presetTabs.bar || presetTabs.marked.length) teardownPresetTabs();
        return;
    }
    if (!presetTabs.bar?.isConnected) {
        teardownPresetTabs();
        // The prompt list's block, and each box between it and the page's list of settings.
        const block = manager.closest('.range-block') ?? manager;
        block.classList.add('pt-ptab-prompts');
        presetTabs.marked.push(block);
        for (let node = block.parentElement; node && node !== scope; node = node.parentElement) {
            node.classList.add('pt-ptab-path');
            presetTabs.marked.push(node);
        }
        presetTabs.bar = h('div', { class: 'pt-segmented pt-ptabs', role: 'tablist', 'aria-label': 'Presets', 'data-pt': '1' },
            [['params', 'Parameters', 'sliders'], ['prompts', 'Prompts', 'note']].map(([id, label, icon]) => h('button', {
                type: 'button', id: `pt_ptab_${id}`, class: 'pt-seg', role: 'tab', onclick: () => setPresetTab(id),
            }, [ui(icon), h('span', { text: label })])));
        head.after(presetTabs.bar);
    }
    setPresetTab(presetTabs.tab);
    document.documentElement.classList.add('pt-ptabs');
}

export function syncTriggerChips() {
    const select = document.getElementById('completion_prompt_manager_popup_entry_form_injection_trigger');
    if (!select) return;
    let chips = document.getElementById('pt_trigger_chips');
    const want = deps.active() && deps.settings().touchSizing;
    if (!want) {
        chips?.remove();
        select.classList.remove('pt-native-hidden');
        return;
    }
    if (!chips) {
        chips = h('div', { id: 'pt_trigger_chips', class: 'pt-trigger-chips', role: 'group', 'aria-label': 'Triggers' });
        chips.addEventListener('click', event => {
            const chip = event.target.closest('.pt-trigger-chip');
            if (!chip) return;
            const option = Array.from(select.options).find(item => item.value === chip.dataset.value);
            if (!option) return;
            option.selected = !option.selected;
            $j()(select).trigger('change');
            buzz(6);
            syncTriggerChips();
        });
        select.after(chips);
        select.classList.add('pt-native-hidden');
    }
    const none = !Array.from(select.options).some(option => option.selected);
    chips.replaceChildren(...Array.from(select.options).map(option => h('button', {
        type: 'button',
        class: `pt-trigger-chip ${option.selected ? 'pt-trigger-on' : ''}`,
        'data-value': option.value,
        'aria-pressed': String(option.selected),
    }, [option.textContent.trim()])), h('small', { class: 'pt-trigger-note', text: none ? t('None picked: used for every kind of reply.') : '' }));
}

// -- the AI page (src/views/ai.js): what SillyTavern is connected to, read from its own controls

/** The preset dropdown for each API (SillyTavern keeps one per API). */
const PRESET_SELECTS = {
    openai: '#settings_preset_openai',
    kobold: '#settings_preset',
    koboldhorde: '#settings_preset',
    novel: '#settings_preset_novel',
    textgenerationwebui: '#settings_preset_textgenerationwebui',
};

const selectedText = select => (select?.selectedOptions?.[0]?.textContent ?? '').trim();

/** The model dropdown SillyTavern shows for the current API, on its connection page. */
function currentModelSelect() {
    const block = document.getElementById('rm_api_block');
    if (!block) return null;
    return Array.from(block.querySelectorAll('select[id^="model_"], select[id$="_model"], select[id*="model_select"]'))
        .filter(select => !select.multiple && inActiveSection(select, block) && select.options.length > 1)[0] ?? null;
}

export function aiStatus() {
    const context = ctx();
    const api = selectedText(document.getElementById('main_api'));
    const source = context.mainApi === 'openai' ? selectedText(document.getElementById('chat_completion_source')) : '';
    const status = String(context.onlineStatus ?? '');
    // SillyTavern's own status text is the model's name once connected (or a plain "Connected").
    const model = selectedText(currentModelSelect()) || (isConnected() && !/^(connected|no_connection)$/i.test(status) ? status : '');
    // SillyTavern's own Connect button for this API, when it shows one.
    const block = document.getElementById('rm_api_block');
    const connectButton = block ? [...block.querySelectorAll('[id^="api_button"]')].find(node => inActiveSection(node, block)) : null;
    return {
        connected: isConnected(),
        api: [api, source].filter(Boolean).join(' · '),
        model,
        connect: connectButton ? () => connectButton.click() : null,
    };
}

/** One quick row: a SillyTavern dropdown's current choice, and a sheet of its choices. */
function selectRow(title, select) {
    if (!select || select.options.length < 2) return null;
    return {
        title,
        value: selectedText(select),
        pick: () => openChoiceSheet({
            title: t(title),
            options: [...select.options].filter(option => !option.disabled && option.value !== '').map(option => ({ value: option.value, label: option.textContent.trim() })),
            current: select.value,
            onPick: value => {
                pickFromSelect(select, value);
                refreshAiPage();
            },
        }),
    };
}

export function aiQuickRows() {
    return [
        selectRow('Connection profile', document.getElementById('connection_profiles')),
        selectRow('Model', currentModelSelect()),
        selectRow('Preset', document.querySelector(PRESET_SELECTS[ctx().mainApi] ?? '#none')),
    ].filter(Boolean);
}

/** SillyTavern's Presets page on its Parameters or Prompts tab (Pocket Tavern's, or Chat Completion Tabs'). */
export function openPresetsOn(tab) {
    openPage('ai-config-button');
    setTimeout(() => {
        const ours = document.getElementById(`pt_ptab_${tab}`);
        if (ours) {
            ours.click();
            return;
        }
        const theirs = chatCompletionTab(tab);
        if (theirs) theirs.click();
        else if (tab === 'prompts') document.getElementById('completion_prompt_manager')?.scrollIntoView({ block: 'start' });
    }, 400);
}

/** Drawn again when what it shows changes (another API, model, preset or profile, the connection). */
export function refreshAiPage() {
    window.clearTimeout(refreshAiPage.timer);
    refreshAiPage.timer = window.setTimeout(() => {
        if (deps.active() && currentPageId() === 'pt-ai') refreshOwnPage();
    }, 250);
}
