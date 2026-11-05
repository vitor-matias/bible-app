import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { MatSnackBar } from "@angular/material/snack-bar"
import { Capacitor } from "@capacitor/core"
import type { Mock } from "vitest"
import {
  AppPromptSnackComponent,
  type AppPromptSnackData,
} from "../components/app-prompt-snackbar/app-prompt-snackbar.component"
import type { StoreApps } from "../config"
import { createSpyObj, lastCall, type SpyObj } from "../testing/spy-obj"
import { STORE_APPS } from "../tokens"
import { AnalyticsService } from "./analytics.service"
import {
  AppPromoService,
  PROMPT_DELAY_MS,
  PROMPT_DURATION_MS,
  type StoreLink,
  storeLink,
} from "./app-promo.service"
import { NetworkService } from "./network.service"
import { PreferencesService } from "./preferences.service"
import { type InstallPlatform, PwaInstallService } from "./pwa-install.service"

const LISTED: StoreApps = {
  appStoreId: "6740000000",
  playPackage: "org.capuchinhos.biblia",
}
const UNLISTED: StoreApps = { appStoreId: "", playPackage: "" }

describe("storeLink", () => {
  it("is null until the platform's listing is filled in", () => {
    expect(storeLink("ios", UNLISTED, "menu")).toBeNull()
    expect(storeLink("android", UNLISTED, "menu")).toBeNull()
  })

  it("is null on a computer, which has no store app", () => {
    expect(storeLink("desktop", LISTED, "menu")).toBeNull()
  })

  it("links the App Store page by its app id", () => {
    const link = storeLink("ios", LISTED, "menu")

    expect(link?.store).toBe("app_store")
    expect(link?.url).toBe("https://apps.apple.com/app/id6740000000")
    expect(link?.label).toBe("Descarregar na App Store")
    expect(link?.badge).toBe("imgs/badges/app-store-pt-pt.svg")
  })

  it("tells Google Play where on the website the visitor came from", () => {
    const url = new URL(storeLink("android", LISTED, "prompt")?.url ?? "")

    expect(url.origin + url.pathname).toBe(
      "https://play.google.com/store/apps/details",
    )
    expect(url.searchParams.get("id")).toBe("org.capuchinhos.biblia")
    expect(url.searchParams.get("referrer")).toBe(
      "utm_source=web&utm_medium=prompt",
    )
  })
})

