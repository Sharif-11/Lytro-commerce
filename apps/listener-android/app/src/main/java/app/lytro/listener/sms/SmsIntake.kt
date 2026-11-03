package app.lytro.listener.sms

import app.lytro.listener.data.DeviceSecrets
import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.data.PhoneFactsStore
import app.lytro.listener.data.ReceiptQueue
import app.lytro.listener.data.SavedMessage
import app.lytro.listener.engine.millisOfIso

/** An SMS as this app meets it, from the broadcast or the inbox. */
data class IncomingSms(val sender: String, val text: String, val receivedAt: Long)

/** LSN-04: how long test mode has left, by the server's clock so a wrong phone clock can't stretch it. Zero when it is off. */
fun testModeLeftMs(facts: PhoneFacts, now: Long): Long {
    val until = facts.testModeUntil?.let(::millisOfIso) ?: return 0
    return (until - (now + facts.clockOffsetMs)).coerceAtLeast(0)
}

/**
 * LSN-16, LISTENER-APP-DESIGN 6: the one door out of the phone. Whatever reads an SMS brings it here, and only what the
 * filter lets through is saved. A phone that is not paired keeps everything.
 */
class SmsIntake(
    private val secrets: DeviceSecrets,
    private val phone: PhoneFactsStore,
    private val queue: ReceiptQueue,
    private val clock: () -> Long,
) {
    /** True when this is new and is now waiting to be sent. */
    suspend fun take(sms: IncomingSms): Boolean {
        if (secrets.token == null) return false
        val facts = phone.facts.value
        if (!mayLeavePhone(sms.sender, sms.text, facts.senders, testModeLeftMs(facts, clock()) > 0)) return false
        return queue.add(
            SavedMessage(fingerprintOf(sms.sender, sms.text), sms.sender, sms.text, sms.receivedAt),
        )
    }
}
