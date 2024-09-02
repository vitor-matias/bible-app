// biome-ignore lint/style/useImportType: <explanation>
import { Directive, ElementRef, HostListener, Renderer2 } from "@angular/core"
import Hammer from "hammerjs" // Import the 'Hammer' class from 'hammerjs' library

@Directive({
  selector: "[pinch-to-zoom]",
})
export class PinchToZoomDirective {
  private hammer: HammerManager
  private baseFontSize: number

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
  ) {
    // Get the initial font size
    const computedStyle = getComputedStyle(this.el.nativeElement)
    this.baseFontSize = Number.parseFloat(computedStyle.fontSize) || 105 // Default to 16px if no font size is set

    const storedSize = localStorage.getItem(`fontSize${el.nativeElement.name}`)

    if (storedSize) {
      this.setFontSize(Number(storedSize))
    }

    // Initialize Hammer.js
    this.hammer = new Hammer(this.el.nativeElement)
    this.hammer.get("pinch").set({ enable: true })

    this.hammer.on("pinch", (event) => this.onPinch(event))
  }

  onPinch(event: HammerInput) {
    console.log("Pinch event detected:", event)
    const scale = event.scale
    let newFontSize = this.baseFontSize * scale
    newFontSize = Math.max(70, Math.min(newFontSize, 180))

    this.setFontSize(newFontSize)

    // Store the new font size in storage
    localStorage.setItem(
      `fontSize${this.el.nativeElement.name}`,
      newFontSize.toString(),
    )
  }

  setFontSize(newFontSize: number) {
    this.renderer.setStyle(
      this.el.nativeElement,
      "font-size",
      `${newFontSize}%`,
    )
  }
}
