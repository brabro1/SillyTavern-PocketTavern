# Pocket Tavern: Design System

This is the design and UX specification for Pocket Tavern 3.0, on **Phone** and **Desktop**. When code and this document disagree, this document wins. To change a rule, change it here first, in the same change as the code.

---

## 1. Principles

**North star:** Pocket Tavern feels like a flagship messaging and reading app that happens to run on SillyTavern: one calm, coherent product, not a skin over another program.

1. **The story is the screen.** The conversation is the hero. Chrome is quiet: secondary-colour icons, hairline edges, no badges or status unless something needs the user.
2. **One way to do each thing.** Every place has exactly one home in the map. No "More" menus, no second route to the same screen (section 3).
3. **Quiet until it matters.** Connection, errors and progress appear only when the user must act or wait, and then clearly, with one action that fixes them.
4. **Visual first.** Pictures over lists (character grid, avatars in chat rows). Icons come with labels. Icon-only buttons are only for icons everyone knows: ✕, ‹, ⋯, search, send, `+`, edit.
5. **One app, two shapes.** Phone and desktop share the same map, words, tokens and components. They differ in placement and input: thumb and touch versus mouse, keyboard and room.
6. **Native feel.** Every press answers within 100ms. Motion is short and purposeful. Nothing jumps, and the keyboard never shoves the layout around.
7. **SillyTavern's data, Pocket Tavern's face.** Everything the user makes is stored and saved by SillyTavern. Pocket Tavern decides how it looks and how you reach it.

### Banned

- Neon or coloured gradients, glows, glowing borders. (A neutral dark scrim under text on photos is allowed.)
- `backdrop-filter` anywhere. It lags phone GPUs and breaks fixed layers (`AGENTS.md`, Known traps).
- Cards inside cards.
- Emoji as UI icons. Use the monochrome icon set in `src/ui/icons.js`.
- The words "Close" or "Done" as the control that dismisses something (use ✕).
- −/+ steppers on continuous values (temperature, token counts), unless the person turns them on (Settings → Pocket Tavern → "− and + beside sliders"); then they are one pill: [− | value | +].
- "More" catch-all menus, a sheet opened from another sheet, and two routes to the same screen.
- Permanent status text ("Connected").
- More than one primary button on a screen.
- Two shapes for the same role.
- Walls of always-visible help text.
- Bouncy, slow or theatrical motion, and animating layout properties.
- Hard-coded colours outside theme definitions.

---

## 2. Tokens

All tokens are `--pt-*` custom properties on `html.pt-on`. Nothing outside `src/themes/` and `styles/tokens.css` writes a raw colour, size or duration. `npm run check` fails when CSS leaves the scales.

### Colour roles

| Token | Pocket (dark) | Pocket Light | Role |
|---|---|---|---|
| `--pt-bg` | `#0e0f12` | `#f6f7f9` | Opaque canvas: bars, pages, sheets, dialogs, message box |
| `--pt-surface` | `#16181d` | `#ffffff` | Cards, fields, list groups |
| `--pt-surface-elevated` | `#1e2128` | `#eceef2` | Hover, pressed, secondary buttons, popovers |
| `--pt-border` | `rgba(255,255,255,.08)` | `rgba(22,24,29,.10)` | Hairlines and separators |
| `--pt-text-primary` | `#eceef2` | `#16181d` | Prose, titles, labels |
| `--pt-text-secondary` | `#9aa0ad` | `#5a6170` | Metadata, help, inactive icons |
| `--pt-text-muted` | ≥ 3:1 | ≥ 3:1 | Placeholders, disabled |
| `--pt-accent` | `#5b8def` | `#2f5fc4` | The one accent: primary action, selection, focus ring |
| `--pt-accent-soft` | accent 16% | accent 16% | Selected rows, active tab pill |
| `--pt-on-accent` | `#0b1630` | `#ffffff` | Text and icons on accent |
| `--pt-ok` / `--pt-info` / `--pt-warn` / `--pt-danger` | ≥ 4.5:1 | ≥ 4.5:1 | Status icons, notes, destructive actions |
| `--pt-on-danger` | ≥ 4.5:1 on danger | ≥ 4.5:1 on danger | Text on a filled danger button |
| `--pt-card-user` / `--pt-card-bot` | subtle tints | subtle tints | Message cards (the only translucent surfaces over a chat background) |
| `--pt-backdrop` | `#0e0f12` | `#f6f7f9` | Flat colour behind the chat |
| `--pt-scrim` | black 40% | black 24% | Behind sheets and dialogs |
| `--pt-photo-scrim` | black 80% | black 80% | The neutral fade under a name drawn on a picture (character cards, Favorites) |
| `--pt-shadow-card`, `--pt-shadow-raise`, `--pt-shadow-bar`, `--pt-highlight` | per theme | per theme | The elevation scale (section 3 → Elevation) |
| `--pt-shadow-float` | per theme | per theme | Only on floating layers: popovers, dialogs, toasts, floating message box |

**Contrast:** body text, narration, dialogue, text on cards, on accent and on danger meet **4.5:1**. Secondary text, icons, borders of fields and the accent meet **3:1** on both `--pt-bg` and `--pt-surface`. `check.mjs` verifies every theme.

### Type

Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif`. Appearance → Reading font can switch the **messages only** to SillyTavern's font.

| Role | Size / line height / weight | Used for |
|---|---|---|
| `caption` | 12 / 1.35 / 400–500 | Timestamps, counts, badges |
| `small` | 14 / 1.4 / 400 | Row subtitles, help text, group headers (600) |
| `body` | 15 / 1.45 / 400 | UI text, row titles, fields; buttons at 600 |
| `headline` | 16 / 1.3 / 600 | Header titles on pushed pages, sheet and dialog titles, card names |
| `title` | 20 / 1.25 / 600 | Place titles (Chats, Characters, …), the character name on its page |
| `display` | 24 / 1.2 / 700 | Empty states |
| `chat` | 15 phone, 16 desktop / 1.6 (Compact 1.5) | Messages, multiplied by Text size and SillyTavern's Font scale |

Paragraphs in messages are 0.75em apart (Compact 0.5em). Quotes and code blocks get 0.75em above and below. `em` sizes inside a message follow the chat text. Numbers that change in place (counts, values) use `font-variant-numeric: tabular-nums`.

### Spacing and layout

4px scale: `--pt-space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32. Every padding, margin and gap is on the scale. The only exceptions are 1px hairline offsets and offsets computed to centre a smaller visual inside a 44px hit area (comment the formula).

| Constant | Phone | Desktop |
|---|---|---|
| Screen edge padding | 16 | 24 (panel 16) |
| Header height | 52 (Compact 48) + safe area | 52 |
| Tab bar | 56 + safe area | none: rail 72 wide |
| Panel width | none | 320–560, default 400. Editors widen it to 720. Dragged: from 360 to the full width |
| Chat column | full width | max 760, or SillyTavern's Chat width when narrower |
| Tool column | none | 280–360 |
| Row height | 52 (Compact 44) | 44 |

### Radii: the shape rule

**Actions are round. Containers and fields are rounded rectangles.**

| Token | Value | Use |
|---|---|---|
| `--pt-radius-sm` | 10px | Fields, pickers, segmented tabs, menu rows inside a group, small cards, notes |
| `--pt-radius` | 14px | Containers: list groups, message cards, sheets (top corners), dialogs, popovers, toasts, the segmented track |
| `--pt-radius-full` | 999px | Every button, icon button, chip, the tab bar's active pill, round avatars |

