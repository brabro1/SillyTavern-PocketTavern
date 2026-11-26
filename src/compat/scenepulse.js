// ScenePulse (another extension). On phones it puts a button next to Send, where there is no room for it (Send
// got squeezed), so that button is hidden (styles/compat/scenepulse.css) and ScenePulse opens from + → Tools
// instead. Its panel is placed between Pocket Tavern's bars. Without ScenePulse (no button) the row is left out.

const BUTTON = '#sp-st-restore';

/**
 * Its row for + → Tools: its own picture and name, and a press on its own (hidden) button.
 * @param {{ ui: (name: string, className?: string) => Element, press: (element: Element) => void }} helpers
 */
export function scenePulseRow({ ui, press }) {
    const button = document.querySelector(BUTTON);
    if (!button || button.style.display === 'none') return null;
    const art = button.querySelector('svg')?.cloneNode(true);
    if (art) {
        art.querySelectorAll('[class]').forEach(node => node.removeAttribute('class'));
        art.setAttribute('class', 'pt-menu-row-icon pt-list-row-icon');
        art.setAttribute('aria-hidden', 'true');
    }
    return { rawTitle: 'ScenePulse', subtitle: 'Characters, mood and quests in this scene', start: art ?? ui('puzzle', 'pt-menu-row-icon pt-list-row-icon'), run: () => press(button) };
}
