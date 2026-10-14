import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest, onRequestGet } from '../functions/api/contact-health.js';

const healthyEnv = {
    EXPOSE_CONTACT_HEALTH: 'true',
    CONTACT_HEALTH_TOKEN: 'health-test-token',
    TURNSTILE_SECRET_KEY: 'test-secret',
    RESEND_API_KEY: 'test-api-key'
};

function request(headers = {}) {
    return new Request('https://cloudwithdavid.com/api/contact-health', { headers });
}

test('health endpoint remains hidden unless enabled and authorized', async () => {
    for (const [env, headers] of [
        [{ ...healthyEnv, EXPOSE_CONTACT_HEALTH: 'false' }, { Authorization: 'Bearer health-test-token' }],
        [{ ...healthyEnv, CONTACT_HEALTH_TOKEN: '' }, { Authorization: 'Bearer health-test-token' }],
        [healthyEnv, {}],
        [healthyEnv, { Authorization: 'Bearer wrong-token' }],
        [healthyEnv, { 'X-Health-Token': 'wrong-token' }]
    ]) {
        const response = onRequestGet({ request: request(headers), env });
        assert.equal(response.status, 404);
        assert.equal(await response.text(), 'Not found');
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
});

test('authorized health probes accept both supported token headers', async () => {
    for (const headers of [{ Authorization: 'Bearer health-test-token' }, { 'X-Health-Token': 'health-test-token' }]) {
        const response = onRequestGet({ request: request(headers), env: healthyEnv });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        const body = await response.json();
        assert.equal(body.ok, true);
        assert.equal(body.endpoint, '/api/contact');
        assert.ok(Number.isFinite(Date.parse(body.timestamp)));
        assert.ok(!JSON.stringify(body).includes('test-secret'));
        assert.ok(!JSON.stringify(body).includes('test-api-key'));
    }
});

test('missing or blank provider credentials report unhealthy to authorized callers', async () => {
    for (const missing of ['TURNSTILE_SECRET_KEY', 'RESEND_API_KEY']) {
        const response = onRequestGet({
            request: request({ Authorization: 'Bearer health-test-token' }),
            env: { ...healthyEnv, [missing]: '  ' }
        });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).ok, false);
    }
});

test('unsupported health methods remain hidden without cacheable SPA fallbacks', async () => {
    const response = onRequest();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), 'Not found');
});
