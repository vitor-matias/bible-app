import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { MatButton, MatIconButton } from "@angular/material/button"
import { MatDialogClose } from "@angular/material/dialog"
import { MatIcon } from "@angular/material/icon"
import { Mais365ReminderService } from "../../services/mais365-reminder.service"

/** The +365 page's daily reminder: a switch, and its time once on. */
@Component({
  selector: "mais365-reminder",
  imports: [MatButton, MatDialogClose, MatIcon, MatIconButton],
  templateUrl: "./mais365-reminder.component.html",
  styleUrl: "./mais365-reminder.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mais365ReminderComponent {
  protected readonly reminder = inject(Mais365ReminderService)

  constructor() {
    // The server's key ahead of the tap (the web), so it subscribes at once.
    this.reminder.prepare()
  }

  protected async toggle(input: HTMLInputElement): Promise<void> {
    await (input.checked ? this.reminder.enable() : this.reminder.disable())
    // Refused: the switch back off, as the binding's value never changed.
    input.checked = this.reminder.enabled()
  }
}
