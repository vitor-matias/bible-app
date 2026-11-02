package org.capuchinhos.biblia.chrome

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.capuchinhos.biblia.R

/**
 * Auto-scroll, as in the iOS app: paused, one button, ▶; playing, − and +
 * come out to its left, with ⏸ where ▶ was. The speed isn't shown (TalkBack
 * hears it on − and +), and there's no ✕: ⋮ hides auto-scroll, as it showed
 * it. The reader drags it anywhere over the text, which keeps no room for it,
 * and it stays there, then and on later launches. Read hands-free.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
internal fun AutoScrollControl(chrome: ChromeController, autoScroll: AutoScrollState, enabled: Boolean) {
    val colors = MaterialTheme.colorScheme
    val button = with(LocalDensity.current) { BarMetrics.chapterButton.dp.roundToPx() }
    // How far a drag, or the settling after one, has it from where it rests.
    var drag by remember { mutableStateOf(Offset.Zero) }
    val scope = rememberCoroutineScope()
    var settling by remember { mutableStateOf<Job?>(null) }
    // The last layout: the area's size, then the control's place and size.
    val laidOut = remember { IntArray(6) }
    // Laid out in its new place, it is shown from where it was let go: only a
    // drop past the area's edges moves it, back inside.
    fun drop() {
        val (areaWidth, areaHeight, x, y) = laidOut
        val (width, height) = laidOut.copyOfRange(4, 6)
        val left = x + drag.x
        val top = y + drag.y
        val position = autoScrollControlFraction(left + width - button / 2f, top + height / 2f, areaWidth, areaHeight, button)
        val (restX, restY) = autoScrollControlOrigin(position.first, position.second, areaWidth, areaHeight, button, width, height)
        chrome.moveAutoScroll(position)
        drag = Offset(left - restX, top - restY)
        settling = scope.launch {
            Animatable(drag, Offset.VectorConverter).animateTo(Offset.Zero, spring(dampingRatio = 0.8f)) { drag = value }
        }
    }
    Layout(
        modifier = Modifier.fillMaxSize(),
        content = {
            Row(
                Modifier.pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { settling?.cancel() },
                        onDragEnd = ::drop,
                        onDragCancel = ::drop,
                    ) { change, amount ->
                        change.consume()
                        drag += amount
                    }
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AnimatedVisibility(
                    visible = autoScroll.playing,
                    enter = expandHorizontally(expandFrom = Alignment.End) + fadeIn(),
                    exit = shrinkHorizontally(shrinkTowards = Alignment.End) + fadeOut(),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = colors.surfaceContainer,
                        shadowElevation = FloatingToolbarDefaults.ContainerExpandedElevation,
                    ) {
                        // − and +, one connected group (Material 3 Expressive).
                        Row(
                            Modifier.height(BarMetrics.chapterButton.dp).padding(horizontal = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            SpeedButton(
                                R.drawable.ic_remove,
                                "Diminuir velocidade",
                                leading = true,
                                enabled && autoScroll.canSlower,
                                autoScroll.speedAccessibilityLabel,
                            ) { chrome.send("auto-scroll-slower") }
                            SpeedButton(
                                R.drawable.ic_add,
                                "Aumentar velocidade",
                                leading = false,
                                enabled && autoScroll.canFaster,
                                autoScroll.speedAccessibilityLabel,
                            ) { chrome.send("auto-scroll-faster") }
                        }
                    }
                }
                // At the page's end there's nothing left to play: greyed out.
                val canPress = enabled && (autoScroll.playing || autoScroll.canPlay)
                // The accent itself, which stands out from the page in either
                // theme (a container would be 1.85:1 on the dark page).
                // Its toolbar would size it: alone, it would fill the area.
                val size = Modifier.size(BarMetrics.chapterButton.dp)
                // Round while paused, a rounded square while playing, the
                // shape springing between them (Material 3 Expressive): which
                // it is shows at a glance, not only by the small icon.
                val corner by animateFloatAsState(
                    if (autoScroll.playing) 28f else 50f,
                    MaterialTheme.motionScheme.defaultSpatialSpec(),
                    label = "play shape",
                )
                FloatingToolbarDefaults.VibrantFloatingActionButton(
                    onClick = { if (canPress) chrome.send("auto-scroll-toggle") },
                    modifier = if (canPress) size else size.semantics { disabled() },
                    shape = RoundedCornerShape(percent = corner.roundToInt()),
                    containerColor = colors.primary,
                    contentColor = colors.onPrimary.copy(alpha = if (canPress) 1f else 0.38f),
                ) {
                    Icon(
                        painterResource(if (autoScroll.playing) R.drawable.ic_pause_filled else R.drawable.ic_play_arrow_filled),
                        contentDescription = if (autoScroll.playing) "Pausar" else "Iniciar",
                    )
                }
            }
        },
    ) { measurables, constraints ->
        val control = measurables.first().measure(constraints.copy(minWidth = 0, minHeight = 0))
        val (fractionX, fractionY) = chrome.autoScrollPosition
        val (x, y) = autoScrollControlOrigin(
            fractionX, fractionY, constraints.maxWidth, constraints.maxHeight, button, control.width, control.height,
        )
        intArrayOf(constraints.maxWidth, constraints.maxHeight, x, y, control.width, control.height).copyInto(laidOut)
        layout(constraints.maxWidth, constraints.maxHeight) {
            control.place(x + drag.x.roundToInt(), y + drag.y.roundToInt())
        }
    }
}

/**
 * − or + in the speed group: tonal, rounded on the group's outer side and
 * squarer on the inner, widening a little as it is pressed.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun SpeedButton(
    @DrawableRes icon: Int,
    label: String,
    leading: Boolean,
    enabled: Boolean,
    stateDescription: String,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val width by animateDpAsState(if (pressed) 56.dp else 48.dp, MaterialTheme.motionScheme.fastSpatialSpec(), label = "press")
    val outer = CornerSize(50)
    val inner = CornerSize(8.dp)
    val shape = if (leading) {
        RoundedCornerShape(topStart = outer, bottomStart = outer, topEnd = inner, bottomEnd = inner)
    } else {
        RoundedCornerShape(topStart = inner, bottomStart = inner, topEnd = outer, bottomEnd = outer)
    }
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
        tooltip = { PlainTooltip { Text(label) } },
        state = rememberTooltipState(),
    ) {
        FilledTonalIconButton(
            onClick = onClick,
            shapes = IconButtonShapes(shape = shape, pressedShape = RoundedCornerShape(inner)),
            enabled = enabled,
            interactionSource = interaction,
            modifier = Modifier
                .height(48.dp)
                .width(width)
                .semantics { this.stateDescription = stateDescription },
        ) {
            Icon(painterResource(icon), contentDescription = label)
        }
    }
}
