package app.lytro.listener

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.lytro.listener.ui.BatteryBody
import app.lytro.listener.ui.PermSmsBlockedBody
import app.lytro.listener.ui.PermSmsNoBody
import app.lytro.listener.ui.PhoneFrame
import app.lytro.listener.ui.PhoneMaker
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
    fun aXiaomiIsToldItsOwnStepAndWhereItIs() {
        var opened = 0
        compose.setContent { PhoneFrame { BatteryBody(PhoneMaker.Xiaomi, {}, {}, { opened += 1 }) } }

        compose.onNodeWithText(appContext.getString(R.string.bat_m, "Xiaomi")).assertExists()
        compose.onNodeWithText(phoneWord(R.string.mak_xiaomi_where)).assertExists()
        compose.onNodeWithText(phoneWord(R.string.mak_xiaomi_what)).assertExists()
        compose.onNodeWithText(phoneWord(R.string.bat_c)).assertExists()

        compose.onNodeWithText(phoneWord(R.string.open_set)).performClick()
        assertEquals(1, opened)
    }

    @Test
    fun anUnverifiedMakerStillGetsItsDrawnStepWithTheCaution() {
        compose.setContent { PhoneFrame { BatteryBody(PhoneMaker.Samsung, {}, {}, {}) } }

        compose.onNodeWithText(phoneWord(R.string.mak_samsung_what)).assertExists()
        compose.onNodeWithText(phoneWord(R.string.bat_c)).assertExists()
    }

    @Test
    fun anyOtherPhoneHasOnlyAndroidsOwnDialog() {
        var exempted = 0
        compose.setContent { PhoneFrame { BatteryBody(null, { exempted += 1 }, {}, {}) } }

        compose.onNodeWithText(phoneWord(R.string.bat_c)).assertDoesNotExist()
        compose.onNodeWithText(phoneWord(R.string.bat_btn)).performClick()
        assertEquals(1, exempted)
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
