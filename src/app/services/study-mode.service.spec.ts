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
  width: jasmine.Spy
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

  // The service measures the real window, which the test runner cannot
  // resize; report the width under test instead.
  const widthSpy = spyOnProperty(window, "innerWidth", "get").and.returnValue(
    width,
  )
  return {
    service: TestBed.inject(StudyModeService),
    preferences,
    width: widthSpy,
  }
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

  it("re-measures the window on resize", () => {
    const { service, width } = configure(800, true)
    expect(service.isAvailable).toBeFalse()

    // Widen the window the service sees, then let its own resize listener
    // pick the change up.
    width.and.returnValue(1400)
    window.dispatchEvent(new Event("resize"))

    expect(service.isAvailable).toBeTrue()
    expect(service.isActive).toBeTrue()
  })

  it("stays unavailable while server-rendering, with no window to measure", () => {
    const { service, preferences } = configure(1400, true, "server")
    expect(service.isAvailable).toBeFalse()
    expect(service.isEnabled).toBeFalse()
    expect(preferences.getStudyMode).not.toHaveBeenCalled()
  })
})
