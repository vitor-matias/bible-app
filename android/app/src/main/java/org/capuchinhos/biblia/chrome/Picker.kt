package org.capuchinhos.biblia.chrome

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.text.modifiers.TextAutoSizeLayoutScope
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
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.offset
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import org.capuchinhos.biblia.R

/**
 * The book and chapter picker as Material's full-screen dialog: the books in
 * a list or as tiles ([BookView]) under their testaments and groups, then the
 * chosen book's chapters as a grid of numbers. It opens on the current book's
 * chapters, with ← to the books; a book without chapters (an introduction)
 * opens at once.
 */
@Composable
fun PassagePickerDialog(chrome: ChromeController, sheet: Sheet.Picker) {
    val data = sheet.data
    var book by remember { mutableStateOf(data.currentBook?.takeIf { it.chapters.isNotEmpty() }) }
    // Back goes to the books only once they have been seen: opened on the
    // current book's chapters, one Back closes the picker.
    var cameFromBooks by remember { mutableStateOf(false) }
    var chosen by remember { mutableStateOf(false) }
    // Kept here, not in the book list, which leaves while a book's chapters
    // show: back from Coríntios, the filter "co" and the place in the list stay.
    var filter by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()
    val gridState = rememberLazyGridState()
    var placed by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    var chapterList by remember { mutableStateOf(context.chapterListPreferred()) }
    var bookView by remember { mutableStateOf(context.bookViewPreferred()) }
    val chooseBookView = { view: BookView ->
        bookView = view
        context.saveBookView(view)
    }
    val close = { chrome.dismissed(sheet) }
    val choose = { bookId: String, chapter: Int? ->
        // Once: a second tap as the dialog goes would ask for it again.
        if (!chosen) {
            chosen = true
            chrome.goTo(bookId, chapter)
            chrome.dismissed(sheet)
        }
    }
    Dialog(onDismissRequest = close, properties = FullScreen) {
        DialogSystemBarIcons()
        BoxWithConstraints(Modifier.fillMaxSize()) {
        // On a tablet, an unfolded phone or a phone on its side: the books
        // beside the chapters, as Material's list-detail layout, and no Back
        // step between them.
        if (maxWidth >= TWO_PANE_WIDTH) {
            val shown = book ?: data.currentBook?.takeIf { it.chapters.isNotEmpty() }
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.width(BOOK_PANE_WIDTH).fillMaxHeight()) {
                    BookList(
                        data,
                        filter = filter,
                        onFilter = { filter = it },
                        view = bookView,
                        onView = chooseBookView,
                        listState = listState,
                        gridState = gridState,
                        placed = placed,
                        onPlaced = { placed = true },
                        onClose = close,
                        selectedId = shown?.id,
                    ) { picked ->
                        if (picked.chapters.isEmpty()) choose(picked.id, null) else book = picked
                    }
                }
                VerticalDivider()
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    if (shown != null) {
                        // A grid of its own per book: in place, it kept the
                        // last book's scroll (chapters share numbers, its
                        // keys) and never scrolled to the new current one.
                        key(shown.id) {
                            ChapterGrid(
                                shown,
                                current = data.currentChapter.takeIf { shown.id == data.currentBookId },
                                asList = chapterList,
                                onToggleList = {
                                    chapterList = !chapterList
                                    context.saveChapterListPreferred(chapterList)
                                },
                                onBack = null,
                                onClose = null,
                            ) { choose(shown.id, it) }
                        }
                    } else {
                        Surface(Modifier.fillMaxSize()) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    "Escolha um livro",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        } else {
        AnimatedContent(
            book,
            transitionSpec = {
                // Material's shared x-axis: on to a book's chapters, back to the books.
                val forward = targetState != null
                (slideInHorizontally { if (forward) it / 5 else -it / 5 } + fadeIn()) togetherWith
                    (slideOutHorizontally { if (forward) -it / 5 else it / 5 } + fadeOut())
            },
            label = "picker",
        ) { shown ->
            if (shown == null) {
                BookList(
                    data,
                    filter = filter,
                    onFilter = { filter = it },
                    view = bookView,
                    onView = chooseBookView,
                    listState = listState,
                    gridState = gridState,
                    placed = placed,
                    onPlaced = { placed = true },
                    onClose = close,
                ) { picked ->
                    if (picked.chapters.isEmpty()) {
                        choose(picked.id, null)
                    } else {
                        cameFromBooks = true
                        book = picked
                    }
                }
            } else {
                // Back leads to the books, before it closes the picker.
                BackHandler(enabled = cameFromBooks) { book = null }
                ChapterGrid(
                    shown,
                    current = data.currentChapter.takeIf { shown.id == data.currentBookId },
                    asList = chapterList,
                    onToggleList = {
                        chapterList = !chapterList
                        context.saveChapterListPreferred(chapterList)
                    },
                    onBack = {
                        cameFromBooks = true
                        book = null
                    },
                    onClose = close,
                ) { choose(shown.id, it) }
            }
        }
        }
        // The lists scroll on under the three-button navigation bar.
        NavigationBarProtection(MaterialTheme.colorScheme.background)
        }
    }
}

