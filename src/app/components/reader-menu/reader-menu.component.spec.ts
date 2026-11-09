import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatMenuModule, MatMenuTrigger } from "@angular/material/menu"
import { By } from "@angular/platform-browser"
import { ReaderMenuComponent } from "./reader-menu.component"

@Component({
  imports: [MatMenuModule, ReaderMenuComponent],
  template: `
    <button type="button" [matMenuTriggerFor]="menu.menu">Menu</button>
    <reader-menu #menu="readerMenu" [viewMode]="viewMode()"
      [autoScrollControlsVisible]="autoScroll()" [cardsView]="cardsView()"
      [cardsViewAvailable]="cardsViewAvailable()" (toggleCardsView)="toggled()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  readonly viewMode = signal<"scrolling" | "paged" | null>(null)
  readonly autoScroll = signal<boolean | null>(null)
  readonly cardsView = signal(false)
  readonly cardsViewAvailable = signal(false)
  readonly toggled = vi.fn().mockName("toggleCardsView")
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

  describe("BibleScroll entry", () => {
    function openWith(cards: { available: boolean; on?: boolean }) {
      const fixture = TestBed.createComponent(HostComponent)
      const host = fixture.componentInstance
      host.viewMode.set("scrolling")
      host.autoScroll.set(false)
      host.cardsViewAvailable.set(cards.available)
      host.cardsView.set(cards.on ?? false)
      fixture.detectChanges()
      fixture.debugElement
        .query(By.directive(MatMenuTrigger))
        .injector.get(MatMenuTrigger)
        .openMenu()
      fixture.detectChanges()
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".mat-mdc-menu-panel .mat-mdc-menu-item",
        ),
      )
      return {
        host,
        items,
        entry: items.find((item) => item.textContent?.includes("BibleScroll")),
      }
    }

    it("is offered where the reader can show the view, flagged as experimental", () => {
      const { entry } = openWith({ available: true })

      expect(entry?.textContent).toContain("BibleScroll")
      expect(entry?.textContent).not.toContain("Sair")
      expect(entry?.textContent).toContain("Experimental")
    })

    it("is left out where the reader cannot show it", () => {
      const { items, entry } = openWith({ available: false })

      // The menu did open, so the entry is missing rather than not yet drawn.
      expect(items.length).toBeGreaterThan(0)
      expect(entry).toBeUndefined()
    })

    // The feature began as a "doomscrolling mode"; it is BibleScroll now, and
    // the old name must not resurface in front of readers.
    it("does not call itself doomscrolling", () => {
      const { items } = openWith({ available: true })

      for (const item of items) {
        expect(item.textContent?.toLowerCase()).not.toContain("doomscroll")
      }
    })

    it("offers the way out while the view is on", () => {
      const { entry } = openWith({ available: true, on: true })

      expect(entry?.textContent).toContain("Sair do BibleScroll")
    })

    it("asks the reader to toggle the view when tapped", () => {
      const { host, entry } = openWith({ available: true })

      entry?.click()

      expect(host.toggled).toHaveBeenCalledTimes(1)
    })

    // The cards replace both layouts and set their own alignment; auto-scroll
    // would fight the snapping.
    it("drops the layout toggles and disables auto-scroll while the cards are on", () => {
      const { items } = openWith({ available: true, on: true })
      const labels = items
        .map((item) => item.getAttribute("aria-label") ?? item.textContent)
        .join("|")

      expect(labels).not.toContain("Texto contínuo")
      expect(labels).not.toContain("Justificado")
      expect(
        items
          .find((item) => item.textContent?.includes("deslocamento automático"))
          ?.hasAttribute("disabled"),
      ).toBe(true)
    })

    it("keeps the layout toggles otherwise", () => {
      const { items } = openWith({ available: true })

      expect(
        items.map((item) => item.getAttribute("aria-label")).join("|"),
      ).toContain("Texto contínuo")
    })
  })
})
