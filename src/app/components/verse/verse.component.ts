import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'verse',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verse.component.html',
  styleUrl: './verse.component.css'
})
export class VerseComponent {

  @Input()
  data!: Verse

}
