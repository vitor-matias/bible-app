package org.capuchinhos.biblia.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.offset
import androidx.compose.ui.unit.sp
import org.capuchinhos.biblia.R

/** The number of chapters, the introduction aside. */
private val PassagePickerData.Book.chapterCount: Int
    get() = chapters.count { it.label.isNotEmpty() }

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
internal fun BookList(
    data: PassagePickerData,
    filter: String,
    onFilter: (String) -> Unit,
    view: BookView,
    onView: (BookView) -> Unit,
    listState: LazyListState,
    gridState: LazyGridState,
    placed: Boolean,
    onPlaced: () -> Unit,
    onClose: () -> Unit,
    /** The book highlighted: the one being read, or beside, the one shown. */
    selectedId: String? = data.currentBookId,
    onChoose: (PassagePickerData.Book) -> Unit,
) {
    val rows = remember(data, filter) { pickerRows(data, filter) }
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()
    val density = LocalDensity.current
    // Opens at the current book, once.
    LaunchedEffect(Unit) {
        if (placed) return@LaunchedEffect
        onPlaced()
        val index = rows.indexOfFirst { it is PickerRow.Book && it.book.id == data.currentBookId }
        if (index <= 0) return@LaunchedEffect
        if (view == BookView.List) {
            listState.scrollToItem(maxOf(index - 3, 0))
        } else {
            // Its row a little way down, clear of the testament's heading.
            gridState.scrollToItem(index)
            gridState.scrollBy(-with(density) { 120.dp.toPx() })
        }
    }
    // Back clears a filter before it closes the picker.
    BackHandler(enabled = filter.isNotEmpty()) { onFilter("") }
    val switchView = { new: BookView ->
        // The same books in view: list and grid have the same rows.
        if (view == BookView.List && new != BookView.List) {
            gridState.requestScrollToItem(listState.firstVisibleItemIndex)
        } else if (view != BookView.List && new == BookView.List) {
            listState.requestScrollToItem(gridState.firstVisibleItemIndex)
        }
        onView(new)
    }

    Scaffold(
        modifier = Modifier
            .nestedScroll(scrollBehavior.nestedScrollConnection)
            .semantics { paneTitle = "Livros" },
        topBar = {
            // The bar and the filter as one group, read before the list: the
            // list starts at the top too, under them, and came first.
            Column(Modifier.semantics { isTraversalGroup = true; traversalIndex = -1f }) {
                TopAppBar(
                    navigationIcon = { BarButton(R.drawable.ic_close, "Fechar", onClick = onClose) },
                    title = { Text("Livros", Modifier.semantics { heading() }) },
                    actions = { BookViewMenu(view, switchView) },
                    scrollBehavior = scrollBehavior,
                )
                // In view, not behind an icon: 73 books are a long way to scroll.
                FilterField(filter, rows.count { it is PickerRow.Book }, onFilter)
            }
        },
    ) { padding ->
        if (view != BookView.List) {
            BookGrid(rows, filter, compact = view == BookView.Abbreviations, gridState, padding, selectedId, onChoose)
            return@Scaffold
        }
        val direction = LocalLayoutDirection.current
        LazyColumn(
            // Below the bar and the filter, not under them: a sticky heading
            // pins to the list's top, whatever its content padding.
            modifier = Modifier.padding(top = padding.calculateTopPadding()),
            state = listState,
            contentPadding = PaddingValues(
                start = padding.calculateStartPadding(direction),
                end = padding.calculateEndPadding(direction),
                bottom = padding.calculateBottomPadding() + 16.dp,
            ),
        ) {
            for (row in rows) {
                when (row) {
                    is PickerRow.Testament -> stickyHeader(key = row.key, contentType = "testament") {
                        TestamentHeading(row.title)
                    }
                    is PickerRow.Group -> item(key = row.key, contentType = "group") { GroupHeading(row.title) }
                    is PickerRow.Book -> item(key = row.key, contentType = "book") {
                        BookRow(row.book, current = row.book.id == selectedId) { onChoose(row.book) }
                    }
                }
            }
            if (rows.isEmpty()) {
                item(contentType = "empty") { NoBooks(filter) }
            }
        }
    }
}

/**
 * The books as tiles, as in the iOS app: big ones with the names, or small
 * ones with the abbreviations that fit most of a testament on a screen.
 */
@Composable
private fun BookGrid(
    rows: List<PickerRow>,
    filter: String,
    compact: Boolean,
    gridState: LazyGridState,
    padding: PaddingValues,
    selectedId: String?,
    onChoose: (PassagePickerData.Book) -> Unit,
) {
    val style = if (compact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.labelLarge
    val lines = if (compact) 1 else 2
    val density = LocalDensity.current
    // Android scales large text by less than the font scale (nonlinear).
    val textScale = with(density) { style.fontSize.toDp().value / style.fontSize.value }
    // Room for every tile's lines, so the tiles of a row are the same height.
    val minHeight = maxOf(56.dp, with(density) { style.lineHeight.toDp() } * lines + 16.dp)
    val direction = LocalLayoutDirection.current
    LazyVerticalGrid(
        columns = GridCells.Adaptive(bookTileMinWidth(compact, textScale)),
        // As the list: below the bar, so the testament's heading pins in view.
        modifier = Modifier.padding(top = padding.calculateTopPadding()),
        state = gridState,
        contentPadding = PaddingValues(
            start = padding.calculateStartPadding(direction) + GRID_MARGIN,
            end = padding.calculateEndPadding(direction) + GRID_MARGIN,
            bottom = padding.calculateBottomPadding() + 24.dp,
        ),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for (row in rows) {
            when (row) {
                is PickerRow.Testament -> stickyHeader(key = row.key, contentType = "testament") {
                    TestamentHeading(row.title, Modifier.bleed(GRID_MARGIN))
                }
                is PickerRow.Group -> item(key = row.key, span = { GridItemSpan(maxLineSpan) }, contentType = "group") {
                    GroupHeading(row.title, Modifier.bleed(GRID_MARGIN))
                }
                is PickerRow.Book -> item(key = row.key, contentType = "book") {
                    val book = row.book
                    Tile(
                        text = if (compact) book.abbreviation else tileLabel(book.label),
                        current = book.id == selectedId,
                        spoken = spokenLabel(book),
                        textStyle = style,
                        lines = lines,
                        shrink = true,
                        minHeight = minHeight,
                    ) { onChoose(book) }
                }
            }
        }
        if (rows.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }, contentType = "empty") { NoBooks(filter) }
        }
    }
}

