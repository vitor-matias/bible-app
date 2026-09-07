import { provideHttpClient } from "@angular/common/http"
import {
  APP_INITIALIZER,
  type ApplicationConfig,
  provideZoneChangeDetection,
} from "@angular/core"
import { MAT_ICON_DEFAULT_OPTIONS } from "@angular/material/icon"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { provideRouter } from "@angular/router"
import { provideServiceWorker } from "@angular/service-worker"
import { routes } from "./app.routes"
import { BookService } from "./services/book.service"
import { isBrowser } from "./utils/platform"

export function initializeBookService(
  bookService: BookService,
): () => Promise<void> {
  return () =>
    bookService.initializeBooks().catch((error: unknown) => {
      // While server-rendering (prerender/route extraction), an unreachable
      // API must not fail the whole build — affected pages just fall back to
      // client-side rendering. In the browser, keep failing loudly.
      if (!isBrowser()) {
        console.warn(
          "Book list unavailable during server rendering; continuing without it.",
          error instanceof Error ? error.message : error,
        )
        return
      }
      throw error
    })
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker("ngsw-worker.js", {
      enabled: true,
      registrationStrategy: "registerWhenStable:30000",
    }),
    provideHttpClient(),
    provideAnimationsAsync(),
    {
      provide: MAT_ICON_DEFAULT_OPTIONS,
      useValue: { fontSet: "material-symbols-outlined" },
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeBookService,
      deps: [BookService],
      multi: true,
    },
  ],
}
