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
