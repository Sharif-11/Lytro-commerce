package app.lytro.listener.sms

// LSN-09: the alphabet a pairing code is made from, with no 0/O or 1/I/L.
const val CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const val CODE_LENGTH = 8

private val PAIR_LINK = Regex("""^lytro-listener://pair\?(?:[^#]*&)?code=([A-Za-z0-9]+)(?:&[^#]*)?$""", RegexOption.IGNORE_CASE)

/** What can stay in the code boxes as typed: capitals from the alphabet, at most a whole code. */
fun typedCodeOf(typed: String): String =
    typed.uppercase().filter { it in CODE_ALPHABET }.take(CODE_LENGTH)

/** The code in a QR or a tapped link (`lytro-listener://pair?code=K7MP4X2H`), or null when it is anything else. */
fun codeInLink(link: String): String? {
    val code = PAIR_LINK.find(link.trim())?.groupValues?.get(1)?.uppercase() ?: return null
    return code.takeIf { it.length == CODE_LENGTH && it.all { char -> char in CODE_ALPHABET } }
}
