package app.lytro.listener

import android.content.Context
import android.os.ParcelFileDescriptor
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.data.SetupStage
import app.lytro.listener.engine.isoOf
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.Socket
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.Assert.assertNotNull

const val SHOP_NUMBER = "01711000001"

val appContext: Context get() = ApplicationProvider.getApplicationContext()
val graph: AppGraph get() = appContext.graph

/** A word in the language the app is showing. */
fun word(id: Int, vararg args: Any): String = graph.settings.localized(appContext).getString(id, *args)

fun envelope(data: String, status: Int = 200) = MockResponse.Builder()
    .code(status)
    .body("""{"success":true,"statusCode":$status,"message":"ok","data":$data}""")
    .build()

fun refusal(status: Int, code: String, message: String = "the server's words", details: String = "{}", retryAfter: String? = null) =
    MockResponse.Builder().code(status).apply { retryAfter?.let { addHeader("Retry-After", it) } }
        .body("""{"success":false,"statusCode":$status,"message":"$message","errors":{"code":"$code","details":$details}}""")
        .build()

/** A server that behaves like Lytro's for what these tests need, keeping what each call sent. */
class FakeLytro {
    val uploads = CopyOnWriteArrayList<String>()
    val paths = CopyOnWriteArrayList<String>()
    var accounts = """[{"method":"bkash","number":"$SHOP_NUMBER"}]"""
    var receipts = "[]"
    var deviceName = "Counter phone"
    var pairAnswer: () -> MockResponse = {
        envelope(
            """{"deviceId":"d1","token":"device-token","deviceName":"Counter phone","shopName":"Megh Fashion","heartbeatMinutes":15,
            "accounts":$accounts,"senders":["bKash"],"testModeUntil":null}""",
            201,
        )
    }
    var everyDeviceCall: (() -> MockResponse)? = null

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.url.encodedPath.substringAfter("/v1/listener/")
                paths += "${request.method} $path"
                if (path == "pair") return pairAnswer()
                everyDeviceCall?.let { return it() }
                return when ("${request.method} $path") {
                    "POST heartbeat" -> envelope(
                        """{"status":"connected","heartbeatMinutes":15,"serverTime":"${isoOf(System.currentTimeMillis())}","deviceName":"$deviceName","shopName":"Megh Fashion",
                        "accounts":$accounts,"senders":["bKash"],"testModeUntil":null}""",
                    )
                    "POST messages" -> {
                        val body = request.body?.utf8().orEmpty()
                        uploads += body
                        val count = Regex(""""sender"""").findAll(body).count()
                        envelope(List(count) { """{"status":"unmatched"}""" }.joinToString(",", """{"results":[""", "]}"))
                    }
                    "GET messages" -> envelope(
                        """{"receipts":$receipts,"today":{"verified":5,"waiting":1,"toCheck":2}}""",
                    )
                    "POST unpair" -> envelope("""{"ok":true}""")
                    "POST test-mode" -> envelope("""{"testModeUntil":"${isoOf(System.currentTimeMillis() + 600_000)}"}""")
                    else -> refusal(404, "not_found")
                }
            }
        }
    }

    fun start() = server.start(TEST_SERVER_PORT)

    fun stop() = server.close()

    fun sawUpload(text: String) = uploads.any { text in it }
}

/** Android's own battery exemption, on or off, as an owner sets it. */
fun setBatteryExempt(exempt: Boolean) {
    val sign = if (exempt) "+" else "-"
    val output = InstrumentationRegistry.getInstrumentation().uiAutomation
        .executeShellCommand("dumpsys deviceidle whitelist $sign${appContext.packageName}")
    // Read to the end: on Android 7, closing this first breaks the pipe Android is writing to, and that crashes its system process.
    ParcelFileDescriptor.AutoCloseInputStream(output).use { it.readBytes() }
}

/** As if just installed: nothing paired, nothing saved. */
fun resetApp() = runBlocking {
    graph.settings.makerStepOpened = false
    graph.background.stop()
    graph.secrets.token = null
    graph.queue.clear()
    graph.phone.update { PhoneFacts() }
    graph.settings.stage = SetupStage.Pair
    graph.settings.chooseLanguage("bn")
}

/** Paired with the test's shop from this moment, its setup done. */
fun pairApp(accounts: Boolean = true) {
    graph.secrets.token = "device-token"
    graph.phone.update {
        PhoneFacts(
            shopName = "Megh Fashion",
            accounts = if (accounts) listOf(app.lytro.listener.net.Account("bkash", SHOP_NUMBER)) else emptyList(),
            senders = listOf("bKash"),
            pairedAt = System.currentTimeMillis() - 1_000,
        )
    }
    graph.settings.stage = SetupStage.Done
}

fun newTrxId(): String = UUID.randomUUID().toString().replace("-", "").take(10).uppercase()

fun receiptText(trx: String, amount: String = "500.00") =
    "You have received Tk $amount from 01811000002. Fee Tk 0.00. Balance Tk 700.00. TrxID $trx at 03/11/2026 14:44"

fun waitUntil(what: String, seconds: Int = 45, check: () -> Boolean) {
    val deadline = System.currentTimeMillis() + seconds * 1000
    while (System.currentTimeMillis() < deadline) {
        if (check()) return
        Thread.sleep(250)
    }
    assertNotNull("never happened in $seconds s: $what", null)
}

/**
 * The emulator's own console, reached from inside it, delivers a real SMS through the phone's radio, sender and all, so the
 * app meets exactly what it meets on a shop's phone. Its port is the first emulator's, and its token is the host's
 * `~/.emulator_console_auth_token`, passed in as the runner's `consoleToken` argument.
 */
object EmulatorConsole {
    private const val HOST = "10.0.2.2"
    private const val PORT = 5554

    fun sendSms(sender: String, text: String) {
        val token = requireNotNull(InstrumentationRegistry.getArguments().getString("consoleToken")) {
            "pass -Pandroid.testInstrumentationRunnerArguments.consoleToken=<the host's ~/.emulator_console_auth_token>"
        }
        Socket(HOST, PORT).use { socket ->
            val writer = PrintWriter(socket.getOutputStream(), true)
            val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
            fun answer(): String {
                var line = reader.readLine()
                while (line != null && line != "OK" && !line.startsWith("KO")) line = reader.readLine()
                return line.orEmpty()
            }
            check(answer() == "OK") { "the console did not greet" }
            writer.println("auth $token")
            check(answer() == "OK") { "the console refused the token" }
            writer.println("sms send $sender ${text.replace("\n", " ")}")
            check(answer() == "OK") { "the console refused the SMS" }
        }
    }
}
