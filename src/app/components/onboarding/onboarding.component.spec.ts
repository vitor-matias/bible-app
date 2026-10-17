import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatDialogRef } from "@angular/material/dialog"
import { BehaviorSubject } from "rxjs"
import type { StoreApps } from "../../config"
import { AnalyticsService } from "../../services/analytics.service"
import { PreferencesService } from "../../services/preferences.service"
import {
  type InstallBrowser,
  type InstallPlatform,
  type InstallPromptOutcome,
  PwaInstallService,
} from "../../services/pwa-install.service"
import { STORE_APPS } from "../../tokens"
import { OnboardingComponent } from "./onboarding.component"
import {
  getInstallGuide,
  INSTALL_STEP_ID,
  ONBOARDING_STEPS,
} from "./onboarding-content"

class FakePwaInstallService {
  isInstalled = false
  canPromptInstall = false
  readonly canPromptInstall$ = new BehaviorSubject<boolean>(false)
  platform: InstallPlatform = "android"
  browser: InstallBrowser = "chrome"
  detectPlatform = jasmine
    .createSpy("detectPlatform")
    .and.callFake(() => this.platform)
  detectBrowser = jasmine
    .createSpy("detectBrowser")
    .and.callFake(() => this.browser)
  promptInstall = jasmine
    .createSpy("promptInstall")
    .and.resolveTo("accepted" as InstallPromptOutcome)
}

