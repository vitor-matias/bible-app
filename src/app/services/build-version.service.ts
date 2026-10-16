import { Injectable, inject } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { APP_PLUGIN } from "../tokens"

interface BuildInfo {
  buildVersion?: string
  buildEnvironment?: string
}

const FALLBACK_BUILD_VERSION = "dev-local"

@Injectable({
  providedIn: "root",
})
export class BuildVersionService {
  private readonly appPlugin = inject(APP_PLUGIN)
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

  /**
   * The version to show a reader. The native apps have a release number
   * (1.2.3, set from the release tag); the web app has only its build id.
   */
  async getDisplayVersion(): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { version } = await this.appPlugin.getInfo()
        if (version?.trim()) return version
      } catch {
        // Fall back to the build id below.
      }
    }
    return (await this.getBuildInfo()).buildVersion ?? FALLBACK_BUILD_VERSION
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
