package org.capuchinhos.biblia.chrome

import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import kotlinx.coroutines.launch
import org.capuchinhos.biblia.R

/** Full screen, as Material's full-screen dialogs: forms and the onboarding. */
/** How wide a form or a page of the onboarding grows on a tablet. */
internal val WIDE_CONTENT = 600.dp

/** Full screen, as Material's full-screen dialogs: forms and the onboarding. */
internal val FullScreen = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)

/**
 * A full-screen dialog is a window of its own, under the system bars: their
 * icons follow its theme, as the main window's do.
 */
@Composable
internal fun DialogSystemBarIcons() {
    val window = (LocalView.current.parent as? DialogWindowProvider)?.window
    val light = MaterialTheme.colorScheme.surface.luminance() > 0.5f
    SideEffect {
        if (window != null) {
            WindowCompat.getInsetsController(window, window.decorView).apply {
                isAppearanceLightStatusBars = light
                isAppearanceLightNavigationBars = light
            }
        }
    }
}

// MARK: - Report

/**
 * "Reportar erro" as a full-screen dialog: the kind of problem and the
 * details, ✕ and Enviar in the bar. The web app sends the report and answers
 * through [ChromeController.finishReport]: the dialog closes, or says what
 * failed and stays, keeping what was typed. Closing with something typed asks
 * first.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportDialog(chrome: ChromeController, sheet: Sheet.Report) {
    val state = sheet.state
    var topic by remember { mutableStateOf<String?>(null) }
    var details by remember { mutableStateOf("") }
    var confirmingDiscard by remember { mutableStateOf(false) }
    val hasChanges = topic != null || details.isNotBlank()
    val canSend = !sheet.sending && topic != null && details.isNotBlank()
    val close = {
        when {
            sheet.sending -> {}
            hasChanges -> confirmingDiscard = true
            else -> chrome.dismissed(sheet)
        }
    }

    Dialog(onDismissRequest = close, properties = FullScreen) {
        DialogSystemBarIcons()
        Scaffold(
            modifier = Modifier.semantics { paneTitle = "Reportar erro" },
            topBar = {
                TopAppBar(
                    navigationIcon = { BarButton(R.drawable.ic_close, "Fechar", !sheet.sending, onClick = close) },
                    title = { Text("Reportar erro", Modifier.semantics { heading() }) },
                    actions = {
                        // A shape, not bare text, so it reads as the form's button.
                        Button(
                            onClick = { topic?.let { chrome.submitReport(it, details.trim()) } },
                            enabled = canSend,
                            modifier = Modifier.padding(end = 8.dp),
                        ) { Text("Enviar") }
                    },
                )
            },
        ) { padding ->
            // A form's width on a tablet, centred, not a line across the screen.
            Box(
                Modifier
                    .padding(padding)
                    // The Scaffold's insets taken: the keyboard's is added, not
                    // the navigation bar's again.
                    .consumeWindowInsets(padding)
                    .imePadding()
                    .fillMaxSize(),
                contentAlignment = Alignment.TopCenter,
            ) {
            Column(
                Modifier
                    .widthIn(max = WIDE_CONTENT)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp),
            ) {
                if (sheet.sending) {
                    LinearProgressIndicator(
                        Modifier.fillMaxWidth().semantics {
                            contentDescription = "A enviar"
                            liveRegion = LiveRegionMode.Polite
                        },
                    )
                }
                Text(
                    state.message,
                    Modifier.padding(vertical = 16.dp),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Tipo de problema",
                    Modifier.semantics { heading() },
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
                Column(Modifier.selectableGroup().padding(vertical = 8.dp)) {
                    for (option in state.topics) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .selectable(
                                    selected = topic == option.value,
                                    enabled = !sheet.sending,
                                    role = Role.RadioButton,
                                    onClick = { topic = option.value },
                                ),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = topic == option.value, onClick = null, enabled = !sheet.sending)
                            Text(option.label, Modifier.padding(start = 16.dp), style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
                OutlinedTextField(
                    value = details,
                    // Counted in UTF-16 units, like the web form.
                    onValueChange = { if (it.length <= state.maxLength) details = it },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                    enabled = !sheet.sending,
                    label = { Text("Detalhes") },
                    placeholder = { Text(state.placeholder) },
                    minLines = 4,
                    supportingText = {
                        Text("${details.length} / ${state.maxLength}", Modifier.fillMaxWidth(), textAlign = TextAlign.End)
                    },
                )
            }
            }
        }
    }

    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = { confirmingDiscard = false },
            title = { Text("Descartar o relatório?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDiscard = false
                    chrome.dismissed(sheet)
                }) { Text("Descartar") }
            },
            dismissButton = { TextButton(onClick = { confirmingDiscard = false }) { Text("Continuar a editar") } },
        )
    }
    sheet.error?.let { message ->
        AlertDialog(
            onDismissRequest = { sheet.error = null },
            title = { Text("Não foi possível enviar") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { sheet.error = null }) { Text("OK") } },
        )
    }
}

// MARK: - Onboarding

/**
 * A page per step, swiped through or stepped with the button. Saltar, or
 * Back, skips it.
 */
