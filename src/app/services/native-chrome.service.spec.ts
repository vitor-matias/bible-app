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
  WEB_BARS,
  WEB_BARS_QUERY,
} from "./native-chrome.service"
import { WebChromeBars } from "./web-chrome-bars.service"

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
  bookmarkColor: null,
  bookmarkName: null,
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
    it(`does nothing on ${platform} with the plugin ${available ? "present" : "absent"}, without the web's bars`, fakeAsync(() => {
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

  // The Android app and phone browsers: the same bars, drawn by the page.
  describe("with the web's own bars", () => {
    let web: {
      setState: jasmine.Spy
      showPicker: jasmine.Spy
      showBookmarks: jasmine.Spy
      showToast: jasmine.Spy
      addListener: jasmine.Spy
    }

    beforeEach(() => {
      web = {
        setState: jasmine
          .createSpy("setState")
          .and.resolveTo({ top: 64, bottom: 88 }),
        showPicker: jasmine.createSpy("showPicker").and.resolveTo(),
        showBookmarks: jasmine.createSpy("showBookmarks").and.resolveTo(),
        showToast: jasmine.createSpy("showToast").and.resolveTo(),
        addListener: jasmine.createSpy("addListener").and.resolveTo(),
      }
      TestBed.overrideProvider(WEB_BARS, { useValue: true })
      TestBed.overrideProvider(WebChromeBars, { useValue: web })
    })

    it("draws the bars in the page from the same state", async () => {
      const service = create("android")
      service.show(READER)
      await settle()

      expect(service.bars).toBeTrue()
      expect(service.enabled).toBeFalse()
      expect(body.classList).toContain("native-chrome")
      expect(web.setState).toHaveBeenCalledWith(
        jasmine.objectContaining({ mode: "reader", passageLabel: "Génesis 1" }),
      )
      expect(plugin.setState).not.toHaveBeenCalled()
      expect(root.style.getPropertyValue("--native-chrome-top")).toBe("64px")
    })

    it("passes its taps to the page", () => {
      const service = create("web")
      const actions: NativeChromeAction[] = []
      service.actions$.subscribe((action) => actions.push(action))
      const tap = web.addListener.calls
        .all()
        .find(({ args }) => args[0] === "action")?.args[1]

      tap({ id: "passage" })
      expect(actions).toEqual([{ id: "passage" }])
    })

    it("opens the passage picker in the page", () => {
      const data = { sections: [] } as unknown as PassagePickerData
      create("web").showPicker(data)
      expect(web.showPicker).toHaveBeenCalledOnceWith(data)
    })

    // The web app keeps its own bookmarks, notes, reports and snack bars.
    it("leaves the iOS shell's own sheets to the web app", async () => {
      const service = create("android")
      expect(
        await service.showBookmarks({ currentLabel: "", ribbons: [] }),
      ).toBeFalse()
      service.toast("Copiado")
      expect(web.showBookmarks).not.toHaveBeenCalled()
      expect(web.showToast).not.toHaveBeenCalled()
    })
  })

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

  it("passes toasts through", () => {
    create("ios").toast("Copiado")

    expect(plugin.showToast).toHaveBeenCalledOnceWith({ message: "Copiado" })
  })

  describe("a toast that is a button", () => {
    let service: NativeChromeService
    let goBack: jasmine.Spy

    beforeEach(() => {
      service = create("ios")
      goBack = jasmine.createSpy("goBack")
      service.toast("Voltar para Gn 1,3", {
        symbol: "arrow.uturn.backward",
        onTap: goBack,
      })
    })

    it("shows it as a button, with its symbol", () => {
      expect(plugin.showToast).toHaveBeenCalledWith({
        message: "Voltar para Gn 1,3",
        button: true,
        symbol: "arrow.uturn.backward",
      })
    })

    it("runs the action once, when it is tapped", () => {
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

  // Over another sheet (say the onboarding) the shell shows none, and no
  // *-closed event would ever end the page's session with it.
  it("says whether a sheet came up", async () => {
    const service = create("ios")
    const state = { currentLabel: "Mateus 11", ribbons: [] }
    plugin.showBookmarks.and.resolveTo({ presented: true })
    expect(await service.showBookmarks(state)).toBeTrue()

    plugin.showBookmarks.and.resolveTo({ presented: false })
    expect(await service.showBookmarks(state)).toBeFalse()

    plugin.showBookmarks.and.rejectWith(new Error("no chrome"))
    expect(await service.showBookmarks(state)).toBeFalse()
  })

  // Each push has the shell rebuild its bars and menu.
  it("sends the bars once while they stay the same", () => {
    const service = create("ios")
    service.show(READER)
    service.show({ ...READER })
    expect(plugin.setState).toHaveBeenCalledTimes(1)

    service.show({ ...READER, canGoNext: !READER.canGoNext })
    expect(plugin.setState).toHaveBeenCalledTimes(2)
  })

  it("sends them again after a push that failed", async () => {
    const service = create("ios")
    plugin.setState.and.rejectWith(new Error("not ready"))
    service.show(READER)
    await settle()

    plugin.setState.and.resolveTo({ top: 116, bottom: 82 })
    service.show(READER)
    expect(plugin.setState).toHaveBeenCalledTimes(2)
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

    // The shell keeps auto-scroll's controls in reach: above the toolbar,
    // and in its place while the bars are hidden.
    it("hides them while reading with auto-scroll's controls up", () => {
      const autoScroll = {
        playing: false,
        speedLabel: "1 ln/s",
        canSlower: true,
        canFaster: true,
      }
      service.trackScroll(scroller)
      service.setAutoScroll(autoScroll)
      expect(lastState()).toEqual(
        jasmine.objectContaining({ autoScroll, collapsed: false }),
      )

      scrollTo(200)
      expect(lastState()).toEqual(
        jasmine.objectContaining({ autoScroll, collapsed: true }),
      )

      // Closing auto-scroll brings the bars back.
      service.setAutoScroll(null)
      expect(lastState()).toEqual(
        jasmine.objectContaining({ autoScroll: null, collapsed: false }),
      )
    })

    // Before, auto-scroll's own scrolling left them up the whole time.
    it("hides them while auto-scroll plays, and brings them back on pause", () => {
      const autoScroll = {
        playing: false,
        speedLabel: "1 ln/s",
        canSlower: true,
        canFaster: true,
      }
      service.trackScroll(scroller)
      service.setAutoScroll(autoScroll)
      expect(collapsed()).toBeFalse()

      service.setAutoScroll({ ...autoScroll, playing: true })
      expect(collapsed()).toBeTrue()
      // A new speed while playing leaves them as they are.
      service.setAutoScroll({
        ...autoScroll,
        playing: true,
        speedLabel: "2 ln/s",
      })
      expect(collapsed()).toBeTrue()

      service.setAutoScroll({ ...autoScroll, playing: false })
      expect(collapsed()).toBeFalse()
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

    describe("a tap on the text", () => {
      let line: HTMLElement
      let link: HTMLAnchorElement
      let asterisk: HTMLElement
      let stop: () => void

      beforeEach(() => {
        const content = scroller.firstElementChild as HTMLElement
        content.innerHTML = `
          <p class="line">No princípio havia o Verbo</p>
          <a href="/jhn/1">Jo 1,1</a>
          <span role="button" class="footnoteIndicator">＊</span>`
        line = content.querySelector(".line") as HTMLElement
        link = content.querySelector("a") as HTMLAnchorElement
        link.addEventListener("click", (event) => event.preventDefault())
        asterisk = content.querySelector("[role=button]") as HTMLElement
        stop = service.trackScroll(scroller)
      })

      it("shows the hidden bars, and a second tap hides them", () => {
        scrollTo(200)
        expect(collapsed()).toBeTrue()

        line.click()
        expect(collapsed()).toBeFalse()
        line.click()
        expect(collapsed()).toBeTrue()
      })

      it("leaves taps on links and asterisks to them", () => {
        link.click()
        asterisk.click()
        expect(collapsed()).toBeFalse()
      })

      it("leaves a tap that only dismisses a selection", () => {
        doc["getSelection"] = () => ({ isCollapsed: false })
        line.dispatchEvent(new Event("pointerdown", { bubbles: true }))
        line.click()
        expect(collapsed()).toBeFalse()
      })

      it("stops once tracking stops", () => {
        stop()
        line.click()
        expect(collapsed()).toBeFalse()
      })
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
      document.body.classList.remove("native-chrome", "platform-ios")
    })

    it("are brown on the web", () => {
      expect(getComputedStyle(host).getPropertyValue("--cap-brown")).toMatch(
        BROWN,
      )
    })

    // The web bars of Android and phones keep the app's brand colours.
    it("stay brown with the web's bars", () => {
      document.body.classList.add("native-chrome")
      expect(getComputedStyle(host).getPropertyValue("--cap-brown")).toMatch(
        BROWN,
      )
    })

    it("are the text colour in the iOS app", () => {
      document.body.classList.add("native-chrome", "platform-ios")
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

describe("WEB_BARS", () => {
  /** A document whose window is phone-sized or not, or has no window. */
  function wanted(
    platform: "web" | "android",
    view: { phone: boolean } | null,
  ): boolean {
    spyOn(Capacitor, "getPlatform").and.returnValue(platform)
    const defaultView = view && {
      matchMedia: (query: string) => ({
        matches: query === WEB_BARS_QUERY && view.phone,
      }),
    }
    // The spec default (testing-defaults.spec.ts) would answer instead.
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView } }],
    })
    return TestBed.inject(WEB_BARS)
  }

  it("draws the bars in a phone's browser", () => {
    expect(wanted("web", { phone: true })).toBeTrue()
  })

  it("keeps the web header on wider screens", () => {
    expect(wanted("web", { phone: false })).toBeFalse()
  })

  it("draws the bars in the Android app at any width", () => {
    expect(wanted("android", { phone: false })).toBeTrue()
  })

  it("draws nothing while server-rendering", () => {
    expect(wanted("web", null)).toBeFalse()
  })
})
