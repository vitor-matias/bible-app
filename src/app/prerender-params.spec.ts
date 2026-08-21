import { fetchPrerenderChapterParams } from "./prerender-params"

describe("fetchPrerenderChapterParams", () => {
  /** Answers each endpoint with its own payload, like the real API. */
  function fetchByUrl(bodies: Record<string, unknown>): typeof fetch {
    return jasmine.createSpy("fetch").and.callFake((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.endsWith("/v1/intros") ? bodies["intros"] : bodies["books"],
          ),
      } as Response),
    ) as unknown as typeof fetch
  }

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

  it("prerenders the intro route for books that have an introduction", async () => {
    const books = [
      {
        id: "GN",
        name: "Génesis",
        shortName: "Génesis",
        abrv: "Gn",
        chapterCount: 2,
        introduction: [{ type: "introParagraph", text: "Texto" }],
      },
      {
        id: "PHM",
        name: "Filémon",
        shortName: "Filémon",
        abrv: "Fm",
        chapterCount: 1,
        introduction: [],
      },
    ]

    const params = await fetchPrerenderChapterParams(fetchReturning(books))

    expect(params).toEqual([
      { book: "gn", chapter: "intro" },
      { book: "gn", chapter: "1" },
      { book: "gn", chapter: "2" },
      { book: "fm", chapter: "1" },
    ])
  })

  it("prerenders an intro route for books covered by a shared introduction", async () => {
    const books = [
      {
        id: "1sa",
        name: "Primeiro Livro de Samuel",
        shortName: "1 Samuel",
        abrv: "1 Sm",
        chapterCount: 1,
      },
    ]

    const params = await fetchPrerenderChapterParams(fetchReturning(books))

    // 1 Samuel carries no introduction of its own, but the edition's
    // "Livros de Samuel" introduction is shown at /1sm/intro.
    expect(params).toEqual([
      { book: "1sm", chapter: "intro" },
      { book: "1sm", chapter: "1" },
    ])
  })

  it("keeps the intro route when the chapter count is unusable", async () => {
    const books = [
      {
        id: "GN",
        name: "Génesis",
        shortName: "Génesis",
        abrv: "Gn",
        chapterCount: 0,
        introduction: [{ type: "introParagraph", text: "Texto" }],
      },
    ]

    const params = await fetchPrerenderChapterParams(fetchReturning(books))

    expect(params).toEqual([{ book: "gn", chapter: "intro" }])
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

  it("prerenders a page for every standalone introduction", async () => {
    // These live at /:slug/intro and come from /v1/intros, not /v1/books, so
    // without their own pass they ship as an empty shell to crawlers.
    const params = await fetchPrerenderChapterParams(
      fetchByUrl({
        books: [
          {
            id: "GN",
            name: "Génesis",
            shortName: "Génesis",
            abrv: "Gn",
            chapterCount: 1,
          },
        ],
        intros: [
          { slug: "pentateuco", name: "INTRODUÇÃO AO PENTATEUCO" },
          { slug: "novotestamento", name: "NOVO TESTAMENTO" },
        ],
      }),
    )

    expect(params).toEqual([
      { book: "gn", chapter: "1" },
      { book: "pentateuco", chapter: "intro" },
      { book: "novotestamento", chapter: "intro" },
    ])
  })

  it("still returns the chapter routes when the intro listing fails", async () => {
    const fetchFn = jasmine.createSpy("fetch").and.callFake((url: string) =>
      url.endsWith("/v1/intros")
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve([
                {
                  id: "GN",
                  name: "Génesis",
                  shortName: "Génesis",
                  abrv: "Gn",
                  chapterCount: 1,
                },
              ]),
          } as Response),
    ) as unknown as typeof fetch

    const params = await fetchPrerenderChapterParams(fetchFn)

    expect(params).toEqual([{ book: "gn", chapter: "1" }])
  })
})
