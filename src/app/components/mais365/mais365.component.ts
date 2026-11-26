import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  Injector,
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

/**
 * +365 as a reading plan: today's readings, played through with the
 * podcast or read alone, the days done so far, and the reflection that
 * follows a day's readings.
 */
@Component({
  selector: "mais365",
  imports: [RouterLink, MatButtonModule, MatIconModule, MatSliderModule],
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
  private readonly destroyRef = inject(DestroyRef)
  private readonly injector = inject(Injector)
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement

  /** Where the next day to read is, scrolled out of sight: above or below. */
  protected readonly nextAway = signal<"up" | "down" | null>(null)
  private readonly nextRow =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver(([entry]) => {
          if (!entry) return
          this.nextAway.set(
            entry.isIntersecting
              ? null
              : entry.boundingClientRect.top < 0
                ? "up"
                : "down",
          )
        })

  constructor() {
    // The row moves as the days load and as a day is marked read.
    afterRenderEffect(() => {
      this.plan.today()
      this.plan.days()
      this.nextRow?.disconnect()
      this.nextAway.set(null)
      const row = this.host.querySelector("[data-next]")
      if (row) this.nextRow?.observe(row)
    })
    this.destroyRef.onDestroy(() => this.nextRow?.disconnect())
  }

  /** Back to the next day to read: its row in view, its card shown. */
  protected toNext(): void {
    const next = this.plan.today()
    if (!next) return
    this.selected.set(next)
    this.scrollTo(this.host.querySelector("[data-next]"), "center")
  }

  /** The plan's length: a year of days, however many are out so far. */
  protected readonly planLength = 365
  /** Days of readings read: an introduction is not one of the 365. */
  protected readonly read = computed(() => {
    const done = this.plan.done()
    return this.plan
      .days()
      .filter((day) => day.readings.length && done.includes(day.day)).length
  })
  protected readonly sections = computed(() => planSections(this.plan.days()))

  protected sectionRead(section: PlanSection): number {
    return section.days.filter((day) => this.isDone(day)).length
  }

  private scrollTo(target: Element | null, block: ScrollLogicalPosition): void {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
    target?.scrollIntoView({ block, behavior: smooth ? "smooth" : "auto" })
  }

  protected toSection(index: number): void {
    this.scrollTo(this.host.querySelector(`[data-period="${index}"]`), "start")
  }

  /**
   * A day picked from the list: its card, brought into view where the list
   * has pushed it out (one column; beside the list it stays in sight).
   */
  protected select(day: PlanDay): void {
    this.selected.set(day)
    const column = this.host.querySelector(".today-column")
    if (!column || getComputedStyle(column).position === "sticky") return
    // Once rendered: during a reflection the day's card is only now there.
    afterNextRender(
      () =>
        // The day being heard through its reflection has that card alone.
        this.scrollTo(
          this.host.querySelector(".card.today") ??
            this.host.querySelector(".card"),
          "nearest",
        ),
      { injector: this.injector },
    )
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
