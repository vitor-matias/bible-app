# Crash reports

> **Prerequisite.** The code this document describes is on the branch `feat/crash-reports`
> and is not in `master` or in the branch this file was written on: `ios/App/App/CrashReporter.swift`,
> `android/app/src/main/java/org/capuchinhos/biblia/crash/` and the `BibliaApplication` that starts
> it. Until that branch merges, the sections below describe it, not the tree you have checked out.
> Read it with `git show feat/crash-reports:<path>`.

Both native shells send a crash to the app's Umami instance as a `crash` event, the next time
the app launches. Everything is a flat set of event properties; Umami keeps at most 500
characters per property, so a stack is one property per frame (`frame00`, `frame01`, ...).
There is no opt-out, as in the web app. Nothing the reader saw is sent: no exception messages,
no URLs, no verse references.

An event is stored when Umami answers 200 with `{"cache","sessionId","visitId"}`. It answers
`{"beep":"boop"}` when it takes the request for a bot and stores nothing, so both shells send a
browser-style `User-Agent` (CFNetwork's and `HttpURLConnection`'s defaults are filtered).

## iOS (MetricKit)

`CrashReporter` subscribes to `MXMetricManager`; iOS delivers the report of a crash on a later
launch. The event has hostname `ios-app` and the properties `platform`, `version`, `build`,
`os`, `device`, `exception_type`, `exception_code`, `signal`, `termination_reason`,
`objc_exception` (the exception's name only, iOS 17+) and up to 60 frames of the crashed
thread, innermost first. A frame reads `binaryName binaryUUID +0xoffset`. The privacy manifest
declares Crash Data for App Functionality.

**Frame order.** In a per-thread crash tree the root frame is the crash site
(`libsystem_kernel`...) and each sub-frame is its **caller**, ending at `pthread` or `dyld`.
Aggregated *hang* trees are rooted the other way round; do not reverse crash frames because of
how a hang tree reads.

### Symbolicate

You need the dSYM of the exact build that crashed (match it with `dwarfdump --uuid <dSYM>`
against the frame's UUID).

```bash
# Release: the app is loaded at 0x100000000; the address is that plus the frame's offset, in hex
atos -arch arm64 -o App.dSYM/Contents/Resources/DWARF/App -l 0x100000000 <0x100000000 + offset>
```

In **Debug** builds the app's code is in `App.debug.dylib`, whose `__TEXT` vmaddr is 0, so use
that file's dSYM with `-l 0x0 <offset>`. Frames in system libraries (UIKitCore, ...) cannot be
symbolicated with the app's dSYM.

### Simulate a report without Xcode's GUI

Xcode's *Debug > Simulate MetricKit Payloads* needs the GUI and goes through a device proxy. To
test headlessly, build a throwaway Objective-C dylib for the simulator and inject it:

```bash
xcrun -sdk iphonesimulator clang -target arm64-apple-ios17.0-simulator -fobjc-arc -dynamiclib \
  -o probe.dylib probe.m && codesign -s - probe.dylib
SIMCTL_CHILD_DYLD_INSERT_LIBRARIES=$PWD/probe.dylib xcrun simctl launch <udid> <bundle id>
```

The constructor `dispatch_after`s about 5 s, then builds the objects through MetricKit's
**private** initialisers with `objc_msgSend` (they may change between SDKs):

- `MXCallStackFrame initWithBinaryName:binaryUUID:(NSUUID) address:(NSNumber) binaryOffset:(NSNumber) sampleCount:(NSNumber) withDepth:(Q) subFrameArray:`
- `MXCallStackThread initWithTopCallStackFrames:isAttributedThread:`
- `MXCallStackTree initWithThreadArray:aggregatedByProcess:`
- `MXMetaData initWithRegionFormat:osVersion:deviceType:appBuildVersion:platformArchitecture:`
- `MXCrashDiagnostic initWithMetaData:applicationVersion:terminationReason:applicationSpecificInfo:virtualMemoryRegionInfo:exceptionType:exceptionCode:signal:stackTrace:`
- `MXDiagnosticPayload initWithStartDate:endDate:diagnostics:`, where `diagnostics` is a
  **dictionary** (`@{@"crashDiagnostics": @[crash]}`), not an array

and then calls `[[MXMetricManager sharedManager] deliverDiagnosticPayload:@[payload]]`, which
takes an **array** and reaches the real subscribers. (`lldb expr` is a poor fit: no line
continuations, no `@try`, and it fails with "no known method -alloc".) A simulator CLI tool that
links MetricKit can run under `xcrun simctl spawn <udid> <binary>`, which is handy for dumping
private selectors and type encodings with the Objective-C runtime.

## Android

`CrashReporting.start` (from `BibliaApplication.onCreate`) uses two sources, because neither is
enough alone:

- an uncaught-exception handler that saves a Java/Kotlin crash's stack to
  `filesDir/crash-reports/crash-<millis>.json` as it happens (the system's record of that crash
  has no stack), and sends the saved reports on the next launch, keeping the file until Umami
  accepted it (the newest five survive a crash loop);
- `ApplicationExitInfo` (API 30+), for native crashes and ANRs that no handler sees, and a plain
  crash the handler missed.

The event has hostname `android-app`, the properties `platform`, `source` (`java`, `crash`,
`native_crash` or `anr`), `version`, `build` (the `versionCode`), `os`, `device`, and per source
`thread`, `exception_type`, `root_cause_type` (the end of the cause chain), `process`, `signal`
and up to 40 frames as `class.method(File:line)`. An ANR sends the main thread's frames.

Crash reporting is off when `BuildConfig.CRASH_ENDPOINT` is empty, which is every debug build, so
developers' crashes do not reach the real instance. To try it against a local stub:

```bash
cd android && ./gradlew assembleDebug -PcrashEndpoint=http://10.0.2.2:8787/api/send
```

(the debug manifest allows cleartext traffic for that).

### Symbolicate

Release builds go through R8, so the class and method names in a report are obfuscated. Use the
`mapping.txt` of the **same build**; the report's `build` is the `versionCode`:

- a local release build writes it to `android/app/build/outputs/mapping/release/mapping.txt`;
- a `bundleRelease` AAB embeds it as
  `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` (`unzip -p app-release.aab <that path>`).

CI does not keep `mapping.txt` as a separate artifact, so keep the AAB (or the mapping) of every
build you ship.

Retrace expects stack-trace lines, so prefix each frame with a tab and `at`:

```bash
printf '\tat %s\n' 'a.b.a(SourceFile:5)' > trace.txt   # one line per frame00, frame01, ...
$ANDROID_HOME/cmdline-tools/latest/bin/retrace mapping.txt trace.txt
```

Without the prefix `retrace` prints the line unchanged.
