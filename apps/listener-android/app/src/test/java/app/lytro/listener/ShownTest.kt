package app.lytro.listener

import app.lytro.listener.data.PhoneStatus
import app.lytro.listener.ui.Ago
import app.lytro.listener.ui.HomeBand
import app.lytro.listener.ui.LineKind
import app.lytro.listener.ui.PhoneMaker
import app.lytro.listener.ui.ReceiptLine
import app.lytro.listener.ui.SmsRefusal
import app.lytro.listener.ui.agoOf
import app.lytro.listener.ui.amountShown
import app.lytro.listener.ui.batteryAtRisk
import app.lytro.listener.ui.countdownShown
import app.lytro.listener.ui.homeBandOf
import app.lytro.listener.ui.phoneMakerOf
import app.lytro.listener.ui.phoneNumberShown
import app.lytro.listener.ui.readQr
import app.lytro.listener.ui.receiptLineOf
import app.lytro.listener.ui.smsRefusalOf
import app.lytro.listener.ui.timeShown
import app.lytro.listener.ui.walletName
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShownTest {
    private fun band(
        status: PhoneStatus = PhoneStatus.Connected,
        sms: Boolean = true,
        online: Boolean = true,
        account: Boolean = true,
        test: Boolean = false,
        battery: Boolean = false,
    ) = homeBandOf(status, sms, online, account, test, battery)

    @Test
    fun `the band shows what most needs fixing`() {
        assertEquals(HomeBand.Working, band())
        assertEquals(HomeBand.NoAccount, band(account = false))
        assertEquals(HomeBand.NoInternet, band(online = false, account = false))
        assertEquals(HomeBand.SmsOff, band(sms = false, online = false))
        assertEquals(HomeBand.UpdateRequired, band(PhoneStatus.UpdateRequired("1.2.0"), sms = false))
        assertEquals(HomeBand.Inactive, band(PhoneStatus.Inactive, sms = false, online = false))
        assertEquals(HomeBand.BatteryRisk, band(battery = true, account = false))
        assertEquals(HomeBand.TestMode, band(test = true, battery = true))
        assertEquals(HomeBand.NoInternet, band(online = false, test = true))
    }

    @Test
    fun `each maker is told by its own names, and any other phone has no extra step`() {
        assertEquals(PhoneMaker.Xiaomi, phoneMakerOf("Xiaomi", "Redmi"))
        assertEquals(PhoneMaker.Xiaomi, phoneMakerOf("Xiaomi", "POCO"))
        // Some phones name only the sub-brand.
        assertEquals(PhoneMaker.Xiaomi, phoneMakerOf("Redmi", "Redmi"))
        assertEquals(PhoneMaker.Xiaomi, phoneMakerOf("POCO", "POCO"))
        assertEquals(PhoneMaker.Vivo, phoneMakerOf("iQOO", "iQOO"))
        assertEquals(PhoneMaker.Oppo, phoneMakerOf("realme", "realme"))
        assertEquals(PhoneMaker.Oppo, phoneMakerOf("OPPO", "OPPO"))
        assertEquals(PhoneMaker.Vivo, phoneMakerOf("vivo", "iQOO"))
        assertEquals(PhoneMaker.Samsung, phoneMakerOf("samsung", "samsung"))
        assertNull(phoneMakerOf("Google", "google"))
    }

    @Test
    fun `the battery warning clears only with Android's exemption and the maker's setting opened`() {
        assertEquals(true, batteryAtRisk(exempt = false, maker = null, makerStepOpened = false))
        assertEquals(false, batteryAtRisk(exempt = true, maker = null, makerStepOpened = false))
        assertEquals(true, batteryAtRisk(exempt = true, maker = PhoneMaker.Xiaomi, makerStepOpened = false))
        assertEquals(true, batteryAtRisk(exempt = false, maker = PhoneMaker.Xiaomi, makerStepOpened = true))
        assertEquals(false, batteryAtRisk(exempt = true, maker = PhoneMaker.Xiaomi, makerStepOpened = true))
    }

    @Test
    fun `test mode counts down as drawn, and never reads nothing left while it is on`() {
        assertEquals("8:42", countdownShown(522_000))
        assertEquals("10:00", countdownShown(600_000))
        assertEquals("0:01", countdownShown(1))
    }

    @Test
    fun `each receipt says where it stands, and never turns red`() {
        assertEquals(ReceiptLine.Matched, receiptLineOf("matched", null, null))
        assertEquals(ReceiptLine.NotMatched, receiptLineOf("unmatched", null, null))
        assertEquals(ReceiptLine.AmountOff, receiptLineOf("needs_review", "amount", null))
        assertEquals(ReceiptLine.ShortBalance, receiptLineOf("needs_review", "low_balance", null))
        // `by_hand` is Slice 5.7's, and a reason this app has not met reads the same way.
        for (reason in listOf("sender", "wallet", "old_receipt", "order_closed", "transaction_id_used", "by_hand", "a_new_reason")) {
            assertEquals(reason, ReceiptLine.Review, receiptLineOf("needs_review", reason, null))
        }
        assertEquals(ReceiptLine.AlreadySent, receiptLineOf("duplicate", null, null))
        assertEquals(ReceiptLine.Test, receiptLineOf("ignored", null, "test_mode"))
        assertEquals(ReceiptLine.Other, receiptLineOf("a_new_state", null, null))
        assertEquals(LineKind.Wait, ReceiptLine.NotMatched.kind)
    }

    @Test
    fun `figures read as the prototype writes them`() {
        assertEquals("3,490", amountShown("3490.00"))
        assertEquals("500", amountShown("500"))
        assertEquals("1,500.50", amountShown("1,500.50"))
        assertEquals("not a number", amountShown("not a number"))
        assertEquals("01711-000001", phoneNumberShown("01711000001"))
        assertEquals("bKash", walletName("bkash"))
    }

    @Test
    fun `a receipt from today shows its time, and an older one its day too`() {
        val dhaka = TimeZone.getTimeZone("Asia/Dhaka")
        val at = 1_793_695_260_000L // 3 Nov 2026, 2:41 PM in Dhaka.
        assertEquals("2:41 PM", timeShown(at, at + 60_000, dhaka))
        assertEquals("3 Nov, 2:41 PM", timeShown(at, at + 24 * 3_600_000L, dhaka))
    }

    @Test
    fun `the last report reads in the unit it fits`() {
        assertEquals(Ago.JustNow, agoOf(0, 59_000))
        assertEquals(Ago.Minutes(2), agoOf(0, 120_000))
        assertEquals(Ago.Hours(3), agoOf(0, 3 * 3_600_000L))
        assertEquals(Ago.Days(2), agoOf(0, 48 * 3_600_000L))
    }

    @Test
    fun `Android's own block is told apart from a person saying no`() {
        // Seen on Android 16: installed from a downloaded file, refused with no dialog.
        assertEquals(SmsRefusal.ByAndroid, smsRefusalOf(false, false, 36, 4))
        assertEquals(SmsRefusal.ByAndroid, smsRefusalOf(false, false, 35, 3))
        // A person's first no can be asked again; a store install and older Android never meet the block.
        assertEquals(SmsRefusal.ByPerson, smsRefusalOf(false, true, 36, 4))
        assertEquals(SmsRefusal.ByPerson, smsRefusalOf(false, false, 36, 2))
        assertEquals(SmsRefusal.ByPerson, smsRefusalOf(false, false, 34, 4))
        assertEquals(SmsRefusal.None, smsRefusalOf(true, false, 36, 4))
    }

    @Test
    fun `a QR reads back with no Google Play services`() {
        val link = "lytro-listener://pair?code=K7MP4X2H"
        val matrix = QRCodeWriter().encode(link, BarcodeFormat.QR_CODE, 300, 300)
        val luminance = ByteArray(300 * 300) { index ->
            if (matrix.get(index % 300, index / 300)) 0 else -1
        }

        assertEquals(link, readQr(luminance, 300, 300, 300))
        assertNull(readQr(ByteArray(300 * 300) { -1 }, 300, 300, 300))
    }
}
