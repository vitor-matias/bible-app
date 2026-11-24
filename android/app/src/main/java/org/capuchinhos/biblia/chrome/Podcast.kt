package org.capuchinhos.biblia.chrome

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.delay
import org.capuchinhos.biblia.R

/** ▶ and ⏸ say what they start and pause, as auto-scroll's do. */
internal fun podcastToggleLabel(playing: Boolean): String = if (playing) "Pausar o +365" else "Ouvir o +365"

/** "1×", "1,25×", "0,75×": as the speed is said in Portuguese, whatever the device's language. */
internal fun podcastSpeedTitle(rate: Double): String =
    NumberFormat.getNumberInstance(Locale.forLanguageTag("pt-PT")).apply { maximumFractionDigits = 2 }.format(rate) + "×"

/**
 * The +365 player, a card in the chapter arrows' place while the reader
 * listens: the room it frees is the point. The passage (still opening the
 * picker) with what plays beside it, the scrubber, then
 * [⇅ or ✕] ⏮ ↺15 ▶ ↻15 ⏭ [1×], where ⏮ ⏭ step through the episode's
 * readings, not the book's chapters. The web sends where the episode is at
 * most once a second, in whole seconds: between, the scrubber runs on by the
 * rate, so it glides rather than ticks.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
internal fun PodcastCard(
    chrome: ChromeController,
    podcast: PodcastState,
    passage: String,
    passageAccessibility: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val length = podcast.length
    val seekable = enabled && podcast.loaded && length > 0
    // Where the scrubber was last told it is, and when; re-anchored by each
    // state, and by a seek, so a release doesn't snap back to the old place
    // before the web's next state.
    var base by remember { mutableDoubleStateOf(podcast.elapsed) }
    var since by remember { mutableLongStateOf(System.nanoTime()) }
    var now by remember { mutableLongStateOf(since) }
    var dragging by remember { mutableStateOf<Float?>(null) }
    LaunchedEffect(podcast.elapsed, podcast.playing, podcast.rate) {
        if (dragging == null) {
            base = podcast.elapsed
            since = System.nanoTime()
            now = since
        }
    }
    LaunchedEffect(podcast.playing) {
        while (podcast.playing) {
            delay(250)
            now = System.nanoTime()
        }
    }
    val position = dragging?.toDouble()
        ?: podcastPosition(base, (now - since).coerceAtLeast(0) / 1e9, podcast.rate, length, podcast.playing)

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 3.dp,
        shadowElevation = 3.dp,
    ) {
        Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Header(chrome, passage, passageAccessibility, podcast.context, enabled)
            Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                val style = MaterialTheme.typography.labelSmall
                val color = MaterialTheme.colorScheme.onSurfaceVariant
                // The slider says both to TalkBack: "1:03 de 3:44".
                Text(podcastClock(position), style = style, color = color, modifier = Modifier.clearAndSetSemantics {})
                Slider(
                    value = if (length > 0) position.toFloat() else 0f,
                    onValueChange = { dragging = it },
                    onValueChangeFinished = {
                        dragging?.let { seconds ->
                            base = seconds.toDouble()
                            since = System.nanoTime()
                            now = since
                            chrome.podcastSeek(seconds.toDouble())
                        }
                        dragging = null
                    },
                    valueRange = 0f..(if (length > 0) length.toFloat() else 1f),
                    enabled = seekable,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 12.dp)
                        .semantics {
                            contentDescription = "Posição no +365"
                            stateDescription = "${podcastClock(position)} de ${podcastClock(length)}"
                        },
                )
                Text(
                    "−" + podcastClock(if (length > 0) length - position else 0.0),
                    style = style,
                    color = color,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
            // 40 dp buttons, so six and play fit a 360 dp phone (296 dp);
            // Compose still takes a touch up to 48 dp around each.
            CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
                Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    // Equal ends, so play stays in the card's middle whatever they hold.
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                        if (podcast.canScroll) {
                            BarButton(R.drawable.ic_swap_vert, "Deslocar o texto em vez de ouvir", enabled) {
                                chrome.send("podcast-scroll")
                            }
                        } else if (podcast.canClose) {
                            BarButton(R.drawable.ic_close, "Terminar", enabled) { chrome.send("podcast-close") }
                        }
                    }
                    Transport(chrome, podcast, enabled)
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                        Speed(chrome, podcast, enabled)
                    }
                }
            }
        }
    }
}

/**
 * The passage, centred on the card, opening the picker as the bar's title
 * does; what plays hangs off its right ("· +365 · Dia 6"), and gives way
 * first where the room runs out.
 */
