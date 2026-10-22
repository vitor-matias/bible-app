package org.capuchinhos.biblia.chrome

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import org.json.JSONObject

// What the web app sends the native bars and sheets. Each mirrors its
// TypeScript interface in native-chrome.service.ts, as the iOS shell's structs
// do (ios/App/App/NativeChrome.swift and the sheets beside it). Missing values
// default to an empty, inactive state.

enum class ChromeMode {
    /** No native bars (e.g. the reader before its books load). */
    None,

    /** Top: the passage, search, Marcadores, text, ⋮. Bottom corners: the chapter arrows. */
    Reader,

    /** Top: Material's search view, Back and the field; the results are the page's. */
    Search,

    /** A plain page (e.g. the book index). Top: Back, its title, search. */
    Page,
}

/** The reader's text size, which the text sheet shows and steps (percent). */
data class TextSize(
    val percent: Int,
    val min: Int,
    val max: Int,
    /** Not at the size the text opens at without a choice. */
    val canReset: Boolean,
) {
    val canDecrease get() = percent > min
    val canIncrease get() = percent < max

    companion object {
        /** The step of the sheet's − and +: bigger than the web's 5, so 150% isn't ten taps away. */
        const val STEP = 10

        fun from(json: JSONObject) = TextSize(
            percent = json.optInt("percent", 100),
            min = json.optInt("min", 70),
            max = json.optInt("max", 235),
            canReset = json.optBoolean("canReset"),
        )
    }
}

/** Auto-scroll's controls, which take the chapter arrows' row while they show. */
data class AutoScrollState(
    val playing: Boolean,
    val speedLabel: String,
    /** In words, for TalkBack: "1,5 linhas por segundo". */
    val speedAccessibilityLabel: String,
    val canSlower: Boolean,
    val canFaster: Boolean,
    /** False at the page's end, where there's nothing left to play. */
    val canPlay: Boolean = true,
) {
    companion object {
        fun from(json: JSONObject): AutoScrollState {
            val speed = json.optString("speedLabel")
            return AutoScrollState(
                playing = json.optBoolean("playing"),
                speedLabel = speed,
                speedAccessibilityLabel = json.optString("speedAccessibilityLabel", speed),
                canSlower = json.optBoolean("canSlower"),
                canFaster = json.optBoolean("canFaster"),
                canPlay = json.optBoolean("canPlay", true),
            )
        }
    }
}

data class ChromeState(
    val mode: ChromeMode = ChromeMode.None,
    /** A web dialog is open: the bars ignore taps, as behind a modal. */
    val inert: Boolean = false,
    /** Hidden while reading, to leave the page to the text. */
    val collapsed: Boolean = false,
    /** The page's text has scrolled under the top bar, which then stands apart from it. */
    val scrolled: Boolean = false,
    /** "system", "light" or "dark": the in-app theme, which can differ from the device's. */
    val themeMode: String = "system",
    // Reader
    val passageLabel: String = "",
    /** Shorter forms, longest first ("Dt 3"), for a toolbar too narrow for the name. */
    val passageShortLabels: List<String> = emptyList(),
    val passageAccessibilityLabel: String = "",
    /** The heading of the section being read, under the passage. */
    val subtitle: String? = null,
    val chapterNavigation: Boolean = false,
    val canGoPrevious: Boolean = false,
    val canGoNext: Boolean = false,
    val search: Boolean = false,
    /** "paged" or "scrolling"; null hides the choice. */
    val viewMode: String? = null,
    val autoScrollVisible: Boolean = false,
    val autoScrollAvailable: Boolean = false,
    val canShare: Boolean = false,
    val canReport: Boolean = false,
    /** The colour name of the ribbon on this chapter ("red"), if any. */
    val bookmarkColor: String? = null,
    /** Its spoken name ("vermelho"). */
    val bookmarkName: String? = null,
    /** When the web bundle was compiled, for the menu's small print. */
    val buildVersion: String? = null,
    /** The text's size; null where the page has none to set (the About page). */
    val textSize: TextSize? = null,
    /** The page's background (`#ffffff`), as an ARGB colour; null when the web app doesn't say. */
    val pageColor: Int? = null,
    val autoScroll: AutoScrollState? = null,
    // Search
    val query: String = "",
    // Page
    val title: String = "",
) {
    companion object {
        fun from(call: PluginCall): ChromeState {
            val passage = call.getString("passageLabel", "")!!
            return ChromeState(
                mode = when (call.getString("mode")) {
                    "reader" -> ChromeMode.Reader
                    "search" -> ChromeMode.Search
                    "page" -> ChromeMode.Page
                    else -> ChromeMode.None
                },
                inert = call.getBoolean("inert", false)!!,
                collapsed = call.getBoolean("collapsed", false)!!,
                scrolled = call.getBoolean("scrolled", false)!!,
                themeMode = call.getString("themeMode", "system")!!,
                passageLabel = passage,
                passageShortLabels = strings(call.getArray("passageShortLabels")),
                passageAccessibilityLabel = call.getString("passageAccessibilityLabel", passage)!!,
                subtitle = call.getString("subtitle")?.takeIf { it.isNotBlank() },
                chapterNavigation = call.getBoolean("chapterNavigation", false)!!,
                canGoPrevious = call.getBoolean("canGoPrevious", false)!!,
                canGoNext = call.getBoolean("canGoNext", false)!!,
                search = call.getBoolean("search", false)!!,
                viewMode = call.getString("viewMode"),
                autoScrollVisible = call.getBoolean("autoScrollVisible", false)!!,
                autoScrollAvailable = call.getBoolean("autoScrollAvailable", false)!!,
                canShare = call.getBoolean("canShare", false)!!,
                canReport = call.getBoolean("canReport", false)!!,
                bookmarkColor = call.getString("bookmarkColor"),
                bookmarkName = call.getString("bookmarkName"),
                buildVersion = call.getString("buildVersion"),
                textSize = call.getObject("textSize", null)?.let(TextSize::from),
                pageColor = call.getString("pageColor")?.let(::cssHexColor),
                autoScroll = call.getObject("autoScroll", null)?.let(AutoScrollState::from),
                query = call.getString("query", "")!!,
                title = call.getString("title", "")!!,
            )
        }
    }
}

