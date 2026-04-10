import { Injectable } from "@angular/core"

interface BuildInfo {
  buildVersion?: unknown
}

const FALLBACK_BUILD_VERSION = "dev-local"

@Injectable({
  providedIn: "root",
})
export class BuildVersionService {
  private buildVersion = FALLBACK_BUILD_VERSION
  private loadPromise?: Promise<string>

  get currentBuildVersion(): string {
    return this.buildVersion
  }

  async getBuildVersion(): Promise<string> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadBuildVersion()
    }

    return this.loadPromise
  }

  private async loadBuildVersion(): Promise<string> {
    if (typeof window === "undefined") {
      return this.buildVersion
    }

    try {
      const response = await fetch("/build-info.json", { cache: "no-store" })

      if (!response.ok) {
        return this.buildVersion
      }

      const data = (await response.json()) as BuildInfo
      if (typeof data.buildVersion === "string" && data.buildVersion.trim()) {
        this.buildVersion = data.buildVersion
      }
    } catch {
      // Use fallback when build metadata is not available.
    }

    return this.buildVersion
  }
}
