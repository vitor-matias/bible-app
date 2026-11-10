import { Location } from "@angular/common"
import { ApplicationRef, NO_ERRORS_SCHEMA } from "@angular/core"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import { MatDialog } from "@angular/material/dialog"
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
  ReplaySubject,
  Subject,
  throwError,
} from "rxjs"
import type { Mock } from "vitest"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import type { NativeChromeAction } from "../../services/native-chrome.types"
import { NetworkService } from "../../services/network.service"
import { OfflineSearchService } from "../../services/offline-search.service"
import { SearchMemoryService } from "../../services/search-memory.service"
import { SeoService } from "../../services/seo.service"
import { ThemeService } from "../../services/theme.service"
import { contrastRatio } from "../../testing/contrast"
import { createSpyObj, lastCall, type SpyObj } from "../../testing/spy-obj"
import {
  PRIVACY_DIALOG_CONFIG,
  PrivacyPolicyDialogComponent,
} from "../privacy-policy/privacy-policy.component"
import { firstLine, SearchComponent, TYPING_PAUSE_MS } from "./search.component"

// How the edition sets Psalm 23,1 and 94,1.
describe("firstLine", () => {
  const verse = (text: Verse["text"]) =>
    ({ bookId: "psa", chapterNumber: 23, number: 1, text }) as Verse

  it("skips a psalm's heading for the line people know", () => {
    expect(
      firstLine(
        verse([
          { type: "quote", text: "\u200b", identLevel: 1 },
          { type: "text", text: "Salmo de David." },
          { type: "paragraph", text: "\n" },
          { type: "quote", text: "O ", identLevel: 1 },
          { type: "text", text: "Senhor" },
          { type: "text", text: " é meu pastor: nada me falta." },
        ]),
      ),
    ).toBe("O Senhor é meu pastor: nada me falta.")
  })

  it("takes the first line of verse otherwise", () => {
    expect(
      firstLine(
        verse([
          { type: "quote", text: "\u200b", identLevel: 1 },
          { type: "text", text: "Ó " },
          { type: "text", text: "Senhor" },
          { type: "text", text: ", Deus vingador," },
          {
            type: "quote",
            text: "ó Deus vingador, manifesta-te!",
            identLevel: 1,
          },
          { type: "paragraph", text: "\n" },
        ]),
      ),
    ).toBe("Ó Senhor, Deus vingador,")
  })
})

