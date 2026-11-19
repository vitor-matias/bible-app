import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  NgZone,
  OnDestroy,
  OnInit,
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
  PodcastPlayerService,
} from "../../services/podcast-player.service"
import { PreferencesService } from "../../services/preferences.service"

/**
 * How close to the slowest or fastest speed counts as there. The service
 * keeps four decimals, so the slowest, 1/6, is stored as 0.1667: a little
 * above it, which left − enabled there. The nearest steps are 0.03 apart.
 */
const SPEED_LIMIT_TOLERANCE = 0.001

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

  /** The +365 speed in words, for screen readers: "1,25 vezes". */
  protected readonly rateSpoken = computed(
    () => `${String(this.player.rate()).replace(".", ",")} vezes`,
  )

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
