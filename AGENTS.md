# Pocket Tavern: Agent Guide

**Pocket Tavern** (`SillyTavern-PocketTavern`) is a SillyTavern extension that turns SillyTavern into one calm, fast app on phones and computers. It is plain ES modules and CSS with no build step. This file is the single source of truth for how anyone, human or AI agent, works on this repo.

Read in this order:
1. **This file**: how we work, what must never break.
2. **[`DESIGN.md`](DESIGN.md)**: read it in full before any UI, layout, CSS or wording change.
3. **[`docs/development.md`](docs/development.md)**: setup, running SillyTavern for tests, every test command.

---

## 1. Status: the 3.0 remake

Pocket Tavern is being rebuilt as 3.0: a new module structure, a five-place navigation map, and one component system (see `DESIGN.md`).

**Carve, don't rewrite blind.** M0 moves the 2.x code whole into `src/legacy/app.js` and `styles/legacy.css`. Every later milestone takes its part out of the legacy files, builds it new, and **deletes the old part in the same change**. Never keep two versions of one feature. Until a milestone lands, the legacy code stays in charge of what it has not replaced. By M7 the legacy files are empty and are deleted.

**Branches:** M0 lands on `main` (no visible change; it can ship as a 2.x patch). M1–M7 are built on the `3.0` branch, so people updating from `main` never get a half-new app. Testers install the branch. A 2.x hotfix on `main` is merged into `3.0` at once. `3.0` merges into `main` at the release.

**Order and lanes** (a lane is one agent or session, in its own worktree when lanes run at once):

```
M0 ──► M1·0 ──► M1a ─┬─► M1b ┐
                     └─► M1c ┴─► M2 ∥ M3 ∥ M4 ∥ M5 ──► M6 ──► M7
```

| Milestone | Lane and scope | Done when | Status |
|---|---|---|---|
| M0 | One lane. `index.js` and `style.css` only import; 2.x code moves to `src/legacy/` and `styles/legacy.css`; `icons.js`, `themes.js`, `i18n.js`, `locales.js` move into `src/` and `locales/`; location-dependent URLs, `check.mjs` and CI follow | `check`, `phone.mjs`, `ios.mjs` (Chrome and WebKit) and `compat.mjs` pass unchanged; screenshots match 2.28.1 | done |
| M1·0 | One lane, alone (touches everything). Rename `stmui-` → `pt-` everywhere, legacy included; migrate `stmui_*` localStorage keys | Same as M0, with the new names | done |
| M1a | Core/ST. `src/core/lifecycle.js` (mount order, `safe()`, crash fallback, reverse teardown), `src/core/settings.js` (version and migrations), `src/st/selectors.js`, popup watch, translations split per language with a section per area | A forced error falls back to SillyTavern; turning off leaves nothing | done |
| M1b | UI, after M1a's lifecycle API. `styles/tokens.css`, `base.css`, every component in `DESIGN.md` → Components, a test page that screenshots each | Component screenshots pass review on both layouts, light, dark, RTL | done |
| M1c | Shell, beside M1b. `src/shell/layout.js` (Automatic/Phone/Desktop, the keyboard rule), tab bar and rail, page stacks and back order, sheet/dialog/popover with the shared close, "Use SillyTavern for now" and the Back pill | The new tab bar and rail lead to the existing (legacy) screens | done |
| M2 | Chats and the chat: 2a Chats home and Search everything · 2b chat header, ⋯, messages, versions, thinking, chat-switch loading · 2c message box, `+`, context ring, banners | Their legacy parts are deleted; `e2e/chats.mjs`, `e2e/chat.mjs` pass | done |
| M3 | Characters: grid and A–Z, character page, character editor (restyled) | Legacy part deleted; `e2e/characters.mjs` passes | done |
| M4 | AI: status card, quick rows, SillyTavern's connection, sampler, prompt and formatting screens (restyled) | Legacy part deleted; `e2e/ai.mjs` passes | done |
| M5 | Settings (hub, Appearance, Personas, Pocket Tavern, About; retired switches migrated) and Lorebooks | Legacy part deleted; `e2e/settings.mjs`, `e2e/lorebooks.mjs` pass | planned |
| M6 | One lane, after M2. Every compatibility patch into `src/compat/`, checked with the real extensions; tool row measured at 320, 360, 412 | `compat.mjs` passes with each extension on | planned |
| M7 | One lane. Legacy files deleted; README, guide, screenshots, banner, changelogs, a note on renamed classes; 3.0.0 beta on the branch, then release after the owner's OK | CI green on `main`, release published | planned |

