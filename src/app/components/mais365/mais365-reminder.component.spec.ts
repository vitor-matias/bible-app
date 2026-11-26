import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { Mais365ReminderService } from "../../services/mais365-reminder.service"
import { Mais365ReminderComponent } from "./mais365-reminder.component"

describe("Mais365ReminderComponent", () => {
  let fixture: ComponentFixture<Mais365ReminderComponent>
  let reminder: {
    enabled: ReturnType<typeof signal<boolean>>
    busy: ReturnType<typeof signal<boolean>>
    problem: ReturnType<typeof signal<string | null>>
    time: ReturnType<typeof signal<string>>
    unsupported: string | null
    enable: ReturnType<typeof vi.fn>
    disable: ReturnType<typeof vi.fn>
    setTime: ReturnType<typeof vi.fn>
  }

  const host = (): HTMLElement => fixture.nativeElement
  const toggle = () =>
    host().querySelector<HTMLInputElement>('input[role="switch"]')
  const time = () =>
    host().querySelector<HTMLInputElement>('input[type="time"]')

  function create() {
    TestBed.configureTestingModule({
      providers: [{ provide: Mais365ReminderService, useValue: reminder }],
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
      unsupported: null,
      enable: vi.fn(async () => reminder.enabled.set(true)),
      disable: vi.fn(async () => reminder.enabled.set(false)),
      setTime: vi.fn(),
    }
  })

  it("shows the switch off, named plainly", () => {
    create()
    expect(host().textContent).toContain("Lembrete diário")
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

  it("explains where it can't be had, the switch disabled", () => {
    reminder.unsupported = "Adicione a app ao ecrã principal."
    create()
    expect(toggle()?.disabled).toBe(true)
    expect(host().textContent).toContain("ecrã principal")
  })
})
