import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { BibleApiService } from "./bible-api.service"
import { OfflineDataService } from "./offline-data.service"

describe("BibleApiService", () => {
  let service: BibleApiService
  let httpMock: HttpTestingController
  let offlineDataServiceSpy: jasmine.SpyObj<OfflineDataService>

  beforeEach(() => {
    const spy = jasmine.createSpyObj("OfflineDataService", [
      "getCachedChapterAsync",
      "getCachedBooksAsync",
    ])

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        BibleApiService,
        { provide: OfflineDataService, useValue: spy },
      ],
    })

    service = TestBed.inject(BibleApiService)
    httpMock = TestBed.inject(HttpTestingController)
    offlineDataServiceSpy = TestBed.inject(
      OfflineDataService,
    ) as jasmine.SpyObj<OfflineDataService>

    // Mock navigator.onLine to be true
    spyOnProperty(navigator, "onLine", "get").and.returnValue(true)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("getChapter", () => {
    const book = "gen"
    const chapterNum = 1
    const mockChapter = {
      bookId: book,
      number: chapterNum,
      verses: [
        {
          bookId: book,
          chapterNumber: chapterNum,
          number: 1,
          verseLabel: "1",
          text: [{ type: "text", text: "In the beginning..." }],
        },
      ],
    } as Chapter

    it("should return cached chapter when it contains verses", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(mockChapter),
      )

      const result = await firstValueFrom(service.getChapter(book, chapterNum))
      expect(result).toEqual(mockChapter)
      httpMock.expectNone(`v1/${book}/${chapterNum}`)
    })

    it("should fetch from server when cache returns undefined", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(undefined),
      )

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )

      // Wait for the cache check microtask to complete
      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne(`v1/${book}/${chapterNum}`)
      expect(req.request.method).toBe("GET")
      req.flush(mockChapter)

      const result = await chapterPromise
      expect(result).toEqual(mockChapter)
    })

    it("should fetch from server when cached chapter has no verses array", async () => {
      const hollowChapter = { bookId: book, number: chapterNum } as Chapter
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(hollowChapter),
      )

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )

      // Wait for the cache check microtask to complete
      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne(`v1/${book}/${chapterNum}`)
      req.flush(mockChapter)

      const result = await chapterPromise
      expect(result).toEqual(mockChapter)
    })

    it("should fetch from server when cached chapter has empty verses array", async () => {
      const emptyChapter = {
        bookId: book,
        number: chapterNum,
        verses: [],
      } as Chapter
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(emptyChapter),
      )

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )

      // Wait for the cache check microtask to complete
      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne(`v1/${book}/${chapterNum}`)
      req.flush(mockChapter)

      const result = await chapterPromise
      expect(result).toEqual(mockChapter)
    })
  })
})
