# Android

The Android app is the web bundle in a Capacitor WebView, with the bars, sheets
and dialogs drawn natively in Jetpack Compose (Material 3) behind the same
`NativeChrome` plugin contract as iOS ([architecture.md](architecture.md#native-chrome)).
Native code is in `android/app/src/main/java/org/capuchinhos/biblia/chrome/`
(`NativeChromePlugin.kt` is the plugin, `ChromeController.kt` owns the system bars,
`ChromeState.kt` parses the web payload). For Android UI questions follow Material 3
and the platform's guidance, not Apple's HIG. Keep iOS-only CSS under `.platform-ios`
(and Android-only under `.platform-android`).

## Build, test, run

```bash
npm ci
npm run build && npm run cap:prune && npx cap sync android
cd android
ANDROID_HOME=<sdk> ./gradlew testDebugUnitTest lintDebug assembleRelease   # what CI runs
ANDROID_HOME=<sdk> ./gradlew installDebug
```

- `android/local.properties` is gitignored; set `ANDROID_HOME` (or `sdk.dir`) yourself.
- Versions live in `android/build.gradle` (AGP), `android/variables.gradle`
  (compileSdk, targetSdk, Compose/Material 3) and
  `android/gradle/wrapper/gradle-wrapper.properties`. CI installs the SDK platform that
  `variables.gradle` names (see the *android* job in `.github/workflows/ci.yml`).
- AGP 9 compiles Kotlin itself: there is no `org.jetbrains.kotlin.android` plugin.
  Release builds run R8 with `shrinkResources` on `proguard-android-optimize.txt`
  (AGP 9 refuses `proguard-android.txt`); Capacitor's consumer rules are enough. CI builds
  the release APK through R8 so a keep-rule break fails there.
- Compose Material 3 is on a beta (`material3Version` in `variables.gradle`) for the
  expressive components, so a version bump renames APIs: expect to fix call sites.
- Android lint needs `@ChecksSdkIntAtLeast(api = S, lambda = 2)` on `bibleColorScheme`
  for the SDK check inside its lambda form.
- Live reload and running in an emulator: `CAPACITOR_LIVE_RELOAD_URL=http://<lan-ip>:4200 npx cap run android`
  (see the README). For an emulator, `http://10.0.2.2:4200` reaches the host.
- Working in a git worktree: `npx cap sync android` rewrites the tracked
  `android/capacitor.settings.gradle` to `../../../../node_modules` paths when
  `node_modules` is a symlink; `git checkout -- android/capacitor.settings.gradle`
  afterwards. The Cordova plugin folder only exists after a sync.

## Emulator recipe

- Screenshot: `adb exec-out screencap -p > shot.png`, then `sips -Z 900 shot.png` to
  shrink it. Map tap coordinates from `uiautomator dump` bounds at full resolution, not
  from the downscaled screenshot. A multi-display device (Pixel Fold) needs
  `screencap -d <display id>` and takes ~10 s after a cold start before taps register.
- A small phone: `adb shell wm size 1080x1920` and `adb shell wm density 480`
  reproduce a 360 x 640 dp screen. Reset both with `wm size reset` / `wm density reset`.
- Debug the page: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`,
  then use the Chrome DevTools protocol (`Runtime.evaluate`).
  `navigator.userActivation.hasBeenActive` shows whether the page has had a user gesture.
- Chromium batches `localStorage` writes (about one a minute): force-stopping the app
  right after a change can lose it. An emulator whose WebView `localStorage` store was
  corrupted drops every later write (onboarding reappears on each launch);
  `adb shell pm clear org.capuchinhos.biblia` fixes it and it is not an app bug.
- Window insets: Android 15+ adds `FORCE_LIGHT_NAVIGATION_BARS`, which hides
  navigation-bar icon colour bugs. Read the real flags with
  `adb shell dumpsys window -a | grep mLastAppearance`, and test an older API level.
- The WebView is only edge-to-edge from WebView 140 (`EDGE_TO_EDGE_WEBVIEW_VERSION` in
  `MainActivity.java`). Older WebViews take the fallback path in which Capacitor's
  `SystemBars` pads the `DecorView`, so test on an emulator image with an old WebView too.

## TalkBack

- Turn it on:
  `adb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService`
  and `settings put secure accessibility_enabled 1`. Off: set the first to `""`.
- **Hear what it says.** With `adb root`, stop TalkBack, add
  `<string name="pref_log_level">2</string>` to
  `/data/user_de/0/com.google.android.marvin.talkback/shared_prefs/com.google.android.marvin.talkback_preferences.xml`,
  and restart it. Logcat lines tagged ` talkback` then carry `nodeTreeDescription={...}`
  (the focused item), `hint={...}` and `ttsOutput=` (announcements, live regions). Plain
  `grep` finds them; `logcat -s talkback` does not.
- **Drive it with real touches.** `adb shell input tap/swipe` bypasses TalkBack (a swipe
  turns the chapter). Use the emulator's touchscreen: `adb emu event mouse X Y 0 1` (press)
  and `... 0 0` (release). A tap explores by touch; two quick press/release pairs are a
  double tap that activates whatever has focus, wherever you tap. A press, three moves and
  a release across the screen is a swipe to the next or previous item.
- Hardware-keyboard shortcuts need `hw.keyboard=yes` in the AVD's `config.ini` (cold
  boot) and did not work on the WebView; swipes are better.
- **Limit:** explore-by-touch inside *any* WebView finds nothing on the emulator, so the
  Bible text needs a real phone for touch exploration (swiping through web content works).

## Behaviour that is not obvious

- **System Back from a native-bar navigation.** Chromium skips, for Back, history entries
  that a page left via `pushState` without a user activation, and a tap on the native
  Compose bars is not an activation in the WebView. So on a fresh launch, opening Search
  from the native bar and pressing system Back found `canGoBack: false` and showed the exit
  toast. `DepthLocationStrategy` keeps an `appDepth` in `history.state`, and `AppComponent`
  goes back when `canGoBack || historyDepth(history.state) > 0`. The strategy must be
  provided in **both** `src/main.ts` and `src/app/app.config.ts`: `main.ts` does not use
  `app.config.ts`.
- **Replacing the decor background resets its padding.** On the WebView-before-140 path,
  Capacitor's `SystemBars` keeps the page clear of the system bars by padding the
  `DecorView`. Setting `decor.background` runs `DecorView.drawableChanged`, which resets
  that padding, so the page and the bars jumped under the status bar.
  `ChromeController.applySystemBars` keeps one `LayerDrawable`, recolours it in place and
  restores the padding the one time it sets the background. Changing the colour of an
  existing `ColorDrawable` is safe.
- **Light navigation bar icons on a white page.** The web shell asks for light navigation
  icons whenever the page cannot draw under the bars, but the native bars paint that strip
  in the page colour. `navigationBarBand()` in `Theme.kt` picks the icon style from the
  strip's colour; it is black below API 26, which cannot draw dark icons.
- **Large system font size.** The WebView scales text by the system font scale
  (`textZoom`): 200% doubles the web's `px` fonts, icon fonts included, but `em` lengths
  stay unzoomed, so `mat-icon` boxes (24px or `1em`) clip their glyphs. Use
  `width/height: auto` where an icon must survive large text.
- **Rotation.** `SystemBars` re-applies the web's style on a configuration change, so the
  controller re-asserts the bars' appearance with a posted `applySystemBars`.
- **Colour.** `bibleColorScheme(dark, sdkInt, dynamic)` in `Theme.kt` uses the wallpaper's
  dynamic colour on Android 12+ and the site's brown (`BrownLight`/`BrownDark`) below.
  The web's chapter cards take the scheme's `surfaceContainerHigh` through a retained
  `palette` plugin event, set as `--android-surface-container-high` on `<body>`.
  The web's iOS-only edge fades (backdrop blur plus mask) live under `.platform-ios`: on
  WebView 133 the blur layer froze a patch of old text.
- **Insets are computed from fixed Material sizes** in `chromeInsets()` (`ChromeState.kt`),
  which is unit-tested; the unit tests use a test-only `org.json` because `android.jar`'s is
  stubbed.
- **Bars hide on scroll** after `ANDROID_HIDE_DISTANCE` (32 px) down and return after
  `ANDROID_REVEAL_DISTANCE` (64 px) up, a fast upward fling (`FLING_REVEAL_SPEED`) or any
  non-touch upward scroll; iOS uses `COLLAPSE_DISTANCE` (24 px). All are in
  `native-chrome.service.ts`. A tap only shows hidden bars; in paged mode, where the page
  cannot scroll, a tap toggles them.
- `FloatingToolbarDefaults.VibrantFloatingActionButton` used outside a toolbar fills its
  constraints: give it an explicit `Modifier.size(...)` (the auto-scroll button does).
- The "Livro seguinte" card at the end of a book follows `CANON_ORDER` in
  `src/app/bible-canon.ts`, not the API's order, which lists the deuterocanonical books last.
