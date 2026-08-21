import { NO_ERRORS_SCHEMA } from "@angular/core"
import {
  ComponentFixture,
  fakeAsync,
  flushMicrotasks,
  TestBed,
} from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import {
  ActivatedRoute,
  convertToParamMap,
  type ParamMap,
  Router,
} from "@angular/router"
import { BehaviorSubject, Observable, of, Subject } from "rxjs"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { SeoService } from "../../services/seo.service"
import { SearchComponent } from "./search.component"

describe("SearchComponent", () => {
  let component: SearchComponent
  let fixture: ComponentFixture<SearchComponent>
  let apiService: jasmine.SpyObj<BibleApiService>
  let referenceService: jasmine.SpyObj<BibleReferenceService>
  let bookService: jasmine.SpyObj<BookService>
  let snackBar: jasmine.SpyObj<MatSnackBar>
  let router: jasmine.SpyObj<Router>
  let analyticsService: jasmine.SpyObj<AnalyticsService>
  let routeMock: ActivatedRoute
  let queryParamMapSubject: BehaviorSubject<ParamMap>
  let seoService: jasmine.SpyObj<SeoService>
  let observerCallback: IntersectionObserverCallback | null
  let originalIntersectionObserver: typeof IntersectionObserver | undefined

  class MockIntersectionObserver implements IntersectionObserver {
    root: Element | Document | null = null
    rootMargin = ""
    scrollMargin = ""
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

  beforeEach(async () => {
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
    queryParamMapSubject = new BehaviorSubject(convertToParamMap({}))
    routeMock = {
      snapshot: { queryParamMap: convertToParamMap({}) },
      queryParamMap: queryParamMapSubject.asObservable(),
    } as ActivatedRoute
    seoService = jasmine.createSpyObj("SeoService", ["updateForSearch"])
    observerCallback = null
    originalIntersectionObserver = globalThis.IntersectionObserver

    globalThis.IntersectionObserver =
      MockIntersectionObserver as typeof IntersectionObserver

    await TestBed.configureTestingModule({
      imports: [SearchComponent],
      providers: [
        { provide: BibleApiService, useValue: apiService },
        { provide: BibleReferenceService, useValue: referenceService },
        { provide: BookService, useValue: bookService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: ActivatedRoute, useValue: routeMock },
        { provide: SeoService, useValue: seoService },
      ],
    })
      .overrideComponent(SearchComponent, {
        set: { schemas: [NO_ERRORS_SCHEMA], imports: [] },
      })
      .compileComponents()

    fixture = TestBed.createComponent(SearchComponent)
    component = fixture.componentInstance
  })

  afterEach(() => {
    if (originalIntersectionObserver) {
      globalThis.IntersectionObserver = originalIntersectionObserver
    } else {
      delete (
        globalThis as { IntersectionObserver?: typeof IntersectionObserver }
      ).IntersectionObserver
    }
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should run a shared query from the q query param on init", () => {
    queryParamMapSubject.next(convertToParamMap({ q: "shared text" }))
    const submitSpy = spyOn(component, "onSearchSubmit")

    component.ngOnInit()

    expect(submitSpy).toHaveBeenCalledWith("shared text")
  })

  it("should run a second shared query without re-creating the component", () => {
    const submitSpy = spyOn(component, "onSearchSubmit")
    component.ngOnInit()

    queryParamMapSubject.next(convertToParamMap({ q: "first" }))
    queryParamMapSubject.next(convertToParamMap({ q: "second" }))

    expect(submitSpy).toHaveBeenCalledWith("first")
    expect(submitSpy).toHaveBeenCalledWith("second")
  })

  it("should not re-run the same shared query on an unrelated emission", () => {
    const submitSpy = spyOn(component, "onSearchSubmit")
    component.ngOnInit()

    queryParamMapSubject.next(convertToParamMap({ q: "same" }))
    queryParamMapSubject.next(convertToParamMap({ q: "same" }))

    expect(submitSpy).toHaveBeenCalledTimes(1)
  })

  it("should not search on init without a q query param", () => {
    const submitSpy = spyOn(component, "onSearchSubmit")

    component.ngOnInit()

    expect(submitSpy).not.toHaveBeenCalled()
  })

  it("should mark the search page as noindex via SeoService on init", () => {
    fixture.detectChanges()
    expect(seoService.updateForSearch).toHaveBeenCalled()
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
    // Keep the page-2 request pending so a second trigger arrives while the
    // first one is still in flight.
    const pendingPage$ = new Subject<VersePage>()
    apiService.search.and.returnValue(pendingPage$.asObservable())

    component.sentinel = {
      nativeElement: document.createElement("div"),
    } as SearchComponent["sentinel"]
    component.ngAfterViewInit()

    const callback = observerCallback
    expect(callback).toBeDefined()
    if (!callback) {
      throw new Error("IntersectionObserver callback was not registered")
    }
    const trigger = () =>
      callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )

    trigger()
    flushMicrotasks()
    // Second intersection while the first request is still pending must not
    // start another request.
    trigger()
    flushMicrotasks()
    expect(apiService.search).toHaveBeenCalledTimes(1)
    expect(apiService.search).toHaveBeenCalledWith("beginning", 2)

    pendingPage$.next({
      verses: [nextVerse],
      total: 2,
      currentPage: 2,
      totalPages: 2,
    } as VersePage)
    pendingPage$.complete()
    flushMicrotasks()

    expect(apiService.search).toHaveBeenCalledTimes(1)
    expect(component.searchResults).toEqual([
      jasmine.objectContaining({ number: 1 }),
      jasmine.objectContaining({ number: 2 }),
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
        subscriber.error({ status: 404 })
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
