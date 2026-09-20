package com.sharky.finanzas.localreminders

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.io.File
import java.util.Calendar

/**
 * Backup automatico real: corre por WorkManager aunque el usuario no abra la
 * app (antes dependia de abrirla el dia y hora elegidos, asi que si no la
 * abrias no habia backup).
 *
 * El worker NO puede leer el estado de la app (vive en el localStorage del
 * WebView), asi que el lado JS deja el JSON del backup en `BACKUP_SNAPSHOT_FILE`
 * cada vez que los datos cambian, y este worker solo lo copia a la carpeta
 * destino. Ese destino es un tree URI de SAF con permiso persistido — no una
 * ruta publica codificada, que es lo que falla bajo scoped storage.
 */
internal const val BACKUP_PREFS = "sharky_scheduled_backup"
internal const val BACKUP_SNAPSHOT_FILE = "backup_snapshot.json"
internal const val BACKUP_DEST_URI_KEY = "dest_uri"
internal const val BACKUP_DAY_KEY = "day"
internal const val BACKUP_HOUR_KEY = "hour"
internal const val BACKUP_LAST_SUCCESS_KEY = "last_success_at"
internal const val BACKUP_LAST_ATTEMPT_KEY = "last_attempt_at"
internal const val BACKUP_LAST_ERROR_KEY = "last_error"
internal const val BACKUP_FILE_NAME = "sharky-backup-semanal.json"
internal const val BACKUP_MIME = "application/json"

/** Margen para no re-ejecutar dentro de la misma semana aunque el worker despierte varias veces. */
private const val MIN_INTERVAL_MS = 6L * 24 * 60 * 60 * 1000

/**
 * Pasado este tiempo sin backup exitoso, se copia EN LA PRIMERA oportunidad,
 * sin esperar al dia elegido.
 *
 * El dia/hora del usuario es una PREFERENCIA, no una condicion. Antes era una
 * condicion: el worker solo copiaba si hoy era exactamente el dia elegido. Como
 * WorkManager despierta con deriva y Doze agrupa las ejecuciones, si se perdian
 * todas las ventanas de ese dia se saltaba la SEMANA ENTERA en silencio, y la
 * siguiente oportunidad era 7 dias despues. Con datos financieros eso es una
 * perdida real.
 */
private const val OVERDUE_MS = 8L * 24 * 60 * 60 * 1000

class BackupWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(BACKUP_PREFS, Context.MODE_PRIVATE)
        val destUri = prefs.getString(BACKUP_DEST_URI_KEY, null)
            ?: return Result.success() // Sin carpeta elegida todavia: nada que hacer.

        val now = Calendar.getInstance()
        val targetDay = prefs.getInt(BACKUP_DAY_KEY, Calendar.MONDAY - 1)
        val targetHour = prefs.getInt(BACKUP_HOUR_KEY, 3)
        val lastSuccess = prefs.getLong(BACKUP_LAST_SUCCESS_KEY, 0L)
        val elapsed = System.currentTimeMillis() - lastSuccess

        // Nunca dos veces en la misma ventana semanal.
        if (elapsed < MIN_INTERVAL_MS) return Result.success()

        // VENCIDO: se copia ya, caiga el dia que caiga. Es la red de seguridad
        // que evita perder una semana entera por no haber despertado el dia
        // exacto. Un backup un dia tarde es infinitamente mejor que ninguno.
        val overdue = lastSuccess == 0L || elapsed >= OVERDUE_MS

        if (!overdue) {
            // Camino normal: el dia y la hora que el usuario prefiere.
            if ((now.get(Calendar.DAY_OF_WEEK) - 1) != targetDay) return Result.success()
            if (now.get(Calendar.HOUR_OF_DAY) < targetHour) return Result.success()
        }

        // Un backup fallido no debe reintentarse en bucle: se registra el error y
        // se reintenta en la proxima ventana semanal.
        runBackup(applicationContext, Uri.parse(destUri))
        return Result.success()
    }

    companion object {
        /**
         * Escribe el snapshot en la carpeta destino. Compartido entre el worker
         * periodico y el boton "Probar backup ahora" de Ajustes, para que ambos
         * ejerciten exactamente el mismo camino — probar algo distinto de lo que
         * corre de verdad no prueba nada.
         *
         * Devuelve `null` si todo salio bien, o un codigo de error corto.
         */
        fun runBackup(context: Context, destUri: Uri): String? {
            val prefs = context.getSharedPreferences(BACKUP_PREFS, Context.MODE_PRIVATE)
            prefs.edit().putLong(BACKUP_LAST_ATTEMPT_KEY, System.currentTimeMillis()).apply()

            fun fail(reason: String): String {
                prefs.edit().putString(BACKUP_LAST_ERROR_KEY, reason).apply()
                return reason
            }

            val snapshot = File(context.filesDir, BACKUP_SNAPSHOT_FILE)
            if (!snapshot.exists()) return fail("no-snapshot")

            val tree = DocumentFile.fromTreeUri(context, destUri)
                ?: return fail("bad-folder")
            if (!tree.canWrite()) return fail("no-permission")

            return try {
                val payload = snapshot.readText()
                // Sobrescribir: el backup semanal reemplaza al anterior, no acumula.
                tree.findFile(BACKUP_FILE_NAME)?.delete()
                val target = tree.createFile(BACKUP_MIME, BACKUP_FILE_NAME)
                    ?: return fail("cannot-create")
                context.contentResolver.openOutputStream(target.uri)?.use { out ->
                    out.write(payload.toByteArray())
                } ?: return fail("cannot-write")

                // Releer para validar que el archivo quedo completo, en vez de
                // confiar en que write() no lanzo.
                val written = context.contentResolver.openInputStream(target.uri)?.use {
                    it.readBytes().toString(Charsets.UTF_8)
                } ?: return fail("cannot-verify")
                if (written != payload) return fail("verify-mismatch")

                prefs.edit()
                    .putLong(BACKUP_LAST_SUCCESS_KEY, System.currentTimeMillis())
                    .remove(BACKUP_LAST_ERROR_KEY)
                    .apply()
                null
            } catch (e: Exception) {
                fail(e.message ?: "unknown-error")
            }
        }
    }
}
