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
  highlightedSegments?: HighlightSegment[]
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

type Bookmark = {
  bookId: Book["id"]
  chapter: Chapter["number"]
  color: string
  timestamp: number
}

type HighlightSegment = { text: string; highlight: boolean }
