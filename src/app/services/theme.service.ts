import { Injectable } from "@angular/core"
import { BehaviorSubject } from "rxjs"
import { AnalyticsService } from "./analytics.service"
import { PreferencesService } from "./preferences.service"

export type ThemeMode = "light" | "dark" | "system"

@Injectable({
  providedIn: "root",
})
export class ThemeService {
  private themeMode = new BehaviorSubject<ThemeMode>("system")
  private nightModeQuery = window.matchMedia("(prefers-color-scheme: dark)")

  constructor(
    private preferencesService: PreferencesService,
    private analyticsService: AnalyticsService,
  ) {
    // Check localStorage for saved theme preference
    const savedTheme = this.preferencesService.getTheme()

    if (savedTheme) {
      this.themeMode.next(savedTheme)
    } else {
      this.themeMode.next("system")
    }

    this.applyTheme(this.themeMode.value)

    // Watch for system theme changes
    const handler = () => {
      if (this.themeMode.value === "system") {
        this.applyTheme("system")
      }
    }
    if (this.nightModeQuery.addEventListener) {
      this.nightModeQuery.addEventListener("change", handler)
    } else {
      this.nightModeQuery.addListener(handler)
    }
  }

  themeMode$ = this.themeMode.asObservable()

  get currentMode(): ThemeMode {
    return this.themeMode.value
  }

  /** Material icon name for the current theme mode. */
  getIcon(): string {
    if (this.currentMode === "system") return "brightness_auto"
    return this.currentMode === "light" ? "light_mode" : "dark_mode"
  }

  /** Human-readable tooltip label for the current theme mode (PT). */
  getTooltip(): string {
    if (this.currentMode === "system") return "Tema do Sistema"
    return this.currentMode === "light" ? "Modo Claro" : "Modo Escuro"
  }

  toggleTheme(): void {
    const modes: ThemeMode[] = ["light", "dark", "system"]
    const currentIndex = modes.indexOf(this.themeMode.value)
    const nextMode = modes[(currentIndex + 1) % modes.length]

    this.themeMode.next(nextMode)
    this.applyTheme(nextMode)
    this.preferencesService.setTheme(nextMode)

    void this.analyticsService.track(`theme-${nextMode}`)
  }

  private applyTheme(mode: ThemeMode): void {
    let isDark = false
    if (mode === "system") {
      isDark = this.nightModeQuery.matches
    } else {
      isDark = mode === "dark"
    }
    document.documentElement.classList.toggle("dark-theme", isDark)
  }
}
