package app.lytro.listener.engine

import app.lytro.listener.data.DeviceSecrets
import app.lytro.listener.data.PhoneFactsStore
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.data.ReceiptQueue
import app.lytro.listener.net.ApiResult
import app.lytro.listener.net.ListenerApi
import app.lytro.listener.sms.IncomingSms
import app.lytro.listener.sms.SmsIntake

/** LSN-03: the report's rhythm. The server takes [4] an hour, so a second trigger cannot make it report more often. */
const val HEARTBEAT_MINUTES = 15
private const val HEARTBEAT_GAP_MS = (HEARTBEAT_MINUTES - 1) * 60_000L

/** LISTENER-APP-DESIGN 6: whatever reads the inbox for the look-back: the allowed senders' messages since a moment. */
fun interface InboxLookBack {
    /** Empty when the app may not read SMS. */
    suspend fun since(millis: Long, senders: List<String>): List<IncomingSms>
}

/**
 * LSN-03, agreed 2026-11-03: on boot and at each report. The phone says it is alive and hears its shop's facts, reads the
 * inbox for receipts it missed while killed (no further back than [7] days or its pairing, so a re-paired phone never sends
 * one shop's receipts to the next), then sends what is saved.
 */
class PhoneReporter(
    private val api: ListenerApi,
    private val secrets: DeviceSecrets,
    private val phone: PhoneFactsStore,
    private val queue: ReceiptQueue,
    private val guard: PhoneGuard,
    private val inbox: InboxLookBack,
    private val intake: SmsIntake,
    private val uploader: ReceiptUploader,
    private val clock: () -> Long,
) {
    suspend fun report(): Drain {
        if (secrets.token == null) return Drain.Done
        val now = clock()
        val sinceLast = now - phone.facts.value.lastHeartbeatAt
        // A clock set back must not silence the phone until it catches up.
        if (sinceLast < 0 || sinceLast >= HEARTBEAT_GAP_MS) {
            when (val answer = api.heartbeat()) {
                is ApiResult.Ok -> phone.update {
                    it.copy(
                        deviceName = answer.value.deviceName.ifEmpty { it.deviceName },
                        shopName = answer.value.shopName.ifEmpty { it.shopName },
                        accounts = answer.value.accounts,
                        senders = answer.value.senders,
                        testModeUntil = answer.value.testModeUntil,
                        lastHeartbeatAt = now,
                        lastReportAt = now,
                        clockOffsetMs = (millisOfIso(answer.value.serverTime) ?: now) - now,
                        status = PhoneStatus.Connected,
                    )
                }
                is ApiResult.Refused -> if (guard.settle(answer) == Settled.Stopped) return Drain.Waiting
                ApiResult.NoConnection -> Unit
            }
        }
        lookBack(now)
        queue.forgetSentBefore(now - (KEPT_DAYS + 1) * DAY_MS)
        return uploader.drain()
    }

    private suspend fun lookBack(now: Long) {
        val facts = phone.facts.value
        val floor = maxOf(now - KEPT_DAYS * DAY_MS, facts.pairedAt)
        for (sms in inbox.since(floor, facts.senders)) intake.take(sms)
    }
}
