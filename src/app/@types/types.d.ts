type Book = {
  id: string
  name: string
  shortName: string
  abrv: string
  chapterCount: number
  introduction?: IntroElement[]
  chapters?: Chapter[]
  /** Set on the synthetic books that stand in for a standalone introduction. */
  introSlug?: string
  /**
   * Set on a real book whose introduction is written for a cluster of books
   * (Samuel, Reis, …) and therefore lives in a standalone introduction.
   */
  sharedIntroSlug?: string
}

/** A standalone introduction (whole Bible, a testament, a group of books). */
type GroupIntro = {
  slug: string
  name: string
  introduction: IntroElement[]
}

/** Entry in the /v1/intros listing: no body, just enough to link to it. */
type IntroSummary = Pick<GroupIntro, "slug" | "name">

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
  /** The printed number when it differs from `number` (an addition's "B1"). */
  numberLabel?: string
  /** On verse 0 of a chapter opening with a supplement ("A"): printed in place of the chapter number. */
  chapterLabel?: string
  /** On the last verse of that supplement: the chapter number is printed at its closing heading. */
  chapterNumberStarts?: boolean
  /** On the verse a mid-chapter supplement ("C") opens at: its letter is printed at the closing heading, or the first line without one. */
  supplementLetter?: string
  /** On the verses of a supplement, which the printed edition sets in italics. */
  supplement?: boolean
  text: TextType[]
  highlightedSegments?: HighlightSegment[]
}

type TextType = _Text | Section | Paragraph | Quote | References | _Footnote

type Section = {
  type: "section"
  tag: string
  text: string
  /** A heading inside a Greek supplement: black, bold and italic in the printed edition. */
  supplement?: boolean
}

type _Text = {
  type: "text"
  text: string
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
