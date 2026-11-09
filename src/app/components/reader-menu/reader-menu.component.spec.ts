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
      [autoScrollControlsVisible]="autoScroll()"
      [studyMode]="studyMode()" [shortcuts]="shortcuts()"
      (toggleStudyMode)="toggled.update((n) => n + 1)"
      (openShortcuts)="shortcutsOpened.update((n) => n + 1)" />
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
}

describe("ReaderMenuComponent", () => {
  function open(viewMode: "scrolling" | null, autoScroll: boolean | null) {
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
    expect(items).toContain("Mostrar controlos de deslocamento automático")
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
