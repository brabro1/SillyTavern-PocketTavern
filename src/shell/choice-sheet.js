// Choice sheets (DESIGN.md → Components → Picker): a sheet of choices for any of SillyTavern's selects (one tap
// picks, a filter field when the list is long), and your persona chooser from the message box.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { fitTextarea } from '../st/ai.js';
import { PERSONA_LIST } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'choice sheet';

const LOG = '[Pocket Tavern]';

/** @type {{ settings: () => object, context: () => any, sheet: () => any, $j: Function, buzz: Function, closeSheet: Function, icon: Function, normalizeText: Function, openPage: Function, showSheet: Function, ui: Function, loadPersonasModule: Function, personaName: Function, personaPicture: Function, updatePersonaButton: Function, MenuSheet: Function } | null} */
let deps = null;

export function setupChoiceSheet(supplied) {
    deps = supplied;
}

/**
 * A sheet that lists choices with a search box when the list is long.
 * @param {{ title: string, subtitle?: string, options: { value: string, label: string, note?: string, image?: string }[], current?: string, onPick: (value: string) => void }} config
 */
export function openChoiceSheet({ title, subtitle = '', options, current, onPick }) {
    deps.showSheet(new deps.MenuSheet({
        title,
        subtitle,
        fill: body => {
            const rows = options.map(option => {
                const on = option.value === current;
                return h('button', {
                    type: 'button',
                    class: `pt-menu-row pt-choice ${on ? 'pt-choice-on' : ''}`,
                    'data-search': deps.normalizeText(`${option.label} ${option.note ?? ''}`),
                    'aria-pressed': String(on),
                    onclick: () => {
                        deps.closeSheet(true);
                        if (option.value !== current) onPick(option.value);
                    },
                }, [
                    option.image ? h('img', { class: 'pt-choice-img', src: option.image, alt: '', loading: 'lazy' }) : null,
                    h('span', { class: 'pt-row-text' }, [
                        h('span', { raw: option.label }),
                        option.note ? h('small', { raw: option.note }) : null,
                    ]),
                    on ? deps.ui('check', 'pt-menu-row-icon') : null,
                ]);
            });
            const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
            if (options.length > 8) {
                const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search'), 'aria-label': t('Search') });
                search.addEventListener('input', safe(SOURCE, () => {
                    const words = deps.normalizeText(search.value).split(/\s+/).filter(Boolean);
                    let shown = 0;
                    for (const row of rows) {
                        const ok = words.every(word => row.dataset.search.includes(word));
                        row.hidden = !ok;
                        if (ok) shown++;
                    }
                    empty.hidden = shown > 0;
                }));
                body.append(search);
            }
            if (!options.length) body.append(h('p', { class: 'pt-menu-foot', text: t('Nothing to choose from here yet.') }));
            body.append(h('div', { class: 'pt-menu-list' }, rows), empty);
            requestAnimationFrame(safe(SOURCE, () => body.querySelector('.pt-choice-on')?.scrollIntoView({ block: 'center' })));
        },
    }));
}

/** Is this control on screen in its page, i.e. not inside a section SillyTavern has hidden? */
export function inActiveSection(element, root, allowCollapsedDrawers = false) {
    for (let node = element; node && node !== root; node = node.parentElement) {
        if (allowCollapsedDrawers && node.classList?.contains('inline-drawer-content')) continue;
        if (node.classList?.contains('displayNone') || node.style?.display === 'none') return false;
    }
    return true;
}

export function pickFromSelect(select, value) {
    select.value = value;
    deps.$j()(select).trigger('change');
    select.dispatchEvent(new Event('input', { bubbles: true }));
}

function personaChoices() {
    const power = deps.context().powerUserSettings ?? {};
    const names = power.personas ?? {};
    const descriptions = power.persona_descriptions ?? {};
    return Object.entries(names).map(([avatar, name]) => ({
        value: avatar,
        label: name || avatar,
        note: (descriptions[avatar]?.description ?? '').replace(/\s+/g, ' ').slice(0, 70),
        image: `/thumbnail?type=persona&file=${encodeURIComponent(avatar)}`,
    })).sort((a, b) => a.label.localeCompare(b.label));
}

export function currentPersona() {
    const src = document.querySelector(`${PERSONA_LIST} .avatar-container.selected`)?.dataset.avatarId;
    return src ?? globalThis.user_avatar ?? '';
}

