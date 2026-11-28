// Pocket Tavern's own pages (DESIGN.md → Information architecture): Chats, Characters, AI, Lorebooks and Settings,
// each defined once with what it reads from SillyTavern and what its buttons do.
import { findTheme, themeFromSillyTavern } from '../themes/themes.js';
import { t } from './i18n.js';
import { VERSION } from '../../changelog.js';
import { definePage, onPageChange, refreshOwnPage } from '../shell/page.js';
import { AI_PAGES, aiPage } from '../views/ai.js';
import { extensionsPage, settingsPage } from '../views/settings.js';
import { appearancePage, displayPage } from '../views/appearance.js';
import { DEVICE_MODES, LOREBOOK_UI_MODES, pocketTavernPage } from '../views/pocket-tavern.js';
import { aboutPage } from '../views/about.js';
import { LOREBOOK_PAGE, lorebooksPage } from '../views/lorebooks.js';
import { draftSettingsPage } from '../views/draft-settings.js';
import { SECTIONS as DRAFT_SECTIONS } from '../features/draft/engine.js';
import { builtInInstruction, draftSettings, profileNames, resetDraftSettings, saveDraftSettings, setupDraft, standaloneInstalled } from '../features/draft/draft.js';
import { chatMenu } from '../views/chat-menu.js';
import { chatsPage } from '../views/chats.js';
import { characterPage } from '../views/character.js';
import { aiStatus, aiQuickRows, aiQuickSliders, openPresetsOn } from '../st/ai.js';
import { filterByTag } from '../st/character-list.js';
import { aboutCharacter, characterTarget, pickCharacterLorebook, favoriteCharacter, openCharacterPage, editCharacter, fetchCharacterChats, isCurrentCharacter, openCharacterChatFor, openCharacterMenu, targetCharacter } from '../st/characters.js';
import { openDraftPreview, openDraftRefine } from '../shell/menus.js';
import { afterOpening, assistantEntry, chatOwner, ensurePhoneHome, isOpenChat, isPinnedChat, loadStartModules, openChatFile, openHomeChatMenu, recentChatsForHome, searchIndexForHome, syncChatsWelcome } from '../shell/chats-home.js';
import { pickChatLook, setAppearance, stChatStyleName } from '../themes/appearance.js';
import { currentTheme, importSillyTavernTheme, loadSillyTavernThemes, stThemes } from '../themes/st-themes.js';
import { currentShell } from '../shell/app-shell.js';
import { extensionDrawers, openPage, showCharacterList } from '../shell/pages.js';
import { scheduleHistorySync } from '../shell/history.js';
import { openChoiceSheet } from '../shell/choice-sheet.js';
import { ggPresent } from '../compat/guided-generations.js';
import { lorebookList, openLorebook, openLorebookSettings, pickActiveLorebooks } from '../st/lorebooks.js';
import { installApp, isStandalone, openSillyTavernSection, openSillyTavernUpdates, openWhatsNew, pickTheme, setSwitch, statusText, syncSettingsInputs, updatePocketTavern, updateStatusLine, yourThemeColors } from '../st/settings.js';
import { $j, ctx, isWide, lorebookUiOn, readMode, saveSettings, settings, ui, writeMode } from './state.js';
import { applyState } from './activation.js';
import { safe } from './lifecycle.js';
import { FA_MAP, svgIcon } from '../ui/icons.js';

const SOURCE = 'own-pages';

/** A character's page opened from Chats (a quick pick, a chat's picture): Back returns to Chats. */
export const characterFromChats = { chid: null };

/** Opens a chat's character's page, without opening the chat. */
function showCharacterFromChats(chat) {
    const chid = (ctx().characters ?? []).findIndex(character => character.avatar === chat.avatar);
    if (chid < 0) return;
    characterFromChats.chid = String(chid);
    openCharacterPage(chid);
}