@Composable
fun OnboardingDialog(chrome: ChromeController, sheet: Sheet.Onboarding) {
    val steps = sheet.steps
    val pager = rememberPagerState { steps.size }
    val scope = rememberCoroutineScope()
    var finished by remember { mutableStateOf(false) }
    val finish = { completed: Boolean ->
        if (!finished) {
            finished = true
            sheet.onFinish(completed, steps.getOrNull(pager.currentPage)?.id ?: "")
            chrome.dismissed(sheet)
        }
    }
    val last = pager.currentPage == steps.lastIndex

    Dialog(onDismissRequest = { finish(false) }, properties = FullScreen) {
        DialogSystemBarIcons()
        // Back turns back a page, as the system's own setup does; on the
        // first page it skips. An edge swipe on page 2 used to end it all.
        BackHandler(enabled = pager.currentPage > 0) {
            scope.launch { pager.animateScrollToPage(pager.currentPage - 1) }
        }
        Surface(Modifier.fillMaxSize()) {
            Box(contentAlignment = Alignment.TopCenter) {
            // A page's width on a tablet, centred.
            Column(Modifier.windowInsetsPadding(WindowInsets.systemBars).widthIn(max = WIDE_CONTENT)) {
                Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.End) {
                    if (!last) TextButton(onClick = { finish(false) }) { Text("Saltar") }
                    Spacer(Modifier.height(48.dp))
                }
                HorizontalPager(pager, Modifier.weight(1f)) { page -> OnboardingPage(steps[page]) }
                PageDots(count = steps.size, current = pager.currentPage, title = steps[pager.currentPage].title)
                Button(
                    onClick = {
                        if (last) finish(true) else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 16.dp)
                        .heightIn(min = 56.dp),
                ) { Text(if (last) "Começar a ler" else "Seguinte", style = MaterialTheme.typography.titleMedium) }
            }
            }
        }
    }
}

@Composable
private fun OnboardingPage(step: OnboardingStep) {
    val colors = MaterialTheme.colorScheme
    // A pane to TalkBack, which says its title as it comes into view.
    Column(
        Modifier
            .semantics { paneTitle = step.title }
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 32.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (step.logo) {
            Image(painterResource(R.drawable.onboarding_logo), contentDescription = null, Modifier.size(96.dp))
        } else {
            Surface(shape = CircleShape, color = colors.primaryContainer, contentColor = colors.onPrimaryContainer) {
                Icon(painterResource(onboardingIcon(step.icon)), contentDescription = null, Modifier.padding(20.dp).size(48.dp))
            }
        }
        Text(
            step.title,
            Modifier.padding(top = 24.dp).semantics { heading() },
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center,
        )
        // Centred: balanced lines, rather than a last word alone.
        Text(
            step.intro,
            Modifier.padding(top = 12.dp),
            style = MaterialTheme.typography.bodyLarge.copy(lineBreak = LineBreak.Heading),
            color = colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Column(Modifier.widthIn(max = 480.dp).padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            for (feature in step.features) {
                Row(verticalAlignment = Alignment.Top) {
                    Surface(shape = CircleShape, color = colors.secondaryContainer, contentColor = colors.onSecondaryContainer) {
                        Icon(painterResource(onboardingIcon(feature.icon)), contentDescription = null, Modifier.padding(8.dp).size(24.dp))
                    }
                    Text(
                        feature.text,
                        Modifier.padding(start = 16.dp, top = 8.dp),
                        style = MaterialTheme.typography.bodyLarge.copy(lineBreak = LineBreak.Paragraph),
                    )
                }
            }
        }
    }
}

@Composable
private fun PageDots(count: Int, current: Int, title: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            // Said as it changes: after Seguinte, TalkBack stays on the
            // button, and said nothing of the new page.
            .clearAndSetSemantics {
                contentDescription = "Página ${current + 1} de $count: $title"
                liveRegion = LiveRegionMode.Polite
            },
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        repeat(count) { index ->
            Box(
                Modifier
                    .size(if (index == current) 10.dp else 8.dp)
                    .padding(0.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = if (index == current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                    modifier = Modifier.fillMaxSize(),
                ) {}
            }
        }
    }
}

/** The web app's Material icon names (onboarding-content.ts), as drawables. */
@DrawableRes
private fun onboardingIcon(name: String): Int = when (name) {
    "menu_book" -> R.drawable.ic_menu_book
    "format_size" -> R.drawable.ic_format_size
    "cloud_off" -> R.drawable.ic_cloud_off
    "history" -> R.drawable.ic_history
    "touch_app" -> R.drawable.ic_touch_app
    "explore" -> R.drawable.ic_explore
    "swipe" -> R.drawable.ic_swipe
    "link" -> R.drawable.ic_link
    "notes" -> R.drawable.ic_notes
    "tune" -> R.drawable.ic_tune
    "dark_mode" -> R.drawable.ic_dark_mode
    "auto_stories" -> R.drawable.ic_auto_stories
    "text_increase" -> R.drawable.ic_text_increase
    "arrow_circle_down" -> R.drawable.ic_arrow_circle_down
    "search" -> R.drawable.ic_search
    "bookmarks" -> R.drawable.ic_bookmarks
    "share" -> R.drawable.ic_share
    else -> R.drawable.ic_help
}
