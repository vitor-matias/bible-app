import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatMenuModule, MatMenuTrigger } from "@angular/material/menu"
import { By } from "@angular/platform-browser"
import { Router } from "@angular/router"
import {
  ReaderMenuComponent,
  type StudyModeItem,
} from "./reader-menu.component"

@Component({
  imports: [MatMenuModule, ReaderMenuComponent],
  template: `
    <button type="button" [matMenuTriggerFor]="menu.menu">Menu</button>
    <reader-menu #menu="readerMenu" [viewMode]="viewMode()"
      [autoScrollControlsVisible]="autoScroll()" (resetFontSize)="resets.set(resets() + 1)"
      [studyMode]="studyMode()" [shortcuts]="shortcuts()"
      (toggleStudyMode)="toggled.update((n) => n + 1)"
      (openShortcuts)="shortcutsOpened.update((n) => n + 1)"
      (toggleAutoScrollControls)="toggles.set(toggles() + 1)" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  readonly viewMode = signal<"scrolling" | "paged" | null>(null)
  readonly autoScroll = signal<boolean | null>(null)
  readonly studyMode = signal<StudyModeItem | null>(null)
  readonly shortcuts = signal(false)
  readonly toggled = signal(0)
  readonly shortcutsOpened = signal(0)
  readonly resets = signal(0)
  readonly toggles = signal(0)
}

describe("ReaderMenuComponent", () => {
  function open(
    viewMode: "scrolling" | "paged" | null,
    autoScroll: boolean | null,
  ) {
    const fixture = TestBed.createComponent(HostComponent)
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

  describe("the entries a reader's own work adds", () => {
    function openMenu() {
      const fixture = TestBed.createComponent(HostComponent)
      return {
        fixture,
        host: fixture.componentInstance,
        open: () => {
          fixture.detectChanges()
          fixture.debugElement
            .query(By.directive(MatMenuTrigger))
            .injector.get(MatMenuTrigger)
            .openMenu()
          fixture.detectChanges()
        },
      }
    }
    const entry = (text: string): HTMLElement | undefined =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          ".mat-mdc-menu-panel .mat-mdc-menu-item",
        ),
      ).find((item) => item.textContent?.includes(text))

    it("opens the notes and marks page, on any page that has this menu", () => {
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)
      const { open } = openMenu()
      open()

      entry("As minhas notas e marcas")?.click()

      expect(navigate).toHaveBeenCalledWith(["/minhas-notas"])
    })

    // Study mode never pages, so a switch between the two would only change
    // the saved choice; the text's alignment still applies there.
    it("leaves out the page-by-page switch in study mode, and keeps the alignment", () => {
      const { host, fixture, open } = openMenu()
      host.viewMode.set("scrolling")
      host.studyMode.set("on")
      open()

      expect(
        document.querySelector(
          '[aria-label^="Texto contínuo"], [aria-label^="Página a página"]',
        ),
      ).toBeNull()
      expect(
        document.querySelector(
          '[aria-label^="Justificado"], [aria-label^="Alinhado"]',
        ),
      ).not.toBeNull()

      host.studyMode.set("off")
      fixture.detectChanges()
      expect(
        document.querySelector('[aria-label^="Texto contínuo"]'),
      ).not.toBeNull()
    })

    it("offers study mode, with what it is, and reports the choice", () => {
      const { host, fixture, open } = openMenu()
      host.studyMode.set("off")
      open()

      expect(entry("Modo de estudo")?.textContent).toContain(
        "Notas, referências e pesquisa ao lado do texto",
      )

      entry("Modo de estudo")?.click()
      fixture.detectChanges()

      expect(host.toggled()).toBe(1)
    })

    it("offers the way back once it is on, without the gloss", () => {
      const { host, open } = openMenu()
      host.studyMode.set("on")
      open()

      expect(entry("Voltar ao modo de leitura")).toBeTruthy()
      expect(entry("Voltar ao modo de leitura")?.textContent).not.toContain(
        "Notas, referências",
      )
    })

    // A mode that vanishes when the window narrows gave no way to know it had
    // ever been there: it is shown, disabled, with why.
    it("shows it disabled, saying why, where the window is too narrow", () => {
      const { host, fixture, open } = openMenu()
      host.studyMode.set("narrow")
      open()

      const item = entry("Modo de estudo")
      expect(item?.getAttribute("aria-disabled")).toBe("true")
      expect(item?.textContent).toContain("Precisa de uma janela mais larga")

      item?.click()
      fixture.detectChanges()
      expect(host.toggled()).toBe(0)
    })

    it("leaves study mode out where the page has none", () => {
      const { open } = openMenu()
      open()

      expect(entry("Modo de estudo")).toBeUndefined()
      expect(entry("Voltar ao modo de leitura")).toBeUndefined()
    })

    it("lists the keys only when they are on offer", () => {
      const { host, fixture, open } = openMenu()
      open()
      expect(entry("Atalhos de teclado")).toBeUndefined()

      host.shortcuts.set(true)
      fixture.detectChanges()
      entry("Atalhos de teclado")?.click()
      fixture.detectChanges()

      expect(host.shortcutsOpened()).toBe(1)
    })
  })
})
