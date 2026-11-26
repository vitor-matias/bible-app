package org.capuchinhos.biblia.chrome

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The system media session's payload (native-contract/media.json) and what it maps to. */
class MediaStateTest {
    private fun fixture() = MediaState.from(
        JSONObject(javaClass.classLoader!!.getResource("media.json")!!.readText()),
    )

    @Test
    fun readsWhatTheWebSends() {
        val state = fixture()
        assertEquals("Génesis 2", state.title)
        assertEquals("+365 · Dia 3", state.artist)
        assertTrue(state.playing)
        assertEquals(12.0, state.position, 0.0)
        assertEquals(224.0, state.duration, 0.0)
        assertEquals(1.25, state.rate, 0.0)
    }

    @Test
    fun runsOnAtTheRateWhilePlayingAndStandsStillPaused() {
        assertEquals(1.25f, mediaSpeed(fixture()), 0f)
        assertEquals(0f, mediaSpeed(fixture().copy(playing = false)), 0f)
    }

    @Test
    fun keepsThePositionWithinTheKnownLength() {
        assertEquals(12_000L, mediaPositionMs(fixture()))
        assertEquals(224_000L, mediaPositionMs(fixture().copy(position = 300.0)))
        assertEquals(0L, mediaPositionMs(fixture().copy(position = -3.0)))
        // Length unknown: the position stands.
        assertEquals(300_000L, mediaPositionMs(fixture().copy(position = 300.0, duration = 0.0)))
    }

    @Test
    fun unknownLengthIsMinusOne() {
        assertEquals(224_000L, mediaDurationMs(fixture()))
        assertEquals(-1L, mediaDurationMs(fixture().copy(duration = 0.0)))
    }

    @Test
    fun skipsFifteenSecondsEitherWay() {
        assertEquals(15, mediaSkipSeconds(true))
        assertEquals(-15, mediaSkipSeconds(false))
    }
}
