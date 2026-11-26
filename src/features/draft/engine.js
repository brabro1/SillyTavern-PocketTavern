// The Draft helper's engine (DESIGN.md → The chat → Message box → Draft helper): the settings schema, the note that
// tells the model what to write, and the clean-up of what comes back. Built in from the Draft Enhancer extension
// (MIT, by the same author). Pure functions: the open chat is read through the context getter set by useContext().
// The note itself is written for the model, in English, and is never translated.

/** @type {() => any} SillyTavern's getContext(), set by the runtime (src/features/draft/draft.js). */
let ctx = () => globalThis.SillyTavern.getContext();

export function useContext(getter) {
    ctx = getter;
}

/* ------------------------------------------------------------------ */
/* Settings schema: the settings page and the defaults are built from it */
/* ------------------------------------------------------------------ */

export const SUBJECTS = [
    ['user', 'You (your persona)'],
    ['char', 'The character (their point of view and actions, never yours)'],
    ['narrator', 'Narrator (the scene, you and the character, or just the story)'],
];

/** Groups of settings: [title, fields]. Labels are Pocket Tavern's words (translated on the page). */
export const SECTIONS = [
    ['General', [
        { key: 'shortcuts', type: 'bool', def: true, label: 'Keyboard shortcuts', hint: 'Alt+E, Alt+W, Alt+C and Alt+Z in the message box.' },
        { key: 'actionBar', type: 'bool', def: true, label: 'Keep, Regenerate, Refine and Discard', hint: 'A bar above the message box after each result.' },
        { key: 'autoSend', type: 'bool', def: false, label: 'Send automatically', hint: 'Sends the result right away.' },
        { key: 'debug', type: 'bool', def: false, label: 'Log every request', hint: 'Writes each note and the raw reply to the browser console.' },
    ]],
    ['Writing', [
        { key: 'subject', type: 'select', def: 'user', label: 'Write as', options: SUBJECTS, hint: 'Whose turn the message is. The + menu can change it for each character.' },
        { key: 'length', type: 'select', def: 'flexible', label: 'Length', options: [['flexible', 'Flexible (fits your text)'], ['short', 'Short (30–80 words)'], ['medium', 'Medium (80–180 words)'], ['long', 'Long (180–350 words)'], ['custom', 'Custom range']] },
        { key: 'lengthMin', type: 'number', def: 60, label: 'Fewest words', min: 10, max: 2000, step: 10, showIf: s => s.length === 'custom' },
        { key: 'lengthMax', type: 'number', def: 160, label: 'Most words', min: 10, max: 3000, step: 10, showIf: s => s.length === 'custom' },
        { key: 'pov', type: 'select', def: 'auto', label: 'Point of view', options: [['auto', 'Follow the chat'], ['first', 'First person (I)'], ['second', 'Second person (you)'], ['third', 'Third person (he, she, they)']] },
        { key: 'format', type: 'select', def: 'auto', label: 'Formatting', options: [['auto', 'Follow the chat'], ['asterisks', '*Actions* and "dialogue"'], ['plain', 'Plain prose and "dialogue"'], ['dialogue', 'Dialogue only']] },
        { key: 'language', type: 'select', def: 'auto', label: 'Language', options: [['auto', 'Same as what I typed'], ['chat', 'Same as the chat'], ['custom', 'One I name']] },
        { key: 'languageName', type: 'text', def: '', label: 'Language name', placeholder: 'e.g. English', showIf: s => s.language === 'custom' },
        { key: 'faithfulness', type: 'select', def: 'balanced', label: 'Enhance: faithfulness', options: [['strict', 'Strict (only wording and detail)'], ['balanced', 'Balanced (small supporting beats)'], ['creative', 'Creative (develop the idea)']] },
        { key: 'tone', type: 'select', def: 'auto', label: 'Tone', options: [['auto', 'Follow the chat'], ['warm', 'Warm and gentle'], ['romantic', 'Romantic'], ['playful', 'Playful and teasing'], ['tense', 'Tense'], ['dark', 'Dark and serious'], ['calm', 'Calm and reflective'], ['angry', 'Angry']] },
        { key: 'rememberSubject', type: 'bool', def: true, label: 'Remember "Writing as" for each character' },
        { key: 'voiceMatch', type: 'bool', def: true, label: 'Match the writing voice', hint: 'Sends a few recent messages from that side as a style sample.' },
        { key: 'parenDirections', type: 'bool', def: true, label: '(Parentheses) and [brackets] are directions', hint: 'Not words to write.' },
        { key: 'anchor', type: 'bool', def: true, label: 'Continue exactly where the chat stopped', hint: 'Sends the last message again, right next to the task.' },
        { key: 'noRepeat', type: 'bool', def: true, label: 'Do not repeat recent messages' },
        { key: 'endOpen', type: 'bool', def: true, label: 'Stop where the other side would answer' },
    ]],
    ['Model compatibility', [
        { key: 'profile', type: 'profile', def: '', label: 'Connection profile for drafting', hint: 'Draft with another API or model from the Connection Manager. Your connection is switched back afterwards.' },
        { key: 'instructionStyle', type: 'select', def: 'full', label: 'Instruction style', options: [['full', 'Full (large models)'], ['compact', 'Compact (small or local models)']] },
        { key: 'retries', type: 'number', def: 1, label: 'Retries on an empty result', min: 0, max: 3, step: 1 },
        { key: 'presetGuard', type: 'bool', def: true, label: "Skip the preset's end-of-reply extras", hint: 'No trackers, status blocks or suggestions, and no preset rules about who may be written.' },
        { key: 'liveClean', type: 'bool', def: true, label: 'Clean the text while it streams in' },
        { key: 'emptyToWrite', type: 'bool', def: true, label: 'With an empty box, write something for me' },
        { key: 'trimUnfinished', type: 'bool', def: true, label: 'Cut a reply stopped mid-sentence back to its last full sentence' },
    ]],
    ['Instructions', [
        { key: 'notesEnhance', type: 'area', def: '', label: 'Your notes for Enhance my draft', placeholder: 'e.g. Keep sentences short.' },
        { key: 'notesWrite', type: 'area', def: '', label: 'Your notes for Write and Continue', placeholder: 'e.g. Keep my character guarded and sarcastic.' },
        { key: 'templateEnhance', type: 'area', def: '', label: 'Your own instruction for Enhance (advanced)', fill: 'enhance', placeholder: 'Empty uses the built-in one. Macros: {{draft}} {{rules}} {{notes}} {{subject}} {{other}} {{min}} {{max}} {{last}}, and SillyTavern’s own such as {{user}}.' },
        { key: 'templateWrite', type: 'area', def: '', label: 'Your own instruction for Write (advanced)', fill: 'write', placeholder: 'Empty uses the built-in one. Macros: {{direction}} {{rules}} {{notes}} {{subject}} {{other}} {{min}} {{max}} {{last}}, and SillyTavern’s own.' },
    ]],
    ['Clean-up', [
        { key: 'cleanReasoning', type: 'bool', def: true, label: 'Remove reasoning blocks', hint: '<think>, <checklist> and similar.' },
        { key: 'cleanHeaders', type: 'bool', def: true, label: 'Remove scene headers', hint: '[ time | day | place ]' },
        { key: 'cleanPanels', type: 'bool', def: true, label: 'Remove status and tracker panels', hint: '<details>, <tracker>, <svt> and similar.' },
        { key: 'cleanHtml', type: 'bool', def: true, label: 'Remove any other HTML tags' },
        { key: 'cleanPreamble', type: 'bool', def: true, label: 'Remove chatty lead-ins and trailing notes', hint: '"Sure, here is…"' },
        { key: 'cleanCustom', type: 'area', def: '', label: 'Also remove', placeholder: 'One regular expression per line, e.g. /^\\[OOC:[^\\]]*\\]\\s*/gm' },
    ]],
];

