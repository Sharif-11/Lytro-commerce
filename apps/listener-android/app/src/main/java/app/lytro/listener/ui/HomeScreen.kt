package app.lytro.listener.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import app.lytro.listener.R
import app.lytro.listener.data.SavedMessage
import app.lytro.listener.engine.millisOfIso
import app.lytro.listener.net.RecentReceipt
import app.lytro.listener.sms.shownMessageOf
import app.lytro.listener.sms.testModeLeftMs
import app.lytro.listener.ui.theme.Inter
import app.lytro.listener.ui.theme.Line
import app.lytro.listener.ui.theme.Muted
import app.lytro.listener.ui.theme.Surface
import app.lytro.listener.ui.theme.White
import kotlinx.coroutines.delay

private const val REFRESH_MS = 30_000L

/** 3.1: the status, today's counts and the recent receipts, by what the band says. */
@Composable
fun ColumnScope.HomeScreen(model: AppViewModel) {
    val facts by model.facts.collectAsStateWithLifecycle()
    val networkOnline by model.network.collectAsStateWithLifecycle()
    val owner = LocalLifecycleOwner.current
    val context = LocalContext.current
    LaunchedEffect(owner) {
        model.homeOpened()
        owner.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                model.refresh()
                delay(REFRESH_MS)
            }
        }
    }
    // LSN-04: its band counts down, by the second, and goes by itself when the time is up.
    var ticking by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(facts.testModeUntil) {
        while (testModeLeftMs(facts, ticking) > 0) {
            delay(1_000)
            ticking = System.currentTimeMillis()
        }
    }
    val testLeft = testModeLeftMs(facts, ticking)
    val band = homeBandOf(
        status = facts.status,
        smsAllowed = smsAllowed(context),
        online = networkOnline && model.reachable,
        hasAccount = facts.accounts.isNotEmpty(),
        testMode = testLeft > 0,
        // Read again whenever Home refreshes, which it does on coming back from Android's settings.
        batteryRisk = model.now > 0 && model.batteryRisk(),
    )
    val saved = model.saved
    val receipts = model.recent?.receipts.orEmpty()
    if (band == HomeBand.Inactive || band == HomeBand.UpdateRequired) {
        StoppedScreen(
            status = facts.status,
            held = model.queueSize,
            onCheckAgain = model::checkAgain,
            onPairAgain = model::pairAgain,
            onMenu = if (band == HomeBand.Inactive) model::openMenu else null,
        )
        return
    }
    AppBar(model::openMenu)
    when (band) {
        HomeBand.Working -> {
            val report = if (facts.lastReportAt > 0) stringResource(R.string.st_on_s_report, agoWords(agoOf(facts.lastReportAt, model.now))) else stringResource(R.string.st_on_s)
            StatusBand(BandKind.Ok, stringResource(R.string.st_on), report)
        }
        HomeBand.NoInternet -> StatusBand(
            BandKind.Warn,
            stringResource(R.string.st_net),
            if (saved.isEmpty()) stringResource(R.string.st_net_s_none) else pluralStringResource(R.plurals.st_net_s, saved.size, "${saved.size}"),
        )
        HomeBand.SmsOff -> StatusBand(BandKind.Dan, stringResource(R.string.st_perm), stringResource(R.string.st_perm_s))
        HomeBand.NoAccount -> StatusBand(BandKind.Warn, stringResource(R.string.st_acct), stringResource(R.string.st_acct_s))
        HomeBand.TestMode -> StatusBand(BandKind.Test, stringResource(R.string.st_test, countdownShown(testLeft)), stringResource(R.string.st_test_s))
        HomeBand.BatteryRisk -> StatusBand(BandKind.Warn, stringResource(R.string.st_bat), stringResource(R.string.st_bat_s))
        HomeBand.Inactive, HomeBand.UpdateRequired -> Unit
    }
    Body {
        when (band) {
            HomeBand.Working -> if (saved.isEmpty() && receipts.isEmpty()) {
                EmptyCard()
                facts.accounts.forEach { AccountCard(it) }
            } else {
                model.recent?.today?.let { Today(it.verified, it.waiting, it.toCheck) }
                Receipts(model, saved, receipts)
            }
            HomeBand.NoInternet -> Receipts(model, saved, receipts)
            HomeBand.SmsOff -> {
                Btn(stringResource(R.string.fix), model::fixSms)
                Para(stringResource(R.string.fix_perm_n))
                Receipts(model, saved, receipts)
            }
            HomeBand.NoAccount -> {
                Para(stringResource(R.string.acct_note))
                Receipts(model, saved, receipts)
            }
            HomeBand.TestMode -> Receipts(model, saved, receipts)
            HomeBand.BatteryRisk -> {
                Btn(stringResource(R.string.fix), model::fixBattery, kind = BtnKind.Warn)
                Para(stringResource(R.string.bat_note))
                model.recent?.today?.let { Today(it.verified, it.waiting, it.toCheck) }
                Receipts(model, saved, receipts)
            }
            HomeBand.Inactive, HomeBand.UpdateRequired -> Unit
        }
        if (band == HomeBand.Working) {
            Small(stringResource(R.string.only_b), Modifier.fillMaxWidth(), TextAlign.Center)
        }
    }
}

