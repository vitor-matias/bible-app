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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import org.capuchinhos.biblia.R

/**
 * The book and chapter picker as Material's full-screen dialog: the books in
 * a list under their testaments and groups, then the chosen book's chapters
 * as a grid of numbers. It opens on the current book's chapters, with ← to
 * the books; a book without chapters (an introduction) opens at once.
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
    var placed by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    var chapterList by remember { mutableStateOf(context.chapterListPreferred()) }
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
                        listState = listState,
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
                    listState = listState,
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
    listState: LazyListState,
    placed: Boolean,
    onPlaced: () -> Unit,
    onClose: () -> Unit,
    /** The book highlighted: the one being read, or beside, the one shown. */
    selectedId: String? = data.currentBookId,
    onChoose: (PassagePickerData.Book) -> Unit,
) {
    val rows = remember(data, filter) { pickerRows(data, filter) }
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()
    // Opens at the current book, once. Not at "Sobre a Bíblia", listed last:
    // from there the reader is choosing where to start.
    LaunchedEffect(Unit) {
        if (placed) return@LaunchedEffect
        onPlaced()
        if (data.currentBookId == "about") return@LaunchedEffect
        val index = rows.indexOfFirst { it is PickerRow.Book && it.book.id == data.currentBookId }
        if (index > 0) listState.scrollToItem(maxOf(index - 3, 0))
    }
    // Back clears a filter before it closes the picker.
    BackHandler(enabled = filter.isNotEmpty()) { onFilter("") }

    Scaffold(
        modifier = Modifier
            .nestedScroll(scrollBehavior.nestedScrollConnection)
            .semantics { paneTitle = "Livros" },
        topBar = {
            Column {
                TopAppBar(
                    navigationIcon = { BarButton(R.drawable.ic_close, "Fechar", onClick = onClose) },
                    title = { Text("Livros") },
                    scrollBehavior = scrollBehavior,
                )
                // In view, not behind an icon: 73 books are a long way to scroll.
                FilterField(filter, rows.count { it is PickerRow.Book }, onFilter)
            }
        },
    ) { padding ->
        val direction = LocalLayoutDirection.current
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(
                start = padding.calculateStartPadding(direction),
                end = padding.calculateEndPadding(direction),
                top = padding.calculateTopPadding(),
                bottom = padding.calculateBottomPadding() + 16.dp,
            ),
        ) {
            for (row in rows) {
                when (row) {
                    is PickerRow.Testament -> stickyHeader(key = row.key, contentType = "testament") {
                        Surface(color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                            Text(
                                row.title,
                                Modifier.padding(horizontal = 16.dp, vertical = 12.dp).semantics { heading() },
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                    is PickerRow.Group -> item(key = row.key, contentType = "group") {
                        Text(
                            row.title,
                            Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp).semantics { heading() },
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    is PickerRow.Book -> item(key = row.key, contentType = "book") {
                        BookRow(row.book, current = row.book.id == selectedId) { onChoose(row.book) }
                    }
                }
            }
            if (rows.isEmpty()) {
                item(contentType = "empty") {
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
            }
        }
    }
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
        headlineContent = { Text(book.label, maxLines = 2, overflow = TextOverflow.Ellipsis) },
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
                contentDescription = when (count) {
                    0 -> book.name
                    1 -> "${book.name}, 1 capítulo"
                    else -> "${book.name}, $count capítulos"
                }
                selected = current
            },
    )
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
                title = { Text(book.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
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
                ChapterCell(
                    text = if (intro) "Introdução" else chapter.label,
                    detail = chapter.detail?.let { "($it)" },
                    current = chapter.number == current,
                    ribbon = ribbonColor(chapter.bookmark),
                    spoken = spokenLabel(chapter),
                    textStyle = if (intro) MaterialTheme.typography.labelLarge else MaterialTheme.typography.titleMedium,
                    // A long press shows the chapter's section title, which the cell has no room for.
                    longPressTitle = chapter.title?.takeIf { !intro && it.isNotEmpty() }?.let { "${chapter.label} · $it" },
                ) { onChoose(chapter.number) }
            }
        }
    }
}

/** The chapters as a list, each with its title: "5 · Sermão da Montanha". */
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
                headlineContent = {
                    Text(
                        when {
                            intro -> "Introdução"
                            chapter.title.isNullOrEmpty() -> "Capítulo ${chapter.label}"
                            else -> chapter.title
                        },
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                supportingContent = chapter.detail?.let { { Text("Na liturgia, ${it}") } },
                leadingContent = {
                    Surface(
                        shape = MaterialTheme.shapes.medium,
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
                        this.selected = selected
                    },
            )
        }
    }
}

private const val PREFERENCES = "native-chrome"
private const val CHAPTER_LIST = "picker.chapterList"

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
 * A chapter number. The current one is filled with the primary colour; a
 * bookmarked chapter shows its ribbon's colour as a dot.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChapterCell(
    text: String,
    current: Boolean,
    spoken: String,
    textStyle: TextStyle,
    detail: String? = null,
    ribbon: Color? = null,
    longPressTitle: String? = null,
    onClick: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    Box {
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = if (current) colors.primary else colors.surfaceContainerHigh,
            contentColor = if (current) colors.onPrimary else colors.onSurface,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = if (longPressTitle != null) ({ menu = true }) else null,
                    role = Role.Button,
                )
                .semantics {
                    contentDescription = spoken
                    selected = current
                },
        ) {
            Box(contentAlignment = Alignment.Center) {
                Column(
                    Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(text, style = textStyle, maxLines = 1, textAlign = TextAlign.Center)
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
