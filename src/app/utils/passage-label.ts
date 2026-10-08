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
