package app.lytro.listener.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEY_STORE = "AndroidKeyStore"
private const val KEY_ALIAS = "lytro_listener_secrets"
private const val CIPHER = "AES/GCM/NoPadding"
private const val TAG_BITS = 128
private const val KEY_TOKEN = "token"
private const val KEY_INSTALLATION = "installation"

/**
 * LISTENER-APP-DESIGN 6: the token and the installation ID, sealed with a key in Android's keystore, which no backup
 * carries. A restored phone cannot open them, so it makes a new installation and pairs again rather than tripping the
 * installation flag (LSN-12).
 */
class KeystoreDeviceSecrets(context: Context) : DeviceSecrets {
    private val prefs = context.getSharedPreferences("device_secrets", Context.MODE_PRIVATE)

    override val installationId: String
        @Synchronized get() = read(KEY_INSTALLATION) ?: UUID.randomUUID().toString().also { write(KEY_INSTALLATION, it) }

    override var token: String?
        @Synchronized get() = read(KEY_TOKEN)

        @Synchronized set(value) {
            if (value == null) prefs.edit().remove(KEY_TOKEN).commit() else write(KEY_TOKEN, value)
        }

    private fun read(key: String): String? {
        val sealed = prefs.getString(key, null) ?: return null
        return try {
            val (iv, text) = sealed.split(":").map { Base64.decode(it, Base64.NO_WRAP) }
            val cipher = Cipher.getInstance(CIPHER)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(text))
        } catch (_: GeneralSecurityException) {
            prefs.edit().remove(key).commit()
            null
        } catch (_: IllegalArgumentException) {
            prefs.edit().remove(key).commit()
            null
        }
    }

    private fun write(key: String, value: String) {
        val cipher = Cipher.getInstance(CIPHER)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val text = Base64.encodeToString(cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
        prefs.edit().putString(key, "$iv:$text").commit()
    }

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance(KEY_STORE).apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }
}
