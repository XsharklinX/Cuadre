package com.sharky.finanzas.keystore

import android.app.Activity
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val ANDROID_KEYSTORE = "AndroidKeyStore"
private const val KEY_ALIAS = "sharky_secure_key"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val GCM_TAG_LENGTH_BITS = 128

@InvokeArg
class EncryptArgs {
    lateinit var plaintext: String
}

@InvokeArg
class DecryptArgs {
    lateinit var iv: String
    lateinit var data: String
}

@TauriPlugin
class KeystorePlugin(private val activity: Activity) : Plugin(activity) {

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)

        keyStore.getKey(KEY_ALIAS, null)?.let { return it as SecretKey }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val baseSpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)

        try {
            keyGenerator.init(baseSpec.setIsStrongBoxBacked(true).build())
        } catch (_: StrongBoxUnavailableException) {
            keyGenerator.init(baseSpec.setIsStrongBoxBacked(false).build())
        }

        return keyGenerator.generateKey()
    }

    @Command
    fun encrypt(invoke: Invoke) {
        val args = invoke.parseArgs(EncryptArgs::class.java)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(args.plaintext.toByteArray(Charsets.UTF_8))

        val ret = JSObject()
        ret.put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
        ret.put("data", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
        invoke.resolve(ret)
    }

    @Command
    fun decrypt(invoke: Invoke) {
        val args = invoke.parseArgs(DecryptArgs::class.java)

        val iv = Base64.decode(args.iv, Base64.NO_WRAP)
        val data = Base64.decode(args.data, Base64.NO_WRAP)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        val plaintext = cipher.doFinal(data)

        val ret = JSObject()
        ret.put("plaintext", String(plaintext, Charsets.UTF_8))
        invoke.resolve(ret)
    }
}
