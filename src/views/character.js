// A character's page (DESIGN.md → Key screens → Character page): picture and name with ★ and ⋯, a short
// about, Chat · New chat · Edit, and every chat with them. Nothing changes until you pick something. On a
// phone it is a page pushed over Characters; on desktop it fills the panel beside the chat. Every action
// comes from the shell, which runs SillyTavern's own controls and functions.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { avatar } from '../ui/avatar.js';
import { button, iconButton } from '../ui/button.js';
import { chatRow, chatTitle, formatPreview, parseChatTime } from '../ui/chat-row.js';
import { emptyState } from '../ui/feedback.js';
import { listGroup, listRow } from '../ui/list.js';
import { tag } from '../ui/tag.js';
import { searchBox } from '../ui/field.js';
import { svgIcon } from '../ui/icons.js';

/** More chats than this get a filter field (DESIGN.md). */
const FILTER_FROM = 8;

const normalize = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * @typedef {object} CharacterInfo
 * @property {string} name (user data)
 * @property {string} picture the avatar's URL
 * @property {string} about creator's note or description, plain text (user data)
 * @property {boolean} favorite
 * @property {string} latest the file id of their latest chat
 * @property {string} creator who made the card (user data), or ''
 * @property {string} lorebook the lorebook linked to them (user data), or ''
 * @property {{ id: string, name: string }[]} tags their tags (names are user data)
 *
 * @param {object} actions supplied by the shell
 * @param {() => CharacterInfo | null} actions.character the character this page shows
 * @param {() => Promise<object[]>} actions.chats their chats from SillyTavern, newest first
 * @param {(fileId: string) => boolean} actions.isOpen this chat is the one open right now
 * @param {(fileId: string | null) => void} actions.chat opens their latest chat, or this one
 * @param {() => void} actions.newChat
 * @param {() => void} actions.edit
 * @param {() => void} actions.favorite toggles ★
 * @param {(button: HTMLElement) => void} actions.menu Export, Duplicate, Lorebooks, External media, Delete
 * @param {(name: string) => void} actions.openLorebook their lorebook's page in Lorebooks
 * @param {() => void} actions.pickLorebook link a lorebook to them
 * @param {(id: string) => void} actions.showTag Characters, showing only this tag
 * @returns {import('../shell/page.js').PageSpec}
 */
export function characterPage(actions) {
    return {
        title: 'Character',
        long: '',
        icon: 'user',
        /** The header shows the character's own name, never translated. */
        rawTitle: () => actions.character()?.name ?? '',
        render: body => {
            const who = actions.character();
            if (!who) {
                body.append(emptyState({ icon: 'user', text: 'This character is no longer here.' }));
                return;
            }

            // Who they are: picture, name with ★ and ⋯, and a few words about them.
            const star = iconButton({ icon: 'star', label: who.favorite ? 'Remove from favourites' : 'Add to favourites', onClick: actions.favorite });
            star.classList.toggle('pt-character-star--on', who.favorite);
            star.classList.add('pt-character-star');
            star.setAttribute('aria-pressed', String(who.favorite));
            const more = iconButton({ icon: 'ellipsis', label: 'More actions', onClick: event => actions.menu(event.currentTarget) });
            const name = h('div', { class: 'pt-character-name', role: 'heading', 'aria-level': '2', raw: who.name, dir: 'auto' });
            // Their picture, blurred and faded, as a soft wash of colour behind the top.
            const backdrop = who.picture ? h('div', { class: 'pt-character-backdrop', 'aria-hidden': 'true' }, [h('img', { src: who.picture, alt: '', decoding: 'async' })]) : null;
            const hero = h('div', { class: 'pt-character-hero' }, [
                backdrop,
                avatar({ name: who.name, src: who.picture, size: 96 }),
                h('div', { class: 'pt-character-head' }, [
                    h('div', { class: 'pt-character-title' }, [name, star, more]),
                    who.creator ? h('div', { class: 'pt-character-creator', dir: 'auto', raw: t('by {name}', { name: who.creator }) }) : null,
                ]),
            ]);
            body.append(hero);
            if (who.about) {
                const about = h('p', { class: 'pt-character-about', dir: 'auto' });
                about.append(formatPreview(who.about));
                const toggle = h('button', { type: 'button', class: 'pt-character-more pt-focus', text: 'More' });
                toggle.addEventListener('click', () => {
                    const open = about.classList.toggle('pt-character-about--open');
                    toggle.textContent = t(open ? 'Less' : 'More');
                });
                body.append(h('div', { class: 'pt-character-about-box' }, [about, toggle]));
                // "More" only when the text is really cut.
                requestAnimationFrame(safe('character page', () => { toggle.hidden = about.scrollHeight <= about.clientHeight + 1; }));
            }

            // What to do.
            body.append(h('div', { class: 'pt-character-actions' }, [
                button({ label: 'Chat', kind: 'primary', icon: 'chat', onClick: () => actions.chat(null) }),
                button({ label: 'New chat', icon: 'chat-plus', onClick: actions.newChat }),
                button({ label: 'Edit', icon: 'pencil', onClick: actions.edit }),
            ]));

            // What they are connected to: their lorebook (opens it in Lorebooks) and their tags (each opens
            // Characters showing only that tag).
            const links = [listRow({
                title: 'Lorebook',
                icon: 'book',
                end: 'picker',
                value: who.lorebook || t('None'),
                onClick: () => (who.lorebook ? actions.openLorebook(who.lorebook) : actions.pickLorebook()),
            })];
            body.append(listGroup({ rows: links }));
            if (who.tags.length) {
                body.append(h('section', { class: 'pt-character-tags' }, [
                    h('div', { class: 'pt-list-header', text: 'Tags' }),
                    h('div', { class: 'pt-character-tag-row' }, who.tags.map(item => tag({ rawLabel: item.name, onClick: () => actions.showTag(item.id) }))),
                ]));
            }

            // Every chat with them, newest first.
            const list = h('div', { class: 'pt-chats-rows' });
            const section = h('section', { class: 'pt-chats-section' }, [h('div', { class: 'pt-list-header', text: 'Chats' }), list]);
            body.append(section);
            list.append(h('p', { class: 'pt-chats-note', text: 'Loading chats…' }));
            let query = '';
            let chats = [];
            const draw = () => {
                const words = normalize(query).split(/\s+/).filter(Boolean);
                const shown = chats.filter(chat => !words.length || words.every(word => normalize(`${chatTitle(chat.file_name).text} ${chat.mes ?? ''}`).includes(word)));
                list.replaceChildren(...(shown.length ? shown.map(chat => {
                    const fileId = String(chat.file_id ?? chat.file_name).replace(/\.jsonl$/i, '');
                    return chatRow({
                        who: chatTitle(chat.file_name).text,
                        picture: svgIcon('chats', 'pt-character-chat-icon'),
                        fileName: '',
                        preview: chat.mes ?? '',
                        count: Number(chat.chat_items),
                        time: parseChatTime(chat.last_mes),
                        open: actions.isOpen(fileId),
                        onOpen: () => actions.chat(fileId),
                    });
                }) : [h('p', { class: 'pt-chats-note', text: chats.length ? 'Nothing matches that.' : 'No chats yet. Chat starts the first one.' })]));
            };
            actions.chats().then(found => {
                chats = found;
                if (chats.length > FILTER_FROM) {
                    section.insertBefore(searchBox({ placeholder: 'Filter chats', onSearch: value => { query = value; draw(); } }), list);
                }
                draw();
            }).catch(() => {
                list.replaceChildren(h('p', { class: 'pt-chats-note', text: 'Could not load the chats.' }));
            });
        },
    };
}
