import { liturgicalPsalmNumber, PSALMS_BOOK_ID } from "./psalms"

type NamedBook = Pick<Book, "id" | "shortName">

/**
 * A passage as the text cites it, with a comma before the verse: "Lucas 2,32",
 * "Marcos 1". A psalm is named one at a time, with the liturgical number the
 * edition prints in parentheses where it differs: "Salmo 23 (22),4".
 */
export function passageLabel(
  book: NamedBook,
  chapter: number,
  verse?: number | string,
): string {
  const verses = verse !== undefined && verse !== "" ? `,${verse}` : ""
  if (book.id === PSALMS_BOOK_ID && chapter > 0) {
    const liturgical = liturgicalPsalmNumber(chapter)
    return `Salmo ${chapter}${liturgical ? ` (${liturgical})` : ""}${verses}`
  }
  return `${book.shortName} ${chapter}${verses}`
}

/**
 * Shorter forms of the same, longest first, for a toolbar too narrow for the
 * name: the book abbreviated as the text's own references are ("Dt 3",
 * "Gn Intro"), and a psalm, last, without its liturgical number ("Sl 23 (22)",
 * "Sl 23").
 */
export function passageShortLabels(
  book: Pick<Book, "id" | "abrv">,
  chapter: number,
): string[] {
  const abbreviated = `${cleanAbbreviation(book.abrv)} ${chapter === 0 ? "Intro" : chapter}`
  const liturgical =
    book.id === PSALMS_BOOK_ID && chapter > 0
      ? liturgicalPsalmNumber(chapter)
      : null
  return liturgical
    ? [`${abbreviated} (${liturgical})`, abbreviated]
    : [abbreviated]
}

/**
 * What a problem report is about, as the passage button names it: "Salmo 34
 * (33)", "Mateus Introdução", or just the page ("Sobre a Bíblia").
 */
export function reportSubject(book: NamedBook, chapter: number): string {
  if (book.id === "about") return book.shortName
  return chapter === 0
    ? `${book.shortName} Introdução`
    : passageLabel(book, chapter)
}

/** The API's abbreviations carry stray spaces and byte-order marks ("Tg \ufeff"). */
export function cleanAbbreviation(abrv: string): string {
  return abrv.replace(/[\s\ufeff]+/g, " ").trim()
}

/**
 * The same, for VoiceOver, which would read the parentheses as an aside:
 * "Salmo 23, na liturgia 22".
 */
export function passageSpokenLabel(
  book: NamedBook & Pick<Book, "name">,
  chapter: number,
): string {
  if (book.id === PSALMS_BOOK_ID && chapter > 0) {
    const liturgical = liturgicalPsalmNumber(chapter)
    return liturgical
      ? `Salmo ${chapter}, na liturgia ${liturgical.replace("-", " e ")}`
      : `Salmo ${chapter}`
  }
  return `${book.name} ${chapter}`
}
