// Runs the storage-key migration on import, before the legacy app loads (see src/main.js).
// It moves into src/main.js's boot once the legacy app no longer reads storage while it loads (M1a).
import { migrateStorageKeys } from './settings.js';

migrateStorageKeys();
