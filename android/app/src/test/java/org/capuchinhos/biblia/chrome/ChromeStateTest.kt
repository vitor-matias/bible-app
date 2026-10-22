package org.capuchinhos.biblia.chrome

import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the web app sends (native-chrome.service.ts), as the bars read it. */
class ChromeStateTest {
    private fun call(json: String) = PluginCall(null, "NativeChrome", "1", "setState", JSObject(json))

    @Test
    fun readsTheReadersBars() {
        val state = ChromeState.from(
            call(
                """
                {"mode":"reader","themeMode":"dark","passageLabel":"Deuteronómio 3",
                 "passageShortLabels":["Dt 3"],"passageAccessibilityLabel":"Deuteronómio, capítulo 3",
                 "chapterNavigation":true,"canGoPrevious":true,"canGoNext":false,"search":true,
                 "viewMode":"paged","autoScrollVisible":true,"autoScrollAvailable":true,
                 "canShare":true,"canReport":false,"bookmarkColor":"red","bookmarkName":"vermelho",
                 "buildVersion":"20261018-120000Z","inert":false,"collapsed":true,"scrolled":true,
                 "subtitle":"As bem-aventuranças",
                 "autoScroll":{"playing":true,"speedLabel":"1,5×","speedAccessibilityLabel":"1,5 linhas por segundo",
                   "canSlower":true,"canFaster":false}}
                """,
            ),
        )
        assertEquals(ChromeMode.Reader, state.mode)
        assertEquals("dark", state.themeMode)
        assertEquals(listOf("Dt 3"), state.passageShortLabels)
        assertEquals("Deuteronómio, capítulo 3", state.passageAccessibilityLabel)
        assertTrue(state.canGoPrevious)
        assertFalse(state.canGoNext)
        assertEquals("paged", state.viewMode)
        assertEquals("red", state.bookmarkColor)
        assertTrue(state.collapsed)
        assertTrue(state.scrolled)
        assertEquals("As bem-aventuranças", state.subtitle)
        assertEquals(
            AutoScrollState(true, "1,5×", "1,5 linhas por segundo", canSlower = true, canFaster = false),
            state.autoScroll,
        )
    }

    // The web app sends null for what a page doesn't show.
    @Test
    fun readsNullAsAbsent() {
        val state = ChromeState.from(
            call("""{"mode":"reader","viewMode":null,"bookmarkColor":null,"autoScroll":null,"passageLabel":"Mt 5"}"""),
        )
        assertNull(state.viewMode)
        assertNull(state.bookmarkColor)
        assertNull(state.autoScroll)
        assertNull(state.subtitle)
        // Spoken as shown, when no spoken form comes.
        assertEquals("Mt 5", state.passageAccessibilityLabel)
    }

    // At the page's end there's nothing to play; older web bundles don't say.
    @Test
    fun readsWhetherAutoScrollCanPlay() {
        val atEnd = ChromeState.from(
            call("""{"mode":"reader","autoScroll":{"playing":false,"speedLabel":"1","canPlay":false}}"""),
        )
        assertFalse(atEnd.autoScroll!!.canPlay)
        val older = ChromeState.from(call("""{"mode":"reader","autoScroll":{"playing":false,"speedLabel":"1"}}"""))
        assertTrue(older.autoScroll!!.canPlay)
    }

    @Test
    fun readsTheTextSize() {
        val state = ChromeState.from(
            call("""{"mode":"reader","textSize":{"percent":120,"min":70,"max":235,"canReset":true}}"""),
        )
        assertEquals(TextSize(120, 70, 235, canReset = true), state.textSize)
        assertTrue(state.textSize!!.canDecrease)
        assertTrue(state.textSize!!.canIncrease)
        // Off at either end of the range.
        assertFalse(TextSize(70, 70, 235, canReset = true).canDecrease)
        assertFalse(TextSize(235, 70, 235, canReset = true).canIncrease)
        assertNull(ChromeState.from(call("""{"mode":"reader","textSize":null}""")).textSize)
    }

