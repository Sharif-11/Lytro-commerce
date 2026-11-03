package app.lytro.listener

import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.data.SavedMessage
import app.lytro.listener.engine.PhoneGuard
import app.lytro.listener.net.ApiResult
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneGuardTest {
    private val queue = FakeQueue()
    private val secrets = FakeSecrets()
    private val facts = FakeFacts(PhoneFacts(senders = listOf("bKash")))

    @Test
    fun `forgetting finishes when stopping the background cancels the work that asked`() = runTest {
        queue.saved += SavedMessage("fp1", "bKash", "TrxID A1", 1_000L)
        lateinit var report: Job
        val guard = PhoneGuard(secrets, facts, queue) { report.cancel() }
        report = launch(start = CoroutineStart.LAZY) { guard.forget(PhoneStatus.Revoked("owner")) }

        report.join()

        assertNull(secrets.token)
        assertTrue(queue.saved.isEmpty())
        assertEquals(PhoneStatus.Revoked("owner"), facts.facts.value.status)
        assertTrue(facts.facts.value.senders.isEmpty())
    }

    @Test
    fun `an inactive shop's answer on its way cannot replace why the pairing ended`() = runTest {
        val guard = PhoneGuard(secrets, facts, queue) {}
        guard.forget(PhoneStatus.Revoked("owner"))

        guard.settle(ApiResult.Refused(403, "tenant_offline", "the server's words", null, null))

        assertEquals(PhoneStatus.Revoked("owner"), facts.facts.value.status)
    }
}
