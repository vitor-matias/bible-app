import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { Router } from "@angular/router"
import { of, Subject, throwError } from "rxjs"
import { BibleApiService } from "./bible-api.service"
import { BibleReaderAnimationService } from "./bible-reader-animation.service"
import { BookService } from "./book.service"
import {
  type ChapterContainers,
  ChapterLoaderService,
} from "./chapter-loader.service"
import { PreferencesService } from "./preferences.service"

describe("ChapterLoaderService", () => {
  let service: ChapterLoaderService
  let routerSpy: jasmine.SpyObj<Router>
  let apiSpy: jasmine.SpyObj<BibleApiService>
  let prefSpy: jasmine.SpyObj<PreferencesService>
  let bookSpy: jasmine.SpyObj<BookService>
  let animSpy: jasmine.SpyObj<BibleReaderAnimationService>

  const mockBook = { id: "gen", name: "Genesis", abrv: "gn" } as Book
  const mockAboutBook = { id: "about", name: "About", abrv: "about" } as Book
  const mockChapter = {
    bookId: "gen",
    number: 1,
    verses: [],
  } as unknown as Chapter

  let mockContainers: ChapterContainers

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj("Router", ["navigate"])
    apiSpy = jasmine.createSpyObj("BibleApiService", ["getChapter"])
    prefSpy = jasmine.createSpyObj("PreferencesService", [
      "setLastBookId",
      "setLastChapterNumber",
    ])
    bookSpy = jasmine.createSpyObj("BookService", ["getUrlAbrv"])
    bookSpy.getUrlAbrv.and.returnValue("1-genesis")

    animSpy = jasmine.createSpyObj("BibleReaderAnimationService", [
      "scrollToTop",
      "triggerSlideOutAnimation",
      "scrollToVerseElement",
    ])
    animSpy.triggerSlideOutAnimation.and.returnValue(Promise.resolve())

    mockContainers = {
      bookBlock: document.createElement("div"),
      bookContainer: document.createElement("div"),
      drawerContent: document.createElement("div"),
      effectiveViewMode: "scrolling",
      pagedNav: jasmine.createSpyObj("pagedNav", [
        "scrollToEnd",
        "ensureAlignedScrollWidth",
      ]),
    }

    TestBed.configureTestingModule({
      providers: [
        ChapterLoaderService,
        { provide: Router, useValue: routerSpy },
        { provide: BibleApiService, useValue: apiSpy },
        { provide: PreferencesService, useValue: prefSpy },
        { provide: BookService, useValue: bookSpy },
        { provide: BibleReaderAnimationService, useValue: animSpy },
      ],
    })

    service = TestBed.inject(ChapterLoaderService)
  })

  afterEach(() => {
    service.cancel() // Cleanup lingering subscriptions
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("loadChapter", () => {
    it("should fetch chapter, call onUpdate, and trigger scrollToTop if no verseStart", fakeAsync(() => {
      apiSpy.getChapter.and.returnValue(of(mockChapter))
      const updateSpy = jasmine.createSpy("onUpdate")

      service.loadChapter(mockBook, 1, mockContainers, updateSpy)
      tick()

      expect(apiSpy.getChapter).toHaveBeenCalledWith("gen", 1)
      expect(updateSpy).toHaveBeenCalledWith(mockChapter, 1)

      expect(animSpy.scrollToTop).toHaveBeenCalled()
      expect(prefSpy.setLastBookId).toHaveBeenCalledWith("gen")
      expect(prefSpy.setLastChapterNumber).toHaveBeenCalledWith(1)
    }))

    it("should scroll to verse if verseStart is provided", fakeAsync(() => {
      apiSpy.getChapter.and.returnValue(of(mockChapter))

      service.loadChapter(mockBook, 1, mockContainers, () => {}, {
        verseStart: 5,
        verseEnd: 10,
        highlight: true,
      })
      tick()

      expect(animSpy.scrollToVerseElement).toHaveBeenCalledWith(
        mockContainers.bookBlock,
        mockContainers.bookContainer,
        5,
        10,
        true,
      )
      expect(animSpy.scrollToTop).not.toHaveBeenCalled()
    }))

    it("should trigger slide out animation if navigating forwards", fakeAsync(() => {
      apiSpy.getChapter.and.returnValue(of(mockChapter))
      service.isNavigatingForwards = true

      service.loadChapter(mockBook, 1, mockContainers, () => {})
      tick()

      expect(animSpy.triggerSlideOutAnimation).toHaveBeenCalledWith(
        mockContainers.bookContainer as HTMLElement,
        false,
      )
      expect(service.isNavigatingForwards).toBeFalse() // Flag resets
    }))

    it("should trigger slide out animation backwards if navigating backwards", fakeAsync(() => {
      apiSpy.getChapter.and.returnValue(of(mockChapter))
      service.isNavigatingBackwards = true

      service.loadChapter(mockBook, 1, mockContainers, () => {})
      tick()

      expect(animSpy.triggerSlideOutAnimation).toHaveBeenCalledWith(
        mockContainers.bookContainer as HTMLElement,
        true,
      )
      expect(service.isNavigatingBackwards).toBeFalse() // Flag resets
    }))

    it("should gracefully handle missing DOM containers", fakeAsync(() => {
      apiSpy.getChapter.and.returnValue(of(mockChapter))
      const emptyContainers: ChapterContainers = {
        bookBlock: undefined,
        bookContainer: undefined,
        drawerContent: undefined,
        effectiveViewMode: "scrolling",
      }

      service.loadChapter(mockBook, 1, emptyContainers, () => {})
      tick()

      expect(animSpy.triggerSlideOutAnimation).not.toHaveBeenCalled() // No container
      expect(animSpy.scrollToTop).toHaveBeenCalledWith(
        undefined,
        undefined,
        "scrolling",
        false,
        jasmine.any(Function),
      )
    }))

    describe("Error Handling", () => {
      it("should fallback to 'about' chapter and update preferences if book is 'about'", fakeAsync(() => {
        spyOn(console, "error") // Suppress expected console.error
        apiSpy.getChapter.and.returnValue(
          throwError(() => new Error("Not Found")),
        )
        const updateSpy = jasmine.createSpy("onUpdate")

        service.loadChapter(mockAboutBook, 1, mockContainers, updateSpy)
        tick()

        expect(updateSpy).toHaveBeenCalledWith(
          { bookId: "about", number: 1 } as Chapter,
          1,
        )
        expect(animSpy.scrollToTop).toHaveBeenCalled()
        expect(prefSpy.setLastBookId).toHaveBeenCalledWith("about")
        expect(prefSpy.setLastChapterNumber).toHaveBeenCalledWith(1)
      }))

      it("should redirect to chapter 1 of the same book on error if not 'about'", fakeAsync(() => {
        spyOn(console, "error") // Suppress expected console.error
        apiSpy.getChapter.and.returnValue(
          throwError(() => new Error("Not Found")),
        )

        service.loadChapter(mockBook, 5, mockContainers, () => {})
        tick()

        expect(routerSpy.navigate).toHaveBeenCalledWith(["/", "1-genesis", 1])
        expect(prefSpy.setLastBookId).not.toHaveBeenCalled() // handled by the new route
      }))
    })

    describe("Paged Navigation Hooks", () => {
      it("should trigger scrollToEnd on beforeScroll when starting at bottom", fakeAsync(() => {
        apiSpy.getChapter.and.returnValue(of(mockChapter))
        service.isNavigatingBackwards = true

        service.loadChapter(mockBook, 1, mockContainers, () => {})
        tick()

        // Extract the beforeScroll callback passed to scrollToTop
        const args = animSpy.scrollToTop.calls.mostRecent().args
        const beforeScroll = args[4] as () => void

        expect(beforeScroll).toBeDefined()
        beforeScroll()

        expect(mockContainers.pagedNav?.scrollToEnd).toHaveBeenCalled()
      }))

      it("should trigger ensureAlignedScrollWidth on beforeScroll when starting at top", fakeAsync(() => {
        apiSpy.getChapter.and.returnValue(of(mockChapter))

        service.loadChapter(mockBook, 1, mockContainers, () => {})
        tick()

        // Extract the beforeScroll callback passed to scrollToTop
        const args = animSpy.scrollToTop.calls.mostRecent().args
        const beforeScroll = args[4] as () => void

        expect(beforeScroll).toBeDefined()
        beforeScroll()

        expect(
          mockContainers.pagedNav?.ensureAlignedScrollWidth,
        ).toHaveBeenCalled()
      }))
    })
  })

  describe("cancel", () => {
    it("should unsubscribe from active chapter fetch", fakeAsync(() => {
      // Return a subject so it doesn't complete immediately
      const subject = new Subject<Chapter>()
      apiSpy.getChapter.and.returnValue(subject.asObservable())
      const updateSpy = jasmine.createSpy("onUpdate")

      service.loadChapter(mockBook, 1, mockContainers, updateSpy)
      tick()

      service.cancel()

      // Emit after cancellation
      subject.next(mockChapter)
      tick()

      expect(updateSpy).not.toHaveBeenCalled()
    }))
  })
})
