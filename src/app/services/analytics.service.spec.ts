import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import { AnalyticsService } from "./analytics.service"
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
    globalThis.umami!.track = jasmine
      .createSpy("track")
      .and.throwError("Mock tracking failure")

    await expectAsync(service.track("test_event")).toBeResolved()
    expect(console.error).toHaveBeenCalled()
  })

  it("should do nothing if window.umami is undefined", async () => {
    delete globalThis.umami
    await service.track("test_event", { foo: "bar" })

    expect(buildVersionServiceMock.getBuildInfo).not.toHaveBeenCalled()
  })
})
