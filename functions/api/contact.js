const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const SUBJECT_MAX_LENGTH = 160;
const MESSAGE_MAX_LENGTH = 5000;
const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
// Allows the maximum field lengths even when JSON escapes every character.
const REQUEST_BODY_MAX_BYTES = 64 * 1024;
const REQUEST_BODY_TIMEOUT_MS = 10000;
const PROVIDER_TIMEOUT_MS = 10000;
const DEFAULT_TURNSTILE_HOSTNAMES = ['cloudwithdavid.com', 'www.cloudwithdavid.com'];
const DEFAULT_SECURITY_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...DEFAULT_SECURITY_HEADERS, ...headers }
    });
}

function normalizeText(value = '') {
    return value
        .replace(/[\s\u0000-\u001f\u007f]+/g, ' ')
        .trim();
}

async function withProviderTimeout(operation) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
        return await operation(controller.signal);
    } finally {
        clearTimeout(timeoutId);
    }
}

function getAllowedTurnstileHostnames(env) {
    const configured = String(env.TURNSTILE_ALLOWED_HOSTNAMES || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    if (configured.length) {
        return new Set(configured);
    }

    return new Set(DEFAULT_TURNSTILE_HOSTNAMES);
}

export async function onRequestPost({ request, env }) {
    const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
        return json({ ok: false, error: 'unsupported_media_type' }, 415);
    }

    if (Number(request.headers.get('content-length')) > REQUEST_BODY_MAX_BYTES) {
        return json({ ok: false, error: 'payload_too_large' }, 413);
    }

    let body;
    let reader;
    let bodyTimedOut = false;
    const bodyTimeout = setTimeout(() => {
        bodyTimedOut = true;
        void reader?.cancel().catch(() => {});
    }, REQUEST_BODY_TIMEOUT_MS);
    try {
        if (!request.body) {
            return json({ ok: false, error: 'invalid_json' }, 400);
        }
        reader = request.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        let bytes = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (bodyTimedOut) {
                return json({ ok: false, error: 'request_timeout' }, 408);
            }
            if (done) break;
            bytes += value.byteLength;
            if (bytes > REQUEST_BODY_MAX_BYTES) {
                // Do not await cancellation of an untrusted request stream.
                void reader.cancel().catch(() => {});
                return json({ ok: false, error: 'payload_too_large' }, 413);
            }
            text += decoder.decode(value, { stream: true });
        }
        body = JSON.parse(text + decoder.decode());
    } catch {
        return json({ ok: false, error: bodyTimedOut ? 'request_timeout' : 'invalid_json' }, bodyTimedOut ? 408 : 400);
    } finally {
        clearTimeout(bodyTimeout);
        reader?.releaseLock();
    }

    const fields = ['name', 'email', 'subject', 'message', 'honeypot', 'turnstileToken'];
    if (
        !body || typeof body !== 'object' || Array.isArray(body) ||
        fields.some((field) => body[field] !== undefined && typeof body[field] !== 'string')
    ) {
        return json({ ok: false, error: 'invalid_fields' }, 400);
    }

    const name = normalizeText(body.name);
    const email = normalizeText(body.email).toLowerCase();
    const subject = normalizeText(body.subject);
    const message = (body.message || '').trim();
    const honeypot = normalizeText(body.honeypot);
    const turnstileToken = (body.turnstileToken || '').trim();

    if (!name || !email || !subject || !message || !turnstileToken) {
        return json({ ok: false, error: 'missing_fields' }, 400);
    }

    if (!EMAIL_RE.test(email)) {
        return json({ ok: false, error: 'invalid_email' }, 400);
    }

    if (honeypot) {
        return json({ ok: false, error: 'honeypot' }, 400);
    }

    if (
        name.length > NAME_MAX_LENGTH ||
        email.length > EMAIL_MAX_LENGTH ||
        subject.length > SUBJECT_MAX_LENGTH ||
        message.length > MESSAGE_MAX_LENGTH ||
        turnstileToken.length > TURNSTILE_TOKEN_MAX_LENGTH
    ) {
        return json({ ok: false, error: 'invalid_length' }, 400);
    }

    const turnstileSecret = String(env.TURNSTILE_SECRET_KEY || '').trim();
    const resendApiKey = String(env.RESEND_API_KEY || '').trim();
    if (!turnstileSecret || !resendApiKey) {
        return json({ ok: false, error: 'server_config' }, 500);
    }

    const verifyPayload = new URLSearchParams();
    verifyPayload.set('secret', turnstileSecret);
    verifyPayload.set('response', turnstileToken);

    const remoteIp = request.headers.get('CF-Connecting-IP');
    if (remoteIp) {
        verifyPayload.set('remoteip', remoteIp);
    }

    let verifyResult;
    try {
        verifyResult = await withProviderTimeout(async (signal) => {
            const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: verifyPayload.toString(),
                signal
            });

            if (!response.ok) {
                void response.body?.cancel().catch(() => {});
                throw new Error('Turnstile verification unavailable');
            }
            return response.json();
        });
    } catch {
        return json({ ok: false, error: 'turnstile' }, 502);
    }

    if (verifyResult?.success !== true) {
        const errorCodes = Array.isArray(verifyResult?.['error-codes']) ? verifyResult['error-codes'] : [];
        if (errorCodes.includes('missing-input-secret') || errorCodes.includes('invalid-input-secret')) {
            return json({ ok: false, error: 'server_config' }, 500);
        }
        return json({ ok: false, error: 'turnstile' }, errorCodes.includes('internal-error') ? 502 : 403);
    }

    const allowedHostnames = getAllowedTurnstileHostnames(env);
    const verifiedHostname = String(verifyResult?.hostname || '').trim().toLowerCase();
    if (!verifiedHostname || !allowedHostnames.has(verifiedHostname)) {
        return json({ ok: false, error: 'turnstile' }, 403);
    }

    const from = env.RESEND_FROM || 'onboarding@resend.dev';
    const to = env.CONTACT_TO || 'hello@cloudwithdavid.com';
    const resendBody = {
        from,
        to: [to],
        subject,
        reply_to: email,
        text: [
            '*Contact form submission*',
            '',
            message,
            '',
            '---',
            `Name: ${name}`,
            `Email: ${email}`
        ].join('\n')
    };

    let resendResponse;
    try {
        resendResponse = await withProviderTimeout((signal) => fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resendBody),
            signal
        }));
    } catch {
        return json({ ok: false, error: 'email' }, 502);
    }

    void resendResponse.body?.cancel().catch(() => {});
    if (!resendResponse.ok) {
        console.error('Resend API error', {
            status: resendResponse.status
        });
        return json({ ok: false, error: 'email' }, 502);
    }

    return json({ ok: true }, 200);
}

export function onRequest() {
    return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });
}
