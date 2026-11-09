import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import type { Mock } from "vitest"
import { createSpyObj, lastCall, type SpyObj } from "../testing/spy-obj"
import {
  AnalyticsService,
  BUILD_DATA_WAIT_MS,
  DELIVERY_TIMEOUT_MS,
  loadTracker,
  prepareUmamiPayload,
} from "./analytics.service"
import { BuildVersionService } from "./build-version.service"

describe("AnalyticsService", () => {
  let service: AnalyticsService
  let buildVersionServiceMock: SpyObj<BuildVersionService>

  beforeEach(() => {
    buildVersionServiceMock = createSpyObj("BuildVersionService", [
      "getBuildInfo",
      "getRelease",
    ])
    // The web, which has no release, unless a test says otherwise.
    buildVersionServiceMock.getRelease.mockResolvedValue(null)
    buildVersionServiceMock.getBuildInfo.mockResolvedValue({
      buildVersion: "test-version",
      buildEnvironment: "test-env",
    })

    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: BuildVersionService, useValue: buildVersionServiceMock },
      ],
    })
    service = TestBed.inject(AnalyticsService)

    // Setup global umami mock
    globalThis.umami = createSpyObj("Spy", ["track"])
  })

  afterEach(() => {
    delete globalThis.umami
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("loadTracker", () => {
    let tracker: HTMLScriptElement

    beforeEach(() => {
      vi.spyOn(document.head, "append").mockImplementation((node) => {
        tracker = node as HTMLScriptElement
      })
      delete globalThis.umami
      loadTracker()
    })

    afterEach(() => {
      // Later specs must not wait on this script.
      tracker.dispatchEvent(new Event("load"))
      delete globalThis.umamiBeforeSend
    })

    it("sets the hook before inserting the script that reads it", () => {
      expect(globalThis.umamiBeforeSend).toBe(prepareUmamiPayload)
      expect(tracker.src).toBe("https://umami.dojo.pt/script.js")
      expect(tracker.getAttribute("data-website-id")).toBeTruthy()
      expect(tracker.getAttribute("data-before-send")).toBe("umamiBeforeSend")
    })

    it("keeps an event sent before the tracker has loaded", async () => {
      const sent = service.track("app_open")

      globalThis.umami = createSpyObj("Spy", ["track"])
      tracker.dispatchEvent(new Event("load"))
      await sent

      expect(lastCall(globalThis.umami?.track as Mock)[0]).toBe("app_open")
    })

    it("drops waiting events if the tracker fails to load", async () => {
      const sent = service.track("app_open")

      tracker.dispatchEvent(new Event("error"))

      await expect(sent).resolves.toBeUndefined()
      expect(buildVersionServiceMock.getBuildInfo).not.toHaveBeenCalled()
    })
  })

  it("should call umami.track with event name, data, build version, and platform", async () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("web")

    await service.track("test_event", { foo: "bar" })

    expect(buildVersionServiceMock.getBuildInfo).toHaveBeenCalled()
    expect(globalThis.umami?.track).toHaveBeenCalledWith("test_event", {
      foo: "bar",
      buildVersion: "test-version",
      buildEnvironment: "test-env",
      platform: "web",
    })
  })

  it("should report the native app's release with every event", async () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android")
    buildVersionServiceMock.getRelease.mockResolvedValue("1.2.3")

    await service.track("test_event", { foo: "bar" })

    expect(globalThis.umami?.track).toHaveBeenCalledWith("test_event", {
      foo: "bar",
      buildVersion: "test-version",
      buildEnvironment: "test-env",
      appVersion: "1.2.3",
      platform: "android",
    })
  })

  it("should not fail if optional eventData is omitted", async () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android")

    await service.track("test_event_2")

    expect(globalThis.umami?.track).toHaveBeenCalledWith("test_event_2", {
      buildVersion: "test-version",
      buildEnvironment: "test-env",
      platform: "android",
    })
  })

  it("should securely swallow errors and not throw if getBuildInfo fails", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined)
    buildVersionServiceMock.getBuildInfo.mockRejectedValue(
      new Error("Build info fetch failed"),
    )

    await expect(service.track("test_event")).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
    expect(globalThis.umami?.track).toHaveBeenCalled()
  })

  it("should securely swallow errors and not throw if umami.track fails", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined)
    if (globalThis.umami) {
      globalThis.umami.track = vi
        .fn()
        .mockName("track")
        .mockImplementation(() => {
          throw new Error("Mock tracking failure")
        })
    }

    await expect(service.track("test_event")).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it("should do nothing if window.umami is undefined", async () => {
    delete globalThis.umami
    await service.track("test_event", { foo: "bar" })

    expect(buildVersionServiceMock.getBuildInfo).not.toHaveBeenCalled()
  })

  // umami.track swallows network errors and resolves either way, so a report
  // could say "sent" when it wasn't.
  describe("trackDelivered", () => {
    let script: HTMLScriptElement
    let fetchSpy: Mock

    beforeEach(() => {
      script = document.createElement("script")
      script.type = "text/plain" // Never run: only its attributes are read.
      script.src = "https://umami.example.org/script.js"
      script.setAttribute("data-website-id", "site-1")
      script.setAttribute("data-before-send", "testBeforeSend")
      document.head.appendChild(script)
      ;(window as unknown as Record<string, unknown>)["testBeforeSend"] = (
        _type: string,
        payload: Record<string, unknown>,
      ) => ({ ...payload, hostname: "ios-app" })
      fetchSpy = vi
        .spyOn(window, "fetch")
        .mockResolvedValue(new Response("{}", { status: 200 }))
      vi.spyOn(Capacitor, "getPlatform").mockReturnValue("ios")
    })

    afterEach(() => {
      script.remove()
      delete (window as unknown as Record<string, unknown>)["testBeforeSend"]
    })

    it("sends the event beside the tracker's script, through its hook", async () => {
      await service.trackDelivered("report_problem", { topic: "typo" })

      const [url, init] = lastCall(vi.mocked(fetchSpy))
      expect(url).toBe("https://umami.example.org/api/send")
      const body = JSON.parse(init.body)
      expect(body.type).toBe("event")
      expect(body.payload).toEqual(
        expect.objectContaining({
          website: "site-1",
          name: "report_problem",
          hostname: "ios-app",
          data: expect.objectContaining({
            topic: "typo",
            buildVersion: "test-version",
            platform: "ios",
          }),
        }),
      )
    })

    it("sends the native app's release with a problem report", async () => {
      buildVersionServiceMock.getRelease.mockResolvedValue("1.2.3")

      await service.trackDelivered("report_problem", { topic: "typo" })

      const body = JSON.parse(lastCall(vi.mocked(fetchSpy))[1].body)
      expect(body.payload.data).toEqual({
        topic: "typo",
        buildVersion: "test-version",
        buildEnvironment: "test-env",
        appVersion: "1.2.3",
        platform: "ios",
      })
    })

    it("still sends a report when the build info can't be read", async () => {
      buildVersionServiceMock.getBuildInfo.mockRejectedValue(new Error("gone"))

      await service.trackDelivered("report_problem", { topic: "typo" })

      const body = JSON.parse(lastCall(vi.mocked(fetchSpy))[1].body)
      expect(body.payload.data).toEqual({ topic: "typo", platform: "ios" })
    })

    it("rejects when the server refuses it", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 500 }))
      await expect(
        service.trackDelivered("report_problem", {}),
      ).rejects.toThrow()
    })

    it("rejects when it can't reach the server", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"))
      await expect(
        service.trackDelivered("report_problem", {}),
      ).rejects.toThrow()
    })

    // On a stalled connection the report form stayed "sending" (and the iOS
    // sheet unanswered) until the OS gave up on the request.
    it("gives up on a request that stalls", async () => {
      vi.useFakeTimers()
      let signal: AbortSignal | undefined
      fetchSpy.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init.signal ?? undefined
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            )
          }),
      )
      let outcome: "pending" | "sent" | "failed" = "pending"
      service.trackDelivered("report_problem", {}).then(
        () => {
          outcome = "sent"
        },
        () => {
          outcome = "failed"
        },
      )

      await vi.advanceTimersByTimeAsync(DELIVERY_TIMEOUT_MS - 1)
      expect(outcome).toBe("pending")
      await vi.advanceTimersByTimeAsync(1)
      expect(signal?.aborted).toBe(true)
      expect(outcome).toBe("failed")
    })

    // build-info.json is fetched without a deadline: stalled, it held the
    // report before the delivery timeout had even started.
    it("sends without the build's details when they stall", async () => {
      vi.useFakeTimers()
      buildVersionServiceMock.getBuildInfo.mockReturnValue(
        new Promise(() => {}),
      )
      let sent = false
      service.trackDelivered("report_problem", { topic: "typo" }).then(() => {
        sent = true
      })

      await vi.advanceTimersByTimeAsync(BUILD_DATA_WAIT_MS - 1)
      expect(fetchSpy).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const body = JSON.parse(lastCall(vi.mocked(fetchSpy))[1].body)
      expect(body.payload.data).toEqual({ topic: "typo", platform: "ios" })
      expect(sent).toBe(true)
    })

    it("rejects when the tracker isn't on the page", async () => {
      script.remove()
      await expect(
        service.trackDelivered("report_problem", {}),
      ).rejects.toThrow()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})

