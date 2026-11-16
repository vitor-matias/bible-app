import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { Subject } from "rxjs"
import type { Mock } from "vitest"
import { BackButtonService, type BackCloser } from "./back-button.service"

describe("BackButtonService", () => {
  let service: BackButtonService

  beforeEach(() => {
    service = TestBed.inject(BackButtonService)
  })

  it("reports that nothing was closed with no closers", () => {
    expect(service.closeTopmost()).toBe(false)
  })

  it("tries the most recently registered closer first", () => {
    const calls: string[] = []
    service.register(() => {
      calls.push("drawer")
      return true
    })
    service.register(() => {
      calls.push("menu")
      return true
    })

    expect(service.closeTopmost()).toBe(true)
    expect(calls).toEqual(["menu"])
  })

  it("falls through closers that had nothing open", () => {
    const drawer = vi.fn().mockName("drawer").mockReturnValue(true)
    service.register(drawer)
    service.register(() => false)

    expect(service.closeTopmost()).toBe(true)
    expect(drawer).toHaveBeenCalled()
  })

  describe("closeOnBack", () => {
    it("dismisses the sheet on back, and only until it is dismissed", () => {
      const dismissed = new Subject<void>()
      const ref = {
        dismiss: vi.fn().mockName("dismiss"),
        afterDismissed: () => dismissed.asObservable(),
      }
      service.closeOnBack(ref)

      expect(service.closeTopmost()).toBe(true)
      expect(ref.dismiss).toHaveBeenCalledTimes(1)

      dismissed.next()
      expect(service.closeTopmost()).toBe(false)
      expect(ref.dismiss).toHaveBeenCalledTimes(1)
    })
  })

  it("unregisters exactly the registration it came from", () => {
    const calls: string[] = []
    const a = () => {
      calls.push("a")
      return true
    }
    const b = () => {
      calls.push("b")
      return true
    }
    service.register(a)
    service.register(b)
    const unregisterLastA = service.register(a)

    unregisterLastA()
    service.closeTopmost()

    expect(calls).toEqual(["b"])
  })

  it("stops calling a closer once unregistered", () => {
    const closer = vi.fn().mockName("closer").mockReturnValue(true)
    const unregister = service.register(closer)

    unregister()

    expect(service.closeTopmost()).toBe(false)
    expect(closer).not.toHaveBeenCalled()
  })
})

// The website's Back left the page with a drawer or sheet open, closing it
// only as a side effect; Android's closed it first.
describe("BackButtonService on the website", () => {
  let service: BackButtonService
  let open: boolean
  let closer: Mock<BackCloser>

  /** Runs the queued history sync. */
  const sync = () => vi.advanceTimersByTimeAsync(1)
  /** Resolves on the next popstate, which history.back() fires later. */
  const popState = () =>
    new Promise<void>((resolve) =>
      window.addEventListener("popstate", () => resolve(), { once: true }),
    )
  const onPanelEntry = () => window.history.state?.appPanel === true

  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
    service = TestBed.inject(BackButtonService)
    open = false
    closer = vi.fn<BackCloser>(() => {
      open = false
      return true
    })
    service.register(closer, () => open)
    service.closeOnBrowserBack()
  })

  afterEach(async () => {
    // Leave no panel entry to the next spec.
    if (onPanelEntry()) {
      const popped = popState()
      window.history.back()
      await popped
    }
  })

  it("gives an open panel an entry of its own, which Back leaves to close it", async () => {
    const url = window.location.href
    open = true
    service.changed()
    await sync()
    expect(onPanelEntry()).toBe(true)
    expect(window.location.href).toBe(url)

    const popped = popState()
    window.history.back()
    await popped

    expect(closer).toHaveBeenCalledTimes(1)
    expect(open).toBe(false)
    await sync()
    expect(onPanelEntry()).toBe(false)
  })

  it("leaves the panel's entry when the panel is closed otherwise", async () => {
    open = true
    service.changed()
    await sync()

    open = false
    service.changed()
    const popped = popState()
    await sync()
    await popped

    expect(onPanelEntry()).toBe(false)
    expect(closer).not.toHaveBeenCalled()
  })

  // Switching the drawer from books to chapters closes it and opens it again.
  it("keeps the entry for a panel that closes for another to open", async () => {
    open = true
    service.changed()
    await sync()
    const back = vi.spyOn(window.history, "back")

    open = false
    service.changed()
    open = true
    service.changed()
    await sync()

    expect(back).not.toHaveBeenCalled()
    expect(onPanelEntry()).toBe(true)
  })

  // The navigation takes the entry over (DepthLocationStrategy); going back
  // as well would have undone it.
  it("does not go back while a link in the panel navigates", async () => {
    open = true
    service.changed()
    await sync()
    const back = vi.spyOn(window.history, "back")
    const router = TestBed.inject(Router)
    vi.spyOn(router, "currentNavigation").mockReturnValue(
      {} as ReturnType<Router["currentNavigation"]>,
    )

    open = false
    service.changed()
    await sync()

    expect(back).not.toHaveBeenCalled()
  })

  it("leaves a panel's entry a reload kept, with the panel gone", async () => {
    window.history.pushState({ appPanel: true }, "")
    const popped = popState()
    service.changed()
    await sync()
    await popped

    expect(onPanelEntry()).toBe(false)
    expect(closer).not.toHaveBeenCalled()
  })

  it("adds no entry without closeOnBrowserBack, as in the apps", async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
    const appService = TestBed.inject(BackButtonService)
    appService.register(
      () => true,
      () => true,
    )
    appService.changed()
    await sync()

    expect(onPanelEntry()).toBe(false)
  })
})
