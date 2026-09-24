package com.sharky.finanzas.inappupdate

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import java.util.concurrent.atomic.AtomicReference

@InvokeArg
class StartArgs {
    var immediate: Boolean = false
}

/**
 * ACTUALIZAR SIN SALIR DE LA APP.
 *
 * ────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE RESUELVE, MEDIDO
 *
 * La app ya tenia un aviso de "hay version nueva". Comparaba la version
 * instalada contra un `version.json` publicado a mano en GitHub Pages. Ese
 * archivo se quedo en 1.7.4 mientras la app llegaba a la 1.9.6: durante NUEVE
 * VERSIONES el aviso no se le mostro a nadie, porque 1.7.4 nunca es mas nuevo
 * que lo que el usuario ya tiene.
 *
 * Y aunque hubiera aparecido, su boton solo abria la ficha de Play. Seguia
 * dependiendo de que la persona encontrara alli dentro el boton correcto.
 *
 * Aqui la fuente de verdad es Play. No hay archivo que mantener —o sea, no hay
 * nada que se pueda olvidar de actualizar— y la descarga ocurre dentro de la
 * app.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LOS DOS MODOS, Y POR QUE EL PREDETERMINADO ES EL DE FONDO
 *
 *  · FLEXIBLE (de fondo): descarga mientras la persona sigue usando la app.
 *    Al terminar, se le ofrece reiniciar. Es el predeterminado porque quien
 *    abrio la app venia a apuntar un gasto, no a esperar una barra de
 *    progreso; bloquearle la pantalla es la forma mas rapida de que la proxima
 *    vez toque "Ahora no".
 *
 *  · IMMEDIATE (pantalla completa): Google toma la pantalla hasta terminar y
 *    reinicia la app sola. Se reserva para cuando la version instalada esta
 *    MUY vieja, que es cuando el corte vale la pena.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LIMITACION QUE NO SE PUEDE ESQUIVAR
 *
 * Esto SOLO funciona en una copia instalada desde Google Play. En una
 * compilacion de desarrollo o instalada a mano, `getAppUpdateInfo` falla con
 * ERROR_APP_NOT_OWNED / ERROR_API_NOT_AVAILABLE. No es un fallo del codigo y
 * no tiene arreglo: se informa como `reason` y la app sigue funcionando igual.
 */
@TauriPlugin
class InAppUpdatePlugin(private val activity: Activity) : Plugin(activity) {

    private val manager: AppUpdateManager by lazy { AppUpdateManagerFactory.create(activity) }

    /** El `check` en curso: la API responde por callback, no por retorno. */
    private val pendingCheck = AtomicReference<Invoke?>(null)

    /**
     * Escucha el progreso de la descarga de fondo.
     *
     * Se registra al arrancar el flujo flexible y se quita al terminar: un
     * listener que sobrevive al flujo sigue recibiendo eventos de sesiones que
     * ya no existen y acaba emitiendo al JS un "ya esta descargado" que no
     * corresponde a nada.
     *
     * El TIPO va explicito, y no es cosmetico: el cuerpo se refiere a
     * `installListener` para darse de baja a si mismo, asi que inferir su tipo
     * exigiria conocerlo ya. Kotlin corta ese circulo con "Type checking has
     * run into a recursive problem" y no compila.
     */
    private val installListener: InstallStateUpdatedListener = InstallStateUpdatedListener { state ->
        val payload = JSObject()
        payload.put("status", state.installStatus())
        payload.put("bytesDownloaded", state.bytesDownloaded())
        payload.put("totalBytesToDownload", state.totalBytesToDownload())
        payload.put("downloaded", state.installStatus() == InstallStatus.DOWNLOADED)
        trigger("updateProgress", payload)

        if (state.installStatus() == InstallStatus.DOWNLOADED ||
            state.installStatus() == InstallStatus.FAILED ||
            state.installStatus() == InstallStatus.CANCELED
        ) {
            runCatching { manager.unregisterListener(installListener) }
        }
    }

