import { ElementRef, type Renderer2 } from "@angular/core"
import { PinchToZoomDirective } from "./pinch-to-zoom.directive"

describe("AppPinchToZoomDirective", () => {
  it("should create an instance", () => {
    const elementRef = new ElementRef(document.createElement("div"))
    const renderer: Renderer2 = {} as Renderer2 // Replace {} with the actual renderer instance
    const directive = new PinchToZoomDirective(elementRef, renderer)
    expect(directive).toBeTruthy()
  })
})
