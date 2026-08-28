/**
 * Text folded down to what a reader means when they type it: no accents, no
 * case, no stray spacing. "genesis" finds "Génesis", "coracao" finds
 * "coração".
 *
 * One definition, because the book picker, the study rail and the note search
 * all have to agree on what counts as a match — three separate copies of this
 * is three chances for them to drift apart.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase()
}

/**
 * A passage as it would be quoted: the words, then where they came from.
 * Shared so the study panel and the selection bar cannot format it two ways.
 */
export function formatPassage(text: string, reference: string): string {
  return reference ? `${text} (${reference})` : text
}

/**
 * A result's text split into what matched and what did not, so a search can
 * show the reader where their words landed.
 *
 * Shared by the search page and the study panel's search tab: two copies is
 * two sets of rules about what counts as a hit.
 */
export function highlightSegments(
  text: string,
  term: string,
): HighlightSegment[] {
  if (!term.trim()) return [{ text, highlight: false }]

  const segments: HighlightSegment[] = []
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(escaped, "gi")
  let lastIndex = 0
  let match = regex.exec(text)
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        highlight: false,
      })
    }
    segments.push({ text: match[0], highlight: true })
    lastIndex = regex.lastIndex
    match = regex.exec(text)
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: false })
  }
  return segments.length > 0 ? segments : [{ text, highlight: false }]
}
