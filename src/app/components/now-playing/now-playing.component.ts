import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core"
import { MatIconButton } from "@angular/material/button"
import { MatIcon } from "@angular/material/icon"
import { Mais365Service } from "../../services/mais365.service"
import { PodcastPlayerService } from "../../services/podcast-player.service"

/**
 * +365 playing on a page without the reader's player (search): what plays,
 * and a way to pause it.
 */
@Component({
  selector: "now-playing",
  imports: [MatIcon, MatIconButton],
  template: `
    @if (shown(); as current) {
    <div class="now-playing" role="group" aria-label="+365">
      <button type="button" mat-icon-button [attr.aria-label]="player.playing() ? 'Pausar o +365' : 'Ouvir o +365'"
        (click)="toggle()">
        <mat-icon>{{ player.playing() ? 'pause' : 'play_arrow' }}</mat-icon>
      </button>
      <span class="what">
        <span class="title">{{ current.title }}</span>
        <span class="context">{{ context() }}</span>
      </span>
    </div>
    }
  `,
  styles: `
    .now-playing {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0 16px;
      padding: 4px 16px 4px 4px;
      border-radius: 28px;
      background: color-mix(in srgb, var(--text-color) 8%, transparent);
    }
    .what {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title,
    .context {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .context {
      font-size: 0.85em;
      opacity: 0.7;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NowPlayingComponent {
  protected readonly player = inject(PodcastPlayerService)
  private readonly plan = inject(Mais365Service)

  /** Playing, or a day of the plan paused: not audio left behind after ✕. */
  protected readonly shown = computed(() => {
    const current = this.player.current()
    return current && (this.player.playing() || this.plan.active())
      ? current
      : null
  })

  protected readonly context = computed(() => {
    const day = this.plan.active()
    return day ? `+365 · Dia ${day.day}` : "+365"
  })

  protected toggle(): void {
    if (this.plan.active()) this.plan.toggle()
    else {
      const current = this.player.current()
      if (current) this.player.toggle(current)
    }
  }
}
