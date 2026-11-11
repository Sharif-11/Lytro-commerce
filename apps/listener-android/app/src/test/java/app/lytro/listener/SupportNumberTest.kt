package app.lytro.listener

import app.lytro.listener.net.ApiResult
import app.lytro.listener.net.HelpLine
import app.lytro.listener.ui.supportNumber
import app.lytro.listener.ui.whatsappDigits
import org.junit.Assert.assertEquals
import org.junit.Test

// D8-74 (Slice 8.8): the support rows open the help line's WhatsApp; the number the release was built with only while the
// server hasn't answered or can't be reached. A number cleared in the console hides them (the owner, 2026-11-11).
class SupportNumberTest {
    private val builtIn = "8801000000000"

    @Test
    fun `a number in its local form gets the country's 88 for WhatsApp`() {
        assertEquals("8801711000009", whatsappDigits("01711000009"))
    }

    @Test
    fun `a number already in the country's form stays as it is`() {
        assertEquals("8801711000009", whatsappDigits("8801711000009"))
        assertEquals("8801711000009", whatsappDigits("+880 1711-000009"))
    }

    @Test
    fun `the help line's number comes before the built-in one`() {
        assertEquals("8801711000009", supportNumber(ApiResult.Ok(HelpLine("01711000009")), builtIn))
    }

    @Test
    fun `a number cleared in the console hides the rows, built-in or not`() {
        assertEquals("", supportNumber(ApiResult.Ok(HelpLine(null)), builtIn))
        assertEquals("", supportNumber(ApiResult.Ok(HelpLine("")), builtIn))
    }

    @Test
    fun `until the server answers, or when it can't be reached, the built-in one stands in`() {
        assertEquals(builtIn, supportNumber(null, builtIn))
        assertEquals(builtIn, supportNumber(ApiResult.NoConnection, builtIn))
        assertEquals(builtIn, supportNumber(ApiResult.Refused(503, null, "", null, null), builtIn))
    }

    @Test
    fun `with no help line answer and none built in, the rows hide`() {
        assertEquals("", supportNumber(ApiResult.NoConnection, builtIn = ""))
    }
}
