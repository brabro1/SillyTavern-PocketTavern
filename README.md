<div align="center">

<a href="https://github.com/brabro1/SillyTavern-PocketTavern"><img src="docs/brand/banner.png" alt="Pocket Tavern: a native-feeling mobile and desktop UI for SillyTavern" width="100%"></a>

# Pocket Tavern

**SillyTavern that feels like a real app, on every device.**

[![Version](https://img.shields.io/github/v/release/brabro1/SillyTavern-PocketTavern?label=alpha&color=E8783A&style=flat-square)](CHANGELOG.md)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.19%2B-6c4bd8?style=flat-square)](https://github.com/SillyTavern/SillyTavern)
[![Platform](https://img.shields.io/badge/made%20for-Android%20%C2%B7%20iPhone%20%C2%B7%20iPad%20%C2%B7%20computers-3ddc84?style=flat-square)](#requirements)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/support-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white&style=flat-square)](https://ko-fi.com/brabro)

[**Screenshots**](#screenshots) &nbsp;·&nbsp; [**Highlights**](#highlights) &nbsp;·&nbsp; [**Install**](#install) &nbsp;·&nbsp; [**Where to find things**](#where-to-find-things) &nbsp;·&nbsp; [**FAQ**](#faq) &nbsp;·&nbsp; [**Compatibility**](#compatibility)

</div>

<br>

Pocket Tavern is a SillyTavern extension with two layouts that share the same themes and features. It switches itself on and picks the right layout for each screen. Your characters, chats and lorebooks are never changed.

<table>
<tr>
<td width="50%" valign="top">

### 📱 On phones
**Android, iPhone, and iPad held upright**

Five tabs at the bottom, readable messages and buttons sized for your thumb.

</td>
<td width="50%" valign="top">

### 💻 On desktop
**Computers, and tablets held sideways**

A rail with the five places, pages beside the chat and keyboard shortcuts.

</td>
</tr>
</table>

> [!NOTE]
> **This is the Pocket Tavern 3.0 beta** (`3.0.0-beta.1`), rebuilt around five places: **Chats, Characters, Lorebooks, AI and Settings**. Coming from 2.x? The [guide](docs/guide.md#where-did-it-go-coming-from-2x) shows where everything went, and the [changelog](CHANGELOG.md#300-beta1) lists what changed.

> [!WARNING]
> **Pocket Tavern is in alpha, and 3.0 is a beta.** Things can change between updates and you may find bugs, so keep your own backups. If something breaks, [tell me](#feedback). If Pocket Tavern itself runs into a problem, it steps aside and SillyTavern's own screens show, with a button to come back.

> [!IMPORTANT]
> After installing or updating, **reload the SillyTavern page** (twice if the old look is still there).

<br>

## Screenshots

<table>
<tr>
<td align="center" width="33%"><img src="docs/screenshots/chat.jpg" alt="A chat: ‹, the character and ⋯ on top, your persona, + and the context ring in the message box"><br><sub><b>Chat</b></sub></td>
<td align="center" width="33%"><img src="docs/screenshots/characters.jpg" alt="Characters: search, Filter, a Favorites row and picture cards"><br><sub><b>Characters</b></sub></td>
<td align="center" width="33%"><img src="docs/screenshots/character-page.jpg" alt="A character's page: Chat, New chat, Edit and their chats"><br><sub><b>A character's page</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/compact.jpg" alt="Compact size with the docked message box"><br><sub><b>Compact size, docked message box</b></sub></td>
<td align="center"><img src="docs/screenshots/themes.jpg" alt="Settings → Appearance: the chat background, then the themes"><br><sub><b>Appearance</b></sub></td>
<td align="center"><img src="docs/screenshots/context.jpg" alt="The Context page: how full the context is and what filled it"><br><sub><b>Context</b></sub></td>
</tr>
</table>

<p align="center"><b>On a computer:</b> the five places sit on a rail on the left and open beside the chat.</p>

<p align="center"><img src="docs/screenshots/desktop.jpg" alt="Pocket Tavern on a computer: the rail, the AI page beside the chat"></p>

<details>
<summary><b>More screenshots</b> &nbsp;<sub>(22 more: chats, settings, lorebooks, AI, themes)</sub></summary>
<br>

<table>
<tr>
<td align="center" width="33%"><img src="docs/screenshots/before.jpg" alt="SillyTavern on a phone without Pocket Tavern"><br><sub><b>Before (no Pocket Tavern)</b></sub></td>
<td align="center" width="33%"><img src="docs/screenshots/recent.jpg" alt="Chats: pinned and recent chats, grouped by character"><br><sub><b>Chats</b></sub></td>
<td align="center" width="33%"><img src="docs/screenshots/editor.jpg" alt="Message editor"><br><sub><b>Message editor</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/card.jpg" alt="Editing a character's card, with tabs"><br><sub><b>Character card</b></sub></td>
<td align="center"><img src="docs/screenshots/history.jpg" alt="Chat files: each chat with its last message as a bubble"><br><sub><b>Chat files</b></sub></td>
<td align="center"><img src="docs/screenshots/notifications.jpg" alt="Notifications as calm cards with a small coloured icon"><br><sub><b>Notifications</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/tabs-shown.jpg" alt="The arrow in the message box brought the tabs back"><br><sub><b>Tabs shown in a chat</b></sub></td>
<td align="center"><img src="docs/screenshots/translate.jpg" alt="Chat translated to Spanish"><br><sub><b>Translated chat</b></sub></td>
<td align="center"><img src="docs/screenshots/chat-options.jpg" alt="+ in the message box: Write, Reply and Tools"><br><sub><b>+ (Reply and tools)</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/settings-place.jpg" alt="Settings: Appearance, Chat and layout, Personas, SillyTavern, Extensions, Pocket Tavern, About"><br><sub><b>Settings</b></sub></td>
<td align="center"><img src="docs/screenshots/settings.jpg" alt="SillyTavern's own settings as a list of sections"><br><sub><b>SillyTavern's settings</b></sub></td>
<td align="center"><img src="docs/screenshots/settings-section.jpg" alt="The Display section: switches on the right, a line on what each does"><br><sub><b>A settings section</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/lorebooks.jpg" alt="The lorebooks that are on in every chat"><br><sub><b>Active lorebooks</b></sub></td>
<td align="center"><img src="docs/screenshots/lorebook-entries.jpg" alt="Lorebook entries as cards with keyword chips"><br><sub><b>Lorebook entries</b></sub></td>
<td align="center"><img src="docs/screenshots/presets.jpg" alt="AI → Samplers: the preset and its sliders"><br><sub><b>Presets (AI → Samplers)</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/prompt-editor.jpg" alt="Prompt editor"><br><sub><b>Prompt editor</b></sub></td>
<td align="center"><img src="docs/screenshots/personas.jpg" alt="Personas"><br><sub><b>Personas</b></sub></td>
<td align="center"><img src="docs/screenshots/bubbles.jpg" alt="Chat in the Bubbles look"><br><sub><b>Bubbles look</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/midnight.jpg" alt="Midnight theme"><br><sub><b>Midnight theme</b></sub></td>
<td align="center"><img src="docs/screenshots/light.jpg" alt="Paper theme"><br><sub><b>Paper theme</b></sub></td>
<td align="center"><img src="docs/screenshots/compact-light.jpg" alt="Paper theme with the compact size and docked message box"><br><sub><b>Paper theme, compact</b></sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/glass.jpg" alt="SillyTavern's Azure theme over a beach background: solid bars, tinted message cards"><br><sub><b>Over a chat background</b></sub></td>
<td></td>
<td></td>
</tr>
</table>

</details>

<br>

## Highlights

<table>
<tr>
<td width="50%" valign="top">

#### 📱 On your phone
<sub>Android, iPhone, iPad</sub>

- Five tabs at the bottom: **Chats, Characters, Lorebooks, AI and Settings**. In a chat they step aside; ‹ takes you back.
- Every page opens full screen, menus slide up from the bottom, and the back gesture closes whatever is open.
- Two sizes (**Comfortable** and **Compact**) and two message boxes (**Floating** and **Docked**).
- **Settings → About → Install as an app** puts SillyTavern on your home screen without the browser bar.

</td>
<td width="50%" valign="top">

#### 💻 On desktop
<sub>Computers, tablets held sideways</sub>

- A rail with the same five places. A place opens in a panel beside the chat and stays open while you chat; click it again to hide the panel, or drag its edge to make it wider.
- Compact like SillyTavern itself, so plenty of the chat fits (**Settings → Chat and layout → Density** for more room).
- Author's Note, CFG and Token probabilities open in a column beside the chat.
- <kbd>Esc</kbd> goes back one step, and <kbd>Ctrl</kbd>+<kbd>K</kbd> searches everything.

</td>
</tr>
<tr>
<td width="50%" valign="top">

#### 💬 Chatting

- **Chats** is home: pinned and recent chats grouped by character, and one search for chats, characters, lorebooks and settings.
- In a chat, **⋯** has the chat's actions (search, translate, rename, chat files) and **+** has the next reply (Regenerate, Continue, Impersonate, attach a file) and the tools.
- Clean message cards, swipe arrows with the count between them (‹ 2/3 ›), and drag the last reply sideways for another version.
- Your persona in the message box, and a context ring that shows how full the model's memory is.
- The **Draft helper** in +: Enhance my draft, Write for me and Continue my draft.

</td>
<td width="50%" valign="top">

#### 🎨 Make it yours

- 14 calm, flat themes (10 dark, 4 light), starting with **Pocket** and **Pocket Light**, plus your SillyTavern themes made to fit. Over your chat background the messages become tinted cards and the bars stay solid.
- Cards, bubbles or flat messages, four text sizes, your device's font or SillyTavern's, and animations you can turn down or off.
- Every helper has its own switch under **Settings → Pocket Tavern**.
- Menus in English, Spanish, Portuguese, Russian, Chinese, Japanese and Arabic.

</td>
</tr>
<tr>
<td width="50%" valign="top">

#### 🗂️ Characters, lorebooks and AI

- Characters as picture cards with search, a **Filter** sheet, a Favorites row and a menu on each card.
- Each character has a page: **Chat**, **New chat**, **Edit** and their chats. **Edit** opens the card without opening the chat.
- **Lorebooks** has its own tab: what's on in every chat, activation settings, and each lorebook's entries as cards with keyword chips.
- **AI** shows whether you're connected, with your preset, connection, samplers and formatting one tap away.
- SillyTavern's own settings, Formatting and Extensions open on a short list, each section on its own page.

</td>
<td width="50%" valign="top">

#### ⚡ Handy extras

- A banner when the connection drops or SillyTavern stops answering (handy with Termux), with a button that fixes it.
- Translate a chat, search in it, and open pictures full screen.
- **Use SillyTavern for now** (Settings → Pocket Tavern) shows the original SillyTavern for this visit, with a button to come back.
- **Updates in one tap:** **Settings → About → Update Pocket Tavern**, and **SillyTavern updates** tells you when a new SillyTavern is out and how to update it.

</td>
</tr>
</table>

<p align="center"><sub>The full list of changes is in <a href="CHANGELOG.md">CHANGELOG.md</a>, and the <a href="docs/guide.md">guide</a> shows how to get around.</sub></p>

<br>

## Requirements

| What | You need |
| :--- | :--- |
| 🍺 **SillyTavern** | **1.19** or newer |
| 🌐 **Browser** | An up-to-date one: Chrome on Android, Safari on iPhone and iPad, or any modern browser on a computer (Chrome, Edge, Firefox, Safari) |
| 🧰 **Git** | Only if you install from Termux (`pkg install git`) |

## Install

**1.** In SillyTavern, open **Extensions** (the stacked cubes), then **Install extension**.<br>
**2.** Paste this link and install:

```
https://github.com/brabro1/SillyTavern-PocketTavern
```

**3.** Reload the page.

<details>
<summary><b>Try the 3.0 beta</b></summary>
<br>

The beta lives on the `3.0` branch. In **Install extension**, type `3.0` as the branch (the field under the link), or from a terminal:

```bash
cd ~/SillyTavern/data/default-user/extensions
git clone -b 3.0 https://github.com/brabro1/SillyTavern-PocketTavern
```

Already have Pocket Tavern from a terminal? Run `git fetch && git checkout 3.0` in its folder. Your settings carry over, and going back (`git checkout main`) keeps them too.

</details>

<details>
<summary><b>Install from Termux instead</b></summary>
<br>

```bash
cd ~/SillyTavern/data/default-user/extensions
git clone https://github.com/brabro1/SillyTavern-PocketTavern
```

Then reload SillyTavern in your browser.

</details>

> [!TIP]
> **Update:** **Settings → About → Update Pocket Tavern** (or **Extensions → Manage extensions**, then update Pocket Tavern). Once nothing is in progress, the page reloads automatically (switch **Reload after updates** off to reload by hand) and shows a short **What's new** list once.
>
> **Remove:** **Extensions → Manage extensions**, then delete Pocket Tavern.

<br>

## Where to find things

| What | Where |
| :--- | :--- |
| 💬 Your chats, and search for anything | **Chats** (or <kbd>Ctrl</kbd>+<kbd>K</kbd> on a computer) |
| 🔌 Connection, model, preset, samplers, formatting | **AI** |
| 🎨 Theme (Pocket Tavern's and your SillyTavern themes) and the chat background | **Settings → Appearance** |
| 🔤 Chat look, text size, font, layout, density, message box, chat width, animations | **Settings → Chat and layout** |
| 🧑 Personas | **Settings → Personas** (switch persona from the message box) |
| ⚙️ Where it runs, Use SillyTavern for now, and every helper's switch | **Settings → Pocket Tavern** |
| ⬆️ What's new, updates, Install as an app, the guide | **Settings → About** |

**Choose where it runs:** in **Settings → Pocket Tavern**, set "Use it on this device" to **Automatic** (phones and computers), **Phones only** (keeps the original SillyTavern on your computer) or **Off on this device**.

<details>
<summary><b>Start SillyTavern with one tap</b> &nbsp;<sub>(Android and Termux)</sub></summary>
<br>

Set this up once to get a SillyTavern icon on your home screen. Tap it and SillyTavern starts in Termux (if it isn't running yet) and opens in your browser when it's ready.

1. Install **Termux:Widget** from the same place you got Termux (for example F-Droid).
2. In Termux, run this once (use the folder name you see in your extensions folder):
   ```bash
   bash ~/SillyTavern/data/default-user/extensions/SillyTavern-PocketTavern/termux/setup.sh
   ```
   It asks whether to start SillyTavern whenever you open Termux, and when the phone turns on (that needs Termux:Boot).
3. Long-press your home screen, pick **Widgets → Termux:Widget**, and choose **SillyTavern**.

There are also **Update SillyTavern** (updates SillyTavern and starts it again) and **Stop SillyTavern** shortcuts. Already set up before? Run the command once more to get the update shortcut. Set Termux's battery use to **Unrestricted** in Android's settings so it isn't closed in the background. SillyTavern in another folder? Add `--dir ~/your-folder`. To undo everything, run the same command with `--remove`.

</details>

<br>

## FAQ

<details>
<summary><b>Can I use it with SillyTavern on my PC or a server?</b></summary>
<br>

Yes. Pocket Tavern runs in your browser, so install it on that SillyTavern and open its address on any device. Your phone gets the phone layout and your computer gets the desktop layout, with the same chats on both.

</details>

<details>
<summary><b>Everything feels too big.</b></summary>
<br>

Pick **Compact** under **Settings → Chat and layout → Density**, and a smaller **Text size** on the same page.

</details>

<details>
<summary><b>Where did the tabs go?</b></summary>
<br>

In a chat they step aside on a phone so you don't tap them by accident. Tap **‹** to go back to Chats, or the arrow in the message box to bring them back. To keep them, turn off **Hide tabs in a chat** under **Settings → Pocket Tavern**.

</details>

<details>
<summary><b>The page beside the chat is too narrow on my computer.</b></summary>
<br>

Drag its right edge to make it wider (up to where the chat keeps about 420px); double-click the edge to reset it. Click the place you're on to hide the panel. For long prompts, the prompt editor has a full-screen button next to Save.

</details>

<details>
<summary><b>Does it work with other extensions?</b></summary>
<br>

Most of them. Their settings are under **Settings → Extensions**, their menu items under **+** in the message box, and their buttons fit into the message box. Some get special care, listed under [Compatibility](#compatibility). If one doesn't work, [tell me](#feedback).

</details>

<details>
<summary><b>I use Guided Generations. Where did its buttons go?</b></summary>
<br>

They're in the guide button (the compass) next to Send. Hold it to repeat your last action. To get its own row back, turn off **Guided Generations button** under **Settings → Pocket Tavern**.

</details>

<details>
<summary><b>Does it work on iPhone and iPad?</b></summary>
<br>

Yes, they're supported just like Android. Safari's keyboard gets its own handling, so the bars, chat and editors stay in view while you type. An iPad held upright gets the phone layout, and held sideways the desktop layout; set the chat width under **Settings → Chat and layout → Chat width**. To use it like an app, tap **Share → Add to Home Screen** in Safari.

</details>

<details>
<summary><b>My chat background doesn't show.</b></summary>
<br>

Pocket Tavern's own themes come with their own background. Pick one under **Settings → Appearance → Chat background** and Pocket Tavern switches to yours, or turn off **Theme background** under **Settings → Appearance**. With a background showing, the messages become tinted cards so the picture shows through them and between them, while the bars, pages, menus and message box stay solid and readable. Nothing is blurred. SillyTavern themes and **Your theme** always show your background.

</details>

<details>
<summary><b>Where did SillyTavern's UI Theme list go?</b></summary>
<br>

It moved to **Settings → Appearance → From SillyTavern**. Every SillyTavern theme you have (and any you import there) shows up as a card. Its message cards use its own **User Message** and **AI Message** colours, and over your background it keeps its text shadow too, with the text kept readable (Pocket Tavern doesn't blur anything). **Your theme** uses SillyTavern's colors exactly as they are, and **Settings → Look → Theme Colors** changes it.

Pocket Tavern's chat look (cards, bubbles, flat) needs SillyTavern's Chat Style on **Flat**, and picking a look sets that for you. One of Pocket Tavern's own themes does too, so a SillyTavern theme's Bubbles (Cappuccino, Azure) no longer shows through it; picking a SillyTavern theme again, or turning Pocket Tavern off, brings your old Chat Style back.

</details>

<details>
<summary><b>I don't want it on my computer.</b></summary>
<br>

In **Settings → Pocket Tavern**, set "Use it on this device" to **Phones only**, or use **Use SillyTavern for now** for this visit only.

</details>

<br>

## Compatibility

| | Status |
| :--- | :--- |
| **SillyTavern 1.19 or newer** | ✅ Built and tested (older versions are not supported) |
| **Android** (Chrome), with or without Termux | ✅ Phone layout |
| **iPhone and iPad** (Safari) | ✅ Phone layout, with Safari's keyboard handled; iPad held sideways gets the desktop layout |
| **Computers** (Windows, macOS, Linux) | ✅ Desktop layout, in any up-to-date browser |
| **Guided Generations** | ✅ One guide button with a menu that explains every action |
| **Input History, Quick Replies** | ✅ Input History sits in the text field; quick replies are slim chips |
| **Moonlit Echoes** | ✅ Keep **Settings → Appearance** on **Your theme**, and pick its chat styles under **Settings → Look → Chat Style**. Switches and page layouts keep Pocket Tavern's shape |
| **ScenePulse** | ✅ Opens from **+ → Tools** on a phone |
| **Chat Completion Tabs** | ✅ Its tabs match Pocket Tavern's and stay at the top of Presets as you scroll |
| **Chat Top Bar** | ✅ Its bar sits at the top of the chat, also with Moonlit Echoes |
| **Character Library** | ✅ Its embedded panel fits between Pocket Tavern's bars; Back closes it |
| **Message Summarize** (Qvink Memory) | ✅ Summaries sit under the message text; its buttons are a Summary group in the message's ⋯ |
| **Other extensions** | Work alongside it |

## Privacy

> [!NOTE]
> - Pocket Tavern only changes how SillyTavern looks. Your characters, chats, lorebooks and SillyTavern theme are never changed.
> - Its settings are saved with your SillyTavern settings. Unsent messages and the page width you choose on a computer stay in your browser.
> - **Translate** sends chat text to Google Translate straight from your browser, or, if you picked another service in SillyTavern's Chat Translation, to that service through your SillyTavern server.
> - **Settings → About → SillyTavern updates** asks GitHub for the newest SillyTavern version when you open it. Nothing else is sent anywhere.

<br>

## Feedback

<table>
<tr>
<td width="50%" valign="top">

#### 🐞 Bugs and ideas

Found a bug or have an idea? [Open an issue](https://github.com/brabro1/SillyTavern-PocketTavern/issues/new/choose). A screenshot, your device and browser, your SillyTavern version and your other extensions help a lot. Pull requests are welcome too; see [CONTRIBUTING.md](CONTRIBUTING.md).

</td>
<td width="50%" valign="top">

#### ☕ Support

Pocket Tavern is free and always will be. If it makes your evenings with SillyTavern nicer and you'd like to say thanks, you can buy me a coffee on Ko-fi. Completely optional, and very much appreciated.

[![Support me on Ko-fi](https://img.shields.io/badge/Buy%20me%20a%20coffee-Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/brabro)

</td>
</tr>
</table>

## Credits and license

- **[SillyTavern](https://github.com/SillyTavern/SillyTavern)** (AGPL-3.0): the app Pocket Tavern is built for.
- **[Lucide](https://lucide.dev)** (ISC): the style of the icon set. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Translation uses SillyTavern's **Chat Translation** and Google Translate.
- Written with the help of AI coding tools (Claude Code). Every change is tested on phone and desktop layouts before release.

<div align="center">
<br>

Released under the [MIT](LICENSE) license.

<sub>Made for SillyTavern · <a href="#pocket-tavern">Back to top ↑</a></sub>

</div>
