package app.lytro.listener.engine

import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

// java.time needs Android 8; the app runs from Android 7.
private fun format(pattern: String) =
    SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

/** A moment as the server reads and writes it: `2026-11-03T08:00:00.000Z`. */
fun isoOf(millis: Long): String = format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").format(millis)

fun millisOfIso(iso: String): Long? {
    for (pattern in listOf("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")) {
        try {
            return format(pattern).parse(iso)?.time
        } catch (_: ParseException) {
            continue
        }
    }
    return null
}
