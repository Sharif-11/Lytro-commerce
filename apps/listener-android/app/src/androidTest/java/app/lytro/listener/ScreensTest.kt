package app.lytro.listener

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ActivityScenario
import androidx.test.rule.GrantPermissionRule
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.data.SetupStage
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

private const val CODE = "K7MP4X2H"

/** LISTENER-APP-DESIGN 2, 3: the screens, driven as a person drives them, against the test's own server. */
class ScreensTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val permissions: GrantPermissionRule = GrantPermissionRule.grant(
        *buildList {
            add(Manifest.permission.RECEIVE_SMS)
            add(Manifest.permission.READ_SMS)
            add(Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }.toTypedArray(),
    )

    private var lytro = FakeLytro()
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun start() {
        resetApp()
        lytro.start()
    }

    @After
    fun stop() {
        scenario?.close()
        resetApp()
        lytro.stop()
    }

    private fun open() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    private fun shows(text: String) {
        compose.waitUntil(30_000) { compose.onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun tap(text: String) {
        shows(text)
        compose.onNodeWithText(text).performClick()
    }

    private fun typeCode(code: String = CODE) {
        tap(word(R.string.start))
        tap(word(R.string.type_code))
        shows(word(R.string.type_t))
        compose.onNodeWithTag("code").performTextInput(code)
    }

    @Test
    fun setupRunsFromWelcomeToAFirstReceiptOnHome() {
        val trx = newTrxId()
        open()

        typeCode()
        tap(word(R.string.pair))

        shows(word(R.string.done_t, "Megh Fashion"))
        shows("01711-000001")
        assertEquals("the token is kept", "device-token", graph.secrets.token)
        tap(word(R.string.yes_here))

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) tap(word(R.string.turn_on))

        shows(word(R.string.t_wait))
        waitUntil("the phone reported, so it counts online") { "POST heartbeat" in lytro.paths }
        EmulatorConsole.sendSms("bKash", receiptText(trx))

        shows(word(R.string.t_got_t))
        shows(trx)
        tap(word(R.string.finish))

        shows(word(R.string.st_on))
        assertEquals(SetupStage.Done, graph.settings.stage)
    }

    @Test
    fun typingTakesOnlyTheCodesAlphabetInCapitals() {
        open()

        typeCode("k0o1il7m")

        shows("K")
        shows("7")
        compose.onNodeWithText(word(R.string.pair)).assertIsNotEnabled()
    }

    @Test
    fun aWrongCodeShowsTheServersOwnWordsAndKeepsTheCode() {
        lytro.pairAnswer = { refusal(404, "not_found", "This code isn't valid.") }
        open()

        typeCode()
        tap(word(R.string.pair))

        shows("This code isn't valid.")
        tap(word(R.string.retry))
        shows(word(R.string.pair))
        assertNull(graph.secrets.token)
    }

    @Test
    fun tooManyTriesSaysHowLongAndKeepsTheButtonOff() {
        lytro.pairAnswer = { refusal(429, "rate_limited", retryAfter = "720") }
        open()

        typeCode()
        tap(word(R.string.pair))

        val words = graph.settings.localized(appContext).resources.getQuantityString(R.plurals.e_tries, 12, 12)
        shows(words)
        compose.onNodeWithText(word(R.string.pair)).assertIsNotEnabled()
    }

    @Test
    fun aFullPlanSaysSo() {
        lytro.pairAnswer = { refusal(402, "plan_limit_reached") }
        open()

        typeCode()
        tap(word(R.string.pair))

        shows(word(R.string.lim_t))
        shows(word(R.string.lim_p))
    }

    @Test
    fun noInternetKeepsTheCodeToTryAgain() {
        lytro.stop()
        open()

        typeCode()
        tap(word(R.string.pair))

        shows(word(R.string.e_net))
        assertNull(graph.secrets.token)
        lytro = restartLytro()
        tap(word(R.string.retry))
        shows(word(R.string.done_t, "Megh Fashion"))
    }

    private fun restartLytro() = FakeLytro().also { it.start() }

    @Test
    fun severalNumbersAreAllShownAndAskedAbout() {
        lytro.accounts = """[{"method":"bkash","number":"$SHOP_NUMBER"},{"method":"bkash","number":"01811000002"}]"""
        open()

        typeCode()
        tap(word(R.string.pair))

        shows(word(R.string.acct_qs))
        shows("01711-000001")
        shows("01811-000002")
    }

    @Test
    fun noNumberSaysSoAndSetupCarriesOn() {
        lytro.accounts = "[]"
        open()

        typeCode()
        tap(word(R.string.pair))

        shows(word(R.string.st_acct_s))
        tap(word(R.string.cont))
        assertFalse(graph.settings.stage == SetupStage.ConfirmSim)
    }

    @Test
    fun theWrongPhoneFreesItsPlaceAtOnceAndStartsOver() {
        open()

        typeCode()
        tap(word(R.string.pair))
        tap(word(R.string.no_other))

        shows(word(R.string.wel_t))
        assertTrue("the server was told", "POST unpair" in lytro.paths)
        assertNull(graph.secrets.token)
    }

    private fun openLink() {
        scenario = ActivityScenario.launch(
            Intent(Intent.ACTION_VIEW, Uri.parse("lytro-listener://pair?code=$CODE"))
                .setPackage(appContext.packageName),
        )
    }

    @Test
    fun aPairingLinkPairsStraightAway() {
        openLink()

        shows(word(R.string.done_t, "Megh Fashion"))
        assertEquals("device-token", graph.secrets.token)
    }

    @Test
    fun aPhoneAlreadyPairedIgnoresAPairingLink() {
        pairApp()

        openLink()

        shows(word(R.string.st_on))
        assertFalse("a planted link re-paired the phone", "POST pair" in lytro.paths)
    }

    @Test
    fun aPhoneRestartedHalfwayCarriesOnFromThere() {
        graph.secrets.token = "device-token"
        graph.phone.update { it.copy(shopName = "Megh Fashion") }
        graph.settings.stage = SetupStage.ConfirmSim

        open()

        shows(word(R.string.done_t, "Megh Fashion"))
    }

    @Test
    fun homeShowsTheCountsAndEachReceiptWhereItStands() {
        lytro.receipts = """[
          {"id":"1","method":"bkash","amount":"3490.00","transactionId":"9KL2M4PQ7X","status":"matched","orderNumber":"261102-0042","receivedAt":"2026-11-03T08:41:00.000Z"},
          {"id":"2","method":"bkash","amount":"500.00","transactionId":"7HT3B9XW2C","status":"unmatched","receivedAt":"2026-11-03T07:58:00.000Z"},
          {"id":"3","method":"bkash","amount":"1250.00","transactionId":"4QR8N2KV6Z","status":"needs_review","reviewReason":"amount","receivedAt":"2026-11-03T07:12:00.000Z"},
          {"id":"4","method":"bkash","amount":"2100.00","transactionId":"2BC7Y5MJ9A","status":"needs_review","reviewReason":"low_balance","receivedAt":"2026-11-03T05:06:00.000Z"},
          {"id":"5","method":"bkash","amount":"850.00","transactionId":"8NP4D6GS3E","status":"duplicate","receivedAt":"2026-11-03T03:47:00.000Z"}
        ]"""
        pairApp()

        open()

        shows(word(R.string.st_on))
        shows(word(R.string.today_v))
        shows("5")
        shows("৳3,490")
        shows(word(R.string.r_matched, "261102-0042"))
        shows(word(R.string.r_wait))
        shows(word(R.string.r_amount))
        shows(word(R.string.r_balance))
        shows(word(R.string.r_dup))
    }

    @Test
    fun homeWithNothingYetShowsTheNumber() {
        pairApp()

        open()

        shows(word(R.string.empty_t))
        shows("01711-000001")
    }

    @Test
    fun homeWithNoNumberWarnsWhatTheOwnerDoes() {
        lytro.accounts = "[]"
        pairApp(accounts = false)

        open()

        shows(word(R.string.st_acct))
        shows(word(R.string.acct_note))
    }

    @Test
    fun homeWithNoInternetShowsWhatIsSaved() {
        val trx = newTrxId()
        lytro.stop()
        pairApp()
        EmulatorConsole.sendSms("bKash", receiptText(trx))
        waitUntil("it was saved") { graph.queue.size.value == 1 }

        open()

        shows(word(R.string.st_net))
        shows(word(R.string.r_queued))
        shows(trx)
        lytro = restartLytro()
    }

    @Test
    fun aRevokedPhoneStopsClearsItsTokenAndSavedReceiptsAndGoesBackToTheStart() {
        pairApp()
        open()
        shows(word(R.string.st_on))

        lytro.everyDeviceCall = { refusal(401, "unauthenticated", details = """{"reason":"owner"}""") }
        scenario?.recreate()

        shows(word(R.string.wel_t))
        assertNull(graph.secrets.token)
        assertEquals(PhoneStatus.Revoked("owner"), graph.phone.facts.value.status)
        assertEquals(0, graph.queue.size.value)
    }

    @Test
    fun anInactiveShopHoldsAndSaysSo() {
        lytro.everyDeviceCall = { refusal(403, "tenant_offline") }
        pairApp()

        open()

        shows(word(R.string.st_inact))
        assertEquals("device-token", graph.secrets.token)
    }

    @Test
    fun englishIsOneTapAway() {
        open()
        shows(word(R.string.wel_t))

        tap("EN")

        shows("When money reaches bKash, orders verify by themselves")
    }
}
