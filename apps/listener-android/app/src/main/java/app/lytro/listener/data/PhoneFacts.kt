package app.lytro.listener.data

import app.lytro.listener.net.Account
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** LSN-24: where the phone stands, by the server's last answer. */
@Serializable
sealed interface PhoneStatus {
    @Serializable
    @SerialName("connected")
    data object Connected : PhoneStatus

    /** The shop may not listen now: receipts stay saved, and it tries again at each report (LSN-07). */
    @Serializable
    @SerialName("inactive")
    data object Inactive : PhoneStatus

    /** Older than the server's minimum: receipts stay saved until the app is updated (LSN-18). */
    @Serializable
    @SerialName("update")
    data class UpdateRequired(val minimum: String) : PhoneStatus

    /** The phone's place is gone: the token is cleared and nothing runs (LSN-19). `reason` is the server's, if any. */
    @Serializable
    @SerialName("revoked")
    data class Revoked(val reason: String?) : PhoneStatus

    @Serializable
    @SerialName("blocked")
    data object Blocked : PhoneStatus
}

/** What the server last said of this phone and its shop, kept for the screens and for the filter. */
@Serializable
data class PhoneFacts(
    val shopName: String = "",
    val accounts: List<Account> = emptyList(),
    val senders: List<String> = emptyList(),
    /** LSN-04: when test mode ends, by the server's clock. */
    val testModeUntil: String? = null,
    /** By this phone's own clock, as the inbox's dates are: the look-back reaches no further (agreed 2026-11-03). */
    val pairedAt: Long = 0,
    val lastReportAt: Long = 0,
    val lastHeartbeatAt: Long = 0,
    /** Server time less this phone's, so a wrong clock cannot make a receipt look like it comes from the future. */
    val clockOffsetMs: Long = 0,
    val status: PhoneStatus = PhoneStatus.Connected,
)

interface PhoneFactsStore {
    val facts: StateFlow<PhoneFacts>

    fun update(change: (PhoneFacts) -> PhoneFacts)
}

/** LSN-11, LSN-12: the device's token, and the installation it is bound to. */
interface DeviceSecrets {
    val installationId: String
    var token: String?
}
