package app.lytro.listener.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import app.lytro.listener.BuildConfig

/** Agreed 2026-11-03: the same WhatsApp as the dashboard's Help, set when a release is built; without one the rows hide. */
val hasSupport: Boolean get() = BuildConfig.SUPPORT_WHATSAPP.isNotEmpty()

fun openSupport(context: Context) = openPage(context, "https://wa.me/${BuildConfig.SUPPORT_WHATSAPP}")

/** LSN-18: an update is the same download as the first install (LISTENER-APP-DESIGN 6). */
fun openDownload(context: Context) = openPage(context, BuildConfig.DOWNLOAD_URL)

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
