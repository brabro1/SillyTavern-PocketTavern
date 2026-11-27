// Sharp pictures and animated (GIF) character pictures (Settings → Pocket Tavern → Sharp pictures, Animated pictures):
// avatars are shown from the full picture scaled to their size instead of SillyTavern's small thumbnail, and a
// character can have an animated picture, kept beside its card. Every callback handed to the browser goes through
// safe() (AGENTS.md → Rules, 10).
import { t } from '../core/i18n.js';
import { safe } from '../core/lifecycle.js';
import { CHARACTER_LIST, CHAT, FAVORITES_ROW } from '../st/selectors.js';

const LOG = '[Pocket Tavern]';
const SOURCE = 'pictures';

/**
 * @type {{ active: () => boolean, settings: () => object, context: () => any, icon: Function, isShown: (element: Element | null) => boolean, shell: () => any } | null}
 */
let deps = null;

export function setupPictures(supplied) {
    deps = supplied;
}

/**
 * SillyTavern shows 96×144 thumbnails everywhere; on a phone a grid card needs
 * about four times that. Pictures on screen are replaced by the original image,
 * scaled down in the browser to exactly the size the screen needs (so memory
 * stays low), and characters can have an animated GIF/WebP picture.
 */
const GIF_KEY = 'pt_animated_avatar';
const pictures = {
    observer: null,
    seen: null,
    cache: new Map(),
    pending: new Map(),
    queue: [],
    running: 0,
    timer: 0,
    // Pictures the on-screen watcher reported as (nearly) on screen.
    near: new Set(),
    // New sources waiting to be put in, all in one frame.
    swaps: new Map(),
    swapFrame: 0,
    // Elements added since the last frame, scanned together.
    added: new Set(),
    addedFrame: 0,
    // The picture last shown in each kind of spot ("grid|avatar|Aria.png" → url).
    last: new Map(),
    // Animated picture links that failed to load (the file was deleted, or the
    // card came from someone else's SillyTavern), and characters whose sharp
    // picture failed. Those show SillyTavern's thumbnail instead.
    broken: new Set(),
    noSharp: new Set(),
};

/** Which kind of spot a picture sits in; pictures in the same kind of spot have the same size. */
function pictureSpot(img) {
    if (img.closest(CHARACTER_LIST)) return document.body.classList.contains('charListGrid') ? 'grid' : 'list';
    if (img.closest(FAVORITES_ROW)) return 'fav';
    if (img.closest(CHAT)) return 'chat';
    return null;
}

function rememberPicture(img, url) {
    const spot = pictureSpot(img);
    const info = img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null;
    if (spot && info) pictures.last.set(`${spot}|${info.type}|${info.file}`, url);
}

/**
 * SillyTavern redraws its lists from scratch, with thumbnails. When this spot
 * already showed a sharp picture, put it straight back (this runs before the
 * page is drawn), so nothing flashes from blurry to sharp.
 */
const PICTURE_CACHE_LIMIT = 160;

function restoreKnownPicture(img) {
    const src = img.getAttribute('src') ?? '';
    const info = thumbInfo(src);
    const spot = info && pictureSpot(img);
    const url = spot && pictures.last.get(`${spot}|${info.type}|${info.file}`);
    if (!url) return false;
    if (url.startsWith('blob:') && !deps.settings().sharpPictures) return false;
    if (!url.startsWith('blob:') && !deps.settings().animatedPictures) return false;
    img.dataset.ptThumb = src;
    img.setAttribute('src', url);
    return true;
}

/**
 * Puts in new picture sources together, so the page restyles once and a list
 * turns sharp in one go instead of picture by picture. Pictures made within
 * about 100 ms of each other go in on the same frame.
 */
function swapPicture(img, url) {
    if (!deps.active() || !deps.settings().sharpPictures) return;
    pictures.swaps.set(img, url);
    if (pictures.swapFrame || pictures.swapTimer) return;
    pictures.swapTimer = window.setTimeout(safe(SOURCE, () => {
        pictures.swapTimer = 0;
        pictures.swapFrame = requestAnimationFrame(safe(SOURCE, () => {
            pictures.swapFrame = 0;
            if (!deps.active() || !deps.settings().sharpPictures || !pictures.swaps.size) {
                pictures.swaps.clear();
                return;
            }
            const swaps = [...pictures.swaps];
            pictures.swaps.clear();
            for (const [image, src] of swaps) {
                if (image.isConnected && (image.getAttribute('src') === image.dataset.ptThumb || thumbInfo(image.getAttribute('src') ?? ''))) {
                    image.setAttribute('src', src);
                    rememberPicture(image, src);
                }
            }
        }));
    }), 100);
}

