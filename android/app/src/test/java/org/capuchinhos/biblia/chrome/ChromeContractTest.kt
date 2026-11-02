package org.capuchinhos.biblia.chrome

import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The payloads in native-contract/, which the iOS tests and the web app's
 * specs read too: what the web app really sends, as these bars read it.
 */
class ChromeContractTest {
    private fun fixture(name: String) = ChromeState.from(
        PluginCall(
            null,
            "NativeChrome",
            "1",
            "setState",
            JSObject(javaClass.classLoader!!.getResource("$name.json")!!.readText()),
        ),
    )

    @Test
    fun readsTheReader() {
        val state = fixture("reader")
        assertEquals(ChromeMode.Reader, state.mode)
        assertEquals("dark", state.themeMode)
        assertEquals("Deuteronómio 3", state.passageLabel)
        assertEquals(listOf("Dt 3"), state.passageShortLabels)
        assertEquals("Deuteronómio, capítulo 3", state.passageAccessibilityLabel)
        assertTrue(state.chapterNavigation)
        assertTrue(state.canGoPrevious)
        assertTrue(state.canGoNext)
        assertTrue(state.search)
        assertEquals("paged", state.viewMode)
        assertTrue(state.autoScrollVisible)
        assertTrue(state.autoScrollAvailable)
        assertTrue(state.canShare)
        assertTrue(state.canReport)
        assertEquals("red", state.bookmarkColor)
        assertEquals("vermelho", state.bookmarkName)
        assertEquals("20261018-120000Z", state.buildVersion)
        assertEquals(TextSize(percent = 120, min = 80, max = 200, canReset = true), state.textSize)
        assertTrue(state.inert)
        assertTrue(state.collapsed)
        assertTrue(state.scrolled)
        assertEquals(
            AutoScrollState(true, "1,5", "1,5 linhas por segundo", canSlower = true, canFaster = true, canPlay = false),
            state.autoScroll,
        )
        assertEquals("As bem-aventuranças", state.subtitle)
        assertEquals(0xFF121212.toInt(), state.pageColor)
    }

    @Test
    fun readsTheReaderWithNothingOptional() {
        val state = fixture("reader-minimal")
        assertEquals(ChromeMode.Reader, state.mode)
        assertEquals("system", state.themeMode)
        assertEquals("Génesis 1", state.passageLabel)
        assertEquals(emptyList<String>(), state.passageShortLabels)
        assertEquals("Génesis 1", state.passageAccessibilityLabel)
        assertFalse(state.chapterNavigation)
        assertFalse(state.canGoPrevious)
        assertFalse(state.search)
        assertNull(state.viewMode)
        assertNull(state.bookmarkColor)
        assertNull(state.bookmarkName)
        assertNull(state.buildVersion)
        assertNull(state.textSize)
        assertNull(state.autoScroll)
        assertNull(state.subtitle)
        assertNull(state.pageColor)
    }

    @Test
    fun readsTheSearchPage() {
        val state = fixture("search")
        assertEquals(ChromeMode.Search, state.mode)
        assertEquals("dark", state.themeMode)
        assertEquals("amor", state.query)
        assertTrue(state.inert)
        assertEquals(0xFF121212.toInt(), state.pageColor)
    }

    @Test
    fun readsAPlainPage() {
        val state = fixture("page")
        assertEquals(ChromeMode.Page, state.mode)
        assertEquals("light", state.themeMode)
        assertEquals("Livros", state.title)
        assertTrue(state.search)
        assertTrue(state.scrolled)
        assertEquals(0xFFFFFFFF.toInt(), state.pageColor)
    }

    @Test
    fun readsNoBars() {
        val state = fixture("none")
        assertEquals(ChromeMode.None, state.mode)
        assertEquals(ChromeState(), state)
    }
}
