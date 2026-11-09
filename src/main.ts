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
import { prepareUmamiPayload } from "./app/services/analytics.service"
import { DepthLocationStrategy } from "./app/services/depth-location-strategy"
import { isServiceWorkerEnabled } from "./app/utils/platform"

// Not a tag in index.html: the bundle would wait behind a deferred one, for
// minutes if the server never replies, and an async one can send its first
// page view before this hook exists.
if (typeof window !== "undefined") {
  window.umamiBeforeSend = prepareUmamiPayload
  const tracker = document.createElement("script")
  tracker.src = "https://umami.dojo.pt/script.js"
  tracker.dataset["websiteId"] = "5f2a57be-86a2-4608-8fc5-667a9c24689c"
  tracker.dataset["beforeSend"] = "umamiBeforeSend"
  document.head.append(tracker)
}
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
