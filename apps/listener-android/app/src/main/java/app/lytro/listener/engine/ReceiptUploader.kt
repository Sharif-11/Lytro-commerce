package app.lytro.listener.engine

import app.lytro.listener.data.PhoneFactsStore
import app.lytro.listener.data.ReceiptQueue
import app.lytro.listener.data.SavedMessage
import app.lytro.listener.net.ApiResult
import app.lytro.listener.net.ListenerApi
import app.lytro.listener.net.UploadMessage
import app.lytro.listener.net.UploadResult
import app.lytro.listener.net.uploadBodyOf
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** LSN-13: at most [50] messages in a request. */
const val BATCH_MAX = 50

/** LSN-13: a request is at most [64] KB in bytes, and Bangla runs to three a character; this leaves some room. */
const val BATCH_MAX_BYTES = 60_000

/** LSN-15: older than [7] days, the server ignores it. */
const val KEPT_DAYS = 7
const val DAY_MS = 24L * 60 * 60 * 1000

private const val STATUS_IGNORED = "ignored"

/** How sending the queue ended. */
enum class Drain {
    /** Everything saved has been taken. */
    Done,

    /** Something is still saved and worth another try soon. */
    TryLater,

    /** The phone is held or stopped; only the next report may change that. */
    Waiting,
}

/**
 * LSN-13, LISTENER-APP-DESIGN 6: sends what is saved. A message whose answer has a status is done with, and its text goes;
 * one answered with no status could not be taken, so it stays to go again. One call at a time, whoever asks.
 */
class ReceiptUploader(
    private val api: ListenerApi,
    private val queue: ReceiptQueue,
    private val phone: PhoneFactsStore,
    private val guard: PhoneGuard,
    private val clock: () -> Long,
) {
    private val mutex = Mutex()
    private val reachedServer = MutableSharedFlow<SavedMessage>(extraBufferCapacity = 16)

    /** A receipt the server has read as one: what the setup's test waits for (2.7). */
    val reached: SharedFlow<SavedMessage> = reachedServer

    suspend fun drain(): Drain = mutex.withLock {
        queue.dropOlderThan(clock() - KEPT_DAYS * DAY_MS)
        sendAll()
    }

    private suspend fun sendAll(): Drain {
        var oneByOne = false
        while (true) {
            val batch = nextBatch(if (oneByOne) 1 else BATCH_MAX)
            if (batch.isEmpty()) return Drain.Done
            when (val answer = api.upload(batch.map { it.toUpload() })) {
                is ApiResult.Ok -> {
                    val results = answer.value.results
                    if (results.size != batch.size) return Drain.TryLater
                    val done = note(batch, results, answer.value.testModeUntil)
                    if (done < batch.size) return Drain.TryLater
                }
                is ApiResult.Refused -> when {
                    answer.status != 413 -> return whenRefused(answer)
                    // The whole batch was too big, which the sizes here should prevent; a single message that is too big
                    // can never go, and must not hold up the rest.
                    oneByOne -> queue.markSent(batch)
                    else -> oneByOne = true
                }
                ApiResult.NoConnection -> return Drain.TryLater
            }
        }
    }

    private suspend fun nextBatch(limit: Int): List<SavedMessage> {
        val batch = mutableListOf<SavedMessage>()
        for (message in queue.oldest(limit)) {
            batch += message
            if (uploadBodyOf(batch.map { it.toUpload() }).toByteArray().size > BATCH_MAX_BYTES) {
                if (batch.size > 1) batch.removeAt(batch.lastIndex)
                break
            }
        }
        return batch
    }

    private suspend fun note(batch: List<SavedMessage>, results: List<UploadResult>, testModeUntil: String?): Int {
        val taken = batch.zip(results).filter { (_, result) -> result.status != null }
        queue.markSent(taken.map { (message, _) -> message })
        if (taken.isNotEmpty()) {
            guard.connected { it.copy(lastReportAt = clock(), testModeUntil = testModeUntil) }
        }
        for ((message, result) in taken) {
            if (result.status != STATUS_IGNORED) reachedServer.tryEmit(message)
        }
        return taken.size
    }

    private suspend fun whenRefused(refused: ApiResult.Refused): Drain = when (guard.settle(refused)) {
        Settled.Stopped, Settled.Held -> Drain.Waiting
        Settled.Passing -> Drain.TryLater
    }

    private fun SavedMessage.toUpload() = UploadMessage(
        sender = sender,
        text = text,
        receivedAt = isoOf(receivedAt + phone.facts.value.clockOffsetMs),
    )
}
