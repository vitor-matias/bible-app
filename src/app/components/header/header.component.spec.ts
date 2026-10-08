import { CommonModule } from "@angular/common"
import { ChangeDetectorRef, PLATFORM_ID, SimpleChange } from "@angular/core"
import {
  type ComponentFixture,
  discardPeriodicTasks,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { MatMenuTrigger } from "@angular/material/menu"
import { By } from "@angular/platform-browser"
import { Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
import { BehaviorSubject, of, Subject } from "rxjs"
import { AnalyticsService } from "../../services/analytics.service"
import { BackButtonService } from "../../services/back-button.service"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import { NativeBookmarksService } from "../../services/native-bookmarks.service"
import {
  type NativeChromeAction,
  NativeChromeService,
} from "../../services/native-chrome.service"
import { NativeReportService } from "../../services/native-report.service"
import { NetworkService } from "../../services/network.service"
import { OnboardingService } from "../../services/onboarding.service"
import { ThemeService } from "../../services/theme.service"
import { SHARE_PLUGIN } from "../../tokens"
import { ReportProblemComponent } from "../report-problem/report-problem.component"
import { HeaderComponent } from "./header.component"

describe("HeaderComponent", () => {
  let component: HeaderComponent
  let fixture: ComponentFixture<HeaderComponent>
  let routerSpy: jasmine.SpyObj<Router>
  let networkServiceSpy: jasmine.SpyObj<NetworkService>
  let themeServiceSpy: jasmine.SpyObj<ThemeService>
  let bookmarkServiceSpy: jasmine.SpyObj<BookmarkService>
  let bottomSheetSpy: jasmine.SpyObj<MatBottomSheet>
  let bookmarkSheetDismissed: Subject<void>
  let bookmarkSheetRef: { dismiss: jasmine.Spy; afterDismissed: () => unknown }
  let dialogSpy: jasmine.SpyObj<MatDialog>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>
  let onboardingServiceSpy: jasmine.SpyObj<OnboardingService>
  let isOfflineSubject: BehaviorSubject<boolean>
  let mockSharePlugin: jasmine.SpyObj<typeof Share>
  let originalShare: typeof navigator.share

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj("Router", ["navigate"])
    isOfflineSubject = new BehaviorSubject<boolean>(false)
    networkServiceSpy = jasmine.createSpyObj("NetworkService", [], {
      isOffline$: isOfflineSubject.asObservable(),
      isOffline: false,
    })
    themeServiceSpy = jasmine.createSpyObj("ThemeService", ["toggleTheme"], {
      currentMode: "system",
    })
    bookmarkServiceSpy = jasmine.createSpyObj("BookmarkService", [
      "getBookmark",
    ])
    bookmarkServiceSpy.bookmarks$ = of([])
    bottomSheetSpy = jasmine.createSpyObj("MatBottomSheet", ["open"])
    bookmarkSheetDismissed = new Subject<void>()
    bookmarkSheetRef = {
      dismiss: jasmine.createSpy("dismiss"),
      afterDismissed: () => bookmarkSheetDismissed.asObservable(),
    }
    bottomSheetSpy.open.and.returnValue(
      bookmarkSheetRef as unknown as ReturnType<MatBottomSheet["open"]>,
    )
    dialogSpy = jasmine.createSpyObj("MatDialog", ["open"])
    mockSharePlugin = jasmine.createSpyObj("Share", ["share"])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", [
      "track",
      "areAnalyticsAvailable",
    ])
    analyticsServiceSpy.track.and.returnValue(Promise.resolve())
    analyticsServiceSpy.areAnalyticsAvailable.and.returnValue(true)
    onboardingServiceSpy = jasmine.createSpyObj("OnboardingService", ["open"])
    originalShare = navigator.share

    await TestBed.configureTestingModule({
      imports: [HeaderComponent, CommonModule],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: NetworkService, useValue: networkServiceSpy },
        { provide: ThemeService, useValue: themeServiceSpy },
        { provide: BookmarkService, useValue: bookmarkServiceSpy },
        { provide: MatBottomSheet, useValue: bottomSheetSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: SHARE_PLUGIN, useValue: mockSharePlugin },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: OnboardingService, useValue: onboardingServiceSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(HeaderComponent)
    component = fixture.componentInstance
    component.book = {
      id: "gen",
      name: "Genesis",
      shortName: "",
      abrv: "",
      chapterCount: 50,
    }
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
    // The component is OnPush, so a plain property change needs its own
    // change detector marked, not the fixture host's.
    ;(component as unknown as { cdr: ChangeDetectorRef }).cdr.markForCheck()
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

  it("should reflect offline status from NetworkService", () => {
    isOfflineSubject.next(true)
    fixture.detectChanges()

    expect(component.isOffline).toBeTrue()
  })

  it("should open the report problem dialog from the menu", () => {
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])
    component.chapterNumber = 3

    component.onReportProblem(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(dialogSpy.open).toHaveBeenCalledWith(ReportProblemComponent, {
      data: { book: component.book, chapter: 3 },
      width: "90%",
      maxWidth: "500px",
    })
  })

  // Chapter 0 is the introduction; a falsy check used to swallow it.
  it("should open the report problem dialog for an introduction", () => {
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])
    component.chapterNumber = 0

    component.onReportProblem(trigger)

    expect(dialogSpy.open).toHaveBeenCalledWith(ReportProblemComponent, {
      data: { book: component.book, chapter: 0 },
      width: "90%",
      maxWidth: "500px",
    })
  })

  it("should not open the report problem dialog when chapter context is missing", () => {
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])

    component.chapterNumber = undefined as unknown as number
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
      expect(trigger.menuOpen).toBeTrue()

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBeTrue()
      expect(trigger.menuOpen).toBeFalse()
    })

    it("dismisses the bookmark sheet it opened", () => {
      component.chapterNumber = 1
      component.openBookmarkSelector()

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBeTrue()
      expect(bookmarkSheetRef.dismiss).toHaveBeenCalled()

      bookmarkSheetDismissed.next()
      expect(TestBed.inject(BackButtonService).closeTopmost()).toBeFalse()
    })

    it("leaves the back press alone when the menu is closed", () => {
      expect(menuTrigger().menuOpen).toBeFalse()
      expect(TestBed.inject(BackButtonService).closeTopmost()).toBeFalse()
    })

    it("stops handling the back press once destroyed", () => {
      menuTrigger().openMenu()
      fixture.destroy()

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBeFalse()
    })
  })

  it("should open the onboarding wizard from the menu", () => {
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])

    component.onOpenHelp(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(onboardingServiceSpy.open).toHaveBeenCalledWith("menu")
  })

  it("should share using Capacitor Share on native platforms", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    mockSharePlugin.share.and.resolveTo()

    if (!navigator.share) {
      Object.defineProperty(navigator, "share", {
        value: () => Promise.resolve(),
        configurable: true,
        writable: true,
      })
    }
    spyOn(navigator, "share").and.resolveTo()

    component.chapterNumber = 1
    component.ngOnInit() // Re-init to pickup the new native platform check

    expect(component.canShare).toBeTrue()

    await component.sharePassage()

    expect(mockSharePlugin.share).toHaveBeenCalledWith({
      title: "Biblia Sagrada",
      text: jasmine.any(String),
      url: jasmine.any(String),
      dialogTitle: "Partilhar passagem",
    })
  })

  it("should share the public site URL, not the native localhost origin", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    mockSharePlugin.share.and.resolveTo()

    component.chapterNumber = 1
    component.ngOnInit()
    await component.sharePassage()

    const { pathname, search, hash } = window.location
    expect(mockSharePlugin.share).toHaveBeenCalledWith(
      jasmine.objectContaining({
        url: `https://biblia.capuchinhos.org${pathname}${search}${hash}`,
      }),
    )
  })

  it("should share the page URL as is on the web", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(false)
    if (!navigator.share) {
      Object.defineProperty(navigator, "share", {
        value: () => Promise.resolve(),
        configurable: true,
        writable: true,
      })
    }
    const shareSpy = spyOn(navigator, "share").and.resolveTo()

    component.chapterNumber = 1
    component.ngOnInit()
    await component.sharePassage()

    expect(shareSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ url: window.location.href }),
    )
  })

  it("should share using navigator.share on web platforms", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(false)

    const shareSpy = jasmine.createSpy("share").and.resolveTo()

    if (!navigator.share) {
      Object.defineProperty(navigator, "share", {
        value: () => Promise.resolve(),
        configurable: true,
        writable: true,
      })
    }
    spyOn(navigator, "share").and.callFake(shareSpy)

    mockSharePlugin.share.and.resolveTo() // Should not be called

    component.chapterNumber = 1
    component.ngOnInit() // Re-init to pickup the web platform
    expect(component.canShare).toBeTrue()

    await component.sharePassage()

    expect(shareSpy).toHaveBeenCalled()
    expect(mockSharePlugin.share).not.toHaveBeenCalled()
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
    it("keeps only the label on screen inside the heading", fakeAsync(() => {
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
      tick(3500)
      fixture.detectChanges()
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(".cycle-text")
          .length,
      ).toBe(1)

      // Once swapped, the prompt has replaced the title rather than joined it.
      tick(300)
      fixture.detectChanges()
      expect(heading.textContent).toContain("Escolher Livro")
      expect(heading.textContent).not.toContain(
        "Sobre a Bíblia dos Capuchinhos",
      )

      component.ngOnDestroy()
      discardPeriodicTasks()
    }))

    // The visible label alternates, so the heading's own text cannot be relied
    // on to name the page; the accessible name has to stay put or the only
    // heading on the page ends up announcing the picker instead.
    it("keeps the heading naming the page across a label swap", fakeAsync(() => {
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      const heading = (fixture.nativeElement as HTMLElement).querySelector(
        "h1",
      ) as HTMLElement
      expect(heading.getAttribute("aria-label")).toBe(
        "Sobre a Bíblia dos Capuchinhos",
      )

      tick(3500)
      tick(300)
      fixture.detectChanges()

      expect(heading.textContent).toContain("Escolher Livro")
      expect(heading.getAttribute("aria-label")).toBe(
        "Sobre a Bíblia dos Capuchinhos",
      )

      component.ngOnDestroy()
      discardPeriodicTasks()
    }))

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

    it("fades the label out before swapping its text", fakeAsync(() => {
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      const label = () =>
        (fixture.nativeElement as HTMLElement).querySelector(
          ".cycle-text",
        ) as HTMLElement

      expect(label().classList.contains("faded")).toBeFalse()

      tick(3500)
      fixture.detectChanges()
      // Fading out, text not yet changed.
      expect(label().classList.contains("faded")).toBeTrue()
      expect(label().textContent).toContain("Sobre a Bíblia dos Capuchinhos")

      tick(300)
      fixture.detectChanges()
      expect(label().classList.contains("faded")).toBeFalse()

      component.ngOnDestroy()
      discardPeriodicTasks()
    }))

    it("drops a half-finished swap when the cycle stops", fakeAsync(() => {
      fixture.componentRef.setInput("book", aboutBook)
      fixture.detectChanges()

      tick(3500) // mid-swap: faded out, waiting to change text
      component.ngOnDestroy()

      // The pending swap must not fire against a torn-down component.
      tick(300)
      expect(component.labelFading).toBeFalse()
      expect(component.bookLabelMode).toBe("title")

      discardPeriodicTasks()
    }))

    it("cycles the about label in the browser", () => {
      const setIntervalSpy = spyOn(window, "setInterval").and.callThrough()

      component.book = aboutBook
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
          { provide: SHARE_PLUGIN, useValue: mockSharePlugin },
          { provide: AnalyticsService, useValue: analyticsServiceSpy },
          { provide: PLATFORM_ID, useValue: "server" },
        ],
      }).compileComponents()
      const serverComponent = TestBed.createComponent(HeaderComponent)
        .componentInstance as HeaderComponent

      const setIntervalSpy = spyOn(window, "setInterval").and.callThrough()

      serverComponent.book = aboutBook
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
      component.book = {
        id: "gen",
        name: "Livro do Génesis",
        shortName: "Génesis",
      } as Book
      component.chapterNumber = 0

      expect(component.headingLabel).toBe("Livro do Génesis Introdução")

      component.chapterNumber = 3
      expect(component.headingLabel).toBe("Livro do Génesis 3")
    })

    it("lets a standalone introduction name itself", () => {
      component.book = {
        id: "pentateuco",
        name: "Introdução ao Pentateuco",
        shortName: "Introdução ao Pentateuco",
        introSlug: "pentateuco",
      } as Book
      component.chapterNumber = 0

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
    show: jasmine.Spy
    hide: jasmine.Spy
    showPicker: jasmine.Spy
  }
  let router: jasmine.SpyObj<Router>
  let theme: jasmine.SpyObj<ThemeService>
  let bottomSheet: jasmine.SpyObj<MatBottomSheet>
  let dialog: jasmine.SpyObj<MatDialog>
  let onboarding: jasmine.SpyObj<OnboardingService>
  let share: jasmine.SpyObj<typeof Share>
  let isOffline: BehaviorSubject<boolean>
  let nativeBookmarks: jasmine.SpyObj<NativeBookmarksService>
  let nativeReport: jasmine.SpyObj<NativeReportService>

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
      show: jasmine.createSpy("show"),
      hide: jasmine.createSpy("hide"),
      showPicker: jasmine.createSpy("showPicker"),
    }
    router = jasmine.createSpyObj("Router", ["navigate"])
    router.navigate.and.resolveTo(true)
    theme = jasmine.createSpyObj("ThemeService", ["toggleTheme", "setTheme"], {
      currentMode: "system",
    })
    const bookmarks = jasmine.createSpyObj("BookmarkService", ["getBookmark"])
    bookmarks.bookmarks$ = of([
      { bookId: "gen", chapter: 2, color: "red", timestamp: 1 },
    ])
    bottomSheet = jasmine.createSpyObj("MatBottomSheet", ["open"])
    bottomSheet.open.and.returnValue({
      dismiss: () => {},
      afterDismissed: () => new Subject<void>(),
    } as unknown as ReturnType<MatBottomSheet["open"]>)
    dialog = jasmine.createSpyObj("MatDialog", ["open"])
    onboarding = jasmine.createSpyObj("OnboardingService", ["open"])
    share = jasmine.createSpyObj("Share", ["share"])
    share.share.and.resolveTo()
    const analytics = jasmine.createSpyObj("AnalyticsService", [
      "track",
      "areAnalyticsAvailable",
    ])
    analytics.track.and.resolveTo()
    analytics.areAnalyticsAvailable.and.returnValue(true)
    isOffline = new BehaviorSubject(false)
    nativeBookmarks = jasmine.createSpyObj("NativeBookmarksService", ["open"])
    nativeReport = jasmine.createSpyObj("NativeReportService", ["open"])
    // The native share sheet is always available in the app.
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)

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
        { provide: SHARE_PLUGIN, useValue: share },
        { provide: AnalyticsService, useValue: analytics },
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

  const lastState = () => nativeChrome.show.calls.mostRecent().args[0]
  const bookLabel = () => (component.mobile ? "Génesis" : "Livro do Génesis")

  it("renders no web toolbar", () => {
    expect(fixture.nativeElement.querySelector("mat-toolbar")).toBeNull()
  })

  it("sends the bars what the web header would show", () => {
    expect(lastState()).toEqual({
      mode: "reader",
      passageLabel: `${bookLabel()} 3`,
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
    })
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
      jasmine.objectContaining({
        passageLabel: "Sobre a Bíblia",
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
      jasmine.objectContaining({
        passageLabel: `${bookLabel()} ${component.mobile ? "Intro" : "Introdução"}`,
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
      jasmine.objectContaining({
        passageLabel: "Salmo 23 (22)",
        passageAccessibilityLabel: "Salmo 23, na liturgia 22",
      }),
    )
  })

  it("drops search while offline", () => {
    isOffline.next(true)
    expect(lastState()).toEqual(jasmine.objectContaining({ search: false }))
  })

  it("follows the reader's view mode, auto-scroll and arrows", () => {
    fixture.componentRef.setInput("viewMode", "paged")
    fixture.componentRef.setInput("autoScrollControlsVisible", true)
    fixture.componentRef.setInput("canGoNext", false)
    fixture.detectChanges()

    expect(lastState()).toEqual(
      jasmine.objectContaining({
        viewMode: "paged",
        autoScrollVisible: true,
        autoScrollAvailable: false,
        canGoNext: false,
      }),
    )
  })

  it("opens the passage picker on the current chapter, with bookmarks", () => {
    actions.next({ id: "passage" })

    const data = nativeChrome.showPicker.calls.mostRecent().args[0]
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
    nativeChrome.show.calls.reset()
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

  it("shares the passage", async () => {
    actions.next({ id: "share" })
    await fixture.whenStable()

    expect(share.share).toHaveBeenCalledWith(
      jasmine.objectContaining({ text: "Ler Livro do Génesis 3." }),
    )
  })

  it("opens the privacy policy outside the app", () => {
    const open = spyOn(window, "open")
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
