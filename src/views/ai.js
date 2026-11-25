// The AI place (DESIGN.md → Key screens → AI): what you are talking to and how. For now its root leads
// to SillyTavern's own Connection, Presets and Formatting screens; M4 adds the status card and the
// quick rows for connection profile, model and preset.
import { statusBanner } from '../ui/feedback.js';
import { listGroup, listRow } from '../ui/list.js';

/** Which SillyTavern pages belong to the AI place: Back from them returns here, and the AI tab stays lit. */
export const AI_PAGES = ['sys-settings-button', 'ai-config-button', 'advanced-formatting-button'];

/**
 * @param {object} actions supplied by the shell
 * @param {(id: string) => void} actions.openPage opens one of SillyTavern's pages by its drawer id
 * @param {() => boolean} actions.connected whether SillyTavern has a working connection
 * @returns {import('../shell/page.js').PageSpec}
 */
export function aiPage({ openPage, connected }) {
    return {
        title: 'AI',
        long: 'API, presets and formatting',
        icon: 'sparkles',
        render: body => {
            // Quiet while everything works; a problem gets one sentence and the action that fixes it.
            if (!connected()) {
                body.append(statusBanner({ status: 'warn', text: 'Not connected', action: { label: 'Connect', onClick: () => openPage('sys-settings-button') } }));
            }
            body.append(listGroup({ rows: [
                listRow({ title: 'API', subtitle: 'API connection', icon: 'plug', onClick: () => openPage('sys-settings-button') }),
                listRow({ title: 'Presets', subtitle: 'AI response settings', icon: 'sliders', onClick: () => openPage('ai-config-button') }),
                listRow({ title: 'Formatting', subtitle: 'Prompt formatting', icon: 'type', onClick: () => openPage('advanced-formatting-button') }),
            ] }));
        },
    };
}
