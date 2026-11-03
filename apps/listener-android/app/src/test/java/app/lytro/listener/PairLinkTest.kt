package app.lytro.listener

import app.lytro.listener.sms.codeInLink
import app.lytro.listener.sms.typedCodeOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PairLinkTest {
    @Test
    fun `a pairing link gives its code, in capitals`() {
        assertEquals("K7MP4X2H", codeInLink("lytro-listener://pair?code=K7MP4X2H"))
        assertEquals("K7MP4X2H", codeInLink("lytro-listener://pair?code=k7mp4x2h"))
        assertEquals("K7MP4X2H", codeInLink("lytro-listener://pair?from=qr&code=K7MP4X2H"))
    }

    @Test
    fun `anything else gives no code`() {
        assertNull(codeInLink("https://example.com/pair?code=K7MP4X2H"))
        assertNull(codeInLink("lytro-listener://other?code=K7MP4X2H"))
        assertNull(codeInLink("lytro-listener://pair?code=K7MP"))
        // 0, O, 1, I and L are not in the alphabet.
        assertNull(codeInLink("lytro-listener://pair?code=K7MP4X2O"))
        assertNull(codeInLink("K7MP4X2H"))
    }

    @Test
    fun `typing capitalises, drops what the alphabet lacks and stops at a whole code`() {
        assertEquals("K7MP", typedCodeOf("k7mp"))
        assertEquals("K7MP", typedCodeOf("k0O1Il7mp "))
        assertEquals("K7MP4X2H", typedCodeOf("K7MP4X2H9"))
    }
}
