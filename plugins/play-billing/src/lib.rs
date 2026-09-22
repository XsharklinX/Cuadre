#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod error;
mod models;

pub use error::{Error, Result};

const PLUGIN_IDENTIFIER: &str = "com.sharky.finanzas.playbilling";

/// Compra unica (producto in-app) a traves de Google Play Billing.
///
/// Play Billing es OBLIGATORIO para vender contenido digital dentro de una app
/// distribuida en Google Play: cobrar por fuera (PayPal, Stripe, un enlace de
/// pago) es de las pocas infracciones por las que retiran la app en vez de
/// avisar. Por eso esto es un plugin nativo y no una pasarela web.
pub struct PlayBilling<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> PlayBilling<R> {
    /// ¿Hay Play Store utilizable en este dispositivo?
    pub fn available(&self) -> crate::Result<AvailableResult> {
        self.0
            .run_mobile_plugin("available", Empty {})
            .map_err(Into::into)
    }

    /// Precio y detalles del producto, tal y como los da Play.
    pub fn product(&self, product_id: String) -> crate::Result<ProductResult> {
        self.0
            .run_mobile_plugin("product", ProductArgs { product_id })
            .map_err(Into::into)
    }

    /// Lanza el dialogo de compra. Suspende hasta que el usuario decide.
    pub fn purchase(&self, product_id: String) -> crate::Result<PurchaseResult> {
        self.0
            .run_mobile_plugin("purchase", ProductArgs { product_id })
            .map_err(Into::into)
    }

    /// Vuelve a preguntarle a Play que posee esta cuenta.
    ///
    /// No es un extra: quien reinstala y pierde lo que pago deja una reseña de
    /// una estrella, y Play exige que exista la via de restaurar.
    pub fn restore(&self, product_id: String) -> crate::Result<PurchaseResult> {
        self.0
            .run_mobile_plugin("restore", ProductArgs { product_id })
            .map_err(Into::into)
    }
}

pub trait PlayBillingExt<R: Runtime> {
    fn play_billing(&self) -> &PlayBilling<R>;
}

impl<R: Runtime, T: Manager<R>> PlayBillingExt<R> for T {
    fn play_billing(&self) -> &PlayBilling<R> {
        self.state::<PlayBilling<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("play-billing")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PlayBillingPlugin")?;
            app.manage(PlayBilling(handle));
            Ok(())
        })
        .build()
}
