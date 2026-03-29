import { KeepAwakeService } from "./keep-awake.service"

describe("KeepAwakeService", () => {
  let service: KeepAwakeService
  let addEventListenerSpy: jasmine.Spy
  let removeEventListenerSpy: jasmine.Spy
  let originalWakeLock: Navigator["wakeLock"]
  let hadOwnVisibilityState: boolean
  let originalVisibilityState: DocumentVisibilityState

  beforeEach(() => {
    originalWakeLock = navigator.wakeLock
    hadOwnVisibilityState = Object.hasOwn(document, "visibilityState")
    originalVisibilityState = document.visibilityState
    addEventListenerSpy = spyOn(document, "addEventListener").and.callThrough()
    removeEventListenerSpy = spyOn(
      document,
      "removeEventListener",
    ).and.callThrough()
  })

  afterEach(() => {
    if (originalWakeLock === undefined) {
      Reflect.deleteProperty(navigator, "wakeLock")
    } else {
      Object.defineProperty(navigator, "wakeLock", {
        value: originalWakeLock,
        configurable: true,
      })
    }

    if (hadOwnVisibilityState) {
      Object.defineProperty(document, "visibilityState", {
        value: originalVisibilityState,
        configurable: true,
      })
    } else {
      Reflect.deleteProperty(document, "visibilityState")
    }
  })

  it("should register the visibilitychange listener on construction", () => {
    service = new KeepAwakeService()

    expect(service).toBeTruthy()
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "visibilitychange",
      jasmine.any(Function),
    )
  })

  it("should request a wake lock only once while active", async () => {
    const releaseListenerSpy = jasmine.createSpy("releaseListener")
    const sentinel = {
      addEventListener: jasmine
        .createSpy("addEventListener")
        .and.callFake((_event: string, handler: EventListener) => {
          releaseListenerSpy.and.callFake(() => handler(new Event("release")))
        }),
      release: jasmine.createSpy("release").and.resolveTo(),
    } as unknown as WakeLockSentinel
    const requestSpy = jasmine.createSpy("request").and.resolveTo(sentinel)
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestSpy },
      configurable: true,
    })
    service = new KeepAwakeService()

    service.start()
    await Promise.resolve()
    await Promise.resolve()
    service.start()
    await Promise.resolve()

    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(sentinel.addEventListener).toHaveBeenCalledWith(
      "release",
      jasmine.any(Function),
    )
  })

  it("should release the wake lock when stopped", async () => {
    const sentinel = {
      addEventListener: jasmine.createSpy("addEventListener"),
      release: jasmine.createSpy("release").and.resolveTo(),
    } as unknown as WakeLockSentinel
    const requestSpy = jasmine.createSpy("request").and.resolveTo(sentinel)
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestSpy },
      configurable: true,
    })
    service = new KeepAwakeService()

    service.start()
    await Promise.resolve()
    service.stop()
    await Promise.resolve()

    expect(requestSpy).toHaveBeenCalled()
    expect(sentinel.release).toHaveBeenCalled()
  })

  it("should reacquire the wake lock when the document becomes visible again", async () => {
    const sentinel = {
      addEventListener: jasmine.createSpy("addEventListener"),
      release: jasmine.createSpy("release").and.resolveTo(),
    } as unknown as WakeLockSentinel
    const requestSpy = jasmine.createSpy("request").and.resolveTo(sentinel)
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestSpy },
      configurable: true,
    })
    service = new KeepAwakeService()
    service.start()
    await Promise.resolve()

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    })
    ;(service as unknown as Record<string, WakeLockSentinel | undefined>)[
      "wakeLockSentinel"
    ] = undefined
    document.dispatchEvent(new Event("visibilitychange"))
    await Promise.resolve()

    expect(requestSpy).toHaveBeenCalledTimes(2)
  })

  it("should remove the visibilitychange listener on destroy", () => {
    service = new KeepAwakeService()

    service.ngOnDestroy()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "visibilitychange",
      jasmine.any(Function),
    )
  })
})
