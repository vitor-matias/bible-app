import { Injectable } from "@angular/core"
import { safeLocalStorage } from "../utils/web-storage"

@Injectable({
  providedIn: "root",
})
export class PreferencesService {
  /** localStorage is absent or non-functional while server-rendering; degrade to defaults. */
  private get storage(): Storage | null {
    return safeLocalStorage()
  }

  private readonly KEYS = {
    AUTO_SCROLL_SPEED: "autoScrollLinesPerSecond",
    AUTO_SCROLL_CONTROLS: "autoScrollControlsVisible",
    BOOK_ID: "book",
    CHAPTER_NUMBER: "chapter",
    THEME: "theme",
    FONT_SIZE_PREFIX: "fontSize",
    VIEW_MODE: "viewMode",
  }

  getTheme(): "light" | "dark" | "system" | null {
    const stored = this.storage?.getItem(this.KEYS.THEME)
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : null
  }

  setTheme(theme: "light" | "dark" | "system"): void {
    this.storage?.setItem(this.KEYS.THEME, theme)
  }

  getFontSize(context: string = "default"): number | null {
    const key = `${this.KEYS.FONT_SIZE_PREFIX}${context}`
    const stored = this.storage?.getItem(key)
    const parsed = stored ? Number(stored) : null
    return Number.isFinite(parsed) ? parsed : null
  }

  setFontSize(size: number, context: string = "default"): void {
    const key = `${this.KEYS.FONT_SIZE_PREFIX}${context}`
    this.storage?.setItem(key, size.toString())
  }

  getAutoScrollSpeed(): number | null {
    const stored = this.storage?.getItem(this.KEYS.AUTO_SCROLL_SPEED)
    const parsed = stored ? Number.parseFloat(stored) : null
    return Number.isFinite(parsed) && parsed !== null && parsed > 0
      ? parsed
      : null
  }

  setAutoScrollSpeed(speed: number): void {
    this.storage?.setItem(this.KEYS.AUTO_SCROLL_SPEED, speed.toString())
  }

  getAutoScrollControlsVisible(): boolean {
    const stored = this.storage?.getItem(this.KEYS.AUTO_SCROLL_CONTROLS)
    return stored === "true"
  }

  setAutoScrollControlsVisible(visible: boolean): void {
    this.storage?.setItem(this.KEYS.AUTO_SCROLL_CONTROLS, visible.toString())
  }

  getLastBookId(): string | null {
    return this.storage?.getItem(this.KEYS.BOOK_ID) ?? null
  }

  setLastBookId(bookId: string): void {
    this.storage?.setItem(this.KEYS.BOOK_ID, bookId)
  }

  getLastChapterNumber(): number | null {
    const stored = this.storage?.getItem(this.KEYS.CHAPTER_NUMBER)
    const parsed = stored ? Number.parseInt(stored, 10) : null
    return Number.isFinite(parsed) ? parsed : null
  }

  setLastChapterNumber(chapter: number): void {
    this.storage?.setItem(this.KEYS.CHAPTER_NUMBER, chapter.toString())
  }

  getViewMode(): "scrolling" | "paged" {
    const stored = this.storage?.getItem(this.KEYS.VIEW_MODE)
    return stored === "paged" ? "paged" : "scrolling"
  }

  setViewMode(mode: "scrolling" | "paged"): void {
    this.storage?.setItem(this.KEYS.VIEW_MODE, mode)
  }
}
