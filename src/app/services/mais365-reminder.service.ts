import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { computed, effect, Injectable, inject, signal } from "@angular/core"
import { Router } from "@angular/router"
import { SwPush } from "@angular/service-worker"
import { Capacitor } from "@capacitor/core"
import { firstValueFrom } from "rxjs"
import { apiBaseUrl } from "../config"
import { APP_PLUGIN, LOCAL_NOTIFICATIONS_PLUGIN } from "../tokens"
import { localDay, Mais365Service } from "./mais365.service"
import { PwaInstallService } from "./pwa-install.service"

const ENABLED_KEY = "mais365Reminder"
const TIME_KEY = "mais365ReminderTime"
const ONLY_UNREAD_KEY = "mais365ReminderOnlyUnread"
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
/** How many days ahead the apps schedule: the app opened once a fortnight keeps them coming. */
const AHEAD = 14

export const FALLBACK_BODY = "A leitura de hoje espera por si."

/** What a reminder says, and what the server is told. */
export interface ReminderState {
  time: string
  /** The latest local day a plan day was marked read on. */
  readOn: string | null
  /** The next day to read; none once the reader has caught up. */
  next: { day: number; title: string } | null
}

export interface ScheduledReminder {
  /** The date as YYYYMMDD: one per day, the same each time it's scheduled. */
  id: number
  at: Date
  title: string
  body: string
}

/**
 * The apps' reminders for the next AHEAD days at `time`, but not today's once
 * a day was read today or its time has gone.
 */
export function reminderSchedule(
  now: Date,
  { time, readOn, next }: ReminderState,
): ScheduledReminder[] {
  const [hours, minutes] = time.split(":").map(Number)
  const readToday = readOn === localDay(now)
  const reminders: ScheduledReminder[] = []
  for (let i = 0; i < AHEAD; i++) {
    // From the date, not +24 h: a change of clocks keeps the hour.
    const at = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + i,
      hours,
      minutes,
    )
    if (i === 0 && (readToday || at <= now)) continue
    reminders.push({
      id: Number(localDay(at).replaceAll("-", "")),
      at,
      // An introduction (Dia 6.5 in the data) is no «Dia»: its name says it.
      title:
        next && Number.isInteger(next.day) ? `+365 · Dia ${next.day}` : "+365",
      body: next?.title ?? FALLBACK_BODY,
    })
  }
  return reminders
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not kept: until the app closes.
  }
}

/**
 * A daily +365 reminder, only on days not read yet. The apps schedule local
 * notifications a fortnight ahead; the web subscribes to push, and bible-api
 * sends it unless told the day was read.
 */
@Injectable({ providedIn: "root" })
export class Mais365ReminderService {
  private readonly plan = inject(Mais365Service)
  private readonly http = inject(HttpClient)
  private readonly router = inject(Router)
  private readonly notifications = inject(LOCAL_NOTIFICATIONS_PLUGIN)
  private readonly app = inject(APP_PLUGIN)
  private readonly swPush = inject(SwPush)
  private readonly pwa = inject(PwaInstallService)
  private readonly native = Capacitor.isNativePlatform()

  /**
   * Why there are no reminders here at all, and how to get them. A service
   * worker isn't enough: iPhone Safari has one in a tab, but push only for an
   * app added to the home screen.
   */
  readonly unsupported: string | null =
    this.native || (this.swPush.isEnabled && typeof PushManager !== "undefined")
      ? null
      : this.pwa.detectPlatform() === "ios"
        ? "No iPhone, as notificações chegam com a app: instale-a, ou adicione esta página ao ecrã principal e abra-a de lá."
        : "Este navegador não recebe notificações. Instale a app para as ter."

  readonly enabled = signal(!this.unsupported && stored(ENABLED_KEY) === "true")
  readonly time = signal(
    TIME.test(stored(TIME_KEY) ?? "") ? (stored(TIME_KEY) as string) : "08:00",
  )
  /** Only on days not read yet (the default), or every day regardless. */
  readonly onlyUnread = signal(stored(ONLY_UNREAD_KEY) !== "false")
  /** Why turning it on failed: said under the switch. */
  readonly problem = signal<string | null>(null)
  /** Asking for permission, or the server. */
  readonly busy = signal(false)

  /** Taken up again on the apps' resume: today may be another day. */
  private readonly resumed = signal(0)

  /** Null until the plan has loaded (or failed to): nothing to say yet. */
  private readonly state = computed((): ReminderState | null => {
    const days = this.plan.days()
    if (this.plan.plan.isLoading() || (!days.length && !this.plan.plan.error()))
      return null
    return this.current()
  })

  private current(): ReminderState {
    const today = this.plan.today()
    return {
      time: this.time(),
      // Every day: no day read to skip, for the apps or the server.
      readOn: this.onlyUnread() ? this.plan.lastReadOn() : null,
      // today() is the last day when all are read: none is next then.
      next:
        today && !this.plan.done().includes(today.day)
          ? { day: today.day, title: today.title }
          : null,
    }
  }

  /** The native schedule's changes in order: a slow cancel can't undo a newer one. */
  private queue = Promise.resolve()
  private putTimer: ReturnType<typeof setTimeout> | undefined
  private lastPut = ""