    @Test
    fun readsThePagesColour() {
        assertEquals(0xFF121212.toInt(), ChromeState.from(call("""{"mode":"reader","pageColor":"#121212"}""")).pageColor)
        assertNull(ChromeState.from(call("""{"mode":"reader","pageColor":"white"}""")).pageColor)
    }

    // A section without a heading sends an empty one.
    @Test
    fun readsABlankSubtitleAsNone() {
        assertNull(ChromeState.from(call("""{"mode":"reader","subtitle":"  "}""")).subtitle)
    }

    @Test
    fun hidesTheBarsForAnUnknownMode() {
        assertEquals(ChromeMode.None, ChromeState.from(call("""{"mode":"gallery"}""")).mode)
        assertEquals(ChromeState(), ChromeState.from(call("{}")))
    }

    @Test
    fun readsThePickersBooksAndChapters() {
        val data = PassagePickerData.from(
            call(
                """
                {"currentBookId":"sl","currentChapter":23,"sections":[{"title":"Antigo Testamento","groups":[
                  {"books":[{"id":"intro-at","label":"Introdução","name":"Introdução ao AT","abbreviation":"Intro","chapters":[]}]},
                  {"title":"Livros Sapienciais","books":[{"id":"sl","label":"Salmos","name":"Livro dos Salmos",
                    "abbreviation":"Sl","chapters":[{"number":0,"label":"","title":"Introdução"},
                    {"number":23,"label":"23","detail":"22","spoken":"Salmo 23, na liturgia 22","bookmark":"blue"}]}]}]}]}
                """,
            ),
        )
        val groups = data.sections.single().groups
        assertNull(groups[0].title)
        assertEquals("Livros Sapienciais", groups[1].title)
        val psalms = data.currentBook!!
        assertEquals("sl", psalms.id)
        val psalm = psalms.chapters[1]
        assertEquals("22", psalm.detail)
        assertEquals("blue", psalm.bookmark)
        assertNull(psalms.chapters[0].detail)
        assertEquals(23, data.currentChapter)
    }

    @Test
    fun readsNotesWithTheirLinks() {
        val notes = FootnotesSheetState.from(
            call(
                """
                {"title":"Génesis 1,1","fontScale":1.25,"notes":[{"reference":"1.","parts":[
                  {"text":"Ver "},{"text":"Ex 20,11","link":0},{"text":"."}]}]}
                """,
            ),
        )
        assertEquals(1.25f, notes.fontScale)
        assertEquals(
            listOf(
                FootnotesSheetState.Part("Ver ", null),
                FootnotesSheetState.Part("Ex 20,11", 0),
                FootnotesSheetState.Part(".", null),
            ),
            notes.notes.single().parts,
        )
    }

    @Test
    fun readsTheRibbonsAndTheMove() {
        val sheet = BookmarksSheetState.from(
            call(
                """
                {"currentLabel":"Mateus 7","ribbons":[{"color":"red","name":"Vermelho","label":"Mt 5","current":false},
                  {"color":"orange","name":"Laranja","label":null,"current":false}],
                 "move":{"color":"red","name":"vermelho","from":"Mateus 5","done":false}}
                """,
            ),
        )
        assertEquals("Mt 5", sheet.ribbons[0].label)
        assertNull(sheet.ribbons[1].label)
        assertEquals(BookmarksSheetState.Move("red", "vermelho", "Mateus 5", done = false), sheet.move)
    }

    // The About page's ribbons open their passages but mark nothing; older
    // web bundles don't say, and every page could be marked.
    @Test
    fun readsWhetherThePageCanBeMarked() {
        val about = BookmarksSheetState.from(call("""{"currentLabel":"Sobre a Bíblia","canMark":false,"ribbons":[]}"""))
        assertFalse(about.canMark)
        assertTrue(BookmarksSheetState.from(call("""{"currentLabel":"Mt 5","ribbons":[]}""")).canMark)
    }

    @Test
    fun readsTheOnboardingsMaterialIcons() {
        val steps = OnboardingStep.from(
            call(
                """
                {"steps":[{"id":"tools","title":"Pesquisar","intro":"…","symbol":"magnifyingglass","icon":"search",
                  "logo":false,"features":[{"symbol":"bookmark","icon":"bookmarks","text":"Marcadores"}]}]}
                """,
            ),
        )
        assertEquals("search", steps.single().icon)
        assertEquals(OnboardingStep.Feature("bookmarks", "Marcadores"), steps.single().features.single())
    }
}

