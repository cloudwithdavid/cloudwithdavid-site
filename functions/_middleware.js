const CANONICAL_HOST = 'cloudwithdavid.com';
const WWW_HOST = 'www.cloudwithdavid.com';
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    // Hashes cover the inline theme bootstrap and JSON-LD in index.html.
    // Keep this policy and _headers in sync; npm test checks the hashes.
    "script-src 'self' 'sha256-jW63N2sbMMHrCfafQcMA+XnRtdOVJJVrQdKnX7m+bhk=' 'sha256-FCwVCN6JzcXw4hW7BGIfIf/OlX8AFjaSqIWYGhxzeqc=' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    "connect-src 'self' https://challenges.cloudflare.com https://free.freeipapi.com https://cloudflareinsights.com",
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
    } else {
        headers.delete('Strict-Transport-Security');
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
    const securityOptions = { isHttps: url.protocol === 'https:', isLocalhost };

    if (hostname === WWW_HOST || (hostname === CANONICAL_HOST && url.protocol !== 'https:')) {
        url.hostname = CANONICAL_HOST;
        url.protocol = 'https:';
        // Preserve request bodies when redirecting contact submissions.
        const status = ['GET', 'HEAD'].includes(context.request.method) ? 301 : 308;
        return withSecurityHeaders(Response.redirect(url.toString(), status), securityOptions);
    }

    // Keep the intentionally unavailable resume download from serving the SPA fallback.
    if (url.pathname === '/assets/DavidRodriguez_Resume.pdf') {
        return withSecurityHeaders(new Response(null, { status: 404 }), securityOptions);
    }

    const response = await context.next();
    return withSecurityHeaders(response, securityOptions);
}
