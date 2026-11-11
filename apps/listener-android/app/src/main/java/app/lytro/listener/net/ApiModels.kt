package app.lytro.listener.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// The listener routes' answers (API-CONTRACT 15). Where each stands is kept as the server's word, so a word this app
// has not met yet shows as a plain receipt rather than failing the whole list.

@Serializable
data class Account(val method: String, val number: String)

@Serializable
data class PairRequest(
    val code: String,
    val installationId: String,
    val model: String? = null,
)

@Serializable
data class Paired(
    val deviceId: String,
    val token: String,
    val deviceName: String = "",
    val shopName: String,
    val heartbeatMinutes: Int,
    val accounts: List<Account> = emptyList(),
    val senders: List<String> = emptyList(),
    val testModeUntil: String? = null,
)

@Serializable
data class TestModeStarted(val testModeUntil: String)

@Serializable
data class Connected(
    val status: String,
    val heartbeatMinutes: Int,
    val serverTime: String,
    val deviceName: String = "",
    val shopName: String = "",
    val accounts: List<Account> = emptyList(),
    val senders: List<String> = emptyList(),
    val testModeUntil: String? = null,
)

@Serializable
data class UploadMessage(val sender: String, val text: String, val receivedAt: String)

@Serializable
data class UploadRequest(val messages: List<UploadMessage>)

@Serializable
data class UploadResult(
    val status: String? = null,
    val transactionId: String? = null,
    val reviewReason: String? = null,
    val ignoredReason: String? = null,
)

@Serializable
data class Uploaded(val results: List<UploadResult>, val testModeUntil: String? = null)

@Serializable
data class RecentReceipt(
    val id: String,
    val sender: String? = null,
    val method: String? = null,
    val amount: String? = null,
    val transactionId: String? = null,
    val status: String,
    val reviewReason: String? = null,
    val ignoredReason: String? = null,
    val orderNumber: String? = null,
    val receivedAt: String,
)

@Serializable
data class TodayCounts(val verified: Int = 0, val waiting: Int = 0, val toCheck: Int = 0)

@Serializable
data class Recent(val receipts: List<RecentReceipt>, val today: TodayCounts)

/** D8-74 (Slice 8.8): Lytro's help line as the server keeps it; the app uses its WhatsApp. A number not set is null. */
@Serializable
data class HelpLine(val whatsapp: String? = null)

@Serializable
internal data class Envelope<T>(val data: T)

@Serializable
internal data class RefusalBody(val message: String = "", val errors: RefusalErrors? = null)

@Serializable
internal data class RefusalErrors(val code: String = "", val details: JsonObject? = null)

/** A call's end: its answer, the server's refusal, or no way of reaching the server. */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>

    /** `code` is null when the answer was not the server's own envelope (a proxy, a broken reply): never act on it. */
    data class Refused(
        val status: Int,
        val code: String?,
        val message: String,
        val details: JsonObject?,
        val retryAfterSeconds: Long?,
    ) : ApiResult<Nothing>

    data object NoConnection : ApiResult<Nothing>
}
