import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatDialogRef } from "@angular/material/dialog"
import { Mais365ReminderService } from "../../services/mais365-reminder.service"
import { Mais365ReminderComponent } from "./mais365-reminder.component"

describe("Mais365ReminderComponent", () => {
  let fixture: ComponentFixture<Mais365ReminderComponent>
  let reminder: {
    enabled: ReturnType<typeof signal<boolean>>
    busy: ReturnType<typeof signal<boolean>>
    problem: ReturnType<typeof signal<string | null>>
    time: ReturnType<typeof signal<string>>
    onlyUnread: ReturnType<typeof signal<boolean>>
    setOnlyUnread: ReturnType<typeof vi.fn>
    unsupported: string | null
    enable: ReturnType<typeof vi.fn>
    disable: ReturnType<typeof vi.fn>
    setTime: ReturnType<typeof vi.fn>
  }

  const dialogRef = { close: vi.fn() }
  const host = (): HTMLElement => fixture.nativeElement
  const toggle = () =>
    host().querySelector<HTMLInputElement>('input[role="switch"]')
  const onlyUnread = () =>
    host().querySelectorAll<HTMLInputElement>('input[role="switch"]')[1]
  const time = () =>
    host().querySelector<HTMLInputElement>('input[type="time"]')

  function create() {
    TestBed.configureTestingModule({
      providers: [
        { provide: Mais365ReminderService, useValue: reminder },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    })
    fixture = TestBed.createComponent(Mais365ReminderComponent)
    fixture.detectChanges()
  }

  beforeEach(() => {
    reminder = {
      enabled: signal(false),
      busy: signal(false),
      problem: signal(null),
      time: signal("08:00"),
      onlyUnread: signal(true),
      setOnlyUnread: vi.fn(),
      unsupported: null,
      enable: vi.fn(async () => reminder.enabled.set(true)),
      disable: vi.fn(async () => reminder.enabled.set(false)),
      setTime: vi.fn(),
    }
  })

  it("shows the switch off, named plainly", () => {
    create()
    expect(host().textContent).toContain("Notificação diária")
    expect(host().textContent).not.toContain("Só nos dias")
    expect(toggle()?.checked).toBe(false)
    expect(time()).toBeNull()
  })

  it("turns it on, then offers the time", async () => {
    create()
    toggle()?.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(reminder.enable).toHaveBeenCalled()
    expect(toggle()?.checked).toBe(true)
    expect(time()?.value).toBe("08:00")
    const input = time() as HTMLInputElement
    input.value = "21:30"
    input.dispatchEvent(new Event("change"))
    expect(reminder.setTime).toHaveBeenCalledWith("21:30")
  })

  it("reminds only on days not read, or every day once that's turned off", () => {
    reminder.enabled.set(true)
    create()
    expect(host().textContent).toContain("Só se ainda não tiver lido")
    expect(onlyUnread()?.checked).toBe(true)
    onlyUnread()?.click()
    expect(reminder.setOnlyUnread).toHaveBeenCalledWith(false)
  })

  it("turns the switch back off when refused, and says why", async () => {
    reminder.enable.mockImplementation(async () =>
      reminder.problem.set("As notificações estão desligadas."),
    )
    create()
    toggle()?.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(toggle()?.checked).toBe(false)
    expect(host().querySelector('[role="status"]')?.textContent).toContain(
      "desligadas",
    )
  })

  it("turns it off", async () => {
    reminder.enabled.set(true)
    create()
    toggle()?.click()
    await fixture.whenStable()
    expect(reminder.disable).toHaveBeenCalled()
  })

  // ✕ in iOS's sheet bar; «Fechar» at a Material dialog's foot elsewhere.
  it("closes from ✕ or «Fechar»", () => {
    create()
    const buttons = Array.from(host().querySelectorAll("button"))
    const close = buttons.find((b) => b.getAttribute("aria-label") === "Fechar")
    const foot = buttons.find((b) => b.textContent?.trim() === "Fechar")
    close?.click()
    foot?.click()
    expect(dialogRef.close).toHaveBeenCalledTimes(2)
  })

  it("explains where it can't be had, the switch disabled", () => {
    reminder.unsupported = "Adicione a app ao ecrã principal."
    create()
    expect(toggle()?.disabled).toBe(true)
    expect(host().textContent).toContain("ecrã principal")
  })
})
