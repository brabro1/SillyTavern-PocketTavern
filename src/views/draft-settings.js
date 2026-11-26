// Settings → Pocket Tavern → Draft helper (DESIGN.md → The chat → Message box → Draft helper): its settings in
// groups (General, Writing, Model compatibility, Instructions, Clean-up), then Preview the note and Reset. The
// fields come from the engine's schema (src/features/draft/engine.js); every change is saved at once.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { button } from '../ui/button.js';
import { formField, textField } from '../ui/field.js';
import { filterField } from '../ui/filter.js';
import { listGroup, listRow } from '../ui/list.js';
import { numberRow } from '../ui/number.js';

/**
 * @param {object} actions supplied by the shell
 * @param {[string, object[]][]} actions.sections the schema's groups
 * @param {() => Record<string, any>} actions.settings the Draft helper's settings
 * @param {(key: string, value: any) => void} actions.set saves one setting
 * @param {(o: { title: string, options: { value: string, label: string }[], current: string, onPick: (value: string) => void }) => void} actions.pick
 * @param {() => Promise<string[]>} actions.profiles connection profile names
 * @param {(kind: string) => string} actions.builtIn the built-in instruction, for a custom-instruction field
 * @param {() => void} actions.preview shows the note it would send now
 * @param {() => void} actions.reset every setting back to its default
 * @param {() => boolean} actions.standalone the Draft Enhancer extension itself is on
 * @param {() => boolean} actions.enabled the Draft helper switch
 * @param {(on: boolean) => void} actions.setEnabled
 * @returns {import('../shell/page.js').PageSpec}
 */
export function draftSettingsPage(actions) {
    return {
        title: 'Draft helper',
        long: 'Enhance, write or continue your message',
        icon: 'wand',
        render: body => {
            body.append(filterField(body));
            if (actions.standalone()) {
                body.append(h('p', { class: 'pt-choice-note pt-draft-note', text: "The Draft Enhancer extension is on, so Pocket Tavern's own Draft helper stays off. Turn that extension off in Extensions to use this one." }));
            }
            body.append(listGroup({ rows: [
                listRow({ title: 'Draft helper', subtitle: 'Enhance my draft, Write for me and Continue my draft in +.', end: 'toggle', checked: actions.enabled(), onToggle: actions.setEnabled }),
            ] }));

            const s = actions.settings();
            const shown = [];
            const syncShown = () => {
                for (const [field, node] of shown) node.hidden = !field.showIf(actions.settings());
            };
            const save = (field, value) => {
                actions.set(field.key, value);
                syncShown();
            };
            for (const [title, fields] of actions.sections) {
                const rows = [];
                const blocks = [];
                for (const field of fields) {
                    const node = fieldNode(field, s[field.key], value => save(field, value), actions);
                    if (field.showIf) shown.push([field, node]);
                    (field.type === 'area' || field.type === 'text' ? blocks : rows).push(node);
                }
                if (rows.length) body.append(listGroup({ header: title, rows }));
                if (blocks.length) {
                    body.append(h('section', { class: 'pt-list-section pt-draft-fields' }, [
                        rows.length ? null : h('div', { class: 'pt-list-header', text: title }),
                        ...blocks,
                    ]));
                }
            }
            syncShown();

            body.append(h('div', { class: 'pt-draft-buttons' }, [
                button({ label: 'Preview the note', icon: 'eye', onClick: actions.preview }),
                button({ label: 'Reset to defaults', icon: 'reset', onClick: actions.reset }),
            ]));
            body.append(h('p', { class: 'pt-choice-note', text: 'The Draft helper follows your preset: it runs through SillyTavern’s Impersonate, so the preset, lorebooks, persona and chat history all apply. The result always goes into your message box.' }));
        },
    };
}

/** One setting as a row (switch, picker, number) or a field (text, text area). */
function fieldNode(field, value, onChange, actions) {
    if (field.type === 'bool') {
        return listRow({ title: field.label, subtitle: field.hint, end: 'toggle', checked: !!value, onToggle: onChange });
    }
    if (field.type === 'number') {
        const row = numberRow({ label: field.label, value: Number(value), min: field.min, max: field.max, step: field.step, onChange });
        row.classList.add('pt-list-row');
        return row;
    }
    if (field.type === 'select' || field.type === 'profile') {
        const label = current => {
            if (field.type === 'profile') return current || t('Same as the chat');
            const option = field.options.find(([v]) => v === current);
            // The row shows the short name; the choices keep the explanation in brackets.
            return option ? t(option[1]).replace(/\s*[(（].*$/, '') : current;
        };
        let current = value;
        const row = listRow({ title: field.label, subtitle: field.hint, end: 'picker', value: label(current), onClick: async () => {
            const options = field.type === 'profile'
                ? [{ value: '', label: t('Same as the chat') }, ...(await actions.profiles()).map(name => ({ value: name, label: name }))]
                : field.options.map(([v, text]) => ({ value: v, label: t(text) }));
            if (field.type === 'profile' && current && !options.some(o => o.value === current)) options.push({ value: current, label: current });
            actions.pick({ title: t(field.label), options, current, onPick: picked => {
                current = picked;
                const shownValue = row.querySelector('.pt-list-row-value');
                if (shownValue) shownValue.textContent = label(picked);
                onChange(picked);
            } });
        } });
        return row;
    }
    const control = textField({ value: String(value ?? ''), placeholder: field.placeholder, multiline: field.type === 'area', onChange });
    const wrap = formField({ label: field.label, control, help: field.hint });
    if (field.fill) {
        wrap.append(button({ label: 'Insert the built-in instruction', icon: 'file-text', onClick: () => {
            control.value = actions.builtIn(field.fill);
            control.dispatchEvent(new Event('input', { bubbles: true }));
            onChange(control.value);
        } }));
    }
    return wrap;
}
