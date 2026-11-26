import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  linkedSignal,
  type OnDestroy,
  type OnInit,
  signal,
  untracked,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatSliderModule } from "@angular/material/slider"
import { Meta, Title } from "@angular/platform-browser"
import { Router, RouterLink } from "@angular/router"
import { shareableUrl } from "../../config"
import { AnalyticsService } from "../../services/analytics.service"
import {
  Mais365Service,
  type PlanDay,
  type PlanSection,
  planSections,
  readingLabel,
  readingsSummary,
} from "../../services/mais365.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import {
  PodcastPlayerService,
  rateTitle,
} from "../../services/podcast-player.service"
import { ThemeService } from "../../services/theme.service"
import { ToastService } from "../../services/toast.service"
import { Mais365ReminderComponent } from "./mais365-reminder.component"

/**
 * +365 as a reading plan: today's readings, played through with the
 * podcast or read alone, the days done so far, and the reflection that
 * follows a day's readings.
 */
@Component({
  selector: "mais365",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    Mais365ReminderComponent,
  ],
  templateUrl: "./mais365.component.html",
  styleUrls: ["./mais365.component.css", "./mais365.native.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mais365Component implements OnInit, OnDestroy {
  protected readonly plan = inject(Mais365Service)
  protected readonly player = inject(PodcastPlayerService)
  protected readonly toast = inject(ToastService)
  private readonly title = inject(Title)
  private readonly meta = inject(Meta)
  protected readonly nativeChrome = inject(NativeChromeService)
  private readonly themeService = inject(ThemeService)
  private readonly router = inject(Router)
  private readonly analytics = inject(AnalyticsService)
  /** A day a shared link asked for (/mais365?dia=120): its card, once loaded. */
  private askedDay: number | undefined = (() => {
    const dia = Number(this.router.parseUrl(this.router.url).queryParams["dia"])
    return Number.isFinite(dia) ? dia : undefined
  })()

  /** A share sheet, or at least a link to copy. */
  protected readonly canShare =
    this.nativeChrome.enabled ||
    (typeof navigator !== "undefined" &&
      (typeof navigator.share === "function" || !!navigator.clipboard))
  private readonly destroyRef = inject(DestroyRef)
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement

  /** Where the next day to read is, scrolled out of sight: above or below. */
  protected readonly nextAway = signal<"up" | "down" | null>(null)
  private checking = 0

  constructor() {
    effect(() => {
      const days = this.plan.days()
      const asked = this.askedDay
      if (asked === undefined || !days.length) return
      this.askedDay = undefined
      const day = days.find((d) => d.day === asked)
      if (day) untracked(() => this.selected.set(day))
    })
    // The row moves as the days load and as a day is marked read.
    afterRenderEffect(() => {
      this.plan.today()
      this.plan.days()
      this.checkNext()
    })
    // Measured as the page scrolls, not observed: a row under the card that
    // stays on a phone is out of sight, though on screen.
    if (typeof window !== "undefined") {
      const check = () => {
        if (this.checking) return
        this.checking = requestAnimationFrame(() => {
          this.checking = 0
          this.checkNext()
        })
      }
      window.addEventListener("scroll", check, { passive: true })
      window.addEventListener("resize", check, { passive: true })
      this.destroyRef.onDestroy(() => {
        window.removeEventListener("scroll", check)
        window.removeEventListener("resize", check)
        cancelAnimationFrame(this.checking)
      })
    }
  }

  /**
   * The part of the window where a list row can be seen: below the card
   * where it stays over the list (a phone), else below the bars.
   */
  private shownArea(
    row: Element | null,
  ): { top: number; bottom: number } | null {
    if (!row) return null
    const box = row.getBoundingClientRect()
    const column = this.host.querySelector(".today-column")
    const card = column?.getBoundingClientRect()
    const over =
      !!column &&
      !!card &&
      getComputedStyle(column).position === "sticky" &&
      card.left < box.right &&
      box.left < card.right
    const bars = Number.parseFloat(
      getComputedStyle(
        this.host.querySelector(".mais365") ?? this.host,
      ).getPropertyValue("--top"),
    )
    const top = Math.max(
      over && card ? card.bottom : 0,
      Number.isFinite(bars) ? bars : 0,
    )
    return { top, bottom: window.innerHeight }
  }

  /** Whether the next day's row is out of sight, and which way. */
  private checkNext(): void {
    const row = this.host.querySelector("[data-next]")
    const shown = this.shownArea(row)
    if (!row || !shown) {
      this.nextAway.set(null)
      return
    }
    const box = row.getBoundingClientRect()
    this.nextAway.set(
      box.bottom <= shown.top ? "up" : box.top >= shown.bottom ? "down" : null,
    )
  }

  /** Back to the next day to read: its row in view, its card shown. */
  protected toNext(): void {
    const next = this.plan.today()
    if (!next) return
    this.selected.set(next)
    const row = this.host.querySelector("[data-next]")
    const shown = this.shownArea(row)
    if (!row || !shown) return
    // In the middle of what can be seen of the list: under the card that
    // stays on a phone, not behind it.
    const box = row.getBoundingClientRect()
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
    window.scrollBy({
      top: box.top + box.height / 2 - (shown.top + shown.bottom) / 2,
      behavior: smooth ? "smooth" : "auto",
    })
  }

  /**
   * The days of readings out so far: 365 once the year is all published, and
   * read against what can be read until then.
   */
  protected readonly planLength = computed(
    () => this.plan.days().filter((day) => day.readings.length).length,
  )
  /** Days of readings read: an introduction is not one of the 365. */
  protected readonly read = computed(() => {
    const done = this.plan.done()
    return this.plan
      .days()
      .filter((day) => day.readings.length && done.includes(day.day)).length
  })
  protected readonly sections = computed(() => planSections(this.plan.days()))

  /** Shown once asked: the days before the next one, folded away. */
  protected readonly showEarlier = signal(false)
  /**
   * How many days the list folds away: those before the next day to read,
   * all but the two just before it, so the list opens where the reader is
   * (day 120, not day 1). None once all are read, or once asked for.
   */
  protected readonly folded = computed(() => {
    if (this.showEarlier()) return 0
    const next = this.plan.today()
    const at = next ? this.plan.days().findIndex((d) => d.day === next.day) : -1
    return Math.max(0, at - 2)
  })
  /** The periods as listed: their days from the fold on, counted whole. */
  protected readonly shownSections = computed(() => {
    const shown = new Set(
      this.plan
        .days()
        .slice(this.folded())
        .map((day) => day.day),
    )
    return this.sections()
      .map((section) => ({
        section,
        days: section.days.filter((day) => shown.has(day.day)),
      }))
      .filter(({ days }) => days.length)
  })

  protected sectionRead(section: PlanSection): number {
    return section.days.filter((day) => this.isDone(day)).length
  }

  /**
   * A day picked from the list: its card, brought into view where the list
   * has pushed it out (one column; beside the list it stays in sight).
   */
  protected select(day: PlanDay): void {
    // The card stays in sight, on a phone too: it changes where it is.
    this.selected.set(day)
  }

  /**
   * The day on the card: the one playing, else today's, until another is
   * picked. Marking a day read moves today on, but not the card, so its
   * «Lido ✓» shows (and can be undone): only a day started or ended, or the
   * days loaded again, set it afresh.
   */
  protected readonly selected = linkedSignal<
    { active: PlanDay | null; days: PlanDay[] },
    PlanDay | undefined
  >({
    source: () => ({ active: this.plan.active(), days: this.plan.days() }),
    computation: ({ active, days }, previous) => {
      if (active) return active
      const kept = previous?.value
      const sameSession = previous?.source.active === active
      return sameSession && kept && days.some((day) => day.day === kept.day)
        ? kept
        : untracked(this.plan.today)
    },
  })
  protected readonly readingLabel = readingLabel

  protected readonly inReflection = computed(
    () => this.plan.stage() === "reflection",
  )

  /** Held while the thumb is dragged, so playback doesn't pull it back. */
  protected readonly dragging = signal(false)
  protected readonly sliderValue = linkedSignal<
    { dragging: boolean; at: number },
    number
  >({
    source: () => ({
      dragging: this.dragging(),
      at: this.player.position(),
    }),
    computation: ({ dragging, at }, previous) =>
      dragging && previous ? previous.value : at,
  })

  protected readonly rateTitle = rateTitle
  protected readonly rateSpoken = computed(() => {
    const rate = this.player.rate()
    return `${String(rate).replace(".", ",")} ${rate === 1 ? "vez" : "vezes"}`
  })

  /** Back 15 s, but not out of the reflection into the readings (⏮ does that). */
  protected skipBack(day: PlanDay): void {
    this.player.seek(Math.max(day.reflection, this.player.position() - 15))
  }

  /** "m:ss" of a span in seconds. */
  protected time(seconds: number): string {
    const s = Math.max(0, Math.round(seconds))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }

  /**
   * For screen readers, into the reflection, as the times beside the slider
   * show it (not into the whole episode): "0:03 de 10:55".
   */
  protected readonly spokenTime = (seconds: number): string => {
    const day = this.plan.active()
    const start = day?.reflection ?? 0
    const end = day?.duration ?? seconds
    return `${this.time(seconds - start)} de ${this.time(end - start)}`
  }

  /**
   * The day, to someone else: its name and readings, and a link that opens
   * its card. The share sheet, else the link copied.
   */
  protected async share(day: PlanDay): Promise<void> {
    const named = day.readings.length
      ? `Dia ${day.day} do +365: «${day.title}» (${this.summary(day)}).`
      : `+365: «${day.title}».`
    const search = `?dia=${day.day}`
    const url = shareableUrl({
      href: `${window.location.origin}/mais365${search}`,
      pathname: "/mais365",
      search,
      hash: "",
    })
    try {
      if (this.nativeChrome.enabled) {
        const shared = await this.nativeChrome.share({
          title: "+365",
          text: named,
          url,
          linkTitle: "+365 | Bíblia Sagrada",
        })
        if (!shared) return
      } else if (typeof navigator.share === "function") {
        await navigator.share({ title: "+365", text: named, url })
      } else {
        await navigator.clipboard.writeText(`${named} ${url}`)
        this.toast.show("Ligação copiada.")
      }
      void this.analytics.track("plan_day_share", { day: day.day })
    } catch {
      // Cancelled, or refused: nothing to say.
    }
  }

  ngOnInit(): void {
    this.title.setTitle("+365 | Bíblia Sagrada")
    this.meta.updateTag({ name: "robots", content: "noindex" })
    this.plan.load()
    // The apps' page bars, with their way back, over the page's own.
    if (this.nativeChrome.enabled) {
      this.nativeChrome.show({
        mode: "page",
        themeMode: this.themeService.currentMode,
        title: "+365",
        search: false,
      })
      this.nativeChrome.actions$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ id }) => {
          if (id === "back") void this.router.navigate(["/"])
        })
    }
  }

  ngOnDestroy(): void {
    if (this.nativeChrome.enabled) this.nativeChrome.hide()
  }

  /** "Dia 3"; an introduction by what it is, Dia 0 being the first. */
  protected label(day: PlanDay): string {
    if (day.readings.length || day.day === 0) return `Dia ${day.day}`
    return "Especial"
  }

  protected summary(day: PlanDay): string {
    return readingsSummary(day.readings)
  }

  /** The episode's length, in whole minutes. */
  protected minutes(day: PlanDay): number {
    return Math.max(1, Math.round(day.duration / 60))
  }

  protected isDone(day: PlanDay): boolean {
    return this.plan.done().includes(day.day)
  }

  /** A reading of the day under way that the podcast has gone past. */
  protected passed(day: PlanDay, index: number): boolean {
    if (!this.plan.isActive(day)) return false
    const stage = this.plan.stage()
    return stage === "reflection" || (stage !== null && index < stage)
  }

  protected playingDay(day: PlanDay): boolean {
    return this.plan.isActive(day) && this.player.playing()
  }
}
