import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { onRequest } from '../functions/_middleware.js';

function context(url, { method = 'GET', response = new Response('page') } = {}) {
    return {
        request: new Request(url, { method }),
        next: async () => response
    };
}

test('canonical redirects retain paths and query strings and include security headers', async () => {
    for (const host of ['http://www.cloudwithdavid.com', 'https://www.cloudwithdavid.com', 'http://cloudwithdavid.com']) {
        const response = await onRequest(context(`${host}/path%20name?next=%2Fcontact&theme=light`));
        assert.equal(response.status, 301);
        assert.equal(response.headers.get('Location'), 'https://cloudwithdavid.com/path%20name?next=%2Fcontact&theme=light');
        assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
        assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    }
});

test('redirects preserve the method and body of contact POST requests', async () => {
    const response = await onRequest({
        request: new Request('http://www.cloudwithdavid.com/api/contact', { method: 'POST', body: '{"message":"hello"}' }),
        next: () => assert.fail('redirect must happen before the handler')
    });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('Location'), 'https://cloudwithdavid.com/api/contact');
});

test('middleware preserves response status, content, and application headers', async () => {
    const original = new Response('{"ok":false}', {
        status: 503,
        statusText: 'Unavailable',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Custom': 'preserved' }
    });
    const response = await onRequest(context('https://cloudwithdavid.com/api/contact', { response: original }));
    assert.equal(response.status, 503);
    assert.equal(response.statusText, 'Unavailable');
    assert.equal(await response.text(), '{"ok":false}');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Custom'), 'preserved');
    assert.match(response.headers.get('Strict-Transport-Security'), /max-age=31536000/);
});

test('localhost including IPv6 keeps its origin and receives no HSTS', async () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
        for (const protocol of ['http', 'https']) {
            const response = await onRequest(context(`${protocol}://${hostname}:8788/`, {
                response: new Response('local', { headers: { 'Strict-Transport-Security': 'max-age=31536000' } })
            }));
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('Location'), null);
            assert.equal(response.headers.get('Strict-Transport-Security'), null);
        }
    }
});

test('preview domains are not redirected to production', async () => {
    const response = await onRequest(context('https://review.cwd-site.pages.dev/?theme=dark'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Location'), null);
});

test('static and function security policies agree and allow only expected inline scripts', async () => {
    const response = await onRequest(context('https://cloudwithdavid.com/'));
    const policy = response.headers.get('Content-Security-Policy');
    const staticHeaders = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
    assert.equal(staticHeaders.match(/^\s+Content-Security-Policy:\s*(.+)$/m)[1], policy);

    const directives = new Map(policy.split('; ').map(directive => {
        const [name, ...sources] = directive.split(' ');
        return [name, sources];
    }));
    const scriptSources = directives.get('script-src');
    assert.ok(!scriptSources.includes("'unsafe-inline'"));
    assert.ok(scriptSources.includes('https://challenges.cloudflare.com'));
    assert.ok(scriptSources.includes('https://static.cloudflareinsights.com'));
    assert.ok(directives.get('connect-src').includes('https://cloudflareinsights.com'));

    // HTML parsing normalizes CRLF/CR before the browser hashes script text.
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
    const inlineHashes = [];
    for (const [, attributes, script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (/\bsrc\s*=/i.test(attributes)) continue;
        inlineHashes.push(`'sha256-${createHash('sha256').update(script).digest('base64')}'`);
    }
    assert.ok(inlineHashes.length > 0);
    assert.deepEqual(scriptSources.filter(source => source.startsWith("'sha256-")).sort(), inlineHashes.sort());
});
