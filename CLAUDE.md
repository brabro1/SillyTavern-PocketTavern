# SillyTavern-PocketTavern — Engineering & Agent Rules

## Project Overview
`SillyTavern-PocketTavern` is a SillyTavern extension that provides a fast, polished, native-feeling chat interface for both mobile phones and desktop—while coexisting cleanly alongside native SillyTavern.

**Before making any UI, layout, or CSS change, read `DESIGN.md` in full.**

---

## Non-Negotiable SillyTavern Coexistence Rules
PocketTavern must work *alongside* SillyTavern, never fight or corrupt it:
1. **Strict CSS Scoping:** 100% of PocketTavern styles MUST be scoped under a dedicated root selector (e.g., `.pt-root` or `#pocket-tavern`). Never style bare HTML elements (`body`, `html`, `button`, `input`, `textarea`, `a`, `::-webkit-scrollbar`) globally.
2. **Official APIs Only:** Prefer SillyTavern's `eventSource`, `event_types`, `getContext()`, and official extension hooks. Do not destructively monkey-patch core SillyTavern functions.
3. **Clean Mount & Teardown:** Toggling PocketTavern on/off must cleanly restore native SillyTavern with zero orphaned DOM nodes, zero stuck `overflow: hidden` scroll locks, and zero duplicate event listeners.
4. **Z-Index Discipline:** Never trap or cover SillyTavern's native modals, popups, extension settings, or toast notifications. Keep PocketTavern's z-index layers documented and minimal.
5. **No Global Namespace Pollution:** Keep JS state encapsulated in ES modules or a single namespace object.

---

## Mandatory Visual Verification Loop (Never Guess From Code)
Never assume a UI fix worked just because the CSS looks right. For every visual, layout, or interaction change:
1. Connect to the running local SillyTavern instance at `http://127.0.0.1:8000` (ask the user if a different port is used).
2. Use Playwright (Playwright MCP if available, otherwise a temporary headless Chromium script) to load the extension, interact with it, and check for console errors.
3. Capture screenshots to `/tmp/pt-audit/` across **both** viewports:
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
