// The Draft helper (DESIGN.md → The chat → Message box → Draft helper): Enhance my draft, Write for me, Continue my
// draft and Refine, built in from the Draft Enhancer extension. Every request runs through SillyTavern's Impersonate
// with one note added (src/features/draft/engine.js); the result lands in the message box and nothing is sent until
// the person sends it. Started and stopped by the legacy app's sync (while Pocket Tavern is on and the switch is on);
// every callback it hands out is wrapped in safe().
import { t } from '../../core/i18n.js';
import { safe } from '../../core/lifecycle.js';
import { CHAT_COMPLETION_PRESET, MESSAGE_BOX, SEND_BUTTON, STOP_BUTTON } from '../../st/selectors.js';
import { draftBar } from '../../views/draft-bar.js';
import {
    DEFAULTS, FIELDS, REFINES, assemble, buildNote, chatKey, clamp, clean, cleanPartial, currentSubject, num,
    parseSubject, roles, stripImpersonationPrompt, subjectChoices, trimUnfinished, useContext,
} from './engine.js';

const TITLE = 'Draft helper';
const NOTE_KEY = 'pt_draft_note';
const NO_PROFILE = '<None>';
/** The Draft Enhancer extension's own settings key, taken over the first time. */
const STANDALONE_KEY = 'draftEnhancer';
const COMMANDS = [
    ['enhance-draft', 'enhance', 'enhance', 'Rewrites your draft into a finished message, following your preset.', 'draft (defaults to the message box)'],
    ['write-for-me', 'writeforme', 'write', 'Writes the next message for you, following your preset.', 'optional direction (defaults to the message box)'],
    ['continue-draft', 'continuedraft', 'continue', 'Finishes the draft you started, following your preset.', 'draft (defaults to the message box)'],
];

/** What the legacy app hands over: context(), settings() (Pocket Tavern's), save(). */
let deps = null;
let running = false;
let bar = null;
const listeners = [];
const state = {
    busy: false,
    cancelled: false,
    undo: [], // earlier box texts, newest last
    lastRun: null, // { kind, text, subject, original, selection, instruction }: what Regenerate and Discard act on
    history: [], // results of the current Regenerate / Refine chain
    hIdx: 0,
    lastPrompt: '',
};

class Cancelled extends Error {}

const ctx = () => deps.context();
const box = () => document.querySelector(MESSAGE_BOX);
const toast = (kind, text, timeOut) => globalThis.toastr?.[kind]?.(t(text), t(TITLE), timeOut ? { timeOut } : undefined);

/** True while the Draft Enhancer extension itself is loaded: then the built-in one stays off. */
export function standaloneInstalled() {
    return !!globalThis.DraftEnhancer || !!document.getElementById('de_button');
}

/** The Draft helper's settings (Pocket Tavern's `draft`), with defaults filled in and old keys dropped. */
export function draftSettings() {
    const all = deps.settings();
    if (!all.draft || typeof all.draft !== 'object') {
        // First time: take over what the Draft Enhancer extension had saved, if anything.
        const theirs = ctx().extensionSettings?.[STANDALONE_KEY];
        all.draft = theirs && typeof theirs === 'object' ? structuredClone(theirs) : {};
    }
    const s = all.draft;
    for (const key of Object.keys(s)) if (!(key in DEFAULTS)) delete s[key];
    for (const [key, value] of Object.entries(DEFAULTS)) if (s[key] === undefined) s[key] = structuredClone(value);
    return s;
}

export function saveDraftSettings() {
    deps.save();
}

/** Every setting back to its default. */
export function resetDraftSettings() {
    deps.settings().draft = structuredClone(DEFAULTS);
    deps.save();
}

function setBox(text, focus = true) {
    const field = box();
    if (!field) return;
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    if (focus) {
        field.focus();
        field.setSelectionRange(text.length, text.length);
    }
}

/** Puts a new text in the box and remembers the old one for Undo. */
function changeBox(text) {
    const old = box()?.value ?? '';
    if (old !== text) state.undo = [...state.undo, old].slice(-20);
    setBox(text);
}

function replyIsRunning() {
    const stop = document.querySelector(STOP_BUTTON);
    return !!stop && stop.offsetParent !== null && getComputedStyle(stop).display !== 'none';
}

/* ------------------------------------------------------------------ */
/* Connection profiles (Connection Manager)                            */
/* ------------------------------------------------------------------ */

