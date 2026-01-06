/// <reference types="@angular/localize" />

import { provideHttpClient } from "@angular/common/http"
import { isDevMode, provideZoneChangeDetection } from "@angular/core"
import { bootstrapApplication } from "@angular/platform-browser"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { provideRouter } from "@angular/router"
import { provideServiceWorker } from "@angular/service-worker"

import { AppComponent } from "./app/app.component"
import { routes } from "./app/app.routes"

export function initializeTheme(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return
  }

  const savedTheme =
    typeof localStorage !== "undefined" ? localStorage.getItem("theme") : null
  const prefersDark =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  const isDark = savedTheme ? savedTheme === "dark" : prefersDark
  document.documentElement.classList.toggle("dark-theme", isDark)
}

initializeTheme()
bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000",
    }),
    provideHttpClient(),
    provideAnimationsAsync(),
  ],
}).catch((err) => console.error(err))
