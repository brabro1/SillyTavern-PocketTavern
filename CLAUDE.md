# SillyTavern-PocketTavern — Engineering & Agent Rules

## Project Overview
`SillyTavern-PocketTavern` is a SillyTavern extension that provides a fast, polished, native-feeling chat interface for both mobile phones and desktop—while coexisting cleanly alongside native SillyTavern.

**Before making any UI, layout, or CSS change, read `DESIGN.md` in full.**

Plain JavaScript and CSS, no build step. Files: `index.js` (logic and markup), `style.css`, `themes.js`, `icons.js`, `locales.js`, `changelog.js`.

### Two layouts, one core
**Pocket Tavern on phones** (Android, iPhone, iPad held upright) and **Pocket Tavern on desktop** (computers, tablets held sideways) share tokens, themes and logic but are designed separately. Before any change, decide **Phone**, **Desktop** or **Both**, and say so in the plan, the changelog and the reply. Phone-only styles go under `html:not(.stmui-wide)`, desktop-only under `html.stmui-wide`. iPhone and iPad are core devices, not extras.

### Workflow
Use the `release` skill (`.claude/skills/release/`, kept out of git) for every change: reproducing a report, the test copy, tests, docs, screenshots, the banner, versioning and publishing.

---

## Non-Negotiable SillyTavern Coexistence Rules
PocketTavern must work *alongside* SillyTavern, never fight or corrupt it:
1. **Strict CSS Scoping:** 100% of PocketTavern styles MUST be scoped under a dedicated root selector (e.g., `.pt-root` or `#pocket-tavern`). Never style bare HTML elements (`body`, `html`, `button`, `input`, `textarea`, `a`, `::-webkit-scrollbar`) globally.
   - **In this codebase the root is `html.stmui-on`** (plus the state classes `stmui-shell`, `stmui-chat`, `stmui-wide` and others on `<html>`), added and removed by Pocket Tavern. The `stmui` names are kept on purpose: settings, drafts, character and chat data and users' custom CSS depend on them. Design tokens are `--pt-*`; the older `--stmui-*` tokens point at them.
2. **Official APIs Only:** Prefer SillyTavern's `eventSource`, `event_types`, `getContext()`, and official extension hooks. Do not destructively monkey-patch core SillyTavern functions.
3. **Clean Mount & Teardown:** Toggling PocketTavern on/off must cleanly restore native SillyTavern with zero orphaned DOM nodes, zero stuck `overflow: hidden` scroll locks, and zero duplicate event listeners.
4. **Z-Index Discipline:** Never trap or cover SillyTavern's native modals, popups, extension settings, or toast notifications. Keep PocketTavern's z-index layers documented and minimal.
5. **No Global Namespace Pollution:** Keep JS state encapsulated in ES modules or a single namespace object.

---

## Mandatory Visual Verification Loop (Never Guess From Code)
Never assume a UI fix worked just because the CSS looks right. For every visual, layout, or interaction change:
1. Connect to the running local SillyTavern instance at `http://127.0.0.1:8000` (ask the user if a different port is used). Use it to look; anything that changes settings or data runs on the test copy (port 8123, see the release skill). Phone bugs are checked on the owner's phone over USB (adb, release skill).
2. Use Playwright (Playwright MCP if available, otherwise a temporary headless Chromium script) to load the extension, interact with it, and check for console errors.
3. Capture screenshots to the session scratchpad (the `/tmp/pt-audit/` of this rule) across **both** viewports:
   - **Mobile (`390x844`):** Chat view, focused composer, open drawers/menus, long messages/code blocks, and toggling PocketTavern off/on.
   - **Desktop (`1440x900`):** Full chat layout, open panels, hover/focus states, and native SillyTavern view with PocketTavern loaded.
4. **Visually inspect every PNG screenshot** before declaring a task done. Look specifically for:
   - Overlapping text, icons, or buttons
   - Horizontal overflow or clipped elements
   - Broken alignment, awkward spacing, or low contrast
   - Native SillyTavern UI corruption
5. Repeat **Fix → Re-Screenshot → Inspect** until there are zero visual defects and zero console errors.
6. Delete temporary scripts and `/tmp/pt-audit/` artifacts before finishing; never commit screenshots to git.

---

## Performance & Code Quality Standards
- **GPU-Only Animations:** Animate only `transform` and `opacity`. Never animate `height`, `width`, `top`, `left`, `margin`, `padding`, or `box-shadow`.
- **Observer Hygiene:** Debounce/throttle `MutationObserver`, `ResizeObserver`, `scroll`, and `input` handlers. Always disconnect observers when PocketTavern is inactive or unmounted.
- **Streaming Stability:** During token streaming, auto-scroll smoothly only when the user is already near the bottom. Never hijack scroll if the user scrolled up to read earlier messages.
- **No Dead Code:** Remove unused CSS rules, dead helper functions, and leftover debug `console.log` statements.

---

## Checks
From `tests/`: `npm run check`, `node phone.mjs` (the phone walkthrough plus desktop steps), `node ios.mjs` (iPhone and iPad; also with `ENGINE=webkit`), `node compat.mjs`, `node perf.mjs`. `node screenshots.mjs` retakes the README screenshots and `node brand.mjs` redraws the banner; both need a running SillyTavern with test data (see the header of each file).

## Never
- Commit credentials, personal SillyTavern data, chat histories or the owner's character and lorebook names.
- Use the owner's real email in commands or commits (see the release skill for the commit identity).
- Post on Reddit or anywhere public. Draft the text; the owner posts it.
