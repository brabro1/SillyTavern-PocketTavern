# SillyTavern-PocketTavern — Engineering & Agent Rules

## Project Overview
**Pocket Tavern** (`SillyTavern-PocketTavern`) is a SillyTavern extension that provides a fast, calm, native-feeling interface for both phones and desktop while coexisting cleanly alongside native SillyTavern.

**Before making any UI, layout, or CSS change, read [`DESIGN.md`](DESIGN.md) in full.**

Plain ES modules and CSS, no build step:
- `index.js` — extension logic, shell, sheets, gestures, and compatibility patches
- `style.css` — all styles, scoped under `html.stmui-on` and its state classes
- `themes.js` — 14 flat Pocket Tavern themes and SillyTavern UI theme conversion
- `icons.js` — Lucide-style monochrome SVG icon set and Font Awesome mapping
- `i18n.js`, `locales.js` — translation lookup (`t()`) and 6-language dictionary (`es`, `pt`, `ru`, `zh`, `ja`, `ar`)
- `changelog.js`, `CHANGELOG.md` — in-app "What's new" feed and full release history
- `manifest.json`, `app.webmanifest` — SillyTavern extension manifest and PWA web manifest
- `termux/setup.sh` — one-tap Android/Termux launcher, updater, and stop shortcuts
- `tests/` — static checks, Playwright phone/desktop/iOS/compat/perf suites, audit, screenshots, and brand banner generator

### Two Layouts, One Core
**Phone layout** (Android, iPhone, iPad held upright) and **Desktop layout** (computers, tablets held sideways, `≥ 960×560`) share tokens, themes, and logic, but are designed separately. Before any change, decide **Phone**, **Desktop**, or **Both**, and state it in your plan, changelog, and summary.
- Phone-only styles go under `html:not(.stmui-wide)`; desktop-only styles go under `html.stmui-wide`.
- iPhone and iPad (WebKit/Safari) are core devices, not extras.

### Workflow
If the local `release` skill (`.claude/skills/release/`, gitignored) is present, follow it for reproducing reports, using the test copy (port `8123`), running tests, updating docs/screenshots/banner, versioning, and publishing.

---

## Non-Negotiable SillyTavern Coexistence Rules
Pocket Tavern works *alongside* SillyTavern and must never fight or corrupt it:
1. **Strict CSS Scoping:** Scope all styles under `html.stmui-on` (plus state classes `stmui-shell`, `stmui-chat`, `stmui-touch`, `stmui-wide`, `stmui-compact`, `stmui-docked`, `stmui-glass`, `stmui-rtl`, `stmui-ios-kb`, etc. on `<html>`) or Pocket Tavern-owned `.stmui-*` containers. Never style bare HTML elements (`body`, `html`, `button`, `input`, `textarea`, `a`, `::-webkit-scrollbar`) globally.
   - The `stmui` class/prefix and `mobileUI` settings key are kept intentionally so saved settings, drafts, card extensions, and users' custom CSS keep working.
   - Design tokens are `--pt-*` (documented in `DESIGN.md`); older `--stmui-*` variables alias them for backward compatibility and should not be used in new code.
2. **Official APIs & Untouched ST DOM:** Prefer SillyTavern's `eventSource`, `event_types`, `getContext()`, and official extension hooks. Never move SillyTavern's own DOM nodes—mark them with classes, hide them, or place them with CSS. Do not destructively monkey-patch core SillyTavern functions.
3. **Clean Mount & Teardown:** Toggling Pocket Tavern off must cleanly restore native SillyTavern with zero orphaned DOM nodes, zero leaked observers/timers/rAFs, zero stuck `overflow: hidden` or pointer-capture locks, and zero duplicate event listeners.
4. **Z-Index Discipline:** Use the documented `--pt-z-*` layers in `DESIGN.md`. Never trap or cover SillyTavern's native dialogs, popups, extension settings, or toast notifications.
5. **No Global Namespace Pollution & Safe Rendering:** Keep JS state encapsulated in ES modules. Never pass untrusted or user-authored content to `innerHTML`, and never pass raw user data (character names, chat text, lorebook titles/keywords, model/theme names) through `t()`.

