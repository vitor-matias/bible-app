import { CANON_ORDER } from "../bible-canon"
import {
  HIGHLIGHT_COLOR_NAMES,
  type HighlightColor,
  isVerseHighlight,
  type VerseHighlight,
} from "../services/highlight.service"
import { isVerseNote, type VerseNote } from "../services/notes.service"

/**
 * A copy of what the reader has written, to keep in a file. Notes and marks
 * live in one browser and nowhere else, so this is the only copy that survives
 * clearing it, changing computer or reinstalling the app.
 *
 * Versioned, so a later release can read an old file and an old release can
 * tell it has met a newer one rather than half-understanding it.
 */
export const BACKUP_APP = "biblia-sagrada"
export const BACKUP_VERSION = 1

export type StudyBackup = {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  notes: VerseNote[]
  highlights: VerseHighlight[]
}

/** What a file this big could only be: not one of ours, and not worth parsing. */
const MAX_BACKUP_CHARS = 8_000_000

export function buildBackup(
  notes: VerseNote[],
  highlights: VerseHighlight[],
  exportedAt: Date,
): StudyBackup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    notes,
    highlights,
  }
}

export type BackupResult =
  | { ok: true; backup: StudyBackup; dropped: number }
  | { ok: false; reason: string }

/**
 * Reads a saved copy. Anything that is not one is refused with a reason a
 * reader can act on; records inside a good copy that do not hold up are left
 * out and counted, rather than failing the whole file or being stored as
 * something the app cannot read back.
 */
export function parseBackup(text: string): BackupResult {
  if (text.length > MAX_BACKUP_CHARS) {
    return { ok: false, reason: "O ficheiro é demasiado grande." }
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: "Isto não é uma cópia guardada por esta app." }
  }
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "Isto não é uma cópia guardada por esta app." }
  }
  const file = data as Partial<StudyBackup>
  if (file.app !== BACKUP_APP || typeof file.version !== "number") {
    return { ok: false, reason: "Isto não é uma cópia guardada por esta app." }
  }
  if (file.version > BACKUP_VERSION) {
    return {
      ok: false,
      reason:
        "Esta cópia foi guardada por uma versão mais recente da app. Atualize a app e tente de novo.",
    }
  }

  const rawNotes = Array.isArray(file.notes) ? file.notes : []
  const rawMarks = Array.isArray(file.highlights) ? file.highlights : []
  const notes = rawNotes.filter(isVerseNote)
  const highlights = rawMarks.filter(isVerseHighlight)
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      version: file.version,
      exportedAt: typeof file.exportedAt === "string" ? file.exportedAt : "",
      notes,
      highlights,
    },
    dropped:
      rawNotes.length - notes.length + (rawMarks.length - highlights.length),
  }
}

/** One verse with whatever the reader left on it. */
export type NotebookEntry = {
  bookId: Book["id"]
  chapter: Chapter["number"]
  verse: Verse["number"]
  note?: VerseNote
  color?: HighlightColor
}

const entryKey = (e: Pick<NotebookEntry, "bookId" | "chapter" | "verse">) =>
  `${e.bookId}:${e.chapter}:${e.verse}`

/** Notes and marks, joined by verse and set in the Bible's own order. */
export function notebookEntries(
  notes: VerseNote[],
  highlights: VerseHighlight[],
): NotebookEntry[] {
  const byVerse = new Map<string, NotebookEntry>()
  const entryFor = (record: NotebookEntry): NotebookEntry => {
    const key = entryKey(record)
    let entry = byVerse.get(key)
    if (!entry) {
      entry = {
        bookId: record.bookId,
        chapter: record.chapter,
        verse: record.verse,
      }
      byVerse.set(key, entry)
    }
    return entry
  }
  for (const note of notes) entryFor(note).note = note
  for (const mark of highlights) entryFor(mark).color = mark.color

  const place = (bookId: string): number => {
    const at = CANON_ORDER.indexOf(bookId)
    return at === -1 ? CANON_ORDER.length : at
  }
  return [...byVerse.values()].sort(
    (a, b) =>
      place(a.bookId) - place(b.bookId) ||
      a.chapter - b.chapter ||
      a.verse - b.verse,
  )
}

/** What the renderers need to know that only the app can say. */
export type NotebookContext = {
  /** "Mateus 22,37" */
  reference: (entry: NotebookEntry) => string
  /** Where the verse is, for a link back. */
  url: (entry: NotebookEntry) => string
  /** The words of the verse, when they are to hand. */
  quote?: (entry: NotebookEntry) => string | undefined
  /** The edition, named once. */
  edition: string
  /** The day it was made, as "2026-11-03". */
  day: string
}

const TITLE = "As minhas notas e marcas"

function markLine(entry: NotebookEntry): string | undefined {
  return entry.color
    ? `Marca: ${HIGHLIGHT_COLOR_NAMES[entry.color]}`
    : undefined
}

function noteLines(entry: NotebookEntry): string[] {
  if (!entry.note) return []
  const { title, text } = entry.note
  return [title ? `Nota: ${title}` : "Nota:", ...text.split("\n")]
}

/** Plain text, for pasting anywhere and for a screen reader to read. */
export function toPlainText(
  entries: NotebookEntry[],
  context: NotebookContext,
): string {
  const blocks = entries.map((entry) => {
    const quote = context.quote?.(entry)
    return [
      context.reference(entry),
      markLine(entry),
      quote ? `«${quote}»` : undefined,
      ...noteLines(entry),
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n")
  })
  return [TITLE, context.edition, context.day, "", blocks.join("\n\n")]
    .join("\n")
    .trimEnd()
    .concat("\n")
}

/** Markdown, each verse a heading that links back into the app. */
export function toMarkdown(
  entries: NotebookEntry[],
  context: NotebookContext,
): string {
  const blocks = entries.map((entry) => {
    const quote = context.quote?.(entry)
    const lines = [`## [${context.reference(entry)}](${context.url(entry)})`]
    const mark = markLine(entry)
    if (mark) lines.push("", `**${mark}**`)
    if (quote) lines.push("", `> ${quote}`)
    if (entry.note) {
      lines.push("")
      if (entry.note.title) lines.push(`**${entry.note.title}**`, "")
      lines.push(entry.note.text)
    }
    return lines.join("\n")
  })
  return [
    `# ${TITLE}`,
    "",
    `*${context.edition}, ${context.day}*`,
    "",
    ...blocks,
  ]
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n")
}

/**
 * "2026-11-03", for a file's name and a printed page: the reader's own day, not
 * the UTC one, which at night is already (or still) another.
 */
export function dayStamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}
