# Performance

## Measure first paint with Lighthouse

```bash
npx -y lighthouse@latest <url> --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --output=json --output-path=report.json
node -e 'console.log(require("./report.json").audits.metrics.details.items[0].observedFirstContentfulPaint)'
```

- Use `--blocked-url-patterns=...` to bisect (block scripts, fonts or images and see which
  one moves the number).
- Measure a **chapter page** (`/gn/1`), not just `/`: that is where the verse text and the
  PT Serif font are. Chapter pages only exist when the prerender had an API. `npm run build`
  with `PRERENDER_API_ORIGIN=http://127.0.0.1:1` prerenders just two routes (the fetch to port
  1 is refused), so for chapter pages point the build at a local stub API that answers what
  `src/app/prerender-params.ts` asks for (`PRERENDER_API_ORIGIN=http://localhost:PORT`).
- Serve `dist/bible-app/browser` locally with gzip. A plain static server does not compress,
  which makes local load times pessimistic. To imitate a deployment's timing, add an artificial
  delay to the HTML and to the stylesheet response.
- Take several runs per variant (the table below used seven) and compare medians, not single runs.
- Vercel Speed Insights only reports from the preview host (see
  [architecture.md](architecture.md#production-versus-the-preview-deployment)).

## Critical CSS stays off

`angular.json` has `optimization.styles.inlineCritical: false`. Measured on 2026-11-02 with
seven runs per variant and a local stub API:

| | FCP on `/gn/1` | CLS on a chapter page |
|-|-|-|
| inlining off (current) | 339 ms | 0.633 |
| inlining on | 298 ms | 1.025 |
| live site | 341 ms | |

Inlining saves about 40 ms of FCP here, but makes layout shift worse: PT Serif's
`@font-face` rules stay in the external stylesheet, so the text paints in the fallback
font and then swaps. Do not turn `inlineCritical` on unless those font rules are inlined or
the font is preloaded first. The README gives the other cost of inlining (page HTML size).

An earlier measurement (September 2026) saw roughly a second of extra FCP when the stylesheet
arrived a little after the HTML. It no longer reproduces; do not re-enable inlining on that
account.

## Fonts and icons are self-hosted

`src/styles.css` imports fonts from npm packages: `@fontsource/roboto`,
`@fontsource/pt-serif` and `@material-symbols/font-400` (the weight axis pinned to 400,
about 490 kB against several MB for the full variable font). `src/index.html` has no
Google Fonts `<link>`, and no font binaries are committed. The package ships
`font-display: block`.

- Do not add Google Fonts (`fonts.googleapis.com`) or `icon_names=` URLs. The CDN round trip
  made icon names flash as text on phones.
- Do not build a per-icon subset. Material Symbols are **ligatures**: an icon missing from a
  subset does not error, it renders its own name as words (`auto_mode`, `report_problem` and
  `expand_more` shipped broken this way once). Pinning the *weight* axis keeps every icon and
  still cuts the size roughly eightfold.
- If icon names show as text, check that the `@import`s in `src/styles.css` and the installed
  `@material-symbols/font-*` package are intact. Angular Material tags icons with its default
  `material-icons` class even with `MAT_ICON_DEFAULT_OPTIONS`, so the global font rule
  targets both `.material-symbols-outlined` and `.material-icons`. The `expectIconsRendered`
  helper in `e2e/bible-reader.spec.ts` guards this by comparing `scrollWidth` with font size
  across the header, the book selector and the onboarding wizard.
