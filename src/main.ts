/// <reference types="@angular/localize" />

import { provideHttpClient } from "@angular/common/http"
import { provideZoneChangeDetection } from "@angular/core"
import { isDevMode } from "@angular/core"
import { bootstrapApplication } from "@angular/platform-browser"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { provideRouter } from "@angular/router"
import { provideServiceWorker } from "@angular/service-worker"

import { AppComponent } from "./app/app.component"
import { routes } from "./app/app.routes"

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
