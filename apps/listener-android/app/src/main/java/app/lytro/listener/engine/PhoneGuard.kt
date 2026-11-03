package app.lytro.listener.engine

import app.lytro.listener.data.DeviceSecrets
import app.lytro.listener.data.PhoneFactsStore
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.data.ReceiptQueue
import app.lytro.listener.net.ApiResult
import kotlinx.serialization.json.JsonPrimitive

private const val REASON_BLOCKED = "installation_blocked"

/** LSN-18: the oldest version the server still takes, which its refusal names. */
fun minimumVersionIn(refused: ApiResult.Refused): String =
    (refused.details?.get("minimum") as? JsonPrimitive)?.content.orEmpty()

/** What a refusal means for the background work. */
enum class Settled {
    /** The phone's place is gone: nothing runs any more. */
    Stopped,

    /** The phone must wait, holding its receipts; the next report tries again. */
    Held,

    /** Nothing about the phone: try again later. */
    Passing,
}

/**
 * LSN-07, LSN-18, LSN-19, LSN-24, LISTENER-APP-DESIGN 3.3: what each refusal does to the phone, whichever call met it,
 * so a change shows on the next call. Only the server's own envelope counts, so a proxy's 401 cannot unpair a phone.
 */
class PhoneGuard(
    private val secrets: DeviceSecrets,
    private val phone: PhoneFactsStore,
    private val queue: ReceiptQueue,
    private val stopBackground: () -> Unit,
) {
    suspend fun settle(refused: ApiResult.Refused): Settled = when (refused.code) {
        "unauthenticated" -> {
            val reason = (refused.details?.get("reason") as? JsonPrimitive)?.takeIf { it.isString }?.content
            stop(
                when {
                    reason == REASON_BLOCKED -> PhoneStatus.Blocked
                    reason == null -> PhoneStatus.Revoked(null, refused.message)
                    else -> PhoneStatus.Revoked(reason)
                },
            )
        }
        "forbidden" -> stop(PhoneStatus.Blocked)
        "tenant_offline" -> hold(PhoneStatus.Inactive)
        "app_update_required" -> hold(PhoneStatus.UpdateRequired(minimumVersionIn(refused)))
        else -> Settled.Passing
    }

    /** Ends this phone's pairing: the token and every saved message go, so nothing can reach a shop it left. */
    suspend fun forget(status: PhoneStatus) {
        stopBackground()
        secrets.token = null
        queue.clear()
        phone.update { it.copy(status = status, pairedAt = 0, accounts = emptyList(), senders = emptyList()) }
    }

    private suspend fun stop(status: PhoneStatus): Settled {
        forget(status)
        return Settled.Stopped
    }

    private fun hold(status: PhoneStatus): Settled {
        phone.update { it.copy(status = status) }
        return Settled.Held
    }
}