/** The space the bars cover, which the page pads its scrolling content by. */
class ChromeInsetsTest {
    private val reader = ChromeState(mode = ChromeMode.Reader)
    private val autoScroll = AutoScrollState(false, "1×", "1 linha por segundo", canSlower = true, canFaster = true)

    @Test
    fun coversOnlyTheSystemBarsWithoutBars() {
        assertEquals(ChromeInsets(24f, 48f), chromeInsets(ChromeState(), collapsed = false, 24f, 48f))
    }

    // Top: the status bar and a 64 dp app bar. Bottom: the navigation bar,
    // the arrows' 16 dp offset and their 56 dp.
    @Test
    fun coversTheReadersBars() {
        val arrows = reader.copy(chapterNavigation = true)
        assertEquals(ChromeInsets(88f, 48f + 16f + 56f), chromeInsets(arrows, collapsed = false, 24f, 48f))
        // Hidden for reading, they keep their row: the page doesn't change length.
        assertEquals(ChromeInsets(88f, 48f + 16f + 56f, collapsed = true), chromeInsets(arrows, collapsed = true, 24f, 48f))
    }

    // "Sobre a Bíblia" has no chapters to turn: nothing at the bottom.
    @Test
    fun leavesTheBottomToThePageWithoutArrows() {
        assertEquals(ChromeInsets(88f, 48f), chromeInsets(reader, collapsed = false, 24f, 48f))
    }

    // The arrows make way for auto-scroll's toolbar: one row, never two.
    @Test
    fun givesAutoScrollTheArrowsRow() {
        val state = reader.copy(chapterNavigation = true, autoScroll = autoScroll)
        assertEquals(ChromeInsets(88f, 48f + 16f + 64f), chromeInsets(state, collapsed = false, 24f, 48f))
        assertEquals(ChromeInsets(88f, 48f + 16f + 64f, collapsed = true), chromeInsets(state, collapsed = true, 24f, 48f))
        val alone = reader.copy(autoScroll = autoScroll)
        assertEquals(ChromeInsets(88f, 48f + 16f + 64f), chromeInsets(alone, collapsed = false, 24f, 48f))
    }

    // Large text makes the bar taller, a phone on its side shorter: the page
    // starts under the bar as it is drawn.
    @Test
    fun followsTheReadersBarHeight() {
        assertEquals(24f + 80f, chromeInsets(reader, collapsed = false, 24f, 48f, readerBar = 80f).top)
        assertEquals(24f + 56f, chromeInsets(reader, collapsed = false, 24f, 48f, readerBar = 56f).top)
        // Other pages keep Material's 64 dp bar.
        val page = ChromeState(mode = ChromeMode.Page)
        assertEquals(24f + 64f, chromeInsets(page, collapsed = false, 24f, 48f, readerBar = 80f).top)
    }

    @Test
    fun leavesTheBottomToThePageWhenSearching() {
        // The search view's 72 dp header and its divider.
        val search = ChromeState(mode = ChromeMode.Search)
        assertEquals(ChromeInsets(97f, 48f), chromeInsets(search, collapsed = false, 24f, 48f))
        val page = ChromeState(mode = ChromeMode.Page)
        assertEquals(ChromeInsets(88f, 48f), chromeInsets(page, collapsed = false, 24f, 48f))
    }
}

/** The ribbons' tones, the same on Android, iOS and the web. */
class RibbonToneTest {
    private val names = listOf("red", "orange", "teal", "green", "blue", "indigo", "violet", "grey")

    private fun contrast(a: Color, b: Color): Float {
        val (lighter, darker) = listOf(a.luminance(), b.luminance()).sortedDescending()
        return (lighter + 0.05f) / (darker + 0.05f)
    }