async function choosePersona(avatar) {
    try {
        const personas = await deps.loadPersonasModule();
        if (!personas?.setUserAvatar) throw new Error('Personas module unavailable');
        await personas.setUserAvatar(avatar);
    } catch (error) {
        console.warn(LOG, 'Could not switch persona', error);
        globalThis.toastr?.error(t('Open Personas to switch instead.'), t('Could not switch persona'));
    }
}

/**
 * Your persona: the current one as a card with an Edit button, then the others
 * to switch to, then a way to all persona settings.
 */
export async function openPersonaChooser() {
    const module = await deps.loadPersonasModule();
    const instance = new deps.MenuSheet({
        title: t('Your persona'),
        subtitle: t('Who you are in the chat'),
        fill: body => {
            // Read fresh each time: after switching, the sheet redraws with the new persona.
            const current = module?.user_avatar || currentPersona();
            const all = personaChoices();
            const description = deps.context().powerUserSettings?.persona_descriptions?.[current]?.description ?? '';
            const name = h('b', { class: 'pt-persona-card-name' });
            name.textContent = deps.personaName(current) || t('No name');
            const note = h('small', { class: 'pt-persona-card-desc' });
            note.textContent = description.replace(/\s+/g, ' ').trim() || t('No description yet.');
            body.append(h('div', { class: 'pt-persona-card' }, [
                h('img', { class: 'pt-persona-card-img', src: deps.personaPicture(current), alt: '' }),
                h('span', { class: 'pt-persona-card-text' }, [name, note]),
                current ? h('button', {
                    type: 'button',
                    class: 'pt-persona-card-edit',
                    onclick: () => {
                        deps.buzz(6);
                        openPersonaEditor(current);
                    },
                }, [deps.ui('pencil'), h('span', { text: 'Edit' })]) : null,
            ]));
            const others = all.filter(option => option.value !== current);
            if (others.length) {
                body.append(h('p', { class: 'pt-menu-heading', text: t('Switch to') }));
                const rows = others.map(option => h('button', {
                    type: 'button',
                    class: 'pt-menu-row pt-choice',
                    'data-search': deps.normalizeText(`${option.label} ${option.note ?? ''}`),
                    onclick: async () => {
                        // Stay open: you see the switch and can switch again.
                        deps.buzz(8);
                        await choosePersona(option.value);
                        if (deps.sheet() === instance) instance.refresh();
                    },
                }, [
                    h('img', { class: 'pt-choice-img', src: option.image, alt: '', loading: 'lazy' }),
                    h('span', { class: 'pt-row-text' }, [h('span', { raw: option.label }), option.note ? h('small', { raw: option.note }) : null]),
                ]));
                const empty = h('p', { class: 'pt-empty', text: 'Nothing matches that.', hidden: true });
                if (others.length > 8) {
                    const search = h('input', { type: 'search', class: 'text_pole pt-choice-search', placeholder: t('Search'), 'aria-label': t('Search') });
                    search.addEventListener('input', safe(SOURCE, () => {
                        const words = deps.normalizeText(search.value).split(/\s+/).filter(Boolean);
                        let shown = 0;
                        for (const row of rows) {
                            const ok = words.every(word => row.dataset.search.includes(word));
                            row.hidden = !ok;
                            if (ok) shown++;
                        }
                        empty.hidden = shown > 0;
                    }));
                    body.append(search);
                }
                body.append(h('div', { class: 'pt-menu-list' }, rows), empty);
            }
            body.append(h('div', { class: 'pt-menu-list' }, [h('button', {
                type: 'button',
                class: 'pt-menu-row',
                onclick: () => {
                    deps.closeSheet(true);
                    deps.openPage('persona-management-button');
                },
            }, [deps.ui('settings', 'pt-menu-row-icon'), h('span', { text: 'All persona settings' }), deps.ui('chevron-right', 'pt-menu-row-go')])]));
        },
    });
    deps.showSheet(instance);
}

