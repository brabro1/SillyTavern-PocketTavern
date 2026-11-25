// SillyTavern's drawers (its side panels).

/**
 * SillyTavern closes an unpinned drawer on any mousedown or touchstart outside it. Pocket Tavern's own
 * layers (sheets, bars) live outside the drawers, so their presses must not reach that handler.
 */
export function shieldFromDrawerAutoClose(element) {
    for (const type of ['mousedown', 'touchstart']) {
        element.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }
}
