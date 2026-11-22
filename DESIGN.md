# PocketTavern — Design System & UI Specification

## 1. Core Aesthetic Philosophy
PocketTavern should feel like a **fast, calm, native messaging & reading app**—comparable to Telegram, Linear, or Apple Messages—not a flashy web demo.
- **Content First:** The character's writing and conversation are the star. Chrome (headers, toolbars, buttons) stays quiet and out of the way.
- **Tactile & Crisp:** Clear borders, subtle surface elevation, sharp typography, and predictable spacing.
- **Zero "AI Slop":** Every visual element must earn its place.

### Explicitly Banned Visual Patterns (AI Slop)
Do NOT use any of the following:
- Purple/pink/cyan neon gradients or glowing borders/shadows
- Heavy `backdrop-filter: blur()` glassmorphism (looks generic and lags on mobile GPUs)
- Card-inside-card-inside-card nesting
- Random emojis used as UI icons (use clean, consistent monochrome SVG icons)
- Oversized rounded pills (`border-radius: 9999px`) on every single container
- Bouncy, slow, or theatrical animations

---

## 2. Color & Theme Tokens
All tokens must be prefixed with `--pt-` and scoped inside `.pt-root`.

### Dark Mode (Default)
- `--pt-bg`: `#0e0f12` (app canvas)
- `--pt-surface`: `#16181d` (composer, drawers, secondary bubbles)
- `--pt-surface-elevated`: `#1e2128` (hover states, popovers)
- `--pt-border`: `rgba(255, 255, 255, 0.08)` (hairline separators, never harsh)
- `--pt-text-primary`: `#eceef2` (main prose — soft off-white, not blinding `#fff`)
- `--pt-text-secondary`: `#9aa0ad` (timestamps, metadata, subtle labels)
- `--pt-text-muted`: `#6b7280` (placeholders, disabled states)
- `--pt-accent`: `#5b8def` (single restrained accent for primary actions/active states; can inherit ST accent if readable)
- `--pt-danger`: `#e55353` (destructive actions only)

### Contrast Rule
All body text must meet **WCAG AA (4.5:1 minimum)** contrast. Secondary metadata must meet at least **3:1**.

---

## 3. Typography & Reading Ergonomics
Roleplay and long-form chat live or die by readability:
- **Font Stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif` (or inherit SillyTavern's user-chosen font when set).
- **Body Text:** `15px` on mobile, `15.5px–16px` on desktop; `line-height: 1.6`.
- **Paragraph Spacing:** Clear `0.75em` gap between paragraphs inside a message so walls of text stay scannable.
- **Italics / Actions / Dialogue:** Ensure `*italics*` and `"dialogue"` have clear visual distinction without garish colors.
- **Desktop Measure:** Cap the reading column at `720px–780px` centered. Never stretch text wall-to-wall on a 1440p monitor.
- **Code Blocks & Tables:** Horizontally scrollable inside their own container (`overflow-x: auto`) so they never break the page width.

---

## 4. Spacing, Radii & Layout

### Spacing Scale (4px Base)
Use only multiples of 4px: `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`.

### Border Radius
- Small controls (buttons, inputs): `8px–10px`
- Message containers / panels: `12px–14px`
- Avatars: `50%` (circle) or `10px` (squircle) — pick one and stay consistent.

### Mobile Layout (`390x844` Target)
- **Viewport:** Use `100dvh` and `visualViewport` listeners so the virtual keyboard pushes the composer up cleanly without hiding it or breaking scroll.
- **Safe Areas:** Pad top header with `env(safe-area-inset-top)` and bottom composer with `env(safe-area-inset-bottom)`.
- **Touch Targets:** Every tappable button/icon MUST be at least `44x44px` (use padding if the visual icon is `18px–20px`).
- **No Horizontal Scroll:** `overflow-x: hidden` on the root container; zero elements may bleed past viewport width.

### Desktop Layout (`1440x900` Target)
- Centered chat column (`max-width: 760px`) with generous breathing room.
- Drawers/sidebars slide cleanly without pushing or squishing text awkwardly.
- Full keyboard support: `Enter` sends, `Shift + Enter` inserts newline, `Escape` closes active drawers/modals.
- Subtle hover states (`background: var(--pt-surface-elevated)`) and clear `:focus-visible` outlines.

---

## 5. Component Specifications

### Top Bar
- Compact (`48px–52px` height), single row, clean hairline bottom border.
- Shows: Character avatar + name (truncated cleanly with `text-overflow: ellipsis`), menu/drawer toggle, and a clean one-tap toggle back to native SillyTavern.

### Message List
- Clear visual separation between User and Character messages (subtle surface tint or alignment, not loud neon bubbles).
- Message actions (swipe, edit, regenerate, delete) must be unobtrusive: hidden or low-opacity until hovered on desktop, or cleanly accessible via a compact action row / tap on mobile—never cluttering every message with 8 loud buttons.

### Composer (Input Bar)
- Auto-growing `<textarea>` capped at ~35% of viewport height before scrolling internally.
- Single clear Send / Stop-Generating button positioned at the bottom-right.
- Secondary actions (attach, impersonate, quick actions) tucked cleanly into a `+` menu or subtle icon row—never cramped.

---

## 6. Motion & Transitions
- **Duration:** `150ms` for micro-interactions (hover, button press), `200ms–240ms` for drawers/modals.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` (snappy, native-feeling ease-out).
- **Reduced Motion:** Respect `@media (prefers-reduced-motion: reduce)` by disabling non-essential transitions.