---

## Mandatory Visual Verification Loop (Never Guess From Code)
Never assume a UI fix worked from CSS alone. For every visual, layout, or interaction change:
1. Run against a local SillyTavern instance: use the read-only local copy at `http://127.0.0.1:8000` only to inspect, and run any automated tests or setting changes against the isolated test copy (e.g. port `8123` with test data only).
2. Use Playwright (or the scripts in `tests/`) to load the extension, exercise the changed UI, and assert zero console errors.
3. Capture temporary screenshots to `tests/results/` (gitignored) across **both** viewports:
   - **Phone (`390×844`, plus `360px` / `412px` for composer/tool-row checks):** Chat view, focused composer, open sheets/menus, long messages/code blocks, light & dark themes, RTL, and toggling Pocket Tavern off/on.
   - **Desktop (`1440×900`, plus `960–1200px` for dual-panel checks):** Full chat layout, open side panels and tool panels, hover/focus states, and native SillyTavern view with Pocket Tavern off.
4. **Visually inspect every screenshot** before declaring work done—check for overlapping elements, horizontal overflow, clipping, broken alignment, low contrast, and native ST regressions.
5. Repeat **Fix → Re-Screenshot → Inspect** until zero visual defects and zero console errors remain.
6. Remove temporary scratch scripts before committing; never commit screenshots under `tests/results/`.

---

## Performance & Code Quality Standards
- **GPU-Only Animations:** Animate only `transform` and `opacity`. Never animate `height`, `width`, `top`, `left`, `margin`, `padding`, or `box-shadow`.
- **Observer & Listener Hygiene:** Throttle/debounce `MutationObserver`, `ResizeObserver`, `scroll`, `resize`, `pointermove`/`touchmove`, and `input` handlers. Always disconnect observers and cancel timers/rAFs when Pocket Tavern is inactive or unmounted.
- **Streaming Stability:** Keep DOM observers O(1) during token streaming (never run subtree `querySelector`/`querySelectorAll` per streamed node). Auto-scroll only when the user is already near the bottom; never hijack scroll if the user scrolled up.
- **No Dead Code:** Remove unused CSS rules, dead helpers, stale locale keys, and leftover debug logging.

---

## Checks
Run from `tests/` (Node 20+):
- `npm run check` (`node check.mjs`) — fast offline checks: module imports, theme WCAG contrast & flat backdrops, manifest/changelog version parity, `app.webmanifest`, icon integrity, `locales.js` completeness, and static CSS checks.
- `node phone.mjs` — end-to-end phone walkthrough plus desktop steps (requires running SillyTavern).
- `node ios.mjs` — iPhone and iPad viewports with simulated Safari keyboard; run in Chrome and with `ENGINE=webkit`.
- `node compat.mjs` — compatibility with Guided Generations, Input History, and Quick Replies (AI requests blocked).
- `node perf.mjs` — frame/style timing with Pocket Tavern on vs off (`PROFILE="<scenario>"` to profile a specific step).
- `node audit.mjs results/audit` — captures screens across viewports and keyboard states.
- `node screenshots.mjs` — retakes README screenshots against a test-data SillyTavern instance.
- `CHROME_CHANNEL=chrome node brand.mjs` — redraws `docs/brand/banner.png` and `social-preview.jpg` from local `docs/brand/banner.html` (no running SillyTavern needed).

## Never
- Commit credentials, personal SillyTavern data, chat histories, or the owner's character/lorebook names.
- Use the owner's real email in commands or commits (use GitHub's noreply identity).
- Post publicly (Reddit, etc.) on the owner's behalf—draft text for the owner to post.
