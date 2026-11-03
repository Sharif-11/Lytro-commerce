package app.lytro.listener.ui

import android.app.Application
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.lytro.listener.data.PhoneFacts
import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.data.SavedMessage
import app.lytro.listener.data.SetupStage
import app.lytro.listener.graph
import app.lytro.listener.net.ApiResult
import app.lytro.listener.net.PairRequest
import app.lytro.listener.net.Paired
import app.lytro.listener.net.Recent
import app.lytro.listener.sms.CODE_LENGTH
import app.lytro.listener.sms.codeInLink
import app.lytro.listener.sms.typedCodeOf
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Every screen drawn in LISTENER-APP-DESIGN 2 and 3 for this part of the slice. */
enum class Screen {
    Welcome,
    PairScan,
    PairType,
    Paired,
    PermSms,
    PermSmsNo,
    PermSmsBlocked,
    PermNotif,
    TestWait,
    TestGot,
    Home,
}

/** Why pairing was refused (2, "When pairing is refused"). */
sealed interface PairProblem {
    data class WrongCode(val words: String) : PairProblem
    data class TooManyTries(val until: Long) : PairProblem
    data object DeviceLimit : PairProblem
    data object NoInternet : PairProblem

    /** Subscription inactive, blocked, update required: their own screens come with Slice 5.5b. */
    data class Stopped(val words: String) : PairProblem
}