A control inside a container with 4px padding steps down one radius so corners stay concentric. Marks smaller than a control (checkboxes, key caps, badges, highlights) keep a 4–6px radius.

### Elevation

Depth comes from surface steps (`bg` → `surface` → `surface-elevated`) and a neutral shadow scale (the owner asked for a richer, more finished look, 2026-11-27). Shadows are never coloured and never glow.

| Token | Use |
|---|---|
| `--pt-shadow-card` | Cards, list groups, character cards, message cards: a faint ring and a soft, low lift |
| `--pt-shadow-raise` | Buttons and the active tab's pill: a little more lift |
| `--pt-shadow-bar` / `--pt-shadow-bar-up` | The header and the tab bar (and the rail, sideways): a shadow over what scrolls under them |
| `--pt-shadow-float` | Things that float above content: sheets, popovers, dialogs, toasts, the floating message box, the Draft helper's bar |
| `--pt-highlight` | A faint light along the top edge of a raised surface (cards, buttons, the tab pill) |

Light themes use the same scale, much softer. On desktop with a mouse, cards and buttons lift 1–3px on hover (transform only).

### Z-index bands

| Token | Value | Layer |
|---|---|---|
| `--pt-z-chat` | 30 | Floating controls inside the chat (Jump to latest) |
| `--pt-z-page` | 3000 | Pages, the desktop panel and tool column, the in-chat search bar |
| `--pt-z-editor` | 3300 | Full-screen editors and the swipe hint |
| `--pt-z-bars` | 4000 | Headers, tab bar, rail, status banners |
| `--pt-z-overlay` | 5000 | Sheets, dialogs, popovers. Native `<dialog>`s use the browser top layer |

Layers within a band use `calc(var(--pt-z-band) + n)` with `n < 300`. SillyTavern's own popups and toasts are never covered: toasts sit above sheets and dialogs.

### Motion

| Token | Value | Use |
|---|---|---|
| `--pt-dur-fast` | 150ms | Presses, hovers, fades, popovers |
| `--pt-dur` | 220ms | Sheets, dialogs, the panel |
| `--pt-dur-slow` | 240ms | Page push and pop (the longest allowed) |
| `--pt-ease` | `cubic-bezier(0.2, 0, 0, 1)` | Everything, including JavaScript animations |

