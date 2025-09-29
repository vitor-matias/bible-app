import { Injectable } from "@angular/core"
import { BehaviorSubject } from "rxjs"

@Injectable({
  providedIn: "root",
})
export class ThemeService {
  private isDarkTheme = new BehaviorSubject<boolean>(false)

  constructor() {
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem("theme")
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches

    if (savedTheme) {
      this.isDarkTheme.next(savedTheme === "dark")
    } else {
      this.isDarkTheme.next(prefersDark)
    }

    this.applyTheme(this.isDarkTheme.value)
  }

  isDarkTheme$ = this.isDarkTheme.asObservable()

  toggleTheme(): void {
    const newTheme = !this.isDarkTheme.value
    this.isDarkTheme.next(newTheme)
    this.applyTheme(newTheme)
    localStorage.setItem("theme", newTheme ? "dark" : "light")
    // @ts-ignore
    window.umami.trackEvent("THEME CHANGE", newTheme ? "dark" : "light")
  }

  private applyTheme(isDark: boolean): void {
    document.body.classList.toggle("dark-theme", isDark)
  }
}
