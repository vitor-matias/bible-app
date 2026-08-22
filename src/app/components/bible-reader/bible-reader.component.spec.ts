import {
  ChangeDetectorRef,
  ElementRef,
  NO_ERRORS_SCHEMA,
  PLATFORM_ID,
} from "@angular/core"
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { ActivatedRoute, Router } from "@angular/router"
import { BehaviorSubject, of, throwError } from "rxjs"
import { PagedNavigationDirective } from "../../directives/paged-navigation/paged-navigation.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import { NetworkService } from "../../services/network.service"
import { PreferencesService } from "../../services/preferences.service"
import { SeoService } from "../../services/seo.service"
import { StudyModeService } from "../../services/study-mode.service"
import { BibleReaderComponent } from "./bible-reader.component"

/**
 * Study mode measures the real window, which the runner cannot resize, so the
 * reader's tests drive it through this stand-in instead.
 */
class FakeStudyModeService {
  readonly availableSubject = new BehaviorSubject(false)
  readonly activeSubject = new BehaviorSubject(false)
  readonly available$ = this.availableSubject.asObservable()
  readonly active$ = this.activeSubject.asObservable()
  isEnabled = false
  toggle = jasmine.createSpy("toggle").and.callFake(() => {
    this.isEnabled = !this.isEnabled
    this.activeSubject.next(this.isEnabled && this.availableSubject.value)
  })

  activate(): void {
    this.availableSubject.next(true)
    this.isEnabled = true
    this.activeSubject.next(true)
  }
}

