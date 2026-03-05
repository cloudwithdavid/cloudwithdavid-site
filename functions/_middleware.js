const CANONICAL_HOST = 'cloudwithdavid.com';
const WWW_HOST = 'www.cloudwithdavid.com';
const LOCALHOSTS = new Set(['localhost', '127.0.0.1']);
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "manifest-src 'self'",
    'upgrade-insecure-requests'
].join('; ');

function withSecurityHeaders(response, { isHttps, isLocalhost }) {
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (isHttps && !isLocalhost) {
        headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const hostname = url.hostname.toLowerCase();
    const isLocalhost = LOCALHOSTS.has(hostname);

    if (hostname === WWW_HOST) {
        url.hostname = CANONICAL_HOST;
        url.protocol = 'https:';
        return Response.redirect(url.toString(), 301);
    }

    if (!isLocalhost && hostname === CANONICAL_HOST && url.protocol !== 'https:') {
        url.protocol = 'https:';
        return Response.redirect(url.toString(), 301);
    }

    const response = await context.next();
    return withSecurityHeaders(response, {
        isHttps: url.protocol === 'https:',
        isLocalhost
    });
}
