import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { PreferencesService } from "./preferences.service"
import { STUDY_MODE_MIN_WIDTH, StudyModeService } from "./study-mode.service"

function configure(
  width: number,
  stored: boolean,
  platformId: object | string = "browser",
): {
  service: StudyModeService
  preferences: jasmine.SpyObj<PreferencesService>
  /** Flips the viewport across the threshold, as the media query would. */
  setWide: (wide: boolean) => void
} {
  const preferences = jasmine.createSpyObj<PreferencesService>(
    "PreferencesService",
    ["getStudyMode", "setStudyMode"],
  )
  preferences.getStudyMode.and.returnValue(stored)

  TestBed.configureTestingModule({
    providers: [
      StudyModeService,
      { provide: PreferencesService, useValue: preferences },
      { provide: PLATFORM_ID, useValue: platformId },
    ],
  })

  // The service asks a media query, which reports the real runner window;
  // stand in for it so the test controls which side of the threshold we are
  // on, and can flip it the way a resized window would.
  const listeners: (() => void)[] = []
  const query = {
    matches: width >= STUDY_MODE_MIN_WIDTH,
    addEventListener: (_: string, handler: () => void) =>
      listeners.push(handler),
    removeEventListener: () => {},
  }
  spyOn(window, "matchMedia").and.returnValue(
    query as unknown as MediaQueryList,
  )

  const service = TestBed.inject(StudyModeService)
  const setWide = (wide: boolean) => {
    query.matches = wide
    for (const handler of listeners) handler()
  }
  return { service, preferences, setWide }
}

describe("StudyModeService", () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it("offers study mode at the minimum supported width", () => {
    const { service } = configure(STUDY_MODE_MIN_WIDTH, false)
    expect(service.isAvailable).toBeTrue()
  })

  it("does not offer it one pixel below that width", () => {
    const { service } = configure(STUDY_MODE_MIN_WIDTH - 1, false)
    expect(service.isAvailable).toBeFalse()
  })

  it("restores the stored preference on start", () => {
    const { service } = configure(1400, true)
    expect(service.isEnabled).toBeTrue()
    expect(service.isActive).toBeTrue()
  })

  it("stays inactive on a narrow window without forgetting the preference", () => {
    const { service } = configure(800, true)
    expect(service.isEnabled).toBeTrue()
    expect(service.isAvailable).toBeFalse()
    expect(service.isActive).toBeFalse()
  })

  it("persists the preference when it is toggled", () => {
    const { service, preferences } = configure(1400, false)
    service.toggle()
    expect(service.isEnabled).toBeTrue()
    expect(preferences.setStudyMode).toHaveBeenCalledWith(true)
  })

  it("does not write the preference again when it has not changed", () => {
    const { service, preferences } = configure(1400, true)
    service.setEnabled(true)
    expect(preferences.setStudyMode).not.toHaveBeenCalled()
  })

  it("emits over active$ only when both facts hold", () => {
    const { service } = configure(1400, false)
    const seen: boolean[] = []
    service.active$.subscribe((active) => seen.push(active))

    service.setEnabled(true)
    service.setEnabled(false)

    expect(seen).toEqual([false, true, false])
  })

  it("re-measures when the viewport crosses the threshold", () => {
    const { service, setWide } = configure(800, true)
    expect(service.isAvailable).toBeFalse()

    setWide(true)

    expect(service.isAvailable).toBeTrue()
    expect(service.isActive).toBeTrue()
  })

  it("gives study mode up again when the window narrows", () => {
    const { service, setWide } = configure(1400, true)
    expect(service.isActive).toBeTrue()

    setWide(false)

    expect(service.isActive).toBeFalse()
    // The preference outlives the window it could not be shown in.
    expect(service.isEnabled).toBeTrue()
  })

  it("stays unavailable while server-rendering, with no window to measure", () => {
    const { service, preferences } = configure(1400, true, "server")
    expect(service.isAvailable).toBeFalse()
    expect(service.isEnabled).toBeFalse()
    expect(preferences.getStudyMode).not.toHaveBeenCalled()
  })
})
