package org.capuchinhos.biblia.chrome

import android.content.pm.PackageManager
import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
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
        // The web's chapter cards sit among the bars: they take the same
        // surface, wallpaper's or brown.
        val cardSurface = MaterialTheme.colorScheme.surfaceContainerHigh.toArgb()
        SideEffect { chrome.onPalette(cardSurface) }
        Box(Modifier.fillMaxSize()) {
            when (state.mode) {
                ChromeMode.Reader -> ReaderBars(chrome, state, barColor, page)
                ChromeMode.Search -> SearchView(chrome, state)
                ChromeMode.Page -> PageBar(chrome, state, barColor)
                ChromeMode.None -> {}
            }
            ToastHost(chrome, Modifier.align(Alignment.BottomCenter))
        }
        chrome.sheet?.let { SheetHost(chrome, it) }
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
private fun barColors(container: Color) = TopAppBarDefaults.topAppBarColors(
    containerColor = container,
    scrolledContainerColor = container,
)

/** An inert bar (a web panel over the page) is out of TalkBack's reading. */
private fun Modifier.inert(inert: Boolean) = if (inert) clearAndSetSemantics {} else this

/** Bars moved off the screen are out of TalkBack's reading too. */
private fun Modifier.away(away: Boolean) = if (away) clearAndSetSemantics {} else this

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

// MARK: - Reader

/** Above this text scale the section heading leaves the bar: the passage keeps its room. */
private const val SUBTITLE_MAX_FONT_SCALE = 1.3f

/**
 * The reader's top bar height: Material's 64 dp, 56 dp in a short window
 * (a phone on its side), and taller where large text needs it.
 */
@Composable
private fun readerBarHeight(subtitle: Boolean): Dp {
    val typography = MaterialTheme.typography
    val base = if (LocalConfiguration.current.screenHeightDp < 480) 56.dp else BarMetrics.topBar.dp
    val text = with(LocalDensity.current) {
        typography.titleLarge.lineHeight.toDp() + if (subtitle) typography.bodyMedium.lineHeight.toDp() else 0.dp
    }
    return maxOf(base, text + 8.dp)
}

