package app.lytro.listener.service

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.util.Log
import androidx.core.app.ServiceCompat
import app.lytro.listener.graph
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

/**
 * LISTENER-APP-DESIGN 5, 6: the always-on notification, which also keeps this process alive for the SMS receiver on phones
 * that kill background apps. `specialUse`, not `dataSync`: from Android 15 that kind stops after 6 hours a day and may not
 * start at boot.
 */
class ListenerService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var watching: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val graph = graph
        // Whatever follows, Android must see this first: a service started this way that never does is a crash.
        try {
            ServiceCompat.startForeground(
                this,
                STATUS_NOTIFICATION_ID,
                graph.notifications.statusNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } catch (error: IllegalStateException) {
            Log.w("ListenerService", "could not go to the foreground: ${error.javaClass.simpleName}")
            stopSelf()
            return START_NOT_STICKY
        }
        if (graph.secrets.token == null) {
            stopNow()
            return START_NOT_STICKY
        }
        graph.background.serviceRunning = true
        if (watching == null) {
            watching = combine(graph.phone.facts, graph.queue.size, graph.network.online) { _, _, _ -> }
                .onEach {
                    // LSN-19: a phone that has lost its place stops here, however it lost it.
                    if (graph.secrets.token == null) stopNow() else graph.notifications.refreshStatus()
                }
                .launchIn(scope)
        }
        return START_STICKY
    }

    private fun stopNow() {
        graph.background.serviceRunning = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        graph.background.serviceRunning = false
        scope.cancel()
        super.onDestroy()
    }
}
