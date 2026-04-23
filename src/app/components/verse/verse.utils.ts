import {
  type BibleReference,
  BibleReferenceService,
  type CrossChapterRange,
  type VerseReference,
} from "../../services/bible-reference.service"

// ── Types ────────────────────────────────────────────────────────────────────

export interface DisplayElement {
  data: TextType
  originalIndex: number
}

export interface DisplayGroup {
  type: "normal" | "quote"
  elements: DisplayElement[]
}

// ── Reference parsing ─────────────────────────────────────────────────────────

export function parseReferences(
  bibleRef: BibleReferenceService,
  text: string,
  bookId: string,
): (string | BibleReference)[] {
  const refs = bibleRef.extract(text, bookId)
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

// ── Layout computation ────────────────────────────────────────────────────────

/**
 * Returns the index in `verse.text` where the chapter number badge should be
 * rendered, or -1 if the badge should not appear for this verse.
 */
export function computeChapterNumberIndex(verse: Verse): number {
  if (verse.number !== 0) return -1

  const hasS2 = verse.text.some((t) => t.type === "section" && t.tag === "s2")

  for (let i = 0; i < verse.text.length; i++) {
    const text = verse.text[i]
    const isLast = i === verse.text.length - 1

    if ((text.type === "section" && text.tag === "s2") || (!hasS2 && isLast)) {
      return i
    }
  }
  return -1
}

/**
 * Groups verse text elements into contiguous "normal" and "quote" segments
 * so the template can render them with the correct indentation / styling.
 */
export function computeDisplayGroups(verse: Verse): DisplayGroup[] {
  const groups: DisplayGroup[] = []
  let currentGroup: DisplayGroup | null = null

  verse.text.forEach((text, originalIndex) => {
    const isContinuationType =
      text.type === "text" ||
      text.type === "references" ||
      text.type === "footnote"

    if (text.type === "quote") {
      currentGroup = {
        type: "quote",
        elements: [{ data: text, originalIndex }],
      }
      groups.push(currentGroup)
    } else if (currentGroup?.type === "quote" && isContinuationType) {
      currentGroup.elements.push({ data: text, originalIndex })
    } else {
      if (!currentGroup || currentGroup.type !== "normal") {
        currentGroup = {
          type: "normal",
          elements: [{ data: text, originalIndex }],
        }
        groups.push(currentGroup)
      } else {
        currentGroup.elements.push({ data: text, originalIndex })
      }
    }
  })

  return groups
}

/**
 * Returns the slice of `verse.text` that belongs to a single rendering
 * section starting at position `i` (ends before the next paragraph/quote).
 */
export function getDataForSection(verse: Verse, i: number): Verse {
  const afterText = verse.text.slice(i)
  const sectionText: TextType[] = []

  for (let index = 0; index < afterText.length; index++) {
    if (
      afterText[index].type === "paragraph" ||
      (afterText[index].type === "quote" && index > 0)
    ) {
      break
    }
    sectionText.push(afterText[index])
  }

  return { ...verse, text: sectionText }
}

/** Whether a paragraph marker should be rendered as visible spacing. */
export function shouldShowParagraph(
  verse: Verse,
  text: Paragraph,
  i: number,
): boolean {
  return (
    verse.number > 0 &&
    ((verse.text[i - 1]?.type !== "section" &&
      verse.text[i - 1]?.type !== "references" &&
      (verse.text[i - 1]?.type !== "paragraph" ||
        (verse.text[i - 1]?.type === "paragraph" && text.text.length > 2))) ||
      verse.bookId === "psa")
  )
}

/**
 * Returns true when the element at the end of section `i` is followed by a
 * quote element (or the next verse begins with a quote).
 */
export function checkNextIsQuote(
  verse: Verse,
  i: number,
  nextVerseStartsWithQuote: boolean,
): boolean {
  const sectionText = getDataForSection(verse, i).text
  const lastElementIndex = i + sectionText.length - 1

  if (lastElementIndex + 1 < verse.text.length) {
    const nextDisplayableIdx = verse.text.findIndex(
      (t, idx) =>
        idx > lastElementIndex &&
        t.type !== "footnote" &&
        t.type !== "references",
    )

    if (nextDisplayableIdx !== -1) {
      return verse.text[nextDisplayableIdx].type === "quote"
    }
  }

  return nextVerseStartsWithQuote
}

/**
 * Returns true when the element at the end of section `i` is followed by a
 * paragraph marker.
 */
export function checkNextIsParagraph(verse: Verse, i: number): boolean {
  const sectionText = getDataForSection(verse, i).text
  const lastElementIndex = i + sectionText.length - 1

  if (lastElementIndex + 1 < verse.text.length) {
    const nextDisplayableIdx = verse.text.findIndex(
      (t, idx) =>
        idx > lastElementIndex &&
        t.type !== "footnote" &&
        t.type !== "references",
    )

    if (nextDisplayableIdx !== -1) {
      return verse.text[nextDisplayableIdx].type === "paragraph"
    }
  }
  return false
}

/** Returns true if the element at `position` lives inside an s2 section. */
export function isInSection(data: TextType[], position: number): boolean {
  const beforeData = data.slice(0, position)

  for (let i = beforeData.length - 1; i >= 0; i--) {
    const current = beforeData[i]
    if (current.type === "section" && current.tag === "s2") return true
    if (current.type === "paragraph" || current.type === "quote") return false
  }
  return false
}

/** The `type` field of the first non-footnote, non-references text element. */
export function getFirstTextType(verse: Verse): string | undefined {
  return verse.text.find(
    (t) => t.type !== "footnote" && t.type !== "references",
  )?.type
}

/** True when the element at `index` is the first displayable (non-meta) element. */
export function isFirstDisplayableElement(
  verse: Verse,
  index: number,
): boolean {
  const firstIdx = verse.text.findIndex(
    (t) => t.type !== "footnote" && t.type !== "references",
  )
  return index === firstIdx
}
