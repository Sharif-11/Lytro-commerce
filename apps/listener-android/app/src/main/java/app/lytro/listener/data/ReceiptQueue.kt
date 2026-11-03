package app.lytro.listener.data

import kotlinx.coroutines.flow.StateFlow

/** A message saved on the phone until the server has it (LISTENER-APP-DESIGN 6). */
data class SavedMessage(
    val fingerprint: String,
    val sender: String,
    val text: String,
    /** By this phone's clock. */
    val receivedAt: Long,
)

/**
 * The private queue. A message goes in once, is sent, and on the server's answer its text is deleted, leaving only its
 * fingerprint for the look-back to recognise. So raw SMS never lingers, and nothing is sent twice.
 */
interface ReceiptQueue {
    /** How many wait to be sent. */
    val size: StateFlow<Int>

    /** False when it is already saved, or was already sent. */
    suspend fun add(message: SavedMessage): Boolean

    suspend fun oldest(limit: Int): List<SavedMessage>

    suspend fun newest(limit: Int): List<SavedMessage>

    /** The server has these: their text goes, and they are remembered by fingerprint. */
    suspend fun markSent(messages: List<SavedMessage>)

    /** LSN-15: the server ignores anything older than [7] days, so what never got through is dropped with them. */
    suspend fun dropOlderThan(cutoff: Long)

    suspend fun forgetSentBefore(cutoff: Long)

    /** Unpaired or revoked: nothing from this phone may go anywhere now. */
    suspend fun clear()
}
