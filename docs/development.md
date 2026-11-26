# Developing Pocket Tavern

Pocket Tavern is plain ES modules and CSS. There is no build step: SillyTavern loads `index.js` and `style.css` from `manifest.json`, and you see your change as soon as you reload the page. How we work, and the rules that never bend, are in [`AGENTS.md`](../AGENTS.md). How it should look and behave is in [`DESIGN.md`](../DESIGN.md).

> [!NOTE]
> The 3.0 remake is moving the code into the structure below (see `AGENTS.md` → Status). For now the 2.x app still runs from `src/legacy/app.js` and `styles/legacy.css`, and each milestone carves its part out of them. `index.js` and `style.css` only import.

## What you need

- **Node 20+** for the checks and tests.
- **A SillyTavern checkout** (1.19 or newer) used only for testing, with its **own data folder**. Never point tests at your real SillyTavern data: tests create and delete characters and change settings.
- **Chrome** (tests use `CHROME_CHANNEL=chrome`) or Playwright's Chromium, plus Playwright's **WebKit** for iPhone and iPad checks.

## Set up a test SillyTavern

1. Make an empty data folder, for example `~/pt-test-data`.
2. Link this repo into it as an extension, so edits show up at once:
   - Windows (PowerShell): `New-Item -ItemType Junction -Path ~\pt-test-data\default-user\extensions\SillyTavern-PocketTavern -Target <this repo>`
   - macOS or Linux: `mkdir -p ~/pt-test-data/default-user/extensions && ln -s <this repo> ~/pt-test-data/default-user/extensions/SillyTavern-PocketTavern`
3. Start SillyTavern on its own port with that data:
   ```
   node server.js --dataRoot ~/pt-test-data --port 8123 --browserLaunchEnabled false
   ```
4. Open `http://127.0.0.1:8123`. Use **test data only**: SillyTavern's sample characters, plus a few characters, personas and a long lorebook you make up. Tests create what they need on a fresh instance.
5. For compatibility work, install other extensions (Guided Generations, Input History, Quick Replies, Moonlit Echoes, …) **in this test data folder only**.

Install the test tools once: `cd tests && npm install`.

## Checks and tests

Run from `tests/`. Point them at your test instance with `ST_URL=http://127.0.0.1:8123 CHROME_CHANNEL=chrome`.

