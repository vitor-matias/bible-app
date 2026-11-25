import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatMenuModule, MatMenuTrigger } from "@angular/material/menu"
import { By } from "@angular/platform-browser"
import { Router } from "@angular/router"
import type { TextSize } from "../../directives/unified-gesture.directive"
import { ToastService } from "../../services/toast.service"
import { ReaderMenuComponent } from "./reader-menu.component"

@Component({
  imports: [MatMenuModule, ReaderMenuComponent],
  template: `
    <button type="button" [matMenuTriggerFor]="menu.menu">Menu</button>
    <reader-menu #menu="readerMenu" [viewMode]="viewMode()" [canShare]="canShare()" [shareText]="shareText()"
      [autoScrollControlsVisible]="autoScroll()" [textSize]="textSize()" [alignText]="alignText()"
      (increaseFontSize)="increases.set(increases() + 1)"
      (decreaseFontSize)="decreases.set(decreases() + 1)"
      (toggleAutoScrollControls)="toggles.set(toggles() + 1)" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  readonly viewMode = signal<"scrolling" | "paged" | null>(null)
  readonly autoScroll = signal<boolean | null>(null)
  readonly textSize = signal<TextSize | null>(null)
  readonly alignText = signal(false)
  readonly canShare = signal(false)
  readonly shareText = signal("")
  readonly increases = signal(0)
  readonly decreases = signal(0)
  readonly toggles = signal(0)
}

describe("ReaderMenuComponent", () => {
  function open(
    viewMode: "scrolling" | "paged" | null,
    autoScroll: boolean | null,
    canShare = false,
    shareText = "",
  ) {
    const fixture = TestBed.createComponent(HostComponent)
    fixture.componentInstance.canShare.set(canShare)
    fixture.componentInstance.shareText.set(shareText)
    fixture.componentInstance.viewMode.set(viewMode)
    fixture.componentInstance.autoScroll.set(autoScroll)
    fixture.detectChanges()
    fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger)
      .openMenu()
    fixture.detectChanges()
    return Array.from(
      document.querySelectorAll(".mat-mdc-menu-panel .mat-mdc-menu-item"),
    ).map((item) => item.getAttribute("aria-label") ?? item.textContent ?? "")
  }

  const alignButton = () =>
    document.querySelector(
      '[aria-label^="Justificado"], [aria-label^="Alinhado"]',
    )

  it("opens the +365 reading plan", () => {
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true)
    open("scrolling", false)
    const entry = Array.from(
      document.querySelectorAll<HTMLElement>(".mat-mdc-menu-item"),
    ).find((item) => item.textContent?.includes("+365: ler um pouco por dia"))
    entry?.click()
    expect(navigate).toHaveBeenCalledWith(["/mais365"])
  })

  it("offers the text alignment with a view mode, or when asked for", () => {
    open("scrolling", null)
    expect(alignButton()).not.toBeNull()
    TestBed.resetTestingModule()

    open(null, null)
    expect(alignButton()).toBeNull()
    TestBed.resetTestingModule()

    const fixture = TestBed.createComponent(HostComponent)
    fixture.componentInstance.alignText.set(true)
    fixture.detectChanges()
    fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger)
      .openMenu()
    fixture.detectChanges()
    expect(alignButton()).not.toBeNull()
  })

  // The pastoral index: no chapter to page through or scroll on its own.
  it("leaves out a chapter's own controls on a page without them", () => {
    const items = open(null, null).join("|")

    expect(items).not.toContain("Texto contínuo")
    expect(items).not.toContain("deslocamento automático")
    expect(items).toContain("Marcadores")
  })

  it("has them in a chapter", () => {
    const items = open("scrolling", false).join("|")

    expect(items).toContain("Texto contínuo")
    expect(items).toContain("Mostrar deslocamento automático")
    expect(items).not.toContain("controlos")
  })

  function menuItem(text: string): HTMLButtonElement {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>(".mat-mdc-menu-item"),
    ).find((item) => item.textContent?.includes(text)) as HTMLButtonElement
  }

  it("offers the +365 player in the paged view, where nothing scrolls", () => {
    open("paged", true)

    expect(menuItem("Esconder o +365")).toBeTruthy()
    expect(document.body.textContent).not.toContain("deslocamento automático")
    expect(document.body.textContent).not.toContain("Indisponível")
  })

  // At 235% «Aumentar texto» looked as if it worked and did nothing.
  it("disables the text size's buttons at its limits, keeping them in reach", () => {
    const fixture = TestBed.createComponent(HostComponent)
    const host = fixture.componentInstance
    host.textSize.set({ percent: 235, min: 70, max: 235, canReset: true })
    fixture.detectChanges()
    fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger)
      .openMenu()
    fixture.detectChanges()
    const button = (label: string) =>
      document.querySelector<HTMLButtonElement>(
        `[aria-label="${label}"]`,
      ) as HTMLButtonElement

    expect(button("Aumentar texto").getAttribute("aria-disabled")).toBe("true")
    expect(button("Aumentar texto").tabIndex).toBe(0)
    expect(button("Diminuir texto").getAttribute("aria-disabled")).not.toBe(
      "true",
    )
    button("Aumentar texto").click()
    button("Diminuir texto").click()
    expect([host.increases(), host.decreases()]).toEqual([0, 1])

    host.textSize.set({ percent: 70, min: 70, max: 235, canReset: true })
    fixture.detectChanges()
    expect(button("Diminuir texto").getAttribute("aria-disabled")).toBe("true")
    expect(button("Aumentar texto").getAttribute("aria-disabled")).not.toBe(
      "true",
    )
    button("Diminuir texto").click()
    button("Aumentar texto").click()
    expect([host.increases(), host.decreases()]).toEqual([1, 1])
  })

  it("toggles the control from its item in either view", () => {
    const fixture = TestBed.createComponent(HostComponent)
    fixture.componentInstance.viewMode.set("paged")
    fixture.componentInstance.autoScroll.set(true)
    fixture.detectChanges()
    fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger)
      .openMenu()
    fixture.detectChanges()

    menuItem("Esconder o +365").click()
    expect(fixture.componentInstance.toggles()).toBe(1)

    fixture.componentInstance.viewMode.set("scrolling")
    fixture.detectChanges()
    menuItem("Esconder deslocamento automático").click()
    expect(fixture.componentInstance.toggles()).toBe(2)
  })

  // Desktop browsers have no share sheet; the link is what a share would send.
  it("copies the page's link where the page can't share", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    const show = vi
      .spyOn(TestBed.inject(ToastService), "show")
      .mockImplementation(() => {})
    const items = open(null, null).join("|")

    expect(items).not.toContain("Partilhar")
    menuItem("Copiar ligação").click()
    await writeText.mock.results[0]?.value

    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(show).toHaveBeenCalledWith("Ligação copiada")
  })

  // Owner's choice: a copied link names its passage first, as a share does.
  it("puts the passage before the link it copies", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    vi.spyOn(TestBed.inject(ToastService), "show").mockImplementation(() => {})
    open(null, null, false, "Mateus 5,3-12")

    menuItem("Copiar ligação").click()
    await writeText.mock.results[0]?.value

    expect(writeText).toHaveBeenCalledWith(
      `Mateus 5,3-12\n${window.location.href}`,
    )
  })

  it("confirms nothing when the browser refuses the copy", async () => {
    const refused = Promise.reject(new Error("NotAllowedError"))
    refused.catch(() => {})
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(refused)
    const show = vi.spyOn(TestBed.inject(ToastService), "show")
    open(null, null)

    menuItem("Copiar ligação").click()
    await refused.catch(() => {})

    expect(show).not.toHaveBeenCalled()
  })

  it("shares instead where the page can", () => {
    const items = open(null, null, true).join("|")

    expect(items).toContain("Partilhar")
    expect(items).not.toContain("Copiar ligação")
  })

  // A tooltip is out of reach on a touch screen: the words show under the icon.
  it("shows each look button's words under its icon", () => {
    open("paged", null)
    const labels = Array.from(
      document.querySelectorAll(".menu-control.labelled"),
    ).map((button) => ({
      aria: button.getAttribute("aria-label")?.toLowerCase() ?? "",
      text: button.querySelector(".menu-control-label")?.textContent?.trim(),
    }))
    expect(labels.map((label) => label.text)).toEqual([
      expect.stringMatching(/^(Automático|Claro|Escuro)$/),
      "Página a página",
      "Justificado",
    ])
    // The visible words are part of the accessible name.
    for (const { aria, text } of labels) {
      expect(aria).toContain(text?.toLowerCase())
    }
  })
})
