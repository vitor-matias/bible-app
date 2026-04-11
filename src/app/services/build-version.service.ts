import { Injectable } from "@angular/core"

interface BuildInfo {
  buildVersion?: string
  buildEnvironment?: string
}

const FALLBACK_BUILD_VERSION = "dev-local"

@Injectable({
  providedIn: "root",
})
export class BuildVersionService {
  private buildVersion = FALLBACK_BUILD_VERSION
  private buildEnvironment = "unknown"
  private loadPromise?: Promise<void>

  get currentBuildVersion(): string {
    return this.buildVersion
  }

  get currentBuildEnvironment(): string {
    return this.buildEnvironment
  }

  async getBuildInfo(): Promise<BuildInfo> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadBuildVersion()
    }

    await this.loadPromise
    return {
      buildVersion: this.buildVersion,
      buildEnvironment: this.buildEnvironment,
    }
  }

  private async loadBuildVersion(): Promise<void> {
    if (typeof window === "undefined") {
      return
    }

    try {
      const url = new URL("build-info.json", document.baseURI).toString()
      const response = await fetch(url, { cache: "no-store" })

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as BuildInfo
      if (typeof data.buildVersion === "string" && data.buildVersion.trim()) {
        this.buildVersion = data.buildVersion
      }
      if (
        typeof data.buildEnvironment === "string" &&
        data.buildEnvironment.trim()
      ) {
        this.buildEnvironment = data.buildEnvironment
      }
    } catch {
      // Use fallback when build metadata is not available.
    }
  }
}
