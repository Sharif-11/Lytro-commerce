package app.lytro.listener.sms

import java.security.MessageDigest

// The same test as the server's `looksLikeTransaction` (receipt-parser.ts); ContractTest fails if the two part.
private val TRANSACTION_ID = Regex("""\bTrx\s?ID[:\s]+([A-Za-z0-9]+)""", RegexOption.IGNORE_CASE)
private val AMOUNT = Regex("""\bTk\.?\s*\d""", RegexOption.IGNORE_CASE)
private val BALANCE = Regex("""\bbalance\b""", RegexOption.IGNORE_CASE)
private val SPACES = Regex("""\s+""")

// For showing a saved receipt only; the server alone decides what a message means.
private val SHOWN_AMOUNT = Regex("""\bTk\.?\s*([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)

/** LSN-13: longer than this, and the server refuses the whole batch it came in. */
const val MESSAGE_MAX_LENGTH = 1000
const val SENDER_MAX_LENGTH = 30

private fun oneLine(text: String): String = text.replace(SPACES, " ").trim()

/** A transaction ID, or an amount with a balance: what a wallet's codes and offers never have. */
fun looksLikeTransaction(text: String): Boolean {
    val line = oneLine(text)
    return TRANSACTION_ID.containsMatchIn(line) ||
        (AMOUNT.containsMatchIn(line) && BALANCE.containsMatchIn(line))
}

/** LSN-04: what test mode lets through from an unknown sender: an amount and a transaction ID. */
fun looksLikeReceipt(text: String): Boolean {
    val line = oneLine(text)
    return TRANSACTION_ID.containsMatchIn(line) && AMOUNT.containsMatchIn(line)
}

/**
 * LSN-16, LISTENER-APP-DESIGN 2.4: what may leave this phone. bKash sends its sign-in codes from the same sender as its
 * receipts, so the sender alone is not enough: it must also look like a transaction. Test mode (LSN-04) is the one exception,
 * and the app says so: for its [10] minutes an unknown sender's message goes if it looks like a receipt. Everything else stays.
 */
fun mayLeavePhone(sender: String, text: String, senders: List<String>, testMode: Boolean = false): Boolean {
    if (sender.isBlank() || sender.length > SENDER_MAX_LENGTH) return false
    if (text.isBlank() || text.length > MESSAGE_MAX_LENGTH) return false
    return if (senders.any { it.equals(sender, ignoreCase = true) }) {
        looksLikeTransaction(text)
    } else {
        testMode && looksLikeReceipt(text)
    }
}

/**
 * What remembers a message once it is sent, so the inbox's look-back never sends it twice, without keeping its text. The
 * same message reads the same from the broadcast and from the inbox, whatever its line breaks.
 */
fun fingerprintOf(sender: String, text: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
        .digest("${sender.lowercase()}|${oneLine(text)}".toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
}

/** A saved receipt's line on Home (3.1, "Saved on the phone"), before the server has read it. */
data class ShownMessage(val amount: String?, val transactionId: String?)

fun shownMessageOf(text: String): ShownMessage {
    val line = oneLine(text)
    return ShownMessage(
        amount = SHOWN_AMOUNT.find(line)?.groupValues?.get(1),
        transactionId = TRANSACTION_ID.find(line)?.groupValues?.get(1)?.uppercase(),
    )
}