    /**
     * ¿Hay algo mas nuevo?
     *
     * Devuelve SIEMPRE un resultado, nunca lanza: que no se pueda preguntar
     * (sin red, instalada fuera de Play) no es un error que deba llegarle al
     * usuario. Es simplemente "hoy no hay nada que ofrecerte".
     */
    @Command
    fun check(invoke: Invoke) {
        pendingCheck.set(invoke)
        manager.appUpdateInfo
            .addOnSuccessListener { info -> respondCheck(info) }
            .addOnFailureListener { error ->
                resolveCheck(JSObject().apply {
                    put("available", false)
                    put("flexibleAllowed", false)
                    put("immediateAllowed", false)
                    put("downloaded", false)
                    put("reason", error.message ?: "appUpdateInfo failed")
                })
            }
    }

    private fun respondCheck(info: AppUpdateInfo) {
        val result = JSObject()
        val available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
        // DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS: una actualizacion inmediata
        // se quedo a medias (la app murio en mitad). Hay que reanudarla o el
        // usuario se queda con una instalacion incompleta.
        val resuming =
            info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS

        result.put("available", available || resuming)
        result.put("versionCode", info.availableVersionCode().toLong())
        info.clientVersionStalenessDays()?.let { result.put("stalenessDays", it.toLong()) }
        result.put("flexibleAllowed", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE))
        result.put("immediateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE))
        // Ya descargada en una sesion anterior: no hay que bajar nada, solo
        // instalar. Sin esto se le volveria a pedir la descarga entera.
        result.put("downloaded", info.installStatus() == InstallStatus.DOWNLOADED)
        resolveCheck(result)
    }

    private fun resolveCheck(payload: JSObject) {
        pendingCheck.getAndSet(null)?.resolve(payload)
    }

    /**
     * Arranca la actualizacion.
     *
     * Se vuelve a pedir `appUpdateInfo` en vez de reutilizar el del `check`:
     * ese objeto CADUCA —Play lo invalida tras consumirlo— y lanzar el flujo
     * con uno viejo falla sin decir por que.
     */
    @Command
    fun start(invoke: Invoke) {
        val args = invoke.parseArgs(StartArgs::class.java)
        val type = if (args.immediate) AppUpdateType.IMMEDIATE else AppUpdateType.FLEXIBLE

        manager.appUpdateInfo
            .addOnSuccessListener { info ->
                val usable = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE ||
                    info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
                if (!usable || !info.isUpdateTypeAllowed(type)) {
                    invoke.resolve(JSObject().apply {
                        put("started", false)
                        put("cancelled", false)
                        put("reason", "update type not allowed")
                    })
                    return@addOnSuccessListener
                }

                if (!args.immediate) manager.registerListener(installListener)

                runCatching {
                    manager.startUpdateFlow(info, activity, AppUpdateOptions.newBuilder(type).build())
                }.onFailure { error ->
                    runCatching { manager.unregisterListener(installListener) }
                    invoke.resolve(JSObject().apply {
                        put("started", false)
                        put("cancelled", false)
                        put("reason", error.message ?: "startUpdateFlow failed")
                    })
                }.onSuccess {
                    // `started` no significa instalada: significa que Google ya
                    // tiene el control. El resultado real llega por el listener
                    // (flexible) o reiniciando la app (inmediata).
                    invoke.resolve(JSObject().apply {
                        put("started", true)
                        put("cancelled", false)
                    })
                }
            }
            .addOnFailureListener { error ->
                invoke.resolve(JSObject().apply {
                    put("started", false)
                    put("cancelled", false)
                    put("reason", error.message ?: "appUpdateInfo failed")
                })
            }
    }

    /**
     * Instala lo ya descargado. REINICIA LA APP.
     *
     * Por eso nunca se llama solo: se le pregunta antes a la persona. Reiniciar
     * la app a media frase mientras escribe un gasto es perderle el gasto y la
     * confianza a la vez.
     */
    @Command
    fun install(invoke: Invoke) {
        runCatching { manager.completeUpdate() }
            .onSuccess { invoke.resolve(JSObject().apply { put("ok", true) }) }
            .onFailure { error ->
                invoke.resolve(JSObject().apply {
                    put("ok", false)
                    put("reason", error.message ?: "completeUpdate failed")
                })
            }
    }
}
