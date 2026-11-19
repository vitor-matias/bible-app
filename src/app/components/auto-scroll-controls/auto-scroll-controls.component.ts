import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  linkedSignal,
  NgZone,
  OnDestroy,
  OnInit,
  output,
  signal,
  untracked,
} from "@angular/core"
import { rxResource, takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatSliderModule } from "@angular/material/slider"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import {
  type ChapterEpisode,
  FOLLOW_PAUSE_MS,
  PodcastPlayerService,
  SCROLL_KEYS,
} from "../../services/podcast-player.service"
import { PreferencesService } from "../../services/preferences.service"

/**
 * How close to the slowest or fastest speed counts as there. The service
 * keeps four decimals, so the slowest, 1/6, is stored as 0.1667: a little
 * above it, which left − enabled there. The nearest steps are 0.03 apart.
 */
const SPEED_LIMIT_TOLERANCE = 0.001

/**
 * Read-along keeps the verse being read inside the middle READING_AREA of
 * the screen (what isn't under the card); once it isn't, the text eases up,
 * closing this share of the distance per second, until the verse's top
 * touches the area's upper edge.
 */
const READING_AREA = 0.75
/** Where a desktop reader dragged the card, and the width they gave it. */
const POSITION_KEY = "audioCardPosition"
const WIDTH_KEY = "audioCardWidth"
/**
 * How the text eases up: slowly. It gathers speed gently (GLIDE_ACCEL
 * px/s²), never passes GLIDE_MAX_SPEED px/s, and slows as it nears the
 * edge (its speed the distance left over GLIDE_SECONDS, down to
 * GLIDE_MIN_SPEED): a short, gentle landing.
 */
const GLIDE_SECONDS = 1
const GLIDE_MAX_SPEED = 45
const GLIDE_ACCEL = 45
/** The slowest it goes on the way in, so the last pixels don't creep. */
const GLIDE_MIN_SPEED = 8

/** 63 → "1:03", 3723 → "62:03"; never below "0:00", as lengths not yet known read 0. */
const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

