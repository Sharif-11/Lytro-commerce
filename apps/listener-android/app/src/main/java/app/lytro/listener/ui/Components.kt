package app.lytro.listener.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import app.lytro.listener.R
import app.lytro.listener.net.Account
import app.lytro.listener.ui.theme.Background
import app.lytro.listener.ui.theme.Danger
import app.lytro.listener.ui.theme.DangerLine
import app.lytro.listener.ui.theme.DangerSoft
import app.lytro.listener.ui.theme.ErrorText
import app.lytro.listener.ui.theme.Ink
import app.lytro.listener.ui.theme.Inter
import app.lytro.listener.ui.theme.Line
import app.lytro.listener.ui.theme.LineStrong
import app.lytro.listener.ui.theme.LocalBodyFont
import app.lytro.listener.ui.theme.Marigold100
import app.lytro.listener.ui.theme.Marigold300
import app.lytro.listener.ui.theme.Marigold500
import app.lytro.listener.ui.theme.Muted
import app.lytro.listener.ui.theme.Neutral200
import app.lytro.listener.ui.theme.Neutral300
import app.lytro.listener.ui.theme.NotoBengali
import app.lytro.listener.ui.theme.PrimarySoft
import app.lytro.listener.ui.theme.Raised
import app.lytro.listener.ui.theme.Subtle
import app.lytro.listener.ui.theme.Surface
import app.lytro.listener.ui.theme.Teal300
import app.lytro.listener.ui.theme.Teal400
import app.lytro.listener.ui.theme.Teal900
import app.lytro.listener.ui.theme.Text
import app.lytro.listener.ui.theme.WarnSoft
import app.lytro.listener.ui.theme.White
import app.lytro.listener.ui.theme.cssText

// The prototype's parts, class for class (docs/brand/lytro-listener.html's stylesheet), named as it names them.

/** `.phone`, with `.sb` and `.nv` as the system's own bars, on the prototype's colour. */
@Composable
fun PhoneFrame(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(Background).imePadding()) {
        Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(Teal900))
        Column(Modifier.weight(1f), content = content)
        Box(Modifier.fillMaxWidth().windowInsetsBottomHeight(WindowInsets.navigationBars).background(Teal900))
    }
}

/** `.ab.bk`: back, and where this is. */
@Composable
fun BackBar(title: String, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(52.dp).background(Background).padding(start = 4.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(44.dp).clickable(onClick = onBack).testTag("back"), contentAlignment = Alignment.Center) {
            LytroIcon(LytroIcons.Back, Text)
        }
        BasicText(title, style = cssText(16f, 1.2f, FontWeight.W600, Text, LocalBodyFont.current))
    }
}

/** `.ab`: the icon and the name, and the menu on the screens that have one. */
@Composable
fun AppBar(onMenu: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().height(52.dp).background(Background).padding(start = 14.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Image(painterResource(R.drawable.ic_listener_tile), null, Modifier.size(28.dp))
        BasicText(
            stringResource(R.string.app_name),
            Modifier.weight(1f),
            style = cssText(16f, 1.2f, FontWeight.W600, Text, Inter),
        )
        if (onMenu != null) {
            Box(Modifier.size(44.dp).clickable(onClick = onMenu).testTag("menu"), contentAlignment = Alignment.Center) {
                LytroIcon(LytroIcons.More, Text)
            }
        }
    }
}

/** `.bd` and `.foot`: a scrolling body, its last part at the bottom of the screen when there is room. */
@Composable
fun ColumnScope.Body(
    foot: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .heightIn(min = maxHeight)
                .fillMaxWidth()
                .padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
            if (foot != null) {
                Column(Modifier.padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = foot)
            }
        }
    }
}

enum class BandKind(val background: Color, val border: Color, val dot: Color, val title: Color, val small: Color) {
    Ok(PrimarySoft, Line, Teal400, Teal400, Muted),
    Warn(WarnSoft, Line, Marigold300, Marigold300, Muted),
    Dan(Danger, Danger, White, White, White),
    Test(Marigold300, Marigold300, Ink, Ink, Ink),
}

