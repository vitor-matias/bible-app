import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { AnalyticsService } from "./analytics.service"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  type RibbonState,
  ribbonToMove,
} from "./bookmark-ribbons.service"
import { HapticsService } from "./haptics.service"

/** The eight ribbons, those listed marking the given chapters. */
function ribbonsWith(
  marks: { color: string; bookId: string; chapter: number }[],
): RibbonState[] {
  return RIBBON_COLORS.map(({ name, value }) => {
    const mark = marks.find((m) => m.color === value)
    return {
      name,
      value,
      bookmark: mark && { ...mark, timestamp: 1 },
    }
  })
}

describe("ribbonToMove", () => {
  it("offers the ribbon a reader read on from", () => {
    const ribbons = ribbonsWith([{ color: "red", bookId: "mat", chapter: 5 }])
    expect(ribbonToMove(ribbons, "mat", 7)?.value).toBe("red")
  })

  it("picks the nearest ribbon behind the chapter", () => {
    const ribbons = ribbonsWith([
      { color: "blue", bookId: "mat", chapter: 2 },
      { color: "red", bookId: "mat", chapter: 5 },
      { color: "green", bookId: "mat", chapter: 9 },
    ])
    expect(ribbonToMove(ribbons, "mat", 7)?.value).toBe("red")
  })

  it("counts a ribbon on the introduction", () => {
    const ribbons = ribbonsWith([{ color: "red", bookId: "mat", chapter: 0 }])
    expect(ribbonToMove(ribbons, "mat", 1)?.value).toBe("red")
  })

  it("offers none from another book or from further on", () => {
    const ribbons = ribbonsWith([
      { color: "red", bookId: "mrk", chapter: 1 },
      { color: "blue", bookId: "mat", chapter: 9 },
    ])
    expect(ribbonToMove(ribbons, "mat", 7)).toBeUndefined()
  })

  it("offers none when the chapter already carries a ribbon", () => {
    const ribbons = ribbonsWith([
      { color: "red", bookId: "mat", chapter: 5 },
      { color: "blue", bookId: "mat", chapter: 7 },
    ])
    expect(ribbonToMove(ribbons, "mat", 7)).toBeUndefined()
  })
})

describe("BookmarkRibbonsService", () => {
  let bookmarks: jasmine.SpyObj<BookmarkService>
  let analytics: jasmine.SpyObj<AnalyticsService>
  let service: BookmarkRibbonsService

  beforeEach(() => {
    bookmarks = jasmine.createSpyObj("BookmarkService", [
      "addBookmark",
      "removeBookmark",
    ])
    analytics = jasmine.createSpyObj("AnalyticsService", ["track"])
    analytics.track.and.resolveTo()
    TestBed.configureTestingModule({
      providers: [
        { provide: BookmarkService, useValue: bookmarks },
        { provide: AnalyticsService, useValue: analytics },
        { provide: BookService, useValue: {} },
        { provide: Router, useValue: {} },
        {
          provide: HapticsService,
          useValue: jasmine.createSpyObj("HapticsService", ["success"]),
        },
      ],
    })
    service = TestBed.inject(BookmarkRibbonsService)
  })

  it("moves a ribbon and says where it was", () => {
    const [red] = ribbonsWith([{ color: "red", bookId: "mat", chapter: 5 }])

    const previous = service.move(red, "mat", 7)

    expect(bookmarks.addBookmark).toHaveBeenCalledOnceWith("mat", 7, "red")
    expect(previous).toEqual(
      jasmine.objectContaining({ bookId: "mat", chapter: 5, color: "red" }),
    )
    expect(analytics.track).toHaveBeenCalledWith(
      "bookmark_move",
      jasmine.objectContaining({ chapter: 7, fromChapter: 5 }),
    )
  })

  it("does not move a free ribbon", () => {
    const [red] = ribbonsWith([])
    expect(service.move(red, "mat", 7)).toBeUndefined()
    expect(bookmarks.addBookmark).not.toHaveBeenCalled()
  })

  it("puts a moved ribbon back", () => {
    service.restore({ bookId: "mat", chapter: 5, color: "red", timestamp: 1 })
    expect(bookmarks.addBookmark).toHaveBeenCalledOnceWith("mat", 5, "red")
  })
})
