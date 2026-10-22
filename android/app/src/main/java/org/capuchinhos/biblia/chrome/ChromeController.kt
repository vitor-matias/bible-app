package org.capuchinhos.biblia.chrome

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.util.TypedValue
import android.view.View
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.graphics.drawable.LayerDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.view.accessibility.AccessibilityManager
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.core.view.WindowCompat
import com.getcapacitor.JSObject

/** A sheet or dialog over the page; one at a time. */
sealed interface Sheet {
    data class Picker(val data: PassagePickerData) : Sheet

    /** Updated in place while open (updateBookmarks), so it doesn't re-open. */
    class Bookmarks(state: BookmarksSheetState) : Sheet {
        var state by mutableStateOf(state)
    }

    data class Footnotes(val state: FootnotesSheetState) : Sheet

    class Report(val state: ReportSheetState) : Sheet {
        var sending by mutableStateOf(false)

        /** Why the last send failed, until dismissed. */
        var error by mutableStateOf<String?>(null)
    }

    class Onboarding(
        val steps: List<OnboardingStep>,
        val onFinish: (completed: Boolean, lastStep: String) -> Unit,
    ) : Sheet

    /** "Texto e aparência", the text button's sheet. */
    data object Appearance : Sheet
}

/** A snackbar; [id] tells one from the next with the same text. */
data class Toast(val id: Long, val message: String, val button: Boolean)

/**
 * The web view fills the screen and the bars float above it in a ComposeView,
 * a sibling over it: hiding them never moves the page. The page pads its
 * scrolling content by [insets] instead, and the text scrolls under the bars.
 */
