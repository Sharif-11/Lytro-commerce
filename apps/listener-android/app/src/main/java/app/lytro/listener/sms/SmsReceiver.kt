package app.lytro.listener.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import app.lytro.listener.graph
import kotlinx.coroutines.launch

/**
 * LISTENER-APP-DESIGN 6: an SMS as it arrives, even with the app closed. It is saved first and the background work told, all
 * within the broadcast, so a receipt survives this process being killed; then it is sent at once where that works, since a
 * shopper's page is waiting on it and background work can be held back.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val graph = context.graph
        // A long SMS arrives in parts, all in the one broadcast.
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val now = graph.clock()
        val messages = parts.filterNotNull()
            .groupBy { it.originatingAddress.orEmpty() }
            .map { (sender, pieces) -> IncomingSms(sender, pieces.joinToString("") { it.messageBody.orEmpty() }, now) }
        val pending = goAsync()
        graph.scope.launch {
            val saved = try {
                messages.map { graph.intake.take(it) }.any { it }.also { any ->
                    if (any) {
                        graph.background.uploadSoon()
                        graph.background.keepRunning()
                    }
                }
            } finally {
                pending.finish()
            }
            if (saved) graph.uploader.drain()
        }
    }
}
