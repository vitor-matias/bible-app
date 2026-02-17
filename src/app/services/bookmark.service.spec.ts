import { TestBed } from "@angular/core/testing"
import { BookmarkService } from "./bookmark.service"
import { DatabaseService } from "./database.service"

describe("BookmarkService", () => {
  let service: BookmarkService
  let databaseService: jasmine.SpyObj<DatabaseService>

  const mockBookmarks: Bookmark[] = [
    { bookId: "GEN", chapter: 1, color: "#F44336", timestamp: 123 },
    { bookId: "MRK", chapter: 2, color: "#2196F3", timestamp: 456 },
  ]

  beforeEach(async () => {
    const spy = jasmine.createSpyObj("DatabaseService", [
      "getAll",
      "putAll",
      "delete",
      "clear",
    ])
    spy.getAll.and.returnValue(Promise.resolve(mockBookmarks))
    spy.putAll.and.returnValue(Promise.resolve())
    spy.delete.and.returnValue(Promise.resolve())
    spy.clear.and.returnValue(Promise.resolve())

    TestBed.configureTestingModule({
      providers: [BookmarkService, { provide: DatabaseService, useValue: spy }],
    })
    service = TestBed.inject(BookmarkService)
    databaseService = TestBed.inject(
      DatabaseService,
    ) as jasmine.SpyObj<DatabaseService>

    // Wait for initialization to complete
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it("should load bookmarks on initialization", async () => {
    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(service.getBookmarks()).toEqual(mockBookmarks)
    expect(databaseService.getAll).toHaveBeenCalledWith("bookmarks")
  })

  it("should add a bookmark and handle color uniqueness", async () => {
    // Adding a new bookmark with a new color
    await service.addBookmark("JHN", 3, "#4CAF50")

    const bookmarks = service.getBookmarks()
    expect(bookmarks.length).toBe(3)
    expect(bookmarks.find((b) => b.bookId === "JHN")).toBeTruthy()
    expect(databaseService.putAll).toHaveBeenCalledWith("bookmarks", bookmarks)
  })

  it("should replace an existing bookmark if color is the same", async () => {
    // Red color is already in GEN 1. Assigning Red to JHN 3 should remove it from GEN 1.
    await service.addBookmark("JHN", 3, "#F44336")

    const bookmarks = service.getBookmarks()
    expect(bookmarks.length).toBe(2)
    expect(bookmarks.find((b) => b.bookId === "GEN")).toBeFalsy()
    expect(
      bookmarks.find((b) => b.bookId === "JHN" && b.color === "#F44336"),
    ).toBeTruthy()
  })

  it("should remove a bookmark", async () => {
    await service.removeBookmark("GEN", 1)

    const bookmarks = service.getBookmarks()
    expect(bookmarks.length).toBe(1)
    expect(bookmarks.find((b) => b.bookId === "GEN")).toBeFalsy()
    expect(databaseService.putAll).toHaveBeenCalledWith("bookmarks", bookmarks)
  })

  it("should filter bookmarks for a specific book", (done) => {
    service.getBookmarksForBook("GEN").subscribe((bookmarks) => {
      expect(bookmarks.length).toBe(1)
      expect(bookmarks[0].bookId).toBe("GEN")
      done()
    })
  })
})