/**
 * The reader's bars, Material's way: the passage is the top bar's title, and
 * the bars scroll away with the text and come back when it scrolls up (the
 * web app says when: `collapsed`). They stay composed and slide off the
 * screen, so coming back costs no rebuilding while the page scrolls. The
 * chapter arrows wait in the bottom corners while the bars show; auto-scroll's
 * toolbar takes their row while it is up.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun ReaderBars(chrome: ChromeController, state: ChromeState, barColor: Color, page: Color) {
    val enabled = !state.inert
    val collapsed = chrome.collapsed
    val density = LocalDensity.current
    val showSubtitle = state.subtitle != null && density.fontScale < SUBTITLE_MAX_FONT_SCALE
    val barHeight = readerBarHeight(showSubtitle)
    SideEffect { chrome.onTopBarHeight(barHeight.value) }
    // Material's motion for bars leaving and coming back: out quickly,
    // easing in. Off with animations, it snaps.
    val away by animateFloatAsState(
        if (collapsed) 1f else 0f,
        if (collapsed) tween(150, easing = FastOutLinearInEasing) else tween(200, easing = LinearOutSlowInEasing),
        label = "bars",
    )
    val arrowsAway by animateFloatAsState(
        if (collapsed || state.autoScroll != null) 1f else 0f,
        if (collapsed) tween(150, easing = FastOutLinearInEasing) else tween(200, easing = LinearOutSlowInEasing),
        label = "arrows",
    )
    val statusInsets = WindowInsets.statusBars.union(WindowInsets.displayCutout)
    val statusTop = statusInsets.getTop(density)
    val barPx = with(density) { barHeight.toPx() }
    Box(Modifier.fillMaxSize()) {
        // Slid up past the screen's edge while away, so nothing over the
        // status bar can be tapped.
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .windowInsetsPadding(statusInsets.only(WindowInsetsSides.Top))
                .graphicsLayer { translationY = -away * (barPx + statusTop) }
                .away(away == 1f),
        ) {
            TopAppBar(
                title = { PassageTitle(chrome, state, enabled, showSubtitle) },
                actions = {
                    if (state.search) {
                        BarButton(R.drawable.ic_search, "Pesquisar", enabled) { chrome.send("search") }
                    }
                    BookmarksButton(chrome, state, enabled)
                    BarButton(R.drawable.ic_format_size, "Texto e aparência", enabled) {
                        chrome.present(Sheet.Appearance)
                    }
                    MoreMenu(chrome, state, enabled)
                },
                expandedHeight = barHeight,
                windowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal),
                colors = barColors(barColor),
            )
        }
        // Under the bar; while it is away, under the status bar's band.
        val showProgress by remember { derivedStateOf { chrome.progress != null } }
        if (showProgress) {
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .windowInsetsPadding(statusInsets.only(WindowInsetsSides.Top))
                    .padding(top = barHeight)
                    .graphicsLayer { translationY = -away * barPx },
            ) {
                ReadingProgress { chrome.progress ?: 0f }
            }
        }
        // The status bar keeps a band of its own: the text scrolls under the
        // bar, never under the clock. Drawn last, over the bar sliding away.
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .windowInsetsTopHeight(statusInsets)
                .background(animateColorAsState(if (collapsed) page else barColor, label = "status bar").value),
        )

        val bottomInsets = WindowInsets.navigationBars.union(WindowInsets.displayCutout.only(WindowInsetsSides.Horizontal))
        val bottomPx = bottomInsets.getBottom(density) +
            with(density) { (FloatingToolbarDefaults.ScreenOffset + BarMetrics.chapterButton.dp).toPx() }
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .windowInsetsPadding(bottomInsets)
                .padding(bottom = FloatingToolbarDefaults.ScreenOffset),
            contentAlignment = Alignment.BottomCenter,
        ) {
            if (state.chapterNavigation) {
                Box(
                    Modifier
                        .graphicsLayer { translationY = arrowsAway * bottomPx }
                        .away(arrowsAway == 1f),
                ) {
                    ChapterArrows(chrome, state, enabled && arrowsAway == 0f)
                }
            }
            // Within reach while the bars hide for reading, but not over a
            // panel, which the other bars make way for too.
            AnimatedVisibility(
                visible = state.autoScroll != null && !state.inert,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                state.autoScroll?.let { AutoScrollToolbar(chrome, it, enabled) }
            }
        }
    }
}

/**
 * "Mateus 5 ▾", the button to the book and chapter picker, with the heading
 * of the section being read under it. The heading is the page's own, which
 * TalkBack reaches there: here it would only be said again at every section.
 * Its name starts with what it shows ("Gn 1, …"), so Voice Access finds it.
 */
