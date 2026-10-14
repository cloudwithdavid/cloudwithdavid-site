import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest, onRequestPost } from '../functions/api/contact.js';

const ENV = { TURNSTILE_SECRET_KEY: 'test-secret', RESEND_API_KEY: 'test-api-key' };
const INPUT = {
    name: '  Test Person  ',
    email: '  TEST@example.com  ',
    subject: 'A test subject',
    message: 'A message\nwith two lines.',
    honeypot: '',
    turnstileToken: 'test-token'
};

function request(body = INPUT, headers = {}) {
    return new Request('https://cloudwithdavid.com/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
}

function allowProviders(t, verification = { success: true, hostname: 'cloudwithdavid.com' }) {
    return t.mock.method(globalThis, 'fetch', async (url) => {
        if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
            return Response.json(verification);
        }
        return Response.json({ id: 'test-email-id' });
    });
}

function forbidProviders(t) {
    return t.mock.method(globalThis, 'fetch', () => {
        throw new Error('Validation failures must not reach upstream providers');
    });
}

async function expectError(response, status, error) {
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, error });
}

test('valid submission verifies the token before delivering a normalized plain-text email', async (t) => {
    const fetchMock = allowProviders(t);
    const response = await onRequestPost({
        request: request(INPUT, { 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'Application/JSON; charset=utf-8' }),
        env: { ...ENV, RESEND_FROM: 'sender@example.com', CONTACT_TO: 'recipient@example.com' }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(fetchMock.mock.calls.length, 2);
    const verification = fetchMock.mock.calls[0].arguments[1];
    const form = new URLSearchParams(verification.body);
    assert.equal(form.get('secret'), ENV.TURNSTILE_SECRET_KEY);
    assert.equal(form.get('response'), INPUT.turnstileToken);
    assert.equal(form.get('remoteip'), '192.0.2.1');
    const delivery = fetchMock.mock.calls[1].arguments[1];
    const email = JSON.parse(delivery.body);
    assert.equal(delivery.headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`);
    assert.equal(email.from, 'sender@example.com');
    assert.deepEqual(email.to, ['recipient@example.com']);
    assert.equal(email.reply_to, 'test@example.com');
    assert.equal(email.subject, INPUT.subject);
    assert.ok(email.text.includes(INPUT.message));
    assert.ok(email.text.includes('Name: Test Person\nEmail: test@example.com'));
});

test('other HTTP methods return an explicit API response', async () => {
    const response = onRequest();
    await expectError(response, 405, 'method_not_allowed');
    assert.equal(response.headers.get('allow'), 'POST');
});

test('metadata normalizes mixed control characters and whitespace without flattening the message', async (t) => {
    const fetchMock = allowProviders(t);
    const response = await onRequestPost({
        request: request({
            ...INPUT,
            name: '\u0000\tTest\nPerson \u007f',
            subject: '  A\u0000\t subject\nwith\u007f controls  ',
            honeypot: undefined
        }),
        env: ENV
    });
    assert.equal(response.status, 200);
    const email = JSON.parse(fetchMock.mock.calls[1].arguments[1].body);
    assert.equal(email.subject, 'A subject with controls');
    assert.ok(email.text.includes('Name: Test Person\nEmail: test@example.com'));
    assert.ok(email.text.includes(INPUT.message));
});

test('malformed JSON and deceptive JSON media types are rejected before upstream calls', async (t) => {
    const fetchMock = forbidProviders(t);
    for (const contentType of ['text/plain', 'application/json-invalid', 'text/application/json']) {
        await expectError(await onRequestPost({ request: request(INPUT, { 'Content-Type': contentType }), env: ENV }), 415, 'unsupported_media_type');
    }
    const malformed = new Request('https://cloudwithdavid.com/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
    });
    await expectError(await onRequestPost({ request: malformed, env: ENV }), 400, 'invalid_json');
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('non-object payloads and non-string fields are rejected without coercion', async (t) => {
    const fetchMock = forbidProviders(t);
    for (const body of [null, [], true, 'message']) {
        await expectError(await onRequestPost({ request: request(body), env: ENV }), 400, 'invalid_fields');
    }
    for (const field of Object.keys(INPUT)) {
        await expectError(await onRequestPost({ request: request({ ...INPUT, [field]: ['unexpected'] }), env: ENV }), 400, 'invalid_fields');
    }
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('missing fields, invalid email, and honeypot entries cannot reach providers', async (t) => {
    const fetchMock = forbidProviders(t);
    for (const field of ['name', 'email', 'subject', 'message', 'turnstileToken']) {
        const body = { ...INPUT };
        delete body[field];
        await expectError(await onRequestPost({ request: request(body), env: ENV }), 400, 'missing_fields');
    }
    await expectError(await onRequestPost({ request: request({ ...INPUT, email: 'bad\n@example.com' }), env: ENV }), 400, 'invalid_email');
    await expectError(await onRequestPost({ request: request({ ...INPUT, honeypot: 'bot' }), env: ENV }), 400, 'honeypot');
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('field length limits include the Turnstile token', async (t) => {
    const fetchMock = forbidProviders(t);
    const longFields = {
        name: 'n'.repeat(81),
        email: `${'e'.repeat(243)}@example.com`,
        subject: 's'.repeat(161),
        message: 'm'.repeat(5001),
        turnstileToken: 't'.repeat(2049)
    };
    for (const [field, value] of Object.entries(longFields)) {
        await expectError(await onRequestPost({ request: request({ ...INPUT, [field]: value }), env: ENV }), 400, 'invalid_length');
    }
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('maximum-length UTF-8 content remains accepted within the byte budget', async (t) => {
    allowProviders(t);
    const response = await onRequestPost({
        request: request({
            ...INPUT, name: '界'.repeat(80), subject: '界'.repeat(160),
            message: '😀'.repeat(2500), turnstileToken: 't'.repeat(2048)
        }),
        env: ENV
    });
    assert.equal(response.status, 200);
});

test('oversized declared content is rejected before reading its body', async (t) => {
    const fetchMock = forbidProviders(t);
    const oversized = request(INPUT, { 'Content-Length': '65537' });
    await expectError(await onRequestPost({ request: oversized, env: ENV }), 413, 'payload_too_large');
    assert.equal(oversized.bodyUsed, false);
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('streamed body limits count bytes even with a misleading Content-Length', async (t) => {
    const fetchMock = forbidProviders(t);
    const bytes = new TextEncoder().encode(JSON.stringify({ ...INPUT, extra: '😀'.repeat(17000) }));
    let cancelled = false;
    const stream = new ReadableStream({
        start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 16384) {
                controller.enqueue(bytes.slice(offset, offset + 16384));
            }
        },
        cancel() { cancelled = true; }
    });
    const oversized = new Request('https://cloudwithdavid.com/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
        body: stream, duplex: 'half'
    });
    await expectError(await onRequestPost({ request: oversized, env: ENV }), 413, 'payload_too_large');
    assert.equal(cancelled, true);
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('stalled request bodies time out and are cancelled even after complete JSON arrives without EOF', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fetchMock = forbidProviders(t);
    for (const partial of ['', JSON.stringify(INPUT)]) {
        let cancelled = false;
        const stream = new ReadableStream({
            start(controller) {
                if (partial) controller.enqueue(new TextEncoder().encode(partial));
            },
            cancel() { cancelled = true; }
        });
        const stalled = new Request('https://cloudwithdavid.com/api/contact', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half'
        });
        const pending = onRequestPost({ request: stalled, env: ENV });
        await new Promise((resolve) => setImmediate(resolve));
        t.mock.timers.tick(9999);
        assert.equal(cancelled, false);
        t.mock.timers.tick(1);
        await expectError(await pending, 408, 'request_timeout');
        assert.equal(cancelled, true);
    }
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('missing server keys fail before token verification', async (t) => {
    const fetchMock = forbidProviders(t);
    await expectError(await onRequestPost({ request: request(), env: {} }), 500, 'server_config');
    for (const field of Object.keys(ENV)) {
        await expectError(await onRequestPost({ request: request(), env: { ...ENV, [field]: '  ' } }), 500, 'server_config');
    }
    assert.equal(fetchMock.mock.calls.length, 0);
});

test('provider credentials are trimmed consistently with health checks', async (t) => {
    const fetchMock = allowProviders(t);
    const response = await onRequestPost({
        request: request(), env: { TURNSTILE_SECRET_KEY: ' test-secret ', RESEND_API_KEY: ' test-api-key ' }
    });
    assert.equal(response.status, 200);
    assert.equal(new URLSearchParams(fetchMock.mock.calls[0].arguments[1].body).get('secret'), ENV.TURNSTILE_SECRET_KEY);
    assert.equal(fetchMock.mock.calls[1].arguments[1].headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`);
});

test('Turnstile must report boolean success for an allowed hostname', async (t) => {
    for (const verification of [
        null,
        { success: 'true', hostname: 'cloudwithdavid.com' },
        { success: false, hostname: 'cloudwithdavid.com' },
        { success: true, hostname: 'attacker.example' },
        { success: true }
    ]) {
        const fetchMock = allowProviders(t, verification);
        await expectError(await onRequestPost({ request: request(), env: ENV }), 403, 'turnstile');
        assert.equal(fetchMock.mock.calls.length, 1);
        fetchMock.mock.restore();
    }
});

test('configured hostname overrides are normalized and enforced', async (t) => {
    const fetchMock = allowProviders(t, { success: true, hostname: 'preview.example.com' });
    const response = await onRequestPost({
        request: request(), env: { ...ENV, TURNSTILE_ALLOWED_HOSTNAMES: ' PREVIEW.EXAMPLE.COM, ' }
    });
    assert.equal(response.status, 200);
    fetchMock.mock.restore();
    allowProviders(t);
    await expectError(await onRequestPost({
        request: request(), env: { ...ENV, TURNSTILE_ALLOWED_HOSTNAMES: 'preview.example.com' }
    }), 403, 'turnstile');
});

test('Turnstile operational failures are distinguished from rejected challenges', async (t) => {
    for (const [code, status, error] of [
        ['internal-error', 502, 'turnstile'],
        ['missing-input-secret', 500, 'server_config'],
        ['invalid-input-secret', 500, 'server_config'],
        ['timeout-or-duplicate', 403, 'turnstile']
    ]) {
        const fetchMock = allowProviders(t, { success: false, 'error-codes': [code] });
        await expectError(await onRequestPost({ request: request(), env: ENV }), status, error);
        assert.equal(fetchMock.mock.calls.length, 1);
        fetchMock.mock.restore();
    }
});

test('Turnstile HTTP failures, invalid JSON, and network failures cannot deliver email', async (t) => {
    for (const upstream of [
        () => Response.json({ success: true, hostname: 'cloudwithdavid.com' }, { status: 503 }),
        () => new Response('not JSON'),
        () => { throw new Error('network unavailable'); }
    ]) {
        const fetchMock = t.mock.method(globalThis, 'fetch', upstream);
        await expectError(await onRequestPost({ request: request(), env: ENV }), 502, 'turnstile');
        assert.equal(fetchMock.mock.calls.length, 1);
        fetchMock.mock.restore();
    }
});

test('email HTTP failures log only status and never consume provider error details', async (t) => {
    const logs = t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', async (url) => {
        if (url.includes('siteverify')) return Response.json({ success: true, hostname: 'cloudwithdavid.com' });
        return { ok: false, status: 429, text() { throw new Error('Must not read potentially sensitive provider errors'); } };
    });
    await expectError(await onRequestPost({ request: request(), env: ENV }), 502, 'email');
    assert.deepEqual(logs.mock.calls[0].arguments, ['Resend API error', { status: 429 }]);
});

