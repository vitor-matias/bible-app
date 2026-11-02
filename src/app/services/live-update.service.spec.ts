import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import type { Mock } from "vitest"
import { LIVE_UPDATE_BASE_URL, LIVE_UPDATE_PLUGIN } from "../tokens"
import { BuildVersionService } from "./build-version.service"
import { LiveUpdateService } from "./live-update.service"

describe("LiveUpdateService", () => {
  const running = "20261001-120000Z"
  const newer = "20261002-090000Z"

  let plugin: {
    ready: Mock
    getChannel: Mock
    getBlockedBundles: Mock
    getNextBundle: Mock
    getDownloadedBundles: Mock
    downloadBundle: Mock
    setNextBundle: Mock
  }
  let buildVersion: string
  let fetchSpy: Mock

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
    fetchSpy.mockResolvedValue({ ok, json: async () => body } as Response)
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
      ready: vi.fn().mockName("ready").mockResolvedValue({}),
      getChannel: vi
        .fn()
        .mockName("getChannel")
        .mockResolvedValue({ channel: "native-1" }),
      getBlockedBundles: vi
        .fn()
        .mockName("getBlockedBundles")
        .mockResolvedValue({ bundleIds: [] }),
      getNextBundle: vi
        .fn()
        .mockName("getNextBundle")
        .mockResolvedValue({ bundleId: null }),
      getDownloadedBundles: vi
        .fn()
        .mockName("getDownloadedBundles")
        .mockResolvedValue({ bundleIds: [] }),
      downloadBundle: vi
        .fn()
        .mockName("downloadBundle")
        .mockResolvedValue(undefined),
      setNextBundle: vi
        .fn()
        .mockName("setNextBundle")
        .mockResolvedValue(undefined),
    }
    buildVersion = running
    fetchSpy = vi.spyOn(window, "fetch") as Mock
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android")
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
    plugin.getBlockedBundles.mockResolvedValue({ bundleIds: [newer] })
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
    expect(plugin.setNextBundle).not.toHaveBeenCalled()
  })

  it("does nothing when the bundle is already queued", async () => {
    serve(manifest())
    plugin.getNextBundle.mockResolvedValue({ bundleId: newer })
    await setUp().readyAndCheck()
    expect(plugin.downloadBundle).not.toHaveBeenCalled()
    expect(plugin.setNextBundle).not.toHaveBeenCalled()
  })

  it("re-queues an already downloaded bundle without downloading it again", async () => {
    serve(manifest())
    plugin.getDownloadedBundles.mockResolvedValue({ bundleIds: [newer] })
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
    plugin.getChannel.mockResolvedValue({ channel: null })
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
    fetchSpy.mockRejectedValue(new TypeError("offline"))
    vi.spyOn(console, "warn").mockImplementation(() => {})
    await expect(setUp().readyAndCheck()).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})
