package org.capuchinhos.biblia.chrome

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/** Whether the in-app theme ("system", "light", "dark") is dark here. */
@Composable
fun isDarkTheme(themeMode: String): Boolean = when (themeMode) {
    "light" -> false
    "dark" -> true
    else -> isSystemInDarkTheme()
}

/**
 * Material 3 Expressive in the wallpaper's colours, as Android's own apps
 * (Android 12 and later); before that, in the website's brown. The reader's
 * text keeps its red either way.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun BibleTheme(themeMode: String, content: @Composable () -> Unit) {
    val dark = isDarkTheme(themeMode)
    val context = LocalContext.current
    val colorScheme = bibleColorScheme(dark, Build.VERSION.SDK_INT) { darkWallpaper ->
        if (darkWallpaper) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    }
    CompositionLocalProvider(LocalDarkTheme provides dark) {
        MaterialExpressiveTheme(
            colorScheme = colorScheme,
            motionScheme = MotionScheme.expressive(),
            content = content,
        )
    }
}

/** The wallpaper's scheme where Android has one (12, API 31, on); else the brown. */
fun bibleColorScheme(dark: Boolean, sdkInt: Int, dynamic: (dark: Boolean) -> ColorScheme): ColorScheme =
    if (sdkInt >= Build.VERSION_CODES.S) dynamic(dark) else if (dark) BrownDark else BrownLight

/**
 * The web page's own background (`--background-color` in src/styles.css),
 * which the top bar takes at rest.
 */
fun pageBackground(dark: Boolean): Color = if (dark) Color(0xFF121212) else Color.White

/** Whether [BibleTheme] is dark, for the colours that differ by theme. */
val LocalDarkTheme = staticCompositionLocalOf { false }

/**
 * The colour a bookmark stores ("red"), in a tone that keeps 3:1 against
 * the tiles and bars it sits on: darker on light surfaces, lighter on dark
 * ones. The same tones as the web app (`--ribbon-*` in src/styles.css) and
 * the iOS app (BookmarksSheet.swift). Null for no ribbon.
 */
fun ribbonTone(name: String?, dark: Boolean): Color? {
    val (light, darkTone) = when (name) {
        "red" -> 0xFFC62828 to 0xFFEF7070
        "orange" -> 0xFFAD5700 to 0xFFFFA040
        "teal" -> 0xFF00796B to 0xFF4DB6AC
        "green" -> 0xFF2E7D32 to 0xFF7CC47F
        "blue" -> 0xFF1565C0 to 0xFF64B5F6
        "indigo" -> 0xFF3949AB to 0xFF9FA8DA
        "violet" -> 0xFF8E24AA to 0xFFCE93D8
        "grey" -> 0xFF616161 to 0xFFBDBDBD
        else -> return null
    }
    return Color(if (dark) darkTone else light)
}

/** [ribbonTone] for the theme in use. */
@Composable
fun ribbonColor(name: String?): Color? = ribbonTone(name, LocalDarkTheme.current)

// Phones without wallpaper colours (before Android 12): Material's fidelity
// scheme from the website's brown #543D27, its header's colour
// (material-color-utilities 0.3.0, SchemeFidelity, contrast 0; tonal spot
// would push it to caramel), with the light theme's primary roles moved so
// the brown is the accent, and a few on-colours lifted for contrast.

internal val BrownLight = lightColorScheme(
    // The website's brown is the accent, where the fidelity scheme put it on
    // a dark container and kept a near-black primary: selected buttons, the
    // current chapter and ▶ now show it (10.1:1 under white). Its container
    // is light, so the ribbon tones made for light tiles show on it.
    primary = Color(0xFF543D27),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFFDCC2),
    onPrimaryContainer = Color(0xFF2B1700),
    inversePrimary = Color(0xFFE2C0A3),
    secondary = Color(0xFF6A5C50),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFF0DCCD),
    // Darkened from the generated #6E6054 (4.57:1) to 9.8:1: the corner
    // arrows' only affordance is their glyph.
    onSecondaryContainer = Color(0xFF3B2F24),
    tertiary = Color(0xFF182F37),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFF2F454E),
    onTertiaryContainer = Color(0xFF9BB2BD),
    background = Color(0xFFFFF8F5),
    onBackground = Color(0xFF1E1B19),
    surface = Color(0xFFFFF8F5),
    onSurface = Color(0xFF1E1B19),
    surfaceVariant = Color(0xFFEFE0D5),
    onSurfaceVariant = Color(0xFF4F453D),
    surfaceTint = Color(0xFF735941),
    inverseSurface = Color(0xFF33302D),
    inverseOnSurface = Color(0xFFF7EFEB),
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF93000A),
    outline = Color(0xFF80756C),
    outlineVariant = Color(0xFFD2C4BA),
    scrim = Color(0xFF000000),
    surfaceBright = Color(0xFFFFF8F5),
    surfaceContainer = Color(0xFFF4ECE8),
    surfaceContainerHigh = Color(0xFFEEE7E3),
    surfaceContainerHighest = Color(0xFFE8E1DD),
    surfaceContainerLow = Color(0xFFFAF2EE),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceDim = Color(0xFFE0D9D5),
)

internal val BrownDark = darkColorScheme(
    primary = Color(0xFFE2C0A3),
    onPrimary = Color(0xFF412C17),
    primaryContainer = Color(0xFF543D27),
    onPrimaryContainer = Color(0xFFC8A88C),
    inversePrimary = Color(0xFF735941),
    secondary = Color(0xFFD6C3B5),
    onSecondary = Color(0xFF392E24),
    secondaryContainer = Color(0xFF53473C),
    // Lifted from the generated #C7B5A7 to 6.8:1.
    onSecondaryContainer = Color(0xFFF0DCCD),
    tertiary = Color(0xFFB3CAD5),
    onTertiary = Color(0xFF1D333C),
    tertiaryContainer = Color(0xFF2F454E),
    onTertiaryContainer = Color(0xFF9BB2BD),
    background = Color(0xFF151311),
    onBackground = Color(0xFFE8E1DD),
    surface = Color(0xFF151311),
    onSurface = Color(0xFFE8E1DD),
    surfaceVariant = Color(0xFF4F453D),
    onSurfaceVariant = Color(0xFFD2C4BA),
    surfaceTint = Color(0xFFE2C0A3),
    inverseSurface = Color(0xFFE8E1DD),
    inverseOnSurface = Color(0xFF33302D),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    outline = Color(0xFF9B8E85),
    outlineVariant = Color(0xFF4F453D),
    scrim = Color(0xFF000000),
    surfaceBright = Color(0xFF3C3836),
    surfaceContainer = Color(0xFF221F1D),
    surfaceContainerHigh = Color(0xFF2D2927),
    surfaceContainerHighest = Color(0xFF383432),
    surfaceContainerLow = Color(0xFF1E1B19),
    surfaceContainerLowest = Color(0xFF100E0C),
    surfaceDim = Color(0xFF151311),
)
