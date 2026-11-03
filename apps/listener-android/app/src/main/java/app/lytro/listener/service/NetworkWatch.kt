package app.lytro.listener.service

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Home's "No internet" band and the notification's words (3.1). */
class NetworkWatch(context: Context) {
    private val manager = context.getSystemService(ConnectivityManager::class.java)
    private val state = MutableStateFlow(isOnlineNow())

    val online: StateFlow<Boolean> = state

    init {
        manager.registerDefaultNetworkCallback(
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    state.value = true
                }

                override fun onLost(network: Network) {
                    state.value = false
                }
            },
        )
    }

    private fun isOnlineNow(): Boolean =
        manager.getNetworkCapabilities(manager.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
}
