import { CommonModule } from "@angular/common"
import { ChangeDetectorRef, PLATFORM_ID, SimpleChange } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { MatMenuTrigger } from "@angular/material/menu"
import { By } from "@angular/platform-browser"
import { ActivatedRoute, Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { BehaviorSubject, of, Subject } from "rxjs"
import type { Mock } from "vitest"
import { AnalyticsService } from "../../services/analytics.service"
import { BackButtonService } from "../../services/back-button.service"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import {
  BuildVersionService,
  type DisplayVersion,
} from "../../services/build-version.service"
import { NativeBookmarksService } from "../../services/native-bookmarks.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import type { NativeChromeAction } from "../../services/native-chrome.types"
import { NativeReportService } from "../../services/native-report.service"
import { NetworkService } from "../../services/network.service"
import { OnboardingService } from "../../services/onboarding.service"
import { ThemeService } from "../../services/theme.service"
import { createSpyObj, lastCall, type SpyObj } from "../../testing/spy-obj"
import { ReportProblemComponent } from "../report-problem/report-problem.component"
import { HeaderComponent } from "./header.component"

describe("HeaderComponent", () => {
  let component: HeaderComponent
  let fixture: ComponentFixture<HeaderComponent>
  let routerSpy: SpyObj<Router>
  let networkServiceSpy: SpyObj<NetworkService>
  let themeServiceSpy: SpyObj<ThemeService>
  let bookmarkServiceSpy: SpyObj<BookmarkService>
  let bottomSheetSpy: SpyObj<MatBottomSheet>
  let bookmarkSheetDismissed: Subject<void>
  let bookmarkSheetRef: {
    dismiss: Mock
    afterDismissed: () => unknown
  }
  let dialogSpy: SpyObj<MatDialog>
  let analyticsServiceSpy: SpyObj<AnalyticsService>
  let onboardingServiceSpy: SpyObj<OnboardingService>
  let buildVersionSpy: SpyObj<BuildVersionService>
  let isOfflineSubject: BehaviorSubject<boolean>
  let originalShare: typeof navigator.share

  beforeEach(async () => {
    routerSpy = createSpyObj("Router", ["navigate"])
    isOfflineSubject = new BehaviorSubject<boolean>(false)
    networkServiceSpy = createSpyObj<NetworkService>("NetworkService", [], {
      isOffline$: isOfflineSubject.asObservable(),
      isOffline: false,
    })
    themeServiceSpy = createSpyObj<ThemeService>(
      "ThemeService",
      ["toggleTheme", "setTheme"],
      { currentMode: "system" },
    )
    bookmarkServiceSpy = createSpyObj<BookmarkService>(
      "BookmarkService",
      ["getBookmark"],
      { bookmarks$: of([]) },
    )
    bottomSheetSpy = createSpyObj("MatBottomSheet", ["open"])
    bookmarkSheetDismissed = new Subject<void>()
    bookmarkSheetRef = {
      dismiss: vi.fn().mockName("dismiss"),
      afterDismissed: () => bookmarkSheetDismissed.asObservable(),
    }
    bottomSheetSpy.open.mockReturnValue(
      bookmarkSheetRef as unknown as ReturnType<MatBottomSheet["open"]>,
    )
    dialogSpy = createSpyObj("MatDialog", ["open"])
    analyticsServiceSpy = createSpyObj("AnalyticsService", [
      "track",
      "areAnalyticsAvailable",
    ])
    analyticsServiceSpy.track.mockResolvedValue(undefined)
    analyticsServiceSpy.areAnalyticsAvailable.mockReturnValue(true)
    onboardingServiceSpy = createSpyObj("OnboardingService", ["open"])
    buildVersionSpy = createSpyObj("BuildVersionService", ["getDisplayVersion"])
    buildVersionSpy.getDisplayVersion.mockResolvedValue({
      release: "1.2.3",
      build: "20261016-120000Z",
    })
    originalShare = navigator.share

    await TestBed.configureTestingModule({
      imports: [HeaderComponent, CommonModule],
      providers: [
        { provide: Router, useValue: routerSpy },
        // The search button's routerLink; it's always shown now, offline too.
        { provide: ActivatedRoute, useValue: {} },
        { provide: NetworkService, useValue: networkServiceSpy },
        { provide: ThemeService, useValue: themeServiceSpy },
        { provide: BookmarkService, useValue: bookmarkServiceSpy },
        { provide: MatBottomSheet, useValue: bottomSheetSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: OnboardingService, useValue: onboardingServiceSpy },
        { provide: BuildVersionService, useValue: buildVersionSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(HeaderComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput("book", {
      id: "gen",
      name: "Genesis",
      shortName: "",
      abrv: "",
      chapterCount: 50,
    })
    // Required inputs: the reader always binds both.
    fixture.componentRef.setInput("chapterNumber", 1)
    fixture.detectChanges()
  })

  afterEach(() => {
    if (originalShare === undefined) {
      // @ts-expect-error
      delete navigator.share
    } else {
      Object.defineProperty(navigator, "share", {
        value: originalShare,
        configurable: true,
        writable: true,
      })
    }
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should title the page with a single h1 naming the book and chapter", () => {
    fixture.componentRef.setInput("chapterNumber", 3)
    component.mobile = false
    fixture.changeDetectorRef.markForCheck()
    fixture.detectChanges()

    const headings = fixture.nativeElement.querySelectorAll("h1")
    expect(headings.length).toBe(1)
    expect(headings[0].textContent).toContain("Genesis")
    expect(headings[0].textContent).toContain("3")
  })

  const chipLabel = (): string =>
    fixture.nativeElement
      .querySelectorAll("mat-button-toggle")[1]
      .textContent.trim()

  const renderWithMobile = (mobile: boolean): void => {
    component.mobile = mobile
    ;(
      component as unknown as {
        cdr: ChangeDetectorRef
      }
    ).cdr.markForCheck()
    fixture.detectChanges()
  }

  it("should abbreviate the introduction chip on small screens", () => {
    fixture.componentRef.setInput("chapterNumber", 0)

    renderWithMobile(true)
    expect(chipLabel()).toBe("Intro")

    renderWithMobile(false)
    expect(chipLabel()).toBe("Introdução")
  })

  // The About page has no heading of its own, so the toolbar title is the only
  // one the home page has.
  it("should title the home page too", () => {
    // setInput rather than a plain assignment: it marks the OnPush view dirty
    // and runs ngOnChanges, which is what starts the label cycle.
    fixture.componentRef.setInput("book", {
      id: "about",
      name: "Sobre a Bíblia dos Capuchinhos",
      shortName: "Sobre a Bíblia",
      abrv: "Sobre",
      chapterCount: 1,
    })
    fixture.detectChanges()

    const headings = (fixture.nativeElement as HTMLElement).querySelectorAll(
      "h1",
    )
    expect(headings.length).toBe(1)
    expect(headings[0].textContent).toContain("Sobre a Bíblia dos Capuchinhos")
  })

  // Android's 3-button navigation bar sits at the side of a landscape screen;
  // the header ignored it, and Back and Recents covered menu and search.
  it("keeps the menu and search buttons clear of side system bars", () => {
    const host = fixture.nativeElement as HTMLElement
    const edges = (left: string, right: string) => {
      host.style.setProperty("--app-inset-left", left)
      host.style.setProperty("--app-inset-right", right)
      return {
        menu: (
          host.querySelector(".menuButton") as HTMLElement
        ).getBoundingClientRect().left,
        search: (
          host.querySelector(".searchButton") as HTMLElement
        ).getBoundingClientRect().right,
      }
    }

    const none = edges("0px", "0px")
    const inset = edges("48px", "40px")

    expect(inset.menu - none.menu).toBeCloseTo(48, 0)
    expect(none.search - inset.search).toBeCloseTo(40, 0)
  })

  // References open from the stored Bible offline, and words are searched in it.
  it("keeps the search button while offline", () => {
    isOfflineSubject.next(true)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector(".searchButton")).toBeTruthy()
  })

  it("should open the report problem dialog from the menu", () => {
    const trigger = createSpyObj<MatMenuTrigger>("MatMenuTrigger", [
      "closeMenu",
    ])
    fixture.componentRef.setInput("chapterNumber", 3)

    component.onReportProblem(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(dialogSpy.open).toHaveBeenCalledWith(ReportProblemComponent, {
      data: { book: component.book(), chapter: 3 },
      width: "90%",
      maxWidth: "500px",
    })
  })

  // Chapter 0 is the introduction; a falsy check used to swallow it.
  it("should open the report problem dialog for an introduction", () => {
    const trigger = createSpyObj<MatMenuTrigger>("MatMenuTrigger", [
      "closeMenu",
    ])
    fixture.componentRef.setInput("chapterNumber", 0)

    component.onReportProblem(trigger)

    expect(dialogSpy.open).toHaveBeenCalledWith(ReportProblemComponent, {
      data: { book: component.book(), chapter: 0 },
      width: "90%",
      maxWidth: "500px",
    })
  })

  it("should not open the report problem dialog when chapter context is missing", () => {
    const trigger = createSpyObj<MatMenuTrigger>("MatMenuTrigger", [
      "closeMenu",
    ])

    fixture.componentRef.setInput(
      "chapterNumber",
      undefined as unknown as number,
    )
    component.onReportProblem(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(dialogSpy.open).not.toHaveBeenCalled()
  })

  describe("Android back button", () => {
    const menuTrigger = () =>
      fixture.debugElement
        .query(By.directive(MatMenuTrigger))
        .injector.get(MatMenuTrigger)

    it("closes the open header menu", () => {
      const trigger = menuTrigger()
      trigger.openMenu()
      expect(trigger.menuOpen).toBe(true)

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBe(true)
      expect(trigger.menuOpen).toBe(false)
    })

    it("dismisses the bookmark sheet it opened", () => {
      fixture.componentRef.setInput("chapterNumber", 1)
      component.openBookmarkSelector()

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBe(true)
      expect(bookmarkSheetRef.dismiss).toHaveBeenCalled()

      bookmarkSheetDismissed.next()
      expect(TestBed.inject(BackButtonService).closeTopmost()).toBe(false)
    })

    it("leaves the back press alone when the menu is closed", () => {
      expect(menuTrigger().menuOpen).toBe(false)
      expect(TestBed.inject(BackButtonService).closeTopmost()).toBe(false)
    })

    it("stops handling the back press once destroyed", () => {
      menuTrigger().openMenu()
      fixture.destroy()

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBe(false)
    })
  })

  describe("the version in the menu", () => {
    const openMenu = async () => {
      await fixture.whenStable()
      fixture.debugElement
        .query(By.directive(MatMenuTrigger))
        .injector.get(MatMenuTrigger)
        .openMenu()
      fixture.detectChanges()
    }

    const text = () =>
      document
        .querySelector(".menu-version")
        ?.textContent?.replace(/\s+/g, " ")
        .trim()

    it("is small print right under the privacy policy: the release, then the bundle's id", async () => {
      await openMenu()

      const version = document.querySelector(".menu-version")
      expect(text()).toBe("1.2.3 · 20261016-120000Z")
      expect(version?.previousElementSibling?.getAttribute("href")).toBe(
        component.privacyPolicyUrl,
      )
      expect(version?.nextElementSibling).toBeNull()
    })

    it("follows the tutorial with About, the problem report and the privacy policy", async () => {
      await openMenu()

      const labels = Array.from(
        document.querySelectorAll(".mat-mdc-menu-panel .mat-mdc-menu-item"),
      )
        .map((item) => {
          // The labels alone, without the icons' ligature names.
          const label = item.cloneNode(true) as HTMLElement
          for (const icon of Array.from(label.querySelectorAll("mat-icon"))) {
            icon.remove()
          }
          return label.textContent?.replace(/\s+/g, " ").trim() ?? ""
        })
        .filter(Boolean)
      expect(labels.slice(-4)).toEqual([
        "Como usar a app",
        "Sobre a Bíblia",
        "Reportar erro",
        "Política de Privacidade",
      ])
    })

    it("stays on one line, as in the iOS menu", async () => {
      await openMenu()

      const version = document.querySelector(".menu-version") as HTMLElement
      expect(version.children.length).toBe(0)
      expect(getComputedStyle(version).whiteSpace).toBe("nowrap")
    })

    it("labels the bundle's id where there are no releases", async () => {
      buildVersionSpy.getDisplayVersion.mockResolvedValue({
        release: null,
        build: "20261016-120000Z",
      })
      fixture = TestBed.createComponent(HeaderComponent)
      fixture.componentRef.setInput("book", component.book())
      fixture.componentRef.setInput("chapterNumber", 1)
      fixture.detectChanges()
      await openMenu()

      expect(text()).toBe("Bundle 20261016-120000Z")
    })

    it("is left out until the version is known", async () => {
      buildVersionSpy.getDisplayVersion.mockReturnValue(new Promise(() => {}))
      fixture = TestBed.createComponent(HeaderComponent)
      fixture.componentRef.setInput("book", component.book())
      fixture.componentRef.setInput("chapterNumber", 1)
      fixture.detectChanges()
      fixture.debugElement
        .query(By.directive(MatMenuTrigger))
        .injector.get(MatMenuTrigger)
        .openMenu()
      fixture.detectChanges()

      expect(document.querySelector(".menu-version")).toBeNull()
    })
  })

  // One button in the menu's row of icons cycles through the three themes.
  describe("the theme in the menu", () => {
    const trigger = () =>
      fixture.debugElement
        .query(By.directive(MatMenuTrigger))
        .injector.get(MatMenuTrigger)
    const themeButton = () => {
      trigger().openMenu()
      fixture.detectChanges()
      return document.querySelector<HTMLButtonElement>(
        ".menu-controls .menu-control",
      ) as HTMLButtonElement
    }

    it("shows the current theme", () => {
      const button = themeButton()
      expect(button.querySelector("mat-icon")?.textContent?.trim()).toBe(
        "brightness_auto",
      )
      expect(button.getAttribute("aria-label")).toBe("Tema: Automático")
    })

    it("moves on to the next theme and keeps the menu open", () => {
      const button = themeButton()
      const currentMode = Object.getOwnPropertyDescriptor(
        themeServiceSpy,
        "currentMode",
      )?.get as Mock | undefined
      themeServiceSpy.toggleTheme.mockImplementation(() =>
        currentMode?.mockReturnValue("dark"),
      )
      button.click()

      expect(themeServiceSpy.toggleTheme).toHaveBeenCalledTimes(1)
      expect(trigger().menuOpen).toBe(true)
      expect(button.querySelector("mat-icon")?.textContent?.trim()).toBe(
        "dark_mode",
      )
      // It says which theme is on: the icon alone left people guessing.
      expect(button.getAttribute("aria-label")).toBe("Tema: Escuro")
    })

    it("names the reading modes in plain words", () => {
      themeButton()
      const viewMode = document.querySelectorAll<HTMLButtonElement>(
        ".menu-controls .menu-control",
      )[1]
      expect(viewMode.getAttribute("aria-label")).toBe(
        "Texto contínuo (clique para mudar para página a página)",
      )
    })

    // Plain buttons in a menu are skipped by its arrow keys.
    it("can be reached with the menu's arrow keys", () => {
      themeButton()
      trigger().menu?.focusFirstItem("keyboard")
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Tema: Automático",
      )
      const panel = document.querySelector(".mat-mdc-menu-panel") as HTMLElement
      const down = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      })
      Object.defineProperty(down, "keyCode", { get: () => 40 })
      panel.dispatchEvent(down)
      expect(document.activeElement).toBe(
        document.querySelectorAll(".menu-controls .menu-control")[1],
      )
    })
  })

  // As a ribbon hangs from the page of a printed Bible.
  it("shows the ribbon on the chapter being read", () => {
    bookmarkServiceSpy.getBookmark.mockReturnValue({
      bookId: "gen",
      chapter: 3,
      color: "red",
      timestamp: 1,
    })
    fixture.componentRef.setInput("chapterNumber", 3)
    fixture.detectChanges()

    const ribbon = fixture.nativeElement.querySelector(
      ".chapter-ribbon",
    ) as HTMLElement
    // The light surfaces' tone: the header's button is antique white in
    // both themes.
    expect(ribbon.style.color).toBe("var(--ribbon-light-red)")
    expect(ribbon.parentElement?.textContent).toContain(", marcador vermelho")
  })

  it("opens the About page from the menu", () => {
    const trigger = createSpyObj<MatMenuTrigger>("MatMenuTrigger", [
      "closeMenu",
    ])
    const selected: {
      bookId: string
      chapter?: number
    }[] = []
    component.selectPassage.subscribe((passage) => selected.push(passage))

    component.onOpenAbout(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(selected).toEqual([{ bookId: "about" }])
  })

  it("should open the onboarding wizard from the menu", () => {
    const trigger = createSpyObj<MatMenuTrigger>("MatMenuTrigger", [
      "closeMenu",
    ])

    component.onOpenHelp(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(onboardingServiceSpy.open).toHaveBeenCalledWith("menu")
  })

  it("should share the page URL as is on the web", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)
    if (!navigator.share) {
      Object.defineProperty(navigator, "share", {
        value: () => Promise.resolve(),
        configurable: true,
        writable: true,
      })
    }
    const shareSpy = vi.spyOn(navigator, "share").mockResolvedValue(undefined)

    fixture.componentRef.setInput("chapterNumber", 1)
    component.ngOnInit()
    await component.sharePassage()

    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: window.location.href }),
    )
  })

  it("should share using navigator.share on web platforms", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)

    const shareSpy = vi.fn().mockName("share").mockResolvedValue(undefined)

    if (!navigator.share) {
      Object.defineProperty(navigator, "share", {
        value: () => Promise.resolve(),
        configurable: true,
        writable: true,
      })
    }
    vi.spyOn(navigator, "share").mockImplementation(shareSpy)

    fixture.componentRef.setInput("chapterNumber", 1)
    component.ngOnInit() // Re-init to pickup the web platform
    expect(component.canShare).toBe(true)

    await component.sharePassage()

    expect(shareSpy).toHaveBeenCalled()
  })

  describe("in a native build without the NativeChrome plugin", () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
    })

    it("shares the public URL through navigator.share", async () => {
      const shareSpy = vi.fn().mockName("share").mockResolvedValue(undefined)
      Object.defineProperty(navigator, "share", {
        value: shareSpy,
        configurable: true,
        writable: true,
      })

      fixture.componentRef.setInput("chapterNumber", 1)
      component.ngOnInit()
      expect(component.canShare).toBe(true)

      await component.sharePassage()

      const { pathname, search, hash } = window.location
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `https://biblia.capuchinhos.org${pathname}${search}${hash}`,
        }),
      )
    })

    it("offers no share when navigator.share is missing too", () => {
      Object.defineProperty(navigator, "share", {
        value: undefined,
        configurable: true,
        writable: true,
      })

      component.ngOnInit()

      expect(component.canShare).toBe(false)
    })
  })

  describe("about label cycle", () => {
    const aboutBook: Book = {
      id: "about",
      name: "Sobre a Bíblia dos Capuchinhos",
      shortName: "Sobre a Bíblia",
      abrv: "Sobre",
      chapterCount: 1,
    }

    // The audit's complaint: with two stacked labels crossfading, both stayed
    // in the DOM, so the page h1 read "<title> Escolher Livro" — words no page
    // text repeats.
    it("keeps only the label on screen inside the heading", async () => {
      vi.useFakeTimers()
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      const heading = (fixture.nativeElement as HTMLElement).querySelector(
        "h1",
      ) as HTMLElement
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(".cycle-text")
          .length,
      ).toBe(1)
      expect(heading.textContent).toContain("Sobre a Bíblia dos Capuchinhos")
      expect(heading.textContent).not.toContain("Escolher Livro")

      // Halfway through a swap the old text is fading but still the only one.
      await vi.advanceTimersByTimeAsync(3500)
      fixture.detectChanges()
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(".cycle-text")
          .length,
      ).toBe(1)

      // Once swapped, the prompt has replaced the title rather than joined it.
      await vi.advanceTimersByTimeAsync(300)
      fixture.detectChanges()
      expect(heading.textContent).toContain("Escolher Livro")
      expect(heading.textContent).not.toContain(
        "Sobre a Bíblia dos Capuchinhos",
      )

      component.ngOnDestroy()
    })

    // The visible label alternates, so the heading's own text cannot be relied
    // on to name the page; the accessible name has to stay put or the only
    // heading on the page ends up announcing the picker instead.
    it("keeps the heading naming the page across a label swap", async () => {
      vi.useFakeTimers()
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      const heading = (fixture.nativeElement as HTMLElement).querySelector(
        "h1",
      ) as HTMLElement
      expect(heading.getAttribute("aria-label")).toBe(
        "Sobre a Bíblia dos Capuchinhos",
      )

      await vi.advanceTimersByTimeAsync(3500)
      await vi.advanceTimersByTimeAsync(300)
      fixture.detectChanges()

      expect(heading.textContent).toContain("Escolher Livro")
      expect(heading.getAttribute("aria-label")).toBe(
        "Sobre a Bíblia dos Capuchinhos",
      )

      component.ngOnDestroy()
    })

    // The label swap is decorative; announcing each one is noise.
    it("does not announce the label swap", () => {
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      const element = fixture.nativeElement as HTMLElement
      expect(element.querySelector("[aria-live]")).toBeNull()
    })

    // WCAG 2.5.3: naming the button after the action would drop the book name
    // — the visible label — out of the accessible name entirely.
    it("names the book picker after its visible label", () => {
      component.mobile = false
      fixture.changeDetectorRef.markForCheck()
      fixture.detectChanges()

      const element = fixture.nativeElement as HTMLElement
      // MatButtonToggle forwards aria-label onto its internal button.
      expect(
        element.querySelector("mat-button-toggle button[aria-label]"),
      ).toBeNull()
      expect(element.querySelector("mat-button-toggle")?.textContent).toContain(
        "Genesis",
      )
    })

    it("fades the label out before swapping its text", async () => {
      vi.useFakeTimers()
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      const label = () =>
        (fixture.nativeElement as HTMLElement).querySelector(
          ".cycle-text",
        ) as HTMLElement

      expect(label().classList.contains("faded")).toBe(false)

      await vi.advanceTimersByTimeAsync(3500)
      fixture.detectChanges()
      // Fading out, text not yet changed.
      expect(label().classList.contains("faded")).toBe(true)
      expect(label().textContent).toContain("Sobre a Bíblia dos Capuchinhos")

      await vi.advanceTimersByTimeAsync(300)
      fixture.detectChanges()
      expect(label().classList.contains("faded")).toBe(false)

      component.ngOnDestroy()
    })

    it("drops a half-finished swap when the cycle stops", async () => {
      vi.useFakeTimers()
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      await vi.advanceTimersByTimeAsync(3500) // mid-swap: faded out, waiting to change text
      component.ngOnDestroy()

      // The pending swap must not fire against a torn-down component.
      await vi.advanceTimersByTimeAsync(300)
      expect(component.labelFading).toBe(false)
      expect(component.bookLabelMode).toBe("title")
    })

    it("cycles the about label in the browser", () => {
      const setIntervalSpy = vi.spyOn(window, "setInterval")

      fixture.componentRef.setInput("book", aboutBook)
      component.ngOnChanges({
        book: new SimpleChange(undefined, aboutBook, false),
      })

      expect(setIntervalSpy).toHaveBeenCalled()
      component.ngOnDestroy()
    })

    // window does not exist during prerendering; scheduling the cycle there
    // crashed every server render of "/" (the about/home page).
    it("does not schedule the label cycle while server-rendering", async () => {
      TestBed.resetTestingModule()
      await TestBed.configureTestingModule({
        imports: [HeaderComponent, CommonModule],
        providers: [
          { provide: Router, useValue: routerSpy },
          { provide: NetworkService, useValue: networkServiceSpy },
          { provide: ThemeService, useValue: themeServiceSpy },
          { provide: BookmarkService, useValue: bookmarkServiceSpy },
          { provide: MatBottomSheet, useValue: bottomSheetSpy },
          { provide: MatDialog, useValue: dialogSpy },
          { provide: AnalyticsService, useValue: analyticsServiceSpy },
          { provide: PLATFORM_ID, useValue: "server" },
        ],
      }).compileComponents()
      const serverFixture = TestBed.createComponent(HeaderComponent)
      const serverComponent = serverFixture.componentInstance

      const setIntervalSpy = vi.spyOn(window, "setInterval")

      serverFixture.componentRef.setInput("book", aboutBook)
      serverFixture.componentRef.setInput("chapterNumber", 1)
      serverComponent.ngOnChanges({
        book: new SimpleChange(undefined, aboutBook, true),
      })

      expect(setIntervalSpy).not.toHaveBeenCalled()
    })
  })

  describe("headingLabel", () => {
    it("names an introduction instead of announcing chapter 0", () => {
      // The visible label reads "Introdução"; the h1's accessible name must
      // not read "0" to screen-reader and voice-control users.
      fixture.componentRef.setInput("book", {
        id: "gen",
        name: "Livro do Génesis",
        shortName: "Génesis",
      } as Book)
      fixture.componentRef.setInput("chapterNumber", 0)

      expect(component.headingLabel).toBe("Livro do Génesis Introdução")

      fixture.componentRef.setInput("chapterNumber", 3)
      expect(component.headingLabel).toBe("Livro do Génesis 3")
    })

    it("lets a standalone introduction name itself", () => {
      fixture.componentRef.setInput("book", {
        id: "pentateuco",
        name: "Introdução ao Pentateuco",
        shortName: "Introdução ao Pentateuco",
        introSlug: "pentateuco",
      } as Book)
      fixture.componentRef.setInput("chapterNumber", 0)

      expect(component.headingLabel).toBe("Introdução ao Pentateuco")
    })
  })
})

