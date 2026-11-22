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
