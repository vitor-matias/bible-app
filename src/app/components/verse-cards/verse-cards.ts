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
 * word of Scripture — and with nothing else. The cards carry no pericope
 * headings, so those come out of the verse text together with the parallel
 * references that belong to them (the edition hangs both on the end of the
 * verse BEFORE the pericope, where they would read as part of that verse).
 *
 * Returns display copies; the chapter itself is left untouched.
 */
export function toVerseCards(chapter: Chapter): Verse[] {
  const cards: Verse[] = []

  for (const verse of chapter.verses ?? []) {
    const text: TextType[] = []
    let afterHeading = false
    for (const element of verse.text) {
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
