package org.capuchinhos.biblia.chrome

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.text.modifiers.TextAutoSizeLayoutScope
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.capuchinhos.biblia.R

/**
 * Smaller a step at a time until the text fits its lines with every word
 * whole: a name too wide for its tile ("Tessalonicenses") shrinks rather
 * than break, as in the iOS app.
 */
private data class WholeWordsAutoSize(val min: TextUnit, val max: TextUnit) : TextAutoSize {
    override fun TextAutoSizeLayoutScope.getFontSize(constraints: Constraints, text: AnnotatedString): TextUnit {
        var size = max.value
        while (size > min.value) {
            val layout = performLayout(constraints, text, size.sp)
            val lineEnds = (0 until layout.lineCount - 1).map { layout.getLineEnd(it) }
            if (!layout.hasVisualOverflow && breaksBetweenWords(text.text, lineEnds)) return size.sp
            size -= 1
        }
        return min
    }
}

/**
 * "← Livros", spelt out: a bare arrow didn't say it leads to the book list
 * (iOS shows the same words on its back button). The arrow sits where an
 * IconButton's would, 16dp in.
 */
@Composable
private fun BackToBooks(onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        contentPadding = PaddingValues(start = 12.dp, end = 16.dp),
    ) {
        Icon(painterResource(R.drawable.ic_arrow_back), contentDescription = null)
        Spacer(Modifier.width(ButtonDefaults.IconSpacing))
        Text("Livros", maxLines = 1)
    }
}

