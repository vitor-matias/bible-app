# Architecture notes

The README has the overview (routing, data flow, prerendering, Capacitor). This
file holds what is easy to get wrong.

## Book introductions

- An introduction is **chapter 0** inside the app and the URL segment `/intro`
  (`/gn/intro`); the legacy `/gn/0` still parses and normalises. Always build and read
  chapter segments with `BookService.getChapterUrlSegment` / `parseChapterUrlSegment`.
  Never truthiness-check a chapter number: `0` is falsy.
- The backend extracts introductions at import time and serves them from `/v1/intros`
  (the listing) and `/v1/intros/:slug`; see `bible-api.service.ts`. Group introductions
  ("Pentateuco") hang off `introSlug` on the groups in `src/app/bible-canon.ts`.
- Some introductions cover several books. `SHARED_BOOK_INTROS` maps a book to the shared
  introduction it opens (1-2 Samuel to `samuel`). `CLUSTER_INTROS` covers books that have
  introductions of their own *and* belong to a cluster with another one (1-2 Corinthians,
  1-2 Thessalonians, the Pastoral letters, the letters of John): the pickers list the
  cluster's introduction as its own tile before the first book (`withIntros`), labelled
  by name ("Cartas de João") instead of "Introdução".
- Develop against a local backend with `API_PROXY_TARGET=http://localhost:3000/ npm start`
  (`proxy.conf.js`); the default is the public API.

## Boot and the book cache

- `src/main.ts` bootstraps with its **own** provider list. The `APP_INITIALIZER` that
  awaits `BookService.initializeBooks()` is in `src/app/app.config.ts`, which only the
  server (prerender) config uses. In the browser and in the native shells nothing
  blocks startup on the book list: the `BookService` constructor starts the load, and a
  failure sets `booksUnavailable$`, which the reader shows as "Não foi possível carregar
  a Bíblia" with a retry. It also retries when the connection returns and when the app
  resumes. A provider that must exist in the app has to be added to **both** files
  (`DepthLocationStrategy` is an example).
- The book cache is IndexedDB. `OfflineDataService.setCachedBooks` calls
  `DatabaseService.clearAndPutAll`, which clears and refills the store in **one
  transaction**, so an interrupted write rolls back. Nothing is cached unless HttpClient
  parsed a whole response, so a truncated body ends on the retry screen and the next launch
  fetches again. The `serverBooksCache` in `bible-api.service.ts` is for prerendering only.
- `/v1/books` and `/v1/intros` time out in the browser after `BOOK_LIST_TIMEOUT_MS`
  (15 s); on the server the prerender's own timeout and retry apply. A books body that is
  not an array throws `UnexpectedBookListError`.
- A failed books request sends the Umami event `books_load_failed`. Its data comes from
  `describeBookListFailure`: `reason` is `timeout`, `network`, `not_json` (an HTTP 200 the
  app could not parse: an HTML page, or cut-off JSON), `http_error`, `not_a_list` or
  `other`, plus `status` and `contentType` for HTTP errors; never the body.
- JSON parsing happens in the web view, so malformed data cannot kill the native process.
- The persisted `Book` shape is schema-versioned: bump `cacheSchemaVersion` in
  `OfflineDataService` (stored as `booksCacheSchemaVersion`) when it changes.

## Reader layout variables

`src/styles.css` defines the contract between the reader and whatever sits above and below
it:

| Variable | Web | Under `.native-chrome bible-reader` |
|----------|-----|-------------------------------------|
| `--app-header-height` | `56px + env(safe-area-inset-top)` | `0px` (no web header) |
| `--app-chrome-top` | `0px` | `--native-chrome-top` (the native top bar) |
| `--app-chrome-bottom` | `0px` | `--native-chrome-bottom` (the native toolbar) |
| `--app-inset-bottom` | `env(safe-area-inset-bottom)` | the bottom bar (`--app-chrome-bottom`) |
| `--app-reader-gap` | the reader's own margin | `8px` (UIKit's layout margin) |

Visible reader height everywhere is
`100dvh - var(--app-header-height) - var(--app-chrome-top) - var(--app-inset-bottom)`.
Size every new reader-level view with these variables, never with `56px` or `env()`
directly, and check it on the native shells, not just the web. A scroll-snapping scroller
also needs `scroll-padding-top: var(--app-chrome-top)` and
`scroll-padding-bottom: var(--app-chrome-bottom, 0px)`. Fixed footers span with
`left/right: var(--app-inset-left/right)` (and `width: auto`). `--native-chrome-top/-bottom`
are set on `<html>` by `NativeChromeService.applyInsets`.

The native pages pad their scrolling content (`.native-chrome bible-reader .mat-drawer-content`)
by those bars, so the text scrolls under the glass.

