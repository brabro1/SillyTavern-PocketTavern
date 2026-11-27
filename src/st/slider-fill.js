// SillyTavern's sliders show how far they are filled (the track up to the knob in the accent), since a phone's
// native range input shows nothing of that. Kept up to date as they move.

/** @type {{ $j: () => any } | null} */
let deps = null;

export function setupSliderFill(supplied) {
    deps = supplied;
}

// ------------------------------------------------------------ slider fill

/** SillyTavern leaves the slider's filled part at a fixed width; make it follow the value. */
function updateRangeFill(input) {
    const min = input.min === '' ? 0 : Number(input.min);
    const max = input.max === '' ? 100 : Number(input.max);
    const value = Number(input.value);
    const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
    input.style.setProperty('--pt-fill', `${percent.toFixed(1)}%`);
}

export function fillRanges(root = document) {
    for (const input of root.querySelectorAll('input[type="range"]')) updateRangeFill(input);
}

export function watchRanges(on) {
    const $ = deps.$j();
    $(document).off('.ptRange');
    if (on) {
        // jQuery delegation sees both real input and SillyTavern's own .trigger('input').
        $(document).on('input.ptRange change.ptRange', 'input[type="range"]', function () {
            updateRangeFill(this);
        });
        fillRanges();
    } else {
        for (const input of document.querySelectorAll('input[type="range"]')) input.style.removeProperty('--pt-fill');
    }
}
