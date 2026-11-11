package app.lytro.listener.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import app.lytro.listener.BuildConfig

/**
 * D8-74 (Slice 8.8): the same WhatsApp as the dashboard's Help, Lytro's help line, read from the server when the app opens.
 * The number set when the release was built stands in until then, and whenever the server can't be reached or has none.
 * Empty when there is neither, and the support rows hide.
 */
fun supportNumber(fromServer: String?, builtIn: String = BuildConfig.SUPPORT_WHATSAPP): String =
    whatsappDigits(fromServer).ifEmpty { builtIn }

/** The help line keeps a Bangladeshi number in its local form (01XXXXXXXXX); WhatsApp's link wants the country's 88 too. */
fun whatsappDigits(number: String?): String {
    val digits = number.orEmpty().filter { it.isDigit() }
    return if (digits.length == 11 && digits.startsWith("01")) "88$digits" else digits
}

fun openSupport(context: Context, number: String) = openPage(context, "https://wa.me/$number")

/** LSN-18: an update is the same download as the first install (LISTENER-APP-DESIGN 6). */
fun openDownload(context: Context) = openPage(context, BuildConfig.DOWNLOAD_URL)

/** The download page's setup guide, which also says how to reach support (SITE-PAGES-DESIGN 6). */
fun openGuide(context: Context) = openPage(context, "${BuildConfig.DOWNLOAD_URL}#setup")

private fun openPage(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: ActivityNotFoundException) {
        // A phone with nothing to open a link: nothing here can help it.
    }
}

fun batteryExempt(context: Context): Boolean =
    context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)

/** 2.6: Android's own exemption dialog. */
fun batteryExemptionIntent(context: Context) =
    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
