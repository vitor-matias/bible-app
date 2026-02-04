import { TestBed } from "@angular/core/testing"
import { BookmarkService } from "./bookmark.service"
import { PreferencesService } from "./preferences.service"

describe("BookmarkService", () => {
  let service: BookmarkService
  let preferencesServiceSpy: jasmine.SpyObj<PreferencesService>

  const mockBookmarks: Bookmark[] = [
    { bookId: "GEN", chapter: 1, color: "#F44336", timestamp: 123 },
    { bookId: "MRK", chapter: 2, color: "#2196F3", timestamp: 456 },
  ]

  beforeEach(() => {
    const spy = jasmine.createSpyObj("PreferencesService", [
      "getBookmarks",
      "setBookmarks",
    ])
    spy.getBookmarks.and.returnValue(mockBookmarks)

    TestBed.configureTestingModule({
      providers: [
        BookmarkService,
        { provide: PreferencesService, useValue: spy },
      ],
    })
    service = TestBed.inject(BookmarkService)
    preferencesServiceSpy = TestBed.inject(
      PreferencesService,
    ) as jasmine.SpyObj<PreferencesService>
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it("should load bookmarks on initialization", () => {
    expect(service.getBookmarks()).toEqual(mockBookmarks)
    expect(preferencesServiceSpy.getBookmarks).toHaveBeenCalled()
  })

  it("should add a bookmark and handle color uniqueness", () => {
    // Adding a new bookmark with a new color
    service.addBookmark("JHN", 3, "#4CAF50")

    const bookmarks = service.getBookmarks()
    expect(bookmarks.length).toBe(3)
    expect(bookmarks.find((b) => b.bookId === "JHN")).toBeTruthy()
    expect(preferencesServiceSpy.setBookmarks).toHaveBeenCalled()
  })

  it("should replace an existing bookmark if color is the same", () => {
    // Red color is already in GEN 1. Assigning Red to JHN 3 should remove it from GEN 1.
    service.addBookmark("JHN", 3, "#F44336")

    const bookmarks = service.getBookmarks()
    expect(bookmarks.length).toBe(2)
    expect(bookmarks.find((b) => b.bookId === "GEN")).toBeFalsy()
    expect(
      bookmarks.find((b) => b.bookId === "JHN" && b.color === "#F44336"),
    ).toBeTruthy()
  })

  it("should remove a bookmark", () => {
    service.removeBookmark("GEN", 1)

    const bookmarks = service.getBookmarks()
    expect(bookmarks.length).toBe(1)
    expect(bookmarks.find((b) => b.bookId === "GEN")).toBeFalsy()
    expect(preferencesServiceSpy.setBookmarks).toHaveBeenCalledWith(
      jasmine.arrayContaining([jasmine.objectContaining({ bookId: "MRK" })]),
    )
  })

  it("should filter bookmarks for a specific book", (done) => {
    service.getBookmarksForBook("GEN").subscribe((bookmarks) => {
      expect(bookmarks.length).toBe(1)
      expect(bookmarks[0].bookId).toBe("GEN")
      done()
    })
  })
})
