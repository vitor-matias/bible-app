import { TestBed } from "@angular/core/testing"
import type { MockedObject } from "vitest"
import { BookmarkService } from "./bookmark.service"
import { DatabaseService } from "./database.service"

describe("BookmarkService", () => {
  let service: BookmarkService
  let databaseService: MockedObject<DatabaseService>

  const mockBookmarks: Bookmark[] = [
    { bookId: "GEN", chapter: 1, color: "#F44336", timestamp: 123 },
    { bookId: "MRK", chapter: 2, color: "#2196F3", timestamp: 456 },
  ]

  beforeEach(async () => {
    const spy = {
      getAll: vi.fn().mockName("DatabaseService.getAll"),
      clearAndPutAll: vi.fn().mockName("DatabaseService.clearAndPutAll"),
      delete: vi.fn().mockName("DatabaseService.delete"),
      clear: vi.fn().mockName("DatabaseService.clear"),
    }
    spy.getAll.mockImplementation(() =>
      Promise.resolve(JSON.parse(JSON.stringify(mockBookmarks))),
    )
    spy.clearAndPutAll.mockResolvedValue()
    spy.delete.mockResolvedValue()
    spy.clear.mockResolvedValue()

    TestBed.configureTestingModule({
      providers: [BookmarkService, { provide: DatabaseService, useValue: spy }],
    })
    service = TestBed.inject(BookmarkService)
    databaseService = TestBed.inject(
      DatabaseService,
    ) as MockedObject<DatabaseService>

    // Wait for initialization to complete
    await service.initialized
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it("should load bookmarks on initialization", async () => {
    expect(service.getBookmarks()).toEqual(mockBookmarks)
    expect(databaseService.getAll).toHaveBeenCalledWith("bookmarks")
  })

  it("should add a bookmark and handle color uniqueness", async () => {
    // Adding a new bookmark with a new color
    await service.addBookmark("JHN", 3, "#4CAF50")

    const bookmarks = service.getBookmarks()
    expect(bookmarks.length).toBe(3)
    expect(bookmarks.find((b) => b.bookId === "JHN")).toBeTruthy()
    expect(databaseService.clearAndPutAll).toHaveBeenCalledWith(
      "bookmarks",
      bookmarks,
    )
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
    expect(databaseService.clearAndPutAll).toHaveBeenCalledWith(
      "bookmarks",
      bookmarks,
    )
  })

  // One failed save left the queue rejected, so every later change failed too.
  it("keeps saving after a save fails", async () => {
    databaseService.clearAndPutAll
      .mockReturnValueOnce(Promise.reject(new Error("QuotaExceededError")))
      .mockReturnValueOnce(Promise.resolve())
    vi.spyOn(console, "error").mockReturnValue(undefined)

    await expect(service.addBookmark("JHN", 3, "#4CAF50")).rejects.toThrow()
    await service.addBookmark("JHN", 4, "#4CAF50")

    expect(
      service.getBookmarks().find((b) => b.color === "#4CAF50")?.chapter,
    ).toBe(4)
  })

  it("keeps removing after a save fails", async () => {
    databaseService.clearAndPutAll
      .mockReturnValueOnce(Promise.reject(new Error("QuotaExceededError")))
      .mockReturnValueOnce(Promise.resolve())
    vi.spyOn(console, "error").mockReturnValue(undefined)

    await expect(service.addBookmark("JHN", 3, "#4CAF50")).rejects.toThrow()
    await service.removeBookmark("GEN", 1)

    expect(service.getBookmarks().some((b) => b.bookId === "GEN")).toBe(false)
  })

  it("should filter bookmarks for a specific book", async () => {
    service.getBookmarksForBook("GEN").subscribe((bookmarks) => {
      expect(bookmarks.length).toBe(1)
      expect(bookmarks[0].bookId).toBe("GEN")
    })
  })
})
