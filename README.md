# CloudWithDavid.com

This repository contains the source code for my personal website, [cloudwithdavid.com](https://cloudwithdavid.com).

## Purpose

The site functions as my public technical home for projects, writing, and visible proof of progress. It is a custom-built static frontend with Cloudflare-based serverless handling for contact submissions, security hardening, and deployment.

## Stack
<!-- markdownlint-disable MD033 -->
<div align="center">
  <img alt="HTML" src="https://img.shields.io/badge/HTML-E34F26?style=for-the-badge&logo=html5&logoColor=white" />
  <img alt="CSS" src="https://img.shields.io/badge/CSS-663399?style=for-the-badge&logo=css&logoColor=white" />
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111111" />
</div>

<div align="center">
  <img alt="Cloudflare Pages Functions Turnstile" src="https://img.shields.io/badge/Cloudflare%20%7C%20Pages%20%7C%20Functions%20%7C%20Turnstile-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
  <img alt="Resend" src="https://img.shields.io/badge/Resend-000000?style=for-the-badge&logo=resend&logoColor=white" />
</div>

## Notable Implementation Details

- custom responsive frontend built without a framework
- light/dark theme handling with persisted preference
- custom interactions and animated UI states in vanilla JavaScript
- Cloudflare Functions-based contact form handling
- bot protection with Cloudflare Turnstile
- email delivery through Resend
- canonical host enforcement and HTTPS redirects
- security headers via middleware
- SEO foundations including metadata, canonical tags, robots.txt, sitemap, and structured data

## Project Structure

### Core frontend

- `index.html` - main site markup
- `css/style.css` - main site styling
- `js/main.js` - frontend interactions and UI behavior

### Serverless / edge logic

- `functions/api/contact.js` - contact form submission handler
- `functions/api/contact-health.js` - protected health endpoint for contact flow
- `functions/_middleware.js` - redirects and security header handling

### Assets

- `assets/certs/` - certification images
- `assets/favicon/` - favicon and app icon assets
- `assets/og/` - Open Graph and social preview assets

### Site configuration

- `_headers` - static response headers; keep at the publish root for Cloudflare Pages
- `_redirects` - redirect rules; keep at the publish root for Cloudflare Pages
- `robots.txt` - crawler directives; keep at `/robots.txt`
- `sitemap.xml` - sitemap for search engines; keep at `/sitemap.xml`
- `favicon.ico` - root favicon; keep at `/favicon.ico`

### Local tooling

- `.githooks/pre-commit` - local Git hook
- `.vscode/settings.json` - workspace settings
- `scripts/` - helper scripts for local serving and asset/version workflows, including `scripts/main.ps1`