/** A quick editor for the current persona: its name and description. */
function openPersonaEditor(avatar) {
    if (!avatar) return;
    const power = deps.context().powerUserSettings ?? {};
    const startName = power.personas?.[avatar] ?? '';
    const startText = power.persona_descriptions?.[avatar]?.description ?? (avatar === currentPersona() ? power.persona_description ?? '' : '');
    const nameInput = h('input', { type: 'text', class: 'text_pole pt-pe-name', 'aria-label': t('Name'), maxlength: '100', enterkeyhint: 'next' });
    nameInput.value = startName;
    const textInput = h('textarea', { class: 'text_pole pt-pe-text', rows: '8', 'aria-label': t('Description'), placeholder: t('Who are you? Looks, personality, anything the character should know about you.') });
    textInput.value = startText;
    nameInput.addEventListener('keydown', safe(SOURCE, event => {
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            textInput.focus();
        }
    }));
    const count = h('small', { class: 'pt-pe-count' });
    let countTimer = 0;
    const recount = () => {
        window.clearTimeout(countTimer);
        countTimer = window.setTimeout(safe(SOURCE, async () => {
            try {
                const tokens = await deps.context().getTokenCountAsync?.(textInput.value);
                if (typeof tokens === 'number') count.textContent = t('{count} tokens', { count: tokens.toLocaleString() });
            } catch {
                count.textContent = '';
            }
        }), 300);
    };
    textInput.addEventListener('input', safe(SOURCE, () => {
        fitTextarea(textInput);
        recount();
    }));
    const save = async () => {
        const newName = nameInput.value.trim();
        if (!newName) {
            globalThis.toastr?.warning(t('Give your persona a name.'));
            nameInput.focus();
            return;
        }
        try {
            await savePersonaEdits(avatar, { name: newName, nameChanged: newName !== startName, text: textInput.value, textChanged: textInput.value !== startText });
            deps.closeSheet();
            globalThis.toastr?.success(newName, t('Persona saved'), { timeOut: 1800 });
        } catch (error) {
            console.warn(LOG, 'Could not save the persona', error);
            globalThis.toastr?.error(t('Open Personas to edit it instead.'), t('Could not save the persona'));
        }
    };
    deps.showSheet(new deps.MenuSheet({
        title: t('Edit persona'),
        subtitle: t('Name and description'),
        fill: body => {
            body.append(h('div', { class: 'pt-pe' }, [
                h('div', { class: 'pt-pe-top' }, [
                    h('img', { class: 'pt-persona-card-img', src: deps.personaPicture(avatar), alt: '' }),
                    h('label', { class: 'pt-pe-field' }, [h('small', { text: 'Name' }), nameInput]),
                ]),
                h('label', { class: 'pt-pe-field' }, [h('span', { class: 'pt-pe-label' }, [h('small', { text: 'Description' }), count]), textInput]),
                h('div', { class: 'pt-pe-actions' }, [
                    h('button', { type: 'button', class: 'pt-pe-btn', onclick: () => deps.closeSheet() }, [h('span', { text: 'Cancel' })]),
                    h('button', { type: 'button', class: 'pt-pe-btn pt-pe-save', onclick: save }, [deps.ui('check'), h('span', { text: 'Save' })]),
                ]),
            ]));
            requestAnimationFrame(safe(SOURCE, () => fitTextarea(textInput)));
            recount();
        },
    }));
}

/** Writes the edits the same way SillyTavern's Personas page does. */
async function savePersonaEdits(avatar, { name, nameChanged, text, textChanged }) {
    const context = deps.context();
    const power = context.powerUserSettings;
    const personas = await deps.loadPersonasModule();
    const isCurrent = (personas?.user_avatar || currentPersona()) === avatar;
    if (textChanged) {
        if (isCurrent) {
            // SillyTavern's own description box saves it (and its token count) on input.
            const box = document.getElementById('persona_description');
            if (!box) throw new Error('No persona description box');
            box.value = text;
            box.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            power.persona_descriptions[avatar] = { ...(power.persona_descriptions[avatar] ?? {}), description: text };
        }
    }
    if (nameChanged) {
        const oldName = power.personas[avatar];
        power.personas[avatar] = name;
        if (isCurrent) {
            const script = await import('/script.js');
            script.setUserName?.(name, { toastPersonaNameChange: false });
        }
        await context.eventSource?.emit?.(context.eventTypes?.PERSONA_RENAMED ?? 'persona_renamed', { avatarId: avatar, oldName, newName: name });
    }
    context.saveSettingsDebounced?.();
    await personas?.getUserAvatars?.(true, avatar);
    personas?.setPersonaDescription?.();
    deps.updatePersonaButton();
}
