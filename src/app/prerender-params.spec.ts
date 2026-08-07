import { fetchPrerenderChapterParams } from "./prerender-params"

describe("fetchPrerenderChapterParams", () => {
  function fetchReturning(body: unknown, ok = true): typeof fetch {
    return jasmine.createSpy("fetch").and.resolveTo({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
    } as Response) as unknown as typeof fetch
  }

  it("expands every book into one param set per chapter, using the URL abbreviation", async () => {
    const books = [
      {
        id: "GN",
        name: "Génesis",
        shortName: "Génesis",
        abrv: "Gn",
        chapterCount: 2,
      },
      {
        id: "1SM",
        name: "1.º Samuel",
        shortName: "1 Samuel",
        abrv: "1 Sm",
        chapterCount: 1,
      },
    ]

    const params = await fetchPrerenderChapterParams(fetchReturning(books))

    expect(params).toEqual([
      { book: "gn", chapter: "1" },
      { book: "gn", chapter: "2" },
      { book: "1sm", chapter: "1" },
    ])
  })

  it("skips malformed book entries", async () => {
    const books = [
      { abrv: "Gn", chapterCount: 1 },
      { abrv: "Ex" }, // no chapterCount
      { chapterCount: 3 }, // no abrv
      { abrv: "Lv", chapterCount: 0 }, // empty book
      { abrv: "   ", chapterCount: 2 }, // whitespace-only abbreviation
      { abrv: "Nm", chapterCount: 10_000 }, // absurd chapter count
    ]

    const params = await fetchPrerenderChapterParams(fetchReturning(books))

    expect(params).toEqual([{ book: "gn", chapter: "1" }])
  })

  it("bounds the book-list request with an abort signal", async () => {
    const fetchSpy = fetchReturning([]) as jasmine.Spy
    await fetchPrerenderChapterParams(fetchSpy as unknown as typeof fetch)

    const init = fetchSpy.calls.mostRecent().args[1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("returns an empty list instead of throwing when the API fails", async () => {
    spyOn(console, "warn")
    const failingFetch = jasmine
      .createSpy("fetch")
      .and.rejectWith(new Error("offline")) as unknown as typeof fetch

    await expectAsync(fetchPrerenderChapterParams(failingFetch)).toBeResolvedTo(
      [],
    )
    expect(console.warn).toHaveBeenCalled()
  })

  // Without a cap on the book count, the per-book chapter limit still lets a
  // large response expand into hundreds of thousands of route params and
  // exhaust build memory before the fallback below can run.
  it("returns an empty list when the API reports implausibly many books", async () => {
    spyOn(console, "warn")
    const books = Array.from({ length: 5_000 }, (_, index) => ({
      abrv: `bk${index}`,
      chapterCount: 200,
    }))

    await expectAsync(
      fetchPrerenderChapterParams(fetchReturning(books)),
    ).toBeResolvedTo([])
    expect(console.warn).toHaveBeenCalled()
  })

  it("returns an empty list on a non-OK response", async () => {
    spyOn(console, "warn")
    await expectAsync(
      fetchPrerenderChapterParams(fetchReturning(null, false)),
    ).toBeResolvedTo([])
  })
})
