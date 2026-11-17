import {
  BrowserPlatformLocation,
  Location,
  LocationStrategy,
  PlatformLocation,
} from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { NavigationStart, provideRouter, Router } from "@angular/router"
import { Subject } from "rxjs"
import type { Mock } from "vitest"
import { BackButtonService, type BackCloser } from "./back-button.service"
import { DepthLocationStrategy } from "./depth-location-strategy"

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
      const dismiss = vi.fn().mockName("dismiss")
      const ref = { dismiss, afterDismissed: () => dismissed.asObservable() }
      service.closeOnBack(ref)

      expect(service.closeTopmost()).toBe(true)
      expect(dismiss).toHaveBeenCalledTimes(1)

      dismissed.next()
      expect(service.closeTopmost()).toBe(false)
      expect(dismiss).toHaveBeenCalledTimes(1)
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
  const onPanelEntry = () => window.history.state?.appPanel === true
  /** Waits for history.back(), which pops later, to have left the entry. */
  const leftPanelEntry = () =>
    vi.waitFor(() => expect(onPanelEntry()).toBe(false))

  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: "**", children: [] }]),
        // The real address and history: TestBed mocks them by default.
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
        { provide: LocationStrategy, useClass: DepthLocationStrategy },
      ],
    })
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
      window.history.back()
      await leftPanelEntry()
    }
  })

  it("gives an open panel an entry of its own, which Back leaves to close it", async () => {
    const url = window.location.href
    open = true
    service.changed()
    await sync()
    expect(onPanelEntry()).toBe(true)
    expect(window.location.href).toBe(url)

    window.history.back()
    await leftPanelEntry()

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
    await sync()
    await leftPanelEntry()

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
    service.changed()
    await sync()
    await leftPanelEntry()

    expect(closer).not.toHaveBeenCalled()
  })

  // The index writes a theme's address itself (Location.go), the reader drops
  // its notes from the address (Location.replaceState): the router's URL was
  // behind, and closing a menu or sheet over them navigated, which rebuilt the
  // index (its open theme lost) and scrolled the reader to the verse again.
  const pageWrites: [string, (location: Location, url: string) => void][] = [
    ["a step it took itself", (location, url) => location.go(url)],
    ["an address it replaced", (location, url) => location.replaceState(url)],
  ]
  for (const [name, write] of pageWrites) {
    it(`keeps the router still over ${name}`, async () => {
      const router = TestBed.inject(Router)
      const location = TestBed.inject(Location)
      const path = location.path()
      router.initialNavigation()
      await vi.waitFor(() => expect(router.navigated).toBe(true))
      const starts: string[] = []
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) starts.push(event.url)
      })
      write(location, `${path.split("?")[0]}?tema=amor`)

      try {
        // Closed with its ✕ ...
        open = true
        service.changed()
        await sync()
        open = false
        service.changed()
        await sync()
        await leftPanelEntry()
        // ... and with Back.
        open = true
        service.changed()
        await sync()
        window.history.back()
        await leftPanelEntry()
        await vi.advanceTimersByTimeAsync(10)

        expect(closer).toHaveBeenCalledTimes(1)
        expect(starts).toEqual([])
      } finally {
        location.replaceState(path)
      }
    })
  }

  // «Voltar» over the notes opened on a reference steps back two entries, past
  // the panel's and its page's (ToastService).
  it("closes the panel when the history steps back past its page", async () => {
    const location = TestBed.inject(Location)
    const path = location.path()
    location.go(`${path.split("?")[0]}?referencia=jo1`)
    try {
      open = true
      service.changed()
      await sync()

      window.history.go(-2)
      await vi.waitFor(() =>
        expect(window.location.href).not.toContain("referencia"),
      )
      await sync()

      expect(closer).toHaveBeenCalledTimes(1)
      expect(open).toBe(false)
      expect(onPanelEntry()).toBe(false)
    } finally {
      location.replaceState(path)
    }
  })

  describe("among the router's pages", () => {
    let router: Router
    let location: Location
    let path: string

    beforeEach(async () => {
      router = TestBed.inject(Router)
      location = TestBed.inject(Location)
      path = location.path()
      router.initialNavigation()
      await vi.waitFor(() => expect(router.navigated).toBe(true))
    })

    afterEach(() => location.replaceState(path))

    const page = (name: string) => `${path.split("?")[0] || "/"}?pagina=${name}`
    const settled = async () => {
      await vi.advanceTimersByTimeAsync(10)
      await vi.waitFor(() => expect(router.currentNavigation()).toBeNull())
      await sync()
    }

    // A reference followed from the notes dismisses the sheet and navigates:
    // the sheet, open until its exit animation ended, got a new entry over
    // the reference's page, which it then went back over, leaving it ahead.
    it("adds no entry for a sheet closed from inside while a link navigates", async () => {
      await router.navigateByUrl(page("notas"))
      const dismissed = new Subject<void>()
      const ref = { dismiss: vi.fn(), afterDismissed: () => dismissed }
      service.closeOnBack(ref)
      await sync()
      expect(onPanelEntry()).toBe(true)
      const length = window.history.length

      ref.dismiss()
      await router.navigateByUrl(page("referencia"))
      await settled()
      dismissed.next()
      await settled()

      expect(onPanelEntry()).toBe(false)
      expect(window.history.length).toBe(length)
      expect(router.url).toBe(page("referencia"))
    })

    // ‹ › to a chapter that then failed to load, with the menu opened in
    // between: the revert to the chapter before rewrote the menu's entry,
    // and closing the menu stepped back onto the failed chapter, which the
    // router went to again.
    it("closes the panel for a page put in place of the one under it", async () => {
      await router.navigateByUrl(page("1"))
      await router.navigateByUrl(page("2"))
      open = true
      service.changed()
      await sync()
      const length = window.history.length

      await router.navigateByUrl(page("1"), { replaceUrl: true })
      await vi.waitFor(() => expect(window.location.href).toContain("pagina=1"))
      await settled()

      expect(open).toBe(false)
      expect(onPanelEntry()).toBe(false)
      expect(router.url).toBe(page("1"))
      expect(window.history.length).toBe(length)
      // The chapter before, as without the panel: not the failed one.
      const depth = window.history.state?.appDepth
      window.history.back()
      await vi.waitFor(() =>
        expect(window.history.state?.appDepth).toBe(depth - 1),
      )
      await settled()
      expect(window.location.href).toContain("pagina=1")
      expect(router.url).toBe(page("1"))
    })

    // A link's notes open on arrival (the reader's openLinkedNotes), after
    // the address drops `notes` with the drawer's state: the step back over
    // the drawer's entry was taken for the reader's Back and closed the notes
    // just opened, and the page's own entry took the drawer's flag.
    it("closes the panels under a page's new address, not one opened since", async () => {
      await router.navigateByUrl(page("a"))
      open = true
      service.changed()
      await sync()
      const dismissed = new Subject<void>()
      const dismiss = vi.fn()
      const notes = { dismiss, afterDismissed: () => dismissed }

      location.replaceState(page("sem-notas"), "", location.getState())
      service.closeOnBack(notes)
      await vi.waitFor(() =>
        expect(window.location.href).toContain("pagina=sem-notas"),
      )
      await settled()

      expect(closer).toHaveBeenCalledTimes(1)
      expect(dismiss).not.toHaveBeenCalled()
      expect(onPanelEntry()).toBe(true)

      window.history.back()
      await vi.waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1))
      expect(onPanelEntry()).toBe(false)
      expect(window.location.href).toContain("pagina=sem-notas")
      dismissed.next()
      await settled()
      expect(onPanelEntry()).toBe(false)
      expect(router.url).toBe(page("a"))
    })

    // Forward after a Back that closed the panel lands on its entry with
    // nothing open: stepped back over at once, the router left alone.
    it("steps back over a panel's entry Forward lands on", async () => {
      await router.navigateByUrl(page("x"))
      open = true
      service.changed()
      await sync()
      window.history.back()
      await leftPanelEntry()
      await settled()
      const starts: string[] = []
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) starts.push(event.url)
      })

      window.history.forward()
      await vi.waitFor(() => expect(onPanelEntry()).toBe(true))
      await settled()
      await leftPanelEntry()
      await settled()

      expect(closer).toHaveBeenCalledTimes(1)
      expect(starts).toEqual([])
      expect(router.url).toBe(page("x"))
    })

    // Back from a page's drawer, Back again, then two entries forward at once
    // landed on the drawer's entry: taken for a panel's step, the router
    // stayed on the earlier page under the later one's address.
    it("lets the router follow a jump onto a panel's entry from another page", async () => {
      await router.navigateByUrl(page("w"))
      await router.navigateByUrl(page("x"))
      open = true
      service.changed()
      await sync()
      window.history.back()
      await leftPanelEntry()
      await settled()
      window.history.back()
      await vi.waitFor(() => expect(router.url).toBe(page("w")))

      window.history.go(2)
      await vi.waitFor(() => expect(window.location.href).toContain("pagina=x"))
      await settled()
      await leftPanelEntry()
      await settled()

      expect(router.url).toBe(page("x"))
    })
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
