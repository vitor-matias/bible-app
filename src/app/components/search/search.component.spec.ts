import { Location } from "@angular/common"
import { NO_ERRORS_SCHEMA } from "@angular/core"
import {
  ComponentFixture,
  fakeAsync,
  flushMicrotasks,
  TestBed,
  tick,
} from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import {
  ActivatedRoute,
  convertToParamMap,
  type ParamMap,
  Router,
} from "@angular/router"
import {
  BehaviorSubject,
  from,
  Observable,
  of,
  Subject,
  throwError,
} from "rxjs"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import {
  type NativeChromeAction,
  NativeChromeService,
} from "../../services/native-chrome.service"
import { SeoService } from "../../services/seo.service"
import { ThemeService } from "../../services/theme.service"
import { SearchComponent, TYPING_PAUSE_MS } from "./search.component"

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

  // The body reserves the navigation bar's strip; a full-height results list
  // ran through it, leaving the last results under the bar.
  it("ends the results above the bottom system inset", () => {
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const container = host.querySelector(".search-container") as HTMLElement

    host.style.setProperty("--app-inset-bottom", "0px")
    const withoutInset = container.getBoundingClientRect().height
    host.style.setProperty("--app-inset-bottom", "100px")
    const withInset = container.getBoundingClientRect().height

    expect(withoutInset - withInset).toBeCloseTo(100, 0)
  })

  describe("searching as people type", () => {
    beforeEach(() => {
      referenceService.extract.and.returnValue([])
      apiService.search.and.returnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )
      component.ngOnInit()
    })

    it("searches once typing pauses", fakeAsync(() => {
      component.onTyping("pas")
      tick(TYPING_PAUSE_MS - 1)
      // Each keystroke restarts the wait.
      component.onTyping("pastor")
      tick(TYPING_PAUSE_MS - 1)
      expect(apiService.search).not.toHaveBeenCalled()

      tick(1)
      expect(apiService.search).toHaveBeenCalledOnceWith("pastor", 1)
    }))

    it("leaves references and book names for Return", fakeAsync(() => {
      referenceService.extract.and.returnValue([
        { book: "jhn", chapter: 3 },
      ] as unknown as ReturnType<BibleReferenceService["extract"]>)
      component.onTyping("Jo 3")
      tick(TYPING_PAUSE_MS)

      expect(apiService.search).not.toHaveBeenCalled()
      expect(router.navigate).not.toHaveBeenCalled()
    }))

    it("waits for at least two letters", fakeAsync(() => {
      component.onTyping(" a ")
      tick(TYPING_PAUSE_MS)
      expect(apiService.search).not.toHaveBeenCalled()
    }))

    it("doesn't repeat a search that Return already ran", fakeAsync(() => {
      component.onTyping("pastor ")
      void component.onSearchSubmit("pastor")
      tick(TYPING_PAUSE_MS)

      expect(apiService.search).toHaveBeenCalledTimes(1)
    }))
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

  it("should re-run a shared query that went away and came back", () => {
    const submitSpy = spyOn(component, "onSearchSubmit")
    component.ngOnInit()

    queryParamMapSubject.next(convertToParamMap({ q: "same" }))
    queryParamMapSubject.next(convertToParamMap({}))
    queryParamMapSubject.next(convertToParamMap({ q: "same" }))

    expect(submitSpy).toHaveBeenCalledTimes(2)
  })

  it("should open a standalone introduction at /intro without probing a verse", async () => {
    referenceService.extract.and.returnValue([])
    bookService.findBook.and.returnValue({
      id: "pentateuco",
      abrv: "pentateuco",
      shortName: "Introdução ao Pentateuco",
      name: "Introdução ao Pentateuco",
      chapterCount: 0,
      introSlug: "pentateuco",
    })

    await component.onSearchSubmit("Introdução ao Pentateuco")

    expect(apiService.getVerse).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(
      ["/", "pentateuco", "intro"],
      {},
    )
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

  it("should discard a page that arrives after a newer search took over", fakeAsync(() => {
    // Pagination for query A is in flight when query B is submitted. A's page
    // must not append itself to B's results, nor clear B's loading state.
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

    const pendingPage$ = new Subject<VersePage>()
    apiService.search.and.returnValue(pendingPage$.asObservable())

    component.sentinel = {
      nativeElement: document.createElement("div"),
    } as SearchComponent["sentinel"]
    component.ngAfterViewInit()

    const callback = observerCallback
    if (!callback) {
      throw new Error("IntersectionObserver callback was not registered")
    }
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    flushMicrotasks()
    expect(apiService.search).toHaveBeenCalledWith("beginning", 2)

    // A newer search takes over while A's page is still pending.
    const newerSearch$ = new Subject<VersePage>()
    apiService.search.and.returnValue(newerSearch$.asObservable())
    referenceService.extract.and.returnValue([])
    void component.onSearchSubmit("light")
    flushMicrotasks()
    const resultsUnderNewSearch = component.searchResults.length

    // Now A's page finally arrives.
    pendingPage$.next({
      verses: [
        {
          bookId: "gen",
          chapterNumber: 1,
          number: 2,
          verseLabel: "2",
          text: [{ type: "text", text: "Stale second verse" }],
        } as Verse,
      ],
      total: 2,
      currentPage: 2,
      totalPages: 1,
    })
    pendingPage$.complete()
    flushMicrotasks()

    expect(component.searchResults.length).toBe(resultsUnderNewSearch)
    expect(
      component.searchResults.some((verse) =>
        verse.text.some((part) => part.text === "Stale second verse"),
      ),
    ).toBeFalse()
    // The newer search is still loading; the stale page must not say otherwise.
    expect(component.isLoading).toBeTrue()

    newerSearch$.complete()
    flushMicrotasks()
  }))

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

  it("should release the loading lock when a failed reference supersedes a text search", fakeAsync(() => {
    // The text search goes stale the moment the reference is submitted, so its
    // own `finally` no longer clears `isLoading`; the reference path has to.
    const pendingSearch$ = new Subject<VersePage>()
    apiService.search.and.returnValue(pendingSearch$.asObservable())
    referenceService.extract.and.returnValue([])
    void component.onSearchSubmit("light")
    flushMicrotasks()
    expect(component.isLoading).toBeTrue()

    referenceService.extract.and.returnValue([
      { match: "John 99:1", index: 0, book: "John", chapter: 99 },
    ])
    bookService.findBook.and.returnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.and.returnValue(throwError(() => ({ status: 404 })))
    spyOn(console, "error")
    void component.onSearchSubmit("John 99:1")
    flushMicrotasks()

    pendingSearch$.next({ verses: [], total: 0, currentPage: 1, totalPages: 0 })
    pendingSearch$.complete()
    flushMicrotasks()

    expect(component.isLoading).toBeFalse()
    // Paging and highlighting still belong to the search whose results show.
    expect(component.searchTerm).toBe("light")
  }))

  it("should release the loading lock when the reference navigation is refused", fakeAsync(() => {
    // router.navigate resolves false on a cancelled navigation: no throw, and
    // the superseded text search no longer clears the flag itself.
    const pendingSearch$ = new Subject<VersePage>()
    apiService.search.and.returnValue(pendingSearch$.asObservable())
    referenceService.extract.and.returnValue([])
    void component.onSearchSubmit("light")
    flushMicrotasks()

    bookService.findBook.and.returnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.and.returnValue(of({ text: [] } as unknown as Verse))
    router.navigate.and.resolveTo(false)
    void component.onSearchSubmit("Jo")
    flushMicrotasks()

    expect(component.isLoading).toBeFalse()
  }))

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

  // A share target can deliver two queries back to back. If A resolves after
  // B, A used to overwrite B's results and clear B's loading state.
  it("should ignore a superseded search that resolves last", async () => {
    referenceService.extract.and.returnValue([])
    bookService.findBook.and.returnValue({ id: "about" } as Book)

    const verseFor = (text: string) =>
      ({
        bookId: "gen",
        chapterNumber: 1,
        number: 1,
        verseLabel: "1",
        text: [{ type: "text", text }],
      }) as Verse

    const page = (verses: Verse[], total: number): VersePage => ({
      verses,
      total,
      currentPage: 1,
      totalPages: 1,
    })

    let resolveA: (value: VersePage) => void = () => {}
    const slowA = new Promise<VersePage>((resolve) => {
      resolveA = resolve
    })

    apiService.search.and.callFake((text: string) =>
      text === "A" ? from(slowA) : of(page([verseFor("B result")], 1)),
    )

    const first = component.onSearchSubmit("A")
    await component.onSearchSubmit("B")

    expect(component.searchResults[0].text?.[0].text).toBe("B result")

    resolveA(page([verseFor("A result")], 99))
    await first

    expect(component.searchResults[0].text?.[0].text).toBe("B result")
    expect(component.totalResults).toBe(1)
    expect(component.isLoading).toBeFalse()
  })
})

describe("SearchComponent in the iOS app", () => {
  let fixture: ComponentFixture<SearchComponent>
  let actions: Subject<NativeChromeAction>
  let nativeChrome: {
    enabled: boolean
    actions$: Subject<NativeChromeAction>
    show: jasmine.Spy
    hide: jasmine.Spy
    toast: jasmine.Spy
  }
  let location: jasmine.SpyObj<Location>
  let apiService: jasmine.SpyObj<BibleApiService>

  beforeEach(async () => {
    actions = new Subject()
    nativeChrome = {
      enabled: true,
      actions$: actions,
      show: jasmine.createSpy("show"),
      hide: jasmine.createSpy("hide"),
      toast: jasmine.createSpy("toast"),
    }
    location = jasmine.createSpyObj("Location", ["back"])
    apiService = jasmine.createSpyObj("BibleApiService", ["getVerse", "search"])
    apiService.search.and.returnValue(
      of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
    )
    const referenceService = jasmine.createSpyObj("BibleReferenceService", [
      "extract",
    ])
    referenceService.extract.and.returnValue([])
    const bookService = jasmine.createSpyObj("BookService", [
      "findBook",
      "findBookById",
    ])
    bookService.findBookById.and.returnValue({ shortName: "Mateus" })
    const analytics = jasmine.createSpyObj("AnalyticsService", ["track"])
    analytics.track.and.resolveTo()

    await TestBed.configureTestingModule({
      imports: [SearchComponent],
      providers: [
        { provide: NativeChromeService, useValue: nativeChrome },
        { provide: Location, useValue: location },
        { provide: ThemeService, useValue: { currentMode: "dark" } },
        { provide: BibleApiService, useValue: apiService },
        { provide: BibleReferenceService, useValue: referenceService },
        { provide: BookService, useValue: bookService },
        { provide: MatSnackBar, useValue: jasmine.createSpyObj(["open"]) },
        { provide: Router, useValue: jasmine.createSpyObj(["navigate"]) },
        { provide: AnalyticsService, useValue: analytics },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({})) },
        },
        {
          provide: SeoService,
          useValue: jasmine.createSpyObj(["updateForSearch"]),
        },
      ],
    })
      .overrideComponent(SearchComponent, {
        set: { schemas: [NO_ERRORS_SCHEMA], imports: [] },
      })
      .compileComponents()

    fixture = TestBed.createComponent(SearchComponent)
    fixture.detectChanges()
  })

  it("draws no web search bar", () => {
    expect(fixture.nativeElement.querySelector("search-bar")).toBeNull()
  })

  it("shows the native search field", () => {
    expect(nativeChrome.show).toHaveBeenCalledWith({
      mode: "search",
      themeMode: "dark",
      query: "",
    })
  })

  it("searches what is typed in the native field, and keeps it there", async () => {
    actions.next({ id: "search-submit", text: "pastor" })
    await fixture.whenStable()

    expect(apiService.search).toHaveBeenCalledWith("pastor", 1)
    expect(nativeChrome.show.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ query: "pastor" }),
    )
  })

  it("searches as people type in the native field", fakeAsync(() => {
    actions.next({ id: "search-input", text: "pastor" })
    tick(TYPING_PAUSE_MS)

    expect(apiService.search).toHaveBeenCalledWith("pastor", 1)
  }))

  // A search that ran on a pause leaves the keyboard up: the count waits.
  it("holds the results toast until the keyboard closes", async () => {
    apiService.search.and.returnValue(
      of({
        verses: [
          {
            bookId: "mat",
            chapterNumber: 5,
            number: 7,
            text: [{ type: "text", text: "misericordiosos" }],
          },
        ],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      } as unknown as ReturnType<BibleApiService["search"]> extends Observable<
        infer T
      >
        ? T
        : never),
    )
    actions.next({ id: "search-submit", text: "misericordiosos" })
    await fixture.whenStable()

    expect(nativeChrome.toast).toHaveBeenCalledWith("Encontrado 1 resultado", {
      afterKeyboard: true,
    })
  })

  it("lists the results as an iOS grouped list, matches in bold", async () => {
    document.body.classList.add("native-chrome")
    try {
      apiService.search.and.returnValue(
        of({
          verses: [
            {
              bookId: "mat",
              chapterNumber: 5,
              number: 7,
              text: [{ type: "text", text: "Felizes os misericordiosos" }],
            },
          ],
          total: 1,
          currentPage: 1,
          totalPages: 1,
        } as unknown as ReturnType<
          BibleApiService["search"]
        > extends Observable<infer T>
          ? T
          : never),
      )
      actions.next({ id: "search-submit", text: "misericordiosos" })
      await fixture.whenStable()
      fixture.detectChanges()

      const element = fixture.nativeElement as HTMLElement
      const card = element.querySelector(".result-card") as HTMLElement
      const match = element.querySelector(".search-highlight") as HTMLElement
      expect(getComputedStyle(card).borderTopWidth).toBe("0px")
      expect(getComputedStyle(match).fontWeight).toBe("700")
      expect(getComputedStyle(match).backgroundColor).toBe("rgba(0, 0, 0, 0)")
    } finally {
      document.body.classList.remove("native-chrome")
    }
  })

  it("goes back with the native Back button", () => {
    actions.next({ id: "back" })
    expect(location.back).toHaveBeenCalled()
  })

  it("removes the bars when leaving", () => {
    fixture.destroy()
    expect(nativeChrome.hide).toHaveBeenCalled()
  })

  // The red is the scripture's (verse numbers, references), not status text's.
  it("shows the empty state in neutral grey, not the scripture red", () => {
    document.body.classList.add("native-chrome")
    try {
      const empty = (fixture.nativeElement as HTMLElement).querySelector(
        ".empty-state",
      ) as HTMLElement
      const probe = document.createElement("span")
      probe.style.color = "var(--text-secondary)"
      document.body.appendChild(probe)
      const red = getComputedStyle(probe).color
      probe.remove()

      expect(getComputedStyle(empty).color).not.toBe(red)
    } finally {
      document.body.classList.remove("native-chrome")
    }
  })
})
