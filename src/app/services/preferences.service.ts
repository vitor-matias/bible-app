import { Injectable } from "@angular/core"
import { safeLocalStorage } from "../utils/web-storage"

@Injectable({
  providedIn: "root",
})
export class PreferencesService {
  private storageRef: Storage | null = null

  /** localStorage is absent or non-functional while server-rendering; degrade to defaults. */
  private get storage(): Storage | null {
    // The probe behind safeLocalStorage() costs a real write, and every
    // preference read and write goes through here — resolve it once. A failed
    // probe is deliberately not cached, so storage that only becomes usable
    // later (quota freed, permission granted) is still picked up.
    if (!this.storageRef) {
      this.storageRef = safeLocalStorage()
    }
    return this.storageRef
  }

  /**
   * Storage can still fail after the probe (full, or access revoked): a read
   * then gives undefined, as unusable storage does, and a write is not kept.
   */
  private read(key: string): string | null | undefined {
    try {
      return this.storage?.getItem(key)
    } catch {
      return undefined
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value)
    } catch {
      // Not kept; the preference applies until the app closes.
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(key)
    } catch {
      // Not removed; the stored value is read again next launch.
    }
  }

  private readonly KEYS = {
    AUTO_SCROLL_SPEED: "autoScrollLinesPerSecond",
    AUTO_SCROLL_CONTROLS: "autoScrollControlsVisible",
    BOOK_ID: "book",
    CHAPTER_NUMBER: "chapter",
    THEME: "theme",
    FONT_SIZE_PREFIX: "fontSize",
    VIEW_MODE: "viewMode",
    CARDS_VIEW: "cardsView",
    ONBOARDING_SEEN: "onboardingSeen",
    NATIVE_BARS_ONBOARDING_SEEN: "nativeBarsOnboardingSeen",
  }

  getTheme(): "light" | "dark" | "system" | null {
    const stored = this.read(this.KEYS.THEME)
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : null
  }

  setTheme(theme: "light" | "dark" | "system"): void {
    this.write(this.KEYS.THEME, theme)
  }

  getFontSize(context: string = "default"): number | null {
    const key = `${this.KEYS.FONT_SIZE_PREFIX}${context}`
    const stored = this.read(key)
    const parsed = stored ? Number(stored) : null
    return Number.isFinite(parsed) ? parsed : null
  }

  setFontSize(size: number, context: string = "default"): void {
    const key = `${this.KEYS.FONT_SIZE_PREFIX}${context}`
    this.write(key, size.toString())
  }

  /** Forgets the chosen size: the text opens at the standard (or system) size again. */
  clearFontSize(context: string = "default"): void {
    this.remove(`${this.KEYS.FONT_SIZE_PREFIX}${context}`)
  }

  getAutoScrollSpeed(): number | null {
    const stored = this.read(this.KEYS.AUTO_SCROLL_SPEED)
    const parsed = stored ? Number.parseFloat(stored) : null
    return Number.isFinite(parsed) && parsed !== null && parsed > 0
      ? parsed
      : null
  }

  setAutoScrollSpeed(speed: number): void {
    this.write(this.KEYS.AUTO_SCROLL_SPEED, speed.toString())
  }

  getAutoScrollControlsVisible(): boolean {
    const stored = this.read(this.KEYS.AUTO_SCROLL_CONTROLS)
    return stored === "true"
  }

  setAutoScrollControlsVisible(visible: boolean): void {
    this.write(this.KEYS.AUTO_SCROLL_CONTROLS, visible.toString())
  }

  getLastBookId(): string | null {
    return this.read(this.KEYS.BOOK_ID) ?? null
  }

  setLastBookId(bookId: string): void {
    this.write(this.KEYS.BOOK_ID, bookId)
  }

  getLastChapterNumber(): number | null {
    const stored = this.read(this.KEYS.CHAPTER_NUMBER)
    const parsed = stored ? Number.parseInt(stored, 10) : null
    return Number.isFinite(parsed) ? parsed : null
  }

  setLastChapterNumber(chapter: number): void {
    this.write(this.KEYS.CHAPTER_NUMBER, chapter.toString())
  }

  getViewMode(): "scrolling" | "paged" {
    const stored = this.read(this.KEYS.VIEW_MODE)
    return stored === "paged" ? "paged" : "scrolling"
  }

  setViewMode(mode: "scrolling" | "paged"): void {
    this.write(this.KEYS.VIEW_MODE, mode)
  }

  /** BibleScroll, the experimental one-verse-per-card view, layered over the view mode. */
  getCardsView(): boolean {
    return this.storage?.getItem(this.KEYS.CARDS_VIEW) === "true"
  }

  setCardsView(enabled: boolean): void {
    this.storage?.setItem(this.KEYS.CARDS_VIEW, enabled.toString())
  }

  /**
   * Without usable storage "seen" can never be recorded, so report it as seen:
   * missing the wizard once beats having it reopen on every launch.
   */
  getOnboardingSeen(): boolean {
    const stored = this.read(this.KEYS.ONBOARDING_SEEN)
    return stored === undefined || stored === "true"
  }

  setOnboardingSeen(seen: boolean): void {
    this.write(this.KEYS.ONBOARDING_SEEN, seen.toString())
  }

  /**
   * Whether the onboarding was seen with the Android app's native bars,
   * which replaced its web header. As getOnboardingSeen, seen when storage
   * is unusable.
   */
  getNativeBarsOnboardingSeen(): boolean {
    const stored = this.read(this.KEYS.NATIVE_BARS_ONBOARDING_SEEN)
    return stored === undefined || stored === "true"
  }

  setNativeBarsOnboardingSeen(seen: boolean): void {
    this.write(this.KEYS.NATIVE_BARS_ONBOARDING_SEEN, seen.toString())
  }
}
