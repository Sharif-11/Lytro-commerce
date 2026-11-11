package app.lytro.listener

import app.lytro.listener.ui.supportNumber
import app.lytro.listener.ui.whatsappDigits
import org.junit.Assert.assertEquals
import org.junit.Test

// D8-74 (Slice 8.8): the support rows open the help line's WhatsApp, else the number the release was built with.
class SupportNumberTest {
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
        assertEquals("8801711000009", supportNumber("01711000009", builtIn = "8801000000000"))
    }

    @Test
    fun `none from the help line keeps the built-in one`() {
        assertEquals("8801000000000", supportNumber(null, builtIn = "8801000000000"))
        assertEquals("8801000000000", supportNumber("", builtIn = "8801000000000"))
    }

    @Test
    fun `with neither there is none, and the rows hide`() {
        assertEquals("", supportNumber(null, builtIn = ""))
    }
}