private val GRID_MARGIN = 16.dp

/** Out over the grid's side margins, so a heading's band is as wide as in the list. */
private fun Modifier.bleed(margin: Dp) = layout { measurable, constraints ->
    val extra = margin.roundToPx()
    val placeable = measurable.measure(constraints.offset(horizontal = extra * 2))
    layout(constraints.maxWidth, placeable.height) { placeable.place(-extra, 0) }
}

/** A testament's name, which stays at the top while its books scroll under it. */
@Composable
private fun TestamentHeading(title: String, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.surface, modifier = modifier.fillMaxWidth()) {
        Text(
            title,
            Modifier.padding(horizontal = 16.dp, vertical = 12.dp).semantics { heading() },
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun GroupHeading(title: String, modifier: Modifier = Modifier) {
    Text(
        title,
        modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp).semantics { heading() },
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun NoBooks(filter: String) {
    Text(
        "Nenhum livro com «${filter.trim()}»",
        Modifier
            .fillMaxWidth()
            .padding(24.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
    )
}

/** The books as a list or as tiles, from the bar; the choice is remembered. */
@Composable
private fun BookViewMenu(view: BookView, onView: (BookView) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        BarButton(view.icon, "Vista", stateDescription = view.label) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (option in BookView.entries) {
                MenuItem(option.label, option.icon, checked = option == view) {
                    open = false
                    onView(option)
                }
            }
        }
    }
}

private val BookView.label: String
    get() = when (this) {
        BookView.List -> "Lista"
        BookView.Names -> "Grelha com nomes"
        BookView.Abbreviations -> "Grelha com abreviaturas"
    }

private val BookView.icon: Int
    get() = when (this) {
        BookView.List -> R.drawable.ic_view_list
        BookView.Names -> R.drawable.ic_grid_view
        BookView.Abbreviations -> R.drawable.ic_grid_on
    }

/** What TalkBack says for a book: its name and how many chapters it has. */
private fun spokenLabel(book: PassagePickerData.Book): String = when (val count = book.chapterCount) {
    0 -> book.name
    1 -> "${book.name}, 1 capítulo"
    else -> "${book.name}, $count capítulos"
}

/**
 * The filter under the bar, always in view. TalkBack hears how many books
 * it leaves ("3 livros"), as it can't see the list change.
 */
@Composable
private fun FilterField(value: String, books: Int, onValueChange: (String) -> Unit) {
    val keyboard = LocalSoftwareKeyboardController.current
    TextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .semantics {
                if (value.isNotBlank()) stateDescription = if (books == 1) "1 livro" else "$books livros"
            },
        placeholder = { Text("Filtrar livros") },
        leadingIcon = { Icon(painterResource(R.drawable.ic_search), contentDescription = null) },
        trailingIcon = if (value.isNotEmpty()) {
            { BarButton(R.drawable.ic_close, "Limpar") { onValueChange("") } }
        } else {
            null
        },
        singleLine = true,
        shape = CircleShape,
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onDone = { keyboard?.hide() }),
    )
}

/**
 * A book: its abbreviation in a badge ("Gn"), its name, and how many
 * chapters it has. The book being read is highlighted.
 */
@Composable
private fun BookRow(book: PassagePickerData.Book, current: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val count = book.chapterCount
    ListItem(
        leadingContent = {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = if (current) colors.primary else colors.secondaryContainer,
                contentColor = if (current) colors.onPrimary else colors.onSecondaryContainer,
                modifier = Modifier.size(40.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (book.abbreviation.isEmpty() || book.chapters.isEmpty()) {
                        Icon(painterResource(R.drawable.ic_article), contentDescription = null, Modifier.size(20.dp))
                    } else {
                        Text(
                            book.abbreviation,
                            style = MaterialTheme.typography.labelLarge,
                            maxLines = 1,
                            autoSize = TextAutoSize.StepBased(minFontSize = 9.sp, maxFontSize = 14.sp),
                        )
                    }
                }
            }
        },
        trailingContent = if (count > 0) {
            { Text("$count cap.", style = MaterialTheme.typography.labelMedium) }
        } else {
            null
        },
        colors = ListItemDefaults.colors(
            containerColor = if (current) colors.secondaryContainer.copy(alpha = 0.5f) else Color.Transparent,
        ),
        modifier = Modifier
            .clickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = spokenLabel(book)
                // Only the current one: TalkBack says "Not selected" for false.
                if (current) selected = true
            },
    ) { Text(book.label, maxLines = 2, overflow = TextOverflow.Ellipsis) }
}
