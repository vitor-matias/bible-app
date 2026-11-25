import { CommonModule } from "@angular/common"
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  Injector,
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
import { Mais365Service, readingLabel } from "../../services/mais365.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import type {
  NativeChromeAction,
  PodcastChrome,
} from "../../services/native-chrome.types"
import {
  type ChapterEpisode,
  FOLLOW_PAUSE_MS,
  PodcastPlayerService,
  partsTime,
  rateTitle,
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
/**
 * A part heard straight on starts this long before its first verse: the
 * verse's time marks a moment into its first word (Pv 3:25's «Não» lost
 * its start at 0.3 s).
 */
const PART_LEAD = 0.8
/** How much sooner than the API's titleEnd the chapter's name is cut. */
const TITLE_CUT = 0.15
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
/** How long the text rests after landing before another ease may start. */
const GLIDE_REST_MS = 3000

/** 63 → "1:03", 3723 → "62:03"; never below "0:00", as lengths not yet known read 0. */
const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/**
 * How far ahead of a verse's timed start its mark moves on, seconds: the
 * position comes in timeupdates a quarter second apart, and the mark fades
 * in, so on the dot it showed about 0.4 s late (owner's test, Nov 2026).
 */
const VERSE_LEAD = 0.35

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
  protected readonly plan = inject(Mais365Service)

  /** "Saltar para Génesis 2", while a day of the plan plays. */
  protected readonly skipLabel = computed(() => {
    const next = this.plan.next()
    if (!next) return null
    return next === "reflection"
      ? "Saltar para a reflexão"
      : `Saltar para ${readingLabel(next)}`
  })

  /**
   * The chapter heard outside a day of the plan, placed in its episode's
   * day: what the apps' ⏮ ⏭ step to (the episode's readings).
   */
  private readonly inEpisode = computed(() => {
    const entry = this.entry()
    const bookId = this.bookId()
    const chapter = this.chapter()
    if (this.inPlan() || !entry || !bookId || !chapter) return null
    return this.plan.episodeReadings(entry.day, bookId, chapter)
  })

  /** The apps' ⏮ ⏭ labels: the plan day's, else the episode's. */
  private readonly episodeLabels = computed(() => {
    if (this.inPlan()) {
      return { previous: this.backLabel(), next: this.skipLabel() }
    }
    const before = this.neighbour(-1)?.reading
    const after = this.neighbour(1)?.reading
    return {
      previous: before ? `Voltar a ${readingLabel(before)}` : null,
      next: after ? `Saltar para ${readingLabel(after)}` : null,
    }
  })

  /** ⏮ ⏭ outside a plan day: its episode's day, started at that reading. */
  private stepInEpisode(by: -1 | 1): void {
    const at = this.inEpisode()
    const to = this.neighbour(by)
    if (at && to) void this.plan.start(at.day, to.index)
  }

  /** The nearest reading before or after with timings: untimed ones can't be sought. */
  private neighbour(by: -1 | 1) {
    const at = this.inEpisode()
    if (!at) return null
    const { readings } = at.day
    for (let i = at.index + by; i >= 0 && i < readings.length; i += by) {
      if (readings[i].episode.start != null)
        return { reading: readings[i], index: i }
    }
    return null
  }

  /** A day of the plan playing, its readings or reflection: ⏮ ⏭ in the transport. */
  protected readonly inPlan = computed(() => this.plan.stage() !== null)

  /** "Voltar a Génesis 1"; null on the day's first reading. */
  protected readonly backLabel = computed(() => {
    const previous = this.plan.previous()
    return previous ? `Voltar a ${readingLabel(previous)}` : null
  })

  /** "+365 · Dia 1 · Génesis 1" while a day of the plan plays here. */
  protected readonly caption = computed(() => {
    const chapter = `${this.bookName()} ${this.chapter()}`
    const day = this.plan.active()
    if (day && this.reflection()) {
      return day.readings.length
        ? `+365 · Dia ${day.day} · Reflexão`
        : `+365 · ${day.title}`
    }
    // The reading being heard, named by the plan ("Génesis 2").
    const heard = this.planEntry()
    return day && heard ? `+365 · Dia ${day.day} · ${heard.title}` : chapter
  })

  private readonly nativeChrome = inject(NativeChromeService)
  private readonly destroyRef = inject(DestroyRef)
  private readonly ngZone = inject(NgZone)
  /** The native apps show these controls in their own toolbar instead. */
  readonly native = this.nativeChrome.enabled

  /** The page is scrolled to its end: there's nothing left to play. */
  atEnd = false

  private readonly episodes = rxResource({
    params: () => {
      const bookId = this.bookId()
      const chapter = this.chapter()
      return bookId && chapter ? { bookId, chapter } : undefined
    },
    stream: ({ params }) =>
      this.player.episodesFor(params.bookId, params.chapter),
  })

  /** What «Ouvir» controls: the earliest +365 episode that reads the chapter. */
  /** A +365 day's reflection in the player: the card plays it, whatever chapter is open. */
  private readonly reflection = computed(() =>
    this.plan.stage() === "reflection" ? this.player.current() : null,
  )

  /**
   * In a +365 day the card plays what the day is at (a reading, or the
   * reflection), whichever chapter the reader has open.
   */
  private readonly planEntry = computed(() =>
    this.plan.stage() !== null ? this.player.current() : null,
  )

  /** The chapter open is the one being heard: read-along marks and follows it. */
  private readonly heardHere = computed(() => {
    const stage = this.plan.stage()
    if (stage === null) return true
    const reading =
      stage === "reflection" ? undefined : this.plan.active()?.readings[stage]
    return (
      reading?.bookId === this.bookId() && reading?.chapter === this.chapter()
    )
  })

  /**
   * A chapter read only in parts, over several days (Salmo 119, Provérbios
   * 1–6): its parts in order, played as one; null for one read whole.
   */
  private readonly parts = computed(() => {
    const episodes = this.episodes.value() ?? []
    if (episodes.length < 2 || episodes.some((e) => !e.range)) return null
    return (
      [...episodes]
        .sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0))
        // Heard as one chapter: past each day's announcement ("Provérbios 3,
        // 5 a 8"), straight to its first verse. The first part says the
        // chapter's name, then skips the verses named ("1 a 4"), where the
        // API says where that name ends.
        .map((part, i) => {
          const first = part.verses?.[0]?.[1]
          if (first === undefined) return part
          // To the hundredth, as the API gives times ("#t=1029.86").
          const verse = Math.max(
            part.start ?? 0,
            Math.round((first - PART_LEAD) * 100) / 100,
          )
          // The API's end of the name still let the start of "1 a 4" through
          // (heard as 0.15 s): cut a little sooner.
          const named = i === 0 && part.titleEnd !== undefined
          const nameEnd = (part.titleEnd ?? 0) - TITLE_CUT
          if (!named || nameEnd >= verse) return { ...part, start: verse }
          // From the name itself: the part's start can be the reading before
          // (and its jingle), or past the name (heard as "1 a 7").
          const name = part.titleStart
          return {
            ...part,
            ...(name !== undefined && name < nameEnd && { start: name }),
            skip: [nameEnd, verse] as [number, number],
          }
        })
    )
  })

  protected readonly entry = computed(() => {
    const parts = this.parts()
    return (
      this.planEntry() ??
      // The part playing, once the chapter has gone on to it.
      parts?.find((part) => this.player.isCurrent(part)) ??
      parts?.[0] ??
      this.episodes.value()?.[0]
    )
  })

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
  /**
   * A chapter read in parts, as one recording: its length, and how far into
   * it the player is (0 before it plays). Null for a chapter read whole.
   */
  private readonly whole = computed(() => {
    const parts = this.parts()
    if (!parts || this.planEntry()) return null
    const entry = this.entry()
    const playing = entry && this.player.isCurrent(entry) ? entry : null
    return partsTime(parts, playing, this.player.position())
  })

  /** The card's span and place: the chapter's in its episode, or its parts' in all of them. */
  protected readonly chapterStart = computed(() =>
    this.whole() ? 0 : (this.entry()?.start ?? 0),
  )
  protected readonly chapterEnd = computed(
    () => this.whole()?.length ?? this.entry()?.end ?? this.player.duration(),
  )
  private readonly here = computed(
    () => this.whole()?.elapsed ?? this.player.position(),
  )

  /** The slider, or the apps' scrubber: within the part, or across the parts. */
  protected seekTo(seconds: number): void {
    if (this.whole()) this.player.seekChapter(seconds, this.parts() ?? [])
    else this.player.seek(seconds)
  }

  constructor() {
    // Listening in the apps, ⏮ ⏭ step through the episode's day: the days.
    effect(() => {
      if (this.native && this.audioMode()) untracked(() => this.plan.load())
    })
    // The apps draw the player: what it shows goes to them as it changes.
    effect(() => {
      if (!this.native) return
      this.audioMode()
      this.podcastChrome()
      this.entry()
      untracked(() => this.syncNativeChrome())
    })
    // While it plays, the text follows the reading: eased up when scrolling,
    // turned page by page when paged.
    effect(() => {
      const glide =
        this.playingThis() && this.heardHere() && !!this.entry()?.verses
      untracked(() => (glide ? this.startGlide() : this.stopGlide()))
    })
    effect(() => {
      const verse = this.verseNow()
      untracked(() => this.readingVerse.emit(verse))
    })
    // Listening in pages carries on as «Ouvir» back in the scrolling view,
    // where the episode would otherwise lose its controls. Only once it
    // plays: a look at the pages leaves the scrolling controls as they were.
    effect(() => {
      if (this.paged() && this.playingThis()) {
        untracked(() => this.player.mode.set("audio"))
      }
    })
    // Turning to another chapter stops the episode: its reading is over.
    // Not in a +365 day, which turns the chapters itself as it plays on.
    let shown: string | undefined
    effect(() => {
      const chapter = `${this.bookId()}/${this.chapter()}`
      untracked(() => {
        if (
          shown !== undefined &&
          shown !== chapter &&
          !this.player.throughEpisode()
        )
          this.player.pause()
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
      Math.max(this.chapterStart(), this.here()),
    )
  })

  protected holdSlider(): void {
    this.heldAt = this.here()
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
   * while this chapter's own entry plays, as one episode reads
   * several chapters and the player keeps it across a chapter turn.
   */
  protected readonly verseNow = computed(() => {
    const verses = this.entry()?.verses
    // While it plays only: paused, or stopped at the chapter's end, no mark.
    if (!verses || !this.playingThis() || !this.heardHere()) return null
    const at = this.player.position()
    let verse: number | null = null
    for (const [number, start] of verses) {
      if (start > at + VERSE_LEAD) break
      verse = number
    }
    return verse
  })

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly injector = inject(Injector)
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
    this.landingAt = undefined
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
    if (!entry || !verses || !page || !this.heardHere()) return undefined
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
  /** Where the text lands once its slowdown has begun (a scrollTop). */
  private landingAt?: number
  /** When it last came to rest, to rest a while before setting off again. */
  private landedAt = 0

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
      this.landingAt = undefined
      return
    }
    if (this.paged()) {
      this.turnPages()
      return
    }
    const page = this.scrollElement()
    const reading = this.reading()
    if (!page || !reading) return
    const view = this.underNativeBars(page.getBoundingClientRect())
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
    // At the reading's pace: 2× reads twice the text, so the glide goes, and
    // rests, at twice the pace too, or it fell behind.
    const pace = this.player.rate()
    if (!this.settling) {
      // Rested a while after landing before it may set off again.
      if (Date.now() - this.landedAt < GLIDE_REST_MS / pace) return
      const inside = fits
        ? box.top >= area.top && box.bottom <= area.bottom
        : point >= area.top && point <= area.bottom
      if (inside) return
      this.settling = true
    }
    // Landing, it goes where it was headed, whatever the reading does since.
    const offset =
      this.landingAt === undefined
        ? lead - area.top
        : this.landingAt - page.scrollTop
    if (Math.abs(offset) < 1 || reduced) {
      if (reduced) page.scrollTop += offset
      this.settling = false
      this.landingAt = undefined
      this.landedAt = Date.now()
      this.glideCarry = 0
      this.glideSpeed = 0
      return
    }
    let aim =
      Math.sign(offset) *
      Math.min(
        Math.max(
          (Math.abs(offset) * pace) / GLIDE_SECONDS,
          GLIDE_MIN_SPEED * pace,
        ),
        GLIDE_MAX_SPEED * pace,
      )
    if (this.landingAt !== undefined) {
      // Slowing down only: never faster than it goes now.
      aim =
        Math.sign(offset) * Math.min(Math.abs(aim), Math.abs(this.glideSpeed))
    } else if (Math.abs(aim) < Math.abs(this.glideSpeed)) {
      // The slowdown begins: from here it lands, on this spot.
      this.landingAt = page.scrollTop + offset
    }
    const change = GLIDE_ACCEL * pace * seconds
    this.glideSpeed += Math.min(
      change,
      Math.max(-change, aim - this.glideSpeed),
    )
    // Never past the edge.
    const step =
      Math.abs(this.glideSpeed * seconds) > Math.abs(offset)
        ? offset
        : this.glideSpeed * seconds
    // Only what the scroller can take: at its top or bottom the move is
    // refused, and carrying that refusal over would stall the next move.
    const limit = page.scrollHeight - page.clientHeight
    const asked = page.scrollTop + step + this.glideCarry
    const wanted = Math.min(limit, Math.max(0, asked))
    page.scrollTop = wanted
    // Kept for the next frame, as scrollTop takes whole device pixels.
    this.glideCarry = wanted - page.scrollTop
    if (asked < 0 || asked > limit) {
      // Nowhere further to go: it has landed as far as it can.
      this.settling = false
      this.landingAt = undefined
      this.landedAt = Date.now()
      this.glideCarry = 0
      this.glideSpeed = 0
    }
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
    const pointer = event.pointerId
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointer) return
      this.position.set(
        this.withinWindow(
          moved.clientX - grab.x,
          moved.clientY - grab.y,
          start.width,
          start.height,
        ),
      )
    }
    // Released, cancelled (the device gone) or the control torn down: the
    // same end, the place reached kept.
    const end = (ended?: PointerEvent) => {
      if (ended && ended.pointerId !== pointer) return
      this.endDrag?.()
      this.store(POSITION_KEY, this.position())
    }
    this.endDrag?.()
    this.endDrag = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      this.endDrag = undefined
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }

  /** Ends a drag under way, if any: its listeners go. */
  private endDrag?: () => void

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

  /**
   * Tucks the card into its pill, or brings it back. The button pressed
   * goes with the layout it was in: focus moves to the one that replaces it,
   * so a keyboard reader can turn straight back.
   */
  protected tuck(collapsed: boolean): void {
    this.player.collapsed.set(collapsed)
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(
            collapsed ? ".audio-expand" : ".audio-collapse",
          )
          ?.focus(),
      { injector: this.injector },
    )
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
      if (!card) return
      resized?.observe(card)
      // Saved in a wider window, it would show off the edge: inside it.
      keepInside()
    })
    watched.observe(this.host.nativeElement, { childList: true, subtree: true })
    this.destroyRef.onDestroy(() => {
      this.endDrag?.()
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
    if (here === 0) {
      // Wholly on another page, after this one or (a seek back) before it.
      if (before + after > 0) this.turn(reading.verse as HTMLElement)
      return
    }
    if (after === 0) return
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
  private noteArrowTap = (event: Event) => {
    const target = event.target as Element | null
    if (target?.closest(".floating-nav-button")) this.noteReaderMoved()
  }

  /** Tells the reader which verse to mark and keep in view. */
  readonly readingVerse = output<number | null>()

  /** The +365 speed in words, for screen readers: "1 vez", "1,25 vezes". */
  protected readonly rateTitle = rateTitle
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
    if (entry && this.planEntry()) {
      this.player.toggle(entry)
      return
    }
    // Named for the system's player: the chapter, not the episode's day.
    const title = `${this.bookName()} ${this.chapter()}`
    if (entry) {
      this.player.toggle(
        { ...entry, title },
        (this.parts() ?? []).map((part) => ({ ...part, title })),
      )
    }
  }

  /**
   * The card's height as --audio-card-live-height, for what sits on top of
   * it (the › arrow, on a phone held sideways): one line of caption or two,
   * a day of the plan's buttons. The card comes and goes (tucked, scrolling
   * instead), so it's looked for again whenever the controls change.
   */
  private publishCardHeight(): void {
    if (typeof ResizeObserver === "undefined") return
    const root = document.documentElement
    const host = this.host.nativeElement
    const sizes = new ResizeObserver(([entry]) => {
      const height = Math.round(entry.target.getBoundingClientRect().height)
      root.style.setProperty("--audio-card-live-height", `${height}px`)
    })
    const watch = () => {
      sizes.disconnect()
      const card = host.querySelector(".audio-player")
      if (card) sizes.observe(card)
    }
    const changes = new MutationObserver(watch)
    changes.observe(host, { childList: true, subtree: true })
    watch()
    this.destroyRef.onDestroy(() => {
      sizes.disconnect()
      changes.disconnect()
      root.style.removeProperty("--audio-card-live-height")
    })
  }

  ngOnInit(): void {
    this.followEnd()
    this.watchReader()
    if (typeof window !== "undefined" && !this.native) {
      this.watchDesktop()
      this.publishCardHeight()
    }
    if (!this.native) return
    this.nativeChrome.actions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((action) => this.onNativeAction(action))
    this.syncNativeChrome()
  }

  ngOnDestroy(): void {
    // Hidden from the menu, the controls take what they started with them.
    this.stopGlide()
    // A +365 day plays on into its reflection, on its own page.
    if (!this.player.throughEpisode()) this.player.pause()
    this.stopAutoScroll()
    if (this.native) {
      this.nativeChrome.setAutoScroll(null)
      this.nativeChrome.setPodcast(null)
    }
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
    // In the apps too: read-along glides there, and a swipe must hold it off.
    if (!element) return
    this.ngZone.runOutsideAngular(() => {
      element.addEventListener("wheel", this.noteReaderMoved, { passive: true })
      element.addEventListener("touchmove", this.noteReaderMoved, {
        passive: true,
      })
      window.addEventListener("keydown", this.noteReaderKey)
      // A click, so Enter and Space on an arrow count as much as a tap.
      document.addEventListener("click", this.noteArrowTap, true)
      element.addEventListener("pointerdown", this.noteScrollbar)
    })
    this.destroyRef.onDestroy(() => {
      element.removeEventListener("pointerdown", this.noteScrollbar)
      element.removeEventListener("wheel", this.noteReaderMoved)
      element.removeEventListener("touchmove", this.noteReaderMoved)
      window.removeEventListener("keydown", this.noteReaderKey)
      document.removeEventListener("click", this.noteArrowTap, true)
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
  /**
   * The apps' bars, and the +365 player with them, float over the page: the
   * part of it they leave clear, as they report it (--native-chrome-*).
   */
  private underNativeBars(view: DOMRect): DOMRect {
    if (!this.native) return view
    const style = getComputedStyle(document.documentElement)
    const px = (name: string) =>
      Number.parseFloat(style.getPropertyValue(name)) || 0
    const top = view.top + px("--native-chrome-top")
    const bottom = view.bottom - px("--native-chrome-bottom")
    return new DOMRect(view.left, top, view.width, Math.max(0, bottom - top))
  }

  /** The +365 player as the apps draw it (PodcastChrome). */
  private readonly podcastChrome = computed((): PodcastChrome => {
    const start = this.chapterStart()
    const length = this.seekable() ? this.chapterEnd() - start : 0
    const inPlan = this.inPlan()
    const day = this.plan.active()
    const reflection = !!this.reflection()
    return {
      caption: this.caption(),
      // An introduction is all of its "reflection": just +365.
      context:
        day && inPlan
          ? day.readings.length
            ? `+365 · Dia ${day.day}${reflection ? " · Reflexão" : ""}`
            : "+365"
          : null,
      playing: this.playingThis(),
      canPlay: !!this.entry(),
      loaded: this.loaded(),
      // Whole seconds: one bridge message a second at most while playing.
      elapsed: Math.min(
        Math.floor(length),
        Math.max(0, Math.floor(this.here() - start)),
      ),
      length: Math.round(length * 10) / 10,
      rate: this.player.rate(),
      rateAccessibilityLabel: this.rateSpoken(),
      canSlower: this.player.canSlower(),
      canFaster: this.player.canFaster(),
      inPlan,
      previousLabel: this.episodeLabels().previous,
      nextLabel: this.episodeLabels().next,
      canScroll: !this.paged() && !inPlan,
      canClose: this.paged() || inPlan,
    }
  })

  /** A tap on the apps' +365 player (PodcastChrome) or its 🎧. */
  private onNativeAction(action: NativeChromeAction): void {
    switch (action.id) {
      case "auto-scroll-toggle":
        this.toggleAutoScroll()
        break
      case "auto-scroll-slower":
        this.decreaseAutoScrollSpeed()
        break
      case "auto-scroll-faster":
        this.increaseAutoScrollSpeed()
        break
      case "auto-scroll-listen":
      case "podcast-scroll":
        this.toggleMode()
        break
      case "podcast-toggle":
        this.toggleAudio()
        break
      case "podcast-previous":
        if (this.inPlan()) this.plan.back()
        else this.stepInEpisode(-1)
        break
      case "podcast-next":
        if (this.inPlan()) this.plan.skip()
        else this.stepInEpisode(1)
        break
      case "podcast-close":
        // Listening ends: a day under way ends unread, and the card gives the
        // toolbar back (not left as the chapter's player).
        if (this.plan.active()) this.plan.end()
        this.player.pause()
        this.player.mode.set("scroll")
        break
      case "podcast-skip":
        this.player.skip(action.seconds)
        break
      case "podcast-speed":
        this.player.cycleRate()
        break
      case "podcast-seek":
        this.seekTo(this.chapterStart() + action.seconds)
        break
    }
  }

  private syncNativeChrome(): void {
    if (!this.native || this.destroyRef.destroyed) return
    // One control at a time: the +365 player while listening, else
    // auto-scroll's (with a 🎧 where +365 reads the chapter).
    // In the apps' pages the control shows only for a day under way (heldByPlan):
    // once it lets go, nothing, as nothing there could dismiss a player.
    if (this.paged() && !this.plan.active()) {
      this.nativeChrome.setPodcast(null)
      this.nativeChrome.setAutoScroll(null)
      return
    }
    if (this.audioMode()) {
      this.nativeChrome.setAutoScroll(null)
      this.nativeChrome.setPodcast(this.podcastChrome())
      return
    }
    this.nativeChrome.setPodcast(null)
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
      canListen: !!this.entry(),
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
