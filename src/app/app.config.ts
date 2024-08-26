import {
	type ApplicationConfig,
	isDevMode,
	provideZoneChangeDetection,
} from "@angular/core"
import { provideRouter } from "@angular/router"

import { provideHttpClient } from "@angular/common/http"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { provideServiceWorker } from "@angular/service-worker"
import { routes } from "./app.routes"

export const appConfig: ApplicationConfig = {
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
}