describe("OnboardingComponent", () => {
  let fixture: ComponentFixture<OnboardingComponent>
  let component: OnboardingComponent
  let element: HTMLElement
  let pwa: FakePwaInstallService
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<OnboardingComponent>>
  let analyticsSpy: jasmine.SpyObj<AnalyticsService>
  /** No store listings unless a test fills them in, whatever config.ts says. */
  let apps: StoreApps

  beforeEach(async () => {
    localStorage.removeItem("appPromoSeen")
    apps = { appStoreId: "", playPackage: "" }
    pwa = new FakePwaInstallService()
    dialogRefSpy = jasmine.createSpyObj("MatDialogRef", ["close"])
    analyticsSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.and.resolveTo()

    await TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: PwaInstallService, useValue: pwa },
        { provide: AnalyticsService, useValue: analyticsSpy },
        { provide: STORE_APPS, useValue: apps },
      ],
    }).compileComponents()
  })

  afterEach(() => localStorage.removeItem("appPromoSeen"))

  function create(): void {
    fixture = TestBed.createComponent(OnboardingComponent)
    component = fixture.componentInstance
    element = fixture.nativeElement
    fixture.detectChanges()
  }

  function title(): string {
    return element.querySelector(".title")?.textContent?.trim() ?? ""
  }

  function textOf(selector: string): string {
    return element.querySelector(selector)?.textContent ?? ""
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes(label),
    )
  }

  function platformButton(label: string): HTMLButtonElement {
    const found = Array.from(
      element.querySelectorAll<HTMLButtonElement>(".platforms button"),
    ).find((candidate) => candidate.textContent?.includes(label))
    if (!found) throw new Error(`No platform button labelled ${label}`)
    return found
  }

  function goToInstallStep(): void {
    component.goTo(component.steps.length - 1)
    fixture.detectChanges()
  }

  it("shows the app logo on the welcome step and an icon afterwards", () => {
    create()

    const logo = element.querySelector<HTMLImageElement>(".hero-logo")
    expect(logo?.getAttribute("src")).toBe("icons/512X512_REDONDO.png")
    expect(element.querySelector(".hero-icon")).toBeNull()

    component.next()

    expect(element.querySelector(".hero-logo")).toBeNull()
    expect(textOf(".hero-icon")).toContain("explore")
  })

  it("starts on the welcome step with one dot per step", () => {
    create()

    expect(title()).toContain("Bem-vindo")
    expect(element.querySelector(".step-count")).toBeNull()
    expect(element.querySelectorAll(".dot").length).toBe(
      ONBOARDING_STEPS.length,
    )
    expect(button("Saltar")).toBeDefined()
    expect(button("Seguinte")).toBeDefined()
    expect(button("Anterior")).toBeUndefined()
  })

  it("moves forwards and backwards through the steps", () => {
    create()

    button("Seguinte")?.click()
    fixture.detectChanges()
    expect(title()).toBe("Navegar na Bíblia")
    expect(button("Saltar")).toBeUndefined()

    button("Anterior")?.click()
    fixture.detectChanges()
    expect(title()).toContain("Bem-vindo")

    component.back()
    expect(component.index).toBe(0)
  })

  it("repaints when a step dot is clicked, without an external change detection pass", () => {
    create()
    const dots = element.querySelectorAll<HTMLButtonElement>(".dot")

    dots[2].click()

    expect(title()).toBe("Ler à sua maneira")
    expect(dots[2].classList).toContain("active")
    expect(dots[2].getAttribute("aria-current")).toBe("step")
  })

  describe("keyboard navigation", () => {
    const windowListener = jasmine.createSpy("windowKeydown")

    beforeEach(() => {
      windowListener.calls.reset()
      window.addEventListener("keydown", windowListener)
    })

    afterEach(() => {
      window.removeEventListener("keydown", windowListener)
    })

    function press(target: EventTarget, key: string): KeyboardEvent {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      })
      target.dispatchEvent(event)
      fixture.detectChanges()
      return event
    }

    it("turns steps with the arrow keys even when focus sits on the dialog container", () => {
      create()

      // The dialog focuses its container, an ancestor of the component.
      press(document.body, "ArrowRight")
      expect(component.index).toBe(1)

      press(document.body, "ArrowLeft")
      expect(component.index).toBe(0)
    })

    it("keeps the arrow keys from reaching the reader behind the dialog", () => {
      create()

      const event = press(element, "ArrowRight")

      expect(event.defaultPrevented).toBeTrue()
      expect(windowListener).not.toHaveBeenCalled()
    })

    it("leaves other keys alone", () => {
      create()

      const event = press(element, "Enter")

      expect(event.defaultPrevented).toBeFalse()
      expect(windowListener).toHaveBeenCalled()
      expect(component.index).toBe(0)
    })

    it("leaves the arrow keys to the platform switcher when it has focus, but still keeps them from the reader", () => {
      create()
      goToInstallStep()
      const installIndex = component.index

      const event = press(platformButton("Android"), "ArrowLeft")

      expect(component.index).toBe(installIndex)
      expect(event.defaultPrevented).toBeFalse()
      expect(windowListener).not.toHaveBeenCalled()
    })

    it("moves focus to the new step's heading so screen readers announce it", () => {
      create()

      press(document.body, "ArrowRight")

      expect(document.activeElement?.id).toBe("onboarding-title")
      expect(document.activeElement?.textContent).toContain("Navegar")
    })
  })

  it("ends on the install step and finishes from there", () => {
    create()
    goToInstallStep()

    expect(title()).toBe("Instalar a aplicação")
    expect(button("Seguinte")).toBeUndefined()

    button("Começar a ler")?.click()

    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      completed: true,
      lastStep: INSTALL_STEP_ID,
    })
  })

  it("closes without completing when skipped", () => {
    create()

    ;(element.querySelector(".close") as HTMLButtonElement).click()

    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      completed: false,
      lastStep: "welcome",
    })
  })

  it("omits the install step when the app already runs installed", () => {
    pwa.isInstalled = true
    create()

    expect(component.steps.length).toBe(ONBOARDING_STEPS.length - 1)
    expect(
      component.steps.some((step) => step.id === INSTALL_STEP_ID),
    ).toBeFalse()
    expect(element.querySelectorAll(".dot").length).toBe(
      ONBOARDING_STEPS.length - 1,
    )

    goToInstallStep()
    expect(button("Começar a ler")).toBeDefined()
    expect(element.querySelector(".platforms")).toBeNull()
  })

  it("preselects the detected platform and tailors the guide to the browser", () => {
    pwa.platform = "ios"
    pwa.browser = "safari"
    create()
    goToInstallStep()

    expect(platformButton("iPhone / iPad").getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(platformButton("Android").getAttribute("aria-pressed")).toBe("false")
    expect(textOf(".guide")).toContain("Adicionar ao ecrã principal")
    expect(textOf(".guide")).toContain("Safari")
    expect(textOf(".note")).toContain("iPad")
  })

  it("shows generic instructions when browsing another platform, repainting on the plain button click", () => {
    create()
    goToInstallStep()

    platformButton("Computador").click()

    expect(platformButton("Computador").getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(textOf(".guide")).toContain("barra de endereço")
    for (const browser of ["Chrome:", "Edge:", "Safari", "Firefox:"]) {
      expect(textOf(".guide")).toContain(browser)
    }

    platformButton("iPhone / iPad").click()
    expect(textOf(".guide")).toContain("barra do Safari")
  })

  it("says which browser the Android guide assumes when browsed from another device", () => {
    pwa.platform = "desktop"
    pwa.browser = "safari"
    create()
    goToInstallStep()

    platformButton("Android").click()

    expect(textOf(".guide")).toContain("Chrome")
    expect(textOf(".note")).toContain("Samsung Internet")
  })

  it("offers the one-tap install only for the device in hand", () => {
    pwa.canPromptInstall = true
    create()
    goToInstallStep()

    expect(button("Instalar agora")).toBeDefined()

    platformButton("iPhone / iPad").click()
    expect(button("Instalar agora")).toBeUndefined()

    platformButton("Android").click()
    expect(button("Instalar agora")).toBeDefined()
  })

  it("picks up an install prompt that arrives while the wizard is open", () => {
    create()
    goToInstallStep()
    expect(button("Instalar agora")).toBeUndefined()

    pwa.canPromptInstall = true
    pwa.canPromptInstall$.next(true)
    fixture.detectChanges()

    expect(button("Instalar agora")).toBeDefined()
  })

  it("runs the native prompt and confirms the installation", async () => {
    pwa.canPromptInstall = true
    create()
    goToInstallStep()

    button("Instalar agora")?.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(pwa.promptInstall).toHaveBeenCalled()
    expect(analyticsSpy.track).toHaveBeenCalledWith("pwa_install_prompt", {
      outcome: "accepted",
      installPlatform: "android",
    })
    expect(textOf(".install-done")).toContain("foi instalada")
    expect(button("Instalar agora")).toBeUndefined()
    expect(element.querySelector(".guide")).toBeNull()
  })

  it("keeps the manual steps when the user dismisses the native prompt", async () => {
    pwa.canPromptInstall = true
    pwa.promptInstall.and.resolveTo("dismissed" as InstallPromptOutcome)
    create()
    goToInstallStep()

    button("Instalar agora")?.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(component.installOutcome).toBe("dismissed")
    expect(element.querySelector(".install-done")).toBeNull()
    expect(element.querySelector(".guide")).not.toBeNull()
  })

  describe("with the apps in the stores", () => {
    beforeEach(() => {
      apps.appStoreId = "6740000000"
      apps.playPackage = "org.capuchinhos.biblia"
    })

    const storeButton = () =>
      element.querySelector<HTMLAnchorElement>("a.store-badge")

    /** The badge's alt text, which is the link's name. */
    const badgeName = () =>
      storeButton()?.querySelector("img")?.getAttribute("alt")

    const promptSeen = () =>
      TestBed.inject(PreferencesService).getAppPromoSeen()

    /** The website's own install, folded under the store's badge. */
    const webInstall = () =>
      element.querySelector<HTMLDetailsElement>("details.web-install")

    it("sends Android visitors to Google Play first", () => {
      pwa.canPromptInstall = true
      create()
      goToInstallStep()

      const link = storeButton()
      expect(badgeName()).toBe("Obter no Google Play")
      expect(link?.querySelector("img")?.getAttribute("src")).toBe(
        "imgs/badges/google-play-pt.png",
      )
      expect(link?.getAttribute("href")).toBe(
        "https://play.google.com/store/apps/details?id=org.capuchinhos.biblia&referrer=utm_source%3Dweb%26utm_medium%3Donboarding",
      )
      expect(link?.target).toBe("_blank")
      expect(link?.rel).toBe("noopener")
    })

    it("keeps the website's install under the badge, folded away", () => {
      pwa.canPromptInstall = true
      create()
      goToInstallStep()

      const details = webInstall()
      expect(details?.open).toBeFalse()
      expect(details?.querySelector("summary")?.textContent).toContain(
        "Instalar a partir do navegador",
      )
      expect(details?.querySelector(".guide")?.textContent).toContain(
        "Instalar aplicação",
      )
      expect(details?.contains(button("Instalar agora") ?? null)).toBeTrue()
      // Nothing of it outside the fold.
      expect(element.querySelectorAll(".guide").length).toBe(1)
    })

    it("still installs the website from the fold", async () => {
      pwa.canPromptInstall = true
      create()
      goToInstallStep()
      webInstall()?.querySelector("summary")?.click()
      expect(webInstall()?.open).toBeTrue()

      button("Instalar agora")?.click()
      await fixture.whenStable()
      fixture.detectChanges()

      expect(pwa.promptInstall).toHaveBeenCalled()
      expect(
        webInstall()?.querySelector(".install-done")?.textContent,
      ).toContain("foi instalada")
    })

    it("sends iPhone and iPad visitors to the App Store", () => {
      pwa.platform = "ios"
      pwa.browser = "safari"
      create()
      goToInstallStep()

      expect(badgeName()).toBe("Descarregar na App Store")
      expect(storeButton()?.querySelector("img")?.getAttribute("src")).toBe(
        "imgs/badges/app-store-pt-pt.svg",
      )
      expect(storeButton()?.getAttribute("href")).toBe(
        "https://apps.apple.com/app/id6740000000",
      )
      expect(webInstall()?.querySelector(".guide")?.textContent).toContain(
        "barra do Safari",
      )
    })

    it("keeps the website's install on a computer, with each phone's store a tap away", () => {
      pwa.platform = "desktop"
      create()
      goToInstallStep()

      expect(storeButton()).toBeNull()
      expect(webInstall()).toBeNull()
      expect(element.querySelector(".guide")).not.toBeNull()

      platformButton("Android").click()
      expect(badgeName()).toContain("Google Play")
    })

    it("keeps the website's install on a platform whose listing is still empty", () => {
      apps.playPackage = ""
      create()
      goToInstallStep()

      expect(storeButton()).toBeNull()
      expect(element.querySelector(".guide")).not.toBeNull()

      platformButton("iPhone / iPad").click()
      expect(badgeName()).toContain("App Store")
    })

    it("counts the store as shown once the install step offers it for the device in hand", () => {
      create()
      expect(promptSeen()).toBeFalse()

      goToInstallStep()
      expect(promptSeen()).toBeTrue()
    })

    it("doesn't count another device's store as shown", () => {
      pwa.platform = "desktop"
      create()
      goToInstallStep()

      platformButton("Android").click()
      expect(promptSeen()).toBeFalse()
    })

    it("counts a tap on the store button", () => {
      create()
      goToInstallStep()

      const link = storeButton() as HTMLAnchorElement
      // Keep Karma's page where it is.
      link.addEventListener("click", (event) => event.preventDefault())
      link.click()

      expect(analyticsSpy.track).toHaveBeenCalledWith("app_store_open", {
        store: "play",
        source: "onboarding",
      })
    })
  })

  describe("footer layout", () => {
    function rect(selector: string): DOMRect {
      const found = element.querySelector(selector)
      if (!found) throw new Error(`No ${selector}`)
      return found.getBoundingClientRect()
    }

    /** Lays out every step in a dialog `width` wide. */
    function eachStep(width: number, check: (stepId: string) => void): void {
      create()
      element.style.width = `${width}px`
      component.steps.forEach((step, i) => {
        component.goTo(i)
        fixture.detectChanges()
        check(step.id)
      })
    }

    // On a 360px Android phone the first step's buttons fitted beside the
    // dots and the next step's wrapped under them, so they jumped between rows.
    it("gives the dots and the buttons a row each on every step of a phone-width dialog", () => {
      pwa.isInstalled = true // the four steps of the Android app

      eachStep(331, (stepId) => {
        const footer = rect(".actions")
        const dots = element.querySelectorAll(".dot")
        const firstDot = dots[0].getBoundingClientRect()
        const lastDot = dots[dots.length - 1].getBoundingClientRect()
        const [secondary, primary] = Array.from(
          element.querySelectorAll(".buttons button"),
          (candidate) => candidate.getBoundingClientRect(),
        )

        expect(secondary.top)
          .withContext(stepId)
          .toBeGreaterThanOrEqual(firstDot.bottom)
        expect(firstDot.left - footer.left)
          .withContext(`${stepId}: dots centred`)
          .toBeCloseTo(footer.right - lastDot.right, 0)
        expect(secondary.left - footer.left)
          .withContext(`${stepId}: buttons at the edges`)
          .toBeCloseTo(footer.right - primary.right, 0)
      })
    })

    it("keeps the dots and the buttons on one row in a wider dialog", () => {
      eachStep(520, (stepId) => {
        expect(rect(".buttons").top)
          .withContext(stepId)
          .toBeLessThan(rect(".dots").bottom)
      })
    })
  })
})