function thumbInfo(src) {
    try {
        const url = new URL(src, location.href);
        if (!url.pathname.endsWith('/thumbnail')) return null;
        const type = url.searchParams.get('type');
        const file = url.searchParams.get('file');
        if (!file || !['avatar', 'persona'].includes(type)) return null;
        return { type, file };
    } catch {
        return null;
    }
}

function animatedPictureFor(file) {
    const character = (deps.context().characters ?? []).find(item => item.avatar === file);
    const url = character?.data?.extensions?.[GIF_KEY];
    // Only allow local server paths (never external URLs or protocol-relative // links from imported cards).
    return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !pictures.broken.has(url) ? url : null;
}

function fullPictureUrl({ type, file }) {
    return type === 'persona' ? `/User Avatars/${encodeURIComponent(file)}` : `/characters/${encodeURIComponent(file)}`;
}

/** The original picture scaled to `width` pixels, as an object URL (made once per size, LRU-capped). */
function sharpPicture(info, width) {
    const key = `${info.type}|${info.file}|${width}`;
    if (pictures.cache.has(key)) {
        const hit = pictures.cache.get(key);
        pictures.cache.delete(key);
        pictures.cache.set(key, hit);
        return Promise.resolve(hit);
    }
    if (pictures.pending.has(key)) return pictures.pending.get(key);
    const job = new Promise((resolve, reject) => {
        pictures.queue.push(async () => {
            if (!deps.active() || !deps.settings().sharpPictures) {
                reject(new Error('cancelled'));
                return;
            }
            let bitmap = null;
            try {
                const response = await fetch(fullPictureUrl(info));
                if (!response.ok) throw new Error(String(response.status));
                const blob = await response.blob();
                if (!deps.active() || !deps.settings().sharpPictures) throw new Error('cancelled');
                // Decoded straight at the size needed (the browser does it off the main thread); browsers without
                // the option decode at full size and the canvas below scales it down.
                try {
                    bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeQuality: 'high' });
                } catch {
                    bitmap = await createImageBitmap(blob);
                }
                const scale = Math.min(1, width / bitmap.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(bitmap.width * scale);
                canvas.height = Math.round(bitmap.height * scale);
                const context = canvas.getContext('2d');
                if (!context) throw new Error('no 2d context');
                context.imageSmoothingQuality = 'high';
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const out = await new Promise(done => canvas.toBlob(done, 'image/webp', 0.92));
                if (!deps.active() || !deps.settings().sharpPictures) throw new Error('cancelled');
                const url = URL.createObjectURL(out ?? blob);
                pictures.cache.set(key, url);
                while (pictures.cache.size > PICTURE_CACHE_LIMIT) {
                    const [oldKey, oldUrl] = pictures.cache.entries().next().value;
                    pictures.cache.delete(oldKey);
                    URL.revokeObjectURL(oldUrl);
                }
                resolve(url);
            } catch (error) {
                reject(error);
            } finally {
                bitmap?.close?.();
                pictures.pending.delete(key);
            }
        });
        pumpPictures();
    });
    pictures.pending.set(key, job);
    return job;
}

function pumpPictures() {
    while (pictures.running < 3 && pictures.queue.length) {
        const task = pictures.queue.shift();
        pictures.running++;
        task().finally(() => {
            pictures.running--;
            pumpPictures();
        });
    }
}

