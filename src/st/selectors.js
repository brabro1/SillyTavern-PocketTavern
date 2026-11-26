// Every SillyTavern id, class and attribute Pocket Tavern looks for, grouped by screen
// (AGENTS.md → Engineering standards). Other files import these names; when a SillyTavern update
// renames something, the fix is here. Each lane adds its screen's group; keep groups in this order.
// The legacy app (src/legacy/) still has its own until each milestone moves them here.

// ---- Popups ----------------------------------------------------------------------------------

/** SillyTavern's popups: a <dialog class="popup"> while it is open or opening. */
export const POPUP_DIALOG_OPEN = 'dialog.popup[open], dialog.popup[opening]';
export const POPUP_DIALOG = 'dialog.popup';
/** Older popups that SillyTavern shows and hides with a style instead of a <dialog>. */
export const POPUP_LEGACY_IDS = ['shadow_popup', 'shadow_select_chat_popup'];

// ---- Chat ----------------------------------------------------------------------------------------

/** The chat's scroll container; SillyTavern empties it when a chat loads. */
export const CHAT = '#chat';
/** The text box SillyTavern puts in a message while you edit it. */
export const MESSAGE_EDITOR = '#curEditTextarea';

// ---- Message box ---------------------------------------------------------------------------

/** SillyTavern's whole message area at the bottom of the chat (quick replies, the box, its buttons). */
export const MESSAGE_FORM = '#form_sheld';
/** The message box's text field. */
export const MESSAGE_BOX = '#send_textarea';
/** The row with the text field and its buttons (the Draft helper's result bar sits right above it). */
export const SEND_FORM = '#send_form';
/** Send, and Stop while a reply is written. */
export const SEND_BUTTON = '#send_but';
export const STOP_BUTTON = '#mes_stop';

// ---- AI --------------------------------------------------------------------------------------

/** The Chat Completion preset picker; its chosen option names the preset a connection profile saves. */
export const CHAT_COMPLETION_PRESET = '#settings_preset_openai';
