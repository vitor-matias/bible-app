# Bíblia Sagrada

An offline-first Bible reader for the Portuguese Capuchin friars
([biblia.capuchinhos.org](https://biblia.capuchinhos.org/)), shipped as a
Progressive Web App and as native iOS/Android apps via Capacitor.

Built with Angular 22 (standalone, zoneless-friendly, `OnPush` throughout),
Angular Material, and a thin REST backend.

## Features

- **Offline-first reading** — books, chapters, and verses are cached in IndexedDB,
  so previously visited content (and pre-fetched data) works with no connection.
- **Two reading modes** — continuous `scrolling` and column-based `paged`, toggled
  per-reader and persisted.
- **Touch & keyboard navigation** — swipe or arrow keys to change chapter/page,
  pinch-to-zoom and ±buttons for font size.
- **Auto-scroll** — hands-free reading at an adjustable lines-per-second speed.
- **Search** — full-text and semantic search across the translation.
- **Cross-reference linking** — references inside verses and footnotes (e.g.
  `Gn 1,1`, `Jb 38,1-39,30`, `v.12`) are parsed and turned into navigable links.
- **Bookmarks, footnotes, dark mode**, PWA install, and share support.

## Tech stack

| Area            | Choice |
|-----------------|--------|
| Framework       | Angular 22 (standalone components, `OnPush`) |
| UI              | Angular Material + Bootstrap 5 |
| Reactivity      | RxJS 7 |
| Native shell    | Capacitor 8 (iOS / Android) |
| Offline cache   | IndexedDB (`DatabaseService` / `OfflineDataService`) |
| PWA             | Angular Service Worker (`ngsw-config.json`) |
| Lint / format   | Biome |
| Tests           | Karma + Jasmine |

## Getting started

Prerequisites: Node 20+ and npm.

```bash
npm ci
npm start          # ng serve --host 0.0.0.0 on http://localhost:4200
```

The dev server proxies `/v1/**` to the production backend
(`https://biblia.capuchinhos.org/`) via [proxy.conf.js](proxy.conf.js), so the app
has real data with no local backend. The API base URL is resolved in
[src/app/config.ts](src/app/config.ts) (`/v1` on the web, absolute domain on native).

## npm scripts

| Script | Does |
|--------|------|
| `npm start` | Dev server with backend proxy |
| `npm run build` | Production build + writes build metadata (`build:post`) |
| `npm run watch` | Development build in watch mode |
| `npm test` | Unit tests (Karma) |
| `npm run test:coverage` | Unit tests with coverage |
| `npm run biome` | Lint + format with autofix (`--write --unsafe`) over `src` |
| `npm run sitemap` | Regenerate `sitemap.xml` from the prerendered pages in `dist` (also runs in `build:post`; needs a build first) |
| `npm run cap:sync` | Sync web build into native projects |
| `npm run cap:ios` / `cap:android` | Add a native platform, sync, generate icons |

## Prerendering (static SSG)

`npm run build` prerenders every book/chapter route to static HTML
(`dist/bible-app/browser/<book>/<chapter>/index.html`) with the real verse
text, per-page meta tags and JSON-LD baked in. The route list and chapter
content come from the live API at build time (`/v1/books`), so the build
machine needs network access to `biblia.capuchinhos.org` — without it the
build still succeeds and every route silently falls back to the classic
client-rendered SPA. Set `PRERENDER_API_ORIGIN=http://localhost:PORT` to
point the prerenderer (and server-side API calls) at a stub API for testing.
`/` is prerendered too — it is the URL that should rank for the site's main
queries, so it ships the About copy and the crawlable book index as real HTML.
`/search` and unknown routes stay client-rendered
(`src/app/app.routes.server.ts`). The client-rendered fallback shell is emitted
as `index.csr.html`; `index.html` is the prerendered home page, and
`scripts/copy-csr-index.mjs` only fills in `index.html` from the shell if a
build ever stops prerendering `/`.

`sitemap.xml` is generated in `build:post` by reading the prerendered pages
back out of the build output, so it always lists exactly the URLs that were
rendered. It is only ever written into `dist` — `public/sitemap.xml` is a
checked-in home-page-only fallback that exists so `robots.txt` never points at
a 404, and a build that prerendered nothing leaves it in place.

Critical-CSS inlining is deliberately off (`optimization.styles.inlineCritical`
in `angular.json`): with the Material theme and a fully prerendered DOM,
essentially the whole ~143KB stylesheet was classed as critical and inlined
into every page on top of the external stylesheet link, taking per-page HTML
from ~166KB to ~241KB and the CSR shell from 3.3KB to 74KB.

## Mobile (Capacitor)

```bash
npm run build         # produces dist/bible-app/browser
npm run cap:android   # or cap:ios — first run adds the platform
npx cap open android  # open in Android Studio / Xcode
```

`cap:sync`/`cap:ios`/`cap:android` first run `cap:prune`, which copies the build
into `dist/bible-app/capacitor` (the `webDir`) without the ~1300 prerendered
route pages — they would add tens of MB to the APK/IPA for a shell that loads
the site remotely anyway. The copy is what gets stripped; `dist/bible-app/browser`
stays intact, since that is what the web deploy publishes.

App identity lives in [capacitor.config.ts](capacitor.config.ts)
(`org.capuchinhos.biblia`). Set `CAPACITOR_SERVER_URL` to point a native build at a
different backend.

## Architecture

- **Routing** ([app.routes.ts](src/app/app.routes.ts)) — `/:book/:chapter` renders
  `BibleReaderComponent`; `/search` is lazy-loaded; unknown paths fall back to the
  reader (which restores the last-read location).
- **Data flow** — components talk to [`BibleApiService`](src/app/services/bible-api.service.ts),
  which checks the IndexedDB cache first and only falls back to HTTP when online.
  Concurrent requests for the same chapter/books are de-duplicated via `shareReplay`.
- **Domain types** — Bible content is modeled in
  [src/app/@types/types.d.ts](src/app/@types/types.d.ts) (`Book`, `Chapter`,
  and `Verse`). The backend serves the parsed
  JSON; the client renders it.
- **Feature components** live under `src/app/components/`, cross-cutting logic under
  `src/app/services/`, and gesture/navigation behavior under `src/app/directives/`.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs Biome (`biome ci`),
headless unit tests, and a production build on every push.
`build-all-platforms.yml` handles platform builds.

## Conventions

- Formatting and linting are enforced by **Biome** — run `npm run biome` before
  committing. CI fails on violations.
- Prefer standalone components, `ChangeDetectionStrategy.OnPush`, and RxJS teardown
  via `takeUntil(destroy$)` to match the existing code.
