# Contributing to Pocket Tavern

Thanks for wanting to help! Pocket Tavern is in alpha, so bug reports, ideas and pull requests are all welcome.

## Reporting bugs and ideas

Use the [issue forms](https://github.com/brabro1/SillyTavern-PocketTavern/issues/new/choose). A screenshot, your layout (Phone or Desktop), device/browser, theme, and SillyTavern version help the most. Please never share private chats, API keys or other personal data.

## How the code is laid out

Pocket Tavern is a plain SillyTavern extension with no build step:

| File | What's in it |
| --- | --- |
| `index.js` | Extension logic, shell, sheets, gestures, and extension compatibility |
| `style.css` | All styles, scoped under `html.stmui-on` and its state classes so turning it off restores native SillyTavern |
| `themes.js`, `icons.js` | The 14 flat themes, SillyTavern theme conversion, and the SVG icon set |
| `locales.js`, `i18n.js` | Translations of Pocket Tavern's own labels (`es`, `pt`, `ru`, `zh`, `ja`, `ar`) |
| `changelog.js`, `CHANGELOG.md` | The in-app What's new list and full release history |
| `manifest.json`, `app.webmanifest` | SillyTavern extension manifest and PWA home-screen manifest |
| `termux/setup.sh` | One-tap start, update, and stop shortcuts for Android (Termux) |
| `tests/` | Offline checks (`check.mjs`), end-to-end phone/desktop (`phone.mjs`), iOS/WebKit (`ios.mjs`), extension compatibility (`compat.mjs`), speed (`perf.mjs`), visual audit (`audit.mjs`), README screenshots (`screenshots.mjs`), and banner (`brand.mjs`) |

The internal `stmui` names and the `mobileUI` settings key come from the project's old name, Mobile UI. They stay as they are so existing settings keep working.

## Before you open a pull request

1. **Read [`DESIGN.md`](DESIGN.md)** before making any visual, layout, or CSS change, and decide whether the change is for **Phone**, **Desktop**, or **Both**.
2. **Run the offline checks (Node 20+):**
   ```bash
   node tests/check.mjs
   ```
3. **Run the end-to-end suite** against a test SillyTavern with Pocket Tavern installed:
   ```bash
   cd tests && npm install && ST_URL=http://127.0.0.1:8000 CHROME_CHANNEL=chrome node phone.mjs
   ```
4. **Check iPhone & iPad** whenever you touch phone layout, fixed elements, keyboard handling, or wide breakpoints (both Chrome and WebKit after `npx playwright install webkit`):
   ```bash
   cd tests && ST_URL=http://127.0.0.1:8000 CHROME_CHANNEL=chrome node ios.mjs
   cd tests && ST_URL=http://127.0.0.1:8000 ENGINE=webkit node ios.mjs
   ```
5. **Check compatibility & speed when relevant:**
   - Extension patches (Guided Generations, Input History, Quick Replies, Moonlit Echoes, ScenePulse, Chat Completion Tabs): `node compat.mjs` (AI requests are blocked).
   - Hot paths (scrolling, typing, streaming, opening pages): `node perf.mjs` (`PROFILE="type"` profiles a matching scenario).
   - Visual polish pass across viewports & keyboard states: `node audit.mjs results/audit`.
6. **Keep translations complete:** Every new UI label goes through `t()` with a row in `locales.js` across all 6 languages (`es`, `pt`, `ru`, `zh`, `ja`, `ar`). Never run user data (character names, chat text, lorebook entries) through `t()`.
7. **Update docs & visuals for user-facing changes:** Add entries to `CHANGELOG.md` and `changelog.js`, and update `README.md`. If the look changed, retake screenshots with test data only and redraw the banner:
   ```bash
   cd tests && ST_URL=http://127.0.0.1:8000 CHROME_CHANNEL=chrome node screenshots.mjs
   cd tests && CHROME_CHANNEL=chrome node brand.mjs
   ```

Keep changes small and focused, and write texts people see in plain, friendly words.

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
