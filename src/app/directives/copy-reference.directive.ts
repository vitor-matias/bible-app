import { DOCUMENT } from "@angular/common"
import { Directive, HostListener, inject, input } from "@angular/core"
import { passageLabel } from "../utils/passage-label"

/** What a verse's element shows besides the verse's own text. */
const NOT_VERSE_TEXT =
  "[data-section-heading], verse-section, .verseNumber, .footnoteIndicator, .chapterNumber, .references"

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

  /**
   * Whether the selection takes some of the verse's own text, not just its
   * edge, nor only what the verse's element also holds: a heading after it
   * (Ez 34,10 ends with «O Senhor é o Bom Pastor»), its number, its notes
   * marker, the chapter number or the parallel references.
   */
  private selectedText(range: Range, verse: Element): boolean {
    if (!range.intersectsNode(verse)) return false
    // Text by text node: a selection inside a heading clones none of the
    // elements around it, so they could not be taken out of a copy.
    const walker = this.document.createTreeWalker(verse, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!range.intersectsNode(node)) continue
      if (node.parentElement?.closest(NOT_VERSE_TEXT)) continue
      const text = node.textContent ?? ""
      const from = node === range.startContainer ? range.startOffset : 0
      const to = node === range.endContainer ? range.endOffset : text.length
      if (
        text
          .slice(from, to)
          .replace(/\u200b/g, "")
          .trim()
      )
        return true
    }
    return false
  }
}
