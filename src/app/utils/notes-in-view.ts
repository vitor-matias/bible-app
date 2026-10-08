/** A verse of the chapter and where it is on screen. */
export interface PlacedVerse {
  verse: Verse
  top: number
  bottom: number
  left: number
  right: number
}

/** The part of the screen the text shows in, clear of the bars. */
export interface ViewBand {
  top: number
  bottom: number
  width: number
}

const hasNotes = (verse: Verse) =>
  verse.text.some((part) => part.type === "footnote")

/**
 * The verses whose notes the Notas button opens: those on screen that have
 * notes, in order. With none on screen, the last one before it, which was
 * just read; failing that, the next one after. Before and after are above
 * and below when scrolling, and on the pages to the left and right in
 * page-by-page mode.
 */
export function notesInView(placed: PlacedVerse[], band: ViewBand): Verse[] {
  const withNotes = placed.filter(({ verse }) => hasNotes(verse))
  const before = ({ bottom, right }: PlacedVerse) =>
    bottom <= band.top || right <= 0
  const after = ({ top, left }: PlacedVerse) =>
    top >= band.bottom || left >= band.width
  const onScreen = withNotes.filter((p) => !before(p) && !after(p))
  if (onScreen.length) return onScreen.map(({ verse }) => verse)
  const earlier = withNotes.filter(before)
  if (earlier.length) return [earlier[earlier.length - 1].verse]
  const later = withNotes.find(after)
  return later ? [later.verse] : []
}
