import { CommonModule } from "@angular/common"
import { NgModule } from "@angular/core"
import { PinchToZoomDirective } from "../directives/pinch-to-zoom.directive"

@NgModule({
  declarations: [PinchToZoomDirective],
  imports: [CommonModule],
  exports: [PinchToZoomDirective],
})
export class AppModule {}