/** The space the bars cover at the top and bottom of the page, in CSS pixels (dp). */
data class ChromeInsets(
    val top: Float = 0f,
    val bottom: Float = 0f,
    /** The reader's bars are hidden for reading. */
    val collapsed: Boolean = false,
) {
    fun toJSObject() = JSObject().apply {
        put("top", top.toDouble())
        put("bottom", bottom.toDouble())
        put("collapsed", collapsed)
    }
}

/**
 * The space the bars cover, from their fixed Material sizes: known as soon as
 * the state is, before the overlay lays them out. Without bars, only the
 * system bars ([systemTop], [systemBottom], in dp) cover the page.
 */
fun chromeInsets(
    state: ChromeState,
    collapsed: Boolean,
    systemTop: Float,
    systemBottom: Float,
    /** The reader's top bar as drawn: taller for large text, shorter on a phone on its side. */
    readerBar: Float = BarMetrics.topBar,
): ChromeInsets {
    if (state.mode == ChromeMode.None) return ChromeInsets(top = systemTop, bottom = systemBottom)
    if (state.mode == ChromeMode.Search) {
        return ChromeInsets(top = systemTop + BarMetrics.searchView + BarMetrics.divider, bottom = systemBottom)
    }
    if (state.mode != ChromeMode.Reader) return ChromeInsets(top = systemTop + BarMetrics.topBar, bottom = systemBottom)
    // Auto-scroll's toolbar takes the chapter arrows' row while it is up. The
    // end of the text stays clear of the row even while the arrows hide, so
    // the page doesn't grow and shrink with them.
    val row = when {
        state.autoScroll != null -> BarMetrics.toolbar
        state.chapterNavigation -> BarMetrics.chapterButton
        else -> 0f
    }
    return ChromeInsets(
        top = systemTop + readerBar,
        bottom = systemBottom + if (row > 0f) BarMetrics.toolbarOffset + row else 0f,
        collapsed = collapsed,
    )
}

/** Material 3's bar sizes, in dp, which the insets are made of. */
object BarMetrics {
    /** A small top app bar. */
    const val topBar = 64f

    /** The full-screen search view's header, and the divider under it. */
    const val searchView = 72f
    const val divider = 1f

    /** A floating toolbar: auto-scroll's. */
    const val toolbar = 64f

    /** A floating toolbar's distance from the screen's bottom edge, and the arrows'. */
    const val toolbarOffset = 16f

    /** The chapter arrows' buttons, at the bottom corners: Material's standard FAB. */
    const val chapterButton = 56f
}

