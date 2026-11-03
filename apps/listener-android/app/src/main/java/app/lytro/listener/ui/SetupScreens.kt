package app.lytro.listener.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.lytro.listener.R
import app.lytro.listener.sms.CODE_LENGTH
import app.lytro.listener.ui.theme.BadBox
import app.lytro.listener.ui.theme.BadBoxText
import app.lytro.listener.ui.theme.CameraFrom
import app.lytro.listener.ui.theme.CameraTo
import app.lytro.listener.ui.theme.Ink
import app.lytro.listener.ui.theme.Inter
import app.lytro.listener.ui.theme.LineStrong
import app.lytro.listener.ui.theme.Marigold300
import app.lytro.listener.ui.theme.Raised
import app.lytro.listener.ui.theme.Surface
import app.lytro.listener.ui.theme.Teal400
import kotlinx.coroutines.delay

/** 2.1. */
@Composable
fun ColumnScope.WelcomeScreen(model: AppViewModel, language: String) {
    AppBar()
    Body(
        foot = { Btn(stringResource(R.string.start), model::getStarted) },
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            LanguageSwitch(language, model::chooseLanguage)
        }
        Heading(stringResource(R.string.wel_t))
        Card(gap = 12.dp) {
            NumberedLine(1, stringResource(R.string.wel_1))
            NumberedLine(2, stringResource(R.string.wel_2))
            NumberedLine(3, stringResource(R.string.wel_3))
        }
        Note(LytroIcons.Phone, stringResource(R.string.wel_n), NoteKind.Warn)
    }
}

@Composable
private fun NotPairedBand() {
    StatusBand(BandKind.Warn, stringResource(R.string.st_off), stringResource(R.string.st_off_s))
}

