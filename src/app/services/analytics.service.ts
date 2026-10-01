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