export const FIELDS = SECTIONS.flatMap(([, fields]) => fields);
// subjectByChat is not on the page: the + menu fills it ("Writing as" per character or group).
export const DEFAULTS = { ...Object.fromEntries(FIELDS.map(f => [f.key, f.def])), subjectByChat: {} };

/** Refine choices: [id, label, the change for the model]. */
export const REFINES = [
    ['shorter', 'Shorter', 'Make it noticeably shorter, about half the length, keeping the key beats.'],
    ['longer', 'Longer', 'Make it longer, about one and a half times, with more detail and beats, without moving the story further than it already goes.'],
    ['dialogue', 'More dialogue', 'Give it more spoken dialogue, in character.'],
    ['detail', 'More detail', 'Add more sensory and descriptive detail.'],
    ['emotion', 'More emotion', 'Show more emotion and inner feeling.'],
    ['simpler', 'Simpler wording', 'Use simpler, plainer wording.'],
];

const KIND_TITLES = { enhance: 'Enhance my draft', write: 'Write something for me', continue: 'Continue my draft', refine: 'Refine my message' };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const words = text => (String(text || '').match(/\S+/g) || []).length;
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const num = (value, def) => (Number.isFinite(Number(value)) ? Number(value) : def);

/** Chat messages that are part of the story, oldest first. */
const storyMessages = () => (ctx().chat || []).filter(m => m && !m.is_system && String(m.mes || '').trim());