Component styles have a budget: `angular.json` sets `anyComponentStyle` to warn at 4 kB and
fail at 6 kB, and `bible-reader.component.css` is already close to the cap, so a few hundred
bytes of reader CSS can fail `build` (and the Android job) while lint and unit tests stay
green. Rules that are global in nature can live in `src/styles.css`, which has no budget
(mind the specificity against component `[_ngcontent]` selectors). See
[build.md](build.md#reproducing-the-build-failures-locally).

## Native chrome

The iOS and Android apps draw their bars, menus and sheets natively and keep the Angular
app as the source of truth. The web side is `NativeChromeService`
(`src/app/services/native-chrome.service.ts`), the plugin is `NativeChrome`
(`ios/App/App/NativeChrome.swift`, `android/.../chrome/NativeChromePlugin.kt`), and the
contract is the `NativeChromePlugin` interface in that service file.

- **Web to native.** `setState(NativeChromeState)` says what the bars show. The mode is
  `reader`, `search`, `page` (a titled page) or `none`. Pages send state and render no web
  header of their own on the native apps. Sheets (`showPicker`, `showBookmarks`,
  `showFootnotes`, `showReport`, `showOnboarding`, `share`) resolve once dismissed or with
  `presented: false` if they could not come up. A sheet on its way out is waited for,
  and its `*-closed` event comes before the answer.
- **Native to web.** The `action` event (a `NativeChromeAction` id: `passage`, `previous`,
  `next`, `goto`, `bookmark-*`, `font-*`, ...), `insets` (the space the bars cover, which
  becomes `--native-chrome-top/-bottom`) and, on Android, `palette`.
- **The contract is fixed.** The reader's menus come from the `ReaderChrome` interface (and
  its Swift and Kotlin counterparts). A new web menu entry is invisible in the apps until
  the contract is extended in all three places; a new state field also needs a payload in
  `native-contract/`.
- **`native-contract/`** holds JSON payloads (`reader.json`, `reader-minimal.json`,
  `reader-filter.json`, `search.json`, `page.json`, `none.json`) that the web service must produce
  (`native-contract.spec.ts`) and the Android (`ChromeContractTest.kt`) and iOS
  (`ChromeStateTests.swift`) shells must parse, so the three copies cannot drift. The iOS
  bars ignore `scrolled`, `subtitle`, `textSize` and `pageColor`, which only Android uses.
  CI runs the iOS job when `native-contract/**` changes.
- **The pastoral index is a book to the bars.** It sends `mode: "reader"` with no chapter
  navigation, `viewMode: null` and `autoScrollAvailable: false` (which leaves auto-scroll out
  of the menu), so the passage button, Marcadores, search and the menus are the reader's. Its
  list stays in the web view under `pastoral-index.native.css` (`:host(.ios)`, `:host(.android)`).
  `filterPlaceholder`, `filterOpen` and `query` give it a filter button in the arrows' place and
  the platform's search field, and it passes `document` to `trackScroll`, as the page scrolls
  the document. Scrolling it does itself after a tap goes through `holdBars`.
- **Overlays.** The native bars sit above the whole web view, so a web dialog or bottom
  sheet would open beneath them. While one is open (a CDK dark backdrop shows) the
  reader's bars slide away and any remaining bars turn `inert`; the apps show bookmarks,
  notes, the report form, onboarding and the picker as native sheets instead. The bars
  float without changing the web view's safe area, so hiding them never changes layout.
- **Body classes.** `NativeShellService` adds `platform-ios` / `platform-android` and
  `NativeChromeService.init` adds `native-chrome`. Keep platform-only CSS under those
  (`.platform-ios.native-chrome ...`); iOS-only effects such as backdrop-blur edge fades
  must not leak to Android.
- **Colours that exist in three places.** The bookmark ribbon tones are `--ribbon-*` in
  `styles.css` and `ribbonColor` in the Kotlin and Swift shells: change a tone in all three.
  `--android-surface-container-high` is set from the plugin's `palette` event.
- Platform guides: [ios.md](ios.md) and [android.md](android.md). iOS follows Apple's
  HIG (bars are monochrome; no glass in the content layer); Android follows Material 3.

## Production versus the preview deployment

`vercel.json` configures the preview (test) deployment only. It rewrites unknown paths to
`/index.csr.html` and proxies `/v1/*` to the production API. Do not infer production
behaviour (redirects, 404s, caching, headers, HTTP/2, how the prerendered pages are
delivered) from it: production serves the same `dist/bible-app/browser` from its own web
server. `injectSpeedInsights()` in `app.component.ts` only runs on Vercel hosts
(`isVercelHost`), so Speed Insights data exists for the preview only.
