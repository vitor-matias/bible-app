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
    if (typeof window === "undefined" || !window.umami) {
      return
    }

    const buildVersion = await this.buildVersionService.getBuildVersion()

    window.umami.track(eventName, {
      ...eventData,
      buildVersion,
      platform: Capacitor.getPlatform(),
    })
  }
}
