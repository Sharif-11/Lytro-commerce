package app.lytro.listener

import app.lytro.listener.sms.IncomingSms
import app.lytro.listener.sms.SmsIntake
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private const val RECEIPT = "You have received Tk 10.00 from 01811000002. Balance Tk 10.00. TrxID 6FV2K8LQ4T"

class SmsIntakeTest {
    private val queue = FakeQueue()
    private val secrets = FakeSecrets()
    private val intake = SmsIntake(secrets, FakeFacts(), queue)

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
    fun `a phone that is not paired keeps everything`() = runTest {
        secrets.token = null

        assertFalse(intake.take(IncomingSms("bKash", RECEIPT, 1_000)))

        assertTrue(queue.saved.isEmpty())
    }
}