/** 2.2, scanning. The picture fills the room left, as `.cam`'s `flex: 1` does. */
@Composable
fun ColumnScope.PairScanScreen(model: AppViewModel) {
    val context = LocalContext.current
    var allowed by remember { mutableStateOf(context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var asked by rememberSaveable { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed = it }
    LaunchedEffect(Unit) {
        if (!allowed && !asked) {
            asked = true
            ask.launch(Manifest.permission.CAMERA)
        }
    }
    AppBar()
    NotPairedBand()
    Column(
        Modifier.weight(1f).fillMaxWidth().padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Heading(stringResource(R.string.scan_t))
        Small(stringResource(R.string.scan_p))
        Box(
            Modifier.weight(1f).heightIn(min = 300.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp))
                .background(Brush.linearGradient(listOf(CameraFrom, CameraTo), Offset(0f, 0f), Offset(600f, 1800f))),
            contentAlignment = Alignment.Center,
        ) {
            if (allowed) {
                QrCamera(Modifier.fillMaxSize(), model::openLink)
                ScanFrame(Modifier.fillMaxWidth(0.62f).aspectRatio(1f))
            } else {
                Column(
                    Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Para(stringResource(R.string.cam_off), Modifier.fillMaxWidth())
                    Btn(stringResource(R.string.allow), { ask.launch(Manifest.permission.CAMERA) })
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Btn(stringResource(R.string.type_code), model::typeInstead, kind = BtnKind.Secondary, icon = LytroIcons.Keyboard)
    }
}

/** `.cam .fr`: the marigold corners. */
@Composable
private fun ScanFrame(modifier: Modifier) {
    Canvas(modifier) {
        val arm = 30.dp.toPx()
        val radius = 8.dp.toPx()
        val stroke = 4.dp.toPx()
        val inset = stroke / 2
        corner(inset, inset, arm, radius, stroke, 1f, 1f)
        corner(size.width - inset, inset, arm, radius, stroke, -1f, 1f)
        corner(inset, size.height - inset, arm, radius, stroke, 1f, -1f)
        corner(size.width - inset, size.height - inset, arm, radius, stroke, -1f, -1f)
    }
}

private fun DrawScope.corner(x: Float, y: Float, arm: Float, radius: Float, stroke: Float, dx: Float, dy: Float) {
    val path = Path().apply {
        moveTo(x, y + dy * arm)
        lineTo(x, y + dy * radius)
        quadraticTo(x, y, x + dx * radius, y)
        lineTo(x + dx * arm, y)
    }
    drawPath(path, Marigold300, style = Stroke(stroke, cap = StrokeCap.Butt, join = StrokeJoin.Round))
}

/** 2.2, typing, and every refusal of pairing: the screen stays and says why. */
@Composable
fun ColumnScope.PairTypeScreen(model: AppViewModel) {
    BackHandler { model.scanInstead() }
    AppBar()
    NotPairedBand()
    val problem = model.pairProblem
    if (problem == PairProblem.DeviceLimit) {
        Body(foot = { Btn(stringResource(R.string.retry), model::clearProblem) }) {
            BigIcon(LytroIcons.Phone, BigKind.Warn)
            Heading(stringResource(R.string.lim_t))
            Para(stringResource(R.string.lim_p))
        }
        return
    }
    var clock by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val lockedUntil = (problem as? PairProblem.TooManyTries)?.until
    LaunchedEffect(lockedUntil) {
        while (lockedUntil != null && clock < lockedUntil) {
            delay(1_000)
            clock = System.currentTimeMillis()
        }
        if (lockedUntil != null) model.clearProblem()
    }
    val full = model.code.length == CODE_LENGTH
    Body(
        foot = {
            when (problem) {
                is PairProblem.WrongCode, PairProblem.NoInternet, is PairProblem.Stopped ->
                    Btn(stringResource(R.string.retry), if (problem == PairProblem.NoInternet) model::pair else model::clearProblem, enabled = !model.pairing)
                is PairProblem.TooManyTries -> Btn(stringResource(R.string.pair), model::pair, enabled = false)
                else -> {
                    Btn(stringResource(R.string.pair), model::pair, enabled = full && !model.pairing)
                    LinkBtn(stringResource(R.string.use_scan), model::scanInstead)
                }
            }
        },
    ) {
        Heading(stringResource(R.string.type_t))
        if (problem !is PairProblem.TooManyTries && problem != PairProblem.NoInternet) {
            Small(stringResource(R.string.type_p))
        }
        CodeBoxes(model.code, bad = problem is PairProblem.WrongCode, locked = problem is PairProblem.TooManyTries, model::typed)
        when (problem) {
            is PairProblem.WrongCode -> ErrorLine(LytroIcons.Alert, problem.words)
            is PairProblem.Stopped -> ErrorLine(LytroIcons.Alert, problem.words)
            is PairProblem.TooManyTries -> {
                val minutes = (((problem.until - clock).coerceAtLeast(0) + 59_999) / 60_000).toInt()
                ErrorLine(LytroIcons.Clock, pluralStringResource(R.plurals.e_tries, minutes, minutes))
            }
            PairProblem.NoInternet -> ErrorLine(LytroIcons.WifiOff, stringResource(R.string.e_net))
            else -> Unit
        }
    }
}

/** `.code`: 8 boxes, 4 + 4, marigold with ink characters as they fill. Typing goes to a field that shows only the boxes. */
@Composable
private fun CodeBoxes(code: String, bad: Boolean, locked: Boolean, onTyped: (String) -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    BasicTextField(
        value = code,
        onValueChange = onTyped,
        modifier = Modifier.fillMaxWidth().focusRequester(focus).testTag("code"),
        enabled = !locked,
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.Characters,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Ascii,
            imeAction = ImeAction.Done,
        ),
        keyboardActions = KeyboardActions.Default,
        decorationBox = {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                for (index in 0 until CODE_LENGTH) {
                    if (index == 4) Spacer(Modifier.width(6.dp))
                    CodeBox(Modifier.weight(1f), code.getOrNull(index), caret = !locked && index == code.length, bad)
                }
            }
        },
    )
}

@Composable
private fun CodeBox(modifier: Modifier, char: Char?, caret: Boolean, bad: Boolean) {
    val shape = RoundedCornerShape(7.dp)
    val box = modifier.height(46.dp).clip(shape)
    val drawn = when {
        char != null -> box.background(if (bad) BadBox else Marigold300)
        caret -> box.background(Surface).border(2.dp, Marigold300, shape)
        else -> box.background(Surface).border(1.dp, LineStrong, shape)
    }
    Box(drawn, contentAlignment = Alignment.Center) {
        if (char != null) {
            Txt(char.toString(), size = 20f, line = 2.3f, weight = FontWeight.W700, color = if (bad) BadBoxText else Ink, font = Inter, align = TextAlign.Center)
        }
    }
}

/** 2.3: the right phone? */
@Composable
fun ColumnScope.PairedScreen(model: AppViewModel, shopName: String, accounts: List<app.lytro.listener.net.Account>) {
    AppBar()
    val hasNumber = accounts.isNotEmpty()
    Body(
        foot = {
            if (hasNumber) {
                Btn(stringResource(R.string.yes_here), model::simIsHere)
                Btn(stringResource(R.string.no_other), model::simIsElsewhere, kind = BtnKind.Secondary)
            } else {
                Btn(stringResource(R.string.cont), model::simIsHere)
            }
        },
    ) {
        BigIcon(LytroIcons.Check, BigKind.Good)
        Heading(stringResource(R.string.done_t, shopName))
        if (hasNumber) {
            Para(stringResource(if (accounts.size > 1) R.string.acct_qs else R.string.acct_q))
            accounts.forEach { AccountCard(it) }
            Small(stringResource(R.string.acct_p))
            if (model.unpairFailed) ErrorLine(LytroIcons.WifiOff, stringResource(R.string.e_net))
        } else {
            // Agreed 2026-11-03: no number to ask about, so it says so and setup carries on; Home keeps saying it.
            Note(LytroIcons.Alert, stringResource(R.string.st_acct_s), NoteKind.Warn)
            Para(stringResource(R.string.acct_note))
        }
    }
}

@Composable
private fun rememberSmsAsk(model: AppViewModel): () -> Unit {
    val activity = LocalActivity.current
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        model.smsAnswered(activity?.let(::smsRefusal) ?: SmsRefusal.ByPerson)
    }
    return { ask.launch(SMS_PERMISSIONS) }
}

/** 2.4: step 1, the three promises. */
@Composable
fun ColumnScope.PermSmsScreen(model: AppViewModel) {
    val ask = rememberSmsAsk(model)
    AppBar()
    Body(foot = { Btn(stringResource(R.string.allow), ask) }) {
        Stepper(1, stringResource(R.string.s1))
        BigIcon(LytroIcons.Message)
        Heading(stringResource(R.string.sms_t))
        Para(stringResource(R.string.sms_p))
        Card(gap = 8.dp) {
            IconLine(LytroIcons.Check, stringResource(R.string.sms_1))
            IconLine(LytroIcons.Check, stringResource(R.string.sms_2))
            IconLine(LytroIcons.Check, stringResource(R.string.sms_3))
        }
        Note(LytroIcons.Help, stringResource(R.string.sms_n))
    }
}

/** Setup goes no further without it, since nothing else matters. */
@Composable
fun ColumnScope.PermSmsNoScreen(model: AppViewModel) {
    val context = LocalContext.current
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.checkSmsAgain() }
    PermSmsNoBody(onOpenSettings = { openAppInfo(context) })
}

