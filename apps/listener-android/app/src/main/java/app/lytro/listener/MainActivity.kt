package app.lytro.listener

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lytro.listener.data.LANGUAGE_BANGLA
import app.lytro.listener.ui.AppViewModel
import app.lytro.listener.ui.HomeScreen
import app.lytro.listener.ui.PairScanScreen
import app.lytro.listener.ui.PairTypeScreen
import app.lytro.listener.ui.PairedScreen
import app.lytro.listener.ui.PermNotifScreen
import app.lytro.listener.ui.PermSmsBlockedScreen
import app.lytro.listener.ui.PermSmsNoScreen
import app.lytro.listener.ui.PermSmsScreen
import app.lytro.listener.ui.PhoneFrame
import app.lytro.listener.ui.Screen
import app.lytro.listener.ui.TestGotScreen
import app.lytro.listener.ui.TestWaitScreen
import app.lytro.listener.ui.WelcomeScreen
import app.lytro.listener.ui.theme.Inter
import app.lytro.listener.ui.theme.LocalBodyFont
import app.lytro.listener.ui.theme.NotoBengali

class MainActivity : ComponentActivity() {
    private val model: AppViewModel by viewModels()
    private var shownLanguage = LANGUAGE_BANGLA

    override fun attachBaseContext(base: Context) {
        val settings = base.graph.settings
        shownLanguage = settings.language.value
        super.attachBaseContext(settings.localized(base))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            SystemBarStyle.dark(Color.TRANSPARENT),
            SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) model.openLink(intent?.dataString)
        setContent {
            val language by model.language.collectAsStateWithLifecycle()
            // The strings come from this activity's own context, so a new language needs a new one.
            LaunchedEffect(language) { if (language != shownLanguage) recreate() }
            CompositionLocalProvider(LocalBodyFont provides if (language == LANGUAGE_BANGLA) NotoBengali else Inter) {
                PhoneFrame {
                    val facts by model.facts.collectAsStateWithLifecycle()
                    when (model.screen) {
                        Screen.Welcome -> WelcomeScreen(model, language)
                        Screen.PairScan -> PairScanScreen(model)
                        Screen.PairType -> PairTypeScreen(model)
                        Screen.Paired -> PairedScreen(model, facts.shopName, facts.accounts)
                        Screen.PermSms -> PermSmsScreen(model)
                        Screen.PermSmsNo -> PermSmsNoScreen(model)
                        Screen.PermSmsBlocked -> PermSmsBlockedScreen(model)
                        Screen.PermNotif -> PermNotifScreen(model)
                        Screen.TestWait -> TestWaitScreen(model, facts.accounts)
                        Screen.TestGot -> TestGotScreen(model)
                        Screen.Home -> HomeScreen(model)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        model.openLink(intent.dataString)
    }
}
