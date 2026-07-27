type Book = {
  id: string
  name: string
  shortName: string
  abrv: string
  chapterCount: number
  introduction?: IntroElement[]
  chapters?: Chapter[]
}

type IntroElement =
  | IntroTitle
  | IntroParagraph
  | IntroSection
  | IntroOutline
  | IntroTable
  | IntroListItem
  | IntroSidebar
  | IntroMajorSection

type IntroTitle = {
  type: "introTitle"
  level: number
  text: string
}

type IntroParagraph = {
  type: "introParagraph"
  text: string
}

type IntroSection = {
  type: "introSection"
  level: number
  text: string
}

type IntroOutline = {
  type: "introOutline"
  level: number
  text: string
}

type IntroTable = {
  type: "introTable"
  rows: string[][]
}

type IntroListItem = {
  type: "introListItem"
  text: string
}

type IntroSidebar = {
  type: "introSidebar"
  content: IntroElement[]
}

type IntroMajorSection = {
  type: "introMajorSection"
  text: string
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
  normalizedText: string
}

type _Text = {
  type: "text"
  text: string
  normalizedText: string
  allCaps?: boolean
}

type _Footnote = {
  type: "footnote"
  text: string
  reference: string
}

type Paragraph = {
  type: "paragraph"
  text: string
  normalizedText: string
}

type Quote = {
  type: "quote"
  text: string
  normalizedText: string
  identLevel: number
}

type References = {
  type: "references"
  text: string
  normalizedText: string
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
