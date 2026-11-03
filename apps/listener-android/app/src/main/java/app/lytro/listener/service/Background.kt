package app.lytro.listener.service

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.lytro.listener.engine.Drain
import app.lytro.listener.engine.HEARTBEAT_MINUTES
import app.lytro.listener.graph
import java.util.concurrent.TimeUnit

private const val REPORT_EVERY = "report-every"
private const val REPORT_NOW = "report-now"
private const val UPLOAD_NOW = "upload-now"
private const val RETRY_SECONDS = 30L

/** Everything that runs with the app closed: the always-on service, the reports and the uploads. */
class Background(private val context: Context) {
    private val work get() = WorkManager.getInstance(context)
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Set by the service itself: each needless start gives Android a deadline the app could miss on a busy phone. */
    @Volatile
    var serviceRunning = false

    /** Paired and allowed to read SMS: from now on it runs by itself, through restarts too. */
    fun start() {
        keepRunning()
        work.enqueueUniquePeriodicWork(
            REPORT_EVERY,
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<ReportWorker>(HEARTBEAT_MINUTES.toLong(), TimeUnit.MINUTES)
                .setConstraints(online)
                .build(),
        )
    }

    /**
     * LSN-19: nothing runs on a phone that is not paired. The service stops itself on seeing that: stopping it from here,
     * just after a start Android is still waiting on, crashes the app.
     */
    fun stop() {
        work.cancelUniqueWork(REPORT_EVERY)
        work.cancelUniqueWork(REPORT_NOW)
        work.cancelUniqueWork(UPLOAD_NOW)
    }

    /** Agreed 2026-11-03: after pairing and on boot, a report, which also reads the inbox. */
    fun reportSoon() {
        work.enqueueUniqueWork(
            REPORT_NOW,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<ReportWorker>()
                .setConstraints(online)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, RETRY_SECONDS, TimeUnit.SECONDS)
                .build(),
        )
    }

    /** A receipt is waiting. Expedited so it can run in Doze, since a shopper's page is waiting on it. */
    fun uploadSoon() {
        work.enqueueUniqueWork(
            UPLOAD_NOW,
            ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(online)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, RETRY_SECONDS, TimeUnit.SECONDS)
                .build(),
        )
    }

    /** Android refuses this from the background at times; the manifest's receiver still catches SMS, and a report retries. */
    fun keepRunning() {
        if (serviceRunning) return
        try {
            ContextCompat.startForegroundService(context, Intent(context, ListenerService::class.java))
        } catch (error: IllegalStateException) {
            Log.w("Background", "the service could not start now: ${error.javaClass.simpleName}")
        }
    }
}

/** LSN-03: the report, every [15] minutes and on demand. */
class ReportWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = applicationContext.graph
        if (graph.secrets.token == null) return Result.success()
        graph.background.keepRunning()
        graph.notifications.checkSmsPermission()
        return if (graph.reporter.report() == Drain.TryLater) Result.retry() else Result.success()
    }
}

class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result =
        if (applicationContext.graph.uploader.drain() == Drain.TryLater) Result.retry() else Result.success()

    /** Asked for only below Android 12, where expedited work runs in a foreground service. */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        val notifications = applicationContext.graph.notifications
        return ForegroundInfo(STATUS_NOTIFICATION_ID, notifications.statusNotification())
    }
}