@Composable
private fun Header(chrome: ChromeController, passage: String, spoken: String, context: String?, enabled: Boolean) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.weight(1f))
        Box(
            Modifier
                .clip(MaterialTheme.shapes.small)
                .clickable(enabled = enabled, role = Role.Button) { chrome.send("passage") }
                .clearAndSetSemantics {
                    contentDescription = spoken
                    role = Role.Button
                    onClick(label = "Escolher livro e capítulo") { chrome.send("passage"); true }
                }
                // Android's touch target, however short the text.
                .heightIn(min = 48.dp)
                .padding(horizontal = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(passage, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.weight(1f)) {
            context?.let {
                Text(
                    "· $it",
                    Modifier.semantics { contentDescription = it },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * ⏮ ↺15 ▶/⏸ ↻15 ⏭: ⏮ and ⏭ always both show, so play stays in the middle;
 * one with nowhere to go is disabled, not gone.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun Transport(chrome: ChromeController, podcast: PodcastState, enabled: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        BarButton(R.drawable.ic_skip_previous_filled, podcast.previousLabel ?: "Anterior", enabled && podcast.previousLabel != null) {
            chrome.send("podcast-previous")
        }
        BarButton(R.drawable.ic_replay_15, "Recuar 15 segundos", enabled && podcast.loaded) { chrome.podcastSkip(-15) }
        val canPress = enabled && (podcast.playing || podcast.canPlay)
        FilledIconButton(
            onClick = { chrome.send("podcast-toggle") },
            enabled = canPress,
            shapes = IconButtonDefaults.shapes(),
            modifier = Modifier.size(56.dp),
        ) {
            Icon(
                painterResource(if (podcast.playing) R.drawable.ic_pause_filled else R.drawable.ic_play_arrow_filled),
                contentDescription = podcastToggleLabel(podcast.playing),
            )
        }
        BarButton(R.drawable.ic_forward_15, "Avançar 15 segundos", enabled && podcast.loaded) { chrome.podcastSkip(15) }
        BarButton(R.drawable.ic_skip_next_filled, podcast.nextLabel ?: "Seguinte", enabled && podcast.nextLabel != null) {
            chrome.send("podcast-next")
        }
    }
}

/** "1,25×": a tap goes on to the next speed, round to the slowest. */
@Composable
private fun Speed(chrome: ChromeController, podcast: PodcastState, enabled: Boolean) {
    TextButton(
        onClick = { chrome.send("podcast-speed") },
        enabled = enabled,
        contentPadding = PaddingValues(horizontal = 4.dp),
        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
        modifier = Modifier
            .height(40.dp)
            .semantics {
                contentDescription = "Velocidade do +365"
                stateDescription = podcast.rateAccessibilityLabel
            },
    ) {
        Text(podcastSpeedTitle(podcast.rate), maxLines = 1, softWrap = false, modifier = Modifier.clearAndSetSemantics {})
    }
}

/**
 * Paused with the bars away, the card goes with them and leaves this in the
 * arrows' row: "▶ Génesis 12", which resumes.
 */
@Composable
internal fun PodcastMini(chrome: ChromeController, state: ChromeState, enabled: Boolean) {
    val canPlay = enabled && state.podcast?.canPlay == true
    ExtendedFloatingActionButton(
        onClick = { if (canPlay) chrome.send("podcast-toggle") },
        icon = { Icon(painterResource(R.drawable.ic_play_arrow_filled), contentDescription = null) },
        text = { Text(state.passageLabel, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        elevation = FloatingActionButtonDefaults.loweredElevation(),
        modifier = Modifier.semantics { contentDescription = "${podcastToggleLabel(false)}, ${state.passageAccessibilityLabel}" },
    )
}