/* ------------------------------------------------------------------ */
/* Writing as: you, a character, or the narrator                       */
/* ------------------------------------------------------------------ */

/** Members of the open group chat, as characters. */
export function groupMembers() {
    const c = ctx();
    const group = c.groupId ? (c.groups || []).find(g => String(g.id) === String(c.groupId)) : null;
    return (group?.members || []).map(avatar => (c.characters || []).find(ch => ch.avatar === avatar)).filter(Boolean);
}

/** Every "Writing as" choice for the open chat: you, the character (or each group member), the narrator. */
export function subjectChoices() {
    const members = groupMembers();
    return ['user', ...(members.length ? members.map(m => `member:${m.avatar}`) : ['char']), 'narrator'];
}

/** The key "Writing as" is remembered under: the character or the group. */
export function chatKey() {
    const c = ctx();
    if (c.groupId) return `group:${c.groupId}`;
    const avatar = c.characters?.[c.characterId]?.avatar;
    return avatar ? `char:${avatar}` : null;
}

/** The "Writing as" choice for the open chat. */
export function currentSubject(s) {
    const key = chatKey();
    const saved = s.rememberSubject && key ? s.subjectByChat?.[key] : null;
    if (saved && subjectChoices().includes(saved)) return saved;
    return s.subject === 'char' && groupMembers().length ? 'char' : s.subject;
}

/** Turns what a slash command typed (user, char, narrator, or a group member's name) into a subject. */
export function parseSubject(value) {
    const v = String(value || '').trim();
    if (!v) return null;
    if (['user', 'char', 'narrator'].includes(v.toLowerCase())) return v.toLowerCase();
    if (v.startsWith('member:')) return subjectChoices().includes(v) ? v : null;
    const member = groupMembers().find(m => m.name.toLowerCase() === v.toLowerCase());
    return member ? `member:${member.avatar}` : null;
}

/** Who the message belongs to, and who must be left alone. */
export function roles(subject = 'user') {
    const c = ctx();
    const user = c.name1 || 'User';
    let char = c.name2 || 'the character';
    if (String(subject).startsWith('member:')) {
        char = groupMembers().find(m => `member:${m.avatar}` === subject)?.name || char;
        subject = 'char';
    }
    if (subject === 'char') return { mode: 'char', who: char, other: user, piece: 'message', user, char };
    if (subject === 'narrator') return { mode: 'narrator', who: 'the narrator', other: user, piece: 'passage', user, char };
    return { mode: 'user', who: user, other: char, piece: 'message', user, char };
}

/* ------------------------------------------------------------------ */
/* The task note                                                       */
/* ------------------------------------------------------------------ */

const LENGTHS = { short: [30, 80], medium: [80, 180], long: [180, 350] };

/** Target word range. Flexible scales with your draft, or with how long that side of the chat usually writes. */
function lengthRange(kind, draftWords, s, r) {
    let lo;
    let hi;
    if (s.length === 'custom') {
        lo = num(s.lengthMin, 60);
        hi = Math.max(num(s.lengthMax, 160), lo + 20);
    } else if (LENGTHS[s.length]) {
        [lo, hi] = LENGTHS[s.length];
    } else if (kind === 'enhance') {
        const d = draftWords;
        if (d < 15) [lo, hi] = [50, 120]; // a line or two: grow it into a full message
        else if (d < 60) [lo, hi] = [d * 1.6, d * 2.6]; // a short paragraph: about double
        else [lo, hi] = [d * 1.1, d * 1.6]; // already detailed: polish, little padding
    } else {
        const recent = storyMessages().filter(m => !!m.is_user === (r.mode === 'user')).slice(-4);
        const avg = recent.length ? recent.reduce((n, m) => n + words(clean(m.mes, CLEAN_ALL)), 0) / recent.length : 0;
        [lo, hi] = avg ? [Math.max(30, avg * 0.8), Math.max(90, avg * 1.6)] : [60, 150];
    }
    if (kind === 'continue') [lo, hi] = [Math.max(20, lo - draftWords), Math.max(40, hi - draftWords)]; // only the added part
    if (kind === 'enhance') lo = Math.max(lo, draftWords); // never shorter than the draft
    hi = Math.max(hi, lo * 1.15, lo + 20);
    return [Math.round(lo), Math.round(clamp(hi, 40, 2000))];
}

