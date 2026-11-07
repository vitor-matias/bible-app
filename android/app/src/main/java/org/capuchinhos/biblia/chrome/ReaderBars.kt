package org.capuchinhos.biblia.chrome

import android.content.pm.PackageManager
import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
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
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.collectLatest
import org.capuchinhos.biblia.R

// MARK: - Reader

/** Above this text scale the section heading leaves the bar: the passage keeps its room. */
internal const val SUBTITLE_MAX_FONT_SCALE = 1.3f

internal fun subtitleFits(fontScale: Float) = fontScale < SUBTITLE_MAX_FONT_SCALE

/**
 * The reader's top bar height in dp: [base] (Material's 64, 56 in a short
 * window), or taller where large text needs it. The heading's line is
 * reserved whether or not a heading shows, or the bar, and the web page's
 * text under it, would jump each time one scrolls in or out.
 */
internal fun readerBarHeightDp(base: Float, titleLine: Float, subtitleLine: Float, fontScale: Float): Float =
    maxOf(base, titleLine + (if (subtitleFits(fontScale)) subtitleLine else 0f) + 8f)

@Composable
private fun readerBarHeight(): Dp {
    val typography = MaterialTheme.typography
    val base = if (LocalConfiguration.current.screenHeightDp < 480) 56f else BarMetrics.topBar
    val density = LocalDensity.current
    return with(density) {
        readerBarHeightDp(
            base,
            typography.titleLargeEmphasized.lineHeight.toDp().value,
            typography.bodyMedium.lineHeight.toDp().value,
            fontScale,
        ).dp
    }
}

/**
 * The reader's bars, Material's way: the passage is the top bar's title, and
 * the bars scroll away with the text and come back when it scrolls up (the
 * web app says when: `collapsed`). They stay composed and slide off the
 * screen, so coming back costs no rebuilding while the page scrolls. The
 * chapter arrows wait in the bottom corners while the bars show; auto-scroll's
 * control floats over the text, between them.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
internal fun ReaderBars(chrome: ChromeController, state: ChromeState, barColor: Color, page: Color) {
    val enabled = !state.inert
    val collapsed = chrome.collapsed
    val density = LocalDensity.current
    val showSubtitle = state.subtitle != null && subtitleFits(density.fontScale)
    val barHeight = readerBarHeight()
    SideEffect { chrome.onTopBarHeight(barHeight.value) }
    // Material's motion for bars leaving and coming back: out quickly,
    // easing in. Off with animations, it snaps.
    val away by animateFloatAsState(
        if (collapsed) 1f else 0f,
        if (collapsed) tween(150, easing = FastOutLinearInEasing) else tween(200, easing = LinearOutSlowInEasing),
        label = "bars",
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
                .inert(away == 1f),
        ) {
            val filter = state.filterPlaceholder?.takeIf { state.filterOpen }
            TopAppBar(
                navigationIcon = {
                    if (filter != null) BarButton(R.drawable.ic_arrow_back, "Fechar", enabled) { chrome.send("filter-close") }
                },
                title = {
                    if (filter != null) {
                        FilterField(chrome, state, filter, enabled)
                    } else {
                        PassageTitle(chrome, state, enabled, showSubtitle)
                    }
                },
                actions = {
                    if (filter == null) {
                        if (state.search) {
                            BarButton(R.drawable.ic_search, "Pesquisar", enabled) { chrome.send("search") }
                        }
                        BookmarksButton(chrome, state, enabled)
                        BarButton(R.drawable.ic_format_size, "Texto e aparência", enabled) {
                            chrome.present(Sheet.Appearance)
                        }
                        MoreMenu(chrome, state, enabled)
                    }
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
                        .graphicsLayer { translationY = away * bottomPx }
                        .inert(away == 1f),
                ) {
                    ChapterArrows(chrome, state, enabled && away == 0f)
                }
            } else if (state.filterPlaceholder != null && !state.filterOpen) {
                // A list's filter, in the arrow's corner on a page without them.
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp)
                        .graphicsLayer { translationY = away * bottomPx }
                        .inert(away == 1f),
                    horizontalArrangement = Arrangement.End,
                ) {
                    ChapterButton(R.drawable.ic_filter_list, "Filtrar", enabled && away == 0f) { chrome.send("filter") }
                }
            }
        }
        // Over the text, anywhere between the bars as they rest. Playing, it
        // stays while they hide for reading; paused, it goes with them, as on
        // iOS. Not over a panel, which the bars make way for too.
        AnimatedVisibility(
            visible = state.autoScroll != null && !state.inert && (state.autoScroll?.playing == true || !collapsed),
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(statusInsets.only(WindowInsetsSides.Top))
                .padding(top = barHeight + AUTO_SCROLL_GAP)
                .windowInsetsPadding(bottomInsets)
                .padding(bottom = FloatingToolbarDefaults.ScreenOffset + BarMetrics.chapterButton.dp + AUTO_SCROLL_GAP)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
                .padding(horizontal = 16.dp),
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            state.autoScroll?.let { AutoScrollControl(chrome, it, enabled) }
        }
    }
}

/** Auto-scroll's control keeps this far from the bars and the arrows. */
private val AUTO_SCROLL_GAP = 12.dp

