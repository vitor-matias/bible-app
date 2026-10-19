import { Injectable } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { BuildVersionService } from "./build-version.service"

/**
 * How long a problem report may take to reach the server before it is given
 * up on, and the form says to try again.
 */
export const DELIVERY_TIMEOUT_MS = 15_000

@Injectable({
  providedIn: "root",
})
export class AnalyticsService {
  constructor(private buildVersionService: BuildVersionService) {}

  async track(
    eventName: string,
    eventData: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.areAnalyticsAvailable()) {
      return
    }

    try {
      let buildData: BuildData = {}

      try {
        buildData = await this.buildData()
      } catch (error) {
        console.error("Failed to fetch build info for analytics", error)
      }

      if (window.umami) {
        window.umami.track(eventName, {
          ...eventData,
          ...buildData,
          platform: Capacitor.getPlatform(),
        })
      }
    } catch (error) {
      console.error("Analytics tracking encountered an error", error)
    }
  }

  /**
   * Sends `eventName` and resolves only once the analytics server accepted
   * it; rejects otherwise. The tracker's own `umami.track` cannot say: it
   * swallows network errors and resolves either way. A problem report, which
   * tells the reader it was sent, goes through here.
   */
  async trackDelivered(
    eventName: string,
    eventData: Record<string, unknown> = {},
  ): Promise<void> {
    const script = document.querySelector<HTMLScriptElement>(
      "script[data-website-id]",
    )
    const website = script?.getAttribute("data-website-id")
    if (!script?.src || !website) throw new Error("Analytics is unavailable")
    // Where the tracker sends: beside its script, as it does itself.
    const host =
      script.getAttribute("data-host-url") ||
      script.src.split("/").slice(0, -1).join("/")
    const endpoint = `${host.replace(/\/$/, "")}/api/send`

    const buildData = await this.buildData().catch((): BuildData => ({}))
    let payload: UmamiPayload | null = {
      website,
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
      title: document.title,
      hostname: location.hostname,
      url: location.href,
      referrer: "",
      name: eventName,
      data: {
        ...eventData,
        ...buildData,
        platform: Capacitor.getPlatform(),
      },
    }
    // The page's own data-before-send hook (labelUmamiPlatform), as the
    // tracker applies it.
    const hookName = script.getAttribute("data-before-send")
    const hook = hookName
      ? (window as unknown as Record<string, unknown>)[hookName]
      : undefined
    if (typeof hook === "function") {
      payload = await hook("event", payload)
    }
    if (!payload) throw new Error("Analytics dropped the event")

    // A stalled connection would otherwise leave the form sending until the
    // OS gives up. Not AbortSignal.timeout, which iOS 15's WebKit lacks.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "event", payload }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Analytics responded ${response.status}`)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Which build sent an event, so a report or a count can be traced to the
   * code behind it: the web bundle's timestamp and environment, and, in the
   * native apps, their release.
   */
  private async buildData(): Promise<BuildData> {
    const [info, appVersion] = await Promise.all([
      this.buildVersionService.getBuildInfo(),
      this.buildVersionService.getRelease(),
    ])
    return {
      buildVersion: info.buildVersion,
      buildEnvironment: info.buildEnvironment,
      // The web has no release: its buildVersion is its version.
      ...(appVersion ? { appVersion } : {}),
    }
  }

  areAnalyticsAvailable(): boolean {
    return (
      (typeof window !== "undefined" &&
        window.umami &&
        typeof window.umami.track === "function") ||
      false
    )
  }
}

/** What every event says about the build that sent it. */
interface BuildData {
  buildVersion?: string
  buildEnvironment?: string
  /** The native apps' release (1.2.3); absent on the web. */
  appVersion?: string
}

/** The Umami payload fields this app rewrites; the script sends more. */
export interface UmamiPayload {
  hostname?: string
  tag?: string
  [field: string]: unknown
}

/**
 * Umami's `data-before-send` hook (registered in main.ts). The native shells
 * serve the app from https://localhost, so their page views would all be
 * counted under that hostname: label them by platform instead. Custom events
 * also carry `platform` in their data (see AnalyticsService.track).
 */
export function labelUmamiPlatform(
  _type: string,
  payload: UmamiPayload,
): UmamiPayload {
  const platform = Capacitor.getPlatform()
  if (platform === "web") return payload
  return { ...payload, hostname: `${platform}-app`, tag: platform }
}
