// Message Summarize (qvink's "Qvink Memory", another extension). It writes a short summary under each message
// and adds four message buttons. In Pocket Tavern's message sheet (⋯) those buttons get short names and a line
// on what each does, in a "Summary" group of their own, instead of their long tooltips; the summary line, its
// editor and its progress bar are styled in styles/compat/message-summarize.css. Keyed on its own qvink_memory
// markup, so without the extension nothing here matches. (Its code is AGPL: read for its markup only.)

const ACTIONS = [
    { cls: 'qvink_memory_remember_button', label: 'Remember', note: 'Keep this summary in long-term memory' },
    { cls: 'qvink_memory_forget_button', label: 'Leave out', note: 'Never put this summary into memory' },
    { cls: 'qvink_memory_edit_button', label: 'Edit summary', note: 'Change the summary by hand' },
    { cls: 'qvink_memory_summarize_button', label: 'Summarize again', note: 'Ask the AI for a new summary of this message' },
];

/** Its action for one of a message's buttons: a short name and a note (Pocket Tavern's words), or null. */
export function summaryAction(button) {
    return ACTIONS.find(action => button.classList.contains(action.cls)) ?? null;
}

/** Its buttons, in the order of ACTIONS, out of a message's buttons. */
export function summaryButtons(buttons) {
    return ACTIONS.map(action => buttons.find(button => button.classList.contains(action.cls))).filter(Boolean);
}
