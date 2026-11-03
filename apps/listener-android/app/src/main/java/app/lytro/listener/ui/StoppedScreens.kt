package app.lytro.listener.ui

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import app.lytro.listener.BuildConfig
import app.lytro.listener.R
import app.lytro.listener.data.PhoneStatus

/** LSN-24, LISTENER-APP-DESIGN 3.3: when the phone may not work at all, the band says so and the rest explains. */
@Composable
fun ColumnScope.StoppedScreen(
    status: PhoneStatus,
    held: Int,
    onCheckAgain: () -> Unit,
    onPairAgain: () -> Unit,
    onMenu: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    AppBar(onMenu)
    when (status) {
        PhoneStatus.Inactive -> {
            StatusBand(BandKind.Dan, stringResource(R.string.st_inact))
            Body(foot = { Btn(stringResource(R.string.check_now), onCheckAgain, kind = BtnKind.Secondary, icon = LytroIcons.Refresh) }) {
                Para(stringResource(R.string.inact_p))
                HeldNote(held)
            }
        }
        is PhoneStatus.UpdateRequired -> {
            StatusBand(BandKind.Warn, stringResource(R.string.st_upd), stringResource(R.string.upd_v, BuildConfig.VERSION_NAME, status.minimum))
            Body(foot = { Btn(stringResource(R.string.download), { openDownload(context) }, kind = BtnKind.Warn, icon = LytroIcons.Download) }) {
                Para(stringResource(R.string.upd_p))
                HeldNote(held)
            }
        }
        is PhoneStatus.Revoked -> {
            StatusBand(BandKind.Dan, stringResource(R.string.st_rev))
            Body(foot = { Btn(stringResource(R.string.re_pair), onPairAgain) }) { Para(revokedWords(status)) }
        }
        PhoneStatus.Blocked -> {
            StatusBand(BandKind.Dan, stringResource(R.string.st_block))
            Body(
                foot = if (hasSupport) {
                    { Btn(stringResource(R.string.support), { openSupport(context) }, kind = BtnKind.Secondary) }
                } else {
                    null
                },
            ) { Para(stringResource(R.string.block_p)) }
        }
        PhoneStatus.Connected -> Unit
    }
}

/** With no reason, the server no longer knows the phone, and the words are its own. */
@Composable
private fun revokedWords(status: PhoneStatus.Revoked): String = when (status.reason) {
    "owner" -> stringResource(R.string.rev_owner)
    "flags" -> stringResource(R.string.rev_flags)
    "operator" -> stringResource(R.string.rev_op)
    else -> status.words?.takeIf { it.isNotEmpty() } ?: stringResource(R.string.rev_owner)
}

@Composable
private fun HeldNote(held: Int) {
    if (held > 0) Note(LytroIcons.Clock, pluralStringResource(R.plurals.held, held, "$held"))
}