// The native shells serve the app from https://localhost; without this every
// app page view was counted under that hostname.
describe("prepareUmamiPayload", () => {
  const payload = {
    hostname: "localhost",
    url: "/mc/7",
    referrer: "",
    website: "id",
  }

  it("labels native page views with the platform", () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android")
    expect(prepareUmamiPayload("event", payload)).toEqual({
      ...payload,
      hostname: "android-app",
      tag: "android",
    })
  })

  it("leaves web page views as they were", () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("web")
    expect(prepareUmamiPayload("event", payload)).toEqual(payload)
  })

  it("keeps what was searched or shared out of the URLs", () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("web")
    const prepared = prepareUmamiPayload("pageview", {
      url: "/search?q=doen%C3%A7a",
      referrer: "https://biblia.capuchinhos.org/?text=a&url=b&title=c",
    })
    expect(prepared["url"]).toBe("/search")
    expect(prepared["referrer"]).toBe("https://biblia.capuchinhos.org/")
  })

  it("keeps the other parameters, such as a verse or a campaign", () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("web")
    const prepared = prepareUmamiPayload("pageview", {
      url: "/jo/1?verseStart=3&q=x&utm_source=ad",
    })
    expect(prepared["url"]).toBe("/jo/1?verseStart=3&utm_source=ad")
  })
})