    // Orange was 1.7:1 on a light tile: each keeps 3:1 against Material's
    // brightest tile in its theme, and the crimson scheme's.
    @Test
    fun keepsThreeToOneOnTheTiles() {
        for (name in names) {
            for (tile in listOf(Color(0xFFE6E0E9), Color(0xFFF0DEDE))) {
                assertTrue(name, contrast(ribbonTone(name, dark = false)!!, tile) >= 3f)
            }
            for (tile in listOf(Color(0xFF36343B), Color(0xFF3D3232))) {
                assertTrue(name, contrast(ribbonTone(name, dark = true)!!, tile) >= 3f)
            }
        }
    }

    @Test
    fun matchesTheWebApp() {
        // --ribbon-light-orange and --ribbon-dark-orange in src/styles.css.
        assertEquals(Color(0xFFAD5700), ribbonTone("orange", dark = false))
        assertEquals(Color(0xFFFFA040), ribbonTone("orange", dark = true))
    }

    @Test
    fun paintsNothingForNoRibbon() {
        assertNull(ribbonTone(null, dark = false))
        assertNull(ribbonTone("gold", dark = true))
    }
}

/** Who needs the reader's bars to stay up rather than hide while reading. */
class BarsStayUpTest {
    @Test
    fun keepsThemUpForSwitchAndVoiceAccess() {
        assertTrue(keepsBarsUp("com.google.android.marvin.talkback/com.google.android.accessibility.switchaccess.SwitchAccessService"))
        assertTrue(keepsBarsUp("com.google.android.apps.accessibility.voiceaccess/.JustSpeakService"))
    }

    // Select to Speak shares Switch Access's package; password managers are
    // accessibility services too. Their users read with the bars hiding.
    @Test
    fun letsThemHideForOtherServices() {
        assertFalse(keepsBarsUp("com.google.android.marvin.talkback/com.google.android.accessibility.selecttospeak.SelectToSpeakService"))
        assertFalse(keepsBarsUp("com.example.passwords/.AutofillAccessibilityService"))
    }
}

/** The search view's recent searches, newest first. */
class RecentSearchesTest {
    @Test
    fun putsTheLatestFirst() {
        assertEquals(listOf("luz", "amor"), withRecentSearch(listOf("amor"), "luz"))
    }

    // Searched again, however it was typed, it moves up rather than repeating.
    @Test
    fun movesARepeatedSearchUp() {
        assertEquals(listOf("Génesis", "luz"), withRecentSearch(listOf("luz", "genesis"), " Génesis "))
    }

    @Test
    fun keepsNothingBlank() {
        assertEquals(listOf("luz"), withRecentSearch(listOf("luz"), "   "))
    }

    @Test
    fun keepsTheLatestEight() {
        val full = (1..RECENT_SEARCH_LIMIT).map { "Sl $it" }
        val next = withRecentSearch(full, "Jo 3,16")
        assertEquals(RECENT_SEARCH_LIMIT, next.size)
        assertEquals("Jo 3,16", next.first())
        assertFalse(next.contains("Sl $RECENT_SEARCH_LIMIT"))
    }

    @Test
    fun storesThemAsJson() {
        val recent = listOf("o bom pastor", "Jo 3,16")
        assertEquals(recent, readRecentSearches(writeRecentSearches(recent)))
        assertEquals(emptyList<String>(), readRecentSearches(null))
        assertEquals(emptyList<String>(), readRecentSearches("not json"))
    }
}

/** The picker's book list, and its filter. */
class PickerRowsTest {
    private val data = PassagePickerData(
        sections = listOf(
            PassagePickerData.Section(
                "Antigo Testamento",
                listOf(
                    PassagePickerData.Group(
                        "Pentateuco",
                        listOf(book("intro-pent", "Introdução", ""), book("gn", "Génesis", "Gn", 50)),
                    ),
                    PassagePickerData.Group("Livros Sapienciais", listOf(book("sl", "Salmos", "Sl", 150))),
                ),
            ),
            PassagePickerData.Section(
                "Novo Testamento",
                listOf(PassagePickerData.Group("Evangelhos", listOf(book("mt", "Mateus", "Mt", 28)))),
            ),
        ),
        currentBookId = "mt",
        currentChapter = 5,
    )

