import { provideHttpClient } from "@angular/common/http"
import {
  APP_INITIALIZER,
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideZoneChangeDetection,
} from "@angular/core"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { provideRouter } from "@angular/router"
import { provideServiceWorker } from "@angular/service-worker"
import { routes } from "./app.routes"
import { BookService } from "./services/book.service"

export function initializeBookService(
  bookService: BookService,
): () => Promise<void> {
  return () => bookService.initializeBooks()
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
    provideAppInitializer(() => {
      const bookService = inject(BookService)
      return bookService.initializeBooks()
    }),
  ],
}
