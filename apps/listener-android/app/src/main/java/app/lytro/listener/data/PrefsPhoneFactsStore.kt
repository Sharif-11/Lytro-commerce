package app.lytro.listener.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

private const val KEY_FACTS = "facts"

class PrefsPhoneFactsStore(context: Context) : PhoneFactsStore {
    private val prefs = context.getSharedPreferences("phone_facts", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private val state = MutableStateFlow(load())

    override val facts: StateFlow<PhoneFacts> = state

    override fun update(change: (PhoneFacts) -> PhoneFacts) {
        state.update(change)
        prefs.edit().putString(KEY_FACTS, json.encodeToString(PhoneFacts.serializer(), state.value)).apply()
    }

    private fun load(): PhoneFacts {
        val saved = prefs.getString(KEY_FACTS, null) ?: return PhoneFacts()
        return try {
            json.decodeFromString(PhoneFacts.serializer(), saved)
        } catch (_: SerializationException) {
            PhoneFacts()
        }
    }
}
