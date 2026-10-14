import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

// Only the browser APIs used by these interactions are modeled; execute the whole script.
function browser({ storageFails = false, fetch, contact = true, telemetry = false, modal = false, reducedMotion = false } = {}) {
    let now = 100000;
    let timerId = 0;
    const timers = new Map();
    const storage = new Map();
    const document = { activeElement: null };
    function events(target) {
        const handlers = new Map();
        target.addEventListener = (type, handler) => {
            handlers.set(type, [...(handlers.get(type) || []), handler]);
        };
        target.dispatch = (type, detail = {}) => {
            const event = { target, preventDefault() { this.defaultPrevented = true; }, ...detail };
            return (handlers.get(type) || []).map(handler => handler.call(target, event));
        };
        return target;
    }
    function element({ value = '', maxLength = -1, textContent = '' } = {}) {
        const attributes = new Map();
        const classes = new Set();
        const selectors = new Map();
        return events({
            value, maxLength, textContent, innerHTML: '', disabled: false, dataset: {}, selectors,
            scrollHeight: 100, offsetTop: 100, offsetParent: null,
            style: { setProperty() {}, removeProperty() {} },
            classList: {
                contains: name => classes.has(name),
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                toggle(name, force = !classes.has(name)) {
                    if (force) classes.add(name); else classes.delete(name);
                }
            },
            setAttribute: (name, value) => attributes.set(name, value),
            getAttribute: name => attributes.get(name) ?? null,
            removeAttribute: name => attributes.delete(name),
            querySelector: selector => selectors.get(selector) || null,
            contains(other) { return other === this; },
            appendChild() {},
            focus() { document.activeElement = this; }
        });
    }
    const selectors = new Map();
    const selectorLists = new Map();
    const elementsById = new Map();
    Object.assign(events(document), {
        selectors, selectorLists, elementsById,
        documentElement: element(), body: element(),
        querySelector: selector => selectors.get(selector) || null,
        querySelectorAll: selector => selectorLists.get(selector) || [],
        getElementById: id => elementsById.get(id) || null,
        createElement: () => element()
    });
    const themeToggle = element();
    selectorLists.set('[data-theme-toggle]', [themeToggle]);
    const media = events({ matches: false });
    const motionMedia = events({ matches: reducedMotion });
    const fields = Object.fromEntries(Object.entries({
        name: 'David', email: 'david@example.com', subject: 'Hello', message: 'A message'
    }).map(([name, value]) => [name, element({ value, maxLength: name === 'message' ? 5000 : 254 })]));
    const form = element();
    const button = element();
    button.innerHTML = '<span>Send Message</span>';
    const status = element();
    const widget = element();
    widget.dataset.sitekey = 'test-key';
    form.resetCount = 0;
    form.reset = () => {
        form.resetCount += 1;
        Object.values(fields).forEach(field => { field.value = ''; });
    };
    form.selectors.set('.btn-submit', button);
    form.selectors.set('#formStatus', status);
    form.selectors.set('.cf-turnstile', widget);
    for (const [name, field] of Object.entries(fields)) form.selectors.set(`#${name}`, field);
    if (contact) selectors.set('#contactForm', form);
    const footer = Object.fromEntries(['footerRegion', 'footerRtt', 'footerTtfb'].map(id => [id, element()]));
    if (telemetry) for (const [id, value] of Object.entries(footer)) selectors.set(`#${id}`, value);
    const credentialModal = element();
    const modalClose = element();
    const credential = element({ textContent: 'Certificate' });
    credential.dataset = { modalType: 'image', modalSrc: '/assets/certs/certificate.png' };
    if (modal) {
        selectors.set('#certModal', credentialModal);
        selectors.set('#certModalClose', modalClose);
        selectors.set('#certModalContent', element());
        selectorLists.set('.about-cert-item[role="button"][data-modal-type][data-modal-src]', [credential]);
    }
    const setTimer = (callback, delay, interval = false) => {
        timers.set(++timerId, { callback, delay, due: now + delay, interval });
        return timerId;
    };
    const turnstile = {
        options: null, executionCount: 0,
        render(_target, options) { this.options = options; return 'widget'; },
        getResponse: () => '',
        execute() { this.executionCount += 1; this.options.callback('token'); },
        reset() {}
    };
    const window = events({
        document, fetch: fetch || (async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })),
        turnstile, matchMedia: query => query.includes('reduced-motion') ? motionMedia : media,
        location: { search: '', hash: '', href: 'https://example.com/' },
        pageYOffset: 0, innerHeight: 800, innerWidth: 1200,
        performance: { now: () => now, getEntriesByType: () => [] },
        setTimeout: (callback, delay) => setTimer(callback, delay),
        clearTimeout: id => timers.delete(id),
        setInterval: (callback, delay) => setTimer(callback, delay, true),
        clearInterval: id => timers.delete(id),
        requestAnimationFrame: callback => setTimer(() => callback(now), 16),
        scrollTo(options) { this.lastScroll = options; },
        history: { pushState(_state, _title, hash) { window.location.hash = hash; } },
        AbortController, URL, URLSearchParams,
        Date: class extends Date { static now() { return now; } },
        console: { error() {} },
        localStorage: {
            getItem(key) { if (storageFails) throw new Error('Storage denied'); return storage.get(key) || null; },
            setItem(key, value) { if (storageFails) throw new Error('Storage denied'); storage.set(key, value); },
            removeItem(key) { if (storageFails) throw new Error('Storage denied'); storage.delete(key); }
        }
    });
    window.window = window;
    async function advance(ms) {
        const end = now + ms;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
            if (!next) break;
            const [id, timer] = next;
            now = timer.due;
            if (timer.interval) timer.due += timer.delay; else timers.delete(id);
            timer.callback();
            await flush();
        }
        now = end;
        await flush();
    }
    return {
        window, document, element, form, button, status, fields, footer, themeToggle, media, motionMedia,
        turnstile, credentialModal, modalClose, credential, timers, storage,
        start: () => runInNewContext(source, window), advance,
        submit: () => Promise.all(form.dispatch('submit'))
    };
}

