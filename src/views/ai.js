// The AI place (DESIGN.md → Key screens → AI): what you are talking to and how. A status card (the API and
// model, a status-coloured dot, and Connect when it is not connected), quick rows for the connection profile,
// model and preset, then rows to SillyTavern's own Connection, Samplers and Prompts or Formatting screens.
// Every value is read from SillyTavern and every change goes through its own controls (the shell's actions).
import { h } from '../core/dom.js';
import { button } from '../ui/button.js';
import { listGroup, listRow } from '../ui/list.js';

/** Which SillyTavern pages belong to the AI place: Back from them returns here, and the AI tab stays lit. */
export const AI_PAGES = ['sys-settings-button', 'ai-config-button', 'advanced-formatting-button'];

/**
 * @typedef {object} AiStatus
 * @property {boolean} connected
 * @property {string} api the API's name as SillyTavern shows it (e.g. "Chat Completion · OpenRouter")
 * @property {string} model the model's name, or '' when there is none to show
 * @property {(() => void) | null} connect presses SillyTavern's own Connect for this API
 *
 * @typedef {object} QuickRow
 * @property {string} title Pocket Tavern's own words
 * @property {string} value the current choice (SillyTavern's or the user's text, shown as it is)
 * @property {() => void} pick opens the choices
 *
 * @param {object} actions supplied by the shell
 * @param {(id: string) => void} actions.openPage opens one of SillyTavern's pages by its drawer id
 * @param {() => AiStatus} actions.status
 * @param {() => QuickRow[]} actions.quick the rows that apply right now (connection profile, model, preset)
 * @param {() => boolean} actions.chatCompletion Chat Completion also gets a Prompts row
 * @param {() => void} actions.openSamplers SillyTavern's Presets page, on its Parameters tab
 * @param {() => void} actions.openPrompts SillyTavern's prompt list (on the Samplers page, for Chat Completion)
 * @returns {import('../shell/page.js').PageSpec}
 */
export function aiPage({ openPage, status, quick, chatCompletion, openSamplers, openPrompts }) {
    return {
        title: 'AI',
        long: 'Connection, model and preset',
        icon: 'sparkles',
        render: body => {
            const now = status();
            // The status card: quiet while it works; when it does not, one sentence and Connect.
            const card = h('section', { class: `pt-ai-status pt-ai-status--${now.connected ? 'ok' : 'off'}`, 'aria-live': 'polite' }, [
                h('div', { class: 'pt-ai-status-line' }, [
                    h('span', { class: 'pt-ai-status-dot', 'aria-hidden': 'true' }),
                    h('span', { class: 'pt-ai-status-state', text: now.connected ? 'Connected' : 'Not connected' }),
                ]),
                h('div', { class: 'pt-ai-status-api', raw: now.api, dir: 'auto' }),
                now.model ? h('div', { class: 'pt-ai-status-model', raw: now.model, dir: 'auto' }) : null,
            ]);
            if (!now.connected) {
                card.append(h('p', { class: 'pt-ai-status-note', text: 'Replies need a connection. Connect uses the settings below.' }));
                card.append(button({ label: 'Connect', kind: 'primary', icon: 'plug', onClick: now.connect ?? (() => openPage('sys-settings-button')) }));
            }
            body.append(card);

            const rows = quick();
            if (rows.length) {
                body.append(listGroup({ rows: rows.map(row => listRow({ title: row.title, end: 'picker', value: row.value, onClick: row.pick })) }));
            }

            body.append(listGroup({ rows: [
                listRow({ title: 'Connection settings', subtitle: 'API, address and keys', icon: 'plug', onClick: () => openPage('sys-settings-button') }),
                listRow({ title: 'Samplers', subtitle: 'Temperature, length and more', icon: 'sliders', onClick: openSamplers }),
                // Prompts only for Chat Completion; Formatting for every API (it also holds the tokenizer and
                // other settings Chat Completion uses).
                chatCompletion() ? listRow({ title: 'Prompts', subtitle: 'What is sent to the model, in order', icon: 'list', onClick: openPrompts }) : null,
                listRow({ title: 'Formatting', subtitle: 'Templates, tokenizer and more', icon: 'type', onClick: () => openPage('advanced-formatting-button') }),
            ].filter(Boolean) }));
        },
    };
}