describe("SearchComponent", () => {
  let component: SearchComponent
  let fixture: ComponentFixture<SearchComponent>
  let apiService: SpyObj<BibleApiService>
  let referenceService: SpyObj<BibleReferenceService>
  let bookService: SpyObj<BookService>
  let snackBar: SpyObj<MatSnackBar>
  let router: SpyObj<Router>
  let analyticsService: SpyObj<AnalyticsService>
  let routeMock: ActivatedRoute
  let queryParamMapSubject: BehaviorSubject<ParamMap>
  let seoService: SpyObj<SeoService>
  let network: {
    isOffline: boolean
    isOffline$: BehaviorSubject<boolean>
  }
  let offlineSearch: SpyObj<OfflineSearchService>
  let location: SpyObj<Location>
  /** How the navigation to the page came about (Router.currentNavigation). */
  let navigationTrigger: "imperative" | "popstate" | null
  let observerCallback: IntersectionObserverCallback | null
  let observerOptions: IntersectionObserverInit | undefined
  /** What the live observer watches; the page keeps one at a time. */
  let observed: Element | null
  let originalIntersectionObserver: typeof IntersectionObserver | undefined

  class MockIntersectionObserver implements IntersectionObserver {
    root: Element | Document | null = null
    rootMargin = ""
    scrollMargin = ""
    thresholds = [1]

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      observerCallback = callback
      observerOptions = options
    }

    observe(target: Element): void {
      observed = target
    }

    unobserve(_target: Element): void {}

    disconnect(): void {
      observed = null
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }

  beforeEach(async () => {
    apiService = createSpyObj("BibleApiService", [
      "getVerse",
      "search",
      "searchByMeaning",
    ])
    referenceService = createSpyObj("BibleReferenceService", ["extract"])
    bookService = createSpyObj("BookService", [
      "findBook",
      "findBookById",
      "findTypedBook",
      "getUrlAbrv",
      "getChapterUrlSegment",
      "initializeBooks",
    ])
    bookService.initializeBooks.mockResolvedValue(undefined)
    // The links' addresses, as the reader writes them.
    bookService.getUrlAbrv.mockImplementation(BookService.prototype.getUrlAbrv)
    bookService.getChapterUrlSegment.mockImplementation(
      BookService.prototype.getChapterUrlSegment,
    )
    ;(
      bookService as {
        books$: Observable<Book[]>
      }
    ).books$ = of([{ id: "gen" } as Book])
    // As BookService does it: the book findBook finds, but never the About
    // page it falls back to, nor an introduction.
    bookService.findTypedBook.mockImplementation((text: string) => {
      const book = bookService.findBook(text)
      return book && !book.introSlug && book.id !== "about" ? book : undefined
    })
    location = createSpyObj("Location", ["back", "replaceState"])
    snackBar = createSpyObj("MatSnackBar", ["open"])
    router = createSpyObj("Router", ["navigate"])
    router.navigate.mockResolvedValue(true)
    navigationTrigger = null
    ;(
      router as {
        currentNavigation: unknown
      }
    ).currentNavigation = () =>
      navigationTrigger && { trigger: navigationTrigger }
    analyticsService = createSpyObj("AnalyticsService", ["track"])
    analyticsService.track.mockResolvedValue(undefined)
    queryParamMapSubject = new BehaviorSubject(convertToParamMap({}))
    routeMock = {
      snapshot: { queryParamMap: convertToParamMap({}) },
      queryParamMap: queryParamMapSubject.asObservable(),
    } as ActivatedRoute
    seoService = createSpyObj("SeoService", ["updateForSearch"])
    network = { isOffline: false, isOffline$: new BehaviorSubject(false) }
    offlineSearch = createSpyObj("OfflineSearchService", ["search"])
    offlineSearch.search.mockResolvedValue(null)
    observerCallback = null
    observerOptions = undefined
    observed = null
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
        { provide: NetworkService, useValue: network },
        { provide: OfflineSearchService, useValue: offlineSearch },
        { provide: Location, useValue: location },
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
        globalThis as {
          IntersectionObserver?: typeof IntersectionObserver
        }
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

  describe("search by meaning", () => {
    const consent = () =>
      fixture.nativeElement.querySelector(".meaning-consent")

    beforeEach(() => {
      localStorage.removeItem("meaningSearchConsent")
      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )
      apiService.searchByMeaning.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )
    })

    afterEach(() => localStorage.removeItem("meaningSearchConsent"))

    it("sends nothing to Voyage AI until the reader turns it on", async () => {
      component.meaningSearchConsent = null
      await component.onSearchSubmit("não tenhas medo")

      expect(apiService.search).toHaveBeenCalledWith("não tenhas medo", 1)
      expect(apiService.searchByMeaning).not.toHaveBeenCalled()
    })

    it("turning it on is remembered and redoes the search on screen", async () => {
      await component.onSearchSubmit("não tenhas medo")
      component.setMeaningSearch(true)

      expect(localStorage.getItem("meaningSearchConsent")).toBe("true")
      expect(apiService.searchByMeaning).toHaveBeenCalledWith(
        "não tenhas medo",
        1,
      )
    })

    it("can be withdrawn, and the words are searched instead", async () => {
      component.setMeaningSearch(true)
      component.setMeaningSearch(false)
      apiService.search.mockClear()
      apiService.searchByMeaning.mockClear()
      await component.onSearchSubmit("pastor")

      expect(localStorage.getItem("meaningSearchConsent")).toBe("false")
      expect(apiService.search).toHaveBeenCalledWith("pastor", 1)
      expect(apiService.searchByMeaning).not.toHaveBeenCalled()
    })

    it("keeps the switch on the page after a search", async () => {
      component.setMeaningSearch(false)
      await component.onSearchSubmit("pastor")
      fixture.detectChanges()

      const status = fixture.nativeElement.querySelector(".meaning-status")
      expect(status.textContent).toContain("desativada")
      status.querySelector("button").click()
      expect(component.meaningSearchConsent).toBe(true)
    })

    it("can be withdrawn without a connection", () => {
      component.setMeaningSearch(true)
      component.offline = true
      component.searchTerm = ""
      fixture.detectChanges()

      const status = fixture.nativeElement.querySelector(".meaning-status")
      status.querySelector("button").click()
      expect(localStorage.getItem("meaningSearchConsent")).toBe("false")
    })

    it("redoes a search on screen as a word search, even if it names a book", () => {
      const submit = vi.spyOn(component, "onSearchSubmit")
      component.searchTerm = "Sabedoria"
      component.setMeaningSearch(true)

      expect(submit).toHaveBeenCalledWith("Sabedoria", { typed: true })
    })

    it("runs a typed search that was waiting, with the new choice", async () => {
      component.ngOnInit()
      vi.useFakeTimers()
      component.searchTerm = "pastor"
      component.onTyping("amor")
      component.setMeaningSearch(true)
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

      expect(apiService.searchByMeaning).toHaveBeenCalledTimes(1)
      expect(apiService.searchByMeaning).toHaveBeenCalledWith("amor", 1)
    })

    it("explains itself in the privacy policy's modal", () => {
      const open = vi
        .spyOn(TestBed.inject(MatDialog), "open")
        .mockReturnValue(undefined as never)
      component.meaningSearchConsent = null
      fixture.detectChanges()

      consent()?.querySelector("button")?.click()
      expect(open).toHaveBeenCalledWith(
        PrivacyPolicyDialogComponent,
        PRIVACY_DIALOG_CONFIG,
      )
    })

    it("asks the next page of the same kind of search", async () => {
      component.meaningSearchConsent = true
      component.searchTerm = "paz"
      component.currentPage = 1
      component.totalResults = 2
      component.searchResults = [{ text: [] } as unknown as Verse]
      await component["loadMoreResults"]()

      expect(apiService.searchByMeaning).toHaveBeenCalledWith("paz", 2)
      expect(apiService.search).not.toHaveBeenCalled()
    })

    it("promises the search by meaning back only to who has it on", () => {
      const comesBack = "A pesquisa pelo sentido volta com a ligação."
      component.offline = true

      component.meaningSearchConsent = false
      expect(component.storedResultsHint).not.toContain(comesBack)
      component.meaningSearchConsent = null
      expect(component.storedResultsHint).not.toContain(comesBack)
      component.meaningSearchConsent = true
      expect(component.storedResultsHint).toContain(comesBack)
    })

    it("asks only while unanswered", () => {
      component.meaningSearchConsent = null
      fixture.detectChanges()
      expect(consent()).not.toBeNull()

      component.setMeaningSearch(false)
      expect(consent()).toBeNull()
    })
  })

  describe("searching as people type", () => {
    beforeEach(() => {
      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )
      component.ngOnInit()
    })

    it("searches once typing pauses", async () => {
      vi.useFakeTimers()
      component.onTyping("pas")
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS - 1)
      // Each keystroke restarts the wait.
      component.onTyping("pastor")
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS - 1)
      expect(apiService.search).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(apiService.search).toHaveBeenCalledTimes(1)
      expect(apiService.search).toHaveBeenCalledWith("pastor", 1)
    })

    it("leaves references for Return", async () => {
      vi.useFakeTimers()
      referenceService.extract.mockReturnValue([
        { book: "jhn", chapter: 3 },
      ] as unknown as ReturnType<BibleReferenceService["extract"]>)
      bookService.findBook.mockReturnValue({ id: "jhn" } as Book)
      component.onTyping("Jo 3")
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

      expect(apiService.search).not.toHaveBeenCalled()
      expect(router.navigate).not.toHaveBeenCalled()
    })

    it("waits for at least two letters", async () => {
      vi.useFakeTimers()
      component.onTyping(" a ")
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)
      expect(apiService.search).not.toHaveBeenCalled()
    })

    it("doesn't repeat a search that Return already ran", async () => {
      vi.useFakeTimers()
      component.onTyping("pastor ")
      void component.onSearchSubmit("pastor")
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

      expect(apiService.search).toHaveBeenCalledTimes(1)
    })

    // Return would search the words of a reference to a book it can't find,
    // so a pause does too: both ask the same question.
    it("searches what Return would search", async () => {
      vi.useFakeTimers()
      referenceService.extract.mockReturnValue([
        { book: "Xy", chapter: 3 },
      ] as unknown as ReturnType<BibleReferenceService["extract"]>)
      bookService.findBook.mockReturnValue(undefined as unknown as Book)
      component.onTyping("Xy 3")
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

      expect(apiService.search).toHaveBeenCalledTimes(1)

      expect(apiService.search).toHaveBeenCalledWith("Xy 3", 1)
    })

    it("counts a search without telling analytics what was searched", async () => {
      vi.useFakeTimers()
      component.onTyping("pastor")
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

      expect(analyticsService.track).toHaveBeenCalledWith("search")
    })

    // The search by meaning waits for the pause; what costs nothing doesn't.
    describe("while the search waits for the pause", () => {
      const john = {
        id: "jhn",
        name: "Evangelho segundo São João",
        shortName: "João",
        abrv: "Jo",
      } as Book
      const host = () => fixture.nativeElement as HTMLElement

      it("offers a typed reference at once, and opens it", async () => {
        vi.useFakeTimers()
        referenceService.extract.mockReturnValue([
          { book: "Jo", chapter: 3, verses: [{ type: "single", verse: 16 }] },
        ] as unknown as ReturnType<BibleReferenceService["extract"]>)
        bookService.findBook.mockReturnValue(john)
        apiService.getVerse.mockReturnValue(of({} as Verse))

        component.onTyping("Jo 3,16")
        const offer = host().querySelector(
          ".passage-suggestion",
        ) as HTMLButtonElement
        expect(offer.textContent).toContain("Abrir João 3,16")
        expect(component.pendingSearch).toBe(false)

        offer.click()
        await vi.advanceTimersByTimeAsync(0)
        expect(router.navigate).toHaveBeenCalledWith(["/", "jhn", 3], {
          queryParams: { verseStart: 16 },
        })
        await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)
        expect(apiService.search).not.toHaveBeenCalled()
      })

      // "Abrir João 3,16" sat over "Procure versículos, livros ou…".
      it("hides the opening hint under an offer", () => {
        fixture.detectChanges()
        expect(host().querySelector(".empty-state")).toBeTruthy()
        referenceService.extract.mockReturnValue([
          { book: "Jo", chapter: 3, verses: [{ type: "single", verse: 16 }] },
        ] as unknown as ReturnType<BibleReferenceService["extract"]>)
        bookService.findBook.mockReturnValue(john)

        component.onTyping("Jo 3,16")
        expect(host().querySelector(".passage-suggestion")).toBeTruthy()
        expect(host().querySelector(".empty-state")).toBeNull()

        component.onTyping("")
        expect(host().querySelector(".empty-state")).toBeTruthy()
      })

      // Return on an empty field said "Nenhum versículo com « »".
      it("does not search for nothing", async () => {
        await component.onSearchSubmit("")
        await component.onSearchSubmit("   ")
        fixture.detectChanges()

        expect(apiService.search).not.toHaveBeenCalled()
        expect(component.hasSearched).toBe(false)
        expect(host().querySelector(".empty-state")?.textContent).toContain(
          "Procure versículos",
        )
      })

      it("offers a book by its name", () => {
        bookService.findBook.mockReturnValue(john)
        component.onTyping("João")
        expect(component.passageSuggestion?.label).toBe(
          "Abrir Evangelho segundo São João",
        )
      })

      // A book's name is also a word: "sabedoria" never reached the search,
      // and Return left for the Book of Wisdom.
      describe("for a book's name", () => {
        const wisdom = {
          id: "wis",
          name: "Livro da Sabedoria",
          shortName: "Sabedoria",
          abrv: "Sb",
        } as Book

        beforeEach(() => bookService.findBook.mockReturnValue(wisdom))

        it("searches it as a word on the pause, still offering the book", async () => {
          vi.useFakeTimers()
          component.onTyping("sabedoria")
          expect(component.pendingSearch).toBe(true)

          await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)
          expect(apiService.search).toHaveBeenCalledTimes(1)
          expect(apiService.search).toHaveBeenCalledWith("sabedoria", 1)
          expect(router.navigate).not.toHaveBeenCalled()
          expect(component.passageSuggestion?.label).toBe(
            "Abrir Livro da Sabedoria",
          )
        })

        it("opens the book on Return", async () => {
          vi.useFakeTimers()
          apiService.getVerse.mockReturnValue(of({} as Verse))
          void component.onSearchSubmit("sabedoria")
          await vi.advanceTimersByTimeAsync(0)

          expect(router.navigate).toHaveBeenCalledWith(["/", "wis", 1], {})
          expect(apiService.search).not.toHaveBeenCalled()
        })

        // Return before the pause: the pause then searched the name, which
        // superseded the book still being looked up, and nothing opened.
        it("opens it on Return even when the lookup outlasts the pause", async () => {
          vi.useFakeTimers()
          const verse = new Subject<Verse>()
          apiService.getVerse.mockReturnValue(verse)
          component.onTyping("sabedoria")
          void component.onSearchSubmit("sabedoria")
          await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)
          expect(apiService.search).not.toHaveBeenCalled()

          verse.next({} as Verse)
          verse.complete()
          await vi.advanceTimersByTimeAsync(0)
          expect(router.navigate).toHaveBeenCalledWith(["/", "wis", 1], {})
        })
      })

      it("offers the choice for a psalm the liturgy numbers otherwise", () => {
        referenceService.extract.mockReturnValue([
          { book: "Sl", chapter: 94 },
        ] as unknown as ReturnType<BibleReferenceService["extract"]>)
        bookService.findBook.mockReturnValue({
          id: "psa",
          name: "Livro dos Salmos",
          shortName: "Salmos",
          abrv: "Sl",
        } as Book)
        component.onTyping("Sl 94")
        expect(component.passageSuggestion?.label).toBe("Escolher o Salmo 94")
      })

      // Before, "Escolher o Salmo 94" stayed above the two psalms it offered.
      it("goes away once taken up", async () => {
        vi.useFakeTimers()
        referenceService.extract.mockReturnValue([
          { book: "Sl", chapter: 94 },
        ] as unknown as ReturnType<BibleReferenceService["extract"]>)
        bookService.findBook.mockReturnValue({
          id: "psa",
          name: "Livro dos Salmos",
          shortName: "Salmos",
          abrv: "Sl",
        } as Book)
        apiService.getVerse.mockReturnValue(
          of({ text: [] } as unknown as Verse),
        )
        component.onTyping("Sl 94")
        ;(host().querySelector(".passage-suggestion") as HTMLElement).click()
        await vi.advanceTimersByTimeAsync(0)
        fixture.detectChanges()

        expect(component.psalmChoice?.length).toBe(2)
        expect(component.passageSuggestion).toBeNull()
        expect(host().querySelector(".passage-suggestion")).toBeNull()
      })

      // Before, nothing showed for the whole pause: it read as broken.
      it("says it is searching until the search runs", async () => {
        vi.useFakeTimers()
        component.onTyping("pastor")
        expect(component.passageSuggestion).toBeNull()
        expect(host().textContent).toContain("A procurar…")

        await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)
        expect(apiService.search).toHaveBeenCalledTimes(1)
        expect(apiService.search).toHaveBeenCalledWith("pastor", 1)
        expect(component.pendingSearch).toBe(false)
      })

      it("waits for nothing once the text is cleared", () => {
        component.onTyping("pastor")
        component.onTyping("")
        expect(component.pendingSearch).toBe(false)
        expect(component.passageSuggestion).toBeNull()
        expect(host().textContent).toContain("Por exemplo: Jo 3,16")
      })
    })

    describe("with results", () => {
      let field: HTMLInputElement

      beforeEach(() => {
        apiService.search.mockReturnValue(
          of({
            verses: [
              {
                bookId: "jhn",
                chapterNumber: 10,
                number: 11,
                text: [{ type: "text", text: "Eu sou o bom pastor." }],
              } as Verse,
            ],
            total: 1,
            currentPage: 1,
            totalPages: 1,
          }),
        )
        field = document.createElement("input")
        document.body.appendChild(field)
        field.focus()
      })

      afterEach(() => field.remove())

      // Before, the pause's search closed the keyboard mid-query.
      it("keeps the field in use", async () => {
        vi.useFakeTimers()
        component.onTyping("pastor")
        await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

        expect(component.searchResults.length).toBe(1)
        expect(document.activeElement).toBe(field)
      })

      // Before, "amor " came back as "amor", and typing on gave "amorde".
      it("leaves what is being typed as it is", async () => {
        vi.useFakeTimers()
        component.onTyping("pastor ")
        await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

        expect(component.searchTerm).toBe("pastor")
        expect(component.fieldValue).toBe("")
      })

      it("closes the keyboard over the results after Return", async () => {
        vi.useFakeTimers()
        void component.onSearchSubmit("pastor")
        await vi.advanceTimersByTimeAsync(0)

        expect(component.fieldValue).toBe("pastor")
        expect(document.activeElement).not.toBe(field)
      })
    })
  })

  /** Past the wait for the book list, which a shared query goes through. */
  const booksSettled = () => new Promise((resolve) => setTimeout(resolve))

  it("should run a shared query from the q query param on init", async () => {
    queryParamMapSubject.next(convertToParamMap({ q: "shared text" }))
    const submitSpy = vi
      .spyOn(component, "onSearchSubmit")
      .mockReturnValue(undefined as never)

    component.ngOnInit()
    await booksSettled()

    expect(submitSpy).toHaveBeenCalledWith("shared text")
  })

  it("should run a second shared query without re-creating the component", async () => {
    const submitSpy = vi
      .spyOn(component, "onSearchSubmit")
      .mockReturnValue(undefined as never)
    component.ngOnInit()

    queryParamMapSubject.next(convertToParamMap({ q: "first" }))
    await booksSettled()
    queryParamMapSubject.next(convertToParamMap({ q: "second" }))
    await booksSettled()

    expect(submitSpy).toHaveBeenCalledWith("first")
    expect(submitSpy).toHaveBeenCalledWith("second")
  })

  it("should not re-run the same shared query on an unrelated emission", async () => {
    const submitSpy = vi
      .spyOn(component, "onSearchSubmit")
      .mockReturnValue(undefined as never)
    component.ngOnInit()

    queryParamMapSubject.next(convertToParamMap({ q: "same" }))
    await booksSettled()
    queryParamMapSubject.next(convertToParamMap({ q: "same" }))
    await booksSettled()

    expect(submitSpy).toHaveBeenCalledTimes(1)
  })

  it("should re-run a shared query that went away and came back", async () => {
    const submitSpy = vi
      .spyOn(component, "onSearchSubmit")
      .mockReturnValue(undefined as never)
    component.ngOnInit()

    queryParamMapSubject.next(convertToParamMap({ q: "same" }))
    await booksSettled()
    queryParamMapSubject.next(convertToParamMap({}))
    await booksSettled()
    queryParamMapSubject.next(convertToParamMap({ q: "same" }))
    await booksSettled()

    expect(submitSpy).toHaveBeenCalledTimes(2)
  })

  // A cold start from a share: run at once, "João 3,16" found no book and
  // became a word search.
  describe("a shared query while the book list loads", () => {
    let finishLoading: () => void
    let failLoading: (error: Error) => void

    beforeEach(() => {
      bookService.initializeBooks.mockReturnValue(
        new Promise<void>((resolve, reject) => {
          finishLoading = resolve
          failLoading = reject
        }),
      )
      referenceService.extract.mockReturnValue([])
      apiService.getVerse.mockReturnValue(of({} as Verse))
      apiService.search.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )
      queryParamMapSubject.next(convertToParamMap({ q: "João 3,16" }))
    })

    it("waits for the books, then opens the passage", async () => {
      fixture.detectChanges()
      await booksSettled()
      expect(apiService.search).not.toHaveBeenCalled()
      expect(router.navigate).not.toHaveBeenCalled()

      referenceService.extract.mockReturnValue([
        { book: "João", chapter: 3, verses: [{ type: "single", verse: 16 }] },
      ] as never)
      bookService.findBook.mockReturnValue({
        id: "jhn",
        abrv: "Jo",
        chapterCount: 21,
      } as Book)
      finishLoading()
      await booksSettled()

      expect(apiService.getVerse).toHaveBeenCalledWith("jhn", 3, 16)
      expect(apiService.search).not.toHaveBeenCalled()
    })

    it("still searches when the books fail to load", async () => {
      fixture.detectChanges()

      failLoading(new Error("offline"))
      await booksSettled()

      expect(apiService.search).toHaveBeenCalledWith("João 3,16", 1)
    })

    it("runs nothing once the page is gone", async () => {
      fixture.detectChanges()

      fixture.destroy()
      finishLoading()
      await booksSettled()

      expect(apiService.search).not.toHaveBeenCalled()
    })

    it("yields to a search submitted during the wait", async () => {
      fixture.detectChanges()

      await component.onSearchSubmit("luz")
      finishLoading()
      await booksSettled()

      expect(apiService.search).toHaveBeenCalledTimes(1)
      expect(apiService.search).toHaveBeenCalledWith("luz", 1)
    })

    it("runs only the latest of two shared queries", async () => {
      fixture.detectChanges()

      queryParamMapSubject.next(convertToParamMap({ q: "luz" }))
      finishLoading()
      await booksSettled()

      expect(apiService.search).toHaveBeenCalledTimes(1)
      expect(apiService.search).toHaveBeenCalledWith("luz", 1)
    })
  })

  it("should open a standalone introduction at /intro without probing a verse", async () => {
    referenceService.extract.mockReturnValue([])
    bookService.findBook.mockReturnValue({
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
    const submitSpy = vi
      .spyOn(component, "onSearchSubmit")
      .mockReturnValue(undefined as never)

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

    referenceService.extract.mockReturnValue([
      {
        match: "John 3:16",
        index: 0,
        book: "John",
        chapter: 3,
        verses: [{ type: "single", verse: 16 }],
      },
    ])
    bookService.findBook.mockReturnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.mockReturnValue(of(verse))

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

    referenceService.extract.mockReturnValue([])

    bookService.findBook.mockImplementation((text: string) => {
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

    apiService.getVerse.mockReturnValue(of(verse))

    await component.onSearchSubmit("lc")

    expect(referenceService.extract).toHaveBeenCalledWith("lc")
    expect(bookService.findBook).toHaveBeenCalledWith("lc")
    expect(router.navigate).toHaveBeenCalledWith(["/", "luk", 1], {})
  })

  it("should discard a page that arrives after a newer search took over", async () => {
    vi.useFakeTimers()
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
    apiService.search.mockReturnValue(pendingPage$.asObservable())

    component.sentinel = {
      nativeElement: document.createElement("div"),
    } as SearchComponent["sentinel"]

    const callback = observerCallback
    if (!callback) {
      throw new Error("IntersectionObserver callback was not registered")
    }
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(apiService.search).toHaveBeenCalledWith("beginning", 2)

    // A newer search takes over while A's page is still pending.
    const newerSearch$ = new Subject<VersePage>()
    apiService.search.mockReturnValue(newerSearch$.asObservable())
    referenceService.extract.mockReturnValue([])
    void component.onSearchSubmit("light")
    await vi.advanceTimersByTimeAsync(0)
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
    await vi.advanceTimersByTimeAsync(0)

    expect(component.searchResults.length).toBe(resultsUnderNewSearch)
    expect(
      component.searchResults.some((verse) =>
        verse.text.some((part) => part.text === "Stale second verse"),
      ),
    ).toBe(false)
    // The newer search is still loading; the stale page must not say otherwise.
    expect(component.isLoading).toBe(true)

    newerSearch$.complete()
    await vi.advanceTimersByTimeAsync(0)
  })

  it("should keep loadMoreResults locked until the next page arrives", async () => {
    vi.useFakeTimers()
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
    apiService.search.mockReturnValue(pendingPage$.asObservable())

    component.sentinel = {
      nativeElement: document.createElement("div"),
    } as SearchComponent["sentinel"]

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
    await vi.advanceTimersByTimeAsync(0)
    // Second intersection while the first request is still pending must not
    // start another request.
    trigger()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiService.search).toHaveBeenCalledTimes(1)
    expect(apiService.search).toHaveBeenCalledWith("beginning", 2)

    pendingPage$.next({
      verses: [nextVerse],
      total: 2,
      currentPage: 2,
      totalPages: 2,
    } as VersePage)
    pendingPage$.complete()
    await vi.advanceTimersByTimeAsync(0)

    expect(apiService.search).toHaveBeenCalledTimes(1)
    expect(component.searchResults).toEqual([
      expect.objectContaining({ number: 1 }),
      expect.objectContaining({ number: 2 }),
    ])
    expect(component.currentPage).toBe(2)
    expect(component.isLoading).toBe(false)
  })

  it("should show a snackbar when a direct reference is invalid", async () => {
    referenceService.extract.mockReturnValue([
      {
        match: "John 3:99",
        index: 0,
        book: "John",
        chapter: 3,
        verses: [{ type: "single", verse: 99 }],
      },
    ])
    bookService.findBook.mockReturnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.mockReturnValue(
      new Observable((subscriber) => {
        subscriber.error({ status: 404 })
      }),
    )

    vi.spyOn(console, "error").mockReturnValue(undefined)
    await component.onSearchSubmit("John 3:99")

    expect(console.error).toHaveBeenCalled()
    expect(snackBar.open).toHaveBeenCalledWith(
      "Este capítulo ou versículo não existe.",
      "Fechar",
      { duration: 3000 },
    )
    expect(router.navigate).not.toHaveBeenCalled()
  })

  describe("a theme of the pastoral index", () => {
    const offered = () =>
      Array.from(
        (
          fixture.nativeElement as HTMLElement
        ).querySelectorAll<HTMLAnchorElement>("a.passage-suggestion"),
      )

    beforeEach(() => {
      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )
      component.ngOnInit()
    })

    it("is offered at once, whatever the accents", () => {
      component.onTyping("abba")

      expect(offered().map((link) => link.getAttribute("href"))).toEqual([
        "/indice/abba",
      ])
      expect(offered()[0].textContent).toContain("Abbá")
      expect(apiService.search).not.toHaveBeenCalled()
    })

    it("offers a few, those beginning with what is typed", () => {
      component.onTyping("ab")
      expect(offered().length).toBe(3)
      expect(offered()[0].getAttribute("href")).toBe("/indice/abba")

      // Only in the middle of "Aarão": most titles have some such piece.
      component.onTyping("arao")
      expect(offered().map((link) => link.getAttribute("href"))).toEqual([])
    })

    it("is offered for a word later in its title", () => {
      component.onTyping("fraterna")
      expect(offered().map((link) => link.getAttribute("href"))).toEqual([
        "/indice/correcao-fraterna",
      ])
    })

    it("finds a word after a slash, as in Olhar/olhos", () => {
      component.onTyping("olhos")
      expect(offered().map((link) => link.getAttribute("href"))).toContain(
        "/indice/olhar-olhos",
      )
    })

    it("offers the titles it starts before those it's only a word in", () => {
      component.onTyping("cristo")
      expect(offered()[0].getAttribute("href")).toBe("/indice/cristo-cristao")
    })

    it("is gone once the field no longer names it", () => {
      component.onTyping("abba")
      component.onTyping("")
      expect(offered()).toEqual([])
    })

    it("stays above the results of searching its words", async () => {
      await component.onSearchSubmit("abba")
      fixture.detectChanges()

      expect(offered().length).toBe(1)
      expect(apiService.search).toHaveBeenCalledWith("abba", 1)
    })

    it("opens in the index", () => {
      component.onTyping("abba")
      const click = new MouseEvent("click", { cancelable: true })
      offered()[0].dispatchEvent(click)

      expect(click.defaultPrevented).toBe(true)
      expect(router.navigate).toHaveBeenCalledWith(["/indice", "abba"])
    })

    it("leaves a modified click to the browser", () => {
      const click = new MouseEvent("click", { ctrlKey: true })
      component.openTheme(click, "abba")

      expect(router.navigate).not.toHaveBeenCalled()
    })
  })

  describe("a typed reference", () => {
    const about: Book = {
      id: "about",
      abrv: "Sobre",
      shortName: "Sobre a Bíblia",
      name: "Sobre a Bíblia dos Capuchinhos",
      chapterCount: 1,
    }
    const john: Book = {
      id: "jhn",
      abrv: "Jo",
      shortName: "João",
      name: "Evangelho segundo São João",
      chapterCount: 21,
    }
    const reference = (book: string, chapter: number, verse?: number) => ({
      match: `${book} ${chapter}`,
      index: 0,
      book,
      chapter,
      ...(verse ? { verses: [{ type: "single" as const, verse }] } : {}),
    })

    beforeEach(() => {
      apiService.search.mockReturnValue(
        of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
      )
      component.ngOnInit()
    })

    // findBook falls back to the About page for a book it doesn't know:
    // "1 Co 13,4" offered "Abrir Sobre a Bíblia 13,4", and Return asked for
    // /about/13/4, which doesn't exist.
    it("never takes a book it doesn't know for the About page", async () => {
      vi.useFakeTimers()
      referenceService.extract.mockReturnValue([reference("1 Xy", 13, 4)])
      bookService.findBook.mockReturnValue(about)

      component.onTyping("1 Xy 13,4")
      expect(component.passageSuggestion).toBeNull()

      void component.onSearchSubmit("1 Xy 13,4")
      await vi.advanceTimersByTimeAsync(0)
      expect(apiService.getVerse).not.toHaveBeenCalled()
      expect(router.navigate).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)
    })

    it("opens the book that the typed abbreviation names", async () => {
      const corinthians: Book = {
        id: "1co",
        abrv: "1 Cor",
        shortName: "1 Coríntios",
        name: "Primeira Carta aos Coríntios",
        chapterCount: 16,
      }
      referenceService.extract.mockReturnValue([reference("1 Co", 13, 4)])
      bookService.findTypedBook.mockImplementation((text: string) =>
        text === "1 Co" ? corinthians : undefined,
      )
      apiService.getVerse.mockReturnValue(of({} as Verse))

      component.onTyping("1 Co 13,4")
      expect(component.passageSuggestion?.label).toBe("Abrir 1 Coríntios 13,4")
      await component.onSearchSubmit("1 Co 13,4")

      expect(router.navigate).toHaveBeenCalledWith(["/", "1co", 13], {
        queryParams: { verseStart: 4 },
      })
    })

    it("offers no chapter past the book's last, and says so at once", async () => {
      referenceService.extract.mockReturnValue([reference("Jo", 99)])
      bookService.findBook.mockReturnValue(john)

      component.onTyping("Jo 99")
      expect(component.passageSuggestion).toBeNull()
      expect(component.pendingSearch).toBe(false)

      await component.onSearchSubmit("Jo 99")
      expect(apiService.getVerse).not.toHaveBeenCalled()
      expect(snackBar.open).toHaveBeenCalledWith(
        "Este capítulo ou versículo não existe.",
        "Fechar",
        { duration: 3000 },
      )
      expect(router.navigate).not.toHaveBeenCalled()
    })
  })

  describe("back from a result", () => {
    const page = (count: number): VersePage => ({
      verses: Array.from({ length: count }, (_, i) => ({
        bookId: "jhn",
        chapterNumber: 10,
        number: i + 1,
        verseLabel: `${i + 1}`,
        text: [{ type: "text", text: "Eu sou o bom pastor." }],
      })),
      total: count,
      currentPage: 1,
      totalPages: 1,
    })

    beforeEach(() => {
      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(of(page(40)))
    })

    it("keeps the query in the URL, without a step back of its own", async () => {
      component.ngOnInit()
      await component.onSearchSubmit("bom pastor")

      expect(location.replaceState).toHaveBeenCalledWith(
        "/search",
        "q=bom%20pastor",
      )
    })

    // Back came to an empty search: the query, the results and the place in
    // them were gone, and the keyboard came up over the page.
    it("finds the results where they were left, without searching again", async () => {
      // The page's height, which the app sets: the list scrolls within it.
      document.documentElement.style.setProperty("--app-inset-bottom", "0px")
      fixture.detectChanges()
      await component.onSearchSubmit("bom pastor")
      fixture.detectChanges()
      const list = fixture.nativeElement.querySelector(
        ".results-section",
      ) as HTMLElement
      list.scrollTop = 300
      const scrolled = list.scrollTop
      expect(scrolled).toBeGreaterThan(0)
      // A result's click takes the page down before the click bubbles up, as
      // the router does; a screen reader's activation is a click alone.
      const result = list.querySelectorAll(".result-item")[12] as HTMLElement
      result.addEventListener("click", () => fixture.destroy())
      result.click()

      navigationTrigger = "popstate"
      queryParamMapSubject.next(convertToParamMap({ q: "bom pastor" }))
      const back = TestBed.createComponent(SearchComponent)
      // As in the app, the router is done navigating by ngOnInit.
      navigationTrigger = null
      back.detectChanges()
      await back.whenStable()

      expect(apiService.search).toHaveBeenCalledTimes(1)
      expect(back.componentInstance.fieldValue).toBe("bom pastor")
      expect(back.componentInstance.searchResults.length).toBe(40)
      expect(back.componentInstance.statusMessage).toBe("40 resultados")
      const restored = back.nativeElement.querySelector(
        ".results-section",
      ) as HTMLElement
      // Set once the list is drawn, as the app's next render does.
      TestBed.inject(ApplicationRef).tick()
      expect(restored.scrollTop).toBe(scrolled)
      document.documentElement.style.removeProperty("--app-inset-bottom")
    })

    // Only Back restores: a share or a link to the same query searches anew.
    it("searches again for a shared query of the term it kept", async () => {
      fixture.detectChanges()
      await component.onSearchSubmit("bom pastor")
      fixture.destroy()

      navigationTrigger = "imperative"
      queryParamMapSubject.next(convertToParamMap({ q: "bom pastor" }))
      const shared = TestBed.createComponent(SearchComponent)
      shared.detectChanges()
      await booksSettled()
      await shared.whenStable()

      expect(apiService.search).toHaveBeenCalledTimes(2)
    })

    // A search answering after the page had gone wrote its query into the
    // URL of the page that replaced it.
    it("leaves the next page's URL alone when a search answers late", async () => {
      const answer = new Subject<VersePage>()
      apiService.search.mockReturnValue(answer)
      fixture.detectChanges()
      const searching = component.onSearchSubmit("bom pastor")
      fixture.destroy()

      answer.next(page(3))
      answer.complete()
      await searching

      expect(location.replaceState).not.toHaveBeenCalled()
    })

    // Leaving without a click (Android's back button, iOS's native Back) kept
    // the place noted in the previous results for the new ones.
    it("keeps no place from a previous search", async () => {
      document.documentElement.style.setProperty("--app-inset-bottom", "0px")
      fixture.detectChanges()
      await component.onSearchSubmit("bom pastor")
      fixture.detectChanges()
      const list = fixture.nativeElement.querySelector(
        ".results-section",
      ) as HTMLElement
      list.scrollTop = 300
      ;(fixture.nativeElement as HTMLElement).click()

      await component.onSearchSubmit("luz")
      fixture.destroy()

      expect(TestBed.inject(SearchMemoryService).last).toEqual(
        expect.objectContaining({ term: "luz", scrollTop: 0 }),
      )
      document.documentElement.style.removeProperty("--app-inset-bottom")
    })

    it("searches again for a query it didn't keep", async () => {
      fixture.detectChanges()
      await component.onSearchSubmit("bom pastor")
      fixture.destroy()

      queryParamMapSubject.next(convertToParamMap({ q: "luz" }))
      const other = TestBed.createComponent(SearchComponent)
      other.detectChanges()
      await booksSettled()
      await other.whenStable()

      expect(apiService.search).toHaveBeenCalledWith("luz", 1)
    })
  })

  it("should release the loading lock when a failed reference supersedes a text search", async () => {
    vi.useFakeTimers()
    // The text search goes stale the moment the reference is submitted, so its
    // own `finally` no longer clears `isLoading`; the reference path has to.
    const pendingSearch$ = new Subject<VersePage>()
    apiService.search.mockReturnValue(pendingSearch$.asObservable())
    referenceService.extract.mockReturnValue([])
    void component.onSearchSubmit("light")
    await vi.advanceTimersByTimeAsync(0)
    expect(component.isLoading).toBe(true)

    referenceService.extract.mockReturnValue([
      { match: "John 99:1", index: 0, book: "John", chapter: 99 },
    ])
    bookService.findBook.mockReturnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.mockReturnValue(throwError(() => ({ status: 404 })))
    vi.spyOn(console, "error").mockReturnValue(undefined)
    void component.onSearchSubmit("John 99:1")
    await vi.advanceTimersByTimeAsync(0)

    pendingSearch$.next({
      verses: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    })
    pendingSearch$.complete()
    await vi.advanceTimersByTimeAsync(0)

    expect(component.isLoading).toBe(false)
    // Paging and highlighting belong to the search whose results show: none
    // had finished, so not "light" (it never answered) nor the reference.
    expect(component.searchTerm).toBe("")
  })

  describe("when a reference supersedes a word search under way", () => {
    const john = {
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    } as Book
    const lightPage = {
      verses: [
        {
          bookId: "gen",
          chapterNumber: 1,
          number: 3,
          verseLabel: "3",
          text: [{ type: "text", text: "Faça-se a luz" }],
        },
      ],
      total: 1,
      currentPage: 1,
      totalPages: 1,
    } as VersePage
    let pendingSearch$: Subject<VersePage>

    beforeEach(() => {
      vi.spyOn(console, "error").mockReturnValue(undefined)
      pendingSearch$ = new Subject<VersePage>()
      referenceService.extract.mockImplementation((text: string) =>
        text.startsWith("Jo ")
          ? [{ match: text, index: 0, book: "Jo", chapter: 99 }]
          : [],
      )
      bookService.findBook.mockImplementation((name: string) =>
        name === "Jo" ? john : (undefined as unknown as Book),
      )
      apiService.getVerse.mockReturnValue(throwError(() => ({ status: 404 })))
    })

    it("stops saying it is searching after a failed reference", async () => {
      vi.useFakeTimers()
      apiService.search.mockReturnValue(of(lightPage))
      void component.onSearchSubmit("luz")
      await vi.advanceTimersByTimeAsync(0)
      apiService.search.mockReturnValue(pendingSearch$.asObservable())
      void component.onSearchSubmit("amor")
      await vi.advanceTimersByTimeAsync(0)
      expect(component.resultsHeading).toBe("A procurar…")

      void component.onSearchSubmit("Jo 99,1")
      await vi.advanceTimersByTimeAsync(0)
      pendingSearch$.next({
        verses: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      })
      pendingSearch$.complete()
      await vi.advanceTimersByTimeAsync(0)

      // Back to the results on screen, which are still those for "luz".
      expect(component.searching).toBe(false)
      expect(component.resultsHeading).toBe("1 resultado")
      expect(component.statusMessage).toBe("1 resultado")
      expect(component.searchTerm).toBe("luz")
    })

    it("doesn't claim no results for a search that never answered", async () => {
      vi.useFakeTimers()
      apiService.search.mockReturnValue(pendingSearch$.asObservable())
      void component.onSearchSubmit("amor")
      await vi.advanceTimersByTimeAsync(0)

      void component.onSearchSubmit("Jo 99,1")
      await vi.advanceTimersByTimeAsync(0)
      fixture.detectChanges()

      const text = fixture.nativeElement.textContent as string
      expect(text).not.toContain("Nenhum resultado")
      expect(text).not.toContain("A procurar")
      expect(component.statusMessage).toBe("")
    })

    it("ignores the stored Bible's answer to a superseded search", async () => {
      vi.useFakeTimers()
      network.isOffline = true
      let answer: (verses: Verse[]) => void = () => {}
      offlineSearch.search.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve
        }),
      )
      void component.onSearchSubmit("amor")
      await vi.advanceTimersByTimeAsync(0)

      void component.onSearchSubmit("Jo 99,1")
      await vi.advanceTimersByTimeAsync(0)
      answer(lightPage.verses)
      await vi.advanceTimersByTimeAsync(0)

      expect(component.searchResults).toEqual([])
      expect(component.storedMatches).toBeNull()
    })
  })

  it("should release the loading lock when the reference navigation is refused", async () => {
    vi.useFakeTimers()
    // router.navigate resolves false on a cancelled navigation: no throw, and
    // the superseded text search no longer clears the flag itself.
    const pendingSearch$ = new Subject<VersePage>()
    apiService.search.mockReturnValue(pendingSearch$.asObservable())
    referenceService.extract.mockReturnValue([])
    void component.onSearchSubmit("light")
    await vi.advanceTimersByTimeAsync(0)

    bookService.findBook.mockReturnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.mockReturnValue(of({ text: [] } as unknown as Verse))
    router.navigate.mockResolvedValue(false)
    void component.onSearchSubmit("Jo")
    await vi.advanceTimersByTimeAsync(0)

    expect(component.isLoading).toBe(false)
  })

  it("should populate search results and announce the count", async () => {
    const scrollToTopSpy = vi
      .spyOn(component, "scrollToTop")
      .mockReturnValue(undefined)
    referenceService.extract.mockReturnValue([])
    apiService.search.mockReturnValue(
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
    // The heading has the count; a toast over the list only hid a result.
    expect(snackBar.open).not.toHaveBeenCalled()
    expect(component.resultsHeading).toBe("1 resultado")
    expect(component.statusMessage).toBe("1 resultado")
    expect(scrollToTopSpy).toHaveBeenCalled()
  })

  it("should announce when no search results are found", async () => {
    const scrollToTopSpy = vi
      .spyOn(component, "scrollToTop")
      .mockReturnValue(undefined)
    referenceService.extract.mockReturnValue([])
    apiService.search.mockReturnValue(
      of({ verses: [], total: 0, currentPage: 1, totalPages: 0 } as VersePage),
    )

    await component.onSearchSubmit("missing")

    expect(component.searchResults).toEqual([])
    expect(snackBar.open).not.toHaveBeenCalled()
    expect(component.statusMessage).toBe("Nenhum resultado para «missing»")
    expect(scrollToTopSpy).toHaveBeenCalled()
  })

  // The search returns the 100 verses nearest in meaning: a cap, not a count.
  it("says when the results are the most relevant, not all", async () => {
    referenceService.extract.mockReturnValue([])
    component.meaningSearchConsent = true
    apiService.searchByMeaning.mockReturnValue(
      of({
        verses: [],
        total: 100,
        currentPage: 1,
        totalPages: 2,
      } as VersePage),
    )
    await component.onSearchSubmit("luz")
    expect(component.resultsHeading).toBe("Os 100 mais relevantes")

    apiService.searchByMeaning.mockReturnValue(
      of({ verses: [], total: 23, currentPage: 1, totalPages: 1 } as VersePage),
    )
    await component.onSearchSubmit("Betel")
    expect(component.resultsHeading).toBe("23 resultados")
  })

  it("counts a word search's results, however many", async () => {
    referenceService.extract.mockReturnValue([])
    apiService.search.mockReturnValue(
      of({
        verses: [],
        total: 340,
        currentPage: 1,
        totalPages: 7,
      } as VersePage),
    )
    await component.onSearchSubmit("Deus")
    expect(component.resultsHeading).toBe("340 resultados")
  })

  describe("without a connection", () => {
    const stored = (bookId: string, number: number, text: string) =>
      ({
        bookId,
        chapterNumber: 1,
        number,
        text: [{ type: "text", text }],
      }) as Verse

    beforeEach(() => {
      referenceService.extract.mockReturnValue([])
      network.isOffline = true
      network.isOffline$.next(true)
    })

    it("searches the words in the Bible stored on the device", async () => {
      offlineSearch.search.mockResolvedValue([
        stored("gen", 3, "Deus disse: «Faça-se a luz.»"),
        stored("jhn", 5, "A Luz brilhou nas trevas,"),
      ])
      await component.onSearchSubmit("luz")
      fixture.detectChanges()

      expect(apiService.search).not.toHaveBeenCalled()
      expect(offlineSearch.search).toHaveBeenCalledWith("luz")
      expect(component.resultsHeading).toBe("2 versículos com estas palavras")
      expect(fixture.nativeElement.textContent).toContain(
        "Sem ligação: procura as palavras no texto guardado.",
      )
      expect(component.searchResults[1].highlightedSegments).toEqual([
        { text: "A ", highlight: false },
        { text: "Luz", highlight: true },
        { text: " brilhou nas trevas,", highlight: false },
      ])
    })

    it("shows them a page at a time", async () => {
      offlineSearch.search.mockResolvedValue(
        Array.from({ length: 120 }, (_, index) =>
          stored("psa", index + 1, "Senhor"),
        ),
      )
      await component.onSearchSubmit("Senhor")
      expect(component.searchResults.length).toBe(50)
      expect(component.resultsHeading).toBe("120 versículos com estas palavras")

      // Scrolling to the end of the list shows the next page.
      fixture.detectChanges()
      expect(observerCallback).not.toBeNull()
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
      expect(component.searchResults.length).toBe(100)
    })

    // The native search field (NativeChromeService) marks nothing for
    // checking: only the page's own detectChanges() renders the results. The
    // end of the list went unwatched, and the list stopped at its first page.
    it("watches the end of the list from the first page, without a check from above", async () => {
      offlineSearch.search.mockResolvedValue(
        Array.from({ length: 120 }, (_, index) =>
          stored("psa", index + 1, "Senhor"),
        ),
      )
      fixture.detectChanges()
      await component.onSearchSubmit("Senhor")

      const end = () =>
        (fixture.nativeElement as HTMLElement).querySelector(".sentinel")
      expect(end()).not.toBeNull()
      expect(observed).toBe(end())

      const scrollToEnd = () =>
        observerCallback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      scrollToEnd()
      expect(component.searchResults.length).toBe(100)
      expect(observed).toBe(end())

      // The last page: nothing left to watch for.
      scrollToEnd()
      expect(component.searchResults.length).toBe(120)
      expect(end()).toBeNull()
      expect(observed).toBeNull()
    })

    // iOS 27 lays the list out at fractions of a pixel: the one-pixel end,
    // inside the list's clipped corners, showed only 58 to 83% at some
    // lengths. Waiting for all of it (threshold 1) stopped the list at 100.
    it("shows the next page once any of the end of the list is in view", async () => {
      offlineSearch.search.mockResolvedValue(
        Array.from({ length: 120 }, (_, index) =>
          stored("psa", index + 1, "Senhor"),
        ),
      )
      fixture.detectChanges()
      await component.onSearchSubmit("Senhor")

      expect(observed).not.toBeNull()
      expect(observerOptions?.threshold ?? 0).toBe(0)
    })

    it("says so when no Bible is stored yet", async () => {
      offlineSearch.search.mockResolvedValue(null)
      await component.onSearchSubmit("luz")
      fixture.detectChanges()

      expect(component.nothingStored).toBe(true)
      expect(fixture.nativeElement.textContent).toContain(
        "a Bíblia ainda não está guardada neste dispositivo",
      )
    })

    it("tells what search can still do before searching", () => {
      fixture.detectChanges()
      expect(fixture.nativeElement.textContent).toContain(
        "Sem ligação: pode abrir referências",
      )
    })

    it("says when a passage isn't stored yet", async () => {
      referenceService.extract.mockReturnValue([
        { match: "Jo 3,16", index: 0, book: "Jo", chapter: 3 },
      ])
      bookService.findBook.mockReturnValue({ id: "jhn" } as Book)
      apiService.getVerse.mockReturnValue(
        throwError(() => new Error("Offline - verse not cached")),
      )
      vi.spyOn(console, "error").mockReturnValue(undefined)
      await component.onSearchSubmit("Jo 3,16")

      expect(snackBar.open).toHaveBeenCalledWith(
        "Sem ligação, e este capítulo ainda não está guardado neste dispositivo.",
        "OK",
        { duration: 3000 },
      )
    })
  })

  describe("the placeholder rows while searching", () => {
    const skeleton = () =>
      fixture.nativeElement.querySelector(".skeleton") as HTMLElement | null
    const status = () =>
      (
        fixture.nativeElement.querySelector("[role=status]") as HTMLElement
      ).textContent?.trim()

    it("show where the results will be, not an hourglass", async () => {
      const pending$ = new Subject<VersePage>()
      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(pending$.asObservable())
      void component.onSearchSubmit("luz")
      await Promise.resolve()
      fixture.detectChanges()

      const rows = skeleton()?.querySelectorAll(".result-item .result-card")
      expect(rows?.length).toBe(5)
      expect(skeleton()?.getAttribute("aria-hidden")).toBe("true")
      expect(fixture.nativeElement.textContent).not.toContain("hourglass_empty")
      expect(fixture.nativeElement.querySelector(".empty-state")).toBeNull()
      // Told once, by the status line, not by the rows.
      expect(status()).toBe("A procurar…")
      expect(
        fixture.nativeElement.textContent.match(/A procurar…/g),
      ).toHaveLength(1)
    })

    it("are announced during the typing pause too", () => {
      vi.useFakeTimers()
      referenceService.extract.mockReturnValue([])
      component.onTyping("pastor")
      fixture.detectChanges()

      expect(skeleton()).not.toBeNull()
      expect(status()).toBe("A procurar…")
    })

    it("give way to the results", async () => {
      const pending$ = new Subject<VersePage>()
      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(pending$.asObservable())
      void component.onSearchSubmit("luz")
      await Promise.resolve()
      fixture.detectChanges()
      expect(skeleton()).not.toBeNull()

      pending$.next({
        verses: [
          {
            bookId: "gen",
            chapterNumber: 1,
            number: 3,
            verseLabel: "3",
            text: [{ type: "text", text: "Faça-se a luz" }],
          },
        ],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      } as VersePage)
      pending$.complete()
      await vi.waitFor(() => expect(component.isLoading).toBe(false))
      fixture.detectChanges()

      expect(skeleton()).toBeNull()
      expect(
        fixture.nativeElement.querySelectorAll(".result-card").length,
      ).toBe(1)
      expect(status()).toBe("1 resultado")
    })

    it("are not shown on the empty page, after a failure or with no results", async () => {
      fixture.detectChanges()
      expect(skeleton()).toBeNull()

      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(
        of({
          verses: [],
          total: 0,
          currentPage: 1,
          totalPages: 0,
        } as VersePage),
      )
      await component.onSearchSubmit("missing")
      fixture.detectChanges()
      expect(skeleton()).toBeNull()
      expect(fixture.nativeElement.textContent).toContain("Nenhum resultado")

      vi.spyOn(console, "error").mockReturnValue(undefined)
      apiService.search.mockReturnValue(throwError(() => ({ status: 0 })))
      offlineSearch.search.mockResolvedValue(null)
      await component.onSearchSubmit("luz")
      fixture.detectChanges()
      expect(skeleton()).toBeNull()
      expect(component.searchFailed).toBe(true)
    })
  })

  // Before, this looked like "no results", with the status stuck on "A procurar…".
  it("says the search failed when the server fails and nothing is stored", async () => {
    referenceService.extract.mockReturnValue([])
    apiService.search.mockReturnValue(throwError(() => ({ status: 0 })))
    offlineSearch.search.mockResolvedValue(null)
    vi.spyOn(console, "error").mockReturnValue(undefined)
    await component.onSearchSubmit("luz")
    fixture.detectChanges()

    const text = fixture.nativeElement.textContent as string
    expect(component.searchFailed).toBe(true)
    expect(text).toContain("Não foi possível pesquisar")
    expect(text).not.toContain("Nenhum resultado")
    expect(component.statusMessage).toContain("Não foi possível pesquisar")
  })

  // The API limits how often one address may search; "Verifique a ligação"
  // blamed a connection that was fine.
  it("says when there were too many searches, not that the connection failed", async () => {
    referenceService.extract.mockReturnValue([])
    apiService.search.mockReturnValue(throwError(() => ({ status: 429 })))
    offlineSearch.search.mockResolvedValue(null)
    vi.spyOn(console, "error").mockReturnValue(undefined)
    await component.onSearchSubmit("luz")
    fixture.detectChanges()

    const text = fixture.nativeElement.textContent as string
    expect(text).toContain("muitas pesquisas seguidas")
    expect(text).not.toContain("Verifique a ligação")
    expect(component.statusMessage).toContain("muitas pesquisas seguidas")
  })

  // The search by meaning can fail (e.g. its index rebuilding): words still work.
  it("falls back to the stored Bible when the server can't search", async () => {
    referenceService.extract.mockReturnValue([])
    apiService.search.mockReturnValue(throwError(() => ({ status: 503 })))
    offlineSearch.search.mockResolvedValue([
      {
        bookId: "jhn",
        chapterNumber: 1,
        number: 5,
        text: [{ type: "text", text: "A Luz brilhou nas trevas," }],
      } as Verse,
    ])
    await component.onSearchSubmit("luz")
    fixture.detectChanges()

    expect(component.resultsHeading).toBe("1 versículo com estas palavras")
    expect(fixture.nativeElement.textContent).toContain(
      "A pesquisa não respondeu",
    )
    expect(snackBar.open).not.toHaveBeenCalled()
  })

  describe("the results as rendered", () => {
    const luke = {
      id: "luk",
      abrv: "Lc",
      shortName: "Lucas",
      name: "Lucas",
    } as Book
    const psalms = {
      id: "psa",
      abrv: "Sl",
      shortName: "Salmos",
      name: "Salmos",
    } as Book

    beforeEach(async () => {
      referenceService.extract.mockReturnValue([])
      bookService.findBook.mockImplementation(
        (id: string) => ({ luk: luke, psa: psalms })[id] as Book,
      )
      bookService.findBookById.mockImplementation(
        (id: string) => ({ luk: luke, psa: psalms })[id],
      )
      apiService.search.mockReturnValue(
        of({
          verses: [
            {
              bookId: "jdg",
              chapterNumber: 1,
              number: 26,
              text: [
                {
                  type: "text",
                  text: "pôs o nome de Luz, nome que ela conserva.",
                },
              ],
            },
            {
              bookId: "luk",
              chapterNumber: 2,
              number: 32,
              text: [{ type: "text", text: "Luz para se revelar às nações" }],
            },
            {
              bookId: "psa",
              chapterNumber: 136,
              number: 7,
              text: [{ type: "text", text: "Ele fez os grandes luzeiros" }],
            },
          ],
          total: 3,
          currentPage: 1,
          totalPages: 1,
        } as unknown as VersePage),
      )
      await component.onSearchSubmit("luz")
      fixture.detectChanges()
    })

    const all = (selector: string) =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(selector),
      ).map((element) => element.textContent?.trim())
    const links = () =>
      Array.from(
        (
          fixture.nativeElement as HTMLElement
        ).querySelectorAll<HTMLAnchorElement>("a.result-card"),
      )
    const hrefs = () => links().map((link) => link.getAttribute("href"))

    // "nome de Luz , nome": the template put a space before the comma.
    it("keeps the punctuation after a match where the text has it", () => {
      expect(all(".verse-text")[0]).toBe(
        "pôs o nome de Luz, nome que ela conserva.",
      )
    })

    it("cites the passages as the text does", () => {
      expect(all(".verse-ref").slice(1)).toEqual([
        "Lucas 2,32",
        "Salmo 136 (135),7",
      ])
    })

    // A shared /search?q= link answered before the book list had loaded, and
    // findBook's fallback named every result "Sobre a Bíblia 2,32".
    it("names the books only once the book list has loaded", async () => {
      const books = new ReplaySubject<Book[]>(1)
      ;(
        bookService as {
          books$: Observable<Book[]>
        }
      ).books$ = books
      const about = { id: "about", shortName: "Sobre a Bíblia" } as Book
      bookService.findBook.mockReturnValue(about)
      fixture = TestBed.createComponent(SearchComponent)
      component = fixture.componentInstance
      await component.onSearchSubmit("luz")
      fixture.detectChanges()

      expect(all(".verse-ref")).toEqual(["1,26", "2,32", "136,7"])
      // By the book's id until then, which the app still opens.
      expect(hrefs()[1]).toBe("/luk/2?verseStart=32")

      bookService.findBook.mockImplementation(
        (id: string) => ({ luk: luke, psa: psalms })[id] ?? about,
      )
      books.next([luke, psalms])
      fixture.detectChanges()

      expect(all(".verse-ref").slice(1)).toEqual([
        "Lucas 2,32",
        "Salmo 136 (135),7",
      ])
      expect(hrefs()[1]).toBe("/lc/2?verseStart=32")
    })

    // Results were <li routerLink>: Enter and a middle click did nothing, so
    // a keyboard or a screen reader could not open one.
    it("links each result to its passage", () => {
      // The reader's addresses (/lc/2, /sl/136), not the books' ids (/luk/2,
      // /psa/136): only the reader's pages exist on the server, for a new
      // tab. A book missing from the list keeps its id.
      expect(hrefs()).toEqual([
        "/jdg/1?verseStart=26",
        "/lc/2?verseStart=32",
        "/sl/136?verseStart=7",
      ])
      expect(component.passageHref("psa", 95)).toBe("/sl/95")
      expect(component.passageHref("luk", 0)).toBe("/lc/intro")

      links()[1].click()

      expect(router.navigate).toHaveBeenCalledWith(["/", "lc", "2"], {
        queryParams: { verseStart: 32 },
      })
    })

    it("leaves a click with a modifier to the browser, for a new tab", () => {
      const link = (fixture.nativeElement as HTMLElement).querySelector(
        "a.result-card",
      ) as HTMLAnchorElement
      let leftToBrowser = false
      // After the result's own handler: note what it did, then keep the
      // test page where it is.
      link.addEventListener("click", (event) => {
        leftToBrowser = !event.defaultPrevented
        event.preventDefault()
      })

      link.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          metaKey: true,
        }),
      )

      expect(leftToBrowser).toBe(true)
      expect(router.navigate).not.toHaveBeenCalled()
    })

    describe("the matched words", () => {
      const root = document.documentElement
      let wasDark: boolean

      // ThemeService has already followed the machine's own scheme.
      beforeEach(() => {
        wasDark = root.classList.contains("dark-theme")
        root.classList.remove("dark-theme")
      })

      afterEach(() => {
        root.classList.toggle("dark-theme", wasDark)
        document.body.classList.remove("native-chrome")
      })

      const match = () =>
        getComputedStyle(
          (fixture.nativeElement as HTMLElement).querySelector(
            ".search-highlight",
          ) as HTMLElement,
        )

      // Read from a probe: the card's own background is still transitioning.
      const cardBackground = () => {
        const probe = document.createElement("span")
        probe.style.backgroundColor = "var(--card-background)"
        document.body.appendChild(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
      }

      it("keep the light theme's antiquewhite", () => {
        expect(match().backgroundColor).toBe("rgb(250, 235, 215)")
      })

      // White on darkgrey, 2.3:1, was hard to read at night.
      it("stay readable in the dark theme (WCAG AA)", () => {
        root.classList.add("dark-theme")
        const { color, backgroundColor } = match()

        expect(
          contrastRatio(color, backgroundColor, cardBackground()),
        ).toBeGreaterThanOrEqual(4.5)
      })

      it("stay bold on no fill in the iOS app's dark theme", () => {
        root.classList.add("dark-theme")
        document.body.classList.add("native-chrome")

        expect(match().backgroundColor).toBe("rgba(0, 0, 0, 0)")
        expect(match().fontWeight).toBe("700")
      })
    })
  })

  // Most psalms are one lower in the liturgy: "Sl 94" from a leaflet is this
  // edition's 95.
  describe("a psalm number", () => {
    const psalms = {
      id: "psa",
      abrv: "Sl",
      shortName: "Salmos",
      name: "Livro dos Salmos",
      chapterCount: 150,
      chapters: [
        { bookId: "psa", number: 94, title: "SENHOR, DEUS DA JUSTIÇA" },
        { bookId: "psa", number: 95, title: "EXORTAÇÃO AO LOUVOR DE DEUS" },
      ],
    } as unknown as Book
    const verse = (chapterNumber: number, line: string) =>
      ({
        bookId: "psa",
        chapterNumber,
        number: 1,
        text: [
          { type: "quote", text: "\u200b" },
          { type: "text", text: line },
        ],
      }) as Verse

    beforeEach(() => {
      bookService.findBook.mockReturnValue(psalms)
      bookService.findBookById.mockReturnValue(psalms)
      apiService.getVerse.mockImplementation((_book, chapter) =>
        of(
          chapter === 94
            ? verse(94, "Ó Senhor, Deus vingador,")
            : verse(95, "Vinde, exultemos de alegria no Senhor,"),
        ),
      )
    })

    it("offers both psalms it may mean, by how they begin", async () => {
      referenceService.extract.mockReturnValue([
        { match: "Sl 94", index: 0, book: "Sl", chapter: 94 },
      ])
      await component.onSearchSubmit("Sl 94")
      fixture.detectChanges()

      expect(router.navigate).not.toHaveBeenCalled()
      expect(component.psalmChoice).toEqual([
        expect.objectContaining({
          psalm: 94,
          label: "Salmo 94 (93)",
          note: "nesta Bíblia",
          firstLine: "Ó Senhor, Deus vingador,",
        }),
        expect.objectContaining({
          psalm: 95,
          label: "Salmo 95 (94)",
          note: "como na Missa",
          firstLine: "Vinde, exultemos de alegria no Senhor,",
        }),
      ])
      expect(fixture.nativeElement.textContent).toContain("Qual salmo procura?")
      // The reader's address, /sl/94, not the book's id, /psa/94.
      const hrefs = Array.from(
        (
          fixture.nativeElement as HTMLElement
        ).querySelectorAll<HTMLAnchorElement>("a.result-card"),
      ).map((link) => link.getAttribute("href"))
      expect(hrefs).toEqual(["/sl/94", "/sl/95"])
    })

    it("keeps the verses on both", async () => {
      referenceService.extract.mockReturnValue([
        {
          match: "Sl 94,6-7",
          index: 0,
          book: "Sl",
          chapter: 94,
          verses: [{ type: "range", start: 6, end: 7 }],
        },
      ])
      await component.onSearchSubmit("Sl 94,6-7")

      expect(component.psalmChoice?.map((option) => option.verseStart)).toEqual(
        [6, 6],
      )
    })

    it("opens directly when the leaflet gives both numbers", async () => {
      referenceService.extract.mockReturnValue([
        { match: "Sl 95,1-2", index: 0, book: "Sl", chapter: 95 },
      ])
      await component.onSearchSubmit("Sl 94 (95), 1-2")

      expect(referenceService.extract).toHaveBeenCalledWith("Sl 95,1-2")
      expect(component.psalmChoice).toBeNull()
      expect(router.navigate).toHaveBeenCalledWith(["/", "psa", 95], {})
    })

    // The liturgy's Psalm 115 is the second half of this edition's 116.
    it("opens the half of a psalm a pair names", async () => {
      referenceService.extract.mockReturnValue([
        { match: "Sl 116", index: 0, book: "Sl", chapter: 116 },
      ])
      await component.onSearchSubmit("Sl 115 (116B)")

      expect(router.navigate).toHaveBeenCalledWith(["/", "psa", 116], {
        queryParams: { verseStart: 10 },
      })
    })

    it("ends a word search still under way", async () => {
      vi.useFakeTimers()
      bookService.findBook.mockImplementation((name: string) =>
        name === "Sl" ? psalms : (undefined as unknown as Book),
      )
      referenceService.extract.mockReturnValue([])
      apiService.search.mockReturnValue(new Subject<VersePage>())
      void component.onSearchSubmit("amor")
      await vi.advanceTimersByTimeAsync(0)

      referenceService.extract.mockReturnValue([
        { match: "Sl 94", index: 0, book: "Sl", chapter: 94 },
      ])
      void component.onSearchSubmit("Sl 94")
      await vi.advanceTimersByTimeAsync(0)

      expect(component.psalmChoice?.length).toBe(2)
      expect(component.searching).toBe(false)
      expect(component.isLoading).toBe(false)
      expect(component.statusMessage).toBe("Qual salmo procura?")
    })

    it("opens directly where both numberings agree", async () => {
      referenceService.extract.mockReturnValue([
        { match: "Sl 150", index: 0, book: "Sl", chapter: 150 },
      ])
      await component.onSearchSubmit("Sl 150")

      expect(component.psalmChoice).toBeNull()
      expect(router.navigate).toHaveBeenCalledWith(["/", "psa", 150], {})
    })
  })

  it("should disconnect the observer on destroy", () => {
    const observer = createSpyObj<IntersectionObserver>(
      "IntersectionObserver",
      ["disconnect"],
    )
    component["observer"] = observer

    component.ngOnDestroy()

    expect(observer.disconnect).toHaveBeenCalled()
  })

  // A share target can deliver two queries back to back. If A resolves after
  // B, A used to overwrite B's results and clear B's loading state.
  it("should ignore a superseded search that resolves last", async () => {
    referenceService.extract.mockReturnValue([])
    bookService.findBook.mockReturnValue({ id: "about" } as Book)

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

    apiService.search.mockImplementation((text: string) =>
      text === "A" ? from(slowA) : of(page([verseFor("B result")], 1)),
    )

    const first = component.onSearchSubmit("A")
    await component.onSearchSubmit("B")

    expect(component.searchResults[0].text?.[0].text).toBe("B result")

    resolveA(page([verseFor("A result")], 99))
    await first

    expect(component.searchResults[0].text?.[0].text).toBe("B result")
    expect(component.totalResults).toBe(1)
    expect(component.isLoading).toBe(false)
  })
})

