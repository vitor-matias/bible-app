/**
 * What a link's `verseStart` and `verseEnd` name: a verse's printed number
 * ("3"), or, for a verse of one of Ester's Greek additions (A to F), which the
 * printed edition numbers apart from the chapter's own, its letter and number
 * ("A1"). The number a verse is stored under (`Verse.number`) is neither: the
 * chapter's verses after an addition are stored past it.
 */
export interface VerseRef {
  number: number
  /** Set when the link carries a letter: the verse is one of an addition's. */
  addition?: boolean
}

const ESTHER_ID = "est"
const SIRACH_ID = "sir"
/** Which letter each of Ester's chapters with an addition prints it under. */
const ESTHER_ADDITION_LETTERS: Record<number, string> = {
  1: "A",
  3: "B",
  4: "C",
  5: "D",
  8: "E",
  10: "F",
}

/**
 * A link's verse ("16", "A1"); undefined for anything else, or for 0. What
 * follows the digits is ignored, as the reader always did ("16b" opens 16). A
 * parameter given twice reads as its first.
 */
export function parseVerseRef(raw: unknown): VerseRef | undefined {
  const text = Array.isArray(raw) ? raw[0] : raw
  if (typeof text !== "string") return undefined
  const match = /^([A-Za-z]?)(\d+)/.exec(text.trim())
  if (!match) return undefined
  const number = Number(match[2])
  if (!(number > 0)) return undefined
  return match[1] ? { number, addition: true } : { number }
}

/** The number a verse is printed with ("16"; "1" for an addition's first). */
export function printedNumber(
  verse: Pick<Verse, "number" | "numberLabel">,
): number {
  const printed = Number.parseInt(verse.numberLabel ?? "", 10)
  return Number.isNaN(printed) ? verse.number : printed
}

type StoredVerse = Pick<Verse, "number" | "numberLabel" | "supplement">

/**
 * Whether a verse is numbered apart from the chapter's own: one of Ester's
 * Greek additions (flagged), or a line of Ben Sira's prologue, which the
 * source stores unflagged ahead of chapter 1 with labels that run ahead of its
 * keys (1, 5, 10, ... as keys 1-8). Elsewhere a verse is printed as it is
 * stored, or behind it, after an addition.
 */
export function isAddition(verse: StoredVerse): boolean {
  return (
    !!verse.supplement ||
    (verse.number > 0 && printedNumber(verse) > verse.number)
  )
}

/**
 * The link's value for a verse held as stored: its printed number, with its
 * letter for an addition's.
 */
export function verseRefValue(
  verse: StoredVerse,
  bookId: string,
  chapter: number,
): string | number {
  const printed = printedNumber(verse)
  if (!isAddition(verse)) return printed
  const letter =
    (bookId === ESTHER_ID ? ESTHER_ADDITION_LETTERS[chapter] : undefined) ??
    (bookId === SIRACH_ID ? "P" : "A")
  return `${letter}${printed}`
}

const ofKind = (verses: readonly StoredVerse[], addition: boolean) =>
  verses.filter((verse) => verse.number > 0 && isAddition(verse) === addition)

/**
 * The number the verse a link names is stored under; undefined for a verse the
 * chapter doesn't have. A chapter without additions stores its verses under
 * their printed numbers, as a chapter cached before the additions were split
 * out does, so those answer as they are. Where there are additions the two
 * are apart, and a printed number the chapter lacks may be the key of another
 * verse: it opens nothing.
 */
export function resolveVerseKey(
  verses: readonly StoredVerse[],
  ref: VerseRef,
  /** The letter an end of range inherits from its start. */
  inheritedAddition?: boolean,
): number | undefined {
  const addition = ref.addition ?? inheritedAddition ?? false
  // The last one: a chapter's own verses come after what is numbered apart
  // from them, and a line of it may print the same number (Sir 1,5).
  const found = ofKind(verses, addition)
    .filter((verse) => printedNumber(verse) === ref.number)
    .at(-1)
  if (found) return found.number
  return verses.some(isAddition) ? undefined : ref.number
}

/**
 * The same for the end of a range. One the chapter lacks ("Est 1,20-23" in a
 * chapter of 22, or a verse the translation omits) ends the range at the last
 * verse of its kind before it, as stored: the printed number would fall before
 * the start where the two are apart, and a verse past it must not be reached.
 */
export function resolveVerseEndKey(
  verses: readonly StoredVerse[],
  ref: VerseRef,
  inheritedAddition?: boolean,
): number {
  const addition = ref.addition ?? inheritedAddition ?? false
  const upTo = ofKind(verses, addition).filter(
    (verse) => printedNumber(verse) <= ref.number,
  )
  const exact = upTo
    .filter((verse) => printedNumber(verse) === ref.number)
    .at(-1)
  return (exact ?? upTo.at(-1))?.number ?? ref.number
}
