package app.lytro.listener

import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.data.SavedMessage
import app.lytro.listener.engine.BATCH_MAX_BYTES
import app.lytro.listener.engine.DAY_MS
import app.lytro.listener.engine.Drain
import app.lytro.listener.engine.PhoneGuard
import app.lytro.listener.engine.ReceiptUploader
import app.lytro.listener.engine.isoOf
import app.lytro.listener.net.UploadRequest
import app.lytro.listener.net.apiJson
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

private const val NOW = 1_793_700_000_000L

class ReceiptUploaderTest {
    private lateinit var server: MockWebServer
    private val queue = FakeQueue()
    private val secrets = FakeSecrets()
    private val facts = FakeFacts(PhoneFacts(senders = listOf("bKash"), status = PhoneStatus.Connected))
    private var stopped = false

    private fun uploader() = ReceiptUploader(
        api = apiFor(server, secrets),
        queue = queue,
        phone = facts,
        guard = PhoneGuard(secrets, facts, queue) { stopped = true },
        clock = { NOW },
    )

    private fun saved(index: Int, text: String = "TrxID A$index") =
        SavedMessage("fp$index", "bKash", text, NOW - 1_000L * (100 - index))

    private fun results(count: Int) =
        List(count) { """{"status":"unmatched"}""" }.joinToString(",", """{"results":[""", """],"testModeUntil":null}""")

    private fun bodyOf(index: Int = 0): UploadRequest {
        var request = server.takeRequest()
        repeat(index) { request = server.takeRequest() }
        return apiJson.decodeFromString(UploadRequest.serializer(), request.body?.utf8().orEmpty())
    }

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() = server.close()

    @Test
    fun `an answered message goes from the queue and is remembered, its text gone`() = runTest {
        queue.add(saved(1))
        server.enqueue(okEnvelope(results(1)))

        assertEquals(Drain.Done, uploader().drain())

        assertTrue(queue.saved.isEmpty())
        assertTrue("fp1" in queue.sent)
        assertFalse("sent again", queue.add(saved(1)))
    }

