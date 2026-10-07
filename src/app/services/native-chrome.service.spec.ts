import { OverlayContainer } from "@angular/cdk/overlay"
import { DOCUMENT } from "@angular/common"
import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import { NATIVE_CHROME_PLUGIN } from "../tokens"
import type { PassagePickerData } from "../utils/passage-picker"
import {
  COLLAPSE_DISTANCE,
  type NativeChromeAction,
  NativeChromeService,
  type ReaderChrome,
  type SearchChrome,
} from "./native-chrome.service"

const READER: ReaderChrome = {
  mode: "reader",
  themeMode: "system",
  passageLabel: "Génesis 1",
  passageAccessibilityLabel: "Génesis 1",
  chapterNavigation: true,
  canGoPrevious: true,
  canGoNext: true,
  search: true,
  viewMode: "scrolling",
  autoScrollVisible: false,
  autoScrollAvailable: true,
  canShare: true,
  canReport: true,
}

const SEARCH: SearchChrome = { mode: "search", themeMode: "dark", query: "" }

describe("NativeChromeService", () => {
  let plugin: {
    setState: jasmine.Spy
    showPicker: jasmine.Spy
    showBookmarks: jasmine.Spy
    updateBookmarks: jasmine.Spy
    showToast: jasmine.Spy
    showReport: jasmine.Spy
    finishReport: jasmine.Spy
    addListener: jasmine.Spy
  }
  /** Tests that need more of the document add it. */
  let doc: Record<string, unknown>
  let body: HTMLElement
  let root: HTMLElement
  let overlays: HTMLElement

  beforeEach(() => {
    plugin = {
      setState: jasmine
        .createSpy("setState")
        .and.resolveTo({ top: 116, bottom: 82 }),
      showPicker: jasmine.createSpy("showPicker").and.resolveTo(),
      showBookmarks: jasmine.createSpy("showBookmarks").and.resolveTo(),
      updateBookmarks: jasmine.createSpy("updateBookmarks").and.resolveTo(),
      showToast: jasmine.createSpy("showToast").and.resolveTo(),
      showReport: jasmine.createSpy("showReport").and.resolveTo(),
      finishReport: jasmine.createSpy("finishReport").and.resolveTo(),
      addListener: jasmine.createSpy("addListener").and.resolveTo(),
    }
    body = document.createElement("body")
    root = document.createElement("html")
    overlays = document.createElement("div")
    doc = { body, documentElement: root }
    TestBed.configureTestingModule({
      providers: [
        { provide: NATIVE_CHROME_PLUGIN, useValue: plugin },
        { provide: DOCUMENT, useValue: doc },
        {
          provide: OverlayContainer,
          useValue: { getContainerElement: () => overlays },
        },
      ],
    })
  })

  function create(
    platform: "ios" | "android" | "web",
    pluginAvailable = true,
  ): NativeChromeService {
    spyOn(Capacitor, "getPlatform").and.returnValue(platform)
    spyOn(Capacitor, "isPluginAvailable").and.returnValue(pluginAvailable)
    const service = TestBed.inject(NativeChromeService)
    service.init()
    return service
  }

  /** Lets MutationObserver callbacks and plugin promises run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve))

  const lastState = () => plugin.setState.calls.mostRecent().args[0]

  function listener(event: "action" | "insets") {
    const call = plugin.addListener.calls
      .all()
      .find(({ args }) => args[0] === event)
    return call?.args[1]
  }

  it("is enabled only in the iOS app, which provides the plugin", () => {
    expect(create("ios").enabled).toBeTrue()
  })

  for (const [platform, available] of [
    ["android", true],
    ["web", false],
    ["ios", false],
  ] as const) {
    it(`does nothing on ${platform} with the plugin ${available ? "present" : "absent"}`, fakeAsync(() => {
      const service = create(platform, available)
      service.show(READER)
      service.hide()
      service.showPicker({} as PassagePickerData)
      const stop = service.trackScroll(document.createElement("div"))
      stop()
      tick()

      expect(service.enabled).toBeFalse()
      expect(body.classList).not.toContain("native-chrome")
      expect(plugin.addListener).not.toHaveBeenCalled()
      expect(plugin.setState).not.toHaveBeenCalled()
      expect(plugin.showPicker).not.toHaveBeenCalled()
    }))
  }

  it("marks the body so pages drop their web headers' space", () => {
    create("ios")
    expect(body.classList).toContain("native-chrome")
  })

  it("shows the page's bars", () => {
    create("ios").show(READER)
    expect(lastState()).toEqual({
      ...READER,
      inert: false,
      collapsed: false,
      autoScroll: null,
    })
  })

  it("pads the page by the space the bars cover", async () => {
    create("ios").show(READER)
    await settle()
    expect(root.style.getPropertyValue("--native-chrome-top")).toBe("116px")
    expect(root.style.getPropertyValue("--native-chrome-bottom")).toBe("82px")

    // The search field rides up with the keyboard.
    listener("insets")({ top: 116, bottom: 380 })
    expect(root.style.getPropertyValue("--native-chrome-bottom")).toBe("380px")
  })

  it("relays taps, with their details", () => {
    const service = create("ios")
    const actions: NativeChromeAction[] = []
    service.actions$.subscribe((action) => actions.push(action))

    listener("action")({ id: "bookmarks" })
    listener("action")({ id: "goto", bookId: "exo", chapter: 2 })

    expect(actions).toEqual([
      { id: "bookmarks" },
      { id: "goto", bookId: "exo", chapter: 2 },
    ])
  })

  it("opens the passage picker", () => {
    const data: PassagePickerData = {
      sections: [],
      currentBookId: "gen",
      currentChapter: 1,
    }
    create("ios").showPicker(data)
    expect(plugin.showPicker).toHaveBeenCalledWith(data)
  })

  it("removes the bars once the page is gone", fakeAsync(() => {
    const service = create("ios")
    service.show(READER)
    service.hide()
    expect(plugin.setState).toHaveBeenCalledTimes(1)

    tick()
    expect(lastState()).toEqual({ mode: "none" })
  }))

  // A route change destroys one page and creates the next.
  it("keeps the bars up when the next page takes over at once", fakeAsync(() => {
    const service = create("ios")
    service.show(READER)
    service.hide()
    service.show(SEARCH)
    tick()

    expect(plugin.setState).not.toHaveBeenCalledWith({ mode: "none" })
    expect(lastState()).toEqual({
      ...SEARCH,
      inert: false,
      collapsed: false,
      autoScroll: null,
    })
  }))

  // A panel (footnotes, a dialog) opens under the bars, which sit above the
  // whole web view: they slide away while it is open.
  it("hides the reader's bars while a dialog's backdrop shows", async () => {
    create("ios").show(READER)
    const backdrop = document.createElement("div")
    backdrop.className = "cdk-overlay-backdrop cdk-overlay-dark-backdrop"
    overlays.appendChild(backdrop)
    await settle()
    // Not showing yet: the backdrop fades in once attached.
    expect(plugin.setState).toHaveBeenCalledTimes(1)

    backdrop.classList.add("cdk-overlay-backdrop-showing")
    await settle()
    expect(lastState()).toEqual(
      jasmine.objectContaining({ inert: true, collapsed: true }),
    )

    backdrop.classList.remove("cdk-overlay-backdrop-showing")
    await settle()
    expect(lastState()).toEqual(
      jasmine.objectContaining({ inert: false, collapsed: false }),
    )
  })

  it("keeps the search page's bars, inert, under a dialog", async () => {
    create("ios").show(SEARCH)
    const backdrop = document.createElement("div")
    backdrop.className =
      "cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing"
    overlays.appendChild(backdrop)
    await settle()

    expect(lastState()).toEqual(
      jasmine.objectContaining({ inert: true, collapsed: false }),
    )
  })

  it("passes toasts through, held for the keyboard or not", () => {
    const service = create("ios")
    service.toast("Copiado")
    service.toast("Encontrados 3 resultados", { afterKeyboard: true })

    expect(plugin.showToast).toHaveBeenCalledWith({
      message: "Copiado",
      afterKeyboard: false,
    })
    expect(plugin.showToast).toHaveBeenCalledWith({
      message: "Encontrados 3 resultados",
      afterKeyboard: true,
    })
  })

  describe("a toast with a button", () => {
    let service: NativeChromeService
    let goBack: jasmine.Spy

    beforeEach(() => {
      service = create("ios")
      goBack = jasmine.createSpy("goBack")
      service.toast("Voltar para Gn 1,3?", {
        action: "Voltar",
        onAction: goBack,
      })
    })

    it("shows the button", () => {
      expect(plugin.showToast).toHaveBeenCalledWith({
        message: "Voltar para Gn 1,3?",
        afterKeyboard: false,
        action: "Voltar",
      })
    })

    it("runs the action once, when its button is tapped", () => {
      const actions: NativeChromeAction[] = []
      service.actions$.subscribe((action) => actions.push(action))

      listener("action")({ id: "toast-action" })
      listener("action")({ id: "toast-action" })

      expect(goBack).toHaveBeenCalledTimes(1)
      expect(actions).toEqual([])
    })

    it("forgets the action once another toast replaces it", () => {
      service.toast("Copiado")
      listener("action")({ id: "toast-action" })

      expect(goBack).not.toHaveBeenCalled()
    })
  })

  it("passes the report sheet and the outcome through", () => {
    const service = create("ios")
    const state = {
      message: "Encontrou algum problema?",
      topics: [{ value: "typo", label: "Erro Ortográfico" }],
      placeholder: "",
      maxLength: 500,
    }
    service.showReport(state)
    service.finishReport({ sent: false, message: "Tente novamente." })

    expect(plugin.showReport).toHaveBeenCalledWith(state)
    expect(plugin.finishReport).toHaveBeenCalledWith({
      sent: false,
      message: "Tente novamente.",
    })
  })

  // The pages scroll in elements of their own, out of the web view's reach.
  describe("a tap on the status bar", () => {
    let scroller: HTMLElement
    let line: HTMLElement
    let reduceMotion: boolean
    let scrollTo: jasmine.Spy

    beforeEach(() => {
      scroller = document.createElement("div")
      scroller.style.cssText = "height: 100px; overflow-y: scroll"
      line = document.createElement("p")
      line.style.height = "2000px"
      scroller.appendChild(line)
      document.body.appendChild(scroller)
      scroller.scrollTop = 600
      reduceMotion = false
      Object.assign(doc, {
        defaultView: {
          innerWidth: 400,
          innerHeight: 800,
          matchMedia: () => ({ matches: reduceMotion }),
        },
        scrollingElement: document.documentElement,
        // Under the middle of the screen: a line of the text.
        elementFromPoint: (x: number, y: number) =>
          x === 200 && y === 400 ? line : null,
      })
      scrollTo = spyOn(scroller, "scrollTo")
    })

    afterEach(() => scroller.remove())

    const tap = () => listener("action")({ id: "scroll-top" })

    it("glides the text under the middle of the screen to the top", () => {
      const service = create("ios")
      const actions: NativeChromeAction[] = []
      service.actions$.subscribe((action) => actions.push(action))
      tap()

      expect(scrollTo).toHaveBeenCalledOnceWith({
        top: 0,
        behavior: "smooth",
      })
      expect(actions).toEqual([])
    })

    it("brings the reader's bars back", () => {
      const service = create("ios")
      service.show(READER)
      service.trackScroll(scroller)
      scroller.dispatchEvent(new Event("touchmove"))
      scroller.scrollTop = 600 + COLLAPSE_DISTANCE
      scroller.dispatchEvent(new Event("scroll"))
      expect(lastState().collapsed).toBeTrue()

      tap()
      expect(lastState().collapsed).toBeFalse()
    })

    it("jumps with reduced motion, and while auto-scroll plays", () => {
      const service = create("ios")
      reduceMotion = true
      tap()
      reduceMotion = false
      service.show(READER)
      service.setAutoScroll({
        playing: true,
        speedLabel: "1 ln/s",
        canSlower: true,
        canFaster: true,
      })
      tap()

      expect(scrollTo).toHaveBeenCalledTimes(2)
      for (const call of scrollTo.calls.all()) {
        expect(call.args[0]).toEqual({ top: 0, behavior: "auto" })
      }
    })

    it("leaves a page already at the top alone", () => {
      create("ios")
      scroller.scrollTop = 0
      const pageScroll = spyOn(document.body, "scrollTo")
      tap()

      expect(scrollTo).not.toHaveBeenCalled()
      expect(pageScroll).not.toHaveBeenCalled()
    })
  })

  it("passes the bookmarks sheet through", () => {
    const service = create("ios")
    const state = { currentLabel: "Mateus 11", ribbons: [] }
    service.showBookmarks(state)
    service.updateBookmarks(state)

    expect(plugin.showBookmarks).toHaveBeenCalledWith(state)
    expect(plugin.updateBookmarks).toHaveBeenCalledWith(state)
  })

  it("ignores a menu's transparent backdrop", async () => {
    create("ios").show(READER)
    const backdrop = document.createElement("div")
    backdrop.className =
      "cdk-overlay-backdrop cdk-overlay-transparent-backdrop cdk-overlay-backdrop-showing"
    overlays.appendChild(backdrop)
    await settle()

    expect(plugin.setState).toHaveBeenCalledTimes(1)
  })

  describe("hiding the reader's bars while reading", () => {
    let scroller: HTMLElement
    let service: NativeChromeService

    beforeEach(() => {
      scroller = document.createElement("div")
      scroller.style.cssText = "height: 100px; overflow-y: scroll"
      const content = document.createElement("div")
      content.style.height = "2000px"
      scroller.appendChild(content)
      document.body.appendChild(scroller)
      service = create("ios")
      service.show(READER)
    })

    afterEach(() => scroller.remove())

    /** The reader scrolling with a finger. */
    const scrollTo = (top: number) => {
      scroller.dispatchEvent(new Event("touchmove"))
      scroller.scrollTop = top
      scroller.dispatchEvent(new Event("scroll"))
    }
    const collapsed = () => lastState().collapsed

    it("hides them on scrolling down, and brings them back on scrolling up", () => {
      service.trackScroll(scroller)

      scrollTo(10)
      expect(collapsed()).toBeFalse()
      scrollTo(10 + COLLAPSE_DISTANCE)
      expect(collapsed()).toBeTrue()
      expect(body.classList).toContain("native-chrome-collapsed")

      scrollTo(500)
      scrollTo(500 - COLLAPSE_DISTANCE)
      expect(collapsed()).toBeFalse()
      expect(body.classList).not.toContain("native-chrome-collapsed")
    })

    it("brings them back at the end of the chapter, where the arrows are", () => {
      service.trackScroll(scroller)
      scrollTo(200)
      expect(collapsed()).toBeTrue()

      scrollTo(scroller.scrollHeight - scroller.clientHeight)
      expect(collapsed()).toBeFalse()
    })

    it("brings them back when tracking stops", () => {
      const stop = service.trackScroll(scroller)
      scrollTo(200)
      stop()

      expect(collapsed()).toBeFalse()
      scrollTo(600)
      expect(collapsed()).toBeFalse()
    })

    it("keeps them up while auto-scroll's controls are in the toolbar", () => {
      const autoScroll = {
        playing: true,
        speedLabel: "1 ln/s",
        canSlower: true,
        canFaster: true,
      }
      service.trackScroll(scroller)
      scrollTo(200)
      expect(collapsed()).toBeTrue()

      service.setAutoScroll(autoScroll)
      expect(lastState()).toEqual(
        jasmine.objectContaining({ autoScroll, collapsed: false }),
      )

      // Auto-scroll scrolls on; closing it must not hide the bars it kept up.
      scrollTo(400)
      service.setAutoScroll(null)
      expect(lastState()).toEqual(
        jasmine.objectContaining({ autoScroll: null, collapsed: false }),
      )
    })

    // Opening a footnote's reference scrolls to its verse.
    it("leaves them alone when the page scrolls itself", () => {
      service.trackScroll(scroller)
      scroller.scrollTop = 600
      scroller.dispatchEvent(new Event("scroll"))
      expect(collapsed()).toBeFalse()

      // And measures the reader's next scroll from where it landed.
      scrollTo(600 + COLLAPSE_DISTANCE - 1)
      expect(collapsed()).toBeFalse()
      scrollTo(600 + COLLAPSE_DISTANCE)
      expect(collapsed()).toBeTrue()
    })

    it("never hides the search page's bars", () => {
      service.trackScroll(scroller)
      scrollTo(200)
      service.show(SEARCH)

      expect(collapsed()).toBeFalse()
    })
  })

  // styles.css: the iOS app has no accent colour, and the web controls it still
  // shows (the report dialog's fields and buttons) must not keep the brown.
  describe("colours left to the web in the iOS app", () => {
    const BROWN = /#543d27|rgb\(84, 61, 39\)/i
    const tokens = [
      "--cap-brown",
      "--mat-form-field-focus-color",
      "--mat-form-field-filled-focus-active-indicator-color",
      "--mdc-filled-button-container-color",
    ]
    let host: HTMLElement

    beforeEach(() => {
      host = document.createElement("div")
      document.body.appendChild(host)
    })
    afterEach(() => {
      host.remove()
      document.body.classList.remove("native-chrome")
    })

    it("are brown on the web", () => {
      expect(getComputedStyle(host).getPropertyValue("--cap-brown")).toMatch(
        BROWN,
      )
    })

    it("are the text colour in the iOS app", () => {
      document.body.classList.add("native-chrome")
      for (const token of tokens) {
        const value = getComputedStyle(host).getPropertyValue(token).trim()
        expect(value).withContext(token).not.toMatch(BROWN)
        expect(value)
          .withContext(token)
          .toBe(getComputedStyle(host).getPropertyValue("--text-color").trim())
      }
    })
  })
})
