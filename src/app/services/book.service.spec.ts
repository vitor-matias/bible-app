import { TestBed } from "@angular/core/testing"
import { of, throwError } from "rxjs"
import { BibleApiService } from "./bible-api.service"

import { BookService } from "./book.service"

describe("BookService", () => {
  let service: BookService
  let apiBooks: Book[]

  const mockBooks: Book[] = [
    {
      id: "gen",
      name: "Gênesis",
      shortName: "Gênesis",
      abrv: "Gn",
      chapterCount: 50,
    },
    {
      id: "exo",
      name: "Êxodo",
      shortName: "Êxodo",
      abrv: "Ex",
      chapterCount: 40,
    },
    {
      id: "psa",
      name: "Psalms",
      shortName: "Psalms",
      abrv: "Ps",
      chapterCount: 150,
    },
    {
      id: "mat",
      name: "Mateus",
      shortName: "Mateus",
      abrv: "Mt",
      chapterCount: 28,
    },
    {
      id: "acts",
      name: "Acts of the Apostles",
      shortName: "Acts",
      abrv: "At",
      chapterCount: 28,
    },
    {
      id: "rom",
      name: "Romans",
      shortName: "Romans",
      abrv: "Rm",
      chapterCount: 16,
    },
    {
      id: "job",
      name: "Jó",
      shortName: "Jó",
      abrv: "Jb",
      chapterCount: 42,
    },
    {
      id: "1sa",
      name: "Primeiro Livro de Samuel",
      shortName: "1 Samuel",
      abrv: "1 Sm",
      chapterCount: 31,
    },
  ]

  beforeEach(() => {
    apiBooks = mockBooks.map((book) => ({ ...book }))
    const apiServiceSpy = jasmine.createSpyObj("BibleApiService", [
      "getAvailableBooks",
      "getIntros",
      "getIntro",
    ])
    apiServiceSpy.getAvailableBooks.and.returnValue(of(apiBooks))
    apiServiceSpy.getIntros.and.returnValue(of([]))

    TestBed.configureTestingModule({
      providers: [
        BookService,
        { provide: BibleApiService, useValue: apiServiceSpy },
      ],
    })
    service = TestBed.inject(BookService)
    TestBed.inject(BibleApiService)
  })

  describe("standalone introductions", () => {
    const introApi = (intros: IntroSummary[], body?: GroupIntro) => {
      const spy = jasmine.createSpyObj("BibleApiService", [
        "getAvailableBooks",
        "getIntros",
        "getIntro",
      ])
      spy.getAvailableBooks.and.returnValue(of(apiBooks))
      spy.getIntros.and.returnValue(of(intros))
      spy.getIntro.and.returnValue(body ? of(body) : of())
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        providers: [BookService, { provide: BibleApiService, useValue: spy }],
      })
      return TestBed.inject(BookService)
    }

    it("exposes each introduction as a findable book", async () => {
      const svc = introApi([
        { slug: "pentateuco", name: "INTRODUÇÃO AO PENTATEUCO" },
      ])
      await svc.initializeBooks()

      const intro = svc.findBook("pentateuco")
      expect(intro.id).toBe("pentateuco")
      expect(intro.introSlug).toBe("pentateuco")
      // Upper-case USFM headers become a readable title.
      expect(intro.name).toBe("Introdução ao Pentateuco")
      // No chapters: the introduction is the only thing to read.
      expect(intro.chapterCount).toBe(0)
    })

    it("points books with a shared introduction at it", async () => {
      const svc = introApi([{ slug: "samuel", name: "LIVROS DE SAMUEL" }])
      await svc.initializeBooks()

      // 1/2 Samuel carry no introduction of their own; the edition writes one
      // for both, so both must read from it.
      const first = svc.getBooks().find((book) => book.id === "1sa")
      expect(first?.sharedIntroSlug).toBe("samuel")
      expect(BookService.introSlugFor(first)).toBe("samuel")
    })

    it("does not claim a shared introduction the API does not serve", async () => {
      const svc = introApi([])
      await svc.initializeBooks()

      const first = svc.getBooks().find((book) => book.id === "1sa")
      expect(first?.sharedIntroSlug).toBeUndefined()
    })

    it("keeps working when the API serves no introductions", async () => {
      const svc = introApi([])
      await svc.initializeBooks()

      expect(svc.getBooks().some((book) => book.introSlug)).toBeFalse()
      expect(svc.findBook("gen").id).toBe("gen")
    })

    it("caches a fetched introduction body on its book", async () => {
      const svc = introApi(
        [{ slug: "pentateuco", name: "INTRODUÇÃO AO PENTATEUCO" }],
        {
          slug: "pentateuco",
          name: "INTRODUÇÃO AO PENTATEUCO",
          introduction: [{ type: "introParagraph", text: "Cinco rolos." }],
        },
      )
      await svc.initializeBooks()

      const loaded = await svc.loadGroupIntroBody(svc.findBook("pentateuco"))

      expect(loaded.introduction?.length).toBe(1)
      // Stored back on the list, so the reader finds it next time.
      expect(svc.findBook("pentateuco").introduction?.length).toBe(1)
    })
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it("should not surface an unhandled rejection when the eager constructor load fails", async () => {
    // An unhandled rejection here kills prerender worker threads at build time.
    const failingApi = jasmine.createSpyObj("BibleApiService", [
      "getAvailableBooks",
      "getIntros",
    ])
    failingApi.getAvailableBooks.and.returnValue(
      throwError(() => new Error("API unavailable")),
    )
    failingApi.getIntros.and.returnValue(of([]))

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        BookService,
        { provide: BibleApiService, useValue: failingApi },
      ],
    })
    expect(() => TestBed.inject(BookService)).not.toThrow()
    // Let the constructor's fire-and-forget promise settle; a missing .catch
    // would trigger Jasmine's global unhandled-rejection failure here.
    await new Promise((resolve) => setTimeout(resolve))
  })

  it("should add the about book without mutating the API result", async () => {
    await service.initializeBooks()

    expect(apiBooks.some((book) => book.id === "about")).toBeFalse()
    expect(service.getBooks().some((book) => book.id === "about")).toBeTrue()
  })

  it("should find a book by id case-insensitively", async () => {
    await service.initializeBooks()

    expect(service.findBookById("GEN")?.id).toBe("gen")
  })

  it("should find a book by abbreviation", async () => {
    await service.initializeBooks()

    expect(service.findBookByAbrv("gn")?.id).toBe("gen")
  })

  it("should find a book by url abbreviation", async () => {
    await service.initializeBooks()

    expect(service.findBookByUrlAbrv("jb")?.id).toBe("job")
  })

  it("should fall back to the about book when no match exists", async () => {
    await service.initializeBooks()

    expect(service.findBook("missing").id).toBe("about")
  })

  it("should normalize url abbreviations by removing spaces", async () => {
    await service.initializeBooks()

    expect(
      service.getUrlAbrv({
        id: "1sm",
        name: "Primeiro Samuel",
        shortName: "1 Samuel",
        abrv: "1 Sm",
        chapterCount: 31,
      }),
    ).toBe("1sm")
  })

  describe("chapter URL segments", () => {
    it("should map the introduction to /intro and back", () => {
      expect(service.getChapterUrlSegment(0)).toBe("intro")
      expect(service.getChapterUrlSegment(3)).toBe("3")
      expect(service.parseChapterUrlSegment("intro")).toBe(0)
      // Legacy /0 URLs keep working
      expect(service.parseChapterUrlSegment("0")).toBe(0)
      expect(service.parseChapterUrlSegment("12")).toBe(12)
    })

    it("should fall back for missing or non-canonical segments", () => {
      expect(service.parseChapterUrlSegment(null)).toBe(1)
      expect(service.parseChapterUrlSegment(undefined)).toBe(1)
      expect(service.parseChapterUrlSegment("")).toBe(1)
      expect(service.parseChapterUrlSegment(null, 5)).toBe(5)
      expect(service.parseChapterUrlSegment("2junk")).toBe(1)
      expect(service.parseChapterUrlSegment("1.5")).toBe(1)
      expect(service.parseChapterUrlSegment("-3")).toBe(1)
      expect(service.parseChapterUrlSegment("99999999999999999999")).toBe(1)
    })
  })

  describe("findBookByName", () => {
    beforeEach(async () => {
      await service.initializeBooks()
    })

    it("should find a book by exact name match", () => {
      const book = service.findBookByName("Gênesis")
      expect(book).toBeDefined()
      expect(book?.id).toBe("gen")
    })

    it("should find a book by name with case insensitive matching", () => {
      const book = service.findBookByName("GÊNESIS")
      expect(book).toBeDefined()
      expect(book?.id).toBe("gen")
    })

    it("should find a book by name with lowercase", () => {
      const book = service.findBookByName("gênesis")
      expect(book).toBeDefined()
      expect(book?.id).toBe("gen")
    })

    it("should find a book by stripping diacritics", () => {
      const book = service.findBookByName("Genesis")
      expect(book).toBeDefined()
      expect(book?.id).toBe("gen")
      expect(book?.shortName).toBe("Gênesis")
    })

    it("should find a book by stripping diacritics from Êxodo", () => {
      const book = service.findBookByName("Exodo")
      expect(book).toBeDefined()
      expect(book?.id).toBe("exo")
      expect(book?.shortName).toBe("Êxodo")
    })

    it("should find a book by stripping diacritics from Jó", () => {
      const book = service.findBookByName("Jo")
      expect(book).toBeDefined()
      expect(book?.id).toBe("job")
      expect(book?.shortName).toBe("Jó")
    })

    it("should find a book using singular form when plural is provided", () => {
      const book = service.findBookByName("Psalm")
      expect(book).toBeDefined()
      expect(book?.id).toBe("psa")
      expect(book?.shortName).toBe("Psalms")
    })

    it("should find a book using plural form when singular is provided", () => {
      const book = service.findBookByName("Roman")
      expect(book).toBeDefined()
      expect(book?.id).toBe("rom")
      expect(book?.shortName).toBe("Romans")
    })

    it("should handle names ending with 's' that are already singular", () => {
      const book = service.findBookByName("Acts")
      expect(book).toBeDefined()
      expect(book?.id).toBe("acts")
    })

    it("should handle whitespace normalization", () => {
      const book = service.findBookByName("  Gênesis  ")
      expect(book).toBeDefined()
      expect(book?.id).toBe("gen")
    })

    it("should handle multiple spaces in name", () => {
      const book = service.findBookByName("  Acts  ")
      expect(book).toBeDefined()
      expect(book?.id).toBe("acts")
    })

    it("should handle single-character names", () => {
      // Test with Jó which becomes "Jo" when diacritics are stripped
      const book = service.findBookByName("Jó")
      expect(book).toBeDefined()
      expect(book?.id).toBe("job")
    })

    it("should return undefined for non-existent book", () => {
      const book = service.findBookByName("NonExistentBook")
      expect(book).toBeUndefined()
    })

    it("should handle empty string", () => {
      const book = service.findBookByName("")
      expect(book).toBeUndefined()
    })

    it("should handle combination of diacritics, case, and whitespace", () => {
      const book = service.findBookByName("  GENESIS  ")
      expect(book).toBeDefined()
      expect(book?.id).toBe("gen")
      expect(book?.shortName).toBe("Gênesis")
    })

    it("should match book with diacritics using normalized search", () => {
      const book = service.findBookByName("mateus")
      expect(book).toBeDefined()
      expect(book?.id).toBe("mat")
    })
  })
})