- **Parallel lanes** (M1b ∥ M1c, then M2 ∥ M3 ∥ M4 ∥ M5) each own their `src/views/<view>.js`, `styles/views/`, `src/st/<screen>.js`, `styles/st/<screen>.css`, and their own section in `src/st/selectors.js` and in each `locales/` file. QA writes `tests/e2e/<view>.mjs` beside each lane. Docs checks the translations when a lane ends.
- **Owner reviews** with screenshots after M0, after M1, after M2–M5, and before the release.
- **Guards:** screenshots are compared with 2.28.1 after M0 and M1·0; `perf.mjs` runs in every lane while legacy and new code run side by side.

Update the Status column in the same commit that finishes a milestone. Delete this section after 3.0.0 ships.

**Names changed in M1·0.** 2.x used the `stmui` prefix; 3.0 uses `pt` everywhere:

| Old (2.x) | New (3.0) |
|---|---|
| `html.stmui-on` | `html.pt-on` |
| `html.stmui-shell`, `html.stmui-chat` (the app-shell and chat-look switches) | `html.pt-shell`, `html.pt-chat`, until those switches go (M1c, M2). `html.pt-in-chat` (a chat is open) is new in M1c |
| `html.stmui-wide` | `html.pt-desktop`. `html.pt-phone` arrives with `src/shell/layout.js` (M1c); then exactly one of the two is on |
| `stmui-touch`, `-compact`, `-docked`, `-glass`, `-rtl`, `-ios-kb`, `-motion-off`, … | `pt-touch`, `pt-compact`, `pt-docked`, `pt-glass`, `pt-rtl`, `pt-ios-kb`, `pt-motion-off`, … |
| `.stmui-*` / `#stmui-*` / `#stmui_*` elements, `data-stmui-*`, `dataset.stmui*` | `.pt-*` / `#pt-*` / `#pt_*`, `data-pt-*`, `dataset.pt*` |
| `--stmui-*` aliases of the tokens (`--stmui-surface`, `--stmui-line`, …) | removed; uses point at the token itself (`--pt-bg`, `--pt-border`, …). Other `--stmui-*` variables are now `--pt-*` |
| `stmui_*` localStorage keys | `pt_*`, copied once by `src/core/settings.js`; the old keys stay so 2.x still works |
| `mobileUI` settings key | **unchanged, never renamed** (users' saved settings live there) |

---

## 2. Repo map and ownership

```
index.js              entry named in manifest.json; only imports src/main.js
style.css             entry named in manifest.json; only @imports styles/
src/
  main.js             boot: settings, decide if active, mount, register teardown
  core/               SillyTavern bridge (getContext, events), settings + migrations,
                      lifecycle (mount, teardown, safe(), crash fallback),
                      h() safe DOM builder, i18n
  shell/              tab bar / rail, headers, page stack, sheet ⇄ dialog ⇄ popover,
                      back gesture, keyboard and viewport handling
  ui/                 components: buttons, rows, fields, number field, picker,
                      switch, segmented, banner, toast, icons
  views/              chats, chat, message box, messages, characters, character,
                      ai, lorebooks, settings, search
  st/                 selectors.js (every SillyTavern selector), hooks that mark,
                      hide and restyle SillyTavern's own screens, popup watch
  compat/             one file per other extension (guided-generations.js, …)
  features/           translate, drafts, context ring, server watch, pictures
  themes/             themes and SillyTavern theme conversion
  legacy/             app.js: the 2.x code, carved out milestone by milestone (gone by M7)
locales/              one file per language, loaded only when that language is on
styles/               tokens.css, base.css, components/, views/, st/, compat/,
                      legacy.css (the 2.x styles, gone by M7)
tests/                check.mjs, e2e/ (one file per view), ios, compat, perf,
                      capture (audit + README screenshots), brand
docs/                 guide.md (users), development.md (developers), brand/, screenshots/
termux/setup.sh       one-tap Android start, update and stop shortcuts
changelog.js          in-app What's new (latest releases only)
CHANGELOG.md          full release history
```

| Role | Owns | Does |
|---|---|---|
| **Design/UX** | `DESIGN.md` | Decides patterns, layouts and words. Writes the rule in `DESIGN.md` *before* a new pattern is built |
| **UI & Styles** | `src/ui/`, `src/views/`, `src/shell/`, `styles/` (except `st/`, `compat/`) | Builds components and Pocket Tavern's own views to `DESIGN.md` |
| **Core/ST integration** | `src/main.js`, `src/core/`, `src/st/`, `src/compat/`, `src/features/`, `src/themes/`, `styles/st/`, `styles/compat/` | Talks to SillyTavern, keeps data safe, mount and teardown, other extensions |
| **QA & verification** | `tests/` | Writes and runs tests, takes and inspects screenshots, files findings with a way to reproduce. Never fixes product code in the same change |
| **Docs & localization** | `README.md`, `docs/`, `locales/`, `CHANGELOG.md`, `changelog.js`, `CONTRIBUTING.md`, `.github/` | User guide, developer guide, release notes, all six translations |

One agent can hold several roles. The roles exist so parallel work does not collide:
- **One writer per file at a time.** Claim files in your task card. If you need a change in a file someone else owns, hand it to that role (or ask the owner of the task) instead of editing it.
- Views never import other views. They share state through `src/core/` (settings, events) and components through `src/ui/`.
- Anything new in the UI first gets its rule in `DESIGN.md`. If the rule is missing, stop and write or ask for it.

---

## 3. Tasks and handoffs

Every task, whether it comes from the owner, an issue or another agent, starts as a card:

```
Task:      one line, in the user's words
Layout:    Phone | Desktop | Both
Role:      which role from section 2
Files:     the files you will change (your claim)
Done when: what someone sees or can do afterwards
Checks:    which tests and screenshots prove it
```

- **Small, checkable slices.** One component, one view, or one fix per change, and every slice leaves `main` green. Split anything that would take more than one review to understand.
- **Layout first.** Decide Phone, Desktop or Both before planning. Phone-only CSS goes under `html.pt-phone`, desktop-only under `html.pt-desktop`. iPhone and iPad (Safari/WebKit) are core devices, never extras.
- **Handoff note** when you finish or stop: what changed, what you checked (with screenshot paths), what is left, and anything risky. Write it so the next agent needs nothing else.
- **Reproduce before fixing.** A report names a symptom. Reproduce it on the test instance, measure positions and computed styles, then change code.

---

## 4. Rules that never bend

1. **User data is sacred.** Characters, chats, lorebooks, presets, personas and settings are changed only through SillyTavern's own controls or functions (`getContext()`, its exported functions, its own buttons). Pocket Tavern never writes SillyTavern files itself, never re-implements saving, and never deletes anything without the user choosing to, through SillyTavern's own delete path.
2. **Settings stay readable.** Pocket Tavern's settings live under `extension_settings.mobileUI`. Every change to their shape gets a migration in `src/core/settings.js`: forward-only, it never throws, and it keeps working when keys are missing or unknown.
3. **Clean on and off.** Turning Pocket Tavern off (or "Use SillyTavern for now") leaves native SillyTavern exactly as it was: no leftover nodes, classes, inline styles, observers, timers, animation frames, listeners, scroll locks or pointer capture. Every mount registers its teardown in the lifecycle registry. The e2e suite checks this.
4. **Never move SillyTavern's nodes.** SillyTavern and other extensions find their elements by structure. You may add classes and attributes, hide, place with CSS, read, and `click()` hidden controls. To replace a screen, build Pocket Tavern's own view and hide SillyTavern's while Pocket Tavern is on (section 5).
5. **Scoped CSS only.** Every rule sits under `html.pt-on` or a Pocket Tavern-owned `.pt-*` element. Never style bare elements globally (`body`, `button`, `input`, `a`, `::-webkit-scrollbar`).
6. **Safe rendering.** Build DOM with `h()` and text nodes. Never put user-authored content (names, chat text, lorebook entries, model or theme names) into `innerHTML`, and never run it through `t()`.
7. **Official APIs first.** Use `getContext()`, `eventSource` / `event_types` and SillyTavern's exported functions. Do not patch SillyTavern's functions. If a patch is truly unavoidable (the clipboard fallback), it is documented at the patch and undone on teardown.
8. **Z-index bands only** (`DESIGN.md`, Tokens). Never cover SillyTavern's own popups, extension settings or toasts. While one of SillyTavern's popups is open, Pocket Tavern steps aside (`html.pt-st-popup`, `DESIGN.md` → Layouts).
9. **No globals.** State lives in modules. Nothing is added to `window`.
10. **Fail back to SillyTavern.** A bug in Pocket Tavern must never leave someone without a working SillyTavern.
    - Every callback Pocket Tavern hands to SillyTavern or the browser (events, observers, timers, animation frames, listeners) is wrapped in `safe()` from `src/core/lifecycle.js`. Until it is gone, the legacy app is covered instead by a page-wide listener that reacts only to uncaught errors whose top stack frame is in Pocket Tavern's folder.
    - The first uncaught error tears Pocket Tavern down and switches to SillyTavern for this visit, as "Use SillyTavern for now" does. It logs once with the `[Pocket Tavern]` prefix and shows one toast (`DESIGN.md` → Using native SillyTavern). Errors after that are ignored until Pocket Tavern is started again (the Back to Pocket Tavern pill or a reload).
    - **Mounting is all-or-nothing.** Parts mount in order. If one throws, the parts already mounted are torn down in reverse order and the crash fallback runs.
    - **Teardown runs in reverse order**, and each teardown is wrapped on its own, so one that throws never stops the rest.

---

## 5. Restyle, replace, or hide?

Permission is given to replace SillyTavern's screens when it makes a cleaner app. Decide with this table:

| Choose | When | How |
|---|---|---|
| **Replace** with a Pocket Tavern view | People use the screen daily; SillyTavern's layout fights the map in `DESIGN.md`; the same data needs a different structure | Build it in `src/views/`. **Read** data through `getContext()` and events. **Write** through SillyTavern's own control or function (set the hidden control's value and fire its event, `click()` its button, or call its exported function). Hide SillyTavern's screen while Pocket Tavern is on |
| **Restyle** SillyTavern's screen | Long settings forms, screens with complex saving or validation, screens other extensions add to, screens SillyTavern changes often | Mark with classes from `src/st/`, style with tokens in `styles/st/`. Long screens show their sections as rows that open pages, by hiding the other sections, never by moving them |
| **Hide** | The control means nothing in Pocket Tavern (panel locks, SillyTavern's own navigation, repeated titles) | `display: none` under `html.pt-on`, listed in `DESIGN.md` → SillyTavern's own screens |

Never copy SillyTavern's markup into a Pocket Tavern view, and never keep a second copy of its saving logic. Current decisions per screen are in `DESIGN.md` → SillyTavern's own screens.

---

## 6. Engineering standards

- **Modules:** one job per file, named exports, aim for files under about 600 lines. No circular imports. No dead code, unused CSS, stale locale keys or debug logging.
- **CSS:** colours, type, spacing, radii, motion and z-index come only from the `--pt-*` tokens and scales in `DESIGN.md` (`npm run check` enforces them). Use logical properties (`margin-inline-start`, `inset-inline-end`) so Arabic mirrors. `!important` is allowed only in `styles/st/` and `styles/compat/`, each one with a comment saying what it beats. Cascade layers (`@layer`) are not used: SillyTavern's unlayered CSS would beat every layer.
- **Performance:**
  - Animate only `transform` and `opacity`.
  - Throttle or debounce observers and `scroll`, `resize`, `input` and `pointermove` handlers. Disconnect them when they are not needed.
  - While a reply streams, work stays O(1): never run `querySelectorAll` per streamed token.
  - Auto-scroll only when the user is already at the bottom.
  - Load heavy or rare things (locales, translation, the picture viewer) when first needed.
  - Measure "performance" changes with `perf.mjs` before keeping them.
- **Accessibility:**
  - Touch targets are 44×44px or more.
  - Every control shows a `:focus-visible` ring.
  - Icon-only buttons have an `aria-label` through `t()`.
  - Text and controls meet WCAG AA in every theme.
  - Dialogs and sheets trap focus and give it back.
  - `prefers-reduced-motion` and Pocket Tavern's Reduce motion are honoured.
- **SillyTavern's selectors live in one file.** Every id, class or attribute of SillyTavern's that Pocket Tavern looks for is a named constant or lookup in `src/st/selectors.js`, grouped by screen (chat, message box, panels, popups, …). Other files import those names and never write `'#send_textarea'` themselves. When a SillyTavern update renames something, the fix is one line. Other extensions' selectors stay in their own `src/compat/<extension>.js`. From M1, `npm run check` flags SillyTavern ids written anywhere else.
- **Compatibility with other extensions:** each patch lives in `src/compat/<extension>.js` and `styles/compat/<extension>.css`, is keyed on that extension's own markup, and does nothing when it is absent. Check it with the real extension installed in the test instance, not a stand-in.
- **Other projects' code:** Pocket Tavern is MIT. Code may be copied only from MIT-compatible licences (MIT, BSD, ISC, Apache-2.0), with credit in the README. GPL and AGPL projects (SillyTavern itself, AstraProjecta, many extensions) are for reading and ideas only: write our own code.
- **Words:** every visible label goes through `t()` and gets a row in every `locales/` file (`es`, `pt`, `ru`, `zh`, `ja`, `ar`). Use double quotes for English strings with apostrophes. Words follow the layout: "tap" on phones, "click" on desktop.
- **Old Safari:** no regex lookbehind (`(?<=`, `(?<!`). It stops the whole extension loading on iPhones before iOS 16.4.

---

## 7. Definition of done

Code that has not been seen running is not done. For every change:

1. `cd tests && npm run check`: offline checks (imports, theme contrast, scales, versions, locales).
2. The e2e tests for the area you touched, against a **test** SillyTavern instance (never the owner's real data). Add `ios.mjs` in Chrome **and** `ENGINE=webkit` for anything on phones, fixed layers or the keyboard. Add `compat.mjs` for compatibility work and `perf.mjs` for typing, scrolling, streaming or opening screens. Add a test step for every fix and feature. It sets up its own data and restores settings in a `finally`.
3. Screenshots into `tests/results/` (gitignored), and **look at every one**:
   - **Phone 390×844**, plus 360 and 412 wide for the message box, and 320 wide when tools were added.
   - **Desktop 1440×900**, plus 1024×700 with the panel and a tool panel open.
   - Light and dark themes, Arabic (RTL) when layout changed, and with Pocket Tavern turned off.
   - Look for overlap, clipping, horizontal overflow, misalignment, low contrast, and damage to native SillyTavern.
4. Zero console errors from Pocket Tavern.
5. Docs in the same change: `DESIGN.md` if a rule changed, `locales/` for new words, and at release time the changelogs, README, guide and screenshots.

Repeat fix, screenshot, inspect until clean. Delete scratch scripts before committing.

---

## 8. Commits and releases

- Commit messages: `area: what changed` for work commits, `X.Y.Z: summary` for releases.
- Commit as `brabro1 <155927020+brabro1@users.noreply.github.com>`. Never use anyone's real email. End with the `Co-Authored-By` line your tool asks for.
- **Never commit** credentials, personal SillyTavern data, chats, the owner's character or lorebook names, `tests/results/`, or scratch scripts.
- **Ask the owner before** pushing, publishing a release, or anything public. Never post on Reddit, Discord or similar: draft the text for the owner to post.
- **A release** bumps `manifest.json` (patch for fixes, minor for features, major for 3.0), adds a `changelog.js` entry (2–5 plain items, saying "On a phone, …" or "On a computer, …" when not both) and a `CHANGELOG.md` section (grouped under Phone, Desktop, Both). It also refreshes the README, `docs/guide.md` and any screenshots or banner that changed. It is done when CI is green. Then reply on and close the issues it fixes, and publish the GitHub release (`gh release create vX.Y.Z`).

---

## 9. Known traps

Each of these broke a release once, ours or another SillyTavern interface's.

- **Containing blocks:** `transform`, `filter`, `backdrop-filter`, `contain` or `will-change: transform` on an ancestor makes it the containing block of `position: fixed` children. Full-screen editors were then drawn thousands of pixels off screen. Never put these on ancestors of fixed layers, and test with SillyTavern's blur **on** (remove `body.no-blur`).
- **Safari's keyboard** does not shrink the layout viewport. Fixed and input-bearing layers follow `--pt-ios-top` / `--pt-ios-h` while `html.pt-ios-kb` is on. Never rely on `100dvh` alone.
- **Android's keyboard** shrinks the window. The chat and the message box must move as one piece. SillyTavern already keeps the chat's bottom in place when `#chat` resizes, so do not adjust `scrollTop` as well. Trace movement frame by frame (`requestAnimationFrame` samples), not from screenshots.
- **The root page never scrolls.** Anything hidden must leave layout (`display: none`). A tucked bar below the screen once made the page scroll when a field was focused.
- **Fixed layers built from list items** need `align-self: stretch`. Bubbles' `align-self: flex-end` shrank the message editor.
- **Check every variant:** Cards, Bubbles and Flat; floating and docked message box; comfortable and compact; light and dark; RTL.
- **Other extensions:** stand-ins are not enough. Moonlit Echoes' mask hid the editor's buttons and its `!important` variables shrank the top bar. Popups are not always `<dialog>` (Guided Generations uses `.gg-popup`). Buttons added next to Send squeeze it, so measure the tool row at 320, 360 and 412 wide with the extensions on. Install the common extensions and look before writing a general rule for "anything an extension adds".
- **Older SillyTavern rules break newer SillyTavern.** When something is cut off, walk up from the element printing each parent's height, max-height and overflow. Pages made from SillyTavern's `.drawer-content` must undo its `min-width: 450px` and its max-height cap.
- **Popups are pinned to all four edges:** use `height: fit-content` with `inset: 0; margin: auto`, never `height: auto`.
- **Relative colours:** `rgb(from X r g b)` keeps X's alpha. Write `/ 1` for a solid colour, and read the computed `backgroundColor`, not the token text.
- **SillyTavern copies every `:hover` rule** into a `:focus-visible` twin (its `dynamic-styles.js`). Never put `:hover` inside `:not()`: the twin then matches while the element is hovered. Write the quiet state plainly and the hovered state with `:is(:hover, :focus-within)`.
- **Verify computed styles, not selectors.** A state or RTL rule that looks right may not match. Add the class and read `getComputedStyle`. `inline-flex` inside a flex row reads back as `flex`. Pocket Tavern's own checks remove made-up state classes within a frame.
- **Marks added on `mousedown`** must also come off in capture listeners for `mouseup` and `click`. Some targets stop propagation.
- **No `h1`–`h3` in Pocket Tavern's overlays and views.** SillyTavern styles headings globally and its rules leak in. Titles are `div`s with the type role's class and `role="heading"` plus `aria-level`.
- **SillyTavern empties `#chat` when a chat loads.** Anything Pocket Tavern needs to keep through a chat switch (the loading layer, Jump to latest) lives outside `#chat`. `#chat` stays the real scroll container, so `/chat-jump`, lazy loading, editing and deleting keep working.
- **`CHAT_CHANGED` fires during start-up and again for the same chat.** Compare the chat's id with the last one before reacting, and ignore it before `APP_READY`.
- **After a reply ends on iOS Safari,** the message footer keeps changing size for a moment. Re-pin to the bottom over a short settle window (a few frames, ended early if the reader scrolls), and only if the reader was at the bottom when the reply ended.
- **Test hygiene:**
  - Gate on exit codes, never through a pipe (`(node e2e/x.mjs > log) || exit 1`).
  - `node --check` misses ESM errors; `check.mjs` imports for real.
  - A fresh SillyTavern has one character and no chat, so tests create what they need.
  - SillyTavern saves settings about a second after a change, so wait about 2 s before closing.
  - The prompt editor needs the Chat Completion API.
  - Playwright's Pixel 7 always reports a 412px screen.
  - Headless Chrome hides scrollbars (`ignoreDefaultArgs: ['--hide-scrollbars']` to see them).
- **Small test data hides bugs.** Use test data that looks like a real user's (a 30-entry lorebook, several personas), never the owner's own.
- **A Firefox-only report** is often a layout bug you can reproduce in Chrome. Measure first.

---

## 10. Local extras

If `.claude/skills/release/` exists (gitignored), it holds machine-specific setup for the owner's computer: the test copy's paths and port, installed test extensions, and debugging the owner's phone over USB. Use it with this file; it never overrides it.
