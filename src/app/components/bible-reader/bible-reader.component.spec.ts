import { Location } from "@angular/common"
import {
  ChangeDetectorRef,
  ElementRef,
  NO_ERRORS_SCHEMA,
  PendingTasks,
  PLATFORM_ID,
} from "@angular/core"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import type { MatDrawer } from "@angular/material/sidenav"
import { MatSnackBar } from "@angular/material/snack-bar"
import { By } from "@angular/platform-browser"
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { BehaviorSubject, of, Subject, throwError } from "rxjs"
import type { Mock } from "vitest"
import { PagedNavigationDirective } from "../../directives/paged-navigation/paged-navigation.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BackButtonService } from "../../services/back-button.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import { HapticsService } from "../../services/haptics.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { NativeFootnotesService } from "../../services/native-footnotes.service"
import { NetworkService } from "../../services/network.service"
import { PreferencesService } from "../../services/preferences.service"
import { SeoService } from "../../services/seo.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { BibleReaderComponent } from "./bible-reader.component"

describe("BibleReaderComponent", () => {
  let component: BibleReaderComponent
  let fixture: ComponentFixture<BibleReaderComponent>

  let autoScrollServiceSpy: SpyObj<AutoScrollService>
  let apiServiceSpy: SpyObj<BibleApiService>
  let bookServiceSpy: SpyObj<BookService>
  let preferencesServiceSpy: SpyObj<PreferencesService>
  let routerSpy: SpyObj<Router>
  let hapticsSpy: SpyObj<HapticsService>
  let routeMock: unknown
  let animationServiceSpy: SpyObj<BibleReaderAnimationService>
  let analyticsServiceSpy: SpyObj<AnalyticsService>
  let networkServiceSpy: SpyObj<NetworkService>
  let snackBarSpy: SpyObj<MatSnackBar>
  let seoServiceSpy: SpyObj<SeoService>

  const mockBooks = [
    { id: "gen", name: "Genesis", urlAbrv: "1-genesis", chapterCount: 50 },
    { id: "about", name: "About", urlAbrv: "about", chapterCount: 1 },
  ]
  const mockChapter = { bookId: "gen", number: 1, verses: [] }

  beforeEach(async () => {
    autoScrollServiceSpy = createSpyObj("AutoScrollService", [
      "setAutoScrollLinesPerSecond",
      "stop",
    ])
    apiServiceSpy = createSpyObj("BibleApiService", ["getChapter"])
    bookServiceSpy = createSpyObj("BookService", [
      "findBook",
      "findBookById",
      "getBooks",
      "getUrlAbrv",
      "getChapterUrlSegment",
      "parseChapterUrlSegment",
      "loadGroupIntroBody",
      "retryBooks",
    ])
    // The real BibleReferenceService reads it, for NativeFootnotesService.
    bookServiceSpy.getBooks.mockReturnValue(mockBooks as unknown as Book[])
    bookServiceSpy.books$ = new BehaviorSubject(
      mockBooks,
    ) as unknown as BehaviorSubject<Book[]>
    bookServiceSpy.booksUnavailable$ = of(false)
    bookServiceSpy.retryBooks.mockResolvedValue(undefined)
    preferencesServiceSpy = createSpyObj("PreferencesService", [
      "getAutoScrollSpeed",
      "getViewMode",
      "getAutoScrollControlsVisible",
      "setAutoScrollControlsVisible",
      "setViewMode",
      "getLastBookId",
      "setLastBookId",
      "getLastChapterNumber",
      "setLastChapterNumber",
    ])

    routerSpy = createSpyObj("Router", ["navigate", "currentNavigation"])
    routerSpy.navigate.mockResolvedValue(true)
    routerSpy.currentNavigation.mockReturnValue(null)
    ;(
      routerSpy as unknown as {
        routerState: unknown
      }
    ).routerState = {
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

    animationServiceSpy = createSpyObj("BibleReaderAnimationService", [
      "scrollToTop",
      "triggerSlideAnimation",
      "triggerSlideOutAnimation",
      "scrollToVerseElement",
      "cancelPendingRealign",
    ])
    animationServiceSpy.triggerSlideOutAnimation.mockResolvedValue(undefined)

    analyticsServiceSpy = createSpyObj("AnalyticsService", ["track"])
    analyticsServiceSpy.track.mockResolvedValue(undefined)
    networkServiceSpy = createSpyObj("NetworkService", [
      "ngOnDestroy",
    ]) as SpyObj<NetworkService>
    ;(
      networkServiceSpy as unknown as {
        isOffline: boolean
      }
    ).isOffline = false
    snackBarSpy = createSpyObj("MatSnackBar", ["open"])
    seoServiceSpy = createSpyObj("SeoService", ["updateForChapter"])

    // Default returns
    preferencesServiceSpy.getAutoScrollSpeed.mockReturnValue(50)
    preferencesServiceSpy.getViewMode.mockReturnValue("scrolling")
    preferencesServiceSpy.getAutoScrollControlsVisible.mockReturnValue(false)
    bookServiceSpy.findBook.mockReturnValue(mockBooks[0] as unknown as Book)
    bookServiceSpy.getUrlAbrv.mockReturnValue("1-genesis")
    bookServiceSpy.getChapterUrlSegment.mockImplementation((chapter: number) =>
      chapter === 0 ? "intro" : chapter.toString(),
    )
    bookServiceSpy.parseChapterUrlSegment.mockImplementation(
      (segment: string | null | undefined, fallback = 1) => {
        if (segment == null || segment === "") return fallback
        if (segment === "intro") return 0
        const parsed = Number.parseInt(segment, 10)
        return Number.isFinite(parsed) ? parsed : fallback
      },
    )
    apiServiceSpy.getChapter.mockReturnValue(
      of(mockChapter as unknown as Chapter),
    )

    await setUpTestBed()

    fixture = TestBed.createComponent(BibleReaderComponent)
    component = fixture.componentInstance
  })

  function setUpTestBed(options?: {
    platformId?: string
    imports?: unknown[]
  }): Promise<void> {
    hapticsSpy = createSpyObj("HapticsService", ["light", "success"])
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
        { provide: HapticsService, useValue: hapticsSpy },
        ...(options?.platformId
          ? [{ provide: PLATFORM_ID, useValue: options.platformId }]
          : []),
      ],
    })
      .overrideComponent(BibleReaderComponent, {
        set: {
          schemas: [NO_ERRORS_SCHEMA],
          // Override standalone imports to avoid child dependency issues
          imports: (options?.imports ?? []) as never[],
        },
      })
      .compileComponents()
  }

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("names the book drawer's dismiss button", () => {
    fixture.detectChanges()

    expect(
      fixture.nativeElement
        .querySelector("button.dismiss-button")
        ?.getAttribute("aria-label"),
    ).toBe("Fechar")
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

    // A cold app link: the reader mounts at "/" while the link's navigation
    // waits in chapterExists for the book list, so it arrives in flight.
    it("should leave a navigation still in flight to the reader it opens", () => {
      routerSpy.currentNavigation.mockReturnValue({} as never)
      fixture.detectChanges()

      expect(routerSpy.navigate).not.toHaveBeenCalled()
      expect(apiServiceSpy.getChapter).not.toHaveBeenCalled()
      expect(preferencesServiceSpy.setLastBookId).not.toHaveBeenCalled()
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

    it("should not navigate while server-rendering when the chapter fails to load", async () => {
      TestBed.resetTestingModule()
      await setUpTestBed({ platformId: "server" })
      vi.spyOn(console, "error").mockReturnValue(undefined)
      apiServiceSpy.getChapter.mockReturnValue(
        throwError(() => new Error("API unavailable")),
      )
      TestBed.createComponent(BibleReaderComponent).detectChanges()

      expect(routerSpy.navigate).not.toHaveBeenCalled()
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

    describe("a link to a verse's notes", () => {
      const verse = (number: number, notes: string[] = []) =>
        ({
          bookId: "gen",
          chapterNumber: 1,
          number,
          verseLabel: `${number}`,
          text: [
            { type: "text", text: "Texto" },
            ...notes.map((text) => ({
              type: "footnote",
              text,
              reference: `${number}.`,
            })),
          ],
        }) as Verse
      const chapter = {
        bookId: "gen",
        number: 1,
        verses: [
          verse(1),
          verse(2, ["Nota do 2"]),
          verse(3),
          verse(4, ["Nota"]),
        ],
      } as Chapter

      function follow(notes: string) {
        fixture.detectChanges()
        component.chapter = chapter
        const sheet = vi
          .spyOn(TestBed.inject(MatBottomSheet), "open")
          .mockReturnValue({
            afterDismissed: () => of(undefined),
            dismiss: () => {},
          } as never)
        const replaceState = vi.spyOn(TestBed.inject(Location), "replaceState")
        vi.spyOn(TestBed.inject(Location), "path").mockReturnValue(
          `/gn/1?verseStart=2&notes=${notes}`,
        )
        ;(
          routeMock as unknown as {
            queryParamMap: BehaviorSubject<Map<string, string>>
          }
        ).queryParamMap.next(new Map([["notes", notes]]))
        return { sheet, replaceState }
      }

      /** What a chapter's arrival does, once it has rendered. */
      const openPending = () =>
        (component as unknown as { openLinkedNotes(): void }).openLinkedNotes()

      it("opens that verse's notes", () => {
        const { sheet } = follow("2")

        expect(sheet).toHaveBeenCalledTimes(1)
        const data = sheet.mock.lastCall?.[1]?.data as {
          verse: Verse
          footnotes: { text: string }[]
        }
        expect(data.verse.number).toBe(2)
        expect(data.footnotes.map((note) => note.text)).toEqual(["Nota do 2"])
      })

      it("takes the first verse with notes in a range", () => {
        const { sheet } = follow("3-4")

        const data = sheet.mock.lastCall?.[1]?.data as { verse: Verse }
        expect(data.verse.number).toBe(4)
      })

      it("opens nothing for a verse without notes", () => {
        const { sheet } = follow("1")

        expect(sheet).not.toHaveBeenCalled()
      })

      it("ignores a parameter that makes no sense", () => {
        const { sheet } = follow("x")

        expect(sheet).not.toHaveBeenCalled()
      })

      it("takes it off the address, keeping the rest, so it opens once", () => {
        const { sheet, replaceState } = follow("2")

        expect(replaceState.mock.lastCall?.[0]).toBe("/gn/1?verseStart=2")
        ;(
          routeMock as unknown as {
            queryParamMap: BehaviorSubject<Map<string, string>>
          }
        ).queryParamMap.next(new Map())
        expect(sheet).toHaveBeenCalledTimes(1)
      })

      it("closes them when the reader is left, as by the toast's way back", () => {
        const dismiss = vi.fn()
        vi.spyOn(TestBed.inject(MatBottomSheet), "open").mockReturnValue({
          afterDismissed: () => of(undefined),
          dismiss,
        } as never)
        fixture.detectChanges()
        component.chapter = chapter
        ;(
          routeMock as unknown as {
            queryParamMap: BehaviorSubject<Map<string, string>>
          }
        ).queryParamMap.next(new Map([["notes", "2"]]))
        expect(dismiss).not.toHaveBeenCalled()

        fixture.destroy()

        expect(dismiss).toHaveBeenCalled()
      })

      it("opens them natively in the native apps", () => {
        const native = TestBed.inject(NativeFootnotesService)
        vi.spyOn(native, "enabled", "get").mockReturnValue(true)
        const open = vi.spyOn(native, "open").mockImplementation(() => {})

        const { sheet } = follow("2")

        expect(sheet).not.toHaveBeenCalled()
        expect(open).toHaveBeenCalledTimes(1)
        const [footnotes, opened] = open.mock.lastCall ?? []
        expect(opened?.number).toBe(2)
        expect(footnotes?.map((note) => note.text)).toEqual(["Nota do 2"])
      })

      it("forgets them when their chapter fails to load", () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const sheet = vi
          .spyOn(TestBed.inject(MatBottomSheet), "open")
          .mockReturnValue({
            afterDismissed: () => of(undefined),
            dismiss: () => {},
          } as never)
        const queryParamMap = (
          routeMock as unknown as {
            queryParamMap: BehaviorSubject<Map<string, string>>
          }
        ).queryParamMap
        fixture.detectChanges()
        component.chapter = { bookId: "gen", number: 9 } as Chapter
        queryParamMap.next(new Map([["notes", "2"]]))

        ;(
          component as unknown as {
            handleChapterLoadFailure(error: unknown): void
          }
        ).handleChapterLoadFailure(new Error("offline"))
        component.chapter = chapter
        openPending()

        expect(sheet).not.toHaveBeenCalled()
      })

      it("forgets them when the reader moves on without them", () => {
        const sheet = vi
          .spyOn(TestBed.inject(MatBottomSheet), "open")
          .mockReturnValue({
            afterDismissed: () => of(undefined),
            dismiss: () => {},
          } as never)
        const queryParamMap = (
          routeMock as unknown as {
            queryParamMap: BehaviorSubject<Map<string, string>>
          }
        ).queryParamMap
        fixture.detectChanges()
        component.chapter = { bookId: "gen", number: 9 } as Chapter
        queryParamMap.next(new Map([["notes", "2"]]))
        queryParamMap.next(new Map())

        component.chapter = chapter
        openPending()

        expect(sheet).not.toHaveBeenCalled()
      })

      it("waits for the chapter to arrive", () => {
        const sheet = vi
          .spyOn(TestBed.inject(MatBottomSheet), "open")
          .mockReturnValue({
            afterDismissed: () => of(undefined),
            dismiss: () => {},
          } as never)
        fixture.detectChanges()
        component.chapter = { bookId: "gen", number: 9 } as Chapter
        ;(
          routeMock as unknown as {
            queryParamMap: BehaviorSubject<Map<string, string>>
          }
        ).queryParamMap.next(new Map([["notes", "2"]]))

        expect(sheet).not.toHaveBeenCalled()
      })
    })

    it("should not call getChapter if book and chapter didn't change on route update", () => {
      fixture.detectChanges() // Sets up initial sub
      apiServiceSpy.getChapter.mockClear()
      ;(
        routeMock as {
          queryParamMap: BehaviorSubject<Map<string, string>>
        }
      ).queryParamMap.next(new Map([["verseStart", "2"]]))

      expect(apiServiceSpy.getChapter).not.toHaveBeenCalled()
      expect(animationServiceSpy.scrollToVerseElement).toHaveBeenCalled()
    })
  })

  describe("when the book list cannot be loaded", () => {
    let unavailable$: BehaviorSubject<boolean>

    beforeEach(() => {
      // Nothing cached and the load failed: books$ never emits.
      bookServiceSpy.books$ = new Subject<Book[]>()
      unavailable$ = new BehaviorSubject(true)
      bookServiceSpy.booksUnavailable$ = unavailable$
      fixture.detectChanges()
    })

    const emptyState = (): HTMLElement | null =>
      fixture.nativeElement.querySelector(".books-unavailable")

    it("shows an empty state with a retry instead of a blank page", () => {
      expect(component.book).toBeFalsy()
      expect(emptyState()?.getAttribute("role")).toBe("alert")
      expect(emptyState()?.textContent).toContain("Tentar novamente")
    })

    it("retries loading the books from the empty state", async () => {
      emptyState()?.querySelector("button")?.click()
      await fixture.whenStable()

      expect(bookServiceSpy.retryBooks).toHaveBeenCalled()
      expect(component.retryingBooks).toBe(false)
    })

    it("hides the empty state once the books are available again", () => {
      unavailable$.next(false)
      fixture.detectChanges()

      expect(emptyState()).toBeNull()
    })
  })

  describe("Navigation (Swipe / Arrow Keys / Methods)", () => {
    beforeEach(() => {
      fixture.detectChanges()
      component.book = mockBooks[0] as unknown as Book
      component.chapterNumber = 1
      routerSpy.navigate.mockClear()
    })

    /** The chapter stepped to has loaded (applyChapter clears the slide). */
    const land = () => {
      component.isNavigatingForwards = false
      component.isNavigatingBackwards = false
    }

    it("goToNextChapter should navigate forward and stop scroll", () => {
      component.goToNextChapter()
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBe(true)
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "2"])
    })

    it("goToPreviousChapter should navigate backwards and stop scroll", () => {
      component.chapterNumber = 2
      component.goToPreviousChapter()
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingBackwards).toBe(true)
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])
    })

    it("replaces the history entry for chapter steps in the native apps", () => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
      component.chapterNumber = 2
      component.goToNextChapter()
      land()
      component.goToPreviousChapter()

      expect(vi.mocked(routerSpy.navigate).mock.calls).toEqual([
        [["/", "1-genesis", "3"], { replaceUrl: true }],
        [["/", "1-genesis", "1"], { replaceUrl: true }],
      ])
    })

    for (const [platform, native] of [
      ["native apps", true],
      ["web", false],
    ] as const) {
      it(`sets replaceUrl=${native} on the prev/next anchors on the ${platform}`, async () => {
        TestBed.resetTestingModule()
        await setUpTestBed({ imports: [RouterLink] })
        vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native)
        const linkFixture = TestBed.createComponent(BibleReaderComponent)
        linkFixture.detectChanges()
        linkFixture.componentInstance.getChapter(5)
        await linkFixture.whenStable()
        linkFixture.componentRef.changeDetectorRef.markForCheck()
        linkFixture.detectChanges()

        const links = linkFixture.debugElement.queryAll(
          By.css("a.floating-nav-button"),
        )
        expect(links.length).toBeGreaterThan(0)
        for (const link of links) {
          expect(link.injector.get(RouterLink).replaceUrl).toBe(native)
        }
      })
    }

    it("closes the open book drawer on the Android back button", () => {
      const drawer = createSpyObj<MatDrawer>("MatDrawer", ["close"], {
        opened: true,
      })
      component.bookDrawer = drawer

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBe(true)
      expect(drawer.close).toHaveBeenCalled()
    })

    it("leaves the back button alone when the drawer is closed", () => {
      component.bookDrawer = createSpyObj<MatDrawer>("MatDrawer", ["close"], {
        opened: false,
      })

      expect(TestBed.inject(BackButtonService).closeTopmost()).toBe(false)
    })

    it("gives light haptic feedback when turning to another chapter", () => {
      component.chapterNumber = 2
      component.goToNextChapter()
      land()
      component.goToPreviousChapter()
      expect(hapticsSpy.light).toHaveBeenCalledTimes(2)
    })

    // A second swipe during the slide asked for the chapter already on its
    // way: nothing happened, but it buzzed.
    it("takes no second step, and gives no buzz, while a chapter is on its way", () => {
      component.goToNextChapter()
      component.goToNextChapter()
      component.goToPreviousChapter()

      expect(routerSpy.navigate).toHaveBeenCalledTimes(1)
      expect(hapticsSpy.light).toHaveBeenCalledTimes(1)
    })

    it("steps again when the navigation came to nothing", async () => {
      routerSpy.navigate.mockResolvedValue(false)
      component.goToNextChapter()
      await Promise.resolve()

      component.goToNextChapter()
      expect(routerSpy.navigate).toHaveBeenCalledTimes(2)
    })

    it("moves the page with the finger in paged mode", () => {
      component.viewMode = "paged"
      component.pagedNav = createSpyObj("PagedNavigationDirective", [
        "dragBy",
        "cancelDrag",
      ]) as unknown as PagedNavigationDirective

      component.onSwipeMove(-40)
      component.onSwipeCancel()

      expect(component.pagedNav?.dragBy).toHaveBeenCalledWith(-40)
      expect(component.pagedNav?.cancelDrag).toHaveBeenCalled()
    })

    it("moves nothing with the finger while scrolling", () => {
      component.viewMode = "scrolling"
      component.pagedNav = createSpyObj("PagedNavigationDirective", [
        "dragBy",
      ]) as unknown as PagedNavigationDirective

      component.onSwipeMove(-40)

      expect(component.pagedNav?.dragBy).not.toHaveBeenCalled()
    })

    it("gives no haptic feedback at either end of the book", () => {
      component.chapterNumber = 1
      component.goToPreviousChapter()
      component.chapterNumber = 50
      component.goToNextChapter()
      expect(hapticsSpy.light).not.toHaveBeenCalled()
      expect(routerSpy.navigate).not.toHaveBeenCalled()
    })

    // The links are rebuilt when the reader lands on a chapter, so these go
    // through getChapter rather than setting chapterNumber by hand.
    const introBook = (): Book => ({
      ...(mockBooks[0] as unknown as Book),
      introduction: [{ type: "introParagraph", text: "intro" }],
    })

    it("exposes router link arrays for the prev/next chapter anchors", async () => {
      vi.useFakeTimers()
      component.getChapter(5)
      await vi.advanceTimersByTimeAsync(0)

      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "4"])
      expect(component.nextChapterLink).toEqual(["/", "1-genesis", "6"])
    })

    // RouterLink diffs its input by reference, so a getter returning a fresh
    // array would rebuild both hrefs on every change detection pass — one per
    // animation frame while auto-scroll runs.
    it("keeps the same link arrays across change detection", async () => {
      vi.useFakeTimers()
      component.getChapter(5)
      await vi.advanceTimersByTimeAsync(0)
      const previous = component.previousChapterLink
      const next = component.nextChapterLink

      fixture.detectChanges()

      expect(component.previousChapterLink).toBe(previous)
      expect(component.nextChapterLink).toBe(next)
    })

    it("uses the intro segment when the previous chapter is the introduction", async () => {
      vi.useFakeTimers()
      component.book = introBook()
      component.getChapter(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "intro"])
    })

    it("clamps the prev/next links at the book boundaries", async () => {
      vi.useFakeTimers()
      // First chapter of a book without an introduction: must not offer /0
      // or /intro, which this book does not have.
      component.getChapter(1)
      await vi.advanceTimersByTimeAsync(0)
      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "1"])

      // Last chapter: must not point past the end of the book.
      component.getChapter(50)
      await vi.advanceTimersByTimeAsync(0)
      expect(component.nextChapterLink).toEqual(["/", "1-genesis", "50"])
    })

    it("never links below the introduction on an intro book", async () => {
      vi.useFakeTimers()
      component.book = introBook()
      component.getChapter(0)
      await vi.advanceTimersByTimeAsync(0)

      // /-1 must never be produced from the introduction.
      expect(component.previousChapterLink).toEqual(["/", "1-genesis", "intro"])
    })

    it("does not arm a slide transition past the book boundaries", () => {
      component.chapterNumber = 1
      component.isNavigatingBackwards = false
      autoScrollServiceSpy.stop.mockClear()

      component.prepareChapterNavigation(false)

      expect(component.isNavigatingBackwards).toBe(false)
      expect(autoScrollServiceSpy.stop).not.toHaveBeenCalled()

      component.chapterNumber = 50
      component.prepareChapterNavigation(true)

      expect(component.isNavigatingForwards).toBe(false)
    })

    it("prepareChapterNavigation stops auto-scroll and sets the slide direction", () => {
      // Mid-book, so both directions stay inside the book's bounds.
      component.chapterNumber = 5
      component.prepareChapterNavigation(true)
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBe(true)
      expect(component.isNavigatingBackwards).toBe(false)

      component.prepareChapterNavigation(false)
      expect(component.isNavigatingBackwards).toBe(true)
      // The opposite direction has to be cleared, or a chapter that loads
      // later slides the wrong way.
      expect(component.isNavigatingForwards).toBe(false)
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
      expect(component.isNavigatingForwards).toBe(false)
      expect(component.isNavigatingBackwards).toBe(false)

      component.prepareChapterNavigation(true, new MouseEvent("click"))
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBe(true)
    })

    it("renders prev/next as anchors (crawlable links) in scrolling mode", () => {
      const element = fixture.nativeElement as HTMLElement
      // Initial chapter is 1: only the next-chapter link should exist.
      expect(element.querySelector("a.next-chapter")).toBeTruthy()
      expect(element.querySelector("button.next-chapter")).toBeFalsy()
      expect(element.querySelector("a.prev-chapter")).toBeFalsy()

      component.chapter = { bookId: "gen", number: 2 } as Chapter
      component.chapterNumber = 2
      ;(
        component as unknown as {
          cdr: ChangeDetectorRef
        }
      ).cdr.markForCheck()
      fixture.detectChanges()

      expect(element.querySelector("a.prev-chapter")).toBeTruthy()
      expect(element.querySelector("button.prev-chapter")).toBeFalsy()
    })

    // Before, 40 px and 16 px from the edges, where Android's back gesture starts.
    it("sizes the chapter arrows for a finger, clear of the screen edges", () => {
      const next = (fixture.nativeElement as HTMLElement).querySelector(
        "a.next-chapter",
      ) as HTMLElement
      const box = next.getBoundingClientRect()
      expect(box.width).toBe(48)
      expect(box.height).toBe(48)
      expect(window.innerWidth - box.right).toBeGreaterThanOrEqual(24)
    })

    it("renders prev/next as buttons in paged mode", () => {
      component.viewMode = "paged"
      component.chapter = { bookId: "gen", number: 2 } as Chapter
      component.chapterNumber = 2
      ;(
        component as unknown as {
          cdr: ChangeDetectorRef
        }
      ).cdr.markForCheck()
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
      ;(
        component as unknown as {
          cdr: ChangeDetectorRef
        }
      ).cdr.markForCheck()
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
      const cdrSpy = vi
        .spyOn(
          (
            component as unknown as {
              cdr: ChangeDetectorRef
            }
          ).cdr,
          "markForCheck",
        )
        .mockReturnValue(undefined)

      component.isFirstPage = true
      component.isLastPage = false

      component.onPageStateChange({ isFirstPage: true, isLastPage: false })
      expect(cdrSpy).not.toHaveBeenCalled()

      component.onPageStateChange({ isFirstPage: false, isLastPage: true })
      expect(component.isFirstPage).toBe(false)
      expect(component.isLastPage).toBe(true)
      expect(cdrSpy).toHaveBeenCalled()
    })

    it("should increase and decrease font size via gestures directive", () => {
      component.gestures = createSpyObj("UnifiedGesturesDirective", [
        "increaseFontSize",
        "decreaseFontSize",
      ])
      component.onIncreaseFontSize()
      expect(component.gestures.increaseFontSize).toHaveBeenCalled()

      component.onDecreaseFontSize()
      expect(component.gestures.decreaseFontSize).toHaveBeenCalled()
    })

    // The Android text sheet steps by its own 10.
    it("passes the text sheet's step and reset on to the gestures directive", () => {
      component.gestures = createSpyObj("UnifiedGesturesDirective", [
        "increaseFontSize",
        "decreaseFontSize",
        "resetFontSize",
      ])
      component.onIncreaseFontSize(10)
      expect(component.gestures.increaseFontSize).toHaveBeenCalledWith(10)

      component.onDecreaseFontSize(10)
      expect(component.gestures.decreaseFontSize).toHaveBeenCalledWith(10)

      component.onResetFontSize()
      expect(component.gestures.resetFontSize).toHaveBeenCalled()
    })

    it("keeps the text's size for the header", () => {
      const size = { percent: 120, min: 70, max: 235, canReset: true }
      component.onTextSizeChange(size)
      expect(component.textSize).toEqual(size)
    })

    // "Livro seguinte" is a link: auto-scroll stops when it is followed here,
    // not when it is opened in a new tab.
    it("stops auto-scroll for a plain click on the next book's card only", () => {
      autoScrollServiceSpy.stop.mockClear()
      component.prepareBookNavigation(
        new MouseEvent("click", { button: 0, ctrlKey: true }),
      )
      expect(autoScrollServiceSpy.stop).not.toHaveBeenCalled()

      component.prepareBookNavigation(new MouseEvent("click", { button: 0 }))
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
    })

    describe("checkIfNextVerseStartsWithQuote", () => {
      it("should return false if chapter or verses missing", () => {
        component.chapter = undefined as unknown as Chapter
        expect(component.checkIfNextVerseStartsWithQuote(0)).toBe(false)

        component.chapter = { verses: [] } as unknown as Chapter
        expect(component.checkIfNextVerseStartsWithQuote(0)).toBe(false)
      })

      it("should check if the next verse starts with a quote", () => {
        component.chapter = {
          verses: [
            { number: 1, text: [{ type: "text" }] },
            { number: 2, text: [{ type: "footnote" }, { type: "quote" }] },
          ],
        } as unknown as Chapter

        expect(component.checkIfNextVerseStartsWithQuote(0)).toBe(true)
      })

      it("should return false if next verse has no displayable text", () => {
        component.chapter = {
          verses: [
            { number: 1, text: [{ type: "text" }] },
            { number: 2, text: [{ type: "footnote" }] },
          ],
        } as unknown as Chapter

        expect(component.checkIfNextVerseStartsWithQuote(0)).toBe(false)
      })
    })
    it("onSwipeLeft should go to next chapter if scrolling mode", () => {
      component.viewMode = "scrolling"
      component.onSwipeLeft()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "2"])
    })

    it("onSwipeLeft should go to next page if paged mode", () => {
      component.viewMode = "paged"
      component.pagedNav = createSpyObj("PagedNavigationDirective", [
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
      component.pagedNav = createSpyObj("PagedNavigationDirective", [
        "prevPage",
      ]) as unknown as PagedNavigationDirective
      component.onSwipeRight()
      expect(component.pagedNav?.prevPage).toHaveBeenCalled()
    })

    it("onArrowPress should handle arrow directions", () => {
      component.chapterNumber = 2
      component.onArrowPress(new KeyboardEvent("keydown", { key: "ArrowLeft" }))
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])

      land()
      routerSpy.navigate.mockClear()
      component.onArrowPress(
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      )
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "3"])
    })

    // The shortcut fired from anywhere: ← in the book filter changed the
    // chapter, and so did the arrows under an open sheet or with Alt held.
    describe("arrow keys", () => {
      const press = (init: KeyboardEventInit, target: EventTarget = window) => {
        const event = new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          ...init,
        })
        target.dispatchEvent(event)
        return event
      }
      const added: HTMLElement[] = []
      const attach = <T extends HTMLElement>(element: T): T => {
        document.body.appendChild(element)
        added.push(element)
        return element
      }

      beforeEach(() => {
        component.chapterNumber = 2
        routerSpy.navigate.mockClear()
      })

      afterEach(() => {
        for (const element of added.splice(0)) element.remove()
      })

      it("turn the chapter from the page", () => {
        press({}, attach(document.createElement("div")))
        expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "3"])
      })

      it("leave a text field's caret alone", () => {
        for (const tag of ["input", "textarea"]) {
          press({ key: "ArrowLeft" }, attach(document.createElement(tag)))
        }
        expect(routerSpy.navigate).not.toHaveBeenCalled()
      })

      it("leave the browser's and the system's shortcuts alone", () => {
        for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
          press({ key: "ArrowLeft", [modifier]: true })
        }
        expect(routerSpy.navigate).not.toHaveBeenCalled()
      })

      it("don't turn the chapter under an open menu, sheet or dialog", () => {
        const overlay = attach(document.createElement("div"))
        overlay.className = "cdk-overlay-container"
        const sheetButton = overlay.appendChild(
          document.createElement("button"),
        )
        press({}, sheetButton)
        expect(routerSpy.navigate).not.toHaveBeenCalled()

        // Focus left on the page behind a modal backdrop.
        const backdrop = overlay.appendChild(document.createElement("div"))
        backdrop.className = "cdk-overlay-backdrop cdk-overlay-backdrop-showing"
        press({}, attach(document.createElement("div")))
        expect(routerSpy.navigate).not.toHaveBeenCalled()
      })

      // A closed menu or sheet leaves its backdrop in the page while it fades
      // out, without -showing: an arrow pressed then did nothing.
      it("turn the chapter while a closed overlay's backdrop fades out", () => {
        const overlay = attach(document.createElement("div"))
        overlay.className = "cdk-overlay-container"
        const backdrop = overlay.appendChild(document.createElement("div"))
        backdrop.className = "cdk-overlay-backdrop"

        press({}, attach(document.createElement("div")))

        expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "3"])
      })

      it("don't turn the chapter while the book drawer is open", () => {
        component.bookDrawer = createSpyObj<MatDrawer>("MatDrawer", ["close"], {
          opened: true,
        })
        press({})
        expect(routerSpy.navigate).not.toHaveBeenCalled()
      })
    })
  })

  // The app draws edge-to-edge, but nothing may sit behind the navigation
  // bar: the reader ends at its top and the page background shows behind it.
  describe("bottom system inset", () => {
    function render(viewMode: "scrolling" | "paged"): HTMLElement {
      // ngOnInit restores the saved view mode; set ours after it.
      fixture.detectChanges()
      component.viewMode = viewMode
      component.chapter = { bookId: "gen", number: 2 } as Chapter
      component.chapterNumber = 2
      ;(
        component as unknown as {
          cdr: ChangeDetectorRef
        }
      ).cdr.markForCheck()
      fixture.detectChanges()
      return fixture.nativeElement as HTMLElement
    }

    // Paged, browsers cut off the verse numbers hanging left of a line of
    // poetry: the side margin was outside the columns, which clip what
    // overflows them.
    describe("pages", () => {
      // The specs run in the test runner's frame: its width is the viewport the
      // reader's media queries see.
      const frame = window.frameElement as HTMLElement | null
      let width = ""

      beforeEach(() => {
        width = frame?.style.width ?? ""
      })

      afterEach(() => {
        if (frame) frame.style.width = width
      })

      function pagedAt(px: number) {
        expect(frame, "the specs run in a frame").toBeTruthy()
        if (frame) frame.style.width = `${px}px`
        const host = render("paged")
        const style = (selector: string) =>
          getComputedStyle(host.querySelector(selector) as HTMLElement)
        return {
          view: style(".paged-view"),
          chapter: style(".chapterBlock"),
        }
      }

      it("keep a phone's side margin inside each page", () => {
        const { view, chapter } = pagedAt(390)

        expect(chapter.paddingLeft).toBe("20px")
        expect(chapter.paddingRight).toBe("20px")
        // Nothing outside the columns, so a page advances by its width.
        expect(view.paddingLeft).toBe("0px")
        expect(view.columnGap).toBe("0px")
      })

      // A phone opens ragged-right; the menus' Justificado has to win over it.
      it("set a phone's text ragged-right until justified is chosen", () => {
        expect(frame, "the specs run in a frame").toBeTruthy()
        if (frame) frame.style.width = "390px"
        const block = render("scrolling").querySelector(
          ".bookBlock",
        ) as HTMLElement
        expect(getComputedStyle(block).textAlign).toBe("start")

        document.documentElement.classList.add("justified-text")
        try {
          expect(getComputedStyle(block).textAlign).toBe("justify")
        } finally {
          document.documentElement.classList.remove("justified-text")
        }
      })

      it("give scrolling text the same side margin as a page", () => {
        expect(frame, "the specs run in a frame").toBeTruthy()
        if (frame) frame.style.width = "390px"
        const block = render("scrolling").querySelector(
          ".bookBlock",
        ) as HTMLElement
        expect(getComputedStyle(block).marginLeft).toBe("20px")
        expect(getComputedStyle(block).marginRight).toBe("20px")
      })

      it("keep a tablet's margins inside each of its two columns", () => {
        const { view, chapter } = pagedAt(1024)

        // 2vw a side: 4vw between the columns, as the gap was.
        expect(parseFloat(chapter.paddingLeft)).toBeCloseTo(1024 * 0.02, 0)
        expect(view.paddingLeft).toBe("0px")
        expect(view.columnGap).toBe("0px")
      })
    })

    // At 310% a justified line of a few words spread into wide gaps.
    it("sets the text ragged-right at the largest sizes", () => {
      const host = render("scrolling")
      const container = host.querySelector(".text-container") as HTMLElement
      const block = host.querySelector(".bookBlock") as HTMLElement
      expect(getComputedStyle(block).textAlign).toBe("justify")

      container.classList.add("large-text")
      expect(getComputedStyle(block).textAlign).toBe("start")
    })

    // The menu said Justificado while the largest sizes stayed ragged-right.
    it("keeps an explicit justified choice at the largest sizes", () => {
      const host = render("scrolling")
      const container = host.querySelector(".text-container") as HTMLElement
      const block = host.querySelector(".bookBlock") as HTMLElement
      container.classList.add("large-text")

      document.documentElement.classList.add("justified-text")
      try {
        expect(getComputedStyle(block).textAlign).toBe("justify")
      } finally {
        document.documentElement.classList.remove("justified-text")
      }
    })

    // The reader's choice in the menu (TextAlignService), over the default.
    it("sets the text ragged-right and unhyphenated when chosen", () => {
      const block = render("scrolling").querySelector(
        ".bookBlock",
      ) as HTMLElement
      expect(getComputedStyle(block).hyphens).toBe("auto")

      document.documentElement.classList.add("ragged-text")
      try {
        expect(getComputedStyle(block).textAlign).toBe("start")
        expect(getComputedStyle(block).hyphens).toBe("manual")
      } finally {
        document.documentElement.classList.remove("ragged-text")
      }
    })

    function heightWithInset(element: HTMLElement, inset: string): number {
      ;(fixture.nativeElement as HTMLElement).style.setProperty(
        "--app-inset-bottom",
        inset,
      )
      return element.getBoundingClientRect().height
    }

    it("ends the reader at the top of the navigation bar", () => {
      const container = render("scrolling").querySelector(
        ".bookSelectorContainer",
      ) as HTMLElement
      // NO_ERRORS_SCHEMA leaves mat-drawer-container an unknown inline
      // element, which ignores height.
      container.style.display = "block"

      expect(
        heightWithInset(container, "0px") - heightWithInset(container, "100px"),
      ).toBeCloseTo(100, 0)
    })

    // Pages don't scroll: their text must end above the bar, where the
    // fixed footer sits.
    it("ends the pages above the navigation bar", () => {
      const pages = render("paged").querySelector(
        ".paged-view-container",
      ) as HTMLElement
      expect(pages).toBeTruthy()

      expect(
        heightWithInset(pages, "0px") - heightWithInset(pages, "100px"),
      ).toBeCloseTo(100, 0)
    })

    // The folded iPhone Duo's status bar runs down its right side: centred
    // on the whole screen, the copyright notice ran under it, cut off.
    it("keeps the pages' footer between the side insets", () => {
      const host = render("paged")
      host.style.setProperty("--app-inset-left", "10px")
      host.style.setProperty("--app-inset-right", "84px")
      const footer = host.querySelector(".fixed-footer") as HTMLElement
      expect(footer).toBeTruthy()

      const box = footer.getBoundingClientRect()
      expect(box.left).toBeCloseTo(10, 0)
      expect(box.right).toBeCloseTo(
        document.documentElement.clientWidth - 84,
        0,
      )
    })
  })

  describe("Drawer Actions", () => {
    beforeEach(() => {
      fixture.detectChanges()
      component.bookDrawer = createSpyObj("MatDrawer", ["close", "toggle"])
      ;(component.bookDrawer.toggle as Mock).mockResolvedValue(undefined)
      ;(component.bookDrawer.close as Mock).mockResolvedValue(undefined)
    })

    it("openBookDrawer should toggle drawer", async () => {
      vi.useFakeTimers()
      component.openBookDrawer({ open: true })
      await vi.advanceTimersByTimeAsync(0)
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
    })

    it("openChapterDrawer should open drawer with chapter mode", async () => {
      vi.useFakeTimers()
      component.showBooks = true
      component.openChapterDrawer({ open: true })
      await vi.advanceTimersByTimeAsync(0)
      expect(component.bookDrawer.close).toHaveBeenCalled()
      expect(component.showBooks).toBe(false)
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
    })

    it("openChapterDrawer should just toggle drawer when showBooks is false", async () => {
      vi.useFakeTimers()
      component.showBooks = false
      component.openChapterDrawer({ open: true })
      await vi.advanceTimersByTimeAsync(0)
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
      expect(component.bookDrawer.close).not.toHaveBeenCalled()
    })

    it("onBookSubmit should navigate to book and close drawer", () => {
      component.onBookSubmit({ bookId: "gen" })
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])
      expect(component.bookDrawer.close).toHaveBeenCalled()
    })

    // Picking a book while auto-scroll played opened it partway down, still
    // scrolling; picking a chapter already stopped it.
    it("stops auto-scroll when another book is picked", () => {
      autoScrollServiceSpy.stop.mockClear()
      component.onBookSubmit({ bookId: "gen" })
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()

      autoScrollServiceSpy.stop.mockClear()
      component.goToPassage({ bookId: "gen", chapter: 3 })
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
    })

    it("opens the pastoral index from the book list, in its own page", () => {
      component.goToPassage({ bookId: "indice" })

      expect(routerSpy.navigate).toHaveBeenCalledWith(["/indice"])
    })

    it("onBookSubmit opens chapter 1 even when the book has an introduction", () => {
      bookServiceSpy.findBook.mockReturnValue({
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

    it("should close and reopen drawer when showBooks is false for openBookDrawer", async () => {
      vi.useFakeTimers()
      component.showBooks = false
      component.openBookDrawer({ open: true })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(component.bookDrawer.close).toHaveBeenCalled()
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
      expect(component.showBooks).toBe(true)
    })

    it("should close and reopen drawer when showBooks is true for openChapterDrawer", async () => {
      vi.useFakeTimers()
      component.showBooks = true
      component.openChapterDrawer({ open: true })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(component.bookDrawer.close).toHaveBeenCalled()
      expect(component.bookDrawer.toggle).toHaveBeenCalled()
      expect(component.showBooks).toBe(false)
    })

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
      expect(component.showAutoScrollControls).toBe(true)
      expect(
        preferencesServiceSpy.setAutoScrollControlsVisible,
      ).toHaveBeenCalledWith(true)
    })

    it("onToggleViewMode should toggle mode and save state", () => {
      component.viewMode = "scrolling"
      component.onToggleViewMode()
      expect(component.viewMode).toBe("paged")
      expect(preferencesServiceSpy.setViewMode).toHaveBeenCalledWith("paged")
      expect(component.showAutoScrollControls).toBe(false)
    })

    it("onToggleViewMode should switch back to scrolling mode", async () => {
      vi.useFakeTimers()
      component.viewMode = "paged"
      component.onToggleViewMode()
      expect(component.viewMode).toBe("scrolling")
      expect(preferencesServiceSpy.setViewMode).toHaveBeenCalledWith(
        "scrolling",
      )
    })
  })

  describe("introduction route on books without intro", () => {
    it("should normalize chapter 0 to chapter 1 and load it", () => {
      component.book = mockBooks[0] as unknown as Book
      apiServiceSpy.getChapter.mockClear()
      routerSpy.navigate.mockClear()

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
      apiServiceSpy.getChapter.mockClear()
      routerSpy.navigate.mockClear()
      ;(bookServiceSpy.books$ as unknown as BehaviorSubject<Book[]>).next([
        ...(mockBooks as unknown as Book[]),
      ])

      expect(apiServiceSpy.getChapter).not.toHaveBeenCalled()
      expect(routerSpy.navigate).not.toHaveBeenCalled()
    })

    it("applies a lazily loaded introduction once on in-app navigation", async () => {
      // BookService pushes a new book list as the body arrives. Routing used
      // to re-run on that emission, while chapterNumber still named the
      // previous chapter, and applied the introduction a second time.
      const samuel = {
        id: "1sa",
        name: "1 Samuel",
        shortName: "1 Samuel",
        abrv: "1 Sm",
        chapterCount: 31,
        sharedIntroSlug: "samuel",
        introduction: [],
      } as unknown as Book
      const loaded = {
        ...samuel,
        introduction: [{ type: "introParagraph", text: "Texto" }],
      } as unknown as Book
      fixture.detectChanges()
      component.bookDrawer = createSpyObj("MatDrawer", ["close"])
      seoServiceSpy.updateForChapter.mockClear()

      bookServiceSpy.findBook.mockReturnValue(samuel)
      bookServiceSpy.loadGroupIntroBody.mockImplementation(async () => {
        bookServiceSpy.findBook.mockReturnValue(loaded)
        ;(bookServiceSpy.books$ as unknown as BehaviorSubject<Book[]>).next([
          loaded,
        ])
        return loaded
      })
      ;(
        routeMock as {
          paramMap: BehaviorSubject<Map<string, string>>
        }
      ).paramMap.next(
        new Map([
          ["book", "1sm"],
          ["chapter", "intro"],
        ]),
      )
      await fixture.whenStable()

      expect(seoServiceSpy.updateForChapter).toHaveBeenCalledTimes(1)
      expect(component.chapterNumber).toBe(0)
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
      bookServiceSpy.loadGroupIntroBody.mockReturnValue(
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

    it("stays on the shown chapter when an introduction body fails to load", async () => {
      // Tapping "previous" on chapter 1 of a shared-introduction book while
      // offline: the slide direction used to stay set, so the next chapter
      // opened at the bottom, and the URL stayed on /intro.
      vi.spyOn(console, "error").mockReturnValue(undefined)
      fixture.detectChanges()
      routerSpy.navigate.mockClear()
      component.book = {
        id: "1sa",
        name: "1 Samuel",
        shortName: "1 Samuel",
        abrv: "1 Sm",
        chapterCount: 31,
        sharedIntroSlug: "samuel",
        introduction: [],
      } as unknown as Book
      component.chapterNumber = 1
      component.isNavigatingBackwards = true
      bookServiceSpy.loadGroupIntroBody.mockRejectedValue(new Error("offline"))

      component.getChapter(0)
      await fixture.whenStable()

      expect(component.isNavigatingBackwards).toBe(false)
      expect(snackBarSpy.open).toHaveBeenCalled()
      expect(routerSpy.navigate).toHaveBeenCalledWith(
        ["/", expect.anything(), "1"],
        { replaceUrl: true },
      )
    })

    it("renders the About page without asking the API for it", () => {
      component.book = mockBooks[1] as unknown as Book
      apiServiceSpy.getChapter.mockClear()

      component.getChapter(1)

      expect(apiServiceSpy.getChapter).not.toHaveBeenCalled()
      expect(component.chapter?.bookId).toBe("about")
    })
  })

  // Hydration leaves the prerendered DOM in the host until the app is stable.
  describe("with a prerendered chapter on screen", () => {
    let chapter$: Subject<Chapter>
    let endHold: Mock

    const start = () => {
      fixture.nativeElement.insertAdjacentHTML(
        "beforeend",
        '<div class="chapterBlock"><verse>No princípio</verse></div>',
      )
      fixture.detectChanges()
    }
    const container = (): HTMLElement =>
      fixture.nativeElement.querySelector(".bookBlock").parentElement

    beforeEach(() => {
      chapter$ = new Subject<Chapter>()
      apiServiceSpy.getChapter.mockReturnValue(chapter$)
      endHold = vi.fn()
      vi.spyOn(TestBed.inject(PendingTasks), "add").mockReturnValue(endHold)
    })

    it("keeps the app unstable until the chapter is in", () => {
      start()
      expect(TestBed.inject(PendingTasks).add).toHaveBeenCalledTimes(1)
      expect(endHold).not.toHaveBeenCalled()

      chapter$.next(mockChapter as unknown as Chapter)

      expect(endHold).toHaveBeenCalledTimes(1)
    })

    // Hydration's cleanup deletes the text once the app is stable, so the chapter
    // must have claimed it first.
    it("renders the chapter before letting the app stabilize", () => {
      endHold.mockImplementation(() => {
        expect(component.chapter).toBeTruthy()
        expect(
          fixture.nativeElement.querySelector(".bookBlock .chapterBlock"),
        ).toBeTruthy()
      })
      start()

      chapter$.next(mockChapter as unknown as Chapter)

      expect(endHold).toHaveBeenCalled()
    })

    it("lets the app stabilize when the chapter fails to load", () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      start()

      chapter$.error(new Error("offline"))

      expect(endHold).toHaveBeenCalledTimes(1)
    })

    it("lets the app stabilize when the book list fails to load", () => {
      bookServiceSpy.books$ = new Subject<Book[]>()
      bookServiceSpy.booksUnavailable$ = of(true)
      start()

      expect(endHold).toHaveBeenCalledTimes(1)
    })

    it("lets the app stabilize when the reader goes away first", () => {
      start()

      fixture.destroy()

      expect(endHold).toHaveBeenCalledTimes(1)
    })

    // Client-rendered pages and the native apps have nothing to hold on to.
    it("holds nothing without one", () => {
      fixture.detectChanges()

      expect(TestBed.inject(PendingTasks).add).not.toHaveBeenCalled()
    })

    it("leaves the text in place when the data arrives", () => {
      start()
      fixture.detectChanges()

      chapter$.next(mockChapter as unknown as Chapter)

      expect(container().style.opacity).toBe("")
      expect(animationServiceSpy.scrollToTop).not.toHaveBeenCalled()
      expect(preferencesServiceSpy.setLastBookId).toHaveBeenCalledWith("gen")
    })

    it("still reveals the text when switching it to the saved paged view", () => {
      preferencesServiceSpy.getViewMode.mockReturnValue("paged")
      start()
      fixture.detectChanges()

      chapter$.next(mockChapter as unknown as Chapter)

      expect(container().style.opacity).toBe("0")
      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
    })

    it("still goes to the verse of a deep link", () => {
      ;(
        routerSpy as unknown as {
          routerState: { snapshot: { root: { firstChild: unknown } } }
        }
      ).routerState.snapshot.root.firstChild = {
        params: { book: "gen", chapter: "1" },
        queryParams: { verseStart: "5" },
      }
      start()

      chapter$.next(mockChapter as unknown as Chapter)

      expect(animationServiceSpy.scrollToVerseElement).toHaveBeenCalled()
    })

    it("still animates a chapter turned to before the data arrives", async () => {
      start()
      fixture.detectChanges()
      component.isNavigatingForwards = true

      chapter$.next(mockChapter as unknown as Chapter)
      await fixture.whenStable()

      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
    })
  })

  describe("getChapter and animations", () => {
    beforeEach(() => {
      fixture.detectChanges()
      animationServiceSpy.scrollToTop.mockClear()
      preferencesServiceSpy.setLastBookId.mockClear()
      routerSpy.navigate.mockClear()
    })

    it("should finalize and call animation.scrollToTop on success", async () => {
      vi.useFakeTimers()
      apiServiceSpy.getChapter.mockReturnValue(
        of(mockChapter as unknown as Chapter),
      )
      component.getChapter(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(component.chapter).toEqual(mockChapter as unknown as Chapter)
      expect(component.chapterNumber).toBe(1)
      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
      expect(preferencesServiceSpy.setLastBookId).toHaveBeenCalledWith("gen")
    })

    // The realign pass registered by the previous chapter's deep link holds
    // that chapter's verse element and scroll strategy; it must not survive
    // into the chapter that replaced it.
    it("should drop a pending scroll realign when a new chapter is applied", async () => {
      vi.useFakeTimers()
      animationServiceSpy.cancelPendingRealign.mockClear()

      component.getChapter(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(animationServiceSpy.cancelPendingRealign).toHaveBeenCalled()
    })

    it("should drop a pending scroll realign on destroy", () => {
      animationServiceSpy.cancelPendingRealign.mockClear()

      component.ngOnDestroy()

      expect(animationServiceSpy.cancelPendingRealign).toHaveBeenCalled()
    })

    it("should update SEO metadata when a chapter is applied", async () => {
      vi.useFakeTimers()
      seoServiceSpy.updateForChapter.mockClear()
      apiServiceSpy.getChapter.mockReturnValue(
        of(mockChapter as unknown as Chapter),
      )

      component.getChapter(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(seoServiceSpy.updateForChapter).toHaveBeenCalledWith(
        component.book,
        1,
        mockChapter as unknown as Chapter,
      )
    })

    it("should call scrollToEnd when navigating backwards in paged mode", async () => {
      vi.useFakeTimers()
      component.viewMode = "paged"
      component.isNavigatingBackwards = true
      component.pagedNav = createSpyObj("PagedNavigationDirective", [
        "scrollToEnd",
        "ensureAlignedScrollWidth",
      ]) as unknown as PagedNavigationDirective

      apiServiceSpy.getChapter.mockReturnValue(
        of(mockChapter as unknown as Chapter),
      )

      let capturedCallback: (() => void) | undefined
      animationServiceSpy.scrollToTop.mockImplementation(
        (content, container, mode, startAtBottom, cb) => {
          capturedCallback = cb
        },
      )

      component.getChapter(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
      expect(capturedCallback).toBeDefined()
      if (capturedCallback) capturedCallback()
      expect(component.pagedNav?.scrollToEnd).toHaveBeenCalled()
      expect(
        component.pagedNav?.ensureAlignedScrollWidth,
      ).not.toHaveBeenCalled()
    })

    it("should call ensureAlignedScrollWidth when navigating forwards in paged mode", async () => {
      vi.useFakeTimers()
      component.viewMode = "paged"
      component.isNavigatingForwards = true
      component.pagedNav = createSpyObj("PagedNavigationDirective", [
        "scrollToEnd",
        "ensureAlignedScrollWidth",
      ]) as unknown as PagedNavigationDirective

      apiServiceSpy.getChapter.mockReturnValue(
        of(mockChapter as unknown as Chapter),
      )

      let capturedCallback: (() => void) | undefined
      animationServiceSpy.scrollToTop.mockImplementation(
        (content, container, mode, startAtBottom, cb) => {
          capturedCallback = cb
        },
      )

      component.getChapter(2)
      await vi.advanceTimersByTimeAsync(0)

      expect(animationServiceSpy.scrollToTop).toHaveBeenCalled()
      expect(capturedCallback).toBeDefined()
      if (capturedCallback) capturedCallback()
      expect(component.pagedNav?.ensureAlignedScrollWidth).toHaveBeenCalled()
      expect(component.pagedNav?.scrollToEnd).not.toHaveBeenCalled()
    })

    it("should trigger slide out animation if navigating", async () => {
      vi.useFakeTimers()
      component.isNavigatingForwards = true
      // Need a dummy nativeElement
      component.bookContainer = {
        nativeElement: document.createElement("div"),
      } as unknown as ElementRef

      component.getChapter(2)
      await vi.advanceTimersByTimeAsync(0)

      expect(animationServiceSpy.triggerSlideOutAnimation).toHaveBeenCalled()
    })

    it("should call scrollToVerseElement if verseStart provided", async () => {
      vi.useFakeTimers()
      apiServiceSpy.getChapter.mockReturnValue(
        of(mockChapter as unknown as Chapter),
      )
      component.getChapter(1, 5, 10, true)
      await vi.advanceTimersByTimeAsync(0)
      expect(animationServiceSpy.scrollToVerseElement).toHaveBeenCalled()
    })

    it("should trigger slide out animation in error fallback if navigating", async () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockReturnValue(undefined)
      component.isNavigatingForwards = true
      component.bookContainer = {
        nativeElement: document.createElement("div"),
      } as unknown as ElementRef
      apiServiceSpy.getChapter.mockReturnValue(
        throwError(() => new Error("Not found")),
      )
      bookServiceSpy.findBook.mockReturnValue(mockBooks[1] as unknown as Book)
      component.book = mockBooks[1] as unknown as Book

      component.getChapter(2)
      await vi.advanceTimersByTimeAsync(0)
      expect(animationServiceSpy.triggerSlideOutAnimation).toHaveBeenCalled()
    })

    it("should revert URL with replaceUrl and not reset container when online error occurs", async () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockReturnValue(undefined)
      apiServiceSpy.getChapter.mockReturnValue(
        throwError(() => new Error("Not found")),
      )
      component.book = mockBooks[0] as unknown as Book
      component.chapterNumber = 3
      const el = document.createElement("div")
      component.bookContainer = { nativeElement: el } as unknown as ElementRef

      component.getChapter(4)
      await vi.advanceTimersByTimeAsync(0)

      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "3"], {
        replaceUrl: true,
      })
      expect(el.style.opacity).not.toBe("0")
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        "Não foi possível carregar o capítulo. Tente novamente.",
        "OK",
        { duration: 4000 },
      )
    })

    it("should revert URL with replaceUrl and not reset container when NetworkService reports offline", async () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockReturnValue(undefined)
      ;(
        networkServiceSpy as unknown as {
          isOffline: boolean
        }
      ).isOffline = true
      apiServiceSpy.getChapter.mockReturnValue(
        throwError(() => new Error("Network error")),
      )
      component.book = mockBooks[0] as unknown as Book
      component.chapterNumber = 1
      const el = document.createElement("div")
      component.bookContainer = { nativeElement: el } as unknown as ElementRef

      component.getChapter(2)
      await vi.advanceTimersByTimeAsync(0)
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"], {
        replaceUrl: true,
      })
      expect(el.style.opacity).not.toBe("0")
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        "Sem ligação. Este capítulo ainda não está disponível offline.",
        "OK",
        { duration: 4000 },
      )
    })

    it("should scroll to a requested verse on the About page", async () => {
      vi.useFakeTimers()
      bookServiceSpy.findBook.mockReturnValue(mockBooks[1] as unknown as Book)
      component.book = mockBooks[1] as unknown as Book

      component.getChapter(1, 10)
      await vi.advanceTimersByTimeAsync(0)
      expect(animationServiceSpy.scrollToVerseElement).toHaveBeenCalled()
    })
  })

  // The iOS toolbar's arrows and passage picker (HeaderComponent outputs).
  describe("stepping and picking a passage", () => {
    beforeEach(() => {
      component.book = mockBooks[0] as unknown as Book
      component.viewMode = "scrolling"
    })

    function at(chapter: number): void {
      component.chapterNumber = chapter
      component.chapter = { bookId: "gen", number: chapter } as Chapter
    }

    it("can step between chapters, but not past the first or last", () => {
      at(1)
      expect(component.canGoPrevious).toBe(false)
      expect(component.canGoNext).toBe(true)

      at(50)
      expect(component.canGoPrevious).toBe(true)
      expect(component.canGoNext).toBe(false)
    })

    it("can step back to the introduction", () => {
      component.book = {
        ...(mockBooks[0] as unknown as Book),
        introduction: [{ type: "introParagraph", text: "intro" }],
      }
      at(1)
      expect(component.canGoPrevious).toBe(true)
    })

    it("steps through pages before chapters in paged mode", () => {
      component.viewMode = "paged"
      at(50)
      component.isLastPage = false
      expect(component.canGoNext).toBe(true)

      component.isLastPage = true
      expect(component.canGoNext).toBe(false)
    })

    it("has nowhere to step on the About page or before the text loads", () => {
      at(1)
      component.chapter = undefined as unknown as Chapter
      expect(component.canGoNext).toBe(false)

      component.book = mockBooks[1] as unknown as Book
      at(1)
      expect(component.canGoPrevious).toBe(false)
      expect(component.canGoNext).toBe(false)
    })

    it("steps like the swipes do", () => {
      at(2)
      component.stepForward()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "3"])
    })

    it("opens the passage picked", () => {
      component.goToPassage({ bookId: "gen", chapter: 7 })
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "7"])

      component.goToPassage({ bookId: "gen", chapter: 0 })
      expect(routerSpy.navigate).toHaveBeenCalledWith([
        "/",
        "1-genesis",
        "intro",
      ])
    })

    it("opens chapter 1 of a book picked without a chapter", () => {
      component.goToPassage({ bookId: "gen" })
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", "1"])
    })
  })

  describe("Android chapter cards", () => {
    /** The reader at `chapter`, as the Android app (or not) shows it. */
    async function readerAt(
      chapter: number,
      options: {
        android?: boolean
        viewMode?: "scrolling" | "paged"
        introduction?: boolean
      } = {},
    ): Promise<ComponentFixture<BibleReaderComponent>> {
      TestBed.resetTestingModule()
      await setUpTestBed({ imports: [RouterLink] })
      bookServiceSpy.findBook.mockReturnValue({
        ...mockBooks[0],
        shortName: "Génesis",
        name: "Livro do Génesis",
        ...(options.introduction && {
          introduction: [{ type: "p", text: "…" }],
        }),
      } as unknown as Book)
      preferencesServiceSpy.getViewMode.mockReturnValue(
        options.viewMode ?? "scrolling",
      )
      Object.assign(TestBed.inject(NativeChromeService), {
        android: options.android ?? true,
      })
      const cardFixture = TestBed.createComponent(BibleReaderComponent)
      cardFixture.detectChanges()
      cardFixture.componentInstance.getChapter(chapter)
      await cardFixture.whenStable()
      cardFixture.componentRef.changeDetectorRef.markForCheck()
      cardFixture.detectChanges()
      return cardFixture
    }

    const cards = (cardFixture: ComponentFixture<BibleReaderComponent>) =>
      cardFixture.debugElement.queryAll(By.css("a.chapter-card"))

    // The next chapter is the › arrow's: a card after every chapter only
    // repeated it.
    it("leaves the next chapter to the arrows", async () => {
      expect(cards(await readerAt(5)).length).toBe(0)
    })

    // Above chapter 1 the card leads to the introduction, which otherwise
    // only the picker shows; elsewhere ‹ is at hand at a chapter's top.
    it("leads to the introduction from above chapter 1", async () => {
      const cardFixture = await readerAt(1, { introduction: true })
      const [intro, ...others] = cards(cardFixture)
      expect(others).toEqual([])
      expect(intro.nativeElement.textContent).toContain("Antes do capítulo 1")
      expect(intro.nativeElement.textContent).toContain(
        "Introdução ao Livro do Génesis",
      )
      expect(cardFixture.componentInstance.previousChapterLink).toEqual([
        "/",
        "1-genesis",
        "intro",
      ])
    })

    it("has nothing above chapter 1 of a book without an introduction", async () => {
      expect(cards(await readerAt(1)).length).toBe(0)
    })

    // Génesis 50 was a dead end.
    it("leads on to the next book from a book's last chapter", async () => {
      bookServiceSpy.findBookById.mockImplementation((id: string) =>
        id === "exo"
          ? ({ id: "exo", shortName: "Êxodo", chapterCount: 40 } as Book)
          : undefined,
      )
      bookServiceSpy.getUrlAbrv.mockImplementation((book: Book) =>
        book.id === "exo" ? "2-exodo" : "1-genesis",
      )
      const cardFixture = await readerAt(50)
      const [next, ...others] = cards(cardFixture)

      expect(others).toEqual([])
      expect(next.nativeElement.textContent).toContain("Livro seguinte")
      expect(next.nativeElement.textContent).toContain("Êxodo 1")
      expect(cardFixture.componentInstance.nextBookLink).toEqual([
        "/",
        "2-exodo",
        "1",
      ])
    })

    // Pages turn into the next chapter at the last one.
    it("leaves them out of pages", async () => {
      expect(
        cards(await readerAt(1, { viewMode: "paged", introduction: true }))
          .length,
      ).toBe(0)
    })

    it("leaves them to the Android app", async () => {
      expect(
        cards(await readerAt(1, { android: false, introduction: true })).length,
      ).toBe(0)
    })
  })

  describe("iOS native bars", () => {
    it("hides them as the text scrolls, until the text goes away", () => {
      const stop = vi.fn().mockName("stop")
      const track = vi
        .spyOn(TestBed.inject(NativeChromeService), "trackScroll")
        .mockReturnValue(stop)
      const scroller = document.createElement("div")

      component.drawerContent = new ElementRef(scroller)
      expect(track).toHaveBeenCalledTimes(1)
      expect(track).toHaveBeenCalledWith(scroller)

      component.drawerContent = undefined
      expect(stop).toHaveBeenCalledTimes(1)

      component.drawerContent = new ElementRef(scroller)
      fixture.destroy()
      expect(stop).toHaveBeenCalledTimes(2)
    })
  })
})
