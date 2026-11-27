// Every SillyTavern id, class and attribute Pocket Tavern looks for, grouped by screen
// (AGENTS.md → Engineering standards). Other files import these names; when a SillyTavern update
// renames something, the fix is here. Each lane adds its screen's group; keep groups in this order.

// ---- Popups ----------------------------------------------------------------------------------

/** SillyTavern's popups: a <dialog class="popup"> while it is open or opening. */
export const POPUP_DIALOG_OPEN = 'dialog.popup[open], dialog.popup[opening]';
export const POPUP_DIALOG = 'dialog.popup';
/** Older popups that SillyTavern shows and hides with a style instead of a <dialog>. */
export const POPUP_LEGACY_IDS = ['shadow_popup', 'shadow_select_chat_popup'];

// ---- Pages and notifications ----------------------------------------------------------------

/** SillyTavern's toasts (toastr's container). */
export const TOASTS = '#toast-container';
/** The top bar's drawers themselves (extensions add their own). */
export const TOP_DRAWERS = '#top-settings-holder > .drawer';
/** Every top-bar drawer's content (each is a page while open). */
export const PAGE_DRAWERS = '#top-settings-holder > .drawer > .drawer-content';
/** The top-bar drawer that is open as a page. */
export const OPEN_PAGE = '#top-settings-holder > .drawer > .drawer-content.openDrawer';

// ---- Popups SillyTavern draws as plain boxes (Back closes them) ---------------------------------

export const PROMPT_MANAGER_POPUP = '#completion_prompt_manager_popup';
export const CHAT_HISTORY_POPUP = '#shadow_select_chat_popup';
export const CHAT_HISTORY_CLOSE = '#select_chat_cross';
export const CHARACTER_POPUP = '#character_popup';
export const CHARACTER_POPUP_CLOSE = '#character_cross';

// ---- Chat ----------------------------------------------------------------------------------------

/** The chat's scroll container; SillyTavern empties it when a chat loads. */
export const CHAT = '#chat';
/** The text box SillyTavern puts in a message while you edit it. */
export const MESSAGE_EDITOR = '#curEditTextarea';

/** Where SillyTavern (and Pocket Tavern) put text you edit: a box there that takes focus right after a tap
 *  elsewhere keeps the keyboard down (src/shell/focus-guard.js). */
export const EDIT_AREAS = '#chat, #WorldInfo, #world_popup, #completion_prompt_manager_popup, #persona-management-block, #rm_ch_create_block, #pt-sheet';

/** The wand menu's Translate chat (SillyTavern's translation extension). */
export const TRANSLATE_CHAT = '#translate_chat';

// ---- Message box ---------------------------------------------------------------------------

/** SillyTavern's whole message area at the bottom of the chat (quick replies, the box, its buttons). */
export const MESSAGE_FORM = '#form_sheld';
/** The row holding the text field (extensions such as Input History add their buttons to it). */
export const MESSAGE_ROW = '#nonQRFormItems';
/** The message box's text field. */
export const MESSAGE_BOX = '#send_textarea';
/** The row with the text field and its buttons (the Draft helper's result bar sits right above it). */
export const SEND_FORM = '#send_form';
/** The buttons at the end of the message box (Send, and what extensions add beside it). */
export const SEND_FORM_RIGHT = '#rightSendForm';
/** Send, and Stop while a reply is written. */
export const SEND_BUTTON = '#send_but';
export const STOP_BUTTON = '#mes_stop';

// ---- AI --------------------------------------------------------------------------------------

/** The API picker (Connection settings); "openai" is Chat Completion. */
export const MAIN_API = '#main_api';

/** The Chat Completion preset picker; its chosen option names the preset a connection profile saves. */
export const CHAT_COMPLETION_PRESET = '#settings_preset_openai';

// ---- Chat options (SillyTavern's ☰ menu) ------------------------------------------------------

/** "Start new chat" for the open character (SillyTavern asks first). */
export const START_NEW_CHAT = '#option_start_new_chat';

// ---- Characters ------------------------------------------------------------------------------

/** The character list's row of filter buttons (favourites, groups, folders, tags, clear). */
export const CHARACTER_FILTERS = '#rm_characters_block .rm_tag_filter';
/** The list itself (a grid of cards, or rows); SillyTavern empties and fills it on every search, sort or page. */
export const CHARACTER_LIST = '#rm_print_characters_block';
/** The box above the list (toolbar, search, filters). */
export const CHARACTER_LIST_TOP = '#charListFixedTop';
/** SillyTavern's favourites row above the list (hidden while the Characters pages are on). */
export const FAVORITES_ROW = '#HotSwapWrapper';
/** The search field SillyTavern filters the list with. */
export const CHARACTER_SEARCH = '#character_search_bar';
/** Bulk edit (select several), and the class SillyTavern puts on the list while it is on. */
export const BULK_EDIT_BUTTON = '#bulkEditButton';
export const BULK_MODE_CLASS = 'group_overlay_mode_select';

// ---- Personas ---------------------------------------------------------------------------------

/** SillyTavern's list of personas (each an .avatar-container; the one in use is .selected). */
export const PERSONA_LIST = '#user_avatar_block';

// ---- Formatting (Advanced Formatting) ----------------------------------------------------------

/** Each one's own on switch (a hidden checkbox behind a ⏻ button in the heading). */
export const INSTRUCT_ENABLED = '#instruct_enabled';
export const SYSPROMPT_ENABLED = '#sysprompt_enabled';
/** The three sections' boxes: Pocket Tavern's own rows go first in each. */
export const CONTEXT_SETTINGS = '#ContextSettings';
export const INSTRUCT_COLUMN = '#InstructSettingsColumn';
export const SYSPROMPT_BLOCK = '#SystemPromptBlock';

// ---- Looks (User Settings → UI Theme, Backgrounds) --------------------------------------------

/** The UI theme picker and the avatar shape picker. */
export const UI_THEME_PICKER = '#themes';
export const AVATAR_STYLE = '#avatar_style';
/** A background's thumbnail in the Backgrounds drawer. */
export const BACKGROUND_THUMB = '#bg_menu_content .bg_example';

// ---- Start screen and menus --------------------------------------------------------------------

/** The lorebook picker in World Info (its options name every lorebook). */
export const LOREBOOK_PICKER = '#world_editor_select';
/** The recent chats on SillyTavern's welcome screen. */
export const WELCOME_RECENT_CHATS = '#chat .welcomePanel .recentChat';
/** Image Generation's menu items (when that extension is on). */
export const PICTURE_MENU_ITEMS = '#sd_dropdown [id]';

// ---- Tool panels (desktop) ---------------------------------------------------------------------

/** SillyTavern's floating panels (Author's Note, CFG, token probabilities, extensions' pop-outs) and their holder. */
export const TOOL_PANEL_HOLDER = '#movingDivs';
export const TOOL_PANELS = '#movingDivs > div';
/** A floating panel's own close button. */
export const TOOL_PANEL_CLOSE = '.floating_panel_close, #logprobsViewerClose, .dragClose, [id$="Close"]';

// ---- Keyboard and tab bar followers ------------------------------------------------------------

/** SillyTavern's elements that size themselves to the visible screen while Safari's keyboard is up
    (src/core/activation.js → the iPhone keyboard variables; styles/shell/ios.css). */
export const KEYBOARD_FOLLOWERS = [
    '#sheld', '#top-settings-holder .drawer-content', '#character_popup', '#completion_prompt_manager_popup',
    '#toast-container', '#world_popup_entries_list .pt-entry-open', '#options', '#options .options-content', '#extensionsMenu',
];
