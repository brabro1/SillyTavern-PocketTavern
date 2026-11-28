// Adaptive character accent & ambient header aura (DESIGN.md → Themes): extracts a calm dominant accent
// colour from the open character's portrait via a tiny offscreen canvas (cached per avatar URL). Always
// sets a subtle --pt-char-tint on the chat header; when settings.adaptiveAccent is on, feeds that hue
// into applyAppearance() so the chat's accent harmonizes with the character.
import { safe } from '../core/lifecycle.js';

const SOURCE = 'char-accent';

/** @type {{ active: () => boolean, settings: () => object, context: () => any, onAccentChanged: () => void } | null} */
let deps = null;
/** @type {Map<string, string|null>} */
const cache = new Map();
/** @type {Set<string>} */
const pending = new Set();
let currentUrl = '';
let currentColor = '';

export function setupCharAccent(supplied) {
    deps = supplied;
}

/** The active character's extracted hex accent when adaptiveAccent is on, else ''. */
export function activeCharAccent() {
    if (!deps?.active() || !deps.settings().adaptiveAccent) return '';
    return currentColor;
}

function activeAvatarUrl() {
    const context = deps?.context?.();
    if (!context || context.groupId || context.characterId === undefined) return '';
    const char = context.characters?.[context.characterId];
    if (!char?.avatar) return '';
    return `/thumbnail?type=avatar&file=${encodeURIComponent(char.avatar)}`;
}

function rgbToHex(r, g, b) {
    const to = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
}

/** Picks a vibrant, calm representative hue from an already-loaded image via a 16x16 canvas. */
function sampleImage(img) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        if (!g) return null;
        g.drawImage(img, 0, 0, 16, 16);
        const { data } = g.getImageData(0, 0, 16, 16);
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let weightSum = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 160) continue;
            const r = data[i];
            const gr = data[i + 1];
            const b = data[i + 2];
            const max = Math.max(r, gr, b);
            const min = Math.min(r, gr, b);
            const sat = max ? (max - min) / max : 0;
            const lum = (max + min) / 510;
            // Skip near-black, near-white and muddy neutrals; favour expressive mid-tone colours.
            if (sat < 0.22 || lum < 0.12 || lum > 0.9) continue;
            const w = sat * sat * (1 - Math.abs(lum - 0.55));
            rSum += r * w;
            gSum += gr * w;
            bSum += b * w;
            weightSum += w;
        }
        if (weightSum < 0.1) return null;
        return rgbToHex(rSum / weightSum, gSum / weightSum, bSum / weightSum);
    } catch {
        return null;
    }
}

function applyTint(color) {
    const bar = document.getElementById('pt-appbar');
    if (bar) {
        if (color && deps?.active()) bar.style.setProperty('--pt-char-tint', color);
        else bar.style.removeProperty('--pt-char-tint');
    }
    const prev = currentColor;
    currentColor = color ?? '';
    if (deps?.settings().adaptiveAccent && prev !== currentColor) deps.onAccentChanged();
}

export function syncCharAccent() {
    if (!deps?.active()) {
        currentUrl = '';
        currentColor = '';
        document.getElementById('pt-appbar')?.style.removeProperty('--pt-char-tint');
        return;
    }
    const url = activeAvatarUrl();
    currentUrl = url;
    if (!url) {
        applyTint('');
        return;
    }
    if (cache.has(url)) {
        applyTint(cache.get(url) ?? '');
        return;
    }
    if (pending.has(url)) return;
    pending.add(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = safe(SOURCE, () => {
        pending.delete(url);
        const color = sampleImage(img);
        cache.set(url, color);
        if (currentUrl === url && deps?.active()) applyTint(color ?? '');
    });
    img.onerror = safe(SOURCE, () => {
        pending.delete(url);
        cache.set(url, null);
        if (currentUrl === url) applyTint('');
    });
    img.src = url;
}
