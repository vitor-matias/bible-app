import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import { BookmarkService } from "./bookmark.service"
import { DatabaseService } from "./database.service"

describe("BookmarkService", () => {
  let service: BookmarkService
  let databaseService: SpyObj<DatabaseService>

  const mockBookmarks: Bookmark[] = [
    { bookId: "GEN", chapter: 1, color: "#F44336", timestamp: 123 },
    { bookId: "MRK", chapter: 2, color: "#2196F3", timestamp: 456 },
  ]

  beforeEach(async () => {
    const spy = createSpyObj("DatabaseService", [
      "getAll",
      "applyChanges",
      "delete",
      "clear",
    ])
    spy.getAll.mockImplementation(() =>
      Promise.resolve(JSON.parse(JSON.stringify(mockBookmarks))),
    )
    spy.applyChanges.mockResolvedValue(undefined)
    spy.delete.mockResolvedValue(undefined)
    spy.clear.mockResolvedValue(undefined)

    TestBed.configureTestingModule({
      providers: [BookmarkService, { provide: DatabaseService, useValue: spy }],
    })
    service = TestBed.inject(BookmarkService)
    databaseService = TestBed.inject(DatabaseService) as SpyObj<DatabaseService>

    // Wait for initialization to complete
    await service.initialized
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it("should load bookmarks on initialization", async () => {
    expect(await firstValueFrom(service.bookmarks$)).toEqual(mockBookmarks)
    expect(databaseService.getAll).toHaveBeenCalledWith("bookmarks")
  })

  it("should add a bookmark and handle color uniqueness", async () => {
    // Adding a new bookmark with a new color
    await service.addBookmark("JHN", 3, "#4CAF50")

    const bookmarks = await firstValueFrom(service.bookmarks$)
    expect(bookmarks.length).toBe(3)
    const added = bookmarks.find((b) => b.bookId === "JHN")
    expect(added).toBeTruthy()
    expect(databaseService.applyChanges).toHaveBeenCalledWith(
      "bookmarks",
      [],
      [added],
    )
  })

  it("should replace an existing bookmark if color is the same", async () => {
    // Red color is already in GEN 1. Assigning Red to JHN 3 should remove it from GEN 1.
    await service.addBookmark("JHN", 3, "#F44336")

    const bookmarks = await firstValueFrom(service.bookmarks$)
    expect(bookmarks.length).toBe(2)
    expect(bookmarks.find((b) => b.bookId === "GEN")).toBeFalsy()
    expect(
      bookmarks.find((b) => b.bookId === "JHN" && b.color === "#F44336"),
    ).toBeTruthy()
  })

  it("should remove a bookmark", async () => {
    await service.removeBookmark("GEN", 1)

    const bookmarks = await firstValueFrom(service.bookmarks$)
    expect(bookmarks.length).toBe(1)
    expect(bookmarks.find((b) => b.bookId === "GEN")).toBeFalsy()
    expect(databaseService.applyChanges).toHaveBeenCalledWith(
      "bookmarks",
      [["GEN", 1]],
      [],
    )
  })

  // One failed save left the queue rejected, so every later change failed too.
  it("keeps saving after a save fails", async () => {
    databaseService.applyChanges
      .mockReturnValueOnce(Promise.reject(new Error("QuotaExceededError")))
      .mockReturnValueOnce(Promise.resolve())
    vi.spyOn(console, "error").mockReturnValue(undefined)

    await expect(service.addBookmark("JHN", 3, "#4CAF50")).rejects.toThrow()
    await service.addBookmark("JHN", 4, "#4CAF50")

    const bookmarks = await firstValueFrom(service.bookmarks$)
    expect(bookmarks.find((b) => b.color === "#4CAF50")?.chapter).toBe(4)
  })

  it("keeps removing after a save fails", async () => {
    databaseService.applyChanges
      .mockReturnValueOnce(Promise.reject(new Error("QuotaExceededError")))
      .mockReturnValueOnce(Promise.resolve())
    vi.spyOn(console, "error").mockReturnValue(undefined)

    await expect(service.addBookmark("JHN", 3, "#4CAF50")).rejects.toThrow()
    await service.removeBookmark("GEN", 1)

    const bookmarks = await firstValueFrom(service.bookmarks$)
    expect(bookmarks.some((b) => b.bookId === "GEN")).toBe(false)
  })

  it("holds a write started before the load until the load finishes", async () => {
    let finishLoad: (bookmarks: Bookmark[]) => void = () => {}
    databaseService.getAll.mockReturnValueOnce(
      new Promise<Bookmark[]>((resolve) => {
        finishLoad = resolve
      }),
    )
    const loading = TestBed.runInInjectionContext(() => new BookmarkService())

    const write = loading.addBookmark("JHN", 3, "#F44336")
    finishLoad(JSON.parse(JSON.stringify(mockBookmarks)))
    await write

    const bookmarks = await firstValueFrom(loading.bookmarks$)
    expect(bookmarks.map((b) => b.bookId)).toEqual(["MRK", "JHN"])
    expect(databaseService.applyChanges).toHaveBeenCalledWith(
      "bookmarks",
      [["GEN", 1]],
      [expect.objectContaining({ bookId: "JHN" })],
    )
  })

  it("should filter bookmarks for a specific book", async () => {
    const bookmarks = await firstValueFrom(service.getBookmarksForBook("GEN"))
    expect(bookmarks.length).toBe(1)
    expect(bookmarks[0].bookId).toBe("GEN")
  })
})

describe("BookmarkService over a real IndexedDB", () => {
  function deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("offline-bible")
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /** Each tab has its own BookmarkService and so its own in-memory list. */
  async function openTab(): Promise<BookmarkService> {
    const tab = TestBed.runInInjectionContext(() => new BookmarkService())
    await tab.initialized
    return tab
  }

  async function savedColors(): Promise<string[]> {
    const fresh = await openTab()
    const bookmarks = await firstValueFrom(fresh.bookmarks$)
    return bookmarks.map((b) => b.color).sort()
  }

  beforeEach(deleteDatabase)
  afterEach(deleteDatabase)

  it("keeps the ribbons another tab added since this one loaded", async () => {
    const first = await openTab()
    const second = await openTab()

    await first.addBookmark("GEN", 1, "red")
    await second.addBookmark("MRK", 2, "blue")

    expect(await savedColors()).toEqual(["blue", "red"])
  })

  it("touches only the changed record after a failed load", async () => {
    const database = TestBed.inject(DatabaseService)
    await database.applyChanges(
      "bookmarks",
      [],
      [{ bookId: "GEN", chapter: 1, color: "red", timestamp: 1 }],
    )
    vi.spyOn(database, "getAll").mockRejectedValueOnce(new Error("no open"))
    vi.spyOn(console, "error").mockReturnValue(undefined)
    const afterFailure = await openTab()

    await afterFailure.addBookmark("MRK", 2, "blue")

    expect(await savedColors()).toEqual(["blue", "red"])
  })

  it("replaces the ribbon on a chapter, as the put reuses the deleted key", async () => {
    const tab = await openTab()

    await tab.addBookmark("GEN", 1, "red")
    await tab.addBookmark("GEN", 1, "blue")

    expect(await savedColors()).toEqual(["blue"])
  })
})