/** `.st`: the one status, always at the top (BRAND-IDENTITY 8.5). */
@Composable
fun StatusBand(kind: BandKind, title: String, small: String? = null) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(kind.border))
    Row(
        Modifier.fillMaxWidth().background(kind.background).padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // `.st.ok .dot`'s ring is a shadow in the prototype: it takes no room.
        Box(
            Modifier.padding(top = 7.dp).size(12.dp).drawBehind {
                if (kind == BandKind.Ok) drawCircle(Teal400.copy(alpha = 0.22f), radius = size.minDimension / 2 + 4.dp.toPx())
                drawCircle(kind.dot)
            },
        )
        Column {
            Txt(title, size = 18f, line = 1.4f, weight = FontWeight.W700, color = kind.title)
            if (small != null) Txt(small, size = 13.5f, line = 1.45f, color = kind.small)
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(kind.border))
}

@Composable
fun Txt(
    text: String,
    modifier: Modifier = Modifier,
    size: Float = 15f,
    line: Float = 1.55f,
    weight: FontWeight = FontWeight.W400,
    color: Color = Text,
    font: FontFamily = LocalBodyFont.current,
    align: TextAlign = TextAlign.Start,
) {
    BasicText(text, modifier, cssText(size, line, weight, color, font, align))
}

/** `h2`. */
@Composable
fun Heading(text: String) = Txt(text, size = 21f, line = 1.35f, weight = FontWeight.W700, color = White)

/** `.p`. */
@Composable
fun Para(text: String, modifier: Modifier = Modifier) = Txt(text, modifier, color = Muted)

/** `.sm`. */
@Composable
fun Small(text: String, modifier: Modifier = Modifier, align: TextAlign = TextAlign.Start) =
    Txt(text, modifier, size = 13.5f, line = 1.5f, color = Muted, align = align)

/** `.lbl`. */
@Composable
fun Label(text: String) = Txt(text, size = 13.5f, line = 1.55f, weight = FontWeight.W600, color = Subtle)

enum class BtnKind(val background: Color, val text: Color, val border: Color?, val weight: FontWeight) {
    Primary(Teal400, Ink, null, FontWeight.W700),
    Secondary(Color.Transparent, Teal300, LineStrong, FontWeight.W600),
    Warn(Marigold500, Ink, null, FontWeight.W700),
    Dan(Color.Transparent, ErrorText, DangerLine, FontWeight.W600),
}

/** `.btn`. */
@Composable
fun Btn(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.Primary,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    minHeight: Dp = 48.dp,
) {
    val shape = RoundedCornerShape(10.dp)
    val background = if (enabled) kind.background else Raised
    val color = if (enabled) kind.text else Neutral300
    var box = modifier.fillMaxWidth().heightIn(min = minHeight).clip(shape).background(background)
    if (kind.border != null) box = box.border(1.dp, kind.border, shape)
    Row(
        box.clickable(enabled = enabled, onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        if (icon != null) LytroIcon(icon, color)
        Txt(text, size = 15.5f, weight = if (enabled) kind.weight else FontWeight.W700, color = color, align = TextAlign.Center)
    }
}

/** `.lnk`. */
@Composable
fun LinkBtn(text: String, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Txt(text, weight = FontWeight.W600, color = Teal300, align = TextAlign.Center)
    }
}

/** `.card`. */
@Composable
fun Card(
    modifier: Modifier = Modifier,
    gap: Dp = 0.dp,
    verticalPadding: Dp = 13.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    // A CSS border adds to the padding; here it would be drawn over it.
    Column(
        modifier.fillMaxWidth().clip(shape).background(Surface).border(1.dp, Line, shape)
            .padding(horizontal = 15.dp, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(gap),
        content = content,
    )
}

/** `.big`. */
enum class BigKind(val background: Color, val color: Color) {
    Plain(Raised, Teal300),
    Warn(WarnSoft, Marigold300),
    Dan(DangerSoft, ErrorText),
    Good(PrimarySoft, Teal400),
}

@Composable
fun BigIcon(icon: ImageVector, kind: BigKind = BigKind.Plain) {
    Box(
        Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(kind.background),
        contentAlignment = Alignment.Center,
    ) {
        LytroIcon(icon, kind.color, size = 28.dp)
    }
}

/** `.li`: an icon, then its line. */
@Composable
fun IconLine(icon: ImageVector, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        LytroIcon(icon, Teal400, Modifier.padding(top = 3.dp))
        Txt(text)
    }
}

/** `.li` with `.num-c`: a numbered step. */
@Composable
fun NumberedLine(number: Int, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(26.dp).clip(CircleShape).background(Raised), contentAlignment = Alignment.Center) {
            Txt("$number", size = 13f, line = 2f, weight = FontWeight.W600, color = White, font = Inter)
        }
        Txt(text)
    }
}