@Component({
  selector: "app-auto-scroll-controls",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatSliderModule],
  templateUrl: "./auto-scroll-controls.component.html",
  styleUrls: ["./auto-scroll-controls.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoScrollControlsComponent implements OnInit, OnDestroy {
  private autoScrollService = inject(AutoScrollService)
  private preferencesService = inject(PreferencesService)
  private cdr = inject(ChangeDetectorRef)
  private analyticsService = inject(AnalyticsService)

  readonly scrollElement = input<HTMLElement>()
  readonly lineHeightElement = input<HTMLElement>()
  /** The chapter shown, whose +365 episode the control can play instead. */
  readonly bookId = input<string>()
  readonly chapter = input<number>()
  /** Its book's short name, "Génesis", for the «Ouvir» card's caption. */
  readonly bookName = input("")
  /** The paged view: nothing to scroll, so the control only plays +365. */
  readonly paged = input(false)

  protected readonly player = inject(PodcastPlayerService)

  private readonly nativeChrome = inject(NativeChromeService)
  private readonly destroyRef = inject(DestroyRef)
  private readonly ngZone = inject(NgZone)
  /** The native apps show these controls in their own toolbar instead. */
  readonly native = this.nativeChrome.enabled

  /** The page is scrolled to its end: there's nothing left to play. */
  atEnd = false

  private readonly episodes = rxResource({
    // The apps' native bar has no +365 mode yet: nothing would show it.
    params: () => {
      const bookId = this.bookId()
      const chapter = this.chapter()
      return bookId && chapter && !this.native ? { bookId, chapter } : undefined
    },
    stream: ({ params }) =>
      this.player.episodesFor(params.bookId, params.chapter),
  })

  /** What «Ouvir» controls: the earliest +365 episode that reads the chapter. */
  protected readonly entry = computed(() => this.episodes.value()?.[0])

  /**
   * The episode the last finished lookup found, kept through the next one:
   * the card only waits for a chapter's lookup where it was already showing,
   * so a chapter without an episode doesn't flash it (and re-lay the pages
   * out twice, as the reader makes room for it).
   */
  private readonly lastSettledEntry = linkedSignal<
    { loading: boolean; entry: ChapterEpisode | undefined },
    ChapterEpisode | undefined
  >({
    source: () => ({
      loading: this.episodes.isLoading(),
      entry: this.entry(),
    }),
    computation: (now, before) => (now.loading ? before?.value : now.entry),
  })

  /**
   * Playing +365 rather than scrolling: with an episode to play, or while
   * the next chapter's is still being looked up (the card waits, disabled,
   * rather than flashing the scroll buttons for the round trip).
   */
  protected readonly audioMode = computed(() => {
    // Read first, always: a linkedSignal only keeps what it was last read as.
    const settled = this.lastSettledEntry()
    return (
      (this.player.mode() === "audio" || this.paged()) &&
      (!!this.entry() || (this.episodes.isLoading() && !!settled))
    )
  })

  protected readonly playingThis = computed(() => {
    const entry = this.entry()
    return !!entry && this.player.isCurrent(entry) && this.player.playing()
  })

  /** The entry is in the player, playing or paused. */
  protected readonly loaded = computed(() => {
    const entry = this.entry()
    return !!entry && this.player.isCurrent(entry)
  })

  /** The slider spans the chapter's reading, not the whole episode. */
  protected readonly chapterStart = computed(() => this.entry()?.start ?? 0)
  protected readonly chapterEnd = computed(
    () => this.entry()?.end ?? this.player.duration(),
  )

  constructor() {
    // While it plays, the text follows the reading: eased up when scrolling,
    // turned page by page when paged.
    effect(() => {
      const glide = !this.native && this.playingThis() && !!this.entry()?.verses
      untracked(() => (glide ? this.startGlide() : this.stopGlide()))
    })
    effect(() => {
      const verse = this.verseNow()
      untracked(() => this.readingVerse.emit(verse))
    })
    // Listening in pages carries on as «Ouvir» back in the scrolling view,
    // where the episode would otherwise lose its controls.
    effect(() => {
      if (this.paged()) untracked(() => this.player.mode.set("audio"))
    })
    // Turning to another chapter stops the episode: its reading is over.
    let shown: string | undefined
    effect(() => {
      const chapter = `${this.bookId()}/${this.chapter()}`
      untracked(() => {
        if (shown !== undefined && shown !== chapter) this.player.pause()
        shown = chapter
      })
    })
    // «Ouvir» can return without toggleMode(): a chapter with an episode comes
    // back (Back, «Voltar para…») after scrolling started where none was.
    effect(() => {
      if (!this.audioMode()) return
      untracked(() => {
        if (this.autoScrollEnabled) this.stopAutoScroll()
      })
    })
  }

  /** The slider can move this chapter's episode once its span is known. */
  protected readonly seekable = computed(
    () => this.loaded() && this.chapterEnd() > this.chapterStart(),
  )

  /** Held while the thumb is dragged, so playback doesn't pull it back. */
  protected readonly dragging = signal(false)
  private heldAt = 0

  // Pinned to the chapter's span while playback runs on before or past it;
  // at its start while the player holds another chapter's episode.
  protected readonly sliderValue = computed(() => {
    if (this.dragging()) return this.heldAt
    if (!this.loaded()) return this.chapterStart()
    return Math.min(
      this.chapterEnd(),
      Math.max(this.chapterStart(), this.player.position()),
    )
  })

  protected holdSlider(): void {
    this.heldAt = this.player.position()
    this.dragging.set(true)
  }

  /** Under the slider: time into the chapter's reading, and time left of it. */
  protected readonly elapsed = computed(() =>
    clock(this.sliderValue() - this.chapterStart()),
  )
  protected readonly remaining = computed(() =>
    clock(this.seekable() ? this.chapterEnd() - this.sliderValue() : 0),
  )

  /** For screen readers, into the chapter's reading: "1:03 de 3:44". */
  protected readonly spokenPosition = (seconds: number): string =>
    `${clock(seconds - this.chapterStart())} de ${clock(this.chapterEnd() - this.chapterStart())}`

  /**
   * The verse being read: the last whose start the episode has passed. Only
   * while this chapter's own entry is in the player, as one episode reads
   * several chapters and the player keeps it across a chapter turn.
   */
  protected readonly verseNow = computed(() => {
    const verses = this.entry()?.verses
    if (!verses || !this.loaded()) return null
    const at = this.player.position()
    let verse: number | null = null
    for (const [number, start] of verses) {
      if (start > at + 0.05) break
      verse = number
    }
    return verse
  })

  private readonly host = inject(ElementRef<HTMLElement>)
  private glideFrame?: number
  private glideAt?: number
  /** What the last frames asked of scrollTop and the browser rounded away. */
  private glideCarry = 0
  /** The glide's speed now, px/s, gathered and shed gently. */
  private glideSpeed = 0
  private readerMovedAt = 0

  private startGlide(): void {
    if (this.glideFrame !== undefined) return
    this.glideAt = undefined
    this.glideCarry = 0
    this.glideSpeed = 0
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
    const frame = (now: number) => {
      this.glideFrame = requestAnimationFrame(frame)
      const seconds =
        this.glideAt === undefined
          ? 0
          : Math.min(0.1, (now - this.glideAt) / 1000)
      this.glideAt = now
      this.glide(seconds, reduced)
    }
    this.glideFrame = requestAnimationFrame(frame)
  }

  private stopGlide(): void {
    if (this.glideFrame !== undefined) cancelAnimationFrame(this.glideFrame)
    this.glideFrame = undefined
    this.settling = false
  }

  /**
   * The verse being read, where it is on screen, and how far through it the
   * reading is (as far through its box as the audio is through its time).
   */
  private reading():
    | { verse: Element; box: DOMRect; point: number; through: number }
    | undefined {
    const entry = this.entry()
    const verses = entry?.verses
    const page = this.scrollElement()
    if (!entry || !verses || !page) return undefined
    const now = this.player.now()
    let current = -1
    while (current + 1 < verses.length && verses[current + 1][1] <= now) {
      current++
    }
    if (current < 0) return undefined
    const [number, start] = verses[current]
    const next = verses[current + 1]?.[1] ?? entry.end ?? start
    const through =
      next > start ? Math.min(1, (now - start) / (next - start)) : 1
    const verse = page.querySelector(`[id="${number}"]`)
    if (!verse) return undefined
    const box = verse.getBoundingClientRect()
    return { verse, box, point: box.top + through * box.height, through }
  }

  /** Easing the text up toward the reading area's upper edge. */
  private settling = false

  /**
   * One frame of read-along. A verse wholly inside the reading area: the
   * text stays still. Once it isn't, the text eases up until the verse's
   * top touches the area's upper edge, and rests again. A verse taller than
   * the area goes by the line being read instead. With reduced motion the
   * text jumps there. Left alone for FOLLOW_PAUSE_MS after the reader moves
   * the text themselves.
   */
  private glide(seconds: number, reduced: boolean): void {
    if (Date.now() - this.readerMovedAt < FOLLOW_PAUSE_MS) {
      this.settling = false
      return
    }
    if (this.paged()) {
      this.turnPages()
      return
    }
    const page = this.scrollElement()
    const reading = this.reading()
    if (!page || !reading) return
    const view = page.getBoundingClientRect()
    const card = this.host.nativeElement
      .querySelector(".audio-player")
      ?.getBoundingClientRect()
    const text = this.lineHeightElement()?.getBoundingClientRect()
    const covers =
      card && text && card.left < text.right && card.right > text.left
    // The card covers the text's bottom, or, dragged up on a desktop, its top.
    const cardBelow = card && card.top + card.bottom > view.top + view.bottom
    const top =
      covers && !cardBelow ? Math.max(view.top, card.bottom) : view.top
    const bottom =
      covers && cardBelow ? Math.min(view.bottom, card.top) : view.bottom
    const margin = ((bottom - top) * (1 - READING_AREA)) / 2
    const area = { top: top + margin, bottom: bottom - margin }
    const { box, point } = reading
    const fits = box.height <= area.bottom - area.top
    // What goes to the upper edge: the verse's top, or the line being read.
    const lead = fits ? box.top : point
    if (!this.settling) {
      const inside = fits
        ? box.top >= area.top && box.bottom <= area.bottom
        : point >= area.top && point <= area.bottom
      if (inside) return
      this.settling = true
    }
    const offset = lead - area.top
    if (Math.abs(offset) < 1 || reduced) {
      if (reduced) page.scrollTop += offset
      this.settling = false
      this.glideCarry = 0
      this.glideSpeed = 0
      return
    }
    const aim =
      Math.sign(offset) *
      Math.min(
        Math.max(Math.abs(offset) / GLIDE_SECONDS, GLIDE_MIN_SPEED),
        GLIDE_MAX_SPEED,
      )
    const change = GLIDE_ACCEL * seconds
    this.glideSpeed += Math.min(
      change,
      Math.max(-change, aim - this.glideSpeed),
    )
    // Never past the edge.
    const step =
      Math.abs(this.glideSpeed * seconds) > Math.abs(offset)
        ? offset
        : this.glideSpeed * seconds
    const wanted = page.scrollTop + step + this.glideCarry
    page.scrollTop = wanted
    // Kept for the next frame, as scrollTop takes whole device pixels.
    this.glideCarry = wanted - page.scrollTop
  }

  /** A desktop: a wide window and a mouse or trackpad, to drag and resize with. */
  protected readonly desktop = signal(false)
  /** Where the card was dragged to (its container's corner); null: docked. */
  private readonly position = signal<{ left: number; top: number } | null>(
    this.stored(POSITION_KEY),
  )
  protected readonly cardWidth = signal<number | null>(this.stored(WIDTH_KEY))
  /** Where the card sits now: dragged, on a desktop, in «Ouvir». */
  protected readonly placed = computed(() =>
    this.desktop() && this.audioMode() ? this.position() : null,
  )

  private stored<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key)
      return value ? (JSON.parse(value) as T) : null
    } catch {
      return null
    }
  }

  private store(key: string, value: unknown): void {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Not kept: the card goes back to its corner next time.
    }
  }

  /** Drags the card by anything but its controls, within the window. */
  protected startDrag(event: PointerEvent): void {
    const card = event.currentTarget as HTMLElement
    const target = event.target as Element
    const box = card.getBoundingClientRect()
    // The browser's own resize corner, bottom right, isn't a drag.
    const corner =
      event.clientX > box.right - 18 && event.clientY > box.bottom - 18
    if (
      !this.desktop() ||
      event.button !== 0 ||
      corner ||
      target.closest("button, input, mat-slider")
    ) {
      return
    }
    event.preventDefault()
    const container = card.parentElement as HTMLElement
    const start = container.getBoundingClientRect()
    const grab = { x: event.clientX - start.left, y: event.clientY - start.top }
    const move = (moved: PointerEvent) =>
      this.position.set(
        this.withinWindow(
          moved.clientX - grab.x,
          moved.clientY - grab.y,
          start.width,
          start.height,
        ),
      )
    const drop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", drop)
      this.store(POSITION_KEY, this.position())
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", drop)
  }

  private withinWindow(
    left: number,
    top: number,
    width: number,
    height: number,
  ) {
    return {
      left: Math.round(
        Math.min(Math.max(8, left), window.innerWidth - width - 8),
      ),
      top: Math.round(
        Math.min(Math.max(8, top), window.innerHeight - height - 8),
      ),
    }
  }

  /** Back to its corner, at its usual width. */
  protected dock(): void {
    this.position.set(null)
    this.cardWidth.set(null)
    this.store(POSITION_KEY, null)
    this.store(WIDTH_KEY, null)
  }

  /** Follows the window being resized, and the card being resized. */
  private watchDesktop(): void {
    const query = window.matchMedia?.("(min-width: 769px) and (pointer: fine)")
    if (!query) return
    const update = () => this.desktop.set(query.matches)
    update()
    query.addEventListener("change", update)
    // A dragged card stays inside a window made smaller.
    const keepInside = () => {
      const at = this.position()
      const card = this.host.nativeElement.querySelector(".audio-player")
      if (!at || !card) return
      const box = card.getBoundingClientRect()
      this.position.set(
        this.withinWindow(at.left, at.top, box.width, box.height),
      )
    }
    window.addEventListener("resize", keepInside)
    // The width the reader gives it from the resize corner, remembered.
    const resized =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(([entry]) => {
            const card = entry.target as HTMLElement
            const width = Math.round(card.getBoundingClientRect().width)
            if (
              !this.desktop() ||
              !card.style.width ||
              width === this.cardWidth()
            ) {
              return
            }
            this.cardWidth.set(width)
            this.store(WIDTH_KEY, width)
          })
    const watched = new MutationObserver(() => {
      const card = this.host.nativeElement.querySelector(".audio-player")
      resized?.disconnect()
      if (card) resized?.observe(card)
    })
    watched.observe(this.host.nativeElement, { childList: true, subtree: true })
    this.destroyRef.onDestroy(() => {
      query.removeEventListener("change", update)
      window.removeEventListener("resize", keepInside)
      resized?.disconnect()
      watched.disconnect()
    })
  }

  /** Asks the reader for a page: the next one, or the one a verse starts on. */
  readonly pageTurn = output<"next" | HTMLElement>()
  private turnedAt = 0

  /**
   * Read-along in pages. A verse running on to the next page: turned once
   * the reading is past the share of it on this page (a verse 40% here turns
   * 40% of the way through its reading). A verse starting on a later page:
   * turned to at once.
   */
  private turnPages(): void {
    // A turn still sliding moves every column: measure once it's done.
    if (Date.now() - this.turnedAt < 1200) return
    const reading = this.reading()
    if (!reading) return
    // The page is what its container shows: from 768px it is narrower than
    // the window, and the next page's first column starts inside it.
    const shown = (
      reading.verse.closest(".paged-view-container") ?? document.documentElement
    ).getBoundingClientRect()
    let before = 0
    let here = 0
    let after = 0
    for (const part of Array.from(reading.verse.getClientRects())) {
      if (part.width <= 0 || part.height <= 0) continue
      if (part.right <= shown.left) before += part.height
      else if (part.left >= shown.right) after += part.height
      else here += part.height
    }
    if (after === 0) return
    if (here === 0) {
      if (before === 0) this.turn(reading.verse as HTMLElement)
      return
    }
    if (reading.through >= (before + here) / (before + here + after)) {
      this.turn("next")
    }
  }

  private turn(target: "next" | HTMLElement): void {
    this.turnedAt = Date.now()
    this.pageTurn.emit(target)
  }

  /** The reader moving the text: read-along stands back for a while. */
  private noteReaderMoved = () => {
    this.readerMovedAt = Date.now()
  }

  private noteReaderKey = (event: KeyboardEvent) => {
    // Keys on the card's own controls (Space on play, arrows on the slider),
    // in a field or over a dialog don't move the text.
    const target = event.target as HTMLElement | null
    if (
      !SCROLL_KEYS.has(event.key) ||
      this.host.nativeElement.contains(target) ||
      target?.isContentEditable ||
      target?.closest("input, textarea, select, .cdk-overlay-container")
    ) {
      return
    }
    this.noteReaderMoved()
  }

  /** A press on the scroller itself is its scrollbar: the reader scrolling. */
  private noteScrollbar = (event: PointerEvent) => {
    if (event.target === event.currentTarget) this.noteReaderMoved()
  }

  /** The ‹ › arrows turn pages and chapters: the reader's own move too. */
  private noteArrowTap = (event: PointerEvent) => {
    const target = event.target as Element | null
    if (target?.closest(".floating-nav-button")) this.noteReaderMoved()
  }

  /** Tells the reader which verse to mark and keep in view. */
  readonly readingVerse = output<number | null>()

  /** The +365 speed in words, for screen readers: "1 vez", "1,25 vezes". */
  protected readonly rateSpoken = computed(() => {
    const rate = this.player.rate()
    return `${String(rate).replace(".", ",")} ${rate === 1 ? "vez" : "vezes"}`
  })

  /** Swaps scrolling and listening, stopping whichever was running. */
  toggleMode(): void {
    if (this.audioMode()) {
      this.player.pause()
      this.player.mode.set("scroll")
    } else {
      if (this.autoScrollEnabled) this.stopAutoScroll()
      this.player.mode.set("audio")
    }
  }

  toggleAudio(): void {
    const entry = this.entry()
    if (entry) this.player.toggle(entry)
  }

  ngOnInit(): void {
    this.followEnd()
    this.watchReader()
    if (typeof window !== "undefined" && !this.native) this.watchDesktop()
    if (!this.native) return
    this.nativeChrome.actions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ id }) => {
        if (id === "auto-scroll-toggle") this.toggleAutoScroll()
        if (id === "auto-scroll-slower") this.decreaseAutoScrollSpeed()
        if (id === "auto-scroll-faster") this.increaseAutoScrollSpeed()
      })
    this.syncNativeChrome()
  }

  ngOnDestroy(): void {
    // Hidden from the menu, the controls take what they started with them.
    this.stopGlide()
    this.player.pause()
    this.stopAutoScroll()
    if (this.native) this.nativeChrome.setAutoScroll(null)
  }

  toggleAutoScroll(): void {
    if (!this.autoScrollEnabled) {
      if (this.scrolledToEnd()) return
      this.startAutoScroll()
    } else {
      this.stopAutoScroll()
    }
  }

  increaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(this.autoScrollService.AUTO_SCROLL_STEP)
  }

  decreaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(-this.autoScrollService.AUTO_SCROLL_STEP)
  }

  private updateAutoScrollSpeed(delta: number): void {
    const nextSpeed = this.autoScrollService.updateAutoScrollSpeed(delta)
    this.preferencesService.setAutoScrollSpeed(nextSpeed)

    void this.analyticsService.track("autoscroll_speed", {
      speed: nextSpeed,
    })

    this.cdr.markForCheck()
    this.syncNativeChrome()
  }

  private startAutoScroll(): void {
    const scrollElement = this.scrollElement()
    const lineHeightElement = this.lineHeightElement()
    if (!scrollElement || !lineHeightElement) return

    this.autoScrollService.start({
      scrollElement,
      lineHeightElement,
      onStop: () => {
        this.safeMarkForCheck()
      },
    })

    void this.analyticsService.track("autoscroll_status", {
      enabled: true,
    })

    this.safeMarkForCheck()
  }

  private stopAutoScroll(): void {
    this.autoScrollService.stop()

    void this.analyticsService.track("autoscroll_status", {
      enabled: false,
    })

    this.safeMarkForCheck()
  }

  /**
   * Keeps atEnd current as the page scrolls, or reflows: its text changing
   * size, or the page itself (a window resized).
   */
  private followEnd(): void {
    const element = this.scrollElement()
    if (!element) return
    const update = () => {
      const atEnd = this.scrolledToEnd()
      if (atEnd === this.atEnd) return
      this.ngZone.run(() => {
        this.atEnd = atEnd
        this.safeMarkForCheck()
      })
    }
    this.atEnd = this.scrolledToEnd()
    // Scrolling needs no change detection, only a change of atEnd does.
    const resize =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(update)
    this.ngZone.runOutsideAngular(() => {
      element.addEventListener("scroll", update, { passive: true })
      resize?.observe(element)
      const lineHeightElement = this.lineHeightElement()
      if (lineHeightElement) resize?.observe(lineHeightElement)
    })
    this.destroyRef.onDestroy(() => {
      element.removeEventListener("scroll", update)
      resize?.disconnect()
    })
  }

  /** Notes the reader's own wheel, drag and scroll keys, for read-along. */
  private watchReader(): void {
    const element = this.scrollElement()
    if (!element || this.native) return
    this.ngZone.runOutsideAngular(() => {
      element.addEventListener("wheel", this.noteReaderMoved, { passive: true })
      element.addEventListener("touchmove", this.noteReaderMoved, {
        passive: true,
      })
      window.addEventListener("keydown", this.noteReaderKey)
      document.addEventListener("pointerdown", this.noteArrowTap)
      element.addEventListener("pointerdown", this.noteScrollbar)
    })
    this.destroyRef.onDestroy(() => {
      element.removeEventListener("pointerdown", this.noteScrollbar)
      element.removeEventListener("wheel", this.noteReaderMoved)
      element.removeEventListener("touchmove", this.noteReaderMoved)
      window.removeEventListener("keydown", this.noteReaderKey)
      document.removeEventListener("pointerdown", this.noteArrowTap)
    })
  }

  /** Down as far as it goes, to the pixel (WebKit keeps whole pixels). */
  private scrolledToEnd(): boolean {
    const element = this.scrollElement()
    if (!element) return false
    return element.scrollTop + element.clientHeight >= element.scrollHeight - 1
  }

  private safeMarkForCheck(): void {
    try {
      this.cdr.markForCheck()
    } catch {
      // Safely ignore errors if change detection cannot be triggered (e.g., component destroyed)
    }
    this.syncNativeChrome()
  }

  /** Sends what these controls show to the native toolbar. */
  private syncNativeChrome(): void {
    if (!this.native || this.destroyRef.destroyed) return
    this.nativeChrome.setAutoScroll({
      playing: this.autoScrollEnabled,
      speedLabel: this.autoScrollSpeedLabel,
      speedAccessibilityLabel:
        this.autoScrollService.getAutoScrollSpeedSpokenLabel(
          this.autoScrollLinesPerSecond,
        ),
      canSlower: this.canSlower,
      canFaster: this.canFaster,
      canPlay: !this.atEnd,
    })
  }

  get autoScrollEnabled(): boolean {
    return this.autoScrollService.autoScrollEnabled
  }

  get autoScrollLinesPerSecond(): number {
    return this.autoScrollService.autoScrollLinesPerSecond
  }

  /** In words, for screen readers: "1,5 linhas por segundo". */
  get autoScrollSpeedSpoken(): string {
    return this.autoScrollService.getAutoScrollSpeedSpokenLabel(
      this.autoScrollLinesPerSecond,
    )
  }

  get autoScrollSpeedLabel(): string {
    return this.autoScrollService.getAutoScrollSpeedLabel(
      this.autoScrollLinesPerSecond,
    )
  }

  /** Whether − can go slower; at the slowest it is disabled. */
  get canSlower(): boolean {
    return (
      this.autoScrollLinesPerSecond - this.MIN_AUTO_SCROLL_LPS >
      SPEED_LIMIT_TOLERANCE
    )
  }

  /** Whether + can go faster; at the fastest it is disabled. */
  get canFaster(): boolean {
    return (
      this.MAX_AUTO_SCROLL_LPS - this.autoScrollLinesPerSecond >
      SPEED_LIMIT_TOLERANCE
    )
  }

  get MIN_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MIN_AUTO_SCROLL_LPS
  }

  get MAX_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MAX_AUTO_SCROLL_LPS
  }
}
