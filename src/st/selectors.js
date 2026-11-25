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