/** The books and chapters the picker offers (utils/passage-picker.ts). */
data class PassagePickerData(
    val sections: List<Section>,
    val currentBookId: String,
    val currentChapter: Int,
) {
    data class Chapter(
        val number: Int,
        /** Empty for the introduction. */
        val label: String,
        /** A psalm's liturgical number, shown small under its own ("22" for 23). */
        val detail: String?,
        /** What TalkBack says instead of "Capítulo 23": "Salmo 23, na liturgia 22". */
        val spoken: String?,
        val title: String?,
        /** The bookmark ribbon's colour name, if the chapter is bookmarked. */
        val bookmark: String?,
    )

    data class Book(
        val id: String,
        val label: String,
        val name: String,
        /** "Gn", "Ex"…: the label in the compact mode. */
        val abbreviation: String,
        /** Empty for a standalone introduction, which opens directly. */
        val chapters: List<Chapter>,
    )

    /** [title] is null for books listed outside any group. */
    data class Group(val title: String?, val books: List<Book>)

    data class Section(val title: String, val groups: List<Group>)

    val currentBook: Book?
        get() = sections.asSequence().flatMap { it.groups }.flatMap { it.books }
            .firstOrNull { it.id == currentBookId }

    companion object {
        fun from(call: PluginCall) = PassagePickerData(
            sections = objects(call.getArray("sections")).map { section ->
                Section(
                    title = section.optString("title"),
                    groups = objects(section.optJSONArray("groups")).map { group ->
                        Group(
                            title = group.optNullableString("title"),
                            books = objects(group.optJSONArray("books")).map(::book),
                        )
                    },
                )
            },
            currentBookId = call.getString("currentBookId", "")!!,
            currentChapter = call.getInt("currentChapter", 0)!!,
        )

        private fun book(json: JSONObject) = Book(
            id = json.optString("id"),
            label = json.optString("label"),
            name = json.optString("name"),
            abbreviation = json.optString("abbreviation"),
            chapters = objects(json.optJSONArray("chapters")).map { chapter ->
                Chapter(
                    number = chapter.optInt("number"),
                    label = chapter.optString("label"),
                    detail = chapter.optNullableString("detail"),
                    spoken = chapter.optNullableString("spoken"),
                    title = chapter.optNullableString("title"),
                    bookmark = chapter.optNullableString("bookmark"),
                )
            },
        )
    }
}

/** The bookmark ribbons (native-bookmarks.service.ts), which keeps the rules. */
data class BookmarksSheetState(
    /** What a free ribbon would mark, e.g. "Mateus 11". */
    val currentLabel: String,
    val ribbons: List<Ribbon>,
    val move: Move?,
    /** False on the About page, whose ribbons only open their passages. */
    val canMark: Boolean = true,
) {
    data class Ribbon(
        /** The CSS colour name the bookmark stores. */
        val color: String,
        /** Spoken name, e.g. "Vermelho". */
        val name: String,
        /** The passage the ribbon marks, e.g. "Mt 5"; null when it is free. */
        val label: String?,
        /** Marks the chapter being read. */
        val current: Boolean,
    )

    /** A ribbon to move to the chapter being read; once moved, to move back. */
    data class Move(
        val color: String,
        /** The ribbon's adjective, e.g. "vermelho". */
        val name: String,
        /** Where it is, or was before the move, e.g. "Mateus 5". */
        val from: String,
        /** Moved already: the row undoes it. */
        val done: Boolean,
    )

    companion object {
        fun from(call: PluginCall) = BookmarksSheetState(
            currentLabel = call.getString("currentLabel", "")!!,
            canMark = call.getBoolean("canMark", true)!!,
            ribbons = objects(call.getArray("ribbons")).map { ribbon ->
                Ribbon(
                    color = ribbon.optString("color"),
                    name = ribbon.optString("name"),
                    label = ribbon.optNullableString("label"),
                    current = ribbon.optBoolean("current"),
                )
            },
            move = call.getObject("move", null)?.let { move ->
                Move(
                    color = move.optString("color"),
                    name = move.optString("name"),
                    from = move.optString("from"),
                    done = move.optBoolean("done"),
                )
            },
        )
    }
}

