/**
 * Where a chapter's cross references belong.
 *
 * A heading, and the references printed under it, arrive in the payload of
 * whichever verse precedes them — the verse before the passage they introduce,
 * or verse 0 when they head the chapter. So the verse a references block is
 * *stored* on is not the verse it is *about*, and everything that lists
 * references has to make the same correction: the study panel, which groups
 * them by passage, and the reverse index, which says where a verse is cited.
 * Kept here so the two cannot come to disagree about it.
 */

/** A references block, and the passage of its chapter it belongs to. */
export type PlacedReferences = {
  part: References
  /** The verse whose payload carries the block. */
  verse: Verse
  /** The verse the passage it belongs to starts at. */
  startsAt: Verse["number"]
  /**
   * Whether a heading in the same payload introduced the block, as opposed
   * to the block sitting in the run of a verse — the source of a quotation,
   * printed after it. The first kind speaks for the passage the heading
   * opens; the second for the verse it is printed in.
   */
  underHeading: boolean
  /**
   * Whether the block sits directly under a major heading (\ms in the USFM
   * this edition is built from). Such a block opens with the range the
   * division covers — "PRÓLOGO", then "(1,1-4)" — which is the division's own
   * extent, not a reference to anything.
   */
  underMajorHeading: boolean
}

/** The next verse with a number of its own, or the chapter's last. */
function nextVerseNumber(
  verses: Verse[],
  index: number,
  fallback: Verse["number"],
): Verse["number"] {
  for (let i = index + 1; i < verses.length; i++) {
    if (verses[i].number > 0) return verses[i].number
  }
  return fallback
}

export function lastVerseNumber(verses: Verse[]): Verse["number"] {
  return verses.reduce((highest, verse) => Math.max(highest, verse.number), 0)
}

/**
 * The verses that open a passage.
 *
 * Where a heading opens depends on what came before it in its verse: after
 * the verse's own words it introduces the *next* verse, while at the head of
 * the payload — the chapter's front matter, or a heading that falls
 * immediately before a verse's words — it introduces that verse.
 */
export function sectionStartsIn(verses: Verse[]): Verse["number"][] {
  const lastVerse = lastVerseNumber(verses)
  const starts = new Set<Verse["number"]>()
  verses.forEach((verse, index) => {
    let words = false
    for (const part of verse.text ?? []) {
      if (part.type === "section") {
        starts.add(
          words
            ? nextVerseNumber(verses, index, lastVerse)
            : Math.max(verse.number, 1),
        )
        words = false
        continue
      }
      if (part.type === "footnote" || part.type === "references") continue
      if (part.text.trim()) words = true
    }
  })
  return Array.from(starts).sort((a, b) => a - b)
}

/** The passage a verse sits in: the last heading at or before it. */
export function sectionStartAt(
  sectionStarts: Verse["number"][],
  verseNumber: Verse["number"],
): Verse["number"] {
  let start = 1
  for (const candidate of sectionStarts) {
    if (candidate <= Math.max(verseNumber, 1)) start = candidate
  }
  return start
}

/** Every references block of a chapter, in order, with where it belongs. */
export function placeReferences(
  verses: Verse[],
  sectionStarts = sectionStartsIn(verses),
): PlacedReferences[] {
  const lastVerse = lastVerseNumber(verses)
  const placed: PlacedReferences[] = []
  verses.forEach((verse, index) => {
    // The passage a heading in this verse has opened, if one has.
    let opened: Verse["number"] | undefined
    let words = false
    // The last heading seen, to tell a division's extent from a passage's
    // references: both are a references block under a heading.
    let previousSection: string | undefined
    for (const part of verse.text ?? []) {
      if (part.type === "section") {
        opened = words
          ? nextVerseNumber(verses, index, lastVerse)
          : Math.max(verse.number, 1)
        words = false
        previousSection = part.tag
        continue
      }
      if (part.type !== "references") {
        if (part.type !== "footnote" && part.text.trim()) words = true
        continue
      }
      placed.push({
        part,
        verse,
        // Under a heading the references belong to the passage it opens;
        // before one, to the passage this verse is already inside.
        startsAt: opened ?? sectionStartAt(sectionStarts, verse.number),
        underHeading: opened !== undefined,
        underMajorHeading: previousSection?.startsWith("ms") === true,
      })
      previousSection = undefined
    }
  })
  return placed
}
