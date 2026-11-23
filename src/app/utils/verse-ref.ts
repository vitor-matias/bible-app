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

/**
 * The link's value for a verse held as stored: its printed number, with its
 * letter for an addition's.
 */
export function verseRefValue(
  verse: Pick<Verse, "number" | "numberLabel" | "supplement">,
  bookId: string,
  chapter: number,
): string | number {
  const printed = printedNumber(verse)
  if (!verse.supplement) return printed
  const letter =
    (bookId === ESTHER_ID ? ESTHER_ADDITION_LETTERS[chapter] : undefined) ?? "A"
  return `${letter}${printed}`
}

type StoredVerse = Pick<Verse, "number" | "numberLabel" | "supplement">

const ofKind = (verses: readonly StoredVerse[], addition: boolean) =>
  verses.filter((verse) => verse.number > 0 && !!verse.supplement === addition)

/**
 * The number the verse a link names is stored under. A chapter without
 * additions stores its verses under their printed numbers, as a chapter cached
 * before the additions were split out does, so those answer as they are.
 */
export function resolveVerseKey(
  verses: readonly StoredVerse[],
  ref: VerseRef,
  /** The letter an end of range inherits from its start. */
  inheritedAddition?: boolean,
): number {
  const addition = ref.addition ?? inheritedAddition ?? false
  return (
    ofKind(verses, addition).find(
      (verse) => printedNumber(verse) === ref.number,
    )?.number ?? ref.number
  )
}

/**
 * The same for the end of a range, which a link may carry past the last verse
 * ("Est 1,20-23" in a chapter of 22): the range then runs to the last one of
 * its kind, as stored, since the printed number would fall before the start.
 */
export function resolveVerseEndKey(
  verses: readonly StoredVerse[],
  ref: VerseRef,
  inheritedAddition?: boolean,
): number {
  const addition = ref.addition ?? inheritedAddition ?? false
  const kind = ofKind(verses, addition)
  return (
    kind.find((verse) => printedNumber(verse) === ref.number)?.number ??
    kind.at(-1)?.number ??
    ref.number
  )
}
