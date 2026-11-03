package app.lytro.listener.data

import android.content.Context
import android.content.res.Configuration
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Where setup has got to, so a phone restarted halfway carries on from there (LISTENER-APP-DESIGN 2). */
enum class SetupStage { Pair, ConfirmSim, Sms, Notifications, Test, Done }

const val LANGUAGE_BANGLA = "bn"
const val LANGUAGE_ENGLISH = "en"

/** What belongs to this app on this phone, whichever shop it is paired with. */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val languageState = MutableStateFlow(prefs.getString("language", LANGUAGE_BANGLA) ?: LANGUAGE_BANGLA)

    /** Bangla, with an English switch (agreed in the sketch's read), whatever language the phone is in. */
    val language: StateFlow<String> = languageState

    fun chooseLanguage(language: String) {
        prefs.edit().putString("language", language).apply()
        languageState.value = language
    }

    var stage: SetupStage
        get() = prefs.getString("stage", null)?.let { saved -> SetupStage.entries.find { it.name == saved } } ?: SetupStage.Pair
        set(value) {
            prefs.edit().putString("stage", value.name).apply()
        }

    var smsProblemTold: Boolean
        get() = prefs.getBoolean("sms_problem_told", false)
        set(value) {
            prefs.edit().putBoolean("sms_problem_told", value).apply()
        }

    /** A context whose string resources answer in the chosen language. */
    fun localized(context: Context, language: String = this.language.value): Context {
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(language))
        return context.createConfigurationContext(configuration)
    }
}
