import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatMenuModule, MatMenuTrigger } from "@angular/material/menu"
import { By } from "@angular/platform-browser"
import type { TextSize } from "../../directives/unified-gesture.directive"
import { ToastService } from "../../services/toast.service"
import { ReaderMenuComponent } from "./reader-menu.component"

@Component({
  imports: [MatMenuModule, ReaderMenuComponent],
  template: `
    <button type="button" [matMenuTriggerFor]="menu.menu">Menu</button>
    <reader-menu #menu="readerMenu" [viewMode]="viewMode()" [canShare]="canShare()"
      [autoScrollControlsVisible]="autoScroll()" [textSize]="textSize()"
      (resetFontSize)="resets.set(resets() + 1)"
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
  readonly canShare = signal(false)
  readonly resets = signal(0)
  readonly increases = signal(0)
  readonly decreases = signal(0)
  readonly toggles = signal(0)
}

describe("ReaderMenuComponent", () => {
  function open(
    viewMode: "scrolling" | "paged" | null,
    autoScroll: boolean | null,
    canShare = false,
  ) {
    const fixture = TestBed.createComponent(HostComponent)
    fixture.componentInstance.canShare.set(canShare)
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

  it("says why auto-scroll is unavailable in the paged view", () => {
    open("paged", true)
    const item = menuItem("Esconder deslocamento automático")

    expect(item.textContent).toContain("Indisponível na vista de páginas")
    // Disabled, yet still a stop for the arrow keys: its note is the only
    // explanation, and a skipped item is never read out.
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(item.disabled).toBe(false)
    expect(item.tabIndex).toBe(0)
  })

  it("gives no reason while auto-scroll is available", () => {
    open("scrolling", true)

    expect(document.body.textContent).not.toContain("Indisponível")
  })

  it("resets the text size from its own control", () => {
    const fixture = TestBed.createComponent(HostComponent)
    fixture.componentInstance.viewMode.set("scrolling")
    fixture.detectChanges()
    fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger)
      .openMenu()
    fixture.detectChanges()
    document
      .querySelector<HTMLButtonElement>('[aria-label="Repor tamanho do texto"]')
      ?.click()

    expect(fixture.componentInstance.resets()).toBe(1)
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

  it("toggles auto-scroll from its item, but not while the paged view disables it", () => {
    const fixture = TestBed.createComponent(HostComponent)
    fixture.componentInstance.viewMode.set("paged")
    fixture.componentInstance.autoScroll.set(true)
    fixture.detectChanges()
    fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger)
      .openMenu()
    fixture.detectChanges()

    // Focusable to be read out, so the click reaches the handler.
    menuItem("Esconder deslocamento automático").click()
    expect(fixture.componentInstance.toggles()).toBe(0)

    fixture.componentInstance.viewMode.set("scrolling")
    fixture.detectChanges()
    menuItem("Esconder deslocamento automático").click()
    expect(fixture.componentInstance.toggles()).toBe(1)
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
})
