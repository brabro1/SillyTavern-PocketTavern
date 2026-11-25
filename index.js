// Pocket Tavern's entry point, named in manifest.json. It only imports; the app starts in src/main.js.
// manifest.json's hooks call functions by name from this module, so it re-exports them.
export * from './src/main.js';
