import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { Mais365ReminderService } from "../../services/mais365-reminder.service"

/** The +365 page's daily reminder: a switch, and its time once on. */
@Component({
  selector: "mais365-reminder",
  templateUrl: "./mais365-reminder.component.html",
  styleUrl: "./mais365-reminder.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mais365ReminderComponent {
  protected readonly reminder = inject(Mais365ReminderService)

  protected async toggle(input: HTMLInputElement): Promise<void> {
    await (input.checked ? this.reminder.enable() : this.reminder.disable())
    // Refused: the switch back off, as the binding's value never changed.
    input.checked = this.reminder.enabled()
  }
}
