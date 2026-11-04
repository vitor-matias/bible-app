import { TestBed } from "@angular/core/testing"
import { type Route, UrlSegment } from "@angular/router"
import { chapterExists } from "./chapter-exists.guard"
import { BookService } from "./services/book.service"

describe("chapterExists", () => {
  const joao = {
    id: "jo",
    abrv: "Jo",
    shortName: "João",
    name: "João",
    chapterCount: 21,
  }
  const intro = {
    id: "pentateuco",
    abrv: "Pent",
    shortName: "P",
    name: "P",
    chapterCount: 0,
  }
  const about = {
    id: "about",
    abrv: "Sobre",
    shortName: "S",
    name: "S",
    chapterCount: 1,
  }
  const books = [joao, intro, about]
  let service: BookService

  beforeEach(() => {
    service = TestBed.inject(BookService)
    vi.spyOn(service, "initializeBooks").mockResolvedValue()
    vi.spyOn(service, "findBook").mockImplementation(
      (id) =>
        books.find((b) => b.id === id || b.abrv.toLowerCase() === id) ?? about,
    )
  })

  const run = (...paths: string[]) =>
    TestBed.runInInjectionContext(() =>
      chapterExists(
        {} as Route,
        paths.map((p) => new UrlSegment(p, {})),
        {} as never,
      ),
    )

  it("lets a real chapter through", async () => {
    expect(await run("jo", "3")).toBe(true)
  })

  it("rejects an unknown book", async () => {
    expect(await run("xx", "999")).toBe(false)
  })

  it("rejects a chapter past the book's last", async () => {
    expect(await run("jo", "99")).toBe(false)
  })

  it("lets the About page and an introduction through", async () => {
    expect(await run("sobre", "1")).toBe(true)
    expect(await run("about", "1")).toBe(true)
    expect(await run("pentateuco", "intro")).toBe(true)
  })

  it("leaves the decision to the reader when the books cannot load", async () => {
    vi.spyOn(service, "initializeBooks").mockRejectedValue(new Error("offline"))
    expect(await run("xx", "999")).toBe(true)
  })
})
