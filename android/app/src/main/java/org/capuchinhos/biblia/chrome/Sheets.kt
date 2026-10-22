package org.capuchinhos.biblia.chrome

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import java.text.Normalizer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.capuchinhos.biblia.R

@Composable
fun SheetHost(chrome: ChromeController, sheet: Sheet) {
    when (sheet) {
        is Sheet.Appearance -> AppearanceSheet(chrome, sheet)
        is Sheet.Picker -> PassagePickerDialog(chrome, sheet)
        is Sheet.Bookmarks -> BookmarksSheet(chrome, sheet)
        is Sheet.Footnotes -> FootnotesSheet(chrome, sheet)
        is Sheet.Report -> ReportDialog(chrome, sheet)
        is Sheet.Onboarding -> OnboardingDialog(chrome, sheet)
    }
}

/**
 * Closes a sheet once: what a tap chose is sent, the sheet slides away, then
 * the controller hears it's gone. A second tap while it slides does nothing,
 * so a passage or a link isn't opened twice.
 */
@OptIn(ExperimentalMaterial3Api::class)
private class SheetCloser(
    private val scope: CoroutineScope,
    private val state: SheetState,
    private val chrome: ChromeController,
    private val sheet: Sheet,
) {
    private var closing = false

    fun close(then: () -> Unit = {}) {
        if (closing) return
        closing = true
        chrome.closing(sheet)
        then()
        scope.launch { state.hide() }.invokeOnCompletion { chrome.dismissed(sheet) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun rememberSheetCloser(chrome: ChromeController, sheet: Sheet, state: SheetState): SheetCloser {
    val scope = rememberCoroutineScope()
    return remember(sheet) { SheetCloser(scope, state, chrome, sheet) }
}

/**
 * A modal sheet. Material pads its content for the system bars already
 * (safeDrawing, top and bottom). [scrim] dims the page behind it; the text
 * settings' sheet clears it, so the page shows its real size and theme.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChromeSheet(
    chrome: ChromeController,
    sheet: Sheet,
    state: SheetState,
    scrim: Color = BottomSheetDefaults.ScrimColor,
    content: @Composable () -> Unit,
) {
    // On its way out, however it was closed: a sheet asked for now waits for it.
    LaunchedEffect(state) {
        snapshotFlow { state.currentValue != SheetValue.Hidden && state.targetValue == SheetValue.Hidden }
            .collect { leaving -> if (leaving) chrome.closing(sheet) else chrome.reopened(sheet) }
    }
    ModalBottomSheet(
        onDismissRequest = { chrome.dismissed(sheet) },
        sheetState = state,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        scrimColor = scrim,
    ) {
        content()
    }
}

/** Two lines at most: "Segundo Livro das Crónicas" at large text sizes. */
@Composable
private fun SheetTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier.semantics { heading() },
        style = MaterialTheme.typography.titleLarge,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
}

// MARK: - Texto e aparência

/**
 * Text size, theme, and pages or scrolling, as Play Books' display options.
 * It stays open as people tap: the page changes behind it, and the sheet
 * itself takes the theme.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppearanceSheet(chrome: ChromeController, sheet: Sheet) {
    val state = chrome.state
    ChromeSheet(
        chrome,
        sheet,
        rememberModalBottomSheetState(skipPartiallyExpanded = true),
        scrim = Color.Transparent,
    ) {
        Column(
            Modifier.padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SheetTitle("Texto e aparência", Modifier.padding(bottom = 8.dp))
            Caption("Tamanho do texto")
            ConnectedButtons(
                listOf(
                    Choice("font-decrease", "Diminuir", R.drawable.ic_text_decrease),
                    Choice("font-increase", "Aumentar", R.drawable.ic_text_increase),
                ),
            ) { chrome.send(it) }
            Caption("Tema")
            ConnectedChoices(
                options = listOf(
                    Choice("system", "Automático", R.drawable.ic_brightness_auto),
                    Choice("light", "Claro", R.drawable.ic_light_mode),
                    Choice("dark", "Escuro", R.drawable.ic_dark_mode),
                ),
                selected = state.themeMode,
            ) { chrome.send("theme-$it") }
            state.viewMode?.let { viewMode ->
                Caption("Leitura")
                ConnectedChoices(
                    options = listOf(
                        Choice("paged", "Página a página", R.drawable.ic_auto_stories),
                        Choice("scrolling", "Texto contínuo", R.drawable.ic_article),
                    ),
                    selected = viewMode,
                ) { if (it != viewMode) chrome.send("view-mode") }
            }
        }
    }
}

@Composable
private fun Caption(text: String) {
    Text(
        text,
        Modifier.padding(top = 8.dp).semantics { heading() },
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

private data class Choice(val value: String, val label: String, @param:DrawableRes val icon: Int)

/**
 * Choices side by side in a connected group, the icon above the label: one
 * is checked, as radio buttons. Unchecked ones are drawn on the brightest
 * container, so they still read as buttons on the sheet.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun ConnectedChoices(options: List<Choice>, selected: String, onChoose: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween),
    ) {
        options.forEachIndexed { index, choice ->
            ToggleButton(
                checked = choice.value == selected,
                onCheckedChange = { onChoose(choice.value) },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 72.dp)
                    .semantics { role = Role.RadioButton },
                shapes = when (index) {
                    0 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
                    options.lastIndex -> ButtonGroupDefaults.connectedTrailingButtonShapes()
                    else -> ButtonGroupDefaults.connectedMiddleButtonShapes()
                },
                colors = ToggleButtonDefaults.toggleButtonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                ),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 12.dp),
            ) { ChoiceLabel(choice) }
        }
    }
}

/**
 * Actions side by side, shaped as the choices' group but plain buttons:
 * pressing one doesn't check it.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun ConnectedButtons(options: List<Choice>, onPress: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween),
    ) {
        options.forEachIndexed { index, choice ->
            FilledTonalButton(
                onClick = { onPress(choice.value) },
                modifier = Modifier.weight(1f).heightIn(min = 72.dp),
                shape = if (index == 0) {
                    ButtonGroupDefaults.connectedLeadingButtonShape
                } else {
                    ButtonGroupDefaults.connectedTrailingButtonShape
                },
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 12.dp),
            ) { ChoiceLabel(choice) }
        }
    }
}

@Composable
private fun ChoiceLabel(choice: Choice) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(painterResource(choice.icon), contentDescription = null)
        Spacer(Modifier.height(4.dp))
        Text(
            choice.label,
            style = MaterialTheme.typography.labelLarge,
            textAlign = TextAlign.Center,
            maxLines = 1,
            autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = 14.sp),
        )
    }
}

// MARK: - Bookmarks

/**
 * Eight ribbons in a grid, like the web panel. A free ribbon marks the
 * chapter being read; a used one opens its passage. Above them, a row moves
 * the ribbon the reader read on from to this chapter. Editar shows remove
 * badges; a long press offers Abrir, Mover and Remover.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BookmarksSheet(chrome: ChromeController, sheet: Sheet.Bookmarks) {
    val state = sheet.state
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val closer = rememberSheetCloser(chrome, sheet, sheetState)
    val anyUsed = state.ribbons.any { it.label != null }
    var editing by remember { mutableStateOf(false) }
    if (!anyUsed) editing = false
    val marked = state.ribbons.any { it.current }

    ChromeSheet(chrome, sheet, sheetState) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
            Row(Modifier.fillMaxWidth().padding(start = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                SheetTitle("Marcadores", Modifier.weight(1f))
                // A shape, not bare text: it reads as a button.
                if (anyUsed) {
                    FilledTonalButton(onClick = { editing = !editing }) {
                        Text(if (editing) "Concluído" else "Editar")
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            val move = state.move
            if (move != null && !editing) {
                MoveRow(move, state.currentLabel) {
                    chrome.sendWithColor(if (move.done) "bookmark-undo" else "bookmark-move", move.color)
                }
                Spacer(Modifier.height(12.dp))
            }
            state.ribbons.chunked(4).forEach { row ->
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { ribbon ->
                        Box(Modifier.weight(1f)) {
                            RibbonTile(ribbon, state.currentLabel, marked, editing, onOpen = {
                                closer.close { chrome.sendWithColor("bookmark-open", ribbon.color) }
                            }) { action -> chrome.sendWithColor(action, ribbon.color) }
                        }
                    }
                }
            }
            Text(
                when {
                    editing -> "Toque numa fita para a retirar."
                    marked -> "${state.currentLabel} está marcado. Toque noutra fita livre para mudar a cor."
                    else -> "Toque numa fita livre para marcar ${state.currentLabel}."
                },
                // Said as it changes: a ribbon set, moved or taken off, as
                // iOS announces them.
                Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, start = 8.dp, end = 8.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodySmall.copy(lineBreak = LineBreak.Heading),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** "Mover para Mateus 7", under it "O marcador vermelho está em Mateus 5"; once moved, "Desfazer". */
@Composable
private fun MoveRow(move: BookmarksSheetState.Move, currentLabel: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHighest,
        modifier = Modifier.fillMaxWidth().semantics {
            contentDescription = if (move.done) {
                "Desfazer. O marcador ${move.name} volta a ${move.from}"
            } else {
                "Mover o marcador ${move.name} para $currentLabel. Está em ${move.from}"
            }
        },
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                painterResource(if (move.done) R.drawable.ic_undo else R.drawable.ic_bookmark_filled),
                contentDescription = null,
                tint = if (move.done) MaterialTheme.colorScheme.onSurface else ribbonColor(move.color) ?: Color.Unspecified,
                modifier = Modifier.size(28.dp),
            )
            Column(Modifier.padding(start = 16.dp)) {
                Text(
                    if (move.done) "Desfazer" else "Mover para $currentLabel",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    if (move.done) "O marcador ${move.name} volta a ${move.from}." else "O marcador ${move.name} está em ${move.from}.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RibbonTile(
    ribbon: BookmarksSheetState.Ribbon,
    currentLabel: String,
    marked: Boolean,
    editing: Boolean,
    onOpen: () -> Unit,
    onAction: (String) -> Unit,
) {
    val used = ribbon.label != null
    var menu by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    val spoken = buildString {
        append(ribbon.name)
        append(if (used) ", ${ribbon.label}" else ", livre")
        if (ribbon.current) append(", este capítulo")
    }
    Box {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = if (ribbon.current) colors.primaryContainer else colors.surfaceContainerHighest,
            contentColor = if (ribbon.current) colors.onPrimaryContainer else colors.onSurface,
            modifier = Modifier
                .fillMaxWidth()
                .height(84.dp)
                .alpha(if (editing && !used) 0.38f else 1f)
                .combinedClickable(
                    enabled = !editing || used,
                    role = Role.Button,
                    onClick = {
                        when {
                            editing -> onAction("bookmark-remove")
                            used -> onOpen()
                            else -> onAction("bookmark-set")
                        }
                    },
                    onLongClick = if (used && !editing) ({ menu = true }) else null,
                    onClickLabel = when {
                        editing -> "Retirar o marcador"
                        used -> "Abrir a passagem"
                        else -> "Marcar $currentLabel"
                    },
                )
                .semantics { contentDescription = spoken },
        ) {
            Column(
                Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    painterResource(if (used) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
                    contentDescription = null,
                    tint = ribbonColor(ribbon.color) ?: colors.onSurface,
                    modifier = Modifier.size(32.dp),
                )
                ribbon.label?.let {
                    Text(
                        it,
                        Modifier.padding(top = 6.dp),
                        style = MaterialTheme.typography.labelLarge,
                        maxLines = 1,
                        autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = 14.sp),
                    )
                }
            }
        }
        if (editing && used) {
            Surface(
                shape = CircleShape,
                color = colors.error,
                contentColor = colors.onError,
                modifier = Modifier.offset((-6).dp, (-6).dp).size(24.dp),
            ) {
                Icon(painterResource(R.drawable.ic_remove), contentDescription = null, modifier = Modifier.padding(2.dp))
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            RibbonMenuItem("Abrir", R.drawable.ic_menu_book) {
                menu = false
                onOpen()
            }
            // Not onto a chapter that has a ribbon: that one would come off.
            if (!marked) {
                RibbonMenuItem("Mover para $currentLabel", R.drawable.ic_bookmark) {
                    menu = false
                    onAction("bookmark-move")
                }
            }
            RibbonMenuItem("Remover marcador", R.drawable.ic_bookmark_remove, destructive = true) {
                menu = false
                onAction("bookmark-remove")
            }
        }
    }
}

@Composable
private fun RibbonMenuItem(label: String, @DrawableRes icon: Int, destructive: Boolean = false, onClick: () -> Unit) {
    val color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    DropdownMenuItem(
        text = { Text(label, color = color) },
        leadingIcon = { Icon(painterResource(icon), contentDescription = null, tint = color) },
        onClick = onClick,
    )
}

// MARK: - Footnotes

/**
 * The notes as reading text: serif, justified and hyphenated like the
 * reader, at the reader's footnote size. References are links; tapping one
 * opens it and closes the sheet. The text can be selected and copied.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FootnotesSheet(chrome: ChromeController, sheet: Sheet.Footnotes) {
    val state = sheet.state
    val sheetState = rememberModalBottomSheetState()
    val closer = rememberSheetCloser(chrome, sheet, sheetState)
    val size = 17f * 1.06f * state.fontScale
    val style = TextStyle(
        fontFamily = FontFamily.Serif,
        fontSize = size.sp,
        lineHeight = 1.4.em,
        color = MaterialTheme.colorScheme.onSurface,
        // As the reader: past 180% a line holds a handful of words, and
        // justified it spreads them.
        textAlign = if (state.fontScale > 1.8f) TextAlign.Start else TextAlign.Justify,
        // Portuguese hyphenation, whatever the phone's language.
        hyphens = Hyphens.Auto,
        localeList = LocaleList("pt-PT"),
        lineBreak = LineBreak.Paragraph,
    )
    ChromeSheet(chrome, sheet, sheetState) {
        Column(Modifier.padding(horizontal = 24.dp)) {
            SheetTitle(state.title, Modifier.padding(bottom = 12.dp))
            SelectionContainer(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 32.dp)) {
                // A paragraph per note, set apart as in the edition.
                Column(verticalArrangement = Arrangement.spacedBy((size * 0.9f).dp)) {
                    for (note in state.notes) {
                        Text(noteText(note, size) { link -> closer.close { chrome.footnoteLink(link) } }, style = style)
                    }
                }
            }
        }
    }
}

/**
 * A note: its marker in bold, a little larger, then its text, references as
 * links. One en space after the marker, which justification doesn't stretch
 * as it would two spaces.
 */
private fun noteText(note: FootnotesSheetState.Note, size: Float, onLink: (Int) -> Unit) = buildAnnotatedString {
    // The marker carries its own full stop ("3.").
    withStyle(SpanStyle(fontWeight = FontWeight.Bold, fontSize = (size * 1.04f).sp)) { append(note.reference) }
    append("\u2002")
    for (part in note.parts) {
        val link = part.link
        if (link == null) {
            append(part.text)
        } else {
            withLink(
                LinkAnnotation.Clickable(
                    tag = "nota-$link",
                    styles = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline)),
                ) { onLink(link) },
            ) { append(part.text) }
        }
    }
}
