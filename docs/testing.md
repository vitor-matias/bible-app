# Testing

## Commands

```bash
npx ng test --watch=false                                      # all web specs (what CI runs)
npx ng test --watch=false \
  --include='src/app/components/search/*.spec.ts'              # a subset, to bisect a failure
npm run e2e                                                    # Playwright, e2e/; starts `npm start` itself
(cd android && ./gradlew testDebugUnitTest lintDebug)          # Android JVM tests + lint
```

The iOS tests run with `xcodebuild test`, as the *iOS* job in
`.github/workflows/ios.yml` does.

Web specs run in Vitest browser mode on Playwright's Chromium, so a fresh machine
needs `npx playwright install chromium` once. CLAUDE.md has the Vitest conventions.

`npm run e2e` reads the real books, chapters and search results from the public
API through `proxy.conf.js`, so it needs a network. The icon helpers in
`e2e/bible-reader.spec.ts` (`expectIconsRendered`) fail when a Material Symbols
ligature renders as its own name in words.

## Write specs with TestBed

Build components through `TestBed`, not `new Component(...)`, so injection
context mistakes show up in the spec.

### Inputs on a host fixture: use `setInput`

Assigning a host component's field and calling `detectChanges()` did not run the
child's `ngOnChanges` in this TestBed setup. Drive inputs with
`fixture.componentRef.setInput("name", value)`.

### State changed outside a template listener needs marking

The app is zoneless, so a field written in a timer, promise, observer or native
callback repaints only if something marks it: `markForCheck()`, `detectChanges()`,
a signal, an `async` pipe or an output. Template listeners mark their own component.

Test the render **without** a `detectChanges()` of your own when the marking is
what the spec is for: that is the condition that fails.

### Theme-dependent styles: headless Chrome follows the OS

Headless Chromium takes the machine's `prefers-color-scheme`, so on a Mac in dark mode
any spec that does not mock `ThemeService` gets `.dark-theme` on `<html>`. A
"light theme" assertion then fails locally and passes in CI. In such a spec:

- record `classList.contains("dark-theme")` in `beforeEach`, remove it,
- add it explicitly in the dark case,
- restore it in `afterEach`.

See the `search.component.spec.ts` dark-theme block. `src/app/testing/contrast.ts`
has `contrastRatio()` for WCAG assertions.

### `routerLink` inside a `mat-menu` item

In `header.component.spec.ts` the `Router` is a bare
`createSpyObj("Router", ["navigate"])`. A
`<button mat-menu-item routerLink="...">` then never appears in the opened
overlay: `RouterLink` cannot instantiate against the spy inside the menu's lazily
created view, and the error is swallowed, so the only symptom is "item not found".
Give navigating menu entries a click handler that closes the menu and calls
`router.navigate([...])`; the spy can assert that directly.

### Template getters that allocate

A getter that returns a fresh array or object on every change detection, used
with `@for (...; track <object>)`, makes Angular recreate those rows each pass.
Real clicks and key presses on them fail mid-gesture while `element.click()`
works. Memoize the getter (see `chaptersWithIntro` in `bible-reader.component.ts`)
and track by a stable key such as `chapter.number`.

## The shared native payloads

`native-contract/*.json` are the exact payloads the web app sends to the native
bars. Three suites read the same files: `src/app/services/native-contract.spec.ts`
(the web service must produce them), `android/.../ChromeContractTest.kt` and
`ios/App/AppTests/ChromeStateTests.swift` (the shells must parse them). Changing
`NativeChromeState` means updating the JSON and all three. See
[architecture.md](architecture.md#native-chrome).

## Debugging the dev server

When what the browser does contradicts the code on disk, restart before you
theorise: `pkill -f "ng serve" && npm start`. After a run of rapid edits `ng serve`
(HMR) goes stale in three recognisable ways:

- **A destroyed `ChangeDetectorRef`.** A live component keeps a `cdr` whose view
  was destroyed, so every `detectChanges()` is a silent no-op: some state updates
  (title, URL) while the rest of the template stays old, which looks like a
  routing bug. Check in the console:

  ```js
  ng.getComponent(document.querySelector('bible-reader')).cdr.destroyed  // true = restart
  ng.applyChanges(ng.getComponent(document.querySelector('bible-reader'))) // repaints if state is fine
  ```

  The dev-server log line `Component update sent to client(s).` means a template
  or stylesheet was hot-swapped; expect this symptom on that component until you
  restart, even after a full reload.
- **Two copies of Angular.** Adding a new third-party import mid-session (for
  example `@angular/cdk/overlay`) makes Vite re-optimise its dependencies; the page
  then mixes chunks from two `?v=<hash>` versions and `inject()` inside them throws
  `NG0203`. Count the versions:

  ```js
  [...new Set(performance.getEntriesByType('resource').map(e => (e.name.match(/[?&]v=([0-9a-f]+)/) || [])[1]).filter(Boolean))]
  ```

  More than one hash: restart and reload. An app in a simulator in live-reload mode
  loads the same server and breaks the same way.
- **Old markup or an empty page** while `ng.getComponent()` shows good state.

Also: `element.click()` skips hit-testing and pointer delivery, so it does not
prove a real click works. Check `document.elementFromPoint(x, y)` as well.

## Multi-device playtest

For a pre-release pass over phones, tablets, foldables and desktop:

1. Build the branch in a scratch worktree (`npm run build`) and serve
   `dist/bible-app/browser` with a small Node static server that falls back to
   `index.csr.html` and proxies `/v1/*` to the production API. Local servers do not
   gzip, so load times are pessimistic.
2. Use Playwright with the installed Chrome (`chromium.launch({ channel: 'chrome' })`)
   for Chrome profiles; do not run `playwright install` for it.
3. Block analytics in the browser context (`googletagmanager`, `google.com/ccm`,
   `umami.`). The "Reportar erro" menu entry only shows when `window.umami.track`
   exists (`AnalyticsService.areAnalyticsAvailable`), so stub it for report tests.
4. Sizes in CSS pixels for the iPhone Duo: outer screen 466x678, inner 669x951.
   The inner screen in landscape (951) and large phones turned sideways cross the
   768 px breakpoint and get the desktop layout.
5. Android WebView: Playwright's `_android` attaches to the debug build with
   `device.webView({ pkg: 'org.capuchinhos.biblia' })`, and forces a light
   `prefers-color-scheme` while attached. It sees only the WebView, not the native
   Compose bars: for those drive `adb shell input`, read `uiautomator dump` (Compose
   semantics appear in it) and reach the page through
   `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`.

Playwright's bundled WebKit has reproduced some Safari layout bugs and missed
others (see [ios.md](ios.md#safari-and-webkit)), so a pass there proves nothing
on its own; confirm Safari-only bugs in the iOS simulator.
