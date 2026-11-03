package app.lytro.listener.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

val SMS_PERMISSIONS = arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)

fun smsAllowed(context: Context): Boolean = SMS_PERMISSIONS.all {
    context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
}

/** Why the SMS permission was refused, as far as an app can tell: Android won't let it read the restricted setting itself. */
fun smsRefusal(activity: Activity): SmsRefusal = smsRefusalOf(
    granted = smsAllowed(activity),
    canAskAgain = activity.shouldShowRequestPermissionRationale(Manifest.permission.RECEIVE_SMS),
    sdk = Build.VERSION.SDK_INT,
    packageSource = packageSource(activity),
)

private fun packageSource(context: Context): Int? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
    return try {
        context.packageManager.getInstallSourceInfo(context.packageName).packageSource
    } catch (_: PackageManager.NameNotFoundException) {
        null
    }
}

/** App info: where its permissions are, and on Android 15 and later the menu that frees them (2.4). */
fun openAppInfo(context: Context) {
    context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")),
    )
}
