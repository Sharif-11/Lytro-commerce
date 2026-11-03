package app.lytro.listener.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lytro.listener.BuildConfig
import app.lytro.listener.R
import app.lytro.listener.ui.theme.Line
import app.lytro.listener.ui.theme.Muted
import app.lytro.listener.ui.theme.Raised
import app.lytro.listener.ui.theme.Subtle
import app.lytro.listener.ui.theme.White

/** LISTENER-APP-DESIGN 4: what the app knows of itself, test mode (LSN-04), help, and unpairing. */
@Composable
fun ColumnScope.MenuScreen(model: AppViewModel, language: String) {
    BackHandler { model.closeMenu() }
    val context = LocalContext.current
    val facts by model.facts.collectAsStateWithLifecycle()
    Box(Modifier.weight(1f).fillMaxWidth()) {
        Column(Modifier.fillMaxSize()) {
            BackBar(stringResource(R.string.menu), model::closeMenu)
            Body(
                foot = {
                    Btn(stringResource(R.string.unpair), model::askUnpair, kind = BtnKind.Dan, icon = LytroIcons.Unlink)
                },
            ) {
                Card(verticalPadding = 3.dp) {
                    Row(Modifier.heightIn(min = 48.dp).padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        LytroIcon(LytroIcons.Globe, Subtle)
                        MenuWords(stringResource(R.string.lang), null, Modifier.weight(1f))
                        LanguageSwitch(language, model::chooseLanguage)
                    }
                    MenuRow(LytroIcons.Phone, stringResource(R.string.this_phone), stringResource(R.string.this_phone_v, facts.deviceName))
                    MenuRow(LytroIcons.Store, stringResource(R.string.shop), shopLine(facts.shopName, facts.accounts))
                    MenuRow(
                        LytroIcons.Clock,
                        stringResource(R.string.last_rep),
                        if (facts.lastReportAt > 0) agoWords(agoOf(facts.lastReportAt, model.now)) else "—",
                    )
                    MenuRow(LytroIcons.Download, stringResource(R.string.ver), BuildConfig.VERSION_NAME)
                }
                Card(verticalPadding = 3.dp) {
                    MenuRow(LytroIcons.Flask, stringResource(R.string.test_mode), stringResource(R.string.test_mode_v), first = true, onClick = model::startTestMode)
                    if (hasSupport) {
                        MenuRow(LytroIcons.Help, stringResource(R.string.help), stringResource(R.string.help_v), onClick = { openSupport(context) })
                    }
                }
                if (model.menuFailed) ErrorLine(LytroIcons.WifiOff, stringResource(R.string.e_net))
            }
        }
        if (model.askingUnpair) UnpairConfirm(model)
    }
}

/** `Megh Fashion · bKash 01711-000001`. */
private fun shopLine(shopName: String, accounts: List<app.lytro.listener.net.Account>): String {
    val account = accounts.firstOrNull() ?: return shopName
    return "$shopName · ${walletName(account.method)} ${phoneNumberShown(account.number)}"
}

/** `.row`. */
@Composable
private fun MenuRow(icon: ImageVector, title: String, small: String?, first: Boolean = false, onClick: (() -> Unit)? = null) {
    Column(Modifier.fillMaxWidth()) {
        if (!first) Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
                .padding(vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            LytroIcon(icon, Subtle)
            MenuWords(title, small, Modifier.weight(1f))
        }
    }
}

@Composable
private fun MenuWords(title: String, small: String?, modifier: Modifier) {
    Column(modifier) {
        Txt(title, size = 14.5f, line = 1.4f, weight = FontWeight.W600, color = White)
        if (small != null) Txt(small, size = 13f, line = 1.4f, color = Muted)
    }
}

/** The menu's confirmation: unpairing means payments go back to being verified by hand. */
@Composable
private fun UnpairConfirm(model: AppViewModel) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f))
            .clickable(remember { MutableInteractionSource() }, null, onClick = model::keepPaired)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.fillMaxWidth().clip(shape).background(Raised).border(1.dp, Line, shape)
                .clickable(remember { MutableInteractionSource() }, null) {}
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Txt(stringResource(R.string.un_t), size = 18f, line = 1.35f, weight = FontWeight.W700, color = White)
            Para(stringResource(R.string.un_p))
            Btn(stringResource(R.string.un_btn), model::unpairThisPhone, kind = BtnKind.Dan)
            Btn(stringResource(R.string.cancel), model::keepPaired, kind = BtnKind.Secondary)
        }
    }
}
