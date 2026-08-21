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
  // window/document are absent while server-rendering; the server output
  // stays on the default (light) theme and the browser applies the real one.
  private nightModeQuery =
    typeof window === "undefined"
      ? null
      : window.matchMedia("(prefers-color-scheme: dark)")

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
    if (!this.nightModeQuery) {
      // Server rendering: nothing to watch.
    } else if (this.nightModeQuery.addEventListener) {
      this.nightModeQuery.addEventListener("change", handler)
    } else {
      this.nightModeQuery.addListener(handler)
    }
  }

  themeMode$ = this.themeMode.asObservable()

  get currentMode(): ThemeMode {
    return this.themeMode.value
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
    if (typeof document === "undefined") return
    let isDark = false
    if (mode === "system") {
      isDark = this.nightModeQuery?.matches ?? false
    } else {
      isDark = mode === "dark"
    }
    document.documentElement.classList.toggle("dark-theme", isDark)
  }
}
