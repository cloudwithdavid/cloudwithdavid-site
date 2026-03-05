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

function isAuthorizedRequest(request, env) {
    const expected = String(env.CONTACT_HEALTH_TOKEN || '').trim();
    if (!expected) return false;

    const authHeader = String(request.headers.get('authorization') || '').trim();
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const bearer = bearerMatch ? bearerMatch[1].trim() : '';
    const headerToken = String(request.headers.get('x-health-token') || '').trim();

    return bearer === expected || headerToken === expected;
}

export function onRequestGet({ request, env }) {
    const exposeHealth = String(env.EXPOSE_CONTACT_HEALTH || '').trim().toLowerCase() === 'true';
    if (!exposeHealth) {
        return new Response('Not found', { status: 404 });
    }

    if (!isAuthorizedRequest(request, env)) {
        return new Response('Not found', { status: 404 });
    }

    const hasRequiredConfig = hasValue(env.TURNSTILE_SECRET_KEY) && hasValue(env.RESEND_API_KEY);
    const isHealthy = hasRequiredConfig;

    const response = {
        ok: isHealthy,
        endpoint: '/api/contact',
        timestamp: new Date().toISOString()
    };

    return json(response, isHealthy ? 200 : 503);
}