    private fun book(id: String, label: String, abbreviation: String, chapters: Int = 0) =
        PassagePickerData.Book(
            id = id,
            label = label,
            name = label,
            abbreviation = abbreviation,
            chapters = (1..chapters).map { PassagePickerData.Chapter(it, "$it", null, null, null, null) },
        )

    private fun List<PickerRow>.keys() = map { it.key }

    @Test
    fun listsTheBooksUnderTheirHeadings() {
        assertEquals(
            listOf(
                "testament:Antigo Testamento", "group:Pentateuco", "book:intro-pent", "book:gn",
                "group:Livros Sapienciais", "book:sl",
                "testament:Novo Testamento", "group:Evangelhos", "book:mt",
            ),
            pickerRows(data, "").keys(),
        )
    }

    // Accents and case don't count, and headings left without books go.
    @Test
    fun filtersByNameOrAbbreviation() {
        assertEquals(listOf("testament:Antigo Testamento", "group:Pentateuco", "book:gn"), pickerRows(data, "GENESIS").keys())
        assertEquals(listOf("testament:Novo Testamento", "group:Evangelhos", "book:mt"), pickerRows(data, "mt").keys())
    }

    // A group's own introduction is listed as "Introdução": its group's name finds it.
    @Test
    fun findsAGroupsBooksByItsName() {
        assertEquals(
            listOf("testament:Antigo Testamento", "group:Pentateuco", "book:intro-pent", "book:gn"),
            pickerRows(data, "pentateuco").keys(),
        )
    }

    @Test
    fun findsNothingForNoMatch() {
        assertEquals(emptyList<PickerRow>(), pickerRows(data, "Apocalipse"))
    }
}

/** The page's colour as CSS declares it. */
class CssHexColorTest {
    @Test
    fun readsSixAndThreeDigitHex() {
        assertEquals(0xFFFFFFFF.toInt(), cssHexColor("#ffffff"))
        assertEquals(0xFF121212.toInt(), cssHexColor(" #121212 "))
        assertEquals(0xFFFFFFFF.toInt(), cssHexColor("#fff"))
    }

    @Test
    fun leavesAnythingElse() {
        assertNull(cssHexColor("white"))
        assertNull(cssHexColor("rgb(18, 18, 18)"))
        assertNull(cssHexColor("#12121"))
        assertNull(cssHexColor("#zzzzzz"))
    }
}

/** The line under the ribbons: how to mark, how to go back, what can't be marked. */
class BookmarksHintTest {
    private fun ribbon(color: String, label: String? = null, current: Boolean = false) =
        BookmarksSheetState.Ribbon(color, color, label, current)

    private fun state(vararg ribbons: BookmarksSheetState.Ribbon, canMark: Boolean = true) =
        BookmarksSheetState("Mateus 5", ribbons.toList(), move = null, canMark = canMark)

    // The first time, it also says how to come back.
    @Test
    fun saysHowToComeBackBeforeAnyIsUsed() {
        assertEquals(
            "Escolha uma cor para marcar Mateus 5. Para voltar, abra Marcadores e toque nessa fita.",
            bookmarksHint(state(ribbon("red"), ribbon("blue")), editing = false),
        )
    }

    @Test
    fun saysANamedRibbonGoesBack() {
        assertEquals(
            "Toque numa fita com nome para voltar a essa passagem, ou numa fita livre para marcar Mateus 5.",
            bookmarksHint(state(ribbon("red", "Gn 1"), ribbon("blue")), editing = false),
        )
    }

    // "Sobre a Bíblia 1" was offered to be marked.
    @Test
    fun saysWhenThePageCantBeMarked() {
        assertEquals("Esta página não se pode marcar.", bookmarksHint(state(ribbon("red"), canMark = false), editing = false))
        assertEquals(
            "Esta página não se pode marcar. Toque numa fita com nome para abrir essa passagem.",
            bookmarksHint(state(ribbon("red", "Gn 1"), canMark = false), editing = false),
        )
    }

    @Test
    fun saysWhatEditingDoes() {
        assertEquals("Toque numa fita para a retirar.", bookmarksHint(state(ribbon("red", "Gn 1")), editing = true))
    }
}
