/** Text matching for search, online and over the Bible stored offline. */

export interface TextSegment {
  text: string
  highlight: boolean
}

/**
 * A verse as one line of text. Its runs are joined as they are: the edition
 * splits "Senhor" into a run of its own (small capitals), so joining them with
 * spaces put one before the punctuation ("o Senhor :"). Lines of verse
 * (quotes) and paragraphs are joined with a space.
 */
export function verseText(verse: Verse): string {
  const lines: string[] = [""]
  for (const part of verse.text) {
    if (part.type === "quote" || part.type === "paragraph") {
      lines.push(part.type === "quote" ? part.text : "")
    } else if (part.type === "text") {
      lines[lines.length - 1] += part.text
    }
  }
  return lines
    .map((line) => line.replace(/\u200b/g, "").trim())
    .filter(Boolean)
    .join(" ")
}

/** Lower case, without accents: "Misericórdia" and "misericordia" match. */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/**
 * The words a verse must contain to match `query`, folded. One-letter words
 * ("o", "é") would match nearly every verse, so they count only when the query
 * has nothing else.
 */
export function searchWords(query: string): string[] {
  const words = foldText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const longer = words.filter((word) => word.length > 1)
  return longer.length ? longer : words
}

/**
 * Where `word` begins a word of `folded` (both folded), from `from` on, or -1.
 * Matching from the start of words keeps "pai" out of "país" and "luz" out of
 * "reluz", and still finds "pais" for "pai".
 */
export function indexOfWord(folded: string, word: string, from = 0): number {
  for (
    let at = folded.indexOf(word, from);
    at !== -1;
    at = folded.indexOf(word, at + 1)
  ) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(folded[at - 1])) return at
  }
  return -1
}

/**
 * `text` split into runs, the query's words marked where words begin with them,
 * accents and case aside. Words of two letters ("de", "os") are marked only
 * when the query has no longer ones: they hide inside most words.
 */
export function highlightWords(text: string, query: string): TextSegment[] {
  const words = searchWords(query)
  const marked = words.some((word) => word.length > 2)
    ? words.filter((word) => word.length > 2)
    : words
  if (!marked.length) return [{ text, highlight: false }]

  const { folded, origin } = foldWithOrigin(text)
  const ranges: [number, number][] = []
  for (const word of marked) {
    for (
      let at = indexOfWord(folded, word);
      at !== -1;
      at = indexOfWord(folded, word, at + word.length)
    ) {
      ranges.push([origin[at], origin[at + word.length]])
    }
  }
  if (!ranges.length) return [{ text, highlight: false }]

  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }

  const segments: TextSegment[] = []
  let at = 0
  for (const [start, end] of merged) {
    if (start > at)
      segments.push({ text: text.slice(at, start), highlight: false })
    segments.push({ text: text.slice(start, end), highlight: true })
    at = end
  }
  if (at < text.length)
    segments.push({ text: text.slice(at), highlight: false })
  return segments
}

/**
 * `foldText(text)`, with where each of its characters came from in `text`
 * (and one more entry, for the end), so a match maps back onto the original.
 */
function foldWithOrigin(text: string): { folded: string; origin: number[] } {
  let folded = ""
  const origin: number[] = []
  for (let index = 0; index < text.length; ) {
    const character = String.fromCodePoint(text.codePointAt(index) ?? 0)
    const part = foldText(character)
    for (let k = 0; k < part.length; k++) origin.push(index)
    folded += part
    index += character.length
  }
  origin.push(text.length)
  return { folded, origin }
}
