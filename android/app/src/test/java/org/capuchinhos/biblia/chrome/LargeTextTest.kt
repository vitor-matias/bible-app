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
}