describe("HeaderComponent with the iOS native bars", () => {
  let fixture: ComponentFixture<HeaderComponent>
  let component: HeaderComponent
  let actions: Subject<NativeChromeAction>
  let nativeChrome: {
    enabled: boolean
    actions$: Subject<NativeChromeAction>
    show: Mock
    hide: Mock
    showPicker: Mock
    share: Mock
  }
  let router: SpyObj<Router>
  let theme: SpyObj<ThemeService>
  let bottomSheet: SpyObj<MatBottomSheet>
  let dialog: SpyObj<MatDialog>
  let onboarding: SpyObj<OnboardingService>
  let analytics: SpyObj<AnalyticsService>
  let isOffline: BehaviorSubject<boolean>
  let nativeBookmarks: SpyObj<NativeBookmarksService>
  let nativeReport: SpyObj<NativeReportService>
  let buildVersion: SpyObj<BuildVersionService>

  const genesis: Book = {
    id: "gen",
    name: "Livro do Génesis",
    shortName: "Génesis",
    abrv: "Gn",
    chapterCount: 50,
  }

  beforeEach(async () => {
    actions = new Subject()
    nativeChrome = {
      enabled: true,
      actions$: actions,
      show: vi.fn().mockName("show"),
      hide: vi.fn().mockName("hide"),
      showPicker: vi.fn().mockName("showPicker"),
      share: vi.fn().mockName("share").mockResolvedValue(true),
    }
    router = createSpyObj("Router", ["navigate"])
    router.navigate.mockResolvedValue(true)
    theme = createSpyObj<ThemeService>(
      "ThemeService",
      ["toggleTheme", "setTheme"],
      { currentMode: "system" },
    )
    const bookmarks = createSpyObj<BookmarkService>(
      "BookmarkService",
      ["getBookmark"],
      {
        bookmarks$: of([
          { bookId: "gen", chapter: 2, color: "red", timestamp: 1 },
        ]),
      },
    )
    bottomSheet = createSpyObj("MatBottomSheet", ["open"])
    bottomSheet.open.mockReturnValue({
      dismiss: () => {},
      afterDismissed: () => new Subject<void>(),
    } as unknown as ReturnType<MatBottomSheet["open"]>)
    dialog = createSpyObj("MatDialog", ["open"])
    onboarding = createSpyObj("OnboardingService", ["open"])
    analytics = createSpyObj("AnalyticsService", [
      "track",
      "areAnalyticsAvailable",
    ])
    analytics.track.mockResolvedValue(undefined)
    analytics.areAnalyticsAvailable.mockReturnValue(true)
    isOffline = new BehaviorSubject(false)
    nativeBookmarks = createSpyObj("NativeBookmarksService", ["open"])
    nativeReport = createSpyObj("NativeReportService", ["open"])
    buildVersion = createSpyObj("BuildVersionService", ["getDisplayVersion"])
    buildVersion.getDisplayVersion.mockResolvedValue({
      release: "1.2.3",
      build: "20261016-120000Z",
    })
    // In the app, shared links point at the public site.
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        { provide: NativeChromeService, useValue: nativeChrome },
        { provide: NativeBookmarksService, useValue: nativeBookmarks },
        { provide: NativeReportService, useValue: nativeReport },
        { provide: BookService, useValue: { getBooks: () => [genesis] } },
        { provide: Router, useValue: router },
        { provide: ThemeService, useValue: theme },
        { provide: BookmarkService, useValue: bookmarks },
        { provide: MatBottomSheet, useValue: bottomSheet },
        { provide: MatDialog, useValue: dialog },
        { provide: OnboardingService, useValue: onboarding },
        { provide: AnalyticsService, useValue: analytics },
        { provide: BuildVersionService, useValue: buildVersion },
        {
          provide: NetworkService,
          useValue: { isOffline$: isOffline.asObservable(), isOffline: false },
        },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(HeaderComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput("book", genesis)
    fixture.componentRef.setInput("chapterNumber", 3)
    fixture.componentRef.setInput("canGoPrevious", true)
    fixture.componentRef.setInput("canGoNext", true)
    fixture.detectChanges()
  })

  const lastState = () => lastCall(vi.mocked(nativeChrome.show))[0]
  const bookLabel = () => (component.mobile ? "Génesis" : "Livro do Génesis")

  it("renders no web toolbar", () => {
    expect(fixture.nativeElement.querySelector("mat-toolbar")).toBeNull()
  })

  it("hands the native menu the compile timestamp, which it shows with its release", () => {
    expect(lastState().buildVersion).toBe("20261016-120000Z")
  })

  it("does not bring the bars back if the reader is gone before the version arrives", async () => {
    let arrive!: (version: DisplayVersion) => void
    buildVersion.getDisplayVersion.mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve
      }),
    )
    const late = TestBed.createComponent(HeaderComponent)
    late.componentRef.setInput("book", genesis)
    late.componentRef.setInput("chapterNumber", 3)
    late.detectChanges()
    late.destroy()
    nativeChrome.show.mockClear()

    arrive({ release: null, build: "20261016-120000Z" })
    await new Promise((resolve) => setTimeout(resolve))

    expect(nativeChrome.show).not.toHaveBeenCalled()
  })

  it("sends the bars what the web header would show", () => {
    expect(lastState()).toEqual({
      mode: "reader",
      passageLabel: `${bookLabel()} 3`,
      passageShortLabels: ["Gn 3"],
      passageAccessibilityLabel: "Livro do Génesis 3",
      chapterNavigation: true,
      canGoPrevious: true,
      canGoNext: true,
      search: true,
      themeMode: "system",
      viewMode: "scrolling",
      autoScrollVisible: false,
      autoScrollAvailable: true,
      canShare: true,
      canReport: true,
      bookmarkColor: null,
      bookmarkName: null,
      buildVersion: "20261016-120000Z",
      textSize: null,
    })
  })

  it("shows the chapter's ribbon, by colour and by name, on the bookmark button", () => {
    const bookmarks = TestBed.inject(BookmarkService) as SpyObj<BookmarkService>
    bookmarks.getBookmark.mockReturnValue({
      bookId: "gen",
      chapter: 4,
      color: "red",
      timestamp: 1,
    })
    fixture.componentRef.setInput("chapterNumber", 4)
    fixture.detectChanges()

    expect(lastState()).toEqual(
      expect.objectContaining({
        bookmarkColor: "red",
        bookmarkName: "vermelho",
        passageAccessibilityLabel: "Livro do Génesis 4, marcador vermelho",
      }),
    )
  })

  it("has no arrows, chapter or view toggle on the home page", () => {
    fixture.componentRef.setInput("book", {
      ...genesis,
      id: "about",
      name: "Sobre a Bíblia",
      shortName: "Sobre a Bíblia",
    })
    fixture.detectChanges()

    expect(lastState()).toEqual(
      expect.objectContaining({
        passageLabel: "Sobre a Bíblia",
        passageShortLabels: [],
        chapterNavigation: false,
        viewMode: null,
      }),
    )
    // The web header's prompt swap has no place on a native button.
    expect(component.bookLabelMode).toBe("title")
  })

  it("names the introduction as the chapter", () => {
    fixture.componentRef.setInput("chapterNumber", 0)
    fixture.detectChanges()

    expect(lastState()).toEqual(
      expect.objectContaining({
        passageLabel: `${bookLabel()} ${
          component.mobile ? "Intro" : "Introdução"
        }`,
        passageShortLabels: ["Gn Intro"],
        passageAccessibilityLabel: "Livro do Génesis Introdução",
      }),
    )
  })

  // Leaflets at Mass number most psalms one lower; the edition prints both.
  it("names a psalm with its liturgical number", () => {
    fixture.componentRef.setInput("book", {
      ...genesis,
      id: "psa",
      name: "Livro dos Salmos",
      shortName: "Salmos",
      abrv: "Sl",
      chapterCount: 150,
    })
    fixture.componentRef.setInput("chapterNumber", 23)
    fixture.detectChanges()

    expect(lastState()).toEqual(
      expect.objectContaining({
        passageLabel: "Salmo 23 (22)",
        passageShortLabels: ["Sl 23 (22)", "Sl 23"],
        passageAccessibilityLabel: "Salmo 23, na liturgia 22",
      }),
    )
  })

  it("keeps search while offline", () => {
    isOffline.next(true)
    fixture.detectChanges()
    expect(lastState()).toEqual(expect.objectContaining({ search: true }))
  })

  it("follows the reader's view mode, auto-scroll and arrows", () => {
    fixture.componentRef.setInput("viewMode", "paged")
    fixture.componentRef.setInput("autoScrollControlsVisible", true)
    fixture.componentRef.setInput("canGoNext", false)
    fixture.detectChanges()

    expect(lastState()).toEqual(
      expect.objectContaining({
        viewMode: "paged",
        autoScrollVisible: true,
        autoScrollAvailable: false,
        canGoNext: false,
      }),
    )
  })

  it("opens the passage picker on the current chapter, with bookmarks", () => {
    actions.next({ id: "passage" })

    const data = lastCall(vi.mocked(nativeChrome.showPicker))[0]
    expect(data.currentBookId).toBe("gen")
    expect(data.currentChapter).toBe(3)
    const book = data.sections[0].groups[0].books[0]
    expect(book.id).toBe("gen")
    expect(book.chapters[1]).toEqual({
      number: 2,
      label: "2",
      bookmark: "red",
    })
  })

  it("passes on the passage picked", () => {
    const picked: unknown[] = []
    component.selectPassage.subscribe((passage) => picked.push(passage))

    actions.next({ id: "goto", bookId: "exo", chapter: 2 })
    actions.next({ id: "goto", bookId: "geral" })

    expect(picked).toEqual([
      { bookId: "exo", chapter: 2 },
      { bookId: "geral", chapter: undefined },
    ])
  })

  it("steps with the toolbar arrows", () => {
    const steps: string[] = []
    component.previous.subscribe(() => steps.push("previous"))
    component.next.subscribe(() => steps.push("next"))

    actions.next({ id: "previous" })
    actions.next({ id: "next" })

    expect(steps).toEqual(["previous", "next"])
  })

  it("navigates to search", () => {
    actions.next({ id: "search" })
    expect(router.navigate).toHaveBeenCalledWith(["/search"])
  })

  it("sets the chosen theme and shows it as chosen", () => {
    nativeChrome.show.mockClear()
    actions.next({ id: "theme-dark" })

    expect(theme.setTheme).toHaveBeenCalledWith("dark")
    expect(nativeChrome.show).toHaveBeenCalled()
  })

  it("forwards view mode, text size and auto-scroll to the reader", () => {
    const emitted: string[] = []
    component.toggleViewMode.subscribe(() => emitted.push("view"))
    component.decreaseFontSizeEvent.subscribe(() => emitted.push("smaller"))
    component.increaseFontSizeEvent.subscribe(() => emitted.push("larger"))
    component.toggleAutoScrollControls.subscribe(() => emitted.push("scroll"))

    actions.next({ id: "view-mode" })
    actions.next({ id: "font-decrease" })
    actions.next({ id: "font-increase" })
    actions.next({ id: "auto-scroll" })

    expect(emitted).toEqual(["view", "smaller", "larger", "scroll"])
  })

  // The Android sheet steps by 10, and resets to the size the text opens at.
  it("passes the native sheet's step, and its reset, to the reader", () => {
    const steps: (number | undefined)[] = []
    let resets = 0
    component.increaseFontSizeEvent.subscribe((step) => steps.push(step))
    component.decreaseFontSizeEvent.subscribe((step) => steps.push(step))
    component.resetFontSizeEvent.subscribe(() => resets++)

    actions.next({ id: "font-increase", step: 10 })
    actions.next({ id: "font-decrease", step: 10 })
    actions.next({ id: "font-reset" })

    expect(steps).toEqual([10, 10])
    expect(resets).toBe(1)
  })

  it("sends the text size to the bars, but none for the About page", () => {
    const size = { percent: 120, min: 70, max: 235, canReset: true }
    fixture.componentRef.setInput("textSize", size)
    fixture.detectChanges()
    expect(lastState().textSize).toEqual(size)

    fixture.componentRef.setInput("book", { ...component.book(), id: "about" })
    fixture.componentRef.setInput("chapterNumber", 1)
    fixture.detectChanges()
    expect(lastState().textSize).toBeNull()
  })

  it("opens the About page from the native menu", () => {
    const selected: {
      bookId: string
      chapter?: number
    }[] = []
    component.selectPassage.subscribe((passage) => selected.push(passage))

    actions.next({ id: "about" })

    expect(selected).toEqual([{ bookId: "about" }])
  })

  it("opens the native bookmarks sheet, the native problem report and help", () => {
    actions.next({ id: "bookmarks" })
    actions.next({ id: "report" })
    actions.next({ id: "help" })

    expect(nativeBookmarks.open).toHaveBeenCalledWith("gen", 3)
    expect(bottomSheet.open).not.toHaveBeenCalled()
    expect(nativeReport.open).toHaveBeenCalledWith(genesis, 3)
    expect(dialog.open).not.toHaveBeenCalled()
    expect(onboarding.open).toHaveBeenCalledWith("menu")
  })

  // Left to itself, iOS fetched the link's preview from the website,
  // whose icon has the WEB sash; the shell previews it with the app's.
  it("shares the passage through the shell, headed by the page's title", async () => {
    const title = document.title
    document.title = "Livro do Génesis 3 | Bíblia Sagrada"
    actions.next({ id: "share" })
    await fixture.whenStable()
    document.title = title

    const { pathname, search, hash } = window.location
    expect(nativeChrome.share).toHaveBeenCalledWith({
      title: "Bíblia Sagrada",
      text: "Ler Livro do Génesis 3.",
      url: `https://biblia.capuchinhos.org${pathname}${search}${hash}`,
      linkTitle: "Livro do Génesis 3 | Bíblia Sagrada",
    })
    expect(analytics.track).toHaveBeenCalledWith("share", {
      book: "gen",
      chapter: 3,
    })
  })

  it("counts no share when the sheet is closed without one", async () => {
    nativeChrome.share.mockResolvedValue(false)
    actions.next({ id: "share" })
    await fixture.whenStable()

    expect(nativeChrome.share).toHaveBeenCalled()
    expect(analytics.track).not.toHaveBeenCalledWith("share", expect.anything())
  })

  it("opens the privacy policy outside the app", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(undefined as never)
    actions.next({ id: "privacy" })

    expect(open).toHaveBeenCalledWith(
      "https://www.capuchinhos.org/politica-de-privacidade",
      "_blank",
      "noopener",
    )
  })

  it("removes the bars when the reader goes away", () => {
    fixture.destroy()
    expect(nativeChrome.hide).toHaveBeenCalled()
  })
})