function addHeroVisual(page) {
    const hero = page.element();
    hero.offsetHeight = 600;
    const visual = page.element();
    visual.offsetHeight = 100;
    const cloud = page.element();
    const cards = page.element();
    for (const [selector, element] of [
        ['#hero', hero], ['.hero-visual', visual], ['.hero-clouds-wrapper', cloud], ['.hero-cards-layer', cards]
    ]) page.document.selectors.set(selector, element);
    page.document.elementsById.set('hero', hero);
    return { cloud, cards };
}

function addNavigation(page) {
    const sections = [];
    const links = [];
    for (const [id, top] of [['hero', 0], ['about', 1000], ['contact', 4000]]) {
        const section = page.element();
        section.id = id;
        section.offsetTop = top;
        section.getBoundingClientRect = () => ({ top: top - page.window.pageYOffset });
        page.document.elementsById.set(id, section);
        sections.push(section);
        const link = page.element();
        link.setAttribute('href', `#${id}`);
        links.push(link);
    }
    page.document.selectorLists.set('.page-section[id]', sections);
    page.document.selectorLists.set('.nav-links a', links);
    page.document.selectorLists.set('a[href^="#"]', links);
    return links;
}

test('clicked navigation stays active through intermediate sections until scrolling settles', async () => {
    const page = browser({ contact: false });
    const [home, about, contact] = addNavigation(page);
    page.start();
    assert.equal(home.classList.contains('active'), true);
    contact.dispatch('click');
    assert.equal(contact.classList.contains('active'), true);
    assert.equal(home.classList.contains('active'), false);
    for (const top of [500, 1100, 2000, 3000, 3948]) {
        page.window.pageYOffset = top;
        page.window.dispatch('scroll');
        await page.advance(100);
        assert.equal(contact.classList.contains('active'), true);
        assert.equal(about.classList.contains('active'), false);
    }
    await page.advance(150);
    assert.equal(page.timers.size, 0);
    assert.equal(contact.classList.contains('active'), true);
    page.window.pageYOffset = 1100;
    page.window.dispatch('scroll');
    await page.advance(16);
    assert.equal(about.classList.contains('active'), true);
    assert.equal(contact.classList.contains('active'), false);
});

test('interrupted navigation returns to the viewport section after scrolling stops', async () => {
    const page = browser({ contact: false });
    const [, about, contact] = addNavigation(page);
    page.start();
    contact.dispatch('click');
    page.window.pageYOffset = 1100;
    page.window.dispatch('scroll');
    await page.advance(16);
    assert.equal(contact.classList.contains('active'), true);
    await page.advance(150);
    assert.equal(about.classList.contains('active'), true);
    assert.equal(contact.classList.contains('active'), false);
    assert.equal(page.timers.size, 0);
});