async function slash(command) {
    const result = await ctx().executeSlashCommandsWithOptions(command, { handleParserErrors: false, handleExecutionErrors: false });
    return String(result?.pipe ?? '');
}

const quoteArg = value => `"${String(value).replace(/"/g, '\\"')}"`;

async function profileInfo(name) {
    try {
        return JSON.parse(await slash(`/profile-get ${quoteArg(name)}`));
    } catch {
        return null;
    }
}

/** The connection profiles from the Connection Manager, for the settings page. */
export async function profileNames() {
    if (!ctx().SlashCommandParser?.commands?.['profile-list']) return [];
    try {
        const names = JSON.parse(await slash('/profile-list'));
        return Array.isArray(names) ? names : [];
    } catch {
        return [];
    }
}

/** What the connection is right now, in the terms a connection profile uses. */
function liveConnection() {
    const c = ctx();
    const cs = c.chatCompletionSettings || {};
    return {
        api: c.mainApi === 'openai' ? cs.chat_completion_source : c.mainApi,
        model: c.getChatCompletionModel?.() ?? '',
        url: cs.chat_completion_source === 'custom' ? cs.custom_url : undefined,
        preset: document.querySelector(CHAT_COMPLETION_PRESET)?.selectedOptions[0]?.textContent ?? '',
    };
}

/** True when the connection is set up the way the saved profile says (fields the profile does not save are ignored). */
function matchesProfile(profile) {
    const live = liveConnection();
    const same = (a, b) => !a || String(a) === String(b ?? '');
    return profile?.mode === 'cc' && same(profile.api, live.api) && same(profile.model, live.model)
        && (live.url === undefined || same(profile['api-url'], live.url)) && same(profile.preset, live.preset);
}

/**
 * Runs `fn` with the drafting connection profile, then switches back. This is only safe when the connection in use
 * is exactly a saved profile: switching back loads that profile, so anything changed since it was saved would be
 * lost. In every other case the current connection is used, with a warning.
 */
