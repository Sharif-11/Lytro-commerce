package app.lytro.listener.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

private const val DB_NAME = "receipts.db"
private const val DB_VERSION = 1

class SqliteReceiptQueue(context: Context) :
    SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION),
    ReceiptQueue {

    private val count = MutableStateFlow(0)

    init {
        runBlocking(Dispatchers.IO) { refreshCount() }
    }

    override val size: StateFlow<Int> = count

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE saved (fingerprint TEXT PRIMARY KEY, sender TEXT NOT NULL, text TEXT NOT NULL, received_at INTEGER NOT NULL)",
        )
        db.execSQL("CREATE TABLE sent (fingerprint TEXT PRIMARY KEY, received_at INTEGER NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    override suspend fun add(message: SavedMessage): Boolean = withContext(Dispatchers.IO) {
        val db = writableDatabase
        val sent = db.rawQuery("SELECT 1 FROM sent WHERE fingerprint = ?", arrayOf(message.fingerprint)).use { it.moveToFirst() }
        if (sent) return@withContext false
        val values = ContentValues().apply {
            put("fingerprint", message.fingerprint)
            put("sender", message.sender)
            put("text", message.text)
            put("received_at", message.receivedAt)
        }
        val added = db.insertWithOnConflict("saved", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1L
        refreshCount()
        added
    }

    override suspend fun oldest(limit: Int): List<SavedMessage> = read("ASC", limit)

    override suspend fun newest(limit: Int): List<SavedMessage> = read("DESC", limit)

    override suspend fun markSent(messages: List<SavedMessage>) = withContext(Dispatchers.IO) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (message in messages) {
                db.delete("saved", "fingerprint = ?", arrayOf(message.fingerprint))
                val values = ContentValues().apply {
                    put("fingerprint", message.fingerprint)
                    put("received_at", message.receivedAt)
                }
                db.insertWithOnConflict("sent", null, values, SQLiteDatabase.CONFLICT_REPLACE)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        refreshCount()
    }

    override suspend fun dropOlderThan(cutoff: Long) = withContext(Dispatchers.IO) {
        writableDatabase.delete("saved", "received_at < ?", arrayOf(cutoff.toString()))
        refreshCount()
    }

    override suspend fun forgetSentBefore(cutoff: Long) {
        withContext(Dispatchers.IO) {
            writableDatabase.delete("sent", "received_at < ?", arrayOf(cutoff.toString()))
        }
    }

    override suspend fun clear() = withContext(Dispatchers.IO) {
        writableDatabase.apply {
            delete("saved", null, null)
            delete("sent", null, null)
        }
        refreshCount()
    }

    private suspend fun read(order: String, limit: Int): List<SavedMessage> = withContext(Dispatchers.IO) {
        readableDatabase.rawQuery(
            "SELECT fingerprint, sender, text, received_at FROM saved ORDER BY received_at $order LIMIT ?",
            arrayOf(limit.toString()),
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) {
                    add(SavedMessage(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getLong(3)))
                }
            }
        }
    }

    private fun refreshCount() {
        count.value = readableDatabase.rawQuery("SELECT COUNT(*) FROM saved", null).use {
            it.moveToFirst()
            it.getInt(0)
        }
    }
}
