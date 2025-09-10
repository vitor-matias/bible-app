import { ChangeDetectionStrategy, Component } from "@angular/core"

import { CommonModule } from "@angular/common"

import { Router, RouterOutlet } from "@angular/router"

import { BibleApiService } from "./services/bible-api.service"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, RouterOutlet],
})
export class AppComponent {}
