# Pocket Tavern — Design System & UI Specification

This document is the single source of truth for Pocket Tavern's visual design, tokens, layout rules, and component behavior across **Phone** and **Desktop**.

Rules marked **Target** are agreed goals the code does not meet yet. They are scheduled in the redesign (Phase 2 for type, radius, spacing and motion; Phase 3 for components) and listed together in §7. Build toward them; never write them out of this document because today's code differs.

---

## 1. Core Aesthetic Philosophy
Pocket Tavern should feel like a **fast, calm, native messaging & reading app**—comparable to Telegram, Linear, or Apple Messages—not a flashy web demo.
- **Content First:** The character's writing and conversation are the star. Chrome (bars, toolbars, buttons) stays quiet and out of the way.
- **Tactile & Crisp:** Clear hairline borders, subtle surface elevation, sharp typography, and predictable 4px-grid spacing.
- **Zero "AI Slop":** Every visual element must earn its place.

### Explicitly Banned Visual Patterns
Do NOT introduce any of the following:
- Purple/pink/cyan neon gradients or glowing borders/drop-shadows
- `backdrop-filter: blur()` anywhere — it lags mobile GPUs **and** turns an element into the containing block of its `position: fixed` children, which breaks full-screen editors over scrolled chats/pages. Pocket Tavern explicitly disables SillyTavern's own blur while active.
- Card-inside-card-inside-card nesting
- Random emojis used as UI icons (use clean monochrome Lucide-style SVGs from `icons.js`)
- Oversized pill radii (`9999px`) on every container
- Bouncy, slow, or theatrical animations

---

## 2. Design Tokens, Themes & Z-Index Layers

### Root & Token Naming
All styles are scoped under `html.stmui-on` (plus state classes on `<html>`). **`--pt-*` tokens are the source of truth**; older `--stmui-*` variables alias them for backward compatibility and are not used in new code.

### Color & Surface Tokens (Default Theme: **Pocket**)
| Token | Pocket (Dark) | Pocket Light | Role |
|---|---|---|---|
| `--pt-bg` | `#0e0f12` | `#f6f7f9` | Opaque app canvas, bars, pages, sheets, dialogs, composer |
| `--pt-surface` | `#16181d` | `#ffffff` | Cards, fields, secondary containers |
| `--pt-surface-elevated` | `#1e2128` | `#eceef2` | Hover states, popovers, raised controls |
| `--pt-border` | `rgba(255, 255, 255, 0.08)` | `rgba(22, 24, 29, 0.10)` | Hairline separators |
| `--pt-text-primary` | `#eceef2` | `#16181d` | Main prose and primary labels |
| `--pt-text-secondary` | `#9aa0ad` | `#5a6170` | Timestamps, narration, metadata, subtle labels |
| `--pt-text-muted` | contrast-checked (`≥ 3:1`) | contrast-checked (`≥ 3:1`) | Placeholders, disabled hints |
| `--pt-accent` | `#5b8def` | `#2f5fc4` | Single restrained accent for primary actions/active states |
| `--pt-accent-soft` | `16%` `--pt-accent` | `16%` `--pt-accent` | Soft selection/active tint |
| `--pt-on-accent` | `#0b1630` | `#ffffff` | Text/icons placed on `--pt-accent` |
| `--pt-danger` | contrast-checked (`≥ 4.5:1`) | contrast-checked (`≥ 4.5:1`) | Destructive actions only |
| `--pt-card-user` / `--pt-card-bot` | subtle surface tint | subtle surface tint | Message card backgrounds (the only translucent surfaces over chat backgrounds) |
| `--pt-backdrop` | `#0e0f12` | `#f6f7f9` | Flat backdrop behind the chat (no gradients) |

### Spacing, Radii & Motion Tokens
- **Spacing (4px scale):** `--pt-space-1` (`4px`), `--pt-space-2` (`8px`), `--pt-space-3` (`12px`), `--pt-space-4` (`16px`), `--pt-space-5` (`20px`), `--pt-space-6` (`24px`), `--pt-space-8` (`32px`).
- **Radii:** `--pt-radius-sm` (`10px`, controls/inputs), `--pt-radius` (`14px`, message cards/panels).
- **Motion:** `--pt-dur-fast` (`150ms`), `--pt-dur` (`220ms`), `--pt-ease` (`cubic-bezier(0.2, 0, 0, 1)`).

