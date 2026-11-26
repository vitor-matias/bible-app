import { provideHttpClient } from "@angular/common/http"
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing"
import { computed, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { SwPush } from "@angular/service-worker"
import { Capacitor } from "@capacitor/core"
import { BehaviorSubject } from "rxjs"
import type { Mock } from "vitest"
import { lastCall } from "../testing/spy-obj"
import { APP_PLUGIN, LOCAL_NOTIFICATIONS_PLUGIN } from "../tokens"
import { localDay, Mais365Service, type PlanDay } from "./mais365.service"
import {
  FALLBACK_BODY,
  Mais365ReminderService,
  reminderSchedule,
} from "./mais365-reminder.service"
import { PwaInstallService } from "./pwa-install.service"

const planDay = (day: number, title: string): PlanDay => ({
  day,
  title,
  theme: "",
  url: `https://example.com/${day}.mp3`,
  duration: 600,
  readings: [],
  reflection: 0,
})

describe("reminderSchedule", () => {
  const next = { day: 12, title: "A torre de Babel" }
  // 26 Nov 2026, 07:00 local.
  const morning = new Date(2026, 10, 26, 7, 0)

  it("schedules the next 14 days at the time, today's included", () => {
    const reminders = reminderSchedule(morning, {
      time: "08:30",
      readOn: null,
      next,
    })
    expect(reminders.length).toBe(14)
    expect(reminders[0].at).toEqual(new Date(2026, 10, 26, 8, 30))
    expect(reminders[13].at).toEqual(new Date(2026, 11, 9, 8, 30))
    expect(reminders.map((r) => r.id).slice(0, 7)).toEqual([
      20261126, 20261127, 20261128, 20261129, 20261130, 20261201, 20261202,
    ])
  })

  it("says the next day to read", () => {
    const [first] = reminderSchedule(morning, {
      time: "08:30",
      readOn: null,
      next,
    })
    expect(first.title).toBe("+365 · Dia 12")
    expect(first.body).toBe("A torre de Babel")
  })

  // Introductions are fractional days in the data: «Dia 6.5» isn't a day.
  it("names an introduction by itself, not «Dia 6.5»", () => {
    const [first] = reminderSchedule(morning, {
      time: "08:30",
      readOn: null,
      next: { day: 6.5, title: "Introdução aos Patriarcas" },
    })
    expect(first.title).toBe("+365")
    expect(first.body).toBe("Introdução aos Patriarcas")
  })

  it("falls back to a plain line once caught up", () => {
    const [first] = reminderSchedule(morning, {
      time: "08:30",
      readOn: null,
      next: null,
    })
    expect(first.title).toBe("+365")
    expect(first.body).toBe(FALLBACK_BODY)
  })

  it("skips today once a day was read today", () => {
    const reminders = reminderSchedule(morning, {
      time: "08:30",
      readOn: localDay(morning),
      next,
    })
    expect(reminders.length).toBe(13)
    expect(reminders[0].id).toBe(20261127)
  })

  it("keeps today when the day read was yesterday's", () => {
    const reminders = reminderSchedule(morning, {
      time: "08:30",
      readOn: "2026-11-25",
      next,
    })
    expect(reminders[0].id).toBe(20261126)
  })

  it("skips today once its time has gone", () => {
    const reminders = reminderSchedule(new Date(2026, 10, 26, 9, 0), {
      time: "08:30",
      readOn: null,
      next,
    })
    expect(reminders.length).toBe(13)
    expect(reminders[0].id).toBe(20261127)
  })
})

describe("Mais365ReminderService", () => {
  let days: ReturnType<typeof signal<PlanDay[]>>
  let done: ReturnType<typeof signal<number[]>>
  let doneOn: ReturnType<typeof signal<Record<number, string>>>
  let plan: Record<string, unknown> & { load: Mock }
  let swPush: {
    isEnabled: boolean
    subscription: BehaviorSubject<PushSubscription | null>
    requestSubscription: Mock
    unsubscribe: Mock
  }
  let platform: "ios" | "android" | "desktop"

  beforeEach(() => {
    localStorage.removeItem("mais365Reminder")
    localStorage.removeItem("mais365ReminderTime")
    days = signal([planDay(11, "Noé"), planDay(12, "A torre de Babel")])
    done = signal([11])
    doneOn = signal({ 11: "2026-11-20" })
    plan = {
      days,
      done,
      doneOn,
      lastReadOn: computed(
        () =>
          done()
            .flatMap((day) => doneOn()[day] ?? [])
            .sort()
            .at(-1) ?? null,
      ),
      today: computed(
        () => days().find((d) => !done().includes(d.day)) ?? days().at(-1),
      ),
      plan: { isLoading: signal(false), error: signal(undefined) },
      load: vi.fn(),
    }
    swPush = {
      isEnabled: true,
      subscription: new BehaviorSubject<PushSubscription | null>(null),
      requestSubscription: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    }
    platform = "desktop"
  })

  afterEach(() => {
    localStorage.removeItem("mais365Reminder")
    localStorage.removeItem("mais365ReminderTime")
  })

  function setup(providers: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Mais365Service, useValue: plan },
        { provide: SwPush, useValue: swPush },
        {
          provide: PwaInstallService,
          useValue: { detectPlatform: () => platform },
        },
        ...(providers as never[]),
      ],
    })
    return TestBed.inject(Mais365ReminderService)
  }

  it("keeps the time, 08:00 by default", () => {
    const service = setup()
    expect(service.time()).toBe("08:00")
    service.setTime("21:15")
    service.setTime("nonsense")
    expect(service.time()).toBe("21:15")
    expect(localStorage.getItem("mais365ReminderTime")).toBe("21:15")
  })

  describe("in the apps", () => {
    let notifications: Record<
      "checkPermissions" | "requestPermissions" | "getPending" | "cancel",
      Mock
    > & { schedule: Mock; addListener: Mock }
    let app: { addListener: Mock }
    let router: { navigate: Mock }

    beforeEach(() => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
      notifications = {
        checkPermissions: vi.fn().mockResolvedValue({ display: "prompt" }),
        requestPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
        getPending: vi.fn().mockResolvedValue({ notifications: [] }),
        cancel: vi.fn().mockResolvedValue(undefined),
        schedule: vi.fn().mockResolvedValue({ notifications: [] }),
        addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
      }
      app = { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) }
      router = { navigate: vi.fn().mockResolvedValue(true) }
    })

    const native = () =>
      setup([
        { provide: LOCAL_NOTIFICATIONS_PLUGIN, useValue: notifications },
        { provide: APP_PLUGIN, useValue: app },
        { provide: Router, useValue: router },
      ])

    /** Lets the effects run and the schedule's promise chain settle. */
    async function settle(): Promise<void> {
      TestBed.tick()
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }

    it("asks for permission, then schedules the coming days", async () => {
      const service = native()
      await service.enable()
      await settle()
      expect(notifications.requestPermissions).toHaveBeenCalled()
      expect(service.enabled()).toBe(true)
      expect(plan.load).toHaveBeenCalled()
      const [{ notifications: scheduled }] = lastCall(notifications.schedule)
      expect(scheduled.length).toBeGreaterThanOrEqual(13)
      expect(scheduled[0]).toEqual(
        expect.objectContaining({
          title: "+365 · Dia 12",
          body: "A torre de Babel",
          isExactNotification: false,
          schedule: expect.objectContaining({ allowWhileIdle: true }),
        }),
      )
    })

    it("stays off when refused, and says why", async () => {
      notifications.requestPermissions.mockResolvedValue({ display: "denied" })
      const service = native()
      await service.enable()
      await settle()
      expect(service.enabled()).toBe(false)
      expect(service.problem()).toContain("Definições")
      expect(notifications.schedule).not.toHaveBeenCalled()
    })

    it("reschedules without today once a day is read today", async () => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(2026, 10, 26, 7, 0))
      const service = native()
      await service.enable()
      await settle()
      expect(lastCall(notifications.schedule)[0].notifications[0].id).toBe(
        20261126,
      )
      notifications.getPending.mockResolvedValue({
        notifications: [{ id: 20261126 }, { id: 20261127 }],
      })
      done.set([11, 12])
      doneOn.set({ 11: "2026-11-20", 12: "2026-11-26" })
      await settle()
      expect(lastCall(notifications.cancel)).toEqual([
        { notifications: [{ id: 20261126 }, { id: 20261127 }] },
      ])
      const [{ notifications: scheduled }] = lastCall(notifications.schedule)
      expect(scheduled[0].id).toBe(20261127)
      expect(scheduled[0].title).toBe("+365")
    })

    it("reschedules on resume", async () => {
      const service = native()
      await service.enable()
      await settle()
      const calls = notifications.schedule.mock.calls.length
      const [event, onResume] = app.addListener.mock.calls[0]
      expect(event).toBe("resume")
      onResume()
      await settle()
      expect(notifications.schedule.mock.calls.length).toBe(calls + 1)
    })

    it("opens the plan from a notification", () => {
      native()
      const [event, onTap] = notifications.addListener.mock.calls[0]
      expect(event).toBe("localNotificationActionPerformed")
      onTap({})
      expect(router.navigate).toHaveBeenCalledWith(["/mais365"])
    })

    it("cancels what's pending when turned off", async () => {
      const service = native()
      await service.enable()
      await settle()
      notifications.getPending.mockResolvedValue({
        notifications: [{ id: 20261127 }],
      })
      notifications.schedule.mockClear()
      await service.disable()
      await settle()
      expect(lastCall(notifications.cancel)).toEqual([
        { notifications: [{ id: 20261127 }] },
      ])
      expect(notifications.schedule).not.toHaveBeenCalled()
      expect(localStorage.getItem("mais365Reminder")).toBe("false")
    })
  })

  describe("on the web", () => {
    const subscription = {
      endpoint: "https://push.example/abc",
      toJSON: () => ({
        endpoint: "https://push.example/abc",
        keys: { p256dh: "p", auth: "a" },
      }),
    } as unknown as PushSubscription

    let http: HttpTestingController

    const web = () => {
      const service = setup()
      http = TestBed.inject(HttpTestingController)
      return service
    }

    afterEach(() => http?.verify())

    it("PUTs the subscription, time, zone, day read and next day", async () => {
      swPush.requestSubscription.mockResolvedValue(subscription)
      const service = web()
      const enabling = service.enable()
      http.expectOne("v1/mais365/reminders/key").flush({ publicKey: "KEY" })
      const put = await vi.waitFor(() => http.expectOne("v1/mais365/reminders"))
      expect(swPush.requestSubscription).toHaveBeenCalledWith({
        serverPublicKey: "KEY",
      })
      expect(put.request.method).toBe("PUT")
      expect(put.request.body).toEqual({
        subscription: subscription.toJSON(),
        time: "08:00",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        readOn: "2026-11-20",
        next: { day: 12, title: "A torre de Babel" },
      })
      put.flush(null, { status: 204, statusText: "No Content" })
      await enabling
      expect(service.enabled()).toBe(true)
    })

    it("PUTs again, debounced, once a day is read", async () => {
      vi.useFakeTimers()
      swPush.requestSubscription.mockResolvedValue(subscription)
      swPush.subscription.next(subscription)
      const service = web()
      const enabling = service.enable()
      http.expectOne("v1/mais365/reminders/key").flush({ publicKey: "KEY" })
      await vi.advanceTimersByTimeAsync(0)
      http
        .expectOne("v1/mais365/reminders")
        .flush(null, { status: 204, statusText: "No Content" })
      await enabling
      TestBed.tick()
      // The same as just sent: nothing new.
      await vi.advanceTimersByTimeAsync(1100)
      http.expectNone("v1/mais365/reminders")

      done.set([11, 12])
      doneOn.set({ 11: "2026-11-20", 12: "2026-11-26" })
      TestBed.tick()
      service.setTime("20:00")
      TestBed.tick()
      await vi.advanceTimersByTimeAsync(500)
      http.expectNone("v1/mais365/reminders")
      await vi.advanceTimersByTimeAsync(600)
      const put = http.expectOne("v1/mais365/reminders")
      expect(put.request.body).toEqual(
        expect.objectContaining({
          time: "20:00",
          readOn: "2026-11-26",
          next: null,
        }),
      )
      put.flush(null, { status: 204, statusText: "No Content" })
    })

    it("says the reminders aren't available while the server has no key", async () => {
      const service = web()
      const enabling = service.enable()
      http
        .expectOne("v1/mais365/reminders/key")
        .flush(null, { status: 503, statusText: "Service Unavailable" })
      await enabling
      expect(service.enabled()).toBe(false)
      expect(service.problem()).toContain("ainda não estão disponíveis")
      expect(swPush.requestSubscription).not.toHaveBeenCalled()
    })

    it("stays off when the browser refuses", async () => {
      swPush.requestSubscription.mockRejectedValue(new Error("denied"))
      const service = web()
      const enabling = service.enable()
      http.expectOne("v1/mais365/reminders/key").flush({ publicKey: "KEY" })
      await enabling
      expect(service.enabled()).toBe(false)
      expect(service.problem()).toBeTruthy()
      http.expectNone("v1/mais365/reminders")
    })

    it("DELETEs the endpoint and unsubscribes when turned off", async () => {
      localStorage.setItem("mais365Reminder", "true")
      swPush.subscription.next(subscription)
      const service = web()
      const disabling = service.disable()
      const del = await vi.waitFor(() => http.expectOne("v1/mais365/reminders"))
      expect(del.request.method).toBe("DELETE")
      expect(del.request.body).toEqual({ endpoint: subscription.endpoint })
      del.flush(null, { status: 204, statusText: "No Content" })
      await disabling
      expect(swPush.unsubscribe).toHaveBeenCalled()
      expect(service.enabled()).toBe(false)
    })

    it("unsubscribes when turned off, even if the DELETE fails", async () => {
      localStorage.setItem("mais365Reminder", "true")
      swPush.subscription.next(subscription)
      const service = web()
      const disabling = service.disable()
      const del = await vi.waitFor(() => http.expectOne("v1/mais365/reminders"))
      del.error(new ProgressEvent("error"))
      await disabling
      expect(swPush.unsubscribe).toHaveBeenCalled()
      expect(service.enabled()).toBe(false)
    })

    it("turns itself off once the browser drops the subscription", async () => {
      vi.useFakeTimers()
      localStorage.setItem("mais365Reminder", "true")
      const service = web()
      TestBed.tick()
      await vi.advanceTimersByTimeAsync(1100)
      expect(service.enabled()).toBe(false)
    })

    it("explains where push isn't supported", () => {
      swPush.isEnabled = false
      localStorage.setItem("mais365Reminder", "true")
      const service = web()
      expect(service.enabled()).toBe(false)
      expect(service.unsupported).toContain("Instale a app")
    })

    // iPhone Safari has a service worker in a tab, but push only for an app
    // added to the home screen: the switch was on offer, and failed.
    it("counts a browser with a worker but no push as unsupported", () => {
      swPush.isEnabled = true
      platform = "ios"
      vi.stubGlobal("PushManager", undefined)
      try {
        const service = web()
        expect(service.unsupported).toContain("ecrã principal")
        expect(service.enabled()).toBe(false)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it("tells iPhone readers to add it to the home screen", () => {
      swPush.isEnabled = false
      platform = "ios"
      const service = web()
      expect(service.unsupported).toContain("ecrã principal")
    })
  })
})