test('email network failures return delivery errors', async (t) => {
    t.mock.method(globalThis, 'fetch', async (url) => {
        if (url.includes('siteverify')) return Response.json({ success: true, hostname: 'cloudwithdavid.com' });
        throw new Error('network unavailable');
    });
    await expectError(await onRequestPost({ request: request(), env: ENV }), 502, 'email');
});

test('unused provider bodies are cancelled without waiting for their cancellation to finish', async (t) => {
    t.mock.method(console, 'error', () => {});
    for (const [provider, upstreamStatus, status, error] of [
        ['turnstile', 503, 502, 'turnstile'],
        ['email', 201, 200, null],
        ['email', 429, 502, 'email']
    ]) {
        let cancelled = false;
        const fetchMock = t.mock.method(globalThis, 'fetch', async (url) => {
            if (provider === 'email' && url.includes('siteverify')) {
                return Response.json({ success: true, hostname: 'cloudwithdavid.com' });
            }
            return new Response(new ReadableStream({
                cancel() {
                    cancelled = true;
                    return new Promise(() => {});
                }
            }), { status: upstreamStatus });
        });
        const response = await onRequestPost({ request: request(), env: ENV });
        if (error) await expectError(response, status, error);
        else {
            assert.equal(response.status, status);
            assert.deepEqual(await response.json(), { ok: true });
        }
        assert.equal(cancelled, true);
        fetchMock.mock.restore();
    }
});

for (const provider of ['turnstile', 'email']) {
    test(`${provider} requests abort after ten seconds`, async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const fetchMock = t.mock.method(globalThis, 'fetch', (url, { signal }) => {
            if (provider === 'email' && url.includes('siteverify')) {
                return Promise.resolve(Response.json({ success: true, hostname: 'cloudwithdavid.com' }));
            }
            return new Promise((resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
            });
        });
        const pending = onRequestPost({ request: request(), env: ENV });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(fetchMock.mock.calls.length, provider === 'email' ? 2 : 1);
        const signal = fetchMock.mock.calls.at(-1).arguments[1].signal;
        t.mock.timers.tick(9999);
        assert.equal(signal.aborted, false);
        t.mock.timers.tick(1);
        await expectError(await pending, 502, provider);
        assert.equal(signal.aborted, true);
    });
}

test('Turnstile timeout also covers reading the verification response body', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(globalThis, 'fetch', async (url, { signal }) => new Response(new ReadableStream({
        start(controller) {
            signal.addEventListener('abort', () => controller.error(new DOMException('Timed out', 'AbortError')), { once: true });
        }
    })));
    const pending = onRequestPost({ request: request(), env: ENV });
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(10000);
    await expectError(await pending, 502, 'turnstile');
});
