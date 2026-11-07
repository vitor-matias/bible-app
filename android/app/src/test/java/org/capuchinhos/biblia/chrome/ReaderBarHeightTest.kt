package org.capuchinhos.biblia.chrome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The top bar's height, which the page's text is padded by, must not depend on a heading showing. */
class ReaderBarHeightTest {
    // Material's titleLarge and bodyMedium line heights (28 and 20 sp) at a text scale.
    private fun height(base: Float, scale: Float) = readerBarHeightDp(base, 28f * scale, 20f * scale, scale)

    @Test
    fun theSubtitleLineIsAlwaysReservedBelowTheLimit() {
        // At 1.29 the heading line is what lifts the bar past 64: it must be there from the first line.
        assertTrue(height(64f, 1.29f) > 64f)
        assertTrue(subtitleFits(1.29f))
    }

    @Test
    fun aShortWindowReservesItToo() {
        assertEquals(28f * 1.1f + 20f * 1.1f + 8f, height(56f, 1.1f), 0.001f)
    }

    @Test
    fun leavesTheSubtitleOutFromTheLimit() {
        assertEquals(64f, height(64f, 1.3f), 0.001f)
        assertEquals(28f * 2.5f + 8f, height(64f, 2.5f), 0.001f)
    }

    @Test
    fun keepsTheBaseWhereTextIsSmall() {
        assertEquals(64f, height(64f, 1f), 0.001f)
        assertEquals(56f, height(56f, 1f), 0.001f)
    }
}
