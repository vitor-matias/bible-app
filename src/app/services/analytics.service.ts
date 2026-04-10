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

    const { buildVersion, buildEnvironment } =
      await this.buildVersionService.getBuildInfo()

    if (window.umami) {
      window.umami.track(eventName, {
        ...eventData,
        buildVersion,
        buildEnvironment,
        platform: Capacitor.getPlatform(),
      })
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
