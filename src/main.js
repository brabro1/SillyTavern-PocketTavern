// Starts Pocket Tavern (AGENTS.md → Rules, 10): src/core/start.js waits for SillyTavern and wires every part;
// src/core/lifecycle.js starts it all or nothing and falls back to SillyTavern after an error.
//
// Order matters: imports run in the order they are written, so the prelude (storage keys,
// translations) is done before the rest loads.
import './core/prelude.js';
import { startAll } from './core/lifecycle.js';
import { resumeApp, startApp } from './core/start.js';

export { onPocketTavernUpdate } from './features/auto-reload.js';

startAll([
    { name: 'Pocket Tavern', start: startApp, resume: resumeApp },
]);