/** From Material's medium width on, the books and chapters side by side. */
private val TWO_PANE_WIDTH = 600.dp
private val BOOK_PANE_WIDTH = 360.dp

/** A line of the book list: a testament's heading, a group's, or a book. */
sealed interface PickerRow {
    val key: String

    data class Testament(val title: String) : PickerRow {
        override val key = "testament:$title"
    }

    data class Group(val title: String) : PickerRow {
        override val key = "group:$title"
    }

    data class Book(val book: PassagePickerData.Book) : PickerRow {
        override val key = "book:${book.id}"
    }
}

/**
 * The book list's lines, the books that match [filter] (folded, see [fold])
 * under their headings; a heading with none left goes too. A group's own
 * introduction is found by the group's name ("Pentateuco").
 */
fun pickerRows(data: PassagePickerData, filter: String): List<PickerRow> {
    val query = fold(filter.trim())
    return data.sections.flatMap { section ->
        val groups = section.groups.mapNotNull { group ->
            val books = group.books.filter { book ->
                query.isEmpty() ||
                    listOfNotNull(book.label, book.name, book.abbreviation, group.title, section.title)
                        .any { fold(it).contains(query) }
            }
            if (books.isEmpty()) {
                null
            } else {
                listOfNotNull(group.title?.let { PickerRow.Group(it) }) + books.map { PickerRow.Book(it) }
            }
        }
        if (groups.isEmpty()) emptyList() else listOf(PickerRow.Testament(section.title)) + groups.flatten()
    }
}

/** The number of chapters, the introduction aside. */
private val PassagePickerData.Book.chapterCount: Int
    get() = chapters.count { it.label.isNotEmpty() }

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun BookList(
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

/**
 * How the picker shows the books: a list with each book's abbreviation and
 * chapters, or tiles as in the iOS app, big with the names or small with the
 * abbreviations.
 */
enum class BookView(val preference: String) {
    List("list"),
    Names("names"),
    Abbreviations("abbreviations");

    companion object {
        /** The list until the reader picks another. */
        fun fromPreference(value: String?): BookView = entries.firstOrNull { it.preference == value } ?: List
    }
}

/**
 * The narrowest a book's tile gets: three names to a phone's row, or six
 * abbreviations. Wider with larger text, as the iOS app's, up to twice.
 */
fun bookTileMinWidth(compact: Boolean, textScale: Float): Dp =
    (if (compact) 56.dp else 104.dp) * textScale.coerceIn(1f, 2f)

/** "1 Tessalonicenses" keeps its number on the name's line. */
fun tileLabel(label: String): String = label.replace(LEADING_NUMBER, "$1 ")

private val LEADING_NUMBER = Regex("^(\\d+) ")

/** Whether lines ending at [lineEnds] (each line's end offset) only break [text] between words. */
fun breaksBetweenWords(text: String, lineEnds: List<Int>): Boolean =
    lineEnds.all { end -> end in 1..text.length && text[end - 1].let { it == ' ' || it == '-' } }

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

/** A grid of chapter numbers, the introduction first across the full width. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChapterGrid(
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
                navigationIcon = { onBack?.let { BarButton(R.drawable.ic_arrow_back, "Livros", onClick = it) } },
                title = { Text(book.name, Modifier.semantics { heading() }, maxLines = 1, overflow = TextOverflow.Ellipsis) },
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

private const val PREFERENCES = "native-chrome"
private const val CHAPTER_LIST = "picker.chapterList"
private const val BOOK_VIEW = "picker.bookView"

private fun Context.bookViewPreferred(): BookView =
    BookView.fromPreference(getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(BOOK_VIEW, null))

private fun Context.saveBookView(view: BookView) {
    getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString(BOOK_VIEW, view.preference).apply()
}

/** Whether the reader last chose the chapters as a list. */
private fun Context.chapterListPreferred(): Boolean =
    getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(CHAPTER_LIST, false)

private fun Context.saveChapterListPreferred(list: Boolean) {
    getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putBoolean(CHAPTER_LIST, list).apply()
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
private fun Tile(
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