describe("getInstallGuide", () => {
  it("lists every desktop browser, with the detected one first", () => {
    const labels = (browser: InstallBrowser | null) =>
      getInstallGuide("desktop", browser).steps.map((step) => step.label)

    expect(labels("safari")).toEqual([
      "Safari (macOS 14 ou superior)",
      "Chrome",
      "Edge",
      "Firefox",
      undefined,
    ])
    expect(labels("firefox")[0]).toBe("Firefox")
    expect(labels(null)[0]).toBe("Chrome")
    expect(labels("other")[0]).toBe("Chrome")

    const steps = getInstallGuide("desktop", "chrome").steps
    expect(steps[0].text).toContain("Transmitir, guardar e partilhar")
    expect(steps.at(-1)?.text).toContain("Confirme")
  })

  it("tailors Android instructions to the browser", () => {
    expect(getInstallGuide("android", "firefox").steps[0].text).toContain(
      "Firefox",
    )
    expect(getInstallGuide("android", "edge").steps[0].text).toContain("Edge")
    const chrome = getInstallGuide("android", "chrome")
    expect(chrome.steps[0].text).toContain("Chrome")
    expect(chrome.steps[1].text).toContain("Instalar aplicação")
    expect(chrome.note).toBeUndefined()
  })

  it("says which browser the Android steps assume when the browser is unknown", () => {
    for (const browser of [null, "other"] as const) {
      const guide = getInstallGuide("android", browser)
      expect(guide.steps).toBe(getInstallGuide("android", "chrome").steps)
      expect(guide.note).toContain("Chrome")
      expect(guide.note).toContain("Samsung Internet")
    }
  })

  it("points non-Safari iOS browsers at the share menu with a Safari fallback", () => {
    const guide = getInstallGuide("ios", "chrome")

    expect(guide.steps[1].text).toContain("iOS 16.4")
    expect(guide.note).toContain("Safari")
    expect(getInstallGuide("ios", null)).toBe(getInstallGuide("ios", "safari"))
  })
})
