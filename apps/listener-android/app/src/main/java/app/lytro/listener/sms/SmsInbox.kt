package app.lytro.listener.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import app.lytro.listener.engine.InboxLookBack
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Agreed 2026-11-03: the inbox's look-back, asking the phone only for the allowed senders' messages, so nobody else's
 * SMS is even read into this app. The filter still decides what may leave.
 */
class SmsInbox(private val context: Context) : InboxLookBack {
    override suspend fun since(millis: Long, senders: List<String>): List<IncomingSms> {
        if (senders.isEmpty() || !allowed()) return emptyList()
        return withContext(Dispatchers.IO) {
            val who = senders.joinToString(" OR ") { "${Telephony.Sms.ADDRESS} = ? COLLATE NOCASE" }
            context.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
                "${Telephony.Sms.DATE} >= ? AND ($who)",
                arrayOf(millis.toString()) + senders,
                "${Telephony.Sms.DATE} ASC",
            )?.use { cursor ->
                buildList {
                    while (cursor.moveToNext()) {
                        val sender = cursor.getString(0) ?: continue
                        val text = cursor.getString(1) ?: continue
                        add(IncomingSms(sender, text, cursor.getLong(2)))
                    }
                }
            }.orEmpty()
        }
    }

    private fun allowed(): Boolean =
        context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
}
