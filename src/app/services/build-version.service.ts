import { Injectable, inject } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { APP_PLUGIN } from "../tokens"

interface BuildInfo {
  buildVersion?: string
  buildEnvironment?: string
}

const FALLBACK_BUILD_VERSION = "dev-local"

/**
 * What to tell a reader about this copy of the app: a release number (the
 * native apps, 1.2.3) or the time it was compiled (the web app, which has no
 * releases).
 */
export interface DisplayVersion {
  kind: "release" | "build"
  value: string
}

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
   * The native apps have a release number, set from the release tag. The web
   * app, and an app that cannot say its release, have the compile timestamp.
   */
  async getDisplayVersion(): Promise<DisplayVersion> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { version } = await this.appPlugin.getInfo()
        if (version?.trim()) return { kind: "release", value: version }
      } catch {
        // Fall back to the compile timestamp below.
      }
    }
    const { buildVersion } = await this.getBuildInfo()
    return { kind: "build", value: buildVersion ?? FALLBACK_BUILD_VERSION }
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