/** A grid of chapter numbers, the introduction first across the full width. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ChapterGrid(
    book: PassagePickerData.Book,
    current: Int?,
    asList: Boolean,
    onToggleList: () -> Unit,
    /** Null beside the book list, which is then the way to another book. */
    onBack: (() -> Unit)?,
    onClose: (() -> Unit)?,
    onChoose: (Int) -> Unit,
) {
    val gridState = rememberLazyGridState()
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()
    LaunchedEffect(Unit) {
        val index = book.chapters.indexOfFirst { it.number == current }
        if (index > 15) gridState.scrollToItem(index - 10)
    }
    Scaffold(
        modifier = Modifier
            .nestedScroll(scrollBehavior.nestedScrollConnection)
            .semantics { paneTitle = book.name },
        topBar = {
            TopAppBar(
                navigationIcon = { onBack?.let { BackToBooks(onClick = it) } },
                title = {
                    // Shrinks before it cuts: "Livros" beside it leaves
                    // "Evangelho de São Mateus" a little short of room. A
                    // name too long even then ("Primeira Carta aos
                    // Tessalonicenses") gives way to the book's label, until
                    // the window is resized (rotation).
                    var short by remember(book.id, LocalWindowInfo.current.containerSize) { mutableStateOf(false) }
                    Text(
                        if (short) book.label else book.name,
                        Modifier.semantics { heading() },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        onTextLayout = { if (it.hasVisualOverflow) short = true },
                        autoSize = TextAutoSize.StepBased(
                            minFontSize = 16.sp,
                            maxFontSize = MaterialTheme.typography.titleLarge.fontSize,
                        ),
                    )
                },
                actions = {
                    // Numbers for speed (Salmos, Isaías), or a list with each
                    // chapter's title to find one by what it tells.
                    if (asList) {
                        BarButton(R.drawable.ic_grid_view, "Mostrar só os números", onClick = onToggleList)
                    } else {
                        BarButton(R.drawable.ic_view_list, "Mostrar os títulos", onClick = onToggleList)
                    }
                    onClose?.let { BarButton(R.drawable.ic_close, "Fechar", onClick = it) }
                },
                scrollBehavior = scrollBehavior,
            )
        },
    ) { padding ->
        if (asList) {
            ChapterList(book, current, padding, onChoose)
            return@Scaffold
        }
        val direction = LocalLayoutDirection.current
        LazyVerticalGrid(
            columns = GridCells.Adaptive(64.dp),
            state = gridState,
            contentPadding = PaddingValues(
                start = padding.calculateStartPadding(direction) + 16.dp,
                end = padding.calculateEndPadding(direction) + 16.dp,
                top = padding.calculateTopPadding() + 8.dp,
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(
                book.chapters,
                key = { it.number },
                span = { if (it.label.isEmpty()) GridItemSpan(maxLineSpan) else GridItemSpan(1) },
            ) { chapter ->
                val intro = chapter.label.isEmpty()
                Tile(
                    text = if (intro) "Introdução" else chapter.label,
                    detail = chapter.detail?.let { "($it)" },
                    current = chapter.number == current,
                    ribbon = ribbonColor(chapter.bookmark),
                    spoken = spokenLabel(chapter),
                    textStyle = if (intro) MaterialTheme.typography.labelLarge else MaterialTheme.typography.titleMedium,
                    // A long press shows the chapter's section title, which the cell has no room for.
                    longPressTitle = chapter.title?.takeIf { !intro && it.isNotEmpty() }?.let { "${chapter.label} · $it" },
                    markCurrent = !intro,
                ) { onChoose(chapter.number) }
            }
        }
    }
}

/** The chapters as a list, each with its title: "5 · Sermão da Montanha". */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun ChapterList(
    book: PassagePickerData.Book,
    current: Int?,
    padding: PaddingValues,
    onChoose: (Int) -> Unit,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) {
        val index = book.chapters.indexOfFirst { it.number == current }
        if (index > 3) listState.scrollToItem(index - 3)
    }
    val colors = MaterialTheme.colorScheme
    LazyColumn(state = listState, contentPadding = padding) {
        items(book.chapters, key = { it.number }) { chapter ->
            val intro = chapter.label.isEmpty()
            val selected = chapter.number == current
            ListItem(
                supportingContent = chapter.detail?.let { { Text("Na liturgia, ${it}") } },
                leadingContent = {
                    Surface(
                        // The current one in the grid's scalloped badge.
                        shape = if (selected) MaterialShapes.Cookie9Sided.toShape() else MaterialTheme.shapes.medium,
                        color = if (selected) colors.primary else colors.surfaceContainerHigh,
                        contentColor = if (selected) colors.onPrimary else colors.onSurface,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            if (intro) {
                                Icon(painterResource(R.drawable.ic_article), contentDescription = null, Modifier.size(20.dp))
                            } else {
                                Text(chapter.label, style = MaterialTheme.typography.titleSmall)
                            }
                        }
                    }
                },
                trailingContent = ribbonColor(chapter.bookmark)?.let { ribbon ->
                    { Icon(painterResource(R.drawable.ic_bookmark_filled), contentDescription = null, tint = ribbon) }
                },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier
                    .clickable(role = Role.Button) { onChoose(chapter.number) }
                    .clearAndSetSemantics {
                        contentDescription = spokenLabel(chapter)
                        if (selected) this.selected = true
                    },
            ) {
                Text(
                    when {
                        intro -> "Introdução"
                        chapter.title.isNullOrEmpty() -> "Capítulo ${chapter.label}"
                        else -> chapter.title
                    },
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun spokenLabel(chapter: PassagePickerData.Chapter): String {
    if (chapter.label.isEmpty()) return chapter.title ?: "Introdução"
    var label = chapter.spoken ?: "Capítulo ${chapter.label}"
    if (!chapter.title.isNullOrEmpty()) label += ", ${chapter.title}"
    if (chapter.bookmark != null) label += ", com marcador"
    return label
}

/**
 * A chapter number, or a book. The current one is filled with the primary
 * colour, or with [markCurrent] stands in a scalloped badge; a bookmarked
 * chapter shows its ribbon's colour as a dot.
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
internal fun Tile(
    text: String,
    current: Boolean,
    spoken: String,
    textStyle: TextStyle,
    detail: String? = null,
    ribbon: Color? = null,
    longPressTitle: String? = null,
    lines: Int = 1,
    /** Smaller text where it doesn't fit, words kept whole. */
    shrink: Boolean = false,
    minHeight: Dp = 56.dp,
    /**
     * The current one in a badge of its own shape (Material 3 Expressive):
     * found by its outline among the others, not by its colour alone.
     */
    markCurrent: Boolean = false,
    onClick: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    val badge = current && markCurrent
    Box {
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = when {
                badge -> Color.Transparent
                current -> colors.primary
                else -> colors.surfaceContainerHigh
            },
            contentColor = if (current) colors.onPrimary else colors.onSurface,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = minHeight)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = if (longPressTitle != null) ({ menu = true }) else null,
                    role = Role.Button,
                )
                // The spoken label only: merged, TalkBack added the number
                // after it ("Capítulo 1, …. 1").
                .clearAndSetSemantics {
                    contentDescription = spoken
                    if (current) selected = true
                },
        ) {
            Box(contentAlignment = Alignment.Center) {
                if (badge) {
                    // The tile's height, square: the shape undistorted, and
                    // the row no taller than the others.
                    Box(Modifier.size(minHeight).background(colors.primary, MaterialShapes.Cookie9Sided.toShape()))
                }
                Column(
                    Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text,
                        style = textStyle,
                        maxLines = lines,
                        textAlign = TextAlign.Center,
                        autoSize = if (shrink) WholeWordsAutoSize(min = 9.sp, max = textStyle.fontSize) else null,
                    )
                    if (detail != null) {
                        Text(detail, style = MaterialTheme.typography.labelSmall, modifier = Modifier.alpha(0.7f))
                    }
                }
                // Ringed in the page's colour, so it shows on the current
                // chapter's filled cell as on the others.
                if (ribbon != null) {
                    Surface(
                        shape = CircleShape,
                        color = ribbon,
                        border = BorderStroke(2.dp, colors.surface),
                        modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(14.dp),
                    ) {}
                }
            }
        }
        if (longPressTitle != null) {
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                Text(
                    longPressTitle,
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp).width(240.dp),
                    style = MaterialTheme.typography.labelLarge,
                    color = colors.onSurfaceVariant,
                )
                DropdownMenuItem(
                    text = { Text("Abrir") },
                    leadingIcon = { Icon(painterResource(R.drawable.ic_menu_book), contentDescription = null) },
                    onClick = {
                        menu = false
                        onClick()
                    },
                )
            }
        }
    }
}
