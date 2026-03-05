const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
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

function normalizeText(value) {
    return String(value || '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