/** Picks the best picture for one <img>. */
function upgradePicture(img) {
    if (!deps.active()) return;
    const current = img.getAttribute('src') ?? '';
    // SillyTavern sometimes sets the thumbnail again; remember what it asked for.
    const info = thumbInfo(current) ?? (img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null);
    if (!info) return;
    if (thumbInfo(current)) img.dataset.ptThumb = current;
    const animated = info.type === 'avatar' && deps.settings().animatedPictures ? animatedPictureFor(info.file) : null;
    if (animated) {
        if (current !== animated) img.setAttribute('src', animated);
        rememberPicture(img, animated);
        return;
    }
    if (!deps.settings().sharpPictures) {
        if (img.dataset.ptThumb && current !== img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        return;
    }
    const shown = img.getBoundingClientRect().width || img.clientWidth;
    const needed = shown * (window.devicePixelRatio || 1);
    // The thumbnail is 96 pixels wide; only bigger pictures need the original.
    if (needed <= 100 || pictures.noSharp.has(info.file)) return;
    const width = needed <= 200 ? 200 : needed <= 400 ? 400 : 640;
    sharpPicture(info, width).then(url => swapPicture(img, url)).catch(() => {});
}

/**
 * One of Pocket Tavern's pictures failed to load. Put SillyTavern's thumbnail
 * back before SillyTavern sees the error, which would swap the picture for its
 * crossed-out "missing picture" icon until the chat is reopened.
 */
function onPictureError(event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.ptThumb) return;
    const src = img.getAttribute('src') ?? '';
    const info = thumbInfo(img.dataset.ptThumb);
    if (!src || !info || src === img.dataset.ptThumb) return;
    event.stopImmediatePropagation();
    if (src.startsWith('blob:')) pictures.noSharp.add(info.file);
    else pictures.broken.add(src);
    for (const map of [pictures.cache, pictures.last]) {
        for (const [key, url] of map) if (url === src) map.delete(key);
    }
    img.setAttribute('src', img.dataset.ptThumb);
}

function watchPicture(img) {
    if (!img.dataset.ptWatched) {
        img.dataset.ptWatched = '1';
        pictures.seen?.observe(img);
    }
    scheduleVisibleCheck();
}

/**
 * Backup for the on-screen watcher: after scrolling stops, upgrade the pictures
 * it reported as near the screen that still show a thumbnail. Only those are
 * looked at, so a long chat or character list costs nothing here.
 */
function scheduleVisibleCheck(event) {
    // Text boxes scroll while you type; they never hold pictures.
    if (event?.target instanceof HTMLTextAreaElement || event?.target instanceof HTMLInputElement) return;
    window.clearTimeout(pictures.timer);
    pictures.timer = window.setTimeout(safe(SOURCE, () => {
        if (!deps.active() || !(deps.settings().sharpPictures || deps.settings().animatedPictures)) return;
        for (const img of pictures.near) {
            if (!img.isConnected) {
                pictures.near.delete(img);
                continue;
            }
            if (thumbInfo(img.getAttribute('src') ?? '') || (img.dataset.ptThumb && img.getAttribute('src') === img.dataset.ptThumb)) upgradePicture(img);
        }
    }), 150);
}

function scanPictures(root = document) {
    if (!deps.active()) return;
    const images = root.matches?.('img') ? [root] : root.querySelectorAll?.('img') ?? [];
    for (const img of images) {
        const src = img.getAttribute('src') ?? '';
        if (thumbInfo(src)) restoreKnownPicture(img);
        if (thumbInfo(src) || img.dataset.ptThumb) watchPicture(img);
    }
}