describe("SearchComponent in the iOS app", () => {
  let fixture: ComponentFixture<SearchComponent>
  let actions: Subject<NativeChromeAction>
  let nativeChrome: {
    enabled: boolean
    actions$: Subject<NativeChromeAction>
    show: Mock
    hide: Mock
    toast: Mock
  }
  let location: SpyObj<Location>
  let apiService: SpyObj<BibleApiService>

  beforeEach(async () => {
    actions = new Subject()
    nativeChrome = {
      enabled: true,
      actions$: actions,
      show: vi.fn().mockName("show"),
      hide: vi.fn().mockName("hide"),
      toast: vi.fn().mockName("toast"),
    }
    location = createSpyObj("Location", ["back", "replaceState"])
    apiService = createSpyObj("BibleApiService", ["getVerse", "search"])
    apiService.search.mockReturnValue(
      of({ verses: [], total: 0, currentPage: 1, totalPages: 0 }),
    )
    const referenceService = createSpyObj("BibleReferenceService", ["extract"])
    referenceService.extract.mockReturnValue([])
    const bookService = Object.assign(
      createSpyObj<BookService>("BookService", [
        "findBook",
        "findBookById",
        "findTypedBook",
        "getUrlAbrv",
        "getChapterUrlSegment",
      ]),
      { books$: of([{ id: "mat" }]) },
    )
    bookService.findBookById.mockReturnValue({
      abrv: "Mt",
      shortName: "Mateus",
    } as Book)
    bookService.getUrlAbrv.mockImplementation(BookService.prototype.getUrlAbrv)
    bookService.getChapterUrlSegment.mockImplementation(
      BookService.prototype.getChapterUrlSegment,
    )
    const analytics = createSpyObj("AnalyticsService", ["track"])
    analytics.track.mockResolvedValue(undefined)

    await TestBed.configureTestingModule({
      imports: [SearchComponent],
      providers: [
        { provide: NativeChromeService, useValue: nativeChrome },
        { provide: Location, useValue: location },
        { provide: ThemeService, useValue: { currentMode: "dark" } },
        { provide: BibleApiService, useValue: apiService },
        { provide: BibleReferenceService, useValue: referenceService },
        { provide: BookService, useValue: bookService },
        {
          provide: MatSnackBar,
          useValue: {
            open: vi.fn(),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn().mockName("navigate"),
            currentNavigation: () => null,
          },
        },
        { provide: AnalyticsService, useValue: analytics },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({})) },
        },
        {
          provide: SeoService,
          useValue: {
            updateForSearch: vi.fn(),
          },
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
    expect(lastCall(vi.mocked(nativeChrome.show))[0]).toEqual(
      expect.objectContaining({ query: "pastor" }),
    )
  })

  it("searches as people type in the native field", async () => {
    vi.useFakeTimers()
    actions.next({ id: "search-input", text: "pastor" })
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS)

    expect(apiService.search).toHaveBeenCalledWith("pastor", 1)
  })

  // The results heading has the count; a toast over the list hid a result.
  it("shows no results toast", async () => {
    apiService.search.mockReturnValue(
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

    expect(nativeChrome.toast).not.toHaveBeenCalled()
  })

  it("lists the results as an iOS grouped list, matches in bold", async () => {
    document.body.classList.add("native-chrome")
    try {
      apiService.search.mockReturnValue(
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
