function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function hasValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || '').trim());
}

function safeEmailHint(value) {
    const raw = String(value || '').trim();
    if (!looksLikeEmail(raw)) return null;
    const parts = raw.split('@');
    const local = parts[0];
    const domain = parts[1];
    if (!local || !domain) return null;
    const localHint = local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}***`;
    return `${localHint}@${domain}`;
}

export function onRequestGet({ env }) {
    const checks = {
        TURNSTILE_SECRET_KEY: hasValue(env.TURNSTILE_SECRET_KEY),
        RESEND_API_KEY: hasValue(env.RESEND_API_KEY),
        RESEND_FROM: hasValue(env.RESEND_FROM),
        CONTACT_TO: hasValue(env.CONTACT_TO)
    };

    const requiredReady = checks.TURNSTILE_SECRET_KEY && checks.RESEND_API_KEY;
    const recommendedReady = checks.RESEND_FROM && checks.CONTACT_TO;
    const isHealthy = requiredReady;

    const response = {
        ok: isHealthy,
        endpoint: '/api/contact',
        checks,
        requiredReady,
        recommendedReady,
        hints: {
            resendFrom: safeEmailHint(env.RESEND_FROM),
            contactTo: safeEmailHint(env.CONTACT_TO)
        },
        timestamp: new Date().toISOString()
    };

    return json(response, isHealthy ? 200 : 503);
}

