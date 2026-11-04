# iOS

The iOS app is the web bundle in a Capacitor web view, with the bars, sheets and
menus drawn natively (Liquid Glass). The Angular app stays the source of truth;
see [architecture.md](architecture.md#native-chrome) for the contract between the two.
Native code is in `ios/App/App/` (`ChromeViewController.swift` is the window root,
`NativeChrome.swift` the Capacitor plugin, `PassagePicker.swift` the book picker).

## Build and run in the simulator

```bash
npm ci
npm run build && npm run cap:ios          # build, prune the prerendered pages, cap sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath <scratch> build
xcrun simctl install <udid> <scratch>/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch --console-pty <udid> org.capuchinhos.biblia.dev > bridge.log
```

- Debug builds use the bundle ID `org.capuchinhos.biblia.dev`; Release builds use
  `org.capuchinhos.biblia`. Use the matching ID for `simctl launch` and
  `simctl get_app_container`.
- Plain `npx cap sync ios` without `cap:prune` first leaves a stale bundle: the
  `webDir` (`dist/bible-app/capacitor`) only exists after `cap:prune`.
- `ios/App/CapApp-SPM/Package.swift` points at `node_modules/@capacitor/*`. After a
  merge that adds a Capacitor plugin, run `npm ci`; a worktree needs its own real
  `node_modules` (a symlink to another checkout's is not enough) when the branch adds
  plugins. Xcode failing with `Missing package product 'CapApp-SPM'` while a CLI build
  works is stale package state: `npm ci`, then File > Packages > Reset Package
  Caches in Xcode. To see the GUI's real error:
  `gunzip -c ~/Library/Developer/Xcode/DerivedData/App-*/Logs/Build/<newest>.xcactivitylog | strings | grep -i error`.
- Simulator Debug builds keep the app's code in `App.debug.dylib`; see
  [crash-reports.md](crash-reports.md) for what that changes.

### Live reload, and undoing it

```bash
npm start
CAPACITOR_LIVE_RELOAD_URL=http://localhost:4200 npx cap sync ios
```

The simulator reaches the Mac's `localhost`. The URL is written into the gitignored
`ios/App/App/capacitor.config.json` and Xcode bakes it into the build, so a build for
a **physical** iPhone then loads `localhost:4200` from the phone itself and shows a
blank app. Before any device build run `npm run build && npm run cap:ios`, and check
that the built `App.app/capacitor.config.json` has no `"url"` and the device console
says `Loading app at capacitor://localhost`.

### Test a fresh web build without `cap sync`

`cap sync` would overwrite your in-progress `ios/` files. Instead:

```bash
npm run build && npm run cap:prune
rsync -a -c --delete --exclude cordova.js --exclude cordova_plugins.js \
  dist/bible-app/capacitor/ <App.app>/public/
codesign --force --sign - <App.app>
xcrun simctl install <udid> <App.app>
```

macOS `rsync` is `openrsync`: without `-c` it skipped an `index.html` of the same size
and minute, so the page asked for a deleted `styles-*.css` and rendered unstyled
(icon ligatures as words). `cmp` the `index.html` afterwards. The `cordova*.js`
files are `cap sync` outputs the build lacks.

To point a simulator build at the dev server without touching the synced config, add
`server.url` to the built `App.app/capacitor.config.json`, then `codesign --force
--sign - App.app` and install. Before you point it at whatever is on `:4200`, check
which checkout that server runs from: `lsof -p <pid> | grep cwd`.

## Reading logs and driving the app

- Bridge and JS logs (`⚡️ To Native ->`, `TO JS`) go to stdout, not the unified log:
  launch with `--console-pty`. For a sheet that reports back, the log shows
  `showFootnotes`, the old sheet's `footnotes-closed`, then `{"presented":true}`.
- **Skip onboarding without taps.** Terminate the app, then insert `onboardingSeen`
  = `true` (a UTF-16LE blob) into the `ItemTable` of the web view's
  `localstorage.sqlite3`, found under
  `find "$(xcrun simctl get_app_container <udid> <bundle id> data)/Library/WebKit" -name localstorage.sqlite3`.
  The same table seeds `viewMode`, `book` and `chapter` (book ids are lowercase,
  `rev`) to open a passage directly. The keys are in `preferences.service.ts`.
- Every `simctl install` moves the app's data container to a new UUID (the data
  migrates): run `get_app_container` again after each install. To edit preferences use
  `xcrun simctl spawn <udid> defaults delete "<container>/Library/Preferences/<bundle>" <key>`
  with the app terminated; `cfprefsd` ignores `plutil` edits to the file.
- **A tap that "did nothing" is usually not an app bug.** First check: a native
  `UIMenu` left open swallows taps under it (on iPad the AA menu covers the page's
  top-left); the first tap after a menu or sheet closes is often swallowed; and a
  simulator-driven tap inside a freshly presented sheet can land as if offset by the
  sheet's top. Wait about 2.5 s after a sheet appears and check each step with
  `xcrun simctl io <udid> screenshot`, which is current, unlike a control tool's own
  screenshot. To see where a
  tap really lands, add a throwaway capture-phase listener in `main.ts` that logs
  `touchstart`/`click` `composedPath()` and `elementFromPoint`, rebuild, and read the
  `--console-pty` log.
- Typing non-ASCII text through a simulator control tool can paste garbage and trigger
  a paste-permission alert; use ASCII, or a throwaway auto-action in the instrumented
  bundle (`setTimeout(() => this.onSearchSubmit("jesus"))` in `ngOnInit`).
- Simulating no internet without touching the Mac's network: copy the built `App.app`,
  `sed` the API host in `public/*.js` to `127.0.0.1:9` (refuses) or `10.255.255.1`
  (hangs), `codesign --force --deep --sign -`, install fresh.
- Catching a 0.4 s animation: `xcrun simctl io <udid> recordVideo --codec h264 --force f.mov`
  in the background, drive the app, stop with SIGINT, then extract frames with a small
  `AVAssetImageGenerator` Swift script and frame-diff them.
- Measuring from screenshots: `sips -c H W --cropOffset y x` ignores the offset and
  crops the centre. Convert with `sips -s format bmp` and crop in a script, and look at
  the image before trusting a pixel measurement. Device points = screenshot pixels / 3
  on a Pro iPhone.
- Share-sheet link previews never finish loading in the simulator for a bare URL; the app
  passes its own `LPLinkMetadata` (`ShareSheet.swift`), which renders at once. A real
  phone fetches the site's `apple-touch-icon`.

## Simulators

- Give long test runs their own simulator (`xcrun simctl create "Playtest" "iPhone 17 Pro" <runtime>`)
  and `simctl shutdown`/`delete` it afterwards. Installing over a booted simulator kills
  the app and wipes its state, and installing or deleting a *runtime* restarts
  CoreSimulator and shuts every booted simulator down (a test running then silently
  tests nothing).
- A runtime that is listed can still fail `simctl create` ("runtime path not found",
  "Incompatible device"). The iPhone Duo device type only exists on some runtimes,
  so check which `simctl list runtimes` entries support the device you need.
- **iPhone Duo.** Folded = outer screen 466x678 pt; unfolded = inner 669x951 pt.
  `simctl io <udid> screenshot` defaults to the inner display (black while folded):
  pass `--display=<port UUID>` from `simctl io <udid> enumerate`. Xcode 27 replaces
  Simulator.app with `/Applications/Xcode.app/Contents/Applications/DeviceHub.app`,
  whose buttons set the posture; `simctl` has no posture option. On the outer screen the
  status bar is a column down the right side (safe area top 0, right 84 pt), so
  anything pinned to `safeArea.top` touches the edge and fixed full-width web boxes run
  under the column. Half-open, the bottom bars sit right of the fold, placed with
  `view.reservedRegions(kind: .division)` (iOS 27.1 SDK, `ChromeViewController.swift`).
- **Test layout bugs on iOS 27, not only 26.** iOS 27 WebKit lays out at fractional
  pixels. A 1 px `IntersectionObserver` sentinel inside a clipped, rounded list was
  58-83% visible there, so `threshold: 1` never fired, while 26.x looked fine.
- CI builds with Xcode 27.1 on the `xcode-27` runner (`.github/workflows/ios.yml`);
  `macos-latest` only has Xcode 26.x.

## Native UIKit behaviour worth knowing

- **Closing a sheet drops touches for about 0.45 s.** During a non-interactive
  dismissal (the close button, or a tap on the dimmed text above) a swipe that starts in
  the first ~0.45 s never reaches the app, not even `UIApplication.sendEvent`; touches
  return ~50-100 ms before `viewDidDisappear`. Dragging the sheet closed is unaffected.
  It is UIKit, not our code, and was measured the same in older shells: do not chase
  it in the web app. A workaround would mean replacing UIKit's close animation and
  hitting private views (`UIDimmingView` inside `UIDropShadowView` on iOS 27), which
  is fragile; the app keeps the standard behaviour. The probe that found it: copy `ios/`
  to a scratch repo (with `node_modules` symlinked next to it, since CapApp-SPM uses
  `../../../node_modules`), add a `UIApplication` subclass via `NSPrincipalClass` and a
  `UIWindow` subclass that log `sendEvent` touches with `CACurrentMediaTime()`, plus a
  `CADisplayLink` logging hit tests, and build for one architecture.
- **Never move an interactive glass view by transforming it.** `UIGlassEffect.isInteractive`
  leans toward a finger sliding off the view, judged from its untransformed position in
  its superview, so a dragged glass view runs about 1.4x ahead of the finger and snaps back
  on release (render-server side, invisible in the presentation layer). Put the glass in
  a plain wrapper and transform the wrapper: `AutoScrollControl.mover`.
- **Flush layout outside animations.** `ChromeViewController.apply` rebuilds bar items on
  every state update, and custom-view items (the speed label, the passage button) are new
  views each time. If their first layout falls inside an animation block they slide and
  grow in with the text cut off. `animateCollapse` calls `view.layoutIfNeeded()` before
  `UIView.animate`; keep it that way.
- **The bottom toolbar never overflows into ⋯.** iOS 27 moves trailing toolbar items
  into its own menu (a custom view then shows as nothing); iOS 26 lays the bar out wider
  than the screen and clips both ends. The arrows and the passage name must always show,
  so the passage button gives way: the web sends `passageShortLabels` (longest first,
  "Sl 103 (102)" then "Sl 103"), `configurePassage` picks the longest that fits a room
  computed from measured glass metrics (the `Glass` enum), and truncates as a last
  resort. Do not set `visibilityPriority` on those items.
- **Tall text sizes.** Test the toolbar on a 375 pt iPhone (SE) at the largest
  accessibility text size with a long book name ("Atos dos Apóstolos").
- **iPhone Duo outer screen title.** With iOS 27.1's vertical bar layout
  (`traitCollection.verticalBarEdge`), the navigation title is leading-aligned and
  minimizes when the user drags, but a programmatic scroll after a push or pop never
  minimizes it, so it stays pinned over faded content. `navigationBarMinimization`,
  `hidesSearchBarWhenScrolling` and re-registering the content scroll view did not help.
  `PassagePicker.revealItem` therefore scrolls only when the item is not already fully
  visible. A book far down the list still opens with the title over a faded heading on
  that screen. When debugging a title over content, check `adjustedContentInset` and
  `contentOffset` first (throwaway prints, launched with `--console-pty`). One option not
  taken yet: skip the list's auto-scroll when `verticalBarEdge != .unspecified`, guarded
  like `verticalBarActive` (`#if canImport(UIKit, _version: 9127.0.85)`).
- **Sheets look like Apple's.** White (dark: elevated #1C1C1E) with grey tiles
  (`sheetBackground` in `PassagePicker.swift`). The picker's bar is
  frosted (`frostedBar`), because on iOS 27 neither the soft nor the hard scroll-edge
  effect hides tiles behind the title and buttons.
- **Small print in a `UIMenu`.** The only small text is an action's `subtitle`
  (13 pt) or a `.medium`-size inline section with one image-less item. Next to icon rows
  a subtitle is indented to the title column (about 160 pt wide); alone in its own inline
  section it starts at the left inset. SF digits are proportional, so measure candidates
  with CoreText (`CTFontCreateUIFontForLanguage(.system, 13)`, within 1 pt of the
  simulator).

## Universal Links

Tapping a `https://biblia.capuchinhos.org` link opens the app, which routes it from
`appUrlOpen` like Android's App Links. Three things have to agree:

- **The site:** `public/.well-known/apple-app-site-association`, served as
  `application/json`. It has no extension, so nginx needs telling:
  `location = /.well-known/apple-app-site-association { default_type application/json; }`.
  Check it with
  `curl -sI https://biblia.capuchinhos.org/.well-known/apple-app-site-association`, and
  what devices actually get (Apple's CDN caches it for up to a day) with
  `curl -s https://app-site-association.cdn-apple.com/a/v1/biblia.capuchinhos.org`.
- **The App Store profile:** Associated Domains enabled on the `org.capuchinhos.biblia`
  App ID, in a profile made after that, in `IOS_PROFILE_BASE64`. `sign-ipa.sh` fails the
  build if the profile doesn't allow it.
- **The build:** `sign-ipa.sh` grants the entitlement. There is no `App.entitlements`:
  the archive is built unsigned, and a Debug build (`org.capuchinhos.biblia.dev`) is
  deliberately left without Universal Links, so it needs no capability on its team.

A device fetches the file when the app is installed or updated, so reinstall to test a
change. Links only open the app from a tap in another site or app, not from a link
within the same domain or one typed into Safari's address bar.

## Safari and WebKit

- **Block boxes inside the inline verse text are misplaced in CSS columns.** Safari
  (macOS and iPadOS 26/27) draws a block-level box (`display: block/table/flow-root`)
  that sits inside the reader's inline verse text over the lines before it, and
  justifies the line before it, when the text is in CSS columns (the paged view, two
  columns at 768 px and up). Chromium is fine. Moving the `<br>`, `flow-root` and
  widows/orphans did not help; only removing the block-in-inline did. Centred section
  headings, `h3` and `.references-block` are therefore `display: inline-block` a line
  wide, except where the box sits beside the drop-cap chapter number
  (`besideChapterNumber`), where a line-wide box would drop below the float. See the
  comment at the top of `verse.component.css`.
- **Playwright's WebKit did not reproduce that bug at any viewport**, so "WebKit passes"
  there proves nothing. Test Safari-only layout in the iOS simulator's Mobile Safari
  (an iPad Pro in portrait gives the two-column paged view). A fast loop: take a
  prerendered page (`curl https://biblia.capuchinhos.org/is/14`, or a local development
  build with `--output-path <scratch>`), strip its `<script>` tags, point `<base href>` at
  the asset origin, inject a script that adds the `paged-view` classes and sweeps the
  `.bookBlock` height measuring heading-versus-text overlaps, POST the results to a tiny
  local server, and open it with `xcrun simctl openurl <udid> http://localhost:<port>/page.html`.
  Driving the real app UI is slower and flakier.
- WebKit ignored `vertical-align` on an inline `<svg>` in a verse marker (any value,
  no change); `position: relative; top: Xem` worked. Tune such offsets in the
  simulator, not Chrome.
- WebKit keeps `scrollTop` in whole pixels. Anything that scrolls by a fraction per
  frame (auto-scroll) must carry the unapplied remainder.