export function syncPictures() {
    const want = deps.active() && (deps.settings().sharpPictures || deps.settings().animatedPictures);
    if (!want) {
        pictures.observer?.disconnect();
        pictures.seen?.disconnect();
        document.removeEventListener('scroll', guarded.scroll, { capture: true });
        document.removeEventListener('error', guarded.error, { capture: true });
        pictures.observer = null;
        pictures.seen = null;
        window.clearTimeout(pictures.timer);
        pictures.timer = 0;
        window.clearTimeout(pictures.swapTimer);
        pictures.swapTimer = 0;
        cancelAnimationFrame(pictures.swapFrame);
        pictures.swapFrame = 0;
        cancelAnimationFrame(pictures.addedFrame);
        pictures.addedFrame = 0;
        pictures.queue.length = 0;
        pictures.added.clear();
        pictures.near.clear();
        pictures.swaps.clear();
        pictures.last.clear();
        // Put SillyTavern's own thumbnails back.
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            img.setAttribute('src', img.dataset.ptThumb);
            delete img.dataset.ptThumb;
            delete img.dataset.ptWatched;
        }
        document.querySelectorAll('img[data-pt-watched]').forEach(img => delete img.dataset.ptWatched);
        for (const url of pictures.cache.values()) URL.revokeObjectURL(url);
        pictures.cache.clear();
        return;
    }
    if (!deps.settings().sharpPictures && pictures.cache.size) {
        pictures.queue.length = 0;
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            if ((img.getAttribute('src') ?? '').startsWith('blob:')) img.setAttribute('src', img.dataset.ptThumb);
        }
        for (const [key, url] of pictures.last) if (url.startsWith('blob:')) pictures.last.delete(key);
        for (const url of pictures.cache.values()) URL.revokeObjectURL(url);
        pictures.cache.clear();
    }
    if (!deps.settings().animatedPictures) {
        for (const [key, url] of pictures.last) if (!url.startsWith('blob:')) pictures.last.delete(key);
        for (const img of document.querySelectorAll('img[data-pt-thumb]')) {
            const src = img.getAttribute('src') ?? '';
            if (src && !src.startsWith('blob:') && src !== img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        }
    }
    if (!pictures.seen) {
        // Only pictures that are (nearly) on screen are upgraded, so long lists stay light.
        pictures.seen = new IntersectionObserver(safe(SOURCE, entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    pictures.near.add(entry.target);
                    upgradePicture(entry.target);
                } else pictures.near.delete(entry.target);
            }
        }), { rootMargin: '300px' });
    }
    if (!pictures.observer) {
        pictures.observer = new MutationObserver(safe(SOURCE, records => {
            for (const record of records) {
                if (record.type === 'attributes') {
                    const img = record.target;
                    // SillyTavern put a thumbnail back (re-render): upgrade again.
                    if (thumbInfo(img.getAttribute('src') ?? '')) {
                        img.dataset.ptThumb = img.getAttribute('src');
                        if (restoreKnownPicture(img)) continue;
                        if (img.dataset.ptWatched) {
                            pictures.seen?.unobserve(img);
                            pictures.seen?.observe(img);
                        } else watchPicture(img);
                    }
                    continue;
                }
                if (record.target instanceof Element && record.target.closest('.mes_text')) continue;
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1) pictures.added.add(node);
                }
            }
            // Added nodes are scanned once per frame (a streaming reply adds some on every token),
            // still before the frame is drawn, so a known picture never flashes its thumbnail.
            if (pictures.added.size && !pictures.addedFrame) {
                pictures.addedFrame = requestAnimationFrame(safe(SOURCE, () => {
                    pictures.addedFrame = 0;
                    const nodes = [...pictures.added];
                    pictures.added.clear();
                    for (const node of nodes) if (node.isConnected) scanPictures(node);
                }));
            }
        }));
        pictures.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        document.addEventListener('scroll', guarded.scroll, { capture: true, passive: true });
        document.addEventListener('error', guarded.error, { capture: true });
    }
    // Pictures already on the page, and a refresh after the animated picture changed.
    for (const img of document.querySelectorAll('img[data-pt-watched]')) {
        pictures.seen.unobserve(img);
        pictures.seen.observe(img);
    }
    scanPictures();
}

/** Re-check every picture of one character (after its animated picture changed). */
function refreshPicturesFor(file) {
    for (const img of document.querySelectorAll('img')) {
        const info = thumbInfo(img.getAttribute('src') ?? '') ?? (img.dataset.ptThumb ? thumbInfo(img.dataset.ptThumb) : null);
        if (info?.file !== file) continue;
        if (!animatedPictureFor(file) && img.dataset.ptThumb) img.setAttribute('src', img.dataset.ptThumb);
        upgradePicture(img);
    }
    deps.shell()?.update();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function setAnimatedPicture(characterId, url) {
    const context = deps.context();
    const character = context.characters?.[characterId];
    if (!character) return;
    await context.writeExtensionField?.(characterId, GIF_KEY, url ?? '');
    character.data = character.data ?? {};
    character.data.extensions = character.data.extensions ?? {};
    character.data.extensions[GIF_KEY] = url ?? '';
    refreshPicturesFor(character.avatar);
}

/** True for a GIF, an animated WebP or an animated PNG (looks at the file's own bytes). */
async function isAnimatedImage(file) {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const text = (start, length) => String.fromCharCode(...head.subarray(start, start + length));
    if (text(0, 4) === 'GIF8') return true;
    // WebP: RIFF....WEBP with an animation chunk.
    if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
        for (let i = 12; i < head.length - 4; i++) {
            if (head[i] === 0x41 && text(i, 4) === 'ANIM') return true;
        }
        return false;
    }
    // PNG: an "acTL" chunk before the image data means APNG.
    if (head[0] === 0x89 && text(1, 3) === 'PNG') {
        for (let i = 8; i < head.length - 4; i++) {
            if (head[i] === 0x61 && text(i, 4) === 'acTL') return true;
            if (head[i] === 0x49 && text(i, 4) === 'IDAT') return false;
        }
    }
    return false;
}

