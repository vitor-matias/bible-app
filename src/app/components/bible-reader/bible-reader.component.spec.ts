import { ChangeDetectorRef, ElementRef, NO_ERRORS_SCHEMA } from "@angular/core"
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing"
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { ActivatedRoute, Router } from "@angular/router"
import { BehaviorSubject, of, throwError } from "rxjs"
import { PagedNavigationDirective } from "../../directives/paged-navigation/paged-navigation.directive"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import { PreferencesService } from "../../services/preferences.service"
import { BibleReaderComponent } from "./bible-reader.component"

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
    ])

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
    ])
    animationServiceSpy.triggerSlideOutAnimation.and.returnValue(
      Promise.resolve(),
    )

    // Default returns
    preferencesServiceSpy.getAutoScrollSpeed.and.returnValue(50)
    preferencesServiceSpy.getViewMode.and.returnValue("scrolling")
    preferencesServiceSpy.getAutoScrollControlsVisible.and.returnValue(false)
    bookServiceSpy.findBook.and.returnValue(mockBooks[0] as unknown as Book)
    bookServiceSpy.getUrlAbrv.and.returnValue("1-genesis")
    apiServiceSpy.getChapter.and.returnValue(
      of(mockChapter as unknown as Chapter),
    )

    await TestBed.configureTestingModule({
      imports: [BibleReaderComponent, BrowserAnimationsModule],
      providers: [
        { provide: AutoScrollService, useValue: autoScrollServiceSpy },
        { provide: BibleApiService, useValue: apiServiceSpy },
        { provide: BookService, useValue: bookServiceSpy },
        { provide: PreferencesService, useValue: preferencesServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: routeMock },
        { provide: BibleReaderAnimationService, useValue: animationServiceSpy },
      ],
    })
      .overrideComponent(BibleReaderComponent, {
        set: {
          schemas: [NO_ERRORS_SCHEMA],
          imports: [], // Override standalone imports to avoid child dependency issues
        },
      })
      .compileComponents()

    fixture = TestBed.createComponent(BibleReaderComponent)
    component = fixture.componentInstance
  })

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
    })

    it("goToNextChapter should navigate forward and stop scroll", () => {
      component.goToNextChapter()
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingForwards).toBeTrue()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", 2])
    })

    it("goToPreviousChapter should navigate backwards and stop scroll", () => {
      component.chapterNumber = 2
      component.goToPreviousChapter()
      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
      expect(component.isNavigatingBackwards).toBeTrue()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", 1])
    })
    it("onToggleViewMode should switch back to scrolling mode", fakeAsync(() => {
      component.viewMode = "paged"
      component.onToggleViewMode()
      expect(component.viewMode).toBe("scrolling")
      expect(preferencesServiceSpy.setViewMode).toHaveBeenCalledWith(
        "scrolling",
      )
    }))

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

    it("should allow getBook to update book on success", () => {
      apiServiceSpy.getBook.and.returnValue(of(mockBooks[1] as unknown as Book))
      component.getBook("about")
      expect(component.book).toEqual(mockBooks[1] as unknown as Book)
    })

    it("should handle getBook error gracefully", () => {
      const consoleSpy = spyOn(console, "error")
      apiServiceSpy.getBook.and.returnValue(
        throwError(() => new Error("failed")),
      )
      component.getBook("about")
      expect(consoleSpy).toHaveBeenCalled()
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

    describe("checkIfNextVerseStartsWithQuote", () => {
      it("should return false if chapter or verses missing", () => {
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
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", 2])
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
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", 1])
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
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", 1])

      component.onArrowPress(
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      )
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", 3])
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
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", 1])
      expect(component.bookDrawer.close).toHaveBeenCalled()
    })

    it("onChapterSubmit should navigate to chapter and close drawer", () => {
      component.onChapterSubmit({ chapterNumber: 5 })
      expect(routerSpy.navigate).toHaveBeenCalledWith(["1-genesis", 5])
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

  describe("getChapter and animations", () => {
    beforeEach(() => {
      fixture.detectChanges()
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

    it("should navigate to first chapter on error if book is not 'about'", fakeAsync(() => {
      spyOn(console, "error")
      apiServiceSpy.getChapter.and.returnValue(
        throwError(() => new Error("Not found")),
      )
      component.book = mockBooks[0] as unknown as Book
      component.bookContainer = {
        nativeElement: document.createElement("div"),
      } as unknown as ElementRef

      component.getChapter(2)
      tick()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", 1])
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

  describe("Misc Actions", () => {
    it("onPageStateChange should only mark for check if state changed", () => {
      const cdrSpy = spyOn(component["cdr"], "markForCheck")

      component.isFirstPage = true
      component.isLastPage = false

      component.onPageStateChange({ isFirstPage: true, isLastPage: false })
      expect(cdrSpy).not.toHaveBeenCalled()

      component.onPageStateChange({ isFirstPage: false, isLastPage: true })
      expect(component.isFirstPage).toBeFalse()
      expect(component.isLastPage).toBeTrue()
      expect(cdrSpy).toHaveBeenCalled()
    })

    it("should allow getBook to update book on success", () => {
      apiServiceSpy.getBook.and.returnValue(of(mockBooks[1] as unknown as Book))
      component.getBook("about")
      expect(component.book).toEqual(mockBooks[1] as unknown as Book)
    })

    it("should handle getBook error gracefully", () => {
      const consoleSpy = spyOn(console, "error")
      apiServiceSpy.getBook.and.returnValue(
        throwError(() => new Error("failed")),
      )
      component.getBook("about")
      expect(consoleSpy).toHaveBeenCalled()
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

    describe("checkIfNextVerseStartsWithQuote", () => {
      it("should return false if chapter or verses missing", () => {
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
  })
})
