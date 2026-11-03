package app.lytro.listener

import app.lytro.listener.engine.BATCH_MAX
import app.lytro.listener.engine.BATCH_MAX_BYTES
import app.lytro.listener.engine.HEARTBEAT_MINUTES
import app.lytro.listener.engine.KEPT_DAYS
import app.lytro.listener.sms.CODE_ALPHABET
import app.lytro.listener.sms.CODE_LENGTH
import app.lytro.listener.sms.MESSAGE_MAX_LENGTH
import app.lytro.listener.sms.SENDER_MAX_LENGTH
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Kotlin cannot import the server's definitions, so this reads them where they live: if the server changes a limit or a
// rule the app has to follow, this fails rather than the app quietly drifting from it. Run from apps/listener-android/app.
private val REPO = File("../../..")
private val LIMITS = REPO.resolve("packages/validators/src/common/limits.ts").readText()
private val SCHEMAS = REPO.resolve("packages/validators/src/api/listener/listener.ts").readText()
private val PARSER = REPO.resolve("apps/server/src/modules/listener-receipts/services/receipt-parser.ts").readText()
private val MAIN = File("src/main/java/app/lytro/listener")

private fun limit(name: String): Long {
    val found = Regex("""export const $name = ([\d_ *]+);""").find(LIMITS)
        ?: error("$name is gone from limits.ts")
    return found.groupValues[1].split("*").map { it.trim().replace("_", "").toLong() }.reduce(Long::times)
}

class ContractTest {
    @Test
    fun `no word formats a number itself, which would show Bengali digits in Bangla`() {
        // The glossary's rule is Western digits in both languages, and `%d` follows the language.
        for (folder in listOf("values", "values-en")) {
            val words = File("src/main/res/$folder/strings.xml").readText()
            assertTrue("$folder formats a number", !Regex("""%(\d\$)?[dfi]""").containsMatchIn(words))
        }
    }

    @Test
    fun `the upload limits are the server's`() {
        assertEquals(limit("LISTENER_BATCH_MAX"), BATCH_MAX.toLong())
        assertEquals(limit("LISTENER_MESSAGE_MAX_LENGTH"), MESSAGE_MAX_LENGTH.toLong())
        assertEquals(limit("LISTENER_SENDER_MAX_LENGTH"), SENDER_MAX_LENGTH.toLong())
        assertTrue(BATCH_MAX_BYTES < limit("LISTENER_REQUEST_MAX_BYTES"))
    }

    @Test
    fun `how often it reports and how long it keeps a receipt are the server's`() {
        assertEquals(limit("LISTENER_HEARTBEAT_MINUTES"), HEARTBEAT_MINUTES.toLong())
        assertEquals(limit("LISTENER_RECEIVED_OLDEST_DAYS"), KEPT_DAYS.toLong())
    }

    @Test
    fun `a pairing code is made as the server makes it`() {
        assertEquals(limit("LISTENER_CODE_LENGTH"), CODE_LENGTH.toLong())
        assertTrue(SCHEMAS, SCHEMAS.contains("LISTENER_CODE_ALPHABET = '$CODE_ALPHABET'"))
    }

    @Test
    fun `what looks like a transaction is the server's test, character for character`() {
        val filter = MAIN.resolve("sms/MessageFilter.kt").readText()
        for ((server, app) in listOf(
            """const TRANSACTION_ID = /\bTrx\s?ID[:\s]+([A-Za-z0-9]+)/i;""" to """Regex(""${'"'}\bTrx\s?ID[:\s]+([A-Za-z0-9]+)""${'"'}, RegexOption.IGNORE_CASE)""",
            """/\bTk\.?\s*\d/i.test(text)""" to """Regex(""${'"'}\bTk\.?\s*\d""${'"'}, RegexOption.IGNORE_CASE)""",
            """/\bbalance\b/i.test(text)""" to """Regex(""${'"'}\bbalance\b""${'"'}, RegexOption.IGNORE_CASE)""",
        )) {
            assertTrue("the server no longer says: $server", PARSER.contains(server))
            assertTrue("the app no longer says: $app", filter.contains(app))
        }
    }
}