async function withProfile(name, fn) {
    const c = ctx();
    if (!name || !c.SlashCommandParser?.commands?.profile) return fn();
    const current = await slash('/profile').catch(() => '');
    if (current === name) return fn();
    const warn = why => {
        toast('warning', why, 7000);
        return fn();
    };
    if (!current || current === NO_PROFILE) return warn('To draft with another connection profile, your own connection must be a saved profile too, so it can be switched back. Drafting with the current connection.');
    if (!matchesProfile(await profileInfo(current))) return warn('Your connection has changed since its profile was saved, so switching back would not restore it. Update that profile in the Connection Manager first. Drafting with the current connection.');
    const target = await profileInfo(name);
    if (target?.mode !== 'cc' || c.mainApi !== 'openai') return warn('That connection profile was not found, or is not a Chat Completion profile. Drafting with the current connection.');

    const applied = async profile => {
        await slash(`/profile await=true timeout=8000 ${quoteArg(profile.name)}`);
        // The profile is applied in steps; wait until the connection really is the profile before generating.
        for (let i = 0; i < 40 && !(matchesProfile(profile) && ctx().onlineStatus !== 'no_connection'); i++) await new Promise(resolve => setTimeout(resolve, 200));
        return matchesProfile(profile);
    };
    const back = await profileInfo(current);
    try {
        if (!(await applied(target))) throw new Error(t('Could not switch to the drafting connection profile.'));
        return await fn();
    } finally {
        if (!(await applied(back).catch(() => false))) toast('error', 'Could not switch back to your connection profile. Check your connection.');
    }
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Runs SillyTavern's Impersonate with the note as the last message. With Chat Completion the note is appended to the
 * finished prompt, after every preset prompt, so nothing the preset adds at the end can outrank it. Other APIs get it
 * injected at depth 0. While the reply streams in, the box shows it cleaned and put together with the rest (`display`).
 */
async function generate(note, r, s, display) {
    const c = ctx();
    const field = box();
    state.lastPrompt = note;
    const event = c.eventTypes.CHAT_COMPLETION_PROMPT_READY;
    const chatCompletion = c.mainApi === 'openai' && !!event;
    const onReady = safe('the Draft helper', data => {
        if (data?.dryRun || !Array.isArray(data?.chat)) return;
        if (r.mode !== 'user') stripImpersonationPrompt(data.chat);
        data.chat.push({ role: 'user', content: note });
    });

    let raw = '';
    let rewriting = false;
    const onInput = safe('the Draft helper', () => {
        if (rewriting) return;
        raw = field.value;
        if (!s.liveClean) return;
        rewriting = true;
        field.value = display(cleanPartial(raw, s));
        rewriting = false;
    });

    const placeholder = field.placeholder;
    field.placeholder = t('Writing…');
    setBox('', false); // SillyTavern writes the reply into the empty box
    field.addEventListener('input', onInput);
    if (chatCompletion) c.eventSource.on(event, onReady);
    else c.setExtensionPrompt(NOTE_KEY, note, 1 /* in chat */, 0 /* depth */, false, 1 /* user role */);
    try {
        const ret = await c.generate('impersonate', {});
        raw ||= field.value; // no input event: the box holds the reply as SillyTavern wrote it
        return raw.trim() ? raw : String(ret ?? '');
    } finally {
        field.removeEventListener('input', onInput);
        field.placeholder = placeholder;
        if (chatCompletion) c.eventSource.removeListener(event, onReady);
        else c.setExtensionPrompt(NOTE_KEY, '', 1, 0, false, 1);
    }
}

export function cancelDraft() {
    if (!state.busy) return;
    state.cancelled = true;
    try {
        ctx().stopGeneration();
    } catch (error) {
        console.warn('[Pocket Tavern]', 'Draft helper: could not stop the reply.', error);
    }
}

/** The part of the box that is selected, when Enhance should work on that part only. */
function boxSelection() {
    const field = box();
    if (!field || field.selectionStart === field.selectionEnd) return null;
    const value = field.value;
    const picked = value.slice(field.selectionStart, field.selectionEnd);
    if (!picked.trim() || picked.trim() === value.trim()) return null;
    return {
        before: value.slice(0, field.selectionStart),
        after: value.slice(field.selectionEnd),
        lead: picked.match(/^\s*/)[0],
        trail: picked.match(/\s*$/)[0],
        text: picked.trim(),
    };
}

/**
 * Enhance, Write, Continue or Refine.
 * opts.original       the text Discard restores (the box before the first run)
 * opts.restoreOnError what goes back in the box if this attempt fails
 * opts.fromBar        started from the result bar (Regenerate or Refine)
 * opts.selection      for Enhance: the selected part of the box and the text around it
 * opts.instruction    for Refine: the change to make
 */
export async function runDraft(kind, overrideText, overrideSubject, opts = {}) {
    if (!running) return null;
    const s = draftSettings();
    if (state.busy) {
        cancelDraft();
        return null;
    }
    const c = ctx();
    if (c.characterId === undefined && !c.groupId) {
        toast('warning', 'Open a chat first.');
        return null;
    }
    if (replyIsRunning()) {
        toast('warning', 'Wait for the current reply to finish.');
        return null;
    }

    const original = opts.original ?? (box()?.value ?? '');
    const selection = kind === 'enhance' && overrideText === undefined && !opts.fromBar ? boxSelection() : opts.selection ?? null;
    let text = selection ? selection.text : String(overrideText ?? original).trim();
    if ((kind === 'enhance' || kind === 'continue') && !text) {
        if (!s.emptyToWrite) {
            toast('warning', 'Type a draft in the message box first.');
            return null;
        }
        kind = 'write'; // nothing to work on: write the next message instead
    }
    if (kind === 'continue') text = String(overrideText ?? original).replace(/\s+$/, ''); // keep the draft exactly as typed
    const subject = parseSubject(overrideSubject) ?? currentSubject(s);
    const r = roles(subject);
    const runInfo = { kind, text, subject, original, selection, instruction: opts.instruction };
    const restore = opts.restoreOnError ?? box()?.value ?? original;

    state.busy = true;
    state.cancelled = false;
    bar?.working(true);

    try {
        let result = '';
        const note = buildNote(kind, text, s, { subject, selection, instruction: opts.instruction });
        const display = partial => (partial ? assemble(runInfo, partial) : '');
        await withProfile(s.profile, async () => {
            const attempts = 1 + clamp(num(s.retries, 1), 0, 3);
            for (let i = 0; i < attempts && !result; i++) {
                let raw;
                try {
                    raw = await generate(note, r, s, display);
                } finally {
                    if (state.cancelled) throw new Cancelled(); // eslint-disable-line no-unsafe-finally
                }
                if (s.debug) console.log('[Pocket Tavern]', `Draft helper: ${kind}, as ${subject}, attempt ${i + 1}\n--- note ---\n${note}\n--- raw reply ---\n${String(raw ?? '')}`);
                result = clean(raw, s);
                if (result && s.trimUnfinished) result = trimUnfinished(result);
            }
        });
        if (!result) throw new Error(t('The model returned nothing usable. Check the connection, or raise the response length if your model uses reasoning.'));

        const full = assemble(runInfo, result);
        setBox(restore, false); // so Undo goes back to what was there before this run
        changeBox(full);
        state.lastRun = runInfo;
        state.history = [...(opts.fromBar ? state.history : []), full].slice(-8);
        state.hIdx = state.history.length - 1;
        if (s.autoSend) {
            bar?.hide();
            document.querySelector(SEND_BUTTON)?.click();
        } else if (s.actionBar) {
            showBar();
        } else {
            bar?.hide();
            toast('success', { enhance: 'Draft enhanced', write: 'Message written', continue: 'Draft continued', refine: 'Message refined' }[kind], 1500);
        }
        return full;
    } catch (error) {
        setBox(restore, false); // never lose what was in the box
        if (opts.fromBar && state.history.length) showBar(); // a failed Regenerate or Refine keeps the earlier result
        else bar?.hide();
        if (error instanceof Cancelled) {
            toast('info', 'Cancelled', 1500);
        } else {
            console.error('[Pocket Tavern]', 'Draft helper:', error);
            globalThis.toastr?.error?.(String(error?.message || error), t(TITLE));
        }
        return null;
    } finally {
        state.busy = false;
        bar?.working(false);
    }
}

export function undoDraft() {
    bar?.hide();
    if (!state.undo.length) {
        toast('info', 'Nothing to undo.', 1500);
        return;
    }
    setBox(state.undo.pop());
}

export const canUndo = () => state.undo.length > 0;
export const isDrafting = () => state.busy;

/* ------------------------------------------------------------------ */
/* Result bar: ‹ 1/2 › Keep / Regenerate / Refine / Discard            */
/* ------------------------------------------------------------------ */

function showBar() {
    if (!draftSettings().actionBar) return;
    bar?.show({ index: state.hIdx, count: state.history.length });
}

function barAction(action) {
    const last = state.lastRun;
    if (action === 'cancel') return cancelDraft();
    if (action === 'keep') {
        bar?.hide();
        box()?.focus();
        return undefined;
    }
    if (action === 'prev' || action === 'next') {
        const i = state.hIdx + (action === 'next' ? 1 : -1);
        if (i < 0 || i >= state.history.length) return undefined;
        state.hIdx = i;
        setBox(state.history[i]);
        return showBar();
    }
    if (action === 'refine') return deps.openRefine();
    if (action === 'discard' || !last) {
        state.history = [];
        if (last) changeBox(last.original);
        bar?.hide();
        return undefined;
    }
    // Regenerate: the same request again
    return runDraft(last.kind, last.kind === 'continue' || last.kind === 'refine' ? last.text : last.selection ? undefined : last.text, last.subject, {
        original: last.original, fromBar: true, selection: last.selection, instruction: last.instruction,
    });
}

/** Refine: changes the result that is in the box now (including the person's own edits) in one way. */
export function refineDraft(instruction) {
    const last = state.lastRun;
    const current = (box()?.value ?? '').trim();
    if (!current || !instruction) return null;
    return runDraft('refine', current, last?.subject, { original: last?.original ?? current, fromBar: true, instruction });
}

/** The refine choices, for the sheet: [id, label, the change]. */
export const refineChoices = () => REFINES;

/* ------------------------------------------------------------------ */
/* Writing as                                                          */
/* ------------------------------------------------------------------ */

/** The name "Writing as" shows: the persona's or a character's own name (user data), or the narrator. */
export function writingAsName() {
    const r = roles(currentSubject(draftSettings()));
    return r.mode === 'narrator' ? { text: 'Narrator' } : { raw: r.who };
}

/** Next "Writing as" choice: remembered per character or group, otherwise the default. */
export function cycleWritingAs() {
    const s = draftSettings();
    const choices = subjectChoices();
    const now = currentSubject(s);
    const i = choices.indexOf(now === 'char' && choices[1]?.startsWith('member:') ? choices[1] : now);
    const next = choices[(i + 1) % choices.length];
    const key = chatKey();
    if (s.rememberSubject && key) s.subjectByChat[key] = next;
    else s.subject = next.startsWith('member:') ? 'char' : next;
    deps.save();
}

/** The note Enhance (or Write, with an empty box) would send right now, or '' outside a chat. */
export function previewNote() {
    const c = ctx();
    if (c.characterId === undefined && !c.groupId) return '';
    const s = draftSettings();
    const text = (box()?.value ?? '').trim();
    return buildNote(text ? 'enhance' : 'write', text, s, { subject: currentSubject(s) });
}

/** The built-in instruction for a custom-instruction field to start from. */
export function builtInInstruction(kind) {
    return buildNote(kind, kind === 'enhance' ? '{{draft}}' : '{{direction}}', { ...draftSettings(), templateEnhance: '', templateWrite: '' });
}

export { FIELDS };

/* ------------------------------------------------------------------ */
/* Start and stop                                                      */
/* ------------------------------------------------------------------ */

function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
}

