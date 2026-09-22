package com.sharky.finanzas.playbilling

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryProductDetailsResult
import com.android.billingclient.api.QueryPurchasesParams
import java.util.concurrent.atomic.AtomicReference

@InvokeArg
class ProductArgs {
    lateinit var productId: String
}

/**
 * COMPRA UNICA via Google Play Billing.
 *
 * Por que un plugin nativo y no una pasarela web: Google EXIGE su sistema de
 * facturacion para cualquier cosa que desbloquee funciones dentro de una app
 * distribuida en Play. Cobrar por fuera (PayPal, Stripe, un enlace) es de las
 * pocas infracciones por las que retiran la app en vez de avisar.
 *
 * Tres cosas que Play obliga y que aqui se respetan:
 *
 *  · ACKNOWLEDGE. Una compra que no se reconoce en 3 dias se REEMBOLSA sola y
 *    el usuario pierde lo que pago. Es el fallo clasico de las primeras
 *    integraciones y no avisa: simplemente el dinero se devuelve.
 *  · PENDING. Hay compras que quedan pendientes (efectivo en tienda, permiso
 *    parental). Mientras lo esten, NO se entrega el beneficio.
 *  · RESTAURAR. Reinstalar no puede costarle al usuario lo que ya pago.
 *
 * La verdad sobre si alguien es VIP la tiene SIEMPRE `queryPurchases`, no una
 * bandera guardada en el telefono.
 */
@TauriPlugin
class PlayBillingPlugin(private val activity: Activity) : Plugin(activity) {

    /** La compra en curso, para responderle al JS cuando Play conteste. */
    private val pendingInvoke = AtomicReference<Invoke?>(null)

