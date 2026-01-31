import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { BibleApiService } from "./bible-api.service"

import { BookService } from "./book.service"

describe("BookService", () => {
  let service: BookService

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
  ]

  beforeEach(() => {
    const apiServiceSpy = jasmine.createSpyObj("BibleApiService", [
      "getAvailableBooks",
    ])
    apiServiceSpy.getAvailableBooks.and.returnValue(of(mockBooks))

    TestBed.configureTestingModule({
      providers: [
        BookService,
        { provide: BibleApiService, useValue: apiServiceSpy },
      ],
    })
    service = TestBed.inject(BookService)
    TestBed.inject(BibleApiService)
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
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
