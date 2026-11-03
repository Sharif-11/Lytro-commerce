package app.lytro.listener

import android.app.Application
import android.content.Context
import app.lytro.listener.data.KeystoreDeviceSecrets
import app.lytro.listener.data.PrefsPhoneFactsStore
import app.lytro.listener.data.Settings
import app.lytro.listener.data.SqliteReceiptQueue
import app.lytro.listener.engine.PhoneGuard
import app.lytro.listener.engine.PhoneReporter
import app.lytro.listener.engine.ReceiptUploader
import app.lytro.listener.net.DeviceCredentials
import app.lytro.listener.net.ListenerApi
import app.lytro.listener.service.Background
import app.lytro.listener.service.NetworkWatch
import app.lytro.listener.service.Notifications
import app.lytro.listener.sms.SmsInbox
import app.lytro.listener.sms.SmsIntake
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

/** The one place the app's parts are put together, each given what it depends on. */
open class ListenerApplication : Application() {
    val graph: AppGraph by lazy { AppGraph(this, apiBaseUrl()) }

    /** Tests point this at their own server. */
    protected open fun apiBaseUrl(): String = BuildConfig.API_BASE_URL
}

class AppGraph(context: Context, apiBaseUrl: String) {
    private val app = context.applicationContext

    val clock: () -> Long = System::currentTimeMillis

    /** Lives as long as the process: a receiver's work must not end with a screen. */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val settings = Settings(app)
    val secrets = KeystoreDeviceSecrets(app)
    val phone = PrefsPhoneFactsStore(app)
    val queue = SqliteReceiptQueue(app)
    val network = NetworkWatch(app)
    val background = Background(app)
    val notifications = Notifications(app, settings, phone, queue, network)

    val api = ListenerApi(
        client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build(),
        baseUrl = apiBaseUrl,
        hostHeader = BuildConfig.API_HOST_HEADER,
        appVersion = BuildConfig.VERSION_NAME,
        language = { settings.language.value },
        credentials = { secrets.token?.let { DeviceCredentials(it, secrets.installationId) } },
    )

    val guard = PhoneGuard(secrets, phone, queue, background::stop)
    val intake = SmsIntake(secrets, phone, queue, clock)
    val uploader = ReceiptUploader(api, queue, phone, guard, clock)
    val reporter = PhoneReporter(api, secrets, phone, queue, guard, SmsInbox(app), intake, uploader, clock)

    init {
        // However a call met a problem, in the background or on a screen, the owner hears of it here, once.
        scope.launch {
            phone.facts.map { it.status }.distinctUntilChanged().collect(notifications::statusChanged)
        }
    }
}

val Context.graph: AppGraph
    get() = (applicationContext as ListenerApplication).graph