const FAITH = {
    strict: 'Change only the wording and the level of detail. Add no action, decision or line of dialogue that the draft does not already contain.',
    balanced: 'Keep every action, decision and line of dialogue from the draft, in the same order. Small supporting beats (a gesture, a glance, a reaction to the surroundings) are fine; nothing that changes what happens.',
    creative: 'Treat the draft as a skeleton: keep its intent and its key beats, and develop them with richer detail, dialogue and inner thought, as long as nothing contradicts the draft.',
};

const POV = {
    first: 'Write in the first person ("I", "me").',
    second: 'Write in the second person ("you").',
    third: 'Write in the third person (he / she / they).',
};

const FORMAT = {
    asterisks: 'Formatting: actions, narration and thoughts in *single asterisks*, spoken words in "double quotes".',
    plain: 'Formatting: plain prose paragraphs with spoken words in "double quotes". No asterisks.',
    dialogue: 'Write spoken dialogue only, with no narration or action lines.',
};

const TONE = {
    warm: 'warm and gentle', romantic: 'romantic', playful: 'playful and teasing', tense: 'tense',
    dark: 'dark and serious', calm: 'calm and reflective', angry: 'angry',
};

const HAS_DIRECTION = /\([^()\n]{2,}\)|\[[^[\]\n]{2,}\]/;

/**
 * The rules from the settings. Only rules that say something are included; `core` marks the ones the compact
 * instruction style keeps. `extra.selection` narrows Enhance to a part of the message.
 */
function buildRules(kind, text, s, r, extra = {}) {
    const fromText = kind === 'enhance' || kind === 'continue' || kind === 'refine'; // the player's text sets the style
    let [lo, hi] = lengthRange(kind, words(text), s, r);
    if (extra.selection) [lo, hi] = [words(text), Math.max(words(text) * 2, words(text) + 20)];
    const rules = [];
    const add = (rule, core = false) => rules.push({ text: rule, core });
    const neverUser = `Never write ${r.user}'s actions, words, thoughts or reactions; ${r.char} can only react to what ${r.user} has already done in the chat.`;

    if (kind === 'enhance') add(FAITH[s.faithfulness] || FAITH.balanced, true);
    if (r.mode === 'user') {
        add(fromText
            ? `If the text already says what ${r.other} does or says, keep that as written. Otherwise do not write for ${r.other}.`
            : `Write only ${r.who}. Leave ${r.other}'s words and actions to ${r.other}.`, true);
    } else if (r.mode === 'char') {
        add(`Write only ${r.char}: their own actions, words, thoughts and feelings, as ${r.char} would have them in this moment. ${neverUser}`, true);
    } else if (fromText) {
        add(`Keep everything the text says about ${r.user} and ${r.char} as written, and add nothing it does not imply.`, true);
    } else {
        add(`Narrate this moment as an outside storyteller. Decide from the direction and the recent messages what it needs: it may show what both ${r.user} and ${r.char} do and say in the scene (and any side characters), or it may only narrate the setting, the atmosphere and the events, without either of them acting.`, true);
    }

    if (s.presetGuard) {
        add("This is one message written for the player. Skip any tracker, status or state block, notes, summary, suggestions, options or other extra that the preset asks for at the end of replies, and ignore preset rules about who you may write for or what the player's role is (roleplay, director or persona modes): this task decides that.", true);
    }
    if (s.parenDirections && kind !== 'refine' && HAS_DIRECTION.test(text)) {
        add('Text in (parentheses) or [square brackets] is a direction to you, not words to write: follow it and leave the brackets out of the result.', true);
    }

    if (POV[s.pov]) add(POV[s.pov], true);
    else if (fromText) add("Keep the text's point of view and tense.");
    else if (r.mode === 'char') add(`Write from ${r.char}'s own point of view and in their voice, in the same person and tense as ${r.char}'s earlier messages.`, true);
    else if (r.mode === 'narrator') add('Narrate in the third person, as an outside storyteller, and keep the tense of the recent messages.', true);
    else add('Follow the point of view and tense of the recent messages.');

    if (FORMAT[s.format]) add(FORMAT[s.format], true);
    else if (fromText) add("Keep the text's formatting style.");

    if (TONE[s.tone]) add(`Tone: ${TONE[s.tone]}.`, true);

    const langName = String(s.languageName || '').trim();
    if (s.language === 'custom' && langName) add(`Write in ${langName}.`, true);
    else if (s.language === 'chat') add('Write in the language used in this chat.', true);
    else if (fromText) add('Write in the same language as the text.', true);

    if (kind === 'refine') {
        // the change decides the length
    } else if (extra.selection) {
        add(`Length: roughly ${lo}-${hi} words, so it still fits between the text around it.`, true);
    } else if (kind === 'continue') {
        add(`Length of the part you add: roughly ${lo}-${hi} words.`, true);
    } else if (s.length !== 'flexible') {
        add(`Length: about ${lo}-${hi} words.`, true);
    } else if (kind === 'enhance') {
        add(`Length: as long as the draft's content needs, roughly ${lo}-${hi} words. A short draft becomes a full message; a detailed one is polished without padding.`, true);
    } else {
        add(`Length: as long as this moment needs, roughly ${lo}-${hi} words.`, true);
    }

    if (s.noRepeat) add('Do not repeat wording or descriptions from the recent messages.');
    if (s.endOpen && !extra.selection) add(`Stop where ${r.mode === 'user' ? r.other : r.user} would answer, leaving the turn open.`, true);
    return { rules, lo, hi };
}

