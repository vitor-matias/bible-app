package org.capuchinhos.biblia.chrome

import org.junit.Assert.assertEquals
import org.junit.Test

/** At large system text sizes the native chrome makes room rather than cutting labels. */
class LargeTextTest {
    @Test
    fun choicesStackWhereALabelWouldBeCut() {
        // Font scale 2.0 at 130 % display size: a third of the row was 300 px,
        // "Automático" 380 px at autoSize's smallest.
        val theme = listOf(380f, 240f, 280f)
        assertEquals(
            ChoiceArrangement.Stacked,
            choiceArrangement(compact = true, buttonWidth = 300f, besideWidths = theme, aboveWidths = theme, icon = 80f, padding = 27f),
        )
        assertEquals(
            ChoiceArrangement.Stacked,
            choiceArrangement(compact = false, buttonWidth = 300f, besideWidths = emptyList(), aboveWidths = theme, icon = 80f, padding = 27f),
        )
    }

    @Test
    fun choicesKeepTheirRowWhereLabelsFit() {
        assertEquals(
            ChoiceArrangement.Beside,
            choiceArrangement(compact = true, buttonWidth = 300f, besideWidths = listOf(150f, 90f), aboveWidths = listOf(120f, 75f), icon = 72f, padding = 24f),
        )
        assertEquals(
            ChoiceArrangement.Above,
            choiceArrangement(compact = true, buttonWidth = 300f, besideWidths = listOf(230f, 90f), aboveWidths = listOf(190f, 75f), icon = 72f, padding = 24f),
        )
        assertEquals(
            ChoiceArrangement.Above,
            choiceArrangement(compact = false, buttonWidth = 300f, besideWidths = emptyList(), aboveWidths = listOf(190f, 75f), icon = 72f, padding = 24f),
        )
    }

    @Test
    fun ribbonsGoTwoARowWhenANameWouldBeCut() {
        // 10 dp gaps and 4 dp paddings at 3.4 px/dp: a quarter of 1000 px leaves 197 px for the label.
        assertEquals(4, ribbonColumns(rowWidth = 1000f, widestLabel = 190f, gap = 34f, padding = 13.6f))
        assertEquals(2, ribbonColumns(rowWidth = 1000f, widestLabel = 260f, gap = 34f, padding = 13.6f))
    }

    @Test
    fun theTitleTakesTheLongestLabelThatFitsWithItsCaret() {
        // "Deuteronómio 3", "Dt 3".
        assertEquals(FittedPassage(1, 1f, caret = true, fits = true), fitPassage(listOf(400, 120), withCaret = 200, bare = 260, minScale = 1f))
        assertEquals(FittedPassage(0, 1f, caret = true, fits = true), fitPassage(listOf(180, 120), withCaret = 200, bare = 260, minScale = 1f))
    }

    @Test
    fun atLargeTextTheTitleShrinksAndKeepsItsCaret() {
        // Font scale 2.0: "Índice" was cut to "…ice", "Jo 3" lost its ▾.
        assertEquals(FittedPassage(0, 0.56f, caret = true, fits = true), fitPassage(listOf(500), withCaret = 280, bare = 362, minScale = 0.5f))
        assertEquals(FittedPassage(0, 0.93f, caret = true, fits = true), fitPassage(listOf(300), withCaret = 280, bare = 362, minScale = 0.5f))
        // Measured on a Pixel 9a at 200 % and 130 % display size: "Índice" at 0.63 of its size, not without its ▾.
        assertEquals(FittedPassage(1, 0.6286f, caret = true, fits = true), fitPassage(listOf(1206, 324), withCaret = 204, bare = 286, minScale = 0.6286f))
    }

    @Test
    fun theCaretMakesWayBeforeTheTitleIsCut() {
        // At the default text size nothing shrinks.
        assertEquals(FittedPassage(1, 1f, caret = false, fits = true), fitPassage(listOf(400, 250), withCaret = 200, bare = 260, minScale = 1f))
        assertEquals(FittedPassage(1, 1f, caret = false, fits = false), fitPassage(listOf(400, 300), withCaret = 200, bare = 260, minScale = 1f))
        assertEquals(FittedPassage(0, 0.5f, caret = false, fits = false), fitPassage(listOf(900), withCaret = 280, bare = 362, minScale = 0.5f))
    }

    @Test
    fun withoutTheCaretTheLongestLabelThatFitsWholeIsKept() {
        // At the default size the full name fits without the ▾: not a shorter form than needed.
        assertEquals(FittedPassage(0, 1f, caret = false, fits = true), fitPassage(listOf(255, 230), withCaret = 200, bare = 260, minScale = 1f))
        // At large text, shrinking the shortest with its ▾ still comes first.
        assertEquals(FittedPassage(1, 0.86f, caret = true, fits = true), fitPassage(listOf(255, 230), withCaret = 200, bare = 260, minScale = 0.5f))
    }

    @Test
    fun theViewButtonSaysItsNameFirst() {
        assertEquals("Vista: lista", bookViewButtonLabel(BookView.List))
        assertEquals("Vista: grelha com abreviaturas", bookViewButtonLabel(BookView.Abbreviations))
    }

    @Test
    fun theAutoScrollButtonSaysWhatItStarts() {
        assertEquals("Iniciar deslocamento automático", autoScrollToggleLabel(playing = false))
        assertEquals("Pausar deslocamento automático", autoScrollToggleLabel(playing = true))
    }
}