@Composable
fun agoWords(ago: Ago): String = when (ago) {
    Ago.JustNow -> stringResource(R.string.just_now)
    is Ago.Minutes -> pluralStringResource(R.plurals.minutes_ago, ago.count, "${ago.count}")
    is Ago.Hours -> pluralStringResource(R.plurals.hours_ago, ago.count, "${ago.count}")
    is Ago.Days -> pluralStringResource(R.plurals.days_ago, ago.count, "${ago.count}")
}

@Composable
private fun EmptyCard() {
    Card {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BigIcon(LytroIcons.Message)
            Txt(stringResource(R.string.empty_t), color = White, weight = FontWeight.W700, align = TextAlign.Center)
            Small(stringResource(R.string.empty_p), align = TextAlign.Center)
        }
    }
}

/** `.lbl` and `.stats`. */
@Composable
private fun ColumnScope.Today(verified: Int, waiting: Int, toCheck: Int) {
    Label(stringResource(R.string.today))
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Stat(verified, stringResource(R.string.today_v))
        Stat(waiting, stringResource(R.string.today_w))
        Stat(toCheck, stringResource(R.string.today_s))
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.Stat(count: Int, label: String) {
    val shape = RoundedCornerShape(10.dp)
    Column(
        Modifier.weight(1f).fillMaxHeight().clip(shape).background(Surface).border(1.dp, Line, shape)
            .padding(horizontal = 11.dp, vertical = 9.dp),
    ) {
        Txt("$count", size = 22f, line = 1.2f, weight = FontWeight.W700, color = White, font = Inter)
        Txt(label, size = 12.5f, line = 1.3f, color = Muted)
    }
}

@Composable
private fun Receipts(model: AppViewModel, saved: List<SavedMessage>, receipts: List<RecentReceipt>) {
    if (saved.isEmpty() && receipts.isEmpty()) return
    Card {
        Label(stringResource(R.string.recent))
        val waiting = stringResource(R.string.r_queued)
        saved.forEach { ReceiptItem(savedRow(it, model.now, waiting, LineKind.Plain, LytroIcons.Clock)) }
        receipts.forEach { ReceiptItem(recentRow(it, model.now)) }
    }
}

/** A message the server has not answered for yet: what the phone can tell of it, for showing only. */
fun savedRow(message: SavedMessage, now: Long, line: String, kind: LineKind, icon: ImageVector): ReceiptRow {
    val shown = shownMessageOf(message.text)
    return ReceiptRow(
        wallet = message.sender,
        amount = shown.amount?.let(::amountShown),
        time = timeShown(message.receivedAt, now),
        transactionId = shown.transactionId,
        line = line,
        kind = kind,
        icon = icon,
    )
}

@Composable
private fun recentRow(receipt: RecentReceipt, now: Long): ReceiptRow {
    val line = receiptLineOf(receipt.status, receipt.reviewReason, receipt.ignoredReason)
    return ReceiptRow(
        // A test receipt came from a sender off the list, which is what the owner is checking.
        wallet = if (line == ReceiptLine.Test) receipt.sender ?: walletName(receipt.method) else walletName(receipt.method),
        amount = receipt.amount?.let(::amountShown),
        time = millisOfIso(receipt.receivedAt)?.let { timeShown(it, now) }.orEmpty(),
        transactionId = receipt.transactionId,
        line = when (line) {
            ReceiptLine.Matched -> receipt.orderNumber?.let { stringResource(R.string.r_matched, it) } ?: stringResource(R.string.r_matched_no_order)
            ReceiptLine.NotMatched -> stringResource(R.string.r_wait)
            ReceiptLine.AmountOff -> stringResource(R.string.r_amount)
            ReceiptLine.ShortBalance -> stringResource(R.string.r_balance)
            ReceiptLine.Review -> stringResource(R.string.r_review)
            ReceiptLine.AlreadySent -> stringResource(R.string.r_dup)
            ReceiptLine.Test -> stringResource(R.string.r_test)
            ReceiptLine.Other -> stringResource(R.string.r_reached)
        },
        kind = line.kind,
        icon = when (line) {
            ReceiptLine.Matched, ReceiptLine.AlreadySent, ReceiptLine.Other -> LytroIcons.Check
            ReceiptLine.NotMatched -> LytroIcons.Clock
            ReceiptLine.AmountOff, ReceiptLine.Review -> LytroIcons.Alert
            ReceiptLine.ShortBalance -> LytroIcons.Wallet
            ReceiptLine.Test -> LytroIcons.Flask
        },
    )
}