test('a newer navigation click replaces the previous highlight and idle timer', async () => {
    const page = browser({ contact: false });
    const [, about, contact] = addNavigation(page);
    page.start();
    contact.dispatch('click');
    await page.advance(100);
    about.dispatch('click');
    assert.equal(about.classList.contains('active'), true);
    assert.equal(contact.classList.contains('active'), false);
    assert.equal(page.timers.size, 1);
    page.window.pageYOffset = 948;
    page.window.dispatch('scroll');
    await page.advance(100);
    assert.equal(about.classList.contains('active'), true);
    await page.advance(150);
    assert.equal(about.classList.contains('active'), true);
    assert.equal(page.timers.size, 0);
});

test('clicking the current section releases the highlight hold without needing a scroll event', async () => {
    const page = browser({ contact: false });
    const [home, about] = addNavigation(page);
    page.start();
    home.dispatch('click');
    await page.advance(150);
    assert.equal(home.classList.contains('active'), true);
    assert.equal(page.timers.size, 0);
    page.window.pageYOffset = 1100;
    page.window.dispatch('scroll');
    await page.advance(16);
    assert.equal(about.classList.contains('active'), true);
});

test('modified navigation clicks do not change the active section or start a hold', () => {
    const page = browser({ contact: false });
    const [home, , contact] = addNavigation(page);
    page.start();
    for (const detail of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
        contact.dispatch('click', detail);
        assert.equal(home.classList.contains('active'), true);
        assert.equal(contact.classList.contains('active'), false);
        assert.equal(page.timers.size, 0);
    }
});

test('denied theme storage preserves initialization and this visit\'s selected theme', async () => {
    const page = browser({ storageFails: true });
    page.start();
    assert.equal(page.document.documentElement.getAttribute('data-theme'), 'light');
    page.themeToggle.dispatch('click');
    assert.equal(page.document.documentElement.getAttribute('data-theme'), 'dark');
    page.media.dispatch('change', { matches: false });
    assert.equal(page.document.documentElement.getAttribute('data-theme'), 'dark');
    await page.submit();
    assert.match(page.status.textContent, /successfully/);
});

test('contact success requires API acknowledgement and honors the cooldown', async () => {
    const page = browser();
    page.start();
    await page.submit();
    assert.equal(page.form.resetCount, 1);
    assert.equal(page.button.disabled, true);
    assert.equal(page.form.getAttribute('aria-busy'), null);
    assert.equal(page.turnstile.options.execution, 'execute');
    assert.equal(page.turnstile.options.size, undefined);
    await page.advance(15000);
    assert.equal(page.button.disabled, false);
    assert.equal(page.timers.size, 0);
});

for (const [name, response] of [
    ['HTML fallback', { ok: true, status: 200, json: async () => { throw new SyntaxError('HTML'); } }],
    ['unacknowledged JSON', { ok: true, status: 200, json: async () => ({}) }],
    ['API error', { ok: false, status: 502, json: async () => ({ ok: false, error: 'email' }) }]
]) {
    test(`contact preserves entered values on ${name}`, async () => {
        const page = browser({ fetch: async () => response });
        page.start();
        await page.submit();
        assert.equal(page.form.resetCount, 0);
        assert.equal(page.fields.message.value, 'A message');
        assert.equal(page.button.disabled, false);
        assert.match(page.status.className, /error/);
        assert.equal(page.timers.size, 0);
    });
}

test('contact rejects submissions that exceed the markup length limit', async () => {
    let requests = 0;
    const page = browser({ fetch: async () => { requests += 1; } });
    page.fields.subject.maxLength = 160;
    page.fields.subject.value = 'x'.repeat(161);
    page.start();
    await page.submit();
    assert.equal(requests, 0);
    assert.equal(page.fields.subject.getAttribute('aria-invalid'), 'true');
    assert.equal(page.document.activeElement, page.fields.subject);
});

test('an in-flight request blocks another submission after the cooldown expires', async () => {
    let resolve;
    let requests = 0;
    const page = browser({ fetch: () => {
        requests += 1;
        return new Promise(done => { resolve = done; });
    } });
    page.start();
    const first = page.submit();
    await flush();
    await page.advance(16000);
    await page.submit();
    assert.equal(requests, 1);
    assert.equal(page.turnstile.executionCount, 1);
    assert.equal(page.form.getAttribute('aria-busy'), 'true');
    resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await first;
    assert.match(page.status.textContent, /successfully/);
});

