import { DOCUMENT, isPlatformBrowser } from "@angular/common"
import { Injectable, inject, PLATFORM_ID } from "@angular/core"
import { PreferencesService } from "./preferences.service"

/**
 * The reader's text: ragged-right on a phone or at the largest text sizes,
 * justified otherwise, until the reader chooses, then as chosen. The choice is a class on <html>
 * (`ragged-text` or `justified-text`, styles.css).
 */
@Injectable({
  providedIn: "root",
})
export class TextAlignService {
  private readonly document = inject(DOCUMENT)
  private readonly platformId = inject(PLATFORM_ID)
  private readonly preferences = inject(PreferencesService)
  private choice = this.preferences.getRaggedText()
  // The reader's phone default, bible-reader.component.css: ragged-right.
  private readonly phone = isPlatformBrowser(this.platformId)
    ? this.document.defaultView?.matchMedia("(max-width: 480px)")
    : undefined

  constructor() {
    this.apply()
  }

  /** How the text is set now: the reader's choice, else the screen's or the
   *  text size's default (`large-text`, UnifiedGesturesDirective). */
  get ragged(): boolean {
    return (
      this.choice ??
      (this.phone?.matches ||
        this.document.querySelector(".text-container.large-text") !== null)
    )
  }

  /** Whether the text is hyphenated: always, unless the reader chose
   *  ragged-right (`html.ragged-text`, styles.css); the defaults' ragged
   *  text still hyphenates. */
  get hyphenated(): boolean {
    return this.choice !== true
  }

  toggle(): void {
    this.choice = !this.ragged
    this.preferences.setRaggedText(this.choice)
    this.apply()
  }

  private apply(): void {
    if (!isPlatformBrowser(this.platformId)) return
    const classes = this.document.documentElement.classList
    classes.toggle("ragged-text", this.choice === true)
    classes.toggle("justified-text", this.choice === false)
  }
}
