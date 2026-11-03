package app.lytro.listener

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.lytro.listener.ui.PermSmsBlockedBody
import app.lytro.listener.ui.PermSmsNoBody
import app.lytro.listener.ui.PhoneFrame
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * The refusal screens as drawn. They are not reached through the app here: these tests' phone has the permission, and on it the
 * real screens rightly move on. Reaching one takes installing as a download would (README.md), which was done by hand on Android
 * 16 on 2026-11-03: `ShownTest` holds the choice between them.
 */
class RefusalScreensTest {
    @get:Rule
    val compose = createComposeRule()

    private fun phoneWord(id: Int) = appContext.getString(id)

    @Test
    fun androidsOwnBlockShowsTheWayOut() {
        var opened = 0
        var asked = 0
        compose.setContent { PhoneFrame { PermSmsBlockedBody({ opened += 1 }, { asked += 1 }) } }

        compose.onNodeWithText(phoneWord(R.string.blk_t)).assertExists()
        compose.onNodeWithText(phoneWord(R.string.blk_2)).assertExists()

        compose.onNodeWithText(phoneWord(R.string.open_set)).performClick()
        compose.onNodeWithText(phoneWord(R.string.allow)).performClick()
        assertEquals(1, opened)
        assertEquals(1, asked)
    }

    @Test
    fun aPersonSayingNoIsAskedToUseSettings() {
        var opened = 0
        compose.setContent { PhoneFrame { PermSmsNoBody { opened += 1 } } }

        compose.onNodeWithText(phoneWord(R.string.sms_d_t)).assertExists()

        compose.onNodeWithText(phoneWord(R.string.open_set)).performClick()
        assertEquals(1, opened)
    }
}
