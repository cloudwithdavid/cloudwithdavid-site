const CANONICAL_HOST = 'cloudwithdavid.com';
const WWW_HOST = 'www.cloudwithdavid.com';

export function onRequest(context) {
    const url = new URL(context.request.url);
    const hostname = url.hostname.toLowerCase();

    if (hostname === WWW_HOST) {
        url.hostname = CANONICAL_HOST;
        url.protocol = 'https:';
        return Response.redirect(url.toString(), 301);
    }

    return context.next();
}
