package app.lytro.listener

import app.lytro.listener.sms.fingerprintOf
import app.lytro.listener.sms.looksLikeTransaction
import app.lytro.listener.sms.mayLeavePhone
import app.lytro.listener.sms.shownMessageOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private val SENDERS = listOf("bKash")

// The messages in the server's own parser spec (apps/server/test/receipt-parser.spec.ts).
private val RECEIPTS = listOf(
    "You have received Tk 1,500.50 from 01811000002. Fee Tk 0.00. Balance Tk 9,500.75. TrxID 9AB1CD2EFG at 02/11/2026 13:58",
    "You have received Tk 500 from 01811000002.\nRef for the saree.\nFee Tk 0.00. Balance Tk 700.00.\nTrxID 7ht3b9xw2c at 02/11/2026 13:58",
    "You have received payment Tk 300.00 from 01811000002. Fee Tk 5.55. Balance Tk 294.45. TrxID 8KD2LM4NPQ at 02/11/2026 14:00",
    "Cash Out Tk 700.00 from 01811000002 successful. Fee Tk 0.00. Balance Tk 12,000.00. TrxID 6QW9ER3TYU at 02/11/2026 14:05",
    // Wording the parser does not know still leaves, so the server can tell Lytro of it (VER-06).
    "Tk 500.00 has reached your account from 01811000002. Balance Tk 700.00. TrxID 9AB1CD2EFG at 02/11/2026 13:58",
    // Money leaving the account is the server's to set aside.
    "Send Money Tk 500.00 to 01811000002 successful. Fee Tk 5.00. Balance Tk 100.00. TrxID 4AS7DF1GHJ at 02/11/2026 15:00",
)

private val PRIVATE = listOf(
    "Your bKash verification code is 482910. It expires in 2 minutes.",
    "Your bKash OTP is 738201. Do not share it with anyone.",
    "Get 20% cashback on your next Send Money! Dial *247#.",
    "Tk 50 cashback offer, today only.",
)

class MessageFilterTest {
    @Test
    fun `a wallet's receipts leave the phone`() {
        for (text in RECEIPTS) assertTrue(text, mayLeavePhone("bKash", text, SENDERS))
    }

    @Test
    fun `its sign-in codes and offers stay on the phone though the sender is the same`() {
        for (text in PRIVATE) assertFalse(text, mayLeavePhone("bKash", text, SENDERS))
    }

    @Test
    fun `an amount with a balance counts without a transaction ID`() {
        assertTrue(looksLikeTransaction("Tk 200.00 was added. Your balance is Tk 300.00."))
        assertFalse(looksLikeTransaction("Your balance is low."))
    }

    @Test
    fun `any other sender stays on the phone however like a receipt it reads`() {
        assertFalse(mayLeavePhone("01711000001", RECEIPTS[0], SENDERS))
        assertFalse(mayLeavePhone("16247", RECEIPTS[0], SENDERS))
    }

    @Test
    fun `the sender is matched whatever its case, as the server does`() {
        assertTrue(mayLeavePhone("BKASH", RECEIPTS[0], SENDERS))
    }

    @Test
    fun `nothing leaves when the server's list is empty`() {
        assertFalse(mayLeavePhone("bKash", RECEIPTS[0], emptyList()))
    }

    @Test
    fun `a message too long for the server stays, since it would refuse the whole batch`() {
        assertTrue(mayLeavePhone("bKash", "TrxID ABCDEFGHIJ " + "x".repeat(983), SENDERS))
        assertFalse(mayLeavePhone("bKash", "TrxID ABCDEFGHIJ " + "x".repeat(984), SENDERS))
    }

    @Test
    fun `the same message has one fingerprint from the broadcast and the inbox`() {
        assertEquals(
            fingerprintOf("bKash", "Balance Tk 700.00.\nTrxID 7HT3B9XW2C"),
            fingerprintOf("BKASH", "Balance Tk 700.00. TrxID 7HT3B9XW2C "),
        )
        assertNotEquals(fingerprintOf("bKash", "TrxID 7HT3B9XW2C"), fingerprintOf("bKash", "TrxID 9AB1CD2EFG"))
    }

    @Test
    fun `a saved receipt shows its amount and transaction ID`() {
        val shown = shownMessageOf(RECEIPTS[0])
        assertEquals("1,500.50", shown.amount)
        assertEquals("9AB1CD2EFG", shown.transactionId)
        assertNull(shownMessageOf("Hello").amount)
    }
}
