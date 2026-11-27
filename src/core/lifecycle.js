// Starting and stopping Pocket Tavern safely (AGENTS.md → Rules, 3 and 10).
//
// - startAll() starts the parts in order. If one throws, the parts already started stop again in
//   reverse order and the crash fallback runs: all or nothing.
// - stopAll() stops them in reverse order; one stop that throws never keeps the rest from running.
// - safe() wraps every callback Pocket Tavern hands to SillyTavern or the browser. The first error
//   stops Pocket Tavern for this visit, so SillyTavern's own screens show, with one toast.
// - While started, a page-wide listener does the same for uncaught errors thrown from Pocket
//   Tavern's own files: a net under safe(), for anything a wrapper misses.
import { t } from './i18n.js';

const LOG = '[Pocket Tavern]';
/** Pocket Tavern's folder (…/third-party/<folder>/), to tell our errors from everyone else's. */
const ROOT = new URL('../../', import.meta.url).href;

/** @type {{ name: string, stop?: () => void }[]} */
let running = [];
/** @type {{ name: string, start: () => (void | (() => void)), resume?: () => (void | (() => void)) }[]} */
let parts = [];
let crashed = false;

/** True after an error stopped Pocket Tavern, until it is started again. */
export function hasCrashed() {
    return crashed;
}

/** The URL of the first stack frame that names a file, or "". Chrome writes "at fn (url)", Firefox and Safari "fn@url". */
function topFrame(error) {
    for (const line of String(error?.stack ?? '').split('\n')) {
        if (!/^\s*at\s|@/.test(line)) continue;
        const match = line.match(/(?:https?|file):\/\/[^\s)]+/);
        if (match) return match[0];
    }
    return '';
}

const fromUs = url => typeof url === 'string' && url.startsWith(ROOT);

function onPageError(event) {
    if (fromUs(event.filename) || fromUs(topFrame(event.error))) crash('an event handler', event.error ?? event.message);
}

function onPageRejection(event) {
    if (fromUs(topFrame(event.reason))) crash('a background task', event.reason);
}

/**
 * Stops Pocket Tavern after an error it cannot recover from and shows SillyTavern's own screens.
 * Runs once; later errors are ignored until startAll() runs again.
 */
export function crash(source, error) {
    if (crashed) return;
    crashed = true;
    console.error(LOG, `Stopped after an error in ${source}. SillyTavern's own screens are showing.`, error);
    stopAll();
    try {
        globalThis.toastr?.warning?.(t("Something went wrong in Pocket Tavern, so SillyTavern's own screens are showing. Your chats are safe."), '', { timeOut: 10000 });
    } catch {
        // No toast; the console has the details.
    }
}

/** Wraps a callback so an error in it stops Pocket Tavern cleanly instead of breaking SillyTavern. */
export function safe(source, callback) {
    return function guarded(...args) {
        if (crashed) return undefined;
        try {
            const result = callback.apply(this, args);
            if (result && typeof result.then === 'function') return result.catch(error => crash(source, error));
            return result;
        } catch (error) {
            crash(source, error);
            return undefined;
        }
    };
}

/**
 * Starts the parts in order. Each `start()` may return its stop function. A part that throws
 * while starting undoes its own half-start before it throws; the parts before it are stopped here.
 * @param {{ name: string, start: () => (void | (() => void)), resume?: () => (void | (() => void)) }[]} list
 * @returns {boolean} false when a part failed and everything was stopped again
 */
export function startAll(list) {
    parts = list;
    return run(part => part.start());
}

/**
 * After an error stopped everything: starts the parts again (the Back to Pocket Tavern pill).
 * A part with `resume` picks up where it was instead of starting from scratch.
 * @returns {boolean} false when it was not stopped, or a part failed again
 */
export function restartAll() {
    if (!crashed) return false;
    return run(part => (part.resume ?? part.start)());
}

function run(begin) {
    crashed = false;
    globalThis.addEventListener?.('error', onPageError);
    globalThis.addEventListener?.('unhandledrejection', onPageRejection);
    for (const part of parts) {
        try {
            running.push({ name: part.name, stop: begin(part) || undefined });
        } catch (error) {
            crash(`starting ${part.name}`, error);
            return false;
        }
    }
    return true;
}

/** Stops every started part, last started first. */
export function stopAll() {
    globalThis.removeEventListener?.('error', onPageError);
    globalThis.removeEventListener?.('unhandledrejection', onPageRejection);
    const parts = running;
    running = [];
    for (const { name, stop } of parts.reverse()) {
        try {
            stop?.();
        } catch (error) {
            console.error(LOG, `Stopping ${name} failed.`, error);
        }
    }
}