/**
 * The last message of the chat. Big presets put pages of instructions between the chat history and the end of the
 * prompt, so the model can lose the thread; repeating it next to the task keeps the message on the current moment.
 */
function lastBeat(r, max) {
    const msg = storyMessages().pop();
    let text = msg ? clean(msg.mes, CLEAN_ALL) : '';
    if (!text) return null;
    if (text.length > max) text = `…${text.slice(-max).replace(/^\S*\s/, '')}`; // the end matters most
    const speaker = msg.name || (msg.is_user ? r.user : r.char);
    const yours = r.mode === 'user' ? !!msg.is_user : r.mode === 'char' && !msg.is_user && speaker === r.char;
    return { text, speaker, yours };
}

/** A few recent messages from the side being written, so the result keeps its voice. */
function voiceSample(r) {
    if (r.mode === 'narrator') return '';
    const fromUser = r.mode === 'user';
    const side = storyMessages().filter(m => !!m.is_user === fromUser);
    const own = fromUser ? side : side.filter(m => m.name === r.char);
    const parts = (own.length ? own : side)
        .slice(-3)
        .map(m => clean(m.mes, CLEAN_ALL))
        .filter(x => words(x) >= 4)
        .map(x => (x.length > 450 ? `${x.slice(0, 450).replace(/\s+\S*$/, '')}…` : x));
    if (!parts.length) return '';
    const how = fromUser ? `How ${r.user} usually writes` : `How ${r.char} usually speaks and acts`;
    return `${how} (match this voice and habits, never copy the content):\n<voice>\n${parts.join('\n---\n')}\n</voice>`;
}

/** Lines that tell the model whose turn this is. */
function buildHeader(kind, r) {
    const title = KIND_TITLES[kind];
    if (r.mode === 'user') return [`[${title}: this is ${r.user}'s own message, written for the player.]`];
    if (r.mode === 'char') {
        return [
            `[${title}: this turn the player writes ${r.char}.]`,
            `The player is taking over ${r.char} for this one message. It is sent from ${r.user}'s message box, but it is ${r.char}'s own turn: ${r.char}'s point of view, actions, words and thoughts, written in the style of this story. It must not contain anything ${r.user} does, says or thinks. For this message only, any instruction to write only ${r.user}, or never to write as ${r.char}, does not apply.`,
        ];
    }
    return [
        `[${title}: this turn the player is the narrator.]`,
        `The player is narrating for this one message. It is sent from ${r.user}'s message box, but it is told by an outside storyteller. Depending on what the moment needs, it can cover both ${r.user} and ${r.char} in the scene, side characters and the surroundings, or only narrate the setting and the events. For this message only, any instruction to write only ${r.user} does not apply.`,
    ];
}