---

## 7. Decisions for this codebase (November 2026)
- **Root and tokens:** the root selector is `html.stmui-on` (see CLAUDE.md). The `--pt-*` tokens above are the source of truth; the older `--stmui-*` tokens are aliases of them and are not used in new code.
- **Themes:** the palette in section 2 is the default theme, **Pocket**, with a matching light version. The other Pocket Tavern themes stay, built from the same roles (`--pt-bg`, `--pt-surface`, `--pt-surface-elevated`, `--pt-border`, the three text levels, one accent, danger), flat (no glows, no gradients) and meeting the contrast rule. SillyTavern UI themes are offered too, converted to these roles with the contrast rule enforced.
- **Chat backgrounds:** no `backdrop-filter` anywhere. Over a chat background, bars, pages, sheets, dialogs and the composer stay solid; only message cards are a translucent tint, so the picture shows through them and between them. Card text is checked against the tint over mid grey and lifted until it meets the contrast rule. SillyTavern's own blur on `#chat` and its drawers is switched off while Pocket Tavern's shell is on: a `backdrop-filter` (like `transform` or `filter`) makes an element the containing block of its `position: fixed` children, which once put the full-screen message editor thousands of pixels off screen (2.25.1).
- **Reading text:** 15px on phones and 16px on desktop by default, line-height 1.6, 0.75em between paragraphs. The Chat text size setting scales up from there.

## 8. Pocket Tavern specifics
Rules that come from real bugs and devices; they apply on top of sections 1–6.

**Two layouts.** Phone layout: a tab bar at the bottom (Chat, Characters, Lorebooks, Presets, More), pages full screen one at a time, menus as bottom sheets, a back gesture. Desktop layout (`html.stmui-wide`, at least 960 × 560): a rail on the left with every page, pages as a panel beside the chat that stays open and can be widened, menus as dialogs in the middle, Escape and Ctrl+K. Words follow the device (never "phone" on desktop, never "click" on a phone). On desktop with a mouse (`pointer: fine`) Compact controls may go under 44px; with a finger they stay 44px.

**Touch targets.** 44px is the floor for anything tappable on a phone, including steppers, chevrons and chip ×. A control can look smaller (a 32px chip) if its hit area fills 44px.

**iPhone and iPad.** Safari does not shrink the page for the keyboard. Anything fixed to the screen follows `--stmui-ios-top` / `--stmui-ios-h` while `html.stmui-ios-kb` is on, never `100dvh`. Every phone change is checked in Chrome and in WebKit.

**Android keyboard.** The chat and composer slide as one piece when the window shrinks; never animate either alone. The page itself never scrolls; anything hidden leaves the page (`display: none`).

**Full-screen layers** made from SillyTavern's own elements (the message editor, an opened lorebook entry, the prompt editor) are fixed, opaque, `align-self: stretch`, and placed between the bars. Their containers must not carry `backdrop-filter`, `transform`, `filter` or `contain`.

**SillyTavern's DOM.** Never move SillyTavern's elements; mark them with classes, hide them, or place them with CSS. Layout other CSS keeps breaking (the composer) is pinned with `!important` on the few properties that matter, with a comment. Turning Pocket Tavern off leaves nothing behind.

**Other extensions.** Guided Generations, Quick Replies, Input History, Moonlit Echoes, ScenePulse and Chat Completion Tabs are installed in the test copy; patches for them are keyed on their markup and do nothing when they are absent. Send never shrinks; an extension button that does not fit next to Send moves to the wand's Tools sheet.

**Right to left.** Arabic sets `html.stmui-rtl`: arrows that point a way flip, text beside a picture starts at the start edge, sheets carry `lang` so long words hyphenate.

**Writing.** Sentence case, plain verbs, no apologies. Every label goes through `t()` with a row in `locales.js` (es, pt, ru, zh, ja, ar).
