/**
 * Canonical grouping of the 73 books (Difusora Bíblica canon) by testament,
 * keyed by book id. Shared by the book selector (picker UI) and the book
 * index (crawlable links on the home page) so both always agree on order
 * and membership.
 */
export interface CanonGroup {
  name: string
  books: string[]
}

export const OLD_TESTAMENT_GROUPS: CanonGroup[] = [
  {
    name: "Pentateuco",
    books: ["gen", "exo", "lev", "num", "deu"],
  },
  {
    name: "Livros Históricos",
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
    books: ["job", "psa", "pro", "ecc", "sng", "wis", "sir"],
  },
  {
    name: "Livros Proféticos",
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
    books: ["mat", "mrk", "luk", "jhn", "act"],
  },
  {
    name: "Cartas de São Paulo",
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
    books: ["jas", "1pe", "2pe", "1jn", "2jn", "3jn", "jud"],
  },
  {
    name: "Apocalipse",
    books: ["rev"],
  },
]