### Z-Index Scale
Every layered element must sit on this documented scale (never invent ad-hoc `9999`/`30000` values):
| Token | Value | Layer |
|---|---|---|
| `--pt-z-chat` | `30` | In-chat floating controls (Jump to bottom) |
| `--pt-z-page` | `3005` | Full-screen pages / desktop side page |
| `--pt-z-panel` | `3050` | Desktop side tool panels (`#movingDivs`) |
| `--pt-z-finder` | `3150` | In-chat search bar (below full-screen message editor) |
| `--pt-z-edge` | `3250` | Desktop panel resize edge |
| `--pt-z-editor` | `3300` | Full-screen editors (message editor, opened lorebook entry, prompt editor) |
| `--pt-z-drag` | `3500` | Swipe-to-regenerate hint overlay |
| `--pt-z-bars` | `4010` | App bar and bottom tab bar / desktop left rail |
| `--pt-z-banner` | `4030` | Connection / translation status banners |
| `--pt-z-popup` | `5000` | Top-level popups & extension overlays (native `<dialog>` sheets open in the browser top layer above all z-indexes) |

### Contrast & Theme Rules
- **WCAG AA Minimum:** Body text, narration, dialogue, text on cards, text on accent, and `--pt-danger` must meet **4.5:1** minimum. Secondary/muted labels and accents must meet at least **3:1** on both `--pt-bg` and `--pt-surface`.
- **Never hardcode dark-only hexes** (such as bright yellows/pastels) for icons, badges, toasts, or warnings—derive semantic colors so they pass contrast on all 10 dark and 4 light themes (`Pocket`, `Pocket Light`, `Paper`, `Cloud`, `Lavender`, etc.).
- **SillyTavern Themes & Chat Backgrounds (`html.stmui-glass`):** SillyTavern themes are converted into these roles with contrast enforced. Over a chat background, bars, pages, sheets, dialogs, and the composer stay **opaque**; only message cards become translucent tints so the artwork shows through and between them. Both `--SmartThemeBodyColor` and `--pt-text-primary` are lifted over mid-grey until they meet contrast.

---

## 3. Typography & Reading Ergonomics
- **Font Stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif` (or inherit SillyTavern's user-chosen font when **System font** is off).
- **Reading Size:** `15px` on phones and `16px` on desktop by default, `line-height: 1.6`, clear paragraph rhythm (`0.75em` gap between paragraphs in Comfortable mode). The **Chat text size** setting scales smoothly from this baseline.
- **Dialogue & Narration:** `*italics*` (`--SmartThemeEmColor`) and `"dialogue"` (`--SmartThemeQuoteColor`) remain visually distinct without garish neon colors.
- **Desktop Reading Column:** Centered, never stretching wall-to-wall on a 1440p monitor, and never crushing `#send_form` when side panels are open. **Target:** cap the column at `760px` (`720px–780px`), or SillyTavern's **Chat width** slider when that is narrower. Today it follows the Chat width slider alone (up to `1280px` at 2560 wide).
- **Code Blocks & Tables:** Horizontally scrollable inside their own container (`overflow-x: auto`) so wide content never breaks viewport width.
- **Quotes & Code Blocks:** `0.75em` above and below (`0.5em` in Compact) so the text around them reads apart.
- **Message Cards over a Chat Background:** a card from a SillyTavern theme takes the strength of both of SillyTavern's layers (chat tint and message tint), and its text is checked against the card over a bright picture as well as a mid-grey one.

---

## 4. Two Layouts & Platform Invariants

### Phone Layout (`html:not(.stmui-wide)`)
- **Structure:** Top app bar, bottom tab bar (Chat, Characters, Lorebooks, Presets, More — auto-tucked in chat when enabled), full-screen pages one at a time, bottom-sheet menus, and Android/browser back-gesture integration.
- **Safe Areas:** Pad top bar with `env(safe-area-inset-top)` and bottom bar / docked composer with `env(safe-area-inset-bottom)`.
- **Touch Targets:** **44×44px** is the strict floor for every tappable control on a phone, including steppers, chevrons, close buttons, tags, and chip `×` buttons. Visual chrome may look smaller (e.g. a 32px chip) only if its hit area fills 44px via padding or `::after`.
- **No Horizontal Scroll:** Zero elements may bleed past viewport width (test down to `320px` and `360px` with extensions enabled).

