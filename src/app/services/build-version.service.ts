import { Injectable, inject } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { APP_PLUGIN } from "../tokens"

interface BuildInfo {
  buildVersion?: string
  buildEnvironment?: string
}

const FALLBACK_BUILD_VERSION = "dev-local"

/** What to tell a reader about this copy of the app. */
export interface DisplayVersion {
  /** The native apps' release number (1.2.3, set from the release tag). */
  release: string | null
  /** When the web bundle was compiled, as a timestamp. */
  build: string
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
   * The compile timestamp of the web bundle, which the native apps ship
   * inside them, and, in the native apps only, their release number.
   */
  async getDisplayVersion(): Promise<DisplayVersion> {
    const [release, { buildVersion }] = await Promise.all([
      this.getRelease(),
      this.getBuildInfo(),
    ])
    return { release, build: buildVersion ?? FALLBACK_BUILD_VERSION }
  }

  private async getRelease(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return null
    try {
      const { version } = await this.appPlugin.getInfo()
      return version?.trim() ? version : null
    } catch {
      return null
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
