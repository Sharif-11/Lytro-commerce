package app.lytro.listener

import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.engine.isoOf
import app.lytro.listener.sms.IncomingSms
import app.lytro.listener.sms.SmsIntake
import app.lytro.listener.sms.testModeLeftMs
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private const val RECEIPT = "You have received Tk 10.00 from 01811000002. Balance Tk 10.00. TrxID 6FV2K8LQ4T"

class SmsIntakeTest {
    private val queue = FakeQueue()
    private val secrets = FakeSecrets()
    private val facts = FakeFacts()
    private val now = 1_793_700_000_000L
    private val intake = SmsIntake(secrets, facts, queue) { now }

    @Test
    fun `a receipt is saved once, whichever way it was read`() = runTest {
        assertTrue(intake.take(IncomingSms("bKash", RECEIPT, 1_000)))
        assertFalse(intake.take(IncomingSms("bKash", RECEIPT.replace(". ", ".\n"), 2_000)))

        assertEquals(1, queue.saved.size)
    }

    @Test
    fun `what the filter stops is not saved`() = runTest {
        assertFalse(intake.take(IncomingSms("bKash", "Your bKash verification code is 482910.", 1_000)))
        assertFalse(intake.take(IncomingSms("01811000002", RECEIPT, 1_000)))

        assertTrue(queue.saved.isEmpty())
    }

    @Test
    fun `test mode lets an unknown sender's receipt through, and nothing else`() = runTest {
        facts.update { it.copy(testModeUntil = isoOf(now + 60_000)) }

        assertFalse(intake.take(IncomingSms("16247", "Your code is 482910.", 1_000)))
        assertFalse(intake.take(IncomingSms("16247", "Hello from a friend", 1_000)))
        assertTrue(intake.take(IncomingSms("16247", RECEIPT, 1_000)))

        assertEquals(listOf("16247"), queue.saved.map { it.sender })
    }

    @Test
    fun `when test mode ends, an unknown sender stays on the phone again`() = runTest {
        facts.update { it.copy(testModeUntil = isoOf(now - 1_000)) }

        assertFalse(intake.take(IncomingSms("16247", RECEIPT, 1_000)))
    }

    @Test
    fun `test mode runs by the server's clock, so a wrong phone clock can't stretch it`() {
        val until = isoOf(now + 60_000)

        assertEquals(60_000L, testModeLeftMs(PhoneFacts(testModeUntil = until), now))
        // This phone runs an hour slow, so by its own clock an hour too much would be left.
        assertEquals(0L, testModeLeftMs(PhoneFacts(testModeUntil = until, clockOffsetMs = 3_600_000), now))
        assertEquals(0L, testModeLeftMs(PhoneFacts(), now))
    }

    @Test
    fun `a phone that is not paired keeps everything`() = runTest {
        secrets.token = null

        assertFalse(intake.take(IncomingSms("bKash", RECEIPT, 1_000)))

        assertTrue(queue.saved.isEmpty())
    }
}
