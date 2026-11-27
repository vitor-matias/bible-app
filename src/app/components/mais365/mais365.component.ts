import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  HostListener,
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
import { MatDialog } from "@angular/material/dialog"
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
import { Mais365ReminderService } from "../../services/mais365-reminder.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import {
  PodcastPlayerService,
  rateTitle,
} from "../../services/podcast-player.service"
import { ThemeService } from "../../services/theme.service"
import { ToastService } from "../../services/toast.service"
import { focusIfLost } from "../../utils/focus"
import { Mais365ReminderComponent } from "./mais365-reminder.component"
import { StreakMilestoneComponent } from "./streak-milestone.component"

/**
 * +365 as a reading plan: today's readings, played through with the
 * podcast or read alone, the days done so far, and the reflection that
 * follows a day's readings.
 */
@Component({
  selector: "mais365",
  imports: [RouterLink, MatButtonModule, MatIconModule, MatSliderModule],
  templateUrl: "./mais365.component.html",
  styleUrls: [
    "./mais365.component.css",
    "./mais365-card.css",
    "./mais365-player.css",
    "./mais365-days.css",
    "./mais365.native.css",
  ],
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
  private readonly dialog = inject(MatDialog)
  protected readonly reminder = inject(Mais365ReminderService)
  /** A milestone's dialog is open: not opened twice. */
  private celebrating = false
  /** A day a shared link asked for (/mais365?dia=120): its card, once loaded. */
  private askedDay: number | string | undefined = (() => {
    const dia: unknown = this.router.parseUrl(this.router.url).queryParams[
      "dia"
    ]
    // A day's number; anything else asked for is said to be no day (below).
    // An empty «?dia=» asks for nothing, not Dia 0.
    if (typeof dia !== "string" || dia === "") return undefined
    return /^\d+(\.\d+)?$/.test(dia) ? Number(dia) : dia
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
  /** The reader has scrolled or picked a day: the way back may show. */
  private engaged = false
  private readonly injector = inject(Injector)

  constructor() {
    // A day started here: its card turns into the player, and focus, lost
    // with the button pressed, goes to its play button.
    effect(() => {
      if (!this.here()) return
      afterNextRender(
        () =>
          focusIfLost(
            this.host.querySelector<HTMLElement>(
              "section.reflection button.play",
            ),
          ),
        { injector: this.injector },
      )
    })
    // The bar's bell rings once the reminder is on (in the apps).
    effect(() => {
      this.reminder.enabled()
      if (this.nativeChrome.enabled && this.barsShown)
        untracked(() => this.showBars())
    })
    // A streak's milestone just reached: celebrated once, here.
    effect(() => {
      const due = this.plan.milestone()
      if (!due || this.celebrating) return
      this.celebrating = true
      untracked(() =>
        this.dialog
          .open<StreakMilestoneComponent, { days: number }, "share">(
            StreakMilestoneComponent,
            {
              data: { days: due.days },
              ariaModal: true,
              width: "90%",
              maxWidth: "360px",
            },
          )
          .afterClosed()
          .subscribe((answer) => {
            this.celebrating = false
            this.plan.celebrate(due.key)
            if (answer === "share") void this.shareStreak(due.days)
          }),
      )
    })
    effect(() => {
      const days = this.plan.days()
      const asked = this.askedDay
      if (asked === undefined || !days.length) return
      this.askedDay = undefined
      const day = days.find((d) => d.day === asked)
      untracked(() => {
        if (day) this.showAsked(day)
        else this.notThere(asked)
      })
    })
    afterNextRender(() => this.watchCard())
    // The row moves as the days load, as a day is marked read, and as the
    // days before it unfold above it (no scroll follows to tell).
    afterRenderEffect(() => {
      this.plan.today()
      this.plan.days()
      this.shownSections()
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
      const scrolled = () => {
        if (window.scrollY > 0) this.engaged = true
        check()
      }
      window.addEventListener("scroll", scrolled, { passive: true })
      window.addEventListener("resize", check, { passive: true })
      this.destroyRef.onDestroy(() => {
        window.removeEventListener("scroll", scrolled)
        window.removeEventListener("resize", check)
        cancelAnimationFrame(this.checking)
      })
    }
  }

  /**
   * Where the card that stays over the list (a phone) ends, as the page's
   * scroll-padding-top: focused rows and scrollIntoView clear it. Nothing
   * where the card isn't over the list.
   */
  private watchCard(): void {
    const column = this.host.querySelector<HTMLElement>(".today-column")
    if (!column) return
    const root = document.documentElement
    const measure = () => {
      const style = getComputedStyle(column)
      const bottom =
        style.position === "sticky"
          ? Number.parseFloat(style.top) + column.offsetHeight
          : 0
      root.style.setProperty(
        "--mais365-card-bottom",
        `${Number.isFinite(bottom) ? bottom : 0}px`,
      )
    }
    root.style.scrollPaddingTop = "var(--mais365-card-bottom, 0px)"
    measure()
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure)
    observer?.observe(column)
    window.addEventListener("resize", measure, { passive: true })
    this.destroyRef.onDestroy(() => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
      root.style.removeProperty("--mais365-card-bottom")
      root.style.removeProperty("scroll-padding-top")
    })
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
    return {
      top: Math.max(over && card ? card.bottom : 0, this.barsBottom()),
      bottom: window.innerHeight,
    }
  }

  /**
   * Where the bars over the page end: the apps' as their inset says (plain
   * px), the web's header as drawn (its height is a calc() the inset can't
   * be read from).
   */
  private barsBottom(): number {
    if (this.nativeChrome.enabled) {
      const top = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--native-chrome-top",
        ),
      )
      return Number.isFinite(top) ? top : 0
    }
    const header = document.querySelector("header .mat-toolbar")
    return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0
  }

  /** Whether the next day's row is out of sight, and which way. */
  private checkNext(): void {
    const row = this.host.querySelector("[data-next]")
    const shown = this.shownArea(row)
    // The card already shows the next day, the page untouched: nothing to go back to.
    const fresh =
      !this.engaged && this.selected()?.day === this.plan.today()?.day
    if (!row || !shown || fresh) {
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
    const behavior = smooth ? "smooth" : "auto"
    // A row in sight with the page at its top (the first days): all the way
    // up, not stopped short with the title half under the bar.
    if (box.bottom + window.scrollY <= window.innerHeight) {
      window.scrollTo({ top: 0, behavior })
      return
    }
    window.scrollBy({
      top: box.top + box.height / 2 - (shown.top + shown.bottom) / 2,
      behavior,
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
   * How many days the list can fold away: those before the next day to read,
   * all but the two just before it, so the list opens where the reader is
   * (day 120, not day 1). None once all are read.
   */
  protected readonly foldable = computed(() => {
    // All read: today falls back on the last day; nothing is ahead to open at.
    const done = this.plan.done()
    if (this.plan.days().every((day) => done.includes(day.day))) return 0
    const next = this.plan.today()
    const at = next ? this.plan.days().findIndex((d) => d.day === next.day) : -1
    return Math.max(0, at - 2)
  })
  /** How many are folded now: none once asked for. */
  protected readonly folded = computed(() =>
    this.showEarlier() ? 0 : this.foldable(),
  )
  /**
   * The rows that fold, as told: as many as open (Dia 0 among them), but
   * none when they're introductions alone, said as such.
   */
  protected readonly foldableDays = computed(() => {
    const rows = this.plan.days().slice(0, this.foldable())
    return rows.some((day) => day.readings.length) ? rows.length : 0
  })
  /** The periods as listed: their days from the fold on. */
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

  /**
   * Opens or folds the earlier days where the reader is: the row at the top
   * of the list stays where it was on screen (the fold's own row, when the
   * days fold away under it).
   */
  protected toggleEarlier(button: HTMLElement): void {
    const opening = !this.showEarlier()
    const rows = Array.from(
      this.host.querySelectorAll<HTMLElement>(".days-column .day"),
    )
    const top = this.shownArea(rows[0] ?? null)?.top ?? 0
    const anchor = opening
      ? (rows.find((row) => row.getBoundingClientRect().bottom > top) ?? button)
      : button
    const before = anchor.getBoundingClientRect().top
    const day = anchor.closest("li")?.getAttribute("data-day")
    this.showEarlier.set(opening)
    afterNextRender(
      () => {
        const now = day
          ? this.host.querySelector(`li[data-day="${day}"]`)
          : button
        const moved = (now ?? button).getBoundingClientRect().top - before
        if (moved) window.scrollBy({ top: moved, behavior: "instant" })
      },
      { injector: this.injector },
    )
  }

  /** A period's days of readings read, out of all: introductions apart. */
  protected sectionRead(section: PlanSection): number {
    return section.days.filter((day) => day.readings.length && this.isDone(day))
      .length
  }

  protected sectionTotal(section: PlanSection): number {
    return section.days.filter((day) => day.readings.length).length
  }

  /**
   * A day picked from the list: its card, brought into view where the list
   * has pushed it out (one column; beside the list it stays in sight).
   */
  /**
   * The day a link asked for: its card, and its row in the list, unfolded
   * if it was among the days before and scrolled to.
   */
  private showAsked(day: PlanDay): void {
    this.selected.set(day)
    const index = this.plan.days().indexOf(day)
    if (index >= 0 && index < this.foldable()) this.showEarlier.set(true)
    afterNextRender(
      () =>
        this.host
          .querySelector(`li[data-day="${day.day}"]`)
          ?.scrollIntoView({ block: "center" }),
      { injector: this.injector },
    )
  }

  /** Not silently today's card: what was asked isn't there. */
  private notThere(asked: number | string): void {
    const latest = this.plan.days().at(-1)?.day ?? 0
    this.toast.show(
      typeof asked === "number" && asked > latest
        ? `O Dia ${asked} do +365 ainda não saiu.`
        : "Esse dia não existe no +365.",
    )
  }

  /** «Ir para o dia»: that day's card and row, as a ?dia= link opens them. */
  protected goToDay(event: Event, value: string): void {
    event.preventDefault()
    if (value.trim() === "") return
    const asked = Number(value)
    const day = this.plan.days().find((d) => d.day === asked)
    if (!day) {
      this.notThere(Number.isInteger(asked) ? asked : value)
      return
    }
    this.showAsked(day)
    this.announced.set(`${this.label(day)}: ${day.title}`)
  }

  /**
   * How many days out lie past the next one to read: 0 when it's the
   * newest, or all are read. Introductions (6.5) don't count as days.
   */
  protected readonly behind = computed(() => {
    const next = this.plan.today()
    const latest = this.plan
      .days()
      .filter((day) => Number.isInteger(day.day))
      .at(-1)?.day
    if (!next || latest === undefined || this.isDone(next)) return 0
    return Math.max(0, latest - Math.ceil(next.day))
  })

  /** K plays and pauses a day of the plan here too, as in the reader. */
  @HostListener("window:keydown", ["$event"])
  onPlayKey(event: KeyboardEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (
      event.key.toLowerCase() !== "k" ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      this.nativeChrome.enabled ||
      !this.plan.active() ||
      target?.isContentEditable ||
      target?.closest("input, textarea, select, .cdk-overlay-container")
    ) {
      return
    }
    event.preventDefault()
    this.plan.toggle()
  }

  protected select(day: PlanDay): void {
    // The card stays in sight, on a phone too: it changes where it is.
    this.engaged = true
    this.selected.set(day)
    // An introduction (6.5 in the data) is no «Dia».
    this.announced.set(`${this.label(day)}: ${day.title}`)
  }

  /** What a screen reader hears of a day picked from the list. */
  protected readonly announced = signal("")
  /** Readings a phone shows before «+ N leituras». */
  protected readonly shownReadings = 3
  /** The day whose readings are all shown, on a phone. */
  protected readonly expandedDay = signal<number | null>(null)
  /**
   * A day has been read today: the card's next one is «A seguir». Today as
   * the service's clock has it, so midnight (or the app coming back) moves it.
   */
  protected readonly readToday = computed(
    () => this.plan.lastReadOn() === this.plan.clockDay(),
  )

  /** The next day of readings after this one that is still unread. */
  protected following(day: PlanDay): PlanDay | undefined {
    const done = this.plan.done()
    return this.plan
      .days()
      .find(
        (d) => d.day > day.day && d.readings.length && !done.includes(d.day),
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
      const kept = previous?.value
      // A day just ended (✕, or heard out): its card stays, not the
      // earliest unread one.
      const left = previous?.source.active
      if (!active && left) {
        return days.find((day) => day.day === left.day) ?? left
      }
      if (active) {
        // The same day's full copy in place of its light one: a day picked
        // meanwhile stays picked.
        const sameDay = previous?.source.active?.day === active.day
        return sameDay && kept && kept.day !== active.day ? kept : active
      }
      const sameSession = previous?.source.active === active
      return sameSession && kept && days.some((day) => day.day === kept.day)
        ? kept
        : untracked(this.plan.today)
    },
  })
  protected readonly readingLabel = readingLabel

  /**
   * What plays on this page, with its span: the day's reflection, or the
   * episode's intro before its first reading.
   */
  protected readonly here = computed(() => {
    const day = this.plan.active()
    if (!day) return null
    if (this.plan.stage() === "reflection") {
      return { day, from: day.reflection, to: day.duration, intro: false }
    }
    const until = this.plan.introUntil()
    return until === null ? null : { day, from: 0, to: until, intro: true }
  })

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
  /** Spoken once changed: on load, a lone "1 vez" meant nothing. */
  protected readonly rateChanged = signal(false)
  protected readonly rateSpoken = computed(() => {
    const rate = this.player.rate()
    return `${String(rate).replace(".", ",")} ${rate === 1 ? "vez" : "vezes"}`
  })

  /** Back 15 s, but not out of the reflection into the readings (⏮ does that). */
  protected skipBack(from: number): void {
    this.player.seek(Math.max(from, this.player.position() - 15))
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
    const here = this.here()
    const start = here?.from ?? 0
    const end = here?.to ?? seconds
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
    if (await this.send(named, `?dia=${day.day}`)) {
      void this.analytics.track("plan_day_share", { day: day.day })
    }
  }

  /** The days in a row, to someone else, with the plan's page to start it. */
  private async shareStreak(days: number): Promise<void> {
    const said = `Há ${days} dias seguidos que leio a Bíblia com o +365.`
    if (await this.send(said, "")) {
      void this.analytics.track("plan_streak_share", { days })
    }
  }

  /** The share sheet, else the link copied. Whether it went. */
  private async send(text: string, search: string): Promise<boolean> {
    const url = shareableUrl({
      href: `${window.location.origin}/mais365${search}`,
      pathname: "/mais365",
      search,
      hash: "",
    })
    try {
      if (this.nativeChrome.enabled) {
        return await this.nativeChrome.share({
          title: "+365",
          text,
          url,
          linkTitle: "+365 | Bíblia Sagrada",
        })
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "+365", text, url })
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        this.toast.show("Ligação copiada.")
      }
      return true
    } catch {
      // Cancelled, or refused: nothing to say.
      return false
    }
  }

  /** The daily reminder's switch and time, over the page. */
  protected openReminder(): void {
    this.dialog.open(Mais365ReminderComponent, {
      ariaModal: true,
      ariaLabel: "Notificação diária",
      width: "90%",
      maxWidth: "360px",
      panelClass: "mais365-reminder-dialog",
      // The sheet, not its ✕ lit up as focused on opening.
      autoFocus: "dialog",
    })
  }

  ngOnInit(): void {
    this.title.setTitle("+365 | Bíblia Sagrada")
    this.meta.updateTag({ name: "robots", content: "noindex" })
    this.plan.load()
    // The apps' page bars, with their way back, over the page's own.
    if (this.nativeChrome.enabled) {
      this.showBars()
      this.nativeChrome.actions$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ id }) => {
          if (id === "back") void this.router.navigate(["/"])
          if (id === "reminder") this.openReminder()
        })
    }
  }

  /** The apps' bars are up: changes are sent from then on. */
  private barsShown = false

  private showBars(): void {
    this.barsShown = true
    this.nativeChrome.show({
      mode: "page",
      themeMode: this.themeService.currentMode,
      title: "+365",
      search: false,
      // The bell in the bar, as the apps' own buttons: the page's is the web's.
      reminder: this.reminder.enabled(),
    })
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
    // Heard through, now or before: a checkpoint «Continuar» goes on from.
    if (this.plan.heardOf(day).includes(index)) return true
    if (!this.plan.isActive(day)) return false
    const stage = this.plan.stage()
    return stage === "reflection" || (stage !== null && index < stage)
  }

  protected playingDay(day: PlanDay): boolean {
    return this.plan.isActive(day) && this.player.playing()
  }
}
