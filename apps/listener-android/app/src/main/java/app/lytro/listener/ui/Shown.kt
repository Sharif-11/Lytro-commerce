package app.lytro.listener.ui

import app.lytro.listener.data.PhoneStatus
import java.math.BigDecimal
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/** The band on Home (LISTENER-APP-DESIGN 3.1): the first of these that holds. */
enum class HomeBand { Inactive, UpdateRequired, SmsOff, NoInternet, TestMode, BatteryRisk, NoAccount, Working }

fun homeBandOf(
    status: PhoneStatus,
    smsAllowed: Boolean,
    online: Boolean,
    hasAccount: Boolean,
    testMode: Boolean = false,
    batteryRisk: Boolean = false,
): HomeBand = when {
    status is PhoneStatus.Inactive -> HomeBand.Inactive
    status is PhoneStatus.UpdateRequired -> HomeBand.UpdateRequired
    !smsAllowed -> HomeBand.SmsOff
    !online -> HomeBand.NoInternet
    testMode -> HomeBand.TestMode
    batteryRisk -> HomeBand.BatteryRisk
    !hasAccount -> HomeBand.NoAccount
    else -> HomeBand.Working
}

/** LISTENER-APP-DESIGN 2.6: the makers with a step of their own. Oppo, Vivo and Samsung's are drawn but unverified on real phones. */
enum class PhoneMaker(val label: String) { Xiaomi("Xiaomi"), Oppo("Oppo"), Vivo("Vivo"), Samsung("Samsung") }

/** From `Build.MANUFACTURER` and `Build.BRAND`, which name these in several ways. Any other phone has only Android's own dialog. */
fun phoneMakerOf(manufacturer: String, brand: String): PhoneMaker? {
    val names = listOf(manufacturer.lowercase(), brand.lowercase())
    return when {
        names.any { it in setOf("xiaomi", "redmi", "poco") } -> PhoneMaker.Xiaomi
        names.any { it in setOf("oppo", "realme") } -> PhoneMaker.Oppo
        names.any { it in setOf("vivo", "iqoo") } -> PhoneMaker.Vivo
        names.any { it == "samsung" } -> PhoneMaker.Samsung
        else -> null
    }
}

/**
 * Agreed 2026-11-03: no app can read a maker's Autostart switch. So a phone with a maker's step stays at risk until the owner has
 * opened that setting from our button, as well as Android's own exemption being on: it can't prove the switch was flipped, but
 * nobody skips the step by accident.
 */
fun batteryAtRisk(exempt: Boolean, maker: PhoneMaker?, makerStepOpened: Boolean): Boolean =
    !exempt || (maker != null && !makerStepOpened)

/** Test mode's time left, `8:42`, counting up to the next whole second so it never reads 0:00 while it is still on. */
fun countdownShown(leftMs: Long): String {
    val seconds = (leftMs + 999) / 1000
    return "%d:%02d".format(Locale.US, seconds / 60, seconds % 60)
}

/** `.r.good`, `.r.wait` and `.r.plain`. */
enum class LineKind { Good, Wait, Plain }

/** What a receipt's line says (3.2), by where the server says it stands. */
enum class ReceiptLine(val kind: LineKind) {
    Matched(LineKind.Good),
    NotMatched(LineKind.Wait),
    AmountOff(LineKind.Wait),
    ShortBalance(LineKind.Wait),
    Review(LineKind.Wait),
    AlreadySent(LineKind.Plain),
    Test(LineKind.Plain),
    Other(LineKind.Plain),
}

fun receiptLineOf(status: String, reviewReason: String?, ignoredReason: String?): ReceiptLine = when (status) {
    "matched" -> ReceiptLine.Matched
    "unmatched" -> ReceiptLine.NotMatched
    "needs_review" -> when (reviewReason) {
        "amount" -> ReceiptLine.AmountOff
        "low_balance" -> ReceiptLine.ShortBalance
        else -> ReceiptLine.Review
    }
    "duplicate" -> ReceiptLine.AlreadySent
    "ignored" -> if (ignoredReason == "test_mode") ReceiptLine.Test else ReceiptLine.Other
    else -> ReceiptLine.Other
}

private val WALLETS = mapOf("bkash" to "bKash", "nagad" to "Nagad", "rocket" to "Rocket", "upay" to "Upay")

fun walletName(method: String?): String = WALLETS[method] ?: method.orEmpty()

/** `01711000001` as the prototype writes it: `01711-000001`. */
fun phoneNumberShown(number: String): String =
    if (number.length == 11) "${number.take(5)}-${number.drop(5)}" else number

/** The server's `3490.00`, or a saved receipt's `1,500.50`, as `3,490` and `1,500.50`; digits stay Western in both languages. */
fun amountShown(amount: String): String {
    val value = amount.replace(",", "").toBigDecimalOrNull() ?: return amount
    val pattern = if (value.stripTrailingZeros().scale() <= 0) "#,##0" else "#,##0.00"
    return DecimalFormat(pattern, DecimalFormatSymbols(Locale.US)).format(BigDecimal(value.toPlainString()))
}

/** `2:41 PM`, with the day in front when it is not today: the list runs back past today, which the prototype's does not show. */
fun timeShown(millis: Long, now: Long, zone: TimeZone = TimeZone.getDefault()): String {
    val at = Calendar.getInstance(zone).apply { timeInMillis = millis }
    val today = Calendar.getInstance(zone).apply { timeInMillis = now }
    val sameDay = at.get(Calendar.YEAR) == today.get(Calendar.YEAR) && at.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)
    val pattern = if (sameDay) "h:mm a" else "d MMM, h:mm a"
    return SimpleDateFormat(pattern, Locale.US).apply { timeZone = zone }.format(millis)
}

/** How long ago the last report was, in the units the band says it. */
sealed interface Ago {
    data object JustNow : Ago
    data class Minutes(val count: Int) : Ago
    data class Hours(val count: Int) : Ago
    data class Days(val count: Int) : Ago
}

fun agoOf(millis: Long, now: Long): Ago {
    val minutes = ((now - millis).coerceAtLeast(0) / 60_000).toInt()
    return when {
        minutes < 1 -> Ago.JustNow
        minutes < 60 -> Ago.Minutes(minutes)
        minutes < 24 * 60 -> Ago.Hours(minutes / 60)
        else -> Ago.Days(minutes / (24 * 60))
    }
}

/** How Android answered the SMS permission (2.4), which decides the screen after it. */
enum class SmsRefusal { None, ByPerson, ByAndroid }

// Android 15 added SMS to its restricted settings, for apps installed from a downloaded or local file: PackageInstaller's
// PACKAGE_SOURCE_LOCAL_FILE and PACKAGE_SOURCE_DOWNLOADED_FILE. There it answers "denied" without ever showing the dialog,
// until the person allows it from App info's menu (seen on Android 16, 2026-11-03).
private const val ANDROID_15 = 35
private const val SOURCE_LOCAL_FILE = 3
private const val SOURCE_DOWNLOADED_FILE = 4

fun smsRefusalOf(granted: Boolean, canAskAgain: Boolean, sdk: Int, packageSource: Int?): SmsRefusal = when {
    granted -> SmsRefusal.None
    !canAskAgain &&
        sdk >= ANDROID_15 &&
        (packageSource == SOURCE_LOCAL_FILE || packageSource == SOURCE_DOWNLOADED_FILE) -> SmsRefusal.ByAndroid
    else -> SmsRefusal.ByPerson
}
