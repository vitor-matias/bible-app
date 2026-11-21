import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  type OnInit,
  signal,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatSliderModule } from "@angular/material/slider"
import { Meta, Title } from "@angular/platform-browser"
import { RouterLink } from "@angular/router"
import { Mais365Service, type PlanDay } from "../../services/mais365.service"
import { PodcastPlayerService } from "../../services/podcast-player.service"

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
export class Mais365Component implements OnInit {
  protected readonly plan = inject(Mais365Service)
  protected readonly player = inject(PodcastPlayerService)
  private readonly title = inject(Title)
  private readonly meta = inject(Meta)

  /** The day shown: today, until another is picked. */
  protected readonly selected = linkedSignal<PlanDay>(() => this.plan.today())

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
    if (this.plan.active() !== day) return false
    const stage = this.plan.stage()
    return stage === "reflection" || (stage !== null && index < stage)
  }

  protected playingDay(day: PlanDay): boolean {
    return this.plan.active() === day && this.player.playing()
  }
}
