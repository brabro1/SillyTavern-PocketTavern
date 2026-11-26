// Formatting's Context template, Instruct template and System prompt (DESIGN.md → AI → Formatting):
// - Instruct mode and the System prompt get a plain switch row at the top, in place of SillyTavern's
//   small ⏻ button. The row presses SillyTavern's own hidden checkbox, so its saving runs as always.
// - With Chat Completion, SillyTavern greys out what it ignores; a note says so and leads to its Prompts.
// Each own node sits before the section's first block (outside SillyTavern's greyed-out boxes) and is
// marked with that section, so it shows and hides with it. Nothing of SillyTavern's moves.
import { h } from '../core/dom.js';
import { safe } from '../core/lifecycle.js';
import { button } from '../ui/button.js';
import { notice } from '../ui/feedback.js';
import { listGroup, listRow } from '../ui/list.js';
import { setToggle } from '../ui/toggle.js';
import { openPresetsOn } from './ai.js';
import { CONTEXT_SETTINGS, INSTRUCT_COLUMN, INSTRUCT_ENABLED, SYSPROMPT_BLOCK, SYSPROMPT_ENABLED } from './selectors.js';

/** Own nodes and listeners, undone by removeFormattingRows(). */
let made = [];
let unlisten = [];
/** Each switch and the checkbox it shows. */
let switches = [];

const SWITCHES = {
    instruct: { box: INSTRUCT_ENABLED, title: 'Instruct mode', subtitle: "Wraps each message in the template's sequences", icon: 'list' },
    sysprompt: { box: SYSPROMPT_ENABLED, title: 'Use the system prompt', subtitle: 'Sends these instructions before the chat', icon: 'scroll' },
};

/** The note shown (by CSS) only while Chat Completion is the API. */
function chatCompletionNote() {
    return h('div', { class: 'pt-fmt-cc', 'data-pt': '1' }, [
        notice({ status: 'info', text: 'Chat Completion ignores the greyed-out settings here. What it sends is set in AI → Prompts.' }),
        button({ label: 'Open Prompts', icon: 'list', onClick: () => openPresetsOn('prompts') }),
    ]);
}

function switchRow(id) {
    const spec = SWITCHES[id];
    const box = document.querySelector(spec.box);
    if (!box) return null;
    const row = listRow({
        title: spec.title, subtitle: spec.subtitle, icon: spec.icon, end: 'toggle', checked: box.checked,
        onToggle: on => {
            // SillyTavern's own checkbox: clicking it toggles it and fires its change, which saves.
            const now = document.querySelector(spec.box);
            if (now && now.checked !== on) now.click();
        },
    });
    const control = row.querySelector('[role="switch"]');
    switches.push({ control, box: spec.box });
    const sync = safe('formatting', () => setToggle(control, !!document.querySelector(spec.box)?.checked));
    box.addEventListener('change', sync);
    unlisten.push(() => box.removeEventListener('change', sync));
    return listGroup({ rows: [row] });
}

/**
 * Puts the switch rows and the Chat Completion note before each section's first block.
 * @param {(element: Element, id: string) => void} markAs the page's section marker
 */
export function addFormattingRows(markAs) {
    removeFormattingRows();
    const places = [
        ['context', document.querySelector(CONTEXT_SETTINGS)],
        ['instruct', document.querySelector(INSTRUCT_COLUMN)],
        // The System prompt's heading (with its ⏻) comes just before its block.
        ['sysprompt', document.querySelector(SYSPROMPT_BLOCK)?.previousElementSibling ?? document.querySelector(SYSPROMPT_BLOCK)],
    ];
    for (const [id, first] of places) {
        if (!first?.parentElement) continue;
        const own = h('div', { class: 'pt-fmt-top', 'data-pt': '1' }, [SWITCHES[id] ? switchRow(id) : null, chatCompletionNote()]);
        first.before(own);
        markAs(own, id);
        made.push(own);
    }
}

/** SillyTavern may set a checkbox without telling anyone (loading settings): read them again. */
export function refreshFormattingRows() {
    for (const { control, box } of switches) setToggle(control, !!document.querySelector(box)?.checked);
}

export function removeFormattingRows() {
    for (const off of unlisten) off();
    for (const node of made) node.remove();
    made = [];
    unlisten = [];
    switches = [];
}
