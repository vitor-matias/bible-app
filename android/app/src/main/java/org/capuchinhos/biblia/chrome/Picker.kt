package org.capuchinhos.biblia.chrome

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog

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
                        if (picked.chapters.isEmpty()) {
                            choose(picked.id, null)
                        } else {
                            // The books were in view: folded to one pane, Back returns to them.
                            cameFromBooks = true
                            book = picked
                        }
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
