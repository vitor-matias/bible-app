import { Injectable, inject } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { LIVE_UPDATE_BASE_URL, LIVE_UPDATE_PLUGIN } from "../tokens"
import { BuildVersionService } from "./build-version.service"

/**
 * `<base>/<platform>/<channel>/manifest.json`, written by
 * scripts/package-live-update.mjs.
 */
export interface LiveUpdateManifest {
  /** The bundle's build-info.json `buildVersion`: a sortable UTC timestamp. */
  bundleId: string
  /** The zip, relative to the manifest. */
  url: string
  /** SHA-256 of the zip, hex. */
  checksum: string
  /** SHA256withRSA signature of the zip, base64. */
  signature: string
}

/** build-info.json's `buildVersion` format, e.g. 20261001-203100Z. */
const BUNDLE_ID = /^\d{8}-\d{6}Z$/

/**
 * Over-the-air updates of the web bundle in the native apps, from a static
 * server (docs/live-updates.md). A newer bundle is downloaded in the
 * background and applied on the next launch, so reading is never interrupted.
 *
 * Channels (`native-<n>`, set in the native projects) keep bundles away from
 * native builds they were not built for. The plugin verifies each bundle's
 * signature (capacitor.config.ts `publicKey`) and rolls back to the bundled
 * app if one fails to call `ready()` in time.
 */
@Injectable({
  providedIn: "root",
})
export class LiveUpdateService {
  private readonly liveUpdate = inject(LIVE_UPDATE_PLUGIN)
  private readonly baseUrl = inject(LIVE_UPDATE_BASE_URL)
  private readonly buildVersionService = inject(BuildVersionService)

  /**
   * Confirms this bundle works (or the plugin rolls back to the bundled app),
   * then looks for a newer one. Never throws: a failed check only means no
   * update this launch.
   */
  async readyAndCheck(): Promise<void> {
    try {
      await this.liveUpdate.ready()
      await this.checkForUpdate()
    } catch (error) {
      console.warn("Live update check failed", error)
    }
  }

  private async checkForUpdate(): Promise<void> {
    if (!this.baseUrl) return

    const { channel } = await this.liveUpdate.getChannel()
    if (!channel) return

    const manifestUrl = new URL(
      `${Capacitor.getPlatform()}/${channel}/manifest.json`,
      this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`,
    )
    const response = await fetch(manifestUrl, { cache: "no-store" })
    if (!response.ok) return
    const manifest = parseManifest(await response.json())
    if (!manifest) return

    // Only move forward: after a store release the channel may still hold an
    // older bundle than the one shipped in the app.
    const { buildVersion } = await this.buildVersionService.getBuildInfo()
    if (!buildVersion || !BUNDLE_ID.test(buildVersion)) return
    if (manifest.bundleId <= buildVersion) return

    // A bundle that failed to call ready() in time was rolled back and
    // blocked (autoBlockRolledBackBundles); setting it again would break
    // every other launch.
    const { bundleIds: blocked } = await this.liveUpdate.getBlockedBundles()
    if (blocked.includes(manifest.bundleId)) return

    const { bundleId: nextBundleId } = await this.liveUpdate.getNextBundle()
    if (nextBundleId === manifest.bundleId) return

    const { bundleIds } = await this.liveUpdate.getDownloadedBundles()
    if (!bundleIds.includes(manifest.bundleId)) {
      await this.liveUpdate.downloadBundle({
        bundleId: manifest.bundleId,
        url: new URL(manifest.url, manifestUrl).toString(),
        checksum: manifest.checksum,
        signature: manifest.signature,
      })
    }
    await this.liveUpdate.setNextBundle({ bundleId: manifest.bundleId })
  }
}

function parseManifest(value: unknown): LiveUpdateManifest | null {
  if (!value || typeof value !== "object") return null
  const { bundleId, url, checksum, signature } = value as Record<
    string,
    unknown
  >
  if (
    typeof bundleId !== "string" ||
    !BUNDLE_ID.test(bundleId) ||
    typeof url !== "string" ||
    typeof checksum !== "string" ||
    typeof signature !== "string"
  ) {
    return null
  }
  return { bundleId, url, checksum, signature }
}
