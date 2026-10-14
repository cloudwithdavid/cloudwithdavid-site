import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const siteRoot = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', siteRoot), 'utf8');
const siteUrl = 'https://cloudwithdavid.com/';

// Extract markup references without requiring a browser or a runtime dependency.
const tags = [...html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)].map((match) => ({
    name: match[1].toLowerCase(),
    attributes: Object.fromEntries([...match[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
        .map((attribute) => [attribute[1], attribute[2] ?? attribute[3]]))
}));

function assertLocalAssetExists(reference) {
    const assetUrl = new URL(reference.replaceAll('&amp;', '&'), siteUrl);
    if (assetUrl.origin !== new URL(siteUrl).origin) return;
    // Cloudflare supplies its reserved resources at deployment time.
    if (assetUrl.pathname.startsWith('/cdn-cgi/')) return;
    const assetPath = fileURLToPath(new URL(`.${assetUrl.pathname}`, siteRoot));
    assert.ok(existsSync(assetPath), `Missing local asset: ${reference}`);
}

test('rendered images, scripts, styles, icons, and credential assets exist locally', () => {
    for (const { name, attributes } of tags) {
        if (attributes.src) assertLocalAssetExists(attributes.src);
        if (attributes['data-modal-src']) assertLocalAssetExists(attributes['data-modal-src']);
        if (name === 'link' && /^(stylesheet|icon|manifest)$/.test(attributes.rel)) {
            assertLocalAssetExists(attributes.href);
        }
    }
    const manifest = JSON.parse(readFileSync(new URL('assets/favicon/site.webmanifest', siteRoot), 'utf8'));
    manifest.icons.forEach((icon) => assertLocalAssetExists(icon.src));
});

test('fragment links and accessible control references resolve to unique elements', () => {
    const ids = tags.map(({ attributes }) => attributes.id).filter(Boolean);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'Element IDs must be unique');
    for (const { attributes } of tags) {
        if (attributes.href?.startsWith('#') && attributes.href !== '#') {
            assert.ok(uniqueIds.has(attributes.href.slice(1)), `Missing fragment: ${attributes.href}`);
        }
        for (const attribute of ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) {
            for (const id of (attributes[attribute] || '').split(/\s+/).filter(Boolean)) {
                assert.ok(uniqueIds.has(id), `Missing ${attribute} target: ${id}`);
            }
        }
    }
});
