import { LocationStrategy } from "@angular/common"
import { provideHttpClient } from "@angular/common/http"
import { isDevMode, provideZonelessChangeDetection } from "@angular/core"
import { bootstrapApplication } from "@angular/platform-browser"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { provideRouter } from "@angular/router"
import { provideServiceWorker } from "@angular/service-worker"

import { AppComponent } from "./app/app.component"
import { routes } from "./app/app.routes"
import { provideHydration } from "./app/config"
import { loadTracker } from "./app/services/analytics.service"
import { DepthLocationStrategy } from "./app/services/depth-location-strategy"
import { isServiceWorkerEnabled } from "./app/utils/platform"

if (typeof window !== "undefined") loadTracker()
bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideHydration(),
    provideRouter(routes),
    { provide: LocationStrategy, useClass: DepthLocationStrategy },
    provideServiceWorker("ngsw-worker.js", {
      enabled: isServiceWorkerEnabled(isDevMode()),
      registrationStrategy: "registerWhenStable:30000",
    }),
    provideHttpClient(),
    provideAnimationsAsync(),
  ],
}).catch((err) => console.error(err))
