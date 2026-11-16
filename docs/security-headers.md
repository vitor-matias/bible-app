# Security headers

The pages send a Content Security Policy, a Permissions-Policy and
Cross-Origin-Opener-Policy on top of the older set (X-Frame-Options, nosniff,
Referrer-Policy, HSTS). The test deployment gets them from `vercel.json`; production
is nginx on the VPS, whose config is not in this repository, so the owner applies the
lines below by hand. `/v1/` is left alone on both: the API (Helmet) sends its own
strict CSP, and two CSPs on one response would both apply.

## The policy

```
default-src 'self'; script-src 'self' 'sha256-gnBbdaetSnVqVzVRqxgV1FQC1p87z4tqJ4FdsLYKUuY=' https://umami.dojo.pt; style-src 'self' 'unsafe-inline'; connect-src 'self' https://umami.dojo.pt; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

| Directive | Allows | Why |
| --- | --- | --- |
| `default-src 'self'` | everything else from the page's own origin | covers images, the self-hosted fonts (`media/`), the manifest, the service worker (`ngsw-worker.js`) and Vercel Speed Insights (`/_vercel/…`, preview only). `'self'` also keeps it host-neutral. |
| `script-src` | the bundle, one inline script by hash, Umami's `script.js` | the inline script is the theme script in `src/index.html` (dark theme before the bundle arrives). It is identical on all ~1,400 prerendered pages, so one hash covers them. Event replay is off and hydration state is a JSON data block, which CSP does not govern, so no other inline script exists and no nonce is needed. |
| `style-src 'self' 'unsafe-inline'` | the stylesheet plus inline styles | Angular adds every component's styles as `<style>` elements at runtime, and the prerendered HTML carries `style="…"` attributes (about a hundred on a chapter page). A nonce would have to be minted per response, which static nginx and the service worker's cached `index.csr.html` cannot do, and nonces never cover attributes. Inline CSS cannot run code. |
| `connect-src` | `/v1`, `build-info.json`, `ngsw.json`, Umami's `/api/send` | the API is relative (`v1`) on the web. |
| `object-src 'none'` | no plugins | |
| `base-uri 'self'` | `<base href="/">` | stops an injected `<base>` from redirecting relative URLs. |
| `form-action 'self'` | forms post only here | |
| `frame-ancestors 'self'` | framing by the site itself only | same as `X-Frame-Options: SAMEORIGIN`. |

`Permissions-Policy` turns off what the app never uses (camera, microphone,
geolocation, payment, sensors, USB, …, `browsing-topics`) and keeps `clipboard-write`
(«Copiar ligação») and `screen-wake-lock` (the reader keeps the screen awake while it
scrolls) for the site itself. `web-share` («Partilhar») is not listed: its default is
already `self`, and Chrome logs "Unrecognized feature: 'web-share'" on every page where
it does not support Web Share.

`Cross-Origin-Opener-Policy: same-origin` cuts the link to any window that opens the
site or that it opens. Every outside link already uses `noopener`, so nothing changes.

The Capacitor apps never see these headers: they load the bundle from the device, and
the app reads no response header except the API error's `content-type`.

### When `src/index.html` changes

Editing the inline script changes its hash. `npm run build` runs
`scripts/check-csp.mjs`, which fails when a built inline script is missing from
`vercel.json`'s CSP, or when this file no longer contains that CSP word for word. The
error prints the new hash: put it in `vercel.json` and here, then update the VPS.

## Production (nginx)

On the VPS, `/etc/nginx/sites-enabled/bible-app` includes
`/etc/nginx/snippets/security-headers.conf` at server level and again in every page and
asset location (`= /`, `= /search`, `= /manifest.webmanifest`, `= /index.csr.html`,
`/` and its nested static-file location). The include has to be repeated because an
`add_header` in a location (each of them sets `Cache-Control`) stops it inheriting the
server-level ones. `location /v1/` has no include, and its own
`add_header Cache-Control … always;` is what stops it inheriting the server-level
include, so the API keeps only Helmet's headers. Never remove that line: without any
`add_header` of its own, `/v1/` would inherit the page CSP and send two CSPs, which the
browser applies together (on nginx 1.29.3 or later, `add_header_inherit off;` in that
location would do the same job; production runs 1.26). Adding lines to the snippet
therefore covers every page and asset in one edit and leaves `/v1/` untouched; the
`/v1/books` curl check below confirms it. Assets (`.js`, `.css`, fonts) get the CSP too;
browsers ignore it on them, except on `ngsw-worker.js`, where it governs the service
worker, which only fetches from the site and from Umami (tested).

### Step 1: report-only (a few days)

Append to `/etc/nginx/snippets/security-headers.conf`:

```nginx
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'sha256-gnBbdaetSnVqVzVRqxgV1FQC1p87z4tqJ4FdsLYKUuY=' https://umami.dojo.pt; style-src 'self' 'unsafe-inline'; connect-src 'self' https://umami.dojo.pt; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" always;
add_header Permissions-Policy "accelerometer=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), serial=(), usb=(), xr-spatial-tracking=(), clipboard-write=(self), screen-wake-lock=(self)" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
# pages and an asset carry the new headers
for p in / /jo/3 /search /indice /manifest.webmanifest; do
  echo "== $p"; curl -sI "https://biblia.capuchinhos.org$p" | grep -iE 'content-security|permissions-policy|cross-origin-opener|x-frame|strict-transport'
done
curl -sI "https://biblia.capuchinhos.org/$(curl -s https://biblia.capuchinhos.org/ | grep -o 'main-[A-Z0-9]*\.js')" | grep -iE 'content-security|cache-control'
# /v1 keeps exactly one CSP, Helmet's (expect a single content-security-policy line, no permissions-policy)
curl -sI https://biblia.capuchinhos.org/v1/books | grep -iE 'content-security|permissions-policy|cross-origin-opener'
```

Report-only blocks nothing; violations appear only in the browser console (there is no
report endpoint). Open a few pages in Safari and Chrome with the developer tools open,
read a chapter, search, open the index and the menu, and look for
"Content Security Policy" messages. None appeared in the local test below.

### Step 2: enforce

In the same file, rename `Content-Security-Policy-Report-Only` to
`Content-Security-Policy`, then run `nginx -t`, reload and repeat the `curl` checks.

Browsers that already have the service worker get pages from its cache, with the headers
the page was cached with, so they pick up a header change with the next app release.
New visitors and plain browser tabs get it at once.

### Unknown URLs

`error_page 404 /index.html` answers unknown URLs with the app shell's body and a real
404 status, so the app's own not-found handling runs on them. They get the same headers,
through the `location /` include.

## How it was tested

The production build was served with these headers by a small static server that read
them from `vercel.json`, and driven with Playwright in Chromium and WebKit: onboarding,
reader and chapter keys, footnotes, bookmarks, search by words and by reference, the
pastoral index and a citation from it, `/app`, «Copiar ligação» (Chromium; the clipboard
held the link), «Partilhar» (WebKit), a problem report with the real Umami script and
`/api/send` answered locally, service worker registration and an offline reload. A
`securitypolicyviolation` listener caught nothing. As a check that the policy was
enforced, an inline script injected into the page was blocked and reported in both
browsers.