describe("AppPromoService", () => {
  let apps: StoreApps
  let platform: InstallPlatform
  /** Whether the website runs installed, as a home-screen app. */
  let installed: boolean
  let analyticsSpy: SpyObj<AnalyticsService>
  let snackBar: { openFromComponent: Mock; _openedSnackBarRef: unknown }
  let dialog: { openDialogs: unknown[] }
  let bottomSheet: { _openedBottomSheetRef: unknown }
  let network: { isOffline: boolean }

  beforeEach(() => {
    localStorage.removeItem("appPromoSeen")
    localStorage.setItem("onboardingSeen", "true")
    apps = { ...LISTED }
    platform = "android"
    installed = false
    analyticsSpy = createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.mockResolvedValue(undefined)
    snackBar = {
      openFromComponent: vi.fn(),
      _openedSnackBarRef: null,
    }
    dialog = { openDialogs: [] }
    bottomSheet = { _openedBottomSheetRef: null }
    network = { isOffline: false }

    TestBed.configureTestingModule({
      providers: [
        { provide: STORE_APPS, useValue: apps },
        {
          provide: PwaInstallService,
          useValue: {
            detectPlatform: () => platform,
            get isInstalled() {
              return installed
            },
          },
        },
        { provide: AnalyticsService, useValue: analyticsSpy },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialog, useValue: dialog },
        { provide: MatBottomSheet, useValue: bottomSheet },
        { provide: NetworkService, useValue: network },
      ],
    })
  })

  afterEach(() => {
    localStorage.removeItem("appPromoSeen")
    localStorage.removeItem("onboardingSeen")
  })

  // Lazily, so a test can still override a provider first.
  const service = () => TestBed.inject(AppPromoService)
  const preferences = () => TestBed.inject(PreferencesService)

  const promptData = () =>
    lastCall(snackBar.openFromComponent)[1].data as AppPromptSnackData

  it("offers the store for the device in hand", () => {
    expect(service().deviceStore("menu")?.store).toBe("play")

    platform = "ios"
    expect(service().deviceStore("menu")?.store).toBe("app_store")
  })

  it("offers no store inside the native apps", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)

    expect(service().storeFor("android", "menu")).toBeNull()
    expect(service().deviceStore("menu")).toBeNull()
  })

  it("prompts once, a while into the visit, for visitors past onboarding", async () => {
    vi.useFakeTimers()
    expect(service().scheduleOnce()).toBe(true)

    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS - 1)
    expect(snackBar.openFromComponent).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(snackBar.openFromComponent).toHaveBeenCalledTimes(1)
    expect(snackBar.openFromComponent).toHaveBeenCalledWith(
      AppPromptSnackComponent,
      expect.objectContaining({ duration: PROMPT_DURATION_MS }),
    )
    expect(promptData().message).toBe("Leia na aplicação")
    expect(promptData().link.store).toBe("play")
    expect(promptData().link.url).toContain("utm_medium%3Dprompt")
    expect(preferences().getAppPromoSeen()).toBe(true)
    expect(analyticsSpy.track).toHaveBeenCalledWith("app_prompt_shown", {
      store: "play",
    })

    expect(service().scheduleOnce()).toBe(false)
  })

  it("counts a tap on the prompt's badge", async () => {
    vi.useFakeTimers()
    service().scheduleOnce()
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    promptData().onOpen()

    expect(analyticsSpy.track).toHaveBeenCalledWith("app_store_open", {
      store: "play",
      source: "prompt",
    })
  })

  it("prompts inside the installed website too, as news from the store", async () => {
    vi.useFakeTimers()
    installed = true

    expect(service().scheduleOnce()).toBe(true)
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    expect(promptData().message).toBe("Nova aplicação")
    expect(preferences().getAppPromoSeen()).toBe(true)
  })

  it("names the menu entry as news inside the installed website", () => {
    const play = service().deviceStore("menu") as StoreLink
    expect(service().menuLabel(play)).toBe("Instalar a aplicação")

    installed = true
    expect(service().menuLabel(play)).toBe("Nova aplicação no Google Play")

    platform = "ios"
    const appStore = service().deviceStore("menu") as StoreLink
    expect(service().menuLabel(appStore)).toBe("Nova aplicação na App Store")
  })

  it("leaves new visitors to onboarding, whose install step shows the store", () => {
    localStorage.removeItem("onboardingSeen")

    expect(service().scheduleOnce()).toBe(false)
  })

  it("never prompts on a computer or before the device's listing is filled in", () => {
    platform = "desktop"
    expect(service().scheduleOnce()).toBe(false)

    platform = "android"
    apps.playPackage = ""
    expect(service().scheduleOnce()).toBe(false)
  })

  it("never prompts while prerendering", () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })

    expect(service().scheduleOnce()).toBe(false)
  })

  it("stays quiet if onboarding's install step showed the store meanwhile", async () => {
    vi.useFakeTimers()
    service().scheduleOnce()
    service().markSeen()
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    expect(snackBar.openFromComponent).not.toHaveBeenCalled()
  })

  it("gives way to an open dialog, and tries again next visit", async () => {
    vi.useFakeTimers()
    dialog.openDialogs = [{}]
    service().scheduleOnce()
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    expect(snackBar.openFromComponent).not.toHaveBeenCalled()
    expect(preferences().getAppPromoSeen()).toBe(false)
  })

  it("gives way to an open sheet, such as a verse's notes", async () => {
    vi.useFakeTimers()
    bottomSheet._openedBottomSheetRef = {}
    service().scheduleOnce()
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    expect(snackBar.openFromComponent).not.toHaveBeenCalled()
    expect(preferences().getAppPromoSeen()).toBe(false)
  })

  it("isn't spent offline, where its link can't open", async () => {
    vi.useFakeTimers()
    network.isOffline = true
    service().scheduleOnce()
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    expect(snackBar.openFromComponent).not.toHaveBeenCalled()
    expect(preferences().getAppPromoSeen()).toBe(false)
  })

  it("doesn't replace another message, such as the way back", async () => {
    vi.useFakeTimers()
    snackBar._openedSnackBarRef = {}
    service().scheduleOnce()
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    expect(snackBar.openFromComponent).not.toHaveBeenCalled()
    expect(preferences().getAppPromoSeen()).toBe(false)
  })

  it("isn't spent on a tab in the background", async () => {
    vi.useFakeTimers()
    vi.spyOn(Document.prototype, "visibilityState", "get").mockReturnValue(
      "hidden",
    )
    service().scheduleOnce()
    await vi.advanceTimersByTimeAsync(PROMPT_DELAY_MS)

    expect(snackBar.openFromComponent).not.toHaveBeenCalled()
    expect(preferences().getAppPromoSeen()).toBe(false)
  })
})