for (const stage of ['fetch', 'response body']) {
    test(`a stalled contact ${stage} times out and permits retry`, async () => {
        let signal;
        const stalled = () => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        });
        const page = browser({ fetch: (_url, options) => {
            signal = options.signal;
            return stage === 'fetch' ? stalled() : Promise.resolve({ ok: true, status: 200, json: stalled });
        } });
        page.start();
        const pending = page.submit();
        await flush();
        await page.advance(40000);
        await pending;
        assert.equal(signal.aborted, true);
        assert.equal(page.button.disabled, false);
        assert.equal(page.form.getAttribute('aria-busy'), null);
        assert.equal(page.form.resetCount, 0);
        assert.equal(page.timers.size, 0);
        page.window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
        await page.submit();
        assert.match(page.status.textContent, /successfully/);
    });
}

test('challenge expiry clears a pending submission promptly', async () => {
    let requests = 0;
    const page = browser({ fetch: async () => { requests += 1; } });
    page.turnstile.execute = () => {};
    page.start();
    const pending = page.submit();
    await flush();
    page.turnstile.options['expired-callback']();
    await pending;
    assert.equal(requests, 0);
    assert.equal(page.button.disabled, false);
    assert.match(page.status.textContent, /Security check failed/);
    assert.equal(page.timers.size, 0);
});

for (const failure of ['provider error', 'provider timeout', 'challenge deadline', 'execution exception']) {
    test(`Turnstile ${failure} releases the submission and permits retry`, async () => {
        let requests = 0;
        const page = browser({ fetch: async () => {
            requests += 1;
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        } });
        page.turnstile.execute = () => {
            if (failure === 'execution exception') throw null;
        };
        page.start();
        const pending = page.submit();
        await flush();
        if (failure === 'provider error') page.turnstile.options['error-callback']('failed');
        if (failure === 'provider timeout') page.turnstile.options['timeout-callback']();
        if (failure === 'challenge deadline') await page.advance(10000);
        await pending;
        assert.equal(requests, 0);
        assert.equal(page.button.disabled, false);
        assert.equal(page.form.getAttribute('aria-busy'), null);
        assert.match(page.status.textContent, /Security check failed/);
        assert.equal(page.timers.size, 0);
        page.turnstile.options.callback('late token');
        page.turnstile.execute = () => page.turnstile.options.callback('fresh token');
        await page.submit();
        assert.equal(requests, 1);
        assert.match(page.status.textContent, /successfully/);
    });
}

test('Turnstile loading has a deadline and recovers when the script becomes available', async () => {
    const page = browser();
    delete page.window.turnstile;
    page.start();
    const pending = page.submit();
    await flush();
    await page.advance(8000);
    await pending;
    assert.equal(page.button.disabled, false);
    assert.match(page.status.textContent, /Security check failed/);
    assert.equal(page.timers.size, 0);
    page.window.turnstile = page.turnstile;
    await page.submit();
    assert.match(page.status.textContent, /successfully/);
});

test('contact sends validated values and preserves a draft edited while awaiting verification', async () => {
    let payload;
    const page = browser({ fetch: async (_url, options) => {
        payload = JSON.parse(options.body);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    } });
    page.turnstile.execute = () => {};
    page.start();
    const pending = page.submit();
    await flush();
    page.fields.message.value = 'A different draft';
    page.turnstile.options.callback('token');
    await pending;
    assert.equal(payload.message, 'A message');
    assert.equal(page.fields.message.value, 'A different draft');
    assert.equal(page.form.resetCount, 0);
});

test('footer latency probes use an existing same-origin asset', async () => {
    const urls = [];
    const page = browser({ contact: false, telemetry: true, fetch: async url => {
        urls.push(url);
        return { ok: true, json: async () => ({ countryCode: 'US', longitude: -120 }) };
    } });
    page.start();
    await page.advance(0);
    const probes = urls.filter(url => url.startsWith('https://example.com/'));
    assert.equal(probes.length, 3);
    const assetPath = new URL(probes[0]).pathname;
    assert.ok(existsSync(new URL(`..${assetPath}`, import.meta.url)));
    assert.match(page.footer.footerRtt.textContent, /^\d+ms$/);
    assert.equal(page.footer.footerRegion.textContent, 'US-WEST');
});

