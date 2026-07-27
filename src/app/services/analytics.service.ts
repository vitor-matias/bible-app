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