| Command | What it checks | When |
|---|---|---|
| `npm run check` | Offline: every module imports, theme contrast, token scales, no `backdrop-filter`, versions agree, locales complete, no regex lookbehind | Always. Also runs in CI |
| `node phone.mjs` (3.0: `node e2e/<view>.mjs`) | Walks through the interface on a phone and on desktop; turning Pocket Tavern off leaves nothing behind | Always. Also runs in CI |
| `node e2e/components.mjs` | Every component in `src/ui/`: behaviour, touch sizes, focus ring, and screenshots on both layouts, light, dark and right-to-left (`results/components/`) | Any change to a component or `styles/tokens.css`. Also runs in CI |
| `node e2e/chats.mjs` | The Chats place: the Assistant, chats grouped by character, a row's ⋯, Search everything, opening and leaving a chat, desktop's panel, welcome and home, start-up without a flash (`results/chats/`). Makes two throwaway chats and deletes them | Any change to the Chats page or chat rows. Also runs in CI |
| `node e2e/chat.mjs` | The chat: header, messages and their actions, versions, thinking, long messages, code, Jump to latest, the loading placeholders (`results/chat/`). Works in a throwaway chat it deletes afterwards | Any change to the chat or its messages. Also runs in CI |
| `node e2e/characters.mjs` | The Characters place: the picture-card grid, the A–Z strip, a character's page and its ⋯, Edit without opening the chat, Back (`results/characters/`). Changes no character | Any change to Characters, the character page or the editor. Also runs in CI |
| `node e2e/ai.mjs` | The AI place: the status card (connected, and not connected with Connect and the tab's dot), the quick rows, the rows to SillyTavern's screens, Prompts with Chat Completion (`results/ai/`). Switches the API back afterwards | Any change to the AI page or SillyTavern's AI screens. Also runs in CI |
| `node e2e/settings.mjs` | The Settings place: the hub, Appearance (theme cards, a segmented setting), the filter field, Pocket Tavern (every switch in groups, in step with the Extensions panel), About, and Back to Settings (`results/settings/`). Puts every setting back | Any change to the Settings pages or switches. Also runs in CI |
| `node e2e/lorebooks.mjs` | The Lorebooks place: the Lorebooks page (Active lorebooks, Activation settings, New lorebook, Import, every lorebook), a lorebook's page with its name in the header, Activation settings, Back, and deleting the open lorebook (`results/lorebooks/`). Makes and deletes its own test lorebook | Any change to the Lorebooks page or SillyTavern's World Info screen. Also runs in CI |
| `node e2e/draft.mjs` | The Draft helper: the + menu's Write group, Writing as, Enhance my draft through Impersonate with a canned reply (cleaned), the result bar (Regenerate, ‹, Discard), its settings page, and the switch taking everything away (`results/draft/`). Never calls a model; switches the API back | Any change to the Draft helper or the message box. Also runs in CI |
| `node ios.mjs` / `ENGINE=webkit node ios.mjs` | iPhone and iPad sizes with Safari's keyboard simulated | Anything on phones, fixed layers or the keyboard. Run both |
| `node compat.mjs` | Guided Generations, Input History and Quick Replies, with AI requests blocked | Compatibility work |
| `node perf.mjs` | Frame and style timing with Pocket Tavern on and off (`PROFILE="<step>"` profiles one step) | Typing, scrolling, streaming, opening screens |
| `node audit.mjs results/audit` (3.0: `capture.mjs`) | Screenshots of every screen at phone, small phone, landscape and desktop sizes, with overflow and console errors listed | Any layout change. Look at every picture |
| `node screenshots.mjs` | Retakes the README screenshots | Releases that change the look |
| `CHROME_CHANNEL=chrome node brand.mjs` | Redraws the banner and social preview from `docs/brand/banner.html` | When the banner screenshots change |

To recheck a few steps, `ONLY="a–z strip|sheet has a title" node phone.mjs` runs only the steps whose names contain one of the words. Gate on the exit code (`(node phone.mjs > log.txt) || exit 1`). A pipe hides failures. Screenshots go in `tests/results/`, which git ignores.

## Where things go (3.0)

```
src/main.js      boot          src/core/      SillyTavern bridge, settings, lifecycle, h(), i18n
src/shell/       navigation, page stack, sheets/dialogs/popovers, keyboard
src/ui/          components    src/views/     Chats, chat, characters, AI, lorebooks, settings
src/st/          SillyTavern's own screens (mark, hide, restyle)
src/compat/      other extensions             src/features/  translate, drafts, pictures, …
src/themes/      themes        locales/       one file per language
styles/          tokens.css, base.css, components/, views/, st/, compat/
```

`AGENTS.md` lists who owns each folder.

## Common tasks

**A new component**
1. Write its rule in `DESIGN.md` → Components (anatomy, sizes, states, phone and desktop).
2. Build it in `src/ui/<name>.js` with `h()`, and style it in `styles/components/<name>.css` with tokens only.
3. Use it from views. Never re-style it locally in a view.

**A new view or screen**
1. Place it in the map in `DESIGN.md` → Information architecture. It needs exactly one home.
2. Build it in `src/views/<name>.js` and `styles/views/<name>.css`. Read data with `getContext()` and events. Write through SillyTavern's own controls or functions.
3. Register its mount and teardown in the lifecycle registry, and wrap every callback you hand to SillyTavern or the browser in `safe()`. Add an e2e test file.

**Restyling a SillyTavern screen:**
- Add the SillyTavern selectors you need to `src/st/selectors.js` (nowhere else).
- Mark its elements from `src/st/` and style them in `styles/st/`.
- Never move SillyTavern's nodes. Comment every `!important`.

**Borrowing from another project:** code only from MIT, BSD, ISC or Apache-2.0 projects, with credit in the README. SillyTavern and AGPL extensions (AstraProjecta and many others) are for ideas only.

**A compatibility patch:** `src/compat/<extension>.js` and `styles/compat/<extension>.css`, keyed on the extension's own markup so it does nothing when the extension is missing. Add a step to `compat.mjs` and check with the real extension installed.

**A theme**
1. Add it to `src/themes/` with every colour role from `DESIGN.md` → Tokens.
2. `npm run check` verifies contrast and that it is flat.
3. Take light and dark screenshots of a chat, a page and a sheet.

**Words and languages**
- Wrap visible English text in `t("…")` and add the same key to every file in `locales/` (`es`, `pt`, `ru`, `zh`, `ja`, `ar`). `npm run check` fails if one is missing.
- Never pass user data (names, chat text, entry titles) through `t()`.
- To add a language, add `locales/<code>.js` and register it in `src/core/i18n.js`. If it is right-to-left, mark it as RTL there and take screenshots in it.

**A release:** follow `AGENTS.md` → Commits and releases.
