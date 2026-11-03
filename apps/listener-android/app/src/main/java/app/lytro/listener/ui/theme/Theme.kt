package app.lytro.listener.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import app.lytro.listener.R

// The prototype's :root values (docs/brand/lytro-listener.html: tokens.css's dark roles, BRAND-IDENTITY.md 8.5).
val Teal300 = Color(0xFF7FDCD3)
val Teal400 = Color(0xFF3EC4B9)
val Teal900 = Color(0xFF063B38)
val Marigold100 = Color(0xFFFDF0D1)
val Marigold300 = Color(0xFFF8CF6E)
val Marigold500 = Color(0xFFF2A516)
val Ink = Color(0xFF10201F)
val Neutral100 = Color(0xFFEAF0EF)
val Neutral200 = Color(0xFFD5DFDE)
val Neutral300 = Color(0xFFA9B9B8)
val Danger = Color(0xFFC8323B)
val Background = Color(0xFF0C1A19)
val Surface = Color(0xFF132725)
val Raised = Color(0xFF1A3230)
val Line = Color(0xFF24403D)
val LineStrong = Color(0xFF335450)
val PrimarySoft = Color(0xFF0F3330)
val WarnSoft = Color(0xFF3A2F12)
val DangerSoft = Color(0xFF3A1A1D)
val Text = Neutral100
val Muted = Neutral200
val Subtle = Neutral300
val White = Color.White
val ErrorText = Color(0xFFFFB4B8)
val DangerLine = Color(0xFF7C3036)
val BadBox = Color(0xFFFFD9DB)
val BadBoxText = Color(0xFF7C1F25)
val CameraFrom = Color(0xFF1C2A29)
val CameraTo = Color(0xFF0B1211)

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.W400),
    Font(R.font.inter_medium, FontWeight.W500),
    Font(R.font.inter_semibold, FontWeight.W600),
    Font(R.font.inter_bold, FontWeight.W700),
)

val NotoBengali = FontFamily(
    Font(R.font.noto_bengali_regular, FontWeight.W400),
    Font(R.font.noto_bengali_medium, FontWeight.W500),
    Font(R.font.noto_bengali_semibold, FontWeight.W600),
    Font(R.font.noto_bengali_bold, FontWeight.W700),
)

/** `.phone`: Noto Sans Bengali in Bangla, Inter in English. Figures and IDs stay in Inter in both. */
val LocalBodyFont = staticCompositionLocalOf { NotoBengali }

/** CSS's `font: <weight> <size>/<line>`, with its half-leading, so the text sits where the prototype's does. */
fun cssText(
    size: Float,
    line: Float,
    weight: FontWeight,
    color: Color,
    font: FontFamily,
    align: TextAlign = TextAlign.Start,
    letterSpacing: TextUnit = TextUnit.Unspecified,
) = TextStyle(
    fontFamily = font,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = (size * line).sp,
    color = color,
    textAlign = align,
    letterSpacing = letterSpacing,
    platformStyle = PlatformTextStyle(includeFontPadding = false),
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
)
