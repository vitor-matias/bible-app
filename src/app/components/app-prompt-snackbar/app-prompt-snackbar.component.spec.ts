import { TestBed } from "@angular/core/testing"
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar"
import type { StoreLink } from "../../services/app-promo.service"
import {
  AppPromptSnackComponent,
  type AppPromptSnackData,
} from "./app-prompt-snackbar.component"

describe("AppPromptSnackComponent", () => {
  const play: StoreLink = {
    store: "play",
    url: "https://play.google.com/store/apps/details?id=org.capuchinhos.biblia",
    badge: "imgs/badges/google-play-pt.png",
    label: "Obter no Google Play",
    newApp: "Nova aplicação no Google Play",
  }
  let snackBarRefSpy: jasmine.SpyObj<MatSnackBarRef<AppPromptSnackComponent>>
  let data: AppPromptSnackData
  let element: HTMLElement

  beforeEach(() => {
    snackBarRefSpy = jasmine.createSpyObj("MatSnackBarRef", ["dismiss"])
    data = {
      message: "Leia na aplicação",
      link: play,
      onOpen: jasmine.createSpy("onOpen"),
    }
    TestBed.configureTestingModule({
      imports: [AppPromptSnackComponent],
      providers: [
        { provide: MAT_SNACK_BAR_DATA, useValue: data },
        { provide: MatSnackBarRef, useValue: snackBarRefSpy },
      ],
    })
    const fixture = TestBed.createComponent(AppPromptSnackComponent)
    fixture.detectChanges()
    element = fixture.nativeElement
  })

  const badgeLink = () =>
    element.querySelector<HTMLAnchorElement>("a.badge") as HTMLAnchorElement

  it("is the message, then the store's badge as the link", () => {
    expect(element.querySelector(".message")?.textContent).toBe(
      "Leia na aplicação",
    )
    const link = badgeLink()
    expect(link.getAttribute("href")).toBe(play.url)
    expect(link.target).toBe("_blank")
    expect(link.rel).toBe("noopener")

    const badge = link.querySelector("img") as HTMLImageElement
    expect(badge.getAttribute("src")).toBe(play.badge)
    expect(badge.alt).toBe("Obter no Google Play")
  })

  // Apple's least height on screen; Google's is 28px.
  it("shows the badge 40px tall", () => {
    const badge = badgeLink().querySelector("img") as HTMLImageElement
    expect(getComputedStyle(badge).height).toBe("40px")
  })

  it("counts a tap on the badge and closes", () => {
    const link = badgeLink()
    // Keep Karma's page where it is.
    link.addEventListener("click", (event) => event.preventDefault())
    link.click()

    expect(data.onOpen).toHaveBeenCalled()
    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
  })

  it("closes from its close button without counting a tap", () => {
    const close = element.querySelector<HTMLButtonElement>(".close")
    expect(close?.getAttribute("aria-label")).toBe("Fechar")
    close?.click()

    expect(snackBarRefSpy.dismiss).toHaveBeenCalled()
    expect(data.onOpen).not.toHaveBeenCalled()
  })
})
