import { TestBed } from "@angular/core/testing"
import { MatDialog } from "@angular/material/dialog"
import { provideRouter } from "@angular/router"
import { SeoService } from "../../services/seo.service"
import {
  PRIVACY_DIALOG_CONFIG,
  PrivacyPolicyDialogComponent,
  PrivacyPolicyPageComponent,
} from "./privacy-policy.component"

describe("Privacy policy", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
  })

  it("opens in a modal with its text, and closes", async () => {
    const dialog = TestBed.inject(MatDialog)
    const ref = dialog.open(PrivacyPolicyDialogComponent, PRIVACY_DIALOG_CONFIG)
    await ref.afterOpened().toPromise()
    const panel = document.querySelector(".privacy-dialog-panel")

    expect(panel?.textContent).toContain("Voyage AI")
    expect(panel?.textContent).toContain("correio@capuchinhos.org")

    panel?.querySelector<HTMLButtonElement>("[mat-dialog-close]")?.click()
    await ref.afterClosed().toPromise()
    expect(dialog.openDialogs).toHaveLength(0)
  })

  it("has a public page for the store listings, with its own head", () => {
    const seo = { updateForPrivacy: vi.fn() }
    TestBed.overrideProvider(SeoService, { useValue: seo })
    const fixture = TestBed.createComponent(PrivacyPolicyPageComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector("h1").textContent).toBe(
      "Política de Privacidade",
    )
    expect(fixture.nativeElement.textContent).toContain("Umami")
    expect(seo.updateForPrivacy).toHaveBeenCalled()
  })
})
