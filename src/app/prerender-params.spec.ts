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
    ]

    const params = await fetchPrerenderChapterParams(fetchReturning(books))

    expect(params).toEqual([{ book: "gn", chapter: "1" }])
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

  it("returns an empty list on a non-OK response", async () => {
    spyOn(console, "warn")
    await expectAsync(
      fetchPrerenderChapterParams(fetchReturning(null, false)),
    ).toBeResolvedTo([])
  })
})
