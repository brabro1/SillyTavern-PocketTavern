// The app shell (DESIGN.md → Layouts): the top app bar (title, ‹, the chat's picture and ⋯), the tab bar on a phone
// and the rail on desktop, the page area between them, tucking the tabs away in a chat, and following the keyboard.
// One Shell exists while Pocket Tavern's shell is on; currentShell() returns it.
import { closeCharacterLibrary } from '../compat/character-library.js';
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { isShown, scheduleHistorySync } from '../shell/history.js';
import { IS_IOS, isTypingField, keyboardUp } from '../shell/layout.js';
import { closeOwnPage, currentOwnPage, isOwnPage, pageSpec, refreshOwnPage, scrollOwnPageToTop } from '../shell/page.js';
import { activeTabs, backFromPage, characterCardShown, closeDrawers, closePages, currentPageId, drawerById, extensionDrawers, goHome, openPage, pageInfo, placeOf, showCharacterList } from '../shell/pages.js';
import { closeSheet, currentSheet } from '../shell/sheet.js';
import { leavePromptEditor, promptEditorMode, promptEditorOpen, promptFull, setPromptFull, syncPresetTabs } from '../st/ai.js';
import { checkCardPeek, syncCharacterPage } from '../st/characters.js';
import { shieldFromDrawerAutoClose } from '../st/drawers.js';
import { editedLorebook, syncLorebookMode, wiPage } from '../st/lorebooks.js';
import { addSliderSteppers, closePageSection, describeExtensions, describeSettings, openSettingSearch, PAGE_SECTIONS, pageSections, SEARCH_PAGES } from '../st/settings.js';
import { fillRanges } from '../st/slider-fill.js';
import { LOREBOOK_PAGE } from '../views/lorebooks.js';
import { composer } from '../views/message-box.js';
import { atBottom } from '../views/messages.js';
import { BULK_MODE_CLASS, CHARACTER_LIST, PAGE_DRAWERS } from '../st/selectors.js';
import { safe } from '../core/lifecycle.js';

const SOURCE = 'app shell';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, chatsHome: () => object, connection: () => object, EASE: () => string, buzz: Function, endStartWindow: Function, ensurePhoneHome: Function, icon: Function, isConnected: Function, isWide: Function, motionAllowed: Function, openChatMenu: Function, syncChatsHome: Function, syncThemeNotes: Function, ui: Function } | null} */
let deps = null;

export function setupAppShell(supplied) {
    deps = supplied;
}


/** The shell while it is on, or null. */
let shell = null;

export function currentShell() {
    return shell;
}

/** Immersive Focus mode: hides the rail/panel on desktop and top chrome on phone while reading a chat. */
export function isFocusMode() {
    return document.documentElement.classList.contains('pt-focus-mode');
}

export function setFocusMode(on) {
    const root = document.documentElement;
    const want = !!on && !!shell?.inChat;
    if (root.classList.contains('pt-focus-mode') === want) return;
    if (want && deps?.isWide()) closePages();
    root.classList.toggle('pt-focus-mode', want);
    shell?.syncFocusControls();
}

export function toggleFocusMode() {
    setFocusMode(!isFocusMode());
}

class Shell {
    constructor() {
        this.drawerObserver = null;
        this.destroyed = false;
        /** The page each place was last on (AI → Presets…), so coming back opens it again. */
        this.lastInPlace = {};
        this.timers = new Set();
        // Checked right away on resize, before the frame is drawn: the tab bar
        // steps aside and the chat starts its slide in the frame the window
        // changes, so there is one move, not two.
        this.onResize = safe(SOURCE, () => {
            if (this.destroyed) return;
            this.checkKeyboard();
            // The rail's tabs change height with the window.
            if (deps.isWide()) this.placeRailPill();
        });
        this.lastHeight = window.innerHeight;
        this.onFocusIn = safe(SOURCE, event => {
            if (this.destroyed) return;
            if (isTypingField(event.target)) this.after(400, () => this.checkKeyboard());
            // Writing a message: the tabs go away again. With the on-screen
            // keyboard they go when it opens (one move, not two); with a
            // hardware keyboard there is no keyboard to wait for.
            if (event.target?.id === 'send_textarea' && this.tabsOut) {
                this.tabsOut = false;
                this.tuckPending = true;
                this.after(500, () => {
                    if (!this.tuckPending) return;
                    this.tuckPending = false;
                    this.syncTuck(true);
                });
            }
        });
        this.tabsOut = false;
        this.inChat = false;
        this.touchY = null;
        // Scrolling the chat with a finger or the wheel tucks the tabs away again
        // (not the chat moving by itself while a reply streams in).
        this.onChatTouchStart = safe(SOURCE, event => {
            this.touchY = event.touches[0]?.clientY ?? null;
        });
        this.onChatTouchMove = safe(SOURCE, event => {
            if (this.touchY === null || !this.tabsOut) return;
            if (Math.abs((event.touches[0]?.clientY ?? this.touchY) - this.touchY) > 24) this.tuckAgain();
        });
        this.onChatWheel = safe(SOURCE, () => this.tuckAgain());
        this.onFocusOut = safe(SOURCE, () => this.after(0, () => this.checkKeyboard()));
        this.build();
    }

