package org.capuchinhos.biblia.chrome

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** A line of the book list: a testament's heading, a group's, or a book. */
sealed interface PickerRow {
    val key: String

    data class Testament(val title: String) : PickerRow {
        override val key = "testament:$title"
    }

    data class Group(val title: String) : PickerRow {
        override val key = "group:$title"
    }

    data class Book(val book: PassagePickerData.Book) : PickerRow {
        override val key = "book:${book.id}"
    }
}

/**
 * The book list's lines, the books that match [filter] (folded, see [fold])
 * under their headings; a heading with none left goes too. A group's own
 * introduction is found by the group's name ("Pentateuco").
 */
fun pickerRows(data: PassagePickerData, filter: String): List<PickerRow> {
    val query = fold(filter.trim())
    return data.sections.flatMap { section ->
        val groups = section.groups.mapNotNull { group ->
            val books = group.books.filter { book ->
                query.isEmpty() ||
                    listOfNotNull(book.label, book.name, book.abbreviation, group.title, section.title)
                        .any { fold(it).contains(query) }
            }
            if (books.isEmpty()) {
                null
            } else {
                listOfNotNull(group.title?.let { PickerRow.Group(it) }) + books.map { PickerRow.Book(it) }
            }
        }
        if (groups.isEmpty()) emptyList() else listOf(PickerRow.Testament(section.title)) + groups.flatten()
    }
}

/**
 * How the picker shows the books: a list with each book's abbreviation and
 * chapters, or tiles as in the iOS app, big with the names or small with the
 * abbreviations.
 */
enum class BookView(val preference: String) {
    List("list"),
    Names("names"),
    Abbreviations("abbreviations");

    companion object {
        /** The list until the reader picks another. */
        fun fromPreference(value: String?): BookView = entries.firstOrNull { it.preference == value } ?: List
    }
}

/**
 * The narrowest a book's tile gets: three names to a phone's row, or six
 * abbreviations. Wider with larger text, as the iOS app's, up to twice.
 */
fun bookTileMinWidth(compact: Boolean, textScale: Float): Dp =
    (if (compact) 56.dp else 104.dp) * textScale.coerceIn(1f, 2f)

/** "1 Tessalonicenses" keeps its number on the name's line. */
fun tileLabel(label: String): String = label.replace(LEADING_NUMBER, "$1 ")

private val LEADING_NUMBER = Regex("^(\\d+) ")

/** Whether lines ending at [lineEnds] (each line's end offset) only break [text] between words. */
fun breaksBetweenWords(text: String, lineEnds: List<Int>): Boolean =
    lineEnds.all { end -> end in 1..text.length && text[end - 1].let { it == ' ' || it == '-' } }
