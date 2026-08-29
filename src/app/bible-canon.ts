/**
 * Canonical grouping of the 73 books (Difusora Bíblica canon) by testament,
 * keyed by book id. Kept out of the book selector so the canon is stated once,
 * independently of the picker UI that renders it — today the picker is the
 * only consumer.
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
 * Introductions that lead a testament rather than a group: one for the whole
 * Bible, one for the New Testament. Named here so the drawer's picker and the
 * study rail place them the same way.
 */
export const WHOLE_BIBLE_INTRO = "geral"
export const NEW_TESTAMENT_INTRO = "novotestamento"

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
