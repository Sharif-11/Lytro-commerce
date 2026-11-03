package app.lytro.listener.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import app.lytro.listener.MainActivity
import app.lytro.listener.R
import app.lytro.listener.data.PhoneFactsStore
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.data.ReceiptQueue
import app.lytro.listener.data.Settings

const val STATUS_NOTIFICATION_ID = 1
private const val PROBLEM_NOTIFICATION_ID = 2
private const val CHANNEL_STATUS = "status"
private const val CHANNEL_PROBLEM = "problem"

/** LISTENER-APP-DESIGN 5: the silent always-on notification, whose words follow Home's band, and a problem's, once. */
class Notifications(
    private val context: Context,
    private val settings: Settings,
    private val phone: PhoneFactsStore,
    private val queue: ReceiptQueue,
    private val network: NetworkWatch,
) {
    private val manager = context.getSystemService(NotificationManager::class.java)

    init {
        // Channels came with Android 8; before it the builders' own settings below apply.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val words = settings.localized(context)
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_STATUS,
                    words.getString(R.string.channel_status),
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { setShowBadge(false) },
            )
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_PROBLEM,
                    words.getString(R.string.channel_problem),
                    NotificationManager.IMPORTANCE_HIGH,
                ),
            )
        }
    }

    fun statusNotification(): Notification = NotificationCompat.Builder(context, CHANNEL_STATUS)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(context.getString(R.string.app_name))
        .setContentText(statusWords())
        .setContentIntent(openApp())
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()

    fun refreshStatus() {
        manager.notify(STATUS_NOTIFICATION_ID, statusNotification())
    }

    /** Agreed in the sketch: once per problem, not repeated, until it is fixed and comes back. */
    fun checkSmsPermission() {
        val off = context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED
        if (!off) {
            settings.smsProblemTold = false
            manager.cancel(PROBLEM_NOTIFICATION_ID)
            return
        }
        if (settings.smsProblemTold) return
        settings.smsProblemTold = true
        manager.notify(
            PROBLEM_NOTIFICATION_ID,
            NotificationCompat.Builder(context, CHANNEL_PROBLEM)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(context.getString(R.string.app_name))
                .setContentText(settings.localized(context).getString(R.string.n_perm))
                .setContentIntent(openApp())
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_SOUND)
                .build(),
        )
    }

    private fun statusWords(): String {
        val words = settings.localized(context).resources
        val saved = queue.size.value
        return when {
            phone.facts.value.status is PhoneStatus.Inactive -> words.getString(R.string.n_inact)
            phone.facts.value.status is PhoneStatus.UpdateRequired -> words.getString(R.string.n_upd)
            !network.online.value && saved > 0 -> words.getQuantityString(R.plurals.n_net, saved, saved)
            !network.online.value -> words.getString(R.string.n_net_none)
            else -> words.getString(R.string.n_on)
        }
    }

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
