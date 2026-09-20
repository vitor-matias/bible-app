import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  type OnChanges,
  type OnDestroy,
  Output,
  ViewChild,
} from "@angular/core"
import { VerseComponent } from "../verse/verse.component"
import { toVerseCards } from "./verse-cards"

/**
 * How much of a stop has to be on screen before the chapter changes: the
 * reader is committed to it (the scroller snaps, so it cannot rest halfway)
 * without waiting on a "fully visible" that subpixel rounding can leave at
 * 0.999 for ever.
 */
const STOP_REACHED_RATIO = 0.9

/**
 * Without a scrollend event, scrolling counts as over once no scroll event has
 * come for this long. With one, the same timer is only a backstop against a
 * scrollend that never arrives, so it waits much longer.
 */
const SCROLL_IDLE_MS = 150
const SCROLL_END_BACKSTOP_MS = 1000

/**
 * BibleScroll, the experimental feed-style view of a chapter: one verse to a
 * full-screen card, flicked through one at a time, with nothing on the card
 * but the verse. It only lays the cards out — the reader hosting it owns the
 * chapter, the scrolling and the snapping, so deep links, chapter navigation
 * and the book/chapter pickers all keep working.
 *
 * The chapter can be fenced by two extra stops, one before the first verse and
 * one after the last, each naming the chapter that lies that way. Scrolling
 * onto one asks the reader for that chapter. The host should open a chapter
 * resting on a verse rather than at scroll offset 0, which from chapter 2 on
 * is the leading stop.
 */
@Component({
  selector: "verse-cards",
  templateUrl: "./verse-cards.component.html",
  styleUrl: "./verse-cards.component.css",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VerseComponent],
})
export class VerseCardsComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input({ required: true }) chapter!: Chapter
  /** Names the chapter before this one ("João 2"); without it there is no leading stop. */
  @Input() previousChapterLabel?: string
  /** Names the chapter after this one ("João 4"); without it there is no closing stop. */
  @Input() nextChapterLabel?: string
  /** Shown under the last verse, where the book ends ("Fim do Livro do Génesis"). */
  @Input() endOfBookLabel?: string

  /** The reader scrolled up past the first verse, onto the leading stop. */
  @Output() reachedStart = new EventEmitter<void>()
  /** The reader scrolled down past the last verse, onto the closing stop. */
  @Output() reachedEnd = new EventEmitter<void>()

  verses: Verse[] = []

  private startObserver?: IntersectionObserver
  private endObserver?: IntersectionObserver

  /** The host's scroller, found once the cards are in the page. */
  private scroller?: HTMLElement
  private isScrolling = false
  private scrollIdleTimer?: ReturnType<typeof setTimeout>
  /** Stops the reader has arrived on while the scroll was still moving. */
  private arrivals = new Set<EventEmitter<void>>()

  private readonly onScroll = (): void => {
    this.isScrolling = true
    clearTimeout(this.scrollIdleTimer)
    this.scrollIdleTimer = setTimeout(
      this.onScrollEnd,
      this.supportsScrollEnd() ? SCROLL_END_BACKSTOP_MS : SCROLL_IDLE_MS,
    )
  }

  private readonly onScrollEnd = (): void => {
    clearTimeout(this.scrollIdleTimer)
    this.isScrolling = false
    const arrivals = [...this.arrivals]
    this.arrivals.clear()
    for (const reached of arrivals) reached.emit()
  }

  constructor(private host: ElementRef<HTMLElement>) {}

  // Setters because the stops come and go with their labels: the first
  // chapter of a book has no leading stop, the last no closing one.
  @ViewChild("start")
  set start(stop: ElementRef<HTMLElement> | undefined) {
    this.startObserver?.disconnect()
    this.startObserver = this.watch(stop, this.reachedStart)
  }

  @ViewChild("end")
  set end(stop: ElementRef<HTMLElement> | undefined) {
    this.endObserver?.disconnect()
    this.endObserver = this.watch(stop, this.reachedEnd)
  }

  ngOnChanges(): void {
    this.verses = toVerseCards(this.chapter)
  }

  ngAfterViewInit(): void {
    if (typeof getComputedStyle === "undefined") return
    // The scroller belongs to the host; all this needs of it is to know when
    // it has stopped moving.
    let ancestor = this.host.nativeElement.parentElement
    while (ancestor && !this.scroller) {
      const overflow = getComputedStyle(ancestor).overflowY
      if (overflow === "auto" || overflow === "scroll") this.scroller = ancestor
      ancestor = ancestor.parentElement
    }
    this.scroller?.addEventListener("scroll", this.onScroll, { passive: true })
    this.scroller?.addEventListener("scrollend", this.onScrollEnd)
  }

  ngOnDestroy(): void {
    this.startObserver?.disconnect()
    this.endObserver?.disconnect()
    clearTimeout(this.scrollIdleTimer)
    this.scroller?.removeEventListener("scroll", this.onScroll)
    this.scroller?.removeEventListener("scrollend", this.onScrollEnd)
  }

  /** A method, not a constant, so a spec can play a browser without the event. */
  protected supportsScrollEnd(): boolean {
    return typeof window !== "undefined" && "onscrollend" in window
  }

  /**
   * A stop fires when the reader scrolls ONTO it, which takes two readings:
   * off screen, then on. Being on screen when the watching starts does not
   * count. A deep link leaves the view at scroll offset 0 — the leading stop —
   * for the moment before it jumps to its verse, and the observer's first
   * reading lands in exactly that moment; taken at face value it sent a
   * reader opening João 3,16 to João 2.
   *
   * The same rule fires a stop once per arrival: not again while the chapter
   * it asked for loads, and again only after the reader has left it and come
   * back, which is also how a failed load is retried.
   *
   * Judged by the ratio, not isIntersecting: engines disagree on whether that
   * flag is already true below the threshold, where it would fire on the
   * first sliver of the stop peeking in.
   *
   * And it fires only once the scroll has come to REST on the stop. A stop is
   * 90% on screen while the snap that brings it there is still gliding, and on
   * a phone that glide is an animation towards an absolute offset: swap the
   * chapter under it and it carries on to where the old chapter ended, which
   * in a shorter chapter is that chapter's own closing stop. Reaching the end
   * of Gn 1 went on to Gn 3.
   */
  private watch(
    stop: ElementRef<HTMLElement> | undefined,
    reached: EventEmitter<void>,
  ): IntersectionObserver | undefined {
    if (!stop || typeof IntersectionObserver === "undefined") return undefined
    let seenAway = false
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < STOP_REACHED_RATIO) {
            seenAway = true
            this.arrivals.delete(reached)
          } else if (seenAway) {
            seenAway = false
            if (this.isScrolling) {
              this.arrivals.add(reached)
            } else {
              reached.emit()
            }
          }
        }
      },
      { threshold: STOP_REACHED_RATIO },
    )
    observer.observe(stop.nativeElement)
    return observer
  }
}