class ChromeController(
    private val activity: AppCompatActivity,
    webView: WebView,
    private val send: (action: String, extra: JSObject) -> Unit,
    private val sendInsets: (ChromeInsets) -> Unit,
    private val sendPalette: (JSObject) -> Unit,
) {
    var state by mutableStateOf(ChromeState())
        private set

    var sheet by mutableStateOf<Sheet?>(null)
        private set

    var toast by mutableStateOf<Toast?>(null)
        private set

    /**
     * The in-app theme, which can differ from the device's. Pages without
     * bars send none; the sheets keep the last one.
     */
    var themeMode by mutableStateOf("system")
        private set

    /** The page's colour as the web app last said, kept like the theme; null before it does. */
    var pageColor by mutableStateOf<Int?>(null)
        private set

    /** The reader's top bar as last drawn, in dp: it follows the text size. */
    private var readerBar = BarMetrics.topBar

    /**
     * The status bar's and navigation bar's heights, in dp, from the overlay.
     * State, so that what is placed by them (the snackbar) follows a rotation.
     */
    var systemTop by mutableFloatStateOf(0f)
        private set
    var systemBottom by mutableFloatStateOf(0f)
        private set
    private var reportedInsets = ChromeInsets()
    private var nextToastId = 0L

    /** How far through the chapter the reader is, 0 to 1; null off the reader. */
    var progress by mutableStateOf<Float?>(null)
        private set

    private val preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    /** What was searched for lately, newest first (search view). */
    var recentSearches by mutableStateOf(readRecentSearches(preferences.getString(RECENT_SEARCHES, null)))
        private set

    private val accessibility =
        activity.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager

    /**
     * Someone moves through the screen element by element (TalkBack), or
     * reaches what is on it by switch or voice: the reader's bars stay up for
     * them, as they do on iOS under VoiceOver. Followed live, as iOS does.
     */
    var barsStayUp by mutableStateOf(false)
        private set

    private val accessibilityChanged = AccessibilityManager.AccessibilityStateChangeListener { updateBarsStayUp() }
    private val touchExplorationChanged =
        AccessibilityManager.TouchExplorationStateChangeListener { updateBarsStayUp() }

    init {
        val overlay = ComposeView(activity).apply {
            id = View.generateViewId()
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent { ChromeOverlay(this@ChromeController) }
        }
        // Over the web view, in its own parent (activity_main.xml). Where no
        // bar or sheet is, touches fall through to the page.
        (webView.parent as ViewGroup).addView(
            overlay,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        // The overlay draws its own protection behind the three-button bar,
        // in the page's colour; the system's scrim would stack on it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            activity.window.isNavigationBarContrastEnforced = false
        }
        // TalkBack reads the bars, then the page, rather than a whole chapter
        // before reaching them.
        webView.accessibilityTraversalAfter = overlay.id
        accessibility.addAccessibilityStateChangeListener(accessibilityChanged)
        accessibility.addTouchExplorationStateChangeListener(touchExplorationChanged)
        updateBarsStayUp()
    }

    /** The activity is going: stop listening, so it isn't kept alive. */
    fun destroy() {
        accessibility.removeAccessibilityStateChangeListener(accessibilityChanged)
        accessibility.removeTouchExplorationStateChangeListener(touchExplorationChanged)
    }

    private fun updateBarsStayUp() {
        // Specific services, not any: password managers are accessibility
        // services too, and their users read with the bars hiding.
        val stayUp = accessibility.isTouchExplorationEnabled ||
            accessibility.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                .any { keepsBarsUp(it.id ?: "") }
        if (stayUp == barsStayUp) return
        barsStayUp = stayUp
        reportInsets()
    }

    fun apply(next: ChromeState) {
        // Leaving the search page: what it last searched for is a recent search,
        // whether it was submitted or ran on a pause in typing.
        if (state.mode == ChromeMode.Search && next.mode != ChromeMode.Search) rememberSearch(state.query)
        if (next.mode != ChromeMode.Reader) progress = null
        state = next
        if (next.mode != ChromeMode.None) {
            themeMode = next.themeMode
            next.pageColor?.let { pageColor = it }
        }
        // After SystemBars, whose style calls arrive with the theme's and
        // reset the window's background.
        activity.window.decorView.post { applySystemBars() }
        // Auto-scroll is read hands-free: the screen mustn't lock under it.
        if (next.mode == ChromeMode.Reader && next.autoScroll?.playing == true) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        reportInsets()
    }

    /**
     * The reader's bars hide for reading, except for those who reach them
     * element by element ([barsStayUp]): they find the bars by moving through
     * the screen, not by tapping where they were. Under a web panel (inert)
     * they hide for everyone, as they'd only be disabled buttons over it.
     */
    val collapsed: Boolean
        get() = state.mode == ChromeMode.Reader && state.collapsed && (state.inert || !barsStayUp)

    /** The web app's reading position; null hides the line. */
    fun showProgress(value: Float?) {
        progress = if (state.mode == ChromeMode.Reader) value?.coerceIn(0f, 1f) else null
    }

    // MARK: Insets

    /** The space the bars cover now, which the page pads its content by. */
    val insets: ChromeInsets
        get() = chromeInsets(state, collapsed, systemTop, systemBottom, readerBar)

    /** The scheme's surfaceContainerHigh as last sent to the web app. */
    private var sentCardSurface: Int? = null

    /** The bars' colours changed (theme, wallpaper): the web's cards follow. */
    fun onPalette(surfaceContainerHigh: Int) {
        if (surfaceContainerHigh == sentCardSurface) return
        sentCardSurface = surfaceContainerHigh
        sendPalette(JSObject().put("surfaceContainerHigh", cssHex(surfaceContainerHigh)))
    }

    /** The reader's top bar was laid out at this height (dp). */
    fun onTopBarHeight(height: Float) {
        if (height == readerBar) return
        readerBar = height
        reportInsets()
    }

    /** The overlay's system bar insets changed: rotated, or the keyboard came up. */
    fun onSystemInsets(top: Float, bottom: Float) {
        if (top == systemTop && bottom == systemBottom) return
        systemTop = top
        systemBottom = bottom
        reportInsets()
    }

    private fun reportInsets() {
        val current = insets
        if (current == reportedInsets) return
        reportedInsets = current
        sendInsets(current)
    }

    // MARK: The system bars

    /** Behind the status bar, and behind the rest, while bars show; null for the window's own. */
    private var systemBarsBackground: Pair<Int, Int>? = null

    /** Whether the theme in use is dark: the in-app one, or the device's. */
    val dark: Boolean
        get() = when (themeMode) {
            "light" -> false
            "dark" -> true
            else -> activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
                Configuration.UI_MODE_NIGHT_YES
        }

    fun setSystemBarsBackground(status: Int?, page: Int?) {
        val next = if (status != null && page != null) status to page else null
        if (next == systemBarsBackground) return
        systemBarsBackground = next
        applySystemBars()
    }

    /**
     * Rotated, folded, resized, or the device's theme changed: SystemBars
     * re-applies the web app's status bar style (light icons, for its brown
     * header) and resets the window's background. Posted, so the native
     * bars' come back after it, whichever plugin the bridge tells first.
     */
    fun onConfigurationChanged() {
        activity.window.decorView.post { applySystemBars() }
    }

    /**
     * The status bar's icons follow the in-app theme while the native bars
     * are under them; without bars the web app sets them (NativeShellService):
     * light, for its brown header.
     *
     * Where the page can't go under the system bars (WebView before 140, all
     * of Android 7 to 9's), SystemBars pads the window, and its background
     * shows behind them: the web header's brown (MainActivity.load). Under
     * the native bars it takes their colour instead.
     */
    private fun applySystemBars() {
        val decor = activity.window.decorView
        WindowCompat.getInsetsController(activity.window, decor).isAppearanceLightStatusBars =
            state.mode != ChromeMode.None && !dark
        if (decor.paddingTop == 0 && decor.paddingBottom == 0) return
        // The status bar's strip takes the band's colour (the bar's, or the
        // page's while the bars are away); the navigation bar's, the page's.
        val (status, page) = systemBarsBackground ?: (windowBackground() to windowBackground())
        val strips = systemBarStrips ?: LayerDrawable(arrayOf(ColorDrawable(), ColorDrawable())).apply {
            setLayerGravity(1, Gravity.TOP or Gravity.FILL_HORIZONTAL)
        }.also { systemBarStrips = it }
        (strips.getDrawable(0) as ColorDrawable).color = page
        (strips.getDrawable(1) as ColorDrawable).color = status
        strips.setLayerHeight(1, decor.paddingTop)
        if (decor.background !== strips) {
            // A new background resets the decor's padding (DecorView's
            // drawableChanged), which is what holds the page clear of the
            // system bars here: put it back.
            val left = decor.paddingLeft
            val top = decor.paddingTop
            val right = decor.paddingRight
            val bottom = decor.paddingBottom
            decor.background = strips
            decor.setPadding(left, top, right, bottom)
        } else {
            strips.invalidateSelf()
        }
    }

    /** The two strips behind the system bars, kept so that later colours don't replace the background. */
    private var systemBarStrips: LayerDrawable? = null

    private fun windowBackground(): Int {
        val value = TypedValue()
        activity.theme.resolveAttribute(android.R.attr.windowBackground, value, true)
        return if (value.type in TypedValue.TYPE_FIRST_COLOR_INT..TypedValue.TYPE_LAST_COLOR_INT) {
            value.data
        } else {
            Color.TRANSPARENT
        }
    }

    // MARK: Actions

    fun send(action: String) = send(action, JSObject())

    /** A text size down or up, by the sheet's own step. */
    fun sendStep(action: String, step: Int) = send(action, JSObject().put("step", step))

    fun goTo(bookId: String, chapter: Int?) {
        send("goto", JSObject().put("bookId", bookId).apply { if (chapter != null) put("chapter", chapter) })
    }

    fun sendWithColor(action: String, color: String) = send(action, JSObject().put("color", color))

    fun footnoteLink(index: Int) = send("footnote-link", JSObject().put("index", index))

    fun searchInput(text: String) = send("search-input", JSObject().put("text", text))

    fun searchSubmit(text: String) {
        rememberSearch(text)
        send("search-submit", JSObject().put("text", text))
    }

    fun rememberSearch(query: String) {
        val next = withRecentSearch(recentSearches, query)
        if (next == recentSearches) return
        recentSearches = next
        preferences.edit().putString(RECENT_SEARCHES, writeRecentSearches(next)).apply()
    }

    fun forgetSearches() {
        recentSearches = emptyList()
        preferences.edit().remove(RECENT_SEARCHES).apply()
    }

    fun submitReport(topic: String, details: String) {
        (sheet as? Sheet.Report)?.apply {
            sending = true
            error = null
        }
        send("report-submit", JSObject().put("topic", topic).put("details", details))
    }

    // MARK: Sheets

    /** The sheet on its way out: what's asked for now waits for it. */
    private var closingSheet: Sheet? = null

    /** Asked for while the last sheet was closing; shown once it's gone. */
    private var waiting: Pair<Sheet, (Boolean) -> Unit>? = null

    /**
     * Shows [next], and tells [presented] whether it came up. Over a sheet that
     * stays, it doesn't; over one on its way out, it comes up once that one is
     * gone, after its closing event, as on iOS. A later request replaces one
     * still waiting: the web app follows only the latest.
     */
    fun present(next: Sheet, presented: (Boolean) -> Unit = {}) {
        val current = sheet
        when {
            current == null -> {
                sheet = next
                presented(true)
            }
            current === closingSheet -> {
                waiting?.second?.invoke(false)
                waiting = next to presented
            }
            else -> presented(false)
        }
    }

    /** [gone] has started to close (a tap, a swipe, the scrim). */
    fun closing(gone: Sheet) {
        if (sheet === gone) closingSheet = gone
    }

    /** Dragged back up as it closed: it stays, and what waited for it doesn't come. */
    fun reopened(back: Sheet) {
        if (closingSheet !== back) return
        closingSheet = null
        waiting?.second?.invoke(false)
        waiting = null
    }

    /** The sheet is gone, however it went: says so where the web app waits for it. */
    fun dismissed(gone: Sheet) {
        if (sheet !== gone) return
        sheet = null
        closingSheet = null
        when (gone) {
            is Sheet.Bookmarks -> send("bookmarks-closed")
            is Sheet.Footnotes -> send("footnotes-closed")
            is Sheet.Report -> send("report-closed")
            else -> {}
        }
        waiting?.let { (next, presented) ->
            waiting = null
            sheet = next
            presented(true)
        }
    }

    fun updateBookmarks(next: BookmarksSheetState) {
        (sheet as? Sheet.Bookmarks)?.state = next
    }

    fun finishReport(sent: Boolean, message: String) {
        val report = sheet as? Sheet.Report ?: return
        report.sending = false
        if (sent) {
            dismissed(report)
        } else {
            report.error = message
        }
    }

    // MARK: Toast

    /** As a [button], tapping the snackbar's button sends toast-action. */
    fun showToast(message: String, button: Boolean) {
        toast = Toast(nextToastId++, message, button)
    }

    /** The web app took it down: the way back it offered is gone. */
    fun hideToast() {
        toast = null
    }

    fun toastDone(done: Toast, tapped: Boolean) {
        if (tapped) send("toast-action")
        if (toast == done) toast = null
    }
}

private const val PREFERENCES = "native-chrome"
private const val RECENT_SEARCHES = "search.recent"

/**
 * Switch Access and Voice Access reach only what is on screen: bars that
 * hid while reading would be out of their reach. [serviceId] is an enabled
 * service's "package/class". Switch Access shares the Accessibility Suite's
 * package with Select to Speak, whose users read with the bars hiding, so
 * it is told by its class.
 */
fun keepsBarsUp(serviceId: String): Boolean =
    serviceId.contains(".switchaccess.") ||
        serviceId.startsWith("com.google.android.apps.accessibility.voiceaccess/")

/** An ARGB colour as CSS hex, without its alpha: "#EEE7E3". */
fun cssHex(argb: Int): String = String.format("#%06X", argb and 0xFFFFFF)