/** A verse's footnotes (native-footnotes.service.ts). */
data class FootnotesSheetState(
    /** The verse, e.g. "Mateus 11,3". */
    val title: String,
    /** The reader's text size, 1 = 100%. */
    val fontScale: Float,
    val notes: List<Note>,
) {
    /** A run of text; one with [link] is a reference, opened by that index. */
    data class Part(val text: String, val link: Int?)

    data class Note(val reference: String, val parts: List<Part>)

    companion object {
        fun from(call: PluginCall) = FootnotesSheetState(
            title = call.getString("title", "")!!,
            fontScale = call.data.optDouble("fontScale", 1.0).toFloat(),
            notes = objects(call.getArray("notes")).map { note ->
                Note(
                    reference = note.optString("reference"),
                    parts = objects(note.optJSONArray("parts")).map { part ->
                        Part(
                            text = part.optString("text"),
                            link = if (part.has("link") && !part.isNull("link")) part.optInt("link") else null,
                        )
                    },
                )
            },
        )
    }
}

/** The report form's content (native-report.service.ts). */
data class ReportSheetState(
    /** What is being reported on, e.g. "Encontrou algum problema em …?". */
    val message: String,
    val topics: List<Topic>,
    val placeholder: String,
    val maxLength: Int,
) {
    data class Topic(val value: String, val label: String)

    companion object {
        fun from(call: PluginCall) = ReportSheetState(
            message = call.getString("message", "")!!,
            topics = objects(call.getArray("topics")).map {
                Topic(value = it.optString("value"), label = it.optString("label"))
            },
            placeholder = call.getString("placeholder", "")!!,
            maxLength = call.getInt("maxLength", 500)!!,
        )
    }
}

/** One page of the onboarding (onboarding-content.ts, nativeOnboardingSteps). */
data class OnboardingStep(
    val id: String,
    val title: String,
    val intro: String,
    /** The Material Symbol for the page, unless it shows the app's logo. */
    val icon: String,
    val logo: Boolean,
    val features: List<Feature>,
) {
    data class Feature(val icon: String, val text: String)

    companion object {
        fun from(call: PluginCall) = objects(call.getArray("steps")).map { step ->
            OnboardingStep(
                id = step.optString("id"),
                title = step.optString("title"),
                intro = step.optString("intro"),
                icon = step.optString("icon"),
                logo = step.optBoolean("logo"),
                features = objects(step.optJSONArray("features")).map {
                    Feature(icon = it.optString("icon"), text = it.optString("text"))
                },
            )
        }
    }
}

private fun objects(array: org.json.JSONArray?): List<JSONObject> =
    if (array == null) emptyList() else (0 until array.length()).mapNotNull { array.optJSONObject(it) }

private fun strings(array: JSArray?): List<String> =
    if (array == null) emptyList() else (0 until array.length()).mapNotNull { array.optString(it, null) }

/** The string at [key], or null when it is absent or JSON null. */
private fun JSONObject.optNullableString(key: String): String? =
    if (has(key) && !isNull(key)) optString(key) else null

private val COMBINING_MARKS = Regex("\\p{M}")

/** Accents and case don't count: "genesis" finds Génesis. */
fun fold(text: String): String =
    java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD).replace(COMBINING_MARKS, "").lowercase()

/** How many recent searches the search view keeps. */
const val RECENT_SEARCH_LIMIT = 8

/**
 * [query] first among [recent]: a search made again moves up rather than
 * showing twice, however it was accented or capitalised. Blank ones are not kept.
 */
fun withRecentSearch(recent: List<String>, query: String): List<String> {
    val trimmed = query.trim()
    if (trimmed.isEmpty()) return recent
    val key = fold(trimmed)
    return (listOf(trimmed) + recent.filter { fold(it) != key }).take(RECENT_SEARCH_LIMIT)
}

fun readRecentSearches(stored: String?): List<String> =
    try {
        val array = org.json.JSONArray(stored ?: "[]")
        (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }.take(RECENT_SEARCH_LIMIT)
    } catch (_: org.json.JSONException) {
        emptyList()
    }

fun writeRecentSearches(recent: List<String>): String = org.json.JSONArray(recent).toString()

/** A CSS hex colour ("#fff", "#121212") as opaque ARGB; null for anything else. */
fun cssHexColor(css: String): Int? {
    val hex = css.trim().removePrefix("#")
    if (!css.trim().startsWith("#") || hex.any { it !in "0123456789abcdefABCDEF" }) return null
    val rgb = when (hex.length) {
        3 -> hex.map { "$it$it" }.joinToString("")
        6 -> hex
        else -> return null
    }
    return (0xFF000000 or rgb.toLong(16)).toInt()
}
