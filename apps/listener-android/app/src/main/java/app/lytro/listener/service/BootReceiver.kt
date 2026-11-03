package app.lytro.listener.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.lytro.listener.graph

/** LISTENER-APP-DESIGN 6: after a restart or an update it runs by itself, and the report reads the inbox for what it missed. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val graph = context.graph
        if (graph.secrets.token == null) return
        graph.background.start()
        graph.background.reportSoon()
    }
}
