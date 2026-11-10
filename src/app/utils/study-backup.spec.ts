import type { VerseHighlight } from "../services/highlight.service"
import type { VerseNote } from "../services/notes.service"
import {
  BACKUP_APP,
  BACKUP_VERSION,
  buildBackup,
  dayStamp,
  type NotebookContext,
  notebookEntries,
  parseBackup,
  toMarkdown,
  toPlainText,
} from "./study-backup"

const note = (
  bookId: string,
  chapter: number,
  verse: number,
  text: string,
  extra: Partial<VerseNote> = {},
): VerseNote => ({ bookId, chapter, verse, text, updatedAt: 1000, ...extra })

const mark = (
  bookId: string,
  chapter: number,
  verse: number,
  color: VerseHighlight["color"],
): VerseHighlight => ({ bookId, chapter, verse, color, updatedAt: 1000 })

const context: NotebookContext = {
  reference: (e) => `${e.bookId.toUpperCase()} ${e.chapter},${e.verse}`,
  url: (e) =>
    `https://exemplo.pt/${e.bookId}/${e.chapter}?verseStart=${e.verse}`,
  edition: "Bíblia Sagrada, Difusora Bíblica",
  day: "2026-11-03",
}

describe("a saved copy of the notes and marks", () => {
  it("reads back what it was made from", () => {
    const backup = buildBackup(
      [note("mat", 22, 37, "o maior mandamento")],
      [mark("mat", 22, 37, "yellow")],
      new Date("2026-11-03T10:00:00Z"),
    )

    const result = parseBackup(JSON.stringify(backup))

    expect(result).toEqual({ ok: true, backup, dropped: 0 })
    expect(backup).toMatchObject({
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: "2026-11-03T10:00:00.000Z",
    })
  })

  it("keeps a title and the end of a passage a note carries", () => {
    const withTitle = note("lk", 4, 16, "Nazaré", {
      title: "Homilia",
      verseEnd: 30,
    })

    const result = parseBackup(
      JSON.stringify(buildBackup([withTitle], [], new Date())),
    )

    expect(result.ok && result.backup.notes[0]).toEqual(withTitle)
  })

  it.each([
    ["is not JSON", "isto não é JSON"],
    ["is JSON that is not ours", JSON.stringify({ hello: "world" })],
    ["is a list", JSON.stringify([1, 2, 3])],
    ["has no version", JSON.stringify({ app: BACKUP_APP })],
  ])("refuses a file that %s", (_why, text) => {
    expect(parseBackup(text).ok).toBe(false)
  })

  it("says plainly when the file comes from a newer version", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: BACKUP_VERSION + 1,
        notes: [],
        highlights: [],
      }),
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain("versão mais recente")
  })

  it("leaves out the records that do not hold up, and counts them", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        exportedAt: "x",
        notes: [
          note("mat", 22, 37, "boa"),
          { bookId: "mat", chapter: "22", verse: 1, text: "capítulo errado" },
          note("mat", 22, 38, ""),
        ],
        highlights: [
          mark("mat", 22, 37, "pink"),
          { ...mark("mat", 22, 38, "pink"), color: "magenta" },
        ],
      }),
    )

    expect(result.ok && result.backup.notes).toHaveLength(1)
    expect(result.ok && result.backup.highlights).toHaveLength(1)
    expect(result.ok && result.dropped).toBe(3)
  })

  // Nothing in the reader can show a record at such a place, so it could never
  // be deleted one by one, and every later copy would carry it.
  it("leaves out notes and marks whose place is not a verse's, and counts them", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        exportedAt: "x",
        notes: [
          note("mat", 5, 3, "boa"),
          note("mat", 0, 1, "na introdução do livro"),
          note("xyz", -1, 2.5, "como no ficheiro de exemplo"),
          note("", 5, 3, "sem livro"),
          note("mat", 5, 0, "verso zero"),
          note("mat", 1.5, 1, "capítulo fraccionado"),
        ],
        highlights: [
          mark("mat", 5, 3, "pink"),
          mark("xyz", -1, 2.5, "pink"),
          mark("mat", 5, 0, "pink"),
        ],
      }),
    )

    expect(result.ok && result.backup.notes.map((n) => n.text)).toEqual([
      "boa",
      "na introdução do livro",
    ])
    expect(result.ok && result.backup.highlights).toHaveLength(1)
    expect(result.ok && result.dropped).toBe(6)
  })

  // A blank note with a late update time would replace the reader's real one.
  it("counts a note of only whitespace among the records that do not hold up", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        exportedAt: "x",
        notes: [{ ...note("mat", 5, 3, "   "), updatedAt: 9e12 }],
        highlights: [],
      }),
    )

    expect(result.ok && result.backup.notes).toEqual([])
    expect(result.ok && result.dropped).toBe(1)
  })

  it("does not choke on a copy with a list missing", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        notes: [note("a", 1, 1, "x")],
      }),
    )

    expect(result.ok && result.backup.highlights).toEqual([])
  })
})