function anchorLines(kind, beat) {
    if (!beat) return [];
    return [
        `The story has stopped here. The last message in the chat, from ${beat.speaker}:`,
        `<last_message>\n${beat.text}\n</last_message>`,
        beat.yours
            ? 'That message is already part of the story and is not repeated. The new message follows directly after it, in the same scene, place and moment: do not restart the scene, recap, or jump ahead in time.'
            : 'The new message follows directly after it, in the same scene, place and moment, as the reply to what it just did or said. Do not restart the scene, recap, contradict it, or jump ahead in time.',
        ...(kind === 'write' ? [] : ["Use it for continuity only: the player's text decides what happens."]),
    ];
}

/** What the model is asked to do with the player's text. */
function taskLines(kind, text, r, extra) {
    if (kind === 'refine') {
        return [`The current version of the ${r.piece}:`, `<message>\n${text}\n</message>`, `Revise it. ${extra.instruction} Keep everything else: what happens, who does what, point of view, tense, formatting and language.`];
    }
    if (kind === 'continue') {
        return [
            `The player started this ${r.piece} and wants you to finish it:`, `<draft>\n${text}\n</draft>`,
            'Write only what comes next, continuing from exactly where the draft stops, even mid-sentence. Do not repeat or rewrite the draft.',
        ];
    }
    if (kind === 'enhance' && extra.selection) {
        const { before, after } = extra.selection;
        return [
            `The player is rewriting one part of their ${r.piece}.`,
            before.trim() && `Text before the part (keep as is):\n<before>\n${before.trim()}\n</before>`,
            `The part to rewrite:\n<draft>\n${text}\n</draft>`,
            after.trim() && `Text after the part (keep as is):\n<after>\n${after.trim()}\n</after>`,
            'Rewrite only the part, so it reads naturally between the text around it. Output only the rewritten part.',
        ].filter(Boolean);
    }
    if (kind === 'enhance') {
        return ['The player drafted this:', `<draft>\n${text}\n</draft>`, `Rewrite it into the finished ${r.piece}, following your instructions and the style of this story.`];
    }
    return [text ? `Follow the player's direction closely:\n<direction>\n${text}\n</direction>` : ''];
}

/**
 * The note added as the last message. It says only what the preset cannot know: the task, your text, the rules from
 * your settings and your notes. Everything else comes from the preset.
 */
