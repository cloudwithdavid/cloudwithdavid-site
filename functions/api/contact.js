const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim();
    const subject = String(body?.subject || '').trim();
    const message = String(body?.message || '').trim();
    const honeypot = String(body?.honeypot || '').trim();
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

    const from = env.RESEND_FROM || 'onboarding@resend.dev';
    const to = env.CONTACT_TO || 'cloudwithdavid@gmail.com';
    const resendBody = {
        from,
        to: [to],
        subject: `[CWD] ${subject}`,
        reply_to: email,
        text: [
            'Cloud With David contact form submission',
            '',
            `Name: ${name}`,
            `Email: ${email}`,
            `Subject: ${subject}`,
            '',
            'Message:',
            message
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
        return json({ ok: false, error: 'email', details }, 502);
    }

    return json({ ok: true }, 200);
}
