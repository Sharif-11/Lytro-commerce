package app.lytro.listener

import android.Manifest
import androidx.test.rule.GrantPermissionRule
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/** LSN-16, agreed 2026-11-03: real SMS, delivered through the emulator's radio, with no screen open. */
class SmsOnPhoneTest {
    @get:Rule
    val permissions: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_SMS,
    )

    private val lytro = FakeLytro()

    @Before
    fun start() {
        resetApp()
        lytro.start()
    }

    @After
    fun stop() {
        resetApp()
        lytro.stop()
    }

    @Test
    fun aReceiptReachesTheServerWithNoScreenOpen() {
        pairApp()
        val trx = newTrxId()

        EmulatorConsole.sendSms("bKash", receiptText(trx))

        waitUntil("the receipt reached the server") { lytro.sawUpload(trx) }
        waitUntil("its text left the phone") { graph.queue.size.value == 0 }
    }

    @Test
    fun aSignInCodeFromTheSameSenderStaysOnThePhone() {
        pairApp()
        val trx = newTrxId()

        EmulatorConsole.sendSms("bKash", "Your bKash verification code is 482910. It expires in 2 minutes.")
        EmulatorConsole.sendSms("bKash", receiptText(trx))

        waitUntil("the receipt behind it reached the server") { lytro.sawUpload(trx) }
        assertFalse("a sign-in code left the phone", lytro.sawUpload("482910"))
    }

    @Test
    fun anotherSendersMessageStaysOnThePhoneHoweverLikeAReceiptItReads() {
        pairApp()
        val forged = newTrxId()
        val real = newTrxId()

        EmulatorConsole.sendSms("01811000099", receiptText(forged))
        EmulatorConsole.sendSms("bKash", receiptText(real))

        waitUntil("the real receipt reached the server") { lytro.sawUpload(real) }
        assertFalse("another sender's message left the phone", lytro.sawUpload(forged))
    }

    @Test
    fun testModeLetsAnUnknownSendersReceiptThroughAndNothingElse() {
        pairApp()
        graph.phone.update { it.copy(testModeUntil = app.lytro.listener.engine.isoOf(System.currentTimeMillis() + 300_000)) }
        val trx = newTrxId()

        EmulatorConsole.sendSms("16247", "Hello from a friend, your code is 482910.")
        EmulatorConsole.sendSms("16247", receiptText(trx))

        waitUntil("the test receipt reached the server") { lytro.sawUpload(trx) }
        assertFalse("a stranger's other message left the phone", lytro.sawUpload("482910"))
    }

    @Test
    fun aPhoneThatIsNotPairedSendsNothing() {
        val trx = newTrxId()

        EmulatorConsole.sendSms("bKash", receiptText(trx))
        waitUntilInInbox(trx)
        Thread.sleep(2_000)

        assertEquals(0, lytro.uploads.size)
        assertEquals(0, graph.queue.size.value)
    }

    @Test
    fun theLookBackFindsWhatArrivedWhileItWasNotListening() = runBlocking {
        // Not listening: the receiver ignores it, as a killed app would miss it.
        val floor = System.currentTimeMillis() - 1_000
        val missed = newTrxId()
        EmulatorConsole.sendSms("bKash", receiptText(missed))
        waitUntilInInbox(missed)

        pairApp()
        graph.phone.update { it.copy(pairedAt = floor) }
        graph.reporter.report()

        assertEquals(1, lytro.uploads.count { missed in it })
    }

    @Test
    fun theLookBackNeverReachesBehindThePairing() = runBlocking {
        val before = newTrxId()
        EmulatorConsole.sendSms("bKash", receiptText(before))
        waitUntilInInbox(before)
        Thread.sleep(1_500)

        pairApp()
        graph.phone.update { it.copy(pairedAt = System.currentTimeMillis()) }
        graph.reporter.report()

        assertFalse("a receipt from before the pairing left the phone", lytro.sawUpload(before))
    }

    @Test
    fun theLookBackSendsOnceHoweverManyReportsReadIt() = runBlocking {
        val floor = System.currentTimeMillis() - 1_000
        val trx = newTrxId()
        EmulatorConsole.sendSms("bKash", receiptText(trx))
        waitUntilInInbox(trx)

        pairApp()
        graph.phone.update { it.copy(pairedAt = floor) }
        repeat(3) { graph.reporter.report() }

        assertEquals(1, lytro.uploads.count { trx in it })
    }

    @Test
    fun aLongReceiptInPartsArrivesWhole() {
        pairApp()
        val trx = newTrxId()
        val long = "You have received Tk 500.00 from 01811000002. Ref ${"a long note ".repeat(20)}. " +
            "Fee Tk 0.00. Balance Tk 700.00. TrxID $trx at 03/11/2026 14:44"

        EmulatorConsole.sendSms("bKash", long)

        waitUntil("the whole receipt reached the server") { lytro.sawUpload(trx) && lytro.sawUpload("You have received") }
    }

    @Test
    fun aPhoneLosingItsPlaceJustAsItsServiceStartsDoesNotCrash() = runBlocking {
        pairApp()
        graph.background.keepRunning()
        graph.guard.forget(app.lytro.listener.data.PhoneStatus.Revoked("owner"))

        // Android gives a started service seconds to go to the foreground, and only then crashes the app if it did not.
        Thread.sleep(12_000)

        assertEquals(null, graph.secrets.token)
        waitUntil("the service stopped itself") { !graph.background.serviceRunning }
    }

    @Test
    fun anUploadThatFailsIsSavedAndGoesLater() = runBlocking {
        pairApp()
        val trx = newTrxId()
        lytro.everyDeviceCall = { refusal(500, "internal_error") }

        EmulatorConsole.sendSms("bKash", receiptText(trx))
        waitUntil("it was saved") { graph.queue.size.value == 1 }

        lytro.everyDeviceCall = null
        graph.uploader.drain()

        assertEquals(1, lytro.uploads.count { trx in it })
        assertEquals(0, graph.queue.size.value)
    }

    private fun waitUntilInInbox(trx: String) = waitUntil("the phone's inbox has it") {
        appContext.contentResolver.query(
            android.provider.Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(android.provider.Telephony.Sms.ADDRESS),
            "${android.provider.Telephony.Sms.BODY} LIKE ?",
            arrayOf("%$trx%"),
            null,
        )?.use { it.count > 0 } == true
    }
}
