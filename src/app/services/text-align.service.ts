import { DOCUMENT, isPlatformBrowser } from "@angular/common"
import { Injectable, inject, PLATFORM_ID } from "@angular/core"
import { PreferencesService } from "./preferences.service"

/**
 * The reader's text: justified by default, or ragged-right by the reader's
 * choice. The choice is a class on <html> (`ragged-text`, styles.css).
 */
@Injectable({
  providedIn: "root",
})
export class TextAlignService {
  private readonly document = inject(DOCUMENT)
  private readonly platformId = inject(PLATFORM_ID)
  private readonly preferences = inject(PreferencesService)
  private raggedText = this.preferences.getRaggedText()

  constructor() {
    this.apply()
  }

  get ragged(): boolean {
    return this.raggedText
  }

  toggle(): void {
    this.raggedText = !this.raggedText
    this.preferences.setRaggedText(this.raggedText)
    this.apply()
  }

  private apply(): void {
    if (!isPlatformBrowser(this.platformId)) return
    this.document.documentElement.classList.toggle(
      "ragged-text",
      this.raggedText,
    )
  }
}
