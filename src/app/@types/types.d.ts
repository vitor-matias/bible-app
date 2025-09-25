declare module "usfm-js" {
  export function toJSON(input: string): USFMBook
}

type USFMBook = {
  code: string
  headers: USFMHeader[]
  chapters: {
    [chapterNumber: string]: USFMChapter
  }
}

type USFMHeader = {
  tag: string
  content?: string
}

type USFMChapter = {
  [verseNumber: string]: USFMVerse
  front: USFMVerse
}

type USFMVerse = {
  verseObjects: USFMVerseObject[]
}

type Footnote = {
  tag: "f"
  type: "footnote"
  content: string
  endTag: string
}

type Text = {
  type: "text"
  text: string
}

type USFMVerseObject = {
  tag?: string
  type: string
  content?: string
  endTag?: string
  text?: string
  nextChar?: string
}

type Book = {
  id: string
  name: string
  shortName: string
  abrv: string
  chapterCount: number
  chapters?: Chapter[]
}

type Chapter = {
  bookId: Book["id"]
  number: number
  introduction?: string
  verses?: Verse[]
  title?: string
}
type Verse = {
  bookId: Book["id"]
  chapterNumber: Chapter["number"]
  number: number
  verseLabel: string
  text: TextType[]
}

type TextType = _Text | Section | Paragraph | Quote | References | _Footnote

type Section = {
  type: "section"
  tag: string
  text: string
}

type _Text = {
  type: "text"
  text: string
  allCaps?: boolean
}

type Paragraph = {
  type: "paragraph"
  text: string
}

type Quote = {
  type: "quote"
  text: string
  identLevel: number
}

type References = {
  type: "references"
  text: string
}

type _Footnote = {
  type: "footnote"
  text: string
  reference: string
}

type VersePage = {
  verses: Verse[]
  total: number
  currentPage: number
  totalPages: number
}