@Composable
private fun PassageTitle(chrome: ChromeController, state: ChromeState, enabled: Boolean, showSubtitle: Boolean) {
    BoxWithConstraints {
        val style = MaterialTheme.typography.titleLarge
        val fitted = fittedPassage(state, style, maxWidth)
        val spoken = state.passageAccessibilityLabel
        val name = if (spoken.contains(fitted.label, ignoreCase = true)) spoken else "${fitted.label}, $spoken"
        Column(
            Modifier
                // The text on Material's title keyline; the ripple around it.
                .offset(x = (-8).dp)
                .clip(MaterialTheme.shapes.small)
                .clickable(enabled = enabled, role = Role.Button) { chrome.send("passage") }
                .clearAndSetSemantics {
                    contentDescription = name
                    role = Role.Button
                    onClick(label = "Escolher livro e capítulo") { chrome.send("passage"); true }
                    // Said when it changes (an arrow, a swipe), as iOS announces it.
                    liveRegion = LiveRegionMode.Polite
                }
                // Android's touch target, however short the text.
                .heightIn(min = 48.dp)
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    fitted.label,
                    style = style,
                    maxLines = 1,
                    // Cut only as a last resort, and from the front: the
                    // chapter's number is what matters.
                    overflow = if (fitted.fits) TextOverflow.Clip else TextOverflow.StartEllipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (fitted.caret) Icon(painterResource(R.drawable.ic_arrow_drop_down), contentDescription = null)
            }
            if (showSubtitle) {
                state.subtitle?.let { subtitle ->
                    AnimatedContent(subtitle, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "section") {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

/** The passage as the title shows it, and whether the ▾ has room beside it. */
private data class FittedPassage(val label: String, val caret: Boolean, val fits: Boolean)

/**
 * "Deuteronómio 3", or, where that doesn't fit, the longest of its shorter
 * forms that does ("Dt 3"). Without room even then, the ▾ makes way, and only
 * after that is the label cut.
 */
@Composable
private fun fittedPassage(state: ChromeState, style: TextStyle, width: Dp): FittedPassage {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    // The button's padding, and with the ▾ its 24 dp.
    val bare = with(density) { (width - 16.dp).roundToPx() }
    val withCaret = with(density) { (width - 16.dp - 24.dp).roundToPx() }
    return remember(state.passageLabel, state.passageShortLabels, bare, style, density) {
        val labels = listOf(state.passageLabel) + state.passageShortLabels
        val widths = labels.map { measurer.measure(it, style, maxLines = 1).size.width }
        labels.indices.firstOrNull { widths[it] <= withCaret }?.let { FittedPassage(labels[it], caret = true, fits = true) }
            ?: labels.indices.firstOrNull { widths[it] <= bare }?.let { FittedPassage(labels[it], caret = false, fits = true) }
            ?: FittedPassage(labels.last(), caret = false, fits = false)
    }
}

/**
 * How far through the chapter the reader is, a line under the top bar on a
 * faint track, so it reads as a gauge rather than something loading. It
 * stays, under the status bar, while the bar is away. Read as it is drawn:
 * a scroll only redraws the line.
 */
@Composable
private fun ReadingProgress(progress: () -> Float) {
    LinearProgressIndicator(
        progress = progress,
        modifier = Modifier
            .fillMaxWidth()
            .height(3.dp)
            .clearAndSetSemantics {},
        trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
        gapSize = 0.dp,
        drawStopIndicator = {},
    )
}

/**
 * ‹ and › in the bottom corners, set in from the edges where the back gesture
 * starts. In pages, they turn the page; at either end, the chapter.
 */
@Composable
private fun ChapterArrows(chrome: ChromeController, state: ChromeState, enabled: Boolean) {
    val paged = state.viewMode == "paged"
    Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
        if (state.canGoPrevious) {
            ChapterButton(R.drawable.ic_chevron_left, if (paged) "Página anterior" else "Capítulo anterior", enabled) {
                chrome.send("previous")
            }
        }
        Spacer(Modifier.weight(1f))
        if (state.canGoNext) {
            ChapterButton(R.drawable.ic_chevron_right, if (paged) "Página seguinte" else "Capítulo seguinte", enabled) {
                chrome.send("next")
            }
        }
    }
}

/** A tonal floating button, Material's standard 56 dp. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChapterButton(@DrawableRes icon: Int, label: String, enabled: Boolean, onClick: () -> Unit) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
        tooltip = { PlainTooltip { Text(label) } },
        state = rememberTooltipState(),
    ) {
        FloatingActionButton(
            onClick = { if (enabled) onClick() },
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            elevation = FloatingActionButtonDefaults.loweredElevation(),
        ) {
            Icon(painterResource(icon), contentDescription = label)
        }
    }
}

/** Marcadores: the chapter's ribbon, in its colour, when it has one. */
@Composable
private fun BookmarksButton(chrome: ChromeController, state: ChromeState, enabled: Boolean) {
    val ribbon = ribbonColor(state.bookmarkColor)
    BarButton(
        icon = if (ribbon != null) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark,
        label = "Marcadores",
        enabled = enabled,
        tint = ribbon,
        stateDescription = state.bookmarkName?.let { "marcador $it neste capítulo" },
    ) { chrome.send("bookmarks") }
}

/**
 * ⋮: what to do with the reading, then the app's help and legal pages, and
 * the version's small print: the web header's menu, but Marcadores and the
 * text settings, which have buttons of their own.
 */
@Composable
private fun MoreMenu(chrome: ChromeController, state: ChromeState, enabled: Boolean) {
    var open by remember { mutableStateOf(false) }
    Box {
        BarButton(R.drawable.ic_more_vert, "Mais opções", enabled) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            fun choose(action: String) {
                open = false
                chrome.send(action)
            }
            MenuItem("Deslocamento automático", R.drawable.ic_arrow_circle_down, state.autoScrollAvailable,
                checked = state.autoScrollVisible) { choose("auto-scroll") }
            if (state.canShare) MenuItem("Partilhar", R.drawable.ic_share) { choose("share") }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            if (state.canReport) MenuItem("Reportar erro", R.drawable.ic_report_problem) { choose("report") }
            MenuItem("Como usar a app", R.drawable.ic_help) { choose("help") }
            MenuItem("Política de Privacidade", R.drawable.ic_privacy_tip) { choose("privacy") }
            versionLine(state.buildVersion)?.let { version ->
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Text(
                    version,
                    Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun MenuItem(
    label: String,
    @DrawableRes icon: Int,
    enabled: Boolean = true,
    checked: Boolean = false,
    onClick: () -> Unit,
) {
    DropdownMenuItem(
        text = { Text(label) },
        onClick = onClick,
        enabled = enabled,
        leadingIcon = { Icon(painterResource(icon), contentDescription = null) },
        trailingIcon = if (checked) {
            { Icon(painterResource(R.drawable.ic_check), contentDescription = "Ativo") }
        } else {
            null
        },
    )
}

/**
 * "1.2.3 · 20261016-120000Z": the release CI sets from the release tag, then
 * when the web bundle was compiled.
 */
@Composable
private fun versionLine(buildVersion: String?): String? {
    val context = LocalContext.current
    val release = remember {
        try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }
    }
    return listOfNotNull(release, buildVersion).filter { it.isNotEmpty() }
        .takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

/**
 * ✕ on its own, apart from − speed +, which a slip mustn't turn into
 * closing; play or pause as the toolbar's button. Read hands-free.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun AutoScrollToolbar(chrome: ChromeController, autoScroll: AutoScrollState, enabled: Boolean) {
    val colors = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Surface(
            shape = CircleShape,
            color = colors.surfaceContainer,
            shadowElevation = FloatingToolbarDefaults.ContainerExpandedElevation,
            modifier = Modifier.size(56.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                BarButton(R.drawable.ic_close, "Fechar o deslocamento automático", enabled) {
                    chrome.send("auto-scroll")
                }
            }
        }
        HorizontalFloatingToolbar(
            expanded = true,
            floatingActionButton = {
                // At the page's end there's nothing left to play: greyed out.
                val canPress = enabled && (autoScroll.playing || autoScroll.canPlay)
                // The accent itself, which stands out from the page in either
                // theme (a container would be 1.85:1 on the dark page).
                FloatingToolbarDefaults.VibrantFloatingActionButton(
                    onClick = { if (canPress) chrome.send("auto-scroll-toggle") },
                    modifier = if (canPress) Modifier else Modifier.semantics { disabled() },
                    containerColor = colors.primary,
                    contentColor = colors.onPrimary.copy(alpha = if (canPress) 1f else 0.38f),
                ) {
                    Icon(
                        painterResource(if (autoScroll.playing) R.drawable.ic_pause_filled else R.drawable.ic_play_arrow_filled),
                        contentDescription = if (autoScroll.playing) "Pausar" else "Iniciar",
                    )
                }
            },
        ) {
            BarButton(R.drawable.ic_remove, "Diminuir velocidade", enabled && autoScroll.canSlower) {
                chrome.send("auto-scroll-slower")
            }
            Text(
                autoScroll.speedLabel,
                Modifier
                    .widthIn(min = 48.dp)
                    .semantics {
                        contentDescription = "Velocidade"
                        stateDescription = autoScroll.speedAccessibilityLabel
                        // Said after − or +, which keep their own labels.
                        liveRegion = LiveRegionMode.Polite
                    },
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            BarButton(R.drawable.ic_add, "Aumentar velocidade", enabled && autoScroll.canFaster) {
                chrome.send("auto-scroll-faster")
            }
        }
    }
}

// MARK: - Search

/**
 * Material's full-screen search view, over the web page's results: Back, the
 * field and ✕ on the view's container, a divider, then the results. Before
 * anything is typed, the recent searches cover the page's hints.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SearchView(chrome: ChromeController, state: ChromeState) {
    var text by remember { mutableStateOf(state.query) }
    var focused by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    // Not while typing: a search that ran on a pause echoes its query.
    LaunchedEffect(state.query) {
        if (!focused) text = state.query
    }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val search: (String) -> Unit = { query ->
        text = query
        chrome.searchSubmit(query)
        keyboard?.hide()
    }
    Column(Modifier.fillMaxSize()) {
        Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.inert(state.inert)) {
            Column(Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))) {
                Row(
                    Modifier.fillMaxWidth().height(BarMetrics.searchView.dp).padding(start = 4.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BarButton(R.drawable.ic_arrow_back, "Voltar", !state.inert) { chrome.send("back") }
                    SearchBarDefaults.InputField(
                        query = text,
                        onQueryChange = {
                            text = it
                            chrome.searchInput(it)
                        },
                        onSearch = { if (it.isNotBlank()) search(it) },
                        expanded = true,
                        onExpandedChange = {},
                        modifier = Modifier
                            .weight(1f)
                            .focusRequester(focus)
                            .onFocusChanged { focused = it.isFocused },
                        enabled = !state.inert,
                        placeholder = { Text("Procurar na Bíblia") },
                        trailingIcon = if (text.isNotEmpty()) {
                            {
                                BarButton(R.drawable.ic_close, "Limpar", !state.inert) {
                                    text = ""
                                    chrome.searchInput("")
                                    focus.requestFocus()
                                    keyboard?.show()
                                }
                            }
                        } else {
                            null
                        },
                    )
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
        if (text.isEmpty() && chrome.recentSearches.isNotEmpty() && !state.inert) {
            RecentSearches(chrome, onSearch = search) { query ->
                text = query
                chrome.searchInput(query)
                focus.requestFocus()
            }
        }
    }
}

/**
 * The last searches, newest first: a tap searches again, ↖ puts the words in
 * the field to change them. Limpar forgets them all.
 */
@Composable
private fun RecentSearches(chrome: ChromeController, onSearch: (String) -> Unit, onEdit: (String) -> Unit) {
    // The page's colour, which the results come in on: no flash as they do.
    val page = chrome.pageColor?.let(::Color) ?: pageBackground(isDarkTheme(chrome.themeMode))
    Surface(color = page, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.semantics { paneTitle = "Pesquisas recentes" },
            contentPadding = WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal).asPaddingValues(),
        ) {
            // What the page's own hint says, which this pane covers: a
            // reference opens the passage.
            item(contentType = "hint") {
                Text(
                    "Procure versículos, livros ou referências. Por exemplo: Jo 3,16 · Salmo 23 · o bom pastor",
                    Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item(contentType = "header") {
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Recentes",
                        Modifier.weight(1f).semantics { heading() },
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = { chrome.forgetSearches() }) { Text("Limpar") }
                }
            }
            items(chrome.recentSearches, key = { it }) { query ->
                ListItem(
                    headlineContent = { Text(query, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    leadingContent = { Icon(painterResource(R.drawable.ic_history), contentDescription = null) },
                    trailingContent = {
                        BarButton(R.drawable.ic_north_west, "Editar «$query»") { onEdit(query) }
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable(onClickLabel = "Pesquisar") { onSearch(query) },
                )
            }
        }
    }
}

// MARK: - Page

/** A plain page: Back, its title, and search. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PageBar(chrome: ChromeController, state: ChromeState, barColor: Color) {
    val enabled = !state.inert
    TopAppBar(
        modifier = Modifier.inert(state.inert),
        navigationIcon = { BarButton(R.drawable.ic_arrow_back, "Voltar", enabled) { chrome.send("back") } },
        title = { Text(state.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        actions = {
            if (state.search) BarButton(R.drawable.ic_search, "Pesquisar", enabled) { chrome.send("search") }
        },
        colors = barColors(barColor),
    )
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
 * Material's snackbar above the bottom bars. A button toast is the way back
 * after following a reference: the message is the button, with ✕ beside it,
 * as the web app's snackbar has; it stays until either is tapped or another
 * toast replaces it.
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
        if (visuals?.toast?.button == true) {
            // "Voltar para Mateus 5,3", worded as on the web and iOS. Only the
            // words are the button, ✕ set apart from them: a slip on the way
            // to closing it mustn't lose the reader's place.
            Snackbar(
                dismissAction = {
                    Row {
                        Spacer(Modifier.width(8.dp))
                        BarButton(R.drawable.ic_close, "Fechar") { data.dismiss() }
                    }
                },
            ) {
                TextButton(
                    onClick = { data.performAction() },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.inversePrimary),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Icon(painterResource(R.drawable.ic_undo), contentDescription = null)
                    Text(
                        visuals.message,
                        Modifier.padding(start = 12.dp),
                        style = MaterialTheme.typography.labelLarge,
                        maxLines = 2,
                    )
                }
            }
        } else {
            Snackbar(data)
        }
    }
}
