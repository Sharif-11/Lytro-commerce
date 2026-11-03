package app.lytro.listener

import app.lytro.listener.data.DeviceSecrets
import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.data.PhoneFactsStore
import app.lytro.listener.data.ReceiptQueue
import app.lytro.listener.data.SavedMessage
import app.lytro.listener.net.DeviceCredentials
import app.lytro.listener.net.ListenerApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient

class FakeSecrets(override var token: String? = "the-token") : DeviceSecrets {
    override val installationId = "install-0001"
}

class FakeFacts(start: PhoneFacts = PhoneFacts(senders = listOf("bKash"))) : PhoneFactsStore {
    private val state = MutableStateFlow(start)
    override val facts: StateFlow<PhoneFacts> = state

    override fun update(change: (PhoneFacts) -> PhoneFacts) {
        state.value = change(state.value)
    }
}

class FakeQueue : ReceiptQueue {
    val saved = mutableListOf<SavedMessage>()
    val sent = mutableSetOf<String>()
    private val count = MutableStateFlow(0)
    override val size: StateFlow<Int> = count

    override suspend fun add(message: SavedMessage): Boolean {
        if (message.fingerprint in sent || saved.any { it.fingerprint == message.fingerprint }) return false
        saved += message
        count.value = saved.size
        return true
    }

    override suspend fun oldest(limit: Int) = saved.sortedBy { it.receivedAt }.take(limit)

    override suspend fun newest(limit: Int) = saved.sortedByDescending { it.receivedAt }.take(limit)

    override suspend fun markSent(messages: List<SavedMessage>) {
        val done = messages.map { it.fingerprint }
        saved.removeAll { it.fingerprint in done }
        sent += done
        count.value = saved.size
    }

    override suspend fun dropOlderThan(cutoff: Long) {
        saved.removeAll { it.receivedAt < cutoff }
        count.value = saved.size
    }

    override suspend fun forgetSentBefore(cutoff: Long) = Unit

    override suspend fun clear() {
        saved.clear()
        sent.clear()
        count.value = 0
    }
}

fun apiFor(server: MockWebServer, secrets: DeviceSecrets = FakeSecrets(), language: String = "bn") = ListenerApi(
    client = OkHttpClient(),
    baseUrl = server.url("/v1/listener/").toString(),
    hostHeader = "",
    appVersion = "1.0.0",
    language = { language },
    credentials = { secrets.token?.let { DeviceCredentials(it, secrets.installationId) } },
)

fun okEnvelope(data: String) = MockResponse.Builder()
    .code(200)
    .body("""{"success":true,"statusCode":200,"message":"ok","data":$data}""")
    .build()

fun refusal(status: Int, code: String, details: String = "{}", message: String = "the server's words") = MockResponse.Builder()
    .code(status)
    .body("""{"success":false,"statusCode":$status,"message":"$message","errors":{"code":"$code","details":$details}}""")
    .build()
