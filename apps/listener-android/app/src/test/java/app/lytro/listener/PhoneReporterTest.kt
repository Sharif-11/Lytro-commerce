package app.lytro.listener

import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.engine.DAY_MS
import app.lytro.listener.engine.Drain
import app.lytro.listener.engine.InboxLookBack
import app.lytro.listener.engine.PhoneGuard
import app.lytro.listener.engine.PhoneReporter
import app.lytro.listener.engine.ReceiptUploader
import app.lytro.listener.engine.isoOf
import app.lytro.listener.sms.IncomingSms
import app.lytro.listener.sms.SmsIntake
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

private const val NOW = 1_793_700_000_000L
private const val RECEIPT = "You have received Tk 10.00 from 01811000002. Balance Tk 10.00. TrxID 6FV2K8LQ4T"

class PhoneReporterTest {
    private lateinit var server: MockWebServer
    private val queue = FakeQueue()
    private val secrets = FakeSecrets()
    private val facts = FakeFacts(PhoneFacts(senders = listOf("bKash"), pairedAt = NOW - 60_000))
    private var inbox: List<IncomingSms> = emptyList()
    private var askedSince: Long? = null
    private var clock = NOW

    private fun connected(serverTime: Long = NOW) = okEnvelope(
        """{"status":"connected","heartbeatMinutes":15,"serverTime":"${isoOf(serverTime)}","deviceName":"Front desk","shopName":"Megh Fashion",
        "accounts":[{"method":"bkash","number":"01711000001"}],"senders":["bKash","Nagad"],"testModeUntil":null}""",
    )

    private fun reporter(): PhoneReporter {
        val api = apiFor(server, secrets)
        val guard = PhoneGuard(secrets, facts, queue) {}
        return PhoneReporter(
            api = api,
            secrets = secrets,
            phone = facts,
            queue = queue,
            guard = guard,
            inbox = InboxLookBack { since, _ ->
                askedSince = since
                inbox
            },
            intake = SmsIntake(secrets, facts, queue) { clock },
            uploader = ReceiptUploader(api, queue, facts, guard) { clock },
            clock = { clock },
        )
    }

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() = server.close()

    @Test
    fun `a report hears the shop's facts and the server's time`() = runTest {
        server.enqueue(connected(serverTime = NOW + 5_000))

        assertEquals(Drain.Done, reporter().report())

        val heard = facts.facts.value
        assertEquals("01711000001", heard.accounts.single().number)
        assertEquals(listOf("bKash", "Nagad"), heard.senders)
        assertEquals(NOW, heard.lastReportAt)
        assertEquals(5_000L, heard.clockOffsetMs)
        assertEquals("Front desk", heard.deviceName)
        assertEquals("Megh Fashion", heard.shopName)
    }

    @Test
    fun `a second trigger cannot report more often than the server allows`() = runTest {
        server.enqueue(connected())
        reporter().report()

        clock = NOW + 13 * 60_000
        reporter().report()
        assertEquals(1, server.requestCount)

        server.enqueue(connected())
        clock = NOW + 14 * 60_000
        reporter().report()
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `a clock set back does not silence the phone until it catches up`() = runTest {
        server.enqueue(connected())
        reporter().report()

        server.enqueue(connected())
        clock = NOW - 24 * 3_600_000L
        reporter().report()

        assertEquals(2, server.requestCount)
    }

    @Test
    fun `the look-back reaches no further than this phone's pairing`() = runTest {
        server.enqueue(connected())

        reporter().report()

        assertEquals(NOW - 60_000, askedSince)
    }

    @Test
    fun `the look-back reaches no further than seven days on a long-paired phone`() = runTest {
        facts.update { it.copy(pairedAt = NOW - 30 * DAY_MS) }
        server.enqueue(connected())

        reporter().report()

        assertEquals(NOW - 7 * DAY_MS, askedSince)
    }

    @Test
    fun `what the look-back finds is sent once, however many reports read it`() = runTest {
        inbox = listOf(IncomingSms("bKash", RECEIPT, NOW - 30_000))
        server.enqueue(connected())
        server.enqueue(okEnvelope("""{"results":[{"status":"unmatched"}]}"""))

        reporter().report()
        assertEquals(2, server.requestCount)

        clock = NOW + 15 * 60_000
        server.enqueue(connected())
        reporter().report()

        assertEquals("only the second heartbeat", 3, server.requestCount)
        assertTrue(queue.saved.isEmpty())
    }

    @Test
    fun `the look-back's codes and offers stay on the phone`() = runTest {
        inbox = listOf(IncomingSms("bKash", "Your bKash verification code is 482910.", NOW - 30_000))
        server.enqueue(connected())

        reporter().report()

        assertEquals(1, server.requestCount)
        assertTrue(queue.saved.isEmpty())
    }

    @Test
    fun `an inactive shop keeps reading and holding`() = runTest {
        inbox = listOf(IncomingSms("bKash", RECEIPT, NOW - 30_000))
        server.enqueue(refusal(403, "tenant_offline"))
        server.enqueue(refusal(403, "tenant_offline"))

        assertEquals(Drain.Waiting, reporter().report())

        assertEquals(1, queue.saved.size)
        assertEquals(PhoneStatus.Inactive, facts.facts.value.status)
    }

    @Test
    fun `the plan coming back shows on the next report`() = runTest {
        facts.update { it.copy(status = PhoneStatus.Inactive) }
        server.enqueue(connected())

        reporter().report()

        assertEquals(PhoneStatus.Connected, facts.facts.value.status)
    }

    @Test
    fun `a revoked phone stops at the heartbeat, reading nothing`() = runTest {
        inbox = listOf(IncomingSms("bKash", RECEIPT, NOW - 30_000))
        server.enqueue(refusal(401, "unauthenticated", """{"reason":"operator"}"""))

        assertEquals(Drain.Waiting, reporter().report())

        assertNull(secrets.token)
        assertNull(askedSince)
        assertTrue(queue.saved.isEmpty())
    }

    @Test
    fun `a phone with no token does nothing`() = runTest {
        secrets.token = null

        assertEquals(Drain.Done, reporter().report())

        assertEquals(0, server.requestCount)
    }

    @Test
    fun `no connection still reads the inbox, so the receipts are saved`() = runTest {
        inbox = listOf(IncomingSms("bKash", RECEIPT, NOW - 30_000))
        val reporter = reporter()
        server.close()

        assertEquals(Drain.TryLater, reporter.report())

        assertEquals(1, queue.saved.size)
        assertFalse(queue.saved.isEmpty())
    }
}
