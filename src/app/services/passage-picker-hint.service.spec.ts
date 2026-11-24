import { TestBed } from "@angular/core/testing"
import { OnboardingService } from "./onboarding.service"
import { PassagePickerHintService } from "./passage-picker-hint.service"

describe("PassagePickerHintService", () => {
  let service: PassagePickerHintService
  let onboarding: { isOpen: boolean }

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem("passagePickerUsed", "false")
    onboarding = { isOpen: false }
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [{ provide: OnboardingService, useValue: onboarding }],
    })
    service = TestBed.inject(PassagePickerHintService)
  })

  afterEach(() => localStorage.clear())

  it("plays for a reader who has not opened the picker, every time, until they do", () => {
    for (let i = 0; i < 10; i++) expect(service.claim()).toBe("play")
    service.markUsed()
    expect(service.claim()).toBe("done")
  })

  it("never plays once the picker has been opened", () => {
    service.markUsed()
    expect(service.claim()).toBe("done")
  })

  it("waits while the wizard is up, and plays once it has closed", () => {
    onboarding.isOpen = true
    expect(service.claim()).toBe("wait")
    onboarding.isOpen = false
    expect(service.claim()).toBe("play")
  })

  it("does not play where it can't be remembered", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [{ provide: OnboardingService, useValue: onboarding }],
    })
    expect(TestBed.inject(PassagePickerHintService).claim()).toBe("done")
    vi.restoreAllMocks()
  })
})
