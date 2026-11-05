import { NgStyle } from "@angular/common"
import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core"

/** How the letters around the finger grow, from the one under it outwards. */
const MAGNIFICATION_CURVE = [1, 0.7, 0.5, 0.3, 0.1]
const MAGNIFICATION_MULTIPLIER = 2
/** 0, not the package's 1: with it, a normal phone lost half its letters. */
const LETTER_SPACING_PERCENT = 0
const DIVIDER = "·"

/**
 * Ported from alphabetical-scroll-bar 2.1.2 by mooalot (MIT licence,
 * github.com/mooalot/alphabetical-scroll-bar), whose published package can't be
 * compiled by Angular since it dropped View Engine libraries. The layout and
 * magnification are the package's, less its options this page doesn't use;
 * tapping the same letter twice goes there again, which the package ignored.
 */
@Component({
  selector: "alphabetical-scroll-bar",
  imports: [NgStyle],
  template: `
    <div #alphabetContainer class="container">
      @for (letter of visibleLetters(); track $index) {
      <div
        class="letter"
        [class.current]="$index === currentIndex()"
        [ngStyle]="letterStyle($index)"
      >
        <span>{{ letter }}</span>
      </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      user-select: none;
      -webkit-user-select: none;
      /* A drag along it is the bar's, not the page's scroll. */
      touch-action: none;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      height: 100%;
      cursor: pointer;
    }
    .letter {
      position: relative;
      padding: 0 20px;
      pointer-events: none;
      transform-origin: 60%;
      transition: transform 0.2s ease-in-out;
    }
    .letter span {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
    }
    /* As the toolbar's buttons. */
    .current span {
      background-color: antiquewhite;
      color: var(--cap-brown);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(mousemove)": "focus($event)",
    "(mouseenter)": "focus($event)",
    "(touchmove)": "focus($event)",
    "(touchstart)": "focus($event)",
    "(click)": "focus($event)",
    "(mouseleave)": "end()",
    "(touchend)": "end()",
    "(touchcancel)": "end()",
    "(window:resize)": "0",
  },
})
export class AlphabeticalScrollBarComponent {
  readonly alphabet = input.required<string[]>()
  /** The letter to highlight: where the page has scrolled to. */
  readonly current = input<string | null>(null)
  /** A letter chosen by a tap, a click or a drag. */
  readonly letterChange = output<string>()
  /** True as the bar is touched, false when the finger lifts. */
  readonly isActive = output<boolean>()

  readonly visibleLetters = signal<string[]>([])
  /** Where the current letter is shown, or the dot that stands in for it. */
  readonly currentIndex = computed(() => {
    const current = this.current()
    if (current === null) return -1
    const shown = this.visibleLetters()
    const index = shown.indexOf(current)
    if (index >= 0) return index
    const alphabet = this.alphabet()
    const position = alphabet.indexOf(current)
    return position < 0
      ? -1
      : Math.round((position / (alphabet.length - 1)) * (shown.length - 1))
  })

  private readonly container =
    viewChild<ElementRef<HTMLElement>>("alphabetContainer")
  private readonly magIndex = signal<number | null>(null)
  private readonly magnifying = signal(false)

  private lettersShortened = false
  private lastHeight?: number
  private lastAlphabet?: string[]
  private lastLetter?: string
  private lastActive = false

  constructor() {
    afterEveryRender(() => this.checkVisibleLetters())
  }

  /** The letters that fit the height, with dividers for those that don't. */
  private checkVisibleLetters(): void {
    const element = this.container()?.nativeElement
    if (!element) return
    const height = element.clientHeight
    const alphabet = this.alphabet()
    if (height === this.lastHeight && alphabet === this.lastAlphabet) return
    this.lastHeight = height
    this.lastAlphabet = alphabet

    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize)
    const letterSize =
      fontSize * MAGNIFICATION_MULTIPLIER +
      height * (LETTER_SPACING_PERCENT / 100)
    this.lettersShortened = height / letterSize < alphabet.length
    if (!this.lettersShortened) {
      this.visibleLetters.set(alphabet)
      return
    }

    const hidden = alphabet.length - Math.floor(height / letterSize)
    if (hidden >= alphabet.length) {
      this.visibleLetters.set([])
      return
    }
    const halves = this.hiddenHalves(hidden, alphabet.length) + 1
    let first = alphabet.slice(0, Math.ceil(alphabet.length / 2))
    let second = alphabet.slice(Math.floor(alphabet.length / 2)).reverse()
    for (let i = 0; i < halves; i++) {
      first = first.filter((_, index) => index % 2 === 0)
      second = second.filter((_, index) => index % 2 === 0)
    }
    const withDividers = (letters: string[]) =>
      letters.flatMap((letter, index) =>
        index > 0 ? [DIVIDER, letter] : [letter],
      )
    const start = withDividers(first)
    if (alphabet.length % 2 === 0) start.push(DIVIDER)
    this.visibleLetters.set(start.concat(withDividers(second).reverse()))
  }

  private hiddenHalves(hidden: number, total: number): number {
    return hidden > total / 2
      ? 1 + this.hiddenHalves(hidden % (total / 2), Math.ceil(total / 2))
      : 0
  }

  letterStyle(index: number): Record<string, string | number> {
    const magIndex = this.magIndex()
    const letters = this.visibleLetters()
    if (!this.magnifying() || magIndex === null || letters[index] === DIVIDER) {
      return {}
    }
    const count = letters.filter((letter) => letter !== DIVIDER).length
    const distance = Math.abs(
      Math.round((magIndex / letters.length) * count) -
        Math.round((index / letters.length) * count),
    )
    const scale =
      distance < MAGNIFICATION_CURVE.length - 1
        ? MAGNIFICATION_CURVE[distance] * (MAGNIFICATION_MULTIPLIER - 1) + 1
        : 1
    return {
      transform: `scale(${scale})`,
      zIndex: magIndex === index ? 1 : 0,
    }
  }

  focus(event: MouseEvent | TouchEvent): void {
    if (!this.lastActive) {
      this.lastActive = true
      this.isActive.emit(true)
    }
    this.magnifying.set(event.type !== "click")
    const point = "touches" in event ? event.touches[0] : event
    const letter = this.letterAt(point.clientY)
    if (letter && letter !== this.lastLetter && !event.type.includes("mouse")) {
      this.lastLetter = letter
      this.letterChange.emit(letter)
    }
  }

  end(): void {
    this.magnifying.set(false)
    this.lastActive = false
    // So that the same letter can be chosen again, having scrolled away.
    this.lastLetter = undefined
    this.isActive.emit(false)
  }

  private letterAt(y: number): string | undefined {
    const element = this.container()?.nativeElement
    if (!element) return undefined
    const height = element.clientHeight
    const top = Math.min(
      Math.max(0, y - element.getBoundingClientRect().top),
      height,
    )
    const letters = this.visibleLetters()
    const index = Math.round((top / height) * (letters.length - 1))
    this.magIndex.set(index)
    if (this.lettersShortened) {
      const alphabet = this.alphabet()
      return alphabet[Math.round((top / height) * (alphabet.length - 1))]
    }
    return letters[index]
  }
}
