import {
  ABOUT_GROUP,
  type CanonGroup,
  NEW_TESTAMENT_GROUPS,
  NEW_TESTAMENT_INTRO,
  OLD_TESTAMENT_GROUPS,
  OLD_TESTAMENT_INTRO,
  withIntros,
} from "../bible-canon"
import { BookService } from "../services/book.service"
import { passageSpokenLabel } from "./passage-label"
import { liturgicalPsalmNumber, PSALMS_BOOK_ID } from "./psalms"

/** Mirrors PassagePickerData in ios/App/App/PassagePicker.swift. */
export interface PassagePickerData {
  sections: PickerSection[]
  currentBookId: string
  currentChapter: number
}

export interface PickerSection {
  title: string
  groups: PickerGroup[]
}

export interface PickerGroup {
  /** Absent for books listed outside any group (the leading introductions). */
  title?: string
  books: PickerBook[]
}

export interface PickerBook {
  id: string
  label: string
  name: string
  /** "Gn", "Ex"…: the label in the picker's compact mode. */
  abbreviation: string
  /** Empty for pages without chapters, which open directly. */
  chapters: PickerChapter[]
}

export interface PickerChapter {
  number: number
  /** Empty for the introduction. */
  label: string
  /** A psalm's liturgical number, shown small under its own (psalms.ts). */
  detail?: string
  /** For VoiceOver, where "Capítulo 23" would be wrong: "Salmo 23, na liturgia 22". */
  spoken?: string
  title?: string
  /** The bookmark ribbon's colour, if the chapter is bookmarked. */
  bookmark?: string
}

/**
 * What the iOS passage picker lists: the web book selector's testaments and
 * groups, each book with its chapters, titles and bookmarks.
 */
export function buildPassagePicker(
  books: Book[],
  bookmarks: Bookmark[],
  current: { bookId: string; chapter: number },
): PassagePickerData {
  const byId = new Map(books.map((book) => [book.id, book]))
  const ribbons = new Map(
    bookmarks.map((bookmark) => [
      `${bookmark.bookId}/${bookmark.chapter}`,
      bookmark.color,
    ]),
  )

  const pickerBook = (book: Book): PickerBook => ({
    id: book.id,
    // Introductions read just "Introdução": the group above gives the context.
    label: book.introSlug ? "Introdução" : book.shortName,
    name: book.name,
    abbreviation: compactLabel(book),
    chapters: chaptersOf(book).map((chapter) => ({
      ...chapter,
      bookmark: ribbons.get(`${book.id}/${chapter.number}`),
    })),
  })

  const section = (
    title: string,
    groups: CanonGroup[],
    leading: string,
  ): PickerSection => ({
    title,
    groups: withIntros(groups, leading, (id) => byId.has(id)).flatMap(
      (group): PickerGroup[] => {
        // The leading introduction is a group with no books, named after it.
        if (group.books.length === 0) {
          const intro = byId.get(group.name)
          return intro ? [{ books: [pickerBook(intro)] }] : []
        }
        const members = group.books.flatMap((id) => {
          const book = byId.get(id)
          return book ? [pickerBook(book)] : []
        })
        return members.length ? [{ title: group.name, books: members }] : []
      },
    ),
  })

  return {
    sections: [
      section("Antigo Testamento", OLD_TESTAMENT_GROUPS, OLD_TESTAMENT_INTRO),
      section(
        "Novo Testamento",
        [...NEW_TESTAMENT_GROUPS, ABOUT_GROUP],
        NEW_TESTAMENT_INTRO,
      ),
    ],
    currentBookId: current.bookId,
    currentChapter: current.chapter,
  }
}

/** A book's label in the picker's compact mode. */
function compactLabel(book: Book): string {
  if (book.introSlug) return "Intro"
  if (book.id === "about") return "Sobre"
  return cleanAbbreviation(book.abrv)
}

/** The API's abbreviations carry stray spaces and byte-order marks ("Tg \ufeff"). */
export function cleanAbbreviation(abrv: string): string {
  return abrv.replace(/[\s\ufeff]+/g, " ").trim()
}

/** The book's chapters as the reader numbers them: 0 is the introduction. */
function chaptersOf(book: Book): Omit<PickerChapter, "bookmark">[] {
  // Standalone introductions and the About page are single pages.
  if (book.introSlug || book.id === "about") return []

  const titled = book.chapters?.length
    ? book.chapters
    : Array.from({ length: book.chapterCount }, (_, index) => ({
        number: index + 1,
        title: undefined,
      }))
  const psalms = book.id === PSALMS_BOOK_ID
  const chapters = titled.map(({ number, title }) => {
    const detail = psalms ? liturgicalPsalmNumber(number) : null
    return {
      number,
      label: String(number),
      ...(detail ? { detail } : {}),
      ...(psalms ? { spoken: passageSpokenLabel(book, number) } : {}),
      ...(title ? { title } : {}),
    }
  })
  const hasIntro =
    !!book.introduction?.length || !!BookService.introSlugFor(book)
  return hasIntro
    ? [{ number: 0, label: "", title: "Introdução" }, ...chapters]
    : chapters
}
