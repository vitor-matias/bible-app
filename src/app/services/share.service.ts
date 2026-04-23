import { Inject, Injectable } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
import { SHARE_PLUGIN } from "../tokens"
import { AnalyticsService } from "./analytics.service"

/**
 * Owns native / web share logic and the `canShare` capability flag.
 * Extracted from HeaderComponent to keep the toolbar focused on UI concerns.
 */
@Injectable({ providedIn: "root" })
export class ShareService {
  readonly canShare: boolean

  constructor(
    @Inject(SHARE_PLUGIN) private sharePlugin: typeof Share,
    private analyticsService: AnalyticsService,
  ) {
    this.canShare =
      Capacitor.isNativePlatform() ||
      (typeof navigator !== "undefined" &&
        typeof navigator.share === "function")
  }

  async share(book: Book, chapterNumber: number): Promise<void> {
    if (!this.canShare) return

    const isAbout = book?.id === "about"
    const title = "Biblia Sagrada"
    const text = isAbout
      ? "Leia a Biblia nesta app."
      : `Ler ${book?.name} ${chapterNumber}.`
    const url = typeof window === "undefined" ? "" : window.location.href

    try {
      if (Capacitor.isNativePlatform()) {
        await this.sharePlugin.share({
          title: "Biblia Sagrada",
          text,
          url,
          dialogTitle: "Partilhar passagem",
        })
      } else {
        await navigator.share({ title, text, url })
      }

      void this.analyticsService.track("share", {
        book: book?.id,
        chapter: chapterNumber,
      })
    } catch {
      // User cancelled or share failed — no UI feedback needed.
    }
  }
}
