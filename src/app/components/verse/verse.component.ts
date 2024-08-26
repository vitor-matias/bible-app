import { CommonModule } from "@angular/common"
import { ChangeDetectionStrategy, Component, Input } from "@angular/core"

@Component({
	selector: "verse",
	standalone: true,
	imports: [CommonModule],
	templateUrl: "./verse.component.html",
	styleUrl: "./verse.component.css",
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerseComponent {
	isChapterNumberDisplayed = false
	chapterNumberIndex = 0

	@Input()
	data!: Verse

	shouldDisplayChapterNumber(
		data: Verse,
		text: TextType,
		index: number,
		isLast: boolean,
	): boolean {
		if (
			!this.isChapterNumberDisplayed &&
			data.number === 0 &&
			((text.type === "section" && text.tag === "s2") ||
				(!this.hasSection(data.text) && isLast))
		) {
			this.isChapterNumberDisplayed = true
			this.chapterNumberIndex = index
			return true
		}
		return false
	}

	hasSection(data: TextType[]): boolean {
		return data.some((text) => text.type === "section" && text.tag === "s2")
	}
}
