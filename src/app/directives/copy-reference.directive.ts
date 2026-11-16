import { DOCUMENT } from "@angular/common"
import { Directive, HostListener, inject, input } from "@angular/core"
import { passageLabel } from "../utils/passage-label"

/**
 * Verses copied from the block carry their reference after them:
 * «Bem-aventurados os pobres… — Mateus 5,3-4». Only the verses
 * whose text is in the selection count (the reader gives each its number as
 * id); a selection with none (a heading, the introduction) copies as is.
 */
@Directive({
  selector: "[appCopyReference]",
})
export class CopyReferenceDirective {
  /** The book and chapter shown. */
  readonly appCopyReference = input.required<{ book: Book; chapter: number }>()
  private readonly document = inject(DOCUMENT)

  @HostListener("copy", ["$event"])
  onCopy(event: ClipboardEvent): void {
    const passage = this.appCopyReference()
    const selection = this.document.getSelection()
    if (!selection?.rangeCount || !event.clipboardData) return
    // Without the edition's zero-width spaces, as verseLines leaves them out.
    const text = selection
      .toString()
      .replace(/\u200b/g, "")
      .trim()
    const range = selection.getRangeAt(0)
    const block = event.currentTarget as HTMLElement
    const verses = Array.from(block.querySelectorAll("verse[id]"))
      .filter((verse) => this.selectedText(range, verse))
      .map((verse) => Number(verse.id))
      .filter((number) => number > 0)
    if (!text || !verses.length) return
    const first = Math.min(...verses)
    const last = Math.max(...verses)
    const reference = passageLabel(
      passage.book,
      passage.chapter,
      first === last ? first : `${first}-${last}`,
    )
    event.clipboardData.setData("text/plain", `${text} — ${reference}`)
    event.preventDefault()
  }

  /** Whether the selection takes some of the verse's text, not just its edge. */
  private selectedText(range: Range, verse: Element): boolean {
    if (!range.intersectsNode(verse)) return false
    const part = this.document.createRange()
    part.selectNodeContents(verse)
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0)
      part.setStart(range.startContainer, range.startOffset)
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0)
      part.setEnd(range.endContainer, range.endOffset)
    return part.toString().trim() !== ""
  }
}