    after(ms, fn) {
        const id = window.setTimeout(safe(SOURCE, () => {
            this.timers.delete(id);
            if (!this.destroyed) fn();
        }), ms);
        this.timers.add(id);
        return id;
    }

    build() {
        // ---- top app bar
        this.back = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-back',
            'aria-label': 'Back',
            // Step back one level: prompt full-screen / dirty check first, then settings section, then page.
            onclick: () => {
                if (promptEditorOpen()) {
                    if (promptFull()) setPromptFull(false);
                    else leavePromptEditor();
                    return;
                }
                // In a chat (phone): back to the Chats home.
                if (!currentPageId() && this.inChat) {
                    goHome();
                    return;
                }
                if (!closePageSection()) backFromPage();
            },
        }, [deps.ui('arrow-left')]);
        this.avatar = h('span', { class: 'pt-ab-avatar', 'aria-hidden': 'true' });
        this.titleEl = h('span', { class: 'pt-ab-title' });
        this.subEl = h('span', { class: 'pt-ab-sub' });
        this.who = h('button', { type: 'button', class: 'pt-ab-who', onclick: () => this.onWhoClick() }, [
            this.avatar,
            h('span', { class: 'pt-ab-text' }, [this.titleEl, this.subEl]),
        ]);
        this.search = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-search',
            'aria-label': t('Find a setting'),
            title: t('Find a setting'),
            onclick: () => openSettingSearch(),
        }, [deps.ui('search')]);
        // Back to the Chats home: closes the chat (SillyTavern's own Close chat). Desktop; a phone has ‹.
        this.home = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-home',
            'aria-label': 'Close the chat',
            title: 'Close the chat',
            onclick: () => goHome(),
        }, [deps.ui('home')]);
        // Focus mode toggle (desktop chat header; phone uses the chat ⋯ menu and a floating exit pill).
        this.focusBtn = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-focus',
            'aria-label': t('Focus mode'),
            title: t('Focus mode'),
            'aria-pressed': 'false',
            onclick: () => {
                deps.buzz(6);
                toggleFocusMode();
            },
        }, [deps.ui('maximize')]);
        // The chat's ⋯ menu: everything about the open chat (DESIGN.md → The chat).
        this.menu = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-menu',
            'aria-label': 'Chat menu',
            title: 'Chat menu',
            onclick: () => deps.openChatMenu(),
        }, [deps.ui('ellipsis')]);
        // Desktop split-view column headers (DESIGN.md → Desktop navigation):
        // - panelSlot labels the Chats sidebar when it sits open beside a chat or welcome;
        // - mainSlot holds the primary bar controls (panel header for other pages, chat header otherwise);
        // - deskChat keeps the open chat's own header visible over the chat while another panel is open.
        this.panelSlotTitle = h('span', { class: 'pt-ab-panel-title', text: 'Chats' });
        this.panelSlot = h('div', { class: 'pt-ab-panel-slot' }, [this.panelSlotTitle]);
        this.mainSlot = h('div', { class: 'pt-ab-main' }, [this.back, this.home, this.who, this.search, this.focusBtn, this.menu]);

        this.deskHome = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-desk-home',
            'aria-label': 'Close the chat',
            title: 'Close the chat',
            hidden: true,
            onclick: () => goHome(),
        }, [deps.ui('home')]);
        this.deskAvatar = h('span', { class: 'pt-ab-avatar', 'aria-hidden': 'true' });
        this.deskTitle = h('span', { class: 'pt-ab-desk-title' });
        this.deskWho = h('button', { type: 'button', class: 'pt-ab-desk-who', hidden: true, onclick: () => this.onDeskWhoClick() }, [
            this.deskAvatar,
            h('span', { class: 'pt-ab-text' }, [this.deskTitle]),
        ]);
        this.deskFocus = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-desk-focus',
            'aria-label': t('Focus mode'),
            title: t('Focus mode'),
            'aria-pressed': 'false',
            hidden: true,
            onclick: () => {
                deps.buzz(6);
                toggleFocusMode();
            },
        }, [deps.ui('maximize')]);
        this.deskMenu = h('button', {
            type: 'button',
            class: 'pt-ab-btn pt-ab-desk-menu',
            'aria-label': 'Chat menu',
            title: 'Chat menu',
            hidden: true,
            onclick: () => deps.openChatMenu(),
        }, [deps.ui('ellipsis')]);
        this.deskChat = h('div', { class: 'pt-ab-desk-chat', hidden: true }, [this.deskHome, this.deskWho, this.deskFocus, this.deskMenu]);
        this.appbar = h('header', { id: 'pt-appbar', class: 'pt-appbar', 'data-pt': '1' }, [this.panelSlot, this.mainSlot, this.deskChat]);

        // Phone floating exit pill while Focus mode hides the top bar.
        this.focusExit = h('button', {
            type: 'button',
            id: 'pt-focus-exit',
            class: 'pt-focus-exit pt-focus pt-press',
            'aria-label': t('Exit focus mode'),
            title: t('Exit focus mode'),
            'data-pt': '1',
            onclick: () => {
                deps.buzz(6);
                setFocusMode(false);
            },
        }, [deps.ui('minimize')]);

        // ---- bottom tab bar
        this.tabs = new Map();
        // One pill slides between tabs instead of each tab fading its own background.
        this.indicator = h('span', { class: 'pt-tab-indicator', 'aria-hidden': 'true' });
        this.tabbar = h('nav', { id: 'pt-tabbar', class: 'pt-tabbar', 'aria-label': 'Main', 'data-pt': '1' }, [this.indicator]);
        this.tabCount = 0;
        this.syncTabs();

        for (const el of [this.appbar, this.tabbar, this.focusExit]) shieldFromDrawerAutoClose(el);

        document.body.append(this.appbar, this.tabbar, this.focusExit);

        // The Characters page switches between list, editor and group views without events.
        // On a phone, picking someone from the list lands in their chat, like a messaging app.
        // On a computer the chat is already beside the page, so the page stays and shows their card.
        this.jumpAt = 0;
        this.onPanelClick = safe(SOURCE, event => {
            const entry = event.target.closest?.(`${CHARACTER_LIST} .character_select, ${CHARACTER_LIST} .group_select`);
            const bulk = document.querySelector(`${CHARACTER_LIST}.${BULK_MODE_CLASS}`);
            if (entry && !bulk && !deps.isWide() && !event.target.closest('.ch_fav_icon, .tag, .bulk_select_checkbox')) {
                this.jumpAt = Date.now();
                // Tapping the character or group you are already chatting with does not change chats.
                const context = deps.context();
                const sameChar = entry.dataset.chid !== undefined && context.characterId !== undefined && String(entry.dataset.chid) === String(context.characterId);
                const sameGroup = entry.dataset.grid !== undefined && context.groupId !== undefined && String(entry.dataset.grid) === String(context.groupId);
                if (sameChar || sameGroup) this.after(200, closePages);
            }
            this.after(80, () => this.update());
        });
        document.getElementById('right-nav-panel')?.addEventListener('click', this.onPanelClick);

        // Follow SillyTavern opening and closing its drawers, whoever triggers it.
        this.drawerObserver = new MutationObserver(safe(SOURCE, records => {
            // One page at a time: a drawer SillyTavern (or anyone) just opened replaces Pocket Tavern's own page.
            // (A drawer that is still closing keeps its open class for a moment; that must not count.)
            const opened = records.some(record => record.target.classList.contains('openDrawer') && !String(record.oldValue ?? '').split(/\s+/).includes('openDrawer'));
            // While starting with no chat, SillyTavern reopens its locked Characters panel; the Chats page
            // stays instead. This runs before the browser draws, so the panel never shows.
            const reopened = opened && Date.now() < deps.chatsHome().startUntil && deps.context().getCurrentChatId?.() === undefined
                && records.some(record => record.target.id === 'right-nav-panel' && record.target.classList.contains('openDrawer'));
            if (reopened && currentOwnPage() === 'pt-chats') {
                closeDrawers();
                return;
            }
            if (opened && currentOwnPage()) closeOwnPage(true);
            this.update();
            deps.ensurePhoneHome();
            scheduleHistorySync();
        }));
        for (const content of document.querySelectorAll(PAGE_DRAWERS)) {
            this.drawerObserver.observe(content, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        }
        window.addEventListener('resize', this.onResize);
        document.addEventListener('focusin', this.onFocusIn);
        document.addEventListener('focusout', this.onFocusOut);
        const chat = document.getElementById('chat');
        chat?.addEventListener('touchstart', this.onChatTouchStart, { passive: true });
        chat?.addEventListener('touchmove', this.onChatTouchMove, { passive: true });
        chat?.addEventListener('wheel', this.onChatWheel, { passive: true });
        this.checkKeyboard();
        this.update();
    }

    /**
     * In a chat the tab bar tucks away: it sat right under the message box and
     * caught taps meant for it. The arrow in the message box brings it back.
     */
    syncTuck(animate = false) {
        const root = document.documentElement;
        const can = this.inChat && tabsTuckable();
        if (!can) this.tabsOut = false;
        root.classList.toggle('pt-tabs-tuckable', can);
        this.setTucked(can && !this.tabsOut, animate);
        syncTabsButton();
    }

    setTucked(on, animate) {
        const root = document.documentElement;
        if (root.classList.contains('pt-tabs-tucked') === on) return;
        // Leaving a chat for a full-screen page covers #chat: toggle the class without forcing two
        // synchronous full-chat layouts (scrollHeight read + scrollTop write) on every tab switch.
        if (!animate && !this.inChat) {
            root.classList.toggle('pt-tabs-tucked', on);
            return;
        }
        const form = document.getElementById('form_sheld');
        const chat = document.getElementById('chat');
        const glide = animate && deps.motionAllowed() && form && !root.classList.contains('pt-keyboard');
        const wasAtBottom = !!chat && (glide ? (chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40) : atBottom());
        const before = glide ? form.getBoundingClientRect().top : 0;
        root.classList.toggle('pt-tabs-tucked', on);
        if (!glide) {
            if (wasAtBottom && chat) {
                requestAnimationFrame(safe(SOURCE, () => {
                    if (!this.destroyed && this.inChat) chat.scrollTop = chat.scrollHeight;
                }));
            }
            return;
        }
        if (wasAtBottom) chat.scrollTop = chat.scrollHeight;
        // Coming back it slides up from the bottom edge (going away, CSS slides it down).
        if (!on) this.tabbar.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 220, easing: deps.EASE() });
        // The message box (and the newest message above it) glide to their new place with the tabs.
        const shift = form.getBoundingClientRect().top - before;
        if (Math.abs(shift) < 4) return;
        const frames = [{ transform: `translate3d(0, ${-shift}px, 0)` }, { transform: 'none' }];
        const timing = { duration: 220, easing: deps.EASE() };
        form.animate(frames, timing);
        if (wasAtBottom) chat.animate(frames, timing);
    }

    /** The arrow in the message box: show the tabs, or put them away again. */
    toggleTabs() {
        this.tabsOut = document.documentElement.classList.contains('pt-tabs-tucked');
        this.syncTuck(true);
    }

    tuckAgain() {
        if (!this.tabsOut) return;
        this.tabsOut = false;
        this.syncTuck(true);
    }

    destroy() {
        this.destroyed = true;
        window.clearTimeout(this.settleTimer);
        for (const id of this.timers) window.clearTimeout(id);
        this.timers.clear();
        document.getElementById('right-nav-panel')?.removeEventListener('click', this.onPanelClick);
        this.drawerObserver?.disconnect();
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('focusin', this.onFocusIn);
        document.removeEventListener('focusout', this.onFocusOut);
        const chat = document.getElementById('chat');
        chat?.removeEventListener('touchstart', this.onChatTouchStart);
        chat?.removeEventListener('touchmove', this.onChatTouchMove);
        chat?.removeEventListener('wheel', this.onChatWheel);
        this.tuckPending = false;
        this.endGlide();
        closeOwnPage(true);
        this.appbar.remove();
        this.tabbar.remove();
        this.focusExit.remove();
        const root = document.documentElement;
        root.classList.remove('pt-page-open', 'pt-keyboard', 'pt-prompt-editor', 'pt-prompt-full', 'pt-tabs-tucked', 'pt-tabs-tuckable', 'pt-tabs-6', 'pt-focus-mode');
        syncTabsButton();
        delete root.dataset.ptPage;
    }

    syncFocusControls() {
        const on = isFocusMode();
        if (this.lastFocusOn === on) return;
        this.lastFocusOn = on;
        const label = t(on ? 'Exit focus mode' : 'Focus mode');
        for (const btn of [this.focusBtn, this.deskFocus]) {
            if (!btn) continue;
            btn.replaceChildren(deps.ui(on ? 'minimize' : 'maximize'));
            btn.setAttribute('aria-label', label);
            btn.setAttribute('aria-pressed', String(on));
            btn.title = label;
        }
    }

    onDeskWhoClick() {
        const context = deps.context();
        if (context.groupId || context.characterId !== undefined) openPage('rightNavHolder');
        else {
            showCharacterList();
            openPage('rightNavHolder');
        }
    }

    /** Reads the currently open chat's display name and portrait for the chat header. */
    chatHeaderInfo() {
        const context = deps.context();
        let name = t('Chats');
        let image = null;
        let hasChat = false;
        if (context.groupId) {
            const group = context.groups?.find(g => String(g.id) === String(context.groupId));
            name = group?.name ?? t('Group chat');
            hasChat = true;
        } else if (context.characterId !== undefined && context.characters?.[context.characterId]) {
            const character = context.characters[context.characterId];
            name = character.name;
            image = character.avatar && character.avatar !== 'none'
                ? (context.getThumbnailUrl?.('avatar', character.avatar) ?? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`)
                : null;
            hasChat = true;
        }
        return { name, image, hasChat, isGroup: !!context.groupId };
    }

    paintAvatar(target, { image, hasChat, isGroup }) {
        if (image) {
            delete target.dataset.ptIcon;
            const existingImg = target.firstElementChild;
            if (!(existingImg instanceof HTMLImageElement) || existingImg.getAttribute('src') !== image) {
                target.replaceChildren(h('img', { src: image, alt: '' }));
            }
        } else {
            const iconKey = isGroup ? 'users' : (hasChat ? 'user' : 'chats');
            if (target.dataset.ptIcon !== iconKey) {
                target.dataset.ptIcon = iconKey;
                target.replaceChildren(deps.ui(iconKey));
            }
        }
    }

    /** Rebuilds the tab bar / rail when the Extensions button is turned on or off (issue #18). */
    syncTabs() {
        const list = activeTabs();
        if (this.tabCount === list.length && list.every(tab => this.tabs.has(tab.id))) return;
        this.tabCount = list.length;
        this.tabs.clear();
        const buttons = list.map(tab => {
            const button = h('button', {
                type: 'button',
                class: 'pt-tab',
                'data-tab': tab.id,
                'aria-label': tab.label,
                onclick: () => this.onTab(tab.id),
            }, [
                h('span', { class: 'pt-tab-icon' }, [deps.ui(tab.icon)]),
                h('span', { class: 'pt-tab-label', text: tab.label }),
            ]);
            this.tabs.set(tab.id, button);
            return button;
        });
        this.tabbar.replaceChildren(this.indicator, ...buttons);
        this.tabbar.style.setProperty('--pt-tab-count', String(list.length));
        document.documentElement.classList.toggle('pt-tabs-6', list.length > 5);
    }

    /**
     * The on-screen keyboard opened or closed (Android shrinks the window for it).
     * The tab bar steps aside, and the chat and the message box slide together,
     * as one piece, to their new place, so nothing jumps and nothing gaps.
     */
    checkKeyboard() {
        const root = document.documentElement;
        if (root.classList.contains('pt-desktop')) {
            this.endGlide();
            root.classList.remove('pt-keyboard');
            this.lastHeight = window.innerHeight;
            return;
        }
        const height = window.innerHeight;
        const keyboard = keyboardUp();
        const was = root.classList.contains('pt-keyboard');
        const before = this.lastHeight;
        this.lastHeight = height;
        if (height === before && keyboard === was) return;
        const sheld = document.getElementById('sheld');
        const chat = document.getElementById('chat');
        this.endGlide();
        // Where the chat ended on the screen before: the window already has its
        // new height here, so take the change back out.
        const oldBottom = sheld ? sheld.getBoundingClientRect().bottom - (height - before) : 0;
        root.classList.toggle('pt-keyboard', keyboard);
        // Tabs that were out when you started typing go away with the keyboard, in the same frame.
        if (keyboard && this.tuckPending) {
            this.tuckPending = false;
            this.syncTuck();
        }
        if (!sheld || !chat) return;
        const shift = Math.round(sheld.getBoundingClientRect().bottom - oldBottom);
        // Reading the newest message: stay there. (Further up, SillyTavern itself
        // keeps the line at the bottom edge in place when the chat changes height.)
        // (Known while the jump-to-newest button watches the chat; otherwise assume so, as before.)
        const wasAtBottom = atBottom();
        const keepBottom = () => {
            if (wasAtBottom) chat.scrollTop = chat.scrollHeight;
        };
        keepBottom();
        const glide = Math.abs(shift) >= 8 && deps.motionAllowed() && !IS_IOS
            && !root.classList.contains('pt-editing') && !currentPageId() && !currentSheet();
        if (!glide) return;
        const timing = { duration: 240, easing: deps.EASE() };
        if (shift < 0) {
            // Opening: the chat keeps its old height while it slides up (the top
            // goes under the top bar), then takes its new height when it lands.
            const tall = `${sheld.offsetHeight - shift}px`;
            sheld.style.setProperty('height', tall, 'important');
            sheld.style.setProperty('max-height', tall, 'important');
            keepBottom();
            this.glide = sheld.animate([{ transform: 'none' }, { transform: `translate3d(0, ${shift}px, 0)` }], timing);
            this.glideLand = keepBottom;
        } else {
            // Closing: the chat already has its new height; it starts where it
            // was and slides down, showing more of the chat above.
            this.glide = sheld.animate([{ transform: `translate3d(0, ${-shift}px, 0)` }, { transform: 'none' }], timing);
            this.glideLand = null;
        }
        this.glide.onfinish = safe(SOURCE, () => this.endGlide());
        this.glide.oncancel = safe(SOURCE, () => this.endGlide());
    }

    /** Ends a keyboard slide: the chat back to its normal size, in place. */
    endGlide() {
        if (!this.glide) return;
        const sheld = document.getElementById('sheld');
        this.glide.cancel();
        this.glide = null;
        sheld?.style.removeProperty('height');
        sheld?.style.removeProperty('max-height');
        this.glideLand?.();
        this.glideLand = null;
    }

    onTab(id) {
        deps.buzz(6);
        // The prompt editor sits over the Presets page and would stay over the next one.
        if (promptEditorOpen()) {
            if (currentSheet()) closeSheet(true);
            leavePromptEditor(() => this.goTab(id));
            return;
        }
        this.goTab(id);
    }

    goTab(id) {
        // A place you picked yourself is never swapped for Chats by the start-up check (syncChatsHome).
        deps.endStartWindow();
        if (currentSheet()) closeSheet(true);
        // Character Library's panel covers the chat and pages: any tab leaves it.
        if (closeCharacterLibrary() && id === 'chat') return;
        if (id === 'chat') {
            const open = currentPageId();
            // Desktop: the list in the panel beside the chat; Chats again hides it.
            if (deps.isWide()) {
                if (open === 'pt-chats') closePages();
                else openPage('pt-chats');
                return;
            }
            // Phone: the Chats page is the place's screen while no chat is open; with a chat open, the chat.
            if (open === 'pt-chats') scrollOwnPageToTop();
            else if (!open && this.tabsOut) this.tuckAgain();
            else {
                // Leaving a place back to Chats or the chat resets that place to its root (issue #19).
                if (open) delete this.lastInPlace[placeOf(open)];
                if (deps.context().getCurrentChatId?.() === undefined) openPage('pt-chats');
                else closePages();
            }
            return;
        }
        const open = currentPageId();
        // When Pocket Tavern's Lorebook UI is off for this layout, Lorebooks opens SillyTavern's own World Info (issue #16).
        if (id === 'pt-lorebooks' && !deps.lorebookUiOn()) {
            if (open === LOREBOOK_PAGE) {
                if (deps.isWide()) {
                    delete this.lastInPlace[id];
                    closePages();
                } else {
                    drawerById(LOREBOOK_PAGE)?.querySelector(':scope > .drawer-content')?.scrollTo?.({ top: 0, behavior: 'smooth' });
                }
                return;
            }
            openPage(LOREBOOK_PAGE);
            return;
        }
        // With the Extensions button on and no extra extension top-bar drawers, open SillyTavern's Extensions directly.
        if (id === 'pt-extensions' && !extensionDrawers().length) {
            if (open === 'extensions-settings-button') {
                if (deps.isWide()) {
                    delete this.lastInPlace[id];
                    closePages();
                } else if (!closePageSection()) {
                    drawerById('extensions-settings-button')?.querySelector(':scope > .drawer-content')?.scrollTo?.({ top: 0, behavior: 'smooth' });
                }
                return;
            }
            openPage('extensions-settings-button');
            return;
        }
        // The place you are on (or one of its pages): on desktop that hides the panel and resets its
        // remembered sub-page so toggling it open again returns to its root (issue #19); on a phone
        // it goes back to the place's root, or to its top.
        if (open && placeOf(open) === id) {
            if (deps.isWide()) {
                delete this.lastInPlace[id];
                closePages();
                return;
            }
            if (isOwnPage(id)) {
                if (open === id) scrollOwnPageToTop();
                else openPage(id);
                return;
            }
        }
        if (isOwnPage(id)) {
            // Each place keeps its page consistently (both Pocket Tavern's own sub-pages and SillyTavern's
            // drawers): switching places and coming back opens the page you left it on.
            const last = this.lastInPlace[id];
            const validLast = last
                && last !== id
                && (isOwnPage(last) || drawerById(last))
                && placeOf(last) === id
                && !(last === LOREBOOK_PAGE && (!deps.lorebookUiOn() || (wiPage.mode === 'book' && !editedLorebook())));
            openPage(validLast ? last : id);
            return;
        }
        if (open === id) {
            // Tapping the current tab goes "home" within it.
            if (id === 'rightNavHolder') showCharacterList();
            else if (closePageSection()) return;
            else document.querySelector(`#${id} > .drawer-content`)?.scrollTo?.({ top: 0, behavior: 'smooth' });
            return;
        }
        // Switch to the list first, so the page slides in already showing it
        // instead of showing the open character's card and then changing.
        if (id === 'rightNavHolder') showCharacterList();
        openPage(id);
    }

    /**
     * On the rail the pill is placed on the active tab's icon: the rail's tabs are
     * not all the same height, and on a short window the rail scrolls.
     */
    placeRailPill() {
        const button = this.tabs.get(this.railTab);
        const iconBox = button?.querySelector('.pt-tab-icon');
        if (!iconBox || !button.offsetParent) return;
        this.tabbar.style.setProperty('--pt-tab-y', `${button.offsetTop + iconBox.offsetTop}px`);
    }

    setSearchLabel(label) {
        if (this.search.title === label) return;
        this.search.title = label;
        this.search.setAttribute('aria-label', label);
    }

    /** Called when SillyTavern switches chats. */
    onChatChanged() {
        if (this.jumpAt && Date.now() - this.jumpAt < 4000 && currentPageId() === 'rightNavHolder') closePages();
        this.jumpAt = 0;
        this.tabsOut = false;
        this.update();
    }

    onWhoClick() {
        if (currentPageId()) return;
        const context = deps.context();
        if (context.groupId || context.characterId !== undefined) openPage('rightNavHolder');
        else {
            showCharacterList();
            openPage('rightNavHolder');
        }
    }

    update() {
        checkCardPeek();
        const pageId = currentPageId();
        // When SillyTavern swaps one drawer for another, none is open for a moment
        // (SillyTavern delays drawer swaps by --animation-duration = 125ms).
        // Closing Pocket Tavern's own pages updates immediately with zero lag.
        if (!pageId && this.lastPage && !isOwnPage(this.lastPage)) {
            window.clearTimeout(this.settleTimer);
            this.settleTimer = window.setTimeout(safe(SOURCE, () => {
                this.lastPage = currentPageId();
                this.render(this.lastPage);
            }), 160);
            return;
        }
        window.clearTimeout(this.settleTimer);
        this.lastPage = pageId;
        this.render(pageId);
    }

    render(pageId) {
        const before = this.titleEl.textContent;
        this.renderContent(pageId);
        // A short slide when the title changes, so moving between pages feels connected.
        if (before && before !== this.titleEl.textContent) {
            // Two classes with the same animation: switching restarts it without forcing a layout.
            this.swapFlip = !this.swapFlip;
            this.who.classList.toggle('pt-ab-swap', this.swapFlip);
            this.who.classList.toggle('pt-ab-swap-b', !this.swapFlip);
        }
    }

    renderContent(pageId) {
        const root = document.documentElement;
        // Settings and Formatting open on their list of sections again next time.
        for (const nav of PAGE_SECTIONS) if (nav.pageId !== pageId) nav.reset();
        root.classList.toggle('pt-page-open', !!pageId);
        if (pageId) root.dataset.ptPage = pageId;
        else delete root.dataset.ptPage;

        const wide = deps.isWide();
        const tabId = placeOf(pageId);
        if (pageId) this.lastInPlace[tabId] = pageId;
        // A place's root has its title only; a page pushed in a place gets ‹ (DESIGN.md → Headers).
        // A character's card inside Characters is a level down too.
        const card = pageId === 'rightNavHolder' && characterCardShown();
        const isRoot = tabId === pageId
            || pageId === 'pt-chats'
            || (pageId === LOREBOOK_PAGE && !deps.lorebookUiOn())
            || (pageId === 'extensions-settings-button' && deps.settings().extensionsTab && !extensionDrawers().length);
        this.appbar.classList.toggle('pt-ab-root', !!pageId && !card && isRoot);
        const tabs = activeTabs();
        this.tabbar.style.setProperty('--pt-tab-index', String(Math.max(0, tabs.findIndex(tab => tab.id === tabId))));
        for (const [id, button] of this.tabs) {
            const on = id === tabId;
            button.classList.toggle('pt-tab-on', on);
            if (on) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
        this.railTab = tabId;
        if (wide) this.placeRailPill();

        if (pageId && !(wide && pageId === 'pt-chats')) {
            const drawer = drawerById(pageId);
            if (drawer && deps.settings().touchSizing) {
                pageSections(pageId)?.sync();
                if (this.lastDecoratedPage !== pageId) {
                    this.lastDecoratedPage = pageId;
                    requestAnimationFrame(safe(SOURCE, () => fillRanges(drawer)));
                    addSliderSteppers(drawer);
                    if (SEARCH_PAGES.includes(pageId)) {
                        describeSettings(drawer);
                        // Presets and API fill parts of their page a moment later.
                        this.after(600, () => describeSettings(drawer));
                    }
                    if (pageId === 'extensions-settings-button') describeExtensions();
                    if (pageId === 'ai-config-button') {
                        syncPresetTabs();
                        // Chat Completion Tabs builds its own tabs up to 2 seconds after an API switch; ours step aside then.
                        this.after(2500, syncPresetTabs);
                    }
                }
            } else {
                this.lastDecoratedPage = null;
            }
            if (pageId === 'backgrounds-button' || pageId === 'user-settings-button') deps.syncThemeNotes();
            const info = drawer ? pageInfo(drawer) : (pageSpec(pageId) ?? { title: '', icon: 'fa-gear' });
            // The AI page shows a banner while there is no connection: draw it again when that changes.
            if (pageId === 'pt-ai' && this.aiConnected !== deps.isConnected()) {
                this.aiConnected = deps.isConnected();
                refreshOwnPage();
            }
            syncLorebookMode(pageId);
            const loreUi = deps.lorebookUiOn();
            if (pageId === LOREBOOK_PAGE && loreUi && wiPage.mode === 'settings') this.titleEl.textContent = t('Activation settings');
            else if (pageId === LOREBOOK_PAGE && loreUi && editedLorebook()) this.titleEl.textContent = editedLorebook();
            else if (typeof info.rawTitle === 'function') this.titleEl.textContent = info.rawTitle();
            else this.titleEl.textContent = t(info.title);
            this.subEl.textContent = t(info.long ?? '');
            // Switch back to "Presets" as soon as the editor starts sliding away.
            const editorMode = promptEditorOpen() ? promptEditorMode() : null;
            root.classList.toggle('pt-prompt-editor', !!editorMode);
            if (editorMode === 'edit') {
                const name = document.getElementById('completion_prompt_manager_popup_entry_form_name')?.value?.trim();
                this.titleEl.textContent = t('Edit prompt');
                this.subEl.textContent = name || t('New prompt');
            } else if (editorMode === 'inspect') {
                this.titleEl.textContent = t('Prompt list');
                this.subEl.textContent = t('Prompts linked to this marker');
            }
            if (pageId === 'rightNavHolder') {
                syncCharacterPage();
                const editing = isShown(document.getElementById('rm_ch_create_block'));
                const name = document.getElementById('character_name_pole')?.value?.trim();
                if (editing) this.subEl.textContent = name ? t('Editing {name}', { name }) : t('New character');
                else if (isShown(document.getElementById('rm_group_chats_block'))) this.subEl.textContent = t('Group chat');
            }
            let headIcon = info.icon;
            const sections = pageSections(pageId);
            const section = sections?.current();
            if (section) {
                this.titleEl.textContent = section.raw ? section.title : t(section.title);
                this.subEl.textContent = t(sections.pageTitle);
                headIcon = section.icon;
            }
            this.search.hidden = !SEARCH_PAGES.includes(pageId) || !!editorMode;
            this.setSearchLabel(t('Find a setting'));
            this.menu.hidden = true;
            this.focusBtn.hidden = true;
            this.appbar.classList.remove('pt-ab-chat');
            if (this.lastHeadIcon !== headIcon) {
                this.lastHeadIcon = headIcon;
                delete this.avatar.dataset.ptIcon;
                this.avatar.replaceChildren(deps.ui(headIcon));
            }
            this.avatar.classList.add('pt-ab-avatar-icon');
            this.who.disabled = true;
            this.appbar.classList.add('pt-ab-page');
            this.appbar.classList.remove('pt-ab-chats-panel');
            // Desktop: keep the open chat's own column header beside the panel (DESIGN.md → Desktop navigation).
            const chat = this.chatHeaderInfo();
            const hideDesk = !(wide && chat.hasChat);
            this.deskChat.hidden = hideDesk;
            for (const child of this.deskChat.children) child.hidden = hideDesk;
            if (!hideDesk) {
                this.deskTitle.textContent = chat.name;
                this.paintAvatar(this.deskAvatar, chat);
            }
            this.inChat = !hideDesk;
            if (!this.inChat && isFocusMode()) root.classList.remove('pt-focus-mode');
            this.syncFocusControls();
            this.syncTuck();
            return;
        }

        this.lastDecoratedPage = null;
        this.lastHeadIcon = null;
        this.appbar.classList.remove('pt-ab-page');
        this.appbar.classList.toggle('pt-ab-chats-panel', wide && pageId === 'pt-chats');
        this.deskChat.hidden = true;
        for (const child of this.deskChat.children) child.hidden = true;
        root.classList.remove('pt-prompt-editor');
        this.who.disabled = false;
        const chat = this.chatHeaderInfo();
        this.titleEl.textContent = chat.name;
        // The header never shows connection state (DESIGN.md); problems get a banner and a dot on AI.
        this.subEl.textContent = '';
        this.avatar.classList.remove('pt-ab-avatar-icon');
        this.paintAvatar(this.avatar, chat);
        // In a chat: ⋯ (and Focus mode on desktop). Search everything is the field on the Chats page.
        this.menu.hidden = !chat.hasChat;
        this.focusBtn.hidden = !chat.hasChat;
        this.search.hidden = true;
        this.appbar.classList.toggle('pt-ab-chat', chat.hasChat);
        this.inChat = chat.hasChat;
        if (!chat.hasChat && isFocusMode()) root.classList.remove('pt-focus-mode');
        this.syncFocusControls();
        this.syncTuck();
    }
}

function tabsTuckable() {
    const root = document.documentElement;
    return deps.active() && deps.settings().appShell && deps.settings().chatStyle && deps.settings().hideTabsInChat && !root.classList.contains('pt-desktop');
}

export function syncTabsButton() {
    const button = composer.tabs;
    if (!button) return;
    const tucked = document.documentElement.classList.contains('pt-tabs-tucked');
    const label = t(tucked ? 'Show tabs' : 'Hide tabs');
    button.setAttribute('aria-expanded', String(!tucked));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.classList.toggle('pt-tabs-btn-out', !tucked);
}

export function syncShell() {
    const want = deps.active() && deps.settings().appShell;
    if (want && !shell) shell = new Shell();
    else if (want && shell) {
        shell.syncTabs();
        shell.update();
    } else if (!want && shell) {
        shell.destroy();
        shell = null;
    }
}