- Only `transform` and `opacity` animate.
- A page push slides in from the end edge. A sheet rises. A dialog fades and scales from 0.98. A popover fades. Pressing scales to 0.97.
- Send gives one short press. Nothing flies off.
- A jumped-to message or setting gets a still outline for a moment.
- When a page opens, its first eight groups or cards fade in with a 6px rise, 20ms apart (240ms each at most). Not with Reduce motion.
- Looping indicators (a reply being written, Stop's ring) are the only animations longer than 240ms.
- **Reduce motion** (the OS setting or Pocket Tavern's switch): fades only, at 150ms. Loops, including on `::before`/`::after`, play once.

### Themes

Six built-in themes:
- **Pocket** (default) and **Pocket Light**
- **AMOLED** (true black)
- **Midnight**
- **Ember**
- **Paper** (light, for reading)

Each one fills every colour role above, is flat (no gradients, no glows), and passes the contrast rules. A saved theme that no longer exists falls back to Pocket.

- **SillyTavern UI themes** are offered in the same picker, converted into these roles, with contrast enforced. A converted theme keeps its own User and AI message colours, even when they are equal. They are only darkened or lightened until text passes (issue #5). Themes without message tints get Pocket's faint cards.
- **A Pocket Tavern theme draws the messages.** When one is chosen, SillyTavern's Chat Style goes to Flat once and the old style is remembered. Choosing a SillyTavern theme or turning Pocket Tavern off restores it.
- **Chat backgrounds** (`html.pt-glass`): bars, pages, sheets, dialogs and the message box stay **opaque**. Only message cards become translucent, so the picture shows through and between them. Card text is checked over mid-grey and over a bright picture, and lifted until it passes. SillyTavern's own blur is switched off while Pocket Tavern is on.

### Icons

One monochrome, stroke-based set (`src/ui/icons.js`), drawn in `currentColor`. 20px in rows, buttons and toolbars, 24px in the tab bar and rail. Directional icons (back, chevrons) mirror in RTL. Font Awesome icons from SillyTavern or extensions are mapped to the set where a match exists.

---

## 3. Information architecture

### The map

Five places, the same on both layouts:

| Place | What lives there |
|---|---|
| **Chats** | Search everything; pinned and recent chats. Opening a chat pushes the chat screen |
| **Characters** | Character grid (or list) and groups; each character's page; the character editor |
| **Lorebooks** | Active (global) lorebooks; every lorebook and its entries; the entry editor |
| **AI** | Connection status; connection profile, model and preset; SillyTavern's connection, sampler, prompt and formatting screens |
| **Settings** | Appearance, Personas, SillyTavern (its settings sections), Extensions, Pocket Tavern, About |

```
Phone                                  Desktop
┌──────────────────────────┐           ┌──────┬──────────────┬─────────────────────────┐
│ Chats                🔍  │           │Chats │ Chats     🔍 │ ◉ Seraphina          ⋯  │
│ ─ Pinned                 │           │Chars │ ─ Pinned     │                         │
│ ─ Recent                 │           │Lore  │ ─ Recent     │    messages             │
│                          │           │AI    │              │                         │
├──────────────────────────┤           │Sett. │              │ [◉ Message…      +  ➤]  │
│ Chats Chars Lore AI Sett.│           └──────┴──────────────┴─────────────────────────┘
└──────────────────────────┘             rail     panel          chat (tool column →)
```

### One-way rules

1. **Each screen has exactly one home** in the map. Nothing else navigates to it.
2. **In-context controls act; they don't navigate.** The persona button in the message box *switches* persona; managing personas lives only in Settings → Personas.
3. **Status links to its fix.** A problem banner may deep-link to the screen that fixes it ("Not connected · Fix" opens AI). That is feedback, not a second route.
4. **One menu per object.** A chat, a message, a character and a lorebook entry each have one ⋯ menu, with the same items in the same order wherever that object appears.
5. **No "More".** When a place's root passes about seven rows, group them into sections, not into an overflow.
6. **One search.** Search everything is the field at the top of Chats (on desktop, `Ctrl/⌘ K` focuses it). It finds characters, chats, lorebooks, entries, settings and the five places. List screens may have a filter field that narrows only that list.

### Where everything lives

| Task | Where |
|---|---|
| Open a chat | **Chats** → the chat |
| Start a chat or a new chat with a character | **Characters** → character → **Chat** / **New chat**. In a chat: tap the name → **New chat** |
| See every chat with a character | Character page → **Chats** |
| Switch persona | Message box → persona button |
| Manage personas | **Settings → Personas** |
| Switch model, preset or connection profile | **AI** |
| Check or fix the connection | **AI** status card. Problems also show a banner in the chat and a dot on AI |
| Regenerate, continue, impersonate, attach a file | Message box → `+` |
| Author's Note, CFG, token probabilities, extension tools, quick reply sets | Message box → `+` (desktop: they open in the tool column) |
| Search in this chat, translate, rename, select messages, export, delete the chat | Chat header → ⋯ (the chat's menu) |
| Edit a message | ✎ on the message |
| Other message actions (copy, branch, checkpoint, hide, narrate, delete…) | Message ⋯ (phone: also long-press) |
| Edit a character, favourite it | Character page → **Edit** / ★ |
| Character's lorebooks | Character editor → **Lorebook** |
| Global lorebooks, entries | **Lorebooks** |
| Theme, chat look, text size, reading font, density, message box, chat width, background, Reduce motion | **Settings → Appearance** |
| SillyTavern's own settings | **Settings → SillyTavern** → its section |
| Extensions | **Settings → Extensions** |
| Where Pocket Tavern runs, its switches, "Use SillyTavern for now" | **Settings → Pocket Tavern** |
| Version, What's new, update Pocket Tavern, SillyTavern updates, install as app, Guide, GitHub, Report a problem | **Settings → About** |

### Settings inventory

Every long settings page (Chat and layout, Pocket Tavern, About) starts with a filter field ("Filter settings"). Typing hides the rows and groups that don't match; "Nothing matches that." shows when none do.

- **Appearance** (themes and the background only, so it never needs a long scroll):
  - Chat background (opens Backgrounds) and Theme background (switch), first
  - Theme (Pocket Tavern's and SillyTavern's, as preview cards), Import a SillyTavern theme, SillyTavern's Custom CSS (switch, off: with a Pocket Tavern theme it is set aside, because a SillyTavern theme writes its own CSS there)
  - **A Pocket Tavern theme owns the look.** Whatever SillyTavern theme was on before (or is picked later in SillyTavern's own settings), none of it shows through: its colours, checkbox colour, font scale, blur, text-shadow switch, Chat Style (a theme switching it is put back on Flat; one you pick by hand stays) and Custom CSS. Picking "Your theme" or one of SillyTavern's themes in Appearance brings them back. A new install starts on the Pocket theme
- **Chat and layout** (everything else about how it looks):
  - Chat look (Cards, Bubbles, Flat)
  - Text size (Small, Normal, Large, Extra large)
  - Reading font (System, SillyTavern's): the 2.x Modern font switch, renamed
  - New icons (switch)
  - Avatar shape (Circle, Square, Rounded, Rectangle): SillyTavern's own setting, so every picture follows it: the chat, Chats, a character's page and the header
  - Layout (Automatic, Phone, Desktop; section 4)
  - Density (Automatic, Comfortable, Compact)
  - Message box (Floating, Docked)
  - Chat width (desktop)
  - SillyTavern's look (opens Settings → SillyTavern → Look: avatar shape, font scale and the rest)
  - Animations (Smooth, Light, Off); the OS's Reduce motion is always honoured
- **Pocket Tavern:**
  - Use it on this device (Automatic, Phones only, Off), with a line saying whether it is on here
  - Use SillyTavern for now
  - **Draft helper** (a row to its own page; DESIGN.md → The chat → Message box)
  - Behaviour: every switch Pocket Tavern has, grouped under short headers (Chat, Characters and lorebooks, Pictures, Navigation, Notifications and device, Updates), each with one line saying what it does. A switch that only applies to one layout or to an installed extension shows only there
- **About:** the version, What's new, Update Pocket Tavern, SillyTavern updates, Install as an app (until installed), Guide, GitHub, Report a problem
- **Switches are kept.** Pocket Tavern is meant to be customizable: a 2.x switch is never removed, only made clearer, grouped or given a better default. A new feature gets a switch when someone could reasonably want it off. When the remake changes how a feature works, its switch keeps meaning "this feature on or off".

### Phone navigation

- The **tab bar** shows on the five place roots and their sub-pages. It hides in the chat, in editors, and while the keyboard is up. Hidden means `display: none`, never off-screen.
- Each place keeps its own **stack**. ‹ and the system back gesture pop one level. Tapping the active tab pops to that place's root and scrolls to the top.
- The **chat** is pushed over the tabs from Chats, from a character page, or from search. Back returns where you came from.
- **Back order:** close the open overlay → pop the page → from another place's root, go to Chats → from Chats' root, leave to the browser.
- An overlay never opens on top of another overlay. A menu item that needs a further choice replaces the overlay's content (with ‹ inside it). A menu item that navigates closes the overlay first. A menu item that opens a different overlay (⋯ → Rename) closes the menu, then opens the new one on the next frame.

### Desktop navigation

- **Rail | Panel | Chat | (Tool column).** There is no full-width top bar. The panel and the chat each have their own header.
- The **rail** lists the five places, icon over label. Clicking a place opens it in the panel. Clicking the active place hides the panel, so the chat gets the room.
- The **panel** is a stack, like the phone (‹ in its header). Drag its edge to resize, until the chat keeps 420px; dragging further snaps it to the full width and hides the chat until the panel closes or is dragged back (issue #13). Double-click the edge to reset. Its width is remembered.
- The **chat column** always shows the open chat. With none open, it shows a calm empty state, and Chats is open in the panel.
- The **tool column** (Author's Note, CFG, token probabilities) docks at the end. When room runs out the panel narrows first. The chat column never drops below 480px.
- **Overlays:** menus are popovers anchored to their trigger. Pickers with search, short forms and confirmations are centred dialogs (max 560px). Editors open in the widened panel.
- **Keyboard:**
  - `Ctrl/⌘ K` opens Search everything, which also lists the five places.
  - `Esc` closes the topmost popover or dialog, then goes back in the panel. It never acts while you are typing in a field.
  - `Enter` / `Shift+Enter` follow SillyTavern's Send on Enter setting.
  - Tab order follows the visual order.
  - Pocket Tavern adds no other shortcuts. Digit shortcuts clash with browser tab switching.

---

## 4. Layouts and platform invariants

**Phone** (`html.pt-phone`): any window that is not desktop, including phones held sideways (short height). Landscape gets slimmer bars with labels beside icons.
- Pad bars with `env(safe-area-inset-*)`.
- Every tappable thing has a 44×44px hit area. It may look smaller (a 32px chip) if its hit area fills 44px.
- Nothing scrolls sideways down to 320px wide, with extensions on.

**Desktop** (`html.pt-desktop`): windows at least **960×560**: computers, and tablets held sideways.
- With a fine pointer (`@media (pointer: fine)`), controls may drop to 36px visual.
- Touch laptops and tablets keep 44px.
- Hover styles only under `@media (hover: hover)`.

**Choosing the layout** (Appearance → Layout):
- **Automatic** (default) uses the size rule above, and re-checks when the window changes size or turns.
- **Phone** always uses the phone layout, at any size.
- **Desktop** uses the desktop layout whenever the window is at least 768px wide (for example an iPad held upright). Below that it falls back to Phone, because the chat column needs its 480px.
- Only one module (`src/shell/layout.js`) decides the layout and sets `pt-phone` or `pt-desktop`. Nothing else reads the window size to choose a layout.

**Both:**
- **Focus:** every interactive element shows a 2px `--pt-accent` outline at 2px offset on `:focus-visible`. `outline: none` without a replacement is a bug.
- **Text scaling:** layouts survive browser zoom up to 200% and Extra large text. No fixed heights on text containers.
- **Reduced motion:** section 2, Motion.
- **SillyTavern's popups** (`dialog.popup[open]`, `#shadow_popup` and the other popup ids listed in `src/st/selectors.js`): while one is open, `html.pt-st-popup` is on.
  - Pocket Tavern's own layers are `inert` (no taps, no focus).
  - Pocket Tavern's back gesture, `Esc` handling and keyboard offsets step aside.
  - The popup stays above everything (section 2, Z-index).
  - One observer, at most one check per frame, watches for popups opening and closing, and it is disconnected on teardown.
- **The keyboard is up** only while a text field (a text input, a text area, or editable text that is not disabled or read-only) has focus **and** the visible height is at least **120px** shorter than the full height. On iPhone and iPad, "visible" means the visual viewport against the window. On Android, it means the window against its largest height at this width. The check reruns on focus changes and on viewport resize and scroll, at most once per frame. The tab bar hiding and `pt-ios-kb` both use this one rule.

**iPhone and iPad (Safari/WebKit):**
- Safari does not shrink the layout viewport for the keyboard. Every fixed or input-bearing layer follows `--pt-ios-top` and `--pt-ios-h` while `html.pt-ios-kb` is on. Never rely on `100dvh` alone.
- On iPad landscape (`html.pt-desktop.pt-ios-kb`), editors keep their rail and panel offsets.
- Test in Chrome **and** WebKit.

**Android keyboard:** the chat and the message box move as one piece when the window shrinks. The root page never scrolls.

**Fixed layers** (editors, the in-chat search bar, banners):
- Opaque `--pt-bg`.
- `align-self: stretch`.
- Placed between the bars.
- Their ancestors never carry `transform`, `filter`, `backdrop-filter`, `contain` or `will-change: transform`.

**Right-to-left** (`html.pt-rtl`): on only when an RTL language is loaded (Arabic).
- Use logical properties throughout.
- Mirror directional icons.
- Set `lang` and `dir` on overlays so text wraps and hyphenates correctly.
- Chat text uses `dir="auto"`.

**Scrollbars:**
- **Phone:** none. Everything scrolls by touch.
- **Desktop:** every scrolling list has a slim bar: 8px of room, a 4px round thumb at 18% of the text colour (32% on hover, 48% while dragging), no track and no arrows. Firefox uses `scrollbar-width: thin`.
- The rail and segmented controls show none.
- Never hide scrollbars on every element.

---

## 5. Components

Every component exists once in `src/ui/` and `styles/components/` and is used everywhere. Sizes below are touch / fine pointer. `tests/e2e/components.mjs` shows every one on both layouts, light, dark and right-to-left.

| Component | Module | Class |
|---|---|---|
| Buttons, icon buttons | `button.js` | `.pt-button` (`--primary`, `--secondary`, `--quiet`, `--danger`, `--danger-filled`), `.pt-icon-button` |
| Rows and groups | `list.js` | `.pt-list-row`, `.pt-list-group`, `.pt-list-header` |
| Fields, help, search | `field.js` | `.pt-form-field`, `.pt-text-field`, `.pt-help-block`, `.pt-search-box` |
| Number and slider | `number.js` | `.pt-number-row`, `.pt-value-pill`, `.pt-slider` |
| Switch | `toggle.js` | `.pt-toggle` |
| Segmented control | `segments.js` | `.pt-segments` |
| Chips | `tag.js` | `.pt-tag` |
| Banner, notice, empty state | `feedback.js` | `.pt-status-banner`, `.pt-notice`, `.pt-empty-state` |
| Avatars | `avatar.js` | `.pt-avatar` |
| The "Advanced" fold | `fold.js` | `.pt-fold` |

Shared behaviour is in `styles/base.css`: `.pt-focus` (the focus ring), `.pt-press` (press scale), `.pt-sr-only`. A new class name must not be one the styles from 2.x already use (`.pt-switch`, `.pt-chip`, `.pt-banner`, `.pt-row`, `.pt-field`, `.pt-help` and others).

### Tab bar and rail
- **Tab bar:** five equal tabs, 24px icon over a `caption` label. The active tab gets a `--pt-accent-soft` pill behind its icon, which slides between tabs, and its label in `--pt-text-primary`. Inactive tabs are `--pt-text-secondary`. A dot (6px, `--pt-danger`) marks AI when the connection has a problem.
- **Rail:** the same five, stacked at the top. The same pill and dot.

### Headers and closing
- **Place root:** title (`title`) at the start, up to two icon actions at the end.
- **Pushed page:** ‹ at the start, title (`headline`, one line, ellipsis), up to two icon actions at the end.
- **Sheets, dialogs and full-screen editors:** title (+ an optional subtitle, two lines at most) at the start, **✕ at the end**: a 44px icon button labelled "Close" for screen readers. Built by `src/shell/overlay.js` (`overlayHead`). If the thing needs saving, a primary **Save** pill sits just before ✕.
- **Forms that apply as you go have no Save.** Forms that don't: on a phone the Save pill is full width at the bottom of the sheet. On desktop the dialog footer ends with a quiet Cancel and then Save.
- Closing anything with unsaved input asks first ("Discard changes?").

### Buttons
All buttons are pills (`--pt-radius-full`), 44px tall (36px with a fine pointer or Compact), 16px inline padding (12px Compact), label `body` 600, optional 20px leading icon.

| Kind | Look | Use |
|---|---|---|
| **Primary** | `--pt-accent` fill, `--pt-on-accent` text | The one main action of a screen (Chat, Save, Send). One per screen |
| **Secondary** | `--pt-surface-elevated` fill, primary text | Other actions next to it (New chat, Edit) |
| **Quiet** | No fill, primary text; hover `--pt-surface-elevated` | Toolbar and inline actions, Cancel |
| **Danger** | Quiet or secondary with `--pt-danger` text; filled `--pt-danger` + `--pt-on-danger` only as the confirm button of a delete dialog | Destructive actions |
| **Icon button** | 44px round hit area (visual 40, or 32 with a fine pointer), 20px icon in `--pt-text-secondary`, primary on hover or press | ✕, ‹, ⋯, ✎, search, `+` |

Pressed: scale 0.97 and one surface step lighter or darker. Disabled: 40% opacity, no pointer events. Labels are short verbs in sentence case ("New chat", not "Start a New Chat").

### List rows and groups
- **Row:** 52px minimum (44 Compact or fine pointer), `--pt-space-3` `--pt-space-4` padding.
  - Start: a 20px secondary icon or a 32px avatar.
  - Middle: title (`body`), then an optional subtitle (`small`, secondary, one line; two lines for descriptions).
  - End, by kind: chevron for **navigation**, switch for a **toggle** (the whole row toggles), value plus chevron for a **picker**, ⋯ for an **object**.
- **Group:** rows in a `--pt-surface` container with `--pt-radius`, separated by hairlines that start at the text, not the icon. An optional group header (`small` 600, secondary, sentence case) sits 8px above it.

### Fields
- **Text field:** 44px tall, `--pt-radius-sm`, `--pt-surface` fill, hairline border. On focus: accent border and focus ring. Placeholder in `--pt-text-muted`. Text is `body` (15px), but 16px on touch screens, or iPhones zoom in when a field is tapped.
- **Label:** `small` 500 above the field on a phone. On desktop, short controls (switch, picker, number) sit beside their label: label at the start, control at the end. Text areas always stack.
- **Text areas** grow with their text up to 40% of the window, then scroll inside.
- **Help text:** `small`, secondary, under the field, clamped to two lines with "More".
- **Errors:** danger text under the field and a danger border.
- **Picker** (replaces a visible `<select>`): a row with the label, current value and chevron. It opens a sheet on a phone, and on desktop a popover (8 options or fewer) or a dialog with search (more than 8). Single choice closes on pick. Multi-choice shows checkmarks, applies live, closes with ✕, and its row summarizes the choice as chips. SillyTavern's real `<select>` stays underneath and receives the change.
- **Search field:** a text field with a leading search icon and a clear (✕) button once there is text. Filters as you type (debounced) and always shows an empty state when nothing matches.

### Number and slider (issue #12)
- **One row:** label at the start. At the end, the **value pill**: min 64px wide, 36px tall (44px hit area), `--pt-surface-elevated`, tabular numbers, unit in secondary text. The **slider** spans the full width under them.
- **Slider:** 44px hit height, a 4px track filled with accent up to a 20px thumb.
- **Value pill:**
  - Tapping it selects the number and opens the numeric keyboard (`inputmode="decimal"`).
  - `Enter` or leaving the pill commits. `Esc` reverts.
  - Out-of-range values snap to the limit and show it.
  - On desktop, `↑`/`↓` change by one step, `Shift` ×10.
- **No −/+ buttons, ever.** The browser's spin arrows are hidden.
- SillyTavern's own range and number inputs stay underneath and receive every change with their own events.
- A number without a range is just the value pill on the row.

### Switch, segmented control, chips, tabs
- **Switch:** SillyTavern's settings checkboxes render as switches. Real checkboxes are used only in multi-select lists.
- **Segmented control:** 2–4 options that change a view or a mode, full width on a phone. Track `--pt-radius` with 4px padding, segments `--pt-radius-sm`.
- **Chips** (filters, tags, quick replies, keywords): pills 32px tall with a 44px hit area, `small` label. Removable chips have a ✕ with its own 44px hit area.
- **Tabs inside a screen** are a segmented control (four at most). More than four sections become rows that open pages.

### Disclosure
- Sections of a long screen are **rows that open pages**. There are no accordions for sections.
- A form may have **one "Advanced" fold**: a row whose chevron turns 90° and whose content appears below it (fading, never animating height). It never nests.
- **Help text** is clamped to two lines with "More", everywhere.

### Cards
- **Character card** (grid):
  - A 3:4 picture tile, `--pt-radius`. The name sits on a neutral scrim at the bottom, and a ★ at the top end marks favourites.
  - Columns: 3 on phones 360px and wider, 2 below. On desktop the panel fills with columns at least 120px wide.
  - Tap opens the character page. Grid is the default. A list view is offered in the Characters header (Sort & view).
- **Chat row:**
  - A title line (the character, or the chat's own name, or "Chat from 12 May 2023"), when, and ⋯.
  - Then the last message as a **message bubble** drawn like a message card of the chat: `--pt-card-bot`, hairline edge, the chat font, and SillyTavern's narration and dialogue colours. `*narration*`, `"dialogue"` and `**bold**` are built from text nodes, never HTML. Three lines at most (two in Compact and groups), clamped cleanly, with `dir="auto"`.
  - Then a message count.
  - The open chat gets an accent edge and an "Open now" label.
- **Lorebook entry card:** title, keyword chips, an on/off switch, a strategy icon. Tap opens the entry editor.

### Overlays: which one

| Need | Phone | Desktop |
|---|---|---|
| Actions on an object, a short choice | **Sheet**: auto height up to 60%, then it scrolls | **Popover** anchored to the trigger |
| Pick from a long list | Sheet at full height with search | **Dialog** (480px) with search |
| Confirm something destructive | Small centred **dialog** | Dialog |
| Short form (rename, new item) | Sheet with fields and a full-width Save | Dialog with Cancel and Save in the footer |
| A place or a long settings screen | **Page** (pushed) | Page in the panel |
| Writing and editing long text | **Full-screen editor** | In place (messages), or in the widened panel (character, entry, prompt) |
| Looking at a picture | Full-screen viewer (pinch and double-tap zoom) | Full-screen viewer |

- **Sheets:** `--pt-radius` top corners, a 36×4 drag handle, safe-area bottom padding, at most 92% of the height. Close them by dragging down, tapping the scrim, ✕, or back.
- **Dialogs:** `--pt-radius`, `--pt-shadow-float`, centred, at most 560px wide. No drag-to-dismiss on desktop.
- **Scrim:** `--pt-scrim`. Tapping it closes the overlay, except over a form with unsaved input, where it asks first.
- **Focus:** trapped inside, starts on the first control (or the dialog), and returns to the trigger on close.
- **One way to close:** ✕, the scrim, dragging down, back, `Esc` and a finished action all call the overlay's own close. It plays the exit, then removes the overlay when the exit ends (at once with reduced motion). Nothing else removes an overlay or hides it halfway through its exit.
- **Actions that take time** (save, rename, delete): the button shows its spinner. On success the overlay closes. On failure it stays open with the error under the fields, and what was typed is kept.
- **Titles** look like the title role but are not `h1`–`h3` elements (`AGENTS.md` → Known traps).

### Menus (⋯)
- Rows with a 20px icon and a label, in groups separated by hairlines.
- Destructive items come last, in `--pt-danger`, after a separator.
- Eight items at most. Beyond that, group them or move them to the object's page.
- The same items in the same order for an object type everywhere.
- Each item runs SillyTavern's own control for that action (the control stays in place, hidden).

### Feedback
- **Banner:** just under the header, floating over the top of the chat or page (desktop: over the chat column), on `--pt-surface-elevated` with the floating shadow: a 20px status-coloured icon, one sentence, and one quiet action. Newest on top; all of them live in one place (`src/shell/banners.js`). Used for problems that block work: server not answering, not connected (in a chat, after SillyTavern has had 2.5 s to connect by itself; **Fix** opens AI), translation unavailable; also a whole-chat translation's progress, with **Stop**. It disappears by itself when the problem is gone ("Back online" shows for a moment). It can only be dismissed if it does not block anything.
- **Toast** (SillyTavern's toasts, restyled):
  - Answers something the user just did, or reports an event they must know (the reply failed).
  - A calm card on `--pt-surface-elevated`: hairline, `--pt-radius`, `--pt-shadow-float`, a 20px status icon, the title in primary and the message in secondary text, and a 2px progress line. No coloured fill.
  - On a phone it sits below the header, 8px from the edges, and swipes sideways to dismiss. On desktop it is 380px wide at the top end.
- **Notes** in SillyTavern's screens (`.info-block`, `p.hint`) and Pocket Tavern's own:
  - A quiet card on `--pt-surface` with 6% of the status colour, a hairline at 30% of it, `--pt-radius-sm`, an 18px icon.
  - The text stays in normal flow (it may hold links).
  - Hint and info use `--pt-info`, warning uses `--pt-warn`, error uses `--pt-danger`.
- **Waiting:** anything slower than 300ms shows a small spinner in the button that started it. Lists show still placeholder rows. Generating replaces Send with Stop (section 6).
- **Empty states:** a 24px secondary icon, one sentence, one action ("No chats yet" · **Choose a character**).
- **Destructive confirmations:**
  - Title as a question ("Delete this chat?"), one sentence saying what is lost, then Cancel and a filled danger button with the verb.
  - Where SillyTavern asks itself, its popup is restyled, never replaced.

### Avatars and pictures
- Avatars follow SillyTavern's avatar shape setting (circle, square, rounded, rectangle). Sizes: 24 inline, 32 in rows and Compact messages, 40 in messages, 96 on the character page.
- A missing picture shows the name's initial on a colour derived from the name.
- Full-quality pictures are used where shown large. Animated GIF or WebP pictures move everywhere.

---

## 6. Key screens

### Chats (home)
- **Header:** "Chats" and the Search everything field below it.
- **Quick picks:** a row of 56px pictures with names that scrolls sideways: SillyTavern's **Assistant** first (ask anything, no character needed; its own permanent Assistant chat), then the characters and groups chatted with most recently (up to 10). Tapping a character opens their page (a group opens its latest chat). On desktop the row also scrolls with the mouse wheel and by dragging, and ‹ › appear at its ends while there is more to see.
- **List:** **Pinned** chat rows, then **Recent** under date headers (Today, Yesterday, Earlier this week, Older): one card per character or group, newest first. Tapping a chat's picture opens the character's page; tapping anywhere else on it opens the chat. Back from a page opened this way returns to Chats. The card shows their latest chat as a row; when there are more, a line under it ("3 more chats") opens a dropdown with **New chat**, **All chats** and **Character**, then their other recent chats. With search text, results are grouped by kind (Places, Characters, Chats, Lorebooks, Settings).
- **No message box** on this screen.
- **Empty:** "No chats yet" · **Choose a character** (opens Characters).
- **Where it lives:** on a phone it is the Chats place's screen while no chat is open; opening a chat (from here or anywhere) takes the screen, and ‹ in the chat closes it and comes back here. On desktop it fills the panel and stays there beside the chat it opened; Chats on the rail hides or shows it. With no chat open, desktop's chat column is a welcome: SillyTavern's logo, "Welcome back", its version, and **Ask the Assistant** (primary), **Show chats** (when the list is hidden) and **Choose a character**. SillyTavern's own start screen is hidden. At start-up SillyTavern may reopen its locked Characters panel; Pocket Tavern keeps it invisible and closes it, so Chats is the first thing you see.
- **A row's ⋯:** New chat and All chats (with its character), Pin or Unpin and Rename (SillyTavern's own start-screen buttons, so they are there while no chat is open; the open chat is renamed with SillyTavern's `renameChat`), then **Delete** in its own group, for a chat that is not open (SillyTavern's question, then its own delete). The open chat is deleted from its own ⋯ → Chat files.
- **Search:** Enter opens the first result. Up to 5 places, 12 characters and groups, 12 chats, 8 lorebooks and 12 settings.

### The chat
- **Header:**
  - Phone: ‹, then the avatar and name (a group shows its members), then ⋯. Desktop: home (closes the chat, back to the Chats welcome) in place of ‹.
  - Tapping the avatar or name opens the character page (for a group, the group's page).
  - The header never shows connection state.
  - ⋯ holds, in order: Search this chat, Translate chat, Rename, SillyTavern's own items for this chat when they apply (Save checkpoint, Back to parent chat, Convert to group), and Chat files (SillyTavern's list of saved chats, where a chat is exported or deleted). Then, in its own group in danger red, Delete messages.
- **Opening a chat:**
  - The header changes at once.
  - If the messages take longer than 300ms to arrive, still placeholder messages cover the message area until they do, then fade out (`--pt-dur-fast`). There is no shimmer.
  - The placeholder layer sits outside `#chat` (`AGENTS.md` → Known traps).
  - Only the latest switch counts: opening another chat first cancels the earlier one's layer.
  - The chat opens at the latest message.
- **Messages:**
  - Chat look is Cards (default), Bubbles or Flat. User and character messages are told apart by `--pt-card-user` and `--pt-card-bot`.
  - A message has a header (avatar, name, time in `caption`), then the text across the full width, then a footer (message number, tokens, as SillyTavern's Display settings choose).
  - **Actions:** two quiet icon buttons, ✎ and ⋯. On desktop with a mouse they sit at low opacity until the message is hovered or focused. On a phone, long-press opens ⋯ (when the switch is on).
  - **Versions (swipes):** on the last reply, ‹ and › as two 32px round buttons (44px hit area) with the count between them in secondary text, at the end of the footer. One version shows only ›. On a phone, dragging the last reply sideways also changes version.
  - **Thinking** (reasoning) is a quiet box that opens with a tap. While it is still thinking, its title breathes.
  - **Long older messages** fold with "Show more". Code blocks and tables scroll sideways inside themselves.
  - **Jump to latest** appears when you scroll up, and new text never pulls you down while you read.
  - **What an extension adds under the text** takes the message's own row there (`extra`), never the space above it. Message Summarize's summary is a quiet note in secondary text with a 3px edge for where it stands in memory: `--pt-info` short-term, `--pt-ok` long-term, `--pt-warn` past the limit, secondary and struck through when left out; a tap edits it. Its message buttons sit in ⋯ under **Summary** with short names and a line each (Remember, Leave out, Edit summary, Summarize again). Its progress bar is a card under the header, over the chat column.
- **Message box:**
  - **Row:** persona button (avatar), the text field (grows to 35% of the window, then scrolls), `+`, the context ring (small, inside the box), and **Send**.
  - **The context ring** fills with how much of the context the next prompt uses, turning `--pt-warn` above 90%. Tapping it opens a small sheet (desktop: popover):
    - **Used of total** tokens, and the room kept for the reply.
    - **Where they go**, when SillyTavern has a prompt breakdown for this chat (the one behind a message's prompt view): character, persona, lorebooks, chat history, and other. Before the first reply in a visit, it shows only used and total.
    - One action: **Open prompt settings** (AI → Prompts or Formatting).
  - **Send** is a 44px accent circle anchored at the end that never shrinks. While a reply is written it becomes **Stop** (same circle, a square inside, a soft pulsing ring).
  - **`+` opens one sheet (desktop: popover) with these groups:**
    - **Write** (the Draft helper, while its switch is on): Enhance my draft, Write for me, Continue my draft, then **Writing as: name** (each tap moves to the next: you, the character or each group member, the narrator; the menu stays open) and **Undo** when there is something to undo.
    - **Reply:** Regenerate, Continue, Impersonate, Attach.
    - **Tools:** Author's Note, CFG, Token probabilities, quick reply sets, other extensions' tools.
    - This replaces SillyTavern's ☰ and wand menus.
  - **Draft helper** (built in from the Draft Enhancer extension; Settings → Pocket Tavern → Draft helper):
    - Every request runs through SillyTavern's Impersonate, so the preset, lorebooks, persona and history apply; Pocket Tavern only adds one note describing the task. The result streams into the message box, already cleaned of reasoning, trackers and status blocks, and nothing is sent until the person sends it.
    - **Result bar**, right above the message box while a result is fresh: ‹ 2/3 › (earlier results, last 8), **Keep**, **Regenerate**, **Refine**, **Discard**, as 44px pill buttons in one row that scrolls sideways when narrow. While working it says "Writing…" with **Cancel**. It goes away on Keep, Discard, sending, or switching chats.
    - **Refine** opens a sheet: Shorter, Longer, More dialogue, More detail, More emotion, Simpler wording, and a field for your own change.
    - Shortcuts in the message box on desktop: `Alt+E`, `Alt+W`, `Alt+C`, `Alt+Z`. Slash commands: `/enhance-draft`, `/write-for-me`, `/continue-draft`.
    - Its settings page has the groups General, Writing, Model compatibility, Instructions and Clean-up, then **Preview the note** and **Reset to defaults**. Settings saved by the Draft Enhancer extension are taken over the first time.
    - While the Draft Enhancer extension itself is installed and on, the built-in one stays off (its settings page says so), so nothing runs twice.
  - **Quick replies:** one row of chips above the field that scrolls sideways.
  - **Extension buttons** that fit cleanly beside Send stay (one at most, such as Guided Generations as a single button). Everything else goes into `+`.
  - **Floating** (default) floats over the chat with a fade behind it. **Docked** sits flat along the bottom edge: on a phone the field is on its own row between your persona and Send, under the tools; on desktop it is one bar across the whole chat area (beside the rail and panel), with your persona's picture, the field, the tools and Send on one row in the chat column's width. Docked, the field shows the focus, not the box.
  - At 320px wide every tool keeps its 44px hit area.
- **Message editor:**
  - Phone: full screen, with ✕, title, and Save.
  - Desktop: in place, with Cancel and Save under the text.
  - Unsaved changes ask before closing.

### Character page
- **Top:**
  - Picture (96, SillyTavern's shape) and name (`title`), over a soft, blurred wash of the picture that fades out downwards.
  - Beside the name: ★ (favourite) and ⋯ (Export, Duplicate, Lorebooks, External media, then Delete in red). ★, Export, Duplicate, Lorebooks and Delete act on that character directly, through SillyTavern's own functions, so their chat stays shut. Only External media needs their chat, which then opens first (with a short note saying so).
  - A short about (creator's note or description), clamped to three lines with "More".
  - Under the name, who made the card ("by …").
- **Actions:** **Chat** (primary, opens the latest chat), **New chat** and **Edit** (secondary), on one row. In the editor itself, the card's own buttons are **New chat** and **Recent chats**.
- **Connections:** a **Lorebook** row with their lorebook (opens it in Lorebooks; with none, picks one), then their **Tags** as chips; a tag opens Characters showing only that tag.
- **Chats:** every chat with this character as chat rows (the chat's name, its last message, how many messages), newest first, with a filter field when there are more than eight.
- **Nothing changes** until the user picks something.
- **Where it opens:** on a phone, as a pushed page. On desktop, in the panel, with the chat staying beside it.

### Characters list
- **Toolbar:** one row: the search field, **Filter** (a count badge and the accent while anything is filtered), **Sort and view**, and `+` (accent; new character, imports, new group, Select several).
- **Filter** opens a sheet: **Show** (Favorites, Groups, Folders) and **Tags** (every tag, with its colour). Each row shows Any, Only or Hidden, and a tap moves it on (SillyTavern's own three states, through its own hidden buttons). Then **Edit tags** and **Clear all filters**.
- **While anything is filtered:** a row of chips under the toolbar, one per filter (a hidden one struck through), each removed with a tap, and **Clear**. SillyTavern's "N hidden" note is a quiet line under the results.
- **Sort and view** opens a sheet: **Show as** (Grid, List), then **Sort by** (SillyTavern's orders).
- **The list starts with** **Favorites** (characters and groups as small portrait cards, 88px wide at 3:4, in a row that scrolls sideways: the picture fills the card and the name sits on the neutral photo scrim, like the grid's cards; a character opens their page, a group its chat) and **All characters** with the total in a count pill right after it. Both headings start where the cards start. While searching or filtering, the header reads **Results** and Favorites step aside. SillyTavern's own favourites row and filter buttons stay hidden.
- **Grid:** picture cards (3:4, name at the bottom) with the card shadow; a favourite wears a gold star in a dark 24px circle at the top end corner. On desktop a card lifts and its picture leans in under the mouse.
- **A card's menu:** a long press (finger, 0.5 s) or right click (mouse) opens it: Open their page, Chat, New chat, Edit · ★, Lorebook, Duplicate, Export, Select several · Delete. During SillyTavern's bulk select, its own menu stays.

### Character editor
- **Where:** full screen on a phone, the widened panel on desktop. Header: ‹ (back to the character's page when it was opened from there, else to the list), the name.
- **Top:** the picture (96, SillyTavern's shape) at the start; beside it the name and **New chat** · **Recent chats** (stacked on a phone). The card's tools as labelled 56px tiles under them, four to a row.
- **Fields:** SillyTavern's own form, restyled, in three segmented tabs:
  - **Description**
  - **Greetings** (first message and alternates)
  - **Details** (creator's note and tags)
  - SillyTavern's Advanced definitions (personality, scenario, examples, prompt overrides) stay in its own popup, opened by the labelled **Advanced** button: showing them as a tab would mean moving SillyTavern's nodes (AGENTS.md → Rules, 4).
- **Saving:** changes save as you type, through SillyTavern.
- **Editing without opening the chat:** SillyTavern's form is filled for that character, and saves go to it. ★, Duplicate, Delete and the character's lorebook act on that character directly, through SillyTavern's own functions (its favourite toggle, `duplicateCharacter`, `deleteCharacter` after a question, `writeExtensionField`), so its chat stays shut. The few controls SillyTavern only offers for the open chat (persona links, tags, external media, the management menu) open that character's chat first, with a short note. Never point SillyTavern's current character at another character without opening its chat, or the open chat saves into the wrong folder.

### Lorebooks
- **Top:** **Active lorebooks** (global), a picker row showing how many are on ("3 of 17"); it opens the lorebook multi-picker. With the Easy lorebook picker switch off, it opens SillyTavern's own list instead. Then **Activation settings** (SillyTavern's scan depth, budget and the rest, as a page), **New lorebook** and **Import** (SillyTavern's own buttons).
- **Below:** every lorebook as a row, which opens its page. Lorebooks that are active for every chat say so. More than 8 lorebooks get a filter field.
- **A lorebook's page:** SillyTavern's editor for that one lorebook, restyled: the header shows its name; its tools (new entry, export, rename, duplicate, delete) and SillyTavern's search, which filters its entry cards. The other parts of SillyTavern's World Info screen are on the Lorebooks page instead. Deleting the lorebook returns to the Lorebooks page.
- **An entry** opens its editor: full screen on a phone, the panel on desktop.

### AI
- **Status card:**
  - The API and model names, and the connection state with a status-coloured dot.
  - When something is wrong, the card says what, in one sentence, with **Connect** or **Reconnect**.
- **Quick rows:** Connection profile, Model, Preset (pickers).
- **Rows to pages** (SillyTavern's own screens, restyled): Connection settings, Samplers, Prompts (Chat Completion only; the Presets page on its Prompts tab) and Formatting (every API: it also holds the tokenizer and other settings Chat Completion uses), each one page.
- **Formatting** opens on its sections as rows. In **Context template**, **Instruct template** and **System prompt**:
  - Instruct mode and the System prompt have a switch row at the top (it presses SillyTavern's own hidden checkbox), in place of the small ⏻ button.
  - With Chat Completion, a note under it says the greyed-out settings are ignored, with **Open Prompts**.
  - On a phone the preset picker takes its own line with its tools under it, and each prefix and suffix pair stacks.
  - The prompts get tall boxes; templates (story string, sequences) use a fixed-width face.
- **The AI tab** shows a small warning dot while nothing is connected.

### Settings
- Rows: **Appearance**, **Chat and layout**, **Personas**, **SillyTavern** (its sections as rows: Display, Chat, Characters, Sounds and more, Custom CSS, STscript), **Extensions**, **Pocket Tavern**, **About**.
- SillyTavern's own look section is part of Appearance, with the controls Pocket Tavern overrides hidden (UI theme colours, blur, Chat Style).
- Each settings page has its own filter field.

### Personas
- SillyTavern's persona screen, restyled (Settings → Personas), with two tabs: **All personas** and **Edit _name_**.
- **All personas:** one row of tools: **+** (new persona), the search field, the sort, and **⋯** with Usage stats, Backup, Restore and Grid view / List view (SillyTavern's own buttons, pressed hidden). The page controls show only when there is more than one page.
- Each persona is a card: its picture, name and the first lines of its description. The one in use has an accent edge and an **In use** label; the default one wears a crown. Tapping a card makes it the persona in use (SillyTavern's own behaviour).
- **Edit:** the picture and name, then its tools as labelled buttons (Rename, Sync name, Lore, Picture, Duplicate, Delete in red), then SillyTavern's own fields.

### Using native SillyTavern
"Use SillyTavern for now" (Settings → Pocket Tavern) switches to native SillyTavern for this visit. A single 44px **Back to Pocket Tavern** pill sits at the end side, just above SillyTavern's message box (never over Send), under SillyTavern's popups and toasts. It is the only thing Pocket Tavern leaves on SillyTavern's interface (`src/shell/native.js`).

**If Pocket Tavern breaks,** it does the same thing by itself (`AGENTS.md` → Rules, 10). It removes everything it added, SillyTavern's own interface shows, and one toast says: "Something went wrong in Pocket Tavern, so SillyTavern's own screens are showing. Your chats are safe." The Back to Pocket Tavern pill is there to try again. Reloading the page also starts Pocket Tavern again.

---

## 7. SillyTavern's own screens

**Replaced** (Pocket Tavern views, writing through SillyTavern's controls):
- Chats home
- the chat's header and message box tools
- the character page
- the AI root
- the Settings hub
- Appearance
- Pocket Tavern settings
- About
- the Lorebooks page
- pickers for long selects and lorebooks

**Restyled** (SillyTavern's screens, marked and styled with tokens):
- connection and API settings
- presets and samplers
- the prompt manager and prompt editor
- formatting
- the character editor form
- persona editor fields
- lorebook editor and entries
- user settings sections
- extensions panels
- backgrounds grid
- SillyTavern's popups and toasts

**Hidden** while Pocket Tavern is on:
- **Panel locks** (issue #10): `#lm_button_panel_pin_div`, `#rm_button_panel_pin_div`, `#WI_panel_pin_div`.
- **SillyTavern's top bar of drawer buttons** (`#top-settings-holder` toggles). The tab bar and rail replace them.
- **The character panel's own navigation** (issue #11): `#rm_button_characters`, `#rm_button_back`. The Characters place replaces it.
- **The welcome screen's header and shortcut chips** (Docs, GitHub, Discord; issue #11). They move to Settings → About. The Chats home replaces the welcome screen.
- **Titles a SillyTavern screen repeats** under Pocket Tavern's header.
- **SillyTavern's ☰ and wand menus** in the message box. Their items are offered through `+`.
- **Browser spin arrows** on number inputs.
- **Controls Pocket Tavern overrides:** blur strength, UI theme colours, Chat Style.

**Icon toolbars** in SillyTavern's screens (for example a preset's import, export, rename and delete): show the one or two most used as labelled buttons. The rest go behind a ⋯ menu whose items `click()` SillyTavern's hidden buttons.

---

## 8. Writing

- **Voice:** sentence case, plain verbs, short sentences. No jargon, no apologies, no exclamation marks.
- **Layout words:** "tap" and "long-press" on a phone, "click" and "hover" on desktop. Never "phone" in desktop text.
- **Translation:** every label goes through `t()`, with a row in every `locales/` file. User data never goes through `t()`.

| Say | Not |
|---|---|
| Chat, Chats | conversation, thread, Recent chats (as a place) |
| Message box | composer, input |
| Version (of a reply) | swipe (on buttons and labels) |
| AI | API (except inside SillyTavern's own forms) |
| Connection, Model, Preset | |
| Persona | user, profile |
| Lorebook, entry | World Info (except inside SillyTavern's own forms) |
| Character, group | bot |
| Pocket Tavern | PT, the extension (in the interface) |

---

## 9. Decisions and tradeoffs

| Decision | Why | Cost and mitigation |
|---|---|---|
| **Five places, no More** (issues #9, #11) | One obvious route to everything, the same on both layouts | SillyTavern veterans look for "API". AI's status card is the first thing on that screen, and search finds "API" |
| **API, Presets and Formatting merged into AI** | Users think "what am I talking to, and how", not three screens | AI is a deeper place. Its root shows the three things people change most as quick rows |
| **The chat pushes over the tabs on a phone** | Room and focus, like every messaging app. The tab toggle and its setting disappear | One extra tap (back) to change place from a chat |
| **No permanent connection status** (#9) | 99% of the time it is fine. Problems get a banner, a fix, and a dot on AI | Users can always check on AI |
| **✕ dismisses, words commit** (#9) | "Close" read like a label. A cross is universal | none |
| **No −/+ steppers by default** (#12) | SillyTavern's steps (0.01, 1 token) made them useless and they took a third of the row | Typing the value is one tap; the slider covers rough changes. A switch brings them back as one pill |
| **Actions round, containers rectangular** (#9) | One shape per role, and pills read clearly | none |
| **One ⋯ menu per object, shown wherever the object is** | Consistent actions without counting as extra routes | none |
| **No `backdrop-filter`** | Phone GPUs and broken fixed layers | Over chat backgrounds, cards are tinted, not blurred |
| **Six themes, plus SillyTavern's** | Fewer, better-tuned themes. Each one is tested for contrast | Midnight, Mocha, Ocean, Forest, Sakura, Nord, Abyss, Cloud and Lavender are retired. Saved choices fall back to Pocket |
| **Every behaviour switch stays** | People choose how their app behaves; customizing is part of Pocket Tavern | More combinations to test. Switches are grouped and explained so the list stays easy to read. Modern font becomes Appearance → Reading font (the same choice, better named) |
| **Classes renamed `stmui-` → `pt-`** (3.0) | A clean slate with one prefix | Users' custom CSS aimed at Pocket Tavern's own classes needs updating; this is announced in the 3.0 notes. The `mobileUI` settings key is kept |
| **Pocket Tavern's own views for daily screens; SillyTavern's forms for the long tail** | A coherent app where it matters, while SillyTavern keeps saving everything | Restyled screens can look less tailored. They follow the same tokens and component rules |
| **No full-width top bar on desktop** | More height for reading. Headers belong to their column | none |
| **A crash switches to SillyTavern by itself** | Nobody is left with a broken screen, and no data is at risk because SillyTavern did all the saving | A one-off error hides Pocket Tavern for that visit. The toast and the Back pill make it obvious, and a reload starts it again |
| **Layout can be chosen** (Automatic, Phone, Desktop) | Tablets and small laptops sit between the two sizes, and people have a preference | One more setting. Desktop never applies below 768px wide, so the chat column always fits |
| **Ideas from AstraProjecta, never its code** | Its crash fallback, popup watch and chat-switch handling are good ideas. It is AGPL and Pocket Tavern is MIT | We write our own. It moves SillyTavern's nodes, which we do not (`AGENTS.md`, Rule 4) |