    @Test
    fun `an answer with no status stays to go again, and the rest are done with`() = runTest {
        queue.add(saved(1))
        queue.add(saved(2))
        server.enqueue(okEnvelope("""{"results":[{"status":null},{"status":"matched"}]}"""))

        assertEquals(Drain.TryLater, uploader().drain())

        assertEquals(listOf("fp1"), queue.saved.map { it.fingerprint })
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `an answer of the wrong length loses nothing`() = runTest {
        queue.add(saved(1))
        queue.add(saved(2))
        server.enqueue(okEnvelope(results(1)))

        assertEquals(Drain.TryLater, uploader().drain())

        assertEquals(2, queue.saved.size)
    }

    @Test
    fun `at most fifty go in a request, oldest first`() = runTest {
        repeat(120) { queue.add(saved(it)) }
        repeat(3) { server.enqueue(okEnvelope(results(if (it == 2) 20 else 50))) }

        assertEquals(Drain.Done, uploader().drain())

        assertEquals(3, server.requestCount)
        val first = bodyOf()
        assertEquals(50, first.messages.size)
        assertEquals("TrxID A0", first.messages.first().text)
    }

    @Test
    fun `a full Bangla batch is split to stay under the server's limit in bytes`() = runTest {
        val bangla = "TrxID A " + "ট".repeat(990)
        repeat(50) { queue.add(saved(it, "$bangla$it")) }
        repeat(50) { server.enqueue(okEnvelope(results(it))) }
        // Every batch answers for as many as it carried, whatever that turns out to be.
        server.close()
        server = MockWebServer()
        server.dispatcher = object : mockwebserver3.Dispatcher() {
            override fun dispatch(request: mockwebserver3.RecordedRequest): MockResponse {
                val body = request.body?.utf8().orEmpty()
                assertTrue("over the limit: ${body.toByteArray().size}", body.toByteArray().size <= BATCH_MAX_BYTES)
                return okEnvelope(results(apiJson.decodeFromString(UploadRequest.serializer(), body).messages.size))
            }
        }
        server.start()

        assertEquals(Drain.Done, uploader().drain())

        assertTrue(queue.saved.isEmpty())
        assertTrue("one request would not fit", server.requestCount > 1)
    }

    @Test
    fun `a batch refused as too large goes one by one, and one that can never go stops holding up the rest`() = runTest {
        queue.add(saved(1))
        queue.add(saved(2))
        server.enqueue(refusal(413, "validation_error"))
        server.enqueue(refusal(413, "validation_error"))
        server.enqueue(okEnvelope(results(1)))

        assertEquals(Drain.Done, uploader().drain())

        assertTrue(queue.saved.isEmpty())
    }

    @Test
    fun `a revoked phone clears its token and every saved message, and stops`() = runTest {
        queue.add(saved(1))
        server.enqueue(refusal(401, "unauthenticated", """{"reason":"owner"}"""))

        assertEquals(Drain.Waiting, uploader().drain())

        assertNull(secrets.token)
        assertTrue(queue.saved.isEmpty())
        assertTrue(stopped)
        assertEquals(PhoneStatus.Revoked("owner"), facts.facts.value.status)
    }

    @Test
    fun `a phone the server no longer knows keeps the server's own words`() = runTest {
        queue.add(saved(1))
        server.enqueue(refusal(401, "unauthenticated", message = "Pair it again with a new code."))

        uploader().drain()

        assertEquals(PhoneStatus.Revoked(null, "Pair it again with a new code."), facts.facts.value.status)
    }

    @Test
    fun `a blocked installation is told apart from a revoked phone`() = runTest {
        queue.add(saved(1))
        server.enqueue(refusal(401, "unauthenticated", """{"reason":"installation_blocked"}"""))

        uploader().drain()

        assertEquals(PhoneStatus.Blocked, facts.facts.value.status)
        assertNull(secrets.token)
    }

    @Test
    fun `an inactive subscription holds the receipts and keeps the token`() = runTest {
        queue.add(saved(1))
        server.enqueue(refusal(403, "tenant_offline"))

        assertEquals(Drain.Waiting, uploader().drain())

        assertEquals(1, queue.saved.size)
        assertEquals("the-token", secrets.token)
        assertFalse(stopped)
        assertEquals(PhoneStatus.Inactive, facts.facts.value.status)
    }

    @Test
    fun `an old app holds the receipts and learns the minimum`() = runTest {
        queue.add(saved(1))
        server.enqueue(refusal(426, "app_update_required", """{"minimum":"1.2.0"}"""))

        assertEquals(Drain.Waiting, uploader().drain())

        assertEquals(1, queue.saved.size)
        assertEquals(PhoneStatus.UpdateRequired("1.2.0"), facts.facts.value.status)
    }

    @Test
    fun `a proxy's 401 unpairs nothing`() = runTest {
        queue.add(saved(1))
        server.enqueue(MockResponse.Builder().code(401).body("<html>a proxy</html>").build())

        assertEquals(Drain.TryLater, uploader().drain())

        assertEquals("the-token", secrets.token)
        assertEquals(1, queue.saved.size)
    }

    @Test
    fun `a limit or a server error keeps everything for later`() = runTest {
        queue.add(saved(1))
        server.enqueue(refusal(429, "rate_limited"))
        server.enqueue(refusal(500, "internal_error"))

        assertEquals(Drain.TryLater, uploader().drain())
        assertEquals(Drain.TryLater, uploader().drain())

        assertEquals(1, queue.saved.size)
    }

    @Test
    fun `no connection keeps everything for later`() = runTest {
        queue.add(saved(1))
        val uploader = uploader()
        server.close()

        assertEquals(Drain.TryLater, uploader.drain())

        assertEquals(1, queue.saved.size)
    }

    @Test
    fun `what is older than the server would read is dropped, not sent`() = runTest {
        queue.add(SavedMessage("old", "bKash", "TrxID OLD", NOW - 8 * DAY_MS))

        assertEquals(Drain.Done, uploader().drain())

        assertEquals(0, server.requestCount)
        assertTrue(queue.saved.isEmpty())
    }

    @Test
    fun `a wrong phone clock is corrected by the server's time`() = runTest {
        facts.update { it.copy(clockOffsetMs = 3_600_000L) }
        val message = saved(1)
        queue.add(message)
        server.enqueue(okEnvelope(results(1)))

        uploader().drain()

        assertEquals(isoOf(message.receivedAt + 3_600_000L), bodyOf().messages.single().receivedAt)
    }

    @Test
    fun `a sent receipt counts as a report`() = runTest {
        queue.add(saved(1))
        server.enqueue(okEnvelope(results(1)))

        uploader().drain()

        assertEquals(NOW, facts.facts.value.lastReportAt)
    }
}
