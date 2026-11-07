package org.capuchinhos.biblia.chrome

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** One share sheet at a time: a second tap must not take over the first. */
class ShareSessionTest {
    private val share = ShareSession()

    @Test
    fun refusesASecondSheetWhileOneIsOpen() {
        assertTrue(share.begin())
        assertFalse(share.begin())
    }

    @Test
    fun aRefusedSecondSheetDoesNotWipeTheFirstChoice() {
        share.begin()
        share.choose()
        share.begin()
        assertTrue(share.end())
    }

    @Test
    fun allowsANewSheetOnceTheLastClosed() {
        share.begin()
        share.end()
        assertTrue(share.begin())
    }

    @Test
    fun reportsWhetherAnAppWasChosen() {
        share.begin()
        assertFalse(share.end())
        share.begin()
        share.choose()
        assertTrue(share.end())
    }

    @Test
    fun aChoiceDoesNotOutliveItsSheet() {
        share.begin()
        share.choose()
        share.end()
        share.begin()
        assertFalse(share.end())
    }

    @Test
    fun ignoresAChoiceWithNoSheetOpen() {
        share.choose()
        share.begin()
        assertFalse(share.end())
    }
}
