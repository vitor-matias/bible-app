import { Injectable } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class PreferencesService {
  private readonly KEYS = {
    AUTO_SCROLL_SPEED: "autoScrollLinesPerSecond",
    AUTO_SCROLL_CONTROLS: "autoScrollControlsVisible",
    BOOK_ID: "book",
    CHAPTER_NUMBER: "chapter",
    THEME: "theme",
    FONT_SIZE_PREFIX: "fontSize",
  }

  getTheme(): "light" | "dark" | null {
    const stored = localStorage.getItem(this.KEYS.THEME)
    return stored === "light" || stored === "dark" ? stored : null
  }

  setTheme(theme: "light" | "dark"): void {
    localStorage.setItem(this.KEYS.THEME, theme)
  }

  getFontSize(context: string = "default"): number | null {
    const key = `${this.KEYS.FONT_SIZE_PREFIX}${context}`
    const stored = localStorage.getItem(key)
    const parsed = stored ? Number(stored) : null
    return Number.isFinite(parsed) ? parsed : null
  }

  setFontSize(size: number, context: string = "default"): void {
    const key = `${this.KEYS.FONT_SIZE_PREFIX}${context}`
    localStorage.setItem(key, size.toString())
  }

  getAutoScrollSpeed(): number | null {
    const stored = localStorage.getItem(this.KEYS.AUTO_SCROLL_SPEED)
    const parsed = stored ? Number.parseFloat(stored) : null
    return Number.isFinite(parsed) && parsed !== null && parsed > 0
      ? parsed
      : null
  }

  setAutoScrollSpeed(speed: number): void {
    localStorage.setItem(this.KEYS.AUTO_SCROLL_SPEED, speed.toString())
  }

  getAutoScrollControlsVisible(): boolean {
    const stored = localStorage.getItem(this.KEYS.AUTO_SCROLL_CONTROLS)
    return stored === "true"
  }

  setAutoScrollControlsVisible(visible: boolean): void {
    localStorage.setItem(this.KEYS.AUTO_SCROLL_CONTROLS, visible.toString())
  }

  getLastBookId(): string | null {
    return localStorage.getItem(this.KEYS.BOOK_ID)
  }

  setLastBookId(bookId: string): void {
    localStorage.setItem(this.KEYS.BOOK_ID, bookId)
  }

  getLastChapterNumber(): number | null {
    const stored = localStorage.getItem(this.KEYS.CHAPTER_NUMBER)
    const parsed = stored ? Number.parseInt(stored, 10) : null
    return Number.isFinite(parsed) ? parsed : null
  }

  setLastChapterNumber(chapter: number): void {
    localStorage.setItem(this.KEYS.CHAPTER_NUMBER, chapter.toString())
  }
}
