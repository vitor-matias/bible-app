import { CommonModule } from "@angular/common"
import { provideHttpClient } from "@angular/common/http"
import {
  Injectable,
  NgModule,
  isDevMode,
  provideZoneChangeDetection,
} from "@angular/core"
import { InjectSetupWrapper } from "@angular/core/testing"
import { MatBottomSheetModule } from "@angular/material/bottom-sheet"
import { MatSidenavModule } from "@angular/material/sidenav"
import {
  BrowserModule,
  HAMMER_GESTURE_CONFIG,
  HammerGestureConfig,
  HammerModule,
} from "@angular/platform-browser"
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async"
import { RouterOutlet, provideRouter } from "@angular/router"
import { provideServiceWorker } from "@angular/service-worker"
import { NgbPaginationModule } from "@ng-bootstrap/ng-bootstrap"
import { AppComponent } from "./app.component"
import { AppRoutingModule, routes } from "./app.routes"
import { AboutComponent } from "./components/about/about.component"
import { BookSelectorComponent } from "./components/book-selector/book-selector.component"
import { HeaderComponent } from "./components/header/header.component"
import { ChapterPagination } from "./components/pagination/chapter-pagination"
import { VerseComponent } from "./components/verse/verse.component"
import { PinchToZoomDirective } from "./directives/pinch-to-zoom.directive"
import { ChapterSelectorComponent } from "./components/chapter-selector/chapter-selector.component"
import { MatIconModule } from "@angular/material/icon"
import { MatButtonModule } from "@angular/material/button"

export class MyHammerConfig extends HammerGestureConfig {
  override overrides = {
    swipe: {
      enable: this.isTouchDevice(),
      direction: Hammer.DIRECTION_HORIZONTAL,
    },
    pinch: { enable: false },
    rotate: { enable: false },
  }

  private isTouchDevice(): boolean {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0
  }
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    RouterOutlet,
    CommonModule,
    VerseComponent,
    HeaderComponent,
    BookSelectorComponent,
    MatSidenavModule,
    NgbPaginationModule,
    MatBottomSheetModule,
    ChapterPagination,
    HammerModule,
    PinchToZoomDirective,
    AboutComponent,
    AppRoutingModule,
    ChapterSelectorComponent,
    MatIconModule,
    MatButtonModule,
  ],
  exports: [],
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000",
    }),
    provideHttpClient(),
    provideAnimationsAsync(),
    {
      provide: HAMMER_GESTURE_CONFIG,
      useClass: MyHammerConfig,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
