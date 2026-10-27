/**
 * Canonical grouping of the 73 books (Difusora Bíblica canon) by testament,
 * keyed by book id. Stated once here for the picker, the crawlable book index
 * and the prerender route list.
 */
export interface CanonGroup {
  name: string
  books: string[]
  /** Slug of this group's standalone introduction, when one exists. */
  introSlug?: string
}

/**
 * Books whose introduction is written once for a cluster of books rather than
 * per book: the edition introduces "Livros de Samuel" once, covering both.
 * Keyed by book id, valued by the slug of that shared introduction.
 */
export const SHARED_BOOK_INTROS: Readonly<Record<string, string>> = {
  "1sa": "samuel",
  "2sa": "samuel",
  "1ki": "reis",
  "2ki": "reis",
  "1ch": "cronicas",
  "2ch": "cronicas",
  ezr: "esdrasneemias",
  neh: "esdrasneemias",
  "2jn": "joao",
  "3jn": "joao",
}

/**
 * Introductions written for a few books within a group: the edition introduces
 * "Cartas de João" once, before the three letters. Unlike SHARED_BOOK_INTROS,
 * these books have introductions of their own, which would hide it, so the
 * book pickers list it as an entry before the first of them, keyed here.
 */
export const CLUSTER_INTROS: Readonly<Record<string, string>> = {
  "1co": "corintios",
  "1th": "tessalonicenses",
  "1ti": "pastorais",
  "1jn": "joao",
}

/** A cluster's introduction, listed among its group's books (CLUSTER_INTROS). */
export function isClusterIntro(bookId: string): boolean {
  return Object.values(CLUSTER_INTROS).includes(bookId)
}

export const OLD_TESTAMENT_GROUPS: CanonGroup[] = [
  {
    name: "Pentateuco",
    introSlug: "pentateuco",
    books: ["gen", "exo", "lev", "num", "deu"],
  },
  {
    name: "Livros Históricos",
    introSlug: "historicos",
    books: [
      "jos",
      "jdg",
      "rut",
      "1sa",
      "2sa",
      "1ki",
      "2ki",
      "1ch",
      "2ch",
      "ezr",
      "neh",
      "tob",
      "jdt",
      "est",
      "1ma",
      "2ma",
    ],
  },
  {
    name: "Livros Sapienciais",
    introSlug: "sapienciais",
    books: ["job", "psa", "pro", "ecc", "sng", "wis", "sir"],
  },
  {
    name: "Livros Proféticos",
    introSlug: "profeticos",
    books: [
      "isa",
      "jer",
      "lam",
      "bar",
      "ezk",
      "dan",
      "hos",
      "jol",
      "amo",
      "oba",
      "jon",
      "mic",
      "nam",
      "hab",
      "zep",
      "hag",
      "zec",
      "mal",
    ],
  },
]

export const NEW_TESTAMENT_GROUPS: CanonGroup[] = [
  {
    name: "Evangelhos e Atos",
    introSlug: "evangelhosatos",
    books: ["mat", "mrk", "luk", "jhn", "act"],
  },
  {
    name: "Cartas de São Paulo",
    introSlug: "cartaspaulo",
    books: [
      "rom",
      "1co",
      "2co",
      "gal",
      "eph",
      "php",
      "col",
      "1th",
      "2th",
      "1ti",
      "2ti",
      "tit",
      "phm",
    ],
  },
  {
    name: "Carta aos Hebreus",
    books: ["heb"],
  },
  {
    name: "Cartas Católicas",
    introSlug: "catolicas",
    books: ["jas", "1pe", "2pe", "1jn", "2jn", "3jn", "jud"],
  },
  {
    name: "Apocalipse",
    books: ["rev"],
  },
]

/**
 * The introductions that open each Testament in the book pickers, before its
 * groups: the general introduction, and the New Testament's. The API's slugs.
 */
export const OLD_TESTAMENT_INTRO = "geral"
export const NEW_TESTAMENT_INTRO = "novotestamento"

/**
 * The book pickers' groups: each group's introduction first and each
 * cluster's before its books, plus the ungrouped `leading` one (a group with
 * no books, named after it). Introductions that have not loaded are dropped,
 * so nothing renders blank.
 */
export function withIntros(
  groups: CanonGroup[],
  leading: string,
  hasBook: (bookId: string) => boolean,
): CanonGroup[] {
  const groupsWithIntros = groups.map((group) => {
    const books = group.books.flatMap((id) => {
      const intro = CLUSTER_INTROS[id]
      return intro && hasBook(intro) ? [intro, id] : [id]
    })
    return {
      ...group,
      books:
        group.introSlug && hasBook(group.introSlug)
          ? [group.introSlug, ...books]
          : books,
    }
  })

  return hasBook(leading)
    ? [{ name: leading, books: [] }, ...groupsWithIntros]
    : groupsWithIntros
}

/** The books in the edition's order, Génesis to Apocalipse. */
export const CANON_ORDER: readonly string[] = [
  ...OLD_TESTAMENT_GROUPS,
  ...NEW_TESTAMENT_GROUPS,
].flatMap((group) => group.books)

/** The book after `bookId` in the edition's order; none after Apocalipse. */
export function nextCanonBook(bookId: string): string | undefined {
  const index = CANON_ORDER.indexOf(bookId)
  return index >= 0 ? CANON_ORDER[index + 1] : undefined
}