@Composable
fun ColumnScope.PermSmsNoBody(onOpenSettings: () -> Unit) {
    AppBar()
    Body(foot = { Btn(stringResource(R.string.open_set), onOpenSettings) }) {
        Stepper(1, stringResource(R.string.s1))
        BigIcon(LytroIcons.Message, BigKind.Dan)
        Heading(stringResource(R.string.sms_d_t))
        Para(stringResource(R.string.sms_d_p))
    }
}

/**
 * Agreed 2026-11-03: Android 15 and later refuse SMS to an app installed from a browser, with no Allow to tap, until the
 * person frees it from App info's menu. Every shop on such a phone meets this, since the app is not on Google Play.
 */
@Composable
fun ColumnScope.PermSmsBlockedScreen(model: AppViewModel) {
    val context = LocalContext.current
    val ask = rememberSmsAsk(model)
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.checkSmsAgain() }
    PermSmsBlockedBody(onOpenSettings = { openAppInfo(context) }, onAllow = ask)
}

@Composable
fun ColumnScope.PermSmsBlockedBody(onOpenSettings: () -> Unit, onAllow: () -> Unit) {
    AppBar()
    Body(
        foot = {
            Btn(stringResource(R.string.open_set), onOpenSettings)
            Btn(stringResource(R.string.allow), onAllow, kind = BtnKind.Secondary)
        },
    ) {
        Stepper(1, stringResource(R.string.s1))
        BigIcon(LytroIcons.Message, BigKind.Dan)
        Heading(stringResource(R.string.blk_t))
        Para(stringResource(R.string.blk_p))
        Card(gap = 12.dp) {
            NumberedLine(1, stringResource(R.string.blk_1))
            NumberedLine(2, stringResource(R.string.blk_2))
            NumberedLine(3, stringResource(R.string.blk_3))
        }
    }
}