function registerCommands() {
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx();
    if (!SlashCommandParser?.addCommandObject) return;
    for (const [name, alias, kind, helpString, argHelp] of COMMANDS) {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name,
            aliases: [alias],
            callback: safe('a Draft helper command', async (args, value) => (await runDraft(kind, String(value || '').trim() || undefined, args?.as ? String(args.as) : undefined)) ?? ''),
            returns: 'the text placed in the message box',
            namedArgumentList: [SlashCommandNamedArgument.fromProps({
                name: 'as', description: "who to write as, for this run only: user, char, narrator, or a group member's name", typeList: [ARGUMENT_TYPE.STRING],
            })],
            unnamedArgumentList: [SlashCommandArgument.fromProps({ description: argHelp, typeList: [ARGUMENT_TYPE.STRING] })],
            helpString,
        }));
    }
}

/** SillyTavern has no way to remove a command; its table is cleared of ours by hand, so turning off leaves nothing. */
function unregisterCommands() {
    const commands = ctx().SlashCommandParser?.commands;
    if (!commands) return;
    for (const [name, alias] of COMMANDS) {
        for (const key of [name, alias]) if (commands[key]?.name === name) delete commands[key];
    }
}

/**
 * What the legacy app hands over, set once (the settings page works while the Draft helper is off).
 * @param {{ context: () => any, settings: () => any, save: () => void, openRefine: () => void }} supplied
 */
