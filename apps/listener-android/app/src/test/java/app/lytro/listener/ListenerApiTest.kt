package app.lytro.listener

import app.lytro.listener.net.ApiResult
import app.lytro.listener.net.PairRequest
import app.lytro.listener.net.UploadMessage
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ListenerApiTest {
    private lateinit var server: MockWebServer

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() = server.close()

    @Test
    fun `pairing names the app's version and language, and no token yet`() = runTest {
        server.enqueue(
            okEnvelope(
                """{"deviceId":"d1","token":"t1","shopName":"Megh Fashion","heartbeatMinutes":15,
                "accounts":[{"method":"bkash","number":"01711000001"}],"senders":["bKash"],"testModeUntil":null}""",
            ),
        )

        val answer = apiFor(server).pair(PairRequest("K7MP4X2H", "install-0001", "Redmi 12"))

        val paired = (answer as ApiResult.Ok).value
        assertEquals("Megh Fashion", paired.shopName)
        assertEquals("01711000001", paired.accounts.single().number)
        val request = server.takeRequest()
        assertEquals("/v1/listener/pair", request.url.encodedPath)
        assertEquals("1.0.0", request.headers["x-app-version"])
        assertEquals("bn", request.headers["Accept-Language"])
        assertNull(request.headers["Authorization"])
    }

    @Test
    fun `the help line is read with no token, and a number not set is null`() = runTest {
        server.enqueue(okEnvelope("""{"whatsapp":"01711000009","phone":null,"opensHour":9,"closesHour":22}"""))
        server.enqueue(okEnvelope("""{"whatsapp":null,"phone":"01711000010","opensHour":9,"closesHour":22}"""))

        val set = apiFor(server).helpLine() as ApiResult.Ok
        val unset = apiFor(server).helpLine() as ApiResult.Ok

        assertEquals("01711000009", set.value.whatsapp)
        assertNull(unset.value.whatsapp)
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/v1/listener/help-line", request.url.encodedPath)
        assertNull(request.headers["Authorization"])
        assertNull(request.headers["x-installation-id"])
    }

    @Test
    fun `a call after pairing names the token and the installation`() = runTest {
        server.enqueue(
            okEnvelope("""{"status":"connected","heartbeatMinutes":15,"serverTime":"2026-11-03T08:00:00.000Z"}"""),
        )

        apiFor(server).heartbeat()

        val request = server.takeRequest()
        assertEquals("Bearer the-token", request.headers["Authorization"])
        assertEquals("install-0001", request.headers["x-installation-id"])
    }

    @Test
    fun `test mode starts from the phone, with its token, and says when it ends`() = runTest {
        server.enqueue(okEnvelope("""{"testModeUntil":"2026-11-03T08:10:00.000Z"}"""))

        val started = apiFor(server).startTestMode() as ApiResult.Ok

        assertEquals("2026-11-03T08:10:00.000Z", started.value.testModeUntil)
        val request = server.takeRequest()
        assertEquals("/v1/listener/test-mode", request.url.encodedPath)
        assertEquals("Bearer the-token", request.headers["Authorization"])
    }

    @Test
    fun `a new field and a word this app has not met pass through`() = runTest {
        server.enqueue(
            okEnvelope(
                """{"receipts":[{"id":"r1","status":"a_new_state","receivedAt":"2026-11-03T08:00:00.000Z","extra":1}],
                "today":{"verified":1,"waiting":2,"toCheck":3}}""",
            ),
        )

        val recent = (apiFor(server).recent(20) as ApiResult.Ok).value

        assertEquals("a_new_state", recent.receipts.single().status)
        assertEquals(3, recent.today.toCheck)
        assertEquals("limit=20", server.takeRequest().url.encodedQuery)
    }

    @Test
    fun `a refusal gives the server's code, words and details, and when to retry`() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .code(429)
                .addHeader("Retry-After", "720")
                .body("""{"success":false,"statusCode":429,"message":"Too many","errors":{"code":"rate_limited","details":{"a":1}}}""")
                .build(),
        )

        val refused = apiFor(server).pair(PairRequest("K7MP4X2H", "install-0001")) as ApiResult.Refused

        assertEquals(429, refused.status)
        assertEquals("rate_limited", refused.code)
        assertEquals("Too many", refused.message)
        assertEquals(720L, refused.retryAfterSeconds)
    }

    @Test
    fun `an answer that is not the server's envelope names no code`() = runTest {
        server.enqueue(MockResponse.Builder().code(401).body("<html>a proxy</html>").build())

        val refused = apiFor(server).heartbeat() as ApiResult.Refused

        assertEquals(401, refused.status)
        assertNull(refused.code)
    }

    @Test
    fun `a broken answer to a good status is a refusal, not a crash`() = runTest {
        server.enqueue(MockResponse.Builder().code(200).body("not json").build())

        assertNull((apiFor(server).heartbeat() as ApiResult.Refused).code)
    }

    @Test
    fun `no server is no connection`() = runTest {
        val api = apiFor(server)
        server.close()

        assertEquals(ApiResult.NoConnection, api.upload(listOf(UploadMessage("bKash", "x", "2026-11-03T08:00:00.000Z"))))
    }

    @Test
    fun `an upload's body is what the server's schema reads`() = runTest {
        server.enqueue(okEnvelope("""{"results":[{"status":"matched"}],"testModeUntil":null}"""))

        apiFor(server).upload(listOf(UploadMessage("bKash", "TrxID A", "2026-11-03T08:00:00.000Z")))

        val body = server.takeRequest().body?.utf8().orEmpty()
        assertTrue(body, body == """{"messages":[{"sender":"bKash","text":"TrxID A","receivedAt":"2026-11-03T08:00:00.000Z"}]}""")
    }
}
