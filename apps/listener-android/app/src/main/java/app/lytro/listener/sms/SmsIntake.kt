package app.lytro.listener.sms

import app.lytro.listener.data.DeviceSecrets
import app.lytro.listener.data.PhoneFactsStore
import app.lytro.listener.data.ReceiptQueue
import app.lytro.listener.data.SavedMessage

/** An SMS as this app meets it, from the broadcast or the inbox. */
data class IncomingSms(val sender: String, val text: String, val receivedAt: Long)

/**
 * LSN-16, LISTENER-APP-DESIGN 6: the one door out of the phone. Whatever reads an SMS brings it here, and only what the
 * filter lets through is saved. A phone that is not paired keeps everything.
 */
class SmsIntake(
    private val secrets: DeviceSecrets,
    private val phone: PhoneFactsStore,
    private val queue: ReceiptQueue,
) {
    /** True when this is new and is now waiting to be sent. */
    suspend fun take(sms: IncomingSms): Boolean {
        if (secrets.token == null) return false
        if (!mayLeavePhone(sms.sender, sms.text, phone.facts.value.senders)) return false
        return queue.add(
            SavedMessage(fingerprintOf(sms.sender, sms.text), sms.sender, sms.text, sms.receivedAt),
        )
    }
}