    /**
     * Play entrega el resultado de la compra por AQUI, no como retorno de
     * `launchBillingFlow`: el usuario puede tardar minutos en el dialogo, o
     * pagar desde otro dispositivo.
     */
    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        val invoke = pendingInvoke.getAndSet(null) ?: return@PurchasesUpdatedListener
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val purchase = purchases?.firstOrNull()
                if (purchase == null) {
                    invoke.resolve(outcome(owned = false))
                } else {
                    acknowledgeIfNeeded(purchase)
                    invoke.resolve(fromPurchase(purchase))
                }
            }
            // Cerrar el dialogo NO es un error. Devolverlo como tal llenaria
            // la pantalla de avisos rojos por no hacer nada.
            BillingClient.BillingResponseCode.USER_CANCELED ->
                invoke.resolve(outcome(owned = false, cancelled = true))

            // Ya lo tiene: es el caso de quien reinstala y vuelve a pulsar
            // comprar. No es un fallo, es que ya es dueño.
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ->
                invoke.resolve(outcome(owned = true))

            else -> invoke.resolve(outcome(owned = false, error = describe(result)))
        }
    }

    private val client: BillingClient by lazy {
        BillingClient.newBuilder(activity)
            .setListener(purchasesListener)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
            )
            // Novedad de la 8: Play se reconecta solo cuando el servicio se
            // cae (actualizaciones de la Store, falta de red). `withConnection`
            // se queda como red de seguridad para el PRIMER arranque, que es
            // el unico momento en que todavia no hay nada a lo que reconectar.
            .enableAutoServiceReconnection()
            .build()
    }

    // ── Conexion ──────────────────────────────────────────

    /**
     * Play se desconecta solo (actualizaciones de la Store, falta de red), asi
     * que cada comando se asegura la conexion en vez de darla por hecha una
     * vez al arrancar.
     */
    private fun withConnection(onReady: (BillingResult?) -> Unit) {
        if (client.isReady) { onReady(null); return }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                onReady(if (result.responseCode == BillingClient.BillingResponseCode.OK) null else result)
            }
            override fun onBillingServiceDisconnected() {
                // No se reintenta aqui: el siguiente comando reconecta. Un
                // bucle de reintentos con la Store caida gasta bateria sin
                // arreglar nada.
            }
        })
    }

    // ── Comandos ──────────────────────────────────────────

    /**
     * ¿Se puede vender en este dispositivo? Sin Play Store (emulador pelado,
     * sideload, algunos fabricantes) la respuesta es no, y la app tiene que
     * seguir funcionando igual: simplemente no ofrece la compra.
     */
    @Command
    fun available(invoke: Invoke) {
        withConnection { failure ->
            val ret = JSObject()
            if (failure != null) {
                ret.put("available", false)
                ret.put("reason", describe(failure))
            } else {
                val supported = client.isFeatureSupported(BillingClient.FeatureType.PRODUCT_DETAILS)
                ret.put("available", supported.responseCode == BillingClient.BillingResponseCode.OK)
                if (supported.responseCode != BillingClient.BillingResponseCode.OK) {
                    ret.put("reason", describe(supported))
                }
            }
            invoke.resolve(ret)
        }
    }

    /**
     * El precio SIEMPRE sale de Play, nunca escrito a mano en la app: Play lo
     * entrega ya convertido a la moneda del pais del usuario y con su formato.
     * Un "US$ 4.99" fijo en el codigo miente en cuanto alguien abre la app
     * fuera de Estados Unidos.
     */
    @Command
    fun product(invoke: Invoke) {
        val args = invoke.parseArgs(ProductArgs::class.java)
        withConnection { failure ->
            if (failure != null) { invoke.resolve(notFound()); return@withConnection }
            client.queryProductDetailsAsync(queryFor(args.productId)) { result, details ->
                val item = firstProduct(details)
                if (result.responseCode != BillingClient.BillingResponseCode.OK || item == null) {
                    invoke.resolve(notFound()); return@queryProductDetailsAsync
                }
                val offer = item.oneTimePurchaseOfferDetails
                val ret = JSObject()
                ret.put("found", offer != null)
                ret.put("productId", item.productId)
                ret.put("price", offer?.formattedPrice)
                ret.put("currency", offer?.priceCurrencyCode)
                ret.put("priceMicros", offer?.priceAmountMicros)
                invoke.resolve(ret)
            }
        }
    }

    @Command
    fun purchase(invoke: Invoke) {
        val args = invoke.parseArgs(ProductArgs::class.java)
        withConnection { failure ->
            if (failure != null) {
                invoke.resolve(outcome(owned = false, error = describe(failure))); return@withConnection
            }
            client.queryProductDetailsAsync(queryFor(args.productId)) { result, details ->
                val item = firstProduct(details)
                if (result.responseCode != BillingClient.BillingResponseCode.OK || item == null) {
                    invoke.resolve(outcome(owned = false, error = "product_unavailable"))
                    return@queryProductDetailsAsync
                }
                launch(item, invoke)
            }
        }
    }

    /** Le pregunta a Play que posee ESTA cuenta de Google, no este telefono. */
    @Command
    fun restore(invoke: Invoke) {
        val args = invoke.parseArgs(ProductArgs::class.java)
        withConnection { failure ->
            if (failure != null) {
                invoke.resolve(outcome(owned = false, error = describe(failure))); return@withConnection
            }
            val params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
            client.queryPurchasesAsync(params) { result, purchases ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    invoke.resolve(outcome(owned = false, error = describe(result)))
                    return@queryPurchasesAsync
                }
                val mine = purchases.firstOrNull { it.products.contains(args.productId) }
                if (mine != null) acknowledgeIfNeeded(mine)
                invoke.resolve(if (mine == null) outcome(owned = false) else fromPurchase(mine))
            }
        }
    }

    // ── Apoyo ─────────────────────────────────────────────

    private fun launch(item: ProductDetails, invoke: Invoke) {
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(item)
                        .build(),
                ),
            )
            .build()

        // El dialogo de Play es una Activity: hay que lanzarlo desde el hilo
        // principal o no aparece nada y el usuario cree que el boton no va.
        activity.runOnUiThread {
            pendingInvoke.set(invoke)
            val result = client.launchBillingFlow(activity, params)
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                pendingInvoke.getAndSet(null)
                    ?.resolve(outcome(owned = false, error = describe(result)))
            }
        }
    }

    /**
     * Reconocer la compra. Si no se hace en 3 dias, Play la REEMBOLSA sola y
     * el usuario se queda sin lo que pago, sin que nadie se entere hasta que
     * reclama.
     */
    private fun acknowledgeIfNeeded(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        if (purchase.isAcknowledged) return
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        client.acknowledgePurchase(params) { /* si falla, se reintenta al restaurar */ }
    }

    /**
     * El producto, si Play pudo traerlo.
     *
     * En la Billing Library 8 el listener ya NO entrega `List<ProductDetails>`
     * sino un `QueryProductDetailsResult` que separa lo que se pudo traer
     * (`productDetailsList`) de lo que no (`unfetchedProductList`, con su
     * motivo). Es el cambio que obliga a tocar codigo al subir de la 7 a la 8,
     * y la razon por la que actualizar no era solo cambiar el numero en Gradle.
     *
     * Aqui solo interesa el primero: se pregunta por un unico producto.
     */
    private fun firstProduct(result: QueryProductDetailsResult): ProductDetails? =
        result.productDetailsList.firstOrNull()

    private fun queryFor(productId: String) = QueryProductDetailsParams.newBuilder()
        .setProductList(
            listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build(),
            ),
        )
        .build()

    private fun fromPurchase(purchase: Purchase): JSObject = outcome(
        owned = purchase.purchaseState == Purchase.PurchaseState.PURCHASED,
        pending = purchase.purchaseState == Purchase.PurchaseState.PENDING,
    )

    private fun outcome(
        owned: Boolean,
        cancelled: Boolean = false,
        pending: Boolean = false,
        error: String? = null,
    ): JSObject = JSObject().apply {
        put("owned", owned)
        put("cancelled", cancelled)
        put("pending", pending)
        put("error", error)
    }

    private fun notFound(): JSObject = JSObject().apply { put("found", false) }

    private fun describe(result: BillingResult): String =
        "${result.responseCode}:${result.debugMessage}"
}
