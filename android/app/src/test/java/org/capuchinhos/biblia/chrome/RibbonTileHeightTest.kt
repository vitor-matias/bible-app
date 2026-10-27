package org.capuchinhos.biblia.chrome

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test

/** The bookmarks sheet's tiles grow with the text size instead of clipping the label. */
class RibbonTileHeightTest {
    @Test
    fun keepsTheDesignedHeightAtNormalText() {
        // labelLarge's 20 sp line at font scale 1.0 and 1.5.
        assertEquals(84.dp, ribbonTileMinHeight(20.dp))
        assertEquals(84.dp, ribbonTileMinHeight(30.dp))
    }

    @Test
    fun growsToFitTheLabelAtLargeText() {
        // Font scale 1.8 and 2.0: the 84 dp tile clipped by 6 and 10 dp.
        assertEquals(90.dp, ribbonTileMinHeight(36.dp))
        assertEquals(94.dp, ribbonTileMinHeight(40.dp))
    }
}
