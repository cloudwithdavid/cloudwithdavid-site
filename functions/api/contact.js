const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const DEFAULT_RATE_LIMIT_MAX = 5;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const SUBJECT_MAX_LENGTH = 160;
const MESSAGE_MAX_LENGTH = 5000;
const HONEYPOT_MAX_LENGTH = 120;
const DEFAULT_TURNSTILE_HOSTNAMES = ['cloudwithdavid.com', 'www.cloudwithdavid.com'];
const DEFAULT_SECURITY_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: DEFAULT_SECURITY_HEADERS
    });
}

function toPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return fallback;
}

function normalizeText(value) {
    return String(value || '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getClientIp(request) {
    const cfIp = String(request.headers.get('CF-Connecting-IP') || '').trim();
    if (cfIp) return cfIp;

    const forwarded = String(request.headers.get('X-Forwarded-For') || '').trim();
    if (!forwarded) return 'unknown';

    return forwarded.split(',')[0].trim() || 'unknown';
}

function hasKvBinding(env) {
    return Boolean(
        env.CONTACT_RATE_LIMIT_KV &&
        typeof env.CONTACT_RATE_LIMIT_KV.get === 'function' &&
        typeof env.CONTACT_RATE_LIMIT_KV.put === 'function'
    );
}

async function consumeRateLimitToken(env, clientKey, maxRequests, windowMs) {
    if (!hasKvBinding(env)) {
        return { allowed: false, error: 'missing_kv' };
    }

    const now = Date.now();
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const key = `contact-rate:${clientKey}`;
    let bucket = null;

    try {
        bucket = await env.CONTACT_RATE_LIMIT_KV.get(key, 'json');
    } catch {
        return { allowed: false, error: 'kv_read_failed' };
    }

    const current = bucket && typeof bucket === 'object' ? bucket : {};
    const resetAt = Number(current.resetAt || 0);
    const count = Number(current.count || 0);

    if (!resetAt || resetAt <= now) {
        const nextState = { count: 1, resetAt: now + windowMs };
        try {
            await env.CONTACT_RATE_LIMIT_KV.put(key, JSON.stringify(nextState), {
                expirationTtl: windowSeconds * 2
            });
        } catch {
            return { allowed: false, error: 'kv_write_failed' };
        }
        return { allowed: true, retryAfterSeconds: 0 };
    }

    if (count >= maxRequests) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000))
        };
    }

    const updatedState = { count: count + 1, resetAt };
    try {
        await env.CONTACT_RATE_LIMIT_KV.put(key, JSON.stringify(updatedState), {
            expirationTtl: Math.max(1, Math.ceil((resetAt - now) / 1000) + 5)
        });
    } catch {
        return { allowed: false, error: 'kv_write_failed' };
    }

    return { allowed: true, retryAfterSeconds: 0 };
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
    const contentType = String(request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
        return json({ ok: false, error: 'unsupported_media_type' }, 415);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const name = normalizeText(body?.name || '');
    const email = normalizeText(body?.email || '').toLowerCase();
    const subject = normalizeText(body?.subject || '');
    const message = String(body?.message || '').trim();
    const honeypot = normalizeText(body?.honeypot || '');
    const turnstileToken = String(body?.turnstileToken || '').trim();

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
        honeypot.length > HONEYPOT_MAX_LENGTH
    ) {
        return json({ ok: false, error: 'invalid_length' }, 400);
    }

    const rateLimitMax = toPositiveInteger(env.CONTACT_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX);
    const rateLimitWindowSeconds = toPositiveInteger(
        env.CONTACT_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_RATE_LIMIT_WINDOW_SECONDS
    );
    const clientIp = getClientIp(request);
    const rateLimitResult = await consumeRateLimitToken(
        env,
        clientIp,
        rateLimitMax,
        rateLimitWindowSeconds * 1000
    );

    if (!rateLimitResult.allowed) {
        if (rateLimitResult.error) {
            console.error('Contact rate limiter error', {
                error: rateLimitResult.error,
                clientIp
            });
            return json({ ok: false, error: 'server_config' }, 500);
        }

        return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
            status: 429,
            headers: {
                ...DEFAULT_SECURITY_HEADERS,
                'Retry-After': String(rateLimitResult.retryAfterSeconds)
            }
        });
    }

    if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY) {
        return json({ ok: false, error: 'server_config' }, 500);
    }

    const verifyPayload = new URLSearchParams();
    verifyPayload.set('secret', env.TURNSTILE_SECRET_KEY);
    verifyPayload.set('response', turnstileToken);

    const remoteIp = request.headers.get('CF-Connecting-IP');
    if (remoteIp) {
        verifyPayload.set('remoteip', remoteIp);
    }

    let verifyResult;
    try {
        const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: verifyPayload.toString()
        });

        verifyResult = await verifyResponse.json();
    } catch {
        return json({ ok: false, error: 'turnstile' }, 403);
    }

    if (!verifyResult?.success) {
        return json({ ok: false, error: 'turnstile' }, 403);
    }

    const allowedHostnames = getAllowedTurnstileHostnames(env);
    const verifiedHostname = String(verifyResult?.hostname || '').trim().toLowerCase();
    if (!verifiedHostname || !allowedHostnames.has(verifiedHostname)) {
        return json({ ok: false, error: 'turnstile' }, 403);
    }

    const from = env.RESEND_FROM || 'onboarding@resend.dev';
    const to = env.CONTACT_TO || 'cloudwithdavid@gmail.com';
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
        resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resendBody)
        });
    } catch {
        return json({ ok: false, error: 'email' }, 502);
    }

    if (!resendResponse.ok) {
        let details = '';
        try {
            details = await resendResponse.text();
        } catch {
            details = '';
        }
        console.error('Resend API error', {
            status: resendResponse.status,
            details: details.slice(0, 300)
        });
        return json({ ok: false, error: 'email' }, 502);
    }

    return json({ ok: true }, 200);
}