describe("the notes and marks as one list", () => {
  it("joins a note and a mark on the same verse into one entry", () => {
    const entries = notebookEntries(
      [note("mat", 22, 37, "nota")],
      [mark("mat", 22, 37, "green")],
    )

    expect(entries).toEqual([
      {
        bookId: "mat",
        chapter: 22,
        verse: 37,
        note: note("mat", 22, 37, "nota"),
        color: "green",
      },
    ])
  })

  it("sets them in the Bible's order, not the order they were written", () => {
    const entries = notebookEntries(
      [note("rev", 1, 1, "c"), note("mat", 5, 3, "b")],
      [mark("gen", 1, 1, "blue"), mark("mat", 5, 1, "pink")],
    )

    expect(entries.map((e) => `${e.bookId} ${e.chapter},${e.verse}`)).toEqual([
      "gen 1,1",
      "mat 5,1",
      "mat 5,3",
      "rev 1,1",
    ])
  })

  it("puts a book it does not know last rather than losing it", () => {
    const entries = notebookEntries(
      [note("zzz", 1, 1, "x"), note("gen", 1, 1, "y")],
      [],
    )

    expect(entries.map((e) => e.bookId)).toEqual(["gen", "zzz"])
  })
})

describe("the notes and marks as text", () => {
  const entries = notebookEntries(
    [
      note("mat", 22, 37, "O maior mandamento.\nAmar a Deus.", {
        title: "Homilia",
      }),
    ],
    [mark("mat", 22, 37, "yellow"), mark("mat", 22, 39, "blue")],
  )

  it("writes plain text with the colour as a word", () => {
    expect(
      toPlainText(entries, {
        ...context,
        quote: (e) => (e.verse === 37 ? "Amarás o Senhor" : undefined),
      }),
    ).toBe(
      [
        "As minhas notas e marcas",
        "Bíblia Sagrada, Difusora Bíblica",
        "2026-11-03",
        "",
        "MAT 22,37",
        "Marca: amarelo",
        "«Amarás o Senhor»",
        "Nota: Homilia",
        "O maior mandamento.",
        "Amar a Deus.",
        "",
        "MAT 22,39",
        "Marca: azul",
        "",
      ].join("\n"),
    )
  })

  it("writes Markdown whose headings link back to the verse", () => {
    const text = toMarkdown(entries, context)

    expect(text).toContain(
      "## [MAT 22,37](https://exemplo.pt/mat/22?verseStart=37)",
    )
    expect(text).toContain("**Marca: amarelo**")
    expect(text).toContain("**Homilia**")
    expect(text).toContain(
      "## [MAT 22,39](https://exemplo.pt/mat/22?verseStart=39)",
    )
    expect(text.endsWith("\n")).toBe(true)
  })

  it("has a page, not just a header, when there is nothing yet", () => {
    expect(toPlainText([], context)).toBe(
      "As minhas notas e marcas\nBíblia Sagrada, Difusora Bíblica\n2026-11-03\n",
    )
  })
})

describe("dayStamp", () => {
  // Late in the evening west of Greenwich, the UTC date is already tomorrow's:
  // the file and the page must carry the day the reader is in. The date's own
  // accessors are pinned, so this holds in whatever zone the suite runs in.
  it("is the reader's own day, not the UTC one", () => {
    const date = new Date("2026-11-04T01:00:00Z")
    vi.spyOn(date, "getFullYear").mockReturnValue(2026)
    vi.spyOn(date, "getMonth").mockReturnValue(10)
    vi.spyOn(date, "getDate").mockReturnValue(3)

    expect(dayStamp(date)).toBe("2026-11-03")
  })

  it("pads the month and the day", () => {
    expect(dayStamp(new Date(2026, 0, 5, 12))).toBe("2026-01-05")
  })
})
