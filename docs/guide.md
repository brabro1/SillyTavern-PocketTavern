# Getting around Pocket Tavern

> [!NOTE]
> This guide describes **Pocket Tavern 3.1**. Coming from 2.x? The table at the end shows where everything went.

Pocket Tavern has **five places**. Everything you can do lives in exactly one of them, and they are the same on a phone and on a computer.

| Place | What you do there |
|---|---|
| **Chats** | Pick up a chat where you left it, or search for anything |
| **Characters** | Browse your characters and groups, start chats, edit cards |
| **Lorebooks** | Turn lorebooks on and off, and edit their entries |
| **AI** | See if you're connected, and pick the model and preset |
| **Settings** | Appearance, personas, SillyTavern's settings, extensions, and Pocket Tavern itself |

---

## On a phone

```
 A place                          A chat
┌───────────────────────────┐    ┌───────────────────────────┐
│ Chats                     │    │ ‹  (◉) Seraphina       ⋯  │ ← back · who you're talking to · chat menu
│ [ Search everything     ] │    │                           │
│                           │    │   messages                │
│ Pinned                    │    │                           │
│ Recent                    │    │                           │
│                           │    │ ┌───────────────────────┐ │
├───────────────────────────┤    │ │(◉) Message…   +   ➤   │ │ ← your persona · + more · Send
│ Chats Chars Lore  AI Sett.│    │ └───────────────────────┘ │
└───────────────────────────┘    └───────────────────────────┘
  the five places, always at the bottom   (tabs step aside in a chat)
```

- **Open a chat** from Chats. The chat covers the tabs so you have the whole screen. Tap **‹** (or swipe back) to return.
- **Tap the name** at the top of a chat to see that character: start a **New chat**, see all your chats with them, or **Edit** them.
- **`+` in the message box** has quick-switch chips (Model, Preset, Persona), the Draft helper, reply actions (Regenerate, Continue, Impersonate, attach a file) and tools like Author's Note. Focusing the message box also shows a one-tap **RP formatting bar** (`*Italic*`, `"Quote"`, `**Bold**`, `(OOC)`).
- **⋯ at the top of a chat** has everything about the chat: **Focus mode**, **Pinned messages** (Story Moments), **Chat insights**, search in it, translate it, rename, select messages, export and delete.
- **The persona button** (your picture in the message box) switches who you are.
- **The little ring** in the message box shows how full the model's memory is. Tap it to see what is using it: the character, your persona, lorebooks and the chat so far.
- **On a message:** tap ✎ to edit it, or ⋯ (or long-press the message) to pin a Story Moment, copy, branch or delete. Drag the last reply sideways for another version.
- **Characters** has one-tap quick filter chips and a **Filter** button for favourites, groups and tags. Long-press a card (right-click on a computer) for its menu.
- **Lorebooks** shows each entry as a scannable card with quick filters (`All`, `Enabled`, `Constant`, `Disabled`), a clickable strategy pill, previews and a 4-tab editor (`Content`, `Triggers`, `Placement`, `Advanced`).
- **AI** shows your connection status, preset, live **Quick samplers** sliders, and links to Connection settings, Samplers and Formatting.
- **Close anything** with ✕, by dragging a sheet down, or with your phone's back gesture.
- Tapping the tab you're already on takes you back to the top of that place.

## On a computer

```
┌──────┬────────────────┬──────────────────────────────────┐
│Chats │ Chats          │ (◉) Seraphina                 ⋯  │
│Chars │ [ Search…    ] │                                  │
│Lore  │ Pinned         │   messages                       │
│ AI   │ Recent         │                                  │
│Sett. │                │ [(◉) Message…          +    ➤ ]  │
└──────┴────────────────┴──────────────────────────────────┘
  rail     panel               your chat (tools open on the right)
```

- The **rail** on the left lists the five places. Clicking one opens it in the **panel** beside your chat, so you can browse characters or change settings while the chat stays in view.
- **Click the place you're on** again to hide the panel and give the chat the whole window. **Drag the panel's edge** to make it wider or narrower.
- Author's Note, CFG and token probabilities open in a column on the right.
- Message buttons stay faint until you point at a message.
- **On a tablet or a small laptop**, choose the layout yourself under **Settings → Chat and layout → Layout**: Automatic, Phone or Desktop. Desktop needs a window at least 768 pixels wide.
- **Keyboard:**
  - <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>K</kbd> on a Mac) searches everything: characters, chats, lorebooks, settings and the five places.
  - <kbd>Esc</kbd> closes the top menu or dialog, then goes back in the panel.
  - <kbd>Enter</kbd> sends and <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line, or the other way round if you changed SillyTavern's Send on Enter setting.

---

## When something is wrong

Pocket Tavern stays quiet while everything works. If the connection drops or SillyTavern stops answering, a banner appears at the top of your chat with a button that fixes it. A small dot also shows on **AI**. Open **AI** any time to see the connection, model and preset.

If Pocket Tavern itself runs into a problem, it steps aside by itself: SillyTavern's own screens appear, with a note that your chats are safe. Use **Back to Pocket Tavern** to try again, or reload the page. If it keeps happening, please [report it](https://github.com/brabro1/SillyTavern-PocketTavern/issues/new/choose). The browser console shows the error, marked `[Pocket Tavern]`.

## Switching back to SillyTavern

**Settings → Pocket Tavern → Use SillyTavern for now** shows the original SillyTavern for this visit. A **Back to Pocket Tavern** button in the corner brings you back. To choose where Pocket Tavern runs (everywhere, phones only, or not on this device), use **Use it on this device** on the same screen. Your characters, chats and settings are SillyTavern's either way. Pocket Tavern never stores them separately.

---

## Where did it go? (coming from 2.x)

| In 2.x | In 3.0 |
|---|---|
| More → API, the "Connected" text in the top bar | **AI** (problems show as a banner in the chat) |
| Presets tab | **AI** → Preset, Samplers |
| More → Formatting | **AI** → Formatting (or Prompts) |
| More → Quick switch | Persona: the message box. Model, preset, connection: **AI** |
| More → Personas | **Settings → Personas** (switch from the message box) |
| More → Themes, More → Backgrounds | **Settings → Appearance** (themes and the chat background) |
| More → Themes → Size, Message box, Chat look, Animations; Text size | **Settings → Chat and layout** |
| More → Extensions | **Settings → Extensions** |
| More → Phone features / Features, More → Pocket Tavern settings | **Settings → Pocket Tavern** |
| More → Search everything | The search at the top of **Chats** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> on a computer) |
| More → Recent chats | **Chats** |
| More → Chat history, the top-bar history button | Tap the name in a chat → **Chats** |
| More → Start a new chat, the top-bar new chat button | Tap the name in a chat → **New chat** |
| More → Translate chat, More → Search this chat | **⋯** at the top of the chat |
| More → What's new, updates, Install as an app | **Settings → About** |
| ☰ and the wand in the message box | **`+`** in the message box |
| The ^ button that showed the tabs in a chat | Tap **‹** to go back. The tabs are there |
| −/+ next to slider numbers | Tap the number to type it, or drag the slider (**Settings → Pocket Tavern → − and + beside sliders** brings them back) |
| Docs, GitHub and Discord on the start screen | **Settings → About** |