  constructor() {
    effect(() => {
      if (this.enabled()) this.plan.load()
    })
    if (this.native) {
      effect(() => {
        this.resumed()
        const state = this.enabled() ? this.state() : null
        if (state) this.reschedule(state)
      })
      void this.app
        .addListener("resume", () => this.resumed.update((n) => n + 1))
        .catch(() => {})
      void this.notifications
        .addListener("localNotificationActionPerformed", () => {
          void this.router.navigate(["/mais365"])
        })
        .catch(() => {})
    } else {
      effect(() => {
        const state = this.enabled() ? this.state() : null
        if (!state) return
        // Debounced: a day marked and unmarked, or the time typed, is one PUT.
        clearTimeout(this.putTimer)
        this.putTimer = setTimeout(() => void this.sync(state), 1000)
      })
    }
  }

  /** Turns it on, asking for permission (and on the web a subscription). */
  async enable(): Promise<void> {
    if (this.unsupported || this.busy()) return
    this.problem.set(null)
    this.busy.set(true)
    try {
      if (this.native) {
        let { display } = await this.notifications.checkPermissions()
        if (display !== "granted") {
          ;({ display } = await this.notifications.requestPermissions())
        }
        if (display !== "granted") {
          this.problem.set(
            "As notificações estão desligadas para esta app. Ligue-as nas Definições do dispositivo.",
          )
          return
        }
      } else {
        const { publicKey } = await firstValueFrom(
          this.http.get<{ publicKey: string }>(
            `${apiBaseUrl}/mais365/reminders/key`,
          ),
        )
        const subscription = await this.swPush.requestSubscription({
          serverPublicKey: publicKey,
        })
        await this.put(subscription, this.state() ?? this.current())
      }
      this.setEnabled(true)
    } catch (error) {
      this.problem.set(this.failure(error))
    } finally {
      this.busy.set(false)
    }
  }

  async disable(): Promise<void> {
    this.setEnabled(false)
    this.problem.set(null)
    if (this.native) {
      this.reschedule(null)
      return
    }
    clearTimeout(this.putTimer)
    this.lastPut = ""
    try {
      const subscription = await firstValueFrom(this.swPush.subscription)
      if (!subscription) return
      await firstValueFrom(
        this.http.delete(`${apiBaseUrl}/mais365/reminders`, {
          body: { endpoint: subscription.endpoint },
        }),
      ).catch(() => {
        // Offline or refused: unsubscribed, the server's next push is
        // refused as gone, and it forgets the endpoint then.
      })
      await this.swPush.unsubscribe()
    } catch {
      // Already unsubscribed.
    }
  }

  setTime(time: string): void {
    if (!TIME.test(time)) return
    this.time.set(time)
    store(TIME_KEY, time)
  }

  setOnlyUnread(onlyUnread: boolean): void {
    this.onlyUnread.set(onlyUnread)
    store(ONLY_UNREAD_KEY, String(onlyUnread))
  }

  private setEnabled(enabled: boolean): void {
    this.enabled.set(enabled)
    store(ENABLED_KEY, String(enabled))
  }

  private failure(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 503) {
      return "As notificações ainda não estão disponíveis. Tente mais tarde."
    }
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "denied"
    ) {
      return "As notificações estão bloqueadas neste navegador. Permita-as nas definições do site."
    }
    return "Não foi possível ligar a notificação. Verifique a ligação à internet."
  }

  /** The web: the server told what changed, with the subscription it sends to. */
  private async sync(state: ReminderState): Promise<void> {
    const subscription = await firstValueFrom(this.swPush.subscription)
    if (!this.enabled()) return
    if (!subscription) {
      // Revoked in the browser: nothing to send to any more.
      this.setEnabled(false)
      return
    }
    await this.put(subscription, state).catch(() => {
      // Tried again on the next change.
    })
  }

  private async put(
    subscription: PushSubscription,
    state: ReminderState,
  ): Promise<void> {
    const body = {
      subscription: subscription.toJSON(),
      ...state,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    const sent = JSON.stringify(body)
    if (sent === this.lastPut) return
    await firstValueFrom(this.http.put(`${apiBaseUrl}/mais365/reminders`, body))
    this.lastPut = sent
  }

  /** The apps: what's pending replaced with the coming fortnight's, or nothing. */
  private reschedule(state: ReminderState | null): void {
    this.queue = this.queue
      .then(async () => {
        const { notifications } = await this.notifications.getPending()
        if (notifications.length) {
          await this.notifications.cancel({
            notifications: notifications.map(({ id }) => ({ id })),
          })
        }
        const reminders = state ? reminderSchedule(new Date(), state) : []
        if (!reminders.length) return
        await this.notifications.schedule({
          notifications: reminders.map(({ id, at, title, body }) => ({
            id,
            title,
            body,
            schedule: { at, allowWhileIdle: true },
            // No exact alarms: their permission isn't asked for (Android 12+).
            isExactNotification: false,
            smallIcon: "ic_launcher_monochrome",
          })),
        })
      })
      .catch(() => {
        // Notifications turned off in the system: nothing scheduled.
      })
  }
}
