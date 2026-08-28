import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, Injectable, inject, PLATFORM_ID } from "@angular/core"
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
} from "rxjs"
import { PreferencesService } from "./preferences.service"

/**
 * Narrowest viewport the three-column study layout is offered at. Below it the
 * two side columns would leave the text a gutter to read in, so the toggle is
 * not offered at all rather than offered and disappointing.
 */
export const STUDY_MODE_MIN_WIDTH = 1024

/**
 * Study mode is two independent facts: the reader asked for it (a preference,
 * remembered), and the window is wide enough to show it (measured). Only both
 * together make it active, so shrinking a window falls back to the one-column
 * reader without forgetting that the reader wants study mode back at full size.
 */
@Injectable({ providedIn: "root" })
export class StudyModeService {
  private readonly platformId = inject(PLATFORM_ID)
  private readonly preferences = inject(PreferencesService)
  private readonly destroyRef = inject(DestroyRef)

  private readonly availableSubject = new BehaviorSubject(false)
  private readonly enabledSubject = new BehaviorSubject(false)

  readonly available$: Observable<boolean> = this.availableSubject.pipe(
    distinctUntilChanged(),
  )
  readonly enabled$: Observable<boolean> = this.enabledSubject.pipe(
    distinctUntilChanged(),
  )
  readonly active$: Observable<boolean> = combineLatest([
    this.availableSubject,
    this.enabledSubject,
  ]).pipe(
    map(([available, enabled]) => available && enabled),
    distinctUntilChanged(),
  )

  constructor() {
    // Server-rendered HTML has no viewport to measure and no stored
    // preference to read, so it always ships the one-column reader; the
    // browser re-evaluates both on bootstrap.
    if (!isPlatformBrowser(this.platformId)) return

    this.enabledSubject.next(this.preferences.getStudyMode())

    // A media query rather than a resize listener: this only has to fire when
    // the threshold is crossed, not on every pixel of a window drag.
    this.widthQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia(`(min-width: ${STUDY_MODE_MIN_WIDTH}px)`)
        : undefined
    this.refreshAvailability()

    const onChange = () => this.refreshAvailability()
    if (this.widthQuery) {
      this.widthQuery.addEventListener("change", onChange)
      this.destroyRef.onDestroy(() => {
        this.widthQuery?.removeEventListener("change", onChange)
      })
      return
    }

    // Without matchMedia the resize event is the only way to hear that the
    // threshold has been crossed. Noisier, but the alternative is a reader
    // whose window is wide enough being told study mode is unavailable until
    // they reload.
    window.addEventListener("resize", onChange)
    this.destroyRef.onDestroy(() => {
      window.removeEventListener("resize", onChange)
    })
  }

  private widthQuery?: MediaQueryList

  get isAvailable(): boolean {
    return this.availableSubject.value
  }

  get isEnabled(): boolean {
    return this.enabledSubject.value
  }

  get isActive(): boolean {
    return this.isAvailable && this.isEnabled
  }

  /** Re-measures the window. Called when the query flips, and by tests. */
  refreshAvailability(): void {
    if (!isPlatformBrowser(this.platformId)) return
    this.availableSubject.next(
      // matchMedia is absent in some test and embedded environments; the
      // width is the same answer, just re-read on demand.
      this.widthQuery?.matches ?? window.innerWidth >= STUDY_MODE_MIN_WIDTH,
    )
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabledSubject.value) return
    this.enabledSubject.next(enabled)
    this.preferences.setStudyMode(enabled)
  }

  toggle(): void {
    this.setEnabled(!this.isEnabled)
  }
}
