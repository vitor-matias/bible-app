package org.capuchinhos.biblia.chrome

import androidx.annotation.DrawableRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.tappableElement
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.windowInsetsEndWidth
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsStartWidth
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import org.capuchinhos.biblia.R

/** The bars, the snackbar and the open sheet, over the web view. */
@Composable
fun ChromeOverlay(chrome: ChromeController) {
    val state = chrome.state
    BibleTheme(chrome.themeMode) {
        val page = chrome.pageColor?.let(::Color) ?: pageBackground(isDarkTheme(chrome.themeMode))
        val barColor = topBarColor(state.scrolled, page)
        // What shows behind the system bars where the page can't reach them
        // (WebView before 140): the band over the status bar, and the page.
        val statusColor = when (state.mode) {
            ChromeMode.Reader -> if (chrome.collapsed) page else barColor
            ChromeMode.Search -> MaterialTheme.colorScheme.surfaceContainerHigh
            ChromeMode.Page -> barColor
            ChromeMode.None -> null
        }
        val statusArgb = statusColor?.toArgb()
        val pageArgb = page.toArgb()
        SideEffect {
            chrome.setSystemBarsBackground(statusArgb, if (statusArgb != null) pageArgb else null)
        }
        ReportSystemInsets(chrome)
        // The web's chapter cards and the index's list sit among the bars: they
        // take the same colours, wallpaper's or brown.
        val colors = MaterialTheme.colorScheme
        val palette = mapOf(
            "surfaceContainerHigh" to colors.surfaceContainerHigh.toArgb(),
            "surfaceContainerLow" to colors.surfaceContainerLow.toArgb(),
            "primary" to colors.primary.toArgb(),
            "onPrimary" to colors.onPrimary.toArgb(),
            "onSurfaceVariant" to colors.onSurfaceVariant.toArgb(),
        )
        SideEffect { chrome.onPalette(palette) }
        Box(Modifier.fillMaxSize()) {
            when (state.mode) {
                ChromeMode.Reader -> ReaderBars(chrome, state, barColor, page)
                ChromeMode.Search -> SearchView(chrome, state)
                ChromeMode.Page -> PageBar(chrome, state, barColor)
                ChromeMode.None -> {}
            }
            // Over the page and the recent searches alike.
            if (state.mode != ChromeMode.None) NavigationBarProtection(page)
            ToastHost(chrome, Modifier.align(Alignment.BottomCenter))
        }
        // Each anew: a sheet like the one just gone mustn't inherit its
        // hidden state (SheetQueue).
        chrome.sheet?.let { key(chrome.sheetPresentation) { SheetHost(chrome, it) } }
    }
}

/**
 * The top bar is the page's colour at rest, so the text is the only object
 * on screen; once text scrolls under it, it takes Material's container colour
 * to stand apart from it.
 */
@Composable
private fun topBarColor(scrolled: Boolean, page: Color): Color {
    val target = if (scrolled) MaterialTheme.colorScheme.surfaceContainer else page
    return animateColorAsState(target, label = "top bar").value
}

/** The bar's colours; under a web panel it leaves TalkBack's reading too. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun barColors(container: Color) = TopAppBarDefaults.topAppBarColors(
    containerColor = container,
    scrolledContainerColor = container,
)

/** Out of TalkBack's reading: an inert bar (a web panel over the page), or one moved off the screen. */
internal fun Modifier.inert(inert: Boolean) = if (inert) clearAndSetSemantics {} else this

/**
 * Behind the three-button navigation bar, the page's colour, nearly opaque:
 * the text scrolls on under it, as edge to edge, but not under the buttons,
 * which Android's guidance protects. Gesture navigation's handle is no
 * button (no tappable inset) and leaves the text clear. On its side in
 * landscape, the band follows it. The system's own scrim is off
 * (ChromeController), so the two don't stack.
 */
@Composable
internal fun NavigationBarProtection(page: Color) {
    val density = LocalDensity.current
    val direction = LocalLayoutDirection.current
    val buttons = WindowInsets.tappableElement
    val bottom = buttons.getBottom(density) > 0
    val start = buttons.getLeft(density, direction) > 0
    val end = buttons.getRight(density, direction) > 0
    if (!bottom && !start && !end) return
    val color = page.copy(alpha = 0.9f)
    val bar = WindowInsets.navigationBars
    Box(Modifier.fillMaxSize()) {
        if (bottom) {
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().windowInsetsBottomHeight(bar).background(color))
        }
        if (start) {
            Box(Modifier.align(Alignment.CenterStart).fillMaxHeight().windowInsetsStartWidth(bar).background(color))
        }
        if (end) {
            Box(Modifier.align(Alignment.CenterEnd).fillMaxHeight().windowInsetsEndWidth(bar).background(color))
        }
    }
}