test('hash navigation accepts encoded IDs and ignores malformed fragments', () => {
    const page = browser({ contact: false });
    page.document.elementsById.set('a:b', page.element());
    page.start();
    page.window.location.hash = '#a%3Ab';
    page.window.dispatch('hashchange');
    assert.ok(page.window.lastScroll);
    for (const hash of ['#[', '#%', '#missing']) {
        page.window.location.hash = hash;
        assert.doesNotThrow(() => page.window.dispatch('hashchange'));
    }
});

test('credential modal traps Tab and restores focus and body scrolling on close', () => {
    const page = browser({ contact: false, modal: true });
    page.document.body.style.overflow = 'auto';
    page.start();
    page.credential.dispatch('click');
    assert.equal(page.document.activeElement, page.modalClose);
    assert.equal(page.document.body.style.overflow, 'hidden');
    let prevented = false;
    page.document.dispatch('keydown', { key: 'Tab', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    page.credential.dispatch('click');
    page.document.dispatch('keydown', { key: 'Escape' });
    assert.equal(page.document.activeElement, page.credential);
    assert.equal(page.document.body.style.overflow, 'auto');
    assert.equal(page.credentialModal.getAttribute('aria-hidden'), 'true');
});

test('reduced motion disables smooth scrolling, counters and parallax and responds to preference changes', () => {
    const page = browser({ contact: false, reducedMotion: true });
    const counter = page.element({ textContent: '0' });
    counter.dataset = { count: '5', suffix: '+' };
    page.document.selectorLists.set('.stats-number[data-count]', [counter]);
    const { cards } = addHeroVisual(page);
    page.window.pageYOffset = 300;
    page.start();
    page.window.location.hash = '#hero';
    page.window.dispatch('hashchange');
    assert.equal(page.window.lastScroll.behavior, 'auto');
    assert.equal(counter.textContent, '5+');
    assert.match(cards.style.transform, /0\.00px/);
    page.motionMedia.matches = false;
    page.motionMedia.dispatch('change');
    assert.match(cards.style.transform, /60\.00px/);
    page.window.dispatch('hashchange');
    assert.equal(page.window.lastScroll.behavior, 'smooth');
    page.motionMedia.matches = true;
    page.motionMedia.dispatch('change');
    assert.match(cards.style.transform, /0\.00px/);
});

test('parallax uses the same breakpoint factors and clamps after coalesced viewport events', async () => {
    const page = browser({ contact: false });
    const { cloud, cards } = addHeroVisual(page);
    page.start();
    for (const [width, cloudOffset, cardsOffset, clamp] of [
        [768, 30, 36, 472], [769, 48, 54, 460], [1024, 48, 54, 460], [1025, 60, 60, 544]
    ]) {
        page.window.innerWidth = width;
        page.window.pageYOffset = 300;
        page.window.dispatch('resize');
        page.window.dispatch('resize');
        assert.equal(page.timers.size, 1);
        await page.advance(16);
        assert.equal(cloud.style.transform, `translate3d(-50%, -50%, 0) translate3d(0, ${cloudOffset.toFixed(2)}px, 0)`);
        assert.equal(cards.style.transform, `translate3d(0, ${cardsOffset.toFixed(2)}px, 0)`);
        page.window.pageYOffset = 5000;
        page.window.dispatch('scroll');
        await page.advance(16);
        assert.equal(cards.style.transform, `translate3d(0, ${clamp.toFixed(2)}px, 0)`);
        assert.equal(page.timers.size, 0);
    }
});

test('browsers without IntersectionObserver keep final counters and initialize the contact form', async () => {
    const page = browser();
    const counter = page.element({ textContent: '0' });
    counter.dataset.count = '6';
    page.document.selectorLists.set('.stats-number[data-count]', [counter]);
    page.start();
    assert.equal(counter.textContent, '6');
    await page.submit();
    assert.match(page.status.textContent, /successfully/);
});

test('a running counter stops on the next animation frame when reduced motion is enabled', async () => {
    const page = browser({ contact: false });
    const counter = page.element({ textContent: '0' });
    counter.dataset = { count: '6', suffix: '+' };
    page.document.selectorLists.set('.stats-number[data-count]', [counter]);
    let intersect;
    page.window.IntersectionObserver = class {
        constructor(callback) { intersect = callback; }
        observe() {}
        unobserve() {}
    };
    page.start();
    intersect([{ target: counter, isIntersecting: true }]);
    assert.equal(counter.textContent, '0');
    await page.advance(160);
    assert.equal(counter.textContent, '1+');
    page.motionMedia.matches = true;
    await page.advance(16);
    assert.equal(counter.textContent, '6+');
    assert.equal(page.timers.size, 0);
});
