import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { BehaviorSubject, Subject } from "rxjs"
import {
  indexBookmarkId,
  indexBookmarkLabel,
  indexBookmarkLink,
  isIndexBookmark,
} from "./pastoral-index-bookmarks"
import { AnalyticsService } from "./services/analytics.service"
import { BookService } from "./services/book.service"
import { BookmarkService } from "./services/bookmark.service"
import { BookmarkRibbonsService } from "./services/bookmark-ribbons.service"
import { HapticsService } from "./services/haptics.service"
import { NativeBookmarksService } from "./services/native-bookmarks.service"
import { NativeChromeService } from "./services/native-chrome.service"
import { reportSubject } from "./utils/passage-label"

describe("ribbons on the Índice Bíblico-Pastoral", () => {
  describe("the bookmark's book", () => {
    it("names a theme by slug, and the index without one", () => {
      expect(indexBookmarkId("amor")).toBe("indice/amor")
      expect(indexBookmarkId(null)).toBe("indice")
    })

    it("is told apart from a book of the Bible", () => {
      expect(isIndexBookmark("indice/amor")).toBe(true)
      expect(isIndexBookmark("indice")).toBe(true)
      expect(isIndexBookmark("isa")).toBe(false)
      expect(isIndexBookmark("indicex")).toBe(false)
    })

    it("says the theme's title, accents and all", () => {
      expect(indexBookmarkLabel("indice/agua")).toBe("Água")
      expect(indexBookmarkLabel("indice")).toBe("Índice")
    })

    it("falls back to the index for a theme no longer there", () => {
      expect(indexBookmarkLink("indice/amor")).toEqual(["/indice", "amor"])
      expect(indexBookmarkLabel("indice/gone")).toBe("Índice")
      expect(indexBookmarkLink("indice/gone")).toEqual(["/indice"])
    })

    it("is reported by its name alone", () => {
      const book = { id: "indice/amor", shortName: "Amor", name: "Amor" }
      expect(reportSubject(book as Book, 1)).toBe("Amor")
    })
  })

  describe("the ribbons", () => {
    let navigate: ReturnType<typeof vi.fn>

    function ribbons(): BookmarkRibbonsService {
      navigate = vi.fn().mockResolvedValue(true)
      TestBed.configureTestingModule({
        providers: [
          { provide: Router, useValue: { navigate } },
          {
            provide: BookmarkService,
            useValue: { bookmarks$: new BehaviorSubject([]) },
          },
          { provide: BookService, useValue: { findBookById: () => undefined } },
          { provide: AnalyticsService, useValue: { track: vi.fn() } },
          { provide: HapticsService, useValue: { success: vi.fn() } },
        ],
      })
      return TestBed.inject(BookmarkRibbonsService)
    }

    const marked = (bookId: string): Bookmark => ({
      bookId,
      chapter: 1,
      color: "red",
      timestamp: 1,
    })

    it("name the theme they mark", () => {
      const [red] = ribbons().ribbons([marked("indice/agua")])

      expect(red.currentRef).toBe("Água")
    })

    it("open the theme they mark", () => {
      const service = ribbons()
      const [red] = service.ribbons([marked("indice/amor")])

      expect(service.open(red)).toBe(true)
      expect(navigate).toHaveBeenCalledWith(["/indice", "amor"])
    })

    it("still refuse a book that is unknown", () => {
      const service = ribbons()
      const [red] = service.ribbons([marked("nope")])

      expect(service.open(red)).toBe(false)
      expect(navigate).not.toHaveBeenCalled()
    })
  })

  it("names the theme in the native sheet", () => {
    const showBookmarks = vi.fn().mockResolvedValue(true)
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: BookmarkService,
          useValue: { bookmarks$: new BehaviorSubject([]) },
        },
        { provide: BookService, useValue: { findBookById: () => undefined } },
        { provide: AnalyticsService, useValue: { track: vi.fn() } },
        { provide: HapticsService, useValue: { success: vi.fn() } },
        {
          provide: NativeChromeService,
          useValue: {
            actions$: new Subject(),
            showBookmarks,
            updateBookmarks: vi.fn(),
          },
        },
      ],
    })

    TestBed.inject(NativeBookmarksService).open("indice/agua", 1)

    expect(showBookmarks.mock.lastCall?.[0]).toMatchObject({
      currentLabel: "Água",
      canMark: true,
    })
  })
})
