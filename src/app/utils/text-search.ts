/** Text matching for search, online and over the Bible stored offline. */

export interface TextSegment {
  text: string
  highlight: boolean
}

/** A line of a verse (verseLines). */
export interface VerseLine {
  text: string
  /** It starts a paragraph. */
  paragraph: boolean
}

/**
 * A verse's lines, as the reader shows them. A quote is a line of verse; a
 * paragraph starts a new one and can carry text of its own. Within a line the
 * runs are joined as they are: the edition splits "Senhor" into a run of its
 * own (small capitals), so joining them with spaces put one before the
 * punctuation ("o Senhor :"). Lines are trimmed, without zero-width spaces,
 * and may be empty. A heading's runs are left out: the edition splits it too
 * ("O ", "Senhor", " é o Bom Pastor" after Ez 34,10), and the reader shows
 * the runs up to the next paragraph or quote as the heading
 * (VerseComponent.isInSection).
 */
export function verseLines(verse: Verse): VerseLine[] {
  const lines: VerseLine[] = [{ text: "", paragraph: false }]
  let inHeading = false
  for (const part of verse.text) {
    if (part.type === "section" && part.tag === "s2") {
      inHeading = true
    } else if (part.type === "quote" || part.type === "paragraph") {
      inHeading = false
      lines.push({ text: part.text, paragraph: part.type === "paragraph" })
    } else if (part.type === "text" && !inHeading) {
      lines[lines.length - 1].text += part.text
    }
  }
  return lines.map((line) => ({
    ...line,
    text: line.text.replace(/\u200b/g, "").trim(),
  }))
}

/** A verse as one line of text, its lines joined with a space. */
export function verseText(verse: Verse): string {
  return verseLines(verse)
    .map((line) => line.text)
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
 * `text` split into runs, the words of the query marked whole, accents and
 * case aside, and their plurals and feminines with them ("pai" marks "pais",
 * "senhor" "senhores"), but not longer words that merely begin with them:
 * "amor" left "amor" marked inside "amorreus". Where a word of the query
 * stands nowhere whole, the starts of words it matched are marked instead:
 * the search matches by word start, so a query typed halfway ("miseric") or
 * a verse with only "amorreus" never shows without a mark. Words of two
 * letters ("de", "os") are marked only when the query has no longer ones:
 * they hide inside most words.
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
    const whole: [number, number][] = []
    const starts: [number, number][] = []
    for (
      let at = indexOfWord(folded, word);
      at !== -1;
      at = indexOfWord(folded, word, at + word.length)
    ) {
      const end =
        at + (/^[\p{L}\p{N}]*/u.exec(folded.slice(at))?.[0].length ?? 0)
      if (/^(s|es|a|as|os)?$/.test(folded.slice(at + word.length, end)))
        whole.push([origin[at], origin[end]])
      starts.push([origin[at], origin[at + word.length]])
    }
    ranges.push(...(whole.length ? whole : starts))
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
