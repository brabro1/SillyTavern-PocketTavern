// Starts Pocket Tavern (AGENTS.md → Rules, 10). During the 3.0 remake the 2.x app in legacy/app.js
// still runs everything that has not been rebuilt yet (AGENTS.md → Status).
//
// Order matters: imports run in the order they are written, so the prelude (storage keys,
// translations) is done before the legacy app loads.
import './core/prelude.js';
import { startAll } from './core/lifecycle.js';
import { resumeLegacy, startLegacy } from './legacy/app.js';

export { onPocketTavernUpdate } from './legacy/app.js';

startAll([
    { name: 'the 2.x app', start: startLegacy, resume: resumeLegacy },
]);
