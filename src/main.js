// Starts Pocket Tavern. During the 3.0 remake the 2.x app in legacy/app.js still runs everything
// that has not been rebuilt yet (AGENTS.md → Status).
//
// Order matters: imports run in the order they are written. The storage keys move to their 3.0
// names first, because the legacy app reads them as soon as it loads.
import './core/migrate-storage.js';
export { onPocketTavernUpdate } from './legacy/app.js';