/**
 * Tells the controller the system bars' sizes, which the bars' insets are
 * measured from. The keyboard isn't one of them: Capacitor's SystemBars lifts
 * the whole window above it.
 */
@Composable
private fun ReportSystemInsets(chrome: ChromeController) {
    val density = LocalDensity.current
    val bars = WindowInsets.statusBars.union(WindowInsets.navigationBars).union(WindowInsets.displayCutout)
    val top = bars.getTop(density) / density.density
    val bottom = bars.getBottom(density) / density.density
    SideEffect { chrome.onSystemInsets(top, bottom) }
}

// MARK: - Shared

/** An icon button whose label shows on a long press, as Material asks of icon buttons. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarButton(
    @DrawableRes icon: Int,
    label: String,
    enabled: Boolean = true,
    tint: Color? = null,
    stateDescription: String? = null,
    onClick: () -> Unit,
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Below),
        tooltip = { PlainTooltip { Text(label) } },
        state = rememberTooltipState(),
    ) {
        IconButton(
            onClick = onClick,
            // Round at rest, squarer while pressed (Material 3 Expressive).
            shapes = IconButtonDefaults.shapes(),
            enabled = enabled,
            modifier = if (stateDescription != null) {
                Modifier.semantics { this.stateDescription = stateDescription }
            } else {
                Modifier
            },
        ) {
            Icon(
                painterResource(icon),
                contentDescription = label,
                tint = if (tint != null && enabled) tint else LocalContentColor.current,
            )
        }
    }
}

// MARK: - Snackbar

/** The toast's text, and whether it is a button ("Voltar para Gn 3,5"). */
private class ToastVisuals(val toast: Toast) : SnackbarVisuals {
    override val message = toast.message
    override val actionLabel = if (toast.button) toast.message else null
    override val withDismissAction = toast.button
    override val duration = if (toast.button) SnackbarDuration.Indefinite else SnackbarDuration.Short
}

/**
 * A snackbar above the bottom bars. A button toast is the way back after
 * following a reference: the message is the button, with ✕ beside it, as the
 * web app's snackbar has; it stays until either is tapped or another toast
 * replaces it.
 */
@Composable
private fun ToastHost(chrome: ChromeController, modifier: Modifier) {
    val host = remember { SnackbarHostState() }
    val toast = chrome.toast
    LaunchedEffect(toast) {
        if (toast == null) return@LaunchedEffect
        val result = host.showSnackbar(ToastVisuals(toast))
        chrome.toastDone(toast, tapped = result == SnackbarResult.ActionPerformed)
    }
    SnackbarHost(
        host,
        modifier
            .windowInsetsPadding(WindowInsets.navigationBars.only(WindowInsetsSides.Horizontal))
            .padding(start = 16.dp, end = 16.dp, bottom = (chrome.insets.bottom + 12).dp),
    ) { data ->
        val visuals = data.visuals as? ToastVisuals
        // Dark in either theme: Material's inverse colours are light over a
        // dark page, where the snackbar glared over the text.
        val dark = isDarkTheme(chrome.themeMode)
        val colors = MaterialTheme.colorScheme
        val container = if (dark) colors.surfaceContainerHighest else colors.inverseSurface
        val content = if (dark) colors.onSurface else colors.inverseOnSurface
        if (visuals?.toast?.button == true) {
            // "Voltar para Mateus 5,3", worded as on the web and iOS, no wider
            // than its words, so it leaves the text and auto-scroll's button
            // clear. Only the words are the button, ✕ set apart from them: a
            // slip on the way to closing it mustn't lose the reader's place.
            Surface(
                modifier = Modifier.widthIn(max = WIDE_CONTENT),
                shape = MaterialTheme.shapes.extraLarge,
                color = container,
                contentColor = content,
                shadowElevation = 6.dp,
            ) {
                Row(Modifier.padding(start = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(
                        onClick = { data.performAction() },
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = if (dark) colors.primary else colors.inversePrimary,
                        ),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
                        modifier = Modifier.heightIn(min = 48.dp).weight(1f, fill = false),
                    ) {
                        Icon(painterResource(R.drawable.ic_undo), contentDescription = null)
                        Text(
                            visuals.message,
                            Modifier.padding(start = 12.dp),
                            style = MaterialTheme.typography.labelLarge,
                            maxLines = 2,
                        )
                    }
                    BarButton(R.drawable.ic_close, "Fechar") { data.dismiss() }
                }
            }
        } else {
            Snackbar(data, Modifier.widthIn(max = WIDE_CONTENT), containerColor = container, contentColor = content)
        }
    }
}