describe("BibleReaderComponent", () => {
  let component: BibleReaderComponent
  let fixture: ComponentFixture<BibleReaderComponent>

  let autoScrollServiceSpy: jasmine.SpyObj<AutoScrollService>
  let apiServiceSpy: jasmine.SpyObj<BibleApiService>
  let bookServiceSpy: jasmine.SpyObj<BookService>
  let preferencesServiceSpy: jasmine.SpyObj<PreferencesService>
  let routerSpy: jasmine.SpyObj<Router>
  let routeMock: unknown
  let animationServiceSpy: jasmine.SpyObj<BibleReaderAnimationService>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>
  let networkServiceSpy: jasmine.SpyObj<NetworkService>
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>
  let seoServiceSpy: jasmine.SpyObj<SeoService>
  let studyMode: FakeStudyModeService

  const mockBooks = [
    { id: "gen", name: "Genesis", urlAbrv: "1-genesis", chapterCount: 50 },
    { id: "about", name: "About", urlAbrv: "about", chapterCount: 1 },
  ]
  const mockChapter = { bookId: "gen", number: 1, verses: [] }

  beforeEach(async () => {
    autoScrollServiceSpy = jasmine.createSpyObj("AutoScrollService", [
      "setAutoScrollLinesPerSecond",
      "stop",
    ])
    apiServiceSpy = jasmine.createSpyObj("BibleApiService", [
      "getBook",
      "getChapter",
    ])
    bookServiceSpy = jasmine.createSpyObj("BookService", [
      "findBook",
      "getUrlAbrv",
      "getChapterUrlSegment",
      "parseChapterUrlSegment",
      "loadGroupIntroBody",
    ])
    bookServiceSpy.books$ = new BehaviorSubject(
      mockBooks,
    ) as unknown as BehaviorSubject<Book[]>
    preferencesServiceSpy = jasmine.createSpyObj("PreferencesService", [
      "getAutoScrollSpeed",
      "getViewMode",
      "getAutoScrollControlsVisible",
      "setAutoScrollControlsVisible",
      "setViewMode",
      "getLastBookId",
      "setLastBookId",
      "getLastChapterNumber",
      "setLastChapterNumber",
      "getStudyMode",
      "setStudyMode",
      "getStudySidebarCollapsed",
      "setStudySidebarCollapsed",
      "getStudyPanelCollapsed",
      "setStudyPanelCollapsed",
    ])
    preferencesServiceSpy.getStudyMode.and.returnValue(false)
    preferencesServiceSpy.getStudySidebarCollapsed.and.returnValue(false)
    preferencesServiceSpy.getStudyPanelCollapsed.and.returnValue(false)

    routerSpy = jasmine.createSpyObj("Router", ["navigate"])
    ;(routerSpy as unknown as { routerState: unknown }).routerState = {
      snapshot: {
        root: {
          firstChild: {
            params: { book: "gen", chapter: "1" },
            queryParams: {},
          },
        },
      },
    }

    routeMock = {
      paramMap: new BehaviorSubject(
        new Map([
          ["book", "gen"],
          ["chapter", "1"],
        ]),
      ),
      queryParamMap: new BehaviorSubject(new Map()),
    }

    animationServiceSpy = jasmine.createSpyObj("BibleReaderAnimationService", [
      "scrollToTop",
      "triggerSlideAnimation",
      "triggerSlideOutAnimation",
      "scrollToVerseElement",
      "cancelPendingRealign",
    ])
    animationServiceSpy.triggerSlideOutAnimation.and.returnValue(
      Promise.resolve(),
    )

    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsServiceSpy.track.and.returnValue(Promise.resolve())
    networkServiceSpy = jasmine.createSpyObj("NetworkService", [
      "ngOnDestroy",
    ]) as jasmine.SpyObj<NetworkService>
    ;(networkServiceSpy as unknown as { isOffline: boolean }).isOffline = false
    snackBarSpy = jasmine.createSpyObj("MatSnackBar", ["open"])
    seoServiceSpy = jasmine.createSpyObj("SeoService", ["updateForChapter"])

    // Default returns
    preferencesServiceSpy.getAutoScrollSpeed.and.returnValue(50)
    preferencesServiceSpy.getViewMode.and.returnValue("scrolling")
    preferencesServiceSpy.getAutoScrollControlsVisible.and.returnValue(false)
    bookServiceSpy.findBook.and.returnValue(mockBooks[0] as unknown as Book)
    bookServiceSpy.getUrlAbrv.and.returnValue("1-genesis")
    bookServiceSpy.getChapterUrlSegment.and.callFake((chapter: number) =>
      chapter === 0 ? "intro" : chapter.toString(),
    )
    bookServiceSpy.parseChapterUrlSegment.and.callFake(
      (segment: string | null | undefined, fallback = 1) => {
        if (segment == null || segment === "") return fallback
        if (segment === "intro") return 0
        const parsed = Number.parseInt(segment, 10)
        return Number.isFinite(parsed) ? parsed : fallback
      },
    )
    apiServiceSpy.getChapter.and.returnValue(
      of(mockChapter as unknown as Chapter),
    )

    studyMode = new FakeStudyModeService()

    await setUpTestBed()

    fixture = TestBed.createComponent(BibleReaderComponent)
    component = fixture.componentInstance
  })

  function setUpTestBed(options?: { platformId?: string }): Promise<void> {
    return TestBed.configureTestingModule({
      imports: [BibleReaderComponent, BrowserAnimationsModule],
      providers: [
        { provide: AutoScrollService, useValue: autoScrollServiceSpy },
        { provide: BibleApiService, useValue: apiServiceSpy },
        { provide: BookService, useValue: bookServiceSpy },
        { provide: PreferencesService, useValue: preferencesServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: routeMock },
        { provide: BibleReaderAnimationService, useValue: animationServiceSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: NetworkService, useValue: networkServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: SeoService, useValue: seoServiceSpy },
        { provide: StudyModeService, useValue: studyMode },
        ...(options?.platformId
          ? [{ provide: PLATFORM_ID, useValue: options.platformId }]
          : []),
      ],
    })
      .overrideComponent(BibleReaderComponent, {
        set: {
          schemas: [NO_ERRORS_SCHEMA],
          imports: [], // Override standalone imports to avoid child dependency issues
        },
      })
      .compileComponents()
  }

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  describe("ngOnInit", () => {
    it("should initialize default state from services", () => {
      fixture.detectChanges() // triggers ngOnInit
      expect(
        autoScrollServiceSpy.setAutoScrollLinesPerSecond,
      ).toHaveBeenCalledWith(50)
      expect(component.viewMode).toBe("scrolling")
      expect(component.showAutoScrollControls).toBe(false)
      expect(component.books).toEqual(mockBooks as unknown as Book[])
    })

    it("should set book and navigate to stored params when URL has no clear intent initially", () => {
      fixture.detectChanges()
      expect(bookServiceSpy.findBook).toHaveBeenCalledWith("gen")
      expect(apiServiceSpy.getChapter).toHaveBeenCalledWith("gen", 1)
      expect(routerSpy.navigate).toHaveBeenCalled()
    })

    // A router.navigate during prerendering (e.g. "/" → "/sobre/1") makes
    // Angular emit a "Redirecting" stub instead of the page's real content,
    // which would leave the home page with nothing for crawlers to index.
    it("should not navigate while server-rendering, but still load the chapter", async () => {
      TestBed.resetTestingModule()
      await setUpTestBed({ platformId: "server" })
      const serverFixture = TestBed.createComponent(BibleReaderComponent)
      serverFixture.detectChanges()

      expect(routerSpy.navigate).not.toHaveBeenCalled()
      expect(apiServiceSpy.getChapter).toHaveBeenCalledWith("gen", 1)
    })

    // resetContainerForRepaint hides the container for the swap animation and
    // only the browser-only animation service puts it back, so hiding it while
    // server-rendering bakes opacity: 0 into the prerendered HTML with nothing
    // left to undo it — every crawler would see the chapter as hidden text.
    it("should not hide the chapter container while server-rendering", async () => {
      TestBed.resetTestingModule()
      await setUpTestBed({ platformId: "server" })
      const serverFixture = TestBed.createComponent(BibleReaderComponent)
      serverFixture.detectChanges()

      const container = serverFixture.componentInstance.bookContainer
        ?.nativeElement as HTMLElement
      expect(container).toBeTruthy()
      expect(container.style.opacity).not.toBe("0")
    })

    it("should not call getChapter if book and chapter didn't change on route update", () => {
      fixture.detectChanges() // Sets up initial sub
      apiServiceSpy.getChapter.calls.reset()

      ;(
        routeMock as { queryParamMap: BehaviorSubject<Map<string, string>> }
      ).queryParamMap.next(new Map([["verseStart", "2"]]))

      expect(apiServiceSpy.getChapter).not.toHaveBeenCalled()
      expect(animationServiceSpy.scrollToVerseElement).toHaveBeenCalled()
    })
  })

  describe("Navigation (Swipe / Arrow Keys / Methods)", () => {
    beforeEach(() => {
      fixture.detectChanges()
      component.book = mockBooks[0] as unknown as Book
      component.chapterNumber = 1
      routerSpy.navigate.calls.reset()
    })

    it("goToNextChapter should navigate forward and stop scroll", () => {
      component.goToNextChapter()
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBeTrue()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "2"])
    })

    it("goToPreviousChapter should navigate backwards and stop scroll", () => {
      component.chapterNumber = 2
      component.goToPreviousChapter()
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingBackwards).toBeTrue()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])
    })

    // The links are rebuilt when the reader lands on a chapter, so these go
    // through getChapter rather than setting chapterNumber by hand.
    const introBook = (): Book => ({
      ...(mockBooks[0] as unknown as Book),
      introduction: [{ type: "introParagraph", text: "intro" }],
    })

    it("exposes router link arrays for the prev/next chapter anchors", fakeAsync(() => {
      component.getChapter(5)
      tick()

      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "4"])
      expect(component.nextChapterLink).toEqual(["/", "1-genesis", "6"])
    }))

    // RouterLink diffs its input by reference, so a getter returning a fresh
    // array would rebuild both hrefs on every change detection pass — one per
    // animation frame while auto-scroll runs.
    it("keeps the same link arrays across change detection", fakeAsync(() => {
      component.getChapter(5)
      tick()
      const previous = component.previousChapterLink
      const next = component.nextChapterLink

      fixture.detectChanges()

      expect(component.previousChapterLink).toBe(previous)
      expect(component.nextChapterLink).toBe(next)
    }))

    it("uses the intro segment when the previous chapter is the introduction", fakeAsync(() => {
      component.book = introBook()
      component.getChapter(1)
      tick()

      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "intro"])
    }))

    it("clamps the prev/next links at the book boundaries", fakeAsync(() => {
      // First chapter of a book without an introduction: must not offer /0
      // or /intro, which this book does not have.
      component.getChapter(1)
      tick()
      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "1"])

      // Last chapter: must not point past the end of the book.
      component.getChapter(50)
      tick()
      expect(component.nextChapterLink).toEqual(["/", "1-genesis", "50"])
    }))

    it("never links below the introduction on an intro book", fakeAsync(() => {
      component.book = introBook()
      component.getChapter(0)
      tick()

      // /-1 must never be produced from the introduction.
      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "intro"])
    }))

    it("does not arm a slide transition past the book boundaries", () => {
      component.chapterNumber = 1
      component.isNavigatingBackwards = false
      autoScrollServiceSpy.stop.calls.reset()

      component.prepareChapterNavigation(false)

      expect(component.isNavigatingBackwards).toBeFalse()
      expect(autoScrollServiceSpy.stop).not.toHaveBeenCalled()

      component.chapterNumber = 50
      component.prepareChapterNavigation(true)

      expect(component.isNavigatingForwards).toBeFalse()
    })

    it("prepareChapterNavigation stops auto-scroll and sets the slide direction", () => {
      // Mid-book, so both directions stay inside the book's bounds.
      component.chapterNumber = 5
      component.prepareChapterNavigation(true)
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBeTrue()
      expect(component.isNavigatingBackwards).toBeFalse()

      component.prepareChapterNavigation(false)
      expect(component.isNavigatingBackwards).toBeTrue()
      // The opposite direction has to be cleared, or a chapter that loads
      // later slides the wrong way.
      expect(component.isNavigatingForwards).toBeFalse()
    })

    // RouterLink lets the browser handle modified and non-primary clicks
    // (new tab, new window) without navigating, so the side effects must skip
    // them too — otherwise auto-scroll stops and a direction flag is left set
    // in a tab that never loads another chapter.
    it("prepareChapterNavigation ignores clicks RouterLink does not navigate on", () => {
      const modified = [
        new MouseEvent("click", { button: 0, metaKey: true }),
        new MouseEvent("click", { button: 0, ctrlKey: true }),
        new MouseEvent("click", { button: 0, shiftKey: true }),
        new MouseEvent("click", { button: 0, altKey: true }),
        new MouseEvent("click", { button: 1 }),
      ]

      for (const event of modified) {
        component.prepareChapterNavigation(true, event)
      }

      expect(autoScrollServiceSpy.stop).not.toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBeFalse()
      expect(component.isNavigatingBackwards).toBeFalse()

      component.prepareChapterNavigation(true, new MouseEvent("click"))
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBeTrue()
    })

    it("renders prev/next as anchors (crawlable links) in scrolling mode", () => {
      const element = fixture.nativeElement as HTMLElement
      // Initial chapter is 1: only the next-chapter link should exist.
      expect(element.querySelector("a.next-chapter")).toBeTruthy()
      expect(element.querySelector("button.next-chapter")).toBeFalsy()
      expect(element.querySelector("a.prev-chapter")).toBeFalsy()

      component.chapter = { bookId: "gen", number: 2 } as Chapter
      component.chapterNumber = 2
      ;(component as unknown as { cdr: ChangeDetectorRef }).cdr.markForCheck()
      fixture.detectChanges()

      expect(element.querySelector("a.prev-chapter")).toBeTruthy()
      expect(element.querySelector("button.prev-chapter")).toBeFalsy()
    })

    it("renders prev/next as buttons in paged mode", () => {
      component.viewMode = "paged"
      component.chapter = { bookId: "gen", number: 2 } as Chapter
      component.chapterNumber = 2
      ;(component as unknown as { cdr: ChangeDetectorRef }).cdr.markForCheck()
      fixture.detectChanges()

      const element = fixture.nativeElement as HTMLElement
      expect(element.querySelector("button.next-chapter")).toBeTruthy()
      expect(element.querySelector("a.next-chapter")).toBeFalsy()
      expect(element.querySelector("button.prev-chapter")).toBeTruthy()
    })

    // A standalone introduction (a testament, a group of books) has no
    // chapters to page on to, so the page state is the only thing that can
    // reveal its next-page control.
    it("renders the next-page button on a standalone introduction", () => {
      component.book = {
        id: "pentateuco",
        name: "Introdução ao Pentateuco",
        chapterCount: 0,
        introSlug: "pentateuco",
        introduction: [{ type: "introParagraph", text: "..." }],
      } as unknown as Book
      component.viewMode = "paged"
      component.chapter = { bookId: "pentateuco", number: 0 } as Chapter
      component.chapterNumber = 0
      component.onPageStateChange({ isFirstPage: true, isLastPage: false })
      ;(component as unknown as { cdr: ChangeDetectorRef }).cdr.markForCheck()
      fixture.detectChanges()

      const element = fixture.nativeElement as HTMLElement
      expect(element.querySelector("button.next-chapter")).toBeTruthy()
      // Page one of the introduction: nothing to go back to.
      expect(element.querySelector("button.prev-chapter")).toBeFalsy()

      component.onPageStateChange({ isFirstPage: false, isLastPage: true })
      fixture.detectChanges()

      expect(element.querySelector("button.prev-chapter")).toBeTruthy()
      expect(element.querySelector("button.next-chapter")).toBeFalsy()
    })

    it("onPageStateChange should only mark for check if state changed", () => {
      const cdrSpy = spyOn(
        (component as unknown as { cdr: ChangeDetectorRef }).cdr,
        "markForCheck",
      )

      component.isFirstPage = true
      component.isLastPage = false

      component.onPageStateChange({ isFirstPage: true, isLastPage: false })
      expect(cdrSpy).not.toHaveBeenCalled()

      component.onPageStateChange({ isFirstPage: false, isLastPage: true })
      expect(component.isFirstPage).toBeFalse()
      expect(component.isLastPage).toBeTrue()
      expect(cdrSpy).toHaveBeenCalled()
    })

    it("should increase and decrease font size via gestures directive", () => {
      component.gestures = jasmine.createSpyObj("UnifiedGesturesDirective", [
        "increaseFontSize",
        "decreaseFontSize",
      ])
      component.onIncreaseFontSize()
      expect(component.gestures.increaseFontSize).toHaveBeenCalled()

      component.onDecreaseFontSize()
      expect(component.gestures.decreaseFontSize).toHaveBeenCalled()
    })

    describe("arrow keys inside a text field", () => {
      it("leaves the caret alone instead of changing chapter", () => {
        const input = document.createElement("input")
        document.body.appendChild(input)
        const event = new KeyboardEvent("keydown", { key: "ArrowRight" })
        Object.defineProperty(event, "target", { value: input })

        component.onArrowPress(event)

        expect(routerSpy.navigate).not.toHaveBeenCalled()
        input.remove()
      })

      it("still changes chapter from anywhere else on the page", () => {
        const event = new KeyboardEvent("keydown", { key: "ArrowRight" })
        Object.defineProperty(event, "target", { value: document.body })

        component.onArrowPress(event)

        expect(routerSpy.navigate).toHaveBeenCalled()
      })
    })

    describe("checkIfNextVerseStartsWithQuote", () => {
      it("should return false if chapter or verses missing", () => {
        component.chapter = undefined as unknown as Chapter
        expect(component.checkIfNextVerseStartsWithQuote(0)).toBeFalse()

        component.chapter = { verses: [] } as unknown as Chapter
        expect(component.checkIfNextVerseStartsWithQuote(0)).toBeFalse()
      })

      it("should check if the next verse starts with a quote", () => {
        component.chapter = {
          verses: [
            { number: 1, text: [{ type: "text" }] },
            { number: 2, text: [{ type: "footnote" }, { type: "quote" }] },
          ],
        } as unknown as Chapter

        expect(component.checkIfNextVerseStartsWithQuote(0)).toBeTrue()
      })

      it("should return false if next verse has no displayable text", () => {
        component.chapter = {
          verses: [
            { number: 1, text: [{ type: "text" }] },
            { number: 2, text: [{ type: "footnote" }] },
          ],
        } as unknown as Chapter

        expect(component.checkIfNextVerseStartsWithQuote(0)).toBeFalse()
      })
    })
    it("onSwipeLeft should go to next chapter if scrolling mode", () => {
      component.viewMode = "scrolling"
      component.onSwipeLeft()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "2"])
    })

    it("onSwipeLeft should go to next page if paged mode", () => {
      component.viewMode = "paged"
      component.pagedNav = jasmine.createSpyObj("PagedNavigationDirective", [
        "nextPage",
      ]) as unknown as PagedNavigationDirective
      component.onSwipeLeft()
      expect(component.pagedNav?.nextPage).toHaveBeenCalled()
    })

    it("onSwipeRight should go to prev chapter if scrolling mode", () => {
      component.chapterNumber = 2
      component.viewMode = "scrolling"
      component.onSwipeRight()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])
    })

    it("onSwipeRight should go to prev page if paged mode", () => {
      component.viewMode = "paged"
      component.pagedNav = jasmine.createSpyObj("PagedNavigationDirective", [
        "prevPage",
      ]) as unknown as PagedNavigationDirective
      component.onSwipeRight()
      expect(component.pagedNav?.prevPage).toHaveBeenCalled()
    })

    it("onArrowPress should handle arrow directions", () => {
      component.chapterNumber = 2
      component.onArrowPress(new KeyboardEvent("keydown", { key: "ArrowLeft" }))
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])

      routerSpy.navigate.calls.reset()
      component.onArrowPress(
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      )
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "3"])
    })
  })

  describe("quoted passages vs. books written in verse", () => {
    function quote(text: string): TextType {
      return { type: "quote", text, normalizedText: text } as TextType
    }
    function prose(text: string): TextType {
      return { type: "text", text, normalizedText: text } as TextType
    }
    function heading(text: string): TextType {
      return {
        type: "section",
        tag: "s1",
        text,
        normalizedText: text,
      } as TextType
    }
    function verse(number: number, text: TextType[]): Verse {
      return {
        bookId: "gen",
        chapterNumber: 1,
        number,
        verseLabel: `${number}`,
        text,
      }
    }

    function load(verses: Verse[]): void {
      apiServiceSpy.getChapter.and.returnValue(
        of({ bookId: "gen", number: 1, verses } as unknown as Chapter),
      )
      fixture.detectChanges()
      component.getChapter(1)
    }

    it("marks poetry that prose introduces", () => {
      const verses = [
        verse(37, [prose("Jesus disse-lhe:"), quote("Amarás ao Senhor,")]),
      ]
      load(verses)

      expect(component.isQuotationVerse(verses[0])).toBeTrue()
    })

    it("carries the mark through the rest of the quoted passage", () => {
      // "…dizendo:" ends one verse and the quotation runs into the next,
      // which therefore opens on poetry and looks like a psalm on its own.
      const verses = [
        verse(43, [
          prose("Como é, então, que David lhe chama Senhor, dizendo:"),
        ]),
        verse(44, [quote("Disse o Senhor ao meu Senhor:")]),
        verse(45, [prose("Ora, se David lhe chama Senhor…")]),
      ]
      load(verses)

      expect(component.isQuotationVerse(verses[1])).toBeTrue()
      expect(component.isQuotationVerse(verses[2])).toBeFalse()
    })

    it("leaves a book written in verse unmarked", () => {
      // A psalm: every verse opens on poetry, prose and all.
      const verses = [
        verse(1, [
          quote("\u200b"),
          prose("Feliz o homem"),
          quote("nem se detém"),
        ]),
        verse(2, [
          quote("\u200b"),
          prose("antes põe o seu enlevo"),
          quote("e nela medita"),
        ]),
      ]
      load(verses)

      expect(component.isQuotationVerse(verses[0])).toBeFalse()
      expect(component.isQuotationVerse(verses[1])).toBeFalse()
    })

    it("does not read a section heading as prose introducing a quotation", () => {
      // The chapter's front matter is nothing but a heading; counting it as
      // prose made every psalm under a title read as a quotation.
      const verses = [
        verse(0, [heading("OS DOIS CAMINHOS")]),
        verse(1, [
          quote("\u200b"),
          prose("Feliz o homem"),
          quote("nem se detém"),
        ]),
      ]
      load(verses)

      expect(component.isQuotationVerse(verses[1])).toBeFalse()
    })
  })

  describe("study mode", () => {
    beforeEach(() => {
      fixture.detectChanges()
    })

    it("passes the service's availability on to the header", () => {
      studyMode.availableSubject.next(true)
      expect(component.studyModeAvailable).toBeTrue()
    })

    it("turns on when the service says it is active", () => {
      studyMode.activate()
      expect(component.studyModeActive).toBeTrue()
    })

    it("keeps the About page out of it, having no verses to study", () => {
      studyMode.activate()
      component.book = { id: "about" } as Book

      expect(component.studyModeActive).toBeFalse()
    })

    it("reads in one column, whatever the paged preference says", () => {
      component.viewMode = "paged"
      expect(component.effectiveViewMode).toBe("paged")

      studyMode.activate()
      expect(component.effectiveViewMode).toBe("scrolling")
    })

    it("asks the service to toggle, and reports it", () => {
      studyMode.availableSubject.next(true)
      component.onToggleStudyMode()

      expect(studyMode.toggle).toHaveBeenCalled()
      expect(analyticsServiceSpy.track).toHaveBeenCalledWith(
        "study_mode_toggle",
        jasmine.objectContaining({ enabled: true }),
      )
    })

    it("keeps the verse the reader selected", () => {
      studyMode.activate()
      const verse = { number: 39 } as Verse

      component.onVerseSelected({ verse })

      expect(component.selection?.verse).toBe(verse)
    })

    it("lets go of the verse when it is clicked a second time", () => {
      studyMode.activate()
      const verse = { number: 39 } as Verse

      component.onVerseSelected({ verse })
      component.onVerseSelected({ verse })

      expect(component.selection).toBeNull()
    })

    it("keeps the verse when the second click asks for a tab", () => {
      studyMode.activate()
      const verse = { number: 39 } as Verse

      component.onVerseSelected({ verse })
      component.onVerseSelected({ verse, panel: "footnotes" })

      expect(component.selection?.panel).toBe("footnotes")
    })

    it("selects a different verse rather than letting go", () => {
      studyMode.activate()
      component.onVerseSelected({ verse: { number: 39 } as Verse })

      component.onVerseSelected({ verse: { number: 40 } as Verse })

      expect(component.selection?.verse.number).toBe(40)
    })

    it("lets go of the verse on Escape", () => {
      studyMode.activate()
      component.onVerseSelected({ verse: { number: 39 } as Verse })

      const event = new KeyboardEvent("keydown", { key: "Escape" })
      Object.defineProperty(event, "target", { value: document.body })
      component.onArrowPress(event)

      expect(component.selection).toBeNull()
    })

    it("leaves Escape alone while the reader is typing a note", () => {
      studyMode.activate()
      component.onVerseSelected({ verse: { number: 39 } as Verse })

      const textarea = document.createElement("textarea")
      const event = new KeyboardEvent("keydown", { key: "Escape" })
      Object.defineProperty(event, "target", { value: textarea })
      component.onArrowPress(event)

      expect(component.selection).not.toBeNull()
    })

    it("follows the reading position as the column scrolls", fakeAsync(() => {
      studyMode.activate()
      // A column whose top is at 0, with three verses laid out down it: the
      // first has scrolled past, the second is the one being read.
      const verse = (id: string, bottom: number) =>
        ({
          id,
          getBoundingClientRect: () => ({ bottom }) as DOMRect,
        }) as HTMLElement
      component.studyScroll = {
        nativeElement: {
          getBoundingClientRect: () => ({ top: 0 }) as DOMRect,
          querySelectorAll: () => [
            verse("1", -40),
            verse("2", 120),
            verse("3", 400),
          ],
        },
      } as unknown as ElementRef<HTMLElement>

      component.onStudyScroll()
      tick(16)

      expect(component.visibleVerse).toBe(2)
    }))

    it("does not follow the scroll outside study mode", fakeAsync(() => {
      component.studyScroll = {
        nativeElement: {
          getBoundingClientRect: () => ({ top: 0 }) as DOMRect,
          querySelectorAll: () => [],
        },
      } as unknown as ElementRef<HTMLElement>

      component.onStudyScroll()
      tick(16)

      expect(component.visibleVerse).toBeUndefined()
    }))

    it("forgets the reading position when the chapter changes", () => {
      studyMode.activate()
      component.visibleVerse = 39

      apiServiceSpy.getChapter.and.returnValue(
        of({ bookId: "gen", number: 2, verses: [] } as unknown as Chapter),
      )
      component.getChapter(2)

      expect(component.visibleVerse).toBeUndefined()
    })

    it("drops the selection when study mode goes away", () => {
      studyMode.activate()
      component.onVerseSelected({ verse: { number: 39 } as Verse })

      studyMode.activeSubject.next(false)

      expect(component.selection).toBeNull()
    })

    it("drops the selection when the chapter changes under it", () => {
      studyMode.activate()
      component.onVerseSelected({ verse: { number: 39 } as Verse })

      apiServiceSpy.getChapter.and.returnValue(
        of({ bookId: "gen", number: 2, verses: [] } as unknown as Chapter),
      )
      component.getChapter(2)

      expect(component.selection).toBeNull()
    })

    it("restores the folded state of each side column", () => {
      preferencesServiceSpy.getStudySidebarCollapsed.and.returnValue(true)
      preferencesServiceSpy.getStudyPanelCollapsed.and.returnValue(false)

      const secondFixture = TestBed.createComponent(BibleReaderComponent)
      secondFixture.detectChanges()

      expect(secondFixture.componentInstance.studySidebarCollapsed).toBeTrue()
      expect(secondFixture.componentInstance.studyPanelCollapsed).toBeFalse()
    })

    it("remembers a side column the reader folds away", () => {
      component.toggleStudySidebar()

      expect(component.studySidebarCollapsed).toBeTrue()
      expect(
        preferencesServiceSpy.setStudySidebarCollapsed,
      ).toHaveBeenCalledWith(true)
    })

    it("unfolds the panel when a verse is picked, so the answer is visible", () => {
      studyMode.activate()
      component.toggleStudyPanel()
      expect(component.studyPanelCollapsed).toBeTrue()

      component.onVerseSelected({ verse: { number: 39 } as Verse })

      expect(component.studyPanelCollapsed).toBeFalse()
      expect(preferencesServiceSpy.setStudyPanelCollapsed).toHaveBeenCalledWith(
        false,
      )
    })

    it("reads in one column while both side columns are open", () => {
      studyMode.activate()

      expect(component.studyPaged).toBeFalse()
      expect(component.effectiveViewMode).toBe("scrolling")
    })

    it("pages in two columns once a side column is folded away", () => {
      studyMode.activate()
      component.toggleStudySidebar()

      expect(component.studyPaged).toBeTrue()
      // The app's own paged mode, not a second kind of column layout: the
      // paged navigation directive reads this.
      expect(component.effectiveViewMode).toBe("paged")
    })

    it("goes back to one column when the rail comes back", () => {
      studyMode.activate()
      component.toggleStudySidebar()
      component.toggleStudySidebar()

      expect(component.studyPaged).toBeFalse()
      expect(component.effectiveViewMode).toBe("scrolling")
    })

    it("does not page outside study mode just because a rail is folded", () => {
      component.toggleStudySidebar()

      expect(component.studyPaged).toBeFalse()
    })

    it("selects the verse a deep link points at", () => {
      studyMode.activate()
      const verses = [{ number: 1 } as Verse, { number: 39 } as Verse]
      apiServiceSpy.getChapter.and.returnValue(
        of({ bookId: "gen", number: 1, verses } as unknown as Chapter),
      )

      component.getChapter(1, 39)

      expect(component.selection?.verse.number).toBe(39)
    })

    it("does not select a deep-linked verse outside study mode", () => {
      const verses = [{ number: 39 } as Verse]
      apiServiceSpy.getChapter.and.returnValue(
        of({ bookId: "gen", number: 1, verses } as unknown as Chapter),
      )

      component.getChapter(1, 39)

      expect(component.selection).toBeNull()
    })
  })

  describe("Drawer Actions", () => {
    beforeEach(() => {
      fixture.detectChanges()
      component.bookDrawer = jasmine.createSpyObj("MatDrawer", [
        "close",
        "toggle",
      ])
      ;(component.bookDrawer.toggle as jasmine.Spy).and.returnValue(
        Promise.resolve(),
      )
      ;(component.bookDrawer.close as jasmine.Spy).and.returnValue(
        Promise.resolve(),
      )
    })

    it("openBookDrawer should toggle drawer", fakeAsync(() => {
      component.openBookDrawer({ open: true })
      tick()
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
    }))

    it("openChapterDrawer should open drawer with chapter mode", fakeAsync(() => {
      component.showBooks = true
      component.openChapterDrawer({ open: true })
      tick()
      expect(component.bookDrawer.close).toHaveBeenCalled()
      expect(component.showBooks).toBeFalse()
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
    }))

    it("openChapterDrawer should just toggle drawer when showBooks is false", fakeAsync(() => {
      component.showBooks = false
      component.openChapterDrawer({ open: true })
      tick()
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
      expect(component.bookDrawer.close).not.toHaveBeenCalled()
    }))

    it("onBookSubmit should navigate to book and close drawer", () => {
      component.onBookSubmit({ bookId: "gen" })
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])
      expect(component.bookDrawer.close).toHaveBeenCalled()
    })

    it("onBookSubmit opens chapter 1 even when the book has an introduction", () => {
      bookServiceSpy.findBook.and.returnValue({
        ...(mockBooks[0] as unknown as Book),
        introduction: [{ type: "introParagraph", text: "intro" }],
      })

      component.onBookSubmit({ bookId: "gen" })

      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])
    })

    it("onChapterSubmit should navigate to chapter and close drawer", () => {
      component.onChapterSubmit({ chapterNumber: 5 })
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", "5"])
      expect(component.bookDrawer.close).toHaveBeenCalled()
    })

    it("should close and reopen drawer when showBooks is false for openBookDrawer", fakeAsync(() => {
      component.showBooks = false
      component.openBookDrawer({ open: true })
      tick()
      tick()
      expect(component.bookDrawer.close).toHaveBeenCalled()
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
      expect(component.showBooks).toBeTrue()
    }))

    it("should close and reopen drawer when showBooks is true for openChapterDrawer", fakeAsync(() => {
      component.showBooks = true
      component.openChapterDrawer({ open: true })
      tick()
      tick()
      expect(component.bookDrawer.close).toHaveBeenCalled()
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
      expect(component.showBooks).toBeFalse()
    }))

    it("dismissBookDrawer should close drawer directly", () => {
      component.dismissBookDrawer()
      expect(component.bookDrawer.close).toHaveBeenCalled()
    })
  })

  describe("View and Settings toggles", () => {
    beforeEach(() => {
      fixture.detectChanges()
    })

    it("toggleAutoScrollControlsVisibility should toggle and save state", () => {
      component.showAutoScrollControls = false
      component.toggleAutoScrollControlsVisibility()
      expect(component.showAutoScrollControls).toBeTrue()
      expect(
        preferencesServiceSpy.setAutoScrollControlsVisible,
      ).toHaveBeenCalledWith(true)
    })

    it("onToggleViewMode should toggle mode and save state", () => {
      component.viewMode = "scrolling"
      component.onToggleViewMode()
      expect(component.viewMode).toBe("paged")
      expect(preferencesServiceSpy.setViewMode).toHaveBeenCalledWith("paged")
      expect(component.showAutoScrollControls).toBeFalse()
    })

    it("onToggleViewMode should switch back to scrolling mode", fakeAsync(() => {
      component.viewMode = "paged"
      component.onToggleViewMode()
      expect(component.viewMode).toBe("scrolling")
      expect(preferencesServiceSpy.setViewMode).toHaveBeenCalledWith(
        "scrolling",
      )
    }))
  })

  describe("introduction route on books without intro", () => {
    it("should normalize chapter 0 to chapter 1 and load it", () => {
      component.book = mockBooks[0] as unknown as Book
      apiServiceSpy.getChapter.calls.reset()
      routerSpy.navigate.calls.reset()

      component.getChapter(0)

      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", "1"], {
        replaceUrl: true,
      })
      // The route event that navigation raises is discarded as
      // already-current, so this branch has to load the chapter itself —
      // otherwise the reader is left with an empty body.
      expect(apiServiceSpy.getChapter).toHaveBeenCalledWith("gen", 1)
    })

    it("does not reload the chapter when the book list is re-emitted", () => {
      // loadGroupIntroBody pushes a new book list once an introduction
      // arrives; re-running the startup block would navigate and apply the
      // chapter already on screen a second time.
      fixture.detectChanges()
      apiServiceSpy.getChapter.calls.reset()
      routerSpy.navigate.calls.reset()

      ;(bookServiceSpy.books$ as unknown as BehaviorSubject<Book[]>).next([
        ...(mockBooks as unknown as Book[]),
      ])

      expect(apiServiceSpy.getChapter).not.toHaveBeenCalled()
      expect(routerSpy.navigate).not.toHaveBeenCalled()
    })

    it("keeps a late introduction body off the chapter the reader moved to", () => {
      // 1 Samuel reads a shared introduction, so /1sm/intro fetches the body;
      // picking a chapter before it lands must win.
      const samuel = {
        id: "1sa",
        name: "1 Samuel",
        shortName: "1 Samuel",
        abrv: "1 Sm",
        chapterCount: 31,
        sharedIntroSlug: "samuel",
        introduction: [],
      } as unknown as Book
      component.book = samuel
      let resolveIntro: (book: Book) => void = () => {}
      bookServiceSpy.loadGroupIntroBody.and.returnValue(
        new Promise<Book>((resolve) => {
          resolveIntro = resolve
        }),
      )

      component.getChapter(0)
      component.getChapter(5)

      resolveIntro({
        ...samuel,
        introduction: [{ type: "introParagraph", text: "Texto" }],
      } as unknown as Book)

      return Promise.resolve().then(() => {
        expect(component.chapterNumber).toBe(5)
      })
    })

    it("renders the About page without asking the API for it", () => {
      component.book = mockBooks[1] as unknown as Book
      apiServiceSpy.getChapter.calls.reset()

      component.getChapter(1)

      expect(apiServiceSpy.getChapter).not.toHaveBeenCalled()
      expect(component.chapter?.bookId).toBe("about")
    })
  })

  describe("getChapter and animations", () => {
    beforeEach(() => {
      fixture.detectChanges()
      animationServiceSpy.scrollToTop.calls.reset()
      preferencesServiceSpy.setLastBookId.calls.reset()
      routerSpy.navigate.calls.reset()
    })

    it("should finalize and call animation.scrollToTop on success", fakeAsync(() => {
      apiServiceSpy.getChapter.and.returnValue(
        of(mockChapter as unknown as Chapter),
      )
      component.getChapter(1)
      tick()

      expect(component.chapter).toEqual(mockChapter as unknown as Chapter)
      expect(component.chapterNumber).toBe(1)
      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
      expect(preferencesServiceSpy.setLastBookId).toHaveBeenCalledWith("gen")
    }))

    // The realign pass registered by the previous chapter's deep link holds
    // that chapter's verse element and scroll strategy; it must not survive
    // into the chapter that replaced it.
    it("should drop a pending scroll realign when a new chapter is applied", fakeAsync(() => {
      animationServiceSpy.cancelPendingRealign.calls.reset()

      component.getChapter(1)
      tick()

      expect(animationServiceSpy.cancelPendingRealign).toHaveBeenCalled()
    }))

    it("should drop a pending scroll realign on destroy", () => {
      animationServiceSpy.cancelPendingRealign.calls.reset()

      component.ngOnDestroy()

      expect(animationServiceSpy.cancelPendingRealign).toHaveBeenCalled()
    })

    it("should update SEO metadata when a chapter is applied", fakeAsync(() => {
      seoServiceSpy.updateForChapter.calls.reset()
      apiServiceSpy.getChapter.and.returnValue(
        of(mockChapter as unknown as Chapter),
      )

      component.getChapter(1)
      tick()

      expect(seoServiceSpy.updateForChapter).toHaveBeenCalledWith(
        component.book,
        1,
        mockChapter as unknown as Chapter,
      )
    }))

    it("should call scrollToEnd when navigating backwards in paged mode", fakeAsync(() => {
      component.viewMode = "paged"
      component.isNavigatingBackwards = true
      component.pagedNav = jasmine.createSpyObj("PagedNavigationDirective", [
        "scrollToEnd",
        "ensureAlignedScrollWidth",
      ]) as unknown as PagedNavigationDirective

      apiServiceSpy.getChapter.and.returnValue(
        of(mockChapter as unknown as Chapter),
      )

      let capturedCallback: (() => void) | undefined
      animationServiceSpy.scrollToTop.and.callFake(
        (content, container, mode, startAtBottom, cb) => {
          capturedCallback = cb
        },
      )

      component.getChapter(1)
      tick()

      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
      expect(capturedCallback).toBeDefined()
      if (capturedCallback) capturedCallback()
      expect(component.pagedNav?.scrollToEnd).toHaveBeenCalled()
      expect(
        component.pagedNav?.ensureAlignedScrollWidth,
      ).not.toHaveBeenCalled()
    }))

    it("should call ensureAlignedScrollWidth when navigating forwards in paged mode", fakeAsync(() => {
      component.viewMode = "paged"
      component.isNavigatingForwards = true
      component.pagedNav = jasmine.createSpyObj("PagedNavigationDirective", [
        "scrollToEnd",
        "ensureAlignedScrollWidth",
      ]) as unknown as PagedNavigationDirective

      apiServiceSpy.getChapter.and.returnValue(
        of(mockChapter as unknown as Chapter),
      )

      let capturedCallback: (() => void) | undefined
      animationServiceSpy.scrollToTop.and.callFake(
        (content, container, mode, startAtBottom, cb) => {
          capturedCallback = cb
        },
      )

      component.getChapter(2)
      tick()

      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
      expect(capturedCallback).toBeDefined()
      if (capturedCallback) capturedCallback()
      expect(component.pagedNav?.ensureAlignedScrollWidth).toHaveBeenCalled()
      expect(component.pagedNav?.scrollToEnd).not.toHaveBeenCalled()
    }))

    it("should finalize and fallback to 'about' book on error", fakeAsync(() => {
      spyOn(console, "error")
      apiServiceSpy.getChapter.and.returnValue(
        throwError(() => new Error("Not found")),
      )
      bookServiceSpy.findBook.and.returnValue(mockBooks[1] as unknown as Book) // About book
      component.book = mockBooks[1] as unknown as Book // Set current to about to trigger fallback

      component.getChapter(1)
      tick()

      expect(component.chapter.bookId).toBe("about")
      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
      expect(preferencesServiceSpy.setLastBookId).toHaveBeenCalledWith("about")
    }))

    it("should trigger slide out animation if navigating", fakeAsync(() => {
      component.isNavigatingForwards = true
      // Need a dummy nativeElement
      component.bookContainer = {
        nativeElement: document.createElement("div"),
      } as unknown as ElementRef

      component.getChapter(2)
      tick()

      expect(animationServiceSpy.triggerSlideOutAnimation).toHaveBeenCalled()
    }))

    it("should call scrollToVerseElement if verseStart provided", fakeAsync(() => {
      apiServiceSpy.getChapter.and.returnValue(
        of(mockChapter as unknown as Chapter),
      )
      component.getChapter(1, 5, 10, true)
      tick()
      expect(animationServiceSpy.scrollToVerseElement).toHaveBeenCalled()
    }))

    it("should trigger slide out animation in error fallback if navigating", fakeAsync(() => {
      spyOn(console, "error")
      component.isNavigatingForwards = true
      component.bookContainer = {
        nativeElement: document.createElement("div"),
      } as unknown as ElementRef
      apiServiceSpy.getChapter.and.returnValue(
        throwError(() => new Error("Not found")),
      )
      bookServiceSpy.findBook.and.returnValue(mockBooks[1] as unknown as Book)
      component.book = mockBooks[1] as unknown as Book

      component.getChapter(2)
      tick()
      expect(animationServiceSpy.triggerSlideOutAnimation).toHaveBeenCalled()
    }))

    it("should revert URL with replaceUrl and not reset container when online error occurs", fakeAsync(() => {
      spyOn(console, "error")
      apiServiceSpy.getChapter.and.returnValue(
        throwError(() => new Error("Not found")),
      )
      component.book = mockBooks[0] as unknown as Book
      component.chapterNumber = 3
      const el = document.createElement("div")
      component.bookContainer = { nativeElement: el } as unknown as ElementRef

      component.getChapter(4)
      tick()

      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "3"], {
        replaceUrl: true,
      })
      expect(el.style.opacity).not.toBe("0")
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        "Não foi possível carregar o capítulo. Tente novamente.",
        "OK",
        { duration: 4000 },
      )
    }))

    it("should revert URL with replaceUrl and not reset container when NetworkService reports offline", fakeAsync(() => {
      spyOn(console, "error")
      ;(networkServiceSpy as unknown as { isOffline: boolean }).isOffline = true
      apiServiceSpy.getChapter.and.returnValue(
        throwError(() => new Error("Network error")),
      )
      component.book = mockBooks[0] as unknown as Book
      component.chapterNumber = 1
      const el = document.createElement("div")
      component.bookContainer = { nativeElement: el } as unknown as ElementRef

      component.getChapter(2)
      tick()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"], {
        replaceUrl: true,
      })
      expect(el.style.opacity).not.toBe("0")
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        "Sem ligação. Este capítulo ainda não está disponível offline.",
        "OK",
        { duration: 4000 },
      )
    }))

    it("should call scrollToVerseElement in error handler if verseStart provided and book is about", fakeAsync(() => {
      spyOn(console, "error")
      apiServiceSpy.getChapter.and.returnValue(
        throwError(() => new Error("Not found")),
      )
      bookServiceSpy.findBook.and.returnValue(mockBooks[1] as unknown as Book)
      component.book = mockBooks[1] as unknown as Book

      component.getChapter(1, 10)
      tick()
      expect(animationServiceSpy.scrollToVerseElement).toHaveBeenCalled()
    }))
  })
})
