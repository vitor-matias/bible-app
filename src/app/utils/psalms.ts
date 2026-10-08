/**
 * The Psalms' two numberings. This edition numbers them as the Hebrew Bible
 * does; the liturgical books, and so the leaflets read at Mass, follow the
 * Greek Septuagint and the Latin Vulgate, which give most psalms between 9 and
 * 147 a number one lower. The edition's introduction to the Psalms gives the
 * correspondence below and prints the liturgical number in parentheses, e.g.
 * "Salmo 23 (22)". Verse numbers are the same in both.
 */

export const PSALMS_BOOK_ID = "psa"

/**
 * The liturgical number of a psalm of this edition ("22" for Psalm 23, "9" for
 * Psalm 10, "114-115" for Psalm 116), or null where both numberings agree.
 */
export function liturgicalPsalmNumber(psalm: number): string | null {
  if (psalm === 10) return "9"
  if (psalm >= 11 && psalm <= 113) return String(psalm - 1)
  if (psalm === 114 || psalm === 115) return "113"
  if (psalm === 116) return "114-115"
  if (psalm >= 117 && psalm <= 146) return String(psalm - 1)
  if (psalm === 147) return "146-147"
  return null
}

/**
 * Where a psalm numbered the liturgical way begins in this edition: the
 * liturgical Psalm 22 is this edition's 23, and the liturgical 115 the second
 * half of its 116 (verse 10). Null for numbers outside 1-150.
 */
export function psalmFromLiturgical(
  liturgical: number,
): { psalm: number; verse: number } | null {
  if (!Number.isInteger(liturgical) || liturgical < 1 || liturgical > 150) {
    return null
  }
  if (liturgical <= 9 || liturgical >= 147) {
    return { psalm: liturgical, verse: liturgical === 147 ? 12 : 1 }
  }
  if (liturgical <= 112) return { psalm: liturgical + 1, verse: 1 }
  if (liturgical === 113) return { psalm: 114, verse: 1 }
  if (liturgical === 114) return { psalm: 116, verse: 1 }
  if (liturgical === 115) return { psalm: 116, verse: 10 }
  return { psalm: liturgical + 1, verse: 1 } // 116-146
}

/**
 * Whether a bare psalm number could mean two different psalms: this edition's
 * psalm of that number, or the one the liturgy numbers so. Psalm 9 and 147
 * open in the same psalm either way.
 */
export function isAmbiguousPsalmNumber(psalm: number): boolean {
  const liturgical = psalmFromLiturgical(psalm)
  return !!liturgical && liturgical.psalm !== psalm
}

/**
 * A psalm cited with both numbers, as leaflets and this app do: "Sl 94 (95),
 * 1-2", "Salmo 23 (22)", "Sl 116 (114-115)", "Sl 115 (116B)". Gives this
 * edition's number for it, the rest of the reference (the verses), and,
 * when the pair names part of a psalm (the liturgy's Psalm 115 is the second
 * half of this edition's 116), the verse that part begins at. Null when the
 * text isn't such a pair, or the two numbers don't name the same psalm.
 */
export function parsePsalmPair(
  text: string,
): { psalm: number; book: string; rest: string; verse?: number } | null {
  const number = String.raw`\d{1,3}(?:\s*-\s*\d{1,3})?\s*[A-Za-z]?`
  const match = new RegExp(
    String.raw`^\s*(?<book>\p{L}+\.?)\s*(?<first>${number})\s*\(\s*(?<second>${number})\s*\)\s*(?<rest>.*)$`,
    "u",
  ).exec(text)
  if (!match?.groups) return null
  const { book, first, second, rest } = match.groups
  const a = psalmNumbers(first)
  const b = psalmNumbers(second)
  // Whichever of the two is this edition's single number maps onto the other.
  const pair = pairOf(a, b) ?? pairOf(b, a)
  if (!pair) return null
  return {
    psalm: pair.psalm,
    book,
    rest: rest.trim(),
    ...(pair.verse > 1 ? { verse: pair.verse } : {}),
  }
}

/** "114-115" or "116B": its numbers, and the letter of a psalm's half. */
function psalmNumbers(text: string): { numbers: number[]; half?: string } {
  const half = /[A-Za-z]$/.exec(text.trim())?.[0].toUpperCase()
  return {
    numbers: text.match(/\d{1,3}/g)?.map(Number) ?? [],
    ...(half ? { half } : {}),
  }
}

/**
 * `own` as this edition's number and `liturgical` as the liturgy's, when they
 * name the same psalm: the psalm, and the verse the named part begins at.
 */
function pairOf(
  own: { numbers: number[]; half?: string },
  liturgical: { numbers: number[] },
): { psalm: number; verse: number } | null {
  if (own.numbers.length !== 1) return null
  const psalm = own.numbers[0]
  const expected = liturgicalPsalmNumber(psalm)?.split("-").map(Number) ?? [
    psalm,
  ]
  const given = liturgical.numbers
  const whole = given.join("-") === expected.join("-")
  const part = given.length === 1 && expected.includes(given[0])
  if (!whole && !part) return null
  // The part named: the liturgy's single number ("115"), or the half of a
  // psalm the liturgy splits in two ("116B").
  const named =
    part && expected.length > 1
      ? given[0]
      : own.half && expected.length > 1
        ? expected[own.half === "B" ? 1 : 0]
        : undefined
  const start = named !== undefined ? psalmFromLiturgical(named) : null
  return {
    psalm,
    verse: start?.psalm === psalm ? start.verse : 1,
  }
}
