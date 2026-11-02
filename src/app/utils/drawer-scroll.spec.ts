import { Component, signal, ViewChild } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MATERIAL_ANIMATIONS } from "@angular/material/core"
import { MatDrawer, MatSidenavModule } from "@angular/material/sidenav"
import { By } from "@angular/platform-browser"
import { scrollOnDrawerOpen } from "./drawer-scroll"

@Component({ selector: "scroll-probe", template: "" })
class ScrollProbeComponent {
  scrolls = 0
  inDrawer = scrollOnDrawerOpen(() => this.scrolls++)
}

@Component({
  imports: [MatSidenavModule, ScrollProbeComponent],
  template: `
    <mat-drawer-container>
      <mat-drawer mode="over">
        @if (inside()) {
        <scroll-probe />
        }
      </mat-drawer>
    </mat-drawer-container>
    <scroll-probe class="outside" />
  `,
})
class HostComponent {
  readonly inside = signal(false)
  @ViewChild(MatDrawer)
  drawer!: MatDrawer
}

describe("scrollOnDrawerOpen", () => {
  let fixture: ComponentFixture<HostComponent>
  let host: HostComponent

  const probe = (selector: string) =>
    fixture.debugElement.query(By.css(selector))
      .componentInstance as ScrollProbeComponent

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        {
          provide: MATERIAL_ANIMATIONS,
          useValue: { animationsDisabled: true },
        },
      ],
    })
    fixture = TestBed.createComponent(HostComponent)
    host = fixture.componentInstance
  })

  it("does nothing outside a drawer", async () => {
    vi.useFakeTimers()
    fixture.detectChanges()
    host.drawer.open()
    await vi.runAllTimersAsync()

    expect(probe(".outside").inDrawer).toBe(false)
    expect(probe(".outside").scrolls).toBe(0)
  })

  // The book list is built with the page, inside the closed drawer.
  it("scrolls each time the drawer starts opening, not before", async () => {
    vi.useFakeTimers()
    host.inside.set(true)
    fixture.detectChanges()
    await vi.runAllTimersAsync()
    const list = probe("mat-drawer scroll-probe")
    expect(list.inDrawer).toBe(true)
    expect(list.scrolls).toBe(0)

    host.drawer.open()
    await vi.runAllTimersAsync()
    expect(list.scrolls).toBe(1)

    host.drawer.close()
    await vi.runAllTimersAsync()
    host.drawer.open()
    await vi.runAllTimersAsync()
    expect(list.scrolls).toBe(2)
  })

  // The reader swaps the book and chapter lists as the drawer opens: the new
  // list can come before or after that opening's openedStart, and must scroll
  // once either way.
  it("scrolls once when built just after the drawer starts opening", async () => {
    vi.useFakeTimers()
    fixture.detectChanges()
    host.drawer.open()
    host.inside.set(true)
    fixture.detectChanges()
    await vi.runAllTimersAsync()

    expect(probe("mat-drawer scroll-probe").scrolls).toBe(1)
  })

  it("doesn't scroll a list destroyed before its fallback runs", async () => {
    vi.useFakeTimers()
    fixture.detectChanges()
    host.drawer.open()
    await vi.runAllTimersAsync()
    host.inside.set(true)
    fixture.detectChanges()
    const list = probe("mat-drawer scroll-probe")
    fixture.destroy()
    await vi.runAllTimersAsync()

    expect(list.scrolls).toBe(0)
  })

  it("scrolls once when built after openedStart has fired", async () => {
    vi.useFakeTimers()
    fixture.detectChanges()
    host.drawer.open()
    await vi.runAllTimersAsync()
    host.inside.set(true)
    fixture.detectChanges()
    await vi.runAllTimersAsync()

    expect(probe("mat-drawer scroll-probe").scrolls).toBe(1)
  })
})
