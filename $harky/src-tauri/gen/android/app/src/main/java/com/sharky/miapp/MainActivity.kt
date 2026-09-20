package com.sharky.miapp

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
    handleShareIntent(intent)
    handleShortcutIntent(intent)
    handleNotificationIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleShareIntent(intent)
    handleShortcutIntent(intent)
    handleNotificationIntent(intent)
  }

  /**
   * Red de seguridad para los atajos (widgets y menu de mantener presionado el
   * icono). El plugin `deep-link` deberia entregar `sharky://shortcut/...` por
   * `onOpenUrl`/`getCurrent`, pero en warm-start hay dispositivos donde no
   * llega y la app se queda en Inicio. Aqui capturamos el atajo desde el propio
   * MainActivity — igual que `handleShareIntent`, que ya funciona de forma
   * fiable — y dejamos un marcador (`{cacheDir}/shortcut.txt`) que el lado
   * Rust/JS consume una sola vez vía `take_pending_shortcut`.
   *
   * NO consume las URLs de `auth` (login): esas solo las maneja el flujo de
   * Supabase; aqui solo interesan los atajos.
   */
  private fun handleShortcutIntent(intent: Intent?) {
    if (intent == null || intent.action != Intent.ACTION_VIEW) return
    val data = intent.data ?: return
    if (data.scheme != "sharky" || data.host != "shortcut") return
    val id = data.lastPathSegment ?: return
    try {
      File(cacheDir, "shortcut.txt").writeText(id)
    } catch (_: Exception) {
      // Si no se puede escribir el marcador, el deep link normal sigue siendo el
      // camino principal — esto es solo el respaldo.
    }
  }

  /**
   * Red de seguridad para los avisos nativos (ReminderWorker): igual que
   * `handleShortcutIntent`, captura `sharky://notification/<tipo>` desde
   * MainActivity y deja un marcador (`{cacheDir}/notification.txt`) que
   * Rust/JS consume una sola vez vía `take_pending_notification`. Así, al
   * tocar un aviso nativo (presupuesto, semanal, etc.) la app abre la
   * pantalla correspondiente en vez de quedarse en Inicio.
   */
  private fun handleNotificationIntent(intent: Intent?) {
    if (intent == null || intent.action != Intent.ACTION_VIEW) return
    val data = intent.data ?: return
    if (data.scheme != "sharky" || data.host != "notification") return
    val type = data.lastPathSegment ?: return
    try {
      File(cacheDir, "notification.txt").writeText(type)
    } catch (_: Exception) {
      // Si no se puede escribir el marcador, el deep link normal sigue siendo el
      // camino principal — esto es solo el respaldo.
    }
  }

  /**
   * Si el usuario abrió $harky desde "Compartir" con una o varias fotos/PDFs
   * (recibos), copia los archivos a la carpeta de caché de la app y deja un
   * marcador (`shared/pending.json`, siempre un ARRAY aunque sea un solo
   * archivo) que el lado Rust/JS consume una sola vez vía el comando
   * `take_pending_shared_files`.
   */
  private fun handleShareIntent(intent: Intent?) {
    if (intent == null) return
    val mimeType = intent.type ?: return
    if (!(mimeType.startsWith("image/") || mimeType == "application/pdf")) return

    val uris: List<Uri> = when (intent.action) {
      Intent.ACTION_SEND -> listOfNotNull(sharedStreamUri(intent))
      Intent.ACTION_SEND_MULTIPLE -> sharedStreamUris(intent)
      else -> return
    }
    if (uris.isEmpty()) return

    try {
      val sharedDir = File(cacheDir, "shared").apply { mkdirs() }
      val markers = JSONArray()
      uris.forEachIndexed { index, uri ->
        val name = displayNameFor(uri) ?: "recibo-${System.currentTimeMillis()}-$index"
        val destFile = File(sharedDir, "${System.currentTimeMillis()}_${index}_$name")
        val copied = contentResolver.openInputStream(uri)?.use { input ->
          FileOutputStream(destFile).use { output -> input.copyTo(output) }
          true
        } ?: false
        if (!copied) return@forEachIndexed

        markers.put(JSONObject().apply {
          put("path", destFile.absolutePath)
          put("mimeType", mimeType)
          put("name", name)
        })
      }
      if (markers.length() > 0) {
        File(sharedDir, "pending.json").writeText(markers.toString())
      }
    } catch (_: Exception) {
      // Si algo falla al copiar los archivos compartidos, lo ignoramos silenciosamente
    }
  }

  private fun sharedStreamUri(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }

  private fun sharedStreamUris(intent: Intent): List<Uri> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
    }

  private fun displayNameFor(uri: Uri): String? =
    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
      val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
      if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
    }
}
