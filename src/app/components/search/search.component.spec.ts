import { HttpErrorResponse } from "@angular/common/http"
import { ChangeDetectorRef, NgZone } from "@angular/core"
import { fakeAsync, flushMicrotasks, tick } from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { Router } from "@angular/router"
import { Observable, of } from "rxjs"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { SearchStateService } from "../../services/search-state.service"
import { SearchComponent } from "./search.component"

describe("SearchComponent", () => {
  let component: SearchComponent
  let apiService: jasmine.SpyObj<BibleApiService>
  let referenceService: jasmine.SpyObj<BibleReferenceService>
  let bookService: jasmine.SpyObj<BookService>
  let snackBar: jasmine.SpyObj<MatSnackBar>
  let router: jasmine.SpyObj<Router>
  let analyticsService: jasmine.SpyObj<AnalyticsService>
  let searchStateService: jasmine.SpyObj<SearchStateService>
  let cdr: Pick<ChangeDetectorRef, "detectChanges">
  let ngZone: jasmine.SpyObj<NgZone>
  let mockDocument: Partial<Document>
  let observerCallback: IntersectionObserverCallback | null

  class MockIntersectionObserver implements IntersectionObserver {
    root: Element | Document | null = null
    rootMargin = ""
    thresholds = [1]

    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback
    }

    observe(_target: Element): void {}

    unobserve(_target: Element): void {}

    disconnect(): void {}

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }

  beforeEach(() => {
    apiService = jasmine.createSpyObj("BibleApiService", ["getVerse", "search"])
    referenceService = jasmine.createSpyObj("BibleReferenceService", [
      "extract",
    ])
    bookService = jasmine.createSpyObj("BookService", ["findBook"])
    snackBar = jasmine.createSpyObj("MatSnackBar", ["open"])
    router = jasmine.createSpyObj("Router", ["navigate"])
    router.navigate.and.resolveTo(true)
    analyticsService = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsService.track.and.returnValue(Promise.resolve())
    searchStateService = jasmine.createSpyObj("SearchStateService", [
      "save",
      "restore",
      "clear",
    ])
    searchStateService.restore.and.returnValue(null)
    cdr = { detectChanges: jasmine.createSpy("detectChanges") }
    ngZone = jasmine.createSpyObj("NgZone", ["run"])
    ngZone.run.and.callFake(<T>(fn: (...args: unknown[]) => T): T => fn())
    mockDocument = {
      activeElement: document.createElement("input"),
    }
    observerCallback = null

    component = new SearchComponent(
      apiService,
      referenceService,
      bookService,
      snackBar,
      router,
      cdr as ChangeDetectorRef,
      ngZone,
      analyticsService,
      searchStateService,
      mockDocument as Document,
      MockIntersectionObserver as typeof IntersectionObserver,
    )
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should navigate to a direct reference using verseStart", async () => {
    const verse = {
      bookId: "jhn",
      chapterNumber: 3,
      number: 16,
      verseLabel: "16",
      text: [],
    } as Verse

    referenceService.extract.and.returnValue([
      {
        match: "John 3:16",
        index: 0,
        book: "John",
        chapter: 3,
        verses: [{ type: "single", verse: 16 }],
      },
    ])
    bookService.findBook.and.returnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.and.returnValue(of(verse))

    await component.onSearchSubmit("John 3:16")

    expect(router.navigate).toHaveBeenCalledWith(["/", "jhn", 3], {
      queryParams: { verseStart: 16 },
    })
  })

  it("should navigate to a book directly if the search text exactly matches a book abbreviation or name", async () => {
    const verse = {
      bookId: "luk",
      chapterNumber: 1,
      number: 1,
      verseLabel: "1",
      text: [],
    } as Verse

    referenceService.extract.and.returnValue([])

    bookService.findBook.and.callFake((text: string) => {
      if (text === "lc") {
        return {
          id: "luk",
          abrv: "Lc",
          shortName: "Lucas",
          name: "Evangelho de São Lucas",
          chapterCount: 24,
        }
      }
      return {
        id: "about",
        abrv: "Sobre",
        shortName: "Sobre a Bíblia",
        name: "Sobre a Bíblia",
        chapterCount: 1,
      }
    })

    apiService.getVerse.and.returnValue(of(verse))

    await component.onSearchSubmit("lc")

    expect(referenceService.extract).toHaveBeenCalledWith("lc")
    expect(bookService.findBook).toHaveBeenCalledWith("lc")
    expect(router.navigate).toHaveBeenCalledWith(["/", "luk", 1], {})
  })

  it("should keep loadMoreResults locked until the next page arrives", fakeAsync(() => {
    const nextVerse = {
      bookId: "gen",
      chapterNumber: 1,
      number: 2,
      verseLabel: "2",
      text: [{ type: "text", text: "Second verse" }],
    } as Verse

    component.searchTerm = "beginning"
    component.currentPage = 1
    component.totalResults = 2
    component.searchResults = [
      {
        bookId: "gen",
        chapterNumber: 1,
        number: 1,
        verseLabel: "1",
        text: [{ type: "text", text: "First verse" }],
      } as Verse,
    ]
    apiService.search.and.returnValue(
      of({
        verses: [nextVerse],
        total: 2,
        currentPage: 2,
        totalPages: 2,
      } as VersePage),
    )

    component.sentinel = {
      nativeElement: document.createElement("div"),
    } as SearchComponent["sentinel"]
    component.ngAfterViewInit()

    const callback = observerCallback
    expect(callback).toBeDefined()
    if (!callback) {
      throw new Error("IntersectionObserver callback was not registered")
    }
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    flushMicrotasks()
    tick()

    expect(apiService.search).toHaveBeenCalledWith("beginning", 2)
    expect(component.searchResults).toEqual([
      jasmine.objectContaining({ number: 1 }),
      nextVerse,
    ])
    expect(component.currentPage).toBe(2)
    expect(component.isLoading).toBeFalse()
  }))

  it("should show a snackbar when a direct reference is invalid", async () => {
    referenceService.extract.and.returnValue([
      {
        match: "John 99:1",
        index: 0,
        book: "John",
        chapter: 99,
        verses: [{ type: "single", verse: 1 }],
      },
    ])
    bookService.findBook.and.returnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.and.returnValue(
      new Observable((subscriber) => {
        subscriber.error(new HttpErrorResponse({ status: 404 }))
      }),
    )

    spyOn(console, "error")
    await component.onSearchSubmit("John 99:1")

    expect(console.error).toHaveBeenCalled()
    expect(snackBar.open).toHaveBeenCalledWith(
      "Capitulo ou versiculo não existe",
      "Fechar",
      { duration: 3000 },
    )
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it("should populate search results and announce the count", async () => {
    const scrollToTopSpy = spyOn(component, "scrollToTop")
    referenceService.extract.and.returnValue([])
    apiService.search.and.returnValue(
      of({
        verses: [
          {
            bookId: "gen",
            chapterNumber: 1,
            number: 1,
            verseLabel: "1",
            text: [{ type: "text", text: "First verse" }],
          },
        ],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      } as VersePage),
    )

    await component.onSearchSubmit("beginning")

    expect(component.searchResults.length).toBe(1)
    expect(component.currentPage).toBe(1)
    expect(snackBar.open).toHaveBeenCalledWith(
      "Encontrado 1 resultado",
      "Fechar",
      { duration: 3000 },
    )
    expect(scrollToTopSpy).toHaveBeenCalled()
  })

  it("should announce when no search results are found", async () => {
    const scrollToTopSpy = spyOn(component, "scrollToTop")
    referenceService.extract.and.returnValue([])
    apiService.search.and.returnValue(
      of({ verses: [], total: 0, currentPage: 1, totalPages: 0 } as VersePage),
    )

    await component.onSearchSubmit("missing")

    expect(component.searchResults).toEqual([])
    expect(snackBar.open).toHaveBeenCalledWith(
      "Nenhum resultado encontrado",
      "Fechar",
      { duration: 3000 },
    )
    expect(scrollToTopSpy).toHaveBeenCalled()
  })

  it("should disconnect the observer on destroy", () => {
    const observer = jasmine.createSpyObj("IntersectionObserver", [
      "disconnect",
    ])
    component["observer"] = observer

    component.ngOnDestroy()

    expect(observer.disconnect).toHaveBeenCalled()
  })
})
