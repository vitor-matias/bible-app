import {
  type BibleReference,
  BibleReferenceService,
  type CrossChapterRange,
  type VerseReference,
} from "../../services/bible-reference.service"

/**
 * Splits text into plain runs and the Bible references found in it.
 * `chapter` is what lets verse-only shorthand ("v.12") resolve, so callers
 * rendering footnotes pass it; callers rendering a references block, where
 * every reference names its own chapter, do not need to.
 */
export function parseReferences(
  bibleRef: BibleReferenceService,
  text: string,
  bookId: string,
  chapter?: number,
): (string | BibleReference)[] {
  const refs = bibleRef.extract(text, bookId, chapter)
  if (!refs.length) return [text]

  const parts: (string | BibleReference)[] = []
  let lastIdx = 0
  for (const ref of refs) {
    if (ref.index > lastIdx) {
      parts.push(text.slice(lastIdx, ref.index))
    }
    parts.push(ref)
    lastIdx = ref.index + ref.match.length
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx))
  }
  return parts
}

export function getVerseQueryParams(
  verses?: VerseReference[],
  crossChapter?: CrossChapterRange,
): { verseStart: number; verseEnd?: number } | null {
  if (crossChapter) {
    return { verseStart: crossChapter.startVerse }
  }

  if (!verses?.length) return null
  const first = verses[0]
  if (first.type === "single") {
    return { verseStart: first.verse }
  }
  if (first.type === "range") {
    return { verseStart: first.start, verseEnd: first.end }
  }
  return null
}