/** Defines every page. `useSillyTavernForNow` comes from start.js (Settings → Pocket Tavern offers it). */
export function registerOwnPages({ useSillyTavernForNow }) {
    definePage('pt-chats', chatsPage({
        recentChats: recentChatsForHome,
        owner: chatOwner,
        isOpen: isOpenChat,
        isPinned: isPinnedChat,
        openChat: chat => openChatFile(chat),
        showCharacter: chat => showCharacterFromChats(chat),
        chatMenu: (chat, button) => openHomeChatMenu(chat, button),
        searchIndex: searchIndexForHome,
        chooseCharacter: () => currentShell()?.onTab('rightNavHolder'),
        get assistant() {
            return assistantEntry();
        },
        withOwner: {
            newChat: chat => afterOpening(chat, () => document.getElementById('option_start_new_chat')?.click()),
            allChats: chat => afterOpening(chat, () => document.getElementById('option_select_chat')?.click()),
            character: chat => showCharacterFromChats(chat),
        },
    }));
    loadStartModules();
    definePage('pt-character', characterPage({
        character: () => {
            const character = targetCharacter();
            if (!character) return null;
            return {
                name: character.name,
                picture: ctx().getThumbnailUrl?.('avatar', character.avatar) ?? `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`,
                about: aboutCharacter(character),
                favorite: character.fav === true || character.fav === 'true',
                latest: character.chat,
                creator: String(character.data?.creator ?? '').trim(),
                lorebook: String(character.data?.extensions?.world ?? ''),
                tags: (ctx().tagMap?.[character.avatar] ?? [])
                    .map(id => ctx().tags?.find(item => item.id === id))
                    .filter(Boolean)
                    .map(item => ({ id: String(item.id), name: item.name })),
            };
        },
        chats: () => fetchCharacterChats(targetCharacter()?.avatar ?? ''),
        isOpen: fileId => isCurrentCharacter(characterTarget.chid) && ctx().getCurrentChatId?.() === fileId,
        chat: fileId => openCharacterChatFor(characterTarget.chid, { fileId }),
        newChat: () => openCharacterChatFor(characterTarget.chid, { then: () => document.getElementById('option_start_new_chat')?.click() }),
        // SillyTavern's Characters page opens first, then its form is filled for this character: the other
        // way round, the page change ended the card-only view before the form was even showing.
        edit: async () => {
            const chid = characterTarget.chid;
            openPage('rightNavHolder');
            await new Promise(resolve => requestAnimationFrame(safe(SOURCE, () => setTimeout(resolve, 60))));
            await editCharacter(chid);
        },
        favorite: () => favoriteCharacter(characterTarget.chid),
        menu: anchor => openCharacterMenu(anchor),
        openLorebook: name => openLorebook(name),
        pickLorebook: () => pickCharacterLorebook(characterTarget.chid),
        // Characters, showing only this tag.
        showTag: id => {
            openPage('rightNavHolder');
            showCharacterList();
            setTimeout(safe(SOURCE, () => filterByTag(id)), 300);
        },
    }));
    definePage('pt-ai', aiPage({
        openPage,
        status: aiStatus,
        quick: aiQuickRows,
        sliders: aiQuickSliders,
        chatCompletion: () => ctx().mainApi === 'openai',
        openSamplers: () => openPresetsOn('params'),
        openPrompts: () => openPresetsOn('prompts'),
    }));
    const drawerIcon = name => {
        if (!name) return undefined;
        const mapped = name.startsWith('fa-') ? FA_MAP[name] : name;
        return mapped ? svgIcon(mapped, 'pt-list-row-icon') : ui(name, 'pt-list-row-icon pt-fa-icon');
    };
    definePage('pt-settings', settingsPage({
        openPage,
        extensionPages: extensionDrawers,
        iconFor: drawerIcon,
        separateExtensions: () => !!settings.extensionsTab,
        themeName: () => { const theme = currentTheme(); return theme ? (findTheme(theme.id) ? t(theme.name) : theme.name) : t('Your theme'); },
        version: VERSION,
    }));
    definePage('pt-extensions', extensionsPage({
        openPage,
        extensionPages: extensionDrawers,
        iconFor: drawerIcon,
    }));
    definePage('pt-lorebooks', lorebooksPage({
        books: lorebookList,
        pickActive: pickActiveLorebooks,
        openSettings: openLorebookSettings,
        create: () => document.getElementById('world_create_button')?.click(),
        importBook: () => document.getElementById('world_import_button')?.click(),
        openBook: openLorebook,
    }));
    const appearanceActions = {
        get: key => settings[key],
        set: (key, value, origin) => setAppearance(key, value, origin),
        theme: () => (findTheme(settings.theme) || String(settings.theme).startsWith('st:')) ? String(settings.theme) : 'st',
        yourColors: yourThemeColors,
        stThemes: () => stThemes.list ? stThemes.list.map(raw => ({ raw, theme: themeFromSillyTavern(raw) })).filter(item => item.theme).map(item => ({ ...item, id: `st:${item.raw.name}` })) : null,
        loadStThemes: () => loadSillyTavernThemes(),
        pickTheme,
        importTheme: document.getElementById('ui_preset_import_button') ? done => importSillyTavernTheme(done) : null,
        chatLook: () => { const stStyle = stChatStyleName(); return { look: stStyle ? '' : (settings.chatLook || 'cards'), stStyle }; },
        pickChatLook,
        desktop: isWide,
        chatWidth: () => {
            const source = document.getElementById('chat_width_slider');
            return source ? { min: Number(source.min || 25), max: Number(source.max || 100), value: Number(source.value) } : null;
        },
        setChatWidth: value => { const source = document.getElementById('chat_width_slider'); if (source) $j()(source).val(value).trigger('input', { forced: true }); },
        avatarShape: () => document.getElementById('avatar_style')?.value ?? '',
        setAvatarShape: value => { const select = document.getElementById('avatar_style'); if (select && select.value !== value) $j()(select).val(value).trigger('change'); },
        openBackgrounds: () => openPage('backgrounds-button'),
        openSillyTavernLook: () => openSillyTavernSection('look'),
    };
    definePage('pt-appearance', appearancePage(appearanceActions));
    definePage('pt-display', displayPage(appearanceActions));
    definePage('pt-pocket', pocketTavernPage({
        get: key => !!settings[key],
        set: setSwitch,
        applies: only => only === 'phone' ? !isWide()
            : only === 'vibrate' ? !isWide() && typeof navigator.vibrate === 'function'
                : only === 'gg' ? ggPresent()
                    : only === 'charPage' ? !!settings.charPage
                        : only === 'loreUi' ? lorebookUiOn() : true,
        mode: readMode,
        pickMode: () => openChoiceSheet({
            title: t('Use it on this device'),
            options: Object.entries(DEVICE_MODES).map(([value, label]) => ({ value, label: t(label) })),
            current: readMode(),
            onPick: value => {
                writeMode(value);
                applyState();
                updateStatusLine();
                refreshOwnPage();
            },
        }),
        lorebookUi: () => settings.lorebookUi ?? 'both',
        pickLorebookUi: () => openChoiceSheet({
            title: t('Lorebook interface'),
            options: Object.entries(LOREBOOK_UI_MODES).map(([value, label]) => ({ value, label: t(label) })),
            current: settings.lorebookUi ?? 'both',
            onPick: value => {
                settings.lorebookUi = value;
                saveSettings();
                applyState();
                syncSettingsInputs();
                refreshOwnPage();
            },
        }),
        status: statusText,
        useSillyTavernForNow,
        openDraft: () => openPage('pt-draft'),
    }));
    setupDraft({ context: ctx, settings: () => settings, save: saveSettings, openRefine: openDraftRefine });
    definePage('pt-draft', draftSettingsPage({
        sections: DRAFT_SECTIONS,
        settings: draftSettings,
        set: (key, value) => {
            draftSettings()[key] = value;
            saveDraftSettings();
        },
        pick: openChoiceSheet,
        profiles: profileNames,
        builtIn: builtInInstruction,
        preview: openDraftPreview,
        reset: () => {
            resetDraftSettings();
            refreshOwnPage();
            globalThis.toastr?.success?.(t('Settings reset'), t('Draft helper'), { timeOut: 1500 });
        },
        standalone: standaloneInstalled,
        enabled: () => !!settings.draftHelper,
        setEnabled: on => setAppearance('draftHelper', on),
    }));
    definePage('pt-about', aboutPage({
        version: VERSION,
        openWhatsNew: () => openWhatsNew(),
        updatePocketTavern: row => updatePocketTavern(row),
        openSillyTavernUpdates: () => openSillyTavernUpdates(),
        installApp: () => isStandalone() ? null : () => installApp(),
        openLink: url => window.open(url, '_blank', 'noopener'),
    }));
    onPageChange(() => {
        currentShell()?.update();
        scheduleHistorySync();
        syncChatsWelcome();
        ensurePhoneHome();
    });
}