/** 2.5: step 2. Whatever the answer, setup carries on, since the app works without its notification. */
@Composable
fun ColumnScope.PermNotifScreen(model: AppViewModel) {
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        model.notificationsAnswered()
    }
    AppBar()
    Body(
        foot = {
            Btn(stringResource(R.string.turn_on), { ask.launch(Manifest.permission.POST_NOTIFICATIONS) })
        },
    ) {
        Stepper(2, stringResource(R.string.s2))
        BigIcon(LytroIcons.Bell)
        Heading(stringResource(R.string.not_t))
        Para(stringResource(R.string.not_p))
    }
}

/** 2.7: waiting for a first receipt. Later is prominent: the next real payment shows the same thing. */
@Composable
fun ColumnScope.TestWaitScreen(model: AppViewModel, accounts: List<app.lytro.listener.net.Account>) {
    AppBar()
    Body(foot = { LinkBtn(stringResource(R.string.t_skip), model::finishSetup) }) {
        Heading(stringResource(R.string.t_t))
        Para(stringResource(R.string.t_p))
        accounts.forEach { AccountCard(it) }
        Column(
            Modifier.fillMaxWidth().padding(vertical = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Ring()
            Para(stringResource(R.string.t_wait))
        }
    }
}

/** `.ring`. */
@Composable
private fun Ring() {
    val spin = rememberInfiniteTransition("ring")
    val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(1_100, easing = LinearEasing), RepeatMode.Restart), "angle")
    Canvas(Modifier.size(56.dp)) {
        val stroke = 4.dp.toPx()
        val inset = stroke / 2
        val oval = Rect(inset, inset, size.width - inset, size.height - inset)
        drawArc(Raised, 0f, 360f, false, oval.topLeft, oval.size, style = Stroke(stroke))
        drawArc(Teal400, angle - 135f, 90f, false, oval.topLeft, oval.size, style = Stroke(stroke))
    }
}

/** 2.7: it arrived. */
@Composable
fun ColumnScope.TestGotScreen(model: AppViewModel) {
    AppBar()
    Body(foot = { Btn(stringResource(R.string.finish), model::finishSetup) }) {
        BigIcon(LytroIcons.Check, BigKind.Good)
        Heading(stringResource(R.string.t_got_t))
        model.testReceipt?.let {
            Card { ReceiptItem(savedRow(it, model.now, stringResource(R.string.r_reached), LineKind.Good, LytroIcons.Check)) }
        }
        Para(stringResource(R.string.t_got_p))
    }
}
