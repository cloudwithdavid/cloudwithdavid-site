# [CloudWithDavid.com](https://cloudwithdavid.com)

A custom static portfolio built with HTML, CSS, and vanilla JavaScript, deployed on Cloudflare Pages. Contact submissions use Pages Functions, Turnstile, and Resend.

## Production files

- `index.html` — site markup and metadata
- `css/style.css` — design variables, base styles, components, responsive layouts, and both themes
- `css/hero-layout.css` — exported hero positions and sizing
- `js/main.js` — site interactions, theme switching, and contact form
- `js/scroll-scenes.js` — responsive About and Projects scrolling
- `assets/` and `favicon.ico` — site artwork, icons, and social preview
- `functions/` — contact endpoints, canonical redirects, and security middleware
- `_headers`, `_redirects`, `robots.txt`, and `sitemap.xml` — headers, routing, and SEO

## Deployment

Use `main` as the Cloudflare Pages production branch and the repository root as the output directory. No build command or package installation is required.

Keep the existing Pages configuration, including `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, the optional `RESEND_FROM` address, and the protected contact-health endpoint settings. The contact recipient is fixed in the server handler.

For a static preview, run `python3 -m http.server 8000`. Contact API requests require the Cloudflare Functions runtime and configured services.

Private development tools are kept in the ignored `.tools/` directory and are excluded from Git.