private const val RECENT_LIMIT = 20

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val graph = app.graph
    private val context get() = getApplication<Application>()

    var screen by mutableStateOf(firstScreen())
        private set
    var code by mutableStateOf("")
        private set
    var pairProblem by mutableStateOf<PairProblem?>(null)
        private set
    var pairing by mutableStateOf(false)
        private set
    var unpairFailed by mutableStateOf(false)
        private set
    var testReceipt by mutableStateOf<SavedMessage?>(null)
        private set
    var recent by mutableStateOf<Recent?>(null)
        private set
    var saved by mutableStateOf<List<SavedMessage>>(emptyList())
        private set
    var reachable by mutableStateOf(true)
        private set
    var now by mutableStateOf(graph.clock())
        private set

    val facts get() = graph.phone.facts
    val network get() = graph.network.online
    val language get() = graph.settings.language

    init {
        // LSN-19: however the phone lost its place, in the background or on a screen, it goes back to pairing.
        viewModelScope.launch {
            graph.phone.facts.collect {
                if (graph.secrets.token == null && screen !in PAIRING_SCREENS) goToStart()
            }
        }
    }

    fun chooseLanguage(language: String) = graph.settings.chooseLanguage(language)

    fun getStarted() {
        screen = Screen.PairScan
    }

    fun typeInstead() {
        pairProblem = null
        screen = Screen.PairType
    }

    fun scanInstead() {
        pairProblem = null
        screen = Screen.PairScan
    }

    fun typed(text: String) {
        val next = typedCodeOf(text)
        if (next != code) {
            code = next
            if (pairProblem is PairProblem.WrongCode || pairProblem == PairProblem.NoInternet) pairProblem = null
        }
    }

    /** The red boxes' Try again: the code stays, to be corrected. */
    fun clearProblem() {
        pairProblem = null
    }

    /** A camera's read or a tapped link: agreed 2026-11-03, it pairs straight away. A phone already paired ignores it. */
    fun openLink(link: String?) {
        val found = link?.let(::codeInLink) ?: return
        if (graph.secrets.token != null || pairing) return
        code = found
        pair()
    }

    fun pair() {
        if (code.length != CODE_LENGTH || pairing) return
        pairing = true
        pairProblem = null
        val request = PairRequest(code, graph.secrets.installationId, Build.MODEL?.take(100)?.ifBlank { null })
        viewModelScope.launch {
            when (val answer = graph.api.pair(request)) {
                is ApiResult.Ok -> paired(answer.value)
                is ApiResult.Refused -> refused(answer)
                ApiResult.NoConnection -> {
                    pairProblem = PairProblem.NoInternet
                    screen = Screen.PairType
                }
            }
            pairing = false
        }
    }

    private fun paired(answer: Paired) {
        graph.secrets.token = answer.token
        graph.phone.update {
            PhoneFacts(
                shopName = answer.shopName,
                accounts = answer.accounts,
                senders = answer.senders,
                testModeUntil = answer.testModeUntil,
                pairedAt = graph.clock(),
            )
        }
        code = ""
        graph.settings.stage = SetupStage.ConfirmSim
        // A phone counts as online only once it has reported.
        graph.background.reportSoon()
        screen = Screen.Paired
    }

    private fun refused(answer: ApiResult.Refused) {
        pairProblem = when (answer.code) {
            "not_found" -> PairProblem.WrongCode(answer.message)
            "rate_limited" -> {
                // As drawn: the boxes empty, since this code has had its tries.
                code = ""
                PairProblem.TooManyTries(graph.clock() + (answer.retryAfterSeconds ?: 60L) * 1000)
            }
            "plan_limit_reached" -> PairProblem.DeviceLimit
            else -> PairProblem.Stopped(answer.message)
        }
        screen = Screen.PairType
    }

    /** 2.3: the likeliest mistake. "Yes" carries on; "No" frees the plan's place at once and starts over. */
    fun simIsHere() {
        graph.settings.stage = SetupStage.Sms
        screen = if (smsAllowed(context)) afterSmsAllowed() else Screen.PermSms
    }

    fun simIsElsewhere() {
        unpairFailed = false
        viewModelScope.launch {
            when (val answer = graph.api.unpair()) {
                is ApiResult.Ok -> graph.guard.forget(PhoneStatus.Revoked("device"))
                is ApiResult.Refused -> if (answer.code == "unauthenticated") graph.guard.settle(answer) else unpairFailed = true
                ApiResult.NoConnection -> unpairFailed = true
            }
        }
    }

    /** Android's answer to the SMS permission (2.4). */
    fun smsAnswered(refusal: SmsRefusal) {
        screen = when (refusal) {
            SmsRefusal.None -> afterSmsAllowed()
            SmsRefusal.ByPerson -> Screen.PermSmsNo
            SmsRefusal.ByAndroid -> Screen.PermSmsBlocked
        }
    }

    /** Back from Settings: if it is on now, there is nothing left to do on these screens. */
    fun checkSmsAgain() {
        if (screen in REFUSED_SCREENS && smsAllowed(context)) screen = afterSmsAllowed()
    }

    private fun afterSmsAllowed(): Screen {
        graph.background.start()
        graph.background.reportSoon()
        if (graph.settings.stage == SetupStage.Done) return Screen.Home
        val askNotifications = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        graph.settings.stage = if (askNotifications) SetupStage.Notifications else SetupStage.Test
        return if (askNotifications) Screen.PermNotif else startTest()
    }

    fun notificationsAnswered() {
        graph.settings.stage = SetupStage.Test
        screen = startTest()
    }

    private fun startTest(): Screen {
        val started = graph.clock()
        viewModelScope.launch {
            testReceipt = graph.uploader.reached.first { it.receivedAt >= started }
            now = graph.clock()
            if (screen == Screen.TestWait) screen = Screen.TestGot
        }
        return Screen.TestWait
    }

    fun finishSetup() {
        graph.settings.stage = SetupStage.Done
        screen = Screen.Home
    }

    /** Fix it on Home: the same screens as setup, returning to Home. */
    fun fixSms() {
        screen = Screen.PermSms
    }

    /** When Home opens: makes sure it runs, and reads the inbox for anything missed since. */
    fun homeOpened() {
        if (graph.secrets.token == null) return
        graph.notifications.checkSmsPermission()
        if (smsAllowed(context)) graph.background.start()
        graph.scope.launch { graph.reporter.report() }
    }

    /** 3.1: on opening and every 30 seconds while open. */
    suspend fun refresh() {
        now = graph.clock()
        saved = graph.queue.newest(RECENT_LIMIT)
        if (graph.secrets.token == null) return
        when (val answer = graph.api.recent(RECENT_LIMIT)) {
            is ApiResult.Ok -> {
                recent = answer.value
                reachable = true
                graph.phone.update { it.copy(status = PhoneStatus.Connected) }
            }
            is ApiResult.Refused -> {
                reachable = true
                graph.guard.settle(answer)
            }
            ApiResult.NoConnection -> reachable = false
        }
        saved = graph.queue.newest(RECENT_LIMIT)
    }

    private fun firstScreen(): Screen {
        if (graph.secrets.token == null) return Screen.Welcome
        return when (graph.settings.stage) {
            SetupStage.Pair, SetupStage.ConfirmSim -> Screen.Paired
            SetupStage.Sms -> Screen.PermSms
            SetupStage.Notifications -> Screen.PermNotif
            SetupStage.Test -> startTest()
            SetupStage.Done -> Screen.Home
        }
    }

    private fun goToStart() {
        code = ""
        pairProblem = null
        recent = null
        saved = emptyList()
        graph.settings.stage = SetupStage.Pair
        screen = Screen.Welcome
    }

    private companion object {
        val PAIRING_SCREENS = setOf(Screen.Welcome, Screen.PairScan, Screen.PairType)
        val REFUSED_SCREENS = setOf(Screen.PermSms, Screen.PermSmsNo, Screen.PermSmsBlocked)
    }
}
