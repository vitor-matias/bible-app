import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import { AnalyticsService, labelUmamiPlatform } from "./analytics.service"
import { BuildVersionService } from "./build-version.service"

describe("AnalyticsService", () => {
  let service: AnalyticsService
  let buildVersionServiceMock: jasmine.SpyObj<BuildVersionService>

  beforeEach(() => {
    buildVersionServiceMock = jasmine.createSpyObj("BuildVersionService", [
      "getBuildInfo",
    ])
    buildVersionServiceMock.getBuildInfo.and.returnValue(
      Promise.resolve({
        buildVersion: "test-version",
        buildEnvironment: "test-env",
      }),
    )

    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: BuildVersionService, useValue: buildVersionServiceMock },
      ],
    })
    service = TestBed.inject(AnalyticsService)

    // Setup global umami mock
    globalThis.umami = {
      track: jasmine.createSpy("track"),
    }
  })

  afterEach(() => {
    delete globalThis.umami
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it("should call umami.track with event name, data, build version, and platform", async () => {
    spyOn(Capacitor, "getPlatform").and.returnValue("web")

    await service.track("test_event", { foo: "bar" })

    expect(buildVersionServiceMock.getBuildInfo).toHaveBeenCalled()
    expect(globalThis.umami?.track).toHaveBeenCalledWith("test_event", {
      foo: "bar",
      buildVersion: "test-version",
      buildEnvironment: "test-env",
      platform: "web",
    })
  })

  it("should not fail if optional eventData is omitted", async () => {
    spyOn(Capacitor, "getPlatform").and.returnValue("android")

    await service.track("test_event_2")

    expect(globalThis.umami?.track).toHaveBeenCalledWith("test_event_2", {
      buildVersion: "test-version",
      buildEnvironment: "test-env",
      platform: "android",
    })
  })

  it("should securely swallow errors and not throw if getBuildInfo fails", async () => {
    spyOn(console, "error")
    buildVersionServiceMock.getBuildInfo.and.returnValue(
      Promise.reject(new Error("Build info fetch failed")),
    )

    await expectAsync(service.track("test_event")).toBeResolved()
    expect(console.error).toHaveBeenCalled()
    expect(globalThis.umami?.track).toHaveBeenCalled()
  })

  it("should securely swallow errors and not throw if umami.track fails", async () => {
    spyOn(console, "error")
    if (globalThis.umami) {
      globalThis.umami.track = jasmine
        .createSpy("track")
        .and.throwError("Mock tracking failure")
    }

    await expectAsync(service.track("test_event")).toBeResolved()
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
    let fetchSpy: jasmine.Spy

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
      fetchSpy = spyOn(window, "fetch").and.resolveTo(
        new Response("{}", { status: 200 }),
      )
      spyOn(Capacitor, "getPlatform").and.returnValue("ios")
    })

    afterEach(() => {
      script.remove()
      delete (window as unknown as Record<string, unknown>)["testBeforeSend"]
    })

    it("sends the event beside the tracker's script, through its hook", async () => {
      await service.trackDelivered("report_problem", { topic: "typo" })

      const [url, init] = fetchSpy.calls.mostRecent().args
      expect(url).toBe("https://umami.example.org/api/send")
      const body = JSON.parse(init.body)
      expect(body.type).toBe("event")
      expect(body.payload).toEqual(
        jasmine.objectContaining({
          website: "site-1",
          name: "report_problem",
          hostname: "ios-app",
          data: jasmine.objectContaining({
            topic: "typo",
            buildVersion: "test-version",
            platform: "ios",
          }),
        }),
      )
    })

    it("rejects when the server refuses it", async () => {
      fetchSpy.and.resolveTo(new Response("", { status: 500 }))
      await expectAsync(
        service.trackDelivered("report_problem", {}),
      ).toBeRejected()
    })

    it("rejects when it can't reach the server", async () => {
      fetchSpy.and.rejectWith(new TypeError("Failed to fetch"))
      await expectAsync(
        service.trackDelivered("report_problem", {}),
      ).toBeRejected()
    })

    it("rejects when the tracker isn't on the page", async () => {
      script.remove()
      await expectAsync(
        service.trackDelivered("report_problem", {}),
      ).toBeRejected()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})

// The native shells serve the app from https://localhost; without this every
// app page view was counted under that hostname.
describe("labelUmamiPlatform", () => {
  const payload = { hostname: "localhost", url: "/mc/7", website: "id" }

  it("labels native page views with the platform", () => {
    spyOn(Capacitor, "getPlatform").and.returnValue("android")
    expect(labelUmamiPlatform("event", payload)).toEqual({
      ...payload,
      hostname: "android-app",
      tag: "android",
    })
  })

  it("leaves web page views untouched", () => {
    spyOn(Capacitor, "getPlatform").and.returnValue("web")
    expect(labelUmamiPlatform("event", payload)).toBe(payload)
  })
})
