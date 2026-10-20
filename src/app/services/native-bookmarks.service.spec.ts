import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  RibbonMove,
  type RibbonState,
} from "./bookmark-ribbons.service"
import { NativeBookmarksService } from "./native-bookmarks.service"
import {
  type BookmarksSheetState,
  type NativeChromeAction,
  NativeChromeService,
} from "./native-chrome.service"

describe("NativeBookmarksService", () => {
  let bookmarks: BehaviorSubject<Bookmark[]>
  let actions: Subject<NativeChromeAction>
  let nativeChrome: {
    actions$: Subject<NativeChromeAction>
    showBookmarks: jasmine.Spy
    updateBookmarks: jasmine.Spy
  }
  let ribbons: jasmine.SpyObj<BookmarkRibbonsService>
  let service: NativeBookmarksService

  const markedRed: Bookmark = {
    bookId: "mat",
    chapter: 5,
    color: "red",
    timestamp: 1,
  }

  beforeEach(() => {
    bookmarks = new BehaviorSubject<Bookmark[]>([markedRed])
    actions = new Subject()
    nativeChrome = {
      actions$: actions,
      showBookmarks: jasmine.createSpy("showBookmarks").and.resolveTo(true),
      updateBookmarks: jasmine.createSpy("updateBookmarks"),
    }
    ribbons = jasmine.createSpyObj("BookmarkRibbonsService", [
      "ribbons",
      "open",
      "assign",
      "remove",
      "move",
      "restore",
      "moveTo",
    ])
    // The real move offer, over the spied move and restore.
    ribbons.moveTo.and.callFake(
      (bookId: string, chapter: number) =>
        new RibbonMove(ribbons, bookId, chapter),
    )
    // The real colours; a bookmark labels its ribbon "Mt <chapter>".
    ribbons.ribbons.and.callFake((list: Bookmark[]) =>
      RIBBON_COLORS.map(({ name, value, spoken }): RibbonState => {
        const bookmark = list.find((b) => b.color === value)
        return {
          name,
          value,
          spoken,
          bookmark,
          currentRef: bookmark ? `Mt ${bookmark.chapter}` : undefined,
        }
      }),
    )
    TestBed.configureTestingModule({
      providers: [
        { provide: NativeChromeService, useValue: nativeChrome },
        { provide: BookmarkRibbonsService, useValue: ribbons },
        {
          provide: BookmarkService,
          useValue: { bookmarks$: bookmarks.asObservable() },
        },
        {
          provide: BookService,
          useValue: { findBookById: () => ({ shortName: "Mateus" }) },
        },
      ],
    })
    service = TestBed.inject(NativeBookmarksService)
  })

  const shown = (): BookmarksSheetState =>
    nativeChrome.showBookmarks.calls.mostRecent().args[0]
  const updated = (): BookmarksSheetState =>
    nativeChrome.updateBookmarks.calls.mostRecent().args[0]

  it("shows every ribbon, in Portuguese, with the passage it marks", () => {
    service.open("mat", 11)

    const state = shown()
    expect(state.currentLabel).toBe("Mateus 11")
    expect(state.ribbons.length).toBe(8)
    expect(state.ribbons[0]).toEqual({
      color: "red",
      name: "Vermelho",
      label: "Mt 5",
      current: false,
    })
    expect(state.ribbons[1]).toEqual({
      color: "orange",
      name: "Laranja",
      label: null,
      current: false,
    })
  })

  it("names a psalm as the passage button does", () => {
    TestBed.inject(BookService).findBookById = () =>
      ({ id: "psa", shortName: "Salmos" }) as Book
    service.open("psa", 96)
    expect(shown().currentLabel).toBe("Salmo 96 (95)")
  })

  it("names the introduction as the chapter", () => {
    service.open("mat", 0)
    expect(shown().currentLabel).toBe("Mateus Introdução")
  })

  it("marks the ribbon on the chapter being read", () => {
    service.open("mat", 5)
    expect(shown().ribbons[0].current).toBeTrue()
  })

  it("refreshes the open sheet when the bookmarks change", () => {
    service.open("mat", 11)
    bookmarks.next([
      markedRed,
      { bookId: "mat", chapter: 11, color: "blue", timestamp: 2 },
    ])

    expect(nativeChrome.showBookmarks).toHaveBeenCalledTimes(1)
    const blue = updated().ribbons.find((r) => r.color === "blue")
    expect(blue).toEqual({
      color: "blue",
      name: "Azul",
      label: "Mt 11",
      current: true,
    })
  })

  it("opens, marks and removes through the shared ribbon rules", () => {
    service.open("mat", 11)
    actions.next({ id: "bookmark-open", color: "red" })
    actions.next({ id: "bookmark-set", color: "blue" })
    actions.next({ id: "bookmark-remove", color: "red" })

    expect(ribbons.open).toHaveBeenCalledWith(
      jasmine.objectContaining({ value: "red" }),
    )
    expect(ribbons.assign).toHaveBeenCalledWith("blue", "mat", 11)
    expect(ribbons.remove).toHaveBeenCalledWith(
      jasmine.objectContaining({ value: "red" }),
    )
  })

  it("offers to move the ribbon read on from to this chapter", () => {
    service.open("mat", 7)
    expect(shown().move).toEqual({
      color: "red",
      name: "vermelho",
      from: "Mateus 5",
      done: false,
    })
  })

  it("offers no move when the chapter carries the ribbon", () => {
    service.open("mat", 5)
    expect(shown().move).toBeNull()
  })

  it("moves the ribbon, then offers to undo the move", () => {
    ribbons.move.and.returnValue(markedRed)
    service.open("mat", 7)
    actions.next({ id: "bookmark-move", color: "red" })
    bookmarks.next([{ ...markedRed, chapter: 7, timestamp: 2 }])

    expect(ribbons.move).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ value: "red" }),
      "mat",
      7,
    )
    expect(updated().move).toEqual({
      color: "red",
      name: "vermelho",
      from: "Mateus 5",
      done: true,
    })

    actions.next({ id: "bookmark-undo", color: "red" })
    bookmarks.next([markedRed])

    expect(ribbons.restore).toHaveBeenCalledOnceWith(markedRed)
    expect(updated().move?.done).toBeFalse()
  })

  it("keeps the undo when a later move does nothing", () => {
    ribbons.move.and.returnValues(markedRed, undefined)
    service.open("mat", 7)
    actions.next({ id: "bookmark-move", color: "red" })
    actions.next({ id: "bookmark-move", color: "blue" })
    actions.next({ id: "bookmark-undo", color: "red" })

    expect(ribbons.restore).toHaveBeenCalledOnceWith(markedRed)
  })

  it("undoes the latest of two moves", () => {
    const markedBlue: Bookmark = { ...markedRed, chapter: 2, color: "blue" }
    bookmarks.next([markedRed, markedBlue])
    ribbons.move.and.returnValues(markedRed, markedBlue)
    service.open("mat", 7)
    actions.next({ id: "bookmark-move", color: "red" })
    actions.next({ id: "bookmark-move", color: "blue" })
    actions.next({ id: "bookmark-undo", color: "blue" })

    expect(ribbons.restore).toHaveBeenCalledOnceWith(markedBlue)
  })

  it("undoes only a move made in this sheet", () => {
    service.open("mat", 7)
    actions.next({ id: "bookmark-undo", color: "red" })
    expect(ribbons.restore).not.toHaveBeenCalled()
  })

  it("stops once the sheet is closed", async () => {
    service.open("mat", 11)
    await new Promise((resolve) => setTimeout(resolve))
    actions.next({ id: "bookmarks-closed" })
    bookmarks.next([])
    actions.next({ id: "bookmark-set", color: "blue" })

    expect(nativeChrome.updateBookmarks).not.toHaveBeenCalled()
    expect(ribbons.assign).not.toHaveBeenCalled()
  })

  // Opened while the last sheet was closing: the shell presents this one
  // once that one has gone, and the last one's close came in between.
  it("keeps going through the closing sheet's bookmarks-closed", async () => {
    let answer: (presented: boolean) => void = () => {}
    nativeChrome.showBookmarks.and.returnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve
      }),
    )
    service.open("mat", 11)
    actions.next({ id: "bookmarks-closed" })
    answer(true)
    await new Promise((resolve) => setTimeout(resolve))
    actions.next({ id: "bookmark-set", color: "blue" })

    expect(ribbons.assign).toHaveBeenCalledOnceWith("blue", "mat", 11)
  })

  // Over another sheet none comes up, and no bookmarks-closed would follow.
  it("stops when no sheet came up", async () => {
    nativeChrome.showBookmarks.and.resolveTo(false)
    service.open("mat", 11)
    await new Promise((resolve) => setTimeout(resolve))
    bookmarks.next([])
    actions.next({ id: "bookmark-set", color: "blue" })

    expect(nativeChrome.updateBookmarks).not.toHaveBeenCalled()
    expect(ribbons.assign).not.toHaveBeenCalled()
  })

  it("follows only the latest sheet", () => {
    service.open("mat", 11)
    service.open("mat", 12)
    actions.next({ id: "bookmark-set", color: "blue" })

    expect(ribbons.assign).toHaveBeenCalledOnceWith("blue", "mat", 12)
  })
})