export function setupDraft(supplied) {
    deps = supplied;
    useContext(() => deps.context());
}

/** Starts the Draft helper (the legacy app calls this while Pocket Tavern and the Draft helper switch are on). */
export function startDraft() {
    if (running || !deps || standaloneInstalled()) return;
    running = true;
    draftSettings();
    bar = draftBar({ onAction: safe('the Draft helper bar', barAction) });
    // Keep the focus, the selection and the phone keyboard in the message box when a bar button is pressed.
    listen(window, 'mousedown', safe('the Draft helper', event => {
        if (event.target instanceof Element && event.target.closest('#pt-draft-bar button')) event.preventDefault();
    }), true);
    listen(window, 'click', safe('the Draft helper', event => {
        if (event.target instanceof Element && event.target.closest(SEND_BUTTON)) bar?.hide(); // the message is on its way
    }), true);
    listen(document, 'keydown', safe('the Draft helper', event => {
        if (!(event.target instanceof Element) || !event.target.matches(MESSAGE_BOX)) return;
        if (event.key === 'Enter' && !event.shiftKey) bar?.hide(); // sending
        if (!draftSettings().shortcuts || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        // By physical key position, so any keyboard layout works.
        const fn = { KeyE: () => runDraft('enhance'), KeyW: () => runDraft('write'), KeyC: () => runDraft('continue'), KeyZ: undoDraft }[event.code];
        if (!fn) return;
        event.preventDefault();
        fn();
    }), true);
    const c = ctx();
    const onChat = safe('the Draft helper', () => {
        bar?.hide();
        state.history = [];
        state.lastRun = null;
    });
    c.eventSource.on(c.eventTypes.CHAT_CHANGED, onChat);
    listeners.push(() => c.eventSource.removeListener(c.eventTypes.CHAT_CHANGED, onChat));
    registerCommands();
}

/** Stops it and takes away everything it added. */
export function stopDraft() {
    if (!running) return;
    running = false;
    if (state.busy) cancelDraft();
    for (const remove of listeners.splice(0)) remove();
    unregisterCommands();
    bar?.destroy();
    bar = null;
    state.history = [];
    state.lastRun = null;
    state.undo = [];
}

export const draftRunning = () => running;
