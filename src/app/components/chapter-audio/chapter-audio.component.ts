import { isPlatformBrowser } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
} from "@angular/core"
import { rxResource } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { PodcastPlayerService } from "../../services/podcast-player.service"

/** One touch plays the +365 episode that reads this chapter, from its start. */
@Component({
  selector: "chapter-audio",
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (episode(); as episode) {
      <div class="chapter-audio">
        @if (loaded()) {
          <button type="button" matIconButton class="skip-back" (click)="player.skip(-10)" aria-label="Recuar 10 segundos">
            <mat-icon aria-hidden="true">replay_10</mat-icon>
          </button>
        }
        <button type="button" mat-stroked-button class="toggle" (click)="player.toggle(episode)">
          <mat-icon aria-hidden="true">{{ playingThis() ? "pause" : "play_arrow" }}</mat-icon>
          {{ playingThis() ? "Pausar" : "Ouvir no +365" }}
        </button>
        @if (loaded()) {
          <button type="button" matIconButton class="skip-forward" (click)="player.skip(10)" aria-label="Avançar 10 segundos">
            <mat-icon aria-hidden="true">forward_10</mat-icon>
          </button>
          <button type="button" mat-button class="rate" (click)="player.nextRate()"
            [attr.aria-label]="'Velocidade ' + rateLabel() + ', mudar'">{{ rateLabel() }}</button>
        }
      </div>
    }
  `,
  styles: `
    .chapter-audio {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.25rem;
      margin-block: 0.5rem 1rem;
    }
  `,
})
export class ChapterAudioComponent {
  readonly bookId = input.required<string>()
  readonly chapter = input.required<number>()

  protected readonly player = inject(PodcastPlayerService)
  // Browser only: the prerendered page carries no button for a stream it can't play.
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))

  private readonly episodes = rxResource({
    params: () =>
      this.browser
        ? { bookId: this.bookId(), chapter: this.chapter() }
        : undefined,
    stream: ({ params }) =>
      this.player.episodesFor(params.bookId, params.chapter),
  })

  /** The earliest episode that reads the chapter. */
  protected readonly episode = computed(() => this.episodes.value()?.[0])

  /** This chapter's entry is in the player, playing or paused. */
  protected readonly loaded = computed(() => {
    const episode = this.episode()
    return !!episode && this.player.isCurrent(episode)
  })

  protected readonly rateLabel = computed(
    () => `${String(this.player.rate()).replace(".", ",")}×`,
  )

  protected readonly playingThis = computed(() => {
    const episode = this.episode()
    return !!episode && this.player.isCurrent(episode) && this.player.playing()
  })
}
