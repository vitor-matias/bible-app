package org.capuchinhos.biblia.chrome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/** One sheet at a time, and the one asked for while the last was closing. */
class SheetQueueTest {
    private val gone = mutableListOf<Sheet>()
    private val sheets = SheetQueue { gone += it }
    private val answers = mutableListOf<Boolean>()
    private val answer: (Boolean) -> Unit = { answers += it }

    @Test
    fun presentsOverNothing() {
        sheets.present(Sheet.Appearance, answer)
        assertSame(Sheet.Appearance, sheets.sheet)
        assertEquals(listOf(true), answers)
    }

    @Test
    fun refusesOverASheetThatStays() {
        sheets.present(Sheet.Appearance)
        val shown = sheets.presentation
        sheets.present(notes("b"), answer)
        assertSame(Sheet.Appearance, sheets.sheet)
        assertEquals(shown, sheets.presentation)
        assertEquals(listOf(false), answers)
    }

    @Test
    fun bringsUpWhatWaitedOnceTheClosingSheetIsGone() {
        val first = notes("a")
        sheets.present(first)
        sheets.closing(first)
        val next = notes("b")
        sheets.present(next, answer)
        assertSame(first, sheets.sheet)
        assertEquals(emptyList<Boolean>(), answers)

        sheets.dismissed(first)
        assertSame(next, sheets.sheet)
        assertEquals(listOf(true), answers)
        assertEquals(listOf<Sheet>(first), gone)
    }

    // One verse's notes, asked for as another's closed, stayed down while the
    // web app heard they were up: composed in the same place, the new sheet
    // took over the closing one's hidden sheet state. Each is a presentation
    // of its own, which the overlay composes afresh.
    @Test
    fun numbersEachSheetThatComesUpEvenOfTheSameKind() {
        sheets.present(Sheet.Appearance)
        val first = sheets.presentation
        sheets.closing(Sheet.Appearance)
        sheets.present(Sheet.Appearance)
        sheets.dismissed(Sheet.Appearance)
        assertSame(Sheet.Appearance, sheets.sheet)
        assertNotEquals(first, sheets.presentation)
    }

    @Test
    fun dropsWhatWaitedWhenTheSheetIsDraggedBackUp() {
        val first = notes("a")
        sheets.present(first)
        sheets.closing(first)
        sheets.present(notes("b"), answer)
        sheets.reopened(first)
        assertEquals(listOf(false), answers)

        sheets.dismissed(first)
        assertNull(sheets.sheet)
    }

    // The web app follows only its latest request.
    @Test
    fun replacesARequestStillWaiting() {
        val first = notes("a")
        sheets.present(first)
        sheets.closing(first)
        sheets.present(notes("b"), answer)
        val latest = notes("c")
        sheets.present(latest, answer)
        assertEquals(listOf(false), answers)

        sheets.dismissed(first)
        assertSame(latest, sheets.sheet)
        assertEquals(listOf(false, true), answers)
    }

    @Test
    fun ignoresTheEndOfASheetAlreadyReplaced() {
        val first = notes("a")
        sheets.present(first)
        sheets.dismissed(first)
        sheets.present(Sheet.Appearance)
        sheets.dismissed(first)
        assertSame(Sheet.Appearance, sheets.sheet)
        assertEquals(listOf<Sheet>(first), gone)
    }

    private fun notes(title: String) =
        Sheet.Footnotes(FootnotesSheetState(title = title, fontScale = 1f, notes = emptyList()))
}
