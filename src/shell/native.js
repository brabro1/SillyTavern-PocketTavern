// Using native SillyTavern for a while (DESIGN.md → Using native SillyTavern): while Pocket Tavern steps
// aside, for "Use SillyTavern for now" or after an error, one pill brings it back. It is the only thing
// Pocket Tavern leaves on SillyTavern's own interface, and it goes as soon as Pocket Tavern is back.
// Styles in styles/components/back-pill.css.
import { currentLang, isRtl } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { MESSAGE_FORM } from '../st/selectors.js';
import { button } from '../ui/button.js';

let pill = null;
let place = null;
let watch = null;

/** Shows the "Back to Pocket Tavern" pill; `onBack` runs when it is pressed (the pill goes first). */
export function showBackPill(onBack) {
    hideBackPill();
    pill = button({ label: 'Back to Pocket Tavern', kind: 'primary', icon: 'arrow-left', onClick: () => {
        hideBackPill();
        onBack();
    } });
    pill.id = 'pt-back-pill';
    pill.classList.add('pt-back-pill');
    pill.lang = currentLang();
    if (isRtl()) pill.dir = 'rtl';
    document.body.append(pill);
    // Just above SillyTavern's message area (quick replies included), measured, so it covers none of it.
    // With Pocket Tavern off, SillyTavern's transform on <html> makes `fixed` follow the page, so where
    // the pill lands is measured and the difference taken back out.
    place = safe('the Back pill', () => {
        if (!pill) return;
        const form = document.querySelector(MESSAGE_FORM)?.getBoundingClientRect();
        const want = Math.max(8, Math.round((form?.height ? form.top : window.innerHeight) - pill.offsetHeight - 16));
        pill.style.top = `${want}px`;
        const off = Math.round(pill.getBoundingClientRect().top) - want;
        if (off) pill.style.top = `${want - off}px`;
    });
    place();
    // SillyTavern lays its message area out again once Pocket Tavern has stepped aside, and whenever it
    // grows (quick replies, a longer message): the pill follows.
    const form = document.querySelector(MESSAGE_FORM);
    if (form && typeof ResizeObserver === 'function') {
        watch = new ResizeObserver(place);
        watch.observe(form);
    }
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
}

export function hideBackPill() {
    watch?.disconnect();
    watch = null;
    if (place) {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place);
    }
    place = null;
    pill?.remove();
    pill = null;
}
