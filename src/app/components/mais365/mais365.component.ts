import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  type OnDestroy,
  type OnInit,
  signal,
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
  readingLabel,
} from "../../services/mais365.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { PodcastPlayerService } from "../../services/podcast-player.service"
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
  styleUrl: "./mais365.component.css",
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

  /** The day shown: the one playing, else today, until another is picked. */
  protected readonly selected = linkedSignal<PlanDay | undefined>(
    () => this.plan.active() ?? this.plan.today(),
  )
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

  protected readonly spokenTime = (seconds: number): string =>
    this.time(seconds)

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
