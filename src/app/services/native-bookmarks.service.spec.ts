import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
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
      showBookmarks: jasmine.createSpy("showBookmarks"),
      updateBookmarks: jasmine.createSpy("updateBookmarks"),
    }
    ribbons = jasmine.createSpyObj("BookmarkRibbonsService", [
      "ribbons",
      "open",
      "assign",
      "remove",
    ])
    // The real colours; a bookmark labels its ribbon "Mt <chapter>".
    ribbons.ribbons.and.callFake((list: Bookmark[]) =>
      RIBBON_COLORS.map(({ name, value }): RibbonState => {
        const bookmark = list.find((b) => b.color === value)
        return {
          name,
          value,
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

  it("stops once the sheet is closed", () => {
    service.open("mat", 11)
    actions.next({ id: "bookmarks-closed" })
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
