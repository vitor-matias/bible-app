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

const app = bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideHydration(),
    provideRouter(routes),
    { provide: LocationStrategy, useClass: DepthLocationStrategy },
    // Angular's worker behind a wrapper that keeps it off other origins' and
    // audio requests: see public/app-worker.js.
    provideServiceWorker("app-worker.js", {
      // The wrapper imports ngsw-worker.js: check both for updates, uncached.
      updateViaCache: "none",
      enabled: isServiceWorkerEnabled(isDevMode()),
      registrationStrategy: "registerWhenStable:30000",
    }),
    provideHttpClient(),
    provideAnimationsAsync(),
  ],
})
// Before the app's first events, which wait for it. The script itself goes in
// once the first page is drawn and titled.
if (typeof window !== "undefined") {
  loadTracker(app.then((appRef) => appRef.whenStable()))
}
app.catch((err) => console.error(err))
