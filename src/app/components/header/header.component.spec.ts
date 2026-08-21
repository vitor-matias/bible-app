import { CommonModule } from "@angular/common"
import { PLATFORM_ID, SimpleChange } from "@angular/core"
import {
  type ComponentFixture,
  discardPeriodicTasks,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
import { BehaviorSubject, of } from "rxjs"
import { AnalyticsService } from "../../services/analytics.service"
import { BookmarkService } from "../../services/bookmark.service"
import { NetworkService } from "../../services/network.service"
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
  let dialogSpy: jasmine.SpyObj<MatDialog>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>
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
    dialogSpy = jasmine.createSpyObj("MatDialog", ["open"])
    mockSharePlugin = jasmine.createSpyObj("Share", ["share"])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", [
      "track",
      "areAnalyticsAvailable",
    ])
    analyticsServiceSpy.track.and.returnValue(Promise.resolve())
    analyticsServiceSpy.areAnalyticsAvailable.and.returnValue(true)
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

  it("should not open the report problem dialog when chapter context is missing", () => {
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])

    component.chapterNumber = undefined as unknown as number
    component.onReportProblem(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(dialogSpy.open).not.toHaveBeenCalled()
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
})