/** `.stepper`. */
@Composable
fun Stepper(step: Int, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        for (index in 1..3) {
            Box(
                Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(2.dp))
                    .background(if (index <= step) Teal400 else Raised),
            )
        }
        Txt(label, Modifier.padding(start = 6.dp), size = 12.5f, line = 1f, weight = FontWeight.W500, color = Subtle, font = Inter)
    }
}

/** `.note`. */
enum class NoteKind(val background: Color, val color: Color, val iconColor: Color) {
    Plain(Raised, Muted, Muted),
    Warn(WarnSoft, Marigold100, Marigold300),
}

@Composable
fun Note(icon: ImageVector, text: String, kind: NoteKind = NoteKind.Plain) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(kind.background)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LytroIcon(icon, kind.iconColor, Modifier.padding(top = 2.dp), size = 17.dp)
        Txt(text, size = 13.5f, line = 1.5f, color = kind.color)
    }
}

/** `.err`. */
@Composable
fun ErrorLine(icon: ImageVector, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        LytroIcon(icon, ErrorText, Modifier.padding(top = 2.dp), size = 17.dp)
        Txt(text, size = 14f, line = 1.5f, color = ErrorText)
    }
}

/** `.card.acct`: a wallet's number, shown as the prototype writes it. */
@Composable
fun AccountCard(account: Account) {
    Card {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Label(walletName(account.method))
                Txt(phoneNumberShown(account.number), size = 18f, line = 1.3f, weight = FontWeight.W700, color = White, font = Inter)
            }
            LytroIcon(LytroIcons.Wallet, Text)
        }
    }
}

/** The prototype's `.lang`. */
@Composable
fun LanguageSwitch(language: String, onChoose: (String) -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    Row(Modifier.clip(shape).border(1.dp, LineStrong, shape).padding(1.dp)) {
        for ((value, label) in listOf("bn" to "বাংলা", "en" to "EN")) {
            val on = value == language
            Box(
                Modifier.heightIn(min = 36.dp).background(if (on) Raised else Color.Transparent)
                    .clickable { onChoose(value) }.padding(horizontal = 12.dp, vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                val bangla = value == "bn"
                // Sits on the same line as EN, as one font stack's two scripts do in the prototype.
                Txt(
                    label,
                    if (bangla) Modifier.offset(y = 1.dp) else Modifier,
                    size = 13f,
                    line = 1f,
                    weight = FontWeight.W600,
                    color = if (on) White else Muted,
                    font = if (bangla) NotoBengali else Inter,
                )
            }
        }
    }
}

/** A sum in taka: Inter has no ৳, so it comes from Noto Sans Bengali, as a browser falls back to it in the prototype. */
fun takaText(amount: String): AnnotatedString = buildAnnotatedString {
    withStyle(SpanStyle(fontFamily = NotoBengali)) { append("৳") }
    append(amount)
}

/** `.rc`: one receipt. */
data class ReceiptRow(
    val wallet: String,
    val amount: String?,
    val time: String,
    val transactionId: String?,
    val line: String,
    val kind: LineKind,
    val icon: ImageVector,
)

@Composable
fun ReceiptItem(row: ReceiptRow) {
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
        Column(Modifier.padding(vertical = 10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.weight(1f)) {
                    Txt("${row.wallet}${if (row.amount != null) " · " else ""}", weight = FontWeight.W600, color = White)
                    if (row.amount != null) {
                        BasicText(
                            takaText(row.amount),
                            style = cssText(15f, 1.55f, FontWeight.W600, White, Inter),
                        )
                    }
                }
                Txt(row.time, size = 12.5f, line = 1.8f, color = Subtle, font = Inter)
            }
            if (row.transactionId != null) {
                BasicText(
                    "TrxID ${row.transactionId}",
                    style = cssText(12.5f, 1.5f, FontWeight.W500, Subtle, Inter, letterSpacing = 0.02.em),
                )
            }
            Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LytroIcon(row.icon, row.kind.color(), Modifier.padding(top = 3.dp), size = 15.dp)
                Txt(row.line, size = 13.5f, line = 1.45f, color = row.kind.color())
            }
        }
    }
}

private fun LineKind.color(): Color = when (this) {
    LineKind.Good -> Teal300
    LineKind.Wait -> Marigold300
    LineKind.Plain -> Neutral200
}
