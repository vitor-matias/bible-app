import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import { LIVE_UPDATE_BASE_URL, LIVE_UPDATE_PLUGIN } from "../tokens"
import { BuildVersionService } from "./build-version.service"
import { LiveUpdateService } from "./live-update.service"

describe("LiveUpdateService", () => {
  const running = "20261001-120000Z"
  const newer = "20261002-090000Z"

  let plugin: {
    ready: jasmine.Spy
    getChannel: jasmine.Spy
    getBlockedBundles: jasmine.Spy
    getNextBundle: jasmine.Spy
    getDownloadedBundles: jasmine.Spy
    downloadBundle: jasmine.Spy
    setNextBundle: jasmine.Spy
  }
  let buildVersion: string
  let fetchSpy: jasmine.Spy

  function manifest(overrides: Record<string, unknown> = {}) {
    return {
      bundleId: newer,
      url: `${newer}.zip`,
      checksum: "abc123",
      signature: "c2lnbmF0dXJl",
      ...overrides,
    }
  }

  function serve(body: unknown, ok = true): void {
    fetchSpy.and.resolveTo({ ok, json: async () => body } as Response)
  }

  function setUp(
    baseUrl = "https://updates.example.org/bible-app",
  ): LiveUpdateService {
    TestBed.configureTestingModule({
      providers: [
        { provide: LIVE_UPDATE_PLUGIN, useValue: plugin },
        { provide: LIVE_UPDATE_BASE_URL, useValue: baseUrl },
        {
          provide: BuildVersionService,
          useValue: { getBuildInfo: async () => ({ buildVersion }) },
        },
      ],
    })
    return TestBed.inject(LiveUpdateService)
  }

  beforeEach(() => {
    plugin = {
      ready: jasmine.createSpy("ready").and.resolveTo({}),
      getChannel: jasmine
        .createSpy("getChannel")
        .and.resolveTo({ channel: "native-1" }),
      getBlockedBundles: jasmine
        .createSpy("getBlockedBundles")
        .and.resolveTo({ bundleIds: [] }),
      getNextBundle: jasmine
        .createSpy("getNextBundle")
        .and.resolveTo({ bundleId: null }),
      getDownloadedBundles: jasmine
        .createSpy("getDownloadedBundles")
        .and.resolveTo({ bundleIds: [] }),
      downloadBundle: jasmine.createSpy("downloadBundle").and.resolveTo(),
      setNextBundle: jasmine.createSpy("setNextBundle").and.resolveTo(),
    }
    buildVersion = running
    fetchSpy = spyOn(window, "fetch")
    spyOn(Capacitor, "getPlatform").and.returnValue("android")
  })

  it("downloads a newer bundle from the platform's channel and applies it next launch", async () => {
    serve(manifest())
    await setUp().readyAndCheck()

    expect(plugin.ready).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(
        "https://updates.example.org/bible-app/android/native-1/manifest.json",
      ),
      { cache: "no-store" },
    )
    expect(plugin.downloadBundle).toHaveBeenCalledWith({
      bundleId: newer,
      url: `https://updates.example.org/bible-app/android/native-1/${newer}.zip`,
      checksum: "abc123",
      signature: "c2lnbmF0dXJl",
    })
    expect(plugin.setNextBundle).toHaveBeenCalledWith({ bundleId: newer })
  })

  // ready() must come first: it is what keeps the plugin from rolling back.
  it("confirms the running bundle before anything else", async () => {
    serve(manifest())
    await setUp().readyAndCheck()
    expect(plugin.ready).toHaveBeenCalledBefore(plugin.getChannel)
  })

  it("only confirms the bundle when no server is configured", async () => {
    await setUp("").readyAndCheck()
    expect(plugin.ready).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // After a store release the channel can still hold an older bundle than the
  // one shipped in the app; installing it would roll the app back.
  it("never moves to an older or the same bundle", async () => {
    serve(manifest({ bundleId: "20260901-000000Z" }))
    await setUp().readyAndCheck()
    serve(manifest({ bundleId: running }))
    await TestBed.inject(LiveUpdateService).readyAndCheck()

    expect(plugin.downloadBundle).not.toHaveBeenCalled()
    expect(plugin.setNextBundle).not.toHaveBeenCalled()
  })

  // Re-applying a bundle that was rolled back would break every other launch.
  it("skips a bundle that was rolled back", async () => {
    serve(manifest())
    plugin.getBlockedBundles.and.resolveTo({ bundleIds: [newer] })
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
    expect(plugin.setNextBundle).not.toHaveBeenCalled()
  })

  it("does nothing when the bundle is already queued", async () => {
    serve(manifest())
    plugin.getNextBundle.and.resolveTo({ bundleId: newer })
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
    expect(plugin.setNextBundle).not.toHaveBeenCalled()
  })

  it("re-queues an already downloaded bundle without downloading it again", async () => {
    serve(manifest())
    plugin.getDownloadedBundles.and.resolveTo({ bundleIds: [newer] })
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
    expect(plugin.setNextBundle).toHaveBeenCalledWith({ bundleId: newer })
  })

  it("does not update a development build", async () => {
    buildVersion = "dev-local"
    serve(manifest())
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
  })

  it("ignores a manifest without a signature", async () => {
    serve(manifest({ signature: undefined }))
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
  })

  it("does nothing without a channel", async () => {
    plugin.getChannel.and.resolveTo({ channel: null })
    await setUp().readyAndCheck()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does nothing when the manifest is missing", async () => {
    serve({}, false)
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
  })

  // Offline launches are normal for a Bible reader; a failed check must not
  // surface or block anything.
  it("swallows network and plugin failures", async () => {
    fetchSpy.and.rejectWith(new TypeError("offline"))
    spyOn(console, "warn")
    await expectAsync(setUp().readyAndCheck()).toBeResolved()
    expect(console.warn).toHaveBeenCalled()
  })
})
