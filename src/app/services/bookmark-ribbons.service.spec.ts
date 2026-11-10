import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import { AnalyticsService } from "./analytics.service"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  type RibbonState,
  ribbonColor,
  ribbonToMove,
} from "./bookmark-ribbons.service"
import { HapticsService } from "./haptics.service"
import { ToastService } from "./toast.service"

/** The eight ribbons, those listed marking the given chapters. */
function ribbonsWith(
  marks: {
    color: string
    bookId: string
    chapter: number
  }[],
): RibbonState[] {
  return RIBBON_COLORS.map(({ name, value, spoken }) => {
    const mark = marks.find((m) => m.color === value)
    return {
      name,
      value,
      spoken,
      bookmark: mark && { ...mark, timestamp: 1 },
    }
  })
}

const settled = () => new Promise((resolve) => setTimeout(resolve))

describe("ribbonColor", () => {
  it("paints a ribbon in the theme's tone for it", () => {
    expect(ribbonColor("red")).toBe("var(--ribbon-red)")
  })

  // The web header's buttons are antique white in both themes.
  it("paints it in the light surfaces' tone where the surface stays light", () => {
    expect(ribbonColor("violet", "light")).toBe("var(--ribbon-light-violet)")
  })

  it("paints nothing for no ribbon, and an unknown colour as stored", () => {
    expect(ribbonColor(undefined)).toBeNull()
    expect(ribbonColor(null)).toBeNull()
    expect(ribbonColor("gold")).toBe("gold")
  })
})

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
  let bookmarks: SpyObj<BookmarkService>
  let analytics: SpyObj<AnalyticsService>
  let haptics: SpyObj<HapticsService>
  let toast: SpyObj<ToastService>
  let books: SpyObj<BookService>
  let router: SpyObj<Router>
  let service: BookmarkRibbonsService

  beforeEach(() => {
    bookmarks = createSpyObj("BookmarkService", [
      "addBookmark",
      "removeBookmark",
    ])
    bookmarks.addBookmark.mockResolvedValue(undefined)
    bookmarks.removeBookmark.mockResolvedValue(undefined)
    analytics = createSpyObj("AnalyticsService", ["track"])
    analytics.track.mockResolvedValue(undefined)
    haptics = createSpyObj("HapticsService", ["success"])
    toast = createSpyObj("ToastService", ["show"])
    books = createSpyObj("BookService", [
      "findBookById",
      "getUrlAbrv",
      "getChapterUrlSegment",
    ])
    router = createSpyObj("Router", ["navigate"])
    router.navigate.mockResolvedValue(true)
    TestBed.configureTestingModule({
      providers: [
        { provide: BookmarkService, useValue: bookmarks },
        { provide: AnalyticsService, useValue: analytics },
        { provide: BookService, useValue: books },
        { provide: Router, useValue: router },
        { provide: HapticsService, useValue: haptics },
        { provide: ToastService, useValue: toast },
      ],
    })
    service = TestBed.inject(BookmarkRibbonsService)
  })

  it("moves a ribbon and says where it was", async () => {
    const [red] = ribbonsWith([{ color: "red", bookId: "mat", chapter: 5 }])

    const previous = service.move(red, "mat", 7)
    await settled()

    expect(bookmarks.addBookmark).toHaveBeenCalledTimes(1)

    expect(bookmarks.addBookmark).toHaveBeenCalledWith("mat", 7, "red")
    expect(previous).toEqual(
      expect.objectContaining({ bookId: "mat", chapter: 5, color: "red" }),
    )
    expect(analytics.track).toHaveBeenCalledWith(
      "bookmark_move",
      expect.objectContaining({ chapter: 7, fromChapter: 5 }),
    )
  })

  it("does not move a free ribbon", () => {
    const [red] = ribbonsWith([])
    expect(service.move(red, "mat", 7)).toBeUndefined()
    expect(bookmarks.addBookmark).not.toHaveBeenCalled()
  })

  it("puts a moved ribbon back", () => {
    service.restore({ bookId: "mat", chapter: 5, color: "red", timestamp: 1 })
    expect(bookmarks.addBookmark).toHaveBeenCalledTimes(1)
    expect(bookmarks.addBookmark).toHaveBeenCalledWith("mat", 5, "red")
  })

  describe("once the save is done", () => {
    const failure = "Não foi possível guardar o marcador. Tente novamente."
    const [red] = ribbonsWith([{ color: "red", bookId: "mat", chapter: 5 }])

    it("confirms a mark only after it saved", async () => {
      service.assign("red", "mat", 7)
      expect(haptics.success).not.toHaveBeenCalled()
      expect(analytics.track).not.toHaveBeenCalled()

      await settled()

      expect(haptics.success).toHaveBeenCalledTimes(1)
      expect(analytics.track).toHaveBeenCalledWith(
        "bookmark_create",
        expect.objectContaining({ chapter: 7, color: "red" }),
      )
      expect(toast.show).not.toHaveBeenCalled()
    })

    it("counts a removal after it saved", async () => {
      service.remove(red)
      await settled()

      expect(analytics.track).toHaveBeenCalledWith(
        "bookmark_delete",
        expect.objectContaining({ chapter: 5, color: "red" }),
      )
      expect(toast.show).not.toHaveBeenCalled()
    })

    it.each([
      ["mark", () => service.assign("red", "mat", 7)],
      ["move", () => service.move(red, "mat", 7)],
      [
        "restore",
        () =>
          service.restore({
            bookId: "mat",
            chapter: 5,
            color: "red",
            timestamp: 1,
          }),
      ],
      ["removal", () => service.remove(red)],
    ])("says so when a %s fails, and confirms nothing", async (_name, act) => {
      bookmarks.addBookmark.mockRejectedValue(new Error("QuotaExceededError"))
      bookmarks.removeBookmark.mockRejectedValue(
        new Error("QuotaExceededError"),
      )

      act()
      await settled()

      expect(toast.show).toHaveBeenCalledTimes(1)
      expect(toast.show).toHaveBeenCalledWith(failure, { action: "OK" })
      expect(haptics.success).not.toHaveBeenCalled()
      expect(analytics.track).not.toHaveBeenCalled()
    })
  })

  describe("opening a ribbon", () => {
    const marked = (bookId: string): RibbonState =>
      ribbonsWith([{ color: "red", bookId, chapter: 5 }])[0]

    it("counts the use of a known book", () => {
      books.findBookById.mockReturnValue(
        {} as ReturnType<BookService["findBookById"]>,
      )
      books.getUrlAbrv.mockReturnValue("mt")
      books.getChapterUrlSegment.mockReturnValue("5")

      expect(service.open(marked("mat"))).toBe(true)

      expect(analytics.track).toHaveBeenCalledWith(
        "bookmark_use",
        expect.objectContaining({ book: "mat", chapter: 5, color: "red" }),
      )
      expect(router.navigate).toHaveBeenCalledWith(["mt", "5"])
    })

    it("counts the use of an index bookmark", () => {
      expect(service.open(marked("indice"))).toBe(true)

      expect(analytics.track).toHaveBeenCalledTimes(1)
      expect(router.navigate).toHaveBeenCalledWith(["/indice"])
    })

    it("does not count an unknown book", () => {
      vi.spyOn(console, "warn").mockReturnValue(undefined)
      books.findBookById.mockReturnValue(undefined)

      expect(service.open(marked("nope"))).toBe(false)

      expect(analytics.track).not.toHaveBeenCalled()
      expect(router.navigate).not.toHaveBeenCalled()
    })
  })

  // The web panel and the iOS sheet both offer it through RibbonMove.
  describe("a panel's move offer", () => {
    const before = ribbonsWith([{ color: "red", bookId: "mat", chapter: 5 }])
    const after = ribbonsWith([{ color: "red", bookId: "mat", chapter: 7 }])

    it("offers the ribbon read on from, by its spoken name", () => {
      const mover = service.moveTo("mat", 7)
      expect(mover.offer(before)).toEqual({
        from: expect.objectContaining({ bookId: "mat", chapter: 5 }),
        name: "vermelho",
        done: false,
      })
    })

    it("offers to undo a move, then puts the ribbon back", () => {
      const mover = service.moveTo("mat", 7)
      mover.move(before[0])

      expect(mover.offer(after)).toEqual(
        expect.objectContaining({
          from: expect.objectContaining({ chapter: 5 }),
          done: true,
        }),
      )
      expect(mover.undo()).toBe(true)
      expect(bookmarks.addBookmark).toHaveBeenCalledWith("mat", 5, "red")
      expect(mover.offer(after)).toBeUndefined()
      expect(mover.undo()).toBe(false)
    })

    it("undoes only the ribbon it moved", () => {
      const mover = service.moveTo("mat", 7)
      mover.move(before[0])

      expect(mover.undo("blue")).toBe(false)
      expect(mover.undo("red")).toBe(true)
    })

    it("leaves no undo offer when the move fails to save", async () => {
      bookmarks.addBookmark.mockRejectedValue(new Error("QuotaExceededError"))
      const mover = service.moveTo("mat", 7)
      mover.move(before[0])
      await settled()

      expect(mover.offer(before)?.done).toBe(false)
      expect(mover.undo()).toBe(false)
    })

    it("goes back to the last move's undo when a later move fails", async () => {
      const mover = service.moveTo("mat", 7)
      mover.move(before[0])
      await settled()
      bookmarks.addBookmark.mockRejectedValue(new Error("QuotaExceededError"))
      mover.move(after[0])
      await settled()

      expect(mover.offer(after)).toEqual(
        expect.objectContaining({
          from: expect.objectContaining({ chapter: 5 }),
          done: true,
        }),
      )
    })

    // The native sheet sends a move without waiting for the last one's save.
    describe("with two moves still saving", () => {
      const ribbons = ribbonsWith([
        { color: "red", bookId: "mat", chapter: 5 },
        { color: "blue", bookId: "mat", chapter: 3 },
      ])
      const red = ribbons[0]
      const blue = ribbons.find(
        (ribbon) => ribbon.value === "blue",
      ) as RibbonState

      it("offers no undo when both fail", async () => {
        bookmarks.addBookmark.mockRejectedValue(new Error("QuotaExceededError"))
        const mover = service.moveTo("mat", 7)
        mover.move(red)
        mover.move(blue)
        await settled()

        expect(mover.undo()).toBe(false)
      })

      it("keeps the later move's undo when the earlier one fails", async () => {
        bookmarks.addBookmark.mockRejectedValueOnce(
          new Error("QuotaExceededError"),
        )
        const mover = service.moveTo("mat", 7)
        mover.move(red)
        mover.move(blue)
        await settled()

        expect(mover.undo("blue")).toBe(true)
      })
    })

    it("keeps the last move's undo when a move does nothing", () => {
      const mover = service.moveTo("mat", 7)
      mover.move(before[0])
      mover.move(ribbonsWith([])[1])

      expect(mover.offer(after)?.done).toBe(true)
    })
  })
})
