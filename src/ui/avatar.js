// Avatars (DESIGN.md → Components → Avatars and pictures): 24, 32, 40 or 96px, in SillyTavern's avatar
// shape. A missing or broken picture shows the name's initial on a colour from the name.
// Styles in styles/components/avatar.css.
import { h } from '../core/dom.js';

/** A hue from the name, so the same name always gets the same colour. */
export function nameHue(name) {
    let hash = 0;
    for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return hash % 360;
}

const initialOf = name => [...String(name).trim()][0]?.toLocaleUpperCase() ?? '?';

/**
 * @param {object} options
 * @param {string} options.name the character's or persona's name (user data; used for the initial and alt text)
 * @param {string} [options.src] the picture's URL
 * @param {24|32|40|56|96} [options.size]
 */
export function avatar({ name, src, size = 40 }) {
    const box = h('span', { class: `pt-avatar pt-avatar--${size}`, style: `--pt-avatar-hue: ${nameHue(name)}` });
    const showInitial = () => {
        box.replaceChildren(h('span', { class: 'pt-avatar-initial', 'aria-hidden': 'true', raw: initialOf(name) }));
        box.setAttribute('role', 'img');
        box.setAttribute('aria-label', String(name));
        box.classList.add('pt-avatar--initial');
    };
    if (!src) {
        showInitial();
        return box;
    }
    const img = h('img', { class: 'pt-avatar-img', src, alt: String(name), loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', showInitial, { once: true });
    box.append(img);
    return box;
}