/**
 * "Mateus 5 ▾", the button to the book and chapter picker, with the heading
 * of the section being read under it. The heading is the page's own, which
 * TalkBack reaches there: here it would only be said again at every section.
 * Its name starts with what it shows ("Gn 1, …"), so Voice Access finds it.
 */
@Composable
internal fun PassageTitle(chrome: ChromeController, state: ChromeState, enabled: Boolean, showSubtitle: Boolean) {
    BoxWithConstraints {
        // Emphasized (Material 3 Expressive): the passage, and the way to
        // another, stands out from the bar's icons. SemiBold: the style's own
        // Medium drew as Regular with the system's Roboto (API 37 emulator).
        val style = MaterialTheme.typography.titleLargeEmphasized.copy(fontWeight = FontWeight.SemiBold)
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
 * stays, under the status bar, while the bar is away. The web reads the
 * position at most 20 times a second: the line glides between readings,
 * picking up each one where the last left it moving, rather than stepping.
 * Read as it is drawn: a scroll only redraws the line.
 */
@Composable
private fun ReadingProgress(progress: () -> Float) {
    val shown = remember { Animatable(progress()) }
    LaunchedEffect(Unit) {
        snapshotFlow(progress).collectLatest { shown.animateTo(it, PROGRESS_GLIDE) }
    }
    LinearProgressIndicator(
        progress = { shown.value },
        modifier = Modifier
            .fillMaxWidth()
            .height(3.dp)
            .clearAndSetSemantics {},
        trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
        gapSize = 0.dp,
        drawStopIndicator = {},
    )
}

/** Critically damped: the line never runs past where the text is. */
private val PROGRESS_GLIDE = spring<Float>(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)

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

/**
 * A tonal floating button, Material's standard 56 dp. Its corners tighten as
 * it is pressed and spring back (Material 3 Expressive), so a tap is seen to
 * land.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun ChapterButton(@DrawableRes icon: Int, label: String, enabled: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val corner by animateDpAsState(
        if (pressed) 8.dp else 16.dp,
        MaterialTheme.motionScheme.fastSpatialSpec(),
        label = "press",
    )
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
        tooltip = { PlainTooltip { Text(label) } },
        state = rememberTooltipState(),
    ) {
        FloatingActionButton(
            onClick = { if (enabled) onClick() },
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            shape = RoundedCornerShape(corner),
            elevation = FloatingActionButtonDefaults.loweredElevation(),
            interactionSource = interaction,
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
            // A page that can't have it at all (the pastoral index) leaves it
            // out; a chapter in pages shows it disabled.
            if (state.autoScrollAvailable || state.viewMode != null) {
                MenuItem("Deslocamento automático", R.drawable.ic_arrow_circle_down, state.autoScrollAvailable,
                    checked = state.autoScrollVisible) { choose("auto-scroll") }
            }
            if (state.canShare) MenuItem("Partilhar", R.drawable.ic_share) { choose("share") }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            MenuItem("Como usar a app", R.drawable.ic_help) { choose("help") }
            MenuItem("Sobre a Bíblia", R.drawable.ic_info) { choose("about") }
            if (state.canReport) MenuItem("Reportar erro", R.drawable.ic_report_problem) { choose("report") }
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
fun MenuItem(
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

// MARK: - Page

/** A plain page: Back, its title, and search. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PageBar(chrome: ChromeController, state: ChromeState, barColor: Color) {
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