export function buildNote(kind, text, s, extra = {}) {
    const r = roles(extra.subject ?? s.subject);
    const { rules, lo, hi } = buildRules(kind, text, s, r, extra);
    const notes = String((kind === 'enhance' ? s.notesEnhance : kind === 'refine' ? '' : s.notesWrite) || '').trim();
    const custom = String((kind === 'enhance' && !extra.selection ? s.templateEnhance : kind === 'write' ? s.templateWrite : '') || '').trim();

    if (custom) {
        const map = {
            draft: text, direction: text, notes, subject: r.who, other: r.other, min: String(lo), max: String(hi),
            rules: rules.map(x => `- ${x.text}`).join('\n'),
            last: lastBeat(r, 900)?.text ?? '',
        };
        return ctx().substituteParams(custom.replace(/\{\{(\w+)\}\}/g, (whole, key) => (key in map ? map[key] : whole)));
    }

    if (s.instructionStyle === 'compact') {
        const who = r.mode === 'narrator' ? "the narrator's" : `${r.who}'s`;
        const beat = s.anchor && lastBeat(r, 450);
        const opening = {
            enhance: `Rewrite this draft as ${who} finished ${r.piece}, in the style of this story:`,
            write: `Write ${who} next ${r.piece}${text ? ', following this direction:' : ', continuing naturally from the last message.'}`,
            continue: `Finish ${who} ${r.piece}: write only what comes after this draft, from exactly where it stops.`,
            refine: `Revise ${who} ${r.piece}. ${extra.instruction} Keep everything else the same.`,
        }[kind];
        const tag = { enhance: 'draft', write: 'direction', continue: 'draft', refine: 'message' }[kind];
        return [
            opening,
            beat && `Story so far ends with this message from ${beat.speaker}; continue directly from it, same scene and moment:\n<last_message>\n${beat.text}\n</last_message>`,
            extra.selection && 'Only this part of the message is rewritten; output only the rewritten part.',
            text && `<${tag}>\n${text}\n</${tag}>`,
            rules.filter(x => x.core).map(x => x.text).join(' '),
            notes && `Notes: ${notes}`,
            `Output only the ${extra.selection ? 'rewritten part' : kind === 'continue' ? 'new part' : r.piece} itself.`,
        ].filter(Boolean).join('\n');
    }

    const beat = s.anchor ? lastBeat(r, 900) : null;
    return [
        ...buildHeader(kind, r),
        ...anchorLines(kind, beat),
        ...taskLines(kind, text, r, extra),
        kind === 'write' && !text && !beat && 'Continue naturally from the last message.',
        rules.map(x => `- ${x.text}`).join('\n'),
        s.voiceMatch && kind !== 'refine' && voiceSample(r),
        notes && `Player's notes: ${notes}`,
        `Output only the ${extra.selection ? 'rewritten part' : kind === 'continue' ? 'new part' : r.piece} itself: no scene header, status block, notes or reasoning.`,
    ].filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ */
/* Cleaning the result                                                 */
/* ------------------------------------------------------------------ */

const CLEAN_ALL = { cleanReasoning: true, cleanHeaders: true, cleanPanels: true, cleanHtml: true };

const THINK = 'think|thinking|reasoning|thought|thoughts|checklist|cot|analysis|planning|internal_monologue';
// Panels and trackers that presets ask for at the end of every reply. The short names (dy, ob, cs, ...) are the
// mini-tags of tag trackers such as <svt>, <trk> and <bst>; their content goes too, not only the tags.
const TRACKERS = 'tracker|trackers|svt|trk|bst|world_activity|money_tracker|inventory|subtext|objective_tracker|plot_director|brainstormer|trope_spotter|chaos_suggester|plot_threads|narrative_mode|director_notes|story_notes';
const TRACKER_TAGS = 'dy|ob|ph|in|at|wl|hg|th|ai|cs|lc|tm|wx|bg|ch|sx|dt';
const PANELS = `details|summary|internal_states|internal_state|status|stats|style|script|table|ooc|${TRACKERS}|${TRACKER_TAGS}`;
const reThinkPair = new RegExp(`<(${THINK})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
const reThinkBefore = new RegExp(`^[\\s\\S]*?<\\/(${THINK})>`, 'i'); // reasoning whose opening tag was a prefill
const reThinkOpen = new RegExp(`<(${THINK})\\b[^>]*>[\\s\\S]*$`, 'i'); // reasoning cut off at the end
const rePanelPair = new RegExp(`<(${PANELS})\\b[^>]*>(?:(?!<(?:${PANELS})\\b)[\\s\\S])*?<\\/\\1\\s*>`, 'gi'); // innermost
const rePanelOpen = new RegExp(`<(${PANELS})\\b[\\s\\S]*$`, 'i'); // a panel cut off at the end
// Tags that are ordinary formatting in a message; any other tag-wrapped block at the very end is an extra.
const KEEP_TAGS = new Set('a b i u s em strong span p br hr sub sup small big mark del ins ul ol li blockquote code pre font center q cite'.split(' '));

/** Turns "/pattern/flags" (or a bare pattern) into a RegExp, or null. */
function parseRegex(line) {
    const text = String(line).trim();
    if (!text) return null;
    try {
        const m = text.match(/^\/(.*)\/([gimsuy]*)$/s);
        return m ? new RegExp(m[1], m[2] || 'g') : new RegExp(text, 'g');
    } catch (error) {
        console.warn('[Pocket Tavern]', 'Draft helper: a clean-up pattern is not valid:', text, error);
        return null;
    }
}

/**
 * Presets differ in how they ask for trackers and notes, but the extras always come at the very end, wrapped in their
 * own tag. Removes such blocks, whatever their name, unless the tag is ordinary formatting.
 */
function stripTrailingBlocks(text) {
    let t = text.trimEnd();
    for (let i = 0; i < 6; i++) {
        const m = t.match(/<\/([a-z][\w-]*)\s*>$/i);
        if (!m || KEEP_TAGS.has(m[1].toLowerCase())) break;
        const start = t.search(new RegExp(`<${m[1]}\\b[^>]*>(?![\\s\\S]*<${m[1]}\\b)`, 'i')); // its last opening tag
        const before = start > 0 ? t.slice(0, start).trimEnd() : '';
        if (!before) break; // the whole message is that block: leave it to the other steps
        t = before;
    }
    return t;
}

/** Removes reasoning, preset extras and wrapper noise, according to the clean-up settings. */
export function clean(raw, s) {
    let t = String(raw ?? '');
    if (s.cleanReasoning) t = t.replace(reThinkPair, '').replace(reThinkBefore, '').replace(reThinkOpen, '');
    t = t.trim().replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '');
    if (s.cleanPanels) {
        t = t.replace(/<!--[\s\S]*?-->/g, '');
        for (let i = 0, prev; i < 20 && prev !== t; i++) {
            prev = t;
            t = t.replace(rePanelPair, '');
        }
        t = stripTrailingBlocks(t.replace(rePanelOpen, '').replace(/^[ \t]*💰[^\n]*$/gmu, '')); // "💰 Currency: 20" lines
    }
    if (s.cleanHtml) t = t.replace(/<\/?[a-z][\w-]*(?:\s[^<>]*)?\/?>/gi, '');
    if (s.cleanHeaders) t = t.replace(/^\s*\[[^\]\n]*\|[^\]\n]*\|[^\]\n]*\]\s*$/gm, '');
    for (const line of String(s.cleanCustom || '').split('\n')) {
        const re = parseRegex(line);
        if (re) t = t.replace(re, '');
    }
    t = t.replace(/<\/?(draft|direction|voice|last_message|message|before|after)>/gi, '');
    if (s.cleanPreamble) {
        t = t
            .replace(/^\s*\(answer\)[ \t]*\n?/i, '') // placeholder some reasoning templates end with
            .replace(/^\s*(?:sure|certainly|of course|okay|ok|alright|here(?:'s| is| are))\b[^\n]{0,160}:[ \t]*\n+/i, '')
            .replace(/\n+[ \t]*[[(*_]*(?:note|word count|author'?s note|n\.b\.)\s*[:：][^\n]*$/i, '');
    }
    t = t.replace(/^\s*(?:\*\*)?(?:rewritten|enhanced|revised|final|continuation)(?: (?:message|draft|reply|version|part))?(?:\*\*)?\s*:\s*(?:\*\*)?/i, '');
    const { user, char } = roles();
    for (const n of [user, char]) t = t.replace(new RegExp(`^\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i'), '');
    return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The same clean-up for text that is still streaming in: a half-written tag at the end is hidden too. */
export const cleanPartial = (raw, s) => clean(String(raw ?? '').replace(/<[^>\n]*$/, ''), s);

/**
 * A reply that hit the token limit stops mid-sentence. Cuts it back to the last full sentence, but only when the
 * unfinished tail is a small part of the text (at most 20%).
 */
export function trimUnfinished(value) {
    const text = String(value || '').trimEnd();
    if (!/[\p{L}\p{N},;:\-–—]$/u.test(text)) return text; // ends in punctuation, a marker or an emoji: looks finished
    const m = [...text.matchAll(/[.!?…]+[*_"'”’»)\]]*(?=\s|$)/g)].pop();
    if (!m) return text;
    const cut = m.index + m[0].length;
    return cut >= text.length * 0.8 ? text.slice(0, cut).trimEnd() : text;
}

/**
 * Joins the player's draft and the part the model added. When the model wrote the whole message again, draft
 * included (often with its own formatting, such as *asterisks*), its version is used as it is.
 */
export function joinContinuation(draft, added) {
    const letters = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (letters(draft) && letters(added).startsWith(letters(draft))) return added;
    const rest = added.replace(/^[ \t]+/, '');
    if (!rest) return draft;
    const glue = /\s$/.test(draft) || /^[\s,.;:!?…'"’”)\]]/.test(rest) ? '' : ' ';
    return draft + glue + rest;
}

/** Puts a result back together with what stayed in the box: the draft for Continue, the text around a selection. */
export function assemble(run, result) {
    if (run.kind === 'continue') return joinContinuation(run.text, result);
    if (run.selection) return run.selection.before + run.selection.lead + result + run.selection.trail + run.selection.after;
    return result;
}

/**
 * Removes the preset's impersonation prompt ("write as {{user}}, never as {{char}}") from an assembled prompt. Used
 * only when writing as a character or the narrator, where it says the opposite of the task.
 */
export function stripImpersonationPrompt(messages) {
    const c = ctx();
    const needle = String(c.substituteParams(String(c.chatCompletionSettings?.impersonation_prompt || ''))).trim();
    if (!needle) return;
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (typeof m?.content !== 'string' || !m.content.includes(needle)) continue;
        m.content = m.content.split(needle).join('').trim();
        if (!m.content) messages.splice(i, 1);
    }
}
