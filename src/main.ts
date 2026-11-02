import { LocationStrategy } from "@angular/common"
import { provideHttpClient } from "@angular/common/http"
import { isDevMode, provideZonelessChangeDetection } from "@angular/core"
import {
  bootstrapApplication,
  provideClientHydration,
  withNoHttpTransferCache,
} from "@angular/platform-browser"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { provideRouter } from "@angular/router"
import { provideServiceWorker } from "@angular/service-worker"

import { AppComponent } from "./app/app.component"
import { routes } from "./app/app.routes"
import { labelUmamiPlatform } from "./app/services/analytics.service"
import { DepthLocationStrategy } from "./app/services/depth-location-strategy"
import { isServiceWorkerEnabled } from "./app/utils/platform"

// Umami reads the hook at send time; its first page view waits for the page
// to finish loading, by which point this has run.
if (typeof window !== "undefined") window.umamiBeforeSend = labelUmamiPlatform
bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideClientHydration(withNoHttpTransferCache()),
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