### Desktop Layout (`html.stmui-wide`, `≥ 960×560`)
- **Structure:** Compact left navigation rail with every page, resizable side page panel beside the chat that stays open while chatting, right-hand column for tool panels (Author's Note, CFG, Token Probabilities), centered dialogs instead of bottom sheets, and `Ctrl/Cmd+K` for Search everything.
- **Keyboard:** `Enter` sends and `Shift+Enter` inserts a newline (SillyTavern's own **Send on Enter** setting decides; never override it), `Escape` closes the topmost dialog, sheet or page (only when not typing in a text field).
- **Dual-Panel Fit:** Left side panel width must account for any open right-hand tool panel (`--stmui-right`) so the center chat & composer never crush below usable width on `960–1200px` screens.
- **Pointer Precision:** On fine pointers (`@media (pointer: fine)`), Compact controls may drop under `44px`; on touch devices (tablets/touch laptops), touch targets stay `44px`.
- **Hover & Keyboard Focus:** Subtle hover states (`--pt-surface-elevated`) and clear `:focus-visible` outlines on every interactive control—never strip `outline: none` without a `:focus-visible` ring.

### iPhone & iPad (Safari / WebKit)
- Safari does not shrink the layout viewport when the virtual keyboard opens.
- Every fixed or input-bearing layer (app bar, `#sheld`, open pages, prompt editor, message editor, opened lorebook entry, `#character_popup`, `.stmui-chat-finder`, popups, banners) must follow `--stmui-ios-top` and `--stmui-ios-h` while `html.stmui-ios-kb` is active—**never rely on `100dvh` alone** for fixed layers.
- On iPad landscape (`html.stmui-wide.stmui-ios-kb`), full-screen editors must keep their desktop horizontal rail/column offsets rather than stretching over the left rail.
- Verify every phone/fixed/keyboard change in both Chrome and WebKit (`ENGINE=webkit node ios.mjs`).

### Android Keyboard
- The chat and composer slide together as **one piece** when the window shrinks—never animate either independently.
- The root page itself never scrolls; hidden bars/elements must leave layout (`display: none`).

### Full-Screen Layers (from SillyTavern DOM)
- Full-screen editors built from SillyTavern elements (message editor, opened lorebook entry, prompt editor) are `position: fixed`, opaque (`--pt-bg`), `align-self: stretch`, and placed between the bars.
- Their ancestors must never carry persistent `backdrop-filter`, `transform`, `filter`, or `contain`.

### Right-to-Left (`html.stmui-rtl`)
- Active only when an RTL dictionary is actually loaded (currently Arabic `ar`).
- Prefer CSS logical properties (`text-align: start`, `margin-inline-start/end`, `inset-inline-start/end`) over physical `left`/`right` inside bars, sheets, search bars, and chat finder. Flip directional arrows and set `lang` on dialogs/sheets for proper hyphenation.

---

## 5. Component Specifications

### Top Bar (`.stmui-appbar`)
- Compact (`48px–52px` height), single row, solid `--pt-bg`, clean hairline bottom border.
- Shows active character/group avatar + truncated title (`text-overflow: ellipsis`) or current page title + back button, quick translate trigger (on chat), and page/chat contextual action.
- **Target:** a clean one-tap toggle back to native SillyTavern for this visit, with a single `44px` "Back to Pocket Tavern" pill in a corner of the native interface. Today switching lives in **More → Pocket Tavern settings**. Turning Pocket Tavern off in settings still leaves nothing behind.

### Message List & Avatars
- Subtle separation between User (`--pt-card-user`) and Character (`--pt-card-bot`) messages across **Cards**, **Bubbles**, and **Flat** looks.
- Honors all four of SillyTavern's `avatar_style` shapes (Circle, Square, Rounded, Rectangle).
- Message actions stay calm and unobtrusive, never 8 loud buttons on every message: a clean compact row + `⋯` action sheet on phone; swipes sit in a compact `‹ 1/3 ›` pill.
- **Target (desktop):** message buttons sit at low opacity and come up fully on hover or keyboard focus of the message, with a mouse only (`@media (hover: hover)`). Today they are always shown at full strength.

### Composer (`#send_form`)
- Supports **Floating** and **Docked** layouts; auto-growing `<textarea>` capped before scrolling internally. **Target:** the cap is `~35%` of the window height (today `40dvh`).
- **Send / Stop** sits anchored at the bottom-right and never shrinks.
- Houses SillyTavern's `☰` chat options, wand (**Tools**), persona chip, tabs toggle arrow (phone), context ring, and compatible extension triggers (e.g. Guided Generations compass, Input History inside the field, slim Quick Reply chips). Any extension button that does not fit cleanly next to Send moves to the wand's **Tools** sheet.
- **Target:** secondary actions tucked into one `+` menu: `☰` (Chat options) and the wand (Tools) merge into a single `+` sheet with both groups, so the row keeps at most persona, `+`, context ring, the guide button and Send, and `320px` phones are never tight.
- Extension compatibility patches are keyed strictly on each extension's markup and do nothing when absent (tested with Guided Generations, Quick Replies, Input History, Moonlit Echoes, ScenePulse, and Chat Completion Tabs).

### Sheets & Dialogs
- Bottom sheets on phones (drag handle, safe-area padding), centered modal dialogs on desktop (no downward drag-dismiss on desktop).
- Preserve keyboard focus (restore trigger focus on close; avoid blowing away focused controls during toggle refreshes) and always show a clear empty state when search yields no matches.

---

## 6. Motion & Writing

### Motion
- **Durations:** `150ms` micro-interactions, `200ms–240ms` sheets/panels/dialogs.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` (snappy, native ease-out—avoid bouncy overshoot curves).
- **Reduced Motion:** Both `html.stmui-motion-off` and `@media (prefers-reduced-motion: reduce)` must neutralize animations **and** pseudo-elements (`*::before`, `*::after`) with `animation-iteration-count: 1 !important` and `0s` delays so infinite indicators never strobe.

### Writing & Localization
- Sentence case, plain verbs, no jargon, no apologies.
- Words follow the active layout: never say "phone" or "tap / long-press" on desktop, and never say "click" on a phone.
- Every user-facing UI label goes through `t()` with matching entries in `locales.js` (`es`, `pt`, `ru`, `zh`, `ja`, `ar`). Never run user-authored data through `t()`.

---

## 7. Decisions for this codebase (November 2026)
- **Root and tokens:** the root selector is `html.stmui-on` (see CLAUDE.md). The `--pt-*` tokens are the source of truth; the older `--stmui-*` tokens are aliases of them and are not used in new code. Nothing is renamed from `stmui` to `pt`: that would break saved settings, drafts, character and chat data, and users' custom CSS.
- **Themes:** the palette in §2 is the default theme, **Pocket**, with a matching light version. The other Pocket Tavern themes stay, built from the same roles (`--pt-bg`, `--pt-surface`, `--pt-surface-elevated`, `--pt-border`, the three text levels, one accent, danger), flat (no glows, no gradients) and meeting the contrast rule. SillyTavern UI themes are offered too, converted to these roles with the contrast rule enforced.
- **Chat backgrounds:** no `backdrop-filter` anywhere. Over a chat background, bars, pages, sheets, dialogs and the composer stay solid; only message cards are a translucent tint, so the picture shows through them and between them. Card text is checked against the tint over mid grey and lifted until it meets the contrast rule. SillyTavern's own blur on `#chat` and its drawers is switched off while the shell is on (2.25.1: a blurred container put the full-screen message editor thousands of pixels off screen).
- **Reading text:** 15px on phones and 16px on desktop by default, line-height 1.6, 0.75em between paragraphs. The Chat text size setting scales up from there.
- **SillyTavern's own screens** stay SillyTavern's: marked, restyled with tokens and placed with CSS, never moved or rebuilt. Where a screen is a long list of settings, Pocket Tavern may show it in steps (a list of sections that each open their own page, like Settings) by hiding the other sections, not by moving them.

### Targets not built yet
**Phase 2 (type, radius, spacing, motion):**
- Message text at 15px on phones and 16px on desktop, line-height 1.6 (Compact 1.5), 0.75em between paragraphs (Compact 0.5em).
- Font sizes folded into 12 / 14 / 15 / 16 / 20 / 24.
- Radii from the tokens: 14px containers, 10px controls; round icon buttons and avatars stay round.
- Every spacing value on the 4px scale.
- Every duration 150–240ms with `--pt-ease`; no overshooting easing, no theatrical send animation, no `box-shadow` animation; Full motion follows `prefers-reduced-motion`.
- Hidden scrollbars only inside Pocket Tavern's own scrolling areas, never on every element.

**Phase 3 (components):**
- Top bar 52px (48px in Compact) with the one-tap SillyTavern toggle (§5 Top Bar).
- Desktop message buttons at low opacity until hover or focus (§5 Message List).
- Composer: the 35% cap and the single `+` sheet (§5 Composer).
- Desktop column capped at 760px, or Chat width when narrower (§3).
- A `:focus-visible` ring on every Pocket Tavern control.
