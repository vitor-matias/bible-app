package org.capuchinhos.biblia.chrome

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.SearchBarValue
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSearchBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.capuchinhos.biblia.R

// MARK: - Search

/**
 * Material's full-screen search view, over the web page's results: Back, the
 * field and ✕ on the view's container, a divider, then the results. Before
 * anything is typed, the recent searches cover the page's hints.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SearchView(chrome: ChromeController, state: ChromeState) {
    val field = rememberTextFieldState(state.query)
    // The full-screen view: open from the start, and never collapsed.
    val searchBar = rememberSearchBarState(initialValue = SearchBarValue.Expanded)
    var focused by remember { mutableStateOf(false) }
    // What the page last heard. Typing is sent on; the page's own query,
    // echoed into the field, is not sent back to it.
    var sent by remember { mutableStateOf(state.query) }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    // Not while typing: a search that ran on a pause echoes its query.
    LaunchedEffect(state.query) {
        if (!focused) {
            sent = state.query
            field.setTextAndPlaceCursorAtEnd(state.query)
        }
    }
    LaunchedEffect(field) {
        snapshotFlow { field.text.toString() }.collect { text ->
            if (text != sent) {
                sent = text
                chrome.searchInput(text)
            }
        }
    }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val search: (String) -> Unit = { query ->
        sent = query
        field.setTextAndPlaceCursorAtEnd(query)
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
                        textFieldState = field,
                        searchBarState = searchBar,
                        onSearch = { if (it.isNotBlank()) search(it) },
                        modifier = Modifier
                            .weight(1f)
                            .focusRequester(focus)
                            .onFocusChanged { focused = it.isFocused },
                        enabled = !state.inert,
                        placeholder = { Text("Procurar na Bíblia") },
                        trailingIcon = if (field.text.isNotEmpty()) {
                            {
                                BarButton(R.drawable.ic_close, "Limpar", !state.inert) {
                                    field.clearText()
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
        if (field.text.isEmpty() && chrome.recentSearches.isNotEmpty() && !state.inert) {
            RecentSearches(chrome, onSearch = search) { query ->
                field.setTextAndPlaceCursorAtEnd(query)
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
                    leadingContent = { Icon(painterResource(R.drawable.ic_history), contentDescription = null) },
                    trailingContent = {
                        BarButton(R.drawable.ic_north_west, "Editar «$query»") { onEdit(query) }
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable(onClickLabel = "Pesquisar") { onSearch(query) },
                ) { Text(query, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
        }
    }
}