async function uploadAnimatedFile(file, baseName) {
    const extension = (file.type.split('/')[1] ?? 'gif').replace('apng', 'png').replace(/[^a-z0-9]/gi, '') || 'gif';
    const safeName = `pt-${String(baseName || 'character').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_')}-${Date.now()}.${extension}`;
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: deps.context().getRequestHeaders(),
        body: JSON.stringify({ name: safeName, data: await fileToBase64(file) }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const { path } = await response.json();
    return `/${String(path).replace(/^\/+/, '')}`;
}

/** A picture waiting for its new character to be created. */
let pendingAnimated = null;

/**
 * SillyTavern's own picture picker (tap the character's picture). If the file
 * is animated, Pocket Tavern keeps the moving version next to the still card
 * picture SillyTavern saves; a still picture replaces any earlier animation.
 */
export async function onAvatarPicked(event) {
    if (!deps.active() || !deps.settings().animatedPictures || event.target?.id !== 'add_avatar_button') return;
    const file = event.target.files?.[0];
    if (!file) return;
    const context = deps.context();
    const creating = deps.isShown(document.getElementById('name_div')) || context.characterId === undefined;
    const character = creating ? null : context.characters?.[context.characterId];
    let animated = false;
    try {
        animated = await isAnimatedImage(file);
    } catch {
        animated = false;
    }
    if (!animated) {
        pendingAnimated = null;
        // A still picture replaces the old animation (once SillyTavern has saved the new one).
        if (character && animatedPictureFor(character.avatar)) {
            const avatar = character.avatar;
            setTimeout(safe(SOURCE, () => {
                const idx = (deps.context().characters ?? []).findIndex(item => item.avatar === avatar);
                if (idx !== -1) setAnimatedPicture(idx, '').catch(() => {});
            }), 2500);
        }
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        globalThis.toastr?.warning(t('That picture is too big to animate (over 15 MB); the still picture is used.'));
        return;
    }
    try {
        const url = await uploadAnimatedFile(file, character?.avatar ?? document.getElementById('character_name_pole')?.value);
        if (character) {
            const avatar = character.avatar;
            const charName = character.name;
            // Let SillyTavern finish saving the still picture first, so the two saves don't collide.
            setTimeout(safe(SOURCE, async () => {
                try {
                    const idx = (deps.context().characters ?? []).findIndex(item => item.avatar === avatar);
                    if (idx === -1) return;
                    await setAnimatedPicture(idx, url);
                    globalThis.toastr?.success(t('Animated picture set for {name}.', { name: charName }));
                } catch (err) {
                    console.warn(LOG, 'Animated picture save failed', err);
                }
            }), 2500);
        } else {
            pendingAnimated = { url, avatars: new Set((context.characters ?? []).map(item => item.avatar)), at: Date.now() };
        }
    } catch (error) {
        console.warn(LOG, 'Animated picture upload failed', error);
        globalThis.toastr?.error(t('Could not save the animated picture; the still picture is used.'));
    }
}

/** After a new character is created, give it the animated picture it was created with. */
export function applyPendingAnimated() {
    if (!pendingAnimated) return;
    if (Date.now() - pendingAnimated.at > 10 * 60 * 1000) {
        pendingAnimated = null;
        return;
    }
    const characters = deps.context().characters ?? [];
    const created = characters.find(item => !pendingAnimated.avatars.has(item.avatar));
    if (!created) return;
    const { url } = pendingAnimated;
    const avatar = created.avatar;
    pendingAnimated = null;
    setTimeout(safe(SOURCE, () => {
        const idx = (deps.context().characters ?? []).findIndex(item => item.avatar === avatar);
        if (idx !== -1) setAnimatedPicture(idx, url).catch(() => {});
    }), 1500);
}

/** The document's scroll and error listeners, wrapped once so the same function can be removed again. */
const guarded = { scroll: safe(SOURCE, scheduleVisibleCheck), error: safe(SOURCE, onPictureError) };
