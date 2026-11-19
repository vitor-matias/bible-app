/** Written as an escape: the character itself is invisible in source. */
const ZERO_WIDTH_SPACE = "​"

function isReadable(text: TextType): boolean {
  return (
    (text.type === "text" || text.type === "quote") &&
    // Poetry lines open with a zero-width space that carries no words.
    text.text.replaceAll(ZERO_WIDTH_SPACE, "").trim() !== ""
  )
}

/**
 * Deals a chapter out one verse to a card, in order and without dropping a
 * word of Scripture — and with nothing else:
 *
 * - no pericope headings, which come out of the verse text together with the
 *   parallel references that belong to them (the edition hangs both on the end
 *   of the verse BEFORE the pericope, where they would read as part of it);
 * - no footnotes. A footnote element is all it takes for the verse component
 *   to draw its marker and turn the verse into a tap target for the notes
 *   sheet, so leaving them out of the copy removes both. The notes are one tap
 *   away in the reader's other views.
 *
 * Returns display copies; the chapter itself is left untouched.
 */
export function toVerseCards(chapter: Chapter): Verse[] {
  const cards: Verse[] = []

  for (const verse of chapter.verses ?? []) {
    const text: TextType[] = []
    let afterHeading = false
    for (const element of verse.text) {
      // Skipped before anything else so that a note sitting between a heading
      // and its references does not make those read as the verse's own.
      if (element.type === "footnote") continue
      if (element.type === "section") {
        afterHeading = true
      } else if (!(afterHeading && element.type === "references")) {
        afterHeading = false
        text.push(element)
      }
    }

    const first = text.findIndex(isReadable)
    // Nothing to read: "verse 0" when it only carries the chapter's opening
    // headings. When it does carry text (Esther's Greek additions, the
    // acrostic letters of Ps 119) it is dealt out like any verse.
    if (first === -1) continue

    // Breaks at either edge would open or close the card on a blank line; one
    // left in the middle — where a heading stood, say — still does its job.
    let end = text.length
    while (text[end - 1].type === "paragraph") end--
    cards.push({
      ...verse,
      text: text.filter(
        (element, index) =>
          index < end && (index >= first || element.type !== "paragraph"),
      ),
    })
  }
  return cards
}

/**
 * The line under the last verse of a book: "Fim do Livro do Génesis", "Fim da
 * Primeira Carta aos Coríntios". The article has to agree with the name, and
 * in this edition every feminine title is a "Carta" — the rest are a "Livro",
 * an "Evangelho" or the "Cântico dos Cânticos".
 */
export function endOfBookLabel(book: Book): string {
  const isFeminine = /^((primeira|segunda|terceira)\s+)?carta\b/i.test(
    book.name.trim(),
  )
  return `Fim ${isFeminine ? "da" : "do"} ${book.name.trim()}`
}
