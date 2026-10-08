import { Injectable } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { BuildVersionService } from "./build-version.service"

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
      let buildVersion: string | undefined
      let buildEnvironment: string | undefined

      try {
        const info = await this.buildVersionService.getBuildInfo()
        buildVersion = info.buildVersion
        buildEnvironment = info.buildEnvironment
      } catch (error) {
        console.error("Failed to fetch build info for analytics", error)
      }

      if (window.umami) {
        window.umami.track(eventName, {
          ...eventData,
          buildVersion,
          buildEnvironment,
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

    const info = await this.buildVersionService
      .getBuildInfo()
      .catch(() => undefined)
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
        buildVersion: info?.buildVersion,
        buildEnvironment: info?.buildEnvironment,
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "event", payload }),
    })
    if (!response.ok) {
      throw new Error(`Analytics responded ${response.status}`)
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
