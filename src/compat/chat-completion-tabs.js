// Chat Completion Tabs (another extension, by RivelleDays): Parameters and Prompts as two tabs at the top of the
// Presets page. While it is there, Pocket Tavern's own tabs step aside (src/st/ai.js → syncPresetTabs) and its
// tabs are styled as Pocket Tavern's segmented bar (styles/compat/chat-completion-tabs.css).

const BAR = '.openai-tab-buttons';

/** Its tab bar is on the page. */
export function chatCompletionTabsShown() {
    return !!document.querySelector(BAR);
}

/** Its Parameters or Prompts tab, found by the words on it. */
export function chatCompletionTab(tab) {
    return [...document.querySelectorAll(`${BAR} button, ${BAR} .menu_button`)].find(node => (tab === 'prompts' ? /prompt/i : /param/i).test(node.textContent)) ?? null;
}

/** A setting found by search may sit on its hidden tab: switch to that tab first. */
export function showChatCompletionTabOf(element) {
    const tab = element.closest('.openai-tab-content:not(.active)');
    if (tab) document.getElementById(tab.id.replace('-content-', '-btn-'))?.click();
}
